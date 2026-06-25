@echo off
echo ==============================================
echo Instalador Servicio Gestor Activos - C:\SGHI
echo ==============================================

if not exist "C:\SGHI" (
    mkdir "C:\SGHI"
    echo [OK] Carpeta C:\SGHI creada.
)

echo Copiando archivos a C:\SGHI...
xcopy /Y /S /E "%~dp0bin\Release\net10.0-windows\win-x64\publish\*" "C:\SGHI\"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se pudo copiar. Compila o publica primero.
    pause
    exit /b
)

echo Instalando Servicio de Windows...
sc create "SGHI" binPath= "\"C:\SGHI\SGHI SERVICIO.exe\"" start= auto
sc start "SGHI"

echo [OK] Instalacion completa.
pause
