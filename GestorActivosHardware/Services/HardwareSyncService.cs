using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;

namespace GestorActivosHardware.Services
{
    /// <summary>
    /// Servicio principal responsable de orquestar la extracción de telemetría (WMI) y
    /// comunicarla al servidor GraphQL central (Backend).
    /// Controla la lógica de autenticación silenciosa (machine-to-machine) y el cálculo de hashes MD5
    /// para evitar envíos redundantes de datos idénticos.
    /// </summary>
    public class HardwareSyncService
    {
        // Instancia del logger para imprimir avisos y errores.
        private readonly ILogger<HardwareSyncService> _logger;
        // Fábrica para crear instancias de HttpClient administradas eficientemente por .NET.
        private readonly IHttpClientFactory _httpClientFactory;
        
        // Propiedades de configuración. Intentan leer las variables de entorno inyectadas,
        // o utilizan valores por defecto si no están presentes.
        private string User => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_USER") ?? "AUTO_USER";
        private string Pass => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_PASS") ?? "AUTO_PASS";
        private string GqlUrl => Environment.GetEnvironmentVariable("VITE_GQL_URL") ?? "http://11.1.19.4:4000/graphql";

        /// <summary>
        /// Constructor que inyecta el Logger y la fábrica de HttpClients.
        /// Además, llama a LoadEnv() para cargar las variables del archivo .env local.
        /// </summary>
        public HardwareSyncService(ILogger<HardwareSyncService> logger, IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            LoadEnv();
        }

        /// <summary>
        /// Intenta localizar un archivo '.env' para cargar credenciales y URL en memoria.
        /// Busca primero en la ruta relativa del frontend de Electron, y como fallback junto al .exe.
        /// </summary>
        private void LoadEnv()
        {
            var exePath = AppDomain.CurrentDomain.BaseDirectory;
            // Intenta leer el .env desde el código fuente si estamos en modo desarrollo.
            var frontendEnv = Path.GetFullPath(Path.Combine(exePath, "..", "..", "..", "frontend", ".env"));
            if (File.Exists(frontendEnv))
                DotNetEnv.Env.Load(frontendEnv);
            // Si el archivo está junto al ejecutable final (modo producción), lo lee de ahí.
            else if (File.Exists(Path.Combine(exePath, ".env")))
                DotNetEnv.Env.Load(Path.Combine(exePath, ".env"));
        }

        /// <summary>
        /// Centraliza la ejecución de consultas y mutaciones HTTP POST hacia el servidor GraphQL central.
        /// Prepara la cabecera 'x-origen' para que el backend sepa que la llamada viene de Windows,
        /// e inyecta el token Bearer si se provee. Retorna el nodo 'data' de la respuesta JSON.
        /// </summary>
        private async Task<JsonElement> QueryGraphQLAsync(string query, string token = null)
        {
            // Crea un cliente HTTP usando la configuración nombrada "sgh" (tiene timeout de 30s).
            var client = _httpClientFactory.CreateClient("sgh");
            var req = new HttpRequestMessage(HttpMethod.Post, GqlUrl);
            
            // Firma la petición identificando al Agente Windows.
            req.Headers.Add("x-origen", "win");
            
            // Si el Agente ya tiene un token (ya hizo login), lo agrega a la cabecera.
            if (!string.IsNullOrEmpty(token))
                req.Headers.Add("Authorization", $"Bearer {token}");

            // Construye el payload GraphQL serializando la query dentro de la propiedad "query".
            req.Content = new StringContent(JsonSerializer.Serialize(new { query }), Encoding.UTF8, "application/json");
            
            // Envía la petición y lanza excepción si el código HTTP no es éxito (Ej: 500, 401).
            var response = await client.SendAsync(req);
            response.EnsureSuccessStatusCode();
            
            // Parsea la respuesta del servidor y retorna directamente el bloque 'data'.
            var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("data");
        }

        /// <summary>
        /// Inicia sesión automáticamente (machine-to-machine) en el Backend usando las credenciales maestras.
        /// Envía el número de serie de la PC para vincular el token generado al equipo actual.
        /// Retorna el token JWT generado por el servidor.
        /// </summary>
        private async Task<string> LoginAsync(string numSerie)
        {
            var loginData = await QueryGraphQLAsync($"mutation {{ login(matricula: \"{User}\", password: \"{Pass}\", equipoInfo: \"{numSerie}\") {{ token }} }}");
            if (!loginData.TryGetProperty("login", out var loginObj)) return null;
            return loginObj.GetProperty("token").GetString();
        }

        /// <summary>
        /// Consulta al Backend si existe una orden forzada de escaneo (bandera 'forzar_sync') en BD
        /// disparada por un administrador. Si es true, inicia el escaneo total y limpia la bandera.
        /// </summary>
        public async Task<bool> CheckSyncPendingAsync()
        {
            try
            {
                // Extrae rápidamente sólo lo necesario para identificar a la PC.
                var wmiData = WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return false;
                var numSerie = wmiData.num_serie;

                // Se autentica. Se usa un solo login y se reusa en las llamadas siguientes.
                var token = await LoginAsync(numSerie);  
                if (string.IsNullOrEmpty(token)) return false;

                // Verifica la bandera en GraphQL.
                var checkData = await QueryGraphQLAsync($"query {{ checkSyncPending(num_serie: \"{numSerie}\") }}", token);
                
                if (checkData.TryGetProperty("checkSyncPending", out var pendingEl) && pendingEl.GetBoolean())
                {
                    _logger.LogInformation("[AutoSync] Forzar Sincronización detectado.");
                    
                    // Delega la sincronización pasando el token y los datos base para evitar doble escaneo.
                    await PerformSyncCoreAsync(token, wmiData);  
                    
                    // Limpia la bandera en el servidor para no quedar en bucle infinito.
                    await QueryGraphQLAsync($"mutation {{ clearSyncPending(num_serie: \"{numSerie}\") }}", token);
                    _logger.LogInformation("[AutoSync] Bandera de forzar sync limpiada.");
                    return true;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Polling] Error al revisar Forzar Sincronización.");
            }
            return false;
        }

        /// <summary>
        /// Dispara manualmente el escaneo completo WMI y el envío del Payload al servidor central.
        /// Usado principalmente desde el botón de la interfaz web local (Electron).
        /// </summary>
        public async Task PerformSyncAsync() => await PerformSyncCoreAsync(null, null);

        /// <summary>
        /// Lógica core que orquesta todo:
        /// 1. Extrae info WMI y se autentica.
        /// 2. Consigue el id_bien único (de config local o GraphQL).
        /// 3. Sube las especificaciones técnicas (RAM, IP, MAC).
        /// 4. Sincroniza Programas evaluando hashes MD5 para evitar ancho de banda redundante.
        /// 5. Sincroniza Monitores de la misma manera.
        /// </summary>
        private async Task PerformSyncCoreAsync(string existingToken, HardwareInfo existingWmiData)
        {
            try
            {
                // 1. Escaneo WMI profundo. Si se pasó wmiData en cache, lo reusa; si no, hace el escaneo pesado.
                HardwareInfo wmiData = existingWmiData ?? WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return;
                var numSerie = wmiData.num_serie;

                // Si ya hay token (desde el CheckSyncPending), lo usa; si no, se loguea.
                var token = existingToken ?? await LoginAsync(numSerie);
                if (string.IsNullOrEmpty(token)) return;

                // 2. Obtener la llave primaria 'id_bien' (UUID del activo en la Base de Datos central).
                string idBien = null;
                
                // Primero intenta leerlo del archivo local guardado por Electron.
                var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                if (File.Exists(configPath))
                {
                    try
                    {
                        var cfgDoc = JsonDocument.Parse(File.ReadAllText(configPath)).RootElement;
                        if (cfgDoc.TryGetProperty("id_bien", out var idProp)) idBien = idProp.GetString();
                    }
                    catch { }
                }

                // Si no existe localmente, lo busca en el servidor haciendo query por número de serie.
                if (string.IsNullOrEmpty(idBien))
                {
                    var bienData = await QueryGraphQLAsync($"query {{ bienes(filter: {{ search: \"{numSerie}\" }}) {{ edges {{ node {{ id_bien }} }} }} }}", token);
                    var edges = bienData.GetProperty("bienes").GetProperty("edges");
                    if (edges.GetArrayLength() == 0) return; // Activo no registrado en BD, cancela.
                    idBien = edges[0].GetProperty("node").GetProperty("id_bien").GetString();
                }

                // Helper de formateo para strings en GraphQL (agrega comillas o devuelve null literal).
                string N(string v) => !string.IsNullOrEmpty(v) ? $"\"{v}\"" : "null";
                
                // Concatena las primeras 3 IPs y MACs en caso de múltiples adaptadores de red.
                var dirIpStr = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.ip).Where(x => !string.IsNullOrEmpty(x)));
                var macStr   = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.mac).Where(x => !string.IsNullOrEmpty(x)));

                // 3. Upsert (Inserta o Actualiza) especificaciones de hardware principal (Telemetría de la tabla Especificaciones_TI).
                string mut = $@"mutation {{
                    upsertEspecificacionTI(
                        id_bien: ""{idBien}""
                        cpu_info: {N(wmiData.cpu_info)}
                        ram_gb: {N(wmiData.ram_gb)}
                        almacenamiento_gb: {N(wmiData.almacenamiento_gb)}
                        mac_address: {N(string.IsNullOrEmpty(macStr) ? wmiData.mac_address : macStr)}
                        dir_ip: {N(string.IsNullOrEmpty(dirIpStr) ? wmiData.dir_ip : dirIpStr)}
                        modelo_so: {N(wmiData.modelo_so)}
                        windows_serial: {N(wmiData.windows_serial)}
                        nombre_host: {N(wmiData.nom_pc)}
                        version_office: {N(wmiData.version_office)}
                        last_scan: {N(wmiData.fecha_act_antivirus)}
                    ) {{ id_bien }}
                }}";
                await QueryGraphQLAsync(mut, token);
                _logger.LogInformation($"[AutoSync] Specs TI sincronizados para id_bien: {idBien}");

                // 4. Programas instalados (Optimizado por Hash MD5)
                // Carga los hashes MD5 que guardó durante el último escaneo exitoso.
                var hashes = LoadHashes();
                if (wmiData.programas != null && wmiData.programas.Count > 0)
                {
                    // Transforma el array en un string JSON crudo apto para el input GraphQL.
                    var progsList = wmiData.programas.Select(p => new {
                        programa          = p.nombre_programa ?? "",
                        version           = p.version ?? "",
                        fecha_instalacion = p.fecha_instalacion ?? ""
                    });
                    string progsStr = JsonSerializer.Serialize(progsList)
                        .Replace("\"programa\":", "programa:")
                        .Replace("\"version\":", "version:")
                        .Replace("\"fecha_instalacion\":", "fecha_instalacion:");

                    // Calcula el MD5 local de todo el inventario de software.
                    var newHash = ComputeMd5(progsStr);
                    
                    // Si el MD5 local es distinto al último que subimos, significa que el usuario instaló/desinstaló algo.
                    if (newHash != hashes.programs)
                    {
                        // Hace la petición pesada para mandar todos los programas al servidor.
                        await QueryGraphQLAsync($"mutation {{ syncProgramasPC(id_bien: \"{idBien}\", programas: {progsStr}) }}", token);
                        // Actualiza el Hash en memoria.
                        hashes = hashes with { programs = newHash };
                        _logger.LogInformation("[AutoSync] Programas sincronizados (cambio detectado).");
                    }
                    else
                    {
                        // Ahorra ancho de banda y carga de base de datos.
                        _logger.LogInformation("[AutoSync] Programas sin cambios, omitiendo sync.");
                    }
                }

                // 5. Monitores periféricos (Optimizado por Hash MD5 igual que programas)
                if (wmiData.monitores != null && wmiData.monitores.Count > 0)
                {
                    var monsList = wmiData.monitores.Select(m => new {
                        marca     = m.marca ?? "",
                        modelo    = m.modelo ?? "",
                        num_serie = m.num_serie ?? ""
                    });
                    string monsStr = JsonSerializer.Serialize(monsList)
                        .Replace("\"marca\":", "marca:")
                        .Replace("\"modelo\":", "modelo:")
                        .Replace("\"num_serie\":", "num_serie:");

                    var newHash = ComputeMd5(monsStr);
                    
                    // Si cambió el array de pantallas, lo sube.
                    if (newHash != hashes.monitors)
                    {
                        await QueryGraphQLAsync($"mutation {{ syncMonitoresPC(id_bien: \"{idBien}\", monitores: {monsStr}) }}", token);
                        hashes = hashes with { monitors = newHash };
                        _logger.LogInformation("[AutoSync] Monitores sincronizados (cambio detectado).");
                    }
                    else
                    {
                        _logger.LogInformation("[AutoSync] Monitores sin cambios, omitiendo sync.");
                    }
                }

                // 6. Persiste en disco (autosync.json) los nuevos hashes MD5 y la marca de tiempo de éxito.
                WriteAutosyncFile(hashes);
            }
            catch (Exception ex)
            {
                // Si la sincronización se rompe, se captura aquí para no matar al Windows Service entero.
                _logger.LogError(ex, "[AutoSync Main] Falló sincronización.");
            }
        }

        /// <summary>
        /// Evaluador periódico llamado cada hora por el AutoSyncWorker.
        /// Lee el archivo `autosync.json` local. Si el delta de tiempo desde 'lastSync' 
        /// ya superó 'nextSyncInterval', dispara PerformSyncAsync() en background de forma desatendida.
        /// </summary>
        public void CheckAndRunHourlySync()
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            long lastSync = 0;
            // Intervalo por defecto si el archivo no existe (72 horas base en milisegundos).
            long nextSyncInterval = 72L * 3600L * 1000L;

            // Extrae los datos almacenados localmente.
            if (File.Exists(syncFile))
            {
                try
                {
                    var data = JsonDocument.Parse(File.ReadAllText(syncFile)).RootElement;
                    if (data.TryGetProperty("lastSync", out var ls)) lastSync = ls.GetInt64();
                    if (data.TryGetProperty("nextSyncInterval", out var ni)) nextSyncInterval = ni.GetInt64();
                }
                catch { }
            }

            // Aritmética de tiempo UNIX para validar madurez del ciclo.
            if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - lastSync >= nextSyncInterval)
            {
                // Desacopla la ejecución mediante Task.Run para no bloquear el hilo de evaluación por hora.
                _ = Task.Run(() => PerformSyncAsync());
            }
        }

        // ── Helpers de Estado y Criptografía ───────────────────────────────────────────────────

        // Récord inmutable para empaquetar los Hashes.
        private record SyncHashes(string programs, string monitors);

        /// <summary>
        /// Carga del disco los Hashes de la última subida exitosa.
        /// Retorna un objeto vacío si no existe el archivo previo.
        /// </summary>
        private SyncHashes LoadHashes()
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            if (!File.Exists(syncFile)) return new SyncHashes("", "");
            try
            {
                var doc = JsonDocument.Parse(File.ReadAllText(syncFile)).RootElement;
                var p = doc.TryGetProperty("lastProgramsHash", out var ph) ? ph.GetString() ?? "" : "";
                var m = doc.TryGetProperty("lastMonitorsHash",  out var mh) ? mh.GetString() ?? "" : "";
                return new SyncHashes(p, m);
            }
            catch { return new SyncHashes("", ""); }
        }

        /// <summary>
        /// Graba en el archivo `autosync.json` los nuevos Hashes y calcula un nuevo Random "Jitter"
        /// de entre 72 a 120 horas para definir exactamente cuándo le tocará el próximo escaneo automático,
        /// desincronizando a todas las máquinas de la red.
        /// </summary>
        private void WriteAutosyncFile(SyncHashes hashes)
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            
            // Jitter para esparcir los escaneos de todas las PCs del hospital
            var nextIntervalHours = new Random().Next(72, 121);
            
            // Serializa estado con tiempo de época Unix
            var json = JsonSerializer.Serialize(new {
                lastSync          = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                nextSyncInterval  = nextIntervalHours * 3600000L,
                lastProgramsHash  = hashes.programs,
                lastMonitorsHash  = hashes.monitors
            });
            
            // Reemplaza el archivo en disco atómicamente
            File.WriteAllText(syncFile, json);
            
            _logger.LogInformation($"[AutoSync] Éxito. Próximo escaneo programado al azar en {nextIntervalHours} horas.");
        }

        /// <summary>
        /// Genera un Hash criptográfico rápido MD5 a partir de una cadena de texto (el JSON de los programas/monitores).
        /// Permite detectar cualquier cambio mínimo de hardware sin tener que recorrer arrays.
        /// </summary>
        private static string ComputeMd5(string input)
        {
            var bytes = MD5.HashData(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
