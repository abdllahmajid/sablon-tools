#target photoshop

// ============================================
// RASTER QUICK BLACK / WHITE (KAIN HITAM & KAIN PUTIH) - LPI / ANGLE BEBAS
// ============================================
// Versi bersih dari Action "_25LPIBLACK" (bukan rekaman Action).
// Alur sama dengan Action aslinya, tapi LPI, Angle, Bentuk Titik, dan Resolusi
// bisa diatur dari panel. Tidak ada ID dokumen / layer yang di-hardcode.
//
// ALUR (nomor = langkah di Action asli):
//   1      Atur resolusi
//   2      Dokumen asli diduplikasi (dokumen asli TIDAK diubah)
//   3-9    Layer aktif -> "Original Artwork" (disembunyikan) + salinan "Quick Black"
//          di dalam group "Quick Black Knockout", di atas lapisan hitam
//   10-14  Adjustment "Black & White" (semua slider 100%)
//   16-18  Group diberi mask dari luminositas hasilnya sendiri
//   19-24  B&W diset blend mode DIVIDE, group dibungkus dan di-merge
//          -> layer "Knockout - Quick Black" (warna dinormalkan, alpha = terang-gelap)
//   25-35  Alpha layer itu di-halftone (LPI / angle / bentuk dari panel)
//   36-51  Hasil halftone jadi mask, mask di-apply, layer & channel bantu dibuang
//   43-45  Background hitam ditambahkan (bisa dimatikan untuk PNG transparan)
//   54     Layer hasil dinamai "Layer 0"
//
// MODE KAIN PUTIH (dari Action "_30LPIWHITE") - bedanya dari kain hitam:
//   a) Artwork di-INVERT dulu (pada dokumen hasil, dokumen asli tidak disentuh),
//      supaya area putih jadi "gelap" lalu di-knockout (transparan -> kain putih terlihat).
//   b) Peta alpha dibalik (255 - alpha) lalu diberi "kompensasi tone"
//      (Fill 50% sebelum halftone, setara langkah 33 di Action putih).
//   c) Hasil halftone dibalik (Invert) sebelum dipakai jadi mask.
//   d) Setelah mask lama dibuang, warna layer di-INVERT lagi -> warna asli kembali.
//   e) Background yang ditambahkan berwarna PUTIH (bukan hitam).
//
// MODE KAIN WARNA (warna kain dipilih dari panel: picker / hex / RGB):
//   Artwork diletakkan di atas warna kain, lalu dipisah menjadi "tinta" + "alpha" dengan
//   rumus Color to Alpha: art = kain*(1-alpha) + tinta*alpha, memakai alpha terkecil yang
//   membuat warna tinta tetap valid. Area yang sama dengan warna kain -> alpha 0 (tidak dicetak).
//   Alpha dipecah jadi titik halftone seperti kain hitam, background = warna kain.
//   (Kain hitam / putih tetap memakai alur aslinya, tidak diubah.)
//
// Yang diproses: layer AKTIF (layer biasa di level paling atas, bukan di dalam group).
// Layer lain di dokumen hasil tidak ikut dibawa.
// ============================================

// ---------- Helper ID ----------
function cTID(s) { return app.charIDToTypeID(s); }
function sTID(s) { return app.stringIDToTypeID(s); }

// ============================================
// UI
// ============================================
// ============================================
// PREVIEW ZONA RASTER
// ============================================
// Menampilkan di dialog: area mana yang akan SOLID, RASTER (titik), atau KOSONG,
// berdasarkan pengaturan "Kurangi Raster". Dihitung dari versi kecil gambar Anda
// memakai alur Quick Black / White yang sama dengan proses asli.
// Preview menunjukkan ZONA, bukan bentuk titik halftone-nya.
var PV_MAX_W   = 680;
var PV_MAX_H   = 620;
// Preview dirender PV_RENDER_SCALE x lebih besar dari kotak tampilan supaya zoom tetap tajam.
// Kalau preview terasa lambat di komputer Anda, ubah jadi 1 (zoom jadi lebih kasar tapi cepat).
var PV_RENDER_SCALE = 1.25;
var PV_ZOOM_STEP    = 1.5;   // satu klik tombol + / - mengalikan zoom dengan angka ini
var PV_ZOOM_MAX     = 8;     // zoom maksimum, kelipatan dari ukuran "Pas"
var PV_T_SOLID = 250;   // >= 98%  dianggap solid
var PV_T_EMPTY = 6;     // <  2%   dianggap kosong
// Palet zona. Tiap kanal warna (R,G,B) sengaja naik: kosong <= raster <= solid,
// supaya satu zona bisa dibuat dengan Levels + Lighten (jauh lebih sedikit langkah).
var PV_COL_E = [20, 20, 0];       // kosong  (gelap)
var PV_COL_R = [255, 140, 2];     // raster  (oranye)
var PV_COL_S = [255, 255, 255];   // solid   (putih)

// Catat waktu proses preview ke log (Desktop/AutoRaster_log.txt) agar bisa dilihat langkah mana yang lambat
function pvTrace(msg) {
    try {
        var f = new File(LOG_PATH);
        f.encoding = "UTF-8";
        f.open("a");
        f.writeln("[preview] " + msg);
        f.close();
    } catch (e) {}
}

function pvColor(rgb) {
    var c = new SolidColor();
    c.rgb.red = rgb[0]; c.rgb.green = rgb[1]; c.rgb.blue = rgb[2];
    return c;
}

// ---------- Helper kain: { mode: "black" | "white" | "color", rgb: [r,g,b] } ----------
function clampByte(v, fallback) {
    v = parseInt(v, 10);
    if (isNaN(v)) v = fallback;
    if (v < 0) v = 0;
    if (v > 255) v = 255;
    return v;
}

// Buat file PNG satu warna (dengan bingkai 1px) langsung dari byte -> dipakai sebagai gambar tombol warna
var PNG_CRC_TABLE = null;
function pngCrc32(str) {
    if (PNG_CRC_TABLE === null) {
        PNG_CRC_TABLE = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            PNG_CRC_TABLE[n] = c >>> 0;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < str.length; i++) {
        crc = PNG_CRC_TABLE[(crc ^ str.charCodeAt(i)) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeSolidPng(file, w, h, rgb, borderRgb) {
    function u32(n) { return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); }
    function chunk(type, data) { var td = type + data; return u32(data.length) + td + u32(pngCrc32(td)); }

    var raw = "";
    for (var y = 0; y < h; y++) {
        raw += String.fromCharCode(0);   // filter: none
        for (var x = 0; x < w; x++) {
            var edge = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
            var c = edge ? borderRgb : rgb;
            raw += String.fromCharCode(c[0], c[1], c[2]);
        }
    }
    if (raw.length > 65535) throw new Error("PNG terlalu besar");

    var a = 1, b = 0;
    for (var i = 0; i < raw.length; i++) {
        a = (a + raw.charCodeAt(i)) % 65521;
        b = (b + a) % 65521;
    }
    var len = raw.length, nlen = 65535 - len;
    var zdata = String.fromCharCode(0x78, 0x01, 0x01, len & 255, (len >>> 8) & 255, nlen & 255, (nlen >>> 8) & 255) +
                raw + u32(b * 65536 + a);

    var png = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10) +
              chunk("IHDR", u32(w) + u32(h) + String.fromCharCode(8, 2, 0, 0, 0)) +
              chunk("IDAT", zdata) +
              chunk("IEND", "");

    file.encoding = "BINARY";
    file.open("w");
    file.write(png);
    file.close();
}

function rgbToHex(rgb) {
    var out = "";
    for (var i = 0; i < 3; i++) {
        var h = Math.round(rgb[i]).toString(16).toUpperCase();
        if (h.length < 2) h = "0" + h;
        out += h;
    }
    return out;
}

function fabricKey(f) {
    if (f.mode === "white") return "w";
    if (f.mode === "color") return "c_" + rgbToHex(f.rgb);
    return "b";
}

function fabricFillRGB(f) {
    if (f.mode === "white") return [255, 255, 255];
    if (f.mode === "color") return f.rgb;
    return [0, 0, 0];
}

function fabricLabel(f) {
    if (f.mode === "white") return "putih";
    if (f.mode === "color") return "warna #" + rgbToHex(f.rgb);
    return "hitam";
}

function pvTempFile(PV, tag) {
    PV.seq++;
    var f = new File(Folder.temp + "/AR_pv_" + tag + "_" + new Date().getTime() + "_" + PV.seq + ".png");
    PV.files.push(f);
    return f;
}

function pvSavePng(doc, file) {
    var o = new PNGSaveOptions();
    o.interlaced = false;
    doc.saveAs(file, o, true, Extension.LOWERCASE);
}

// Duplikat layer lalu taruh di paling atas stack
function pvDupTop(doc, layer, name) {
    var n = layer.duplicate();
    if (doc.layers[0].id !== n.id) {
        n.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
    }
    if (name) n.name = name;
    doc.activeLayer = n;
    return n;
}

// Piksel peta >= t -> warna colHigh, sisanya -> colLow (per kanal R, G, B; satu operasi Levels per kanal)
function pvStepLevels(doc, layer, t, colLow, colHigh) {
    doc.activeLayer = layer;
    for (var c = 0; c < 3; c++) {
        doc.activeChannels = [doc.channels[c]];
        layer.adjustLevels(t - 1, t, 1.0, colLow[c], colHigh[c]);
    }
    setComponentChannels(doc);
}

// Buat versi kecil gambar (hanya layer target) untuk preview
function createPreviewState(srcDoc, srcLayer) {
    var tStart = new Date().getTime();
    var oldRuler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var PV = { ok: false, error: "", small: null, tgtIdx: 0, base: { b: null, w: null },
               origFile: { b: null, w: null }, files: [], seq: 0, w: 0, h: 0, zoneCache: {} };
    try {
        var tpath = findLayerPath(srcDoc, srcLayer.id);
        if (tpath === null) throw new Error("Layer target tidak ditemukan.");

        var d = srcDoc.duplicate("PV_SRC");
        app.activeDocument = d;
        ensureRgb8(d);

        var tgtLayer = prepareTarget(d, layerByPath(d, tpath));
        var tgtId = tgtLayer.id;
        isolateTarget(d, tgtId);

        var w0 = d.width.value;
        var h0 = d.height.value;
        var sc = Math.min(PV_MAX_W * PV_RENDER_SCALE / w0, PV_MAX_H * PV_RENDER_SCALE / h0, 1);
        if (sc < 1) {
            d.resizeImage(Math.max(1, Math.round(w0 * sc)), Math.max(1, Math.round(h0 * sc)),
                          undefined, ResampleMethod.BICUBIC);
        }

        for (var j = 0; j < d.layers.length; j++) {
            if (d.layers[j].id === tgtId) { PV.tgtIdx = j; break; }
        }
        PV.w = Math.round(d.width.value);
        PV.h = Math.round(d.height.value);
        PV.small = d;
        PV.ok = true;
    } catch (e) {
        PV.error = e.message;
    }
    try { app.preferences.rulerUnits = oldRuler; } catch (e3) {}
    try { app.activeDocument = srcDoc; } catch (e4) {}
    pvTrace("siapkan salinan kecil: " + (new Date().getTime() - tStart) + " ms (" + PV.w + "x" + PV.h + " px)");
    return PV;
}

// Peta alpha versi kecil (grayscale) untuk jenis kain tertentu - dibuat sekali lalu disimpan
function getPreviewBase(PV, fab) {
    var key = fabricKey(fab);
    if (PV.base[key] !== null && PV.base[key] !== undefined) return PV.base[key];

    // Kain warna: simpan hanya satu peta warna terakhir (hemat memori)
    if (fab.mode === "color") {
        var oldKeys = [];
        for (var bk in PV.base) {
            if (bk.indexOf("c_") === 0) oldKeys.push(bk);
        }
        for (var oi = 0; oi < oldKeys.length; oi++) {
            closeQuiet(PV.base[oldKeys[oi]]);
            delete PV.base[oldKeys[oi]];
        }
    }

    var o = { white: (fab.mode === "white"), colorFabric: (fab.mode === "color"), fabricRGB: fab.rgb,
              res: PV.small.resolution, resample: false, bg: false, preview: true,
              lpi: 30, angle: 22.5, shape: 1, tone: 0, lowPct: 0, highPct: 100, gamma: 1 };
    var tBase = new Date().getTime();
    processQuickBlack(PV.small, PV.small.layers[PV.tgtIdx], o);
    pvTrace("peta alpha kain " + fabricLabel(fab) + ": " + (new Date().getTime() - tBase) + " ms");
    if (o.previewResult) {
        PV.base[key] = o.previewResult;
        return o.previewResult;
    }
    throw new Error(o.previewError ? o.previewError : "Gagal membuat peta preview.");
}

// Gambar asli di atas warna kain
function renderOrigFile(PV, fab) {
    var key = fabricKey(fab);
    if (PV.origFile[key] && PV.origFile[key].exists) return PV.origFile[key];

    var oldRuler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var d = null;
    try {
        d = PV.small.duplicate("PV_O");
        app.activeDocument = d;
        setComponentChannels(d);
        var tgt = d.layers[PV.tgtIdx];
        d.activeLayer = tgt;
        var fl = d.artLayers.add();
        fl.move(tgt, ElementPlacement.PLACEAFTER);
        d.activeLayer = fl;
        d.selection.selectAll();
        d.selection.fill(pvColor(fabricFillRGB(fab)));
        d.selection.deselect();
        d.flatten();
        var f = pvTempFile(PV, "o");
        pvSavePng(d, f);
        PV.origFile[key] = f;
        return f;
    } finally {
        closeQuiet(d);
        try { app.preferences.rulerUnits = oldRuler; } catch (e1) {}
    }
}

// Peta zona: putih = solid, oranye = raster (titik), gelap = kosong
function renderZoneFile(PV, fab, low, high, gamma) {
    var key = fabricKey(fab) + "|" + low + "|" + high + "|" + gamma;
    if (PV.zoneCache[key] && PV.zoneCache[key].file.exists) return PV.zoneCache[key];   // pengaturan yang sama -> instan

    var base = getPreviewBase(PV, fab);
    var tStart = new Date().getTime();

    var oldRuler = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;
    var d = null;
    try {
        d = base.duplicate("PV_R");
        app.activeDocument = d;
        setComponentChannels(d);
        d.activeLayer = d.layers[0];

        // Kain putih: peta dibalik (255 - alpha) -> kembalikan ke orientasi alpha (putih = tinta)
        if (fab.mode === "white") d.activeLayer.invert();

        // Levels yang sama dengan proses asli
        var lvLow  = Math.round(255 * low / 100);
        var lvHigh = Math.round(255 * high / 100);
        if (lvLow > 0 || lvHigh < 255 || gamma !== 1) {
            d.activeLayer.adjustLevels(lvLow, lvHigh, gamma, 0, 255);
        }

        d.changeMode(ChangeMode.RGB);
        setComponentChannels(d);

        // Statistik area (dari histogram)
        var stat = null;
        try {
            var hist = d.channels[0].histogram;
            var nS = 0, nR = 0;
            for (var hi = 0; hi < 256; hi++) {
                if (hi >= PV_T_SOLID) nS += hist[hi];
                else if (hi >= PV_T_EMPTY) nR += hist[hi];
            }
            stat = { solid: nS, raster: nR };
        } catch (eh) {}

        // Zona dibuat dengan dua lapis langkah (nilai peta < t -> warna rendah, >= t -> warna tinggi):
        //   P1: < kosong -> gelap,  >= kosong -> oranye
        //   P2: < solid  -> hitam,  >= solid  -> putih   (dicampur Lighten di atas P1)
        var bg = d.layers[0];
        var P1 = pvDupTop(d, bg, "ZP1");
        pvStepLevels(d, P1, PV_T_EMPTY, PV_COL_E, PV_COL_R);
        var P2 = pvDupTop(d, bg, "ZP2");
        pvStepLevels(d, P2, PV_T_SOLID, [0, 0, 0], PV_COL_S);
        P2.blendMode = BlendMode.LIGHTEN;
        setComponentChannels(d);
        d.flatten();

        var f = pvTempFile(PV, "z");
        pvSavePng(d, f);
        var res = { file: f, stat: stat };
        PV.zoneCache[key] = res;
        pvTrace("render zona: " + (new Date().getTime() - tStart) + " ms");
        return res;
    } finally {
        closeQuiet(d);
        try { app.preferences.rulerUnits = oldRuler; } catch (e1) {}
    }
}

function destroyPreview(PV) {
    if (PV === null || PV === undefined) return;
    for (var bk in PV.base) {
        try { closeQuiet(PV.base[bk]); } catch (e1) {}
    }
    try { closeQuiet(PV.small); } catch (e3) {}
    for (var i = 0; i < PV.files.length; i++) {
        try { PV.files[i].remove(); } catch (e4) {}
    }
}

// ============================================
// LOGO (digambar sebagai VEKTOR lewat onDraw -> selalu tajam, termasuk layar Retina / HiDPI)
// ============================================
// Warna: LIGHT (logo terang, untuk panel gelap), DARK (logo gelap, untuk panel terang),
// NEUTRAL (oranye aksen, dipakai jika tema tidak bisa dideteksi).
// Pilihan: "auto" = ikuti tema Photoshop, "terang" = paksa logo terang, "gelap" = paksa logo gelap.
var LOGO_STYLE = "auto";
var LOGO_SIZE  = 32;   // ukuran logo di dialog (px)

// Warna latar dialog [r,g,b] skala 0..1, atau null jika tidak terdeteksi
function getDialogBg(win) {
    try {
        var c = win.graphics.backgroundColor.color;
        if (c && c.length >= 3 && !(c.length >= 4 && c[3] === 0)) return [c[0], c[1], c[2]];
    } catch (e) {}
    return null;
}

// Pilih warna logo sesuai tema panel: "light" | "dark" | "neutral"
function pickLogoVariant(win) {
    if (LOGO_STYLE === "terang") return "light";
    if (LOGO_STYLE === "gelap") return "dark";
    var bg = getDialogBg(win);
    pvTrace("logo: latar dialog = " + (bg ? bg.join(",") : "tidak terdeteksi, pakai oranye aksen"));
    if (bg === null) return "neutral";
    var lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
    return (lum < 0.5) ? "light" : "dark";
}

// Tambahkan logo vektor ke container; ukuran logis LOGO_SIZE px, dirender pada resolusi asli layar
function addVectorLogo(parent, win, variant) {
    var box = parent.add("group");
    box.preferredSize = [LOGO_SIZE, LOGO_SIZE];
    box.minimumSize   = [LOGO_SIZE, LOGO_SIZE];
    box.maximumSize   = [LOGO_SIZE, LOGO_SIZE];

    var discCol = (variant === "light") ? [0.94, 0.94, 0.94]
                : (variant === "dark")  ? [0.11, 0.11, 0.11]
                :                         [1.00, 0.55, 0.01];
    // Warna "lubang" = warna latar dialog, supaya tampak seperti potongan transparan
    var holeCol = getDialogBg(win) || ((variant === "dark") ? [0.84, 0.84, 0.84] : [0.20, 0.20, 0.20]);

    box.onDraw = function () {
        try {
            var g = this.graphics;
            // Desain asli 56 x 56, diberi ruang 2 unit di tiap sisi agar tepi lingkaran tidak terpotong
            var u = Math.min(this.size.width, this.size.height) / 60;
            var disc = g.newBrush(g.BrushType.SOLID_COLOR, [discCol[0], discCol[1], discCol[2], 1]);
            var hole = g.newBrush(g.BrushType.SOLID_COLOR, [holeCol[0], holeCol[1], holeCol[2], 1]);

            function circ(brush, cx, cy, r) {
                g.newPath();
                g.ellipsePath((cx - r + 2) * u, (cy - r + 2) * u, 2 * r * u, 2 * r * u);
                g.fillPath(brush);
            }
            function rect(brush, x, y, w, h) {
                g.newPath();
                g.rectPath((x + 2) * u, (y + 2) * u, w * u, h * u);
                g.fillPath(brush);
            }

            circ(disc, 28, 28, 28);                       // lingkaran dasar

            // persegi membulat (16..40, radius 3)
            var x0 = 16, y0 = 16, x1 = 40, y1 = 40, r = 3;
            rect(hole, x0 + r, y0, (x1 - x0) - 2 * r, y1 - y0);
            rect(hole, x0, y0 + r, x1 - x0, (y1 - y0) - 2 * r);
            circ(hole, x0 + r, y0 + r, r);
            circ(hole, x1 - r, y0 + r, r);
            circ(hole, x0 + r, y1 - r, r);
            circ(hole, x1 - r, y1 - r, r);

            circ(disc, 33, 23, 12);                       // gigitan melingkar di pojok kanan atas
            circ(hole, 33, 23, 7);                        // titik di dalam gigitan
        } catch (eDraw) {}
    };
    return box;
}

// Color Picker bawaan Photoshop (lewat warna foreground, lalu dikembalikan seperti semula).
// Dipanggil saat dialog DTF sudah DITUTUP, jadi eyedropper picker bisa mengambil warna dari dokumen.
// Mengembalikan [r,g,b] jika OK, atau null jika dibatalkan.
function pickFabricColorPS(srcDoc, rgb) {
    try { app.activeDocument = srcDoc; } catch (eA) {}
    var oldFg = new SolidColor();
    try {
        oldFg.rgb.red = app.foregroundColor.rgb.red;
        oldFg.rgb.green = app.foregroundColor.rgb.green;
        oldFg.rgb.blue = app.foregroundColor.rgb.blue;
    } catch (e0) {}
    var result = null;
    try {
        var cur = new SolidColor();
        cur.rgb.red = rgb[0]; cur.rgb.green = rgb[1]; cur.rgb.blue = rgb[2];
        app.foregroundColor = cur;
        if (app.showColorPicker()) {
            var c = app.foregroundColor.rgb;
            result = [clampByte(Math.round(c.red), 0), clampByte(Math.round(c.green), 0), clampByte(Math.round(c.blue), 0)];
        }
    } catch (e1) {}
    try { app.foregroundColor = oldFg; } catch (e2) {}
    return result;
}

// ============================================
// PENGATURAN TERSIMPAN + PRESET
// ============================================
// Disimpan sebagai teks sederhana di folder data pengguna (ExtendScript tidak punya JSON).
//   L <tab> kunci=nilai;kunci=nilai        -> pengaturan terakhir dipakai
//   P <tab> nama <tab> kunci=nilai;...      -> satu preset bernama
var STORE_DIR  = Folder.userData + "/SablonTools";
var STORE_FILE = STORE_DIR + "/DTFRasterTools.cfg";
// Tipe nilai: s = teks, n = bilangan bulat, b = ya/tidak, a = daftar bilangan bulat
var STORE_KEYS = {
    mode: "s", res: "s", lpi: "s", angle: "s", tone: "s", shape: "n",
    low: "s", high: "s", gamma: "s", resample: "b", bg: "b", fab: "a",
    ub: "b", ubChoke: "s", savePng: "b", pngDir: "s"
};

function stateToText(st) {
    var parts = [];
    for (var k in STORE_KEYS) {
        if (!STORE_KEYS.hasOwnProperty(k)) continue;
        var v = st[k];
        if (v === undefined || v === null) continue;
        var t = STORE_KEYS[k];
        if (t === "a") v = v.join(",");
        else if (t === "b") v = v ? "1" : "0";
        parts.push(k + "=" + encodeURIComponent(String(v)));
    }
    return parts.join(";");
}

function textToState(txt) {
    var st = {};
    var parts = txt.split(";");
    for (var i = 0; i < parts.length; i++) {
        var eq = parts[i].indexOf("=");
        if (eq < 1) continue;
        var k = parts[i].substr(0, eq);
        if (!STORE_KEYS.hasOwnProperty(k)) continue;
        var t = STORE_KEYS[k];
        var v;
        try { v = decodeURIComponent(parts[i].substr(eq + 1)); } catch (eD) { continue; }
        if (t === "b") {
            st[k] = (v === "1");
        } else if (t === "n") {
            var n = parseInt(v, 10);
            if (!isNaN(n)) st[k] = n;
        } else if (t === "a") {
            var a = v.split(",");
            var okArr = (a.length === 3);
            for (var j = 0; j < a.length; j++) {
                a[j] = parseInt(a[j], 10);
                if (isNaN(a[j]) || a[j] < 0 || a[j] > 255) okArr = false;
            }
            if (okArr) st[k] = a;
        } else {
            st[k] = v;
        }
    }
    return st;
}

function loadStore() {
    var store = { last: null, presets: [] };
    try {
        var f = new File(STORE_FILE);
        if (!f.exists) return store;
        f.encoding = "UTF-8";
        if (!f.open("r")) return store;
        var all = f.read();
        f.close();
        var lines = all.split(/\r\n|\r|\n/);
        for (var i = 0; i < lines.length; i++) {
            var cols = lines[i].split("\t");
            if (cols[0] === "L" && cols.length >= 2) {
                store.last = textToState(cols[1]);
            } else if (cols[0] === "P" && cols.length >= 3) {
                var nm = "";
                try { nm = decodeURIComponent(cols[1]); } catch (eN) { nm = ""; }
                if (nm !== "") store.presets.push({ name: nm, state: textToState(cols[2]) });
            }
        }
    } catch (e) {}
    return store;
}

function saveStore(store) {
    try {
        var d = new Folder(STORE_DIR);
        if (!d.exists) d.create();
        var f = new File(STORE_FILE);
        f.encoding = "UTF-8";
        if (!f.open("w")) return false;
        if (store.last) f.writeln("L\t" + stateToText(store.last));
        for (var i = 0; i < store.presets.length; i++) {
            f.writeln("P\t" + encodeURIComponent(store.presets[i].name) + "\t" + stateToText(store.presets[i].state));
        }
        f.close();
        return true;
    } catch (e) {
        return false;
    }
}

// Isi kotak angka (slider) dari nilai tersimpan; nilai rusak diabaikan
function setNumInput(inp, v) {
    var n = parseFloat(v);
    if (!isNaN(n)) inp.setValue(n);
}

function findPresetIndex(store, name) {
    for (var i = 0; i < store.presets.length; i++) {
        if (store.presets[i].name === name) return i;
    }
    return -1;
}

function cleanPresetName(nm) {
    if (nm === null || nm === undefined) return "";
    nm = String(nm).replace(/[\t\r\n]/g, " ").replace(/^\s+|\s+$/g, "");
    if (nm.length > 40) nm = nm.substr(0, 40);
    return nm;
}

// Folder simpan PNG bawaan: folder dokumen asli (jika sudah pernah disimpan), kalau tidak -> Desktop
function defaultPngDir(srcDoc) {
    try {
        var p = srcDoc.path;
        if (p && p.exists) return p.fsName;
    } catch (e) {}
    return Folder.desktop.fsName;
}

// Nama folder terakhir dari sebuah path (untuk teks tombol)
function lastFolderName(p) {
    var parts = String(p).split(/[\\\/]/);
    var name = "";
    for (var i = parts.length - 1; i >= 0; i--) { if (parts[i] !== "") { name = parts[i]; break; } }
    if (name === "") name = String(p);
    if (name.length > 20) name = name.substr(0, 19) + "...";
    return name;
}

// Penyajian ringkas path panjang di dialog
function shortPath(p) {
    if (p.length <= 44) return p;
    return p.substr(0, 14) + "..." + p.substr(p.length - 27);
}

function main() {
    if (app.documents.length === 0) {
        alert("Mohon buka file desain Anda terlebih dahulu!");
        return;
    }

    var srcDoc = app.activeDocument;

    if (!isSupportedDocMode(srcDoc.mode)) {
        alert("Mode dokumen ini tidak didukung.\nDidukung: RGB, Grayscale, CMYK, Lab, Indexed.\nUbah dulu lewat Image > Mode.");
        return;
    }

    var srcLayer = srcDoc.activeLayer;

    var layerProblem = checkTargetLayer(srcLayer);
    if (layerProblem !== "") {
        alert(layerProblem);
        return;
    }

    // --- Preview: dibangun saat pertama kali diminta (bukan saat dialog dibuka) ---
    var chosen = null;
    var PV = null;
    // Kotak preview berukuran tetap (gambar di tengahnya), seperti area gambar di Camera Raw
    var pvBoxW = PV_MAX_W, pvBoxH = PV_MAX_H;

    // Posisi & zoom preview (bertahan saat dialog dibangun ulang: pilih warna / preset)
    var pvViewState = { s: 0, ox: 0, oy: 0, iw: 0, ih: 0 };

    // Pengaturan terakhir + preset (dibaca sekali per sesi)
    var store = loadStore();

    // Seluruh dialog dibangun di dalam runDialog(init). Jika user klik kotak warna, dialog ditutup,
    // picker dibuka, lalu dialog DIBANGUN ULANG dengan pengaturan yang sama (init) - lebih stabil
    // daripada menampilkan ulang jendela yang sama.
    function runDialog(init) {
    var win = new Window("dialog", "DTF Raster Tools - abdllahmajid");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 8;
    win.margins = 14;

    // ---------- Header: logo + judul (rata kiri, sejajar dengan isi dialog) ----------
    var headerGrp = win.add("group");
    headerGrp.orientation = "row";
    headerGrp.alignment = ["fill", "top"];
    headerGrp.alignChildren = ["left", "center"];
    headerGrp.spacing = 10;
    headerGrp.margins = [0, 0, 0, 0];

    // Logo vektor di kiri judul (selalu tajam di layar Retina)
    addVectorLogo(headerGrp, win, pickLogoVariant(win));

    var title = headerGrp.add("statictext", undefined, "DTF Raster Tools");
    title.preferredSize = [300, 22];
    try { title.graphics.font = ScriptUI.newFont("Arial", "BOLD", 16); } catch (eF1) {}

    var body = win.add("group");
    body.orientation = "row";
    body.alignChildren = ["fill", "top"];
    body.spacing = 15;

    // Preview di KIRI (area gambar luas), pengaturan ringkas di KANAN - seperti Camera Raw.
    // (Nama variabel dipertahankan: leftCol = kolom pengaturan, rightCol = kolom preview.)
    var rightCol = body.add("group");
    rightCol.orientation = "column";
    rightCol.alignChildren = ["left", "top"];
    rightCol.margins = 0;
    rightCol.spacing = 6;

    var leftCol = body.add("group");
    leftCol.orientation = "column";
    leftCol.alignChildren = ["fill", "top"];
    leftCol.spacing = 6;
    leftCol.preferredSize.width = 330;

    // --- Preset (tersimpan di komputer ini, dipakai lagi di sesi berikutnya) ---
    var presetGrp = leftCol.add("group");
    presetGrp.orientation = "row";
    presetGrp.alignChildren = ["left", "center"];
    presetGrp.spacing = 6;
    var drpPreset = presetGrp.add("dropdownlist", undefined, ["(pengaturan saat ini)"]);
    for (var pi = 0; pi < store.presets.length; pi++) drpPreset.add("item", store.presets[pi].name);
    drpPreset.selection = 0;
    drpPreset.preferredSize.width = 170;
    var btnPSave = presetGrp.add("button", undefined, "Simpan...");
    btnPSave.preferredSize = [70, 24];
    var btnPDel  = presetGrp.add("button", undefined, "Hapus");
    btnPDel.preferredSize = [56, 24];
    btnPDel.enabled = false;
    try { btnPSave.helpTip = "Simpan pengaturan saat ini sebagai preset bernama"; } catch (eHt0) {}

    // --- Jenis kain ---
    var pnlMode = leftCol.add("panel", undefined, "Jenis Kain");
    pnlMode.orientation = "column";
    pnlMode.alignChildren = ["left", "top"];
    pnlMode.margins = 10;
    pnlMode.spacing = 4;

    var rowRadios = pnlMode.add("group");
    rowRadios.orientation = "row";
    rowRadios.alignChildren = ["left", "center"];
    rowRadios.spacing = 14;
    var rdoBlack = rowRadios.add("radiobutton", undefined, "Kain Hitam");
    var rdoWhite = rowRadios.add("radiobutton", undefined, "Kain Putih");
    var rdoColor = rowRadios.add("radiobutton", undefined, "Kain Warna");
    rdoBlack.value = true;

    // Warna kain: kotak kecil preview warna di sebelah kanan "Kain Warna". Klik -> muncul Color Picker bawaan Photoshop
    // (di sana bisa atur Hex, RGB, CMYK, Lab, HSB). Aktif hanya untuk Kain Warna.
    var fabRGB = (init && init.fab) ? [init.fab[0], init.fab[1], init.fab[2]] : [128, 128, 128];
    var swFiles = [];
    var swSeq = 0;
    // Gambar balok warna (PNG kecil satu warna); null jika gagal dibuat
    function swatchImage(rgb) {
        try {
            swSeq++;
            var f = new File(Folder.temp + "/AR_fab_" + new Date().getTime() + "_" + swSeq + ".png");
            makeSolidPng(f, 18, 18, rgb, [140, 140, 140]);
            swFiles.push(f);
            return ScriptUI.newImage(f);
        } catch (eImg) {
            return null;
        }
    }

    var swBtn;
    var swImg0 = swatchImage(fabRGB);
    if (swImg0) {
        swBtn = rowRadios.add("iconbutton", undefined, swImg0, { style: "button" });
        swBtn.preferredSize = [30, 28];
    } else {
        swBtn = rowRadios.add("button", undefined, "Warna...");   // cadangan jika gambar gagal dibuat
        swBtn.preferredSize = [70, 24];
    }
    try { swBtn.helpTip = "Klik untuk memilih warna kain"; } catch (eTip) {}
    swBtn.enabled = false;

    function getFabric() {
        if (rdoWhite.value) return { mode: "white", rgb: [255, 255, 255] };
        if (rdoColor.value) return { mode: "color", rgb: [fabRGB[0], fabRGB[1], fabRGB[2]] };
        return { mode: "black", rgb: [0, 0, 0] };
    }

    // Simpan semua pengaturan dialog (dipakai saat dialog dibangun ulang)
    function captureState() {
        return {
            mode: rdoWhite.value ? "white" : (rdoColor.value ? "color" : "black"),
            res: inpRes.text, lpi: inpLPI.text, angle: inpAngle.text, tone: inpTone.text,
            shape: drpShape.selection ? drpShape.selection.index : 1,
            low: inpLow.text, high: inpHigh.text, gamma: inpGamma.text,
            resample: chkResample.value, bg: chkBlackBg.value,
            view: drpView.selection ? drpView.selection.index : 0,
            auto: chkAuto.value,
            fab: [fabRGB[0], fabRGB[1], fabRGB[2]],
            ub: chkUb.value, ubChoke: inpUbChoke.text,
            savePng: chkSavePng.value, pngDir: pngDirVal
        };
    }

    // Klik kotak warna: simpan pengaturan, tutup dialog. Picker dibuka di luar dialog (lihat loop di main).
    var pickRequested = false;
    var reloadRequested = false;   // preset dipilih / disimpan / dihapus -> dialog dibangun ulang
    var pickedState = null;

    drpPreset.onChange = function () {
        var ix = drpPreset.selection ? drpPreset.selection.index : 0;
        btnPDel.enabled = (ix > 0);
        if (ix < 1) return;
        var st = captureState();
        var ps = store.presets[ix - 1].state;
        for (var pk in ps) { if (ps.hasOwnProperty(pk)) st[pk] = ps[pk]; }
        st.presetName = store.presets[ix - 1].name;
        pickedState = st;
        reloadRequested = true;
        win.close(101);
    };

    btnPSave.onClick = function () {
        var cur = (drpPreset.selection && drpPreset.selection.index > 0) ? store.presets[drpPreset.selection.index - 1].name : "";
        var nm = cleanPresetName(prompt("Nama preset (mis. Kain hitam 25 lpi):", cur));
        if (nm === "") return;
        var st = captureState();
        var ix = findPresetIndex(store, nm);
        if (ix >= 0) {
            if (!confirm("Preset '" + nm + "' sudah ada. Timpa?")) return;
            store.presets[ix].state = st;
        } else {
            store.presets.push({ name: nm, state: st });
        }
        if (!saveStore(store)) {
            alert("Preset tidak bisa disimpan (folder data pengguna tidak bisa ditulis).");
            return;
        }
        st.presetName = nm;
        pickedState = st;
        reloadRequested = true;
        win.close(101);
    };

    btnPDel.onClick = function () {
        var ix = drpPreset.selection ? drpPreset.selection.index : 0;
        if (ix < 1) return;
        if (!confirm("Hapus preset '" + store.presets[ix - 1].name + "'?")) return;
        store.presets.splice(ix - 1, 1);
        saveStore(store);
        var st = captureState();
        st.presetName = "";
        pickedState = st;
        reloadRequested = true;
        win.close(101);
    };
    swBtn.onClick = function () {
        pickedState = captureState();
        pickRequested = true;
        win.close(100);
    };

    function addRow(parent, label, def, unit) {
        var g = parent.add("group");
        g.orientation = "row";
        g.alignChildren = ["left", "center"];
        g.spacing = 4;
        var l = g.add("statictext", undefined, label);
        l.preferredSize.width = 200;
        var e = g.add("edittext", undefined, def);
        e.preferredSize.width = 50;
        var u = g.add("statictext", undefined, unit ? unit : "");
        u.preferredSize.width = 28;
        return e;
    }

    // Seperti slider Camera Raw: nama di kiri + angka di kanan (satu baris), slider memanjang di bawahnya.
    // Slider memakai skala bilangan bulat (nilai / step) agar stabil di Windows maupun Mac.
    // Mengembalikan kotak angka (edittext) sehingga pembacaan lewat .text tetap sama.
    function addSliderRow(parent, label, min, max, def, step, unit) {
        var si = String(step).indexOf(".");
        var dec = (si < 0) ? 0 : String(step).length - si - 1;

        function snapClamp(v) {
            if (isNaN(v)) v = def;
            v = Math.round(v / step) * step;
            if (v < min) v = min;
            if (v > max) v = max;
            return v;
        }

        var g = parent.add("group");
        g.orientation = "column";
        g.alignChildren = ["fill", "top"];
        g.spacing = 0;
        var top = g.add("group");
        top.orientation = "row";
        top.alignChildren = ["left", "center"];
        top.spacing = 4;
        var l = top.add("statictext", undefined, label);
        l.preferredSize.width = 200;
        var e = top.add("edittext", undefined, snapClamp(def).toFixed(dec));
        e.preferredSize.width = 50;
        var u = top.add("statictext", undefined, unit ? unit : "");
        u.preferredSize.width = 28;
        var s = g.add("slider", undefined, Math.round(def / step), Math.round(min / step), Math.round(max / step));
        s.preferredSize.width = 282;

        s.onChanging = function () { e.text = snapClamp(Math.round(s.value) * step).toFixed(dec); };
        s.onChange   = function () {
            var v = snapClamp(Math.round(s.value) * step);
            s.value = Math.round(v / step);
            e.text = v.toFixed(dec);
            if (e.afterChange) e.afterChange();
        };
        e.onChange   = function () {
            var v = snapClamp(parseFloat(e.text));
            s.value = Math.round(v / step);
            e.text = v.toFixed(dec);
            if (e.afterChange) e.afterChange();
        };
        e.setValue = function (v) {
            v = snapClamp(v);
            s.value = Math.round(v / step);
            e.text = v.toFixed(dec);
        };
        e.rowGroup = g;
        return e;
    }

    // --- Raster ---
    var pnlRaster = leftCol.add("panel", undefined, "Raster");
    pnlRaster.orientation = "column";
    pnlRaster.alignChildren = ["left", "top"];
    pnlRaster.margins = 10;
    pnlRaster.spacing = 6;

    var inpRes   = addRow(pnlRaster, "Resolution:", "300", "ppi");
    var inpLPI   = addSliderRow(pnlRaster, "Frequency:", 10, 150, 25, 1, "lpi");
    var inpAngle = addSliderRow(pnlRaster, "Angle:", 0, 360, 22.5, 0.5, "\u00B0");
    var inpTone  = addSliderRow(pnlRaster, "Midtone (kain putih):", -100, 100, 50, 5, "%");
    try { inpTone.rowGroup.helpTip = "Midtone Brightness: hanya untuk kain putih. Minus = lebih pekat, plus = titik lebih jarang."; } catch (eHt1) {}
    inpTone.rowGroup.enabled = false;

    var shapeGrp = pnlRaster.add("group");
    shapeGrp.orientation = "row";
    shapeGrp.alignChildren = ["left", "center"];
    shapeGrp.spacing = 4;
    var shapeLbl = shapeGrp.add("statictext", undefined, "Shape:");
    shapeLbl.preferredSize.width = 200;
    var drpShape = shapeGrp.add("dropdownlist", undefined, ["Round", "Ellipse", "Diamond", "Line", "Square", "Cross"]);
    drpShape.selection = 1;   // Ellipse, sama seperti Action asli
    drpShape.preferredSize.width = 100;

    // --- Kurangi raster (opsional) ---
    var pnlDens = leftCol.add("panel", undefined, "Levels (opsional)");
    pnlDens.orientation = "column";
    pnlDens.alignChildren = ["left", "top"];
    pnlDens.margins = 10;
    pnlDens.spacing = 6;

    var inpLow   = addSliderRow(pnlDens, "Shadows:", 0, 50, 0, 1, "%");
    var inpHigh  = addSliderRow(pnlDens, "Highlights:", 50, 100, 100, 1, "%");
    var inpGamma = addSliderRow(pnlDens, "Midtones:", 0.3, 3, 1, 0.05, "");
    try { pnlDens.helpTip = "Mengurangi titik raster. Default (0 / 100 / 1.00) = tanpa Levels. Titik terlalu banyak? Turunkan Highlights (mis. 70) agar area terang solid, dan/atau naikkan Midtones (mis. 1.3)."; } catch (eHt2) {}

    // --- Opsi ---
    var pnlOpt = leftCol.add("panel", undefined, "Opsi");
    pnlOpt.orientation = "column";
    pnlOpt.alignChildren = ["left", "top"];
    pnlOpt.margins = 10;
    pnlOpt.spacing = 6;

    var chkResample = pnlOpt.add("checkbox", undefined, "Resample ke resolusi di atas");
    chkResample.value = true;
    var chkBlackBg = pnlOpt.add("checkbox", undefined, "Background hitam");
    chkBlackBg.value = true;

    try { chkResample.helpTip = "Aktif: gambar 72 ppi diperbesar jadi pixel 300 ppi. Mati: hanya angka ppi yang diganti, jumlah pixel tetap."; } catch (eHt3) {}
    try { chkBlackBg.helpTip = "Matikan jika ingin hasil PNG transparan."; } catch (eHt4) {}

    // --- Output: White Underbase + simpan PNG ---
    var pnlOut = leftCol.add("panel", undefined, "Output");
    pnlOut.orientation = "column";
    pnlOut.alignChildren = ["left", "top"];
    pnlOut.margins = 10;
    pnlOut.spacing = 4;

    var ubRow = pnlOut.add("group");
    ubRow.orientation = "row";
    ubRow.alignChildren = ["left", "center"];
    ubRow.spacing = 10;
    var chkUb = ubRow.add("checkbox", undefined, "White Underbase");
    chkUb.value = false;
    try { chkUb.helpTip = "Layer putih di bawah hasil, mengikuti bentuk titik raster, dikecilkan sebesar Choke supaya tepinya tidak mengintip."; } catch (eT1) {}
    var chokeGrp = ubRow.add("group");
    chokeGrp.orientation = "row";
    chokeGrp.alignChildren = ["left", "center"];
    chokeGrp.spacing = 4;
    chokeGrp.add("statictext", undefined, "Choke:");
    var inpUbChoke = chokeGrp.add("edittext", undefined, "1");
    inpUbChoke.preferredSize.width = 40;
    chokeGrp.add("statictext", undefined, "px");
    chokeGrp.enabled = false;

    var pngRow = pnlOut.add("group");
    pngRow.orientation = "row";
    pngRow.alignChildren = ["left", "center"];
    pngRow.spacing = 10;
    var chkSavePng = pngRow.add("checkbox", undefined, "Simpan PNG");
    chkSavePng.value = false;
    try { chkSavePng.helpTip = "Simpan hasil otomatis sebagai PNG. Jika White Underbase aktif, dibuat dua file: PNG warna dan PNG _WHITE (putih saja, latar transparan)."; } catch (eT2) {}
    var pngDirVal = "";
    var btnDir = pngRow.add("button", undefined, "Folder...");
    btnDir.preferredSize = [150, 24];
    var dirRow = btnDir;      // diaktifkan / dimatikan bersama kotak "Simpan PNG"
    dirRow.enabled = false;
    function refreshDirLabel() {
        if (pngDirVal === "") {
            btnDir.text = "Folder...";
            try { btnDir.helpTip = "Folder simpan PNG. Kosong = folder dokumen asli (atau Desktop kalau belum pernah disimpan)."; } catch (e1) {}
        } else {
            btnDir.text = lastFolderName(pngDirVal);
            try { btnDir.helpTip = pngDirVal; } catch (e2) {}
        }
    }
    refreshDirLabel();
    btnDir.onClick = function () {
        var picked = Folder.selectDialog("Pilih folder simpan PNG");
        if (picked) { pngDirVal = picked.fsName; refreshDirLabel(); }
    };
    chkSavePng.onClick = function () { dirRow.enabled = chkSavePng.value; };

    // --- Isi panel preview ---
    // Kotak tampilan preview: digambar sendiri (onDraw) supaya bisa digeser & di-zoom
    var pvView = rightCol.add("group");
    pvView.preferredSize = [pvBoxW, pvBoxH];
    pvView.minimumSize   = [pvBoxW, pvBoxH];
    pvView.maximumSize   = [pvBoxW, pvBoxH];
    var pvImgObj = null;
    var pvDrag = false, pvLX = 0, pvLY = 0;

    function pvFitScale() {
        if (pvViewState.iw > 0 && pvViewState.ih > 0) return Math.min(pvBoxW / pvViewState.iw, pvBoxH / pvViewState.ih, 1);
        return 1;
    }
    function pvClampScale(sc) {
        var fs = pvFitScale();
        var maxS = Math.max(fs * PV_ZOOM_MAX, 4);
        if (isNaN(sc) || sc < fs) sc = fs;
        if (sc > maxS) sc = maxS;
        return sc;
    }
    // Jaga agar gambar tidak keluar dari kotak (atau terpusat jika lebih kecil dari kotak)
    function pvClampView() {
        var st = pvViewState;
        st.s = pvClampScale(st.s);
        var dw = st.iw * st.s, dh = st.ih * st.s;
        st.ox = (dw <= pvBoxW) ? (pvBoxW - dw) / 2 : Math.min(0, Math.max(pvBoxW - dw, st.ox));
        st.oy = (dh <= pvBoxH) ? (pvBoxH - dh) / 2 : Math.min(0, Math.max(pvBoxH - dh, st.oy));
    }
    function pvRedraw(full) {
        if (full) { try { pvView.visible = false; pvView.visible = true; } catch (e1) {} }
        try { pvView.notify("onDraw"); } catch (e2) {}
        try { win.update(); } catch (e3) {}
    }
    pvView.onDraw = function () {
        try {
            var g = this.graphics;
            g.newPath();
            g.rectPath(0, 0, this.size.width, this.size.height);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.12, 0.12, 0.12, 1]));
            if (pvImgObj) {
                var st = pvViewState;
                g.drawImage(pvImgObj, Math.round(st.ox), Math.round(st.oy), Math.round(st.iw * st.s), Math.round(st.ih * st.s));
            }
        } catch (eDraw2) {}
    };

    function pvStatText(stat) {
        if (!stat) return "";
        var tot = stat.solid + stat.raster;
        if (tot <= 0) return "Tidak ada area bertinta.";
        return "Area bertinta: Solid " + Math.round(100 * stat.solid / tot) +
               "%   |   Raster " + Math.round(100 * stat.raster / tot) + "%";
    }

    // --- Kontrol zoom & geser (tombol selalu bisa dipakai; menarik gambar dengan mouse juga bisa) ---
    var zoomGrp = rightCol.add("group");
    zoomGrp.orientation = "row";
    zoomGrp.alignChildren = ["left", "center"];
    zoomGrp.spacing = 4;
    var drpView = zoomGrp.add("dropdownlist", undefined, ["Zona raster", "Gambar asli"]);
    drpView.selection = 0;
    drpView.preferredSize.width = 110;
    var btnZOut = zoomGrp.add("button", undefined, "-");
    var btnZIn  = zoomGrp.add("button", undefined, "+");
    var btnZFit = zoomGrp.add("button", undefined, "Pas");
    var btnZ11  = zoomGrp.add("button", undefined, "1:1");
    var lblZoom = zoomGrp.add("statictext", undefined, "Zoom 1.0x");
    lblZoom.preferredSize.width = 70;
    var btnPL = zoomGrp.add("button", undefined, "<");
    var btnPU = zoomGrp.add("button", undefined, "^");
    var btnPD = zoomGrp.add("button", undefined, "v");
    var btnPR = zoomGrp.add("button", undefined, ">");
    var zb = [btnZOut, btnZIn, btnZFit, btnZ11, btnPL, btnPU, btnPD, btnPR];
    for (var zi = 0; zi < zb.length; zi++) zb[zi].preferredSize = [(zi === 2 || zi === 3) ? 38 : 28, 24];

    function pvUpdateLabel() {
        var fs = pvFitScale();
        lblZoom.text = "Zoom " + (pvViewState.s / fs).toFixed(1) + "x";
    }
    // Zoom di sekitar titik (ax, ay) di dalam kotak; tanpa titik = tengah kotak
    function pvZoomTo(newS, ax, ay) {
        if (!pvImgObj) return;
        var st = pvViewState;
        var oldS = st.s;
        newS = pvClampScale(newS);
        var ratio = newS / oldS;
        var cx = (ax === undefined || isNaN(ax)) ? pvBoxW / 2 : ax;
        var cy = (ay === undefined || isNaN(ay)) ? pvBoxH / 2 : ay;
        st.ox = cx - (cx - st.ox) * ratio;
        st.oy = cy - (cy - st.oy) * ratio;
        st.s = newS;
        pvClampView();
        pvUpdateLabel();
        pvRedraw(true);
    }
    function pvPan(dx, dy) {
        if (!pvImgObj) return;
        pvViewState.ox += dx;
        pvViewState.oy += dy;
        pvClampView();
        pvRedraw(true);
    }
    btnZIn.onClick  = function () { pvZoomTo(pvViewState.s * PV_ZOOM_STEP); };
    btnZOut.onClick = function () { pvZoomTo(pvViewState.s / PV_ZOOM_STEP); };
    btnZFit.onClick = function () { pvViewState.ox = 0; pvViewState.oy = 0; pvZoomTo(pvFitScale()); };
    btnZ11.onClick  = function () { pvZoomTo(1); };
    btnPL.onClick = function () { pvPan(60, 0); };    // gambar bergeser ke kanan = melihat bagian kiri
    btnPR.onClick = function () { pvPan(-60, 0); };
    btnPU.onClick = function () { pvPan(0, 60); };
    btnPD.onClick = function () { pvPan(0, -60); };

    // Seperti Camera Raw: TARIK gambar untuk menggeser, KLIK untuk zoom di titik kursor
    // (klik lagi = kembali ke "Pas"). Bekerja dengan trackpad (klik / tap, atau klik lalu geser).
    // Catatan: gerakan dua jari (scroll) dan cubit (pinch) tidak didukung oleh ScriptUI Photoshop.
    var pvMoved = 0, pvDownX = 0, pvDownY = 0;
    function pvClickZoom() {
        var fs = pvFitScale();
        if (pvViewState.s > fs * 1.05) {
            pvViewState.ox = 0; pvViewState.oy = 0;
            pvZoomTo(fs);
        } else {
            pvZoomTo(Math.max(1, fs * 2), pvDownX, pvDownY);
        }
    }
    try {
        pvView.addEventListener("mousedown", function (ev) {
            pvDrag = true; pvMoved = 0;
            pvLX = ev.screenX; pvLY = ev.screenY;
            pvDownX = ev.clientX; pvDownY = ev.clientY;
        });
        pvView.addEventListener("mousemove", function (ev) {
            if (!pvDrag || !pvImgObj) return;
            var dx = ev.screenX - pvLX, dy = ev.screenY - pvLY;
            if (isNaN(dx) || isNaN(dy)) return;
            pvMoved += Math.abs(dx) + Math.abs(dy);
            pvLX = ev.screenX; pvLY = ev.screenY;
            if (pvMoved < 4) return;           // gerakan sangat kecil = masih dianggap klik
            pvViewState.ox += dx;
            pvViewState.oy += dy;
            pvClampView();
            pvRedraw(false);
        });
        pvView.addEventListener("mouseup", function () {
            if (!pvDrag) return;
            pvDrag = false;
            if (pvMoved < 4 && pvImgObj) pvClickZoom();
            else pvRedraw(true);
        });
        pvView.addEventListener("mouseout", function () { if (pvDrag) { pvDrag = false; pvRedraw(true); } });
    } catch (eEv) {}

    var pvStat = rightCol.add("statictext", undefined, "Klik Perbarui untuk membuat preview.");
    pvStat.preferredSize = [PV_MAX_W, 18];
    try { pvView.helpTip = "Klik: zoom di titik kursor (klik lagi = Pas). Tarik: geser gambar. Preview menunjukkan ZONA, bukan bentuk titiknya."; } catch (eHt5) {}

    // Legenda: kotak warna (vektor, berbingkai tipis) + teks warna bawaan tema -> terbaca di tema gelap & terang
    var barGrp = rightCol.add("group");
    barGrp.orientation = "row";
    barGrp.alignChildren = ["left", "center"];
    barGrp.spacing = 24;
    var legGrp = barGrp.add("group");
    legGrp.orientation = "row";
    legGrp.alignment = ["left", "center"];
    legGrp.alignChildren = ["left", "center"];
    legGrp.spacing = 14;

    function addLegendItem(rgb, label) {
        var item = legGrp.add("group");
        item.orientation = "row";
        item.alignChildren = ["left", "center"];
        item.spacing = 5;
        var sw = item.add("group");
        sw.preferredSize = [12, 12];
        sw.minimumSize = [12, 12];
        sw.maximumSize = [12, 12];
        sw.onDraw = function () {
            try {
                var g = this.graphics;
                var w = this.size.width, h = this.size.height;
                g.newPath();
                g.rectPath(0.5, 0.5, w - 1, h - 1);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]));
                g.newPath();
                g.rectPath(0.5, 0.5, w - 1, h - 1);
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0.55, 0.55, 0.55, 1], 1));
            } catch (eSw) {}
        };
        return item.add("statictext", undefined, label);
    }
    addLegendItem(PV_COL_S, "Solid (putih)");
    addLegendItem(PV_COL_R, "Raster (oranye)");
    addLegendItem(PV_COL_E, "Kosong (gelap)");

    var autoGrp = barGrp.add("group");
    autoGrp.orientation = "row";
    autoGrp.spacing = 10;
    var chkAuto = autoGrp.add("checkbox", undefined, "Preview otomatis");
    chkAuto.value = false;
    var btnPv = autoGrp.add("button", undefined, "Perbarui");

    function setPvImage(f) {
        pvImgObj = ScriptUI.newImage(f);
        var st = pvViewState;
        var iw = (PV !== null && PV.ok) ? PV.w : 0;
        var ih = (PV !== null && PV.ok) ? PV.h : 0;
        if (iw <= 0 || ih <= 0) {
            try { iw = pvImgObj.size[0]; ih = pvImgObj.size[1]; } catch (eSz) {}
        }
        if (iw <= 0 || ih <= 0) { iw = pvBoxW; ih = pvBoxH; }
        // Ukuran gambar berubah (atau pertama kali) -> tampilkan "Pas"; selain itu posisi & zoom dipertahankan
        if (st.s <= 0 || st.iw !== iw || st.ih !== ih) {
            st.iw = iw; st.ih = ih;
            st.s = pvFitScale();
            st.ox = 0; st.oy = 0;
        }
        pvClampView();
        pvUpdateLabel();
        pvRedraw(true);
    }

    function readSettings() {
        var lowV  = parseFloat(inpLow.text);   if (isNaN(lowV))  lowV  = 0;
        var highV = parseFloat(inpHigh.text);  if (isNaN(highV)) highV = 100;
        var gamV  = parseFloat(inpGamma.text); if (isNaN(gamV))  gamV  = 1;
        return { low: lowV, high: highV, gamma: gamV };
    }

    function refreshPreview() {
        if (PV !== null && !PV.ok) return;
        try {
            pvStat.text = (PV === null) ? "Menyiapkan preview (pertama kali, agak lama)..." : "Memperbarui preview...";
            try { win.update(); } catch (e0) {}

            if (PV === null) {
                PV = createPreviewState(srcDoc, srcLayer);
                if (!PV.ok) {
                    pvStat.text = "Preview tidak tersedia: " + PV.error;
                    drpView.enabled = false; chkAuto.enabled = false; btnPv.enabled = false;
                    return;
                }
            }

            var fab = getFabric();
            if (drpView.selection.index === 1) {
                setPvImage(renderOrigFile(PV, fab));
                pvStat.text = "Gambar asli di atas kain " + fabricLabel(fab) + ".";
            } else {
                var s = readSettings();
                var r = renderZoneFile(PV, fab, s.low, s.high, s.gamma);
                setPvImage(r.file);
                pvStat.text = pvStatText(r.stat);
            }
        } catch (er) {
            pvStat.text = "Preview gagal: " + er.message;
        }
        try { app.activeDocument = srcDoc; } catch (e9) {}
    }

    // Dipanggil saat slider / jenis kain / tampilan berubah
    function maybeRefresh() {
        if (chkAuto.value) refreshPreview();
        else pvStat.text = "Pengaturan berubah - klik 'Perbarui' untuk melihat hasilnya.";
    }

    inpLow.afterChange   = maybeRefresh;
    inpHigh.afterChange  = maybeRefresh;
    inpGamma.afterChange = maybeRefresh;
    drpView.onChange     = maybeRefresh;
    btnPv.onClick        = refreshPreview;

    // --- Footer ---
    var footerGrp = win.add("group");
    footerGrp.orientation = "row";
    footerGrp.alignChildren = ["left", "center"];
    footerGrp.alignment = "fill";
    footerGrp.margins = [0, 6, 0, 0];

    var btnGrp = footerGrp.add("group");
    btnGrp.alignment = ["right", "fill"];
    btnGrp.orientation = "row";
    btnGrp.spacing = 10;

    var btnCancel = btnGrp.add("button", undefined, "Cancel", { name: "cancel" });
    btnCancel.preferredSize = [90, 32];
    var btnRun = btnGrp.add("button", undefined, "PROCESS", { name: "ok" });
    btnRun.preferredSize = [130, 32];

    btnRun.onDraw = function (state) {
        var g = this.graphics;
        var w = this.size.width;
        var h = this.size.height;
        var blueBrush = g.newBrush(g.BrushType.SOLID_COLOR, [0.0, 0.478, 1, 1]);
        var whitePen  = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1]);
        g.newPath();
        g.roundRectPath(0, 0, w, h, 4);
        g.fillPath(blueBrush);
        var font   = ScriptUI.newFont("Arial", "BOLD", 13);
        g.font     = font;
        var strDim = g.measureString(this.text, font);
        g.drawString(this.text, whitePen, (w - strDim.width) / 2, (h - strDim.height) / 2 - 2);
    };

    btnCancel.onClick = function () { win.close(0); };

    function applyModeUi() {
        var white = rdoWhite.value;
        var isColor = rdoColor.value;
        inpTone.rowGroup.enabled = white;
        swBtn.enabled = isColor;
        if (white) chkUb.value = false;     // kain putih tidak butuh underbase putih
        chkUb.enabled = !white;
        chokeGrp.enabled = (chkUb.value && !white);
        chkBlackBg.text = white ? "Background putih" : (isColor ? "Background warna kain" : "Background hitam");
    }

    function onModeChange() {
        var white = rdoWhite.value;
        applyModeUi();
        // LPI default mengikuti Action asli (hitam 25, putih 30), hanya jika belum diubah manual
        if (white && parseFloat(inpLPI.text) === 25) inpLPI.setValue(30);
        if (!white && parseFloat(inpLPI.text) === 30) inpLPI.setValue(25);
        maybeRefresh();
    }
    chkUb.onClick = applyModeUi;
    rdoBlack.onClick = onModeChange;
    rdoWhite.onClick = onModeChange;
    rdoColor.onClick = onModeChange;

    btnRun.onClick = function () {
        var res   = parseFloat(inpRes.text);
        var lpi   = parseFloat(inpLPI.text);
        var angle = parseFloat(inpAngle.text);
        var tone  = parseFloat(inpTone.text);
        var lowP  = parseFloat(inpLow.text);
        var highP = parseFloat(inpHigh.text);
        var gam   = parseFloat(inpGamma.text);
        var chokeV = parseFloat(inpUbChoke.text);
        var useUb = (chkUb.value && !rdoWhite.value);

        var errs = [];
        if (useUb && (isNaN(chokeV) || chokeV < 0 || chokeV > 30)) errs.push("Choke harus angka 0 - 30 (px).");
        if (isNaN(lowP) || lowP < 0 || lowP > 50)     errs.push("Shadows harus 0 - 50 (%).");
        if (isNaN(highP) || highP < 50 || highP > 100) errs.push("Highlights harus 50 - 100 (%).");
        if (isNaN(gam) || gam < 0.3 || gam > 3)       errs.push("Midtones (Gamma) harus 0.3 - 3.");
        if (isNaN(res) || res <= 0)                   errs.push("Resolution harus angka positif.");
        if (isNaN(lpi) || lpi < 10 || lpi > 200)      errs.push("Frequency (LPI) harus angka 10 - 200.");
        if (isNaN(angle) || angle < 0 || angle > 360) errs.push("Angle harus angka 0 - 360.");
        if (rdoWhite.value && (isNaN(tone) || tone < -100 || tone > 100)) errs.push("Midtone Brightness harus angka -100 sampai 100 (minus = lebih pekat).");

        if (errs.length > 0) {
            alert("Input tidak valid:\n\n" + errs.join("\n"));
            return;
        }

        var opt = {
            res: res,
            lpi: lpi,
            angle: angle,
            shape: drpShape.selection.index,
            resample: chkResample.value,
            bg: chkBlackBg.value,
            white: rdoWhite.value,
            colorFabric: rdoColor.value,
            fabricRGB: [fabRGB[0], fabRGB[1], fabRGB[2]],
            tone: (isNaN(tone) ? 0 : tone),
            lowPct: lowP,
            highPct: highP,
            gamma: gam,
            ub: useUb,
            ubChoke: (isNaN(chokeV) ? 1 : chokeV),
            savePng: chkSavePng.value,
            pngDir: pngDirVal
        };

        // Ingat pengaturan ini untuk pemakaian berikutnya
        store.last = captureState();
        saveStore(store);

        chosen = opt;
        win.close(1);
    };

    // Terapkan pengaturan yang tersimpan (pengaturan terakhir, preset, atau dialog dibuka ulang setelah memilih warna)
    if (init) {
        if (init.mode === "white") rdoWhite.value = true;
        else if (init.mode === "color") rdoColor.value = true;
        else rdoBlack.value = true;
        if (init.res !== undefined && parseFloat(init.res) > 0) inpRes.text = String(init.res);
        setNumInput(inpLPI, init.lpi);
        setNumInput(inpAngle, init.angle);
        setNumInput(inpTone, init.tone);
        if (init.shape !== undefined && init.shape >= 0 && init.shape <= 5) { try { drpShape.selection = init.shape; } catch (eS) {} }
        setNumInput(inpLow, init.low);
        setNumInput(inpHigh, init.high);
        setNumInput(inpGamma, init.gamma);
        if (init.resample !== undefined) chkResample.value = init.resample;
        if (init.bg !== undefined) chkBlackBg.value = init.bg;
        if (init.view !== undefined) { try { drpView.selection = init.view; } catch (eV) {} }
        if (init.auto !== undefined) chkAuto.value = init.auto;
        if (init.ub !== undefined) chkUb.value = init.ub;
        if (init.ubChoke !== undefined && !isNaN(parseFloat(init.ubChoke))) inpUbChoke.text = String(init.ubChoke);
        if (init.savePng !== undefined) chkSavePng.value = init.savePng;
        if (init.pngDir) pngDirVal = init.pngDir;
        refreshDirLabel();
        dirRow.enabled = chkSavePng.value;
        if (init.presetName) {
            var pix = findPresetIndex(store, init.presetName);
            if (pix >= 0) { drpPreset.selection = pix + 1; btnPDel.enabled = true; }
        }
        applyModeUi();
    }

    // Jika sebelumnya preview sudah dibuat, tampilkan lagi begitu dialog muncul
    // (memakai cache; jika warna kain berubah, peta alpha dihitung ulang)
    win.onShow = function () {
        if (init && init.hadPreview) refreshPreview();
    };

    win.center();
    win.show();

    // File sementara gambar kotak warna
    for (var sfi = 0; sfi < swFiles.length; sfi++) {
        try { swFiles[sfi].remove(); } catch (eSf) {}
    }
    return { action: (pickRequested ? "pick" : (reloadRequested ? "reload" : (chosen !== null ? "run" : "cancel"))), state: pickedState };
    }   // akhir runDialog

    var dlgState = store.last;   // null jika belum pernah dipakai
    while (true) {
        var out = runDialog(dlgState);
        if (out.action !== "pick" && out.action !== "reload") break;
        dlgState = out.state;
        dlgState.hadPreview = (PV !== null && PV.ok);
        if (out.action === "pick") {
            var picked = pickFabricColorPS(srcDoc, dlgState.fab);
            if (picked !== null) dlgState.fab = picked;
        }
    }

    // Bersihkan dokumen & file sementara preview, lalu jalankan proses utama
    destroyPreview(PV);
    try { app.activeDocument = srcDoc; } catch (eAct) {}
    if (chosen !== null) processQuickBlack(srcDoc, srcLayer, chosen);
}

// ============================================
// HELPER: DOM / ActionManager
// ============================================
function getChannelByName(doc, name) {
    for (var i = 0; i < doc.channels.length; i++) {
        if (doc.channels[i].name === name) return doc.channels[i];
    }
    return null;
}

function removeChannelByName(doc, name) {
    try {
        var ch = getChannelByName(doc, name);
        if (ch) ch.remove();
    } catch (e) {}
}

function findLayerById(doc, id) {
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].id === id) return doc.layers[i];
    }
    return null;
}

function findLayerByName(doc, name) {
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === name) return doc.layers[i];
    }
    return null;
}

function makeGray(v) {
    var c = new SolidColor();
    c.rgb.red = v; c.rgb.green = v; c.rgb.blue = v;
    return c;
}

function closeQuiet(doc) {
    if (doc === null || doc === undefined) return;
    try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
}

// ---------- Layer target & mode dokumen ----------
// Cari "alamat" layer (urutan indeks dari level atas sampai ke dalam group), atau null
function findLayerPath(container, id) {
    for (var i = 0; i < container.layers.length; i++) {
        var l = container.layers[i];
        if (l.id === id) return [i];
        if (l.typename === "LayerSet") {
            var sub = findLayerPath(l, id);
            if (sub !== null) return [i].concat(sub);
        }
    }
    return null;
}

// Ambil layer di salinan dokumen lewat alamat dari findLayerPath (tidak bergantung pada id)
function layerByPath(container, path) {
    var cur = container, l = null;
    for (var i = 0; i < path.length; i++) {
        l = cur.layers[path[i]];
        cur = l;
    }
    return l;
}

// Layer yang bisa diproses: layer biasa, text, smart object, shape/fill, atau group (digabung dulu di salinan)
function checkTargetLayer(l) {
    if (l.typename === "LayerSet") return "";
    var ok = [LayerKind.NORMAL, LayerKind.TEXT, LayerKind.SMARTOBJECT];
    var extra = ["SOLIDFILL", "GRADIENTFILL", "PATTERNFILL"];
    for (var i = 0; i < extra.length; i++) {
        if (typeof LayerKind[extra[i]] !== "undefined") ok.push(LayerKind[extra[i]]);
    }
    for (var j = 0; j < ok.length; j++) {
        if (l.kind === ok[j]) return "";
    }
    return "Jenis layer ini tidak bisa diproses (layer penyesuaian / video / 3D).\nPilih layer gambar, text, smart object, shape, atau group.";
}

function isSupportedDocMode(m) {
    return m === DocumentMode.RGB || m === DocumentMode.GRAYSCALE || m === DocumentMode.CMYK ||
           m === DocumentMode.LAB || m === DocumentMode.INDEXEDCOLOR;
}

// Salinan dokumen dijadikan RGB 8-bit (dokumen asli tidak disentuh)
function ensureRgb8(d) {
    if (d.mode === DocumentMode.INDEXEDCOLOR) { try { d.flatten(); } catch (e0) {} }
    if (d.mode !== DocumentMode.RGB) d.changeMode(ChangeMode.RGB);
    if (d.bitsPerChannel !== BitsPerChannelType.EIGHT) d.bitsPerChannel = BitsPerChannelType.EIGHT;
}

// Jadikan layer target satu layer biasa di level paling atas (mask & efek sudah menyatu ke piksel).
// Dipakai hanya pada SALINAN dokumen. Mengembalikan layer hasilnya.
function prepareTarget(d, t) {
    try { t.allLocked = false; } catch (e0) {}
    if (t.typename === "LayerSet") {
        t = t.merge();
    } else {
        try { if (t.isBackgroundLayer) t.isBackgroundLayer = false; } catch (e1) {}
        if (t.kind !== LayerKind.NORMAL) t.rasterize(RasterizeType.ENTIRELAYER);
    }
    try { t.visible = true; } catch (e2) {}
    try { t.blendMode = BlendMode.NORMAL; } catch (e3) {}
    if (t.parent.typename !== "Document") t.move(d.layers[0], ElementPlacement.PLACEBEFORE);

    // Menyatukan mask / layer style: layer kosong ditaruh di bawah, lalu merge ke bawah
    var base = null;
    try {
        base = d.artLayers.add();
        base.name = "__BAKE";
        base.move(t, ElementPlacement.PLACEAFTER);
        d.activeLayer = t;
        var m = t.merge();
        t = (m && m.typename === "ArtLayer") ? m : d.activeLayer;
        base = null;
    } catch (e4) {
        logStep("peringatan: mask/efek tidak bisa disatukan (" + e4.message + ")");
        if (base !== null) { try { base.remove(); } catch (e5) {} }
    }
    return t;
}

// Buang semua layer selain target (kalau tidak bisa dibuang, disembunyikan)
function isolateTarget(d, tgtId) {
    for (var k = d.layers.length - 1; k >= 0; k--) {
        if (d.layers[k].id !== tgtId) {
            try { d.layers[k].remove(); }
            catch (e2) { try { d.layers[k].visible = false; } catch (e3) {} }
        }
    }
}

function setComponentChannels(doc) {
    try { doc.activeChannels = doc.componentChannels; } catch (e) {}
}

// Langkah 1: Image Size (resolusi)
function setResolution(doc, res, resample) {
    if (Math.abs(doc.resolution - res) < 0.001) return;

    if (!resample) {
        doc.resizeImage(undefined, undefined, res, ResampleMethod.NONE);
        return;
    }

    try {
        var d = new ActionDescriptor();
        d.putUnitDouble(cTID('Rslt'), cTID('#Rsl'), res);
        d.putBoolean(sTID("scaleStyles"), true);
        d.putBoolean(cTID('CnsP'), true);
        d.putEnumerated(cTID('Intr'), cTID('Intp'), sTID("preserveDetailsUpscale"));
        d.putInteger(cTID('Nose'), 0);
        executeAction(sTID('imageSize'), d, DialogModes.NO);
    } catch (e) {
        // Photoshop lama tanpa "Preserve Details" -> pakai bicubic
        doc.resizeImage(undefined, undefined, res, ResampleMethod.BICUBIC);
    }
}

// Langkah 13-14: adjustment Black & White, semua slider 100%
function addBlackWhiteAdjustment() {
    // Make
    var d1 = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putClass(cTID('AdjL'));
    d1.putReference(cTID('null'), r1);
    var d2 = new ActionDescriptor();
    var d3 = new ActionDescriptor();
    d3.putEnumerated(sTID("presetKind"), sTID("presetKindType"), sTID("presetKindDefault"));
    d3.putInteger(cTID('Rd  '), 40);
    d3.putInteger(cTID('Yllw'), 60);
    d3.putInteger(cTID('Grn '), 40);
    d3.putInteger(cTID('Cyn '), 60);
    d3.putInteger(cTID('Bl  '), 20);
    d3.putInteger(cTID('Mgnt'), 80);
    d3.putBoolean(sTID("useTint"), false);
    var d4 = new ActionDescriptor();
    d4.putDouble(cTID('Rd  '), 225.000457763672);
    d4.putDouble(cTID('Grn '), 211.000671386719);
    d4.putDouble(cTID('Bl  '), 179.001159667969);
    d3.putObject(sTID("tintColor"), sTID("RGBColor"), d4);
    d2.putObject(cTID('Type'), cTID('BanW'), d3);
    d1.putObject(cTID('Usng'), cTID('AdjL'), d2);
    executeAction(cTID('Mk  '), d1, DialogModes.NO);

    // Set: semua slider 100
    var e1 = new ActionDescriptor();
    var er1 = new ActionReference();
    er1.putEnumerated(cTID('AdjL'), cTID('Ordn'), cTID('Trgt'));
    e1.putReference(cTID('null'), er1);
    var e2 = new ActionDescriptor();
    e2.putEnumerated(sTID("presetKind"), sTID("presetKindType"), sTID("presetKindFactory"));
    e2.putInteger(cTID('Rd  '), 100);
    e2.putInteger(cTID('Yllw'), 100);
    e2.putInteger(cTID('Grn '), 100);
    e2.putInteger(cTID('Cyn '), 100);
    e2.putInteger(cTID('Bl  '), 100);
    e2.putInteger(cTID('Mgnt'), 100);
    var e3 = new ActionDescriptor();
    e3.putDouble(cTID('Rd  '), 224.976655840874);
    e3.putDouble(cTID('Grn '), 210.976656675339);
    e3.putDouble(cTID('Bl  '), 178.976658582687);
    e2.putObject(sTID("tintColor"), sTID("RGBColor"), e3);
    e1.putObject(cTID('T   '), cTID('BanW'), e2);
    executeAction(cTID('setd'), e1, DialogModes.NO);
}

// Langkah 16: seleksi = luminositas komposit RGB
function loadCompositeSelection() {
    var d = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putProperty(cTID('Chnl'), sTID("selection"));
    d.putReference(cTID('null'), r1);
    var r2 = new ActionReference();
    r2.putEnumerated(cTID('Chnl'), cTID('Chnl'), sTID("RGB"));
    d.putReference(cTID('T   '), r2);
    executeAction(cTID('setd'), d, DialogModes.NO);
}

// Kain putih: seleksi = luminositas channel Gray (dokumen grayscale)
function loadGraySelection() {
    var d = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putProperty(cTID('Chnl'), sTID("selection"));
    d.putReference(cTID('null'), r1);
    var r2 = new ActionReference();
    r2.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Gry '));
    d.putReference(cTID('T   '), r2);
    executeAction(cTID('setd'), d, DialogModes.NO);
}

// Langkah 20: blend mode layer aktif = Divide
function setBlendDivide() {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
    d.putReference(cTID('null'), r);
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cTID('Md  '), cTID('BlnM'), sTID("blendDivide"));
    d.putObject(cTID('T   '), cTID('Lyr '), d2);
    executeAction(cTID('setd'), d, DialogModes.NO);
}

// Seleksi = transparansi layer aktif (nilai parsial tetap terjaga)
function loadLayerTransparency() {
    var d = new ActionDescriptor();
    var r1 = new ActionReference();
    r1.putProperty(cTID('Chnl'), sTID("selection"));
    d.putReference(cTID('null'), r1);
    var r2 = new ActionReference();
    r2.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Trsp'));
    d.putReference(cTID('T   '), r2);
    executeAction(cTID('setd'), d, DialogModes.NO);
}

// Layer > Layer Mask > From Transparency
function makeMaskFromTransparency() {
    var d = new ActionDescriptor();
    d.putClass(cTID('Nw  '), cTID('Chnl'));
    var r = new ActionReference();
    r.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Msk '));
    d.putReference(cTID('At  '), r);
    d.putEnumerated(cTID('Usng'), cTID('UsrM'), cTID('Trns'));
    executeAction(cTID('Mk  '), d, DialogModes.NO);
}

// Layer > Layer Mask > Reveal Selection
function makeMaskFromSelection() {
    var d = new ActionDescriptor();
    d.putClass(cTID('Nw  '), cTID('Chnl'));
    var r = new ActionReference();
    r.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Msk '));
    d.putReference(cTID('At  '), r);
    d.putEnumerated(cTID('Usng'), cTID('UsrM'), cTID('RvlS'));
    executeAction(cTID('Mk  '), d, DialogModes.NO);
}

function selectLayerMaskChannel() {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(cTID('Chnl'), cTID('Chnl'), cTID('Msk '));
    d.putReference(cTID('null'), r);
    d.putBoolean(cTID('MkVs'), false);
    executeAction(cTID('slct'), d, DialogModes.NO);
}

// Hapus channel yang sedang ditarget (mask). apply=true -> mask diterapkan ke piksel
function deleteTargetChannel(apply) {
    var d = new ActionDescriptor();
    var r = new ActionReference();
    r.putEnumerated(cTID('Chnl'), cTID('Ordn'), cTID('Trgt'));
    d.putReference(cTID('null'), r);
    d.putBoolean(cTID('Aply'), apply);
    executeAction(cTID('Dlt '), d, DialogModes.NO);
}

// ============================================
// HELPER: KAIN WARNA (Color to Alpha)
// ============================================
// Rumus: art = C*(1-a) + tinta*a   (C = warna kain)
//   a_c   = (v-C)/(255-C) jika v > C, (C-v)/C jika v < C      (per kanal R,G,B)
//   a     = max(a_R, a_G, a_B)       -> alpha terkecil yang membuat tinta valid
//   tinta = (art - C*(1-a)) / a
// Semua dihitung dengan Levels / blend mode (tanpa loop piksel), jadi cepat.

// Layer warna solid di paling atas
function ckSolidLayer(doc, rgb, name) {
    setComponentChannels(doc);
    doc.activeLayer = doc.layers[0];
    var l = doc.artLayers.add();
    l.name = name;
    doc.selection.selectAll();
    doc.selection.fill(pvColor(rgb));
    doc.selection.deselect();
    return l;
}

// Merge Down (layer di atas ke layer di bawahnya, memakai blend mode layer atas); hasilnya layer aktif
function ckMergeDown(doc, layer) {
    doc.activeLayer = layer;
    var r = null;
    try {
        r = layer.merge();
    } catch (e1) {
        executeAction(cTID('Mrg2'), undefined, DialogModes.NO);
        r = null;
    }
    if (!r || r.typename !== "ArtLayer") r = doc.activeLayer;
    doc.activeLayer = r;
    return r;
}

// Blend mode lewat DOM; jika konstanta tidak ada di versi Photoshop ini -> ActionManager
function ckSetBlend(doc, layer, domName, amId) {
    doc.activeLayer = layer;
    var done = false;
    try {
        if (typeof BlendMode[domName] !== "undefined") {
            layer.blendMode = BlendMode[domName];
            done = true;
        }
    } catch (e1) {}
    if (!done) {
        var d = new ActionDescriptor();
        var r = new ActionReference();
        r.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
        d.putReference(cTID('null'), r);
        var d2 = new ActionDescriptor();
        d2.putEnumerated(cTID('Md  '), cTID('BlnM'), sTID(amId));
        d.putObject(cTID('T   '), cTID('Lyr '), d2);
        executeAction(cTID('setd'), d, DialogModes.NO);
    }
}

// Levels per kanal R,G,B.
//   down=false : (v - C) / (255 - C)   -> bagian nilai di ATAS warna kain
//   down=true  : layer sudah di-invert -> (C - v) / C
// Kasus tepi (C = 255 / 0) -> Levels tidak boleh black >= white, dipakai rentang 254-255 dengan output 0-1.
function ckLevelsPerChannel(doc, layer, C, down) {
    doc.activeLayer = layer;
    for (var c = 0; c < 3; c++) {
        doc.activeChannels = [doc.channels[c]];
        var inBlack = down ? (255 - C[c]) : C[c];
        if (inBlack >= 255) layer.adjustLevels(254, 255, 1.0, 0, 1);
        else layer.adjustLevels(inBlack, 255, 1.0, 0, 255);
    }
    setComponentChannels(doc);
}

function ckOnlyVisible(doc, keep) {
    for (var i = 0; i < doc.layers.length; i++) {
        try { doc.layers[i].visible = (doc.layers[i].id === keep.id); } catch (e1) {}
    }
}

// Bungkus group ke group baru lalu merge (sama dengan langkah 19-24 alur asli)
function wrapGroupAndMerge(doc, grp) {
    doc.activeLayer = grp;
    var dG = new ActionDescriptor();
    var rNew = new ActionReference();
    rNew.putClass(sTID('layerSection'));
    dG.putReference(sTID('null'), rNew);
    var rFrom = new ActionReference();
    rFrom.putEnumerated(sTID('layer'), sTID('ordinal'), sTID('targetEnum'));
    dG.putReference(sTID('from'), rFrom);
    executeAction(sTID('make'), dG, DialogModes.NO);

    var outer = doc.activeLayer;
    outer.name = "Group 1";
    doc.activeLayer = outer;
    executeAction(sTID('mergeLayersNew'), undefined, DialogModes.NO);
    return doc.activeLayer;
}

// Hasil: layer "Knockout - Quick Black" = warna tinta, transparansi = alpha (setara hasil alur kain hitam)
function buildColorKnockout(doc, tgt, C) {
    logStep("KAIN WARNA: mulai, warna #" + rgbToHex(C));
    setComponentChannels(doc);

    // 1) Artwork di atas warna kain (area transparan jadi warna kain -> alpha 0)
    var art = pvDupTop(doc, tgt, "CK_Art");
    art.visible = true;
    var fill = ckSolidLayer(doc, C, "CK_Fabric");
    fill.move(art, ElementPlacement.PLACEAFTER);
    var comp = ckMergeDown(doc, art);
    comp.name = "CK_Comp";
    logStep("KAIN WARNA: artwork + warna kain selesai");

    // 2) Alpha per kanal = max(bagian atas, bagian bawah), lalu alpha = max(R,G,B)
    var U = pvDupTop(doc, comp, "CK_Up");
    ckLevelsPerChannel(doc, U, C, false);
    var D = pvDupTop(doc, comp, "CK_Down");
    setComponentChannels(doc);
    D.invert();
    ckLevelsPerChannel(doc, D, C, true);
    D.blendMode = BlendMode.LIGHTEN;
    var A = ckMergeDown(doc, D);
    A.name = "CK_AlphaCh";
    logStep("KAIN WARNA: alpha per kanal selesai");

    // max(R,G,B) = Black & White dengan semua slider 100% (sama seperti alur asli)
    doc.activeLayer = A;
    addBlackWhiteAdjustment();
    var bw = doc.activeLayer;
    var ALPHA = ckMergeDown(doc, bw);
    ALPHA.name = "CK_Alpha";
    logStep("KAIN WARNA: peta alpha selesai");

    // 3) Tinta = (art - C*(1-a)) / a
    var IA = pvDupTop(doc, ALPHA, "CK_InvA");
    setComponentChannels(doc);
    IA.invert();
    var Kf = ckSolidLayer(doc, C, "CK_FabricMul");
    Kf.blendMode = BlendMode.MULTIPLY;
    var K = ckMergeDown(doc, Kf);               // K = C * (1-a)

    var X0 = pvDupTop(doc, comp, "CK_X");
    X0.move(K, ElementPlacement.PLACEAFTER);    // X0 tepat di bawah K
    ckSetBlend(doc, K, "SUBTRACT", "blendSubtraction");
    var X = ckMergeDown(doc, K);                // X = art - C*(1-a)

    var AD = pvDupTop(doc, ALPHA, "CK_Div");
    ckSetBlend(doc, AD, "DIVIDE", "blendDivide");
    var INK = ckMergeDown(doc, AD);             // INK = X / a
    INK.name = "CK_Ink";
    logStep("KAIN WARNA: warna tinta selesai");

    // 4) Alpha jadi mask group (seleksi dari peta alpha), lalu group di-merge
    ckOnlyVisible(doc, ALPHA);
    setComponentChannels(doc);
    loadCompositeSelection();
    INK.visible = true;
    ALPHA.visible = false;

    var grp = doc.layerSets.add();
    grp.name = "Quick Black Knockout";
    grp.move(INK, ElementPlacement.PLACEBEFORE);
    INK.move(grp, ElementPlacement.INSIDE);
    doc.activeLayer = grp;
    makeMaskFromSelection();
    doc.selection.deselect();

    var ko = wrapGroupAndMerge(doc, grp);
    if (ko.typename !== "ArtLayer") {
        throw new Error("Merge group (kain warna) gagal, hasil bukan layer biasa.");
    }
    try { ALPHA.remove(); } catch (e1) {}
    try { comp.remove(); } catch (e2) {}
    try { tgt.visible = false; } catch (e3) {}
    ko.name = "Knockout - Quick Black";
    logStep("KAIN WARNA: knockout selesai");
    return ko;
}

// ============================================
// PROSES UTAMA
// ============================================
// ---------- DIAGNOSTIK: log langkah ke Desktop ----------
var LOG_PATH = Folder.temp + "/AutoRaster_log.txt";            // ditulis tiap langkah (tidak mengotori Desktop)
var LOG_DESKTOP = Folder.desktop + "/AutoRaster_log.txt";      // salinan, hanya dibuat jika terjadi error
var LOG_ENABLED = true;
function logStep(msg) {
    if (!LOG_ENABLED) return;
    try {
        var f = new File(LOG_PATH);
        f.encoding = "UTF-8";
        f.open("a");
        var d = new Date();
        f.writeln(d.toTimeString().substr(0, 8) + "  " + msg);
        f.close();
    } catch (e) {}
}
function logReset() {
    if (!LOG_ENABLED) return;
    try {
        var f = new File(LOG_PATH);
        f.open("w");
        f.writeln("=== AutoRaster log " + new Date().toString() + " ===");
        f.close();
    } catch (e) {}
}

// ---------- White Underbase & simpan PNG ----------
// Layer putih di bawah hasil: bentuknya mengikuti titik raster (transparansi layer hasil),
// dikecilkan "choke" px supaya tepi putih tidak mengintip dari bawah tinta warna.
function buildWhiteUnderbase(doc, ko, chokePx) {
    var wl = null;
    try {
        setComponentChannels(doc);
        doc.activeLayer = ko;
        loadLayerTransparency();
        if (chokePx > 0) doc.selection.contract(new UnitValue(chokePx, "px"));
        wl = doc.artLayers.add();
        wl.name = "White Underbase";
        doc.selection.fill(pvColor([255, 255, 255]));
        doc.selection.deselect();
        wl.move(ko, ElementPlacement.PLACEAFTER);
        return wl;
    } catch (e) {
        logStep("White Underbase gagal: " + e.message);
        try { doc.selection.deselect(); } catch (e1) {}
        if (wl !== null) { try { wl.remove(); } catch (e2) {} }
        return null;
    }
}

function uniquePngFile(dir, base) {
    var f = new File(dir.fsName + "/" + base + ".png");
    var n = 2;
    while (f.exists && n < 200) {
        f = new File(dir.fsName + "/" + base + "_" + n + ".png");
        n++;
    }
    return f;
}

function pngOpts() {
    var o = new PNGSaveOptions();
    o.interlaced = false;
    return o;
}

// Simpan salinan PNG (dokumen hasil tetap terbuka). Dengan underbase: satu PNG warna (tanpa putih)
// dan satu PNG "_WHITE" (hanya putih, latar transparan). Gagal simpan tidak membatalkan hasil.
function exportResultPngs(doc, ko, ub, dirPath, baseName) {
    var res = { files: [], note: "" };
    var dir = new Folder(dirPath);
    if (!dir.exists) { try { dir.create(); } catch (e0) {} }
    if (!dir.exists) {
        dir = Folder.desktop;
        res.note = "Folder simpan tidak bisa dipakai, PNG disimpan di Desktop. ";
    }
    var bgl = null;
    try { bgl = doc.backgroundLayer; } catch (e1) { bgl = null; }
    var vKo = true, vBg = true;
    try { if (ko) vKo = ko.visible; if (bgl) vBg = bgl.visible; } catch (e2) {}
    try {
        if (ub) ub.visible = false;
        var f1 = uniquePngFile(dir, baseName);
        doc.saveAs(f1, pngOpts(), true, Extension.LOWERCASE);
        res.files.push(f1.fsName);
        logStep("PNG warna tersimpan: " + f1.fsName);
        if (ub) {
            if (ko) ko.visible = false;
            if (bgl) bgl.visible = false;
            ub.visible = true;
            var f2 = uniquePngFile(dir, baseName + "_WHITE");
            doc.saveAs(f2, pngOpts(), true, Extension.LOWERCASE);
            res.files.push(f2.fsName);
            logStep("PNG putih tersimpan: " + f2.fsName);
        }
    } catch (e3) {
        res.note += "Gagal menyimpan PNG: " + e3.message;
        logStep("simpan PNG gagal: " + e3.message);
    }
    try {
        if (ko) ko.visible = vKo;
        if (bgl) bgl.visible = vBg;
        if (ub) ub.visible = true;
    } catch (e4) {}
    return res;
}

// ---------- Jendela progres ----------
var PROG = { win: null, bar: null, txt: null, n: 0, total: 0 };
function progOpen(total) {
    PROG.n = 0; PROG.total = total;
    try {
        PROG.win = new Window("palette", "DTF Raster Tools - memproses");
        PROG.win.orientation = "column";
        PROG.win.alignChildren = ["fill", "top"];
        PROG.win.margins = 16;
        PROG.txt = PROG.win.add("statictext", undefined, "Menyiapkan...");
        PROG.txt.preferredSize.width = 340;
        PROG.bar = PROG.win.add("progressbar", undefined, 0, 0, total);
        PROG.bar.preferredSize.width = 340;
        PROG.win.center();
        PROG.win.show();
        PROG.win.update();
    } catch (e) { PROG.win = null; PROG.bar = null; PROG.txt = null; }
}
// Tahap berikutnya dimulai: bar = jumlah tahap yang sudah selesai
function progStage(label) {
    logStep("TAHAP: " + label);
    try {
        if (PROG.txt) PROG.txt.text = (PROG.n + 1) + "/" + PROG.total + "  " + label;
        if (PROG.bar) PROG.bar.value = PROG.n;
        if (PROG.win) PROG.win.update();
    } catch (e) {}
    PROG.n++;
}
function progClose() {
    try { if (PROG.win) { PROG.win.close(); } } catch (e) {}
    PROG.win = null; PROG.bar = null; PROG.txt = null;
}

// Salin log ke Desktop (dipanggil hanya saat error)
function logCopyToDesktop() {
    try {
        var f = new File(LOG_PATH);
        if (f.exists) f.copy(LOG_DESKTOP);
    } catch (e) {}
}

function processQuickBlack(srcDoc, srcLayer, opt) {
    var oldRuler   = app.preferences.rulerUnits;
    var oldDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;
    var prevLogFlag = LOG_ENABLED;
    if (opt.preview) LOG_ENABLED = false;
    logReset();
    logStep("MULAI | white=" + opt.white + " res=" + opt.res + " lpi=" + opt.lpi + " angle=" + opt.angle +
            " shape=" + opt.shape + " tone=" + opt.tone + " resample=" + opt.resample + " bg=" + opt.bg);

    var doc = null;    // dokumen hasil
    var aDoc = null;   // peta alpha (grayscale) yang di-halftone
    var finalName = "";
    var success = false;
    var ubNote = "";
    var savedFiles = [];
    var saveNote = "";
    var progOn = !opt.preview;
    if (progOn) progOpen(7 + (opt.ub ? 1 : 0) + (opt.savePng ? 1 : 0));

    try {
        // --- Alamat layer aktif (boleh di dalam group) ---
        var tpath = findLayerPath(srcDoc, srcLayer.id);
        if (tpath === null) throw new Error("Layer aktif tidak ditemukan di dokumen.");

        // --- Langkah 2: dokumen hasil = duplikat ---
        var ts = new Date().getTime().toString().substr(-6);
        finalName = (opt.white ? "HASIL_QW_" : (opt.colorFabric ? "HASIL_QC_" : "HASIL_QB_")) + String(opt.lpi).replace(".", "_") + "LPI_" + ts;
        if (progOn) progStage("Menyiapkan dokumen");
        doc = srcDoc.duplicate(finalName);
        app.activeDocument = doc;
        logStep("dokumen hasil dibuat: " + finalName);

        ensureRgb8(doc);

        // --- Layer target: jadikan satu layer biasa di level atas, buang layer lain (di salinan) ---
        var tgt0 = layerByPath(doc, tpath);
        if (!opt.preview) tgt0 = prepareTarget(doc, tgt0);   // preview: sudah disiapkan di salinan kecil
        var tgtId = tgt0.id;
        isolateTarget(doc, tgtId);
        logStep("layer target siap (" + tgt0.typename + ")");

        // --- Langkah 1: resolusi ---
        var srcPxW = Math.round(doc.width.value);
        var srcPxH = Math.round(doc.height.value);
        var factor = opt.resample ? (opt.res / doc.resolution) : 1;
        var estMP  = (srcPxW * factor) * (srcPxH * factor) / 1000000;
        logStep("ukuran asli " + srcPxW + "x" + srcPxH + " px @ " + doc.resolution + " ppi -> perkiraan hasil " +
                Math.round(estMP) + " MP");
        if (estMP > 120) {
            if (!confirm("Gambar akan menjadi sekitar " + Math.round(estMP) + " megapixel setelah di-resample ke " +
                         opt.res + " ppi.\n\nProses bisa sangat lama dan Photoshop akan terlihat hang/blank.\n" +
                         "Disarankan matikan 'Resample' atau perkecil ukuran dulu.\n\nTetap lanjutkan?")) {
                throw new Error("DIBATALKAN");
            }
        }
        if (progOn) progStage("Mengatur resolusi");
        setResolution(doc, opt.res, opt.resample);

        var W = Math.round(doc.width.as("px"));
        var H = Math.round(doc.height.as("px"));
        logStep("resolusi selesai: " + W + "x" + H + " px");

        var tgt = findLayerById(doc, tgtId);
        if (tgt === null) throw new Error("Layer target tidak ditemukan di dokumen hasil.");
        try { tgt.allLocked = false; } catch (e1) {}
        try { if (tgt.isBackgroundLayer) tgt.isBackgroundLayer = false; } catch (e1b) {}

        // ====================================================
        // Langkah 3-9: Original Artwork + Quick Black dalam group
        // ====================================================
        if (progOn) progStage("Membuat knockout");
        doc.activeLayer = tgt;
        tgt.name = "Original Artwork";

        // KAIN PUTIH (langkah 1 Action putih): artwork di-invert dulu.
        // Dilakukan di dokumen hasil, jadi dokumen asli tidak perlu di-invert balik.
        if (opt.white) tgt.invert();

        var ko = null;
        if (opt.colorFabric) {
            ko = buildColorKnockout(doc, tgt, opt.fabricRGB);
        } else {
        logStep("artwork siap (invert jika putih), buat Quick Black");
        var qb = tgt.duplicate(tgt, ElementPlacement.PLACEBEFORE);
        qb.name = "Quick Black";
        qb.visible = true;
        tgt.visible = false;

        var grp = doc.layerSets.add();
        grp.name = "Quick Black Knockout";
        grp.move(qb, ElementPlacement.PLACEBEFORE);
        qb.move(grp, ElementPlacement.INSIDE);

        // ====================================================
        // Langkah 11-12: lapisan hitam di bawah Quick Black (di dalam group)
        // ====================================================
        doc.activeLayer = qb;
        setComponentChannels(doc);
        var blk = doc.artLayers.add();
        blk.name = "Black Base";
        doc.selection.selectAll();
        doc.selection.fill(makeGray(0));
        doc.selection.deselect();
        blk.move(qb, ElementPlacement.PLACEAFTER);

        // ====================================================
        // Langkah 13-15: Black & White (100%) di atas Quick Black
        // ====================================================
        doc.activeLayer = qb;
        addBlackWhiteAdjustment();
        var bw = doc.activeLayer;
        logStep("Black & White adjustment dibuat");

        // ====================================================
        // Langkah 16-18: mask group = luminositas hasilnya sendiri
        // ====================================================
        setComponentChannels(doc);
        loadCompositeSelection();
        doc.activeLayer = grp;
        makeMaskFromSelection();
        doc.selection.deselect();

        // ====================================================
        // Langkah 19-24: B&W = Divide, bungkus group, merge
        // ====================================================
        logStep("mask group dibuat");
        doc.activeLayer = bw;
        setBlendDivide();
        logStep("blend Divide diset");

        // Bungkus grp ke dalam group baru (setara Ctrl+G).
        // FIX: sebelumnya grp.move(outer, INSIDE) -> "Illegal Argument"
        doc.activeLayer = grp;
        var dG = new ActionDescriptor();
        var rNew = new ActionReference();
        rNew.putClass(sTID('layerSection'));
        dG.putReference(sTID('null'), rNew);
        var rFrom = new ActionReference();
        rFrom.putEnumerated(sTID('layer'), sTID('ordinal'), sTID('targetEnum'));
        dG.putReference(sTID('from'), rFrom);
        executeAction(sTID('make'), dG, DialogModes.NO);

        var outer = doc.activeLayer;   // group baru yang membungkus grp
        outer.name = "Group 1";

        doc.activeLayer = outer;
        executeAction(sTID('mergeLayersNew'), undefined, DialogModes.NO);

        ko = doc.activeLayer;
        logStep("merge group selesai, tipe=" + ko.typename);
        if (ko.typename !== "ArtLayer") {
            throw new Error("Merge group gagal (hasil bukan layer biasa).");
        }
        ko.name = "Knockout - Quick Black";
        }   // akhir alur kain hitam / putih

        // ====================================================
        // Langkah 25-28: alpha layer -> channel -> dokumen grayscale
        // ====================================================
        if (progOn) progStage("Membuat peta alpha");
        doc.activeLayer = ko;
        loadLayerTransparency();
        logStep("ambil alpha layer ke channel");
        var chA0 = doc.channels.add();
        chA0.name = "__A0";
        doc.selection.store(chA0);
        doc.selection.deselect();
        setComponentChannels(doc);

        // DocumentFill tidak punya BLACK -> buat putih, lalu isi hitam manual
        // Hitam : dasar hitam, alpha diisi putih  -> peta = alpha
        // Putih : dasar putih, alpha diisi hitam  -> peta = 255 - alpha (dibalik)
        var aBase = opt.white ? 255 : 0;
        var aInk  = opt.white ? 0 : 255;
        logStep("buat dokumen peta alpha");
        aDoc = app.documents.add(W, H, opt.res, "TMP_A", NewDocumentMode.GRAYSCALE, DocumentFill.WHITE);
        aDoc.selection.selectAll();
        aDoc.selection.fill(makeGray(aBase));
        aDoc.selection.deselect();

        app.activeDocument = doc;
        chA0.duplicate(aDoc);

        app.activeDocument = aDoc;
        var aAlpha = aDoc.channels[aDoc.channels.length - 1];
        aDoc.selection.load(aAlpha);
        setComponentChannels(aDoc);

        aDoc.artLayers.add();
        aDoc.selection.fill(makeGray(aInk));
        aDoc.selection.deselect();
        try { aAlpha.remove(); } catch (e4) {}
        aDoc.flatten();
        logStep("peta alpha siap");

        // MODE PREVIEW: berhenti di sini, serahkan peta alpha ke pemanggil (pemanggil yang menutupnya)
        if (opt.preview) {
            opt.previewResult = aDoc;
            aDoc = null;
            closeQuiet(doc);
            doc = null;
            return;
        }

        // KURANGI RASTER: atur rentang alpha yang menjadi titik (Levels pada peta).
        //   alpha >= SOLID  -> solid 100%
        //   alpha <= KOSONG -> kosong
        //   di antaranya    -> diregangkan, lalu dibentuk titik; gamma > 1 = lebih rapat
        // Kain putih: peta dibalik (255 - alpha), jadi dibalik dulu ke orientasi alpha lalu dibalik lagi.
        var lvLow  = Math.round(255 * opt.lowPct / 100);
        var lvHigh = Math.round(255 * opt.highPct / 100);
        if (lvLow > 0 || lvHigh < 255 || opt.gamma !== 1) {
            logStep("Levels peta: low=" + lvLow + " high=" + lvHigh + " gamma=" + opt.gamma);
            setComponentChannels(aDoc);
            aDoc.activeLayer = aDoc.layers[0];
            if (opt.white) aDoc.activeLayer.invert();
            aDoc.activeLayer.adjustLevels(lvLow, lvHigh, opt.gamma, 0, 255);
            if (opt.white) aDoc.activeLayer.invert();
            logStep("Levels peta selesai");
        }

        // KAIN PUTIH (langkah 31-33 Action putih): kompensasi tone
        // = seleksi dari luminositas peta itu sendiri, lalu Fill putih X% (Normal)
        if (opt.white && opt.tone !== 0) {
            // Sebelumnya: seleksi dari channel Gray + Fill putih X% -> membuat Photoshop hang.
            // Sekarang: rumus yang sama dihitung lewat Curves (tanpa seleksi, tanpa Fill):
            //   hasil = v + (X/100) * (v/255) * (255 - v)
            // Hitam (0) dan putih (255) tetap; nada tengah diangkat -> titik halftone lebih jarang.
            logStep("kompensasi tone via Curves (" + opt.tone + "%)");
            setComponentChannels(aDoc);
            var toneA = opt.tone / 100;
            var tonePts = [];
            for (var tv = 0; tv <= 255; tv += 17) {          // 16 titik (batas Curves Photoshop)
                var tvy = Math.round(tv + toneA * (tv / 255) * (255 - tv));
                if (tvy > 255) tvy = 255;
                tonePts.push([tv, tvy]);
            }
            aDoc.activeLayer = aDoc.layers[0];
            aDoc.activeLayer.adjustCurves(tonePts);
            logStep("kompensasi tone selesai");
        }

        // ====================================================
        // Langkah 29: HALFTONE (LPI / angle / bentuk dari panel)
        // ====================================================
        if (progOn) progStage("Halftone (convert ke Bitmap)");
        logStep("kompensasi tone selesai / dilewati, siapkan halftone");
        var bmpOpt = new BitmapConversionOptions();
        bmpOpt.resolution = opt.res;
        bmpOpt.method     = BitmapConversionType.HALFTONESCREEN;
        bmpOpt.frequency  = opt.lpi;
        bmpOpt.angle      = opt.angle;
        switch (opt.shape) {
            case 0:  bmpOpt.shape = BitmapHalfToneType.ROUND;   break;
            case 1:  bmpOpt.shape = BitmapHalfToneType.ELLIPSE; break;
            case 2:  bmpOpt.shape = BitmapHalfToneType.DIAMOND; break;
            case 3:  bmpOpt.shape = BitmapHalfToneType.LINE;    break;
            case 4:  bmpOpt.shape = BitmapHalfToneType.SQUARE;  break;
            case 5:  bmpOpt.shape = BitmapHalfToneType.CROSS;   break;
            default: bmpOpt.shape = BitmapHalfToneType.ELLIPSE;
        }

        logStep("HALFTONE mulai (convert ke Bitmap)");
        aDoc.changeMode(ChangeMode.BITMAP, bmpOpt);
        logStep("halftone Bitmap selesai");
        aDoc.changeMode(ChangeMode.GRAYSCALE);
        logStep("kembali ke Grayscale");

        // ====================================================
        // Langkah 30-34: copy halftone -> channel "__A1" di dokumen hasil
        // ====================================================
        aDoc.selection.selectAll();
        aDoc.selection.copy();
        aDoc.selection.deselect();

        app.activeDocument = doc;
        var chA1 = doc.channels.add();
        chA1.name = "__A1";
        doc.activeChannels = [chA1];
        logStep("paste halftone ke channel __A1");
        doc.paste();
        logStep("paste selesai");
        doc.selection.deselect();

        // KAIN PUTIH (langkah 42 Action putih): channel halftone di-invert
        if (opt.white) {
            doc.activeChannels = [chA1];
            executeAction(cTID('Invr'), undefined, DialogModes.NO);
            logStep("channel halftone di-invert (putih)");
        }
        setComponentChannels(doc);

        // ====================================================
        // Langkah 36-49: pasang halftone sebagai mask lalu apply
        // ====================================================
        if (progOn) progStage("Memasang halftone sebagai mask");
        doc.activeLayer = ko;

        // Transparansi lama dipindah ke mask, mask dibuang tanpa apply
        // -> piksel layer jadi opaque, supaya titik halftone benar-benar solid
        logStep("mulai buang transparansi lama");
        makeMaskFromTransparency();
        selectLayerMaskChannel();
        deleteTargetChannel(false);

        // KAIN PUTIH (langkah 46 Action putih): warna layer di-invert lagi -> warna asli kembali
        if (opt.white) {
            setComponentChannels(doc);
            doc.activeLayer = ko;
            ko.invert();
            logStep("warna layer di-invert lagi (putih)");
        }

        // Halftone jadi mask, lalu di-apply
        logStep("pasang halftone sebagai mask");
        doc.selection.load(getChannelByName(doc, "__A1"));
        makeMaskFromSelection();
        selectLayerMaskChannel();
        deleteTargetChannel(true);
        logStep("mask halftone di-apply");
        doc.selection.deselect();

        // --- Bersihkan channel bantu ---
        removeChannelByName(doc, "__A0");
        removeChannelByName(doc, "__A1");
        setComponentChannels(doc);

        // ====================================================
        // Langkah 46-47, 54: buang Original Artwork, namai hasil
        // ====================================================
        if (progOn) progStage("Merapikan hasil");
        var orig = findLayerByName(doc, "Original Artwork");
        if (orig !== null) { try { orig.remove(); } catch (e5) {} }

        ko = findLayerByName(doc, "Knockout - Quick Black");
        if (ko !== null) ko.name = "Layer 0";

        // White Underbase (opsional): di atas Background, di bawah hasil
        var ubLayer = null;
        if (opt.ub && ko !== null) {
            if (progOn) progStage("Membuat White Underbase");
            ubLayer = buildWhiteUnderbase(doc, ko, opt.ubChoke);
            if (ubLayer === null) ubNote = "White Underbase tidak dibuat (hasil kosong atau choke terlalu besar).";
        }

        // ====================================================
        // Langkah 43-45: Background (hitam / putih sesuai jenis kain)
        // ====================================================
        logStep("bersih-bersih selesai, tambah background");
        if (opt.bg) {
            if (ko !== null) doc.activeLayer = ko;
            setComponentChannels(doc);
            var bg = doc.artLayers.add();
            bg.name = "Background";
            doc.selection.selectAll();
            doc.selection.fill(opt.colorFabric ? pvColor(opt.fabricRGB) : makeGray(opt.white ? 255 : 0));
            doc.selection.deselect();
            bg.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER);
            try { bg.isBackgroundLayer = true; } catch (e6) {}
        }

        if (ko !== null) doc.activeLayer = ko;

        // Simpan PNG otomatis (opsional)
        if (opt.savePng) {
            if (progOn) progStage("Menyimpan PNG");
            var sv = exportResultPngs(doc, ko, ubLayer, (opt.pngDir ? opt.pngDir : defaultPngDir(srcDoc)), finalName);
            savedFiles = sv.files;
            saveNote = sv.note;
        }
        logStep("SELESAI");
        success = true;

    } catch (e) {
        logStep("ERROR: " + e.message + " | line " + e.line);
        if (!opt.preview && e.message !== "DIBATALKAN") logCopyToDesktop();
        if (opt.preview) {
            opt.previewError = e.message;
        } else if (e.message !== "DIBATALKAN") {
            alert("Error tidak terduga:\n" + e.message + "\nLine: " + e.line +
                  "\n\nLog langkah ada di Desktop: AutoRaster_log.txt");
        }
        closeQuiet(doc);
        doc = null;
    } finally {
        progClose();
        closeQuiet(aDoc);
        LOG_ENABLED = prevLogFlag;
        try { app.preferences.rulerUnits = oldRuler; } catch (e7) {}
        try { app.displayDialogs = oldDialogs; } catch (e8) {}
        if (doc !== null) {
            try { app.activeDocument = doc; } catch (e9) {}
        }
    }

    if (success) {
        var msg = "PROSES SELESAI!\n\n";
        msg += "- Jenis kain: " + (opt.white ? "PUTIH (Midtone Brightness " + opt.tone + "%)" : (opt.colorFabric ? "WARNA (#" + rgbToHex(opt.fabricRGB) + ")" : "HITAM")) + "\n";
        msg += "- Halftone: Frequency " + opt.lpi + " lpi, Angle " + opt.angle + "\u00B0, Shape " +
               ["Round", "Ellipse", "Diamond", "Line", "Square", "Cross"][opt.shape] + "\n";
        msg += "- Resolution: " + opt.res + " ppi\n";
        msg += "- Background " + (opt.white ? "putih" : (opt.colorFabric ? "warna kain" : "hitam")) + ": " + (opt.bg ? "ya" : "tidak (transparan)") + "\n";
        msg += "- Dokumen hasil: '" + finalName + "'";
        if (opt.ub) msg += "\n- White Underbase: " + (ubNote !== "" ? ubNote : "layer 'White Underbase', choke " + opt.ubChoke + " px");
        if (savedFiles.length > 0) msg += "\n- PNG tersimpan:\n    " + savedFiles.join("\n    ");
        if (saveNote !== "") msg += "\n- " + saveNote;
        alert(msg);
    }
}

main();