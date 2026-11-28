// ============================================================
//  BUAT CHANNEL KAOS — Spot Color Channel untuk Pecah Warna
//  Cara pakai: File > Scripts > Browse > pilih file ini
// ============================================================

#target photoshop

(function () {

    if (!app.documents.length) {
        alert("Tidak ada dokumen yang terbuka.\nBuka file desain Anda terlebih dahulu.", "Buat Channel Kaos");
        return;
    }

    var doc = app.activeDocument;

    var mode = doc.mode;
    if (mode == DocumentMode.BITMAP || mode == DocumentMode.INDEXEDCOLOR) {
        alert("Mode dokumen tidak mendukung Spot Color Channel.\nUbah dulu ke mode RGB atau CMYK.", "Buat Channel Kaos");
        return;
    }

    // Simpan foreground semula
    var fgSebelum = new SolidColor();
    fgSebelum.rgb.red   = app.foregroundColor.rgb.red;
    fgSebelum.rgb.green = app.foregroundColor.rgb.green;
    fgSebelum.rgb.blue  = app.foregroundColor.rgb.blue;

    // Default putih di color picker
    var putih = new SolidColor();
    putih.rgb.red = putih.rgb.green = putih.rgb.blue = 255;
    app.foregroundColor = putih;

    // Tampilkan color picker
    var dipilih = app.showColorPicker();
    if (!dipilih) {
        app.foregroundColor = fgSebelum;
        return;
    }

    // Simpan warna pilihan user (HSB, sesuai struktur AChn)
    var h = app.foregroundColor.hsb.hue;
    var s = app.foregroundColor.hsb.saturation;
    var br = app.foregroundColor.hsb.brightness;
    var r = app.foregroundColor.rgb.red;
    var g = app.foregroundColor.rgb.green;
    var b = app.foregroundColor.rgb.blue;

    // Kembalikan foreground semula
    app.foregroundColor = fgSebelum;

    // --------------------------------------------------------
    //  Step 1: Buat alpha channel baru dulu
    // --------------------------------------------------------
    var newChan = doc.channels.add();
    newChan.name = "Kaos";

    // --------------------------------------------------------
    //  Step 2: Set channel -> Spot Color, warna, solidity 100
    //  Struktur sesuai hasil diagnosa: AChn { Nm, Clr(HSBColorClass), Opct, ClrI }
    // --------------------------------------------------------
    try {

        var idSet = stringIDToTypeID("set");
        var desc  = new ActionDescriptor();

        // Reference ke channel aktif
        var ref = new ActionReference();
        ref.putEnumerated(
            charIDToTypeID("Chnl"),
            charIDToTypeID("Ordn"),
            charIDToTypeID("Trgt")
        );
        desc.putReference(charIDToTypeID("null"), ref);

        // Object "alphaChannelOptions"
        var achn = new ActionDescriptor();

        // Nama
        achn.putString(charIDToTypeID("Nm  "), "Kaos");

        // Warna (HSBColorClass)
        var hsbDesc = new ActionDescriptor();
        hsbDesc.putUnitDouble(charIDToTypeID("H   "), charIDToTypeID("#Ang"), h);
        hsbDesc.putDouble(charIDToTypeID("Strt"), s);
        hsbDesc.putDouble(charIDToTypeID("Brgh"), br);
        achn.putObject(charIDToTypeID("Clr "), stringIDToTypeID("HSBColorClass"), hsbDesc);

        // Opacity / Solidity = 100
        achn.putInteger(charIDToTypeID("Opct"), 100);

        // colorIndicates = spot
        achn.putEnumerated(
            charIDToTypeID("ClrI"),
            stringIDToTypeID("maskIndicator"),
            stringIDToTypeID("spot")
        );

        desc.putObject(charIDToTypeID("T   "), stringIDToTypeID("channel"), achn);

        executeAction(idSet, desc, DialogModes.NO);

        alert("Channel Spot Color \"Kaos\" berhasil dibuat!\n\nSolidity : 100%\nWarna    : RGB(" + Math.round(r) + ", " + Math.round(g) + ", " + Math.round(b) + ")", "Buat Channel Kaos");

    } catch (e) {
        // Hapus channel yang gagal dikonversi
        try { newChan.remove(); } catch(e2) {}
        alert("Gagal membuat channel.\nDetail: " + e.message, "Error");
    }

})();