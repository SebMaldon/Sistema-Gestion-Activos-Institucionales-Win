!macro customInit
  ; ── Migración silenciosa SGHI → SGH ──────────────────────────────────────
  ; Si el servicio SGHI existe (instalación vieja), lo detenemos y borramos.
  ; El usuario no hace nada; el auto-update maneja todo.
  ExecWait 'sc query "SGHI"' $0
  ${If} $0 == 0
    ExecWait 'sc stop "SGHI"'
    Sleep 3000
    ExecWait 'sc delete "SGHI"'
    Sleep 1000
    ; Limpiar autoarranque viejo
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGHI_Frontend"
    ; Borrar carpeta vieja C:\IMSS\SGHI (binarios obsoletos)
    RMDir /r "C:\IMSS\SGHI"
  ${EndIf}

  ; Detener servicio SGH si ya existe (actualización normal)
  ExecWait 'sc stop "SGH"'
  Sleep 2000
!macroend

!macro customInstall
  ; 2. Crear carpeta obligatoria
  CreateDirectory "C:\IMSS\SGH"

  ; 3. Copiar el exe y dlls (extraidos por Electron) a C:\IMSS\SGH
  ExecWait 'cmd.exe /c xcopy /Y /S /E "$INSTDIR\resources\backend\*" "C:\IMSS\SGH\"'

  ; 4. Registrar Servicio (sc create falla silenciosamente si ya existe, no importa)
  ExecWait 'sc create "SGH" binPath= "\"C:\IMSS\SGH\SGH SERVICIO.exe\"" start= auto displayname= "SGH - Servicio de Sincronizacion"'

  ; 5. Recuperacion
  ExecWait 'sc failure "SGH" reset= 86400 actions= restart/60000/restart/120000/restart/240000'

  ; 6. Arrancar
  ExecWait 'sc start "SGH"'

  ; 7. Autoarranque del frontend (bandeja) para TODOS los usuarios (HKLM)
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGH_Frontend" '"$INSTDIR\SGH.exe" --hidden'
!macroend

!macro customUnInstall
  ; Limpiar autoarranque global
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGH_Frontend"

  ExecWait 'sc stop "SGH"'
  Sleep 2000
  ExecWait 'sc delete "SGH"'
  ; Borrar la carpeta al desinstalar (opcional, activalo si quieres)
  ; RMDir /r "C:\IMSS\SGH"
!macroend
