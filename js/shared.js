// teploros · shared.js
// Общие компоненты используемые несколькими модулями

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
    h('div', { style: { background: '#fff', borderRadius: 12, padding: 20, width: 'min(380px, calc(100vw - 32px))', maxHeight: '70vh', overflowY: 'auto' } },
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
const generateFullPassport = (order, data) => {
  const ops = data.ops.filter(op => op.orderId === order.id && !op.archived);
  const cost = calcOrderCost(order, data);
  const docDefinition = {
    content: [
      { text: 'ПАСПОРТ ИЗДЕЛИЯ', style: 'header', alignment: 'center' },
      { text: `Заказ №${order.number}`, style: 'subheader', alignment: 'center', margin: [0, 0, 0, 20] },
      { columns: [
        { width: '*', text: [{ text: 'Изделие: ', bold: true }, order.product] },
        { width: '*', text: [{ text: 'Количество: ', bold: true }, String(order.qty)] }
      ], margin: [0, 0, 0, 8] },
      { columns: [
        { width: '*', text: [{ text: 'Дата создания: ', bold: true }, order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'] },
        { width: '*', text: [{ text: 'Дата отгрузки: ', bold: true }, order.deadline || '—'] }
      ], margin: [0, 0, 0, 8] },
      { columns: [
        { width: '*', text: [{ text: 'Приоритет: ', bold: true }, PRIORITY[order.priority]?.label || '—'] },
        { width: '*', text: [{ text: 'Трудозатраты: ', bold: true }, `${cost.laborHours} ч`] }
      ], margin: [0, 0, 0, 20] },
      { text: 'Технологические операции', style: 'subheader', margin: [0, 0, 0, 10] },
      { table: {
        headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          [{ text: '№', bold: true }, { text: 'Операция', bold: true }, { text: 'Исполнитель', bold: true }, { text: 'Начало', bold: true }, { text: 'Окончание', bold: true }, { text: 'Статус', bold: true }],
          ...ops.map((op, i) => [
            i + 1,
            op.name,
            op.workerIds?.map(wid => data.workers.find(w => w.id === wid)?.name).filter(Boolean).join(', ') || '—',
            op.startedAt ? new Date(op.startedAt).toLocaleString() : '—',
            op.finishedAt ? new Date(op.finishedAt).toLocaleString() : '—',
            STATUS[op.status]?.label || op.status
          ])
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 20] },
      ops.some(op => op.weldParams) && { text: 'Контроль сварки', style: 'subheader', margin: [0, 0, 0, 10] },
      ops.some(op => op.weldParams) && { table: {
        headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto'],
        body: [
          [{ text: 'Операция', bold: true }, { text: 'Номер шва', bold: true }, { text: 'Электрод', bold: true }, { text: 'Результат', bold: true }],
          ...ops.filter(op => op.weldParams).map(op => [op.name, op.weldParams.seamNumber, op.weldParams.electrode, op.weldParams.result === 'ok' ? 'Принято' : 'Брак'])
        ]
      }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 20] },
      ops.some(op => op.defectNote) && { text: 'Выявленные дефекты', style: 'subheader', margin: [0, 0, 0, 10] },
      ops.some(op => op.defectNote) && { ul: ops.filter(op => op.defectNote).map(op => `${op.name}: ${op.defectNote} (${op.defectSource === 'previous_stage' ? 'с предыдущего участка' : 'текущий'})`) },
      { text: '\n\nДата формирования паспорта: ' + new Date().toLocaleString(), fontSize: 9, color: '#888', margin: [0, 20, 0, 0] }
    ].filter(Boolean),
    styles: {
      header: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
      subheader: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] }
    },
    defaultStyle: { fontSize: 10 }
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
      const available = data.workers.filter(w => (w.status || 'working') === 'working');
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
    h('div', { style: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 12, padding: 24, width: 'min(360px, calc(100vw - 32px))', textAlign: 'center', position: 'relative', maxHeight: '90vh', overflowY: 'auto' } },
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

// ==================== WorkerCardModal ====================
const WorkerCardModal = memo(({ worker, data, onClose }) => {
  const [period, setPeriod] = useState(30);
  const nowTime = useMemo(() => now(), []);
  const startDate = nowTime - period * 86400000;
  const opsDone = data.ops.filter(op => op.workerIds?.includes(worker.id) && op.status === 'done' && op.finishedAt >= startDate);
  const opsDefect = data.ops.filter(op => op.workerIds?.includes(worker.id) && op.status === 'defect' && op.finishedAt >= startDate);
  const opsInProgress = data.ops.filter(op => op.workerIds?.includes(worker.id) && op.status === 'in_progress');
  const opsPending = data.ops.filter(op => op.workerIds?.includes(worker.id) && op.status === 'pending');
  const totalOps = opsDone.length;
  const avgTime = totalOps > 0 ? opsDone.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0) / totalOps : 0;
  const defectRate = (totalOps + opsDefect.length) > 0 ? (opsDefect.length / (totalOps + opsDefect.length) * 100).toFixed(1) : '0.0';
  const downtimeEvents = data.events.filter(e => e.workerId === worker.id && e.type === 'downtime' && e.ts >= startDate);
  const downtimeByReason = {};
  downtimeEvents.forEach(e => {
    const reason = data.downtimeTypes.find(dt => dt.id === e.downtimeTypeId)?.name || 'Неизвестно';
    if (!downtimeByReason[reason]) downtimeByReason[reason] = { count: 0, totalDuration: 0 };
    downtimeByReason[reason].count++;
    downtimeByReason[reason].totalDuration += (e.duration || 0);
  });
  const recentOps = [...opsDone, ...opsDefect].sort((a,b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 10);
  const section = data.sections.find(s => s.id === worker.sectionId);
  const avgByType = {};
  opsDone.forEach(op => {
    if (!avgByType[op.name]) avgByType[op.name] = { total: 0, count: 0 };
    avgByType[op.name].total += (op.finishedAt - op.startedAt);
    avgByType[op.name].count++;
  });
  const allDone = data.ops.filter(op => op.workerIds?.includes(worker.id) && op.status === 'done').length;
  const level = getWorkerLevel(allDone);
  const progress = getLevelProgress(allDone);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': `Карточка сотрудника: ${worker.name}`,
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
  },
    h('div', { className: 'modal-content', style: { background: '#fff', borderRadius: 12, padding: 24, width: 'min(680px, calc(100vw - 32px))', maxHeight: '85vh', overflowY: 'auto' } },
      h('button', { onClick: onClose, 'aria-label': 'Закрыть', style: { float: 'right', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888' } }, '×'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 } },
        h('div', { style: { width: 52, height: 52, borderRadius: '50%', background: AM3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 500, color: AM2 } }, worker.name?.charAt(0) || '?'),
        h('div', null,
          h('div', { style: { fontSize: 18, fontWeight: 500 } }, worker.name),
          h('div', { style: { fontSize: 12, color: '#888' } }, [worker.position, worker.grade ? `${worker.grade} разряд` : null, worker.tabNumber ? `Таб. ${worker.tabNumber}` : null, section?.name].filter(Boolean).join(' · ') || '—'),
          h('div', { style: { marginTop: 4 } },
            h('span', { style: { display: 'inline-block', padding: '2px 10px', fontSize: 10, borderRadius: 8, fontWeight: 500, background: (WORKER_STATUS[worker.status] || WORKER_STATUS.working).bg, color: (WORKER_STATUS[worker.status] || WORKER_STATUS.working).cl, border: '0.5px solid ' + (WORKER_STATUS[worker.status] || WORKER_STATUS.working).br } },
              (WORKER_STATUS[worker.status] || WORKER_STATUS.working).label
            )
          )
        )
      ),
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' } },
        h('span', { style: { fontSize: 12, color: '#888' } }, 'Период:'),
        [7,30,90].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setPeriod(d) }, `${d} дней`))
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 } },
        h(MC, { v: totalOps, l: 'Выполнено', c: GN }),
        h(MC, { v: fmtDur(avgTime), l: 'Ср. время', c: AM }),
        h(MC, { v: `${defectRate}%`, l: 'Брак', c: Number(defectRate) > 5 ? RD : GN }),
        h(MC, { v: `${opsInProgress.length}/${opsPending.length}`, l: 'В работе / Ожидает', c: BL })
      ),
      h('div', { style: { ...S.card, marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 } },
          h('div', { style: { fontSize: 28, fontWeight: 500, color: AM } }, `${level}`),
          h('div', null, h('div', { style: { fontSize: 14, fontWeight: 500 } }, getLevelTitle(level)), h('div', { style: { fontSize: 11, color: '#888' } }, `${allDone} операций всего`))
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('div', { style: { flex: 1, height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' } }, h('div', { style: { width: `${progress * 100}%`, height: 8, background: AM, borderRadius: 4 } })),
          h('div', { style: { fontSize: 11, color: '#888' } }, `${Math.round(progress * 100)}% → Ур. ${level + 1}`)
        )
      ),
      h('div', { style: { marginBottom: 16 } },
        h('div', { style: S.sec }, `Достижения (${(worker.achievements || []).length} / ${Object.keys(ACHIEVEMENTS).length})`),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 } },
          Object.entries(ACHIEVEMENTS).map(([id, ach]) => {
            const earned = (worker.achievements || []).includes(id);
            return h('div', { key: id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: earned ? AM3 : '#f5f5f2', opacity: earned ? 1 : 0.5 } },
              h('span', { style: { fontSize: 18 } }, ach.icon),
              h('div', null, h('div', { style: { fontSize: 12, fontWeight: 500, color: earned ? AM2 : '#888' } }, ach.title), h('div', { style: { fontSize: 10, color: '#aaa' } }, ach.desc))
            );
          })
        )
      ),
      worker.competences && worker.competences.length > 0 && h('div', { style: { marginBottom: 16 } },
        h('div', { style: S.sec }, 'Допуск к операциям'),
        h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, worker.competences.map(c => h('span', { key: c, style: { padding: '3px 10px', fontSize: 11, background: AM3, color: AM2, borderRadius: 8 } }, c)))
      ),
      Object.keys(avgByType).length > 0 && h('div', { style: { marginBottom: 16 } },
        h('div', { style: S.sec }, 'Среднее время по типам операций'),
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Операция', 'Кол-во', 'Ср. время'].map((t,i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, Object.entries(avgByType).map(([name, stat]) =>
            h('tr', { key: name },
              h('td', { style: S.td }, name),
              h('td', { style: S.td }, stat.count),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, fmtDur(stat.total / stat.count))
            )
          ))
        ))
      ),
      h('div', { style: { marginBottom: 16 } },
        h('div', { style: S.sec }, `Простои (${downtimeEvents.length})`),
        Object.keys(downtimeByReason).length === 0
          ? h('div', { style: { padding: 8, fontSize: 12, color: '#888' } }, 'Нет простоев за период')
          : h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
              h('thead', null, h('tr', null, ['Причина', 'Кол-во', 'Общее время'].map((t,i) => h('th', { key: i, style: S.th }, t)))),
              h('tbody', null, Object.entries(downtimeByReason).sort((a,b) => b[1].count - a[1].count).map(([reason, stat]) =>
                h('tr', { key: reason },
                  h('td', { style: S.td }, reason),
                  h('td', { style: { ...S.td, textAlign: 'center' } }, stat.count),
                  h('td', { style: { ...S.td, fontFamily: 'monospace', color: stat.totalDuration > 0 ? RD : '#888' } }, stat.totalDuration > 0 ? fmtDur(stat.totalDuration) : '—')
                )
              ))
            ))
      ),
      recentOps.length > 0 && h('div', null,
        h('div', { style: S.sec }, 'Последние операции'),
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Операция', 'Заказ', 'Статус', 'Время', 'Длительность'].map((t,i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, recentOps.map(op => {
            const order = data.orders.find(o => o.id === op.orderId);
            return h('tr', { key: op.id },
              h('td', { style: S.td }, op.name),
              h('td', { style: { ...S.td, color: AM } }, order?.number || '—'),
              h('td', { style: S.td }, h(Badge, { st: op.status })),
              h('td', { style: { ...S.td, fontSize: 11 } }, op.finishedAt ? new Date(op.finishedAt).toLocaleString() : '—'),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : '—')
            );
          }))
        ))
      )
    )
  );
});


