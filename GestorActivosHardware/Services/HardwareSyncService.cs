using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Linq;
using System.Collections.Generic;
using Microsoft.Extensions.Logging;

namespace GestorActivosHardware.Services
{
    public class HardwareSyncService
    {
        private readonly ILogger<HardwareSyncService> _logger;
        private readonly HttpClient _httpClient;
        
        private string User => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_USER") ?? "AUTO_USER";
        private string Pass => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_PASS") ?? "AUTO_PASS";
        private string GqlUrl => Environment.GetEnvironmentVariable("VITE_GQL_URL") ?? "http://11.1.19.4:4000/graphql";

        public HardwareSyncService(ILogger<HardwareSyncService> logger)
        {
            _logger = logger;
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromSeconds(30);
            
            LoadEnv();
        }

        private void LoadEnv()
        {
            var exePath = AppDomain.CurrentDomain.BaseDirectory;
            var frontendEnv = Path.GetFullPath(Path.Combine(exePath, "..", "..", "..", "frontend", ".env"));
            
            if (File.Exists(frontendEnv))
                DotNetEnv.Env.Load(frontendEnv);
            else if (File.Exists(Path.Combine(exePath, ".env")))
                DotNetEnv.Env.Load(Path.Combine(exePath, ".env"));
        }

        private async Task<JsonElement> QueryGraphQLAsync(string query, string token = null)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, GqlUrl);
            req.Headers.Add("x-origen", "win");
            if (!string.IsNullOrEmpty(token))
            {
                req.Headers.Add("Authorization", $"Bearer {token}");
            }

            var body = new { query = query };
            req.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(req);
            response.EnsureSuccessStatusCode();
            
            var jsonStr = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(jsonStr);
            return doc.RootElement.GetProperty("data");
        }

        public async Task<bool> CheckSyncPendingAsync()
        {
            try
            {
                var wmiData = WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return false;
                var numSerie = wmiData.num_serie;

                var loginData = await QueryGraphQLAsync($"mutation {{ login(matricula: \"{User}\", password: \"{Pass}\", equipoInfo: \"{numSerie}\") {{ token }} }}");
                if (!loginData.TryGetProperty("login", out var loginObj)) return false;
                var token = loginObj.GetProperty("token").GetString();

                var checkData = await QueryGraphQLAsync($"query {{ checkSyncPending(num_serie: \"{numSerie}\") }}", token);
                if (checkData.TryGetProperty("checkSyncPending", out var pendingEl))
                {
                    bool isPending = pendingEl.GetBoolean();
                    if (isPending)
                    {
                        _logger.LogInformation("[AutoSync] Forzar Sincronización detectado.");
                        await PerformSyncAsync();
                        await QueryGraphQLAsync($"mutation {{ clearSyncPending(num_serie: \"{numSerie}\") }}", token);
                        _logger.LogInformation("[AutoSync] Bandera de forzar sync limpiada.");
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Polling] Error al revisar Forzar Sincronización.");
            }
            return false;
        }

        public async Task PerformSyncAsync()
        {
            try
            {
                var wmiData = WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return;
                var numSerie = wmiData.num_serie;

                // 1. Login
                var loginData = await QueryGraphQLAsync($"mutation {{ login(matricula: \"{User}\", password: \"{Pass}\", equipoInfo: \"{numSerie}\") {{ token }} }}");
                if (!loginData.TryGetProperty("login", out var loginObj)) return;
                var token = loginObj.GetProperty("token").GetString();

                // 2. Obtener id_bien (Primero intentar local, si falla buscar en BD)
                string idBien = null;
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

                if (string.IsNullOrEmpty(idBien))
                {
                    var bienData = await QueryGraphQLAsync($"query {{ bienes(filter: {{ search: \"{numSerie}\" }}) {{ edges {{ node {{ id_bien }} }} }} }}", token);
                    var edges = bienData.GetProperty("bienes").GetProperty("edges");
                    if (edges.GetArrayLength() == 0) return;
                    idBien = edges[0].GetProperty("node").GetProperty("id_bien").GetString();
                }

                // 3. Upsert
                var dirIpStr = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.ip).Where(x => !string.IsNullOrEmpty(x)));
                var macStr = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.mac).Where(x => !string.IsNullOrEmpty(x)));

                string N(string val) => !string.IsNullOrEmpty(val) ? $"\"{val}\"" : "null";

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

                // 4. Programas
                if (wmiData.programas != null && wmiData.programas.Count > 0)
                {
                    var progsList = wmiData.programas.Select(p => new {
                        programa = string.IsNullOrEmpty(p.nombre_programa) ? "" : p.nombre_programa,
                        version = string.IsNullOrEmpty(p.version) ? "" : p.version,
                        fecha_instalacion = string.IsNullOrEmpty(p.fecha_instalacion) ? "" : p.fecha_instalacion
                    });
                    string progsStr = JsonSerializer.Serialize(progsList).Replace("\"programa\":", "programa:").Replace("\"version\":", "version:").Replace("\"fecha_instalacion\":", "fecha_instalacion:");
                    await QueryGraphQLAsync($"mutation {{ syncProgramasPC(id_bien: \"{idBien}\", programas: {progsStr}) }}", token);
                }

                // 5. Monitores
                if (wmiData.monitores != null && wmiData.monitores.Count > 0)
                {
                    var monsList = wmiData.monitores.Select(m => new {
                        marca = string.IsNullOrEmpty(m.marca) ? "" : m.marca,
                        modelo = string.IsNullOrEmpty(m.modelo) ? "" : m.modelo,
                        num_serie = string.IsNullOrEmpty(m.num_serie) ? "" : m.num_serie
                    });
                    string monsStr = JsonSerializer.Serialize(monsList).Replace("\"marca\":", "marca:").Replace("\"modelo\":", "modelo:").Replace("\"num_serie\":", "num_serie:");
                    await QueryGraphQLAsync($"mutation {{ syncMonitoresPC(id_bien: \"{idBien}\", monitores: {monsStr}) }}", token);
                }

                UpdateNextSyncFile();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[AutoSync Main] Falló sincronización.");
            }
        }

        public void CheckAndRunHourlySync()
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            long lastSync = 0;
            long nextSyncInterval = 72L * 3600L * 1000L; // 3 días

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

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (now - lastSync >= nextSyncInterval)
            {
                _ = Task.Run(() => PerformSyncAsync());
            }
        }

        private void UpdateNextSyncFile()
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            var nextIntervalHours = new Random().Next(72, 121);
            var json = JsonSerializer.Serialize(new {
                lastSync = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                nextSyncInterval = nextIntervalHours * 3600000L
            });
            File.WriteAllText(syncFile, json);
            _logger.LogInformation($"[AutoSync Main] Éxito. Próximo escaneo en {nextIntervalHours} horas.");
        }
    }
}
