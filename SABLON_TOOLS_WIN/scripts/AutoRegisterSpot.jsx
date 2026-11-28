#target photoshop

// =========================================================================
// JENIS REGISTER YANG BISA DIPILIH DI DIALOG
// =========================================================================
// Ada dua kelompok, masing-masing dipilih sendiri-sendiri:
//
//   REGISTER TENGAH : dipasang di tengah strip ATAS dan tengah strip BAWAH (2 titik).
//   REGISTER POJOK  : dipasang di 4 pojok (kiri & kanan, strip atas & bawah).
//
// id    : nama internal (dipakai di kode, jangan diubah sembarangan)
// label : teks pilihan di dialog
// desc  : keterangan singkat yang tampil di bawah pilihan
// Urutan di sini = urutan di dialog. Yang pertama jadi pilihan awal
// (pilihan awal = tampilan register versi sebelumnya).
var CENTER_REGISTER_TYPES = [
    {id: "longcross", label: "Silang panjang", desc: "Garis panjang dengan silang pendek (bawaan)"},
    {id: "tee",       label: "Garis T",        desc: "Garis panjang dengan penanda mengarah ke desain"}
];

var CORNER_REGISTER_TYPES = [
    {id: "target", label: "Target",         desc: "Lingkaran, silang, dan titik di tengah (bawaan)"},
    {id: "quad",   label: "Target kuadran", desc: "Lingkaran + silang, dua kuadrannya terisi"}
];

// =========================================================================
// >>>>>              ATUR BENTUK & UKURAN REGISTER DI SINI                <<<<<
// =========================================================================
// Semua ukuran di bawah ini adalah PENGALI terhadap ukuran dasar register
// (8 mm, lihat targetMM di getFixedParams) atau terhadap ketebalan dasarnya.
// Naikkan angka = lebih besar/tebal, turunkan = lebih kecil/tipis.

// Ukuran lingkaran (cincin luar) target. 1 = bawaan.
var cornerCircleScale = 1;

// Seberapa jauh lengan silang target menonjol KELUAR dari lingkaran (kali ketebalan).
var cornerCrossOvershoot = 1.5;

// Ketebalan CINCIN lingkaran (target, target ganda, target kuadran).
var ringThicknessScale = 0.8;

// Ketebalan garis lengan silang di dalam target.
var cornerCrossThicknessScale = 0.8;

// Ketebalan garis pada "Silang panjang" dan "Garis T".
var centerCrossThicknessScale = 1;

// Titik bulat solid di tengah "Target" (kali ketebalan).
var centerDotScale = 1.8;

// Register tengah "Silang (+)": panjang tiap garis (kali ukuran dasar) dan ketebalannya.

// Register pojok "Target ganda": radius lingkaran luar dan dalam (kali ukuran dasar).

// Register pojok "Target kuadran": radius lingkaran (kali ukuran dasar) dan
// ketebalan cincinnya (kali ketebalan dasar; lebih tebal dari target biasa).
var quadRadiusScale = 0.34;
var quadRingThicknessScale = 1.2;

// Register tengah "Garis T": panjang garis (kali ukuran dasar) dan panjang penanda
// yang mengarah ke desain (kali ukuran dasar).
var teeLengthScale = 2.4;
var teeTickScale = 0.4;

// ----- Ukuran register DINAMIS mengikuti ukuran desain -----
// Skala = sisi PENDEK desain (mm) / regRefMM, dibatasi antara regMinScale dan 1.
// Desain >= regRefMM (sisi pendek) -> ukuran register penuh (8 mm, strip 15 mm, seperti sebelumnya).
// Desain lebih kecil -> register, strip, teks channel, dan watermark ikut mengecil.
//   regAutoScale = false -> matikan, semua ukuran tetap seperti dulu.
//   regRefMM     -> sisi pendek desain yang dianggap "ukuran penuh" (210 = lebar A4).
//   regMinScale  -> batas terkecil supaya register tidak jadi terlalu mungil (0.35 = 35%).
var regAutoScale = true;
var regRefMM = 210;
var regMinScale = 0.35;

// Ukuran teks nama channel (di kanan register pojok kiri atas), pengali terhadap ukuran dasar.
//   Naikkan = teks lebih besar, turunkan = lebih kecil.
var channelTextScale = 0.9;

// Diisi otomatis di main(). 1 = ukuran penuh.
var _regScale = 1;
// =========================================================================

// Penanda: apakah sudah ada area terseleksi di dokumen sementara.
// Dipakai supaya bentuk pertama dibuat dengan REPLACE, selanjutnya EXTEND.
var _selHas = false;

// Membuat satu panel pilihan jenis register: gambar kecil + radiobutton per jenis,
// dan keterangan singkat di bawahnya. Mengembalikan objek dengan getId() = id jenis terpilih.
function addTypePicker(dlg, title, types) {
    var panel = dlg.add("panel", undefined, title);
    panel.orientation = "column";
    panel.alignChildren = "left";
    panel.margins = [12, 14, 12, 12];
    panel.spacing = 8;

    var row = panel.add("group");
    row.orientation = "row";
    row.alignChildren = "top";
    row.spacing = 8;

    var desc = panel.add("statictext", undefined, "");
    desc.graphics.font = ScriptUI.newFont(desc.graphics.font.name, "ITALIC", 10);
    desc.preferredSize.width = 300;

    var radios = [];
    var picked = 0;

    // Radiobutton di grup berbeda tidak saling mengunci, jadi dikunci manual di sini.
    function select(idx) {
        picked = idx;
        for (var j = 0; j < radios.length; j++) {
            radios[j].value = (j === idx);
        }
        desc.text = types[idx].desc;
    }

    function bind(ctrl, idx) {
        ctrl.onClick = function () { select(idx); };
    }

    // Gambar kecil bentuk register (opsional). Kalau gagal dimuat, pilihan tetap jalan lewat teks.
    function addIcon(parent, typeId, idx) {
        try {
            var data = REGISTER_ICON_DATA[typeId];
            if (!data) return;
            var icon = parent.add("iconbutton", undefined, File.decode(data), {style: "toolbutton"});
            bind(icon, idx);
        } catch (e) {}
    }

    for (var i = 0; i < types.length; i++) {
        var cell = row.add("group");
        cell.orientation = "column";
        cell.alignChildren = "center";
        cell.spacing = 4;
        cell.preferredSize.width = 98;

        addIcon(cell, types[i].id, i);

        var rb = cell.add("radiobutton", undefined, types[i].label);
        bind(rb, i);
        radios.push(rb);
    }
    select(0);

    return {
        getId: function () { return types[picked].id; }
    };
}

function showPaperSizeDialog(srcDoc, Res) {
    // Konversi ukuran dokumen aktif ke cm untuk ditampilkan sebagai referensi
    var currentWidthCM = (srcDoc.width.value / Res) * 2.54;
    var currentHeightCM = (srcDoc.height.value / Res) * 2.54;

    // Preset ukuran kertas umum (cm) - urut dari kecil ke besar
    var presets = [
        {label: "-- Pilih Preset --", w: null, h: null},
        {label: "A4 (21 x 29.7 cm)", w: 21, h: 29.7},
        {label: "F4 / Folio (21.5 x 33 cm)", w: 21.5, h: 33},
        {label: "A3 (29.7 x 42 cm)", w: 29.7, h: 42},
        {label: "A3+ (32.3 x 49.7 cm)", w: 32.3, h: 49.7},
        {label: "Custom (isi manual)", w: null, h: null}
    ];

    var dlg = new Window("dialog", "Register Generator");
    dlg.orientation = "column";
    dlg.alignChildren = "fill";
    dlg.margins = 18;
    dlg.spacing = 14;
    dlg.preferredSize.width = 380;

    // ===== Header =====
    var headerGrp = dlg.add("group");
    headerGrp.orientation = "column";
    headerGrp.alignChildren = "left";
    headerGrp.spacing = 2;

    var title = headerGrp.add("statictext", undefined, "Tentukan Ukuran Kertas Final");
    title.graphics.font = ScriptUI.newFont(title.graphics.font.name, "BOLD", 13);

    var subtitle = headerGrp.add("statictext", undefined, "Register akan dibuat lebih dulu, lalu canvas disesuaikan.");
    subtitle.graphics.font = ScriptUI.newFont(subtitle.graphics.font.name, "ITALIC", 10);

    dlg.add("panel").alignment = "fill"; // garis pemisah tipis (hairline)

    // ===== Info Dokumen Aktif =====
    var infoPanel = dlg.add("panel", undefined, "Dokumen Aktif");
    infoPanel.orientation = "column";
    infoPanel.alignChildren = "left";
    infoPanel.margins = [12, 14, 12, 10];

    var infoText = infoPanel.add("statictext", undefined,
        "Ukuran sekarang:  " + currentWidthCM.toFixed(2) + " x " + currentHeightCM.toFixed(2) + " cm");
    infoText.graphics.font = ScriptUI.newFont(infoText.graphics.font.name, "REGULAR", 11);

    var infoNote = infoPanel.add("statictext", undefined,
        "Resolusi:  " + Res + " ppi");
    infoNote.graphics.font = ScriptUI.newFont(infoNote.graphics.font.name, "REGULAR", 10);

    // ===== Preset Dropdown =====
    var presetPanel = dlg.add("panel", undefined, "Ukuran Kertas");
    presetPanel.orientation = "column";
    presetPanel.alignChildren = "fill";
    presetPanel.margins = [12, 14, 12, 12];
    presetPanel.spacing = 10;

    var presetGrp = presetPanel.add("group");
    presetGrp.add("statictext", undefined, "Preset:");
    var presetLabels = [];
    for (var i = 0; i < presets.length; i++) presetLabels.push(presets[i].label);
    var dropdown = presetGrp.add("dropdownlist", undefined, presetLabels);
    dropdown.selection = 0;
    dropdown.preferredSize.width = 200;

    // ===== Input Lebar x Tinggi =====
    var inputGrp = presetPanel.add("group");
    inputGrp.orientation = "row";
    inputGrp.alignChildren = "center";
    inputGrp.spacing = 8;

    var wGrp = inputGrp.add("group");
    wGrp.orientation = "column";
    wGrp.alignChildren = "left";
    wGrp.add("statictext", undefined, "Lebar (cm)");
    var inputW = wGrp.add("edittext", undefined, "21");
    inputW.characters = 8;

    var swapBtn = inputGrp.add("button", undefined, "\u21C4", {name: "swap"});
    swapBtn.preferredSize.width = 28;
    swapBtn.helpTip = "Tukar Lebar \u2194 Tinggi (ganti orientasi)";

    var hGrp = inputGrp.add("group");
    hGrp.orientation = "column";
    hGrp.alignChildren = "left";
    hGrp.add("statictext", undefined, "Tinggi (cm)");
    var inputH = hGrp.add("edittext", undefined, "29.7");
    inputH.characters = 8;

    // ===== Sinkronisasi dropdown -> input =====
    dropdown.onChange = function () {
        var sel = presets[dropdown.selection.index];
        if (sel.w !== null && sel.h !== null) {
            inputW.text = sel.w.toString();
            inputH.text = sel.h.toString();
        }
    };

    // Kalau user edit manual, dropdown otomatis balik ke "Custom"
    var setCustom = function () {
        dropdown.selection = presets.length - 1;
    };
    inputW.onChanging = setCustom;
    inputH.onChanging = setCustom;

    swapBtn.onClick = function () {
        var tmp = inputW.text;
        inputW.text = inputH.text;
        inputH.text = tmp;
        setCustom();
    };

    dlg.add("panel").alignment = "fill"; // hairline pemisah

    // ===== Jenis Register (tengah & pojok dipilih terpisah) =====
    var centerPicker = addTypePicker(dlg, "Register Tengah (tengah atas & bawah)", CENTER_REGISTER_TYPES);
    var cornerPicker = addTypePicker(dlg, "Register Pojok (4 pojok)", CORNER_REGISTER_TYPES);

    dlg.add("panel").alignment = "fill"; // hairline pemisah

    // ===== Opsi Watermark / Branding =====
    var wmPanel = dlg.add("panel", undefined, "Opsi Tambahan");
    wmPanel.orientation = "column";
    wmPanel.alignChildren = "left";
    wmPanel.margins = [12, 14, 12, 12];

    var chkWatermark = wmPanel.add("checkbox", undefined, "Tambahkan Watermark (Branding Nama)");
    chkWatermark.value = true; // default tercentang, tinggal diubah user kalau tidak mau

    dlg.add("panel").alignment = "fill"; // hairline pemisah

    // ===== Tombol Aksi =====
    var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    btnGroup.spacing = 8;
    var btnCancel = btnGroup.add("button", undefined, "Batal", {name: "cancel"});
    var btnOK = btnGroup.add("button", undefined, "Buat Register", {name: "ok"});
    btnOK.preferredSize.width = 120;

    var result = null;

    btnOK.onClick = function () {
        var wVal = parseFloat(inputW.text.replace(",", "."));
        var hVal = parseFloat(inputH.text.replace(",", "."));

        if (isNaN(wVal) || isNaN(hVal) || wVal <= 0 || hVal <= 0) {
            alert("Mohon isi lebar dan tinggi dengan angka yang valid (lebih dari 0).");
            return;
        }

        result = {
            widthCM: wVal,
            heightCM: hVal,
            addWatermark: chkWatermark.value,
            centerType: centerPicker.getId(),
            cornerType: cornerPicker.getId()
        };
        dlg.close();
    };

    btnCancel.onClick = function () {
        dlg.close();
    };

    dlg.show();
    return result;
}

function main() {
    if (app.documents.length === 0) {
        alert("Mohon buka dokumen desain Anda terlebih dahulu.");
        return;
    }

    var srcDoc = app.activeDocument;
    var Res = srcDoc.resolution;

    // =========================================================================
    // >>>>>           STEP 0: INPUT UKURAN KERTAS FINAL (PANEL)            <<<<<
    // =========================================================================
    var paperSize = showPaperSizeDialog(srcDoc, Res);
    if (paperSize === null) {
        return; // User membatalkan
    }

    var originalRuler = app.preferences.rulerUnits;
    var originalType = app.preferences.typeUnits;

    // SETUP PIXEL (Wajib pixel untuk kalkulasi gambar)
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.PIXELS;

    // =========================================================================
    // >>>>>           STEP 1: EXTEND CANVAS (ATAS & BAWAH)                 <<<<<
    // =========================================================================
    // Margin tambahan dalam MM. Ini area baru tempat register akan ditaruh.
    var oldW = srcDoc.width.value;
    var oldH = srcDoc.height.value;

    // Skala dinamis dari ukuran desain (sisi pendek). Lihat regAutoScale di atas file.
    _regScale = 1;
    if (regAutoScale) {
        var shortSideMM = (Math.min(oldW, oldH) * 25.4) / Res;
        _regScale = shortSideMM / regRefMM;
        if (_regScale > 1) _regScale = 1;
        if (_regScale < regMinScale) _regScale = regMinScale;
    }

    var marginMM = 15 * _regScale; // 1,5 cm atas + 1,5 cm bawah (ikut mengecil untuk desain kecil)
    var marginPx = Math.round((marginMM * Res) / 25.4);
    var newH = oldH + (marginPx * 2);

    // Resize canvas, anchor di tengah supaya desain asli tetap center
    srcDoc.resizeCanvas(new UnitValue(oldW, "px"), new UnitValue(newH, "px"), AnchorPosition.MIDDLECENTER);

    var W = srcDoc.width.value;
    var H = srcDoc.height.value;

    var channelNames = [];
    for (var i = 0; i < srcDoc.channels.length; i++) {
        channelNames.push(srcDoc.channels[i].name);
    }

    var tempDoc = app.documents.add(W, H, Res, "Temp_Generator_Safe", NewDocumentMode.RGB, DocumentFill.WHITE);

    try {
        for (var i = 0; i < channelNames.length; i++) {
            var name = channelNames[i];

            app.activeDocument = tempDoc;
            tempDoc.selection.selectAll();
            var black = new SolidColor(); black.rgb.hexValue = "000000";
            tempDoc.selection.fill(black);
            tempDoc.selection.deselect();

            createGraphicsInTemp(tempDoc, name, Res, marginPx, paperSize.addWatermark, paperSize.centerType, paperSize.cornerType);

            tempDoc.flatten();
            var tempChannel = tempDoc.channels[0];
            tempChannel.duplicate(srcDoc);

            app.activeDocument = srcDoc;
            var maskChannel = srcDoc.channels[srcDoc.channels.length - 1];
            loadSelectionFromChannel(maskChannel);
            maskChannel.remove();

            var targetChannel = srcDoc.channels.getByName(name);
            srcDoc.activeChannels = [targetChannel];
            targetChannel.visible = true;

            fillBlack(srcDoc);
            srcDoc.selection.deselect();
        }

        tempDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = srcDoc;

        // =========================================================================
        // >>>>>     STEP 3: RESIZE CANVAS KE UKURAN KERTAS FINAL (DARI PANEL)   <<<<<
        // =========================================================================
        // Canvas Size murni (bukan Image Size) - konten TIDAK di-scale.
        // Kalau ukuran kertas lebih kecil dari dokumen+register saat ini,
        // bagian yang melebihi akan terpotong (anchor tetap di tengah).
        var finalWidthPx = (paperSize.widthCM * Res) / 2.54;
        var finalHeightPx = (paperSize.heightCM * Res) / 2.54;

        srcDoc.resizeCanvas(
            new UnitValue(finalWidthPx, "px"),
            new UnitValue(finalHeightPx, "px"),
            AnchorPosition.MIDDLECENTER
        );

    } catch (e) {
        try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch(ex){}
        app.activeDocument = srcDoc;
        alert("Error: " + e.message);
    } finally {
        app.preferences.rulerUnits = originalRuler;
        app.preferences.typeUnits = originalType;
    }
}

function createGraphicsInTemp(doc, textString, Res, marginPx, addWatermark, centerType, cornerType) {
    var white = new SolidColor();
    white.rgb.hexValue = "FFFFFF";

    // Hitung parameter berdasarkan tinggi strip margin, bukan tinggi dokumen
    var params = getFixedParams(doc.width.value, doc.height.value, Res, marginPx, centerType);

    // 1. Buat Register Mark dulu (semua titik strip atas & bawah)
    var regLayer = doc.artLayers.add();
    regLayer.name = "RegisterMark";

    addRegisterToSelection(doc, params, centerType, cornerType);
    doc.selection.fill(white);
    doc.selection.deselect();

    // 2. Buat Text Layer (nama channel), ditaruh di sebelah kanan register TENGAH strip atas
    var textLayer = doc.artLayers.add();
    textLayer.kind = LayerKind.TEXT;
    var textItem = textLayer.textItem;
    textItem.contents = textString;

    textItem.size = new UnitValue(params.dynamicFontSize * channelTextScale, "px");
    textItem.color = white;
    try { textItem.font = "ArialMT"; } catch(e) { try{ textItem.font = "Helvetica"; } catch(e2) {} }
    textItem.position = [params.textX, params.textY];

    // Setelah ukurannya diketahui, geser supaya teks berada di SEBELAH KANAN register
    // pojok kiri atas (rata kiri, berjarak sedikit dari register) dan lurus di tengah
    // register secara vertikal.
    var tb = textLayer.bounds; // [kiri, atas, kanan, bawah]
    var shiftX = params.textLeftX - tb[0].value;
    var shiftY = params.textCenterY - ((tb[1].value + tb[3].value) / 2);
    textLayer.translate(shiftX, shiftY);

    // 3. Watermark / Branding (opsional, sesuai checkbox di dialog awal)
    if (addWatermark) {
        addWatermarkText(doc, doc.width.value, doc.height.value, Res, params.dynamicFontSize);
    }
}

// Setengah lebar (px) register TENGAH menurut jenisnya. Dipakai untuk menaruh teks nama
// channel di sebelah kanan register tengah atas. (Register pojok tidak perlu: jaraknya
// dari tepi kertas memakai ukuran dasar, sama seperti sebelumnya.)
function getCenterRegisterHalfWidth(kind, S, centerCrossScaleH) {
    if (kind === "tee")  return (S * teeLengthScale) / 2;
    return (S * centerCrossScaleH) / 2; // "longcross" (bawaan)
}

function getFixedParams(W, H, Res, marginPx, centerType) {
    // =========================================================================
    // >>>>>               AREA PENGATURAN FISIK (FIXED)                   <<<<<
    // =========================================================================

    // 1. UKURAN REGISTER (DALAM MILIMETER) - tetap dikunci 8mm
    var targetMM = 8 * _regScale;

    // 2. UKURAN FONT (Rasio terhadap Register)
    var ratioFont;
    if (Res <= 300) {
        ratioFont = 0.18;
    } else {
        ratioFont = 0.8;
    }

    // 3. BULLSEYE
    var circleRatio = 0.30;

    // =========================================================================
    // >>>>>   ATUR PANJANG & TINGGI GARIS REGISTER TENGAH DI SINI         <<<<<
    // =========================================================================
    // centerCrossScaleH -> PANJANG garis horizontal (kiri-kanan) di titik tengah.
    //   Naikkan untuk lebih PANJANG, turunkan untuk lebih PENDEK.
    var centerCrossScaleH = 1.6;

    // centerCrossScaleV -> TINGGI garis vertikal (atas-bawah) di titik tengah.
    //   Naikkan untuk lebih TINGGI, turunkan untuk lebih PENDEK.
    var centerCrossScaleV = 1.6;
    // =========================================================================

    // =========================================================================
    // RUMUS KONVERSI: (Milimeter * Resolusi) / 25.4 = Pixel
    var hLength = (targetMM * Res) / 25.4;
    var thickness = hLength * 0.08;
    var vLength = hLength * 0.45;
    var dynamicFontSize = hLength * ratioFont;
    if (dynamicFontSize < 9 * _regScale) dynamicFontSize = 9 * _regScale;

    // Pastikan register tidak lebih besar dari strip margin yang tersedia
    // (kasih sedikit ruang aman, supaya cross/circle tidak terpotong)
    var maxAllowed = marginPx * 0.7;
    if (hLength > maxAllowed) {
        var scale = maxAllowed / hLength;
        hLength *= scale;
        thickness *= scale;
        vLength *= scale;
        dynamicFontSize *= scale;
    }

    var centerX = W / 2;

    // Y register: di tengah masing-masing strip margin (atas & bawah)
    var topStripCenterY = marginPx / 2;
    var bottomStripCenterY = H - (marginPx / 2);

    // Setengah lebar register pojok (tetap, sama seperti sebelumnya) dan register tengah
    // (tergantung jenis yang dipilih).
    var cornerHalfW = hLength / 2;
    var centerHalfW = getCenterRegisterHalfWidth(centerType, hLength, centerCrossScaleH);

    // Offset horizontal dari tepi kiri/kanan, pakai persentase lebar
    var offsetX = cornerHalfW + (W * 0.015);

    return {
        thickness: thickness,
        hLength: hLength,
        vLength: vLength,
        offsetX: offsetX,
        centerX: centerX,
        topStripCenterY: topStripCenterY,
        bottomStripCenterY: bottomStripCenterY,
        dynamicFontSize: dynamicFontSize,
        circleRadius: hLength * circleRatio,
        centerCrossScaleH: centerCrossScaleH,
        centerCrossScaleV: centerCrossScaleV,

        // =====================================================================
        // >>>>>   ATUR POSISI TEKS NAMA CHANNEL DI SINI                     <<<<<
        // =====================================================================
        // Teks ditaruh di SEBELAH KANAN register pojok KIRI ATAS, rata kiri, dan lurus di
        // tengah register (vertikal). Posisi akhir dihitung di createGraphicsInTemp setelah
        // ukuran teksnya diketahui.
        //
        // textLeftX -> batas KIRI teks (jarak dari register = thickness * 3).
        //   Ganti angka 3: lebih BESAR = teks makin ke KANAN (menjauh dari register),
        //   lebih KECIL = makin dekat ke register.
        textLeftX: offsetX + cornerHalfW + (thickness * 3),

        // textCenterY -> titik tengah vertikal teks (sama dengan tengah register).
        //   Tambah angka = teks makin ke BAWAH, kurangi = makin ke ATAS.
        textCenterY: topStripCenterY,

        // Posisi awal sementara sebelum digeser (tidak perlu diubah).
        textX: offsetX + cornerHalfW + (thickness * 3),
        textY: topStripCenterY + (dynamicFontSize * 0.35)
    };
}

function addRegisterToSelection(doc, p, centerType, cornerType) {
    // 3 titik di strip atas, 3 titik di strip bawah: kiri, tengah, kanan
    var centers = [
        {x: p.offsetX, y: p.topStripCenterY},                         // Atas-Kiri
        {x: p.centerX, y: p.topStripCenterY},                         // Atas-Tengah
        {x: doc.width.value - p.offsetX, y: p.topStripCenterY},       // Atas-Kanan
        {x: p.offsetX, y: p.bottomStripCenterY},                      // Bawah-Kiri
        {x: p.centerX, y: p.bottomStripCenterY},                      // Bawah-Tengah
        {x: doc.width.value - p.offsetX, y: p.bottomStripCenterY}     // Bawah-Kanan
    ];

    _selHas = false;

    for (var k = 0; k < centers.length; k++) {
        // Titik tengah: index 1 (atas-tengah) dan 4 (bawah-tengah) -> register TENGAH.
        // Titik lainnya (4 pojok) -> register POJOK.
        var isCenterPoint = (k === 1 || k === 4);
        var isTop = (k < 3);
        var kind = isCenterPoint ? (centerType || "longcross") : (cornerType || "target");
        drawRegisterMark(doc, centers[k].x, centers[k].y, p, kind, isTop);
    }
}

// Menggambar SATU tanda register jenis `kind` di (cx, cy).
// Register tengah: "longcross", "tee". Register pojok: "target", "quad".
function drawRegisterMark(doc, cx, cy, p, kind, isTop) {
    if (kind === "tee") {
        drawTeeMark(doc, cx, cy, p, isTop);
    } else if (kind === "quad") {
        drawQuadTargetMark(doc, cx, cy, p);
    } else if (kind === "target") {
        drawTargetMark(doc, cx, cy, p);
    } else {
        // "longcross" (juga jadi cadangan kalau jenisnya tidak dikenal)
        addCrossShape(doc, cx, cy, p, p.centerCrossScaleH, p.centerCrossScaleV,
            p.thickness * centerCrossThicknessScale);
    }
}

// Silang sederhana (+), simetris.
// Target: lingkaran + silang gaya reticle (lengan menembus keluar) + titik solid di tengah.
function drawTargetMark(doc, cx, cy, p) {
    var radius = p.circleRadius * cornerCircleScale;
    var ringThickness = p.thickness * ringThicknessScale;
    var armThickness = p.thickness * cornerCrossThicknessScale;
    var dotRadius = p.thickness * centerDotScale;
    // Panjang lengan: diameter lingkaran + overshoot di kedua sisi, supaya simetris
    var armLength = (radius * 2) + (p.thickness * cornerCrossOvershoot * 2);

    makeCircularSelection(doc, cx, cy, radius, "ADD");
    makeCircularSelection(doc, cx, cy, radius - ringThickness, "SUBTRACT");
    addSymmetricCrossShape(doc, cx, cy, armLength, armThickness);
    makeCircularSelection(doc, cx, cy, dotRadius, "ADD");
}

// Target ganda: dua lingkaran sepusat + silang yang menembus keluar.
// Target kuadran: lingkaran + silang, dengan dua kuadran berseberangan terisi penuh
// (kiri-atas dan kanan-bawah), seperti target register klasik.
function drawQuadTargetMark(doc, cx, cy, p) {
    var radius = p.hLength * quadRadiusScale;
    var ringThickness = p.thickness * quadRingThicknessScale;
    var armThickness = p.thickness * cornerCrossThicknessScale;
    var armLength = (radius * 2) + (p.thickness * 4);
    // Kuadran dibuat sedikit masuk ke cincin supaya menyatu tanpa celah
    var fillRadius = radius - (ringThickness / 2);

    makeCircularSelection(doc, cx, cy, radius, "ADD");
    makeCircularSelection(doc, cx, cy, radius - ringThickness, "SUBTRACT");
    selectionAddPolygon(doc, sectorPoints(cx, cy, fillRadius, 180, 270)); // kiri-atas
    selectionAddPolygon(doc, sectorPoints(cx, cy, fillRadius, 0, 90));    // kanan-bawah
    addSymmetricCrossShape(doc, cx, cy, armLength, armThickness);
}

// Garis T: garis panjang + penanda pendek yang mengarah KE DESAIN
// (strip atas: penanda ke bawah, strip bawah: penanda ke atas).
function drawTeeMark(doc, cx, cy, p, isTop) {
    var lineLength = p.hLength * teeLengthScale;
    var tickLength = p.hLength * teeTickScale;
    var th = p.thickness * centerCrossThicknessScale;
    var dir = isTop ? 1 : -1; // +1 = ke bawah, -1 = ke atas

    // Garis mendatar tepat di tengah strip (sejajar dengan tengah register pojok kiri/kanan),
    // penanda pendeknya keluar dari garis itu mengarah ke desain.
    var lineY = cy;
    var tickEndY = lineY + (dir * tickLength);
    var tickStartY = lineY - (dir * th / 2);

    selectionAddPolygon(doc, [
        [cx - lineLength / 2, lineY - th / 2],
        [cx + lineLength / 2, lineY - th / 2],
        [cx + lineLength / 2, lineY + th / 2],
        [cx - lineLength / 2, lineY + th / 2]
    ]);
    selectionAddPolygon(doc, [
        [cx - th / 2, Math.min(tickStartY, tickEndY)],
        [cx + th / 2, Math.min(tickStartY, tickEndY)],
        [cx + th / 2, Math.max(tickStartY, tickEndY)],
        [cx - th / 2, Math.max(tickStartY, tickEndY)]
    ]);
}

// Titik-titik juring (potongan pizza) dari sudut a0 ke a1 (derajat, 0 = kanan, 90 = bawah).
function sectorPoints(cx, cy, r, a0, a1) {
    var pts = [[cx, cy]];
    var steps = 32;
    for (var i = 0; i <= steps; i++) {
        var a = (a0 + ((a1 - a0) * i / steps)) * Math.PI / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
}

// Tambahkan bentuk poligon ke seleksi. Bentuk pertama memakai REPLACE supaya tidak
// bergantung pada ada/tidaknya seleksi sebelumnya; selanjutnya EXTEND (digabung).
function selectionAddPolygon(doc, points) {
    doc.selection.select(points, _selHas ? SelectionType.EXTEND : SelectionType.REPLACE);
    _selHas = true;
}

// Cross SIMETRIS (panjang horizontal = vertikal) untuk gaya reticle/target di titik pojok
function addSymmetricCrossShape(doc, cx, cy, length, thickness) {
    var shapeH = [
        [cx - length/2, cy - thickness/2],
        [cx + length/2, cy - thickness/2],
        [cx + length/2, cy + thickness/2],
        [cx - length/2, cy + thickness/2]
    ];
    var shapeV = [
        [cx - thickness/2, cy - length/2],
        [cx + thickness/2, cy - length/2],
        [cx + thickness/2, cy + length/2],
        [cx - thickness/2, cy + length/2]
    ];
    selectionAddPolygon(doc, shapeH);
    selectionAddPolygon(doc, shapeV);
}

// Cross di titik TENGAH: panjang horizontal (scaleH) & vertikal (scaleV) diatur TERPISAH
function addCrossShape(doc, cx, cy, p, scaleH, scaleV, customThickness) {
    scaleH = scaleH || 1;
    scaleV = scaleV || 1;
    var th = customThickness || p.thickness;

    // Panjang garis di-scale, tapi ketebalan (th) dibiarkan sama
    // supaya garis makin panjang, bukan makin tebal
    var hLen = p.hLength * scaleH;
    var vLen = p.vLength * scaleV;

    var shapeH = [
        [cx - hLen/2, cy - th/2],
        [cx + hLen/2, cy - th/2],
        [cx + hLen/2, cy + th/2],
        [cx - hLen/2, cy + th/2]
    ];
    var shapeV = [
        [cx - th/2, cy - vLen/2],
        [cx + th/2, cy - vLen/2],
        [cx + th/2, cy + vLen/2],
        [cx - th/2, cy + vLen/2]
    ];
    selectionAddPolygon(doc, shapeH);
    selectionAddPolygon(doc, shapeV);
}

// =========================================================================
// WATERMARK / BRANDING: "abdllah" (italic) + "majid" (bold), rata kanan
// =========================================================================
function addWatermarkText(doc, W, H, Res, baseFontSizePx) {
    var white = new SolidColor();
    white.rgb.hexValue = "FFFFFF";

    // =========================================================================
    // >>>>>            ATUR WATERMARK DI SINI                             <<<<<
    // =========================================================================
    // Ukuran font watermark: mengikuti dynamicFontSize yang sama dengan teks
    // nama channel (params.dynamicFontSize) supaya OTOMATIS konsisten/proporsional
    // di berbagai ukuran kertas & resolusi. Ini pengali terhadap ukuran itu:
    //   1    = sama persis dengan ukuran teks channel
    //   >1   = watermark LEBIH BESAR dari teks channel (misal 1.3, 1.5)
    //   <1   = watermark LEBIH KECIL dari teks channel (misal 0.7, 0.8)
    var watermarkFontScale = 0.6;

    // Jarak watermark dari tepi KANAN kertas (dalam MM).
    // NAIKKAN angka = watermark makin ke KIRI (menjauh dari tepi kanan)
    // TURUNKAN angka (bisa minus) = watermark makin ke KANAN (mepet/lewat tepi kanan)
    var watermarkRightInsetMM = 45;

    // Jarak watermark dari tepi PALING BAWAH kertas (dalam MM).
    // NAIKKAN angka = watermark makin ke ATAS (menjauhi tepi bawah)
    // TURUNKAN angka (bisa minus) = watermark makin ke BAWAH (mepet/lewat tepi bawah)
    var watermarkBottomOffsetMM = 6;
    // =========================================================================

    // Font dasar (fallback otomatis ke Helvetica kalau ArialMT tidak tersedia)
    var watermarkFont = "ArialMT";

    var fontSizePx = baseFontSizePx * watermarkFontScale;
    var bottomOffsetPx = (watermarkBottomOffsetMM * _regScale * Res) / 25.4;
    var rightInsetPx = (watermarkRightInsetMM * _regScale * Res) / 25.4;

    var baselineY = H - bottomOffsetPx;
    var startX = W * 0.5; // posisi awal sementara, nanti di-geser ke kanan setelah lebar teks diketahui

    // ----- Bagian 1: "abdllah" (ITALIC) -----
    var wmLayer1 = doc.artLayers.add();
    wmLayer1.name = "Watermark_abdllah";
    wmLayer1.kind = LayerKind.TEXT;
    var ti1 = wmLayer1.textItem;
    ti1.contents = "abdllah";
    ti1.size = new UnitValue(fontSizePx, "px");
    ti1.color = white;
    try { ti1.font = watermarkFont; } catch(e) { try { ti1.font = "Helvetica"; } catch(e2) {} }
    ti1.fauxItalic = true;
    ti1.position = [startX, baselineY];

    // ----- Bagian 2: "majid" (BOLD), disambung persis setelah "abdllah" -----
    var b1 = wmLayer1.bounds; // [left, top, right, bottom]
    var rightOfLayer1 = b1[2].value;

    var wmLayer2 = doc.artLayers.add();
    wmLayer2.name = "Watermark_majid";
    wmLayer2.kind = LayerKind.TEXT;
    var ti2 = wmLayer2.textItem;
    ti2.contents = "majid";
    ti2.size = new UnitValue(fontSizePx, "px");
    ti2.color = white;
    try { ti2.font = watermarkFont; } catch(e) { try { ti2.font = "Helvetica"; } catch(e2) {} }
    ti2.fauxBold = true;
    ti2.position = [rightOfLayer1, baselineY];

    // ----- Geser kedua layer bareng supaya rata kanan di posisi target -----
    var b2 = wmLayer2.bounds;
    var totalRight = b2[2].value;
    var desiredRightX = W - rightInsetPx;
    var shiftX = desiredRightX - totalRight;

    wmLayer1.translate(shiftX, 0);
    wmLayer2.translate(shiftX, 0);
}

function makeCircularSelection(doc, cx, cy, radius, mode) {
    var top = cy - radius;
    var left = cx - radius;
    var bottom = cy + radius;
    var right = cx + radius;

    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);

    var descEllipse = new ActionDescriptor();
    descEllipse.putUnitDouble(charIDToTypeID("Top "), charIDToTypeID("#Pxl"), top);
    descEllipse.putUnitDouble(charIDToTypeID("Left"), charIDToTypeID("#Pxl"), left);
    descEllipse.putUnitDouble(charIDToTypeID("Btom"), charIDToTypeID("#Pxl"), bottom);
    descEllipse.putUnitDouble(charIDToTypeID("Rght"), charIDToTypeID("#Pxl"), right);

    desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Elps"), descEllipse);

    var selectionModeID;
    if (mode === "SUBTRACT") {
        selectionModeID = charIDToTypeID("SbtF");
    } else {
        selectionModeID = charIDToTypeID("AddT");
    }

    executeAction(selectionModeID, desc, DialogModes.NO);
    _selHas = true;
}

function loadSelectionFromChannel(channel) {
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID("Chnl"), charIDToTypeID("fsel"));
    desc.putReference(charIDToTypeID("null"), ref);
    var ref2 = new ActionReference();
    ref2.putName(charIDToTypeID("Chnl"), channel.name);
    desc.putReference(charIDToTypeID("T   "), ref2);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function fillBlack(doc) {
    var solidBlack = new SolidColor();
    solidBlack.rgb.hexValue = "000000";
    doc.selection.fill(solidBlack);
}

// =========================================================================
// GAMBAR KECIL PILIHAN REGISTER
// =========================================================================
// PNG 44x44 (satu per jenis register) yang dikodekan sebagai teks supaya tidak butuh file tambahan.
// Hanya hiasan di dialog: kalau gagal dimuat, pilihan tetap bisa dipakai lewat teks.
var REGISTER_ICON_DATA = {
    "target": "%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%2C%00%00%00%2C%08%06%00%00%00%1E%C2%84Z%01%00%00%04wIDATx%C3%9A%C3%9D%C2%99%3Fk2O%10%C3%87%C2%BF%7B%C2%B7%C3%B1%0FQD1p%C2%88%C2%96%12%C3%84%22B%C2%9AT%C2%81%14%166%C2%81t%29%C3%B3%22l%7C%05%C3%B6%C2%82%C2%9DX%C2%89%C2%96%11%C3%91%C3%B6%C2%84%C2%84%C2%90%C3%A4%1D%24%C2%BD%04%C3%A54%20%C2%9AB%C3%B4v%C2%9E%22%C3%8F.%5E%12%C2%8Dy%C3%B4%17%C3%B47%20x%C3%AB%C3%AC%C3%AE%C3%87%C2%B9%C2%99%C2%B9%C3%999f%C2%9A%26a%C2%87%C2%84%03%C3%80%C3%99%C3%99%C3%99%C3%86%16%C2%B4m%1BD%C3%AF6%60%C2%8CA%C3%97%C3%B5%C2%8D%C2%AD%C3%9Dn%C2%B7%C3%9F%C2%817%29%C2%9B%04%5Ch%C3%A1u%C2%85%C2%88%C3%80%18%03%00%C3%A4r9t%C2%BB%5D%00%C2%80a%18%C3%88%C3%A7%C3%B3%C2%9Ft%C3%96%12%C3%934i%5D%11B%C2%A8%C3%AF%C2%86a%10%00%02%40%C2%86a%7C%C2%A9%C3%B3%C2%AFb%C2%9A%26i%C2%9B%C2%BEe%C2%A1P%08%C2%9Csp%C3%8E%11%0A%C2%85%C2%B6%C3%93%25%C3%A4-%17B%C3%80%C2%B6m%C3%8Cf3%15%C2%80%C2%B6mC%C3%93%C2%B4%C3%AD%00%C2%96%C2%902%C3%98t%5Dw%C3%80i%C2%9A%C2%A6%C2%82%C3%90%C2%B6m5%C2%B6%C2%8E%2Fk%C3%AB%C2%A4%2F%C2%99%C2%B6t%5DG%C2%BF%C3%9F%C3%87%C3%83%C3%83%03%C3%86%C3%A3%C2%B1%C3%92%19%C2%8F%C3%87xxx%40%C2%BF%C3%9FWz%C2%8C1%05%C3%BFkA7%C2%9B%C3%8D%C2%88%C2%88h2%C2%99P%C2%A5R%C2%A1L%26C%C3%81%60P%05%C3%9B%C3%87O0%18%C2%A4L%26C%C2%95J%C2%85%26%C2%93%C2%89c%C2%8D%C2%9F%06%C3%9D%C2%8F%C2%80%C2%85%10%2A%C3%9A%C3%AB%C3%B5%3A%25%C2%93I%07%C2%98%C2%AE%C3%AB%C3%84%18S%C3%97%C2%8C1%C3%92u%C3%9D%C2%A1%C2%93L%26%C2%A9%5E%C2%AF%7FZo%C3%A3%C3%80B%08%C2%B2m%C2%9B%C2%84%10%C2%94%C3%8Df%15%00%C3%A7%C2%9C%5C.%17i%C2%9A%C2%B6%C3%90%C3%82%C2%9A%C2%A6%C2%91%C3%8B%C3%A5%22%C3%8E%C2%B9%1A%C3%8Bf%C2%B3%C2%8E57%0A%2C%C2%84P%C2%B7%C3%B0%C3%B2%C3%B2RYS%C3%97u%07h%2A%C2%95%C2%A2%40%20%C2%A0%C2%AE%03%C2%81%00%C2%A5R%29%07%C2%B8%C2%9C%07%C2%80.%2F%2F%C2%95%7B%C2%AC%02%C2%BD2%C2%B0%C2%84%C2%95%C2%96%C3%9D%C3%9B%C3%9Bs%C2%80%C2%9E%C2%9F%C2%9F%C3%93%C3%AD%C3%AD-M%C2%A7SJ%24%12j%3C%C2%91H%C3%90t%3A%C2%A5%C3%9B%C3%9B%5B%3A%3F%3Fw%C2%80%C3%AF%C3%AD%C3%AD%29K%C2%AF%C3%AA%C3%93%2B%01%C3%8B%C2%85%C2%9A%C3%8D%C2%A6r%01%09%C3%AB%C3%B5z%C2%A9T%2A9%C3%B4%3F%02%C3%8FK%C2%A9T%22%C2%AF%C3%97%C2%AB%C2%A0%C2%A5%C2%8B4%C2%9B%C3%8D%C2%95%C2%A0%C2%BF%05%C2%96A1%C2%99L%28%1E%C2%8F%13cL%01%7B%3C%1E%C2%9A%C2%9F%C3%9B%C3%AB%C3%B5%C2%A8X%2CR%28%14%22%C3%86%181%C3%86%28%14%0AQ%C2%B1X%C2%A4%5E%C2%AF%C3%A7%C3%98%C3%94%C3%A3%C3%B1%28%60%C3%86%18%C3%85%C3%A3q%C2%9AL%26%C3%9F%06%C3%A1%C2%B7%C3%80%C3%93%C3%A9%C2%94%C2%88%C2%88%C2%AA%C3%95%C2%AA%C3%83o%01P%C2%B9%5CVz%C2%8DF%C2%83%22%C2%91%C3%88%C3%82%C2%A0%C2%8BD%22%C3%94h4%C2%94~%C2%B9%5C%C3%BE%C2%B4%5E%C2%B5Zu%C3%AC%C2%B92%C2%B0%C3%BC%C2%87%C3%B3%C2%81%C2%96N%C2%A7%C2%891Fn%C2%B7%C2%9B%00P%26%C2%93Q%C3%BA%C2%ADV%C3%8B%C2%911%3E%C3%82%C3%8E%C2%8F%C2%B5Z-5%2F%C2%93%C3%89%10%00r%C2%BB%C3%9D%C3%84%18%C2%A3t%3A%C3%BD%29%00%3FZ%7B%C2%A9%C2%85%C2%A5%C3%B2%600%20%C2%BF%C3%9F%C2%AF%C3%BC%C2%8E1F%C2%8F%C2%8F%C2%8F%24%C2%84%20%C3%8B%C2%B2%C3%A8%C3%A0%C3%A0%40Yk%C2%91%C2%85%C3%A5o%07%07%07dY%16%09%21%C3%A8%C3%B1%C3%B1%C2%91%18c%2A%1E%C3%BC~%3F%0D%06%C2%83%C2%A5%C2%95%C3%9D%C3%92jM%C3%96%08OOO%18%C2%8DF%C3%A0%C2%9CC%08%C2%81%C2%A3%C2%A3%23%1C%1F%1F%03%00j%C2%B5%1A%2C%C3%8B%02%C3%A7%7C%C3%A9%C3%A3%C3%96%C2%B6mp%C3%8EaY%16j%C2%B5%1A%00%C3%A0%C3%B8%C3%B8%18GGG%10B%C2%80s%C2%8E%C3%91h%C2%84%C2%A7%C2%A7%27%C3%87%C3%9E_%093M%C2%93NOO%C2%A1%C3%AB%3Ar%C2%B9%1C%C2%AE%C2%AF%C2%AF%C3%819W%15%C3%97%C3%9B%C3%9B%1B%3A%C2%9D%0E%18c%20%22%04%02%01%18%C2%86%01%00xyyQ%C2%B5%C2%83%3C%16-%C3%9C%C3%A8o%C3%81%C3%A3%C3%B3%C3%B9%10%C2%89D%00%00%C3%9Dn%17%C3%83%C3%A1P%C2%AD%1D%C2%8DF%C2%B1%C2%BF%C2%BF%C3%BF%5E%C2%95%C3%BDe%C2%B8%C2%B8%C2%B8%40%3E%C2%9F%C2%87m%C3%9B%C2%B8%C2%B9%C2%B9y%C2%AF%C3%96%C3%A4f%C2%9DN%07%C3%8F%C3%8F%C3%8F%0B%2B3%00%18%0E%C2%87%18%0E%C2%87%C3%BFT%C3%99%01%C3%80h4%C3%BA%C2%B4%C3%87%C3%BC%C3%BE%1FE%C2%8EI%C2%9D%C2%8D%17%C3%B0%C2%BFrj%C2%96%C2%B7%2B%1A%C2%8D%C3%A2%C3%B0%C3%B0p%C2%AB%5C%22%1A%C2%8D%3A%C3%A6%2F%C3%8C%122%C2%A5%C3%9D%C3%9D%C3%9D9%C3%92S%2A%C2%95R%C2%A9%C2%A7P%28%2CLg%C2%8B%C3%92%5B%C2%A1PP%29S%C3%96%19%C3%B2%C2%B7%C2%BB%C2%BB%C2%BB%C2%A5O%C2%BC%C2%9DLk%C3%BF%C2%9F%07%C3%87%C3%8E%3C%C2%9Aw%C2%BA%C3%B8%C3%99%C2%B9%C3%B2r%27%0B%C3%B8%C2%9D%3C%22%C3%AD%C3%9C%21t%27%C2%8F%C3%B9%3B%C3%99H%C3%B9%0AZ%C2%8AeYt%7F%7FO%C2%B1XL%C2%81%C3%86b1%C2%BA%C2%BF%C2%BF%27%C3%8B%C2%B2%C2%96%C3%8E%C3%BD%090_%C2%A7%C3%93%3E%C3%9F%0C%0C%C2%87%C3%83%08%C2%87%C3%83%C3%B0%C3%B9%7CJ%C3%87%C3%A7%C3%B3%C3%A1%C3%A4%C3%A4%C3%A4S3p%C2%9D.%C3%BDZ%C3%9DK%C3%99%0C%24%22%05%3F%7FZ%C2%90%C3%ADWM%C3%93%C3%96%C3%AEZn%C2%BC%3F%3C%C3%9F%C3%89%C3%A4%C2%9C%3BZ%C2%B0%C2%AB%C2%94%C2%9F%C2%BF%0E%2C%C3%A5%C3%B5%C3%B5U%C3%95%C3%92%C2%AF%C2%AF%C2%AF%C3%9B%C3%9B%C2%81%C2%97ruu%C3%A5x%29%C2%B3%C2%95%C3%80%C3%B3%C2%BE%29%C3%9F%1A-%C3%93%C3%99%2A%0B%C3%BF%C2%97%2F%16%15p%C2%BB%C3%9D%C3%9E%C2%99C%C3%A8%1F%C2%ADk%C2%8F%C2%93%2Cgu%10%00%00%00%00IEND%C2%AEB%60%C2%82",
    "quad": "%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%2C%00%00%00%2C%08%06%00%00%00%1E%C2%84Z%01%00%00%05BIDATx%C3%9A%C3%95Y%C2%BFK%23O%14%C3%BF%C3%8C%C3%8C%C3%AE%C2%86%C2%80%C2%8D%C2%95%1CA%C3%B1%1AA%2C%0C%C2%92B%C3%91%C3%82%1F%18%13%5B%C3%A5%C3%AC%C2%AE%C2%B9%C3%B2%C3%94R%22hes%C3%BF%C3%84%15Z%C2%A9h%2B%22%18%0B-%C2%84%C3%88%19%C3%91k%C2%AE9%C2%B9%23%1C%C2%A9%C2%B4%10B%C2%B2%C3%99%C3%B7%C2%BE%C3%851C6%26%C2%97%C3%8D%C2%B9~%C3%B5%06%C2%86lf%26o%3Ey%C3%B3~%7C%C3%9E%C2%AC%C3%88f%C2%B3%C2%8C%7F%C2%A8Y%00011%11%C2%9A%40%C3%8F%C3%B3%C3%80%C3%BC%5B%07B%08%28%C2%A5B%C2%93%7Drr%C3%B2%1Bp%C2%98-L%C2%80M5%1CFcf%08%21%C2%B0%C2%B5%C2%B5%C2%85%C3%AF%C3%9F%C2%BF%03%00%C3%9E%C2%BE%7D%C2%8B%C3%B7%C3%AF%C3%9F%C2%9B%C2%B9PZ6%C2%9B%C3%A50%C2%9A%C3%A7y%C3%8C%C3%8C%C2%9CH%24%18%00%03%C3%A0D%22%C3%A1%C2%9B%7Bj%C3%8Bf%C2%B3%1C%C2%BAItvv%C3%82%C2%B2%2C%C3%B3%C3%BCjM%C2%A2%C3%96%C3%A9%C2%AA%C3%95%C2%AAy%0E%C2%BB%C3%890%C2%84%10%11%C2%AA%C3%95%2A%C2%AA%C3%95%C2%AA%C2%89%10%C3%9A%C2%AE%C3%B58%11%C2%BD%C2%BC%C2%86%C2%89%08%C3%8C%0C%C2%A5%14%1C%C3%87%01%00%C3%98%C2%B6m%C3%A6m%C3%9B6%C3%A6%C2%A15.%C2%84%C2%80%C2%94%C3%B2%C3%BF%07%C3%ACy%C2%9E%09a%3F~%C3%BC%C3%80%C3%B1%C3%B11%C2%BE%7C%C3%B9%C2%82%C3%AB%C3%ABk%C2%B3%C3%A6%C3%BA%C3%BA%1AKKK%18%1A%1A%C3%82%C3%94%C3%94%14zzz%1E%C3%BD%C3%B6%C3%99%C2%A3%04%111%1113s.%C2%97%C3%A3%C2%85%C2%85%05%C3%AE%C3%A8%C3%A80%C2%91%C2%A1Y%C3%AF%C3%A8%C3%A8%C3%A0%C2%85%C2%85%05%C3%8E%C3%A5r%C2%8F%C3%A4%C2%B4%13%25%C3%9A%02%C2%AC7%20%22%5E%5D%5De%C2%A5%C2%94%01%C2%A4%C2%94b%C3%8B%C2%B2X%08a%C3%86%C2%84%10l%C3%9B%C3%B6%C2%A3u%C2%AB%C2%AB%C2%AB%3EY%C3%8F%02Xk%C3%A4%C3%A1%C3%A1%C2%81%C3%93%C3%A9%C2%B4%01T%0F%C2%B2Q%C3%97kj%C3%97%C2%A6%C3%93i~xxhK%C3%93%C2%81%01%13%11W%C2%ABU%26%22N%C2%A5R%0C%C2%80m%C3%9Bn%094%1A%C2%8D%C2%B2%C2%94%C3%92%7C%C3%97%C3%8F%C2%8E%C3%A30%00N%C2%A5R%3E%C3%99A%00%C3%8B%C2%A0%C3%91%40%29%C2%85%C2%B5%C2%B55%1C%1E%1E%C3%82q%1C%C2%B8%C2%AE%C3%AB%0Ba%C2%8D%C3%B8%C3%84%C3%88%C3%88%08%C2%AE%C2%AE%C2%AE%C3%B0%C3%B1%C3%A3G%28%C2%A5%40D%C2%90R%C2%A2R%C2%A9%C3%80q%1C%1C%1E%1Ebmm%C3%8D%C3%8C%C2%85%C3%A2t%C3%BA%C3%9F%C3%A7%C3%B3y%C2%96R%C2%B2R%C2%AA%C2%A5f%C2%B5%C3%8DNNN%1A9%C2%A7%C2%A7%C2%A7%C3%9C%C3%9B%C3%9B%C3%AB%C3%93%C2%B4R%C2%8A%C2%A5%C2%94%C2%9C%C3%8F%C3%A7%C2%8D%C2%A6C%C3%91%C2%B0%10%02%1B%1B%1B%20%22%08%21%C2%9Aj%C2%B6%C3%99%C3%A9%C2%94%C3%8Be%C2%8C%C2%8D%C2%8D%C3%A1%C3%AC%C3%AC%0C%C3%9D%C3%9D%C3%9DF%C3%93B%08%10%11666%02%C2%93%23%19%C3%84%14%0A%C2%85%02%0E%0E%0E%20%C2%84h%3B%C3%9DJ%29a%C3%9B6%5C%C3%97E%2C%16%C3%83%C3%AE%C3%AE%C2%AEI.%3A%C2%91%1C%1C%1C%C2%A0P%28%042%0DYO%11%C2%89%C3%88t%C2%9DR%C2%8F%C2%8E%C2%8EP%2A%C2%95%20%C2%A5lK%C2%BB%C2%B5%C3%B2%C2%94R%28%C2%97%C3%8B%18%1E%1E%C3%86%C2%87%0F%1F%C3%8C%C2%98%C2%94%12%C2%A5R%09GGG%C2%BE%3Du%C2%AF%C3%9FO%C3%96%1F%C2%BD%C2%94%C3%92t%C3%87q%20%C2%A5D%3E%C2%9F%C2%87%10%C2%A2mNkY%16%C2%A4%C2%94%C3%A63%12%C2%89%00%002%C2%99%0C%1C%C3%87%C2%81%C3%A7y%C3%864%C3%B2%C3%B9%C2%BCoO%C3%9D%C3%AB%C3%B7%C2%B4jS%C3%A5%C3%96%C3%96%16677%C2%A1%C2%942%C2%A5%C2%8E%10%02_%C2%BF~%053%076%07%7D%C2%AC%17%17%17%C2%98%C2%9A%C2%9AjH%C3%A0%C2%B5%2Fh%C3%82%C2%B4%C2%B3%C2%B3%C2%83%C2%9B%C2%9B%1B%C2%B3Vc%C2%98%C2%99%C2%99%C3%81%C3%8A%C3%8A%C2%8A%C3%99%C3%9B%C3%92G%07%00%C3%9F%C2%BE%7DC6%C2%9B%C3%BD%C3%A3%11%C2%B7%2A%C2%85j%C2%8F%C3%B1%C3%AE%C3%AE%C3%AE%C2%8F%C3%B2je%16%C2%8BE%14%C2%8B%C3%85G%C3%B3%5D%5D%5D%C2%BEuO%22%3FA%C2%A2K3f%C3%B6%C2%B7%5C%C3%99%C3%92%C2%82%01%C2%A0%C2%AF%C2%AF%0F%C2%93%C2%93%C2%93%0DM%C2%A2X%2C%C2%9Ac%C2%8CD%22%18%1D%1DmX%C3%93%5D%5E%5E%C3%A2%C3%AE%C3%AE%C3%8E%C2%ACm%05L%C2%AF%C3%AB%C3%AA%C3%AA%C3%82%C3%80%C3%80%C3%80%23%C2%93%C2%88%C3%87%C3%A3%C2%A8%C3%85%18%285%2F%2F%2F%1B%22%23%C2%84%60%C3%87q%C3%B8%C3%B6%C3%B6%C2%B6%C3%A1%C3%9A%C3%A9%C3%A9i_%C3%B2h%C3%955%C2%BFX%5E%5En%3F5%C3%97%C2%87%C2%B5J%C2%A5%02%22B%3C%1E7sJ%29T%2A%15%7C%C3%BA%C3%B4%09%00P.%C2%97%7D%C3%A1H%C2%97G%C3%AD%C2%84%3EfF%3C%1E%C3%B7%C3%AD%C3%B9WaM%C2%87%C2%A3d2%C2%89h4%0A%222%C2%A1%C3%A8%C3%B3%C3%A7%C3%8F8%3F%3FG%24%121c%C2%8D%C3%82P%2Bs%20%22D%C2%A3Q%24%C2%93I%C3%9F%C2%9E%C3%8D%C3%A4%C3%89VY%C3%8A%C3%B3%3C%C3%84b1%C3%8C%C3%8E%C3%8E%C2%9Ar%08%00%5C%C3%97%C3%85%C2%BBw%C3%AFP%28%14L%26k%C2%B7nSJ%C2%81%C2%991%3B%3B%C2%8BX%2Cf%C3%BE%C3%B8%C2%93%C2%8BPf%C3%86%C3%BA%C3%BA%C2%BA%C3%89t%C2%9A%0B%C3%BC%C3%BC%C3%B9%C3%93p%C2%84H%24%C3%92V%C2%AD%C2%A6%C2%9DMJ%C2%89%C3%B5%C3%B5%C3%B5%C3%80%19T%06%C3%91%02%11app%10%C2%99L%06%C2%9E%C3%A7%C3%81q%1C%03%C3%BA%C3%B6%C3%B6%16%C3%A3%C3%A3%C3%A3X%5C%5C%C3%84%C3%8D%C3%8DM%60%C3%80%C2%B6m%C3%83%C3%B3%3Cd2%19%0C%0E%0E%1A%C3%BF%08%C2%A5%C2%A6kD%C3%A05%09%C2%AF%27%C3%A8%C3%91h%C3%B4%C2%8FQAG%C2%9Bg%25%C3%B0%C2%B5%09%60oo%0F%C3%A9t%1A%C2%95J%C3%85%C2%8C%0B%21%60Y%16%C2%88%08%C2%A5R%C2%A9%C2%A9%0C%5D%C3%B2%C2%BB%C2%AE%C2%8Bt%3A%C2%8D%C2%BD%C2%BD%3D%C3%A3%2B%C2%81%C2%9D5%C3%8C%22%C2%B4%C2%BEl%C3%92u%C3%9C%C2%8B%14%C2%A1%C2%AF%C2%A5%C3%8Co%C2%9BK%C3%A8%C2%A3%C3%B3%3C%0F%C2%89D%02%C3%9B%C3%9B%C3%9B%C2%BE%C2%8B%C2%94%C3%BD%C3%BD%7D%C3%BC%C3%BA%C3%B5%0B%00%C3%B0%C3%A6%C3%8D%1B%C3%8C%C3%8D%C3%8D%C2%BD%C3%ACEJ%C3%BD%15k%7D%1D%C2%96L%26%C2%8DV%C2%93%C3%89%C3%A4%C2%A3%C3%BA%C3%B0%29W%C2%AFO%C2%BEn%C3%95%C2%8E%C2%A8S%C2%B2%C2%94%12%C2%AE%C3%AB%C2%9Ay%C3%97uM%C3%8A%C2%B6%2C%2B%C2%94%C3%9B%C3%B9P%C2%AE%5BkSj%C2%AD%C2%B7%C3%97F%C2%8F%C2%A7%5C%00%3E%C3%AB%C3%BD%C2%B0R%C3%8A%C2%84%C2%AF%C3%A7x%C3%9F%11%3A%C3%A0%C3%BB%C3%BB%7B%C3%83%C3%98%C3%AE%C3%AF%C3%AF_%2F%60m%0A%C3%B3%C3%B3%C3%B3%18%18%18%00%00%C3%B4%C3%B7%C3%B7%C3%BB%C3%89%C3%B7k%04%C2%BC%C2%B2%C2%B2%C3%92t%C3%AE%C3%95%C2%BE%C3%A3x%C2%AE%17%C2%8B%06%C3%B0%C3%89%C3%89%C3%89%3F%C3%B3%C3%AA%C3%B6%3F%C2%81W%1B%C3%91r_%2C%C2%AD%00%00%00%00IEND%C2%AEB%60%C2%82",
    "longcross": "%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%2C%00%00%00%2C%08%06%00%00%00%1E%C2%84Z%01%00%00%01~IDATx%C3%9A%C3%AD%C2%98%3F%C2%AA%C3%82%40%10%C3%86%C2%BF%C2%8C%0B%229%C2%80%C3%97%C2%B0%C2%B5J%C2%AC%C3%84j%C3%ADl%3D%C2%85%C3%A0m%3C%C2%82Vv%C2%9BXy%C2%A2%60%C2%91%C2%B0%C3%B3%C2%8A%C3%87%2C%3E%C3%88%2B4%1B%C3%88%C3%82%0C%04%C2%86%1D%12~%7C%C2%99%C3%BD%C3%B6O%C3%A6%C2%9Cc%24%14%06%006%C2%9BM%12%C2%B0UU%C2%81%C2%90X%28%C2%B0%02%2B%C2%B0%02%2B%C3%B0%04V%C2%BA%C2%98%C3%A1%C2%BD%C2%87%C3%B7%C3%BEW%0D%22%10%C3%91%C2%B4%C2%81%C3%87%C2%80%1C%05%C3%98%7B%0F%22%C3%82%C3%ADv%C3%83%C3%B5z%05%00%C3%AC%C3%B7%7BXkCm%C2%92%C3%80%C3%8F%C3%A7%13%C2%97%C3%8B%05%00%C2%B0%5C.%C2%A7%0B%2C%C2%91%C3%A79%C2%8C1%21Ob%C3%92u%5D%17r%C2%B5%C2%B5%C3%BF%2C%C3%A9%C3%93%C3%A8SU%C3%94%C2%96%C3%9A7%C2%91e%19f%C2%B3Y%3F%C3%B0%10K%C3%AA%C3%AB%5B%C3%A9g%C2%A9ESXf%C3%B1%C3%A3%C3%B1%40%5D%C3%97%20%C2%A2%C2%8F%C2%95%C2%96o%C3%94u%1D%C3%86%C3%AE%C3%B7%3B%5E%C2%AF%C3%97W.%21%0C%C2%AB%C3%95%2A8%0D%00%C3%809%C3%87m%C3%9B23%C3%B3%C3%B9%7Cf%00%C2%93z%0E%C2%87%0333%C2%B7m%C3%8B%C3%8E9Ns%C3%92%C3%89%C3%AF%C3%9An%C2%B7%C2%98%C3%8F%C3%A7%C2%83%5BB%C3%9A%C2%A2%2CK%C2%94e9%C2%B8%25%C3%9E%19%C3%BF%00%17E%C2%81%C2%A2%28%06%29%C2%B0X%2C%02%C3%B0n%C2%B7%C3%83%C3%A9t%C2%8A%C2%B6G%C2%89nk%C3%86%184M%13%C3%86%C2%9A%C2%A6%09%C2%B6%C3%B6%C2%ADS%C2%8Cfkbm%C3%AF%C3%AF%13Q%00%C2%8Dem%C2%BA%C2%81%7FWu%C2%8C%7Dqt%60%C3%A9%5B%C3%89%27%0B%2Cj%C2%AE%C3%97k%1C%C2%8F%C3%87%C2%90%C3%87V%3A%3A%C2%B0%C2%B5%16%C3%96%C3%9A%C3%9E%C2%9A%1EBS8%C2%84%C3%AAE%C2%8A%02%2B%C2%B0%02%2B%C2%B0%02%7F%C2%BE%C3%92UU%C2%95%0C%C3%B0%0F%C3%AE%1C%C3%A4%C2%89%C3%80%C2%84%C3%8B%C3%9F%00%00%00%00IEND%C2%AEB%60%C2%82",
    "tee": "%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%2C%00%00%00%2C%08%06%00%00%00%1E%C2%84Z%01%00%00%01lIDATx%C3%9A%C3%AD%C3%98A%C2%8A%C3%820%14%06%C3%A0%C3%BF%25%C2%A2%07%C3%90%C2%85%20%C2%82%C2%AE%C2%A4%C3%87%10%2F%22%C2%82%C3%87p%C3%A1M%3CIz%0D%C3%B7%22%C2%B8%C3%8D%C2%AAHi~7%C2%93N%1Dg%C2%95vf%2C%C3%B3%02%C2%85%C2%94%C2%90%C3%97%C2%8F%C2%97%C3%974T%C2%9CsD%C2%8F%C3%9A%00%00%C3%96%C3%ABu%2F%C2%B0y%C2%9E%C3%83%C2%A0gM%C3%81%0AV%C2%B0%C2%82%15%C2%AC%60%05%2B%C3%B8_%C2%81%07%C3%8D%1B%C2%92%20%C3%9F%C3%ABx%2C%22%10%C2%91%C3%AF%C3%81_%07%C3%9F6%C3%83%24%21%22%C2%B8%C3%9Dn%C3%B0%C3%9ECD%C3%BE%3C%C3%93%C3%910%C2%99L0%1E%C2%8F%3F%3D%C3%8E9%C2%96eI%C2%92%C3%9C%C3%ADv%C2%B4%C3%96r4%1A%C3%91Z%C2%9Bt%19c%08%C2%80%00h%C2%8CI%C2%8E%13%0D%C3%87%C3%A3%C2%91%24Y%C2%96%25%C2%9Ds%7C%2A%C2%89%C2%A2%28PU%15%C2%AA%C2%AA%C3%AA%24K%21%C2%84%C3%A4%C2%B9%C3%91p%C2%BF%C3%9F_K%C3%82Z%0B%008%1C%0E%C3%98%C3%AF%C3%B7I%25%11B%C2%801%06%C2%97%C3%8B%05%C3%9B%C3%AD%16%00p%3A%C2%9D0%C2%9F%C3%8F%C3%AB%C2%B1%C2%94%C2%92X%2C%16h%1A%07q%10%00%C2%B2%2CC%C2%96e%C2%AD%C2%B2z%C2%BD%5E%C3%AB%C3%BEf%C2%B3%C3%81l6%C3%AB%C2%AC%C2%A6_v%C2%89%10B%C3%B2%C3%8B%16%C2%B3%C3%A8%C2%BD%C2%AFcx%C3%AF1%C2%9DN%C2%932%C3%9C%C2%846%C3%A7%3E%C2%81S%C2%836%03%C3%87%C2%A5%C2%8B%C3%8Bh%C2%AD%7Dyhg%1F%C2%8EV%C2%9F%C3%8C%0F%C3%90r%C2%B9%C3%84%C3%B9%7C%C2%AE%C3%BBm%13%C3%B1c%C3%A0%C3%98%C2%86%C3%83%21V%C2%ABU%C2%BF%C3%8E%12%21%C2%84V%5B%C3%9A%C2%AFf%C2%B8%C3%AB%12%C3%90%C3%A3%C2%A5%C2%82%15%C2%AC%60%05%2BX%C3%81%0AV0%C3%BA%C3%B6%C2%AB%2A%C3%8F%C3%B3%C3%9E%C2%80%1F%C2%A0M%C2%AB%7F.%C2%8C1%C3%8E%00%00%00%00IEND%C2%AEB%60%C2%82"
};

main();
