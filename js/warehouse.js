// teploros · warehouse.js
// Автоматически извлечено из монолита

// ==================== DeliveryBoard ====================
const DeliveryBoard = memo(({ data, onUpdate, addToast, currentUserId }) => {
  const [filterStatus, setFilterStatus] = useState('pending'); // pending | all | confirmed
  const [confirmModal, setConfirmModal] = useState(null); // {delivery, partialQty}
  const [partialQty, setPartialQty] = useState('');
  const [confirmNote, setConfirmNote] = useState('');

  const deliveries = useMemo(() => {
    const all = data.materialDeliveries || [];
    if (filterStatus === 'all') return all;
    if (filterStatus === 'confirmed') return all.filter(d => d.status === 'confirmed');
    return all.filter(d => d.status === 'pending' || d.status === 'partial');
  }, [data.materialDeliveries, filterStatus]);

  const pendingCount = (data.materialDeliveries || []).filter(d => d.status === 'pending' || d.status === 'partial').length;

  const openConfirm = (delivery) => {
    setConfirmModal(delivery);
    setPartialQty(String(delivery.requiredQty));
    setConfirmNote('');
  };

  const handleConfirm = async (isPartial) => {
    if (!confirmModal) return;
    const qty = Number(partialQty);
    if (!qty || qty <= 0) { addToast('Укажите количество', 'error'); return; }

    const status = isPartial ? 'partial' : 'confirmed';
    const mat = data.materials.find(m => m.id === confirmModal.materialId);

    // Обновляем поставку
    const updDeliveries = (data.materialDeliveries || []).map(d =>
      d.id === confirmModal.id ? { ...d, status, deliveredQty: qty, confirmedAt: now(), confirmedBy: currentUserId, note: confirmNote } : d
    );

    // Пополняем остатки материала
    const updMaterials = (data.materials || []).map(m =>
      m.id === confirmModal.materialId ? { ...m, quantity: (m.quantity || 0) + qty } : m
    );

    // Добавляем событие прихода материала
    const event = {
      id: uid(), type: 'material_receive',
      materialId: confirmModal.materialId,
      orderId: confirmModal.orderId,
      deliveryId: confirmModal.id,
      qty, ts: now(),
      confirmedBy: currentUserId,
      note: confirmNote
    };

    const d = { ...data, materialDeliveries: updDeliveries, materials: updMaterials, events: [...data.events, event] };
    await DB.save(d); onUpdate(d);

    const label = isPartial ? `Частичная поставка: ${qty} ${confirmModal.unit}` : `Поставка подтверждена: ${qty} ${confirmModal.unit}`;
    addToast(`✓ ${label}`, 'success');
    setConfirmModal(null);
  };

  const printQR = (delivery) => {
    const mat = data.materials.find(m => m.id === delivery.materialId);
    const order = data.orders.find(o => o.id === delivery.orderId);
    const url = `${location.origin}${location.pathname}?receive=${delivery.id}`;
    const w = window.open('', '_blank', 'width=400,height=500');
    w.document.write(`<!DOCTYPE html><html><head><title>QR поставки</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head>
      <body style="font-family:sans-serif;padding:20px;text-align:center">
        <div style="border:2px solid #333;padding:16px;display:inline-block;border-radius:8px">
          <div style="font-size:11px;color:#888;margin-bottom:4px">ПОСТАВКА МАТЕРИАЛА</div>
          <div style="font-size:15px;font-weight:bold;margin-bottom:2px">${mat?.name || delivery.materialId}</div>
          <div style="font-size:12px;color:#666;margin-bottom:12px">Заказ: ${order?.number || delivery.orderId} · Этап: ${delivery.stageName}</div>
          <div style="font-size:12px;margin-bottom:12px">Требуется: <b>${delivery.requiredQty} ${delivery.unit}</b></div>
          <div id="qr" style="margin:0 auto 12px;width:180px"></div>
          <div style="font-size:9px;color:#aaa;word-break:break-all">${url}</div>
        </div>
        <br><button onclick="window.print()" style="margin-top:12px;padding:8px 24px;font-size:13px;border-radius:6px;border:none;background:#EF9F27;color:#412402;cursor:pointer">🖨 Печать</button>
        <script>new QRCode(document.getElementById("qr"),{text:"${url}",width:180,height:180,colorDark:"#000",colorLight:"#fff"});</script>
      </body></html>`);
    w.document.close();
  };

  return h('div', null,
    // Фильтр статусов
    h('div', { style: { ...S.card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 } },
      h('span', { style: { fontSize: 12, color: '#888' } }, 'Показать:'),
      [
        { id: 'pending', label: `⏳ Ожидаемые (${pendingCount})` },
        { id: 'confirmed', label: '✓ Подтверждённые' },
        { id: 'all', label: '📋 Все' }
      ].map(f => h('button', { key: f.id, style: filterStatus === f.id ? abtn({ fontSize: 12 }) : gbtn({ fontSize: 12 }), onClick: () => setFilterStatus(f.id) }, f.label))
    ),

    deliveries.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 32 } },
          filterStatus === 'pending'
            ? h('div', null, h('div', { style: { fontSize: 24, marginBottom: 8 } }, '✅'), 'Все поставки подтверждены')
            : 'Нет поставок'
        )
      : h('div', null,
          deliveries.map((del, idx) => {
            const mat = data.materials.find(m => m.id === del.materialId);
            const order = data.orders.find(o => o.id === del.orderId);
            const isPending = del.status === 'pending';
            const isPartial = del.status === 'partial';
            const isDone    = del.status === 'confirmed';
            const borderColor = isDone ? GN : isPartial ? AM : '#dedad3';

            return h('div', { key: del.id, className: 'op-card-anim', style: { ...S.card, borderLeft: `4px solid ${borderColor}`, marginBottom: 10, animationDelay: `${idx * 0.05}s`, transition: 'box-shadow 0.15s, transform 0.15s' }, onMouseEnter: e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }, onMouseLeave: e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 } },
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 3 } }, mat?.name || del.materialId),
                  h('div', { style: { fontSize: 12, color: '#888', marginBottom: 6 } },
                    `Заказ: `, h('span', { style: { color: AM2, fontWeight: 500 } }, order?.number || del.orderId),
                    ` · Этап: ${del.stageName}`
                  ),
                  h('div', { style: { display: 'flex', gap: 12, fontSize: 12 } },
                    h('span', null, `Нужно: `, h('b', null, `${del.requiredQty} ${del.unit}`)),
                    del.deliveredQty > 0 && h('span', { style: { color: isPartial ? AM2 : GN2 } }, `Поступило: `, h('b', null, `${del.deliveredQty} ${del.unit}`))
                  ),
                  del.confirmedAt && h('div', { style: { fontSize: 11, color: '#aaa', marginTop: 4 } },
                    `Подтверждено: ${new Date(del.confirmedAt).toLocaleString('ru')}`
                  ),
                  del.note && h('div', { style: { fontSize: 11, color: '#666', marginTop: 3, fontStyle: 'italic' } }, del.note)
                ),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 } },
                  h('span', { style: {
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 500, textAlign: 'center',
                    background: isDone ? GN3 : isPartial ? AM3 : '#f0ede8',
                    color: isDone ? GN2 : isPartial ? AM2 : '#888'
                  }}, isDone ? '✓ Поставлено' : isPartial ? '⚡ Частично' : '⏳ Ожидаем'),
                  !isDone && h('button', { style: abtn({ fontSize: 12 }), onClick: () => { navigator.vibrate?.([30]); openConfirm(del); } }, '📥 Подтвердить'),
                  h('button', { style: gbtn({ fontSize: 12 }), onClick: () => printQR(del) }, '🖨 QR-код')
                )
              )
            );
          })
        ),

    // Модал подтверждения поставки
    confirmModal && h('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }
    },
      h('div', { style: { background: '#faf9f6', borderRadius: 12, padding: 24, width: 'min(420px, calc(100vw - 32px))' } },
        h('div', { style: { fontSize: 16, fontWeight: 500, marginBottom: 4 } }, '📦 Подтвердить поставку'),
        h('div', { style: { fontSize: 13, color: '#888', marginBottom: 20 } },
          (data.materials.find(m => m.id === confirmModal.materialId))?.name,
          ` · Заказ `,
          (data.orders.find(o => o.id === confirmModal.orderId))?.number
        ),

        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
          h('div', null,
            h('label', { style: S.lbl }, 'Требуется'),
            h('div', { style: { ...S.inp, background: '#f5f5f2', color: '#888', cursor: 'default' } },
              `${confirmModal.requiredQty} ${confirmModal.unit}`
            )
          ),
          h('div', null,
            h('label', { style: S.lbl }, 'Поступило фактически'),
            h('input', {
              type: 'number', style: { ...S.inp, borderColor: AM },
              value: partialQty,
              onChange: e => setPartialQty(e.target.value),
              min: 0, max: confirmModal.requiredQty * 2,
              autoFocus: true
            })
          )
        ),

        h('div', { style: { marginBottom: 16 } },
          h('label', { style: S.lbl }, 'Примечание (накладная, поставщик)'),
          h('input', { type: 'text', style: S.inp, value: confirmNote, onChange: e => setConfirmNote(e.target.value), placeholder: 'Например: Накл. №123, ООО Металлснаб' })
        ),

        h('div', { style: { display: 'flex', gap: 8 } },
          Number(partialQty) < confirmModal.requiredQty && Number(partialQty) > 0 &&
            h('button', { style: { ...gbtn({ flex: 1 }), borderColor: AM, color: AM2 }, onClick: () => { navigator.vibrate?.([30]); handleConfirm(true); } },
              `⚡ Частично (${partialQty} ${confirmModal.unit})`
            ),
          Number(partialQty) >= confirmModal.requiredQty &&
            h('button', { style: { ...abtn({ flex: 1 }) }, onClick: () => { vibrateAction('finish'); handleConfirm(false); } },
              `✓ Подтвердить полностью`
            ),
          Number(partialQty) > 0 && Number(partialQty) < confirmModal.requiredQty &&
            h('button', { style: abtn({ flex: 0 }), onClick: () => handleConfirm(false) }, 'Всё равно закрыть'),
          h('button', { style: rbtn({ flex: 1 }), onClick: () => setConfirmModal(null) }, 'Отмена')
        )
      )
    )
  );
});


// ==================== MaterialImportModal ====================
// Нормализация строки для нечёткого поиска

// Нечёткое совпадение: 0..1
const fuzzyScore = (a, b) => {
  const na = normStr(a), nb = normStr(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  const common = ta.filter(t => tb.some(s => s.includes(t) || t.includes(s)));
  return common.length / Math.max(ta.length, tb.length, 1);
};

// Автоопределить колонку по заголовку
const detectCol = (headers, patterns) => {
  for (const h of headers) {
    const hn = normStr(h.toString());
    if (patterns.some(p => hn.includes(p))) return h;
  }
  return '';
};

// ── Детектор формата 1С ──────────────────────────────────────────
// Сканирует сырой массив строк, ищет строку с заголовками столбцов,
// возвращает нормализованные строки и реквизиты накладной (или null).
const detect1C = (arr) => {
  let headerRowIdx = -1;
  let nameCol = -1, qtyCol = -1, priceCol = -1, codeCol = -1;

  // Ищем строку-заголовок с «Товары»/«Наименование» + «Количество»
  for (let i = 0; i < Math.min(arr.length, 25); i++) {
    const row = arr[i];
    let hasGoods = false, hasQty = false;
    row.forEach((cell, j) => {
      const ct = normStr((cell || '').toString());
      if (ct.includes('товар') || ct.includes('наименов') || ct.includes('номенклат')) { nameCol = j; hasGoods = true; }
      if (ct === 'количество' || (ct.startsWith('кол') && ct.length < 14))             { qtyCol  = j; hasQty  = true; }
      if (ct === 'цена' || ct.includes('цена без'))                                     { if (priceCol < 0) priceCol = j; }
      if (ct === 'код' || ct.includes('артикул'))                                       { codeCol = j; }
    });
    if (hasGoods && hasQty) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) return null;

  // Ищем колонку единицы измерения: строковое значение между qty и price в первой строке данных
  let unitCol = -1;
  for (let i = headerRowIdx + 1; i < arr.length; i++) {
    const row = arr[i];
    const nm = (row[nameCol] || '').toString().trim();
    if (!nm || nm.toLowerCase().includes('итого') || nm.toLowerCase().includes('всего')) continue;
    const lo = Math.min(qtyCol, priceCol >= 0 ? priceCol : qtyCol + 10);
    const hi = Math.max(qtyCol, priceCol >= 0 ? priceCol : qtyCol + 10);
    for (let j = lo; j <= hi; j++) {
      if (j !== qtyCol && j !== priceCol && j !== nameCol && j !== codeCol) {
        const v = (row[j] || '').toString().trim();
        if (v && isNaN(Number(v)) && v.length <= 5) { unitCol = j; break; }
      }
    }
    break;
  }

  // Извлекаем реквизиты из шапки (строки до headerRowIdx)
  let invoiceNumber = '', supplier = '', date = new Date().toISOString().slice(0, 10);
  const ruMonths = { января:1,февраля:2,марта:3,апреля:4,мая:5,июня:6,июля:7,августа:8,сентября:9,октября:10,ноября:11,декабря:12 };
  for (let i = 0; i < headerRowIdx; i++) {
    const rowText = arr[i].map(c => (c || '').toString()).join(' ');
    const numM = rowText.match(/№\s*(\S+)/);
    if (numM && !invoiceNumber) invoiceNumber = numM[1].replace(/\s/g, '');
    const dateM = rowText.match(/от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
    if (dateM) {
      const m = ruMonths[dateM[2].toLowerCase()];
      if (m) date = `${dateM[3]}-${String(m).padStart(2,'0')}-${dateM[1].padStart(2,'0')}`;
    }
    if (rowText.toLowerCase().includes('поставщик')) {
      const orgM = rowText.match(/(ООО|ИП|АО|ПАО|ЗАО)\s*["«]?([^",\n]{2,40})["»]?/i);
      if (orgM && !supplier) supplier = orgM[0].trim();
    }
  }

  // Парсим строки данных
  const rows = [];
  for (let i = headerRowIdx + 1; i < arr.length; i++) {
    const row = arr[i];
    const name = (row[nameCol] || '').toString().trim();
    if (!name) continue;
    const nl = name.toLowerCase();
    if (nl.includes('итого') || nl.includes('всего') || nl.includes('сумма ндс') || nl.includes('в т.ч.')) continue;
    // Проверяем что строка содержит числовые данные (не подзаголовок)
    const qty = parseFloat((row[qtyCol] || '').toString().replace(',', '.')) || 0;
    if (qty === 0 && !name) continue;
    const price = priceCol >= 0 ? (parseFloat((row[priceCol] || '').toString().replace(',', '.')) || 0) : 0;
    const unit  = unitCol  >= 0 ? (row[unitCol]  || '').toString().trim() : 'шт';
    const code  = codeCol  >= 0 ? (row[codeCol]  || '').toString().trim() : '';
    rows.push({ 'Наименование': name, 'Количество': qty, 'Единица': unit, 'Цена': price, 'Код': code });
  }

  if (rows.length === 0) return null;
  return { rows, invoiceNumber, supplier, date };
};

const MaterialImportModal = memo(({ data, onClose, onUpdate, addToast, defaultMode = 'receipt' }) => {
  const [step, setStep]         = useState('upload');
  const [inputMethod, setInputMethod] = useState('file'); // file | paste | grid
  const [rawRows, setRawRows]   = useState([]);
  const [headers, setHeaders]   = useState([]);
  const [colMap, setColMap]     = useState({ name: '', qty: '', unit: '', price: '' });
  const [mode, setMode]         = useState(defaultMode);
  const [invoice, setInvoice]   = useState({ number: '', date: new Date().toISOString().slice(0, 10), supplier: '' });
  const [preview, setPreview]   = useState([]);
  const [invoiceError, setInvoiceError] = useState('');
  const [is1C, setIs1C]         = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Для grid-редактора
  const [gridRows, setGridRows] = useState([
    { name: '', qty: '', unit: 'шт', price: '' },
    { name: '', qty: '', unit: 'шт', price: '' },
    { name: '', qty: '', unit: 'шт', price: '' },
  ]);

  // ── Общий парсер массива строк (после получения данных любым методом) ──
  const processArr = useCallback((arr) => {
    if (arr.length < 1) { addToast('Нет данных', 'error'); return; }
    const c1 = detect1C(arr);
    if (c1) {
      setHeaders(['Наименование', 'Количество', 'Единица', 'Цена', 'Код']);
      setRawRows(c1.rows);
      setColMap({ name: 'Наименование', qty: 'Количество', unit: 'Единица', price: 'Цена' });
      setInvoice({ number: c1.invoiceNumber || '', date: c1.date || new Date().toISOString().slice(0, 10), supplier: c1.supplier || '' });
      setIs1C(true); setStep('map'); return;
    }
    // Стандартный формат
    const hdrs = arr[0].map(h => h.toString().trim()).filter(Boolean);
    const rows = arr.slice(1).filter(r => r.some(c => c !== '')).map(r => {
      const obj = {}; hdrs.forEach((h, i) => { obj[h] = r[i] ?? ''; }); return obj;
    });
    setHeaders(hdrs); setRawRows(rows);
    setColMap({
      name:  detectCol(hdrs, ['наим','назв','матер','name','товар','номенкл']),
      qty:   detectCol(hdrs, ['кол','qty','количес','остат','приход']),
      unit:  detectCol(hdrs, ['ед','unit','мера','измер']),
      price: detectCol(hdrs, ['цен','price','стоим']),
    });
    setIs1C(false); setStep('map');
  }, [addToast]);

  // ── Метод 1: файл (+ drag & drop) ──
  const processFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        processArr(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }));
      } catch(ex) { addToast('Ошибка чтения: ' + ex.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  }, [processArr, addToast]);

  const handleFile = useCallback((e) => { processFile(e.target.files[0]); e.target.value = ''; }, [processFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { addToast('Поддерживаются только .xlsx, .xls, .csv', 'error'); return; }
    processFile(file);
  }, [processFile, addToast]);

  // ── Метод 2: вставка из буфера (Ctrl+V / Cmd+V) ──
  // Excel копирует ячейки как TSV (tab-separated)
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text') || '';
    if (!text.trim()) { addToast('Буфер обмена пуст', 'error'); return; }
    const arr = text.trim().split('\n').map(line =>
      line.split('\t').map(cell => cell.trim().replace(/^"|"$/g, ''))
    ).filter(row => row.some(c => c));
    if (arr.length < 1) { addToast('Не удалось распознать данные', 'error'); return; }
    // Если первая строка похожа на заголовки (содержит нечисловые значения)
    const firstRowHasText = arr[0].some(c => c && isNaN(Number(c.replace(',', '.'))));
    if (!firstRowHasText && arr.length >= 1) {
      // Нет заголовков — добавляем автоматические
      arr.unshift(['Наименование', 'Количество', 'Единица', 'Цена']);
    }
    processArr(arr);
  }, [processArr, addToast]);

  // ── Метод 3: grid-редактор ──
  const updateGridRow = useCallback((i, field, val) => {
    setGridRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }, []);
  const addGridRow = useCallback(() => {
    setGridRows(prev => [...prev, { name: '', qty: '', unit: 'шт', price: '' }]);
  }, []);
  const removeGridRow = useCallback((i) => {
    setGridRows(prev => prev.filter((_, idx) => idx !== i));
  }, []);
  const submitGrid = useCallback(() => {
    const valid = gridRows.filter(r => r.name.trim() && r.qty);
    if (valid.length === 0) { addToast('Заполните хотя бы одну строку', 'error'); return; }
    const hdrs = ['Наименование', 'Количество', 'Единица', 'Цена'];
    const arr = [hdrs, ...valid.map(r => [r.name.trim(), r.qty, r.unit || 'шт', r.price || ''])];
    processArr(arr);
  }, [gridRows, processArr, addToast]);

  // ── buildPreview ──
  const buildPreview = useCallback(() => {
    if (!colMap.name) { addToast('Укажите колонку с названием', 'error'); return; }
    const rows = rawRows.map(r => {
      const name = (r[colMap.name] || '').toString().trim(); if (!name) return null;
      const qty   = parseFloat((r[colMap.qty]   || '').toString().replace(',', '.')) || 0;
      const unit  = colMap.unit  ? ((r[colMap.unit]  || '').toString().trim() || 'шт') : 'шт';
      const price = colMap.price ? (parseFloat((r[colMap.price] || '').toString().replace(',', '.')) || 0) : 0;
      let match = data.materials.find(m => normStr(m.name) === normStr(name));
      let matchType = 'exact';
      if (!match) {
        let best = 0;
        data.materials.forEach(m => { const sc = fuzzyScore(name, m.name); if (sc > best && sc >= 0.7) { best = sc; match = m; } });
        matchType = match ? 'fuzzy' : 'new';
      }
      return { name, qty, unit, price, match, matchType };
    }).filter(Boolean);
    setPreview(rows); setStep('preview');
  }, [rawRows, colMap, data.materials, addToast]);

  // ── handleSave ──
  const handleSave = useCallback(async () => {
    if (mode === 'receipt' && !invoice.number.trim()) { setInvoiceError('Введите номер накладной'); return; }
    setInvoiceError('');
    const ts = now(), batchId = uid();
    let materials = [...data.materials];
    const newEvents = [...data.events];
    preview.forEach(row => {
      const qty = row.qty;
      if (mode === 'receipt') {
        const existing = row.match && row.matchType !== 'new' ? row.match : null;
        if (existing) {
          materials = materials.map(m => m.id === existing.id ? { ...m, quantity: m.quantity + qty, ...(row.price ? { unitCost: row.price } : {}) } : m);
          newEvents.push({ id: uid(), type: 'material_receive', materialId: existing.id, qty, ts, invoiceNumber: invoice.number.trim(), invoiceDate: invoice.date, supplier: invoice.supplier.trim(), batchId, unit: existing.unit });
        } else {
          const nm = { id: uid(), name: row.name, unit: row.unit, quantity: qty, unitCost: row.price || 0, minStock: 0, batch: '' };
          materials.push(nm);
          newEvents.push({ id: uid(), type: 'material_receive', materialId: nm.id, qty, ts, invoiceNumber: invoice.number.trim(), invoiceDate: invoice.date, supplier: invoice.supplier.trim(), batchId, unit: row.unit });
        }
      } else {
        const existing = row.match && row.matchType !== 'new' ? row.match : null;
        if (existing) {
          materials = materials.map(m => m.id === existing.id ? { ...m, quantity: qty, ...(row.price ? { unitCost: row.price } : {}) } : m);
        } else {
          materials.push({ id: uid(), name: row.name, unit: row.unit, quantity: qty, unitCost: row.price || 0, minStock: 0, batch: '' });
        }
      }
    });
    const d = { ...data, materials, events: newEvents };
    await DB.save(d); onUpdate(d);
    const nc = preview.filter(r => r.matchType === 'new').length;
    const uc = preview.filter(r => r.matchType !== 'new').length;
    addToast(`${mode === 'receipt' ? 'Приход' : 'Обновление'}: ${uc} обновлено, ${nc} новых`, 'success');
    onClose();
  }, [data, preview, mode, invoice, onUpdate, addToast, onClose]);

  const rowStyle = (t) => ({ exact: { bg: GN3, color: GN2, label: '✓ Точно' }, fuzzy: { bg: AM3, color: AM2, label: '~ Похоже' }, new: { bg: '#EEF2FF', color: '#3730A3', label: '+ Новое' } }[t] || {});

  // ── Рендер ──
  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, overflowY: 'auto', padding: '16px 8px' }, onClick: e => e.target === e.currentTarget && onClose() },
    h('div', { style: { background: '#fff', borderRadius: 14, width: 'min(700px,100%)', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' } },

      // Шапка
      h('div', { style: { padding: '18px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('div', null,
          h('div', { style: { fontSize: 16, fontWeight: 600 } }, '📤 Импорт материалов'),
          h('div', { style: { fontSize: 11, color: '#888', marginTop: 2 } },
            step === 'upload' ? 'Шаг 1 из 3 — Выберите способ ввода' :
            step === 'map'    ? 'Шаг 2 из 3 — Настройте колонки' :
                                'Шаг 3 из 3 — Проверьте данные и подтвердите'
          )
        ),
        h('button', { onClick: onClose, style: { background: 'none', border: 'none', fontSize: 22, color: '#aaa', cursor: 'pointer' } }, '×')
      ),

      h('div', { style: { padding: '16px 20px 20px' } },

        // ── Шаг 1: выбор метода ──
        step === 'upload' && h('div', null,

          // Переключатель методов
          h('div', { style: { display: 'flex', gap: 6, marginBottom: 16 } },
            [
              { id: 'file',  icon: '📂', label: 'Файл Excel / 1С' },
              { id: 'paste', icon: '📋', label: 'Вставить Ctrl+V' },
              { id: 'grid',  icon: '✏️', label: 'Ввести вручную' },
            ].map(m => h('button', { key: m.id,
              style: inputMethod === m.id
                ? { ...abtn({ flex: 1, padding: '10px 8px', fontSize: 12 }), textAlign: 'center' }
                : { ...gbtn({ flex: 1, padding: '10px 8px', fontSize: 12 }), textAlign: 'center' },
              onClick: () => setInputMethod(m.id)
            },
              h('div', { style: { fontSize: 18, marginBottom: 3 } }, m.icon),
              m.label
            ))
          ),

          // ── Метод: Файл ──
          inputMethod === 'file' && h('div', null,
            h('label', {
              style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${dragOver ? AM4 : AM}`, borderRadius: 12, padding: '36px 20px', cursor: 'pointer', background: dragOver ? AM3 : '#fffbf0', gap: 10, transition: 'all .15s' },
              onDragOver: e => { e.preventDefault(); setDragOver(true); },
              onDragLeave: () => setDragOver(false),
              onDrop: handleDrop
            },
              h('div', { style: { fontSize: 32 } }, dragOver ? '⬇️' : '📂'),
              h('div', { style: { fontSize: 14, fontWeight: 500, color: AM2 } }, dragOver ? 'Отпустите файл' : 'Нажмите или перетащите файл'),
              h('div', { style: { fontSize: 11, color: '#888', textAlign: 'center' } }, '.xlsx, .xls, .csv · Накладные из 1С определяются автоматически'),
              h('input', { type: 'file', accept: '.xlsx,.xls,.csv', style: { display: 'none' }, onChange: handleFile })
            )
          ),

          // ── Метод: Вставка ──
          inputMethod === 'paste' && h('div', null,
            h('div', { style: { fontSize: 12, color: '#666', marginBottom: 10, padding: '10px 12px', background: '#f0f9ff', borderRadius: 8, borderLeft: `3px solid ${BL}`, lineHeight: 1.6 } },
              h('div', { style: { fontWeight: 500, marginBottom: 3 } }, '1. Выделите ячейки в Excel или Google Sheets'),
              h('div', null, '2. Скопируйте (Ctrl+C / Cmd+C)'),
              h('div', null, '3. Кликните в поле ниже и нажмите Ctrl+V')
            ),
            h('div', {
              onPaste: handlePaste,
              tabIndex: 0,
              style: { border: `2px dashed ${BL}`, borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'text', background: '#f8fbff', outline: 'none', fontSize: 14, color: '#888', lineHeight: 1.7 },
            },
              h('div', { style: { fontSize: 28, marginBottom: 8 } }, '📋'),
              h('div', { style: { fontWeight: 500, color: '#555' } }, 'Кликните сюда и нажмите Ctrl+V'),
              h('div', { style: { fontSize: 11, marginTop: 4 } }, 'Заголовки — необязательны. Достаточно двух столбцов: название и количество.')
            )
          ),

          // ── Метод: Grid-редактор ──
          inputMethod === 'grid' && h('div', null,
            h('div', { style: { fontSize: 12, color: '#666', marginBottom: 10 } }, 'Введите данные вручную. Поля «Ед.» и «Цена» — необязательны.'),
            h('div', { className: 'table-responsive' },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
                h('thead', null, h('tr', null,
                  ['Наименование *', 'Кол-во *', 'Ед.', 'Цена ₽', ''].map((t, i) =>
                    h('th', { key: i, style: { ...S.th, background: '#f8f8f5' } }, t)
                  )
                )),
                h('tbody', null,
                  gridRows.map((row, i) => h('tr', { key: i },
                    h('td', { style: { padding: '4px 4px' } },
                      h('input', { style: { ...S.inp, fontSize: 12 }, placeholder: 'Название материала', value: row.name, onChange: e => updateGridRow(i, 'name', e.target.value) })
                    ),
                    h('td', { style: { padding: '4px 4px', width: 80 } },
                      h('input', { type: 'number', step: '0.001', style: { ...S.inp, fontSize: 12 }, placeholder: '0', value: row.qty, onChange: e => updateGridRow(i, 'qty', e.target.value) })
                    ),
                    h('td', { style: { padding: '4px 4px', width: 70 } },
                      h('input', { style: { ...S.inp, fontSize: 12 }, placeholder: 'шт', value: row.unit, onChange: e => updateGridRow(i, 'unit', e.target.value) })
                    ),
                    h('td', { style: { padding: '4px 4px', width: 90 } },
                      h('input', { type: 'number', style: { ...S.inp, fontSize: 12 }, placeholder: '0', value: row.price, onChange: e => updateGridRow(i, 'price', e.target.value) })
                    ),
                    h('td', { style: { padding: '4px 4px', width: 32, textAlign: 'center' } },
                      gridRows.length > 1 && h('button', { style: { background: 'none', border: 'none', color: RD, cursor: 'pointer', fontSize: 16, padding: 0 }, onClick: () => removeGridRow(i) }, '×')
                    )
                  ))
                )
              )
            ),
            h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
              h('button', { style: gbtn({ fontSize: 11 }), onClick: addGridRow }, '+ Добавить строку'),
              h('button', { style: abtn({ marginLeft: 'auto', fontSize: 12, padding: '8px 20px' }), onClick: submitGrid }, 'Далее →')
            )
          )
        ),

        // ── Шаг 2: маппинг ──
        step === 'map' && h('div', null,
          is1C && h('div', { style: { padding: '10px 14px', background: GN3, border: `1px solid ${GN}`, borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 18 } }, '✅'),
            h('div', null,
              h('div', { style: { fontSize: 13, fontWeight: 600, color: GN2 } }, 'Формат 1С определён автоматически'),
              h('div', { style: { fontSize: 11, color: GN2, opacity: 0.8 } }, `Найдено ${rawRows.length} позиций. Реквизиты накладной заполнены из файла.`)
            )
          ),
          !is1C && h('div', { style: { fontSize: 12, color: '#666', marginBottom: 14, padding: '10px 12px', background: '#f0f9ff', borderRadius: 8, borderLeft: `3px solid ${BL}` } },
            `Найдено ${rawRows.length} строк, ${headers.length} колонок. Проверьте автоопределение.`
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
            [
              { key: 'name',  label: '* Название материала', required: true },
              { key: 'qty',   label: '* Количество',          required: true },
              { key: 'unit',  label: 'Единица измерения',     required: false },
              { key: 'price', label: 'Цена за единицу (₽)',   required: false },
            ].map(f => h('div', { key: f.key },
              h('label', { style: S.lbl }, f.label),
              h('select', { style: { ...S.inp, borderColor: f.required && !colMap[f.key] ? AM : undefined }, value: colMap[f.key], onChange: e => setColMap(p => ({ ...p, [f.key]: e.target.value })) },
                h('option', { value: '' }, f.required ? '— выберите —' : '— не использовать —'),
                headers.map(h2 => h('option', { key: h2, value: h2 }, h2))
              )
            ))
          ),
          rawRows.length > 0 && h('div', null,
            h('div', { style: S.sec }, `Первые строки (${Math.min(rawRows.length, 4)} из ${rawRows.length})`),
            h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
              h('thead', null, h('tr', null, headers.slice(0, 5).map(h2 => h('th', { key: h2, style: { ...S.th, background: colMap.name === h2 ? AM3 : colMap.qty === h2 ? GN3 : '#f8f8f5' } }, h2)))),
              h('tbody', null, rawRows.slice(0, 4).map((r, i) => h('tr', { key: i },
                headers.slice(0, 5).map(h2 => h('td', { key: h2, style: { ...S.td, background: colMap.name === h2 ? '#fffbf0' : colMap.qty === h2 ? '#f0fff8' : 'transparent' } },
                  (r[h2] ?? '').toString()))
              )))
            ))
          ),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
            h('button', { style: gbtn({ flex: 1 }), onClick: () => { setStep('upload'); setIs1C(false); } }, '← Назад'),
            h('button', { style: abtn({ flex: 2 }), onClick: buildPreview }, 'Далее: проверить данные →')
          )
        ),

        // ── Шаг 3: превью + режим ──
        step === 'preview' && h('div', null,
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
            h('button', { style: mode === 'receipt' ? { ...abtn({ flex: 1, padding: '10px' }), textAlign: 'left' } : { ...gbtn({ flex: 1, padding: '10px' }), textAlign: 'left' }, onClick: () => setMode('receipt') },
              h('div', { style: { fontWeight: 600, marginBottom: 2 } }, '📥 Приход по накладной'),
              h('div', { style: { fontSize: 11, opacity: 0.75 } }, 'Количество прибавится к остатку')
            ),
            h('button', { style: mode === 'update' ? { ...abtn({ flex: 1, padding: '10px' }), textAlign: 'left' } : { ...gbtn({ flex: 1, padding: '10px' }), textAlign: 'left' }, onClick: () => setMode('update') },
              h('div', { style: { fontWeight: 600, marginBottom: 2 } }, '🔄 Обновить справочник'),
              h('div', { style: { fontSize: 11, opacity: 0.75 } }, 'Остаток перезапишется')
            )
          ),
          mode === 'receipt' && h('div', { style: { padding: '12px 14px', background: '#f0f9ff', borderRadius: 8, marginBottom: 14 } },
            h('div', { style: S.sec }, 'Реквизиты накладной'),
            is1C && invoice.number && h('div', { style: { fontSize: 11, color: GN2, marginBottom: 8 } }, `✅ Автозаполнено из файла: накладная №${invoice.number}`),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              h('div', { style: { flex: 2, minWidth: 140 } },
                h('label', { style: S.lbl }, '* Номер накладной'),
                h('input', { style: { ...S.inp, borderColor: invoiceError ? RD : undefined }, placeholder: 'ТН-2025-001', value: invoice.number, onChange: e => { setInvoice(p => ({ ...p, number: e.target.value })); setInvoiceError(''); } }),
                invoiceError && h('div', { style: { fontSize: 11, color: RD, marginTop: 2 } }, invoiceError)
              ),
              h('div', { style: { flex: 1, minWidth: 120 } },
                h('label', { style: S.lbl }, 'Дата'),
                h('input', { type: 'date', style: S.inp, value: invoice.date, onChange: e => setInvoice(p => ({ ...p, date: e.target.value })) })
              ),
              h('div', { style: { flex: 2, minWidth: 140 } },
                h('label', { style: S.lbl }, 'Поставщик'),
                h('input', { style: S.inp, placeholder: 'Название поставщика', value: invoice.supplier, onChange: e => setInvoice(p => ({ ...p, supplier: e.target.value })) })
              )
            )
          ),
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
            [
              { label: '✓ Найдено точно',    count: preview.filter(r => r.matchType === 'exact').length, bg: GN3,       cl: GN2 },
              { label: '~ Похожее название', count: preview.filter(r => r.matchType === 'fuzzy').length, bg: AM3,       cl: AM2 },
              { label: '+ Новые позиции',    count: preview.filter(r => r.matchType === 'new').length,   bg: '#EEF2FF', cl: '#3730A3' },
            ].map(s => h('div', { key: s.label, style: { flex: 1, padding: '8px 10px', borderRadius: 8, background: s.bg, textAlign: 'center' } },
              h('div', { style: { fontSize: 18, fontWeight: 600, color: s.cl } }, s.count),
              h('div', { style: { fontSize: 10, color: s.cl, opacity: 0.8 } }, s.label)
            ))
          ),
          h('div', { className: 'table-responsive', style: { maxHeight: 260, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 8 } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null, h('tr', null,
                ['Из файла', 'Сопоставлен с', 'Тип', mode === 'receipt' ? 'Приход' : 'Остаток станет', 'Цена'].map((t, i) =>
                  h('th', { key: i, style: { ...S.th, position: 'sticky', top: 0, background: '#f8f8f5' } }, t)
                )
              )),
              h('tbody', null, preview.map((row, i) => {
                const rs = rowStyle(row.matchType);
                return h('tr', { key: i, style: { background: i % 2 === 0 ? 'transparent' : '#fafafa' } },
                  h('td', { style: S.td }, row.name, row.matchType === 'fuzzy' && h('div', { style: { fontSize: 10, color: AM2, marginTop: 1 } }, '⚠ проверьте совпадение')),
                  h('td', { style: S.td }, row.matchType === 'new' ? h('span', { style: { color: '#888', fontSize: 11 } }, '— создать новую —') : row.match.name),
                  h('td', { style: S.td }, h('span', { style: { padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 500, background: rs.bg, color: rs.cl } }, rs.label)),
                  h('td', { style: { ...S.td, fontFamily: 'monospace', fontWeight: 500 } },
                    mode === 'receipt'
                      ? (row.match && row.matchType !== 'new' ? `${row.match.quantity} + ${row.qty} = ${row.match.quantity + row.qty}` : `0 + ${row.qty} = ${row.qty}`)
                      : row.qty
                  ),
                  h('td', { style: { ...S.td, color: '#888' } }, row.price ? `${row.price}₽` : '—')
                );
              }))
            )
          ),
          h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
            h('button', { style: gbtn({ flex: 1 }), onClick: () => setStep('map') }, '← Назад'),
            h('button', { style: { ...abtn({ flex: 2, padding: '12px', fontSize: 14 }), background: GN, color: '#fff' }, onClick: handleSave },
              mode === 'receipt' ? `✓ Провести приход (${preview.length} позиций)` : `✓ Обновить справочник (${preview.length} позиций)`
            )
          )
        )
      )
    )
  );
});


// ==================== WarehouseScreen (Склад) ====================
const WarehouseScreen = memo(({ data, onUpdate, addToast }) => {
  const [tab, setTab] = useState('stock');
  const [receiveForm, setReceiveForm] = useState({ materialId: '', qty: '', batch: '' });
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState('receipt');

  const openImport = useCallback((mode = 'receipt') => {
    setImportMode(mode);
    setShowImport(true);
  }, []);

  // Заявки на материалы (из чата)
  const materialRequests = useMemo(() => {
    return data.events.filter(e => e.type === 'chat_alert' && e.alertType === 'need_material' && !e.fulfilled)
      .sort((a, b) => b.ts - a.ts);
  }, [data.events]);

  // Критические остатки
  const criticalMaterials = useMemo(() => data.materials.filter(m => m.minStock && m.quantity <= m.minStock), [data.materials]);

  // История движения
  const movements = useMemo(() => {
    const list = [];
    // Списания
    (data.materialConsumptions || []).forEach(mc => {
      const mat = data.materials.find(m => m.id === mc.materialId);
      const op = data.ops.find(o => o.id === mc.opId);
      const order = op ? data.orders.find(o => o.id === op.orderId) : null;
      list.push({ ts: mc.ts, type: 'out', materialName: mat?.name || '?', qty: mc.qty, unit: mat?.unit || '', context: order ? `${order.number} → ${op?.name}` : '—' });
    });
    // Поступления
    data.events.filter(e => e.type === 'material_receive').forEach(e => {
      const mat = data.materials.find(m => m.id === e.materialId);
      const ctx = [e.invoiceNumber ? `Накл. ${e.invoiceNumber}` : null, e.supplier || null, e.invoiceDate || null, e.batch ? `Партия: ${e.batch}` : null].filter(Boolean).join(' · ') || '—';
      list.push({ ts: e.ts, type: 'in', materialName: mat?.name || '?', qty: e.qty, unit: mat?.unit || e.unit || '', context: ctx });
    });
    return list.sort((a, b) => b.ts - a.ts).slice(0, 50);
  }, [data.materialConsumptions, data.events, data.materials, data.ops, data.orders]);

  // Приёмка материала
  const receiveMaterial = useCallback(async () => {
    if (!receiveForm.materialId || !receiveForm.qty || Number(receiveForm.qty) <= 0) { addToast('Укажите материал и количество', 'error'); return; }
    const qty = Number(receiveForm.qty);
    const updatedMaterials = data.materials.map(m => m.id === receiveForm.materialId ? { ...m, quantity: m.quantity + qty, batch: receiveForm.batch || m.batch } : m);
    const event = { id: uid(), type: 'material_receive', materialId: receiveForm.materialId, qty, batch: receiveForm.batch, ts: now() };
    const d = { ...data, materials: updatedMaterials, events: [...data.events, event] };
    await DB.save(d); onUpdate(d);
    const mat = data.materials.find(m => m.id === receiveForm.materialId);
    setReceiveForm({ materialId: '', qty: '', batch: '' });
    addToast(`Принято: ${mat?.name} +${qty} ${mat?.unit}`, 'success');
  }, [data, receiveForm, onUpdate, addToast]);

  // Выдача по заявке
  const fulfillRequest = useCallback(async (eventId) => {
    const d = { ...data, events: data.events.map(e => e.id === eventId ? { ...e, fulfilled: true, fulfilledAt: now() } : e) };
    await DB.save(d); onUpdate(d); addToast('Заявка выполнена', 'success');
  }, [data, onUpdate, addToast]);

  const totalValue = data.materials.reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0);

  return h('div', { style: { maxWidth: 800, margin: '0 auto', padding: '0 0 24px' } },
    h(SectionAnalytics, { section: 'warehouse', data }),
    showImport && h(MaterialImportModal, { data, onClose: () => setShowImport(false), onUpdate, addToast, defaultMode: importMode }),
    // Вкладки
    h(TabBar, { tabs: [['deliveries', `🚚 Поставки (${(data.materialDeliveries||[]).filter(d=>d.status==='pending'||d.status==='partial').length})`], ['stock', '📦 Остатки'], ['requests', `🔔 Заявки (${materialRequests.length})`], ['receive', '📥 Приёмка'], ['history', '📋 Движение'], ['materials', '🗂 Справочник'], ['bom', '📋 Спецификации']], tab, setTab }),

    // Заявки (уведомления)
    materialRequests.length > 0 && tab !== 'requests' && h('div', { role: 'alert', style: { padding: '8px 12px', background: AM3, border: `0.5px solid ${AM}`, borderRadius: 8, marginBottom: 12, fontSize: 12, cursor: 'pointer' }, onClick: () => setTab('requests') },
      h('span', { style: { fontWeight: 500, color: AM2 } }, `🔔 ${materialRequests.length} новых заявок на материалы`)
    ),

    // Остатки
    tab === 'deliveries' && h(DeliveryBoard, { data, onUpdate, addToast, currentUserId }),

    tab === 'stock' && h('div', null,
      // Сводка
      h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 10, marginBottom: 12 } },
        h(MC, { v: data.materials.length, l: 'Позиций' }),
        h(MC, { v: criticalMaterials.length, l: 'Критич.', c: criticalMaterials.length > 0 ? RD : GN }),
        h(MC, { v: `${totalValue.toLocaleString()}₽`, l: 'Стоимость', c: AM, fs: 20 })
      ),
      // Критические
      criticalMaterials.length > 0 && h('div', { role: 'alert', style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12, padding: 10 } },
        h('div', { style: { fontSize: 10, color: RD, fontWeight: 500, textTransform: 'uppercase', marginBottom: 4 } }, '⚠ Критические остатки'),
        criticalMaterials.map(m => h('div', { key: m.id, style: { fontSize: 12, color: RD2 } }, `${m.name}: ${m.quantity} ${m.unit} (мин: ${m.minStock})`))
      ),
      // Импорт/Экспорт
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
        h('button', { style: abtn({ fontSize: 12 }), onClick: () => openImport('update') }, '📤 Импорт Excel'),
        h('button', { style: gbtn({ fontSize: 12 }), onClick: () => {
          const ws = XLSX.utils.json_to_sheet(data.materials.map(m => ({ 'Название': m.name, 'Ед.': m.unit, 'Остаток': m.quantity, 'Мин.': m.minStock || '', 'Цена': m.unitCost || '', 'Стоимость': m.quantity * (m.unitCost || 0) })));
          const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Остатки');
          XLSX.writeFile(wb, `stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
        }}, '📥 Экспорт Excel')
      ),
      // Таблица
      data.materials.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888' } }, 'Нет материалов') :
        h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Материал', 'Остаток', 'Зарезерв.', 'Свободно', 'Мин.', 'Цена', 'Стоимость'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, [...data.materials].sort((a, b) => {
            const aCrit = a.minStock && a.quantity <= a.minStock;
            const bCrit = b.minStock && b.quantity <= b.minStock;
            if (aCrit && !bCrit) return -1; if (!aCrit && bCrit) return 1;
            return a.name.localeCompare(b.name);
          }).map(m => {
            const reserved = (data.materialReservations || []).filter(r => r.materialId === m.id).reduce((s, r) => s + r.qty, 0);
            const free = Math.max(0, m.quantity - reserved);
            const crit = m.minStock && free <= m.minStock;
            return h('tr', { key: m.id, style: { background: crit ? RD3 : 'transparent' } },
              h('td', { style: { ...S.td, fontWeight: crit ? 500 : 400 } }, `${m.name} (${m.unit})`),
              h('td', { style: { ...S.td, textAlign: 'center' } }, m.quantity),
              h('td', { style: { ...S.td, textAlign: 'center', color: reserved > 0 ? AM2 : '#888' } }, reserved > 0 ? reserved : '—'),
              h('td', { style: { ...S.td, color: crit ? RD : free > 0 ? GN : '#888', fontWeight: 500, textAlign: 'center' } }, free),
              h('td', { style: { ...S.td, textAlign: 'center', color: '#888' } }, m.minStock || '—'),
              h('td', { style: { ...S.td, textAlign: 'center' } }, m.unitCost ? `${m.unitCost}₽` : '—'),
              h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'right' } }, m.unitCost ? `${(m.quantity * m.unitCost).toLocaleString()}₽` : '—')
            );
          }))
        )))
    ),

    // Заявки
    tab === 'requests' && h('div', null,
      materialRequests.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 24 } }, 'Нет открытых заявок') :
        materialRequests.map(req => h('div', { key: req.id, style: { ...S.card, padding: 12, borderLeft: `4px solid ${AM}` } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('div', null,
              h('div', { style: { fontSize: 13, fontWeight: 500 } }, req.senderName),
              h('div', { style: { fontSize: 12, color: '#666' } }, req.text),
              req.opName && h('div', { style: { fontSize: 11, color: AM } }, `${req.orderNumber || ''} → ${req.opName}`),
              h('div', { style: { fontSize: 10, color: '#888' } }, new Date(req.ts).toLocaleString())
            ),
            h('button', { style: abtn({ fontSize: 12, padding: '8px 16px' }), onClick: () => fulfillRequest(req.id) }, '✓ Выдано')
          )
        ))
    ),

    // Приёмка
    tab === 'receive' && h('div', null,
      // Импорт накладной
      h('div', { style: { ...S.card, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 500, marginBottom: 2 } }, '📥 Импорт из накладной'),
          h('div', { style: { fontSize: 11, color: '#888' } }, 'Загрузите Excel-файл или накладную из 1С — данные определятся автоматически')
        ),
        h('button', { style: abtn({ fontSize: 13, padding: '10px 20px', whiteSpace: 'nowrap' }), onClick: () => openImport('receipt') }, '📤 Загрузить накладную')
      ),
      // Ручная приёмка
      h('div', { style: S.card },
      h('div', { style: S.sec }, 'Приёмка вручную'),
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('div', { style: { flex: 2, minWidth: 150 } },
          h('select', { style: { ...S.inp, width: '100%' }, value: receiveForm.materialId, onChange: e => setReceiveForm(p => ({ ...p, materialId: e.target.value })) },
            h('option', { value: '' }, '— выберите материал —'),
            data.materials.map(m => h('option', { key: m.id, value: m.id }, `${m.name} (${m.quantity} ${m.unit})`))
          )
        ),
        h('div', { style: { flex: 1, minWidth: 80 } }, h('input', { type: 'number', step: '0.1', style: { ...S.inp, width: '100%' }, placeholder: 'Кол-во', value: receiveForm.qty, onChange: e => setReceiveForm(p => ({ ...p, qty: e.target.value })) })),
        h('div', { style: { flex: 1, minWidth: 100 } }, h('input', { style: { ...S.inp, width: '100%' }, placeholder: 'Партия', value: receiveForm.batch, onChange: e => setReceiveForm(p => ({ ...p, batch: e.target.value })) })),
        h('button', { style: abtn({ padding: '10px 20px' }), onClick: receiveMaterial }, '📥 Принять')
      )
      ) // закрытие S.card ручной приёмки
    ), // закрытие receive tab div

    // Движение
    tab === 'history' && h('div', null,
      movements.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888' } }, 'Нет движений') :
        h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Дата', 'Тип', 'Материал', 'Кол-во', 'Контекст'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, movements.map((m, i) => h('tr', { key: i },
            h('td', { style: { ...S.td, fontSize: 11 } }, new Date(m.ts).toLocaleString()),
            h('td', { style: S.td }, h('span', { style: { padding: '2px 8px', fontSize: 10, borderRadius: 6, background: m.type === 'in' ? GN3 : RD3, color: m.type === 'in' ? GN2 : RD2 } }, m.type === 'in' ? '📥 Приход' : '📤 Расход')),
            h('td', { style: S.td }, m.materialName),
            h('td', { style: { ...S.td, fontWeight: 500, color: m.type === 'in' ? GN : RD } }, `${m.type === 'in' ? '+' : '-'}${m.qty} ${m.unit}`),
            h('td', { style: { ...S.td, fontSize: 11, color: '#888' } }, m.context)
          )))
        )))
    ),
    tab === 'materials' && h(MasterMaterials, { data, onUpdate, addToast }),
    tab === 'bom'       && h(MasterBOM,       { data, onUpdate, addToast })
  );
});
