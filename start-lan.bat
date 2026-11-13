@echo off
chcp 65001 >nul
cd /d "%~dp0"
set HOST=0.0.0.0
set PORT=4173

echo.
echo   大了么 - 局域网模式
echo   服务将监听所有网卡，同一 WiFi 下的手机 / 平板可以访问。
echo   注意：仅建议在家庭或可信网络中使用。
echo.

start "DALEME Server (LAN)" cmd /k "node --no-warnings server.mjs"
timeout /t 2 >nul

echo   本机地址： http://127.0.0.1:%PORT%
echo   手机访问： http://本机局域网IP:%PORT%
echo.
echo   当前网络 IP：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do echo     %%a
echo.
start "" http://127.0.0.1:%PORT%
pause
