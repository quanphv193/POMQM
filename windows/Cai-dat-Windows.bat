@echo off
chcp 65001 >nul
echo === Cai dat OM/QM Lite cho Excel Windows ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
