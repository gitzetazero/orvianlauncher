; Orvian Launcher: extra installer steps (electron-builder includes this file).
;
; On an update, electron-builder keeps the player's shortcuts as they were: if the Start Menu one
; was deleted, it is not recreated (templates/nsis/include/installer.nsh, addStartMenuLink). Windows
; search finds apps through that shortcut, so it is written again after every install and update,
; at the same path and with the same app id the installer and the launcher's taskbar icon use.

!macro customInstall
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ClearErrors
!macroend
