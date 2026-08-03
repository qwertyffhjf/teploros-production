// teploros · drawing-parser.js v4
// Парсер PDF-чертежей: извлекает спецификации, покупные изделия,
// детали для лазерного раскроя (по наличию DXF), материалы и массу.
// Принимает файлы из input[multiple] или перетаскивания папки.

function isJunkFile(name) {
  if (!name) return true;
  if (name.indexOf('__MACOSX') !== -1) return true;
  if (name.indexOf('.DS_Store') !== -1) return true;
  var base = name.replace(/^.*[\/\\]/, '');
  if (!base || base.charAt(0) === '.') return true;
  if (base === 'Thumbs.db' || base === 'desktop.ini') return true;
  return false;
}

// Нормализация текста pdf.js: «Изм .» → «Изм.», лишние пробелы
function dpNormalize(s) {
  return s.replace(/\s+\./g, '.').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

// Группировка текстовых элементов в строки по Y
function dpGroupRows(items, threshold) {
  if (!threshold) threshold = 8;
  var sorted = items.slice().sort(function(a, b) { return a.y - b.y; });
  var rows = [], cur = [], lastY = -9999;
  sorted.forEach(function(it) {
    if (Math.abs(it.y - lastY) > threshold) {
      if (cur.length) rows.push(cur);
      cur = [it]; lastY = it.y;
    } else { cur.push(it); }
  });
  if (cur.length) rows.push(cur);
  return rows;
}

// Поиск X-позиций колонок «Поз.», «Наименование», «Кол.»
// pdf.js может отдавать «Поз» и «.» отдельно — ищем без точки
function dpFindColumns(items) {
  var posX = null, nameX = null, qtyX = null;
  items.forEach(function(it) {
    var t = it.text;
    if (t === 'Поз.' || t === 'Поз') posX = it.x;
    if (t === 'Наименование') nameX = it.x;
    if (t === 'Кол.' || t === 'Кол') qtyX = it.x;
  });
  return { posX: posX, nameX: nameX, qtyX: qtyX };
}

var DP_SECTIONS = [
  ['Сборочные единицы', 'assemblies'],
  ['Стандартные изделия', 'standard_items'],
  ['Прочие изделия', 'other_items'],
  ['Детали', 'details']
];
var DP_SKIP = /Копировал|Формат\s|Обозначение|Наименование|Разраб|Пров\.|Н\.контр|Утв\.|Т\.контр|Спецификация|Сборочный чертеж|Монтажный чертеж|Изм\.\s*Лист|Лит\.|Листов/;

// Парсинг страницы спецификации
function dpParseSpecPage(pageItems, cols) {
  var posX = cols.posX || 170;
  var qtyX = cols.qtyX || 1000;
  var leftBound = posX - 60;   // левее — вертикальный текст штампа
  var qtyBound = qtyX - 40;    // правее — колонка «Кол.»

  var rows = dpGroupRows(pageItems);
  var sections = {}, currentSection = null;

  rows.forEach(function(row) {
    row.sort(function(a, b) { return a.x - b.x; });
    var fullText = dpNormalize(row.map(function(r) { return r.text; }).join(' '));

    // Заголовок раздела?
    var found = null;
    DP_SECTIONS.forEach(function(pair) {
      if (found) return;
      if (fullText.indexOf(pair[0]) !== -1 && fullText.length < pair[0].length + 15) found = pair[1];
    });
    if (found) {
      currentSection = found;
      if (!sections[currentSection]) sections[currentSection] = [];
      return;
    }
    if (!currentSection) return;
    if (DP_SKIP.test(fullText)) return;

    // Тело строки: без штампа и без форматных маркеров A4
    var body = [], qtyPieces = [];
    row.forEach(function(it) {
      if (it.x < leftBound) return;
      if (/^A[0-4]$/.test(it.text)) return;
      if (it.x >= qtyBound) qtyPieces.push(it.text);
      else body.push(it.text);
    });
    var bodyText = dpNormalize(body.join(' '));
    if (!bodyText) return;

    // «Номер [Обозначение V3-…] Название»
    var m = bodyText.match(/^(\d{1,3})\s+(V3-[\w.\-]+)?\s*(.*)$/);
    if (!m) return;
    var pos = parseInt(m[1]);
    var designation = (m[2] || '').trim();
    var name = (m[3] || '').trim();

    var qty = 0;
    if (qtyPieces.length) {
      var qn = parseInt(qtyPieces.join(''));
      if (!isNaN(qn)) qty = qn;
    }
    if (qty === 0 && name) {
      var m2 = name.match(/^(.+?)\s+(\d{1,3})$/);
      if (m2) { name = m2[1]; qty = parseInt(m2[2]); }
    }

    // Косметика: «М 12» → «М12»
    name = name.replace(/([МM])\s+(\d)/g, '$1$2');

    if (pos > 0 && (name || designation)) {
      sections[currentSection].push({ pos: pos, designation: designation, name: name, qty: qty });
    }
  });
  return sections;
}

// Извлечение материала, толщины и массы из чертежа детали
function dpExtractMaterial(pages) {
  var lines = [];
  pages.forEach(function(pg) {
    dpGroupRows(pg.items).forEach(function(row) {
      row.sort(function(a, b) { return a.x - b.x; });
      lines.push(dpNormalize(row.map(function(r) { return r.text; }).join(' ')));
    });
  });

  var material = '', thickness = '', mass = '';
  lines.forEach(function(line) {
    // Масса: число перед масштабом «79,99 1:10»
    if (!mass) {
      var mMass = line.match(/(\d+(?:[.,]\d+)?)\s+1\s*:\s*\d+/);
      if (mMass) mass = mMass[1].replace(',', '.');
    }
    // «Лист 3 мм рифленый» (в т.ч. в строке с DXF)
    if (!thickness) {
      var m1 = line.match(/Лист\s+(\d+(?:[.,]\d+)?)\s*мм\s*([а-яё]+)?/i);
      if (m1) {
        thickness = m1[1].replace(',', '.');
        material = 'Лист ' + thickness + 'мм' + (m1[2] ? ' ' + m1[2] : '');
        return;
      }
    }
    // «6 ГОСТ 19903-74» — толщина листа по ГОСТ
    if (!thickness) {
      var m2 = line.match(/(\d+(?:[.,]\d+)?)\s+ГОСТ\s+19903/);
      if (m2) { thickness = m2[1].replace(',', '.'); return; }
    }
    // Марка стали: «Ст.3 пс -5 ГОСТ 14637-89» → «Ст.3пс-5»
    var mSt = line.match(/(Ст\.?\s?\d[\w\s\-]*?)\s+ГОСТ\s+([\d\-]+)/);
    if (mSt && material.indexOf('Ст') === -1 && !/Лист|Сталь/.test(material)) {
      var grade = mSt[1].replace(/\s+/g, '');
      material = material ? material + ', ' + grade : grade;
      return;
    }
    // «Сталь 45 ГОСТ 1050-88»
    var m3 = line.match(/(Сталь\s+\d+)\s+ГОСТ\s+([\d\-]+)/);
    if (m3) { material = m3[1] + ' ГОСТ ' + m3[2]; return; }
    // «Труба ф219х4,5 ГОСТ 10704-91»
    var m4 = line.match(/(Труба\s+\S+.*?ГОСТ\s+[\d\-]+)/);
    if (m4) { material = dpNormalize(m4[1]); return; }
    // Полоса стальная
    if (/Полоса стальная/.test(line)) {
      var mGost = line.match(/ГОСТ\s+([\d\-]+)/);
      material = dpNormalize(line.split('ГОСТ')[0]) + (mGost ? ' ГОСТ ' + mGost[1] : '');
      return;
    }
    if (/асбестовая/.test(line)) { material = 'Бумага асбестовая'; return; }
  });
  if (thickness && !material) material = 'Лист ' + thickness + 'мм';
  else if (thickness && material.indexOf('Лист') === -1) material = 'Лист ' + thickness + 'мм, ' + material;
  return { material: material, thickness: thickness, mass: mass };
}

function dpMergeSections(target, source) {
  Object.keys(source).forEach(function(k) {
    if (!target[k]) target[k] = [];
    target[k] = target[k].concat(source[k]);
  });
}

// Чтение PDF в массив страниц с координатами текста
async function dpExtractPdfPages(file) {
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
  if (pdf.destroy) { try { await pdf.destroy(); } catch (e) {} }
  return pages;
}

/**
 * Главная функция: парсит массив File-объектов (из input или drag&drop)
 * @param {FileList|File[]} files
 * @param {function} onProgress — (pct 0..1, message)
 */
async function parseDrawingFiles(files, onProgress) {
  if (!onProgress) onProgress = function() {};
  onProgress(0.02, 'Чтение файлов…');

  var specPdfs = [], sbPdfs = [], detailPdfs = [], dxfNames = {};
  Array.from(files).forEach(function(f) {
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

  console.log('[DrawingParser] СП=' + specPdfs.length + ' СБ/МЧ=' + sbPdfs.length +
    ' Деталей=' + detailPdfs.length + ' DXF=' + Object.keys(dxfNames).length);

  var totalFiles = specPdfs.length + sbPdfs.length + detailPdfs.length;
  if (totalFiles === 0) throw new Error('Не найдены PDF-чертежи. Выберите папку или PDF-файлы.');

  var processed = 0, allSpecs = {}, parsedParents = {}, detailMaterials = {}, errors = [];

  function baseName(f) { return (f.webkitRelativePath || f.name).replace(/^.*[\/\\]/, ''); }
  function parentOf(name) {
    var m = name.match(/^(V3-[^\s]+)/);
    return m ? m[1] : name.replace(/\.pdf$/i, '');
  }

  async function safeParse(file, label) {
    try { return await dpExtractPdfPages(file); }
    catch (err) {
      errors.push(label + ' ' + baseName(file) + ': ' + err.message);
      console.warn('[DrawingParser] ' + label + ' ' + baseName(file) + ':', err.message);
      return null;
    }
  }

  function parseSpecFromPages(pages) {
    var merged = {};
    pages.forEach(function(pg) {
      var cols = dpFindColumns(pg.items);
      if (!cols.posX && !cols.nameX) return;
      dpMergeSections(merged, dpParseSpecPage(pg.items, cols));
    });
    return merged;
  }
  function countItems(spec) {
    return Object.keys(spec).reduce(function(s, k) { return s + spec[k].length; }, 0);
  }

  // 1. Отдельные спецификации (СП)
  for (var si = 0; si < specPdfs.length; si++) {
    var sf = specPdfs[si];
    onProgress(0.05 + 0.3 * (processed / totalFiles), baseName(sf).slice(0, 35) + '…');
    var pages = await safeParse(sf, 'СП');
    if (pages) {
      var parent = parentOf(baseName(sf));
      var spec = parseSpecFromPages(pages);
      var cnt = countItems(spec);
      console.log('[DrawingParser] СП ' + parent + ': ' + cnt + ' поз.');
      if (cnt > 0) { allSpecs[parent] = spec; parsedParents[parent] = true; }
    }
    processed++;
  }

  // 2. Сборочные чертежи (СБ/МЧ) — для узлов без отдельного СП
  for (var bi = 0; bi < sbPdfs.length; bi++) {
    var bf = sbPdfs[bi];
    onProgress(0.05 + 0.3 * (processed / totalFiles), baseName(bf).slice(0, 35) + '…');
    var bParent = parentOf(baseName(bf));
    if (!parsedParents[bParent]) {
      var bPages = await safeParse(bf, 'СБ');
      if (bPages) {
        var bSpec = parseSpecFromPages(bPages);
        var bCnt = countItems(bSpec);
        if (bCnt > 0) {
          console.log('[DrawingParser] СБ ' + bParent + ': ' + bCnt + ' поз.');
          allSpecs[bParent] = bSpec; parsedParents[bParent] = true;
        }
      }
    }
    processed++;
  }

  // 3. Материалы из чертежей деталей
  for (var di = 0; di < detailPdfs.length; di++) {
    var df = detailPdfs[di];
    onProgress(0.35 + 0.55 * (processed / totalFiles), baseName(df).slice(0, 35) + '…');
    var dPages = await safeParse(df, 'Деталь');
    if (dPages) {
      var dBase = baseName(df);
      var desig = parentOf(dBase);
      var dName = dBase.indexOf(' - ') !== -1 ? dBase.split(' - ').pop().replace(/\.pdf$/i, '') : dBase;
      var matInfo = dpExtractMaterial(dPages);
      detailMaterials[desig] = { name: dName, material: matInfo.material,
        thickness: matInfo.thickness, mass: matInfo.mass };
    }
    processed++;
  }

  onProgress(0.95, 'Формирование результата…');

  // 4. Сбор результата
  var purchased = [], allDetails = [];
  Object.keys(allSpecs).sort().forEach(function(parent) {
    var sec = allSpecs[parent];
    (sec.standard_items || []).forEach(function(it) {
      purchased.push({ name: it.name, qty: it.qty, designation: it.designation, parent: parent });
    });
    (sec.other_items || []).forEach(function(it) {
      purchased.push({ name: it.name, qty: it.qty, designation: it.designation, parent: parent });
    });
    (sec.details || []).forEach(function(it) {
      var d = it.designation, hasDxf = false;
      if (d) Object.keys(dxfNames).forEach(function(dn) { if (dn.indexOf(d) !== -1) hasDxf = true; });
      var mi = detailMaterials[d] || {};
      allDetails.push({ pos: it.pos, designation: d, name: it.name || mi.name || '',
        qty: it.qty, parent: parent, material: mi.material || '',
        thickness: mi.thickness || '', mass: mi.mass || '', hasDxf: hasDxf });
    });
  });

  var cutting = allDetails.filter(function(d) { return d.hasDxf; });
  var pipes = allDetails.filter(function(d) { return /Труба|Швеллер|Круг \d|Полоса/.test(d.name) && !d.hasDxf; });
  var otherDetails = allDetails.filter(function(d) {
    return !d.hasDxf && !/Труба|Швеллер|Круг \d|Полоса/.test(d.name);
  });

  // Дедупликация
  var seen1 = {}, pDedup = [];
  purchased.forEach(function(p) {
    var k = p.name + '|' + p.qty + '|' + p.parent;
    if (!seen1[k]) { seen1[k] = 1; pDedup.push(p); }
  });
  var seen2 = {}, cDedup = [];
  cutting.forEach(function(c) {
    if (!seen2[c.designation]) { seen2[c.designation] = 1; cDedup.push(c); }
  });

  console.log('[DrawingParser] ИТОГО: покупных=' + pDedup.length + ' раскрой=' + cDedup.length +
    ' прокат=' + pipes.length + ' прочие=' + otherDetails.length + ' ошибок=' + errors.length);

  onProgress(1, 'Готово');
  return { purchased: pDedup, cutting: cDedup, pipes: pipes, otherDetails: otherDetails,
    errors: errors,
    stats: { specFiles: specPdfs.length, sbFiles: sbPdfs.length,
      detailFiles: detailPdfs.length, dxfFiles: Object.keys(dxfNames).length } };
}
