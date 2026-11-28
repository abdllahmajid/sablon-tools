@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title SABLON TOOLS - Pasang
set "DEST=C:\SablonTools"
set "HERE=%~dp0"
set "ATN=SABLON_TOOLS.atn"
echo === SABLON TOOLS - Pasang di Photoshop (Windows) ===
if not exist "%HERE%scripts\AutoRasterStudio.jsx" (echo KURANG: folder scripts. Ekstrak zip dulu, jangan jalankan dari dalam zip. & goto :end)
if not exist "%HERE%%ATN%" (echo KURANG: %ATN% & goto :end)
if exist "%DEST%\Scripts" rmdir /s /q "%DEST%\Scripts"
mkdir "%DEST%\Scripts" 2>nul
copy /y "%HERE%scripts\*.jsx" "%DEST%\Scripts\" >nul || (echo GAGAL menyalin script ke %DEST% & goto :end)
copy /y "%HERE%%ATN%" "%DEST%\" >nul || (echo GAGAL menyalin Action & goto :end)
echo Script terpasang di %DEST%\Scripts
set FOUND=0
for %%R in ("%ProgramFiles%\Adobe" "%ProgramFiles(x86)%\Adobe") do (
  if exist "%%~R" for /d %%D in ("%%~R\Adobe Photoshop*") do (
    if exist "%%~D\Presets" (
      mkdir "%%~D\Presets\Actions" 2>nul
      copy /y "%DEST%\%ATN%" "%%~D\Presets\Actions\" >nul && (echo Action OK: %%~D & set /a FOUND+=1) || echo GAGAL: %%~D  ^(jalankan sebagai Administrator^)
    )
  )
)
if !FOUND! EQU 0 (
  echo Photoshop tidak ditemukan/izin ditolak. Klik kanan file ini ^> Run as administrator,
  echo atau di Photoshop: panel Actions ^> Load Actions ^> %DEST%\%ATN%
) else (
  echo Selesai. Buka ulang Photoshop ^> Window ^> Actions ^> SABLON TOOLS ^> Button Mode.
)
:end
echo.
pause
