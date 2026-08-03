// teploros · drawing-parser.js
// Парсер PDF-чертежей: извлекает ведомость покупных и детали для раскроя
// Работает в браузере через pdf.js + JSZip (CDN)

// ─── Утилиты ───────────────────────────────────────────────

/**
 * Загружает и распаковывает ZIP-архив, возвращает массив файлов
 * @param {File} file
 * @returns {Promise<Array<{name: string, data: ArrayBuffer}>>}
 */
async function unpackArchive(file) {
  await ensureCdn('jszip');
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entries = [];
  const promises = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    promises.push(
      entry.async('arraybuffer').then(data => {
        entries.push({ name: path, data });
      })
    );
  });
  await Promise.all(promises);
  return entries;
}

/**
 * Загружает PDF через pdf.js, возвращает текстовые элементы с координатами
 * @param {ArrayBuffer} data
 * @returns {Promise<Array<{page: number, items: Array<{x: number, y: number, text: string}>}>>}
 */
async function extractPdfText(data) {
  await ensureCdn('pdfjs');
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageH = viewport.height;
    const items = content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({
        x: it.transform[4],
        y: pageH - it.transform[5], // PDF y=0 внизу → переворачиваем
        text: it.str.trim()
      }));
    pages.push({ page: i, items });
  }
  return pages;
}

// ─── Парсер спецификаций ───────────────────────────────────

/**
 * Находит X-позиции колонок «Поз.», «Наименование», «Кол.» на странице
 */
function findSpecColumns(items) {
  var posX = null, nameX = null, qtyX = null;
  items.forEach(function(it) {
    if (it.text === 'Поз.')           posX  = it.x;
    if (it.text === 'Наименование')   nameX = it.x;
    if (it.text === 'Кол.')           qtyX  = it.x;
  });
  return { posX: posX, nameX: nameX, qtyX: qtyX };
}

/**
 * Группирует текстовые элементы в строки по Y-координате
 */
function groupIntoRows(items, threshold) {
  if (!threshold) threshold = 8;
  items.sort(function(a, b) { return a.y - b.y; });
  var rows = [];
  var currentRow = [];
  var lastY = -9999;
  items.forEach(function(it) {
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
  'Сборочные единицы': 'assemblies',
  'Детали': 'details',
  'Стандартные изделия': 'standard_items',
  'Прочие изделия': 'other_items'
};

var SKIP_KEYWORDS = [
  'Формат', 'Зона', 'Поз.', 'Изм.', 'Разраб.', 'Пров.', 'Н.контр',
  'Утв.', 'Копировал', 'Инв.', 'Подп.', 'Взам.', 'Справ.', 'Перв.',
  'Лит.', 'Листов', 'Спецификация', 'Приме-', 'чание', 'Обозначение',
  'Наименование', 'Кол.', 'Сборочный чертеж', 'Монтажный чертеж',
  'Масса', 'Масштаб', 'Т.контр', 'Лист'
];

/**
 * Парсит одну страницу спецификации
 */
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

    // Проверяем заголовок раздела
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

    // Пропуск штампа
    var skip = false;
    SKIP_KEYWORDS.forEach(function(kw) { if (combined.indexOf(kw) !== -1) skip = true; });
    if (skip || !currentSection) return;

    // Разделяем по колонкам
    var posText = '', nameText = '', qtyText = '';
    row.forEach(function(it) {
      if (it.x < posMin) return; // формат A4
      if (it.x < nameMin - 10) posText += ' ' + it.text;
      else if (it.x < qtyMin - 10) nameText += ' ' + it.text;
      else qtyText += ' ' + it.text;
    });
    posText = posText.trim();
    nameText = nameText.trim();
    qtyText = qtyText.trim();
    if (!posText && !nameText) return;

    // Извлекаем позицию и обозначение
    var pos = 0, designation = '';
    var m = posText.match(/^(\d+)\s*(V3-[\w.]+)?\s*(.*)/);
    if (m) {
      pos = parseInt(m[1]);
      designation = (m[2] || '').trim();
      var extra = (m[3] || '').trim();
      if (extra) nameText = extra + (nameText ? ' ' + nameText : '');
    }

    // Извлекаем количество
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

/**
 * Извлекает материал и толщину из чертежа детали (plain text, без координат)
 */
function extractMaterial(text) {
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  var material = '', thickness = '', mass = '';

  lines.forEach(function(line) {
    if (/Изм\.|Неуказан|DXF|предельные|Сварные|Копировал|Размеры для/.test(line)) return;

    // Лист с толщиной
    var m1 = line.match(/^Лист\s*(\d+(?:[.,]\d+)?)\s*(?:мм)?\s*(.*)/);
    if (m1) {
      thickness = m1[1].replace(',', '.');
      var extra = m1[2].trim();
      material = 'Лист ' + thickness + 'мм' + (extra ? ' ' + extra : '');
      return;
    }

    // Толщина из ГОСТ 19903
    var m2 = line.match(/^(\d+)\s+ГОСТ\s+19903/);
    if (m2 && !thickness) { thickness = m2[1]; return; }

    // Марка стали
    if (/^Ст[\.\d]/.test(line)) {
      material = material ? material + ', ' + line : line;
      return;
    }

    // Сталь 20 ГОСТ...
    var m3 = line.match(/(Сталь\s+\d+\s+ГОСТ\s+[\d-]+)/);
    if (m3) { material = m3[1]; return; }

    // Труба
    var m4 = line.match(/(Труба\s+.+ГОСТ\s+[\d-]+)/);
    if (m4) { material = m4[1]; return; }

    // Полоса стальная
    if (line.indexOf('Полоса стальная') === 0) {
      material = line.split('.')[0]; return;
    }

    // Асбест
    if (line.indexOf('асбестовая') !== -1) {
      material = line.indexOf('.') !== -1 ? line.split('.')[0] : line;
      return;
    }

    // Масса (отдельное число с десятичной точкой/запятой)
    var m5 = line.match(/^(\d+[.,]\d+)$/);
    if (m5) mass = m5[1].replace(',', '.');
  });

  if (thickness && !material) material = 'Лист ' + thickness + 'мм';
  else if (thickness && material.indexOf('Лист') === -1)
    material = 'Лист ' + thickness + 'мм, ' + material;

  return { material: material, thickness: thickness, mass: mass };
}

// ─── Главная функция ───────────────────────────────────────

/**
 * Парсит ZIP-архив с чертежами, возвращает структурированные данные
 * @param {File} file - ZIP-файл с чертежами
 * @param {function} onProgress - колбек прогресса (0..1, message)
 * @returns {Promise<{purchased, cutting, pipes, otherDetails, errors}>}
 */
async function parseDrawingArchive(file, onProgress) {
  if (!onProgress) onProgress = function() {};

  onProgress(0.05, 'Распаковка архива…');
  var entries = await unpackArchive(file);

  // Классификация файлов
  var specPdfs = [];   // СП — отдельные спецификации
  var sbPdfs = [];     // СБ/МЧ — сборочные чертежи (могут содержать спецификации)
  var detailPdfs = []; // Чертежи деталей
  var dxfNames = {};   // имена DXF без расширения → true

  entries.forEach(function(e) {
    var name = e.name;
    // Пропуск служебных файлов macOS
    if (name.indexOf('__MACOSX') !== -1) return;
    // Убираем путь к папке, оставляем имя файла
    var base = name.replace(/^.*\//, '');
    if (base.charAt(0) === '.' || base.indexOf('._') === 0) return;
    if (base.match(/\.pdf$/i)) {
      if (base.indexOf('СП') !== -1) specPdfs.push(e);
      else if (base.indexOf('СБ') !== -1 || base.indexOf('МЧ') !== -1) sbPdfs.push(e);
      else detailPdfs.push(e);
    } else if (base.match(/\.dxf$/i)) {
      dxfNames[base.replace(/\.dxf$/i, '')] = true;
    }
  });

  var totalFiles = specPdfs.length + sbPdfs.length + detailPdfs.length;
  var processed = 0;
  var allSpecs = {};      // parent → { assemblies, details, standard_items, ... }
  var parsedParents = {}; // already parsed parents
  var detailMaterials = {}; // designation → { material, thickness, mass }
  var errors = [];

  // 1. Парсим отдельные СП-файлы
  for (var si = 0; si < specPdfs.length; si++) {
    var sf = specPdfs[si];
    var sfBase = sf.name.replace(/^.*\//, '');
    onProgress(0.1 + 0.3 * (processed / totalFiles), 'Спецификация: ' + sfBase.slice(0, 40) + '…');
    try {
      var pages = await extractPdfText(sf.data);
      var parentM = sfBase.match(/(V3-D[\d.]+)/);
      var parent = parentM ? parentM[1] : sfBase;
      var merged = {};
      pages.forEach(function(pg) {
        var cols = findSpecColumns(pg.items);
        if (!cols.posX) return;
        var sections = parseSpecPage(pg.items, cols);
        Object.keys(sections).forEach(function(k) {
          if (!merged[k]) merged[k] = [];
          merged[k] = merged[k].concat(sections[k]);
        });
      });
      allSpecs[parent] = merged;
      parsedParents[parent] = true;
    } catch (err) {
      errors.push('Ошибка парсинга СП ' + sfBase + ': ' + err.message);
    }
    processed++;
  }

  // 2. Парсим СБ/МЧ (только для узлов без отдельного СП)
  for (var bi = 0; bi < sbPdfs.length; bi++) {
    var bf = sbPdfs[bi];
    var bfBase = bf.name.replace(/^.*\//, '');
    onProgress(0.1 + 0.3 * (processed / totalFiles), 'Сборочный: ' + bfBase.slice(0, 40) + '…');
    try {
      var bParentM = bfBase.match(/(V3-D[\d.]+)/);
      var bParent = bParentM ? bParentM[1] : bfBase;
      if (!parsedParents[bParent]) {
        var bPages = await extractPdfText(bf.data);
        var bMerged = {};
        bPages.forEach(function(pg) {
          var bCols = findSpecColumns(pg.items);
          if (!bCols.posX) return;
          var bSections = parseSpecPage(pg.items, bCols);
          Object.keys(bSections).forEach(function(k) {
            if (!bMerged[k]) bMerged[k] = [];
            bMerged[k] = bMerged[k].concat(bSections[k]);
          });
        });
        if (Object.keys(bMerged).length > 0) {
          allSpecs[bParent] = bMerged;
          parsedParents[bParent] = true;
        }
      }
    } catch (err) {
      errors.push('Ошибка парсинга СБ ' + bfBase + ': ' + err.message);
    }
    processed++;
  }

  // 3. Извлекаем материал из чертежей деталей
  for (var di = 0; di < detailPdfs.length; di++) {
    var df = detailPdfs[di];
    var dfBase = df.name.replace(/^.*\//, '');
    onProgress(0.4 + 0.5 * (processed / totalFiles), 'Деталь: ' + dfBase.slice(0, 40) + '…');
    try {
      var dPages = await extractPdfText(df.data);
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
    } catch (err) {
      errors.push('Ошибка чертежа ' + dfBase + ': ' + err.message);
    }
    processed++;
  }

  onProgress(0.95, 'Формирование результата…');

  // 4. Собираем результат
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
        pos: item.pos,
        designation: desig,
        name: item.name,
        qty: item.qty,
        parent: parent,
        material: mi.material || '',
        thickness: mi.thickness || '',
        mass: mi.mass || '',
        hasDxf: hasDxf
      });
    });
  });

  // Классификация деталей
  var cutting = allDetails.filter(function(d) { return d.hasDxf; });
  var pipes = allDetails.filter(function(d) {
    return /Труба|Швеллер/.test(d.name) && !d.hasDxf;
  });
  var otherDetails = allDetails.filter(function(d) {
    return !d.hasDxf && !/Труба|Швеллер/.test(d.name);
  });

  // Дедупликация покупных (могут дублироваться из разных СБ)
  var purchasedDedup = [];
  var seenPurch = {};
  purchased.forEach(function(p) {
    var key = p.name + '|' + p.qty;
    if (!seenPurch[key]) {
      seenPurch[key] = true;
      purchasedDedup.push(p);
    }
  });

  // Дедупликация деталей раскроя
  var cuttingDedup = [];
  var seenCut = {};
  cutting.forEach(function(c) {
    if (!seenCut[c.designation]) {
      seenCut[c.designation] = true;
      cuttingDedup.push(c);
    }
  });

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
