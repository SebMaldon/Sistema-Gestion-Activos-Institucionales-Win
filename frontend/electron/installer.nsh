!macro customInit
  ExpandEnvStrings $0 "%SystemDrive%"
  StrCpy $INSTDIR "$0\IMSS\Gestor de hardware y bienes"
!macroend
