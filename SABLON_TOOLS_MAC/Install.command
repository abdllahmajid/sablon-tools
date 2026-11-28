#!/bin/bash
# =============================================================================
# SABLON TOOLS - installer Mac
# Cara pakai: klik kanan file ini > Open > Open (cukup sekali, karena macOS
# menahan file hasil unduhan). Kalau macOS menolak, lihat BACA_DULU.txt.
#
# Yang dilakukan:
#   1. Menyalin 5 script .jsx ke  /Users/Shared/SablonTools/Scripts
#      (alamat ini tertulis di dalam Action, jadi TIDAK boleh dipindah).
#   2. Menyalin Action (tombol) ke  Presets/Actions  tiap Photoshop yang ditemukan.
#   3. Menyalin script yang sama ke  Presets/Scripts  tiap Photoshop, sebagai
#      cadangan: muncul di menu File > Scripts walaupun tombol Action bermasalah.
#   4. Mencatat semuanya ke ~/SablonTools-install.log (kirim file ini kalau ada error).
#
# Untuk pengujian (tidak perlu dipakai pengguna biasa):
#   SABLON_DEST, SABLON_APPS, SABLON_LOG, SABLON_NOPAUSE=1
# =============================================================================

HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
DEST="${SABLON_DEST:-/Users/Shared/SablonTools}"
APPS="${SABLON_APPS:-/Applications}"
LOG="${SABLON_LOG:-$HOME/SablonTools-install.log}"
ATN="SABLON_TOOLS.atn"
SRC_ATN="SABLON_TOOLS_Mac.atn"
SCRIPTS="AutoRasterStudio AutoRegisterSpot DTFRasterTools LayoutFilm BuatChannelKaos"

say() { echo "$*"; echo "$*" >> "$LOG" 2>/dev/null; }

finish() {
  echo
  if [ -z "$SABLON_NOPAUSE" ]; then
    read -n 1 -s -r -p "Tekan sembarang tombol untuk menutup..."
    echo
  fi
  exit "${1:-0}"
}

: > "$LOG" 2>/dev/null
say "=== SABLON TOOLS - Pasang di Photoshop (Mac) ==="
say "Tanggal : $(date '+%Y-%m-%d %H:%M:%S')"
say "macOS   : $(sw_vers -productVersion 2>/dev/null || echo tidak-diketahui)  ($(uname -m))"
say "Folder  : $HERE"
say ""

# ---- 0. Periksa kelengkapan paket ------------------------------------------
MISSING=0
[ -f "$HERE/$SRC_ATN" ] || { say "KURANG: $SRC_ATN"; MISSING=1; }
for s in $SCRIPTS; do
  [ -f "$HERE/scripts/$s.jsx" ] || { say "KURANG: scripts/$s.jsx"; MISSING=1; }
done
if [ "$MISSING" -ne 0 ]; then
  say ""
  say "Paket tidak lengkap. Pastikan file zip sudah DIEKSTRAK (jangan dijalankan"
  say "dari dalam pratinjau zip), lalu jalankan Install.command dari folder hasil ekstrak."
  finish 1
fi

# ---- 1. Photoshop sedang terbuka? -----------------------------------------
if command -v pgrep >/dev/null 2>&1 && pgrep -f "Contents/MacOS/Adobe Photoshop" >/dev/null 2>&1; then
  say "CATATAN: Photoshop sedang terbuka. Pemasangan tetap jalan, tetapi Photoshop"
  say "harus ditutup lalu dibuka ulang supaya Action baru terbaca."
  say ""
fi

# ---- 2. Script ke lokasi tetap ---------------------------------------------
if ! mkdir -p "$DEST/Scripts" 2>/dev/null; then
  say "GAGAL membuat folder: $DEST/Scripts"
  say "Coba jalankan lagi, atau kirim file ini ke pembuat paket: $LOG"
  finish 1
fi
# update bersih: buang sisa script versi lama sebelum menyalin yang baru
rm -rf "$DEST/Scripts" 2>/dev/null
mkdir -p "$DEST/Scripts" 2>/dev/null
for s in $SCRIPTS; do
  if ! cp -f "$HERE/scripts/$s.jsx" "$DEST/Scripts/$s.jsx" 2>/dev/null; then
    say "GAGAL menyalin $s.jsx ke $DEST/Scripts"
    finish 1
  fi
done
cp -f "$HERE/$SRC_ATN" "$DEST/$ATN" 2>/dev/null || { say "GAGAL menyalin Action ke $DEST"; finish 1; }
chmod -R u+rwX,go+rX "$DEST" 2>/dev/null
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null

# pastikan salinannya benar-benar ada dan sama
for s in $SCRIPTS; do
  if ! cmp -s "$HERE/scripts/$s.jsx" "$DEST/Scripts/$s.jsx"; then
    say "GAGAL memverifikasi: $DEST/Scripts/$s.jsx"
    finish 1
  fi
done
say "Script terpasang di : $DEST/Scripts   (5 file)"
say "Action induk        : $DEST/$ATN"
say ""

# ---- 3. Action + script cadangan ke tiap Photoshop ---------------------------
FOUND=0
FAILED=0

# Izin administrator diminta SEKALI saja (Mac menyimpan password beberapa menit).
USE_SUDO=0
SUDO_FAILED=0
need_sudo() {
  [ "$USE_SUDO" -eq 1 ] && return 0
  [ "$SUDO_FAILED" -eq 1 ] && return 1
  say "   (butuh izin administrator: ketik password Mac Anda, huruf tidak akan tampil)"
  if sudo -v; then USE_SUDO=1; return 0; fi
  SUDO_FAILED=1
  return 1
}

# copy_to <file> <folder tujuan>  : coba biasa, kalau ditolak coba dengan sudo
copy_to() {
  local src="$1" dir="$2" base
  base="$(basename "$src")"
  if mkdir -p "$dir" 2>/dev/null && cp -f "$src" "$dir/$base" 2>/dev/null; then
    return 0
  fi
  need_sudo || return 1
  sudo mkdir -p "$dir" && sudo cp -f "$src" "$dir/$base"
}

for d in "$APPS"/Adobe\ Photoshop*/; do
  [ -d "$d" ] || continue
  d="${d%/}"
  [ -d "$d/Presets" ] || { say "Dilewati (bukan folder Photoshop lengkap): $d"; continue; }
  say "Photoshop: $(basename "$d")"

  if copy_to "$DEST/$ATN" "$d/Presets/Actions" && [ -f "$d/Presets/Actions/$ATN" ]; then
    say "   Action  OK -> $d/Presets/Actions"
    FOUND=$((FOUND+1))
  else
    say "   Action  GAGAL -> $d/Presets/Actions"
    FAILED=$((FAILED+1))
  fi

  SCR_OK=0
  for s in $SCRIPTS; do
    if copy_to "$DEST/Scripts/$s.jsx" "$d/Presets/Scripts" && [ -f "$d/Presets/Scripts/$s.jsx" ]; then
      SCR_OK=$((SCR_OK+1))
    fi
  done
  if [ "$SCR_OK" -eq 5 ]; then
    say "   Script  OK -> File > Scripts (cadangan)"
  else
    say "   Script  hanya $SCR_OK dari 5 tersalin ke $d/Presets/Scripts"
  fi
done

say ""
if [ "$FOUND" -eq 0 ]; then
  if [ "$FAILED" -gt 0 ]; then
    say "Action GAGAL disalin ke Photoshop (kemungkinan izin ditolak)."
  else
    say "Photoshop tidak ditemukan otomatis di $APPS."
  fi
  say "Pasang manual: di Photoshop buka panel Actions > menu panel (garis tiga) >"
  say "Load Actions, lalu pilih file:"
  say "   $DEST/$ATN"
  finish 1
fi

say "Selesai: Action terpasang di $FOUND Photoshop."
[ "$FAILED" -gt 0 ] && say "PERHATIAN: $FAILED Photoshop lain GAGAL (lihat pesan di atas)."
say ""
say "Langkah berikutnya:"
say "1. Tutup lalu buka ulang Photoshop."
say "2. Window > Actions."
say "3. Klik menu panel (garis tiga), pilih SABLON TOOLS di daftar paling bawah."
say "4. Klik menu panel lagi, pilih Button Mode."
say ""
say "Kalau tombol tidak jalan, script yang sama ada di File > Scripts."
say "Catatan pemasangan tersimpan di: $LOG"
finish 0
