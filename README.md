# Guía de Instalación: Sistema de Gestión de Hardware IMSS (SGHI)

Siga estos pasos en orden estricto para instalar el sistema en un equipo nuevo.

# NOTA IMPORTANTE: 
- DEBE TENER PERMISOS DE ADMINISTRADOR PARA PODER EJECUTAR ESTOS PASOS.
- DE PREFERENCIA  TENER TODOS ESTOS ARCHIVOS EN LA CARPETA `C:\IMSS\SGHI\`

## 1. Instalar Certificado de Seguridad

Requisito para evitar bloqueos del Antivirus y SmartScreen.

1. Doble clic en el archivo del certificado (`.pfx` o `.cer`).
2. Seleccionar **Máquina Local** (Local Machine).
3. Ingresar contraseña (si aplica).
4. Seleccionar **Colocar todos los certificados en el siguiente almacén**.
5. Clic en **Examinar** y elegir **Entidades de certificación raíz de confianza** (Trusted Root Certification Authorities).
6. Repetir proceso completo eligiendo **Editores de confianza** (Trusted Publishers).

## 2. Instalar Backend (Servicio de Sincronización)

Instala el agente en segundo plano.

1. Asegúrese de tener en la misma carpeta:
   - `servicio_de_backend.bat`
   - El ejecutable `SGHI SERVICIO.exe`
2. Clic derecho en `servicio_de_backend.bat` → **Ejecutar como administrador**.
3. Consola mostrará éxito. Servicio `SGHI` quedará ejecutándose en segundo plano en `C:\IMSS\SGHI`.

## 3. Instalar Frontend (Interfaz Gráfica)

Instala la aplicación visible para el usuario.

1. Doble clic en `SGHI Setup.exe`.
2. Instalador corre automático.
3. Se creará acceso directo. App lista para usar.
