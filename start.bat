@echo off
cd /d "%~dp0"
start "DALEME Server" cmd /k node --no-warnings server.mjs
timeout /t 2 >nul
start "" http://127.0.0.1:4173
exit
