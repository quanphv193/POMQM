@echo off
reg delete "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "3f6b8a12-5c4d-4e7a-b9f0-1d2c3e4a5b6c" /f >nul 2>&1
if exist "%LOCALAPPDATA%\OMQM-Lite" rmdir /s /q "%LOCALAPPDATA%\OMQM-Lite"
echo Da go OM/QM Lite. Thoat han Excel roi mo lai.
pause
