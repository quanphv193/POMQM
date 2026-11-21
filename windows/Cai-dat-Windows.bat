@echo off
setlocal
title Cai dat OM/QM Lite cho Excel
echo === Cai dat OM/QM Lite cho Excel Windows ===
echo.
if not exist "%~dp0manifest.xml" (
  echo LOI: khong thay file manifest.xml canh file nay.
  echo Hay GIAI NEN day du file zip ra mot thu muc, roi chay lai tu thu muc do.
  echo.
  pause
  exit /b 1
)
set "DEST=%LOCALAPPDATA%\OMQM-Lite"
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0manifest.xml" "%DEST%\manifest.xml" >nul
if errorlevel 1 (
  echo LOI: khong chep duoc file vao %DEST%
  pause
  exit /b 1
)
reg add "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "3f6b8a12-5c4d-4e7a-b9f0-1d2c3e4a5b6c" /t REG_SZ /d "%DEST%\manifest.xml" /f >nul
if errorlevel 1 (
  echo LOI: khong ghi duoc registry.
  pause
  exit /b 1
)
rem xoa bo nho dem add-in cu cua Office (an toan, Office tu tao lai)
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul
echo.
echo DA CAI XONG OM/QM Lite.
echo.
echo Buoc tiep theo:
echo  1. THOAT HAN Excel (dong het cua so) roi mo lai Excel.
echo  2. Insert (Chen) ^> My Add-ins ^> muc "Developer Add-ins" ^> OM/QM Lite.
echo  3. Nut OM/QM Lite hien tren tab Home. Can co internet khi dung.
echo.
pause
