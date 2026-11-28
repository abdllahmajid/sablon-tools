SABLON TOOLS - sumber installer

Isi:
  scripts/        5 file .jsx (ganti/ubah di sini bila script diperbarui)
  gen_atn.py      pembuat file .atn (daftar tombol ada di bagian BUTTONS)
  installer.nsi   skrip installer (NSIS)

Cara membuat ulang installer di Windows:
  1. Pasang NSIS (gratis): https://nsis.sourceforge.io
  2. Jalankan:  python gen_atn.py      -> menghasilkan SABLON_TOOLS.atn
  3. Klik kanan installer.nsi > Compile NSIS Script -> SABLON_TOOLS_Setup.exe

Lokasi script setelah terpasang: C:\SablonTools\Scripts
(Alamat ini tertulis di dalam .atn; kalau diganti, ubah di gen_atn.py DAN installer.nsi.)
