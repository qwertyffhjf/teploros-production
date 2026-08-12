// teploros · spec-parser.js
// Разбор бланка ТЗ (заказ-наряда), который заполняет отдел продаж.
// Источник заказа — выгрузка 1С; бланк добавляет только КОМПЛЕКТАЦИЮ,
// которой в 1С нет: фланцы, блок управления, жаровые трубы и т.п.
//
// Структура бланка стабильна (единый шаблон): метка в колонке B с номером
// «1) …», значение в C, D или E. Читается через SheetJS (XLSX уже подключён).
//
// ВАЖНО: результат — ПРЕДЛОЖЕНИЕ для ПДО, не готовая запись. Бланк заполняется
// человеком в свободной форме, поэтому распознанное показывается на подтверждение.

// Поля бланка, которые едут в комплектацию. Порядок = порядок показа.
// key — по нормализованной метке (без номера, в нижнем регистре).
const SPEC_COMPONENT_FIELDS = [
  { key: 'горелка',            title: 'Горелка' },
  { key: 'фланец глухой',      title: 'Фланец глухой' },
  { key: 'фланец переходной',  title: 'Фланец переходной' },
  { key: 'фланец проставка',   title: 'Фланец проставка' },
  { key: 'блок управления',    title: 'Блок управления' },
  { key: 'жаровые трубы',      title: 'Жаровые трубы' },
  { key: 'турбулизаторы',      title: 'Турбулизаторы' },
  { key: 'выход труб',         title: 'Выход труб (подача/обратка)', prefix: true },
  { key: 'шильдик',            title: 'Шильдик' },
  { key: 'паспорт',            title: 'Паспорт' },
  { key: 'вид топлива',        title: 'Вид топлива' }
];

function spNorm(s) {
  return String(s == null ? '' : s).trim();
}

// «1) Наименование изделия» → «наименование изделия»
function spStripNum(label) {
  return spNorm(label).replace(/^\d+\)\s*/, '').toLowerCase();
}

// Нормализация «да»/«нет»: терпима к «да.», «Нет», «+/-», лишним пробелам.
// Всё, что не да/нет (например текст блока управления) — возвращаем как есть.
function spYesNo(v) {
  const t = spNorm(v).toLowerCase().replace(/[.\s]/g, '');
  if (t === 'да' || t === 'есть' || t === '+' || t === 'да,') return 'да';
  if (t === 'нет' || t === '-' || t === '') return 'нет';
  return spNorm(v);
}

// Строит карту { нормализованная_метка: {label, value} } из строк листа.
function spBuildMap(rows) {
  const map = {};
  rows.forEach(function(r) {
    const label = spNorm(r[1]); // колонка B
    if (!label) return;
    let val = '';
    // значение — первая непустая из C(2), D(3), E(4)
    for (const ci of [2, 3, 4]) {
      if (spNorm(r[ci])) { val = spNorm(r[ci]); break; }
    }
    const key = spStripNum(label);
    if (key && !(key in map)) map[key] = { label: label.replace(/^\d+\)\s*/, ''), value: val };
  });
  return map;
}

// Ищет запись по ключу с учётом того, что метка может начинаться с key (prefix:true).
function spFind(map, field) {
  if (map[field.key]) return map[field.key];
  if (field.prefix) {
    const hit = Object.keys(map).find(function(k) { return k.indexOf(field.key) === 0; });
    if (hit) return map[hit];
  }
  return null;
}

// Главная функция: File бланка → { orderNumber, meta, components[] }.
// components — массив { name, detail, raw } — то, что предложим ПДО.
async function parseSpecFile(file) {
  if (typeof XLSX === 'undefined') {
    await ensureCdn('xlsx');
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const map = spBuildMap(rows);

  const orderNumberRaw = (map['заказ-наряд №'] || {}).value || '';

  const components = [];
  SPEC_COMPONENT_FIELDS.forEach(function(field) {
    const e = spFind(map, field);
    if (!e) return;
    const v = spYesNo(e.value);
    // «нет» или пусто — заказывать нечего, пропускаем
    if (v === 'нет' || v === '') return;
    components.push({
      name: field.title,
      detail: (v === 'да' ? '' : e.value),  // текстовое значение (модель блока и т.п.)
      raw: e.value
    });
  });

  return {
    orderNumberRaw: orderNumberRaw,
    meta: {
      product:  (map['наименование изделия'] || {}).value || '',
      qty:      (map['количество'] || {}).value || '',
      manager:  (map['менеджер'] || {}).value || '',
      customer: (map['заказчик'] || {}).value || ''
    },
    components: components
  };
}
