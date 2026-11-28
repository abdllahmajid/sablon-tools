# Pembuat alias macOS (format 'alis' di .atn Photoshop Mac).
# Dibuat dengan meniru rekaman asli dari Photoshop Mac (mac_alias_template.bin):
#   [Alias Record legacy + tag path] + [pembungkus 12 byte] + [bookmark 'book']
import struct, os

_HERE = os.path.dirname(os.path.abspath(__file__))
_T = open(os.path.join(_HERE, "mac_alias_template.bin"), "rb").read()
_T_NAME = b"BuatChannelKaos.jsx"
_T_DIR  = "/Users/Shared/SablonTools/Scripts"
_T_LEAF_CNID = 0x02e752ab

def _tag(t, data):
    b = struct.pack(">HH", t, len(data)) + data
    return b + (b"\x00" if len(data) % 2 else b"")

def _legacy(fname, directory):
    name = fname.encode("mac_roman")
    rec = bytearray(_T[:0x96])
    rec[0x32:0x72] = (bytes([len(name)]) + name).ljust(64, b"\0")
    parent = directory.rstrip("/").split("/")[-1]
    hfs    = "/:" + (directory.strip("/") + "/" + fname).replace("/", ":")
    posix  = (directory.strip("/") + "/" + fname)
    uname  = struct.pack(">H", len(fname)) + fname.encode("utf-16-be")
    uvol   = struct.pack(">H", 12) + "Macintosh HD".encode("utf-16-be")
    rec += _tag(0x0000, parent.encode("mac_roman"))
    rec += _tag(0x0002, hfs.encode("mac_roman"))
    rec += _tag(0x000e, uname)
    rec += _tag(0x000f, uvol)
    rec += _tag(0x0012, posix.encode("mac_roman"))
    rec += _tag(0x0013, b"/")
    rec += struct.pack(">HH", 0xffff, 0)
    struct.pack_into(">H", rec, 4, len(rec))
    return bytes(rec)

def _bookmark(fname, leaf_cnid):
    inner = _T[0x168 + 12:]                     # bookmark 'book' murni
    base  = 0x40                                # awal area data
    data  = inner[base:]
    toc_off = struct.unpack("<I", data[:4])[0]
    items, pos = [], 4
    while pos < toc_off:
        ln, ty = struct.unpack("<II", data[pos:pos+8])
        items.append([ty, data[pos+8:pos+8+ln], pos])
        pos += 8 + ((ln + 3) & ~3)
    toc = data[toc_off:]
    # ganti nama file & ID file (CNID) daun
    for it in items:
        if it[0] == 0x0101 and it[1] == _T_NAME:
            it[1] = fname.encode("utf-8")
    file_id_arr = [it for it in items if it[0] == 0x0601][1]
    leaf_off = struct.unpack("<I", file_id_arr[1][-4:])[0]
    for it in items:
        if it[2] == leaf_off:
            it[1] = struct.pack("<Q", leaf_cnid)
    # offset baru
    newoff, p = {}, 4
    for it in items:
        newoff[it[2]] = p
        p += 8 + ((len(it[1]) + 3) & ~3)
    out = bytearray(struct.pack("<I", p))
    for it in items:
        d = it[1]
        if (it[0] & 0xff00) == 0x0600:          # array: tulis ulang offset
            d = b"".join(struct.pack("<I", newoff[struct.unpack("<I", d[k:k+4])[0]])
                         for k in range(0, len(d), 4))
        out += struct.pack("<II", len(d), it[0]) + d + b"\0" * (-len(d) % 4)
    t = bytearray(toc[:20])
    cnt = struct.unpack("<I", toc[16:20])[0]
    for k in range(cnt):
        key, off, res = struct.unpack("<III", toc[20+12*k:32+12*k])
        t += struct.pack("<III", key, newoff.get(off, off), res)
    out += t
    inner_new = bytearray(inner[:base]) + out
    struct.pack_into("<I", inner_new, 4, len(inner_new))
    return bytes(inner_new)

def make_alias(fname, directory="/Users/Shared/SablonTools/Scripts", leaf_cnid=_T_LEAF_CNID):
    leg = _legacy(fname, directory)
    inner = _bookmark(fname, leaf_cnid)
    total = 12 + len(inner)
    wrap = b"book" + struct.pack(">HH", total, 2) + struct.pack("<I", len(inner))
    return leg + wrap + inner

if __name__ == "__main__":
    rebuilt = make_alias("BuatChannelKaos.jsx")
    print("rekonstruksi == rekaman asli Photoshop Mac:", rebuilt == _T, len(rebuilt), len(_T))
