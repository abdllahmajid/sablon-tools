SABLON TOOLS - sumber installer

Isi:
  scripts/        5 file .jsx (ganti/ubah di sini bila script diperbarui)
  gen_atn.py      pembuat file .atn Windows + Mac (daftar tombol ada di bagian BUTTONS)
  mac_alias.py    pembuat alias macOS untuk .atn Mac (memakai mac_alias_template.bin, hasil rekaman Photoshop Mac)
  installer.nsi   skrip installer (NSIS)

Cara membuat ulang installer di Windows:
  1. Pasang NSIS (gratis): https://nsis.sourceforge.io
  2. Jalankan:  python gen_atn.py      -> menghasilkan SABLON_TOOLS.atn (Windows) dan SABLON_TOOLS_Mac.atn (Mac)
  3. Klik kanan installer.nsi > Compile NSIS Script -> SABLON_TOOLS_Setup.exe

Lokasi script setelah terpasang: C:\SablonTools\Scripts
(Alamat ini tertulis di dalam .atn; kalau diganti, ubah di gen_atn.py DAN installer.nsi.)
