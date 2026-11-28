#!/bin/bash
# Membuat SABLON_TOOLS_Mac.zip (paket siap pakai untuk pengguna Mac).
# Jalankan dari folder ini:  ./build_mac_zip.sh
# PENTING: Install.command dan Uninstall.command harus berstatus executable di dalam zip.
# Zip hasil unduhan dari GitHub (Code > Download ZIP) menghapus status itu, jadi
# paket Mac harus dibuat dengan skrip ini, bukan di-zip manual dari hasil unduhan.
set -e
cd "$(dirname "$0")"
OUT="SABLON_TOOLS_Mac.zip"
PKG="SABLON_TOOLS_Mac"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/$PKG/scripts"
cp Install.command Uninstall.command BACA_DULU.txt SABLON_TOOLS_Mac.atn "$TMP/$PKG/"
cp scripts/*.jsx "$TMP/$PKG/scripts/"
chmod 755 "$TMP/$PKG/Install.command" "$TMP/$PKG/Uninstall.command"
chmod 644 "$TMP/$PKG/BACA_DULU.txt" "$TMP/$PKG/SABLON_TOOLS_Mac.atn" "$TMP/$PKG/scripts/"*.jsx

rm -f "$OUT"
( cd "$TMP" && zip -X -r "$OLDPWD/$OUT" "$PKG" >/dev/null )
echo "Dibuat: $OUT"
unzip -Z "$OUT" | grep -E "command|jsx" | awk '{print $1, $NF}'
