using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace GestorActivosHardware.Services
{
    /// <summary>
    /// AutoSyncWorker es un servicio en segundo plano (hereda de BackgroundService)
    /// que implementa el ciclo infinito de sondeo o "polling" para la sincronización automática.
    /// Funciona como un cron interno del agente en Windows.
    /// </summary>
    public class AutoSyncWorker : BackgroundService
    {
        // Interfaz nativa de .NET para registrar mensajes de log en consola/archivos.
        private readonly ILogger<AutoSyncWorker> _logger;
        // Dependencia inyectada del servicio que realiza la sincronización real con GraphQL.
        private readonly HardwareSyncService _syncService;

        /// <summary>
        /// Constructor del Worker. Recibe las dependencias vía inyección (DI).
        /// </summary>
        public AutoSyncWorker(ILogger<AutoSyncWorker> logger, HardwareSyncService syncService)
        {
            _logger = logger;
            _syncService = syncService;
        }

        /// <summary>
        /// Método principal que se invoca cuando el servicio arranca.
        /// Mientras no se solicite la cancelación (stoppingToken), el bucle `while` seguirá vivo.
        /// </summary>
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Registra el inicio exitoso de la tarea en los logs.
            _logger.LogInformation("[AutoSync] Background Worker iniciado. v1.0.7");
            
            // Calcula un tiempo de espera aleatorio ("Jitter") de entre 10 y 60 minutos.
            // Propósito: Si cientos de computadoras se encienden al mismo tiempo (ej: a las 8 AM),
            // el jitter evita que todas golpeen al servidor central simultáneamente (DDoS involuntario).
            var jitter = new Random().Next(600000, 3600000);
            
            // Pausa la ejecución de forma asíncrona durante el tiempo del jitter calculado.
            await Task.Delay(jitter, stoppingToken);

            // Bucle de vida principal del servicio. Se ejecuta indefinidamente.
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    // 1. Chequeo de banderas forzadas desde el servidor central.
                    // Hace una petición rápida al servidor. Si el administrador ordenó un escaneo forzado
                    // para esta máquina, esto lo detecta y lo ejecuta de inmediato.
                    await _syncService.CheckSyncPendingAsync();

                    // 2. Ciclo de vida regular y automático (Cada 72 a 120 horas).
                    // Revisa en el archivo local si ya pasó el tiempo necesario para volver a escanear todo
                    // el hardware sin que nadie lo pida. Si ya pasó el tiempo, dispara la subida.
                    _syncService.CheckAndRunHourlySync();

                    // Después de revisar, duerme este hilo de ejecución exactamente 1 hora
                    // antes de volver a verificar.
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                }
                catch (System.Net.Http.HttpRequestException e)
                {
                    // Bloque 'catch' específico para errores de red (Ej: sin internet, VPN caída).
                    // Loguea advertencia y espera sólo 5 minutos antes de intentar de nuevo.
                    _logger.LogWarning(e, "[AutoSync] Red no disponible. Reintento en 5 minutos.");
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
                catch (Exception e)
                {
                    // Bloque 'catch' para capturar cualquier otro error inesperado (fallo WMI, null ref, etc).
                    // Previene que el ciclo while se rompa o que el servicio se congele permanentemente.
                    _logger.LogError(e, "[AutoSync] Error en ciclo principal. Reintento en 1 hora.");
                    await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
                }
            }
        }
    }
}
