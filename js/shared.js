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
    if (!window.Html5Qrcode) { setError('Библиотека QR не загружена'); return; }
    const timer = setTimeout(() => {
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
    h('div', { style: { color: '#888', fontSize: 11, marginTop: 12, textAlign: 'center' } },
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
    h('div', { className: 'modal-animated', style: { background: '#fff', borderRadius: 12, padding: 20, width: 'min(380px, calc(100vw - 32px))', maxHeight: '70vh', overflowY: 'auto' } },
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
          payload = d.payload ? JSON.parse(d.payload) : d;
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
  pending:  { label: 'Ожидается', color: '#888',    bg: 'rgba(0,0,0,0.05)'       },
  ordered:  { label: 'Заказано',  color: '#185FA5', bg: 'rgba(24,95,165,0.1)'   },
  partial:  { label: 'Частично',  color: '#BA7517', bg: 'rgba(239,159,39,0.12)' },
  received: { label: 'Получено',  color: '#0F6E56', bg: 'rgba(15,110,86,0.1)'   },
};

// Экспорт в Excel через SheetJS
const exportNeedsToExcel = (order, needs) => {
  if (!XLSX) { alert('XLSX не загружен'); return; }
  const wb = XLSX.utils.book_new();
  (needs.groups || []).forEach(group => {
    const rows = [
      [`Заявка на материалы — Заказ ${order?.number || ''} — ${order?.product || ''}`],
      [`Группа: ${group.name}`],
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
  reader.onload = (e) => {
    try {
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

  if (editing) return h('tr', { style: { background: 'rgba(239,159,39,0.06)' } },
    h('td', { style: { padding: '4px 6px' } }),
    h('td', { style: { padding: '4px 4px' } }, inp('name', 'Наименование')),

    h('td', { style: { padding: '4px 4px' } }, inp('material', 'Материал')),
    h('td', { style: { padding: '4px 4px', width: 70 } }, inp('thickness', 'мм', 70)),
    h('td', { style: { padding: '4px 4px', width: 60 } }, inp('qty', '1', 60, 'number')),
    h('td', { style: { padding: '4px 4px', width: 70 } },
      h('select', { value: draft.unit, style: { fontSize: 12, padding: '3px 4px', border: '0.5px solid var(--border)', borderRadius: 4, background: 'var(--card)', color: 'var(--fg)' },
        onChange: e => upd('unit', e.target.value) },
        ITEM_UNITS.map(u => h('option', { key: u, value: u }, u)))),
    h('td', { style: { padding: '4px 4px', width: 70 } }, inp('length', 'м', 70)),
    h('td', { style: { padding: '4px 4px', minWidth: 160 } },
      h('textarea', { value: draft.note ?? '', placeholder: 'Примечание',
        rows: 2, style: { width: '100%', fontSize: 12, padding: '3px 6px', border: '0.5px solid var(--border)', borderRadius: 4, background: 'var(--card)', color: 'var(--fg)', resize: 'vertical', minHeight: 36, fontFamily: 'inherit' },
        onChange: e => upd('note', e.target.value) })
    ),
    h('td', { style: { padding: '4px 6px', whiteSpace: 'nowrap' } },
      h('button', { onClick: save,   style: { fontSize: 11, padding: '3px 8px', background: AM, color: AM2, border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4, fontWeight: 500 } }, '✓'),
      h('button', { onClick: cancel, style: { fontSize: 11, padding: '3px 8px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 4, cursor: 'pointer' } }, 'Отмена'))
  );

  return h('tr', { style: { borderBottom: '0.5px solid var(--border-soft)', background: rowBg, transition: 'background 0.1s' } },
    // Чекбокс + кнопка удалить (всегда видна при canEdit)
    h('td', { style: { padding: '5px 6px', whiteSpace: 'nowrap' } },
      canEdit && h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
        h('input', { type: 'checkbox', checked: selected, onChange: () => onSelect(item.id),
          style: { width: 14, height: 14, cursor: 'pointer', accentColor: RD } }),
        h('button', { onClick: () => onDelete(groupId, item.id), title: 'Удалить позицию',
          style: { fontSize: 13, color: RD, background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px', opacity: 0.7 } }, '🗑')
      )
    ),
    h('td', { style: { padding: '5px 4px', fontSize: 12, color: item.name ? 'var(--fg)' : '#aaa' },
      onDoubleClick: canEdit ? () => { setDraft(item); setEditing(true); } : undefined }, item.name || '—'),

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
const MaterialGroup = memo(({ group, onUpdateGroup, onDeleteGroup, onUpdateItem, onDeleteItem, onDeleteMany, onAddItem, canEdit, onUpdateItemStatus }) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState(group.name);
  const [collapsed, setCollapsed]     = useState(false);
  const [selected, setSelected]       = useState(new Set()); // выбранные id для пакетного удаления

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
        pendingCount  > 0 && h('span', { style: { color: '#888'    } }, `⏳ ${pendingCount}`),
        orderedCount  > 0 && h('span', { style: { color: '#185FA5' } }, `📦 ${orderedCount}`),
        receivedCount > 0 && h('span', { style: { color: GN        } }, `✓ ${receivedCount}`),
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
            h('td', { colSpan: 10, style: { padding: '12px', textAlign: 'center', color: '#aaa', fontSize: 12 } },
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
        canEdit && total > 0 && h('span', { style: { fontSize: 11, color: '#aaa', marginLeft: 'auto' } },
          'Двойной клик на строку — редактировать')
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

  if (loading) return h('div', { style: { padding: 20, textAlign: 'center', color: '#888', fontSize: 13 } }, '⏳ Загрузка материалов…');
  if (!needs)  return h('div', { style: { padding: 20, textAlign: 'center', color: '#888', fontSize: 13 } }, 'Нет данных');

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
    // Номер заявки
    canEdit && h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
      h('div', { style: { fontSize: 12, fontWeight: 500, color: 'var(--muted)', whiteSpace: 'nowrap' } }, '№ Заявки:'),
      h('input', { type: 'text', placeholder: 'напр. З-2026-047', value: needs.requestNumber || '',
        style: { fontSize: 13, padding: '5px 10px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--fg)', width: 160 },
        onChange: e => updNeeds(p => ({ ...p, requestNumber: e.target.value })) }),
      needs.requestNumber && h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, '— сохраняется автоматически')
    ),
    // Шапка с кнопками
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
      // Статистика
      h('div', { style: { display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' } },
        [
          { label: 'Всего',    val: stats.total,    color: '#555'    },
          { label: '⏳ Ожид.', val: stats.pending,  color: '#888'    },
          { label: '📦 Заказ.', val: stats.ordered,  color: '#185FA5' },
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
        canEdit && h('button', {
          onClick: addGroup,
          style: { fontSize: 12, padding: '6px 12px', border: `0.5px solid ${AM}`, borderRadius: 7, color: AM2, background: 'transparent', cursor: 'pointer', fontWeight: 500 }
        }, '+ Группа'),
        saving && h('span', { style: { fontSize: 11, color: '#888' } }, '💾 Сохранение…')
      ),
      h('input', { ref: fileRef, type: 'file', accept: '.xlsx,.xls', style: { display: 'none' },
        onChange: e => { handleImport(e.target.files[0]); e.target.value = ''; } })
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
        onUpdateItemStatus: updateAllStatus,
      })
    ),

    needs.groups?.length === 0 && h('div', { style: { textAlign: 'center', padding: '32px', color: '#aaa', fontSize: 13 } },
      'Нет групп. Нажмите «+ Группа» или импортируйте Excel.'
    )
  );
});



// ==================== OrderCardModal — универсальная карточка заказа (360°) ====================
// Использование:
//   h(OrderCardModal, { orderId, data, onClose, canEdit: false })
// canEdit: true — показывает кнопки PDF, редактирования (для мастера/ПДО)
// canEdit: false — только просмотр (для рабочего, склада)
const OrderCardModal = memo(({ orderId, data, onClose, canEdit = false, onEditMaterials, onEditDeps }) => {
  if (!orderId) return null;
  const ord = data.orders.find(o => o.id === orderId);
  if (!ord) return null;

  const ops        = data.ops.filter(o => o.orderId === ord.id && !o.archived);
  const done       = ops.filter(o => o.status === 'done').length;
  const inProgress = ops.filter(o => o.status === 'in_progress').length;
  const components = ord.components || [];
  const priority   = { low: { label: 'Низкий', color: '#888' }, medium: { label: 'Средний', color: '#378ADD' }, high: { label: 'Высокий', color: '#EF9F27' }, critical: { label: 'Критический', color: '#E24B4A' } }[ord.priority] || { label: '—', color: '#888' };
  const daysLeft   = ord.deadline ? Math.ceil((new Date(ord.deadline) - Date.now()) / 86400000) : null;
  const deadlineColor = daysLeft === null ? '#888' : daysLeft < 0 ? '#E24B4A' : daysLeft <= 3 ? '#EF9F27' : '#888';

  const ST_COLORS = { pending: '#888', in_progress: '#EF9F27', on_check: '#378ADD', done: '#1D9E75', defect: '#E24B4A' };
  const ST_LABELS = { pending: 'Ожидает', in_progress: 'В работе', on_check: 'Контроль', done: 'Выполнено', defect: 'Дефект' };

  return h('div', {
    role: 'dialog', 'aria-modal': 'true',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '24px 16px', overflowY: 'auto' },
    onKeyDown: e => e.key === 'Escape' && onClose(),
    onClick: e => e.target === e.currentTarget && onClose(),
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card)', borderRadius: 14, padding: 0, width: 'min(680px, calc(100vw - 32px))', overflow: 'hidden', position: 'relative' } },

      // Тёмная шапка
      h('div', { style: { background: 'linear-gradient(135deg, #1a1a18 0%, #2d2a24 100%)', padding: '20px 24px 16px', color: '#fff' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          h('div', null,
            h('div', { style: { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 4 } }, '📋 КАРТОЧКА ЗАКАЗА'),
            h('div', { style: { fontSize: 26, fontWeight: 700, color: '#EF9F27', letterSpacing: '-0.5px' } }, ord.number),
          ),
          h('button', { onClick: onClose, style: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 24, lineHeight: 1, padding: '0 4px' } }, '×')
        ),
        h('div', { style: { fontSize: 15, fontWeight: 500, color: '#fff', marginTop: 8, lineHeight: 1.3 } }, ord.product),
        ord.specs && h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 } }, ord.specs),
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

        // Комплектующие
        components.length > 0 && h('div', { style: { marginBottom: 14 } },
          h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 } },
            `📦 Комплектующие (${components.length} поз.)`
          ),
          h('div', { style: { border: '0.5px solid var(--border-soft)', borderRadius: 8, overflow: 'hidden' } },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px 50px 40px', background: 'var(--bg)', padding: '5px 12px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' } },
              h('span', null, 'Наименование'), h('span', null, 'Код'), h('span', { style: { textAlign: 'center' } }, 'Кол-во'), h('span', { style: { textAlign: 'center' } }, 'Ед.')
            ),
            components.map((c, i) => h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '1fr 120px 50px 40px', padding: '8px 12px', borderTop: '0.5px solid var(--border-soft)', fontSize: 12, alignItems: 'center', background: c.status === 'confirmed' ? 'rgba(29,158,117,0.04)' : 'transparent' } },
              h('span', null, c.name || c.description || '—'),
              h('span', { style: { color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 } }, c.code || c.article || '—'),
              h('span', { style: { textAlign: 'center', fontWeight: 500 } }, c.qty || 1),
              h('span', { style: { textAlign: 'center', color: 'var(--muted)', fontSize: 11 } }, c.unit || 'шт')
            ))
          ),
          components.some(c => c.status !== 'confirmed') && h('div', { style: { marginTop: 5, padding: '5px 10px', background: 'rgba(239,159,39,0.08)', border: '0.5px solid #EF9F27', borderRadius: 6, fontSize: 11, color: '#BA7517' } },
            '⚠ Ожидается получение комплектующих'
          )
        ),

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
                    h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 6, background: `${ST_COLORS[op.status] || '#888'}18`, color: ST_COLORS[op.status] || '#888', fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' } }, ST_LABELS[op.status] || op.status)
                  );
                })
          )
        ),

        // Кнопки — только для canEdit
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          canEdit && h('button', { onClick: () => { if (typeof generateFullPassport === 'function') generateFullPassport(ord, data); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '📄 Паспорт PDF'),
          canEdit && h('button', { onClick: () => { if (typeof generateRouteSheet === 'function') generateRouteSheet(ord, data); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '📋 Маршрутный лист'),
          canEdit && onEditMaterials && h('button', { onClick: () => { onClose(); onEditMaterials(ord.id); }, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, '🔩 Заявка на материалы'),
          h('button', { onClick: onClose, style: { fontSize: 12, padding: '7px 14px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'transparent', cursor: 'pointer' } }, 'Закрыть')
        )
      )
    )
  );
});


// ==================== PDF Протокол гидравлического испытания ====================
const generatePressureTestPDF = (test, data) => {
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
      subheader: { fontSize: 10, bold: true, margin: [0, 10, 0, 4], color: '#555' },
      label:     { fontSize: 9, color: '#888' },
      value:     { fontSize: 11, bold: true },
      small:     { fontSize: 8, color: '#888' },
    },
    content: [
      // Шапка
      { text: 'ООО "НТ" · ПРОИЗВОДСТВО', style: 'small', alignment: 'center' },
      { text: 'ПРОТОКОЛ ГИДРАВЛИЧЕСКОГО ИСПЫТАНИЯ', style: 'header', margin: [0, 4, 0, 2] },
      { text: `№ ГИ-${String(test.createdAt).slice(-6)}`, fontSize: 10, alignment: 'center', color: '#888', margin: [0, 0, 0, 12] },

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
      { text: 'Испытание проведено в соответствии с ФНП "Правила промышленной безопасности при использовании оборудования, работающего под избыточным давлением" (ПБ 10-558-03)', fontSize: 7, color: '#aaa', margin: [0, 20, 0, 0], alignment: 'center' },
    ].filter(Boolean),
  };
  pdfMake.createPdf(docDefinition).download(`ГИ_${order?.number || 'протокол'}_${dateStr}.pdf`);
};

const generateFullPassport = (order, data) => {
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
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, color: '#ccc' }] },
      { text: `Дата формирования паспорта: ${new Date().toLocaleString('ru')}   |   ООО НТ   |   Заказ №${order.number}`, fontSize: 8, color: '#888', margin: [0, 6, 0, 0], alignment: 'center' }
    ].filter(Boolean),
    styles: {
      header:    { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      subheader: { fontSize: 12, bold: true, margin: [0, 8, 0, 4], color: '#333' },
      subheader2:{ fontSize: 10, bold: true, margin: [0, 4, 0, 4], color: '#555' }
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
      forecast.map((d, i) => h('div', { key: i, style: { textAlign: 'center', padding: 8, borderRadius: 8, background: d.warnings.length > 0 ? RD3 : d.isWeekend ? '#f0ede8' : '#f8f8f5', border: d.warnings.length > 0 ? `0.5px solid ${RD}` : '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { fontSize: 11, fontWeight: 500, color: d.warnings.length > 0 ? RD : '#666', marginBottom: 4 } }, d.label),
        h('div', { style: { fontSize: 18, fontWeight: 500, color: d.plannedCount > 0 ? AM2 : '#ccc' } }, d.plannedCount),
        h('div', { style: { fontSize: 9, color: '#888' } }, `${d.totalHours}ч`),
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
      new window.QRCode(ref.current, { text: url.toString(), width: 140, height: 140, colorDark: AM4, colorLight: '#ffffff' });
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
    h('div', { className: 'modal-animated', style: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 12, padding: 24, width: 'min(360px, calc(100vw - 32px))', textAlign: 'center', position: 'relative', maxHeight: '90vh', overflowY: 'auto' } },
      h('button', { type: 'button', onClick: onClose, 'aria-label': 'Закрыть', style: { position: 'absolute', top: 10, right: 12, background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 } }, '×'),
      h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 } }, 'QR-код операции'),
      // QR
      h('div', { style: { background: '#fff', borderRadius: 8, padding: 12, display: 'inline-block', marginBottom: 10, border: '0.5px solid rgba(0,0,0,0.08)' } },
        h('div', { ref }),
        qrError && h('div', { style: { color: RD, fontSize: 11, padding: 8 } }, 'Не удалось загрузить библиотеку QR-кода')
      ),
      worker && h('div', { style: { fontSize: 11, color: AM, marginTop: 8, fontWeight: 500 } }, `Исполнитель: ${worker.name}`),
      h('div', { style: { fontFamily: 'monospace', fontSize: 13, fontWeight: 500, color: AM, marginBottom: 4 } }, op.id),
      h('div', { style: { fontSize: 11, color: '#888', marginBottom: 4 } }, op.name),
      h('div', { style: { fontSize: 10, color: '#aaa', marginBottom: 10 } }, `Заказ: ${order?.number || '—'} · ${order?.product || ''}`),
      // Навигация
      ops.length > 1 && h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 } },
        h('button', { type: 'button', style: gbtn({ padding: '4px 10px' }), onClick: () => setIndex(i => (i - 1 + ops.length) % ops.length) }, '←'),
        h('span', { style: { fontSize: 11, color: '#888' } }, `${index + 1} / ${ops.length}`),
        h('button', { type: 'button', style: gbtn({ padding: '4px 10px' }), onClick: () => setIndex(i => (i + 1) % ops.length) }, '→')
      ),
      // Режим печати
      h('div', { style: { display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 } },
        [['label', '🏷 Этикетка'], ['qronly', '⬜ Только QR'], ['full', '🖨 A4']].map(([m, l]) =>
          h('button', { key: m, style: labelMode === m ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setLabelMode(m) }, l)
        )
      ),
      // Предпросмотр этикетки
      h('div', { style: { background: '#f8f8f5', borderRadius: 8, padding: 10, marginBottom: 12, border: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { fontSize: 9, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' } },
          labelMode === 'qronly' ? 'Предпросмотр · 50×35мм · только QR' :
          labelMode === 'full' ? 'Предпросмотр · полный формат' :
          'Предпросмотр · 50×35мм'),
        h('div', { style: { display: 'inline-flex', border: '1px dashed #ccc', borderRadius: 4, background: '#fff', padding: 2 } },
          labelMode === 'qronly'
            ? h('div', { style: { width: 100, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
                h('div', { style: { width: 60, height: 60, border: '2px solid ' + AM4, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: AM4 } }, 'QR')
              )
            : labelMode === 'full'
              ? h('div', { style: { width: 130, padding: 8, textAlign: 'center' } },
                  h('div', { style: { width: 60, height: 60, border: '2px solid ' + AM4, borderRadius: 4, margin: '0 auto 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: AM4 } }, 'QR'),
                  h('div', { style: { fontSize: 8, fontFamily: 'monospace', color: AM4, fontWeight: 600 } }, op.id),
                  h('div', { style: { fontSize: 7, color: '#666' } }, (op.name || '').slice(0, 20)),
                  h('div', { style: { fontSize: 6, color: '#aaa' } }, order?.number || '')
                )
              : h('div', { style: { width: 100, height: 70, display: 'flex', alignItems: 'center', gap: 4, padding: 3 } },
                  h('div', { style: { width: 50, height: 50, border: '2px solid ' + AM4, borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: AM4 } }, 'QR'),
                  h('div', { style: { fontSize: 7, lineHeight: 1.3, overflow: 'hidden' } },
                    h('div', { style: { fontFamily: 'monospace', fontWeight: 600, fontSize: 8, color: '#333' } }, op.id),
                    h('div', { style: { color: '#666', marginTop: 1 } }, (op.name || '').slice(0, 15)),
                    h('div', { style: { color: '#aaa', marginTop: 1 } }, (order?.number || '').slice(0, 12))
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
    { id: 'order',     label: 'Создать первый заказ',           done: data.orders.filter(o => !o.archived).length > 0,         action: null },
    { id: 'competences', label: 'Заполнить матрицу компетенций', done: data.workers.some(w => w.competences?.length > 0),       action: null },
    { id: 'assign',    label: 'Назначить операции',             done: data.ops.some(o => o.workerIds?.length > 0),             action: null },
  ], [data]);

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;
  const nextStep = steps.find(s => !s.done);
  const pct = Math.round(doneCount / steps.length * 100);

  if (allDone) return null; // Скрываем когда всё настроено

  return h('div', { style: { ...{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 16, marginBottom: 16 } } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
      h('div', { style: { fontSize: 13, fontWeight: 500 } }, `Настройка системы · ${doneCount} из ${steps.length}`),
      h('button', { style: { background: 'none', border: 'none', fontSize: 11, color: '#aaa', cursor: 'pointer' }, onClick: onDone }, 'Скрыть')
    ),
    // Прогресс-бар
    h('div', { style: { height: 6, background: '#f0ede8', borderRadius: 3, overflow: 'hidden', marginBottom: 12 } },
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
  if (!w) return h('span', { style: { color: '#888', ...style } }, '—');
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
    0: { label:'Нет допуска', bg:'#f5f5f2',  cl:'#aaa'   },
    1: { label:'Новичок',     bg:'#FFF8E1',  cl:'#F57F17' },
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
    h('span', { style: { flex:1, fontSize:13, color: level === 0 ? '#aaa' : '#222' } }, opName),
    h('span', { style: { display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:lc.bg, color:lc.cl, flexShrink:0 } }, lc.label),
    h('span', { style: { fontSize:11, color:certColor, minWidth:90, textAlign:'right' } }, certLabel),
    canTeach && h('span', { style: { display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:'#f5f5f2', color:'#666', flexShrink:0 } }, 'Может обучать')
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
    if (todayCell.code === 'Б')  return { label:'Больничный',          bg:'#FCEBEB', cl:'#791F1F', br:'#F48FB1' };
    if (todayCell.code === 'ОЗ') return { label:'Отпуск за свой счёт', bg:'#FFF3E0', cl:'#E65100', br:'#FFB74D' };
    if (todayCell.code === 'К')  return { label:'Командировка',        bg:'#F3E5F5', cl:'#6A1B9A', br:'#CE93D8' };
    if (todayCell.code === 'НН') return { label:'Неявка',             bg:'#F1EFE8', cl:'#888',    br:'#ccc'    };
    if (todayCell.code === 'У')  return { label:'Уволен',             bg:'#E0E0E0', cl:'#444',    br:'#bbb'    };
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
  const cardSt  = { background:'#fff', border:'0.5px solid #dedad3', borderRadius:12, padding:'14px 18px', marginBottom:12 };
  const secSt   = { fontSize:11, fontWeight:500, color:'#888', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, paddingBottom:6, borderBottom:'0.5px solid #ede9e2' };
  const rowSt   = { display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'0.5px solid #ede9e2', flexWrap:'wrap' };
  const lastRow = { display:'flex', alignItems:'center', gap:8, padding:'7px 0', flexWrap:'wrap' };
  const tabsSt  = { display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 };
  const tabSt   = (on) => ({ padding:'5px 12px', borderRadius:8, fontSize:12, fontWeight:500, cursor:'pointer', border:`0.5px solid ${on ? 'transparent' : '#ccc'}`, color: on ? AM2 : '#666', background: on ? AM3 : 'transparent' });
  const emptyTx = { padding:'16px 0', fontSize:13, color:'#aaa', textAlign:'center' };

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
    h('div', { className:'modal-content modal-animated', style:{ background:'#faf9f6', borderRadius:14, padding:20, width:'min(700px, calc(100vw - 24px))', maxHeight:'90vh', overflowY:'auto', position:'relative' } },

      // ── Кнопка закрытия (вне шапки, всегда поверх) ──
      h('button', { onClick:onClose, 'aria-label':'Закрыть', style:{ position:'sticky', top:0, float:'right', zIndex:10, background:'#fff', border:'1px solid #ccc', borderRadius:'50%', width:32, height:32, fontSize:18, lineHeight:'30px', textAlign:'center', cursor:'pointer', color:'#444', marginBottom:-32, marginRight:0 } }, '×'),

      // ── ШАПКА ──
      h('div', { style:{ ...cardSt } },
        h('div', { style:{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:14 } },
          h('div', { style:{ width:52, height:52, borderRadius:'50%', background:displayStatus.bg, border:`1px solid ${displayStatus.br}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:500, color:displayStatus.cl, flexShrink:0 } },
            (worker.name || '?').charAt(0)
          ),
          h('div', { style:{ flex:1, minWidth:0 } },
            h('div', { style:{ fontSize:17, fontWeight:500, color:'#1a1a1a', marginBottom:3 } }, worker.name),
            h('div', { style:{ fontSize:12, color:'#888', marginBottom:8 } },
              [worker.position, worker.grade ? `${worker.grade} разряд` : null, worker.tabNumber ? `Таб. №${worker.tabNumber}` : null, section?.name].filter(Boolean).join(' · ') || '—'
            ),
            h('div', { style:{ display:'flex', gap:5, flexWrap:'wrap' } },
              h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:500, background:displayStatus.bg, color:displayStatus.cl } }, displayStatus.label),
              worker.hireDate && h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:'#f0ede8', color:'#666' } }, `Принят ${new Date(worker.hireDate).toLocaleDateString('ru')}`),
              h('span', { style:{ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:20, fontSize:11, background:AM3, color:AM2 } }, `Ур. ${level} — ${getLevelTitle(level)}`)
            )
          ),
          h('div', { style:{ textAlign:'right', flexShrink:0 } },
            h('div', { style:{ fontSize:10, color:'#aaa' } }, 'Брак'),
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
        h('div', { style:{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#f5f1eb', borderRadius:8, marginBottom:12 } },
          h('div', { style:{ fontSize:26, fontWeight:500, color:AM } }, `${level}`),
          h('div', { style:{ flex:1 } },
            h('div', { style:{ fontSize:13, fontWeight:500, color:'#333', marginBottom:4 } }, `${getLevelTitle(level)} · ${allDone} операций всего`),
            h('div', { style:{ height:6, background:'#dedad3', borderRadius:3, overflow:'hidden' } },
              h('div', { style:{ width:`${progress * 100}%`, height:6, background:AM, borderRadius:3 } })
            )
          ),
          h('div', { style:{ fontSize:11, color:'#888' } }, `${Math.round(progress * 100)}% → Ур. ${level + 1}`)
        ),

        // Контакты
        (worker.phone || worker.email || worker.emergencyContact) && h('div', { style:{ display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'#666' } },
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
              h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1.1fr 0.9fr 0.8fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'#aaa' } },
                h('span', null, 'Операция'), h('span', null, 'Заказ'), h('span', null, 'Статус'), h('span', null, 'Длительность')
              ),
              allFinishedOps.slice(0, opsLimit).map((op, i, arr) => {
                const order = data.orders.find(o => o.id === op.orderId);
                const isLast = i === arr.slice(0, opsLimit).length - 1;
                return h('div', { key:op.id, style:{ display:'grid', gridTemplateColumns:'2fr 1.1fr 0.9fr 0.8fr', gap:8, padding:'6px 0', borderBottom: isLast ? 'none' : '0.5px solid #ede9e2', fontSize:12, alignItems:'center' } },
                  h('span', { style:{ color:'#222' } }, op.name),
                  h('span', { style:{ color:AM2 } }, order?.number || '—'),
                  h(Badge, { st:op.status }),
                  h('span', { style:{ color:'#888', fontFamily:'monospace' } }, op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : '—')
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
        h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 0.9fr 1.1fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'#aaa' } },
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
            h('span', { style:{ color:'#888' } }, instr ? new Date(instr.dateMs).toLocaleDateString('ru') : '—'),
            instr
              ? wcBadge(daysLeft, nextLabel)
              : h('span', { style:{ fontSize:11, color:'#aaa' } }, nextLabel)
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
            h('span', { style:{ flex:1, fontSize:13, color:'#222' } }, '🏥 Медицинский осмотр'),
            wcBadge(d, label)
          );
        })(),
        (worker.licences || []).length === 0 && !worker.medicalExamNextDate
          ? h('div', { style:emptyTx }, 'Нет удостоверений')
          : (worker.licences || []).map((lic, i, arr) => {
              const d = lic.expiryDate ? Math.ceil((new Date(lic.expiryDate).getTime() - Date.now()) / 86400000) : null;
              const label = d === null ? 'Бессрочно' : d < 0 ? `Просрочен ${Math.abs(d)} дн.` : d <= 30 ? `Через ${d} дн.` : `до ${new Date(lic.expiryDate).toLocaleDateString('ru')}`;
              return h('div', { key:lic.name, style: i < arr.length - 1 ? rowSt : lastRow },
                h('span', { style:{ flex:1, fontSize:13, color:'#222' } }, `🎖 ${lic.name}`),
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
              h('div', { style:{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.9fr', gap:8, padding:'4px 0 6px', borderBottom:`0.5px solid #ccc`, fontSize:10, color:'#aaa' } },
                h('span', null, 'Причина'), h('span', { style:{ textAlign:'center' } }, 'Кол-во'), h('span', { style:{ textAlign:'right' } }, 'Общее время')
              ),
              downtimeByReason.map(([reason, stat], i, arr) =>
                h('div', { key:reason, style:{ display:'grid', gridTemplateColumns:'2fr 0.7fr 0.9fr', gap:8, padding:'6px 0', borderBottom: i < arr.length - 1 ? '0.5px solid #ede9e2' : 'none', fontSize:12, alignItems:'center' } },
                  h('span', { style:{ color:'#222' } }, reason),
                  h('span', { style:{ textAlign:'center', color:'#666' } }, `${stat.count}×`),
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
              return h('div', { key:ev.id, style:{ padding:'8px 12px', background:'#f5f5f2', borderRadius:8, marginBottom: i < thanks.length - 1 ? 6 : 0, borderLeft:`2px solid ${GN}` } },
                h('div', { style:{ fontSize:11, color:'#888', marginBottom:3 } }, `от ${fromLabel} · ${ev.ts ? new Date(ev.ts).toLocaleDateString('ru') : ''}`),
                h('div', { style:{ fontSize:13, color:'#222' } }, ev.note || '—')
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
