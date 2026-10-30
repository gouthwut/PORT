; Do not migrate a Beta 3 per-user installation or create a second install scope.
; Inspect loaded user hives too: UAC may use another administrator's credentials.
!macro NSIS_HOOK_PREINSTALL
  StrCpy $R0 0
  port_check_user_install:
    EnumRegKey $R1 HKU "" $R0
    ${If} $R1 == ""
      Goto port_user_check_done
    ${EndIf}
    ReadRegStr $R2 HKU "$R1\Software\Microsoft\Windows\CurrentVersion\Uninstall\PORT" "UninstallString"
    ${If} $R2 != ""
      MessageBox MB_OK|MB_ICONSTOP "A per-user PORT installation already exists. Setup will not move or remove it. Close PORT, uninstall the per-user version WITHOUT selecting Delete application data, then run this installer again to install for all users." /SD IDOK
      SetErrorLevel 2
      Abort
    ${EndIf}
    IntOp $R0 $R0 + 1
    Goto port_check_user_install
  port_user_check_done:
!macroend
