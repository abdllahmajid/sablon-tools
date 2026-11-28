# Generator file .atn (Photoshop Action) - tiap tombol menjalankan 1 script .jsx
# dari lokasi tetap. Ubah SET_NAME / SCRIPT_DIR / BUTTONS lalu jalankan:  python gen_atn.py
import struct, sys

SET_NAME   = "SABLON TOOLS"
SCRIPT_DIR = r"C:\SablonTools\Scripts"      # Windows: HARUS sama dengan lokasi di installer (.nsi)
MAC_SCRIPT_DIR = "/Users/Shared/SablonTools/Scripts"   # Mac: HARUS sama dengan DEST di Install.command
BUTTONS = [                                  # (nama tombol, nama file script)
    ("AUTO RASTER STUDIO", "AutoRasterStudio.jsx"),
    ("AUTO REGISTER SPOT", "AutoRegisterSpot.jsx"),
    ("DTF RASTER TOOLS",   "DTFRasterTools.jsx"),
    ("LAYOUT FILM",        "LayoutFilm.jsx"),
    ("BUAT CHANNEL KAOS",  "BuatChannelKaos.jsx"),
]

def ustr(s):                      # string unicode Photoshop: jumlah char (termasuk null) + UTF-16BE
    s += "\0"
    return struct.pack(">I", len(s)) + s.encode("utf-16-be")

def astr(s):                      # string ascii berawalan panjang
    b = s.encode("latin1")
    return struct.pack(">I", len(b)) + b

def script_item(path, sep="\\"):
    fname = path.split(sep)[-1]
    p = path + "\0"
    pth = b"txtu" + struct.pack("<I", 12 + 2*len(p)) + struct.pack("<I", len(p)) + p.encode("utf-16-le")
    d  = ustr("Scripts") + astr("AdobeScriptAutomation Scripts") + struct.pack(">I", 2)
    d += struct.pack(">I", 0) + b"jsCt" + b"Pth " + struct.pack(">I", len(pth)) + pth
    d += struct.pack(">I", 0) + b"jsMs" + b"TEXT" + ustr(fname)
    item  = bytes([0, 1, 0, 0]) + b"TEXT" + astr("AdobeScriptAutomation Scripts") + astr("Scripts")
    item += struct.pack(">I", 0xFFFFFFFF) + d
    return item

def script_item_mac(fname, cnid):
    """Photoshop Mac menyimpan alamat script sebagai alias macOS ('alis'), bukan teks path."""
    from mac_alias import make_alias
    al = make_alias(fname, MAC_SCRIPT_DIR, cnid)
    d  = ustr("Scripts") + astr("AdobeScriptAutomation Scripts") + struct.pack(">I", 2)
    d += struct.pack(">I", 0) + b"jsCt" + b"alis" + struct.pack(">I", len(al)) + al
    d += struct.pack(">I", 0) + b"jsMs" + b"TEXT" + ustr(fname)
    item  = bytes([0, 1, 0, 0]) + b"TEXT" + astr("AdobeScriptAutomation Scripts") + astr("Scripts")
    item += struct.pack(">I", 0xFFFFFFFF) + d
    return item

# ID file (CNID) tebakan untuk Mac pembuat (urutan salin installer). Pengguna lain: Photoshop
# jatuh ke pencarian lewat path, yang tertulis juga di dalam alias.
MAC_CNIDS = {"AutoRasterStudio.jsx": 0x02e752a9, "AutoRegisterSpot.jsx": 0x02e752aa,
             "BuatChannelKaos.jsx": 0x02e752ab, "DTFRasterTools.jsx": 0x02e752ac,
             "LayoutFilm.jsx": 0x02e752ad}

def build_mac(set_name=SET_NAME, buttons=BUTTONS):
    out  = struct.pack(">I", 16) + ustr(set_name) + bytes([1]) + struct.pack(">I", len(buttons))
    for name, fn in buttons:
        out += struct.pack(">H", 0) + bytes([0, 0]) + struct.pack(">H", 1)
        out += ustr(name) + bytes([0]) + struct.pack(">I", 1)
        out += script_item_mac(fn, MAC_CNIDS.get(fn, 0x02e752ab))
    return out

def build(set_name=SET_NAME, script_dir=SCRIPT_DIR, buttons=BUTTONS, sep="\\"):
    out  = struct.pack(">I", 16) + ustr(set_name) + bytes([1]) + struct.pack(">I", len(buttons))
    for i, (name, fn) in enumerate(buttons):
        out += struct.pack(">H", 0) + bytes([0, 0]) + struct.pack(">H", 1)   # tanpa shortcut key
        out += ustr(name) + bytes([0]) + struct.pack(">I", 1)                # 1 langkah per tombol
        out += script_item(script_dir.rstrip(sep) + sep + fn, sep)
    return out

if __name__ == "__main__":
    open("SABLON_TOOLS.atn", "wb").write(build())                                   # Windows
    open("SABLON_TOOLS_Mac.atn", "wb").write(build_mac())  # Mac (alias)
    print("SABLON_TOOLS.atn + SABLON_TOOLS_Mac.atn dibuat:", len(BUTTONS), "tombol")
