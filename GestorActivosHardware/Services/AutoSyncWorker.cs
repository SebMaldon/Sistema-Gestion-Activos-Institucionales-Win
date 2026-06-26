using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GestorActivosHardware.Services
{
    public class AutoSyncWorker : BackgroundService
    {
        private readonly ILogger<AutoSyncWorker> _logger;
        private readonly HardwareSyncService _syncService;
        private readonly UpdaterService _updaterService;

        public AutoSyncWorker(ILogger<AutoSyncWorker> logger, HardwareSyncService syncService, UpdaterService updaterService)
        {
            _logger = logger;
            _syncService = syncService;
            _updaterService = updaterService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[AutoSync] Background Worker iniciado.");
            
            // Jitter inicial corto (10 a 60 mins) para que la PC sincronice hardware sin saturar
            var jitter = new Random().Next(600000, 3600000);
            await Task.Delay(jitter, stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // 0. Chequeo de actualizaciones de versión (con jitter)
                    await _updaterService.CheckForUpdatesAsync();

                    // 1. Chequeo de banderas forzadas
                    await _syncService.CheckSyncPendingAsync();

                    // 2. Chequeo de ciclo de vida regular (72h)
                    _syncService.CheckAndRunHourlySync();

                    // Esperar 1 hora
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                }
                catch (System.Net.Http.HttpRequestException e)
                {
                    _logger.LogWarning(e, "[AutoSync] Red no disponible o error HTTP. Reintento en 5 minutos.");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "[AutoSync] Error en ciclo principal. Reintento en 1 hora.");
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                }
            }
        }
    }
}
