// teploros · drawing-parser.js v5
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

// Канонизация обозначения: pdf.js даёт «КВК -1200…» (пробел после префикса),
// а имена DXF/файлов — «КВК-1200…» (без пробела). Плюс имя файла тянет хвост
// « - Название» и метки СП/СБ/МЧ. Приводим к единому виду: префикс без пробела,
// только код, без хвоста. Из-за рассинхрона этого обозначения раньше не
// срабатывал матч DXF (раскрой=0), не привязывались материалы и ломалось дерево.
function dpNormDesig(s) {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  s = s.split(' - ')[0];
  s = s.replace(/\s*(?:СП|СБ|МЧ)\s*$/i, '');  // отрез метки типа; без \b — в JS он не работает по кириллице
  return s.replace(/\s+/g, '').trim();
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

    // «Номер [Обозначение V3-… / КВК-200… и т.д.] Название»
    var m = bodyText.match(/^(\d{1,3})\s+((?:V3|КВК|КСВа|КВа)\s*-[\w.\-]+)?\s*(.*)$/);
    if (!m) return;
    var pos = parseInt(m[1]);
    var designation = dpNormDesig(m[2] || '');
    var name = (m[3] || '').trim();

    var qty = 0;
    if (qtyPieces.length) {
      var qn = parseInt(qtyPieces.join(''));
      if (!isNaN(qn)) qty = qn;
    }
    if (qty === 0 && name) {
      // Кол-во из хвоста наименования, когда колонка «Кол.» не распозналась.
      // Раньше стоял жёсткий лимит 1-2 цифры (>99 терялось). Снимаем до 4 цифр,
      // но отрываем число как количество ТОЛЬКО если в остатке есть буквы —
      // иначе можно срезать цифру из обозначения. Если так и не распознали —
      // qty остаётся 0 («не распознано»), позиция уйдёт на подтверждение человеку.
      var m2 = name.match(/^(.+?)\s+(\d{1,4})$/);
      if (m2 && /[А-Яа-яЁёA-Za-z]/.test(m2[1])) { name = m2[1]; qty = parseInt(m2[2]); }
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
    // Сортовой прокат в основной надписи: «Швеллер 12П ГОСТ 8240-97»,
    // «Уголок 63х5 ГОСТ 8509-93», «Круг 20 ГОСТ 2590-2006», «Двутавр 20Б1».
    // Идёт ДО марки стали: в строке «Швеллер 12П Ст3сп5 ГОСТ 8240-97» нужно
    // обозначение профиля — из него считается погонная масса.
    var mProf = line.match(/((?:Швеллер|Уголок|Двутавр|Балка|Круг|Квадрат)\s+[A-Za-zА-Яа-яёЁ\d.,х×*\/-]+.*?ГОСТ\s+[\d\-]+)/i);
    if (mProf) { material = dpNormalize(mProf[1]); return; }
    // Марка стали: «Ст.3 пс -5 ГОСТ 14637-89» → «Ст.3пс-5»
    // \w в JS не включает кириллицу — без А-Яа-яёЁ марки «Ст3пс», «Ст3сп5»
    // не распознавались вовсе, хотя комментарий выше описывает именно их.
    var mSt = line.match(/(Ст\.?\s?\d[\w\sА-Яа-яёЁ\-]*?)\s+ГОСТ\s+([\d\-]+)/);
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

// Разбор строки проката: «Труба 57 x 3,5 ГОСТ 10704-91. L=142 мм.»
// → { name: 'Труба 57×3,5', material: 'ГОСТ 10704-91', thickness: '3,5', pipeLength: '142' }
function dpParsePipeInfo(rawName) {
  var info = { name: rawName, material: '', thickness: '', pipeLength: '' };
  var s = rawName;

  // 1. Длина: «L=142 мм.» в конце
  var mL = s.match(/\.?\s*L\s*=\s*(\d+(?:[.,]\d+)?)\s*(?:мм\.?)?\s*\.?\s*$/i);
  if (mL) {
    info.pipeLength = mL[1].replace(',', '.');
    s = s.slice(0, s.length - mL[0].length).trim();
  }

  // 2. ГОСТ
  var mG = s.match(/\s*(ГОСТ\s*[\d\-]+)/);
  if (mG) {
    info.material = mG[1].replace(/\s{2,}/g, ' ');
    s = s.replace(mG[0], '').replace(/[.\s]+$/, '').trim();
  }

  // 3. Толщина из «D x T» (труба, полоса)
  var mT = s.match(/(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/);
  if (mT) {
    info.thickness = mT[2].replace(',', '.');
    s = s.replace(/(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/, mT[1] + '×' + mT[2]);
  }

  info.name = s.trim();
  return info;
}

// Чтение PDF в массив страниц с координатами текста
async function dpExtractPdfPages(buf) {
  await ensureCdn('pdfjs');
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

  // Универсальный сбор: {name, getData: ()=>Promise<ArrayBuffer>}
  var collected = [];
  var rawArr = Array.from(files);

  console.log('[DrawingParser] Получено объектов: ' + rawArr.length);
  rawArr.forEach(function(f, i) {
    if (i < 5) console.log('[DrawingParser]   [' + i + '] name="' + f.name + '" relPath="' + (f.webkitRelativePath || '') + '" size=' + f.size);
  });

  // ZIP-архив(ы) → распаковываем
  var zipFiles = rawArr.filter(function(f) { return /\.zip$/i.test(f.name); });
  var plainFiles = rawArr.filter(function(f) { return !/\.zip$/i.test(f.name); });

  if (zipFiles.length > 0) {
    console.log('[DrawingParser] ZIP-архивов: ' + zipFiles.length + ' — распаковка…');
    onProgress(0.04, 'Распаковка архива…');
    await ensureCdn('jszip');
    for (var zi = 0; zi < zipFiles.length; zi++) {
      var zbuf = await zipFiles[zi].arrayBuffer();
      var zip = await JSZip.loadAsync(zbuf);
      var names = Object.keys(zip.files);
      for (var ni = 0; ni < names.length; ni++) {
        (function(entryName) {
          var entry = zip.files[entryName];
          if (entry.dir) return;
          if (isJunkFile(entryName)) return;
          collected.push({
            name: entryName,
            getData: function() { return entry.async('arraybuffer'); }
          });
        })(names[ni]);
      }
    }
  }

  // Обычные файлы (выбор папки / drag&drop)
  plainFiles.forEach(function(f) {
    var path = f.webkitRelativePath || f.name;
    if (isJunkFile(path)) return;
    collected.push({
      name: path,
      getData: function() { return f.arrayBuffer(); }
    });
  });

  console.log('[DrawingParser] Файлов после сбора: ' + collected.length);

  // Классификация
  var specPdfs = [], sbPdfs = [], detailPdfs = [], dxfNames = {};
  collected.forEach(function(item) {
    var base = item.name.replace(/^.*[\/\\]/, '');
    var lower = base.toLowerCase();
    if (lower.endsWith('.pdf')) {
      if (base.indexOf('СП') !== -1) specPdfs.push(item);
      else if (base.indexOf('СБ') !== -1 || base.indexOf('МЧ') !== -1) sbPdfs.push(item);
      else detailPdfs.push(item);
    } else if (lower.endsWith('.dxf')) {
      dxfNames[base.replace(/\.dxf$/i, '')] = true;
    }
  });

  console.log('[DrawingParser] СП=' + specPdfs.length + ' СБ/МЧ=' + sbPdfs.length +
    ' Деталей=' + detailPdfs.length + ' DXF=' + Object.keys(dxfNames).length);

  var totalFiles = specPdfs.length + sbPdfs.length + detailPdfs.length;
  if (totalFiles === 0) {
    var pdfCount = collected.filter(function(c){return /\.pdf$/i.test(c.name);}).length;
    if (pdfCount === 0)
      throw new Error('Не найдено ни одного PDF. Выберите папку с чертежами, PDF-файлы или ZIP-архив.');
    else
      throw new Error('PDF найдены (' + pdfCount + '), но без обозначений V3-… — это не чертежи Teplofor.');
  }

  var processed = 0, allSpecs = {}, parsedParents = {}, detailMaterials = {}, errors = [];

  function baseName(item) { return item.name.replace(/^.*[\/\\]/, ''); }
  function parentOf(name) {
    // было: только префикс V3-. Для КВК-… возвращалось всё имя файла целиком,
    // из-за чего ключи спецификаций/материалов не совпадали с обозначениями.
    return dpNormDesig(name.replace(/\.pdf$/i, ''));
  }

  async function safeParse(item, label) {
    try {
      var buf = await item.getData();
      return await dpExtractPdfPages(buf);
    }
    catch (err) {
      errors.push(label + ' ' + baseName(item) + ': ' + err.message);
      console.warn('[DrawingParser] ' + label + ' ' + baseName(item) + ':', err.message);
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

  // 4. Сбор результата с учётом дерева спецификаций
  //    Проблема: если СП «Теплообменник с обвесом» ссылается на дочерний СП
  //    «Теплообменник», парсер обрабатывает оба независимо и дублирует позиции.
  //    Решение: строим дерево, обходим его, пропуская детали/стандартные из
  //    родительского СП если они принадлежат дочернему СП. Также учитываем
  //    множитель: если сборочная единица входит в количестве >1 (напр. Петля ×4),
  //    все её стандартные изделия умножаются на это количество.

  // 4a. Собираем множители из секций assemblies
  var childQty = {};  // designation → qty (сколько раз сборка входит в родителя)
  var childOf = {};   // childDesignation → parentDesignation
  Object.keys(allSpecs).forEach(function(parent) {
    var asm = allSpecs[parent].assemblies || [];
    asm.forEach(function(it) {
      if (it.designation && allSpecs[it.designation]) {
        childQty[it.designation] = it.qty || 1;
        childOf[it.designation] = parent;
      }
    });
  });

  // 4b. Определяем «корневые» спецификации (те, кто сам не является дочерним)
  var roots = Object.keys(allSpecs).filter(function(k) { return !childOf[k]; });

  // 4c. Рекурсивный обход дерева
  var purchased = [], allDetails = [];
  var visited = {};

  function flattenSpec(specKey, multiplier) {
    if (visited[specKey]) return;  // защита от циклов
    visited[specKey] = true;
    var sec = allSpecs[specKey];
    if (!sec) return;

    // Стандартные изделия — с множителем
    (sec.standard_items || []).forEach(function(it) {
      purchased.push({ name: it.name, qty: it.qty * multiplier,
        designation: it.designation, parent: specKey });
    });
    (sec.other_items || []).forEach(function(it) {
      purchased.push({ name: it.name, qty: it.qty * multiplier,
        designation: it.designation, parent: specKey });
    });

    // Детали — с множителем
    (sec.details || []).forEach(function(it) {
      var d = it.designation, hasDxf = false;
      if (d) Object.keys(dxfNames).forEach(function(dn) { if (dpNormDesig(dn).indexOf(d) !== -1) hasDxf = true; });
      var mi = detailMaterials[d] || {};
      allDetails.push({ pos: it.pos, designation: d, name: it.name || mi.name || '',
        qty: it.qty * multiplier, parent: specKey, material: mi.material || '',
        thickness: mi.thickness || '', mass: mi.mass || '', hasDxf: hasDxf });
    });

    // Рекурсия в дочерние сборочные единицы
    (sec.assemblies || []).forEach(function(it) {
      if (it.designation && allSpecs[it.designation]) {
        flattenSpec(it.designation, multiplier * (it.qty || 1));
      }
    });
  }

  roots.forEach(function(r) { flattenSpec(r, 1); });

  // Прокат определяем и по названию детали, и по её материалу: деталь «Стойка»
  // из швеллера раньше уезжала в «Прочие» и для закупки не существовала.
  // Уголок, двутавр и квадрат в старый список вообще не входили.
  var RE_PROFILE = /Труба|Швеллер|Уголок|Двутавр|Балка|Круг\s+\d|Квадрат\s+\d|Полоса/i;
  var isProfile = function(d) {
    return RE_PROFILE.test(d.name || '') || RE_PROFILE.test(d.material || '');
  };

  var cutting  = allDetails.filter(function(d) { return d.hasDxf; });
  // Разделяем ДО .map: dpParsePipeInfo мутирует d.name, и порядок фильтров
  // иначе начал бы влиять на результат.
  var nonDxf   = allDetails.filter(function(d) { return !d.hasDxf; });
  var pipesRaw = nonDxf.filter(isProfile);
  var otherDetails = nonDxf.filter(function(d) { return !isProfile(d); });

  var pipes = pipesRaw.map(function(d) {
    var pi = dpParsePipeInfo(d.name);
    d.name = pi.name;
    d.material = d.material || pi.material;
    d.thickness = d.thickness || pi.thickness;
    d.pipeLength = pi.pipeLength;
    return d;
  });

  // ── Консолидация: одна строка на обозначение, количества СУММИРУЮТСЯ ──
  // Было: покупные дедупились по name|qty|parent (одна деталь из разных узлов →
  // разные строки), раскрой — по обозначению с ПОТЕРЕЙ количеств, «прочие» — не
  // дедупились вовсе. Снабженец видел, напр., «Полку двери» дважды. Теперь сводим
  // по обозначению (без него — по имени+материалу), суммируя кол-во, и помечаем
  // подозрительное на проверку человеку: одно обозначение из нескольких узлов и
  // детали от другого изделия (кросс-ссылка, напр. КВК-800 в заказе КВК-1200).
  var orderPrefixes = {};
  roots.forEach(function(r) { var m = String(r).match(/^([A-Za-zА-Яа-яЁё]+-\d+)/); if (m) orderPrefixes[m[1]] = 1; });
  function dpConsolidate(items, opts) {
    opts = opts || {};
    var map = {}, order = [];
    items.forEach(function(it) {
      var d = (it.designation || '').trim();
      var key = d || ('name:' + (it.name || '').trim() + '|' + (it.material || ''));
      if (!map[key]) { map[key] = { it: it, qty: 0, parents: [] }; order.push(key); }
      var e = map[key];
      e.qty += (it.qty || 0);
      var par = it.parent || '';
      if (par && e.parents.indexOf(par) === -1) e.parents.push(par);
      if (!e.it.material && it.material) e.it.material = it.material;
      if (!e.it.thickness && it.thickness) e.it.thickness = it.thickness;
      if (it.pipeLength && !e.it.pipeLength) e.it.pipeLength = it.pipeLength;
    });
    return order.map(function(key) {
      var e = map[key], it = e.it;
      it.qty = e.qty;
      var flags = [];
      var pm = String(it.designation || '').match(/^([A-Za-zА-Яа-яЁё]+-\d+)/);
      if (pm && !orderPrefixes[pm[1]]) flags.push('\u26a0 деталь от другого изделия (' + pm[1] + ')');
      if (!opts.fastener && e.parents.length > 1) flags.push('\u26a0 из ' + e.parents.length + ' узлов — проверить кол-во');
      if (flags.length) it.note = (it.note ? it.note + '; ' : '') + flags.join('; ');
      return it;
    });
  }
  var pDedup = dpConsolidate(purchased, { fastener: true });
  var cDedup = dpConsolidate(cutting);
  otherDetails = dpConsolidate(otherDetails);
  pipes = dpConsolidate(pipes);

  // ── Агрегация проката для закупки: суммарная длина и число хлыстов ──
  // Прокат заказывают в метрах/хлыстах, а не «штуками заготовок». Сводим одинаковый
  // профиль+материал в одну строку: пишем суммарную длину и округляем до хлыстов.
  // PROFILE_STOCK_MM/CUT_ALLOWANCE_MM — бизнес-параметры, при необходимости вынести
  // в справочник. Если длина заготовки не распозналась — метраж не считаем, а помечаем
  // unknownLength=true, чтобы человек подтвердил вручную (эталон — 1С + подтверждение).
  var PROFILE_STOCK_MM = 6000;   // длина хлыста по умолчанию, мм
  var CUT_ALLOWANCE_MM = 0;      // припуск на рез на заготовку, мм
  var pipeAgg = {};
  pipes.forEach(function(d) {
    var key = (d.name || '?') + ' | ' + (d.material || '');
    if (!pipeAgg[key]) pipeAgg[key] = { name: d.name || '', material: d.material || '',
      thickness: d.thickness || '', pieces: 0, totalLengthMm: 0, unknownLength: false };
    var a = pipeAgg[key];
    var q = d.qty || 0;
    a.pieces += q;
    var L = parseFloat(String(d.pipeLength).replace(',', '.'));
    if (isFinite(L) && L > 0 && q > 0) a.totalLengthMm += (L + CUT_ALLOWANCE_MM) * q;
    else a.unknownLength = true;   // длина/кол-во не распознаны — на подтверждение
  });
  var pipesAggregated = Object.keys(pipeAgg).map(function(k) {
    var a = pipeAgg[k];
    var bars = a.totalLengthMm > 0 ? Math.ceil(a.totalLengthMm / PROFILE_STOCK_MM) : 0;
    return { name: a.name, material: a.material, thickness: a.thickness,
      pieces: a.pieces, totalLengthMm: Math.round(a.totalLengthMm),
      totalLengthM: Math.round(a.totalLengthMm / 10) / 100,
      bars: bars, stockMm: PROFILE_STOCK_MM, unknownLength: a.unknownLength };
  });

  console.log('[DrawingParser] ИТОГО: покупных=' + pDedup.length + ' раскрой=' + cDedup.length +
    ' прокат=' + pipes.length + ' (сводных=' + pipesAggregated.length + ')' +
    ' прочие=' + otherDetails.length + ' ошибок=' + errors.length);

  onProgress(1, 'Готово');
  return { purchased: pDedup, cutting: cDedup, pipes: pipes,
    pipesAggregated: pipesAggregated, otherDetails: otherDetails,
    errors: errors,
    stats: { specFiles: specPdfs.length, sbFiles: sbPdfs.length,
      detailFiles: detailPdfs.length, dxfFiles: Object.keys(dxfNames).length } };
}
