@echo off
echo ==============================================
echo Instalador Servicio Gestor Activos - C:\IMSS
echo ==============================================

if not exist "C:\IMSS" (
    mkdir "C:\IMSS"
    echo [OK] Carpeta C:\IMSS creada.
)

echo Copiando archivos a C:\IMSS...
xcopy /Y /S /E "%~dp0bin\Release\net10.0-windows\win-x64\publish\*" "C:\IMSS\"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo copiar. Compila o publica primero.
    pause
    exit /b
)

echo Instalando Servicio de Windows...
sc create "Gestor Activos - Servicio de Sync" binPath= "C:\IMSS\GestorActivosHardware.exe" start= auto
sc start "Gestor Activos - Servicio de Sync"

echo [OK] Instalacion completa.
pause
