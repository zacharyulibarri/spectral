@echo off
rem Same, but with Chromium hardware acceleration off (software compositing). Use to compare CPU/frame rate.
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" . --no-gpu
