; ============================================================
;  SABLON TOOLS - Installer Action + Script Photoshop (Windows)
;  Build : makensis installer.nsi      (hasil: SABLON_TOOLS_Setup.exe)
;  Catatan: lokasi ROOT_DIR di bawah HARUS sama dengan SCRIPT_DIR di gen_atn.py,
;           karena Action (.atn) menyimpan alamat script secara permanen.
; ============================================================
Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"
${StrStr}
${UnStrStr}

!define APP_NAME  "Sablon Tools"
!define APP_VER   "1.1.0"
!define ATN_FILE  "SABLON_TOOLS.atn"
!define ROOT_DIR  "C:\SablonTools"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\SablonTools"

Name "${APP_NAME}"
OutFile "SABLON_TOOLS_Setup.exe"
InstallDir "${ROOT_DIR}"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
BrandingText "${APP_NAME} ${APP_VER}"

Var Mode     ; 0 = pasang, 1 = hapus
Var Found    ; jumlah Photoshop yang berhasil diproses
Var Seen     ; daftar folder Photoshop yang sudah diproses (anti dobel)

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Pasang ${APP_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Installer ini akan memasang 5 script Photoshop dan Action 'SABLON TOOLS' agar bisa dijadikan tombol.$\r$\n$\r$\nTutup Photoshop terlebih dahulu sebelum melanjutkan."
!define MUI_FINISHPAGE_TITLE "Instalasi selesai"
!define MUI_FINISHPAGE_TEXT "Langkah berikutnya di Photoshop:$\r$\n$\r$\n1. Buka ulang Photoshop.$\r$\n2. Buka panel Actions (menu Window > Actions).$\r$\n3. Klik ikon menu panel (garis tiga di pojok kanan atas panel), lalu pilih SABLON TOOLS pada daftar paling bawah.$\r$\n4. Klik ikon menu panel lagi, pilih Button Mode agar tampil sebagai tombol.$\r$\n$\r$\nJika Photoshop tidak terdeteksi, pakai Load Actions dan pilih file: ${ROOT_DIR}\${ATN_FILE}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=${LANG_INDONESIAN} "ProductName"     "${APP_NAME}"
VIAddVersionKey /LANG=${LANG_INDONESIAN} "FileDescription" "Installer Action dan Script Photoshop"
VIAddVersionKey /LANG=${LANG_INDONESIAN} "FileVersion"     "1.0.0.0"
VIAddVersionKey /LANG=${LANG_INDONESIAN} "ProductVersion"  "${APP_VER}"
VIAddVersionKey /LANG=${LANG_INDONESIAN} "LegalCopyright"  ""

; ------------------------------------------------------------
;  Fungsi pencarian Photoshop (dipakai installer dan uninstaller)
; ------------------------------------------------------------
!macro DEFINE_PS_FUNCS un strfn

; Masukan: $0 = folder instalasi Photoshop
Function ${un}ApplyTo
  Push $1
  Push $2
  StrCpy $1 $0 1 -1
  ${If} $1 == "\"
    StrCpy $0 $0 -1
  ${EndIf}
  ${IfNot} ${FileExists} "$0\Photoshop.exe"
    Goto done
  ${EndIf}
  ${${strfn}} $2 "$Seen" "|$0|"
  ${If} $2 != ""
    Goto done
  ${EndIf}
  StrCpy $Seen "$Seen|$0|"

  ${If} $Mode == 0
    CreateDirectory "$0\Presets\Actions"
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\${ATN_FILE}" "$0\Presets\Actions"
    ${If} ${Errors}
      DetailPrint "GAGAL menyalin Action ke: $0\Presets\Actions"
    ${Else}
      DetailPrint "Action terpasang di: $0"
      IntOp $Found $Found + 1
    ${EndIf}
  ${Else}
    ${If} ${FileExists} "$0\Presets\Actions\${ATN_FILE}"
      Delete "$0\Presets\Actions\${ATN_FILE}"
      DetailPrint "Action dihapus dari: $0"
    ${EndIf}
  ${EndIf}
  done:
  Pop $2
  Pop $1
FunctionEnd

Function ${un}ScanPS
  StrCpy $Seen ""
  SetRegView 64

  ; A. Dari registry (menangkap Photoshop yang dipasang bukan di lokasi standar)
  StrCpy $R1 0
  ${Do}
    EnumRegKey $R2 HKLM "SOFTWARE\Adobe\Photoshop" $R1
    ${If} $R2 == ""
      ${Break}
    ${EndIf}
    ReadRegStr $0 HKLM "SOFTWARE\Adobe\Photoshop\$R2" "ApplicationPath"
    ${If} $0 != ""
      Call ${un}ApplyTo
    ${EndIf}
    IntOp $R1 $R1 + 1
  ${Loop}

  ; B. Pindai folder Program Files (64-bit)
  FindFirst $R3 $R4 "$PROGRAMFILES64\Adobe\Adobe Photoshop*"
  ${DoWhile} $R4 != ""
    StrCpy $0 "$PROGRAMFILES64\Adobe\$R4"
    Call ${un}ApplyTo
    FindNext $R3 $R4
  ${Loop}
  FindClose $R3

  ; C. Pindai folder Program Files (32-bit, Photoshop lama)
  FindFirst $R3 $R4 "$PROGRAMFILES32\Adobe\Adobe Photoshop*"
  ${DoWhile} $R4 != ""
    StrCpy $0 "$PROGRAMFILES32\Adobe\$R4"
    Call ${un}ApplyTo
    FindNext $R3 $R4
  ${Loop}
  FindClose $R3
FunctionEnd

!macroend
!insertmacro DEFINE_PS_FUNCS "" "StrStr"
!insertmacro DEFINE_PS_FUNCS "un." "UnStrStr"

; ------------------------------------------------------------
Function .onInit
  SetRegView 64
  StrCpy $INSTDIR "${ROOT_DIR}"
FunctionEnd

Function un.onInit
  SetRegView 64
FunctionEnd

; ------------------------------------------------------------
Section "Pasang"
  ; 0. Bersihkan sisa versi lama (update bersih)
  RMDir /r "$INSTDIR\Scripts"

  ; 1. Script .jsx ke lokasi tetap (alamat ini tertulis di dalam Action)
  SetOutPath "$INSTDIR\Scripts"
  SetOverwrite on
  File "scripts\AutoRasterStudio.jsx"
  File "scripts\AutoRegisterSpot.jsx"
  File "scripts\DTFRasterTools.jsx"
  File "scripts\LayoutFilm.jsx"
  File "scripts\BuatChannelKaos.jsx"

  ; 2. File Action (salinan induk, juga dipakai untuk Load Actions manual)
  SetOutPath "$INSTDIR"
  File "${ATN_FILE}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; 3. Salin Action ke folder Presets\Actions tiap Photoshop yang terdeteksi
  StrCpy $Mode 0
  StrCpy $Found 0
  DetailPrint "Mencari Photoshop..."
  Call ScanPS

  ; 4. Daftar di Add/Remove Programs
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayVersion"  "${APP_VER}"
  WriteRegStr   HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr   HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1

  ${If} $Found == 0
    DetailPrint "Photoshop tidak terdeteksi."
    MessageBox MB_OK|MB_ICONINFORMATION "Script sudah terpasang, tetapi folder Photoshop tidak ditemukan otomatis.$\r$\n$\r$\nDi Photoshop, buka panel Actions > menu panel > Load Actions, lalu pilih:$\r$\n$INSTDIR\${ATN_FILE}"
  ${Else}
    DetailPrint "Selesai. Action terpasang di $Found lokasi Photoshop."
  ${EndIf}
SectionEnd

; ------------------------------------------------------------
Section "Uninstall"
  StrCpy $Mode 1
  StrCpy $Found 0
  Call un.ScanPS

  Delete "$INSTDIR\Scripts\AutoRasterStudio.jsx"
  Delete "$INSTDIR\Scripts\AutoRegisterSpot.jsx"
  Delete "$INSTDIR\Scripts\DTFRasterTools.jsx"
  Delete "$INSTDIR\Scripts\LayoutFilm.jsx"
  Delete "$INSTDIR\Scripts\BuatChannelKaos.jsx"
  Delete "$INSTDIR\${ATN_FILE}"
  Delete "$INSTDIR\Uninstall.exe"
  ; folder Scripts milik Sablon Tools: hapus beserta isinya
  RMDir /r "$INSTDIR\Scripts"
  ; folder induk: hanya dihapus kalau sudah kosong (file lain milik Anda aman)
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINST_KEY}"
SectionEnd
