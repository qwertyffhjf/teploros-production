// teploros · shared.js
// Общие компоненты используемые несколькими модулями

// ==================== CSS: модалки + сеть ====================
// Инжектируем один раз при загрузке модуля
;(function() {
  if (document.getElementById('_tp_shared_style')) return;
  const s = document.createElement('style');
  s.id = '_tp_shared_style';
  s.textContent = `
    /* Backdrop: плавное затемнение */
    @keyframes _tpBackdropIn  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes _tpBackdropOut { from { opacity: 1 } to { opacity: 0 } }

    /* Модалка: появляется снизу + scale */
    @keyframes _tpModalIn {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to   { opacity: 1; transform: scale(1)    translateY(0); }
    }
    @keyframes _tpModalOut {
      from { opacity: 1; transform: scale(1)    translateY(0); }
      to   { opacity: 0; transform: scale(0.96) translateY(6px); }
    }

    /* Класс для всех модальных контейнеров (внутренний div) */
    .modal-animated {
      animation: _tpModalIn 0.22s cubic-bezier(0.2, 0, 0, 1) both;
    }

    /* Сетевой индикатор */
    @keyframes _tpNetPulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.6; }
    }
    #_tp_net_bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 3px;
      z-index: 9999;
      transition: background 0.4s, opacity 0.4s;
      pointer-events: none;
    }
    #_tp_net_bar.online  { background: #1D9E75; opacity: 0; }
    #_tp_net_bar.offline { background: #E24B4A; opacity: 1; animation: _tpNetPulse 1.5s ease-in-out infinite; }
    #_tp_net_toast {
      position: fixed;
      bottom: 80px; left: 50%; transform: translateX(-50%);
      background: #E24B4A; color: #fff;
      padding: 8px 18px; border-radius: 20px;
      font-size: 13px; font-weight: 500;
      z-index: 9999; pointer-events: none;
      transition: opacity 0.3s, transform 0.3s;
      white-space: nowrap;
    }
    #_tp_net_toast.hidden { opacity: 0; transform: translateX(-50%) translateY(8px); }

    @media (prefers-reduced-motion: reduce) {
      .modal-animated, #_tp_net_bar { animation: none !important; }
    }
  `;
  document.head.appendChild(s);

  // ── Сетевой индикатор — DOM-узлы ──────────────────────────────
  const bar = document.createElement('div');
  bar.id = '_tp_net_bar';
  document.body.appendChild(bar);

  const toast = document.createElement('div');
  toast.id = '_tp_net_toast';
  toast.className = 'hidden';
  toast.textContent = '⚠ Нет соединения — данные могут не сохраняться';
  document.body.appendChild(toast);

  let toastTimer = null;

  const setOnline = () => {
    bar.className = 'online';
    toast.className = 'hidden';
    clearTimeout(toastTimer);
  };
  const setOffline = () => {
    bar.className = 'offline';
    toast.className = '';
    clearTimeout(toastTimer);
    // Скрываем toast через 5с, полоска остаётся
    toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 5000);
  };

  window.addEventListener('online',  setOnline);
  window.addEventListener('offline', setOffline);
  if (!navigator.onLine) setOffline();
})();

// ==================== QR-сканер (встроенный) ====================
const QRScannerModal = memo(({ onScan, onClose }) => {
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const scannerInstance = useRef(null);
  // Стабилизируем onScan через ref — чтобы useEffect не перезапускался при каждом рендере
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    // Обычно html5-qrcode уже загружен вместе с field-бандлом до того, как рабочий
    // вообще увидел свой экран (см. core.js: BUNDLES.field). Но на случай, если этот
    // компонент когда-нибудь станет доступен другой роли раньше готовности бандла —
    // догружаем библиотеку явно, а не просто показываем ошибку.
    ensureCdn('html5qrcode').catch(err => { if (!cancelled) setError('Не удалось загрузить библиотеку QR: ' + err.message); });
    const timer = setTimeout(() => {
      if (cancelled) return;
      if (!window.Html5Qrcode) { setError('Библиотека QR не загружена'); return; }
      const el = document.getElementById('qr-scanner-region');
      if (!el) { setError('Элемент не найден'); return; }
      try {
        const scanner = new window.Html5Qrcode('qr-scanner-region');
        scannerInstance.current = scanner;
        scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            scanner.stop().catch(() => {});
            onScanRef.current(decodedText);
          },
          () => {}
        ).then(() => setReady(true)).catch(err => {
          // iOS Safari требует user gesture — пробуем без facingMode
          scanner.start(
            { facingMode: 'user' },
            { fps: 10, qrbox: { width: 200, height: 200 } },
            (decodedText) => { scanner.stop().catch(() => {}); onScanRef.current(decodedText); },
            () => {}
          ).then(() => setReady(true)).catch(err2 => {
            setError('Нет доступа к камере. Разрешите доступ в настройках браузера.\n' + err2.message);
          });
        });
      } catch(e) { setError('Ошибка запуска: ' + e.message); }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (scannerInstance.current) {
        scannerInstance.current.stop().catch(() => {});
        scannerInstance.current = null;
      }
    };
  }, []); // пустой dep — запускается один раз

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 } },
    h('div', { style: { color: '#fff', fontSize: 16, marginBottom: 16, textAlign: 'center', fontWeight: 500 } },
      ready ? '📷 Наведите камеру на QR-код' : '⏳ Запуск камеры...'
    ),
    error && h('div', { style: { color: '#ff6b6b', fontSize: 13, marginBottom: 12, textAlign: 'center', maxWidth: 300, whiteSpace: 'pre-line', lineHeight: 1.5 } }, error),
    h('div', { id: 'qr-scanner-region', style: { width: 280, height: 280, borderRadius: 16, overflow: 'hidden', background: '#111', border: ready ? '2px solid #EF9F27' : '2px solid #333' } }),
    h('div', { style: { color: 'var(--muted)', fontSize: 11, marginTop: 12, textAlign: 'center' } },
      ready ? 'Держите QR-код в рамке' : 'Убедитесь что разрешили доступ к камере'
    ),
    h('button', { style: { ...gbtn(), color: '#fff', borderColor: 'rgba(255,255,255,0.3)', marginTop: 20, padding: '14px 40px', fontSize: 15 }, onClick: onClose }, 'Закрыть')
  );
});

// ==================== Расход материалов (модал при завершении) ====================
const MaterialConsumptionModal = memo(({ data, opId, onSave, onSkip }) => {
  const [items, setItems] = useState([{ materialId: '', qty: '' }]);
  const addRow = () => setItems(prev => [...prev, { materialId: '', qty: '' }]);
  const updateRow = (i, field, val) => setItems(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeRow = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const save = () => {
    const valid = items.filter(r => r.materialId && r.qty && Number(r.qty) > 0);
    onSave(valid.map(r => ({ materialId: r.materialId, qty: Number(r.qty), opId, ts: now() })));
  };
  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 } },
    h('div', { className: 'modal-animated', style: { background: 'var(--card-solid,#fff)', borderRadius: 12, padding: 20, width: 'min(380px, calc(100vw - 32px))', maxHeight: '70vh', overflowY: 'auto' } },
      h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 12 } }, 'Расход материалов'),
      items.map((r, i) => h('div', { key: i, style: { display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' } },
        h('select', { style: { ...S.inp, flex: 2 }, value: r.materialId, onChange: e => updateRow(i, 'materialId', e.target.value) },
          h('option', { value: '' }, '— материал —'),
          data.materials.map(m => h('option', { key: m.id, value: m.id }, `${m.name} (${m.quantity} ${m.unit})`))
        ),
        h('input', { type: 'number', step: '0.1', style: { ...S.inp, width: 70 }, placeholder: 'Кол-во', value: r.qty, onChange: e => updateRow(i, 'qty', e.target.value) }),
        h('button', { style: { background: 'none', border: 'none', color: RD, cursor: 'pointer', fontSize: 16 }, onClick: () => removeRow(i) }, '×')
      )),
      h('button', { style: gbtn({ fontSize: 11, marginBottom: 12 }), onClick: addRow }, '+ Добавить материал'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { style: gbtn({ flex: 1 }), onClick: onSkip }, 'Пропустить'),
        h('button', { style: abtn({ flex: 1 }), onClick: save }, 'Сохранить расход')
      )
    )
  );
});


// ==================== Себестоимость заказа ====================
const calcOrderCost = (order, data, hourlyRate = 500) => {
  const ops = data.ops.filter(op => op.orderId === order.id);
  const doneOps = ops.filter(op => op.status === 'done' && op.startedAt && op.finishedAt);
  const laborHours = doneOps.reduce((s, op) => s + (op.finishedAt - op.startedAt) / 3600000, 0);
  const laborCost = laborHours * hourlyRate;
  
  const materialCost = (data.materialConsumptions || [])
    .filter(mc => ops.some(op => op.id === mc.opId))
    .reduce((s, mc) => {
      const mat = data.materials.find(m => m.id === mc.materialId);
      return s + (mc.qty * (mat?.unitCost || 0));
    }, 0);
  return { laborHours: Math.round(laborHours * 10) / 10, laborCost: Math.round(laborCost), materialCost: Math.round(materialCost), totalCost: Math.round(laborCost + materialCost), opsTotal: ops.length, opsDone: doneOps.length };
};

// ==================== PDF Паспорт изделия ====================
// ==================== МОДУЛЬ МАТЕРИАЛОВ ====================
// Хранение: firestore.collection('materials').doc(`needs_${year}`)
// Структура needs_doc: { orders: { [orderId]: OrderNeeds } }
// OrderNeeds: { orderId, groups: [{ id, name, items: [Item] }] }
// Item: { id, name, code, material, thickness, qty, unit, length, note, status }
// status: 'pending' | 'ordered' | 'received'

// ── DB-слой для материалов ──────────────────────────────────
const MaterialsDB = (() => {
  if (!firestore) return null;
  const col = () => firestore.collection('materials');
  const docRef = (year) => col().doc(`needs_${year}`);
  const currentYear = () => new Date().getFullYear();

  return {
    // Загрузить потребности по заказу (может быть в текущем или прошлом году)
    async load(orderId) {
      const yr = currentYear();
      for (const y of [yr, yr - 1]) {
        try {
          const snap = await docRef(y).get();
          if (snap.exists) {
            const d = snap.data();
            const payload = d.payload ? JSON.parse(d.payload) : d;
            if (payload.orders?.[orderId]) {
              return { year: y, needs: payload.orders[orderId] };
            }
          }
        } catch(e) { /* ignore */ }
      }
      return { year: yr, needs: null };
    },

    // Сохранить потребности по заказу
    async save(orderId, needs, year) {
      const yr = year || currentYear();
      const ref = docRef(yr);
      try {
        const snap = await ref.get();
        let payload = {};
        if (snap.exists) {
          const d = snap.data();
          try { payload = d.payload ? JSON.parse(d.payload) : d; } catch(e) { payload = d; console.error('shared JSON.parse failed', e); }
        }
        if (!payload.orders) payload.orders = {};
        payload.orders[orderId] = needs;
        await ref.set({ payload: JSON.stringify(payload), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        return true;
      } catch(e) {
        console.error('MaterialsDB.save error:', e);
        return false;
      }
    },

    // Загрузить все потребности за год (для склада)
    async loadAll(year) {
      const yr = year || currentYear();
      try {
        const snap = await docRef(yr).get();
        if (!snap.exists) return {};
        const d = snap.data();
        const payload = d.payload ? JSON.parse(d.payload) : d;
        return payload.orders || {};
      } catch(e) { return {}; }
    },

    // Удалить потребности по заказу (используется при безвозвратном удалении заказа —
    // например при чистке дублей). Ищем в текущем и прошлом году, как и load().
    async remove(orderId) {
      const yr = currentYear();
      for (const y of [yr, yr - 1]) {
        try {
          const ref = docRef(y);
          const snap = await ref.get();
          if (!snap.exists) continue;
          const d = snap.data();
          let payload = {};
          try { payload = d.payload ? JSON.parse(d.payload) : d; } catch(e) { payload = d; }
          if (payload.orders && payload.orders[orderId]) {
            delete payload.orders[orderId];
            await ref.set({ payload: JSON.stringify(payload), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            return true;
          }
        } catch(e) { /* ignore */ }
      }
      return false;
    },
  };
})();

// ── Утилиты ────────────────────────────────────────────────
const DEFAULT_GROUPS = [
  { id: 'raскрой',   name: 'Раскрой' },
  { id: 'prokat',    name: 'Профильный прокат' },
  { id: 'komplekt',  name: 'Комплектация' },
];

const ITEM_UNITS = ['шт', 'м', 'кг', 'л', 'компл', 'м²'];

const makeGroup = (name) => ({ id: uid(), name, items: [] });
const makeItem  = ()      => ({
  id: uid(), name: '', code: '', material: '', thickness: '',
  qty: 1, unit: 'шт', length: '', note: '', status: 'pending',
});

// Статус → цвет и текст
const STATUS_MAP = {
  pending:  { label: 'Ожидается', color: 'var(--muted)',    bg: 'rgba(0,0,0,0.05)'       },
  ordered:  { label: 'Заказано',  color: BL2, bg: 'rgba(24,95,165,0.1)'   },
  partial:  { label: 'Частично',  color: AM2, bg: 'rgba(239,159,39,0.12)' },
  received: { label: 'Получено',  color: GN2, bg: 'rgba(15,110,86,0.1)'   },
};

// Экспорт в Excel через SheetJS
const exportNeedsToExcel = async (order, needs) => {
  await ensureCdn('xlsx');
  const wb = XLSX.utils.book_new();
  (needs.groups || []).forEach(group => {
    const rows = [
      [`Заявка на материалы — Заказ ${order?.number || ''} — ${order?.product || ''}`],
      [`Группа: ${group.name}${group.requestNumber ? `   |   № Заявки: ${group.requestNumber}` : ''}`],
      [],
      ['№', 'Наименование', 'Материал', 'Толщина, мм', 'Кол-во', 'Ед.', 'Длина, м', 'Статус', 'Примечание'],
    ];
    (group.items || []).forEach((item, i) => {
      rows.push([
        i + 1, item.name, item.material, item.thickness,
        item.qty, item.unit, item.length,
        STATUS_MAP[item.status]?.label || item.status, item.note,
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [4,30,20,16,10,8,6,8,12,24].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, group.name.slice(0, 31));
  });
  XLSX.writeFile(wb, `Заявка_${order?.number || 'заказ'}.xlsx`);
};

// Парсинг Excel (формат заявки технолога)
const parseNeedsFromExcel = (file, onResult) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await ensureCdn('xlsx');
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const groups = [];
      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        const items = [];

        // Ищем строку-заголовок по ключевым словам
        let headerRow = -1;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const r = rows[i].join(' ').toLowerCase();
          if (r.includes('чертеж') || r.includes('наименование') || r.includes('деталь') ||
              r.includes('материал') || r.includes('толщ') || r.includes('кол-во') || r.includes('кол.')) {
            headerRow = i; break;
          }
        }
        // Fallback: первая строка с 3+ непустыми ячейками
        if (headerRow < 0) {
          for (let i = 0; i < Math.min(10, rows.length); i++) {
            if (rows[i].filter(c => String(c).trim()).length >= 3) { headerRow = i; break; }
          }
        }
        if (headerRow < 0) headerRow = 0;

        const headers = rows[headerRow].map(h => String(h).toLowerCase().trim());
        const col = (kws) => {
          const idx = headers.findIndex(h => kws.some(k => h.includes(k)));
          return idx >= 0 ? idx : -1;
        };

        // Расширенный маппинг — поддерживает формат "Чертеж детали" (code+name в одной колонке)
        const cols = {
          nameOrCode: col(['чертеж детали', 'чертеж', 'наименование', 'название', 'деталь', 'обозначение', 'код']),
          material:   col(['материал', 'марка']),
          thickness:  col(['толщ', 'толщина']),
          qty:        col(['кол-во деталей', 'кол-во', 'количество', 'кол.']),
          unit:       col(['ед.', 'единиц', 'ед ']),
          length:     col(['длина', 'длин']),
          note:       col(['коментари', 'примечани', 'comment', 'комментари']),
        };

        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.every(c => String(c).trim() === '')) continue;
          const get = (c) => c >= 0 ? String(row[c] ?? '').trim() : '';
          const raw = get(cols.nameOrCode);
          if (!raw) continue;
          if (!isNaN(raw.replace(',', '.').replace(' ', ''))) continue;
          if (raw.length < 2) continue;
          if (raw.toLowerCase().includes('итого') || raw.toLowerCase().includes('всего')) continue;
          if (raw === '№' || raw.toLowerCase() === 'наименование') continue;

          // Наименование = весь текст как есть (код + название вместе)
          let code = '', name = raw;
          items.push({
            id: uid(), name, code,
            material:  get(cols.material),
            thickness: get(cols.thickness),
            qty:       parseFloat(get(cols.qty)) || 1,
            unit:      get(cols.unit) || 'шт',
            length:    get(cols.length),
            note:      get(cols.note),
            status:    'pending',
          });
        }
        if (items.length > 0) {
          groups.push({ id: uid(), name: sheetName, items });
        }
      });
      onResult({ ok: true, groups });
    } catch(e) {
      onResult({ ok: false, error: e.message });
    }
  };
  reader.readAsArrayBuffer(file);
};
// ── Компонент редактора одной позиции ──────────────────────
const ItemRow = memo(({ item, groupId, onUpdate, onDelete, canEdit, selected, onSelect, autoEdit = false }) => {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(item);

  const save = () => { onUpdate(groupId, draft); setEditing(false); };
  const cancel = () => { setDraft(item); setEditing(false); };
  const upd = (k, v) => setDraft(p => ({ ...p, [k]: v }));

  const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
  const inp = (k, placeholder, w = '100%', type = 'text') =>
    h('input', { value: draft[k] ?? '', placeholder, type,
      style: { width: w, fontSize: 12, padding: '3px 6px', border: '0.5px solid var(--border)', borderRadius: 4, background: 'var(--card)', color: 'var(--fg)' },
      onChange: e => upd(k, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value) });

  const rowBg = selected ? 'rgba(226,75,74,0.06)' : 'transparent';

  const inpStyle = { width: '100%', fontSize: 12, padding: '5px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--card)', color: 'var(--fg)', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl = (text) => h('div', { style: { fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 500 } }, text);

  if (editing) return h('tr', { style: { background: 'rgba(239,159,39,0.06)' } },
    h('td', { colSpan: 9, style: { padding: '10px 12px' } },
      h('div', { style: { marginBottom: 8 } },
        lbl('Наименование'),
        h('textarea', { value: draft.name ?? '', placeholder: 'Наименование позиции',
          rows: 2,
          style: { ...inpStyle, resize: 'vertical', minHeight: 40 },
          onChange: e => upd('name', e.target.value) })
      ),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 } },
        h('div', { style: { flex: '2 1 160px' } },
          lbl('Материал'),
          h('input', { value: draft.material ?? '', placeholder: 'Материал', type: 'text',
            style: inpStyle, onChange: e => upd('material', e.target.value) })
        ),
        h('div', { style: { flex: '0 1 80px' } },
          lbl('Толщина, мм'),
          h('input', { value: draft.thickness ?? '', placeholder: 'мм', type: 'text',
            style: inpStyle, onChange: e => upd('thickness', e.target.value) })
        ),
        h('div', { style: { flex: '0 1 80px' } },
          lbl('Кол-во'),
          h('input', { value: draft.qty ?? '', placeholder: '1', type: 'number',
            style: inpStyle, onChange: e => upd('qty', parseFloat(e.target.value) || 0) })
        ),
        h('div', { style: { flex: '0 1 80px' } },
          lbl('Ед.'),
          h('select', { value: draft.unit,
            style: { ...inpStyle, cursor: 'pointer' },
            onChange: e => upd('unit', e.target.value) },
            ITEM_UNITS.map(u => h('option', { key: u, value: u }, u)))
        ),
        h('div', { style: { flex: '0 1 80px' } },
          lbl('Длина, м'),
          h('input', { value: draft.length ?? '', placeholder: 'м', type: 'text',
            style: inpStyle, onChange: e => upd('length', e.target.value) })
        ),
        h('div', { style: { flex: '3 1 200px' } },
          lbl('Примечание'),
          h('textarea', { value: draft.note ?? '', placeholder: 'Примечание',
            rows: 2, style: { ...inpStyle, resize: 'vertical', minHeight: 40 },
            onChange: e => upd('note', e.target.value) })
        )
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { onClick: save,   style: { fontSize: 12, padding: '5px 16px', background: AM, color: AM2, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 } }, '✓ Сохранить'),
        h('button', { onClick: cancel, style: { fontSize: 12, padding: '5px 16px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' } }, 'Отмена')
      )
    )
  );

  return h('tr', { style: { borderBottom: '0.5px solid var(--border-soft)', background: rowBg, transition: 'background 0.1s' } },
    // Чекбокс + кнопка удалить (всегда видна при canEdit)
    h('td', { style: { padding: '5px 6px', whiteSpace: 'nowrap' } },
      canEdit && h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        h('input', { type: 'checkbox', checked: selected, onChange: () => onSelect(item.id),
          style: { width: 14, height: 14, cursor: 'pointer', accentColor: RD } }),
        h('button', { onClick: () => { setDraft(item); setEditing(true); }, title: 'Редактировать',
          style: { fontSize: 12, color: 'var(--fg-muted)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' } }, '✎'),
        h('button', { onClick: () => onDelete(groupId, item.id), title: 'Удалить позицию',
          style: { fontSize: 13, color: RD, background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px', opacity: 0.7 } }, '🗑')
      )
    ),
    h('td', { style: { padding: '5px 4px', fontSize: 12, color: item.name ? 'var(--fg)' : '#aaa' } }, item.name || '—'),

    h('td', { style: { padding: '5px 4px', fontSize: 11, color: 'var(--muted)' } }, item.material || ''),
    h('td', { style: { padding: '5px 4px', fontSize: 11, textAlign: 'center', color: 'var(--muted)' } }, item.thickness ? `${item.thickness} мм` : ''),
    h('td', { style: { padding: '5px 4px', fontSize: 12, fontWeight: 500, textAlign: 'center' } }, `${item.qty} ${item.unit}`),
    h('td', { style: { padding: '5px 4px', fontSize: 11, color: 'var(--muted)', textAlign: 'center' } }, item.length ? `${item.length} м` : ''),
    h('td', { style: { padding: '5px 4px', fontSize: 11, color: 'var(--muted)', minWidth: 120, maxWidth: 260 } },
      item.note ? h('span', { style: { display: 'block', lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' } }, item.note) : ''
    ),
    h('td', { style: { padding: '5px 6px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        h('span', { style: { fontSize: 10, padding: '2px 7px', borderRadius: 10, background: st.bg, color: st.color, fontWeight: 500, whiteSpace: 'nowrap', cursor: canEdit ? 'pointer' : 'default' },
          onClick: canEdit ? () => {
            const order = ['pending','ordered','received'];
            const next = order[(order.indexOf(item.status) + 1) % order.length];
            onUpdate(groupId, { ...item, status: next });
          } : undefined,
          title: canEdit ? 'Нажмите для смены статуса' : '' }, st.label)
      )
    )
  );
});

// ── Компонент группы ────────────────────────────────────────
const MaterialGroup = memo(({ group, onUpdateGroup, onDeleteGroup, onUpdateItem, onDeleteItem, onDeleteMany, onAddItem, canEdit, onUpdateItemStatus, onUpdateGroupReqNum }) => {
  const [editingName, setEditingName]   = useState(false);
  const [draftName, setDraftName]       = useState(group.name);
  const [collapsed, setCollapsed]       = useState(false);
  const [selected, setSelected]         = useState(new Set());
  const [editingReqNum, setEditingReqNum] = useState(false);
  const [draftReqNum, setDraftReqNum]   = useState(group.requestNumber || '');

  const items = group.items || [];
  const pendingCount  = items.filter(i => i.status === 'pending').length;
  const orderedCount  = items.filter(i => i.status === 'ordered').length;
  const receivedCount = items.filter(i => i.status === 'received').length;
  const total         = items.length;
  const allSelected   = total > 0 && selected.size === total;
  const someSelected  = selected.size > 0;

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)));
  const deleteSelected = () => {
    if (!someSelected) return;
    onDeleteMany(group.id, [...selected]);
    setSelected(new Set());
  };

  return h('div', { style: { marginBottom: 16, border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' } },
    // Заголовок группы
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg)', cursor: 'pointer' },
      onClick: () => !editingName && setCollapsed(c => !c) },
      h('span', { style: { fontSize: 13 } }, collapsed ? '▶' : '▼'),
      editingName
        ? h('input', { value: draftName, autoFocus: true, onClick: e => e.stopPropagation(),
            style: { fontSize: 13, fontWeight: 600, padding: '2px 6px', border: '0.5px solid var(--border)', borderRadius: 4, background: 'var(--card)', color: 'var(--fg)' },
            onChange: e => setDraftName(e.target.value),
            onKeyDown: e => { if (e.key === 'Enter') { onUpdateGroup(group.id, draftName); setEditingName(false); } if (e.key === 'Escape') { setDraftName(group.name); setEditingName(false); } },
            onBlur: () => { onUpdateGroup(group.id, draftName); setEditingName(false); } })
        : h('span', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, group.name),
      // Счётчики
      total > 0 && h('div', { style: { display: 'flex', gap: 6, fontSize: 11 } },
        pendingCount  > 0 && h('span', { style: { color: 'var(--muted)'    } }, `⏳ ${pendingCount}`),
        orderedCount  > 0 && h('span', { style: { color: BL2 } }, `📦 ${orderedCount}`),
        receivedCount > 0 && h('span', { style: { color: GN        } }, `✓ ${receivedCount}`),
      ),
      // Номер заявки в шапке группы
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 }, onClick: e => e.stopPropagation() },
        canEdit && editingReqNum
          ? h('input', { autoFocus: true, placeholder: 'З-2026-047', value: draftReqNum,
              style: { fontSize: 11, padding: '2px 7px', border: `0.5px solid ${AM}`, borderRadius: 4, background: 'var(--card)', color: 'var(--fg)', width: 110 },
              onChange: e => setDraftReqNum(e.target.value),
              onBlur: () => { onUpdateGroupReqNum && onUpdateGroupReqNum(group.id, draftReqNum); setEditingReqNum(false); },
              onKeyDown: e => { if (e.key === 'Enter') { onUpdateGroupReqNum && onUpdateGroupReqNum(group.id, draftReqNum); setEditingReqNum(false); } if (e.key === 'Escape') setEditingReqNum(false); }
            })
          : h('span', {
              title: canEdit ? 'Нажмите чтобы задать номер заявки' : '',
              onClick: canEdit ? () => { setDraftReqNum(group.requestNumber || ''); setEditingReqNum(true); } : undefined,
              style: { fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: canEdit ? 'pointer' : 'default',
                background: group.requestNumber ? `${AM}22` : 'transparent',
                border: group.requestNumber ? `0.5px solid ${AM}` : `0.5px dashed var(--border)`,
                color: group.requestNumber ? AM2 : 'var(--muted)', whiteSpace: 'nowrap' }
            }, group.requestNumber ? `№ ${group.requestNumber}` : '+ № заявки')
      ),
      canEdit && h('div', { style: { display: 'flex', gap: 4 }, onClick: e => e.stopPropagation() },
        h('button', { onClick: () => setEditingName(true),
          style: { fontSize: 11, padding: '2px 7px', border: '0.5px solid var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer' } }, '✎ Переим.'),
        h('button', { onClick: () => onDeleteGroup(group.id),
          style: { fontSize: 11, padding: '2px 7px', border: `0.5px solid ${RD}`, borderRadius: 4, color: RD, background: 'transparent', cursor: 'pointer' } }, '🗑 Группу'))
    ),

    // Панель пакетного удаления (появляется когда что-то выбрано)
    canEdit && someSelected && !collapsed && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: 'rgba(226,75,74,0.07)', borderTop: `1px solid ${RD}22` } },
      h('span', { style: { fontSize: 12, color: RD, fontWeight: 500 } }, `Выбрано: ${selected.size}`),
      h('button', { onClick: deleteSelected,
        style: { fontSize: 12, padding: '4px 14px', background: RD, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 } },
        `🗑 Удалить ${selected.size} позиц.`),
      h('button', { onClick: () => setSelected(new Set()),
        style: { fontSize: 12, padding: '4px 10px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' } },
        'Снять выбор')
    ),

    // Таблица позиций
    !collapsed && h('div', { style: { overflowX: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
        h('thead', null, h('tr', { style: { background: 'var(--bg)', fontSize: 11, color: 'var(--muted)' } },
          [
            // Первая колонка — чекбокс «выбрать все» (только canEdit)
            canEdit ? h('th', { key: 'chk', style: { padding: '5px 6px', width: 52, borderBottom: '0.5px solid var(--border-soft)' } },
              h('input', { type: 'checkbox', checked: allSelected, onChange: toggleAll,
                style: { width: 14, height: 14, cursor: 'pointer', accentColor: RD } })
            ) : h('th', { key: 'chk', style: { width: 8 } }),
            ...['Наименование', 'Материал', 'Толщина', 'Кол-во', 'Длина', 'Примечание', 'Статус'].map((col, i) =>
              h('th', { key: i, style: { padding: '5px 6px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--border-soft)' } }, col))
          ]
        )),
        h('tbody', null,
          items.map(item =>
            h(ItemRow, { key: item.id, item, groupId: group.id, canEdit,
              selected: selected.has(item.id),
              onSelect: toggleSelect,
              onUpdate: (gid, updItem) => onUpdateItem(gid, updItem),
              onDelete: onDeleteItem })
          ),
          items.length === 0 && h('tr', null,
            h('td', { colSpan: 10, style: { padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 } },
              'Нет позиций — добавьте вручную или импортируйте из Excel')
          )
        )
      ),

      // Нижняя панель
      h('div', { style: { display: 'flex', gap: 8, padding: '6px 10px', borderTop: '0.5px solid var(--border-soft)', flexWrap: 'wrap', alignItems: 'center' } },
        canEdit && h('button', { onClick: () => onAddItem(group.id),
          style: { fontSize: 11, padding: '4px 10px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: AM2 } },
          '+ Добавить позицию'),
        !canEdit && items.filter(i => i.status !== 'received').length > 0 &&
          h('button', { onClick: () => onUpdateItemStatus(group.id, 'received'),
            style: { fontSize: 11, padding: '4px 10px', border: `0.5px solid ${GN}`, borderRadius: 6, color: GN, background: 'transparent', cursor: 'pointer' } },
            '✓ Отметить всё получено'),

      )
    )
  );
});

// ── Главный компонент — OrderMaterialsEditor ────────────────
// Используется в карточке заказа (вкладка "Материалы")
const OrderMaterialsEditor = memo(({ order, data, onUpdate, addToast, canEdit = true, warehouseMode = false }) => {
  const [needs, setNeeds]       = useState(null);  // { groups: [...] }
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);
  const [year, setYear]         = useState(new Date().getFullYear());
  const fileRef = useRef(null);
  const drawingFileRef = useRef(null);
  const [drawingProgress, setDrawingProgress] = useState(null); // null | { pct, msg }
  const [showDropZone, setShowDropZone] = useState(false);
  // Папка чертежей на Google Диске.
  // driveUrl — ручной запасной путь (прямая ссылка, если автопоиск не нашёл).
  // driveCandidates — несколько папок с одним номером (напр. 45/26 и 45/26 НТ) — спрашиваем, какую.
  const [driveUrl, setDriveUrl] = useState('');
  const [driveCandidates, setDriveCandidates] = useState(null); // null | [{id, name}]
  const [dragOver, setDragOver] = useState(false);

  const [showImportComponents, setShowImportComponents] = useState(false);

  // Загрузка при монтировании
  useEffect(() => {
    if (!order?.id || !MaterialsDB) { setLoading(false); return; }
    setLoading(true);
    MaterialsDB.load(order.id).then(({ year: y, needs: n }) => {
      setYear(y);
      const loaded = n || { groups: DEFAULT_GROUPS.map(g => ({ ...makeGroup(g.name), id: g.id })) };
      setNeeds(loaded);
      setLoading(false);
      // Если есть components в заказе и группа Комплектация пустая — предложить импорт
      const components = order.components || [];
      if (components.length > 0) {
        const komplekt = loaded.groups.find(g => g.id === 'komplekt' || g.name.toLowerCase().includes('комплект'));
        if (komplekt && (!komplekt.items || komplekt.items.length === 0)) {
          setShowImportComponents(true);
        }
      }
    });
  }, [order?.id]);

  // Сохранение
  const save = useCallback(async (updNeeds) => {
    if (!MaterialsDB) return;
    setSaving(true);
    const ok = await MaterialsDB.save(order.id, updNeeds, year);
    setSaving(false);
    setDirty(false);
    if (!ok) addToast('Ошибка сохранения материалов', 'error');
  }, [order?.id, year, addToast]);

  const updNeeds = useCallback((fn) => {
    setNeeds(prev => {
      const next = fn(prev);
      setDirty(true);
      save(next);
      return next;
    });
  }, [save]);

  // Импорт комплектации из заказа — объявлен до early returns (правило хуков)
  const importComponentsFromOrder = useCallback(() => {
    const components = order.components || [];
    if (!components.length) return;
    updNeeds(p => {
      const groups = p.groups.map(g => {
        if (g.id !== 'komplekt' && !g.name.toLowerCase().includes('комплект')) return g;
        const newItems = components.map(c => ({
          id: uid(),
          name: [c.code || c.article, c.name || c.description].filter(Boolean).join(' - ') || '—',
          code: '',
          material: '', thickness: '',
          qty: c.qty || 1, unit: c.unit || 'шт',
          length: '', note: c.note || '',
          status: 'pending',
        }));
        return { ...g, items: [...(g.items || []), ...newItems] };
      });
      return { ...p, groups };
    });
    setShowImportComponents(false);
    addToast(`Импортировано ${components.length} позиций комплектации`, 'success');
  }, [order, updNeeds, addToast]);

  // Группы
  // ── Импорт из чертежей (ZIP) ──────────────────────────────
  const handleDrawingImport = useCallback(async (files) => {
    if (!files || !files.length) return;
    setShowDropZone(false);
    if (typeof parseDrawingFiles !== 'function') {
      addToast('Парсер чертежей не загружен', 'error'); return;
    }
    setDrawingProgress({ pct: 0, msg: 'Начинаю…' });
    try {
      var result = await parseDrawingFiles(files, function(pct, msg) {
        setDrawingProgress({ pct: pct, msg: msg });
      });
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(function(e) { console.warn('DrawingParser:', e); });
      }
      // Формируем группы
      var groups = [];
      // 1. Раскрой
      if (result.cutting && result.cutting.length > 0) {
        groups.push({
          id: 'raskroj', name: 'Лазерный раскрой',
          items: result.cutting.map(function(c) { return {
            id: uid(), name: c.name, code: c.designation,
            material: c.material, thickness: c.thickness,
            qty: c.qty || 1, unit: 'шт', length: '',
            note: c.mass ? 'Масса: ' + c.mass + ' кг' : '',
            status: 'pending'
          }; })
        });
      }
      // 2. Прокат — в метрах и хлыстах (из pipesAggregated нового парсера).
      //    Кол-во = число хлыстов к закупке, Ед. = «хлыст (6м)», Длина = суммарные метры,
      //    Примечание = число заготовок. Если длина не распозналась — помечаем на
      //    подтверждение человеком (кол-во показываем в штуках заготовок).
      //    Fallback на поштучный result.pipes, если развёрнут ещё старый drawing-parser.
      var prokatItems = null;
      if (result.pipesAggregated && result.pipesAggregated.length > 0) {
        prokatItems = result.pipesAggregated.map(function(a) {
          var unknown = a.unknownLength || !a.totalLengthMm;
          return {
            id: uid(), name: a.name, code: '',
            material: a.material || '', thickness: a.thickness || '',
            qty: unknown ? (a.pieces || 0) : a.bars,
            unit: unknown ? 'шт (?)' : ('хлыст (' + Math.round((a.stockMm || 6000) / 1000) + 'м)'),
            length: unknown ? '' : a.totalLengthM,
            note: unknown
              ? '\u26a0 длина заготовки не распознана — уточнить; заготовок: ' + (a.pieces || 0)
              : 'заготовок: ' + (a.pieces || 0),
            status: 'pending'
          };
        });
      } else if (result.pipes && result.pipes.length > 0) {
        prokatItems = result.pipes.map(function(p) { return {
          id: uid(), name: p.name, code: p.designation || '',
          material: p.material || '', thickness: p.thickness || '',
          qty: p.qty || 1, unit: 'шт', length: p.pipeLength || '',
          note: '', status: 'pending'
        }; });
      }
      if (prokatItems && prokatItems.length > 0) {
        groups.push({ id: 'prokat', name: 'Прокат', items: prokatItems });
      }
      // 3. Покупные (стандартные изделия)
      if (result.purchased && result.purchased.length > 0) {
        groups.push({
          id: 'komplekt', name: 'Покупные изделия',
          items: result.purchased.map(function(p) { return {
            id: uid(), name: p.name, code: p.designation || '',
            material: '', thickness: '',
            qty: p.qty || 1, unit: 'шт', length: '',
            note: '', status: 'pending'
          }; })
        });
      }
      // 4. Прочие детали (токарка и пр.)
      if (result.otherDetails && result.otherDetails.length > 0) {
        groups.push({
          id: uid(), name: 'Прочие детали',
          items: result.otherDetails.map(function(d) { return {
            id: uid(), name: d.name, code: d.designation || '',
            material: d.material || '', thickness: d.thickness || '',
            qty: d.qty || 1, unit: 'шт', length: '',
            note: d.mass ? 'Масса: ' + d.mass + ' кг' : '',
            status: 'pending'
          }; })
        });
      }
      if (groups.length === 0) {
        addToast('Не удалось извлечь данные из чертежей', 'error');
        setDrawingProgress(null);
        return;
      }
      // Защита от потери приёмки: если в текущей ведомости уже есть отмеченные
      // позиции (заказано/частично/получено), перезапись сотрёт их статусы.
      // Разбор чертежей теперь запускается легко и может повториться — спрашиваем.
      var hasProgress = (needs && needs.groups || []).some(function(g) {
        return (g.items || []).some(function(it) { return it.status && it.status !== 'pending'; });
      });
      if (hasProgress) {
        var ok = window.confirm('В заявке уже отмечены полученные или заказанные позиции. '
          + 'Разбор чертежей заменит ведомость и сотрёт эти отметки. Продолжить?');
        if (!ok) { setDrawingProgress(null); return; }
      }
      updNeeds(function() { return { groups: groups }; });
      var totalItems = groups.reduce(function(s, g) { return s + g.items.length; }, 0);
      addToast('Из чертежей: ' + groups.length + ' групп, ' + totalItems + ' позиций'
        + (result.stats.dxfFiles > 0 ? ', ' + result.stats.dxfFiles + ' DXF' : ''), 'success');
    } catch (err) {
      console.error('DrawingImport error:', err);
      addToast('Ошибка парсинга: ' + err.message, 'error');
    }
    setDrawingProgress(null);
  }, [updNeeds, needs, addToast]);

  // Импорт из конкретной папки Диска по id.
  // File-объекты приезжают из Drive API и идут в тот же handleDrawingImport, что и ручной выбор.
  const importFromFolderId = useCallback(async (folderId) => {
    setDriveCandidates(null);
    setShowDropZone(false);
    setDrawingProgress({ pct: 0, msg: 'Подключаюсь к Google Диску…' });
    try {
      const files = await gdLoadFolderIdAsFiles(folderId, (pct, msg) => {
        setDrawingProgress({ pct, msg });
      });
      await handleDrawingImport(files);
    } catch (err) {
      console.error('DriveImport error:', err);
      addToast('Google Диск: ' + err.message, 'error');
      setDrawingProgress(null);
    }
  }, [handleDrawingImport, addToast]);

  // Автопоиск папки заказа по номеру внутри общей папки «Чертежи» (ссылка — в настройках).
  // 1 папка → парсим сразу. Несколько → спрашиваем. 0 → предлагаем ручную ссылку.
  const handleDriveAutoFind = useCallback(async () => {
    if (typeof gdFindOrderFolders !== 'function') {
      addToast('Модуль Google Диска не загружен', 'error'); return;
    }
    if (!gdIsConfigured()) {
      addToast('Не настроен ключ Google Диска', 'error'); return;
    }
    const rootUrl = data?.settings?.drawingsRootUrl || '';
    if (!rootUrl) {
      addToast('В настройках не задана общая папка чертежей', 'error');
      setShowDropZone(true);
      return;
    }
    const num = (order?.number || '').trim();
    if (!num) { addToast('У заказа нет номера', 'error'); return; }

    setDriveCandidates(null);
    setDrawingProgress({ pct: 0, msg: 'Ищу папку заказа ' + num + '…' });
    try {
      const folders = await gdFindOrderFolders(rootUrl, num);
      if (folders.length === 0) {
        setDrawingProgress(null);
        addToast('Папка заказа ' + num + ' не найдена — вставьте ссылку вручную', 'error');
        setShowDropZone(true);
        return;
      }
      if (folders.length === 1) {
        await importFromFolderId(folders[0].id);
        return;
      }
      setDrawingProgress(null);
      setDriveCandidates(folders);
    } catch (err) {
      console.error('DriveAutoFind error:', err);
      setDrawingProgress(null);
      addToast('Google Диск: ' + err.message, 'error');
    }
  }, [data, order, importFromFolderId, addToast]);

  // Ручной запасной путь: прямая ссылка на папку
  const handleDriveManualImport = useCallback(async () => {
    const url = (driveUrl || '').trim();
    if (!url) { addToast('Вставьте ссылку на папку', 'error'); return; }
    if (typeof gdExtractFolderId !== 'function') {
      addToast('Модуль Google Диска не загружен', 'error'); return;
    }
    const fid = gdExtractFolderId(url);
    if (!fid) { addToast('Не похоже на ссылку папки Google Диска', 'error'); return; }
    await importFromFolderId(fid);
  }, [driveUrl, importFromFolderId, addToast]);

  // ── Drag & Drop: рекурсивное чтение папок ──────────────────
  const readEntriesRecursive = useCallback(async (entry) => {
    if (entry.isFile) {
      return [await new Promise((res, rej) => entry.file(res, rej))];
    }
    if (entry.isDirectory) {
      var reader = entry.createReader();
      var all = [];
      var readBatch = () => new Promise((res, rej) => reader.readEntries(res, rej));
      var batch;
      do {
        batch = await readBatch();
        for (var i = 0; i < batch.length; i++) {
          var sub = await readEntriesRecursive(batch[i]);
          all = all.concat(sub);
        }
      } while (batch.length > 0);
      return all;
    }
    return [];
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    var items = e.dataTransfer.items;
    if (!items || !items.length) return;
    var allFiles = [];
    var promises = [];
    for (var i = 0; i < items.length; i++) {
      var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) {
        promises.push(readEntriesRecursive(entry).then(function(files) {
          allFiles = allFiles.concat(files);
        }));
      }
    }
    await Promise.all(promises);
    if (allFiles.length > 0) handleDrawingImport(allFiles);
  }, [readEntriesRecursive, handleDrawingImport]);

  const addGroup = () => updNeeds(p => ({ ...p, groups: [...(p.groups || []), makeGroup('Новая группа')] }));
  const deleteGroup = (gid) => updNeeds(p => ({ ...p, groups: p.groups.filter(g => g.id !== gid) }));
  const updateGroupName = (gid, name) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, name } : g) }));

  // Позиции
  const addItem = (gid) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, items: [...(g.items || []), makeItem()] } : g) }));
  const deleteItem = (gid, iid) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, items: g.items.filter(i => i.id !== iid) } : g) }));
  const deleteManyItems = (gid, ids) => {
    const idSet = new Set(ids);
    updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, items: g.items.filter(i => !idSet.has(i.id)) } : g) }));
  };
  const updateItem = (gid, item) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, items: g.items.map(i => i.id === item.id ? item : i) } : g) }));
  const updateAllStatus = (gid, status) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, items: g.items.map(i => ({ ...i, status })) } : g) }));

  // Импорт Excel
  const handleImport = (file) => {
    if (!file) return;
    parseNeedsFromExcel(file, ({ ok, groups, error }) => {
      if (!ok) { addToast(`Ошибка импорта: ${error}`, 'error'); return; }
      // Мержим с существующими группами или заменяем
      updNeeds(p => {
        const existing = p.groups || [];
        const newGroups = groups.map(g => {
          const found = existing.find(e => e.name.toLowerCase() === g.name.toLowerCase());
          return found ? { ...found, items: [...(found.items || []), ...g.items] } : g;
        });
        // Добавляем группы которых не было в импорте
        const imported = newGroups.map(g => g.name.toLowerCase());
        const kept = existing.filter(e => !imported.includes(e.name.toLowerCase()));
        return { ...p, groups: [...kept, ...newGroups] };
      });
      addToast(`Импортировано: ${groups.reduce((a, g) => a + g.items.length, 0)} позиций из ${groups.length} листов`, 'success');
    });
  };

  // Статистика
  const stats = useMemo(() => {
    if (!needs?.groups) return { total: 0, pending: 0, ordered: 0, received: 0 };
    const items = needs.groups.flatMap(g => g.items || []);
    return {
      total:    items.length,
      pending:  items.filter(i => i.status === 'pending').length,
      ordered:  items.filter(i => i.status === 'ordered').length,
      received: items.filter(i => i.status === 'received').length,
    };
  }, [needs]);

  if (loading) return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 } }, '⏳ Загрузка материалов…');
  if (!needs)  return h('div', { style: { padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 } }, 'Нет данных');

  return h('div', null,
    // Баннер предложения импорта комплектации
    showImportComponents && (order.components || []).length > 0 && h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(239,159,39,0.1)', border: `0.5px solid ${AM}`, borderRadius: 8, marginBottom: 12 } },
      h('div', { style: { flex: 1, fontSize: 13 } },
        h('span', { style: { fontWeight: 500, color: AM2 } }, '📦 Комплектация из заказа: '),
        `${(order.components || []).length} позиций (горелка, автоматика…) — добавить в группу «Комплектация»?`
      ),
      h('button', { onClick: importComponentsFromOrder, style: { fontSize: 12, padding: '5px 14px', background: AM, color: AM2, border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' } }, '+ Импортировать'),
      h('button', { onClick: () => setShowImportComponents(false), style: { fontSize: 12, padding: '5px 10px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' } }, 'Нет')
    ),

    // Шапка с кнопками
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
      // Статистика
      h('div', { style: { display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' } },
        [
          { label: 'Всего',    val: stats.total,    color: 'var(--fg-muted)'    },
          { label: '⏳ Ожид.', val: stats.pending,  color: 'var(--muted)'    },
          { label: '📦 Заказ.', val: stats.ordered,  color: BL2 },
          { label: '✓ Получ.', val: stats.received, color: GN        },
        ].map((s, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'baseline', gap: 4 } },
          h('span', { style: { fontSize: 18, fontWeight: 700, color: s.color } }, s.val),
          h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, s.label)
        ))
      ),
      // Кнопки действий
      h('div', { style: { display: 'flex', gap: 6 } },
        canEdit && h('button', {
          onClick: () => fileRef.current?.click(),
          style: { fontSize: 12, padding: '6px 12px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' }
        }, '📥 Импорт Excel'),
        h('button', {
          onClick: () => exportNeedsToExcel(order, needs),
          style: { fontSize: 12, padding: '6px 12px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' }
        }, '📤 Экспорт Excel'),
        canEdit && !drawingProgress && h('button', {
          onClick: handleDriveAutoFind,
          title: 'Найти папку заказа на Google Диске и разобрать чертежи',
          style: { fontSize: 12, padding: '6px 12px', border: `0.5px solid ${GN}`, borderRadius: 7, color: GN2, background: 'transparent', cursor: 'pointer', fontWeight: 500 }
        }, '📐 Из чертежей'),
        canEdit && !drawingProgress && h('button', {
          onClick: () => setShowDropZone(v => !v),
          title: 'Ручной выбор: файлы, ZIP или ссылка на папку',
          style: { fontSize: 12, padding: '6px 9px', border: `0.5px solid ${GN}`, borderRadius: 7, color: GN2, background: showDropZone ? GN3 : 'transparent', cursor: 'pointer', fontWeight: 500 }
        }, '⚙️'),
        canEdit && h('button', {
          onClick: addGroup,
          style: { fontSize: 12, padding: '6px 12px', border: `0.5px solid ${AM}`, borderRadius: 7, color: AM2, background: 'transparent', cursor: 'pointer', fontWeight: 500 }
        }, '+ Группа'),
        saving && h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, '💾 Сохранение…')
      ),
      h('input', { ref: fileRef, type: 'file', accept: '.xlsx,.xls', style: { display: 'none' },
        onChange: e => { handleImport(e.target.files[0]); e.target.value = ''; } }),
      h('input', { ref: drawingFileRef, type: 'file', accept: '.pdf,.dxf,.zip', multiple: true, style: { display: 'none' },
        onChange: e => { handleDrawingImport(e.target.files); e.target.value = ''; } }),
      showDropZone && !drawingProgress && h('div', {
        onDragOver: e => { e.preventDefault(); setDragOver(true); },
        onDragLeave: e => { e.preventDefault(); setDragOver(false); },
        onDrop: handleDrop,
        onClick: () => drawingFileRef.current?.click(),
        style: {
          marginTop: 10, padding: '24px 16px', borderRadius: 10,
          border: '2px dashed ' + (dragOver ? GN : 'var(--border)'),
          background: dragOver ? GN3 : 'var(--card-2)',
          textAlign: 'center', cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s'
        }
      },
        h('div', { style: { fontSize: 28, marginBottom: 6 } }, '📂'),
        h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--fg)' } },
          'Перетащите сюда папку с чертежами или ZIP-архив'),
        h('div', { style: { fontSize: 11, color: 'var(--muted)', marginTop: 4 } },
          'или нажмите чтобы выбрать PDF, DXF или ZIP'),
        h('div', { style: { fontSize: 11, color: 'var(--muted)', marginTop: 2 } },
          'Поддерживаются: PDF, DXF, ZIP-архив')
      ),
      showDropZone && !drawingProgress && h('div', {
        onClick: e => e.stopPropagation(),
        style: { marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }
      },
        h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, '☁️ или прямо из папки Диска:'),
        h('input', {
          value: driveUrl,
          onChange: e => setDriveUrl(e.target.value),
          placeholder: 'https://drive.google.com/drive/folders/…',
          style: { flex: 1, minWidth: 200, fontSize: 11, padding: '5px 8px',
                   borderRadius: 6, border: '0.5px solid var(--border)',
                   background: 'var(--card)', color: 'var(--fg)' }
        }),
        h('button', {
          onClick: handleDriveManualImport,
          style: { fontSize: 11, padding: '5px 10px', borderRadius: 6,
                   border: '0.5px solid ' + GN, color: GN2, background: 'transparent',
                   cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap' }
        }, 'Загрузить')
      ),
      driveCandidates && driveCandidates.length > 0 && h('div', {
        style: { marginTop: 8, padding: '10px 12px', background: GN3, borderRadius: 8, border: '0.5px solid ' + GN }
      },
        h('div', { style: { fontSize: 12, fontWeight: 600, color: GN2, marginBottom: 6 } },
          'Нашёл несколько папок для заказа ' + (order?.number || '') + ' — какая нужна?'),
        driveCandidates.map(function(f) {
          return h('button', {
            key: f.id,
            onClick: function() { importFromFolderId(f.id); },
            style: { display: 'block', width: '100%', textAlign: 'left', fontSize: 12,
                     padding: '7px 10px', marginBottom: 4, borderRadius: 6,
                     border: '0.5px solid ' + GN, color: 'var(--fg)', background: 'var(--card)',
                     cursor: 'pointer' }
          }, '📁 ' + f.name);
        }),
        h('button', {
          onClick: function() { setDriveCandidates(null); },
          style: { fontSize: 11, padding: '4px 8px', borderRadius: 6, marginTop: 2,
                   border: '0.5px solid var(--border)', color: 'var(--muted)',
                   background: 'transparent', cursor: 'pointer' }
        }, 'Отмена')
      ),
      drawingProgress && h('div', { style: { marginTop: 8, padding: '8px 12px', background: GN3, borderRadius: 8, border: '0.5px solid ' + GN } },
        h('div', { style: { fontSize: 12, fontWeight: 500, color: GN2, marginBottom: 4 } }, drawingProgress.msg),
        h('div', { style: { height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)' } },
          h('div', { style: { height: '100%', borderRadius: 2, background: GN, width: Math.round(drawingProgress.pct * 100) + '%', transition: 'width 0.3s' } })
        )
      )
    ),

    // Группы
    (needs.groups || []).map(group =>
      h(MaterialGroup, {
        key: group.id, group, canEdit,
        onUpdateGroup: updateGroupName,
        onDeleteGroup: deleteGroup,
        onUpdateItem:  updateItem,
        onDeleteItem:  deleteItem,
        onDeleteMany:  deleteManyItems,
        onAddItem:     addItem,
        onUpdateGroupReqNum: (gid, num) => updNeeds(p => ({ ...p, groups: p.groups.map(g => g.id === gid ? { ...g, requestNumber: num } : g) })),
        onUpdateItemStatus: updateAllStatus,
      })
    ),

    needs.groups?.length === 0 && h('div', { style: { textAlign: 'center', padding: '32px', color: 'var(--muted)', fontSize: 13 } },
      'Нет групп. Нажмите «+ Группа» или импортируйте Excel.'
    )
  );
});



// ==================== OrderEarningsRecalc — блок пересчёта начислений заказа ====================
// Показывает разницу между уже начисленными op.earning и тем, что дала бы текущая формула
// (актуальный прайс + текущие paymentShare этапов + фактические workerIds). Если есть расхождение —
// показывает предупреждение и кнопку "Пересчитать" с превью изменений и подтверждением.
// Не трогает старые операции без earning (fallback уже посчитан по отгрузке).
// Не трогает op-допработы (isExtraWork): их сумма заморожена по замыслу и от справочника не зависит.
const OrderEarningsRecalc = memo(({ ord, data, onUpdate, onClose }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  // Собираем все закрытые операции заказа, у которых на данный момент есть op.earning
  const earnedOps = (data.ops || []).filter(o =>
    o.orderId === ord.id && !o.archived && o.earning && o.earning.amount > 0);
  const currentTotal = earnedOps.reduce((s, o) => s + o.earning.amount * ((o.workerIds || []).length || 1), 0);

  // Вычисляем "как посчиталось бы сейчас" через calcOpPieceworkEarning
  // Функция из core.js доступна глобально. Если её нет (старая сборка) — просто не показываем блок.
  if (typeof calcOpPieceworkEarning !== 'function') return null;

  const preview = earnedOps.map(op => {
    // Пересчитываем на актуальных данных, но НЕ передаём earning — чтобы функция посчитала заново
    const opFresh = { ...op, earning: null };
    const newEarn = calcOpPieceworkEarning(data, opFresh);
    const oldPerWorker = op.earning.amount;
    const newPerWorker = newEarn?.amount || 0;
    const workerCount = (op.workerIds || []).length || 1;
    return {
      op, oldPerWorker, newPerWorker,
      oldTotal: oldPerWorker * workerCount,
      newTotal: newPerWorker * workerCount,
      workerCount,
      oldShare: op.earning.paymentShare != null ? op.earning.paymentShare : 100,
      newShare: newEarn?.paymentShare != null ? newEarn.paymentShare : (newEarn ? 100 : null),
      newEarn,
    };
  });

  const changed = preview.filter(p => p.oldPerWorker !== p.newPerWorker);
  const newTotal = preview.reduce((s, p) => s + p.newTotal, 0);
  const delta = newTotal - currentTotal;

  // Если начислений нет вообще — не показываем блок
  if (earnedOps.length === 0) return null;

  // Если всё сходится — показываем зелёный "все ок"
  if (changed.length === 0) {
    return h('div', { style: { background: 'rgba(29,158,117,0.06)', border: `0.5px solid ${GN}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 } },
      h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: GN2, textTransform: 'uppercase', marginBottom: 4 } }, '💰 Начисления по заказу'),
      h('div', { style: { fontSize: 13 } },
        `✓ Начислено ${currentTotal.toLocaleString('ru-RU')} ₽ по ${earnedOps.length} операциям — соответствует текущему прайсу и настройкам этапов.`)
    );
  }

  // Есть расхождения — показываем warning + кнопку пересчёта
  const doRecalc = async () => {
    setBusy(true);
    // Обновляем op.earning для всех изменённых операций
    const updatedOps = data.ops.map(o => {
      const p = preview.find(x => x.op.id === o.id);
      if (!p || p.oldPerWorker === p.newPerWorker) return o;
      if (!p.newEarn) return { ...o, earning: null }; // пересчёт даёт null → сбрасываем
      return { ...o, earning: p.newEarn, earningRecalcedAt: Date.now() };
    });
    let d = { ...data, ops: updatedOps };
    // Логируем действие для аудита
    if (typeof logAction === 'function') {
      d = logAction(d, 'earnings_recalc', {
        orderId: ord.id, orderNumber: ord.number,
        opsChanged: changed.length,
        oldTotal: currentTotal, newTotal, delta,
        details: changed.map(p => ({ opId: p.op.id, opName: p.op.name, oldPerWorker: p.oldPerWorker, newPerWorker: p.newPerWorker }))
      });
    }
    onUpdate(d);
    if (typeof DB !== 'undefined' && DB.save) {
      try { await DB.save(d); }
      catch { onUpdate(data); setBusy(false); return; }
    }
    setBusy(false);
    setShowPreview(false);
  };

  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const deltaColor = delta > 0 ? GN2 : delta < 0 ? RD : '#666';
  const deltaSign = delta > 0 ? '+' : '';

  return h(React.Fragment, null,
    h('div', { style: { background: 'rgba(239,159,39,0.08)', border: `0.5px solid ${AM}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 } },
      h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: AM2, textTransform: 'uppercase', marginBottom: 6 } }, '💰 Начисления по заказу — есть расхождения'),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 } },
        h('div', { style: { fontSize: 12, flex: 1, lineHeight: 1.5 } },
          `Начислено сейчас: `,
          h('b', null, `${fmt(currentTotal)} ₽`),
          ` по ${earnedOps.length} операциям. По текущим настройкам (прайс + доли этапов) должно быть `,
          h('b', null, `${fmt(newTotal)} ₽`),
          ` — изменения затронут ${changed.length} операций.`
        ),
        h('div', { style: { fontSize: 15, fontWeight: 700, color: deltaColor, whiteSpace: 'nowrap' } }, `${deltaSign}${fmt(delta)} ₽`)
      ),
      h('button', { style: { fontSize: 12, padding: '6px 14px', border: `1px solid ${AM}`, borderRadius: 7, background: AM, color: '#fff', cursor: 'pointer', fontWeight: 500 },
        onClick: () => setShowPreview(true) }, '🔄 Пересчитать начисления')
    ),

    // Модалка превью с деталями и подтверждением
    showPreview && h('div', {
      role: 'dialog', 'aria-modal': 'true',
      style: { position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 },
      onClick: e => e.target === e.currentTarget && !busy && setShowPreview(false),
    },
      h('div', { style: { background: 'var(--card)', borderRadius: 12, width: 'min(800px, calc(100vw - 32px))', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
        h('div', { style: { padding: '16px 20px', borderBottom: '0.5px solid var(--border)' } },
          h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 4 } }, `🔄 Пересчёт начислений — заказ ${ord.number}`),
          h('div', { style: { fontSize: 12, color: 'var(--muted)' } },
            `${changed.length} операций будет обновлено. Итог заказа: ${fmt(currentTotal)} → ${fmt(newTotal)} ₽ (${deltaSign}${fmt(delta)} ₽)`)
        ),
        h('div', { style: { padding: '12px 20px', overflow: 'auto', flex: 1 } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
            h('thead', null,
              h('tr', { style: { color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' } },
                ['Операция', 'Раб.', 'Было /чел', 'Доля', 'Станет /чел', 'Доля', 'Δ Всего'].map(c =>
                  h('th', { key: c, style: { textAlign: 'left', padding: '6px 8px', fontWeight: 500 } }, c))
              )
            ),
            h('tbody', null,
              changed.map(p => {
                const rowDelta = p.newTotal - p.oldTotal;
                return h('tr', { key: p.op.id, style: { borderTop: '0.5px solid var(--border-soft)' } },
                  h('td', { style: { padding: '6px 8px' } }, p.op.name || '—'),
                  h('td', { style: { padding: '6px 8px', color: 'var(--muted)' } }, p.workerCount),
                  h('td', { style: { padding: '6px 8px', color: 'var(--muted)' } }, `${fmt(p.oldPerWorker)} ₽`),
                  h('td', { style: { padding: '6px 8px', color: 'var(--muted)' } }, `${p.oldShare}%`),
                  h('td', { style: { padding: '6px 8px', fontWeight: 500 } }, p.newEarn ? `${fmt(p.newPerWorker)} ₽` : h('span', { style: { color: RD, fontSize: 11 } }, 'не начисляется')),
                  h('td', { style: { padding: '6px 8px' } }, p.newShare != null ? `${p.newShare}%` : '—'),
                  h('td', { style: { padding: '6px 8px', fontWeight: 500, color: rowDelta > 0 ? GN2 : rowDelta < 0 ? RD : '#666', whiteSpace: 'nowrap' } },
                    `${rowDelta > 0 ? '+' : ''}${fmt(rowDelta)} ₽`)
                );
              })
            )
          ),
          h('div', { style: { marginTop: 12, padding: 10, background: 'rgba(226,75,74,0.06)', border: '0.5px solid rgba(226,75,74,0.3)', borderRadius: 6, fontSize: 11, color: RD2 } },
            '⚠ Действие изменяет уже начисленные суммы. Если работникам уже выплачены деньги по старым цифрам — пересчёт создаст расхождение с бухгалтерией. Убедитесь что действие согласовано.'
          )
        ),
        h('div', { style: { padding: '12px 20px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { style: { fontSize: 12, padding: '8px 16px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: busy ? 'not-allowed' : 'pointer' },
            onClick: () => !busy && setShowPreview(false), disabled: busy }, 'Отмена'),
          h('button', { style: { fontSize: 12, padding: '8px 20px', border: `1px solid ${AM}`, borderRadius: 7, background: AM, color: '#fff', cursor: busy ? 'wait' : 'pointer', fontWeight: 500 },
            onClick: doRecalc, disabled: busy }, busy ? '⏳ Обновление...' : '✓ Применить пересчёт')
        )
      )
    )
  );
});


// ==================== OrderCardModal — универсальная карточка заказа (360°) ====================
// Использование:
//   h(OrderCardModal, { orderId, data, onClose, canEdit: false })
// canEdit: true — показывает кнопки PDF, редактирования (для мастера/ПДО)
// canEdit: false — только просмотр (для рабочего, склада)
// ==================== Печать бирки заказа А4 ====================
const printOrderLabel = (ord, data) => {
  const ops        = (data.ops || []).filter(o => o.orderId === ord.id && !o.archived);
  const done       = ops.filter(o => o.status === 'done').length;
  const components = ord.components || [];
  const priority   = { low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический' }[ord.priority] || '—';
  const prioColor  = { low: '#888', medium: '#378ADD', high: '#EF9F27', critical: '#E24B4A' }[ord.priority] || '#888';
  const daysLeft   = ord.deadline ? Math.ceil((new Date(ord.deadline) - Date.now()) / 86400000) : null;
  const deadlineStr = ord.deadline
    ? ord.deadline + (daysLeft !== null ? (daysLeft < 0 ? ' (просрочен ' + Math.abs(daysLeft) + ' дн.)' : ' (' + daysLeft + ' дн.)') : '')
    : '—';
  const deadlineColor = daysLeft === null ? '#888' : daysLeft < 0 ? '#E24B4A' : daysLeft <= 3 ? '#EF9F27' : '#333';
  const subOrders = (data.orders || []).filter(o => o.parentOrderId === ord.id && !o.archived);
  const appUrl = window.location.origin + window.location.pathname + '?order=' + ord.id;
  const qrUrl  = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(appUrl);

  const row = (label, val, color) =>
    '<tr><td style="padding:5px 10px 5px 0;font-size:12px;color:#666;white-space:nowrap;vertical-align:top">' + label + '</td>' +
    '<td style="padding:5px 0;font-size:12px;color:' + (color || '#111') + ';font-weight:500">' + val + '</td></tr>';

  const compRows = components.length > 0
    ? components.map((c, i) =>
        '<tr style="background:' + (i % 2 === 0 ? '#fafaf8' : '#fff') + '">' +
        '<td style="padding:5px 10px;font-size:11px;border-bottom:0.5px solid #eee">' + (c.name || c.description || '—') + '</td>' +
        '<td style="padding:5px 10px;font-size:11px;color:#888;border-bottom:0.5px solid #eee;font-family:monospace">' + (c.code || c.article || '—') + '</td>' +
        '<td style="padding:5px 10px;font-size:11px;text-align:center;font-weight:600;border-bottom:0.5px solid #eee">' + (c.qty || 1) + '</td>' +
        '<td style="padding:5px 10px;font-size:11px;color:#888;border-bottom:0.5px solid #eee">' + (c.unit || 'шт') + '</td></tr>'
      ).join('')
    : '<tr><td colspan="4" style="padding:10px;font-size:12px;color:#aaa;text-align:center">Нет комплектующих</td></tr>';

  const subRows = subOrders.length > 0
    ? subOrders.map((s, i) => {
        const sOps  = (data.ops || []).filter(o => o.orderId === s.id && !o.archived);
        const sDone = sOps.filter(o => o.status === 'done').length;
        const pct   = sOps.length > 0 ? Math.round(sDone / sOps.length * 100) : 0;
        return '<tr style="background:' + (i % 2 === 0 ? '#fafaf8' : '#fff') + '">' +
          '<td style="padding:5px 10px;font-size:11px;font-weight:600;color:#EF9F27;border-bottom:0.5px solid #eee">' + s.number + '</td>' +
          '<td style="padding:5px 10px;font-size:11px;border-bottom:0.5px solid #eee">' + (s.product || '—') + '</td>' +
          '<td style="padding:5px 10px;font-size:11px;font-family:monospace;color:#888;border-bottom:0.5px solid #eee">' + (s.serialNumber || '—') + '</td>' +
          '<td style="padding:5px 10px;font-size:11px;text-align:center;border-bottom:0.5px solid #eee">' + sDone + '/' + sOps.length + ' (' + pct + '%)</td></tr>';
      }).join('')
    : '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Бирка заказа ${ord.number}</title>
<style>
  @page { margin: 12mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: system-ui, Arial, sans-serif; color: #111; background: #fff; margin: 0; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #888; text-transform: uppercase; margin: 14px 0 6px; }
  .info-table { border-collapse: collapse; width: 100%; }
  .data-table { border-collapse: collapse; width: 100%; border: 0.5px solid #e0e0e0; }
  .data-table thead td { padding: 5px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; background: #f5f5f2; border-bottom: 0.5px solid #e0e0e0; }
</style></head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid #EF9F27;margin-bottom:14px">
  <div>
    <div style="font-size:10px;color:#aaa;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">
      ${ord.isParentOrder ? '📦 РОДИТЕЛЬСКИЙ ЗАКАЗ' : ord.parentOrderId ? '🔧 ПОДЗАКАЗ' : '📋 БИРКА ЗАКАЗА'}
    </div>
    <div style="font-size:32px;font-weight:800;color:#EF9F27;letter-spacing:-1px;line-height:1">${ord.number}</div>
    <div style="font-size:16px;font-weight:600;margin-top:4px">${ord.product || '—'}</div>
    ${ord.specs ? '<div style="font-size:12px;color:#666;margin-top:3px">' + ord.specs + '</div>' : ''}
    ${ord.serialNumber ? '<div style="font-size:13px;color:#EF9F27;font-family:monospace;font-weight:700;margin-top:5px">🏷 ' + ord.serialNumber + '</div>' : ''}
    <span style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:${prioColor}18;color:${prioColor};border:1px solid ${prioColor}33">${priority}</span>
  </div>
  <div style="text-align:center;flex-shrink:0;margin-left:16px">
    <img src="${qrUrl}" width="100" height="100" style="display:block;border:0.5px solid #eee;border-radius:4px" alt="QR">
    <div style="font-size:9px;color:#aaa;margin-top:4px">Карточка заказа</div>
  </div>
</div>

<div class="section-title">🗂 Основная информация</div>
<table class="info-table">
  ${ord.customer ? row('Заказчик', ord.customer) : ''}
  ${ord.productCode ? row('Код изделия', ord.productCode) : ''}
  ${row('Количество', (ord.qty || 1) + ' шт')}
  ${row('Дедлайн', deadlineStr, deadlineColor)}
  ${row('Прогресс', done + ' / ' + ops.length + ' операций')}
  ${ord.drawingUrl ? row('Чертёж / ТЗ', '<a href="' + ord.drawingUrl + '" style="color:#378ADD">' + ord.drawingUrl + '</a>') : ''}
</table>

${ord.notes ? '<div class="section-title">💬 Примечания</div><div style="font-size:12px;color:#555;padding:6px 10px;background:#fafaf8;border:0.5px solid #eee;border-radius:6px">' + ord.notes + '</div>' : ''}

${components.length > 0 ? `
<div class="section-title">📦 Комплектующие (${components.length} поз.)</div>
<table class="data-table">
  <thead><tr><td>Наименование</td><td>Код / Артикул</td><td style="text-align:center">Кол-во</td><td>Ед.</td></tr></thead>
  <tbody>${compRows}</tbody>
</table>` : ''}

${subOrders.length > 0 ? `
<div class="section-title">🔧 Подзаказы (${subOrders.length} шт.)</div>
<table class="data-table">
  <thead><tr><td>Номер</td><td>Изделие</td><td>Шильдик</td><td style="text-align:center">Прогресс</td></tr></thead>
  <tbody>${subRows}</tbody>
</table>` : ''}

<div style="margin-top:14px;padding-top:10px;border-top:0.5px solid #eee;display:flex;justify-content:space-between">
  <div style="font-size:10px;color:#aaa">Напечатано: ${new Date().toLocaleString('ru-RU')} · teploros</div>
  <div style="font-size:9px;color:#ccc;font-family:monospace">${ord.id}</div>
</div>

</body></html>`;

  // Печать через скрытый iframe — без нового окна
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.onload = () => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000); };
};

const OrderCardModal = memo(({ orderId, data, onUpdate, onClose, canEdit = false, allowRouteSheet = false, onEditMaterials, onEditDeps, userRole, onOpenOrder, onRestoreAsSimple }) => {
  if (!orderId) return null;
  const ord = data.orders.find(o => o.id === orderId);
  if (!ord) return null;

  // Переход к другому заказу (родитель ↔ подзаказ). Через prop или глобальный хелпер.
  const goToOrder = (id) => {
    if (typeof onOpenOrder === 'function') { onOpenOrder(id); return; }
    if (typeof window._tpOpenOrderCard === 'function') { onClose(); setTimeout(() => window._tpOpenOrderCard(id), 80); return; }
  };
  const parentOrd = ord.parentOrderId ? data.orders.find(o => o.id === ord.parentOrderId) : null;

  const ops        = data.ops.filter(o => o.orderId === ord.id && !o.archived);
  const done       = ops.filter(o => o.status === 'done').length;
  const inProgress = ops.filter(o => o.status === 'in_progress').length;
  const components = ord.components || [];
  const priority   = { low: { label: 'Низкий', color: 'var(--muted)' }, medium: { label: 'Средний', color: '#378ADD' }, high: { label: 'Высокий', color: '#EF9F27' }, critical: { label: 'Критический', color: '#E24B4A' } }[ord.priority] || { label: '—', color: 'var(--muted)' };
  const daysLeft   = ord.deadline ? Math.ceil((new Date(ord.deadline) - Date.now()) / 86400000) : null;
  const deadlineColor = daysLeft === null ? '#888' : daysLeft < 0 ? '#E24B4A' : daysLeft <= 3 ? '#EF9F27' : '#888';

  const ST_COLORS = { pending: '#888', in_progress: '#EF9F27', on_check: '#378ADD', weld_check: '#7E57C2', done: '#1D9E75', defect: '#E24B4A' };
  const ST_LABELS = { pending: 'Ожидает', in_progress: 'В работе', on_check: 'Контроль', weld_check: 'Сварщик', done: 'Выполнено', defect: 'Дефект' };

  return h('div', {
    role: 'dialog', 'aria-modal': 'true',
    style: { position: 'fixed', inset: 0, background: 'rgba(20,18,15,0.78)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '24px 16px', overflowY: 'auto' },
    onKeyDown: e => e.key === 'Escape' && onClose(),
    onClick: e => e.target === e.currentTarget && onClose(),
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card)', borderRadius: 14, padding: 0, width: 'min(680px, calc(100vw - 32px))', overflow: 'hidden', position: 'relative' } },

      // Тёмная шапка
      h('div', { style: { background: 'linear-gradient(135deg, #1a1a18 0%, #2d2a24 100%)', padding: '20px 24px 16px', color: '#fff' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          h('div', null,
            h('div', { style: { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 4 } }, ord.isParentOrder ? '📦 РОДИТЕЛЬСКИЙ ЗАКАЗ' : ord.parentOrderId ? '🔧 ПОДЗАКАЗ' : '📋 КАРТОЧКА ЗАКАЗА'),
            h('div', { style: { fontSize: 26, fontWeight: 700, color: '#EF9F27', letterSpacing: '-0.5px' } }, ord.number),
          ),
          h('button', { onClick: onClose, style: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: '0 4px' } }, '×')
        ),
        h('div', { style: { fontSize: 15, fontWeight: 500, color: '#fff', marginTop: 8, lineHeight: 1.3 } }, ord.product),
        ord.specs && h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 } }, ord.specs),
        ord.serialNumber && h('div', { style: { fontSize: 13, color: '#EF9F27', marginTop: 6, fontFamily: 'monospace', fontWeight: 600 } }, `🏷 Шильдик: ${ord.serialNumber}`),
      ),

      h('div', { style: { padding: '20px 24px', maxHeight: '70vh', overflowY: 'auto' } },

        // Основная информация
        h('div', { style: { background: 'var(--bg)', borderRadius: 10, padding: '12px 16px', marginBottom: 14 } },
          h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 } }, '🗂 Основное'),
          [
            ord.customer    && ['Заказчик',    ord.customer],
            ord.productCode && ['Код изделия', ord.productCode],
            ['Количество',   `${ord.qty || 1} шт`],
            ord.deadline    && ['Срок',        h('span', { style: { color: deadlineColor, fontWeight: 500 } }, ord.deadline + (daysLeft !== null ? ` (${daysLeft < 0 ? `просрочен ${Math.abs(daysLeft)} дн` : `${daysLeft} дн`})` : ''))],
            ['Приоритет',    h('span', { style: { color: priority.color, fontWeight: 500 } }, priority.label)],
            ord.drawingUrl  && ['Чертёж / ТЗ', h('a', { href: ord.drawingUrl, target: '_blank', rel: 'noopener', style: { color: '#378ADD', fontSize: 12 } }, '📐 Открыть')],
          ].filter(Boolean).map(([label, val], i) =>
            h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid var(--border-soft)', fontSize: 13 } },
              h('span', { style: { color: 'var(--muted)', fontSize: 12, flexShrink: 0, marginRight: 12 } }, label),
              h('span', { style: { textAlign: 'right' } }, val)
            )
          )
        ),

        // ── Мини-таймлайн жизненного цикла заказа ──
        (() => {
          // Для родительского заказа даты Старт/Готов агрегируем из подзаказов —
          // собственные factStartedAt/factFinishedAt у родителя устаревшие
          // (остались с момента до разделения) и вводят в заблуждение.
          const subs = ord.isParentOrder
            ? (data.orders || []).filter(o => o.parentOrderId === ord.id && !o.archived)
            : [];
          const isParentWithSubs = ord.isParentOrder && subs.length > 0;

          // Старт: самый ранний факт-старт среди подзаказов
          const aggStart = isParentWithSubs
            ? subs.map(s => s.factStartedAt).filter(Boolean).sort((a,b) => a-b)[0] || null
            : ord.factStartedAt;
          // Готов: только когда ВСЕ подзаказы завершены — берём самую позднюю дату
          const allSubsDone = isParentWithSubs && subs.every(s => s.factFinishedAt || s.shipped);
          const aggFinish = isParentWithSubs
            ? (allSubsDone ? Math.max(...subs.map(s => s.factFinishedAt || s.shippedAt || 0)) || null : null)
            : (ord.factFinishedAt || (ord.shipped ? ord.shippedAt : null));

          const deliveries = (data.materialDeliveries || []).filter(d => d.orderId === ord.id);
          const matPoints = deliveries.reduce((acc, d) => {
            if (!acc.find(a => a.materialId === d.materialId)) {
              const mat = (data.materials || []).find(m => m.id === d.materialId);
              acc.push({ materialId: d.materialId, name: mat?.name || '?', isCutting: mat?.isCutting, confirmedAt: d.status === 'confirmed' ? (d.confirmedAt || Date.now()) : null, status: d.status });
            }
            return acc;
          }, []);

          const showMaterialsReady = matPoints.length > 0;
          const milestones = [
            { key: 'contract',  label: 'Запуск',     ts: ord.contractDate || ord.createdAt, color: BL2 },
            ...matPoints.map(mp => ({ key: `mat_${mp.materialId}`, label: mp.isCutting ? `✂ ${mp.name}` : mp.name, ts: mp.confirmedAt, color: AM2, partial: mp.status === 'partial' })),
            ...(showMaterialsReady ? [{ key: 'materials', label: 'Материалы', ts: ord.materialsReadyAt, color: GN2 }] : []),
            { key: 'factStart', label: 'Старт',      ts: aggStart, color: '#eda100' },
            { key: 'factFinish',label: 'Готов',      ts: aggFinish, color: '#1baf7a' },
          ];

          const hasAny = milestones.some(m => m.ts);
          if (!hasAny) return null;

          const fmt = ts => ts ? new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';
          const waitDays = (!ord.materialsReadyAt && showMaterialsReady && (ord.contractDate || ord.createdAt))
            ? Math.floor((Date.now() - (ord.contractDate || ord.createdAt)) / 86400000) : null;
          const warnMaterials = waitDays !== null && waitDays > 5;

          return h('div', { style: { marginBottom: 14 } },
            h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 } }, '📦 Этапы производства'),

            // Flexbox-шкала: точки занимают равные доли, линия между ними встроена
            h('div', { style: { display: 'flex', alignItems: 'flex-start' } },
              milestones.map((m, i) => {
                const isDone = !!m.ts;
                const isNext = !isDone && i > 0 && !!milestones[i - 1]?.ts;
                const isLast = i === milestones.length - 1;
                const bg = isDone ? m.color : '#d8d8d4';
                const nextDone = !isLast && !!milestones[i + 1]?.ts;

                return h('div', { key: m.key, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 } },
                  // Линия + точка
                  h('div', { style: { display: 'flex', alignItems: 'center', width: '100%', marginBottom: 5 } },
                    i > 0 && h('div', { style: { flex: 1, height: 2, background: isDone ? m.color : '#e0e0dc' } }),
                    h('div', { style: {
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: bg,
                      border: `2px solid ${isDone ? m.color : 'var(--muted)'}`,
                      boxShadow: isNext ? `0 0 0 3px ${m.color}40` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: '#fff', fontWeight: 700,
                    } }, isDone ? '✓' : m.partial ? '½' : ''),
                    !isLast && h('div', { style: { flex: 1, height: 2, background: nextDone ? milestones[i + 1].color : '#e0e0dc' } })
                  ),
                  // Лейбл + дата
                  h('div', { style: { fontSize: 9, textAlign: 'center', lineHeight: 1.3, width: '100%', padding: '0 1px' } },
                    h('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDone ? '#555' : '#bbb' } }, m.label),
                    h('div', { style: { fontWeight: isDone ? 600 : 400, color: isDone ? '#333' : '#ccc', marginTop: 1, whiteSpace: 'nowrap' } }, fmt(m.ts))
                  )
                );
              })
            ),

            warnMaterials && h('div', { style: { marginTop: 8, padding: '6px 10px', background: '#fff1f0', borderRadius: 6, fontSize: 11, color: '#c0392b' } },
              `⚠ Материалы ожидаются ${waitDays} дн. — операции заблокированы`
            )
          );
        })(),

        // Подзаказы (если есть) + опциональная кнопка разделения для qty>1
        (() => {
          const subOrders = (data.orders || []).filter(o => o.parentOrderId === ord.id && !o.archived);

          // Осиротевший родитель: помечен parent, но подзаказов нет и активных операций нет.
          // Это НЕ обязательно «прерванное разделение» — чаще подзаказы удалили вручную.
          // Даём понятный выбор: восстановить как обычный заказ ИЛИ разделить на подзаказы.
          if (ord.isParentOrder && subOrders.length === 0) {
            const hasOps = (data.ops || []).some(o => o.orderId === ord.id && !o.archived);
            if (!hasOps) return h('div', { style: { padding: '12px 14px', background: AM3, borderRadius: 8, fontSize: 12, color: AM2, marginBottom: 14 } },
              h('div', { style: { marginBottom: 10, lineHeight: 1.5 } },
                h('span', { style: { fontWeight: 600 } }, '⚠ Заказ без операций и подзаказов'),
                h('br'),
                'Похоже, подзаказы были удалены. Выберите, как продолжить:'
              ),
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                // Основное действие: восстановить как обычный рабочий заказ
                canEdit && typeof onRestoreAsSimple === 'function' && h('button', {
                  style: { background: AM, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
                  title: 'Создать операции прямо на этом заказе (без разделения)',
                  onClick: () => onRestoreAsSimple(ord.id)
                }, '↺ Восстановить операции'),
                // Альтернатива: всё-таки разделить на подзаказы
                h('button', {
                  style: { background: 'transparent', color: AM, border: `0.5px solid ${AM}`, borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer' },
                  onClick: () => { if (typeof onClose === 'function') onClose(); setTimeout(() => window._tpOpenSubOrderSplit && window._tpOpenSubOrderSplit(ord.id), 100); }
                }, '🔧 Разделить на подзаказы')
              )
            );
          }

          // Есть подзаказы — показываем список
          if (subOrders.length > 0) return h('div', { style: { marginBottom: 14 } },
            h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 } },
              `🔧 Подзаказы (${subOrders.length} шт.)`
            ),
            h('div', { style: { border: '0.5px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden' } },
              subOrders.map((sub, i) => {
                const subOps = (data.ops || []).filter(o => o.orderId === sub.id && !o.archived);
                const subDone = subOps.filter(o => o.status === 'done').length;
                const pct = subOps.length > 0 ? Math.round(subDone / subOps.length * 100) : 0;
                return h('div', { key: sub.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i > 0 ? '0.5px solid var(--border-soft)' : 'none', fontSize: 12 } },
                  h('span', { style: { color: AM, cursor: 'pointer', fontWeight: 500, minWidth: 80, textDecoration: 'underline', textDecorationStyle: 'dotted' }, onClick: () => goToOrder(sub.id) }, sub.number),
                  h('div', { style: { flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' } },
                    h('div', { style: { height: '100%', width: `${pct}%`, background: pct === 100 ? GN : AM, borderRadius: 3 } })
                  ),
                  h('span', { style: { fontSize: 11, color: 'var(--muted)', minWidth: 40, textAlign: 'right' } }, `${subDone}/${subOps.length}`),
                  sub.serialNumber
                    ? h('span', { style: { fontSize: 11, fontFamily: 'monospace', color: AM2, fontWeight: 500, minWidth: 80 } }, `🏷 ${sub.serialNumber}`)
                    : h('span', { style: { fontSize: 11, color: 'var(--muted)', minWidth: 80 } }, 'нет шильдика')
                );
              })
            )
          );

          // qty > 1, нет подзаказов — опциональная кнопка (не блокирует работу)
          if (Number(ord.qty) > 1 && canEdit) return h('div', { style: { marginBottom: 14 } },
            h('button', {
              style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' },
              onClick: () => { if (typeof onClose === 'function') onClose(); setTimeout(() => window._tpOpenSubOrderSplit && window._tpOpenSubOrderSplit(ord.id), 100); }
            }, '🔧 Разделить на подзаказы')
          );

          return null;
        })(),

        // Комплектующие — блок показываем всегда для офисных ролей (там кнопка «из ТЗ»),
        // даже если позиций пока нет (заказ из 1С приходит без комплектации).
        (components.length > 0 || (canEdit && userRole !== 'worker')) && h('div', { style: { marginBottom: 14 } },
          h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 } },
            `📦 Комплектующие${components.length > 0 ? ' (' + components.length + ' поз.)' : ''}`
          ),
          h(OrderComponentsBlock, { order: ord, data, onUpdate, userRole })
        ),

        // Смета работ БМК/КНР (этап 3 плана БМК): состав работ × объёмы × расценки
        ord.productType === 'bmk' && h(BmkEstimateEditor, { order: ord, data, onUpdate, canEdit }),

        // Операции
        h('div', { style: { marginBottom: 14 } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
            h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' } }, '⚙ Операции'),
            h('div', { style: { fontSize: 12, color: 'var(--muted)' } },
              h('span', { style: { color: '#1D9E75', fontWeight: 500 } }, done),
              ` / ${ops.length}`,
              inProgress > 0 && h('span', { style: { color: '#EF9F27', marginLeft: 8 } }, `▶ ${inProgress} в работе`)
            )
          ),
          ops.length > 0 && h('div', { style: { height: 4, background: 'var(--bg)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round(done / ops.length * 100)}%`, background: '#1D9E75', borderRadius: 2 } })
          ),
          h('div', { style: { border: '0.5px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' } },
            ops.length === 0
              ? h('div', { style: { padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 13 } }, 'Нет операций')
              : ops.map((op, i) => {
                  const workers = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name).filter(Boolean);
                  return h('div', { key: op.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderTop: i > 0 ? '0.5px solid var(--border-soft)' : 'none', fontSize: 12, background: op.status === 'done' ? 'rgba(29,158,117,0.04)' : 'transparent' } },
                    h('span', { style: { fontSize: 10, minWidth: 18, color: 'var(--muted)', flexShrink: 0 } }, i + 1),
                    h('span', { style: { flex: 1, textDecoration: op.status === 'done' ? 'line-through' : 'none', color: op.status === 'done' ? 'var(--muted)' : 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, op.name),
                    workers.length > 0 && h('span', { style: { fontSize: 11, color: 'var(--muted)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, workers.join(', ')),
                    // Приёмка работ БМК мастером (этап 4): факт объёмов + начисление бригаде поровну
                    canEdit && ord.productType === 'bmk' && op.status === 'done' && h(BmkAcceptButton, { op, order: ord, data, onUpdate }),
                    h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 6, background: `${ST_COLORS[op.status] || '#888'}18`, color: ST_COLORS[op.status] || '#888', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' } }, ST_LABELS[op.status] || op.status)
                  );
                })
          )
        ),

        // Подзаказ: показываем шильдик и кнопку редактирования
        ord.parentOrderId && h('div', { style: { background: 'rgba(239,159,39,0.06)', border: `0.5px solid ${AM}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 } },
          // Ссылка на родительский заказ — чтобы подзаказ не был «в воздухе»
          parentOrd && h('div', { style: { marginBottom: 10, paddingBottom: 10, borderBottom: `0.5px solid ${AM4}` } },
            h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 } }, '📦 Входит в заказ'),
            h('button', {
              onClick: () => goToOrder(parentOrd.id),
              style: { background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: AM, textDecoration: 'underline', textDecorationStyle: 'dotted' },
              title: 'Открыть родительский заказ'
            }, `№ ${parentOrd.number} — ${parentOrd.product || ''}`)
          ),
          h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 } }, '🏷 Шильдик (номер изделия)'),
          ord.serialNumber
            ? h('div', { style: { fontSize: 16, fontWeight: 600, fontFamily: 'monospace', color: AM2 } }, ord.serialNumber)
            : h('div', { style: { fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' } }, 'Не присвоен — укажите в форме редактирования заказа')
        ),

        // Начисления по заказу + кнопка пересчёта (только canEdit)
        canEdit && h(OrderEarningsRecalc, { ord, data, onUpdate, onClose }),

        // Кнопки — только для canEdit
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          canEdit && !ord.isParentOrder && h('button', { onClick: () => { if (typeof generateFullPassport === 'function') generateFullPassport(ord, data); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '📄 Паспорт PDF'),
          (canEdit || allowRouteSheet) && !ord.isParentOrder && h('button', { onClick: () => { if (typeof generateRouteSheet === 'function') generateRouteSheet(ord, data); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '📋 Маршрутный лист'),
          canEdit && onEditMaterials && h('button', { onClick: () => { onClose(); onEditMaterials(ord.id); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '🔩 Заявка на материалы'),
          h('button', {
            onClick: () => printOrderLabel(ord, data),
            style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontWeight: 500 }
          }, '🖨 Бирка А4'),

        )
      )
    )
  );
});


// ==================== PDF Протокол гидравлического испытания ====================
const generatePressureTestPDF = async (test, data) => {
  await ensureCdn('pdfmake');
  await ensureCdn('vfsFonts');
  if (!pdfMake) { alert('pdfMake не загружен'); return; }
  const order    = data.orders.find(o => o.id === test.orderId);
  const operator = data.workers.find(w => w.id === test.operatorId);
  const drop     = ((test.pressureStart || 0) - (test.pressureEnd || 0)).toFixed(3);
  const dateStr  = new Date(test.createdAt).toLocaleDateString('ru-RU');
  const timeStr  = new Date(test.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const docDefinition = {
    pageSize: 'A4', pageMargins: [40, 50, 40, 50],
    styles: {
      header:    { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      subheader: { fontSize: 10, bold: true, margin: [0, 10, 0, 4], color: 'var(--fg-muted)' },
      label:     { fontSize: 9, color: 'var(--muted)' },
      value:     { fontSize: 11, bold: true },
      small:     { fontSize: 8, color: 'var(--muted)' },
    },
    content: [
      // Шапка
      { text: 'ООО "НТ" · ПРОИЗВОДСТВО', style: 'small', alignment: 'center' },
      { text: 'ПРОТОКОЛ ГИДРАВЛИЧЕСКОГО ИСПЫТАНИЯ', style: 'header', margin: [0, 4, 0, 2] },
      { text: `№ ГИ-${String(test.createdAt).slice(-6)}`, fontSize: 10, alignment: 'center', color: 'var(--muted)', margin: [0, 0, 0, 12] },

      // Идентификация
      { text: '1. ИДЕНТИФИКАЦИЯ ИЗДЕЛИЯ', style: 'subheader' },
      { table: { widths: ['30%', '70%'], body: [
        [{ text: 'Заказ', style: 'label' }, { text: order?.number || '—', style: 'value' }],
        [{ text: 'Изделие', style: 'label' }, { text: order?.product || '—', style: 'value' }],
        [{ text: 'Серийный номер', style: 'label' }, { text: test.serialNumber || order?.serialNumber || '—', style: 'value' }],
        [{ text: 'Заказчик', style: 'label' }, { text: order?.customer || '—', style: 'value' }],
        [{ text: 'Рабочее давление', style: 'label' }, { text: `${test.workPressure} бар`, style: 'value' }],
      ]}, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },

      // Параметры испытания
      { text: '2. ПАРАМЕТРЫ ИСПЫТАНИЯ', style: 'subheader' },
      { table: { widths: ['25%', '25%', '25%', '25%'], body: [
        ['Давление испытания', 'Выдержка', 'Температура воды', 'Среда испытания'].map(t => ({ text: t, style: 'label', alignment: 'center' })),
        [
          { text: `${test.testPressure} бар`, style: 'value', alignment: 'center' },
          { text: `${test.duration} мин`, style: 'value', alignment: 'center' },
          { text: `+${test.tempC} °С`, style: 'value', alignment: 'center' },
          { text: 'Вода', style: 'value', alignment: 'center' },
        ],
      ]}, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },

      // Результаты замеров
      { text: '3. РЕЗУЛЬТАТЫ ЗАМЕРОВ', style: 'subheader' },
      { table: { widths: ['25%', '25%', '25%', '25%'], body: [
        ['Давление в начале', 'Давление в конце', 'Падение давления', 'Потение швов'].map(t => ({ text: t, style: 'label', alignment: 'center' })),
        [
          { text: `${test.pressureStart} бар`, style: 'value', alignment: 'center' },
          { text: `${test.pressureEnd} бар`, style: 'value', alignment: 'center' },
          { text: `${drop} бар`, style: 'value', alignment: 'center', color: Math.abs(Number(drop)) > 0.1 ? 'red' : 'black' },
          { text: test.sweatingFound ? 'ДА' : 'НЕТ', style: 'value', alignment: 'center', color: test.sweatingFound ? 'red' : 'green' },
        ],
      ]}, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },

      // Дефекты
      test.defectDesc && { text: '4. ВЫЯВЛЕННЫЕ ДЕФЕКТЫ', style: 'subheader' },
      test.defectDesc && { text: test.defectDesc, fontSize: 11, margin: [0, 0, 0, 8], color: 'red' },

      // Заключение
      { text: test.defectDesc ? '5. ЗАКЛЮЧЕНИЕ' : '4. ЗАКЛЮЧЕНИЕ', style: 'subheader' },
      { table: { widths: ['100%'], body: [[{
        text: test.verdict === 'pass'
          ? `ИЗДЕЛИЕ ВЫДЕРЖАЛО гидравлическое испытание давлением ${test.testPressure} бар в течение ${test.duration} мин и ДОПУСКАЕТСЯ к дальнейшему производству.`
          : `ИЗДЕЛИЕ НЕ ВЫДЕРЖАЛО гидравлическое испытание. Требуется устранение дефектов и повторное испытание.`,
        fontSize: 11, bold: true, alignment: 'center',
        color: test.verdict === 'pass' ? 'green' : 'red',
        margin: [8, 8, 8, 8],
      }]]}, layout: { hLineColor: () => test.verdict === 'pass' ? 'green' : 'red', vLineColor: () => test.verdict === 'pass' ? 'green' : 'red' }, margin: [0, 0, 0, 20] },

      // Подписи
      { text: 'ПОДПИСИ', style: 'subheader' },
      { columns: [
        { width: '50%', stack: [
          { text: 'Оператор опрессовки:', style: 'label' },
          { text: operator?.name || '—', fontSize: 11, margin: [0, 4, 0, 0] },
          { text: `${dateStr} ${timeStr}`, style: 'small', margin: [0, 2, 0, 0] },
          { canvas: [{ type: 'line', x1: 0, y1: 15, x2: 160, y2: 15, lineWidth: 0.5, lineColor: '#888' }] },
          { text: '(подпись)', style: 'small', alignment: 'center', margin: [0, 2, 0, 0] },
        ]},
        { width: '50%', stack: [
          { text: 'Контролёр ОТК:', style: 'label' },
          { text: test.qcSignedAt ? new Date(test.qcSignedAt).toLocaleDateString('ru-RU') : '___________', fontSize: 11, margin: [0, 4, 0, 0] },
          { canvas: [{ type: 'line', x1: 0, y1: 15, x2: 160, y2: 15, lineWidth: 0.5, lineColor: '#888' }] },
          { text: '(подпись / печать)', style: 'small', alignment: 'center', margin: [0, 2, 0, 0] },
        ]},
      ], margin: [0, 8, 0, 0] },

      // Нормативная ссылка
      { text: 'Испытание проведено в соответствии с ФНП "Правила промышленной безопасности при использовании оборудования, работающего под избыточным давлением" (ПБ 10-558-03)', fontSize: 7, color: 'var(--muted)', margin: [0, 20, 0, 0], alignment: 'center' },
    ].filter(Boolean),
  };
  pdfMake.createPdf(docDefinition).download(`ГИ_${order?.number || 'протокол'}_${dateStr}.pdf`);
};

const generateFullPassport = async (order, data) => {
  await ensureCdn('pdfmake');
  await ensureCdn('vfsFonts');
  const ops = data.ops.filter(op => op.orderId === order.id && !op.archived);
  const cost = calcOrderCost(order, data);

  // ── Вспомогательные данные ──
  const workerName = (id) => data.workers.find(w => w.id === id)?.name || '—';
  const defectOps  = ops.filter(op => op.status === 'defect' || op.defectNote);
  const doneOps    = ops.filter(op => op.status === 'done');
  const totalActualHours = doneOps.reduce((s, op) => s + ((op.finishedAt && op.startedAt) ? (op.finishedAt - op.startedAt) / 3600000 : 0), 0);

  // ── QC события по этому заказу ──
  const qcEvents = (data.events || []).filter(e => ops.some(op => op.id === e.opId) && (e.type === 'qc_pass' || e.type === 'qc_reject'));

  // ── Компоненты заказа ──
  const components = order.components || [];

  const docDefinition = {
    content: [
      // ═══ ШАПКА ═══
      { text: 'ПАСПОРТ ИЗДЕЛИЯ', style: 'header', alignment: 'center' },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5 }], margin: [0, 4, 0, 12] },

      // ═══ БЛОК 1: Общие данные ═══
      { text: '1. ОБЩИЕ СВЕДЕНИЯ', style: 'subheader' },
      { table: {
        widths: ['25%','25%','25%','25%'],
        body: [
          [
            { text: 'Заказ №', bold: true }, { text: order.number },
            { text: 'Изделие', bold: true }, { text: order.product || '—' }
          ],
          [
            { text: 'Заказчик', bold: true }, { text: order.customer || '—', colSpan: 3 }, {}, {}
          ],
          [
            { text: 'Количество', bold: true }, { text: String(order.qty || 1) + ' шт' },
            { text: 'Код изделия', bold: true }, { text: order.productCode || '—' }
          ],
          ...(order.serialNumber ? [[
            { text: 'Шильдик (№ изделия)', bold: true, color: '#BA7517' }, { text: order.serialNumber, bold: true, color: '#BA7517', colSpan: 3 }, {}, {}
          ]] : []),
          [
            { text: 'Дата создания', bold: true }, { text: order.createdAt ? new Date(order.createdAt).toLocaleDateString('ru') : '—' },
            { text: 'Срок отгрузки', bold: true }, { text: order.deadline ? new Date(order.deadline).toLocaleDateString('ru') : '—' }
          ],
          [
            { text: 'Приоритет', bold: true }, { text: PRIORITY[order.priority]?.label || '—' },
            { text: 'Источник', bold: true }, { text: order.source === '1c_import' ? 'Импорт из 1С' : 'Ручной ввод' }
          ],
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 4, 0, 16] },

      // Характеристики изделия (если есть)
      order.specs && { text: '1.1 Технические характеристики', style: 'subheader2' },
      order.specs && { text: order.specs, margin: [0, 0, 0, 12], italics: true },

      // ═══ БЛОК 2: Комплектующие (если есть) ═══
      components.length > 0 && { text: '2. КОМПЛЕКТУЮЩИЕ', style: 'subheader', margin: [0, 8, 0, 4] },
      components.length > 0 && { table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto'],
        body: [
          [{ text: '№', bold: true }, { text: 'Наименование', bold: true }, { text: 'Код', bold: true }, { text: 'Кол-во', bold: true }, { text: 'Статус', bold: true }],
          ...components.map((c, i) => [
            i + 1,
            c.name,
            c.code || '—',
            `${c.qty} ${c.unit || 'шт'}`,
            c.status === 'confirmed' ? 'Получено' : 'Ожидается'
          ])
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 16] },

      // ═══ БЛОК 3: Технологические операции ═══
      { text: `${components.length > 0 ? '3' : '2'}. ТЕХНОЛОГИЧЕСКИЕ ОПЕРАЦИИ`, style: 'subheader', margin: [0, 8, 0, 4] },
      { table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          [
            { text: '№', bold: true },
            { text: 'Операция', bold: true },
            { text: 'Исполнитель', bold: true },
            { text: 'Начало', bold: true },
            { text: 'Окончание', bold: true },
            { text: 'Факт. время', bold: true },
            { text: 'Статус', bold: true }
          ],
          ...ops.map((op, i) => {
            const actualH = (op.finishedAt && op.startedAt) ? ((op.finishedAt - op.startedAt) / 3600000).toFixed(1) + ' ч' : '—';
            const st = op.status === 'done' ? 'Выполнено' : op.status === 'defect' ? 'Брак' : op.status === 'in_progress' ? 'В работе' : op.status === 'on_check' ? 'На контроле' : 'Ожидает';
            return [
              i + 1,
              op.name,
              (op.workerIds || []).map(wid => workerName(wid)).join(', ') || '—',
              op.startedAt ? new Date(op.startedAt).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
              op.finishedAt ? new Date(op.finishedAt).toLocaleString('ru', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
              actualH,
              { text: st, color: op.status === 'done' ? '#2d6a2d' : op.status === 'defect' ? '#a32d2d' : '#333' }
            ];
          })
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },

      // Итого трудозатраты
      { columns: [
        { width: '*', text: '' },
        { width: 'auto', text: [
          { text: 'Плановые трудозатраты: ', bold: true }, `${cost.laborHours} ч    `,
          { text: 'Фактические: ', bold: true }, `${totalActualHours.toFixed(1)} ч`
        ], margin: [0, 0, 0, 16] }
      ]},

      // ═══ БЛОК 4: Контроль качества ═══
      qcEvents.length > 0 && { text: `${components.length > 0 ? '4' : '3'}. РЕЗУЛЬТАТЫ КОНТРОЛЯ ОТК`, style: 'subheader', margin: [0, 8, 0, 4] },
      qcEvents.length > 0 && { table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto'],
        body: [
          [{ text: 'Операция', bold: true }, { text: 'Контролёр', bold: true }, { text: 'Дата', bold: true }, { text: 'Результат', bold: true }],
          ...qcEvents.map(e => {
            const op = ops.find(o => o.id === e.opId);
            return [
              op?.name || '—',
              workerName(e.workerId),
              e.ts ? new Date(e.ts).toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
              { text: e.type === 'qc_pass' ? '✓ Принято' : '✗ Отклонено', color: e.type === 'qc_pass' ? '#2d6a2d' : '#a32d2d' }
            ];
          })
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 16] },

      // ═══ БЛОК 5: Выявленные дефекты ═══
      defectOps.length > 0 && { text: `${components.length > 0 ? '5' : '4'}. ВЫЯВЛЕННЫЕ ДЕФЕКТЫ`, style: 'subheader', margin: [0, 8, 0, 4] },
      defectOps.length > 0 && { table: {
        headerRows: 1,
        widths: ['*', '*', 'auto'],
        body: [
          [{ text: 'Операция', bold: true }, { text: 'Описание дефекта', bold: true }, { text: 'Источник', bold: true }],
          ...defectOps.map(op => [
            op.name,
            op.defectNote || '—',
            op.defectSource === 'previous_stage' ? 'С предыдущего участка' : 'Текущий участок'
          ])
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 16] },

      // ═══ ПОДПИСИ ═══
      { text: 'ПОДПИСИ', style: 'subheader', margin: [0, 16, 0, 8] },
      { table: {
        widths: ['33%', '33%', '34%'],
        body: [[
          { text: 'Начальник производства\n\n\n_________________', alignment: 'center' },
          { text: 'Контролёр ОТК\n\n\n_________________', alignment: 'center' },
          { text: 'Ответственный за отгрузку\n\n\n_________________', alignment: 'center' }
        ]]
      }, layout: 'noBorders', margin: [0, 0, 0, 16] },

      // ═══ ФУТЕР ═══
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, color: 'var(--muted)' }] },
      { text: `Дата формирования паспорта: ${new Date().toLocaleString('ru')}   |   ООО НТ   |   Заказ №${order.number}`, fontSize: 8, color: 'var(--muted)', margin: [0, 6, 0, 0], alignment: 'center' }
    ].filter(Boolean),
    styles: {
      header:    { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subheader: { fontSize: 12, bold: true, margin: [0, 8, 0, 4], color: 'var(--fg)' },
      subheader2:{ fontSize: 10, bold: true, margin: [0, 4, 0, 4], color: 'var(--fg-muted)' }
    },
    defaultStyle: { fontSize: 9 },
    pageMargins: [36, 36, 36, 36]
  };
  pdfMake.createPdf(docDefinition).download(`passport_${order.number}_${new Date().toISOString().slice(0, 10)}.pdf`);
};


// ==================== Прогноз загрузки на неделю ====================
const LoadForecastWidget = memo(({ data }) => {
  const forecast = useMemo(() => {
    const days = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const day = new Date(today); day.setDate(day.getDate() + i);
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const dayStart = day.getTime(); const dayEndMs = dayEnd.getTime();
      // Операции запланированные на этот день
      const planned = data.ops.filter(op => op.plannedStartDate && op.plannedStartDate >= dayStart && op.plannedStartDate <= dayEndMs && !op.archived && op.status === 'pending');
      // Часы по типам операций
      const hoursByType = {};
      planned.forEach(op => {
        const type = op.name || 'Прочее';
        hoursByType[type] = (hoursByType[type] || 0) + (op.plannedHours || 2);
      });
      // Доступные рабочие
      const available = data.workers.filter(w => isWorkerOnShift(w, data.timesheet));
      // Потенциальные проблемы
      const warnings = [];
      Object.entries(hoursByType).forEach(([type, hours]) => {
        const competent = available.filter(w => !w.competences?.length || w.competences.includes(type));
        const capacity = competent.length * 8; // 8 часов на рабочего
        if (hours > capacity) warnings.push({ type, hours, capacity, deficit: Math.round(hours - capacity) });
      });
      days.push({
        date: day, label: i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : day.toLocaleDateString('ru', { weekday: 'short', day: 'numeric' }),
        plannedCount: planned.length, totalHours: Math.round(planned.reduce((s, op) => s + (op.plannedHours || 2), 0)),
        warnings, isWeekend: day.getDay() === 0 || day.getDay() === 6
      });
    }
    return days;
  }, [data.ops, data.workers]);

  const hasWarnings = forecast.some(d => d.warnings.length > 0);
  return h('div', { style: { ...S.card, marginBottom: 12 } },
    h('div', { style: S.sec }, 'Прогноз загрузки на неделю'),
    h('div', { className: 'forecast-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 } },
      forecast.map((d, i) => h('div', { key: i, style: { textAlign: 'center', padding: 8, borderRadius: 8, background: d.warnings.length > 0 ? RD3 : d.isWeekend ? 'var(--st-pending-bg)' : 'var(--card-2)', border: d.warnings.length > 0 ? `0.5px solid ${RD}` : '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { fontSize: 11, fontWeight: 500, color: d.warnings.length > 0 ? RD : '#666', marginBottom: 4 } }, d.label),
        h('div', { style: { fontSize: 18, fontWeight: 500, color: d.plannedCount > 0 ? AM2 : '#ccc' } }, d.plannedCount),
        h('div', { style: { fontSize: 9, color: 'var(--muted)' } }, `${d.totalHours}ч`),
        d.warnings.length > 0 && h('div', { style: { fontSize: 9, color: RD, marginTop: 4 } }, `⚠ -${d.warnings.reduce((s, w) => s + w.deficit, 0)}ч`)
      ))
    ),
    hasWarnings && h('div', { style: { marginTop: 10, padding: '8px 10px', background: RD3, borderRadius: 8, fontSize: 11 } },
      h('div', { style: { fontWeight: 500, color: RD, marginBottom: 4 } }, '⚠ Обнаружен дефицит ресурсов:'),
      forecast.filter(d => d.warnings.length > 0).map((d, i) => h('div', { key: i, style: { color: RD2 } },
        `${d.label}: `, d.warnings.map(w => `${w.type} (нужно ${w.hours}ч, доступно ${w.capacity}ч)`).join(', ')
      ))
    )
  );
});

// ==================== QRModal ====================
const QRModal = memo(({ ops, order, worker, onClose }) => {
  const [index, setIndex] = useState(0);
  const [qrError, setQrError] = useState(false);
  const [labelMode, setLabelMode] = useState('label'); // 'label' | 'qronly' | 'full'
  const op = ops[index];
  const ref = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!op) return;
    setQrError(false);
    const render = () => {
      if (!ref.current || !window.QRCode) return;
      while (ref.current.firstChild) ref.current.removeChild(ref.current.firstChild);
      const url = new URL(window.location.href);
      url.searchParams.set('opId', op.id);
      new window.QRCode(ref.current, { text: url.toString(), width: 140, height: 140, colorDark: '#BA7517', colorLight: '#ffffff' });
    };
    if (window.QRCode) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = render;
    s.onerror = () => setQrError(true);
    document.head.appendChild(s);
  }, [op, index]);

  // Генерация HTML этикетки
  const buildLabelHtml = useCallback((targetOp, mode) => {
    const qrEl = ref.current;
    const qrHtml = qrEl ? qrEl.innerHTML : '';
    if (mode === 'qronly') {
      return '<div style="width:50mm;height:35mm;display:flex;align-items:center;justify-content:center;padding:1mm">' +
        '<div style="width:32mm;height:32mm">' + qrHtml.replace(/140/g, '100%') + '</div></div>';
    }
    if (mode === 'full') {
      return '<div style="padding:16px;text-align:center;font-family:system-ui,sans-serif">' +
        '<div style="width:180px;height:180px;margin:0 auto 10px">' + qrHtml.replace(/140/g, '100%') + '</div>' +
        '<div style="font-family:monospace;font-size:18px;font-weight:600;color:#BA7517;margin-bottom:4px">' + targetOp.id + '</div>' +
        '<div style="font-size:14px;color:#333;margin-bottom:3px">' + targetOp.name + '</div>' +
        '<div style="font-size:12px;color:#888">Заказ: ' + (order?.number || '—') + ' · ' + (order?.product || '') + '</div>' +
        (worker ? '<div style="font-size:13px;color:#BA7517;margin-top:6px">' + worker.name + '</div>' : '') +
        '</div>';
    }
    // label (50x35 с текстом)
    return '<div style="width:50mm;height:35mm;display:flex;align-items:center;gap:2mm;padding:1mm;font-family:system-ui,sans-serif">' +
      '<div style="width:28mm;height:28mm;flex-shrink:0">' + qrHtml.replace(/140/g, '100%') + '</div>' +
      '<div style="font-size:7pt;line-height:1.3;overflow:hidden;text-align:left">' +
      '<div style="font-family:monospace;font-weight:700;font-size:8pt;color:#333">' + targetOp.id + '</div>' +
      '<div style="font-size:6.5pt;color:#555;margin-top:0.5mm">' + (targetOp.name || '').slice(0, 30) + '</div>' +
      '<div style="font-size:6pt;color:#888;margin-top:0.5mm">' + (order?.number || '') + '</div>' +
      '</div></div>';
  }, [order, worker]);

  // Печать (одна или пакетная)
  const doPrint = useCallback((batch) => {
    const isLabel = labelMode !== 'full';
    const pageSize = isLabel ? '@page{size:50mm 35mm;margin:1mm}' : '@page{margin:10mm}';
    const items = batch ? ops : [op];
    // Для пакетной печати этикеток — генерируем QR для каждой операции отдельно
    let bodyHtml = '';
    if (batch && items.length > 1) {
      // Для пакетной: берём текущий QR как шаблон, меняем только текстовые данные
      items.forEach((item, i) => {
        const singleHtml = buildLabelHtml(item, labelMode);
        bodyHtml += (i > 0 ? '<div style="page-break-before:always"></div>' : '') + singleHtml;
      });
    } else {
      bodyHtml = buildLabelHtml(op, labelMode);
    }
    const w = window.open('', '_blank', isLabel ? 'width=300,height=250' : 'width=400,height=500');
    if (!w) return;
    w.document.write('<!DOCTYPE html><html><head><style>' +
      pageSize +
      'body{margin:0;font-family:system-ui,sans-serif}' +
      'svg,canvas,img{max-width:100%;height:auto}' +
      '@media print{.no-print{display:none!important}}' +
      '</style></head><body>' + bodyHtml +
      '<div class="no-print" style="text-align:center;padding:12px">' +
      '<button onclick="window.print();setTimeout(()=>window.close(),500)" style="padding:8px 24px;font-size:13px;border-radius:6px;border:none;background:#EF9F27;color:#412402;cursor:pointer;font-weight:500">Печать</button></div>' +
      '</body></html>');
    w.document.close();
  }, [ops, op, labelMode, buildLabelHtml]);

  if (!op) return null;
  return h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': 'QR-код операции',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
    onKeyDown: (e) => e.key === 'Escape' && onClose()
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card-solid,#fff)', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 12, padding: 24, width: 'min(360px, calc(100vw - 32px))', textAlign: 'center', position: 'relative', maxHeight: '90vh', overflowY: 'auto' } },
      h('button', { type: 'button', onClick: onClose, 'aria-label': 'Закрыть', style: { position: 'absolute', top: 10, right: 12, background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 } }, '×'),
      h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 } }, 'QR-код операции'),
      // QR
      h('div', { style: { background: 'var(--card-solid,#fff)', borderRadius: 8, padding: 12, display: 'inline-block', marginBottom: 10, border: '0.5px solid rgba(0,0,0,0.08)' } },
        h('div', { ref }),
        qrError && h('div', { style: { color: RD, fontSize: 11, padding: 8 } }, 'Не удалось загрузить библиотеку QR-кода')
      ),
      worker && h('div', { style: { fontSize: 11, color: AM, marginTop: 8, fontWeight: 500 } }, `Исполнитель: ${worker.name}`),
      h('div', { style: { fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: AM, marginBottom: 4 } }, op.id),
      h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 4 } }, op.name),
      h('div', { style: { fontSize: 10, color: 'var(--muted)', marginBottom: 10 } }, `Заказ: ${order?.number || '—'} · ${order?.product || ''}`),
      // Навигация
      ops.length > 1 && h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 } },
        h('button', { type: 'button', style: gbtn({ padding: '4px 10px' }), onClick: () => setIndex(i => (i - 1 + ops.length) % ops.length) }, '←'),
        h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, `${index + 1} / ${ops.length}`),
        h('button', { type: 'button', style: gbtn({ padding: '4px 10px' }), onClick: () => setIndex(i => (i + 1) % ops.length) }, '→')
      ),
      // Режим печати
      h('div', { style: { display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 } },
        [['label', '🏷 Этикетка'], ['qronly', '⬜ Только QR'], ['full', '🖨 A4']].map(([m, l]) =>
          h('button', { key: m, style: labelMode === m ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setLabelMode(m) }, l)
        )
      ),
      // Предпросмотр этикетки
      h('div', { style: { background: 'var(--card-2)', borderRadius: 8, padding: 10, marginBottom: 12, border: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { fontSize: 9, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' } },
          labelMode === 'qronly' ? 'Предпросмотр · 50×35мм · только QR' :
          labelMode === 'full' ? 'Предпросмотр · полный формат' :
          'Предпросмотр · 50×35мм'),
        h('div', { style: { display: 'inline-flex', border: '1px dashed #ccc', borderRadius: 4, background: 'var(--card-solid,#fff)', padding: 2 } },
          labelMode === 'qronly'
            ? h('div', { style: { width: 100, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                h('div', { style: { width: 60, height: 60, border: '2px solid ' + AM4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: AM4 } }, 'QR')
              )
            : labelMode === 'full'
              ? h('div', { style: { width: 130, padding: 8, textAlign: 'center' } },
                  h('div', { style: { width: 60, height: 60, border: '2px solid ' + AM4, borderRadius: 4, margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: AM4 } }, 'QR'),
                  h('div', { style: { fontSize: 8, fontFamily: 'monospace', color: AM4, fontWeight: 600 } }, op.id),
                  h('div', { style: { fontSize: 7, color: 'var(--fg-muted)' } }, (op.name || '').slice(0, 20)),
                  h('div', { style: { fontSize: 6, color: 'var(--muted)' } }, order?.number || '')
                )
              : h('div', { style: { width: 100, height: 70, display: 'flex', alignItems: 'center', gap: 4, padding: 3 } },
                  h('div', { style: { width: 50, height: 50, border: '2px solid ' + AM4, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: AM4 } }, 'QR'),
                  h('div', { style: { fontSize: 7, lineHeight: 1.3, overflow: 'hidden' } },
                    h('div', { style: { fontFamily: 'monospace', fontWeight: 600, fontSize: 8, color: 'var(--fg)' } }, op.id),
                    h('div', { style: { color: 'var(--fg-muted)', marginTop: 1 } }, (op.name || '').slice(0, 15)),
                    h('div', { style: { color: 'var(--muted)', marginTop: 1 } }, (order?.number || '').slice(0, 12))
                  )
                )
        )
      ),
      // Кнопки
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', style: abtn({ flex: 1 }), onClick: () => doPrint(false) },
          labelMode === 'qronly' ? '⬜ Печать QR' : labelMode === 'full' ? '🖨 Печать A4' : '🏷 Печать этикетки'),
        ops.length > 1 && h('button', { type: 'button', style: gbtn({ flex: 1 }), onClick: () => doPrint(true) }, `🏷 Все ${ops.length} шт`),
        navigator.share && h('button', { type: 'button', style: gbtn({ flex: 1 }), onClick: async () => {
          const url = new URL(window.location.href);
          url.searchParams.set('opId', op.id);
          try {
            await navigator.share({ title: `QR · ${op.name}`, text: `Операция: ${op.name}\nЗаказ: ${order?.number || '—'}\nСсылка: ${url.toString()}`, url: url.toString() });
          } catch(e) {}
        }}, '📤'),
        h('button', { type: 'button', style: gbtn({ flex: 1 }), onClick: () => { window.open('?opId=' + op.id, '_blank'); } }, '▶ Рабочий')
      )
    )
  );
});


// ==================== MasterOnboarding ====================
const MasterOnboarding = memo(({ data, onDone }) => {
  const steps = useMemo(() => [
    { id: 'workers',   label: 'Добавить сотрудников',          done: data.workers.filter(w => !w.archived).length > 0,       action: null },
    { id: 'stages',    label: 'Создать этапы производства',     done: (data.productionStages || []).length > 0,                action: null },
    { id: 'order',     label: 'Создать первый заказ',           done: data.orders.filter(o => !o.archived && !o.isParentOrder).length > 0,         action: null },
    { id: 'competences', label: 'Заполнить матрицу компетенций', done: data.workers.some(w => w.competences?.length > 0),       action: null },
    { id: 'assign',    label: 'Назначить операции',             done: data.ops.some(o => o.workerIds?.length > 0),             action: null },
  ], [data]);

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find(s => !s.done);
  const pct = Math.round(doneCount / steps.length * 100);

  if (allDone) return null; // Скрываем когда всё настроено

  return h('div', { style: { ...{ background: 'var(--card-solid,#fff)', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, marginBottom: 16 } } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
      h('div', { style: { fontSize: 13, fontWeight: 500 } }, `Настройка системы · ${doneCount} из ${steps.length}`),
      h('button', { style: { background: 'none', border: 'none', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }, onClick: onDone }, 'Скрыть')
    ),
    // Прогресс-бар
    h('div', { style: { height: 6, background: 'var(--st-pending-bg)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 } },
      h('div', { style: { height: 6, background: AM, borderRadius: 3, width: `${pct}%`, transition: 'width .3s' } })
    ),
    // Шаги
    steps.map(s => h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
      h('div', { style: { width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, background: s.done ? GN3 : 'rgba(0,0,0,0.06)', color: s.done ? GN2 : '#888', border: s.done ? `0.5px solid ${GN}` : 'none' } }, s.done ? '✓' : ''),
      h('div', { style: { fontSize: 12, color: s.done ? '#888' : '#333', textDecoration: s.done ? 'line-through' : 'none', flex: 1 } }, s.label)
    )),
    // Следующий шаг
    nextStep && h('div', { style: { marginTop: 10, background: AM3, border: `0.5px solid ${AM4}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: AM2 } },
      h('span', { style: { fontWeight: 500 } }, 'Следующий шаг: '), nextStep.label
    )
  );
});

// ==================== WN: Кликабельное имя сотрудника ====================
// Использование: h(WN, { worker: data.workers.find(w => w.id === wid), onWorkerClick })
// или: h(WN, { workerId: wid, data, onWorkerClick })
const WN = memo(({ worker, workerId, data, onWorkerClick, style = {} }) => {
  const w = worker || (data && data.workers.find(x => x.id === workerId));
  if (!w) return h('span', { style: { color: 'var(--muted)', ...style } }, '—');
  if (!onWorkerClick) return h('span', { style }, w.name);
  return h('span', {
    style: { color: AM2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', fontWeight: 500, ...style },
    onClick: (e) => { e.stopPropagation(); onWorkerClick(w.id); },
    title: `Открыть карточку: ${w.name}`
  }, w.name);
});

// ==================== WorkerCardModal ====================
// Типы инструктажей (дублируем здесь т.к. shared.js грузится раньше hr.js)
const WC_INSTR_TYPES = [
  { id: 'initial',   label: 'Вводный',             months: null },
  { id: 'workplace', label: 'На рабочем месте',     months: 12 },
  { id: 'fire',      label: 'Противопожарный',      months: 12 },
  { id: 'electrical',label: 'Электробезопасность',  months: 12 },
  { id: 'unplanned', label: 'Внеплановый',          months: null },
  { id: 'targeted',  label: 'Целевой',              months: null },
];

// Хелпер: цвет бейджа по дням до дедлайна
const wcBadge = (daysLeft, label) => {
  const expired  = daysLeft !== null && daysLeft < 0;
  const expiring = daysLeft !== null && !expired && daysLeft <= 30;
  const ok       = daysLeft === null || (!expired && !expiring);
  const bg = expired ? RD3 : expiring ? AM3 : ok ? GN3 : GN3;
  const cl = expired ? RD2 : expiring ? AM2 : GN2;
  return h('span', { style: { display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:bg, color:cl, whiteSpace:'nowrap' } }, label);
};

// Хелпер: строка в таблице компетенций
const wcCompRow = (opName, level, certifiedAt, expiresAt, canTeach) => {
  const levelMap = {
    0: { label:'Нет допуска', bg:'var(--card-2)', cl:'var(--muted)'   },
    1: { label:'Новичок',     bg:'var(--st-warn-bg)', cl:'var(--st-warn-cl)' },
    2: { label:'Компетентен', bg:AM3,        cl:AM2       },
    3: { label:'Эксперт',     bg:GN3,        cl:GN2       },
  };
  const lc = levelMap[level] || levelMap[0];
  const daysLeft = expiresAt ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
  const expiredCert  = daysLeft !== null && daysLeft < 0;
  const expiringSoon = daysLeft !== null && !expiredCert && daysLeft <= 30;
  const certLabel = expiresAt
    ? (expiredCert  ? `Просрочен (${new Date(expiresAt).toLocaleDateString('ru')})` :
       expiringSoon ? `Через ${daysLeft} дн.` :
                     `до ${new Date(expiresAt).toLocaleDateString('ru')}`)
    : '—';
  const certColor = expiredCert ? RD2 : expiringSoon ? AM2 : '#888';

  return h('div', { style: { display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`0.5px solid ${S.card.border || '#e8e6df'}`, flexWrap:'wrap' } },
    h('span', { style: { flex:1, fontSize:13, color: level === 0 ? 'var(--muted)' : 'var(--fg)' } }, opName),
    h('span', { style: { display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:lc.bg, color:lc.cl, flexShrink:0 } }, lc.label),
    h('span', { style: { fontSize:11, color:certColor, minWidth:90, textAlign:'right' } }, certLabel),
    canTeach && h('span', { style: { display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:'var(--card-2)', color:'var(--fg-muted)', flexShrink:0 } }, 'Может обучать')
  );
};

const WorkerCardModal = memo(({ worker, data, onClose }) => {
  const [tab, setTab]       = useState('comp');
  const [opsLimit, setOpsLimit] = useState(10);

  // ── Статус из табеля ──
  const today     = new Date();
  const todayCell = data.timesheet?.[worker.id]?.[today.getDate()];
  const tsStatus  = (() => {
    if (!todayCell) return null;
    if (todayCell.code === 'ОТ') return { label:'В отпуске',          bg:'#E6F1FB', cl:'#0C447C', br:'#90CAF9' };
    if (todayCell.code === 'Б')  return { label:'Больничный',          bg:RD3, cl:'#791F1F', br:'#F48FB1' };
    if (todayCell.code === 'ОЗ') return { label:'Отпуск за свой счёт', bg:'var(--st-warn-bg)', cl:'#E65100', br:'#FFB74D' };
    if (todayCell.code === 'К')  return { label:'Командировка',        bg:'#F3E5F5', cl:'#6A1B9A', br:'#CE93D8' };
    if (todayCell.code === 'НН') return { label:'Неявка',             bg:'#F1EFE8', cl:'var(--muted)',    br:'#ccc'    };
    if (todayCell.code === 'У')  return { label:'Уволен',             bg:'#E0E0E0', cl:'var(--muted)',    br:'#bbb'    };
    if (todayCell.code === 'СД') return { label:'Сдельная',           bg:'#EDE7F6', cl:'#4527A0', br:'#B39DDB' };
    if (todayCell.h > 0)         return { label:`На смене · ${todayCell.h}ч`, bg:GN3, cl:GN2, br:GN };
    return null;
  })();
  const displayStatus = tsStatus || WORKER_STATUS[worker.status] || WORKER_STATUS.working;

  // ── Часы из табеля за месяц ──
  const { totalHours, monthName } = useMemo(() => {
    const n = new Date(), yr = n.getFullYear(), mo = n.getMonth();
    const tsData = data.timesheet?.[worker.id] || {};
    const dim = new Date(yr, mo + 1, 0).getDate();
    let h = 0;
    for (let d = 1; d <= dim; d++) { const cell = tsData[d]; if (cell?.h) h += cell.h; }
    return { totalHours: Math.round(h * 10) / 10, monthName: n.toLocaleString('ru', { month: 'long', year: 'numeric' }) };
  }, [worker.id, data.timesheet]);

  // ── KPI операций (за 30 дн) ──
  const period30 = useMemo(() => now() - 30 * 86400000, []);
  const allOpsWorker   = useMemo(() => data.ops.filter(op => op.workerIds?.includes(worker.id)), [data.ops, worker.id]);
  const opsDone30      = useMemo(() => allOpsWorker.filter(op => op.status === 'done'   && (op.finishedAt || 0) >= period30), [allOpsWorker, period30]);
  const opsDefect30    = useMemo(() => allOpsWorker.filter(op => op.status === 'defect' && (op.finishedAt || 0) >= period30), [allOpsWorker, period30]);
  const opsInProgress  = useMemo(() => allOpsWorker.filter(op => op.status === 'in_progress'), [allOpsWorker]);
  const opsPending     = useMemo(() => allOpsWorker.filter(op => op.status === 'pending'),      [allOpsWorker]);
  const allDone        = useMemo(() => allOpsWorker.filter(op => op.status === 'done').length,  [allOpsWorker]);
  const avgTime30      = opsDone30.length > 0 ? opsDone30.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0) / opsDone30.length : 0;
  const defectRate     = (opsDone30.length + opsDefect30.length) > 0
    ? (opsDefect30.length / (opsDone30.length + opsDefect30.length) * 100).toFixed(1) : '0.0';
  const level    = getWorkerLevel(allDone);
  const progress = getLevelProgress(allDone);

  // ── История операций ──
  const allFinishedOps = useMemo(() =>
    allOpsWorker
      .filter(op => op.status === 'done' || op.status === 'defect')
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)),
    [allOpsWorker]
  );

  // ── Компетенции — совместимость со старой и новой структурой ──
  const competencies = useMemo(() => {
    // Новая структура: worker.competencies = [{operationType, level, certifiedAt, expiresAt, canTeach}]
    if (worker.competencies && worker.competencies.length > 0) return worker.competencies;
    // Старая структура: competences[] + competenceLevels{} + competenceMeta{}
    const names  = worker.competences || [];
    const levels = worker.competenceLevels || {};
    const meta   = worker.competenceMeta  || {};
    return names.map(opName => ({
      operationType: opName,
      level: levels[opName] || 1,
      certifiedAt: meta[opName]?.certifiedAt || null,
      expiresAt:   meta[opName]?.expiresAt   || null,
      canTeach:    meta[opName]?.canTeach    || false
    }));
  }, [worker.competencies, worker.competences, worker.competenceLevels]);

  // Операции из productionStages которых нет в компетенциях — показываем как "нет допуска"
  const allStageNames = useMemo(() => (data.productionStages || []).map(s => s.name), [data.productionStages]);
  const compMap       = useMemo(() => Object.fromEntries(competencies.map(c => [c.operationType, c])), [competencies]);

  // ── Инструктажи ──
  const workerInstructions = useMemo(() => {
    const instrs = data.instructions || [];
    const byType = {};
    WC_INSTR_TYPES.forEach(t => {
      const last = instrs.filter(i => i.workerId === worker.id && i.type === t.id)
        .sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0))[0];
      byType[t.id] = last || null;
    });
    return byType;
  }, [data.instructions, worker.id]);

  // ── Простои ──
  const downtimeEvents = useMemo(() =>
    data.events.filter(e => e.workerId === worker.id && e.type === 'downtime'),
    [data.events, worker.id]
  );
  const downtimeByReason = useMemo(() => {
    const map = {};
    downtimeEvents.forEach(e => {
      const reason = (data.downtimeTypes || []).find(dt => dt.id === e.downtimeTypeId)?.name || 'Неизвестно';
      if (!map[reason]) map[reason] = { count: 0, total: 0 };
      map[reason].count++;
      map[reason].total += (e.duration || 0);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [downtimeEvents, data.downtimeTypes]);

  // ── Благодарности ──
  const thanks = useMemo(() =>
    data.events.filter(e => e.type === 'thanks' && e.toWorkerId === worker.id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [data.events, worker.id]
  );

  // ── Участок ──
  const section = data.sections.find(s => s.id === worker.sectionId);

  // ── Закрытие по Escape ──
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  // ─────── Стили ───────
  const cardSt  = { background:'var(--card-solid,#fff)', border:'0.5px solid #dedad3', borderRadius:12, padding:'14px 18px', marginBottom:12 };
  const secSt   = { fontSize:11, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, paddingBottom:6, borderBottom:'0.5px solid #ede9e2' };
  const rowSt   = { display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'0.5px solid #ede9e2', flexWrap:'wrap' };
  const lastRow = { display:'flex', alignItems:'center', gap:8, padding:'7px 0', flexWrap:'wrap' };
  const tabsSt  = { display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 };
  const tabSt   = (on) => ({ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', border:`0.5px solid ${on ? 'transparent' : '#ccc'}`, color: on ? AM2 : '#666', background: on ? AM3 : 'transparent' });
  const emptyTx = { padding:'16px 0', fontSize:13, color:'var(--muted)', textAlign:'center' };

  const TABS = [
    { id:'comp',   label:'Компетенции' },
    { id:'ops',    label:`История операций` },
    { id:'instr',  label:'Инструктажи ОТ' },
    { id:'docs',   label:'Допуски' },
    { id:'down',   label:`Простои (${downtimeEvents.length})` },
    { id:'thanks', label:`Благодарности (${thanks.length})` },
    { id:'ach',    label:'Достижения' },
  ];

  return h('div', {
    role:'dialog', 'aria-modal':'true',
    style:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }
  },
    h('div', { className:'modal-content modal-animated', style:{ background:'var(--card-solid)', borderRadius:14, padding:20, width:'min(700px, calc(100vw - 24px))', maxHeight:'90vh', overflowY:'auto', position:'relative' } },

      // ── Кнопка закрытия (вне шапки, всегда поверх) ──
      h('button', { onClick:onClose, 'aria-label':'Закрыть', style:{ position:'sticky', top:0, float:'right', zIndex:10, background:'var(--card-solid,#fff)', border:'1px solid #ccc', borderRadius:'50%', width:32, height:32, fontSize:18, lineHeight:'30px', textAlign:'center', cursor:'pointer', color:'var(--muted)', marginBottom:-32, marginRight:0 } }, '×'),

      // ── ШАПКА ──
      h('div', { style:{ ...cardSt } },
        h('div', { style:{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:14 } },
          h('div', { style:{ width:52, height:52, borderRadius:'50%', background:displayStatus.bg, border:`1px solid ${displayStatus.br}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:500, color:displayStatus.cl, flexShrink:0 } },
            (worker.name || '?').charAt(0)
          ),
          h('div', { style:{ flex:1, minWidth:0 } },
            h('div', { style:{ fontSize:17, fontWeight:500, color:'var(--fg)', marginBottom:3 } }, worker.name),
            h('div', { style:{ fontSize:12, color:'var(--muted)', marginBottom:8 } },
              [worker.position, worker.grade ? `${worker.grade} разряд` : null, worker.tabNumber ? `Таб. №${worker.tabNumber}` : null, section?.name].filter(Boolean).join(' · ') || '—'
            ),
            h('div', { style:{ display:'flex', gap:5, flexWrap:'wrap' } },
              h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:displayStatus.bg, color:displayStatus.cl } }, displayStatus.label),
              worker.hireDate && h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:'var(--st-pending-bg)', color:'var(--fg-muted)' } }, `Принят ${new Date(worker.hireDate).toLocaleDateString('ru')}`),
              h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:AM3, color:AM2 } }, `Ур. ${level} — ${getLevelTitle(level)}`)
            )
          ),
          h('div', { style:{ textAlign:'right', flexShrink:0 } },
            h('div', { style:{ fontSize:10, color:'var(--muted)' } }, 'Брак'),
            h('div', { style:{ fontSize:22, fontWeight:500, color: Number(defectRate) > 5 ? RD : GN } }, `${defectRate}%`)
          )
        ),

        // KPI
        h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 } },
          h(MC, { v:opsDone30.length, l:'Выполнено (30 дн)', c:GN }),
          h(MC, { v:fmtDur(avgTime30), l:'Ср. время операции', c:AM }),
          h(MC, { v:`${opsInProgress.length} / ${opsPending.length}`, l:'В работе / Ожидает', c:BL }),
          h(MC, { v:`${totalHours}ч`, l:`Табель, ${monthName}` })
        ),

        // Прогресс уровня
        h('div', { style:{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--card-2)', borderRadius:8, marginBottom:12 } },
          h('div', { style:{ fontSize:26, fontWeight:500, color:AM } }, `${level}`),
          h('div', { style:{ flex:1 } },
            h('div', { style:{ fontSize:13, fontWeight:500, color:'var(--fg)', marginBottom:4 } }, `${getLevelTitle(level)} · ${allDone} операций всего`),
            h('div', { style:{ height:6, background:'var(--card-stroke)', borderRadius:3, overflow:'hidden' } },
              h('div', { style:{ width:`${progress * 100}%`, height:6, background:AM, borderRadius:3 } })
            )
          ),
          h('div', { style:{ fontSize:11, color:'var(--muted)' } }, `${Math.round(progress * 100)}% → Ур. ${level + 1}`)
        ),

        // Контакты
        (worker.phone || worker.email || worker.emergencyContact) && h('div', { style:{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'var(--fg-muted)' } },
          worker.phone && h('a', { href:`tel:${worker.phone}`, style:{ color:AM2, textDecoration:'none' } }, `📞 ${worker.phone}`),
          worker.email && h('a', { href:`mailto:${worker.email}`, style:{ color:AM2, textDecoration:'none' } }, `✉ ${worker.email}`),
          worker.emergencyContact && h('span', { style:{ color:RD2 } }, `🆘 ${worker.emergencyContact}`)
        )
      ),

      // ── ВКЛАДКИ ──
      h('div', { style:tabsSt }, TABS.map(t =>
        h('div', { key:t.id, style:tabSt(tab === t.id), onClick:() => { setTab(t.id); setOpsLimit(10); } }, t.label)
      )),

      // ── КОМПЕТЕНЦИИ ──
      tab === 'comp' && h('div', { style:cardSt },
        h('div', { style:secSt }, 'Матрица компетенций'),
        allStageNames.length === 0 && competencies.length === 0
          ? h('div', { style:emptyTx }, 'Нет данных о компетенциях')
          : h('div', null,
              // Сначала те у кого есть допуск
              competencies.map((c, i) =>
                h('div', { key:c.operationType + i, style: i < competencies.length - 1 ? rowSt : lastRow },
                  wcCompRow(c.operationType, c.level, c.certifiedAt, c.expiresAt, c.canTeach)
                )
              ),
              // Потом операции без допуска (из productionStages которых нет в competencies)
              allStageNames.filter(n => !compMap[n]).map((n, i, arr) =>
                h('div', { key:n, style: i < arr.length - 1 ? rowSt : lastRow },
                  wcCompRow(n, 0, null, null, false)
                )
              )
            )
      ),

      // ── ИСТОРИЯ ОПЕРАЦИЙ ──
      tab === 'ops' && h('div', { style:cardSt },
        h('div', { style:secSt }, `История операций · всего ${allFinishedOps.length}`),
        allFinishedOps.length === 0
          ? h('div', { style:emptyTx }, 'Операций пока нет')
          : h('div', null,
              // Шапка таблицы
              h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1.1fr 0.9fr 0.8fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'var(--muted)' } },
                h('span', null, 'Операция'), h('span', null, 'Заказ'), h('span', null, 'Статус'), h('span', null, 'Длительность')
              ),
              allFinishedOps.slice(0, opsLimit).map((op, i, arr) => {
                const order = data.orders.find(o => o.id === op.orderId);
                const isLast = i === arr.slice(0, opsLimit).length - 1;
                return h('div', { key:op.id, style:{ display:'grid', gridTemplateColumns:'2fr 1.1fr 0.9fr 0.8fr', gap:8, padding:'6px 0', borderBottom: isLast ? 'none' : '0.5px solid #ede9e2', fontSize:12, alignItems:'center' } },
                  h('span', { style:{ color:'var(--fg)' } }, op.name),
                  h('span', { style:{ color:AM2 } }, order?.number || '—'),
                  h(Badge, { st:op.status }),
                  h('span', { style:{ color:'var(--muted)', fontFamily:'monospace' } }, op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : '—')
                );
              }),
              opsLimit < allFinishedOps.length && h('button', {
                style:{ ...gbtn({ fontSize:12, width:'100%', marginTop:10 }) },
                onClick:() => setOpsLimit(l => l + 10)
              }, `Показать ещё (ещё ${allFinishedOps.length - opsLimit})`)
            )
      ),

      // ── ИНСТРУКТАЖИ ОТ ──
      tab === 'instr' && h('div', { style:cardSt },
        h('div', { style:secSt }, 'Инструктажи ОТ'),
        h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 0.9fr 1.1fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'var(--muted)' } },
          h('span', null, 'Вид инструктажа'), h('span', null, 'Последний'), h('span', null, 'Следующий')
        ),
        WC_INSTR_TYPES.map((t, i) => {
          const instr = workerInstructions[t.id];
          const isLast = i === WC_INSTR_TYPES.length - 1;
          let nextLabel = '—';
          let daysLeft  = null;
          if (instr && t.months && instr.nextDate) {
            daysLeft  = Math.ceil((instr.nextDate - Date.now()) / 86400000);
            nextLabel = daysLeft < 0
              ? `Просрочен ${Math.abs(daysLeft)} дн.`
              : daysLeft <= 30
                ? `Через ${daysLeft} дн.`
                : new Date(instr.nextDate).toLocaleDateString('ru');
          } else if (instr && !t.months) {
            nextLabel = 'Бессрочно';
          } else if (!instr) {
            nextLabel = 'Не проводился';
          }
          return h('div', { key:t.id, style:{ display:'grid', gridTemplateColumns:'2fr 0.9fr 1.1fr', gap:8, padding:'6px 0', borderBottom: isLast ? 'none' : '0.5px solid #ede9e2', fontSize:12, alignItems:'center' } },
            h('span', { style:{ color: instr ? '#222' : '#aaa' } }, t.label),
            h('span', { style:{ color:'var(--muted)' } }, instr ? new Date(instr.dateMs).toLocaleDateString('ru') : '—'),
            instr
              ? wcBadge(daysLeft, nextLabel)
              : h('span', { style:{ fontSize:11, color:'var(--muted)' } }, nextLabel)
          );
        })
      ),

      // ── ДОПУСКИ И УДОСТОВЕРЕНИЯ ──
      tab === 'docs' && h('div', { style:cardSt },
        h('div', { style:secSt }, 'Допуски и удостоверения'),
        worker.medicalExamNextDate && (() => {
          const d = Math.ceil((new Date(worker.medicalExamNextDate).getTime() - Date.now()) / 86400000);
          const label = d < 0 ? `Просрочен ${Math.abs(d)} дн.` : d <= 30 ? `Через ${d} дн.` : new Date(worker.medicalExamNextDate).toLocaleDateString('ru');
          return h('div', { style:rowSt },
            h('span', { style:{ flex:1, fontSize:13, color:'var(--fg)' } }, '🏥 Медицинский осмотр'),
            wcBadge(d, label)
          );
        })(),
        (worker.licences || []).length === 0 && !worker.medicalExamNextDate
          ? h('div', { style:emptyTx }, 'Нет удостоверений')
          : (worker.licences || []).map((lic, i, arr) => {
              const d = lic.expiryDate ? Math.ceil((new Date(lic.expiryDate).getTime() - Date.now()) / 86400000) : null;
              const label = d === null ? 'Бессрочно' : d < 0 ? `Просрочен ${Math.abs(d)} дн.` : d <= 30 ? `Через ${d} дн.` : `до ${new Date(lic.expiryDate).toLocaleDateString('ru')}`;
              return h('div', { key:lic.name, style: i < arr.length - 1 ? rowSt : lastRow },
                h('span', { style:{ flex:1, fontSize:13, color:'var(--fg)' } }, `🎖 ${lic.name}`),
                wcBadge(d, label)
              );
            })
      ),

      // ── ПРОСТОИ ──
      tab === 'down' && h('div', { style:cardSt },
        h('div', { style:secSt }, `Простои · всего ${downtimeEvents.length} случаев`),
        downtimeByReason.length === 0
          ? h('div', { style:emptyTx }, 'Простоев не зафиксировано')
          : h('div', null,
              h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.9fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'var(--muted)' } },
                h('span', null, 'Причина'), h('span', { style:{ textAlign:'center' } }, 'Кол-во'), h('span', { style:{ textAlign:'right' } }, 'Общее время')
              ),
              downtimeByReason.map(([reason, stat], i, arr) =>
                h('div', { key:reason, style:{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.9fr', gap:8, padding:'6px 0', borderBottom: i < arr.length - 1 ? '0.5px solid #ede9e2' : 'none', fontSize:12, alignItems:'center' } },
                  h('span', { style:{ color:'var(--fg)' } }, reason),
                  h('span', { style:{ textAlign:'center', color:'var(--fg-muted)' } }, `${stat.count}×`),
                  h('span', { style:{ textAlign:'right', color:RD2, fontFamily:'monospace' } }, stat.total > 0 ? fmtDur(stat.total) : '—')
                )
              )
            )
      ),

      // ── БЛАГОДАРНОСТИ ──
      tab === 'thanks' && h('div', { style:cardSt },
        h('div', { style:secSt }, `Благодарности · ${thanks.length}`),
        thanks.length === 0
          ? h('div', { style:emptyTx }, 'Благодарностей пока нет')
          : thanks.map((ev, i) => {
              const from = data.workers.find(w => w.id === ev.fromWorkerId);
              const fromLabel = from ? from.name : ev.fromWorkerId === null ? 'Мастер' : 'Коллега';
              return h('div', { key:ev.id, style:{ padding:'8px 12px', background:'var(--card-2)', borderRadius:8, marginBottom: i < thanks.length - 1 ? 6 : 0, borderLeft:`2px solid ${GN}` } },
                h('div', { style:{ fontSize:11, color:'var(--muted)', marginBottom:3 } }, `от ${fromLabel} · ${ev.ts ? new Date(ev.ts).toLocaleDateString('ru') : ''}`),
                h('div', { style:{ fontSize:13, color:'var(--fg)' } }, ev.note || '—')
              );
            })
      ),

      // ── ДОСТИЖЕНИЯ ──
      tab === 'ach' && h('div', { style:cardSt },
        h('div', { style:secSt }, `Достижения ${(worker.achievements || []).length} / ${Object.keys(ACHIEVEMENTS).length}`),
        h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 } },
          Object.entries(ACHIEVEMENTS).map(([id, ach]) => {
            const earned = (worker.achievements || []).includes(id);
            return h('div', { key:id, style:{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background: earned ? AM3 : '#f5f5f2', opacity: earned ? 1 : 0.45 } },
              h('span', { style:{ fontSize:20 } }, ach.icon),
              h('div', null,
                h('div', { style:{ fontSize:12, fontWeight:500, color: earned ? AM2 : '#888' } }, ach.title),
                h('div', { style:{ fontSize:10, color: earned ? AM2 : '#aaa' } }, ach.desc)
              )
            );
          })
        )
      )

    )
  );
});


// ==================== BmkEstimateEditor ====================
// Этап 3 плана БМК: смета (состав работ) заказа БМК/КНР в карточке заказа.
// Мастер набирает работы из справочника bmkWorkRates и объёмы (м², м.п., шт);
// заказ получает расчётную стоимость работ; рабочий видит объёмы своего этапа.
// Вид (БМК/КНР) переключается здесь же; правила цен — см. bmkRowEffPrice (core).
const BmkEstimateEditor = memo(({ order, data, onUpdate, canEdit, addToast }) => {
  const toast = addToast || (() => {});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState('');
  const [editRow, setEditRow] = useState(null); // { id, price }
  const est = order.bmkEstimate || [];
  const kind = order.bmkKind || 'bmk';
  const rates = data.bmkWorkRates || [];
  const money = (v) => (Number(v) || 0).toLocaleString('ru-RU');

  const patchOrder = useCallback((patch, msg) => {
    const d = { ...data, orders: data.orders.map(o => o.id === order.id ? { ...o, ...patch } : o) };
    onUpdate(d);
    DB.save(d).catch(() => { onUpdate(data); toast('Ошибка сохранения', 'error'); });
    if (msg) toast(msg, 'success');
  }, [data, order.id, onUpdate]);
  const setRows = (rows, msg) => patchOrder({ bmkEstimate: rows }, msg);

  const addWork = (w) => {
    setRows([...est, { id: uid(), workId: w.id, stage: w.stage, name: w.name, unit: w.unit || 'шт', basePrice: w.price == null ? 0 : w.price, qty: 1 }]);
    if (w.price == null) toast('У позиции нет базовой цены (' + (w.note || '%') + ') — задайте цену кликом по ней', 'info');
  };
  const setQty = (id, v) => setRows(est.map(r => r.id === id ? { ...r, qty: v === '' ? '' : Number(v) } : r));
  const removeRow = (id) => setRows(est.filter(r => r.id !== id));
  const toggleAnchor = (id) => setRows(est.map(r => r.id === id ? { ...r, noAnchor: !r.noAnchor } : r));
  const commitPrice = () => {
    if (!editRow) return;
    const v = editRow.price === '' ? null : Number(editRow.price);
    setRows(est.map(r => r.id === editRow.id
      ? { ...r, priceOverride: (v == null || !isFinite(v) || v < 0) ? undefined : v }
      : r), 'Цена обновлена');
    setEditRow(null);
  };

  const stagesOrder = useMemo(() => {
    const seen = [];
    est.forEach(r => { if (!seen.includes(r.stage)) seen.push(r.stage); });
    return [...BMK_STAGES.filter(s => seen.includes(s)), ...seen.filter(s => !BMK_STAGES.includes(s))];
  }, [est]);

  const total = bmkEstimateTotal({ bmkEstimate: est, bmkKind: kind });
  const needle = q.trim().toLowerCase();
  const pickList = needle ? rates.filter(w => (w.name + ' ' + w.stage).toLowerCase().includes(needle)) : rates;

  const exportXlsx = () => {
    const rows = [['Смета работ ' + (kind === 'knr' ? 'КНР' : 'БМК') + ' — заказ ' + (order.number || '')], []];
    rows.push(['Этап', 'Работа', 'Ед.', 'Кол-во', 'Цена, руб', 'Сумма, руб']);
    stagesOrder.forEach(st => {
      est.filter(r => r.stage === st).forEach(r => {
        const eff = bmkRowEffPrice(r, kind);
        rows.push([st, r.name + (r.noAnchor ? ' (без анкерной группы −15%)' : ''), r.unit || 'шт', Number(r.qty) || 0, eff, eff * (Number(r.qty) || 0)]);
      });
    });
    rows.push([]);
    rows.push(['', '', '', '', 'Итого:', total]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 54 }, { wch: 6 }, { wch: 8 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Смета');
    XLSX.writeFile(wb, 'Смета_' + (order.number || 'БМК') + '.xlsx');
  };

  return h('div', { style: { marginBottom: 14 } },
    h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 } },
      '📋 Смета работ' + (est.length ? ' (' + est.length + ' поз.)' : '')),
    h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, 'Вид:'),
      [['bmk', 'БМК'], ['knr', 'КНР (наружное размещение)']].map(kv =>
        h('button', {
          key: kv[0],
          disabled: !canEdit,
          onClick: () => canEdit && kv[0] !== kind && patchOrder({ bmkKind: kv[0] }, 'Вид изделия: ' + kv[1]),
          style: { padding: '4px 10px', fontSize: 11, borderRadius: 8, cursor: canEdit ? 'pointer' : 'default', border: '0.5px solid ' + (kind === kv[0] ? BL : 'var(--border)'), background: kind === kv[0] ? BL3 : 'var(--card)', color: kind === kv[0] ? BL2 : 'var(--muted)', fontWeight: kind === kv[0] ? 600 : 400 }
        }, kv[1])
      ),
      kind === 'knr' && h('span', { style: { fontSize: 10, color: AM4 } }, 'обвязка котла −60% от прайса')
    ),
    est.length === 0 && h('div', { style: { fontSize: 12, color: 'var(--muted)', padding: '4px 0 8px' } },
      canEdit ? 'Смета пуста — добавьте работы из справочника расценок.' : 'Смета не заполнена.'),
    stagesOrder.map(st => {
      const rows = est.filter(r => r.stage === st);
      const stSum = rows.reduce((s, r) => s + bmkRowEffPrice(r, kind) * (Number(r.qty) || 0), 0);
      const isMast = /^мачта/i.test(st || '');
      return h('div', { key: st, style: { marginBottom: 8 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '3px 0', borderBottom: '0.5px solid var(--border)' } },
          h('span', null, st), h('span', null, money(stSum) + ' ₽')),
        rows.map(r => {
          const eff = bmkRowEffPrice(r, kind);
          const isOb = kind === 'knr' && /^обвязка/i.test(r.name || '') && r.priceOverride == null;
          return h('div', { key: r.id, style: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', fontSize: 12, flexWrap: 'wrap' } },
            h('span', { style: { flex: '1 1 170px', minWidth: 140 } },
              r.name,
              isOb && h('span', { style: { fontSize: 9, color: BL2, background: BL3, borderRadius: 5, padding: '1px 5px', marginLeft: 5, whiteSpace: 'nowrap' } }, '−60% КНР'),
              r.noAnchor && r.priceOverride == null && h('span', { style: { fontSize: 9, color: AM2, background: AM3, borderRadius: 5, padding: '1px 5px', marginLeft: 5, whiteSpace: 'nowrap' } }, '−15% без анкера'),
              r.priceOverride != null && h('span', { style: { fontSize: 9, color: 'var(--muted)', marginLeft: 5, whiteSpace: 'nowrap' } }, '(цена вручную)')
            ),
            canEdit
              ? h('input', { type: 'number', min: 0, step: 'any', style: { ...S.inp, width: 72, padding: '4px 8px', minHeight: 0 }, value: r.qty, onChange: e => setQty(r.id, e.target.value) })
              : h('span', { style: { fontWeight: 600 } }, Number(r.qty) || 0),
            h('span', { style: { color: 'var(--muted)', minWidth: 32 } }, r.unit || 'шт'),
            (editRow && editRow.id === r.id)
              ? h(React.Fragment, null,
                  h('input', { type: 'number', min: 0, autoFocus: true, style: { ...S.inp, width: 92, padding: '4px 8px', minHeight: 0 }, value: editRow.price, placeholder: 'база ' + money(r.basePrice), onChange: e => setEditRow(p => ({ ...p, price: e.target.value })), onKeyDown: e => e.key === 'Enter' && commitPrice() }),
                  h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }, onClick: commitPrice }, '✓'),
                  h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }, onClick: () => setEditRow(null) }, '✕'))
              : h('span', {
                  style: { minWidth: 78, textAlign: 'right', cursor: canEdit ? 'pointer' : 'default', textDecoration: canEdit ? 'underline dotted' : 'none' },
                  title: canEdit ? 'Изменить цену (пустое поле — вернуть расчётную)' : (r.priceOverride != null ? 'Цена задана вручную' : ''),
                  onClick: () => canEdit && setEditRow({ id: r.id, price: r.priceOverride == null ? '' : String(r.priceOverride) })
                }, money(eff) + ' ₽'),
            h('span', { style: { minWidth: 86, textAlign: 'right', fontWeight: 600 } }, money(eff * (Number(r.qty) || 0)) + ' ₽'),
            canEdit && isMast && h('label', { style: { fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', whiteSpace: 'nowrap' } },
              h('input', { type: 'checkbox', checked: !!r.noAnchor, onChange: () => toggleAnchor(r.id) }), 'без анкера'),
            canEdit && h('button', { title: 'Удалить строку', style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px' }, onClick: () => removeRow(r.id) }, '🗑')
          );
        })
      );
    }),
    est.length > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, padding: '6px 0', borderTop: '1px solid var(--border)' } },
      h('span', null, 'Итого работы'), h('span', null, money(total) + ' ₽')),
    h('div', { style: { display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' } },
      canEdit && h('button', { style: { fontSize: 12, padding: '5px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'none', cursor: 'pointer', color: 'var(--muted)' }, onClick: () => setPickerOpen(v => !v) }, pickerOpen ? '✕ Закрыть подбор' : '+ Работа из справочника'),
      est.length > 0 && h('button', { style: { fontSize: 12, padding: '5px 10px', borderRadius: 8, border: '0.5px solid var(--border)', background: 'var(--card)', cursor: 'pointer', color: 'var(--text)' }, onClick: exportXlsx }, '⬇ Смета в Excel')
    ),
    pickerOpen && canEdit && h('div', { style: { marginTop: 8, border: '0.5px solid var(--border)', borderRadius: 10, padding: 8, maxHeight: 260, overflowY: 'auto', background: 'var(--card-2)' } },
      h('input', { style: { ...S.inp, width: '100%', marginBottom: 6, boxSizing: 'border-box' }, placeholder: '🔍 Поиск работы в справочнике', value: q, onChange: e => setQ(e.target.value), autoFocus: true }),
      rates.length === 0 && h('div', { style: { fontSize: 11, color: 'var(--muted)' } }, 'Справочник расценок БМК пуст (HR → Расценки).'),
      pickList.slice(0, 60).map(w => h('div', {
        key: w.id,
        onClick: () => addWork(w),
        style: { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 6px', fontSize: 11, borderRadius: 6, cursor: 'pointer' }
      },
        h('span', { style: { flex: 1 } }, w.name, h('span', { style: { color: 'var(--muted)' } }, ' · ' + w.stage)),
        h('span', { style: { fontWeight: 600, flexShrink: 0 } }, w.price == null ? (w.note || '—') : money(w.price) + ' ₽/' + (w.unit || 'шт'))
      )),
      pickList.length > 60 && h('div', { style: { fontSize: 10, color: 'var(--muted)', padding: 4 } }, 'Показаны первые 60 — уточните поиск')
    )
  );
});


// ==================== BmkAcceptButton ====================
// Этап 4 плана БМК: приёмка работ мастером и сдельное начисление бригаде.
// Кнопка на завершённой БМК-операции в карточке заказа: мастер подтверждает или
// корректирует фактические объёмы по строкам сметы этого этапа, сумма делится
// ПОРОВНУ между участниками операции (op.workerIds) и замораживается:
//   op.bmkPayout — акт приёмки (строки факта, итог, доля, дата);
//   op.earning   — { amount: доля работника, source:'bmk' } → автоматически
//                  подхватывается HR-выгрузкой (PayrollExport суммирует
//                  op.earning.amount) и зарплатным блоком рабочего.
// Повторная приёмка перезаписывает начисление (пересчёт).
// Отдельный компонент со своими хуками — OrderCardModal без хуков (early return).
const BmkAcceptButton = memo(({ op, order, data, onUpdate }) => {
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState({});
  const kind = order.bmkKind || 'bmk';
  const estRows = (order.bmkEstimate || []).filter(r => r.stage === op.name);
  const crew = (op.workerIds || []).map(wid => (data.workers || []).find(x => x.id === wid)).filter(Boolean);
  const money = (v) => (Number(v) || 0).toLocaleString('ru-RU');

  const openModal = () => {
    const f = {};
    estRows.forEach(r => { f[r.id] = Number(r.qty) || 0; });
    if (op.bmkPayout && op.bmkPayout.rows) op.bmkPayout.rows.forEach(pr => { if (pr.id in f) f[pr.id] = pr.qty; });
    setFacts(f);
    setOpen(true);
  };

  const rowsCalc = estRows.map(r => {
    const qty = facts[r.id] === '' ? 0 : (Number(facts[r.id]) || 0);
    const price = bmkRowEffPrice(r, kind);
    return { r, qty, price, sum: Math.round(price * qty) };
  });
  const total = rowsCalc.reduce((s, x) => s + x.sum, 0);
  const n = crew.length;
  const perWorker = n > 0 ? Math.round(total / n) : 0;
  const canAccept = n > 0 && estRows.length > 0;

  const accept = () => {
    if (!canAccept) return;
    const acceptedAt = now();
    const payout = {
      total, perWorker, workerIds: crew.map(x => x.id), acceptedAt,
      rows: rowsCalc.filter(x => x.qty > 0).map(x => ({ id: x.r.id, name: x.r.name, unit: x.r.unit || 'шт', qty: x.qty, price: x.price, sum: x.sum })),
    };
    const earning = { amount: perWorker, workerCount: n, source: 'bmk', field: 'bmk', totalAmount: total };
    const d = { ...data,
      ops: data.ops.map(o => o.id === op.id ? { ...o, bmkPayout: payout, earning } : o),
      events: [...(data.events || []), { id: uid(), type: 'bmk_accept', opId: op.id, orderId: order.id, ts: acceptedAt, total, workerIds: payout.workerIds }],
    };
    onUpdate(d);
    DB.save(d).catch(() => onUpdate(data));
    setOpen(false);
  };

  return h(React.Fragment, null,
    op.bmkPayout
      ? h('button', {
          title: 'Принято ' + new Date(op.bmkPayout.acceptedAt).toLocaleDateString('ru-RU') + ' — открыть / пересчитать',
          onClick: openModal,
          style: { fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '0.5px solid ' + GN, background: GN3, color: GN2, cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }
        }, '💰 ' + money(op.bmkPayout.total) + ' ₽')
      : h('button', {
          title: 'Принять работы и начислить бригаде',
          onClick: openModal,
          style: { fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '0.5px solid ' + AM4, background: AM3, color: AM2, cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }
        }, '💰 Принять'),
    open && h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }, onClick: () => setOpen(false) },
      h('div', { className: 'modal-animated', style: { background: 'var(--card-solid)', border: '1px solid var(--card-stroke)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', borderRadius: 14, padding: 18, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto' }, onClick: e => e.stopPropagation() },
        h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 2 } }, '💰 Приёмка работ — ' + op.name),
        h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 10 } },
          'Заказ №' + (order.number || '') + (kind === 'knr' ? ' · КНР (обвязка −60%)' : ' · БМК')),
        estRows.length === 0
          ? h('div', { style: { fontSize: 12, color: AM2, background: AM3, borderRadius: 8, padding: '10px 12px', marginBottom: 10 } },
              'В смете заказа нет работ этапа «' + op.name + '». Заполните смету в карточке заказа и вернитесь к приёмке.')
          : h('div', { style: { marginBottom: 10 } },
              h('div', { style: { display: 'flex', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--muted)', padding: '2px 0', borderBottom: '0.5px solid var(--border)' } },
                h('span', { style: { flex: 1 } }, 'Работа'),
                h('span', { style: { width: 70, textAlign: 'center' } }, 'Факт'),
                h('span', { style: { width: 34 } }, 'Ед.'),
                h('span', { style: { width: 70, textAlign: 'right' } }, 'Цена'),
                h('span', { style: { width: 80, textAlign: 'right' } }, 'Сумма')
              ),
              rowsCalc.map(x => h('div', { key: x.r.id, style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '6px 0', borderBottom: '0.5px solid var(--border)' } },
                h('span', { style: { flex: 1, lineHeight: 1.35, minWidth: 0 } }, x.r.name,
                  h('span', { style: { color: 'var(--muted)', fontSize: 10, whiteSpace: 'nowrap' } }, ' · по смете ' + (Number(x.r.qty) || 0))),
                h('input', { type: 'number', min: 0, step: 'any', style: { ...S.inp, width: 70, padding: '4px 6px', minHeight: 0, textAlign: 'center' }, value: facts[x.r.id], onChange: e => setFacts(p => ({ ...p, [x.r.id]: e.target.value })) }),
                h('span', { style: { width: 34, color: 'var(--muted)' } }, x.r.unit || 'шт'),
                h('span', { style: { width: 70, textAlign: 'right' } }, money(x.price)),
                h('span', { style: { width: 80, textAlign: 'right', fontWeight: 600 } }, money(x.sum))
              ))
            ),
        h('div', { style: { fontSize: 12, marginBottom: 4 } },
          h('span', { style: { color: 'var(--muted)' } }, 'Бригада (' + n + '): '),
          n > 0 ? crew.map(x => x.name).join(', ') : h('span', { style: { color: RD, fontWeight: 600 } }, 'на операции нет исполнителей — начислять некому')),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, padding: '8px 0', borderTop: '1px solid var(--border)', marginTop: 6 } },
          h('span', null, 'Итого за работы'), h('span', null, money(total) + ' ₽')),
        n > 0 && h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GN2, fontWeight: 600, marginBottom: 8 } },
          h('span', null, 'Каждому участнику (поровну)'), h('span', null, money(perWorker) + ' ₽')),
        h('div', { style: { fontSize: 10, color: 'var(--muted)', marginBottom: 10 } },
          'За брак не платят — забракованные объёмы в факт не включаются. Повторная приёмка перезапишет начисление.'),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { style: { padding: '8px 14px', fontSize: 13, borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--card-2)', color: 'var(--text)', cursor: 'pointer' }, onClick: () => setOpen(false) }, 'Отмена'),
          h('button', {
            disabled: !canAccept,
            style: { padding: '8px 14px', fontSize: 13, borderRadius: 10, border: 'none', background: canAccept ? GN : 'var(--card-2)', color: canAccept ? '#fff' : 'var(--muted)', cursor: canAccept ? 'pointer' : 'default', fontWeight: 600 },
            onClick: accept
          }, op.bmkPayout ? '✓ Пересчитать: ' + money(total) + ' ₽' : '✓ Начислить ' + money(total) + ' ₽')
        )
      )
    )
  );
});
