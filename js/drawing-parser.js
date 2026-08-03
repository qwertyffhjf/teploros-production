// teploros · drawing-parser.js v3
// Парсер PDF-чертежей: пользователь выбирает ПАПКУ с чертежами
// Работает через pdf.js (CDN), без ZIP/RAR

function isJunkFile(name) {
  if (!name) return true;
  if (name.indexOf('__MACOSX') !== -1) return true;
  if (name.indexOf('.DS_Store') !== -1) return true;
  var base = name.replace(/^.*[\/\\]/, '');
  if (!base || base.charAt(0) === '.') return true;
  if (base === 'Thumbs.db' || base === 'desktop.ini') return true;
  return false;
}

async function extractPdfText(file) {
  await ensureCdn('pdfjs');
  var buf = await file.arrayBuffer();
  var uint8 = new Uint8Array(buf);
  var pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
  var pages = [];
  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    var viewport = page.getViewport({ scale: 1 });
    var pageH = viewport.height;
    var items = content.items
      .filter(function(it) { return it.str && it.str.trim(); })
      .map(function(it) {
        return { x: it.transform[4], y: pageH - it.transform[5], text: it.str.trim() };
      });
    pages.push({ page: i, items: items });
  }
  return pages;
}

// ─── Парсер спецификаций ───────────────────────────────────

function findSpecColumns(items) {
  var posX = null, nameX = null, qtyX = null;
  items.forEach(function(it) {
    if (it.text === 'Поз.') posX = it.x;
    if (it.text === 'Наименование') nameX = it.x;
    if (it.text === 'Кол.') qtyX = it.x;
  });
  return { posX: posX, nameX: nameX, qtyX: qtyX };
}

function groupIntoRows(items) {
  var sorted = items.slice().sort(function(a, b) { return a.y - b.y; });
  var rows = [], cur = [], lastY = -9999;
  sorted.forEach(function(it) {
    if (Math.abs(it.y - lastY) > 8) {
      if (cur.length) rows.push(cur);
      cur = [it]; lastY = it.y;
    } else { cur.push(it); }
  });
  if (cur.length) rows.push(cur);
  return rows;
}

var SECTION_MAP = {
  'Сборочные единицы': 'assemblies',
  'Детали': 'details',
  'Стандартные изделия': 'standard_items',
  'Прочие изделия': 'other_items'
};
var SKIP_KW = ['Формат','Зона','Поз.','Изм.','Разраб.','Пров.','Н.контр',
  'Утв.','Копировал','Инв.','Подп.','Взам.','Справ.','Перв.',
  'Лит.','Листов','Спецификация','Приме-','чание','Обозначение',
  'Наименование','Кол.','Сборочный чертеж','Монтажный чертеж',
  'Масса','Масштаб','Т.контр','Лист'];

function parseSpecPage(pageItems, cols) {
  var posMin = (cols.posX || 170) - 20;
  var nameMin = (cols.nameX || 600) - 30;
  var qtyMin = (cols.qtyX || 970) - 30;
  var rows = groupIntoRows(pageItems);
  var sections = {}, currentSection = null;

  rows.forEach(function(row) {
    row.sort(function(a, b) { return a.x - b.x; });
    var combined = row.map(function(r) { return r.text; }).join(' ');
    var foundSection = null;
    Object.keys(SECTION_MAP).forEach(function(rus) {
      if (combined.indexOf(rus) !== -1 && combined.length < rus.length + 20)
        foundSection = SECTION_MAP[rus];
    });
    if (foundSection) {
      currentSection = foundSection;
      if (!sections[currentSection]) sections[currentSection] = [];
      return;
    }
    var skip = false;
    SKIP_KW.forEach(function(kw) { if (combined.indexOf(kw) !== -1) skip = true; });
    if (skip || !currentSection) return;

    var posText = '', nameText = '', qtyText = '';
    row.forEach(function(it) {
      if (it.x < posMin) return;
      if (it.x < nameMin - 10) posText += ' ' + it.text;
      else if (it.x < qtyMin - 10) nameText += ' ' + it.text;
      else qtyText += ' ' + it.text;
    });
    posText = posText.trim(); nameText = nameText.trim(); qtyText = qtyText.trim();
    if (!posText && !nameText) return;

    var pos = 0, designation = '';
    var m = posText.match(/^(\d+)\s*(V3-[\w.]+)?\s*(.*)/);
    if (m) {
      pos = parseInt(m[1]);
      designation = (m[2] || '').trim();
      var extra = (m[3] || '').trim();
      if (extra) nameText = extra + (nameText ? ' ' + nameText : '');
    }
    var qty = 0;
    if (qtyText) { var n = parseInt(qtyText); if (!isNaN(n)) qty = n; }
    if (qty === 0 && nameText) {
      var m2 = nameText.match(/^(.+?)\s+(\d+)\s*$/);
      if (m2) { nameText = m2[1]; qty = parseInt(m2[2]); }
    }
    if (pos > 0 && (nameText || designation))
      sections[currentSection].push({ pos: pos, designation: designation, name: nameText, qty: qty });
  });
  return sections;
}

function extractMaterial(text) {
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  var material = '', thickness = '', mass = '';
  lines.forEach(function(line) {
    if (/Изм\.|Неуказан|DXF|предельные|Сварные|Копировал|Размеры для/.test(line)) return;
    var m1 = line.match(/^Лист\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*(.*)/);
    if (m1) { thickness = m1[1].replace(',','.'); material = 'Лист '+thickness+'мм'+(m1[2].trim()?' '+m1[2].trim():''); return; }
    var m2 = line.match(/^(\d+)\s+ГОСТ\s+19903/);
    if (m2 && !thickness) { thickness = m2[1]; return; }
    if (/^Ст[\.\d]/.test(line)) { material = material ? material+', '+line : line; return; }
    var m3 = line.match(/(Сталь\s+\d+\s+ГОСТ\s+[\d-]+)/);
    if (m3) { material = m3[1]; return; }
    var m4 = line.match(/(Труба\s+.+ГОСТ\s+[\d-]+)/);
    if (m4) { material = m4[1]; return; }
    if (line.indexOf('Полоса стальная') === 0) { material = line.split('.')[0]; return; }
    if (line.indexOf('асбестовая') !== -1) { material = line.indexOf('.')!==-1?line.split('.')[0]:line; return; }
    var m5 = line.match(/^(\d+[.,]\d+)$/);
    if (m5) mass = m5[1].replace(',','.');
  });
  if (thickness && !material) material = 'Лист '+thickness+'мм';
  else if (thickness && material.indexOf('Лист')===-1) material = 'Лист '+thickness+'мм, '+material;
  return { material: material, thickness: thickness, mass: mass };
}

function mergeSections(target, source) {
  Object.keys(source).forEach(function(k) {
    if (!target[k]) target[k] = [];
    target[k] = target[k].concat(source[k]);
  });
}

// ─── Главная функция ───────────────────────────────────────

/**
 * Парсит массив File-объектов (из input[webkitdirectory])
 * @param {FileList|File[]} files
 * @param {function} onProgress
 */
async function parseDrawingFiles(files, onProgress) {
  if (!onProgress) onProgress = function() {};
  onProgress(0.02, 'Чтение файлов…');

  // Разделяем файлы по типу
  var specPdfs = [], sbPdfs = [], detailPdfs = [], dxfNames = {};
  var fileArr = Array.from(files);

  fileArr.forEach(function(f) {
    var path = f.webkitRelativePath || f.name;
    if (isJunkFile(path)) return;
    var base = path.replace(/^.*[\/\\]/, '');
    var lower = base.toLowerCase();
    if (lower.endsWith('.pdf')) {
      if (base.indexOf('СП') !== -1) specPdfs.push(f);
      else if (base.indexOf('СБ') !== -1 || base.indexOf('МЧ') !== -1) sbPdfs.push(f);
      else detailPdfs.push(f);
    } else if (lower.endsWith('.dxf')) {
      dxfNames[base.replace(/\.dxf$/i, '')] = true;
    }
  });

  console.log('[DrawingParser] Файлов: СП=' + specPdfs.length + ' СБ/МЧ=' + sbPdfs.length +
    ' Деталей=' + detailPdfs.length + ' DXF=' + Object.keys(dxfNames).length);

  var totalFiles = specPdfs.length + sbPdfs.length + detailPdfs.length;
  if (totalFiles === 0) throw new Error('В папке не найдены PDF-чертежи');

  var processed = 0, allSpecs = {}, parsedParents = {}, detailMaterials = {}, errors = [];

  async function safeParse(file, label) {
    var base = (file.webkitRelativePath || file.name).replace(/^.*[\/\\]/, '');
    try { return await extractPdfText(file); }
    catch (err) { errors.push(label + ' ' + base + ': ' + err.message); return null; }
  }

  // 1. СП
  for (var si = 0; si < specPdfs.length; si++) {
    var sf = specPdfs[si];
    var sfName = (sf.webkitRelativePath || sf.name).replace(/^.*[\/\\]/, '');
    onProgress(0.05 + 0.3 * (processed / totalFiles), sfName.slice(0, 35) + '…');
    var pages = await safeParse(sf, 'СП');
    if (pages) {
      var pm = sfName.match(/(V3-[\w.]+)/); var parent = pm ? pm[1] : sfName;
      var merged = {};
      pages.forEach(function(pg) {
        var cols = findSpecColumns(pg.items);
        if (!cols.posX) return;
        mergeSections(merged, parseSpecPage(pg.items, cols));
      });
      var cnt = Object.keys(merged).reduce(function(s,k){return s+merged[k].length;},0);
      if (cnt > 0) { allSpecs[parent] = merged; parsedParents[parent] = true;
        console.log('[DrawingParser] СП ' + parent + ': ' + cnt + ' поз.'); }
    }
    processed++;
  }

  // 2. СБ/МЧ
  for (var bi = 0; bi < sbPdfs.length; bi++) {
    var bf = sbPdfs[bi];
    var bfName = (bf.webkitRelativePath || bf.name).replace(/^.*[\/\\]/, '');
    onProgress(0.05 + 0.3 * (processed / totalFiles), bfName.slice(0, 35) + '…');
    var bpm = bfName.match(/(V3-[\w.]+)/); var bp = bpm ? bpm[1] : bfName;
    if (!parsedParents[bp]) {
      var bPages = await safeParse(bf, 'СБ');
      if (bPages) {
        var bm = {};
        bPages.forEach(function(pg) {
          var bc = findSpecColumns(pg.items);
          if (!bc.posX) return;
          mergeSections(bm, parseSpecPage(pg.items, bc));
        });
        var bCnt = Object.keys(bm).reduce(function(s,k){return s+bm[k].length;},0);
        if (bCnt > 0) { allSpecs[bp] = bm; parsedParents[bp] = true;
          console.log('[DrawingParser] СБ ' + bp + ': ' + bCnt + ' поз.'); }
      }
    }
    processed++;
  }

  // 3. Детали
  for (var di = 0; di < detailPdfs.length; di++) {
    var df = detailPdfs[di];
    var dfName = (df.webkitRelativePath || df.name).replace(/^.*[\/\\]/, '');
    onProgress(0.35 + 0.55 * (processed / totalFiles), dfName.slice(0, 35) + '…');
    var dPages = await safeParse(df, 'Деталь');
    if (dPages) {
      var fullText = dPages.map(function(pg) { return pg.items.map(function(it){return it.text;}).join('\n'); }).join('\n');
      var dm = dfName.match(/(V3-[\w.]+)/); var desig = dm ? dm[1] : dfName;
      var dName = dfName.indexOf(' - ')!==-1 ? dfName.split(' - ').pop().replace(/\.pdf$/i,'') : dfName;
      detailMaterials[desig] = Object.assign({ name: dName }, extractMaterial(fullText));
    }
    processed++;
  }

  onProgress(0.95, 'Формирование результата…');

  // 4. Сбор
  var purchased = [], allDetails = [];
  Object.keys(allSpecs).sort().forEach(function(parent) {
    var sec = allSpecs[parent];
    (sec.standard_items || []).forEach(function(it) { purchased.push({name:it.name,qty:it.qty,designation:it.designation,parent:parent}); });
    (sec.other_items || []).forEach(function(it) { purchased.push({name:it.name,qty:it.qty,designation:it.designation,parent:parent}); });
    (sec.details || []).forEach(function(it) {
      var d = it.designation, hasDxf = false;
      if (d) Object.keys(dxfNames).forEach(function(dn){ if(dn.indexOf(d)!==-1) hasDxf=true; });
      var mi = detailMaterials[d] || {};
      allDetails.push({ pos:it.pos, designation:d, name:it.name, qty:it.qty, parent:parent,
        material:mi.material||'', thickness:mi.thickness||'', mass:mi.mass||'', hasDxf:hasDxf });
    });
  });

  var cutting = allDetails.filter(function(d){return d.hasDxf;});
  var pipes = allDetails.filter(function(d){return /Труба|Швеллер/.test(d.name)&&!d.hasDxf;});
  var otherDetails = allDetails.filter(function(d){return !d.hasDxf&&!/Труба|Швеллер/.test(d.name);});

  // Дедупликация
  var seen1 = {}, pDedup = []; purchased.forEach(function(p){ var k=p.name+'|'+p.qty; if(!seen1[k]){seen1[k]=1;pDedup.push(p);} });
  var seen2 = {}, cDedup = []; cutting.forEach(function(c){ if(!seen2[c.designation]){seen2[c.designation]=1;cDedup.push(c);} });

  console.log('[DrawingParser] ИТОГО: покупных=' + pDedup.length + ' раскрой=' + cDedup.length +
    ' трубы=' + pipes.length + ' прочие=' + otherDetails.length + ' ошибок=' + errors.length);

  onProgress(1, 'Готово');
  return { purchased:pDedup, cutting:cDedup, pipes:pipes, otherDetails:otherDetails, errors:errors,
    stats:{ specFiles:specPdfs.length, sbFiles:sbPdfs.length, detailFiles:detailPdfs.length, dxfFiles:Object.keys(dxfNames).length } };
}
