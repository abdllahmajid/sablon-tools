#target photoshop

// =============================================================================
// LAYOUT FILM - HEMAT KERTAS
// Menyusun banyak film hasil split (lengkap dengan register) ke satu lembar.
//
// Cara kerja:
//   1. Pilih spot channel dari dokumen yang terbuka (TIDAK perlu split / buka file lain)
//   2. Tiap channel diambil jadi film sementara, lalu dipangkas ke area isinya
//      (area putih kosong dibuang, register tetap ikut)
//   3. Film disusun sepadat mungkin (algoritma MaxRects), boleh diputar 90 derajat
//   4. Kalau satu lembar tidak cukup, otomatis dibuat lembar ke-2, ke-3, dst
//
// Asumsi: di channel, hitam = tinta (sama seperti AutoRegisterSpot), kertas putih.
// Dokumen asli tidak diubah isinya. Hasil dibuka sebagai dokumen baru (belum disimpan).
// =============================================================================

// ===== PENGATURAN DASAR (bisa diubah di sini) =====
var CUT_LINE_MM = 0.2;                                  // tebal garis potong (mm)


// =============================================================================
// DIALOG
// =============================================================================
function showDialog() {
    var presets = [
        {label: "A4 (21 x 29.7 cm)", w: 21, h: 29.7},
        {label: "F4 / Folio (21.5 x 33 cm)", w: 21.5, h: 33},
        {label: "A3 (29.7 x 42 cm)", w: 29.7, h: 42},
        {label: "A3+ (32.3 x 49.7 cm)", w: 32.3, h: 49.7},
        {label: "Custom (isi manual)", w: null, h: null}
    ];

    var dlg = new Window("dialog", "Layout Film - Hemat Kertas");
    dlg.orientation = "column";
    dlg.alignChildren = "fill";
    dlg.margins = 18;
    dlg.spacing = 12;
    dlg.preferredSize.width = 380;

    var title = dlg.add("statictext", undefined, "Susun beberapa film dalam satu lembar");
    title.graphics.font = ScriptUI.newFont(title.graphics.font.name, "BOLD", 13);

    // ===== Sumber: spot channel dari dokumen terbuka =====
    var chItems = [];
    var multiDoc = (app.documents.length > 1);
    var di, cj, dd;
    for (di = 0; di < app.documents.length; di++) {
        dd = app.documents[di];
        for (cj = 0; cj < dd.channels.length; cj++) {
            if (dd.channels[cj].kind === ChannelType.SPOTCOLOR) {
                chItems.push({
                    doc: dd,
                    idx: cj,
                    name: dd.channels[cj].name,
                    label: multiDoc ? (baseName(dd.name) + "_" + dd.channels[cj].name) : dd.channels[cj].name
                });
            }
        }
    }
    if (chItems.length === 0) {
        alert("Tidak ditemukan spot channel di dokumen yang terbuka.");
        return null;
    }

    var srcPanel = dlg.add("panel", undefined, "Channel yang Mau Disusun");
    srcPanel.orientation = "column";
    srcPanel.alignChildren = "fill";
    srcPanel.margins = [12, 14, 12, 10];
    srcPanel.spacing = 6;

    var listLabels = [];
    for (var li = 0; li < chItems.length; li++) {
        listLabels.push(multiDoc ? (baseName(chItems[li].doc.name) + "   \u203A   " + chItems[li].name) : chItems[li].name);
    }
    var lb = srcPanel.add("listbox", undefined, listLabels, {multiselect: true});
    lb.preferredSize.width = 340;
    lb.preferredSize.height = Math.min(Math.max(chItems.length, 3), 10) * 20 + 10;

    var activeRef = null;
    try { activeRef = app.activeDocument; } catch (eA) {}
    var anySel = false;
    for (var si = 0; si < chItems.length; si++) {
        if (activeRef !== null && chItems[si].doc == activeRef) {
            lb.items[si].selected = true;
            anySel = true;
        }
    }
    if (!anySel) {
        for (var sj = 0; sj < lb.items.length; sj++) lb.items[sj].selected = true;
    }

    var selGrp = srcPanel.add("group");
    var btnAll = selGrp.add("button", undefined, "Pilih Semua");
    var btnNone = selGrp.add("button", undefined, "Kosongkan");
    btnAll.onClick = function () {
        for (var q = 0; q < lb.items.length; q++) lb.items[q].selected = true;
    };
    btnNone.onClick = function () { lb.selection = null; };
    selGrp.add("statictext", undefined, "(Ctrl/Shift + klik untuk memilih beberapa)");

    // ===== Kertas =====
    var paperPanel = dlg.add("panel", undefined, "Ukuran Kertas Cetak");
    paperPanel.orientation = "column";
    paperPanel.alignChildren = "fill";
    paperPanel.margins = [12, 14, 12, 12];
    paperPanel.spacing = 8;

    var presetGrp = paperPanel.add("group");
    presetGrp.add("statictext", undefined, "Preset:");
    var labels = [];
    for (var i = 0; i < presets.length; i++) labels.push(presets[i].label);
    var dropdown = presetGrp.add("dropdownlist", undefined, labels);
    dropdown.selection = 2; // A3
    dropdown.preferredSize.width = 220;

    var sizeGrp = paperPanel.add("group");
    sizeGrp.alignChildren = "center";
    sizeGrp.add("statictext", undefined, "Lebar (cm)");
    var inputW = sizeGrp.add("edittext", undefined, "29.7");
    inputW.characters = 6;
    var swapBtn = sizeGrp.add("button", undefined, "\u21C4");
    swapBtn.preferredSize.width = 28;
    sizeGrp.add("statictext", undefined, "Tinggi (cm)");
    var inputH = sizeGrp.add("edittext", undefined, "42");
    inputH.characters = 6;

    var setCustom = function () { dropdown.selection = presets.length - 1; };
    dropdown.onChange = function () {
        var sel = presets[dropdown.selection.index];
        if (sel.w !== null) {
            inputW.text = sel.w.toString();
            inputH.text = sel.h.toString();
        }
    };
    inputW.onChanging = setCustom;
    inputH.onChanging = setCustom;
    swapBtn.onClick = function () {
        var t = inputW.text; inputW.text = inputH.text; inputH.text = t; setCustom();
    };

    var chkAutoOrient = paperPanel.add("checkbox", undefined,
        "Pilih orientasi kertas otomatis (mana yang lebih hemat)");
    chkAutoOrient.value = true;

    // ===== Jarak =====
    var spacePanel = dlg.add("panel", undefined, "Jarak");
    spacePanel.orientation = "row";
    spacePanel.alignChildren = "center";
    spacePanel.margins = [12, 14, 12, 12];
    spacePanel.spacing = 8;
    spacePanel.add("statictext", undefined, "Antar film (mm):");
    var inputGap = spacePanel.add("edittext", undefined, "4");
    inputGap.characters = 5;
    spacePanel.add("statictext", undefined, "Tepi kertas (mm):");
    var inputMargin = spacePanel.add("edittext", undefined, "5");
    inputMargin.characters = 5;

    // ===== Opsi =====
    var optPanel = dlg.add("panel", undefined, "Opsi");
    optPanel.orientation = "column";
    optPanel.alignChildren = "left";
    optPanel.margins = [12, 14, 12, 12];
    var chkRotate = optPanel.add("checkbox", undefined, "Boleh memutar film 90\u00B0 (lebih hemat)");
    chkRotate.value = true;
    var chkCut = optPanel.add("checkbox", undefined, "Tambahkan garis potong tipis di sekeliling film");
    chkCut.value = true;

    // ===== Tombol =====
    var btnGroup = dlg.add("group");
    btnGroup.alignment = "right";
    var btnCancel = btnGroup.add("button", undefined, "Batal", {name: "cancel"});
    var btnOK = btnGroup.add("button", undefined, "Susun Layout", {name: "ok"});
    btnOK.preferredSize.width = 120;

    var result = null;

    btnOK.onClick = function () {
        var wVal = parseFloat(inputW.text.replace(",", "."));
        var hVal = parseFloat(inputH.text.replace(",", "."));
        var gapVal = parseFloat(inputGap.text.replace(",", "."));
        var marVal = parseFloat(inputMargin.text.replace(",", "."));

        if (isNaN(wVal) || isNaN(hVal) || wVal <= 0 || hVal <= 0) {
            alert("Lebar dan tinggi kertas harus angka lebih dari 0.");
            return;
        }
        if (isNaN(gapVal) || isNaN(marVal) || gapVal < 0 || marVal < 0) {
            alert("Jarak antar film dan tepi kertas harus angka 0 atau lebih.");
            return;
        }
        if ((marVal * 2) >= wVal * 10 || (marVal * 2) >= hVal * 10) {
            alert("Jarak tepi kertas terlalu besar untuk ukuran kertas ini.");
            return;
        }
        if (lb.selection === null || lb.selection.length === 0) {
            alert("Pilih minimal satu channel.");
            return;
        }

        result = {
            selected: [],
            widthCM: wVal,
            heightCM: hVal,
            gapMM: gapVal,
            marginMM: marVal,
            autoOrient: chkAutoOrient.value,
            allowRotate: chkRotate.value,
            cutLines: chkCut.value
        };
        for (var k2 = 0; k2 < lb.selection.length; k2++) {
            result.selected.push(chItems[lb.selection[k2].index]);
        }
        dlg.close();
    };
    btnCancel.onClick = function () { dlg.close(); };

    dlg.show();
    return result;
}


// =============================================================================
// PACKER (MaxRects, heuristik Best Short Side Fit)
// =============================================================================
function Packer(w, h) {
    this.free = [{x: 0, y: 0, w: w, h: h}];
}

Packer.prototype.insert = function (w, h, allowRotate) {
    var best = null;
    var i, r, f, ow, oh, lh, lv, sh, lo;
    for (i = 0; i < this.free.length; i++) {
        f = this.free[i];
        for (r = 0; r < (allowRotate ? 2 : 1); r++) {
            ow = (r === 0) ? w : h;
            oh = (r === 0) ? h : w;
            if (ow <= f.w && oh <= f.h) {
                lh = Math.abs(f.w - ow);
                lv = Math.abs(f.h - oh);
                sh = Math.min(lh, lv);
                lo = Math.max(lh, lv);
                if (best === null || sh < best.sh || (sh === best.sh && lo < best.lo)) {
                    best = {x: f.x, y: f.y, w: ow, h: oh, rot: (r === 1), sh: sh, lo: lo};
                }
            }
        }
    }
    if (best === null) return null;
    this.place(best);
    return best;
};

function rectContains(a, b) { // apakah a memuat b sepenuhnya
    return b.x >= a.x && b.y >= a.y && (b.x + b.w) <= (a.x + a.w) && (b.y + b.h) <= (a.y + a.h);
}

Packer.prototype.place = function (n) {
    var out = [];
    var i, f;
    for (i = 0; i < this.free.length; i++) {
        f = this.free[i];
        if (n.x >= f.x + f.w || n.x + n.w <= f.x || n.y >= f.y + f.h || n.y + n.h <= f.y) {
            out.push(f);
            continue;
        }
        if (n.x < f.x + f.w && n.x + n.w > f.x) {
            if (n.y > f.y && n.y < f.y + f.h) {
                out.push({x: f.x, y: f.y, w: f.w, h: n.y - f.y});
            }
            if (n.y + n.h < f.y + f.h) {
                out.push({x: f.x, y: n.y + n.h, w: f.w, h: f.y + f.h - (n.y + n.h)});
            }
        }
        if (n.y < f.y + f.h && n.y + n.h > f.y) {
            if (n.x > f.x && n.x < f.x + f.w) {
                out.push({x: f.x, y: f.y, w: n.x - f.x, h: f.h});
            }
            if (n.x + n.w < f.x + f.w) {
                out.push({x: n.x + n.w, y: f.y, w: f.x + f.w - (n.x + n.w), h: f.h});
            }
        }
    }
    // buang ruang kosong yang sudah tercakup ruang lain
    var keep = [];
    var a, b, covered;
    for (a = 0; a < out.length; a++) {
        covered = false;
        for (b = 0; b < out.length; b++) {
            if (a !== b && rectContains(out[b], out[a]) &&
                (!rectContains(out[a], out[b]) || b < a)) {
                covered = true;
                break;
            }
        }
        if (!covered) keep.push(out[a]);
    }
    this.free = keep;
};


// =============================================================================
// PERENCANAAN LAYOUT
// =============================================================================
function tryPlan(items, W, H, marginPx, gapPx, allowRotate, sortFn) {
    // Tiap film "dibesarkan" sebesar gap, area kerja ditambah gap,
    // sehingga jarak antar film otomatis = gap dan tepi kertas = margin.
    var innerW = W - (2 * marginPx) + gapPx;
    var innerH = H - (2 * marginPx) + gapPx;

    var list = items.slice(0);
    list.sort(sortFn);

    var sheets = [];
    var unplaced = [];
    var i, s, it, pos, placed, np;

    for (i = 0; i < list.length; i++) {
        it = list[i];
        placed = false;

        for (s = 0; s < sheets.length && !placed; s++) {
            pos = sheets[s].packer.insert(it.wPx + gapPx, it.hPx + gapPx, allowRotate);
            if (pos) {
                sheets[s].placements.push(makePlacement(it, pos, marginPx, gapPx));
                placed = true;
            }
        }

        if (!placed) {
            np = {packer: new Packer(innerW, innerH), placements: []};
            pos = np.packer.insert(it.wPx + gapPx, it.hPx + gapPx, allowRotate);
            if (pos) {
                np.placements.push(makePlacement(it, pos, marginPx, gapPx));
                sheets.push(np);
            } else {
                unplaced.push(it);
            }
        }
    }
    return {sheets: sheets, unplaced: unplaced, W: W, H: H};
}

function makePlacement(it, pos, marginPx, gapPx) {
    return {
        item: it,
        x: pos.x + marginPx,
        y: pos.y + marginPx,
        w: pos.w - gapPx,
        h: pos.h - gapPx,
        rot: pos.rot
    };
}

function bestPlan(items, paperW, paperH, marginPx, gapPx, cfg) {
    var orientations = [[paperW, paperH]];
    if (cfg.autoOrient && paperW !== paperH) orientations.push([paperH, paperW]);

    var sorters = [
        function (a, b) { return (b.wPx * b.hPx) - (a.wPx * a.hPx); },
        function (a, b) { return b.hPx - a.hPx; },
        function (a, b) { return b.wPx - a.wPx; },
        function (a, b) { return Math.max(b.wPx, b.hPx) - Math.max(a.wPx, a.hPx); }
    ];

    var best = null, bestScore = 0;
    var o, s, plan, score;
    for (o = 0; o < orientations.length; o++) {
        for (s = 0; s < sorters.length; s++) {
            plan = tryPlan(items, orientations[o][0], orientations[o][1],
                           marginPx, gapPx, cfg.allowRotate, sorters[s]);
            // makin sedikit film gagal & lembar, makin bagus
            score = (plan.unplaced.length * 100000) + (plan.sheets.length * 1000);
            if (best === null || score < bestScore) {
                best = plan;
                bestScore = score;
            }
        }
    }
    return best;
}


// =============================================================================
// SUMBER FILM
// =============================================================================
function baseName(n) {
    return n.replace(/\.[^\.]+$/, "");
}

function closeQuiet(doc) {
    try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
}

// Ambil satu spot channel jadi film sementara (grayscale, putih = kosong, hitam = tinta)
function prepareFilm(src) {
    var sd = src.doc;
    var name = src.label;
    var doc = null;
    try {
        app.activeDocument = sd;
        var origActive = null;
        try { origActive = sd.activeChannels; } catch (e0) {}

        sd.activeChannels = [sd.channels[src.idx]];
        sd.selection.selectAll();
        sd.selection.copy();
        sd.selection.deselect();
        if (origActive) { try { sd.activeChannels = origActive; } catch (e00) {} }

        doc = app.documents.add(Math.round(sd.width.as("px")), Math.round(sd.height.as("px")),
            sd.resolution, "film_tmp", NewDocumentMode.GRAYSCALE, DocumentFill.WHITE);
        app.activeDocument = doc;
        doc.paste();
    } catch (e) {
        if (doc) closeQuiet(doc);
        return {error: "gagal mengambil channel (" + e.message + ")", name: name};
    }

    try { doc.flatten(); } catch (e1) {}

    // Cek apakah pojok kiri-atas gelap (film terbalik: tinta putih di atas hitam)
    var inverted = false;
    try {
        var cs = doc.colorSamplers.add([1, 1]);
        var c = cs.color.rgb;
        inverted = ((c.red + c.green + c.blue) / 3) < 128;
        cs.remove();
    } catch (e2) {}

    try {
        doc.trim(TrimType.TOPLEFT, true, true, true, true);
    } catch (e3) {
        closeQuiet(doc);
        return {error: "kosong atau gagal dipangkas", name: name};
    }

    var w = doc.width.as("px");
    var h = doc.height.as("px");
    if (w < 10 || h < 10) {
        closeQuiet(doc);
        return {error: "isi film kosong", name: name};
    }

    return {
        item: {doc: doc, name: name, w: w, h: h, res: doc.resolution},
        inverted: inverted
    };
}


// =============================================================================
// BUAT LEMBAR HASIL
// =============================================================================
function buildSheets(plan, sheetRes, gapPx, marginPx, cfg, createdSheets) {
    var black = new SolidColor();
    black.rgb.hexValue = "000000";

    var total = plan.sheets.length;
    var n, p, pl, it, sd, newLayer, b;

    for (n = 0; n < total; n++) {
        sd = app.documents.add(plan.W, plan.H, sheetRes,
            "Layout_Film_" + (n + 1) + "_dari_" + total,
            NewDocumentMode.GRAYSCALE, DocumentFill.WHITE);
        createdSheets.push(sd);

        for (p = 0; p < plan.sheets[n].placements.length; p++) {
            pl = plan.sheets[n].placements[p];
            it = pl.item;

            app.activeDocument = it.doc;
            newLayer = it.doc.artLayers[0].duplicate(sd, ElementPlacement.PLACEATBEGINNING);

            app.activeDocument = sd;
            sd.activeLayer = newLayer;
            newLayer.name = it.name;

            // samakan ukuran fisik kalau resolusi film berbeda dengan lembar
            if (Math.abs(it.scale - 1) > 0.005) {
                newLayer.resize(it.scale * 100, it.scale * 100, AnchorPosition.TOPLEFT);
            }
            if (pl.rot) {
                newLayer.rotate(90, AnchorPosition.MIDDLECENTER);
            }

            // Multiply: bagian putih film tidak menimpa film tetangga
            newLayer.blendMode = BlendMode.MULTIPLY;

            b = newLayer.bounds;
            newLayer.translate(pl.x - b[0].value, pl.y - b[1].value);
        }

        if (cfg.cutLines) {
            var cutLayer = sd.artLayers.add();
            cutLayer.name = "Garis_Potong";
            cutLayer.blendMode = BlendMode.MULTIPLY;
            sd.activeLayer = cutLayer;

            var half = Math.min(gapPx / 2, marginPx);
            var lw = Math.max(1, Math.round((CUT_LINE_MM * sheetRes) / 25.4));

            for (p = 0; p < plan.sheets[n].placements.length; p++) {
                pl = plan.sheets[n].placements[p];
                var x1 = pl.x - half, y1 = pl.y - half;
                var x2 = pl.x + pl.w + half, y2 = pl.y + pl.h + half;
                sd.selection.select([[x1, y1], [x2, y1], [x2, y2], [x1, y2]]);
                sd.selection.stroke(black, lw, StrokeLocation.CENTER, ColorBlendMode.NORMAL, 100, false);
            }
            sd.selection.deselect();
        }
    }
}


// =============================================================================
// MAIN
// =============================================================================
function main() {
    var cfg = showDialog();
    if (cfg === null) return;

    var origRuler = app.preferences.rulerUnits;
    var origDialogs = app.displayDialogs;
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    var items = [];
    var skipped = [];
    var invertedCount = 0;
    var createdSheets = [];
    var message = null;

    try {
        var sources = cfg.selected;
        if (sources.length === 0) {
            message = "Tidak ada channel yang dipilih.";
            return;
        }

        var i, r;
        for (i = 0; i < sources.length; i++) {
            r = prepareFilm(sources[i]);
            if (r.error) {
                skipped.push(r.name + " - " + r.error);
            } else {
                items.push(r.item);
                if (r.inverted) invertedCount++;
            }
        }
        if (items.length === 0) {
            message = "Tidak ada film yang bisa diproses.\n\n" + skipped.join("\n");
            return;
        }

        // Resolusi lembar mengikuti film pertama; film lain disesuaikan skalanya
        var sheetRes = items[0].res;
        var paperW = Math.round((cfg.widthCM * sheetRes) / 2.54);
        var paperH = Math.round((cfg.heightCM * sheetRes) / 2.54);
        var marginPx = Math.round((cfg.marginMM * sheetRes) / 25.4);
        var gapPx = Math.round((cfg.gapMM * sheetRes) / 25.4);

        var filmArea = 0;
        for (i = 0; i < items.length; i++) {
            items[i].scale = sheetRes / items[i].res;
            items[i].wPx = Math.round(items[i].w * items[i].scale);
            items[i].hPx = Math.round(items[i].h * items[i].scale);
            filmArea += items[i].wPx * items[i].hPx;
        }

        var plan = bestPlan(items, paperW, paperH, marginPx, gapPx, cfg);

        if (plan.sheets.length === 0) {
            message = "Semua film lebih besar dari kertas yang dipilih, jadi tidak ada yang bisa disusun.\n" +
                      "Coba pilih kertas yang lebih besar atau kecilkan jarak tepi.";
            return;
        }

        buildSheets(plan, sheetRes, gapPx, marginPx, cfg, createdSheets);

        // ===== Ringkasan =====
        var placedCount = items.length - plan.unplaced.length;
        var rotatedCount = 0, s, p;
        var placedArea = 0;
        for (s = 0; s < plan.sheets.length; s++) {
            for (p = 0; p < plan.sheets[s].placements.length; p++) {
                if (plan.sheets[s].placements[p].rot) rotatedCount++;
                placedArea += plan.sheets[s].placements[p].item.wPx * plan.sheets[s].placements[p].item.hPx;
            }
        }
        var usage = Math.round((placedArea / (plan.sheets.length * plan.W * plan.H)) * 100);
        var orient = (plan.W <= plan.H) ? "portrait" : "landscape";

        message = placedCount + " film disusun menjadi " + plan.sheets.length + " lembar " +
                  "(" + orient + ").\n" +
                  "Tanpa layout: " + placedCount + " lembar. Hemat " + (placedCount - plan.sheets.length) + " lembar.\n" +
                  "Isi kertas terpakai film: sekitar " + usage + "%.\n";
        if (rotatedCount > 0) {
            message += "\n" + rotatedCount + " film diputar 90\u00B0. Putar kembali saat dipasang di screen.\n";
        }
        if (plan.unplaced.length > 0) {
            var names = [];
            for (i = 0; i < plan.unplaced.length; i++) names.push(plan.unplaced[i].name);
            message += "\nTIDAK MUAT di kertas ini (dilewati):\n" + names.join("\n") + "\n";
        }
        if (skipped.length > 0) {
            message += "\nDilewati:\n" + skipped.join("\n") + "\n";
        }
        if (invertedCount > 0) {
            message += "\nPERHATIAN: " + invertedCount + " film tampak terbalik (latar gelap). " +
                       "Script ini mengasumsikan film hitam di atas putih, " +
                       "jadi hasilnya bisa keliru. Cek hasilnya sebelum cetak.\n";
        }
    } catch (e) {
        message = "Error: " + e.message + (e.line ? " (baris " + e.line + ")" : "");
    } finally {
        for (var k = 0; k < items.length; k++) closeQuiet(items[k].doc);
        if (createdSheets.length > 0) {
            try { app.activeDocument = createdSheets[0]; } catch (e4) {}
        }
        app.preferences.rulerUnits = origRuler;
        app.displayDialogs = origDialogs;
    }

    if (message !== null) alert(message);
}

main();
