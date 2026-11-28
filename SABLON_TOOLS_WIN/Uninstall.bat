@echo off
setlocal enabledelayedexpansion
title SABLON TOOLS - Copot
set "DEST=C:\SablonTools"
set "ATN=SABLON_TOOLS.atn"
echo === SABLON TOOLS - Copot (Windows) ===
echo Tutup Photoshop dulu sebelum lanjut.
echo.
for %%R in ("%ProgramFiles%\Adobe" "%ProgramFiles(x86)%\Adobe") do (
  if exist "%%~R" for /d %%D in ("%%~R\Adobe Photoshop*") do (
    if exist "%%~D\Presets\Actions\%ATN%" (
      del /f /q "%%~D\Presets\Actions\%ATN%" 2>nul
      if exist "%%~D\Presets\Actions\%ATN%" (echo GAGAL hapus Action di %%~D - jalankan sebagai Administrator) else echo Action dihapus: %%~D
    )
    for %%S in (AutoRasterStudio AutoRegisterSpot DTFRasterTools LayoutFilm BuatChannelKaos) do (
      if exist "%%~D\Presets\Scripts\%%S.jsx" del /f /q "%%~D\Presets\Scripts\%%S.jsx" 2>nul
    )
  )
)
if exist "%DEST%\Scripts" rmdir /s /q "%DEST%\Scripts"
if exist "%DEST%\%ATN%" del /f /q "%DEST%\%ATN%"
if exist "%DEST%\Uninstall.exe" del /f /q "%DEST%\Uninstall.exe"
rmdir "%DEST%" 2>nul
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\SablonTools" /f 2>nul
if exist "%DEST%\Scripts" (echo GAGAL menghapus %DEST%\Scripts) else echo Folder script dihapus.
if exist "%DEST%" (echo Catatan: %DEST% masih ada karena berisi file lain milik Anda.)
echo.
echo Selesai. Buka ulang Photoshop. Untuk memasang versi baru, jalankan Install.bat.
echo.
pause
