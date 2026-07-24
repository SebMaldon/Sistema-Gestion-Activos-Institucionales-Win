using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;
using GestorActivosHardware.Services;
using System.Text.Json;
using System.Threading.Tasks;
using System.IO;
using System;

namespace GestorActivosHardware
{
    /// <summary>
    /// Punto de entrada principal y configuración del servidor web local y servicio de Windows.
    /// Esta clase levanta un servidor Kestrel interno que funciona como Backend del Agente.
    /// </summary>
    public class Program
    {
        /// <summary>
        /// Configura y levanta el servicio local (Kestrel) en el puerto 6060.
        /// Expone endpoints HTTP locales consumidos por el Frontend (Electron/React).
        /// </summary>
        public static void Main(string[] args)
        {
            // Inicializa el constructor de la aplicación web utilizando los argumentos pasados al ejecutable.
            // Esto prepara el contenedor de dependencias (DI) y la configuración inicial de Kestrel.
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args
            });

            // Configura el host para que pueda ejecutarse como un Servicio de Windows real (services.msc).
            // Le asigna el nombre "SGH" (Sistema Gestor de Hardware) en el registro de Windows.
            builder.Host.UseWindowsService(options =>
            {
                options.ServiceName = "SGH";
            });

            // Fuerza al servidor web interno Kestrel a escuchar únicamente en localhost por el puerto 6060.
            // Esto evita exponer la API del agente a la red LAN, limitándola a uso local (Electron).
            builder.WebHost.UseUrls("http://localhost:6060");

            // Configura las políticas de CORS (Cross-Origin Resource Sharing).
            // Como el frontend de Electron puede originarse desde 'file://' o un puerto Vite en dev,
            // se permite cualquier origen, método (GET, POST) y cabecera de forma irrestricta.
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAll",
                    builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
            });

            // Registra HardwareSyncService como un "Singleton" (única instancia compartida en toda la app).
            // Este servicio es el encargado de enviar la info WMI al backend central de GraphQL.
            builder.Services.AddSingleton<HardwareSyncService>();

            // Registra AutoSyncWorker como un BackgroundService (HostedService).
            // Esto le indica a .NET que arranque un hilo infinito en segundo plano (el ciclo de cron/polling)
            // que estará vivo mientras el servicio de Windows siga en ejecución.
            builder.Services.AddHostedService<AutoSyncWorker>();

            // Registra y configura un cliente HTTP con el nombre "sgh" para inyección de dependencias.
            // Establece un Timeout global de 30 segundos para evitar colgar el agente si el backend no responde.
            builder.Services.AddHttpClient("sgh", c =>
            {
                c.Timeout = TimeSpan.FromSeconds(30);
            });

            // Construye la aplicación consolidando todos los servicios, configuración y web host registrados.
            var app = builder.Build();

            // Activa el middleware de CORS usando la política "AllowAll" creada anteriormente.
            app.UseCors("AllowAll");

            // Endpoint GET: /api/hw-info
            // Llama síncronamente al servicio WMI para extraer información viva del hardware.
            // Serializa el resultado a JSON preservando los nombres originales (sin transformarlos a camelCase).
            app.MapGet("/api/hw-info", () =>
            {
                var info = WmiService.GetHardwareInfo();
                return Results.Json(info, new JsonSerializerOptions { PropertyNamingPolicy = null });
            });

            // Endpoint POST: /api/force-sync
            // Permite que la UI de Electron desencadene manualmente una subida (sincronización) forzada de hardware.
            // Inyecta automáticamente el Singleton de HardwareSyncService para usarlo.
            app.MapPost("/api/force-sync", async (HardwareSyncService syncService) =>
            {
                // Espera a que termine el escaneo WMI y la carga de datos al backend GraphQL.
                await syncService.PerformSyncAsync();
                return Results.Ok(new { message = "Sincronización forzada completada." });
            });

            // Endpoint POST: /api/config
            // Permite al Frontend React (Electron) guardar el 'id_bien' (identificador de BD) devuelto por el Backend.
            // Se usa para vincular físicamente esta PC con el registro único de la BD central.
            app.MapPost("/api/config", async (HttpContext context) =>
            {
                // Lee asíncronamente todo el cuerpo (Body) del request HTTP.
                var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
                
                // Si el body está vacío, retorna un error HTTP 400 Bad Request.
                if (string.IsNullOrWhiteSpace(body))
                    return Results.BadRequest(new { error = "Body vacío" });
                
                // Valida que el body sea un JSON estructurado correcto. Si no, retorna HTTP 400.
                try { JsonDocument.Parse(body); }
                catch { return Results.BadRequest(new { error = "JSON inválido" }); }
                
                // Construye la ruta absoluta al archivo config.json en la misma carpeta donde reside el .exe
                var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                
                // Escribe/Sobrescribe el archivo de texto con el payload JSON validado.
                File.WriteAllText(configPath, body);
                
                // Retorna HTTP 200 OK informando éxito.
                return Results.Ok(new { message = "Configuración guardada" });
            });

            // Arranca el servidor web bloqueando el hilo principal y empieza a escuchar peticiones HTTP
            // y a correr los BackgroundServices (AutoSyncWorker).
            app.Run();
        }
    }
}