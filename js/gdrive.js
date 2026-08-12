// teploros · gdrive.js
// Чтение папки Google Drive напрямую в парсер чертежей.
// Убирает круг «скачать из Диска → положить в Загрузки → перетащить в систему».
//
// ВАЖНО: parseDrawingFiles() принимает File-объекты и внутри вызывает f.arrayBuffer().
// Поэтому здесь мы скачиваем содержимое и заворачиваем его обратно в File — парсер
// не отличает такой файл от выбранного вручную, и его код менять не пришлось вообще.

// ──────────────────────────────────────────────────────────────
// НАСТРОЙКА (заполнить один раз перед деплоем)
// Google Cloud Console → APIs & Services → Credentials → OAuth client ID
// Тип: Web application. Authorized JavaScript origins:
//   https://qwertyffhjf.github.io
// ──────────────────────────────────────────────────────────────
// API-ключ (Google Cloud → Credentials → API key). Папка «Чертежи» открыта
// «всем по ссылке», поэтому вход через Google не нужен — читаем по ключу.
const GDRIVE_API_KEY = 'AIzaSyBItp6XNV7dCW4Yp8YZsEiGQa1hCmkHd2A';

const GDRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

// Ссылку на папку люди приносят в разном виде — вытаскиваем id из всех вариантов.
function gdExtractFolderId(url) {
  if (!url) return '';
  const s = String(url).trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;          // голый id
  let m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);        // .../folders/ID
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);                 // ...open?id=ID
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);                   // .../d/ID/...
  if (m) return m[1];
  return '';
}

function gdIsConfigured() {
  return !!GDRIVE_API_KEY;
}

function gdKeyUrl(url) {
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(GDRIVE_API_KEY);
}

function gdApi(url) {
  return fetch(gdKeyUrl(url)).then(function(r) {
    if (r.status === 403 || r.status === 404) {
      return r.text().then(function(t) {
        throw new Error('Папка недоступна (HTTP ' + r.status + '). '
          + 'Проверьте, что папка открыта «всем по ссылке». ' + t.slice(0, 160));
      });
    }
    if (!r.ok) throw new Error('Drive API вернул HTTP ' + r.status);
    return r.json();
  });
}

// Рекурсивный обход папки. Подпапки чертежей — обычное дело (Сборка / Детали / DXF),
// парсер ждёт пути вида "Детали/КВ-1234.pdf", поэтому склеиваем префикс.
function gdListFolder(folderId, prefix, onProgress, acc, depth) {
  acc = acc || [];
  prefix = prefix || '';
  depth = depth || 0;
  if (depth > 5) return Promise.resolve(acc);   // защита от циклических ярлыков

  const base = 'https://www.googleapis.com/drive/v3/files';
  const params = "?q='" + folderId + "'+in+parents+and+trashed%3Dfalse"
    + '&fields=nextPageToken,files(id,name,mimeType,size)'
    + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';

  function page(pageToken) {
    const url = base + params + (pageToken ? '&pageToken=' + pageToken : '');
    return gdApi(url).then(function(json) {
      const files = json.files || [];
      const subfolders = [];
      files.forEach(function(f) {
        if (f.mimeType === GDRIVE_FOLDER_MIME) {
          subfolders.push(f);
        } else {
          acc.push({ id: f.id, path: prefix + f.name, size: Number(f.size || 0) });
        }
      });
      if (onProgress) onProgress(0.05, 'Читаю папку… найдено ' + acc.length);
      // Подпапки — последовательно, чтобы не упереться в лимит запросов Drive
      const walk = subfolders.reduce(function(p, sf) {
        return p.then(function() {
          return gdListFolder(sf.id, prefix + sf.name + '/', onProgress, acc, depth + 1);
        });
      }, Promise.resolve());
      return walk.then(function() {
        return json.nextPageToken ? page(json.nextPageToken) : acc;
      });
    });
  }
  return page(null);
}

// Скачивание. Парсеру нужны только PDF, DXF и ZIP — остальное (чек-листы в docx,
// картинки, превью) не тянем вообще, чтобы не жечь трафик на большой папке.
const GD_WANTED_RE = /\.(pdf|dxf|zip)$/i;

function gdDownloadAsFiles(items, onProgress) {
  const wanted = items.filter(function(it) { return GD_WANTED_RE.test(it.path); });
  const out = [];
  if (!wanted.length) return Promise.resolve(out);

  let done = 0;
  return wanted.reduce(function(p, it) {
    return p.then(function() {
      const url = 'https://www.googleapis.com/drive/v3/files/' + it.id
        + '?alt=media&supportsAllDrives=true';
      return fetch(gdKeyUrl(url))
        .then(function(r) {
          if (!r.ok) throw new Error('Не скачался ' + it.path + ' (HTTP ' + r.status + ')');
          return r.blob();
        })
        .then(function(blob) {
          // Имя с путём — парсер сам обрежет каталог там, где ему нужно базовое имя
          out.push(new File([blob], it.path, { type: blob.type }));
          done++;
          if (onProgress) {
            onProgress(0.05 + 0.45 * (done / wanted.length),
              'Скачиваю с Диска: ' + done + ' из ' + wanted.length);
          }
        })
        .catch(function(e) {
          console.warn('[GDrive] пропущен файл:', it.path, e.message);
          done++;
        });
    });
  }, Promise.resolve()).then(function() { return out; });
}

// Нормализация номера для сравнения: «45/26 НТ» и «45/26НТ» становятся одинаковыми.
function gdNormNum(s) {
  return String(s || '').trim().replace(/\s+/g, '').toUpperCase();
}

// Совпадает ли имя папки с номером заказа.
// Точное равенство или номер + хвост, начинающийся НЕ с цифры и НЕ с '/'.
// Так «45/26» ловит «45/26 НТ» и «45/26НТ», но НЕ ловит «45/26/1» и «450/26».
function gdFolderMatchesOrder(folderName, orderNumber) {
  var f = gdNormNum(folderName);
  var o = gdNormNum(orderNumber);
  if (!o) return false;
  if (f === o) return true;
  if (f.indexOf(o) === 0) {
    var rest = f.slice(o.length);
    return /^[^0-9\/]/.test(rest);   // хвост — буква, скобка, пробел был убран нормализацией
  }
  return false;
}

// Ищет подпапки заказа внутри общей папки «Чертежи».
// Возвращает массив {id, name} — 0, 1 или несколько совпадений.
async function gdFindOrderFolders(rootFolderUrl, orderNumber) {
  const rootId = gdExtractFolderId(rootFolderUrl);
  if (!rootId) throw new Error('В настройках не задана ссылка на общую папку чертежей');

  const base = 'https://www.googleapis.com/drive/v3/files';
  const params = "?q='" + rootId + "'+in+parents+and+mimeType%3D'" + GDRIVE_FOLDER_MIME
    + "'+and+trashed%3Dfalse&fields=nextPageToken,files(id,name)"
    + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';

  const found = [];
  let pageToken = null;
  do {
    const url = base + params + (pageToken ? '&pageToken=' + pageToken : '');
    const json = await gdApi(url);
    (json.files || []).forEach(function(f) {
      if (gdFolderMatchesOrder(f.name, orderNumber)) found.push({ id: f.id, name: f.name });
    });
    pageToken = json.nextPageToken;
  } while (pageToken);
  return found;
}

// Скачивает содержимое конкретной папки по id → массив File для parseDrawingFiles().
// Ищет и скачивает файл бланка ТЗ (Excel) в папке заказа.
// Признак: .xlsx/.xls; приоритет именам с «бланк»/«тз». Возвращает { file, name } или null.
async function gdLoadSpecFile(folderId, onProgress) {
  if (!onProgress) onProgress = function() {};
  onProgress(0.1, 'Ищу бланк ТЗ в папке заказа…');
  const items = await gdListFolder(folderId, '', onProgress, [], 0);
  const xls = items.filter(function(it) { return /\.(xlsx|xls)$/i.test(it.path); });
  if (!xls.length) return null;

  // Приоритет: имя содержит «бланк» или «тз»
  xls.sort(function(a, b) {
    var pa = /бланк|тз/i.test(a.path) ? 0 : 1;
    var pb = /бланк|тз/i.test(b.path) ? 0 : 1;
    return pa - pb;
  });
  const pick = xls[0];

  onProgress(0.5, 'Скачиваю бланк: ' + pick.path);
  const url = 'https://www.googleapis.com/drive/v3/files/' + pick.id
    + '?alt=media&supportsAllDrives=true';
  const r = await fetch(gdKeyUrl(url));
  if (!r.ok) throw new Error('Не скачался бланк ТЗ (HTTP ' + r.status + ')');
  const blob = await r.blob();
  return { file: new File([blob], pick.path, { type: blob.type }), name: pick.path,
           multiple: xls.length > 1 };
}

async function gdLoadFolderIdAsFiles(folderId, onProgress) {
  if (!onProgress) onProgress = function() {};
  onProgress(0.03, 'Читаю содержимое папки…');
  const items = await gdListFolder(folderId, '', onProgress, [], 0);
  if (!items.length) throw new Error('Папка пуста или недоступна');
  const files = await gdDownloadAsFiles(items, onProgress);
  if (!files.length) {
    throw new Error('В папке нет PDF, DXF или ZIP (всего файлов: ' + items.length + ')');
  }
  console.log('[GDrive] загружено файлов для парсера: ' + files.length + ' из ' + items.length);
  return files;
}

// Главная функция: прямая ссылка на папку → массив File (запасной путь, ручная ссылка).
async function gdLoadFolderAsFiles(folderUrl, onProgress) {
  const folderId = gdExtractFolderId(folderUrl);
  if (!folderId) throw new Error('Не похоже на ссылку папки Google Диска');
  return gdLoadFolderIdAsFiles(folderId, onProgress);
}
