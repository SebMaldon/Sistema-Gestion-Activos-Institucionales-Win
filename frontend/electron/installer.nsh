!define DO_NOT_UNINSTALL_PREVIOUS_VERSION

; ── Macro reutilizable: matar proceso + esperar STOPPED/inexistente ──────────
; $0=nombre servicio, $1=var contador, $2=var exit code query
!macro _KillAndWait SvcName CounterVar QueryVar
  nsExec::ExecToLog 'taskkill /F /IM "${SvcName} SERVICIO.exe" /T'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM "${SvcName}.exe" /T'
  Pop $0
  StrCpy ${CounterVar} 0
  ${Do}
    Sleep 1000
    nsExec::ExecToLog 'sc query "${SvcName}"'
    Pop ${QueryVar}
    IntOp ${CounterVar} ${CounterVar} + 1
    ${If} ${CounterVar} >= 10
      ${Break}
    ${EndIf}
    ; exit code 1060 = el servicio no existe → ya limpio
    ${If} ${QueryVar} == 1060
      ${Break}
    ${EndIf}
  ${Loop}
!macroend

!macro customInit
  ; ── Migración silenciosa SGHI → SGH ──────────────────────────────────────
  ; sc query retorna exit code 0 si el servicio EXISTE, 1060 si no existe.
  ; FIX: antes usábamos $0 == 0 que era siempre verdadero (exit code de cmd exitoso).
  nsExec::ExecToLog 'sc query "SGHI"'
  Pop $0
  ${If} $0 == 0
    ; Servicio SGHI confirmado → pararlo y limpiar
    nsExec::ExecToLog 'sc stop "SGHI"'
    Pop $0
    !insertmacro _KillAndWait "SGHI" $R2 $R3
    nsExec::ExecToLog 'sc delete "SGHI"'
    Pop $0
    Sleep 500
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGHI_Frontend"
    RMDir /r "C:\IMSS\SGHI"
  ${EndIf}

  ; Detener servicio SGH si ya existe (actualización normal)
  nsExec::ExecToLog 'sc query "SGH"'
  Pop $1
  ${If} $1 == 0
    ; Existe → parar y matar
    nsExec::ExecToLog 'sc stop "SGH"'
    Pop $0
    !insertmacro _KillAndWait "SGH" $R0 $R1
  ${Else}
    ; No existe aún → matar proceso frontend por si arrancó manualmente sin servicio
    nsExec::ExecToLog 'taskkill /F /IM "SGH.exe" /T'
    Pop $0
  ${EndIf}

  ; Forzar carpeta de destino a C:\Program Files\SGH (64-bit)
  StrCpy $INSTDIR "$PROGRAMFILES64\SGH"

  ; ── Limpieza manual del frontend ─────────────────────────────────────────
  ; Como desactivamos el viejo desinstalador por el antivirus, borramos
  ; manualmente la carpeta vieja de Electron para no dejar archivos basura.
  ${If} ${FileExists} "$INSTDIR\*.*"
    RMDir /r "$INSTDIR"
  ${EndIf}
!macroend

!macro customInstall
  ; 1. Crear carpeta obligatoria del backend
  CreateDirectory "C:\IMSS\SGH"

  ; 2. Copiar backend — oculto, sin ventana CMD
  nsExec::ExecToLog 'cmd.exe /c xcopy /Y /S /E "$INSTDIR\resources\backend\*" "C:\IMSS\SGH\"'
  Pop $R9
  ${If} $R9 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Advertencia: error al copiar el backend (código $R9). El servicio puede no iniciar.$\nRevise permisos en C:\IMSS\SGH."
  ${EndIf}

  ; 3. Registrar Servicio
  ;    FIX: sc create falla si el servicio ya existe con un binPath viejo.
  ;    Usar sc config para actualizar el binPath del servicio existente.
  nsExec::ExecToLog 'sc create "SGH" binPath= "\"C:\IMSS\SGH\SGH SERVICIO.exe\"" start= auto displayname= "SGH - Servicio de Sincronizacion"'
  Pop $R8
  ${If} $R8 != 0
    ; Ya existía → actualizar binPath y modo de inicio
    nsExec::ExecToLog 'sc config "SGH" binPath= "\"C:\IMSS\SGH\SGH SERVICIO.exe\"" start= auto'
    Pop $0
  ${EndIf}

  ; 4. Recuperacion automática
  nsExec::ExecToLog 'sc failure "SGH" reset= 86400 actions= restart/60000/restart/120000/restart/240000'
  Pop $0

  ; 5. Arrancar
  nsExec::ExecToLog 'sc start "SGH"'
  Pop $0

  ; 6. Autoarranque del frontend (bandeja) para TODOS los usuarios (HKLM)
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGH_Frontend" '"$INSTDIR\SGH.exe" --hidden'
!macroend

!macro customUnInstall
  ; Limpiar autoarranque global
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SGH_Frontend"

  nsExec::ExecToLog 'sc stop "SGH"'
  Pop $0
  ; FIX: matar proceso y esperar antes de sc delete (igual que customInit)
  !insertmacro _KillAndWait "SGH" $R0 $R1
  nsExec::ExecToLog 'sc delete "SGH"'
  Pop $0
  ; Borrar la carpeta al desinstalar (opcional, activalo si quieres)
  ; RMDir /r "C:\IMSS\SGH"
!macroend
