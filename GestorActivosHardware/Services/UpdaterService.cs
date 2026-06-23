using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace GestorActivosHardware.Services
{
    public class UpdaterService
    {
        private readonly ILogger<UpdaterService> _logger;
        private readonly HttpClient _httpClient;
        private readonly string CurrentVersion;

        public UpdaterService(ILogger<UpdaterService> logger)
        {
            CurrentVersion = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
            _logger = logger;
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromMinutes(5);
        }

        public async Task<bool> CheckForUpdatesAsync()
        {
            try
            {
                var gqlUrl = Environment.GetEnvironmentVariable("VITE_GQL_URL") ?? "http://11.1.19.4:4000/graphql";
                var uri = new Uri(gqlUrl);
                var updaterUrl = Environment.GetEnvironmentVariable("VITE_UPDATER_URL") 
                                 ?? $"http://{uri.Host}/updates/backend-version.json";

                var response = await _httpClient.GetStringAsync(updaterUrl);
                var doc = JsonDocument.Parse(response).RootElement;
                
                var latestVersion = doc.GetProperty("LatestVersion").GetString();
                var downloadUrl = doc.GetProperty("DownloadUrl").GetString();

                if (!string.IsNullOrEmpty(latestVersion) && latestVersion != CurrentVersion)
                {
                    _logger.LogInformation($"[Updater] Nueva versión encontrada: {latestVersion}. Descargando...");
                    await DownloadAndApplyUpdateAsync(downloadUrl);
                    return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Updater] Error al comprobar/aplicar actualizaciones.");
                return false;
            }
        }

        private async Task DownloadAndApplyUpdateAsync(string downloadUrl)
        {
            var exePath = AppDomain.CurrentDomain.BaseDirectory;
            var tempFolder = @"C:\ProgramData\GestorActivosIMSS\TempUpdate";
            Directory.CreateDirectory(tempFolder);

            var newExePath = Path.Combine(tempFolder, "GestorActivosHardware_new.exe");

            var response = await _httpClient.GetAsync(downloadUrl);
            response.EnsureSuccessStatusCode();
            using (var fs = new FileStream(newExePath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await response.Content.CopyToAsync(fs);
            }

            var batPath = Path.Combine(tempFolder, "updater.bat");
            var targetExe = Path.Combine(exePath, "GestorActivosHardware.exe");
            
            var batScript = $@"@echo off
timeout /t 5 /nobreak >nul
sc stop ""GestorActivosIMSS""
timeout /t 5 /nobreak >nul
copy /Y ""{newExePath}"" ""{targetExe}""
sc start ""GestorActivosIMSS""
exit
";
            File.WriteAllText(batPath, batScript);

            _logger.LogInformation("[Updater] Ejecutando updater.bat y reiniciando servicio...");

            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = $"/c \"{batPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            Process.Start(psi);

            Environment.Exit(0);
        }
    }
}
