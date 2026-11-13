@echo off
rem Launches the player without a console window. Double-click me.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" .
