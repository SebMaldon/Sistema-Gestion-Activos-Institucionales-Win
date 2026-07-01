!macro customInit
  ; 1. Detener el servicio antes de instalar/actualizar
  ExecWait 'sc stop "SGHI"'
  Sleep 2000
!macroend

!macro customInstall
  ; 2. Crear carpeta obligatoria
  CreateDirectory "C:\IMSS\SGHI"
  
  ; 3. Copiar el exe y dlls (extraidos por Electron) a C:\IMSS\SGHI
  ExecWait 'cmd.exe /c xcopy /Y /S /E "$INSTDIR\resources\backend\*" "C:\IMSS\SGHI\"'

  ; 4. Registrar Servicio apuntando a la ruta exacta solicitada
  ExecWait 'sc create "SGHI" binPath= "\"C:\IMSS\SGHI\SGHI SERVICIO.exe\"" start= auto displayname= "SGHI - Servicio de Sincronizacion"'

  ; 5. Recuperacion
  ExecWait 'sc failure "SGHI" reset= 86400 actions= restart/60000/restart/120000/restart/240000'
  
  ; 6. Arrancar
  ExecWait 'sc start "SGHI"'

  ; 7. Autoarranque del frontend (bandeja) para TODOS los usuarios (HKLM)
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGHI_Frontend" '"$INSTDIR\SGHI.exe" --hidden'
!macroend

!macro customUnInstall
  ; Limpiar autoarranque global
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGHI_Frontend"

  ExecWait 'sc stop "SGHI"'
  Sleep 2000
  ExecWait 'sc delete "SGHI"'
  ; Borrar la carpeta al desinstalar (opcional, activalo si quieres)
  ; RMDir /r "C:\IMSS\SGHI"
!macroend
