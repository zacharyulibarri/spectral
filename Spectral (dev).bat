@echo off
rem Dev mode: menu bar + DevTools on F12, F5 reloads.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" . --dev
