#!/bin/bash
# =============================================================================
# SABLON TOOLS - copot di Mac. Klik kanan file ini > Open > Open (pertama kali).
# Menghapus: Action + script di tiap Photoshop, folder /Users/Shared/SablonTools,
# dan catatan pemasangan. Setelah ini tidak ada sisa file Sablon Tools.
# =============================================================================

DEST="${SABLON_DEST:-/Users/Shared/SablonTools}"
APPS="${SABLON_APPS:-/Applications}"
LOG="${SABLON_LOG:-$HOME/SablonTools-install.log}"
ATN="SABLON_TOOLS.atn"
SCRIPTS="AutoRasterStudio AutoRegisterSpot DTFRasterTools LayoutFilm BuatChannelKaos"

finish() {
  echo
  if [ -z "$SABLON_NOPAUSE" ]; then
    read -n 1 -s -r -p "Tekan sembarang tombol untuk menutup..."
    echo
  fi
  exit "${1:-0}"
}

SUDO_FAILED=0
USE_SUDO=0
# remove_path <path> : hapus biasa, kalau ditolak pakai sudo (password diminta sekali)
remove_path() {
  [ -e "$1" ] || return 0
  rm -rf "$1" 2>/dev/null && return 0
  if [ "$USE_SUDO" -eq 0 ]; then
    [ "$SUDO_FAILED" -eq 1 ] && return 1
    echo "   (butuh izin administrator: ketik password Mac Anda, huruf tidak akan tampil)"
    if sudo -v; then USE_SUDO=1; else SUDO_FAILED=1; return 1; fi
  fi
  sudo rm -rf "$1"
}

echo "=== SABLON TOOLS - Copot ==="
if command -v pgrep >/dev/null 2>&1 && pgrep -f "Contents/MacOS/Adobe Photoshop" >/dev/null 2>&1; then
  echo "CATATAN: Photoshop sedang terbuka. Tutup dulu agar tombol hilang bersih."
fi

FAIL=0
for d in "$APPS"/Adobe\ Photoshop*/; do
  [ -d "$d" ] || continue
  d="${d%/}"
  touched=0
  if [ -e "$d/Presets/Actions/$ATN" ]; then
    remove_path "$d/Presets/Actions/$ATN" || FAIL=1; touched=1
  fi
  for s in $SCRIPTS; do
    if [ -e "$d/Presets/Scripts/$s.jsx" ]; then
      remove_path "$d/Presets/Scripts/$s.jsx" || FAIL=1; touched=1
    fi
  done
  [ "$touched" -eq 1 ] && echo "Dihapus dari: $(basename "$d")"
done

# folder pemasangan (aman: hanya jalan kalau namanya benar-benar SablonTools)
case "$DEST" in
  */SablonTools) remove_path "$DEST" || FAIL=1 ;;
  *) echo "Dilewati (nama folder tidak dikenal): $DEST" ;;
esac
rm -f "$LOG" 2>/dev/null

# pemeriksaan akhir
LEFT=0
[ -e "$DEST" ] && LEFT=1
for d in "$APPS"/Adobe\ Photoshop*/; do
  [ -d "$d" ] || continue
  [ -e "${d%/}/Presets/Actions/$ATN" ] && LEFT=1
  for s in $SCRIPTS; do [ -e "${d%/}/Presets/Scripts/$s.jsx" ] && LEFT=1; done
done
echo
if [ "$LEFT" -eq 0 ]; then
  echo "Selesai. Tidak ada sisa file. Buka ulang Photoshop."
  echo "Untuk memasang versi baru, jalankan Install.command dari paket terbaru."
  finish 0
else
  echo "Masih ada file tersisa (izin ditolak). Jalankan ulang dan masukkan password."
  finish 1
fi
