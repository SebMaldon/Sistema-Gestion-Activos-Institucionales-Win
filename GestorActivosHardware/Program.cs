using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;
using GestorActivosHardware.Services;
using System.Text.Json;
using System.Threading.Tasks;

namespace GestorActivosHardware
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                WebRootPath = "wwwroot"
            });

            // Configurar para correr como Windows Service
            builder.Host.UseWindowsService(options =>
            {
                options.ServiceName = "SGHI";
            });

            // Puerto local para comunicacion con Electron
            builder.WebHost.UseUrls("http://localhost:6060");

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAll",
                    builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
            });

            builder.Services.AddSingleton<HardwareSyncService>();
            builder.Services.AddHostedService<AutoSyncWorker>();

            var app = builder.Build();

            app.UseCors("AllowAll");

            // Hardware info para Electron
            app.MapGet("/api/hw-info", () =>
            {
                var info = WmiService.GetHardwareInfo();
                return Results.Json(info, new JsonSerializerOptions { PropertyNamingPolicy = null });
            });

            // Forzar sincronización desde Electron
            app.MapPost("/api/force-sync", async (HardwareSyncService syncService) =>
            {
                await syncService.PerformSyncAsync();
                return Results.Ok(new { message = "Sincronización forzada completada." });
            });

            // Guardar config (id_bien) enviada desde React
            app.MapPost("/api/config", async (HttpContext context) =>
            {
                var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
                var configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
                File.WriteAllText(configPath, body);
                return Results.Ok(new { message = "Configuración guardada" });
            });

            app.Run();
        }
    }
}