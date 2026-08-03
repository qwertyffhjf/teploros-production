// teploros · drawing-parser.js v2
// Парсер PDF-чертежей: извлекает ведомость покупных и детали для раскроя
// Работает в браузере через pdf.js + JSZip (CDN)
// Поддерживает ZIP-архивы с Mac и Windows (фильтрует __MACOSX, .DS_Store, ._ файлы)

// ─── Утилиты ───────────────────────────────────────────────

/**
 * Проверяет, является ли файл служебным (macOS resource fork и пр.)
 */
function isJunkFile(fullPath) {
  if (fullPath.indexOf('__MACOSX') !== -1) return true;
  if (fullPath.indexOf('.DS_Store') !== -1) return true;
  var base = fullPath.replace(/^.*[\/\\]/, '');
  if (base.charAt(0) === '.') return true;
  if (base.indexOf('._') === 0) return true;
  if (base === 'Thumbs.db') return true;
  if (base === 'desktop.ini') return true;
  if (!base) return true;
  return false;
}

/**
 * Загружает и распаковывает ZIP-архив, возвращает массив файлов
 */
async function unpackArchive(file) {
  await ensureCdn('jszip');
  var buf = await file.arrayBuffer();
  var zip = await JSZip.loadAsync(buf);
  var entries = [];
  var promises = [];
  zip.forEach(function(path, entry) {
    if (entry.dir) return;
    if (isJunkFile(path)) return;
    promises.push(
      entry.async('arraybuffer').then(function(data) {
        entries.push({ name: path, data: data });
      })
    );
  });
  await Promise.all(promises);
  console.log('[DrawingParser] Файлов в архиве (после фильтрации): ' + entries.length);
  entries.forEach(function(e) {
    var base = e.name.replace(/^.*[\/\\]/, '');
    var ext = base.match(/\.([^.]+)$/);
    console.log('[DrawingParser]   ' + (ext ? ext[1].toUpperCase() : '???') + ': ' + base + ' (' + Math.round(e.data.byteLength / 1024) + ' KB)');
  });
  return entries;
}

/**
 * Загружает PDF через pdf.js, возвращает текстовые элементы с координатами
 */
async function extractPdfText(data) {
  await ensureCdn('pdfjs');
  var uint8 = new Uint8Array(data);
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
        return {
          x: it.transform[4],
          y: pageH - it.transform[5],
          text: it.str.trim()
        };
      });
    pages.push({ page: i, items: items });
  }
  return pages;
}

// ─── Парсер спецификаций ───────────────────────────────────

function findSpecColumns(items) {
  var posX = null, nameX = null, qtyX = null;
  items.forEach(function(it) {
    if (it.text === 'Поз.')           posX  = it.x;
    if (it.text === 'Наименование')   nameX = it.x;
    if (it.text === 'Кол.')           qtyX  = it.x;
  });
  return { posX: posX, nameX: nameX, qtyX: qtyX };
}

function groupIntoRows(items, threshold) {
  if (!threshold) threshold = 8;
  var sorted = items.slice().sort(function(a, b) { return a.y - b.y; });
  var rows = [];
  var currentRow = [];
  var lastY = -9999;
  sorted.forEach(function(it) {
    if (Math.abs(it.y - lastY) > threshold) {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [it];
      lastY = it.y;
    } else {
      currentRow.push(it);
    }
  });
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

var SECTION_MAP = {
  '\u0421\u0431\u043e\u0440\u043e\u0447\u043d\u044b\u0435 \u0435\u0434\u0438\u043d\u0438\u0446\u044b': 'assemblies',
  '\u0414\u0435\u0442\u0430\u043b\u0438': 'details',
  '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0435 \u0438\u0437\u0434\u0435\u043b\u0438\u044f': 'standard_items',
  '\u041f\u0440\u043e\u0447\u0438\u0435 \u0438\u0437\u0434\u0435\u043b\u0438\u044f': 'other_items'
};

var SKIP_KEYWORDS = [
  'Формат', 'Зона', 'Поз.', 'Изм.', 'Разраб.', 'Пров.', 'Н.контр',
  'Утв.', 'Копировал', 'Инв.', 'Подп.', 'Взам.', 'Справ.', 'Перв.',
  'Лит.', 'Листов', 'Спецификация', 'Приме-', 'чание', 'Обозначение',
  'Наименование', 'Кол.', 'Сборочный чертеж', 'Монтажный чертеж',
  'Масса', 'Масштаб', 'Т.контр', 'Лист'
];

function parseSpecPage(pageItems, cols) {
  var posMin = (cols.posX || 170) - 20;
  var nameMin = (cols.nameX || 600) - 30;
  var qtyMin = (cols.qtyX || 970) - 30;

  var rows = groupIntoRows(pageItems);
  var sections = {};
  var currentSection = null;

  rows.forEach(function(row) {
    row.sort(function(a, b) { return a.x - b.x; });
    var combined = row.map(function(r) { return r.text; }).join(' ');

    var foundSection = null;
    Object.keys(SECTION_MAP).forEach(function(rus) {
      if (combined.indexOf(rus) !== -1 && combined.length < rus.length + 20) {
        foundSection = SECTION_MAP[rus];
      }
    });
    if (foundSection) {
      currentSection = foundSection;
      if (!sections[currentSection]) sections[currentSection] = [];
      return;
    }

    var skip = false;
    SKIP_KEYWORDS.forEach(function(kw) { if (combined.indexOf(kw) !== -1) skip = true; });
    if (skip || !currentSection) return;

    var posText = '', nameText = '', qtyText = '';
    row.forEach(function(it) {
      if (it.x < posMin) return;
      if (it.x < nameMin - 10) posText += ' ' + it.text;
      else if (it.x < qtyMin - 10) nameText += ' ' + it.text;
      else qtyText += ' ' + it.text;
    });
    posText = posText.trim();
    nameText = nameText.trim();
    qtyText = qtyText.trim();
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

    if (pos > 0 && (nameText || designation)) {
      sections[currentSection].push({
        pos: pos, designation: designation,
        name: nameText, qty: qty
      });
    }
  });

  return sections;
}

function extractMaterial(text) {
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  var material = '', thickness = '', mass = '';

  lines.forEach(function(line) {
    if (/Изм\.|Неуказан|DXF|предельные|Сварные|Копировал|Размеры для/.test(line)) return;

    var m1 = line.match(/^Лист\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*(.*)/);
    if (m1) {
      thickness = m1[1].replace(',', '.');
      var extra = m1[2].trim();
      material = 'Лист ' + thickness + 'мм' + (extra ? ' ' + extra : '');
      return;
    }

    var m2 = line.match(/^(\d+)\s+ГОСТ\s+19903/);
    if (m2 && !thickness) { thickness = m2[1]; return; }

    if (/^Ст[\.\d]/.test(line)) {
      material = material ? material + ', ' + line : line;
      return;
    }

    var m3 = line.match(/(Сталь\s+\d+\s+ГОСТ\s+[\d-]+)/);
    if (m3) { material = m3[1]; return; }

    var m4 = line.match(/(Труба\s+.+ГОСТ\s+[\d-]+)/);
    if (m4) { material = m4[1]; return; }

    if (line.indexOf('Полоса стальная') === 0) {
      material = line.split('.')[0]; return;
    }

    if (line.indexOf('асбестовая') !== -1) {
      material = line.indexOf('.') !== -1 ? line.split('.')[0] : line;
      return;
    }

    var m5 = line.match(/^(\d+[.,]\d+)$/);
    if (m5) mass = m5[1].replace(',', '.');
  });

  if (thickness && !material) material = 'Лист ' + thickness + 'мм';
  else if (thickness && material.indexOf('Лист') === -1)
    material = 'Лист ' + thickness + 'мм, ' + material;

  return { material: material, thickness: thickness, mass: mass };
}

// ─── Главная функция ───────────────────────────────────────

async function parseDrawingArchive(file, onProgress) {
  if (!onProgress) onProgress = function() {};

  onProgress(0.05, 'Распаковка архива…');
  var entries;
  try {
    entries = await unpackArchive(file);
  } catch (err) {
    console.error('[DrawingParser] Ошибка распаковки:', err);
    throw new Error('Не удалось распаковать архив: ' + err.message);
  }

  if (entries.length === 0) {
    throw new Error('Архив пуст или содержит только служебные файлы');
  }

  // Классификация файлов
  var specPdfs = [];
  var sbPdfs = [];
  var detailPdfs = [];
  var dxfNames = {};

  entries.forEach(function(e) {
    var base = e.name.replace(/^.*[\/\\]/, '');
    var lowerBase = base.toLowerCase();
    if (lowerBase.match(/\.pdf$/)) {
      if (base.indexOf('СП') !== -1 || base.indexOf('\u0421\u041f') !== -1) specPdfs.push(e);
      else if (base.indexOf('СБ') !== -1 || base.indexOf('МЧ') !== -1 ||
               base.indexOf('\u0421\u0411') !== -1 || base.indexOf('\u041c\u0427') !== -1) sbPdfs.push(e);
      else detailPdfs.push(e);
    } else if (lowerBase.match(/\.dxf$/)) {
      dxfNames[base.replace(/\.dxf$/i, '')] = true;
    }
  });

  console.log('[DrawingParser] Классификация: СП=' + specPdfs.length + ' СБ/МЧ=' + sbPdfs.length + ' Детали=' + detailPdfs.length + ' DXF=' + Object.keys(dxfNames).length);

  var totalFiles = specPdfs.length + sbPdfs.length + detailPdfs.length;
  if (totalFiles === 0) {
    throw new Error('В архиве не найдены PDF-файлы чертежей');
  }

  var processed = 0;
  var allSpecs = {};
  var parsedParents = {};
  var detailMaterials = {};
  var errors = [];

  // Безопасный парсер PDF с try/catch
  async function safeParsePdf(entry, label) {
    var base = entry.name.replace(/^.*[\/\\]/, '');
    try {
      var pages = await extractPdfText(entry.data);
      return pages;
    } catch (err) {
      errors.push(label + ' ' + base + ': ' + err.message);
      console.warn('[DrawingParser] ' + label + ' ' + base + ':', err.message);
      return null;
    }
  }

  function mergeSections(target, source) {
    Object.keys(source).forEach(function(k) {
      if (!target[k]) target[k] = [];
      target[k] = target[k].concat(source[k]);
    });
  }

  // 1. Парсим СП-файлы
  for (var si = 0; si < specPdfs.length; si++) {
    var sf = specPdfs[si];
    var sfBase = sf.name.replace(/^.*[\/\\]/, '');
    onProgress(0.1 + 0.3 * (processed / totalFiles), 'Спецификация: ' + sfBase.slice(0, 35) + '…');
    var pages = await safeParsePdf(sf, 'СП');
    if (pages) {
      var parentM = sfBase.match(/(V3-D[\d.]+)/);
      var parent = parentM ? parentM[1] : sfBase;
      var merged = {};
      pages.forEach(function(pg) {
        var cols = findSpecColumns(pg.items);
        if (!cols.posX) return;
        var sections = parseSpecPage(pg.items, cols);
        mergeSections(merged, sections);
      });
      var itemCount = Object.keys(merged).reduce(function(s, k) { return s + merged[k].length; }, 0);
      console.log('[DrawingParser] СП ' + parent + ': ' + itemCount + ' позиций');
      if (itemCount > 0) {
        allSpecs[parent] = merged;
        parsedParents[parent] = true;
      }
    }
    processed++;
  }

  // 2. Парсим СБ/МЧ
  for (var bi = 0; bi < sbPdfs.length; bi++) {
    var bf = sbPdfs[bi];
    var bfBase = bf.name.replace(/^.*[\/\\]/, '');
    onProgress(0.1 + 0.3 * (processed / totalFiles), 'Сборочный: ' + bfBase.slice(0, 35) + '…');
    var bParentM = bfBase.match(/(V3-D[\d.]+)/);
    var bParent = bParentM ? bParentM[1] : bfBase;
    if (!parsedParents[bParent]) {
      var bPages = await safeParsePdf(bf, 'СБ');
      if (bPages) {
        var bMerged = {};
        bPages.forEach(function(pg) {
          var bCols = findSpecColumns(pg.items);
          if (!bCols.posX) return;
          var bSections = parseSpecPage(pg.items, bCols);
          mergeSections(bMerged, bSections);
        });
        var bCount = Object.keys(bMerged).reduce(function(s, k) { return s + bMerged[k].length; }, 0);
        if (bCount > 0) {
          console.log('[DrawingParser] СБ ' + bParent + ': ' + bCount + ' позиций');
          allSpecs[bParent] = bMerged;
          parsedParents[bParent] = true;
        }
      }
    }
    processed++;
  }

  // 3. Материалы из чертежей деталей
  for (var di = 0; di < detailPdfs.length; di++) {
    var df = detailPdfs[di];
    var dfBase = df.name.replace(/^.*[\/\\]/, '');
    onProgress(0.4 + 0.5 * (processed / totalFiles), 'Деталь: ' + dfBase.slice(0, 35) + '…');
    var dPages = await safeParsePdf(df, 'Деталь');
    if (dPages) {
      var fullText = dPages.map(function(pg) {
        return pg.items.map(function(it) { return it.text; }).join('\n');
      }).join('\n');
      var desigM = dfBase.match(/(V3-D[\d.]+)/);
      var desig = desigM ? desigM[1] : dfBase;
      var detailName = dfBase.indexOf(' - ') !== -1
        ? dfBase.split(' - ').pop().replace(/\.pdf$/i, '')
        : dfBase;
      var matInfo = extractMaterial(fullText);
      detailMaterials[desig] = {
        name: detailName,
        material: matInfo.material,
        thickness: matInfo.thickness,
        mass: matInfo.mass
      };
    }
    processed++;
  }

  onProgress(0.95, 'Формирование результата…');

  console.log('[DrawingParser] Спецификации собраны: ' + Object.keys(allSpecs).length + ' узлов');
  console.log('[DrawingParser] Материалы деталей: ' + Object.keys(detailMaterials).length);
  console.log('[DrawingParser] DXF файлов: ' + Object.keys(dxfNames).length);

  // 4. Сбор результата
  var purchased = [];
  var allDetails = [];

  Object.keys(allSpecs).sort().forEach(function(parent) {
    var sections = allSpecs[parent];
    (sections.standard_items || []).forEach(function(item) {
      purchased.push({ name: item.name, qty: item.qty, designation: item.designation, parent: parent });
    });
    (sections.other_items || []).forEach(function(item) {
      purchased.push({ name: item.name, qty: item.qty, designation: item.designation, parent: parent });
    });
    (sections.details || []).forEach(function(item) {
      var desig = item.designation;
      var hasDxf = false;
      if (desig) {
        Object.keys(dxfNames).forEach(function(dn) {
          if (dn.indexOf(desig) !== -1) hasDxf = true;
        });
      }
      var mi = detailMaterials[desig] || {};
      allDetails.push({
        pos: item.pos, designation: desig, name: item.name,
        qty: item.qty, parent: parent,
        material: mi.material || '', thickness: mi.thickness || '',
        mass: mi.mass || '', hasDxf: hasDxf
      });
    });
  });

  var cutting = allDetails.filter(function(d) { return d.hasDxf; });
  var pipes = allDetails.filter(function(d) {
    return /Труба|Швеллер/.test(d.name) && !d.hasDxf;
  });
  var otherDetails = allDetails.filter(function(d) {
    return !d.hasDxf && !/Труба|Швеллер/.test(d.name);
  });

  // Дедупликация
  var purchasedDedup = [];
  var seenPurch = {};
  purchased.forEach(function(p) {
    var key = p.name + '|' + p.qty;
    if (!seenPurch[key]) { seenPurch[key] = true; purchasedDedup.push(p); }
  });

  var cuttingDedup = [];
  var seenCut = {};
  cutting.forEach(function(c) {
    if (!seenCut[c.designation]) { seenCut[c.designation] = true; cuttingDedup.push(c); }
  });

  console.log('[DrawingParser] ИТОГО: покупных=' + purchasedDedup.length +
    ' раскрой=' + cuttingDedup.length + ' трубы=' + pipes.length +
    ' прочие=' + otherDetails.length + ' ошибок=' + errors.length);

  onProgress(1, 'Готово');

  return {
    purchased: purchasedDedup,
    cutting: cuttingDedup,
    pipes: pipes,
    otherDetails: otherDetails,
    errors: errors,
    stats: {
      specFiles: specPdfs.length,
      sbFiles: sbPdfs.length,
      detailFiles: detailPdfs.length,
      dxfFiles: Object.keys(dxfNames).length
    }
  };
}
