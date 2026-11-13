; Registers Spectral as an "Open with" choice for audio and playlist files, per user (HKCU, no admin).
; Deliberately does NOT take over as the default handler: Windows lists Spectral under "Open with" and in
; Settings > Apps > Default apps, and the user chooses from there.

!macro SpectralAssoc EXT PROGID
  WriteRegNone HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
  WriteRegStr HKCU "Software\Spectral\Capabilities\FileAssociations" ".${EXT}" "${PROGID}"
!macroend

!macro SpectralUnassoc EXT PROGID
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
!macroend

!macro customInstall
  ; ProgIDs
  WriteRegStr HKCU "Software\Classes\Spectral.Audio" "" "Audio file"
  WriteRegStr HKCU "Software\Classes\Spectral.Audio\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\Spectral.Audio\shell\open" "FriendlyAppName" "Spectral"
  WriteRegStr HKCU "Software\Classes\Spectral.Audio\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Spectral.Playlist" "" "Playlist"
  WriteRegStr HKCU "Software\Classes\Spectral.Playlist\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\Spectral.Playlist\shell\open" "FriendlyAppName" "Spectral"
  WriteRegStr HKCU "Software\Classes\Spectral.Playlist\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; the application itself (shows up in the "Open with" list)
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Spectral"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Default apps page
  WriteRegStr HKCU "Software\Spectral\Capabilities" "ApplicationName" "Spectral"
  WriteRegStr HKCU "Software\Spectral\Capabilities" "ApplicationDescription" "Music player with a 3D spectrum visualizer"
  WriteRegStr HKCU "Software\RegisteredApplications" "Spectral" "Software\Spectral\Capabilities"

  !insertmacro SpectralAssoc "mp3" "Spectral.Audio"
  !insertmacro SpectralAssoc "flac" "Spectral.Audio"
  !insertmacro SpectralAssoc "m4a" "Spectral.Audio"
  !insertmacro SpectralAssoc "aac" "Spectral.Audio"
  !insertmacro SpectralAssoc "ogg" "Spectral.Audio"
  !insertmacro SpectralAssoc "oga" "Spectral.Audio"
  !insertmacro SpectralAssoc "opus" "Spectral.Audio"
  !insertmacro SpectralAssoc "wav" "Spectral.Audio"
  !insertmacro SpectralAssoc "webm" "Spectral.Audio"
  !insertmacro SpectralAssoc "m3u" "Spectral.Playlist"
  !insertmacro SpectralAssoc "m3u8" "Spectral.Playlist"
  !insertmacro SpectralAssoc "pls" "Spectral.Playlist"

  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro SpectralUnassoc "mp3" "Spectral.Audio"
  !insertmacro SpectralUnassoc "flac" "Spectral.Audio"
  !insertmacro SpectralUnassoc "m4a" "Spectral.Audio"
  !insertmacro SpectralUnassoc "aac" "Spectral.Audio"
  !insertmacro SpectralUnassoc "ogg" "Spectral.Audio"
  !insertmacro SpectralUnassoc "oga" "Spectral.Audio"
  !insertmacro SpectralUnassoc "opus" "Spectral.Audio"
  !insertmacro SpectralUnassoc "wav" "Spectral.Audio"
  !insertmacro SpectralUnassoc "webm" "Spectral.Audio"
  !insertmacro SpectralUnassoc "m3u" "Spectral.Playlist"
  !insertmacro SpectralUnassoc "m3u8" "Spectral.Playlist"
  !insertmacro SpectralUnassoc "pls" "Spectral.Playlist"
  DeleteRegKey HKCU "Software\Classes\Spectral.Audio"
  DeleteRegKey HKCU "Software\Classes\Spectral.Playlist"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCU "Software\Spectral"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Spectral"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
