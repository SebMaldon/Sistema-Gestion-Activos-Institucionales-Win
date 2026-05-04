using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http;
using GestorActivosHardware.Services;
using System.Text.Json;

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

            // Usar puerto 5050
            builder.WebHost.UseUrls("http://localhost:6060");

            // Añadir CORS para que el frontend (React) pueda consultarlo
            builder.Services.AddCors(options =>
            {
                options.AddPolicy("AllowAll",
                    builder => builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
            });

            var app = builder.Build();

            app.UseCors("AllowAll");

            app.MapGet("/api/hw-info", () =>
            {
                var info = WmiService.GetHardwareInfo();
                return Results.Json(info, new JsonSerializerOptions { PropertyNamingPolicy = null });
            });

            // Manejo de apagado gracefully si se requiere
            app.MapPost("/api/shutdown", (IHostApplicationLifetime lifetime) =>
            {
                lifetime.StopApplication();
                return Results.Ok(new { message = "Shutting down..." });
            });

            app.Run();
        }
    }
}