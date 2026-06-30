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
    public class HardwareSyncService
    {
        private readonly ILogger<HardwareSyncService> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        
        private string User => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_USER") ?? "AUTO_USER";
        private string Pass => Environment.GetEnvironmentVariable("VITE_AUTOSYNC_PASS") ?? "AUTO_PASS";
        private string GqlUrl => Environment.GetEnvironmentVariable("VITE_GQL_URL") ?? "http://11.1.19.4:4000/graphql";

        public HardwareSyncService(ILogger<HardwareSyncService> logger, IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
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
            var client = _httpClientFactory.CreateClient("sghi");
            var req = new HttpRequestMessage(HttpMethod.Post, GqlUrl);
            req.Headers.Add("x-origen", "win");
            if (!string.IsNullOrEmpty(token))
                req.Headers.Add("Authorization", $"Bearer {token}");

            req.Content = new StringContent(JsonSerializer.Serialize(new { query }), Encoding.UTF8, "application/json");
            var response = await client.SendAsync(req);
            response.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("data");
        }

        // Fix #2: login solo una vez, reusar token
        private async Task<string> LoginAsync(string numSerie)
        {
            var loginData = await QueryGraphQLAsync($"mutation {{ login(matricula: \"{User}\", password: \"{Pass}\", equipoInfo: \"{numSerie}\") {{ token }} }}");
            if (!loginData.TryGetProperty("login", out var loginObj)) return null;
            return loginObj.GetProperty("token").GetString();
        }

        public async Task<bool> CheckSyncPendingAsync()
        {
            try
            {
                var wmiData = WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return false;
                var numSerie = wmiData.num_serie;

                var token = await LoginAsync(numSerie);  // 1 solo login
                if (string.IsNullOrEmpty(token)) return false;

                var checkData = await QueryGraphQLAsync($"query {{ checkSyncPending(num_serie: \"{numSerie}\") }}", token);
                if (checkData.TryGetProperty("checkSyncPending", out var pendingEl) && pendingEl.GetBoolean())
                {
                    _logger.LogInformation("[AutoSync] Forzar Sincronización detectado.");
                    await PerformSyncCoreAsync(token, wmiData);  // reusar token y datos WMI ya obtenidos
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

        public async Task PerformSyncAsync() => await PerformSyncCoreAsync(null, null);

        // Acepta token y wmiData ya obtenidos para evitar doble login/escaneo
        private async Task PerformSyncCoreAsync(string existingToken, HardwareInfo existingWmiData)
        {
            try
            {
                HardwareInfo wmiData = existingWmiData ?? WmiService.GetHardwareInfo();
                if (wmiData == null || string.IsNullOrEmpty(wmiData.num_serie)) return;
                var numSerie = wmiData.num_serie;

                var token = existingToken ?? await LoginAsync(numSerie);
                if (string.IsNullOrEmpty(token)) return;

                // 2. Obtener id_bien
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

                // 3. Upsert specs TI
                string N(string v) => !string.IsNullOrEmpty(v) ? $"\"{v}\"" : "null";
                var dirIpStr = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.ip).Where(x => !string.IsNullOrEmpty(x)));
                var macStr   = string.Join("/", wmiData.adaptadores_red.Take(3).Select(a => a.mac).Where(x => !string.IsNullOrEmpty(x)));

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

                // 4. Programas — skip si hash idéntico
                var hashes = LoadHashes();
                if (wmiData.programas != null && wmiData.programas.Count > 0)
                {
                    var progsList = wmiData.programas.Select(p => new {
                        programa          = p.nombre_programa ?? "",
                        version           = p.version ?? "",
                        fecha_instalacion = p.fecha_instalacion ?? ""
                    });
                    string progsStr = JsonSerializer.Serialize(progsList)
                        .Replace("\"programa\":", "programa:")
                        .Replace("\"version\":", "version:")
                        .Replace("\"fecha_instalacion\":", "fecha_instalacion:");

                    var newHash = ComputeMd5(progsStr);
                    if (newHash != hashes.programs)
                    {
                        await QueryGraphQLAsync($"mutation {{ syncProgramasPC(id_bien: \"{idBien}\", programas: {progsStr}) }}", token);
                        hashes = hashes with { programs = newHash };
                        _logger.LogInformation("[AutoSync] Programas sincronizados (cambio detectado).");
                    }
                    else
                    {
                        _logger.LogInformation("[AutoSync] Programas sin cambios, omitiendo sync.");
                    }
                }

                // 5. Monitores — Fix #3: skip si hash idéntico
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

                // Fix #1: una sola escritura al final con ambos hashes
                WriteAutosyncFile(hashes);
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
            long nextSyncInterval = 72L * 3600L * 1000L;

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

            if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - lastSync >= nextSyncInterval)
                _ = Task.Run(() => PerformSyncAsync());
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private record SyncHashes(string programs, string monitors);

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

        // Fix #1: una sola escritura, sin lecturas redundantes
        private void WriteAutosyncFile(SyncHashes hashes)
        {
            var syncFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "autosync.json");
            var nextIntervalHours = new Random().Next(72, 121);
            var json = JsonSerializer.Serialize(new {
                lastSync          = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                nextSyncInterval  = nextIntervalHours * 3600000L,
                lastProgramsHash  = hashes.programs,
                lastMonitorsHash  = hashes.monitors
            });
            File.WriteAllText(syncFile, json);
            _logger.LogInformation($"[AutoSync] Éxito. Próximo escaneo en {nextIntervalHours} horas.");
        }

        private static string ComputeMd5(string input)
        {
            var bytes = MD5.HashData(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }
    }
}
