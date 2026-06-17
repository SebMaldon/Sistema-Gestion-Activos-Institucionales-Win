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
                options.ServiceName = "Gestor Activos - Servicio de Sync";
            });

            // Usar puerto 6060
            builder.WebHost.UseUrls("http://localhost:6060");

            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAll",
                    builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
            });

            // Registrar Servicios de Sincronización
            builder.Services.AddSingleton<UpdaterService>();
            builder.Services.AddSingleton<HardwareSyncService>();
            builder.Services.AddHostedService<AutoSyncWorker>();

            var app = builder.Build();

            app.UseCors("AllowAll");

            app.MapGet("/api/hw-info", () =>
            {
                var info = WmiService.GetHardwareInfo();
                return Results.Json(info, new JsonSerializerOptions { PropertyNamingPolicy = null });
            });

            // Nuevo endpoint para forzar sincronización desde Electron
            app.MapPost("/api/force-sync", async (HardwareSyncService syncService) =>
            {
                await syncService.PerformSyncAsync();
                return Results.Ok(new { message = "Sincronización forzada completada." });
            });

            app.MapPost("/api/shutdown", (IHostApplicationLifetime lifetime) =>
            {
                lifetime.StopApplication();
                return Results.Ok(new { message = "Shutting down..." });
            });

            app.Run();
        }
    }
}