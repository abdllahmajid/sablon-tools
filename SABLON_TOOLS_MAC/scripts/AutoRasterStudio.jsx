#target photoshop

// ============================================
// SABLON CONTROL V10 - Halftone Raster Plugin
// ============================================
// Perbaikan dari V9:
// 1. Auto-detect angle lebih akurat (exact match)
// 2. Channel dicari by NAME, bukan by index (mencegah index drift)
// 3. tempDoc dideklarasikan di luar try/catch
// 4. Validasi NaN per-channel untuk LPI & Angle
// 5. flatten() dipindah ke LUAR loop (tidak lagi merusak proses)
// 6. Validasi range LPI (10-200) & Angle (0-360)
// 7. Default shape disesuaikan per channel CMYK
//
// Perbaikan V10.1:
// 8. Mode dokumen TIDAK lagi dipaksa jadi Multichannel. Sebelumnya channel
//    R/G/B ikut berubah menjadi Cyan/Magenta/Yellow di dokumen hasil.
//    Sekarang channel asli (RGB/CMYK) tetap utuh, hanya channel yang
//    dicentang yang diganti hasil raster.
// 9. Channel R/G/B bawaan di dokumen RGB tidak dicentang secara default.
//
// Perbaikan V10.2 (kenyamanan pemakaian):
// 10. Tombol "Pilih Semua" dan "Hapus Semua" channel.
// 11. "Pengaturan Cepat": isi LPI / sudut / bentuk sekali, lalu terapkan ke
//     semua channel yang dicentang. Kolom yang dikosongkan tidak mengubah apa-apa.
// 12. Progress bar saat proses berjalan (channel ke-berapa dari berapa).
// 13. Channel kosong (tidak ada tinta sama sekali) dilewati otomatis, dan
//     channel aslinya dibiarkan apa adanya.
// 14. Nama dokumen hasil memuat resolusi dan LPI, mis. HASIL_RASTER_300ppi_45LPI_123456.
// 15. Sudut ROSETTE otomatis. Saat dialog dibuka, sudut tiap channel langsung
//     terisi menurut terang/gelapnya warna channel (terang 22.5, tengah 52.5,
//     gelap 82.5), tanpa perlu memilih preset. Tombol "Sudut Otomatis (Rosette)"
//     mengisi ulang sudut channel yang dicentang. Sudut tetap bisa diubah manual.
// ============================================

// =========================================================================
// >>>>>               SUDUT OTOMATIS (ROSETTE)                       <<<<<
// =========================================================================
// Rosette: sudut ditentukan oleh TERANG/GELAPNYA warna channel (nilai L, 0-100):
//   terang  (highlight) -> ROSETTE_ANGLES.light
//   tengah  (midtone)   -> ROSETTE_ANGLES.mid
//   gelap   (shadow)    -> ROSETTE_ANGLES.dark
// Batas terang/gelap: L >= ROSETTE_LIGHT_MIN dianggap terang, L < ROSETTE_DARK_MAX
// dianggap gelap, di antaranya tengah. Ubah angka ini kalau pembagiannya kurang pas.
var ROSETTE_LIGHT_MIN = 66;
var ROSETTE_DARK_MAX  = 33;
var ROSETTE_ANGLES = { light: 22.5, mid: 52.5, dark: 82.5 };
// =========================================================================

// Kelas terang/gelap dari nilai L (0-100). null kalau tidak diketahui.
function lightnessClass(l) {
    if (l === null || isNaN(l)) return null;
    if (l >= ROSETTE_LIGHT_MIN) return "light";
    if (l < ROSETTE_DARK_MAX) return "dark";
    return "mid";
}

var LIGHTNESS_LABEL = { light: "terang", mid: "tengah", dark: "gelap" };

// Perkiraan terang/gelap dari NAMA channel (dipakai untuk channel bawaan CMYK/RGB,
// yang tidak punya warna sendiri, atau kalau warna channel tidak terbaca).
function lightnessFromName(lower) {
    if (lower === "yellow" || lower === "y" || lower === "kuning") return 90;
    if (lower === "cyan" || lower === "c") return 55;
    if (lower === "magenta" || lower === "m") return 48;
    if (lower === "black" || lower === "k" || lower === "hitam") return 10;
    if (lower === "red") return 53;
    if (lower === "green") return 88;
    if (lower === "blue") return 32;
    if (lower.indexOf("white") > -1 || lower.indexOf("putih") > -1) return 100;
    return null;
}

// Cari nilai L sebuah channel: spot/alpha pakai warna channel, channel bawaan pakai nama.
// Mengembalikan { l: angka atau null, src: "warna" / "nama" / "" }.
function getChannelLightness(ch, lower) {
    var isComponent = false;
    try { isComponent = (ch.kind === ChannelType.COMPONENT); } catch (e0) {}

    if (!isComponent) {
        try {
            var lv = ch.color.lab.l;
            if (typeof lv === "number" && !isNaN(lv)) return { l: lv, src: "warna" };
        } catch (e1) {}
    }
    var ln = lightnessFromName(lower);
    if (ln !== null) return { l: ln, src: "nama" };
    return { l: null, src: "" };
}

// Sudut Rosette otomatis untuk satu channel.
//  - Channel yang warnanya terbaca dari channel itu sendiri (spot / alpha):
//    sudut menurut terang/gelap warnanya (ROSETTE_ANGLES).
//  - Channel tanpa warna sendiri (channel bawaan CMYK/RGB) atau warna tidak terbaca:
//    memakai sudut bawaan (CMYK standar: Cyan 15, Magenta 75, Yellow 0, Black 45).
function rosetteAngle(lightInfo, defAngle) {
    if (lightInfo && lightInfo.src === "warna") {
        var cls = lightnessClass(lightInfo.l);
        if (cls !== null) return ROSETTE_ANGLES[cls];
    }
    return parseFloat(defAngle);
}

function main() {
    if (app.documents.length === 0) {
        alert("Mohon buka file desain Anda terlebih dahulu!");
        return;
    }

    var srcDoc = app.activeDocument;
    var channels = srcDoc.channels;
    var channelCount = channels.length;

    if (channelCount === 0) {
        alert("Tidak ada channel yang ditemukan!");
        return;
    }

    // ==================== LOGIKA LAYOUT ====================
    var isSplitMode = (channelCount > 10);

    // Lebar kolom tabel channel (dipakai bersama oleh judul kolom dan tiap baris,
    // supaya semuanya lurus).
    var colW = { check: 28, name: 170, lpi: 54, ang: 54, shape: 96, level: 62 };

    // Teks keterangan berwarna abu-abu
    function muted(st) {
        try { st.graphics.foregroundColor = st.graphics.newPen(st.graphics.PenType.SOLID_COLOR, [0.45, 0.45, 0.45], 1); } catch (eM) {}
        return st;
    }
    // Garis pemisah tipis selebar induknya
    function addRule(parentObj, h) {
        var r = parentObj.add("panel");
        r.alignment = ["fill", "top"];
        r.preferredSize.height = h || 1;
        return r;
    }

    var win = new Window("dialog", "Raster Control V10 - Langitan.co");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 12;
    win.margins = 18;

    // === HEADER ===
    var headerGrp = win.add("group");
    headerGrp.orientation = "column";
    headerGrp.alignChildren = ["center", "center"];
    headerGrp.alignment = ["fill", "top"];
    headerGrp.spacing = 2;

    var title = headerGrp.add("statictext", undefined, "RASTER PANEL");
    title.graphics.font = ScriptUI.newFont("Arial", "BOLD", 16);
    muted(headerGrp.add("statictext", undefined, "Professional Halftone Raster System in Langitan.co"));

    addRule(win, 2);

    // === OUTPUT ===
    var pnlOutput = win.add("panel", undefined, "Output");
    pnlOutput.orientation = "row";
    pnlOutput.alignChildren = ["left", "center"];
    pnlOutput.margins = [14, 18, 14, 12];
    pnlOutput.spacing = 8;

    pnlOutput.add("statictext", undefined, "Resolusi Output");
    var inpRes = pnlOutput.add("edittext", undefined, "300");
    inpRes.preferredSize.width = 60;
    inpRes.justify = "center";
    muted(pnlOutput.add("statictext", undefined, "ppi (pixels per inch)"));

    // ============================================
    // PENGATURAN CEPAT (pilih semua / terapkan ke semua)
    // ============================================
    var pnlQuick = win.add("panel", undefined, "Pengaturan Cepat");
    pnlQuick.orientation = "column";
    pnlQuick.alignChildren = ["left", "top"];
    pnlQuick.margins = [14, 18, 14, 12];
    pnlQuick.spacing = 10;

    var LBL_W = 70; // lebar label di sebelah kiri tiap baris, supaya rata

    var rowSel = pnlQuick.add("group");
    rowSel.orientation = "row";
    rowSel.alignChildren = ["left", "center"];
    rowSel.spacing = 8;
    var lblSel = rowSel.add("statictext", undefined, "Pilihan");
    lblSel.preferredSize.width = LBL_W;
    var btnAll  = rowSel.add("button", undefined, "Pilih Semua");
    btnAll.preferredSize = [110, 26];
    var btnNone = rowSel.add("button", undefined, "Hapus Semua");
    btnNone.preferredSize = [110, 26];
    var btnAuto = rowSel.add("button", undefined, "Sudut Otomatis (Rosette)");
    btnAuto.preferredSize = [180, 26];

    var rowApply = pnlQuick.add("group");
    rowApply.orientation = "row";
    rowApply.alignChildren = ["left", "center"];
    rowApply.spacing = 8;
    var lblApply = rowApply.add("statictext", undefined, "Terapkan");
    lblApply.preferredSize.width = LBL_W;
    rowApply.add("statictext", undefined, "LPI");
    var qLPI = rowApply.add("edittext", undefined, "");
    qLPI.preferredSize.width = 60;
    qLPI.justify = "center";
    rowApply.add("statictext", undefined, "Sudut");
    var qAng = rowApply.add("edittext", undefined, "");
    qAng.preferredSize.width = 60;
    qAng.justify = "center";
    rowApply.add("statictext", undefined, "Bentuk");
    var qShp = rowApply.add("dropdownlist", undefined, ["(tidak diubah)", "Round", "Ellipse", "Diamond", "Line"]);
    qShp.selection = 0;
    qShp.preferredSize.width = 110;
    var btnApply = rowApply.add("button", undefined, "Terapkan ke yang dicentang");
    btnApply.preferredSize = [190, 26];

    var rowHint = pnlQuick.add("group");
    rowHint.orientation = "row";
    rowHint.alignChildren = ["left", "center"];
    rowHint.spacing = 8;
    var lblHint = rowHint.add("statictext", undefined, "");
    lblHint.preferredSize.width = LBL_W;
    muted(rowHint.add("statictext", undefined, "Sudut sudah terisi otomatis (Rosette). Kolom yang dikosongkan tidak mengubah apa-apa."));

    // ============================================
    // DAFTAR CHANNEL
    // ============================================
    var mainContainer = win.add("panel", undefined, "Channel (" + channelCount + ")");
    mainContainer.orientation = isSplitMode ? "row" : "column";
    mainContainer.alignChildren = ["left", "top"];
    mainContainer.margins = [14, 18, 14, 12];
    mainContainer.spacing = 18;

    var colGroup1, colGroup2;

    colGroup1 = mainContainer.add("group");
    colGroup1.orientation = "column";
    colGroup1.alignChildren = ["fill", "top"];
    colGroup1.spacing = 4;

    if (isSplitMode) {
        var vSep = mainContainer.add("panel", undefined, undefined);
        vSep.preferredSize.width = 2;
        vSep.alignment = ["left", "fill"];

        colGroup2 = mainContainer.add("group");
        colGroup2.orientation = "column";
        colGroup2.alignChildren = ["fill", "top"];
        colGroup2.spacing = 4;
    }

    // --- HELPER HEADER ---
    function createHeader(parentObj) {
        var hGrp = parentObj.add("group");
        hGrp.orientation = "row";
        hGrp.alignChildren = ["left", "center"];
        hGrp.spacing = 6;

        function addH(txt, w, center) {
            var t = hGrp.add("statictext", undefined, txt);
            t.preferredSize.width = w;
            if (center) t.justify = "center";
            t.graphics.font = ScriptUI.newFont("Arial", "BOLD", 11);
        }
        addH("", colW.check);
        addH("Channel", colW.name);
        addH("Warna", colW.level, true);
        addH("LPI", colW.lpi, true);
        addH("Sudut", colW.ang, true);
        addH("Bentuk", colW.shape);

        addRule(parentObj, 2);
    }

    createHeader(colGroup1);
    if (isSplitMode) createHeader(colGroup2);

    var inputs = [];
    var halfPoint = Math.ceil(channelCount / 2);

    // === LOOP CHANNEL ITEMS ===
    for (var i = 0; i < channelCount; i++) {
        var chName = channels[i].name;
        var lower = chName.toLowerCase().replace(/\s+/g, ""); // strip spasi

        // ===================================================
        // FIX #1: Auto-detect angle EXACT MATCH
        // Tidak lagi salah untuk channel "Coklat", "Merah", dll.
        // Cek full word dulu, baru cek single letter exact
        // ===================================================
        var defAngle = "45";
        var defLPI   = "45";
        var defShape = 1; // Default: Ellipse

        if (lower === "cyan"    || lower === "c") { defAngle = "15"; defShape = 0; } // Round
        else if (lower === "magenta" || lower === "m") { defAngle = "75"; defShape = 0; } // Round
        else if (lower === "yellow"  || lower === "y") { defAngle = "0";  defShape = 0; } // Round
        else if (lower === "black"   || lower === "k" || lower === "hitam") { defAngle = "45"; defShape = 2; } // Diamond
        // Channel warna spot khusus sablon
        else if (lower.indexOf("white") > -1 || lower.indexOf("putih") > -1) { defAngle = "45"; defShape = 0; }
        // Semua channel lain tetap default Ellipse angle 45

        var targetGroup = (isSplitMode && i >= halfPoint) ? colGroup2 : colGroup1;

        var row = targetGroup.add("group");
        row.orientation = "row";
        row.alignChildren = ["left", "center"];
        row.spacing = 6;

        var chkActive = row.add("checkbox", undefined, "");
        chkActive.preferredSize.width = colW.check;
        chkActive.value = true;

        // Channel komposit R/G/B bawaan dokumen RGB tidak ikut di-raster secara default
        try {
            if (srcDoc.mode === DocumentMode.RGB && channels[i].kind === ChannelType.COMPONENT) {
                chkActive.value = false;
            }
        } catch (eKind) {}

        // Terang/gelap warna channel (untuk sudut Rosette)
        var lightInfo = getChannelLightness(channels[i], lower);

        var displayName = (chName.length > 18) ? chName.substring(0, 16) + "..." : chName;
        var txtName = row.add("statictext", undefined, displayName);
        txtName.preferredSize.width = colW.name;
        var tipCls = lightnessClass(lightInfo.l);
        txtName.helpTip = chName + (tipCls
            ? "  |  " + LIGHTNESS_LABEL[tipCls] + " (L=" + Math.round(lightInfo.l) + ", dari " + lightInfo.src + ")  ->  sudut " + rosetteAngle(lightInfo, defAngle)
            : "  |  terang/gelap tidak terbaca");

        // Kolom "Warna": terang / tengah / gelap menurut warna channel (dasar sudut Rosette).
        // "bawaan" = warna channel tidak terbaca, dipakai sudut bawaan.
        var lvl = row.add("statictext", undefined, (tipCls && lightInfo.src === "warna") ? LIGHTNESS_LABEL[tipCls] : "bawaan");
        lvl.preferredSize.width = colW.level;
        lvl.justify = "center";
        muted(lvl);

        var txtLPI = row.add("edittext", undefined, defLPI);
        txtLPI.preferredSize.width = colW.lpi;
        txtLPI.justify = "center";

        var txtAng = row.add("edittext", undefined, String(rosetteAngle(lightInfo, defAngle)));
        txtAng.preferredSize.width = colW.ang;
        txtAng.justify = "center";

        var drpShp = row.add("dropdownlist", undefined, ["Round", "Ellipse", "Diamond", "Line"]);
        drpShp.selection = defShape;
        drpShp.preferredSize.width = colW.shape;

        inputs.push({
            index: i,
            originalName: chName,  // Simpan nama asli untuk lookup by name
            lightness: lightInfo.l,
            lightSrc: lightInfo.src,
            defAngle: defAngle,
            chk: chkActive,
            lpi: txtLPI,
            ang: txtAng,
            shp: drpShp
        });

        addRule(targetGroup, 1);
    }

    // === FOOTER & ACTION ===
    var footerGrp = win.add("group");
    footerGrp.orientation = "row";
    footerGrp.alignChildren = ["left", "center"];
    footerGrp.alignment = ["fill", "top"];
    footerGrp.margins = [0, 6, 0, 0];

    var infoGrp = footerGrp.add("group");
    infoGrp.orientation = "column";
    infoGrp.alignChildren = ["left", "center"];
    infoGrp.alignment = ["fill", "center"];
    infoGrp.spacing = 2;
    muted(infoGrp.add("statictext", undefined, "- Centang channel yang akan di-raster"));
    if (srcDoc.mode === DocumentMode.RGB) {
        muted(infoGrp.add("statictext", undefined, "- Channel RGB asli tetap utuh di dokumen hasil"));
    }

    var btnGrp = footerGrp.add("group");
    btnGrp.alignment = ["right", "center"];
    btnGrp.orientation = "row";
    btnGrp.spacing = 10;

    var btnCancel = btnGrp.add("button", undefined, "Cancel", { name: "cancel" });
    btnCancel.preferredSize = [100, 36];

    var btnRun = btnGrp.add("button", undefined, "PROCESS", { name: "ok" });
    btnRun.preferredSize = [190, 36];

    // CUSTOM BLUE BUTTON
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

    // --- Pilih semua / hapus semua ---
    btnAll.onClick = function () {
        for (var a = 0; a < inputs.length; a++) inputs[a].chk.value = true;
    };
    btnNone.onClick = function () {
        for (var n = 0; n < inputs.length; n++) inputs[n].chk.value = false;
    };

    // --- Sudut otomatis (Rosette): isi ulang sudut channel yang dicentang ---
    btnAuto.onClick = function () {
        var lines = [];
        for (var r = 0; r < inputs.length; r++) {
            var it = inputs[r];
            if (!it.chk.value) continue;
            var ang = rosetteAngle({ l: it.lightness, src: it.lightSrc }, it.defAngle);
            it.ang.text = String(ang);
            var cls = (it.lightSrc === "warna") ? lightnessClass(it.lightness) : null;
            lines.push(it.originalName + " -> " + ang + (cls ? "  (" + LIGHTNESS_LABEL[cls] + ")" : "  (bawaan)"));
        }
        if (lines.length === 0) {
            alert("Belum ada channel yang dicentang.");
            return;
        }
        alert("Sudut Rosette diterapkan:\n\n" + lines.join("\n") + "\n\nSudut masih bisa diubah manual per channel.");
    };

    // --- Terapkan LPI / sudut / bentuk ke semua channel yang dicentang ---
    btnApply.onClick = function () {
        var txtL = qLPI.text.replace(/^\s+|\s+$/g, "");
        var txtA = qAng.text.replace(/^\s+|\s+$/g, "");
        var shpIdx = qShp.selection ? qShp.selection.index : 0;

        if (txtL === "" && txtA === "" && shpIdx === 0) {
            alert("Isi dulu LPI, sudut, atau bentuk yang ingin diterapkan.");
            return;
        }
        if (txtL !== "") {
            var l = parseFloat(txtL);
            if (isNaN(l) || l < 10 || l > 200) { alert("LPI harus angka 10-200."); return; }
        }
        if (txtA !== "") {
            var an = parseFloat(txtA);
            if (isNaN(an) || an < 0 || an > 360) { alert("Sudut harus angka 0-360."); return; }
        }

        var changed = 0;
        for (var q = 0; q < inputs.length; q++) {
            if (!inputs[q].chk.value) continue;
            if (txtL !== "") inputs[q].lpi.text = txtL;
            if (txtA !== "") inputs[q].ang.text = txtA;
            if (shpIdx > 0) inputs[q].shp.selection = shpIdx - 1;
            changed++;
        }
        if (changed === 0) alert("Belum ada channel yang dicentang.");
    };

    btnRun.onClick = function () {
        var res = parseFloat(inpRes.text);
        if (isNaN(res) || res <= 0) {
            alert("Resolusi tidak valid! Masukkan angka positif.");
            return;
        }

        // ===================================================
        // FIX #4: Validasi LPI & Angle semua channel sebelum proses
        // ===================================================
        var validationErrors = [];
        for (var v = 0; v < inputs.length; v++) {
            var item = inputs[v];
            if (!item.chk.value) continue;

            var lpiVal = parseFloat(item.lpi.text);
            var angVal = parseFloat(item.ang.text);

            if (isNaN(lpiVal) || lpiVal < 10 || lpiVal > 200) {
                validationErrors.push("Channel '" + item.originalName + "': LPI harus angka 10-200 (nilai: '" + item.lpi.text + "')");
            }
            if (isNaN(angVal) || angVal < 0 || angVal > 360) {
                validationErrors.push("Channel '" + item.originalName + "': Angle harus angka 0-360 (nilai: '" + item.ang.text + "')");
            }
        }

        var anyChecked = false;
        for (var c = 0; c < inputs.length; c++) { if (inputs[c].chk.value) { anyChecked = true; break; } }
        if (!anyChecked) {
            alert("Belum ada channel yang dicentang.");
            return;
        }

        if (validationErrors.length > 0) {
            alert("Input tidak valid:\n\n" + validationErrors.join("\n"));
            return;
        }

        win.close(1);
        processHalftone(srcDoc, inputs, res);
    };

    win.center();
    win.show();
}

// ============================================
// HELPER: Cari channel berdasarkan NAMA
// ============================================
// FIX #2: Mencegah index drift jika urutan channel berubah
function getChannelByName(doc, name) {
    for (var i = 0; i < doc.channels.length; i++) {
        if (doc.channels[i].name === name) return doc.channels[i];
    }
    return null;
}

// ============================================
// FUNGSI PROSES UTAMA
// ============================================
function processHalftone(srcDoc, data, resolution) {
    var finalDoc = null;

    try {
        var timestamp   = new Date().getTime().toString().substr(-6);

        // Nama dokumen hasil memuat resolusi dan LPI (kalau LPI tiap channel sama).
        var lpiList = [];
        for (var n0 = 0; n0 < data.length; n0++) {
            if (data[n0].chk.value) lpiList.push(parseFloat(data[n0].lpi.text));
        }
        var sameLpi = true;
        for (var n1 = 1; n1 < lpiList.length; n1++) {
            if (lpiList[n1] !== lpiList[0]) { sameLpi = false; break; }
        }
        var lpiTag = (lpiList.length > 0 && sameLpi) ? (lpiList[0] + "LPI") : "LPIcampur";
        var finalDocName = "HASIL_RASTER_" + resolution + "ppi_" + lpiTag + "_" + timestamp;

        finalDoc = srcDoc.duplicate(finalDocName);
        app.activeDocument = finalDoc;

        // PERBAIKAN V10.1: mode dokumen dibiarkan seperti aslinya (RGB / CMYK / dll).
        // Dulu di sini dokumen dipaksa jadi Multichannel, dan Photoshop otomatis
        // mengganti channel R/G/B menjadi Cyan/Magenta/Yellow.

        try {
            finalDoc.resizeImage(undefined, undefined, resolution, ResampleMethod.NONE);
        } catch (e) {
            // Resize gagal tidak fatal, lanjut proses
        }

        var blackColor     = new SolidColor();
        blackColor.gray.gray = 100;

        var processedCount = 0;
        var skippedCount   = 0;
        var failedChannels = [];
        var emptyChannels  = [];

        // Progress bar (opsional: kalau gagal dibuat, proses tetap jalan tanpa progress)
        var totalActive = 0;
        for (var t0 = 0; t0 < data.length; t0++) { if (data[t0].chk.value) totalActive++; }
        var progWin = null, progBar = null, progTxt = null, doneCount = 0;
        try {
            progWin = new Window("palette", "Memproses raster...");
            progWin.orientation = "column";
            progWin.alignChildren = ["fill", "top"];
            progWin.margins = 16;
            progTxt = progWin.add("statictext", undefined, "Menyiapkan...");
            progTxt.preferredSize.width = 320;
            progBar = progWin.add("progressbar", undefined, 0, 0, totalActive);
            progBar.preferredSize.width = 320;
            progWin.center();
            progWin.show();
        } catch (eProg) { progWin = null; progBar = null; progTxt = null; }

        var updateProgress = function (label) {
            try {
                if (progTxt) progTxt.text = label;
                if (progBar) progBar.value = doneCount;
                if (progWin) progWin.update();
            } catch (eUp) {}
        };

        // ===================================================
        // FIX #3: tempDoc dideklarasikan di luar try/catch
        // ===================================================
        for (var i = 0; i < data.length; i++) {
            var item    = data[i];
            var tempDoc = null; // <-- FIX: deklarasi di luar try

            if (!item.chk.value) {
                skippedCount++;
                continue;
            }

            updateProgress("Channel " + (doneCount + 1) + " dari " + totalActive + ": " + item.originalName);

            try {
                // Buat dokumen grayscale sementara
                tempDoc = app.documents.add(
                    srcDoc.width,
                    srcDoc.height,
                    srcDoc.resolution,
                    "Temp_" + item.originalName,
                    NewDocumentMode.GRAYSCALE,
                    DocumentFill.WHITE
                );

                // FIX #2: Ambil channel dari srcDoc by NAME, bukan by index
                app.activeDocument = srcDoc;
                var srcChannel = getChannelByName(srcDoc, item.originalName);
                if (!srcChannel) {
                    throw new Error("Channel '" + item.originalName + "' tidak ditemukan di dokumen sumber.");
                }
                srcChannel.duplicate(tempDoc);

                app.activeDocument = tempDoc;

                // Channel yang baru di-duplicate ada di posisi terakhir
                var sourceAlpha = tempDoc.channels[tempDoc.channels.length - 1];
                tempDoc.selection.load(sourceAlpha);

                var inkLayer  = tempDoc.artLayers.add();
                inkLayer.name = "Ink_" + item.originalName;
                tempDoc.selection.fill(blackColor);
                tempDoc.selection.deselect();

                try { sourceAlpha.remove(); } catch (e) {}

                // Channel kosong (tidak ada tinta sama sekali): lewati, channel asli dibiarkan.
                // Kalau histogram tidak bisa dibaca, anggap channel ada isinya dan lanjut seperti biasa.
                var isEmpty = false;
                try {
                    var hist = tempDoc.histogram;
                    var inked = 0;
                    for (var hb = 0; hb < 255; hb++) inked += hist[hb];
                    isEmpty = (inked === 0);
                } catch (eHist) { isEmpty = false; }

                if (isEmpty) {
                    emptyChannels.push(item.originalName);
                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                    tempDoc = null;
                    doneCount++;
                    continue;
                }

                // Convert ke Bitmap (Halftone)
                var bmpOpt        = new BitmapConversionOptions();
                bmpOpt.resolution = resolution;
                bmpOpt.method     = BitmapConversionType.HALFTONESCREEN;
                bmpOpt.frequency  = parseFloat(item.lpi.text);
                bmpOpt.angle      = parseFloat(item.ang.text);

                switch (item.shp.selection.index) {
                    case 0:  bmpOpt.shape = BitmapHalfToneType.ROUND;    break;
                    case 1:  bmpOpt.shape = BitmapHalfToneType.ELLIPSE;  break;
                    case 2:  bmpOpt.shape = BitmapHalfToneType.DIAMOND;  break;
                    case 3:  bmpOpt.shape = BitmapHalfToneType.LINE;     break;
                    default: bmpOpt.shape = BitmapHalfToneType.ELLIPSE;
                }

                tempDoc.changeMode(ChangeMode.BITMAP, bmpOpt);
                tempDoc.changeMode(ChangeMode.GRAYSCALE);

                tempDoc.selection.selectAll();
                tempDoc.selection.copy();
                tempDoc.selection.deselect();

                // Paste ke finalDoc channel yang sesuai (by name)
                app.activeDocument = finalDoc;
                var destChannel = getChannelByName(finalDoc, item.originalName);
                if (!destChannel) {
                    throw new Error("Channel '" + item.originalName + "' tidak ditemukan di dokumen hasil.");
                }
                finalDoc.activeChannels = [destChannel];
                finalDoc.paste();

                // FIX #5: JANGAN flatten di dalam loop!
                // Merging layer dilakukan setelah paste agar tidak merusak channel berikutnya.
                // Cukup deselect saja di sini.
                try { finalDoc.selection.deselect(); } catch(e) {}

                tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                tempDoc = null;

                processedCount++;
                doneCount++;

            } catch (e) {
                doneCount++;
                failedChannels.push(item.originalName + " (" + e.message + ")");

                // FIX #3: tempDoc pasti bisa dicek karena deklarasi di luar try
                if (tempDoc !== null) {
                    try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
                    tempDoc = null;
                }
            }
        } // end loop

        updateProgress("Selesai");
        try { if (progWin) progWin.close(); } catch (eClose) {}

        // ===================================================
        // FIX #5: flatten() dipanggil SEKALI di luar loop
        // ===================================================
        app.activeDocument = finalDoc;
        try {
            // Hanya relevan untuk Multichannel (tidak punya layer). Dokumen RGB/CMYK
            // dibiarkan: paste ke channel tidak membuat layer, jadi layer asli aman.
            if (finalDoc.mode === DocumentMode.MULTICHANNEL && finalDoc.artLayers.length > 1) {
                finalDoc.flatten();
            }
        } catch (e) {
            // Flatten gagal tidak fatal
        }

        // Kembalikan target ke semua channel komposit (bukan channel terakhir yang di-paste)
        try { finalDoc.activeChannels = finalDoc.componentChannels; } catch (e) {}

        // === LAPORAN HASIL ===
        var modeName = "Lainnya";
        if (finalDoc.mode === DocumentMode.RGB) modeName = "RGB";
        else if (finalDoc.mode === DocumentMode.CMYK) modeName = "CMYK";
        else if (finalDoc.mode === DocumentMode.MULTICHANNEL) modeName = "Multichannel";
        else if (finalDoc.mode === DocumentMode.GRAYSCALE) modeName = "Grayscale";
        else if (finalDoc.mode === DocumentMode.LAB) modeName = "Lab";

        var message = "PROSES SELESAI!\n\n";
        message += "- " + processedCount + " channel berhasil di-raster\n";
        message += "- " + skippedCount   + " channel tetap asli (tidak dicentang)\n";
        if (emptyChannels.length > 0) {
            message += "- " + emptyChannels.length + " channel kosong dilewati: " + emptyChannels.join(", ") + "\n";
        }
        message += "- Mode dokumen hasil: " + modeName + " (channel asli tetap utuh)\n";
        message += "- Dokumen hasil: '" + finalDocName + "'\n";

        if (failedChannels.length > 0) {
            message += "\nGagal memproses " + failedChannels.length + " channel:\n";
            for (var f = 0; f < failedChannels.length; f++) {
                message += "  - " + failedChannels[f] + "\n";
            }
        }

        alert(message);

    } catch (e) {
        try { if (progWin) progWin.close(); } catch (eC2) {}
        alert("Error tidak terduga:\n" + e.message + "\nLine: " + e.line);

        // Cleanup jika finalDoc sudah dibuat tapi proses gagal total
        if (finalDoc !== null) {
            try { finalDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
        }
    }
}

main();