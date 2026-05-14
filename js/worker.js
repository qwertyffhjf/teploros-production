// teploros · worker.js
// WorkerScreen, WorkerOnboarding, доп. работы

// ==================== WorkerOnboarding ====================
const WorkerOnboarding = memo(({ worker, myOps, onDone }) => {
  const [step, setStep] = useState(1);
  const TOTAL = 3;

  const dots = Array.from({ length: TOTAL }, (_, i) =>
    h('div', { key: i, style: {
      height: 6, borderRadius: 3,
      width: i + 1 === step ? 20 : 6,
      background: i + 1 === step ? AM : 'rgba(0,0,0,0.15)',
      transition: 'all .2s'
    }})
  );

  const Step1 = () => h('div', { style: { textAlign: 'center' } },
    h('div', { style: { width: 72, height: 72, borderRadius: '50%', background: AM3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 500, color: AM2, margin: '0 auto 16px' } },
      worker?.name?.charAt(0) || '?'
    ),
    h('div', { style: { fontSize: 20, fontWeight: 500, marginBottom: 6 } }, `Добро пожаловать,`),
    h('div', { style: { fontSize: 18, fontWeight: 500, color: AM2, marginBottom: 8 } }, worker?.name?.split(' ')[0] + '!'),
    h('div', { style: { fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.6 } },
      worker?.position ? `${worker.position}` : 'Добро пожаловать в систему',
      h('br'), 'Здесь вы ведёте свои задания и отслеживаете результаты'
    ),
    h('button', { className: 'worker-btn worker-btn-start', style: { marginBottom: 10 }, onClick: () => setStep(2) }, 'Посмотреть задания →'),
    h('button', { style: { background: 'none', border: 'none', fontSize: 12, color: '#aaa', cursor: 'pointer', width: '100%', padding: '6px' }, onClick: onDone }, 'Пропустить')
  );

  const Step2 = () => h('div', null,
    h('div', { style: { fontSize: 14, color: '#888', marginBottom: 12 } },
      myOps.length > 0 ? `Ваши задания на сегодня (${myOps.length}):` : 'Ваши задания'
    ),
    myOps.length > 0
      ? myOps.slice(0, 3).map((op, i) => h('div', { key: op.id, style: { ...{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: '10px 14px', marginBottom: 8 } } },
          h('div', { style: { fontSize: 14, fontWeight: 500 } }, op.name),
          op.qty && h('div', { style: { fontSize: 12, color: AM, marginTop: 2, fontWeight: 500 } }, 
            `${op.workerQty?.[currentUser.id] || '—'} из ${op.qty} шт`
          ),
          h('div', { style: { fontSize: 11, color: AM4, marginTop: 2 } }, '↑ Нажмите чтобы начать')
        ))
      : h('div', { style: { background: '#f8f8f5', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#888', fontSize: 13, marginBottom: 12 } },
          h('div', { style: { fontSize: 24, marginBottom: 6 } }, '⏳'),
          'Мастер пока не назначил задания.',
          h('br'), 'Обратитесь к начальнику цеха.'
        ),
    h('button', { className: 'worker-btn worker-btn-start', style: { marginTop: 8 }, onClick: () => setStep(3) }, 'Понятно →')
  );

  const Step3 = () => h('div', { style: { textAlign: 'center' } },
    h('div', { style: { fontSize: 36, marginBottom: 12 } }, '🎯'),
    h('div', { style: { fontSize: 18, fontWeight: 500, marginBottom: 16 } }, 'Всё готово!'),
    [
      ['📷', 'QR-код на рабочем месте — самый быстрый старт'],
      ['⭐', 'Выполняйте операции вовремя — получайте достижения'],
      ['🤝', 'В чате можно поблагодарить коллегу или сообщить о проблеме'],
    ].map(([icon, text]) => h('div', { key: icon, style: { display: 'flex', gap: 10, alignItems: 'flex-start', background: AM3, borderRadius: 10, padding: '10px 12px', marginBottom: 8, textAlign: 'left' } },
      h('span', { style: { fontSize: 16, flexShrink: 0 } }, icon),
      h('span', { style: { fontSize: 13, color: AM2, lineHeight: 1.5 } }, text)
    )),
    h('button', { className: 'worker-btn worker-btn-start', style: { marginTop: 8 }, onClick: onDone }, 'Начать работу')
  );

  return h('div', { style: { maxWidth: 440, margin: '0 auto', padding: '24px 16px' } },
    h('div', { style: { display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 24 } }, dots),
    step === 1 ? h(Step1) : step === 2 ? h(Step2) : h(Step3)
  );
});


// ==================== WorkerScreen ====================
// ==================== WorkerHoursBlock ====================
const WorkerHoursBlock = memo(({ workerId, data, activeOpsList }) => {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [expanded,  setExpanded]  = useState(false);

  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const DOW_SHORT = ['вс','пн','вт','ср','чт','пт','сб'];

  const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: dim }, (_, i) => i + 1);

  const monthData = useMemo(() => {
    let totH = 0, totDays = 0, totOps = 0;
    const grid = days.map(d => {
      const dow = new Date(viewYear, viewMonth, d).getDay();
      const dd = calcDayData(workerId, viewYear, viewMonth, d, data);
      if (dd.h > 0) totH += dd.h;
      // Явка: числовые часы ИЛИ код присутствия без часов (СД, К итд)
      if (dd.h > 0 || (dd.code && !['НН','Б','ОТ','ОЗ','В','we'].includes(dd.code) && dd.type !== 'we')) totDays++;
      if (dd.ops) totOps += dd.ops;
      return { d, dow, ...dd };
    });
    return { grid, totH: Math.round(totH * 10) / 10, totDays, totOps };
  }, [workerId, viewYear, viewMonth, data]);

  const cellBg = (type) => ({
    'full':'#E1F5EE', 'ops':'#FAEEDA', 'half':'#E6F1FB',
    'sick':'#FCEBEB', 'vac':'#E6F1FB', 'abs':'#f5f5f2', 'we':''
  }[type] || '');
  const cellCl = (type) => ({
    'full':GN2, 'ops':AM2, 'half':'#0C447C',
    'sick':RD2, 'vac':'#042C53', 'abs':'#ccc', 'we':'#ddd'
  }[type] || '#888');

  // Предупреждение о давно незакрытой операции (>10 часов)
  const staleOps = activeOpsList ? activeOpsList.filter(op => op.startedAt && (Date.now() - op.startedAt) > 10 * 3600000) : [];

  return h('div', { style: { ...S.card, marginBottom: 16 } },
    staleOps.length > 0 && h('div', { style: { background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 8, padding: '10px 14px', marginBottom: 12 } },
      h('div', { style: { fontSize: 13, fontWeight: 600, color: '#A32D2D', marginBottom: 4 } }, '⚠ Незакрытая операция'),
      staleOps.map(op => h('div', { key: op.id, style: { fontSize: 12, color: '#A32D2D' } },
        '«' + op.name + '» — запущена ' + Math.round((Date.now() - op.startedAt) / 3600000) + 'ч назад. Завершите её.'
      ))
    ),
    // Заголовок
    h('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom:12 } },
      h('div', { style: { ...S.sec, marginBottom:0, flex:1 } }, 'Мои часы'),
      h('button', { style: gbtn({ padding:'4px 10px', fontSize:11 }), onClick:() => { let m=viewMonth-1,y=viewYear; if(m<0){m=11;y--;} setViewMonth(m); setViewYear(y); } }, '‹'),
      h('span', { style:{ fontSize:13, fontWeight:500, minWidth:120, textAlign:'center' } }, `${MONTHS_RU[viewMonth]} ${viewYear}`),
      h('button', { style: gbtn({ padding:'4px 10px', fontSize:11 }), onClick:() => { let m=viewMonth+1,y=viewYear; if(m>11){m=0;y++;} setViewMonth(m); setViewYear(y); } }, '›')
    ),

    // Блок 1 — Табель (официальный учёт)
    h('div', { style: { fontSize:10, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 } }, '📋 Табель'),
    h('div', { style: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 } },
      h('div', { style:{ background:'#f8f8f5', borderRadius:8, padding:'8px 10px', textAlign:'center' } },
        h('div', { style:{ fontSize:22, fontWeight:500, color:AM } }, monthData.totH + 'ч'),
        h('div', { style:{ fontSize:10, color:'#888', textTransform:'uppercase', marginTop:2 } }, 'По табелю')
      ),
      h('div', { style:{ background:'#f8f8f5', borderRadius:8, padding:'8px 10px', textAlign:'center' } },
        h('div', { style:{ fontSize:22, fontWeight:500, color:GN } }, monthData.totDays),
        h('div', { style:{ fontSize:10, color:'#888', textTransform:'uppercase', marginTop:2 } }, 'Дней явок')
      ),
      h('div', { style:{ background:'#f8f8f5', borderRadius:8, padding:'8px 10px', textAlign:'center' } },
        h('div', { style:{ fontSize:22, fontWeight:500 } }, monthData.totOps),
        h('div', { style:{ fontSize:10, color:'#888', textTransform:'uppercase', marginTop:2 } }, 'Операций')
      )
    ),
    // Блок 2 — Производительность (из операций)
    h('div', { style: { fontSize:10, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 } }, '⚙ Производительность'),
    h('div', { style: { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:12 } },
      h('div', { style:{ background:'#f8f8f5', borderRadius:8, padding:'8px 10px', textAlign:'center' } },
        (() => {
          const todayStart = new Date().setHours(0,0,0,0);
          // Считаем время завершённых операций за текущий месяц
          const ym = viewYear + '-' + String(viewMonth+1).padStart(2,'0');
          const monthStart = new Date(viewYear, viewMonth, 1).getTime();
          const monthEnd   = new Date(viewYear, viewMonth+1, 1).getTime();
          const opTime = (data.ops || [])
            .filter(op => op.workerIds?.includes(workerId) && op.status === 'done' && op.startedAt >= monthStart && op.finishedAt < monthEnd)
            .reduce((s, op) => s + (op.finishedAt - op.startedAt), 0);
          const hrs = Math.round(opTime / 3600000 * 10) / 10;
          return h('div', { style:{ fontSize:22, fontWeight:500, color:'#185FA5' } }, hrs + 'ч');
        })(),
        h('div', { style:{ fontSize:10, color:'#888', textTransform:'uppercase', marginTop:2 } }, 'Время операций')
      ),
      h('div', { style:{ background:'#f8f8f5', borderRadius:8, padding:'8px 10px', textAlign:'center' } },
        (() => {
          const monthStart = new Date(viewYear, viewMonth, 1).getTime();
          const monthEnd   = new Date(viewYear, viewMonth+1, 1).getTime();
          const defects = (data.ops || []).filter(op => op.workerIds?.includes(workerId) && op.status === 'defect' && op.finishedAt >= monthStart && op.finishedAt < monthEnd).length;
          const done    = (data.ops || []).filter(op => op.workerIds?.includes(workerId) && op.status === 'done'   && op.finishedAt >= monthStart && op.finishedAt < monthEnd).length;
          const total = done + defects;
          const q = total > 0 ? Math.round(done / total * 100) : 100;
          return h('div', { style:{ fontSize:22, fontWeight:500, color: q >= 95 ? GN : q >= 80 ? AM : RD } }, q + '%');
        })(),
        h('div', { style:{ fontSize:10, color:'#888', textTransform:'uppercase', marginTop:2 } }, 'Качество')
      )
    ),

    // Мини-календарь
    h('button', { style:{ background:'none', border:'none', fontSize:13, color:AM, cursor:'pointer', padding:'0 0 8px', fontWeight:500 }, onClick:()=>setExpanded(v=>!v) },
      expanded ? '▾ Скрыть календарь' : '▸ Показать по дням'
    ),

    expanded && h('div', { style:{ display:'flex', flexWrap:'wrap', gap:4 } },
      monthData.grid.map(({ d, dow, type, h: hrs, code }) => {
        const isWe = type === 'we';
        const lbl = isWe ? DOW_SHORT[dow] : hrs > 0 ? hrs : code;
        return h('div', { key:d, style:{
          width:38, height:42, borderRadius:6, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', gap:1,
          background: isWe ? 'transparent' : (cellBg(type) || '#f5f5f2'),
          border: isWe ? 'none' : `0.5px solid ${isWe?'transparent':cellCl(type)+'44'}`
        }},
          h('div', { style:{ fontSize:9, color:'#bbb' } }, d),
          h('div', { style:{ fontSize:12, fontWeight:500, color: cellCl(type) } }, lbl)
        );
      })
    )
  );
});

// ==================== WorkerSalaryBlock ====================
const WorkerSalaryBlock = memo(({ workerId, data }) => {
  const now_ = Date.now();
  const worker = data.workers.find(w => w.id === workerId);
  if (!worker) return null;

  const payType   = worker.payType || 'hourly';
  const hourlyRate = worker.hourlyRate || null;
  const pieceRate  = worker.pieceRate  || null;

  // Текущий месяц
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const monthLabel = MONTHS_RU[today.getMonth()] + ' ' + today.getFullYear();

  // Часы по табелю за текущий месяц
  const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const tsMonth = data.timesheet?.[ym]?.[workerId] || data.timesheet?.[workerId] || {};
  let tabHours = 0;
  Object.values(tsMonth).forEach(cell => {
    if (typeof cell === 'object' && cell !== null) {
      tabHours += cell.hours || (cell.code === 'full' ? 8 : cell.code === 'half' ? 4 : 0);
    } else if (typeof cell === 'number') {
      tabHours += cell;
    }
  });

  // Изделия за месяц (сдельная) — заказы отгруженные в этом месяце где участвовал рабочий
  const shippedOrders = (data.orders || []).filter(o => {
    if (!o.shipped || !o.shippedAt) return false;
    return o.shippedAt >= monthStart;
  });
  const myShippedQty = shippedOrders.reduce((sum, ord) => {
    const participated = (data.ops || []).some(op => op.orderId === ord.id && op.workerIds?.includes(workerId) && op.status === 'done');
    return participated ? sum + (ord.qty || 1) : sum;
  }, 0);

  // Расчёт начисления
  let earned = null;
  let formula = '';
  if (payType === 'hourly' && hourlyRate) {
    earned = Math.round(tabHours * hourlyRate);
    formula = tabHours + 'ч × ' + hourlyRate + ' руб/ч';
  } else if (payType === 'piecework' && pieceRate) {
    earned = Math.round(myShippedQty * pieceRate);
    formula = myShippedQty + ' изд. × ' + pieceRate + ' руб/изд.';
  }

  const noRate = !hourlyRate && payType === 'hourly' || !pieceRate && payType === 'piecework';

  return h('div', { style: { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
      h('div', { style: { fontSize: 13, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' } }, '💰 Моя зарплата'),
      h('div', { style: { fontSize: 12, color: '#888' } }, monthLabel)
    ),

    noRate
      ? h('div', { style: { fontSize: 13, color: '#aaa', textAlign: 'center', padding: '16px 0' } },
          'Ставка не указана — обратитесь к руководителю'
        )
      : h('div', null,
          h('div', { style: { fontSize: 36, fontWeight: 700, color: GN, textAlign: 'center', marginBottom: 4 } },
            earned !== null ? earned.toLocaleString('ru-RU') + ' ₽' : '—'
          ),
          h('div', { style: { fontSize: 11, color: '#aaa', textAlign: 'center', marginBottom: 16 } },
            formula + ' = начислено (до вычетов)'
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            payType === 'hourly'
              ? h('div', { style: { background: '#f8f8f5', borderRadius: 8, padding: '8px 10px', textAlign: 'center' } },
                  h('div', { style: { fontSize: 20, fontWeight: 500, color: AM } }, tabHours + 'ч'),
                  h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase', marginTop: 2 } }, 'По табелю')
                )
              : h('div', { style: { background: '#f8f8f5', borderRadius: 8, padding: '8px 10px', textAlign: 'center' } },
                  h('div', { style: { fontSize: 20, fontWeight: 500, color: AM } }, myShippedQty),
                  h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase', marginTop: 2 } }, 'Изделий отгружено')
                ),
            h('div', { style: { background: '#f8f8f5', borderRadius: 8, padding: '8px 10px', textAlign: 'center' } },
              h('div', { style: { fontSize: 20, fontWeight: 500, color: '#888' } }, payType === 'hourly' ? hourlyRate + ' ₽' : pieceRate + ' ₽'),
              h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase', marginTop: 2 } }, payType === 'hourly' ? 'Руб/час' : 'Руб/изделие')
            )
          ),
          h('div', { style: { fontSize: 10, color: '#bbb', marginTop: 10, textAlign: 'center', lineHeight: 1.5 } },
            '* Показано начисление до налогов и удержаний. Итоговая сумма определяется бухгалтером.'
          )
        )
  );
});

const WorkerScreen = memo(({ data, workerId, sectionId, onUpdate, initialOpId, addToast }) => {
  const { ask: askConfirm, confirmEl } = useConfirm();
  const worker = useMemo(() => data.workers.find(w => w.id === workerId), [data.workers, workerId]);

  const myOps = useMemo(() => data.ops.filter(o => {
    if (o.status === 'done' || o.status === 'defect' || o.archived) return false;
    // 1. Явно назначена на этого рабочего — всегда показываем
    if (o.workerIds?.includes(workerId)) return true;
    // 2. Не назначена ни на кого — показываем только если:
    //    - совпадает участок
    //    - у рабочего ЕСТЬ компетенции и они включают эту операцию
    if (!o.workerIds?.length && sectionId && o.sectionId === sectionId) {
      const w = data.workers.find(w => w.id === workerId);
      // Без компетенций — не показываем неназначенные (только явно назначенные)
      if (!w?.competences?.length) return false;
      return w.competences.includes(o.name);
    }
    return false;
  }).sort((a,b) => {
    const t = Date.now(); // кешируем один раз для всей сортировки
    const orderA = data.orders.find(ord => ord.id === a.orderId);
    const orderB = data.orders.find(ord => ord.id === b.orderId);
    const getCR = (op, order) => {
      if (!order?.deadline) return 999;
      const deadlineMs = new Date(order.deadline).getTime();
      const remaining = (op.plannedHours || 2) * 3600000;
      const timeLeft = deadlineMs - t;
      if (timeLeft <= 0) return -1;
      return timeLeft / remaining;
    };
    const crA = getCR(a, orderA), crB = getCR(b, orderB);
    if (crA < 1 || crB < 1) return crA - crB;
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const pA = priorityOrder[orderA?.priority] ?? 4;
    const pB = priorityOrder[orderB?.priority] ?? 4;
    return pA !== pB ? pA - pB : crA - crB;
  }), [data.ops, data.orders, workerId, sectionId]);

  const doneToday = useMemo(() => data.ops.filter(o =>
    o.workerIds?.includes(workerId) && o.status === 'done' &&
    o.finishedAt && Date.now() - o.finishedAt < 86400000 && !o.archived
  ), [data.ops, workerId]);

  const allDone = useMemo(() =>
    data.ops.filter(op => op.workerIds?.includes(workerId) && op.status === 'done').length,
  [data.ops, workerId]);

  const [activeOps, setActiveOps] = useState(() => {
    // Восстанавливаем активные операции после перезагрузки страницы
    // Ищем операции in_progress назначенные на этого рабочего
    // data может быть не загружена при первом рендере — поэтому проверяем
    return [];
  }); // массив активных операций
  const [, setTick] = useState(0);
  const [defNote, setDefNote] = useState('');
  const [defectReasonId, setDefectReasonId] = useState('');
  const [showDefForm, setShowDefForm] = useState(false);
  const [defectFromPrev, setDefectFromPrev] = useState(false); // true = с предыдущего участка, false = текущий
  const [showDowntimeModal, setShowDowntimeModal] = useState(false);
  const [selectedDowntimeType, setSelectedDowntimeType] = useState('');
  const [weldParams, setWeldParams] = useState({ seamNumber: '', electrode: '', result: 'ok' });
  const [showAchievements, setShowAchievements] = useState(false);
  // ── Очередь pop-up достижений ──
  const [achQueue, setAchQueue] = useState([]);
  const showNextAch = useCallback(() => setAchQueue(q => q.slice(1)), []);
  const [downtimeStartedAt, setDowntimeStartedAt] = useState(null);
  const [downtimeEquipmentId, setDowntimeEquipmentId] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [pendingFinishOp, setPendingFinishOp] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyOp, setHistoryOp] = useState(null);
  const [viewOrderId, setViewOrderId] = useState(null);
  const [showPressureForm, setShowPressureForm] = useState(false);
  const [pressureOp, setPressureOp] = useState(null); // операция опрессовки
  const [pressureForm, setPressureForm] = useState({
    workPressure: '', testPressure: '', duration: '10', tempC: '',
    pressureStart: '', pressureEnd: '', sweatingFound: false, defectDesc: '', verdict: 'pass',
  });
  const [opComment, setOpComment] = useState('');

  // Сохранить комментарий к операции
  const saveComment = useCallback(async (opId) => {
    if (!opComment.trim()) return;
    const d = { ...data, ops: data.ops.map(o => o.id === opId ? { ...o, comment: (o.comment ? o.comment + '\n' : '') + `[${worker?.name || 'Рабочий'}]: ${opComment.trim()}` } : o) };
    await DB.save(d); onUpdate(d); setOpComment(''); addToast('Комментарий добавлен', 'success');
  }, [data, opComment, worker, onUpdate, addToast]);

  // Чек-лист: переключение пункта
  const toggleCheckItem = useCallback(async (opId, idx) => {
    const d = { ...data, ops: data.ops.map(o => {
      if (o.id !== opId || !o.checklist) return o;
      const cl = o.checklist.map((item, i) => i === idx ? { ...item, checked: !item.checked, checkedAt: !item.checked ? now() : undefined } : item);
      return { ...o, checklist: cl };
    })};
    await DB.save(d); onUpdate(d);
  }, [data, onUpdate]);

  // Восстанавливаем activeOps из data.ops при загрузке / смене workerId
  useEffect(() => {
    if (!workerId || !data.ops) return;
    const inProgress = data.ops.filter(o =>
      o.status === 'in_progress' &&
      o.workerIds?.includes(workerId) &&
      !o.archived
    );
    if (inProgress.length > 0) {
      setActiveOps(prev => {
        // Добавляем только те которых ещё нет в массиве
        const prevIds = new Set(prev.map(p => p.id));
        const toAdd = inProgress.filter(o => !prevIds.has(o.id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }
  }, [workerId]); // только при смене рабочего — не при каждом data.ops

  // Таймер пока есть хотя бы одна активная операция
  useEffect(() => {
    if (!activeOps.length) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [activeOps.length]);

  useEffect(() => {
    if (initialOpId && workerId) {
      const op = data.ops.find(o => o.id === initialOpId);
      if (op && op.status === 'pending' && !op.workerIds?.length && !op.archived) {
        if (!op.isAuxiliary && worker?.competences && worker.competences.length > 0 && !worker.competences.includes(op.name)) {
          addToast('У вас нет компетенции для этой операции', 'error');
          return;
        }
        const updatedOps = data.ops.map(o => o.id === op.id ? { ...o, workerIds: [...(o.workerIds || []), workerId] } : o);
        const newData = { ...data, ops: updatedOps };
        DB.save(newData).then(() => onUpdate(newData));
      }
    }
  }, [initialOpId]);

  const doStart = useCallback(async (op) => {
    // Вспомогательные операции — без проверки компетенций
    if (!op.isAuxiliary && worker?.competences && worker.competences.length > 0 && !worker.competences.includes(op.name)) {
      addToast('У вас нет компетенции для этой операции', 'error'); vibrateAction('error');
      return;
    }
    // Проверяем что эта операция уже не запущена этим рабочим
    const alreadyActive = activeOps.find(ao => ao.id === op.id);
    if (alreadyActive) {
      addToast(`«${op.name}» уже запущена`, 'error'); vibrateAction('error');
      return;
    }
    const result = buildStartUpdate(data, op, workerId);
    const updated = { ...data, ops: result.ops, events: result.events };

    // ── Optimistic update: обновляем UI мгновенно, не ждём Firebase ──
    const optimisticOp = { ...op, status: 'in_progress', startedAt: result._startedAt, workerIds: [...(op.workerIds || []), workerId] };
    setActiveOps(prev => [...prev, optimisticOp]);
    onUpdate(updated);  // UI обновляется немедленно
    vibrateAction('start');
    addToast(`Операция "${op.name}" начата` + (!result._hasCheckin ? ' · Рабочий день начат' : ''), 'success');

    // Сохраняем в Firebase в фоне — при ошибке откатываем
    DB.save(updated).catch(err => {
      setActiveOps(prev => prev.filter(ao => ao.id !== op.id));
      onUpdate(data);  // откат к предыдущему состоянию
      addToast('Ошибка сохранения — проверьте соединение', 'error');
      vibrateAction('error');
    });
  }, [data, workerId, worker, onUpdate, addToast]);

  // Валидация формы дефекта перед отправкой
  const [defFormErrors, setDefFormErrors] = useState({});
  const validateDefectForm = useCallback(() => {
    const errors = {};
    if (!defectReasonId) errors.defectReasonId = 'Выберите тип дефекта';
    if (!defNote.trim())  errors.defNote = 'Опишите дефект';
    setDefFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [defectReasonId, defNote]);

  const savePressureTest = useCallback(async () => {
    if (!pressureOp) return;
    const order = data.orders.find(o => o.id === pressureOp.orderId);
    const protocol = {
      id: uid(),
      orderId: pressureOp.orderId,
      opId: pressureOp.id,
      serialNumber: order?.serialNumber || '',
      workPressure: Number(pressureForm.workPressure) || 0,
      testPressure: Number(pressureForm.testPressure) || 0,
      duration: Number(pressureForm.duration) || 10,
      tempC: Number(pressureForm.tempC) || 0,
      pressureStart: Number(pressureForm.pressureStart) || 0,
      pressureEnd: Number(pressureForm.pressureEnd) || 0,
      sweatingFound: pressureForm.sweatingFound,
      defectDesc: pressureForm.defectDesc.trim(),
      verdict: pressureForm.verdict,
      operatorId: workerId,
      status: 'pending_qc', // ожидает подписи ОТК
      createdAt: now(),
      qcSignedBy: null, qcSignedAt: null,
    };
    const isDefect = pressureForm.verdict === 'fail';
    // Завершаем операцию
    const result = buildFinishUpdate(data, pressureOp, workerId, { isDefect, isRework: false, source: 'current', defNote: isDefect ? (pressureForm.defectDesc || 'Не прошло гидроиспытание') : '', defectReasonId: '', weldParams: {} });
    const updated = { ...data, ops: result.ops, events: result.events, reclamations: result.reclamations, opNorms: result.opNorms || data.opNorms || {}, auxStats: result.auxStats || data.auxStats || {}, pressureTests: [...(data.pressureTests || []), protocol] };
    const { data: achData, justEarned } = checkAchievements(workerId, updated);
    const final = justEarned.length > 0 ? achData : updated;
    if (justEarned.length > 0) setTimeout(() => setAchQueue(q => [...q, ...justEarned.map(id => ACHIEVEMENTS[id]).filter(Boolean)]), 600);
    onUpdate(final);
    vibrateAction('finish');
    if (pressureOp) setActiveOps(prev => prev.filter(ao => ao.id !== pressureOp.id));
    setShowPressureForm(false);
    setPressureOp(null);
    addToast(isDefect ? '⚠ Протокол ГИ сохранён — не выдержал. Уведомлён ОТК.' : '✓ Протокол ГИ сохранён — ожидает подписи ОТК', isDefect ? 'error' : 'success');
    DB.save(final).catch(() => { onUpdate(data); addToast('Ошибка сохранения', 'error'); });
  }, [data, pressureOp, pressureForm, workerId, onUpdate, addToast]);

  const doFinish = useCallback(async (op, isDefect = false, isRework = false, source = 'current') => {
    if (op.status !== 'in_progress') return;
    const result = buildFinishUpdate(data, op, workerId, { isDefect, isRework, source, defNote, defectReasonId, weldParams });
    const updated = { ...data, ops: result.ops, events: result.events, reclamations: result.reclamations, opNorms: result.opNorms || data.opNorms || {}, auxStats: result.auxStats || data.auxStats || {} };
    const status = result._status;
    // Проверяем достижения и сохраняем ОДИН раз
    // FIX: checkAchievements теперь возвращает { data, justEarned }
    // justEarned — точный список ID только что заработанных, без slice/filter хаков
    const { data: achData, justEarned } = checkAchievements(workerId, updated);
    const final = justEarned.length > 0 ? achData : updated;

    if (justEarned.length > 0) {
      const achInfos = justEarned.map(id => ACHIEVEMENTS[id]).filter(Boolean);
      vibrateOnAchievement();
      // Небольшая задержка — даём UI сначала обновиться (операция завершена),
      // потом показываем pop-up чтобы не перекрывать финальный экран сразу
      setTimeout(() => setAchQueue(q => [...q, ...achInfos]), 600);
    }
    // ── Optimistic update: сбрасываем UI немедленно ──
    const prevData = data;
    onUpdate(final);
    vibrateAction('finish');
    setShowDefForm(false); setDefNote(''); setDefectReasonId('');
    setWeldParams({ seamNumber: '', electrode: '', result: 'ok' });
    addToast(`Операция "${op.name}" завершена (${STATUS[status]?.label || status})`, 'info');

    // Сохраняем в Firebase в фоне
    DB.save(final).catch(err => {
      onUpdate(prevData);  // откат
      addToast('Ошибка сохранения — данные не записаны', 'error');
      vibrateAction('error');
    });
    // Убираем завершённую операцию из activeOps
    setActiveOps(prev => prev.filter(ao => ao.id !== op.id));
    // Push-уведомление ОТК если операция ушла на контроль
    if (status === 'on_check' && 'serviceWorker' in navigator) {
      const order = data.orders.find(o => o.id === op.orderId);
      navigator.serviceWorker.ready.then(reg => {
        reg.active?.postMessage({
          type: 'NOTIFY_QC',
          opName: op.name,
          orderNumber: order?.number || '?'
        });
      });
    }
    // Показать модал расхода материалов только если функция включена в настройках
    if ((status === 'done' || status === 'on_check') && data.materials.length > 0
        && data.settings?.materialTrackingEnabled) {
      setPendingFinishOp(op); setShowMaterialModal(true);
    }
  }, [data, workerId, onUpdate, defNote, defectReasonId, weldParams, addToast]);

  const saveMaterialConsumption = useCallback(async (consumptions) => {
    if (consumptions.length === 0) {
      // Записать факт пропуска как событие для аудита
      const skipEvent = { id: uid(), type: 'material_skip', opId: pendingFinishOp?.id, workerId, ts: now() };
      const d = { ...data, events: [...data.events, skipEvent] };
      await DB.save(d); onUpdate(d);
      setShowMaterialModal(false); setPendingFinishOp(null); return;
    }
    const updatedMaterials = data.materials.map(m => {
      const used = consumptions.filter(c => c.materialId === m.id).reduce((s, c) => s + c.qty, 0);
      return used > 0 ? { ...m, quantity: Math.max(0, m.quantity - used) } : m;
    });
    const d = { ...data, materials: updatedMaterials, materialConsumptions: [...(data.materialConsumptions || []), ...consumptions] };
    await DB.save(d); onUpdate(d);
    setShowMaterialModal(false); setPendingFinishOp(null);
    addToast('Расход материалов записан', 'success');
  }, [data, workerId, pendingFinishOp, onUpdate, addToast]);

  // Получаем живые объекты операций из data.ops по ids в activeOps
  const activeOpsList = activeOps
    .map(ao => data.ops.find(o => o.id === ao.id))
    .filter(Boolean)
    .filter(o => o.status === 'in_progress');
  const active = activeOpsList[0] || null; // первая активная для совместимости с формами брака/простоя
  const elapsed = active?.startedAt ? now() - active.startedAt : 0;

  const recordDowntime = useCallback(async () => {
    if (!selectedDowntimeType) { addToast('Выберите причину простоя', 'error'); return; }
    const ts = now(); const shift = getCurrentShift(data?.settings?.shifts); const duration = downtimeStartedAt ? ts - downtimeStartedAt : 0;
    const newEvent = { id: uid(), type: 'downtime', workerId, opId: active?.id || null, ts, downtimeTypeId: selectedDowntimeType, shift, startedAt: downtimeStartedAt || ts, duration, equipmentId: downtimeEquipmentId || undefined };
    const updated = { ...data, events: [...data.events, newEvent] };
    // ── Optimistic update для простоя ──
    const prevDataDowntime = data;
    onUpdate(updated);
    setShowDowntimeModal(false); setSelectedDowntimeType(''); setDowntimeStartedAt(null); setDowntimeEquipmentId('');
    addToast(`Простой зафиксирован (${fmtDur(duration)})`, 'success');
    DB.save(updated).catch(() => {
      onUpdate(prevDataDowntime);
      addToast('Ошибка сохранения простоя', 'error');
    });
  }, [data, workerId, active, selectedDowntimeType, downtimeStartedAt, onUpdate, addToast]);

  // Отмена вспомогательной операции (только свои, pending/in_progress)
  const cancelAuxOp = useCallback(async (op) => {
    if (!op.isAuxiliary || op.addedByWorker !== workerId) return;
    if (op.status !== 'pending' && op.status !== 'in_progress') return;
    const updated = { ...data, ops: data.ops.filter(o => o.id !== op.id) };
    const withLog = logAction(updated, 'worker_cancel_aux_op', { opId: op.id, opName: op.name, workerId });
    await DB.save(withLog); onUpdate(withLog);
    setActiveOps(prev => prev.filter(ao => ao.id !== op.id));
    addToast(`«${op.name}» отменена`, 'info');
  }, [data, workerId, active, onUpdate, addToast]);

  // Автосброс — убираем из массива операции завершённые извне (ОТК принял и т.д.)
  useEffect(() => {
    if (!activeOps.length) return;
    const finished = activeOps.filter(ao => {
      const op = data.ops.find(o => o.id === ao.id);
      return !op || op.status === 'done' || op.status === 'on_check' || op.status === 'defect' || op.status === 'approved';
    });
    if (finished.length > 0) {
      setActiveOps(prev => prev.filter(ao => !finished.find(f => f.id === ao.id)));
    }
  }, [data.ops]);

  // activeOpsList и active объявлены выше (перед useCallback-ами)
  const qrOp = initialOpId ? data.ops.find(o => o.id === initialOpId) : null;
  const canStartQr = qrOp && qrOp.status === 'pending' && !qrOp.workerIds?.length && !qrOp.archived;

  // Кнопки действий — разделены по типу операции
  const renderActionButtons = (op) => {
    if (showDefForm) {
      const source = defectFromPrev ? 'previous_stage' : 'current';
      return h('div', null,
        h('div', { style: { fontSize: 11, color: RD, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase' } },
          defectFromPrev ? '⚠ Брак с предыдущего участка' : '⚠ Брак текущего этапа'
        ),
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
          h('button', { type: 'button', style: defectFromPrev ? rbtn({ flex: 1, fontSize: 11 }) : gbtn({ flex: 1, fontSize: 11 }), onClick: () => setDefectFromPrev(true) }, 'С предыдущего участка'),
          h('button', { type: 'button', style: !defectFromPrev ? rbtn({ flex: 1, fontSize: 11 }) : gbtn({ flex: 1, fontSize: 11 }), onClick: () => setDefectFromPrev(false) }, 'Текущий этап')
        ),
        h('div', { className: defFormErrors.defectReasonId ? 'field-error' : defectReasonId ? 'field-valid' : '' },
          h('select', { style: { ...S.inp, width: '100%', marginBottom: defFormErrors.defectReasonId ? 2 : 8 }, value: defectReasonId, onChange: e => { setDefectReasonId(e.target.value); setDefFormErrors(p => ({ ...p, defectReasonId: '' })); } },
          h('option', { value: '' }, '— выберите причину —'),
          (data.defectReasons || []).map(r => h('option', { key: r.id, value: r.id }, r.name))
          ),
          defFormErrors.defectReasonId && h('div', { className: 'error-hint', style: { marginBottom: 6 } }, defFormErrors.defectReasonId)
        ),
        h('div', { className: defFormErrors.defNote ? 'field-error' : defNote.trim() ? 'field-valid' : '' },
          h('textarea', { style: { ...S.inp, width: '100%', marginBottom: defFormErrors.defNote ? 2 : 8 }, rows: 2, placeholder: 'Опишите дефект...', value: defNote, onChange: e => { setDefNote(e.target.value); setDefFormErrors(p => ({ ...p, defNote: '' })); } }),
          defFormErrors.defNote && h('div', { className: 'error-hint', style: { marginBottom: 6 } }, defFormErrors.defNote)
        ),
        h('div', { style: { display: 'flex', gap: 6 } },
          h('button', { type: 'button', style: rbtn({ flex: 1 }), onClick: () => doFinish(op, true, false, source) }, 'Зафиксировать брак'),
          h('button', { type: 'button', style: { ...gbtn({ flex: 1 }), color: AM2, borderColor: AM4 }, onClick: () => doFinish(op, false, true, source) }, 'На переделку'),
          h('button', { type: 'button', style: gbtn({ flex: 1 }), onClick: () => { setShowDefForm(false); setDefectFromPrev(false); } }, 'Отмена')
        )
      );
    }
    if (op.name.includes('свар')) {
      return h('div', null,
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
          h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Номер шва', value: weldParams.seamNumber, onChange: e => setWeldParams(p => ({ ...p, seamNumber: e.target.value })) }),
          h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Тип электрода', value: weldParams.electrode, onChange: e => setWeldParams(p => ({ ...p, electrode: e.target.value })) })
        ),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('input', { type: 'radio', name: `weldResult_worker_${op.id}`, value: 'ok', checked: weldParams.result === 'ok', onChange: e => setWeldParams(p => ({ ...p, result: e.target.value })) }), 'Принято'),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('input', { type: 'radio', name: `weldResult_worker_${op.id}`, value: 'fail', checked: weldParams.result === 'fail', onChange: e => setWeldParams(p => ({ ...p, result: e.target.value })) }), 'Брак')
        ),
        h('div', { className: 'action-btns', style: { display: 'flex', gap: 8 } },
          h('button', { style: { ...abtn({ flex: 1 }), background: GN, color: GN2 }, onClick: () => doFinish(op) }, '✓ Завершить'),
          h('button', { style: rbtn({ flex: 1 }), onClick: () => { setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с пред. уч.'),
          h('button', { style: { ...rbtn({ flex: 1 }), background: '#FFF0F0', color: RD2, borderColor: '#F09595' }, onClick: () => { setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
          h('button', { style: gbtn({ flex: 1 }), onClick: () => { setShowDowntimeModal(true); setDowntimeStartedAt(now()); } }, '⏸ Простой')
        )
      );
    }
    return h('div', { className: 'action-btns', style: { display: 'flex', gap: 8 } },
      h('button', { style: { ...abtn({ flex: 1 }), background: GN, color: GN2 }, onClick: () => doFinish(op) }, '✓ Завершить'),
      h('button', { style: rbtn({ flex: 1 }), onClick: () => { setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с пред. уч.'),
      h('button', { style: { ...rbtn({ flex: 1 }), background: '#FFF0F0', color: RD2, borderColor: '#F09595' }, onClick: () => { setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
      h('button', { style: gbtn({ flex: 1 }), onClick: () => { setShowDowntimeModal(true); setDowntimeStartedAt(now()); } }, '⏸ Простой')
    );
  };

  const lvl = getWorkerLevel(allDone);
  const prog = getLevelProgress(allDone);
  const [levelUpMsg, setLevelUpMsg] = useState(null);
  // Обнаружение повышения уровня
  useEffect(() => {
    const key = `worker_level_${workerId}`;
    const prev = Number(localStorage.getItem(key)) || 0;
    if (lvl > prev && prev > 0) {
      setLevelUpMsg(`Поздравляем! Вы достигли уровня ${lvl} — ${getLevelTitle(lvl)}!`);
      setTimeout(() => setLevelUpMsg(null), 8000);
    }
    localStorage.setItem(key, String(lvl));
  }, [lvl, workerId]);
  // Подсказка о ближайшем достижении
  const workerStats = useMemo(() => calcWorkerStats(workerId, data, Date.now()), [data, workerId]);
  const achHint = useMemo(() => {
    const s = workerStats;
    const remaining = [];
    if (!worker?.achievements?.includes('ops_10') && s.doneCount >= 7) remaining.push(`${10 - s.doneCount} оп. до «Десятка»`);
    if (!worker?.achievements?.includes('ops_50') && s.doneCount >= 40) remaining.push(`${50 - s.doneCount} оп. до «Профессионал»`);
    if (!worker?.achievements?.includes('streak_5') && s.currentStreak >= 3) remaining.push(`${5 - s.currentStreak} до «Серия 5»`);
    if (!worker?.achievements?.includes('thanks_5') && s.thanksReceived >= 3) remaining.push(`${5 - s.thanksReceived} до «Спасибо, коллега!»`);
    return remaining[0] || null;
  }, [workerStats, worker]);
  const ach = useMemo(() => worker?.achievements || [], [worker]);
  const nextAch = useMemo(() => Object.entries(ACHIEVEMENTS).find(([id]) => !ach.includes(id)), [ach]);
  // Прогресс для каждого достижения
  const achProgress = useMemo(() => {
    const s = workerStats;
    return {
      first_op: { cur: s.doneCount, target: 1 }, ops_10: { cur: s.doneCount, target: 10 }, ops_50: { cur: s.doneCount, target: 50 },
      ops_100: { cur: s.doneCount, target: 100 }, ops_500: { cur: s.doneCount, target: 500 },
      quality_star: { cur: s.doneCount, target: 50, extra: `брак ${s.defectRate.toFixed(1)}%` },
      weld_master: { cur: s.weldCount, target: 50 }, speed_demon: { cur: s.doneWithPlan, target: 10, extra: `${Math.round((1 - s.avgRatio) * 100)}% быстрее` },
      no_downtime: { cur: s.downtimes30d === 0 ? 1 : 0, target: 1 }, streak_5: { cur: s.currentStreak, target: 5 }, streak_20: { cur: s.currentStreak, target: 20 },
      multi_skill: { cur: s.uniqueOpTypes, target: 5 }, detective_10: { cur: s.detectedDefects, target: 10 }, thanks_5: { cur: s.thanksReceived, target: 5 },
      golden_hands_100: { cur: s.defectCount === 0 ? s.doneCount : 0, target: 100 }, universal_2_3: { cur: s.uniqueSections, target: 3 },
      weekend_5: { cur: s.weekendOps, target: 5 }, virtuoso_10: { cur: s.fastOps, target: 10 },
      no_downtime_7: { cur: s.downtimes7d === 0 ? 1 : 0, target: 1 }, speed_streak_5: { cur: s.bestSpeedStreak, target: 5 }
    };
  }, [workerStats]);

  // Пункт 4: Личные метрики рабочего
  const myStats = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const period30 = now() - 30 * 86400000;
    const myDone = data.ops.filter(op => op.workerIds?.includes(workerId) && op.status === 'done');
    const myDone30 = myDone.filter(op => op.finishedAt >= period30);
    const myDefect30 = data.ops.filter(op => op.workerIds?.includes(workerId) && op.status === 'defect' && op.finishedAt >= period30);
    const total30 = myDone30.length + myDefect30.length;
    const quality = total30 > 0 ? Math.round(myDone30.length / total30 * 100) : 100;
    const todayOps = myDone.filter(op => op.finishedAt >= todayStart && op.startedAt && op.finishedAt);
    const workedToday = todayOps.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0);
    const activeTime = active?.startedAt ? now() - active.startedAt : 0;
    const withPlan = myDone30.filter(op => op.plannedHours && op.startedAt && op.finishedAt);
    const productivity = withPlan.length > 0 ? Math.round(withPlan.reduce((s, op) => s + op.plannedHours * 3600000, 0) / withPlan.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0) * 100) : null;
    const downtimeHrs = Math.round(data.events.filter(e => e.workerId === workerId && e.type === 'downtime' && e.ts >= period30).reduce((s, e) => s + (e.duration || 0), 0) / 3600000 * 10) / 10;
    // Благодарности
    const allThanks = data.events.filter(e => e.type === 'thanks' && e.toWorkerId === workerId);
    const thanksCount = allThanks.length;
    const recentThanks = allThanks.sort((a, b) => b.ts - a.ts).slice(0, 5).map(t => {
      const from = t.fromWorkerId === 'master' ? 'Начальник цеха' : data.workers.find(w => w.id === t.fromWorkerId)?.name || 'Коллега';
      return { from, note: t.note || '', ts: t.ts };
    });
    // Новые благодарности (после последнего просмотра)
    const lastSeenKey = `thanks_seen_${workerId}`;
    const lastSeen = Number(localStorage.getItem(lastSeenKey)) || 0;
    const newThanks = allThanks.filter(t => t.ts > lastSeen);
    return { quality, workedToday: workedToday + activeTime, doneToday: doneToday.length, done30: myDone30.length, productivity, downtimeHrs, thanksCount, recentThanks, newThanks, lastSeenKey };
  }, [data.ops, data.events, workerId, doneToday, active]);

  // Отметить благодарности как просмотренные
  useEffect(() => {
    if (myStats.newThanks.length > 0) {
      localStorage.setItem(myStats.lastSeenKey, String(now()));
    }
  }, [myStats.newThanks.length, myStats.lastSeenKey]);



  const [workerTab, setWorkerTab] = useState('tasks');
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem(`onboarding_done_${workerId}`); } catch(e) { return false; }
  });
  const doneOnboarding = useCallback(() => {
    try { localStorage.setItem(`onboarding_done_${workerId}`, '1'); } catch(e) {}
    setShowOnboarding(false);
  }, [workerId]);
  const [showThanksHistory, setShowThanksHistory] = useState(false);
  const [showAddOp, setShowAddOp] = useState(false);
  const [addOpForm, setAddOpForm] = useState({ category: '', name: '', orderId: '', comment: '' });

  // Категории из core.js (глобальные AUX_CATEGORIES)

  // Доступные заказы (опционально — для привязки к заказу)
  const availableOrders = useMemo(() => data.orders.filter(o => !o.archived && !o.isParentOrder).sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return (prio[a.priority] || 4) - (prio[b.priority] || 4);
  }), [data.orders]);

  const selectedCategory = AUX_CATEGORIES.find(c => c.id === addOpForm.category);

  const addWorkerOp = useCallback(async () => {
    if (!addOpForm.name.trim()) { addToast('Введите или выберите вид работ', 'error'); return; }
    const newOp = {
      id: uid(), name: addOpForm.name.trim(),
      orderId: addOpForm.orderId || null, // может быть без заказа
      workerIds: [workerId], status: 'pending', createdAt: now(),
      sectionId: sectionId || null, archived: false,
      isAuxiliary: true, // помечаем как вспомогательная
      auxCategory: addOpForm.category || 'other',
      comment: addOpForm.comment.trim() ? `[${worker?.name || 'Рабочий'}]: ${addOpForm.comment.trim()}` : undefined,
      addedByWorker: workerId
    };
    let d = { ...data, ops: [...data.ops, newOp] };
    d = logAction(d, 'worker_add_aux_op', { opId: newOp.id, opName: newOp.name, category: newOp.auxCategory, workerId });
    await DB.save(d); onUpdate(d);
    setAddOpForm({ category: '', name: '', orderId: '', comment: '' }); setShowAddOp(false);
    addToast(`Работа «${newOp.name}» добавлена`, 'success');
  }, [data, addOpForm, workerId, sectionId, worker, onUpdate, addToast]);

  return h('div', { style: { maxWidth: 440, margin: '0 auto', padding: '0 12px 80px' } },
    // Pop-up достижения — показываем первое из очереди, остальные ждут
    achQueue.length > 0 && h(AchievementPopup, {
      achievement: achQueue[0],
      workerName: worker?.name,
      onClose: showNextAch,
    }),
    // Онбординг — только при первом входе
    showOnboarding && h(WorkerOnboarding, { worker, myOps, onDone: doneOnboarding }),
    !showOnboarding && h('div', null,

    // ── Уведомления (поверх обеих вкладок) ──────────────────────────────
    myStats.newThanks.length > 0 && h('div', { style: { ...S.card, background: '#FFF8E1', border: '0.5px solid #FFC107', marginBottom: 12, padding: 12, marginTop: 12 } },
      h('div', { style: { fontSize: 13, fontWeight: 500, color: '#F57F17', marginBottom: 4 } },
        `🤝 Вы получили ${myStats.newThanks.length} ${myStats.newThanks.length === 1 ? 'благодарность' : 'благодарностей'}!`
      ),
      myStats.newThanks.map((t, i) => h('div', { key: i, style: { fontSize: 12, color: '#666' } },
        `${t.from}${t.note ? ` — ${t.note}` : ''}`
      ))
    ),
    levelUpMsg && h('div', { style: { ...S.card, background: '#E8F5E9', border: '0.5px solid #4CAF50', marginBottom: 12, padding: 12, textAlign: 'center' } },
      h('div', { style: { fontSize: 24, marginBottom: 4 } }, '🎉'),
      h('div', { style: { fontSize: 14, fontWeight: 500, color: '#2E7D32' } }, levelUpMsg)
    ),

    // ── Вкладки ──────────────────────────────────────────────────────────
    h('div', { style: { display: 'flex', gap: 0, marginBottom: 16, marginTop: 8, borderBottom: '0.5px solid rgba(0,0,0,0.1)' } },
      [['tasks', `Задания${myOps.length > 0 ? ` (${myOps.length})` : ''}`], ['profile', 'Мой профиль']].map(([id, label]) =>
        h('button', { key: id, onClick: () => setWorkerTab(id), style: {
          flex: 1, background: 'none', border: 'none',
          borderBottom: workerTab === id ? `2.5px solid ${AM}` : '2.5px solid transparent',
          color: workerTab === id ? AM : 'var(--muted)',
          fontWeight: workerTab === id ? 600 : 400,
          fontSize: 14, padding: '10px 4px', cursor: 'pointer',
          minHeight: 44, borderRadius: 0, transition: 'color .15s,border-color .15s'
        }}, label)
      )
    ),

    // ════════════════════════════════════════════
    // ВКЛАДКА: ЗАДАНИЯ
    // ════════════════════════════════════════════
    workerTab === 'tasks' && h('div', null,

      // Активная операция
      active && h('div', { style: { background: AM3, border: `1.5px solid ${AM4}`, borderRadius: 16, padding: 16, marginBottom: 20, boxShadow: `0 2px 0 ${AM4}, 0 4px 24px rgba(239,159,39,.2)` } },
        h('div', { style: { fontSize: 9, color: AM4, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8, fontWeight: 700 } }, '▶ В работе сейчас'),
        h('div', { style: { fontSize: 18, fontWeight: 600, color: AM2, marginBottom: 2, lineHeight: 1.3 } }, active.name),
        active.qty && h('div', { style: { fontSize: 13, color: AM4, fontWeight: 500, marginBottom: 4 } }, 
          `📦 Ваша доля: ${active.workerQty?.[workerId] || '—'} из ${active.qty} шт`
        ),
        h('div', { style: { fontSize: 12, color: AM4, marginBottom: 14, opacity: .8 } }, data.orders.find(o => o.id === active.orderId)?.number || ''),
        h(ElapsedTimer, { startedAt: active.startedAt, style: { fontSize: 36, fontWeight: 600, color: AM2, marginBottom: 14, display: 'block', fontFamily: 'monospace', letterSpacing: '-0.02em' } }),
        (() => {
          const drawUrl = active.drawingUrl || data.orders.find(o => o.id === active.orderId)?.drawingUrl;
          return drawUrl && h('a', { href: drawUrl, target: '_blank', rel: 'noopener', style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: BL, textDecoration: 'none', padding: '6px 10px', background: 'rgba(255,255,255,0.8)', borderRadius: 6, marginBottom: 12 } }, '📐 Чертёж / ТЗ');
        })(),
        // Чек-лист
        active.checklist?.length > 0 && h('div', { style: { background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 } },
          h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 500 } },
            `Чек-лист (${active.checklist.filter(c => c.checked).length}/${active.checklist.length})`
          ),
          active.checklist.map((item, idx) =>
            h('label', { key: idx, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', cursor: 'pointer', fontSize: 14 } },
              h('input', { type: 'checkbox', checked: item.checked || false, onChange: () => toggleCheckItem(active.id, idx), style: { width: 20, height: 20, accentColor: GN, flexShrink: 0 } }),
              h('span', { style: { textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#888' : '#333' } }, item.text)
            )
          )
        ),
        // Комментарий
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 16 } },
          h('input', { style: { ...S.inp, flex: 1, fontSize: 14 }, placeholder: 'Комментарий к операции...', value: opComment, onChange: e => setOpComment(e.target.value), onKeyDown: e => e.key === 'Enter' && saveComment(active.id) }),
          h(VoiceButton, { onResult: (t) => setOpComment(prev => prev ? prev + ' ' + t : t) }),
          opComment.trim() && h('button', { style: abtn({ padding: '8px 12px', fontSize: 13 }), onClick: () => saveComment(active.id) }, '💬')
        ),
        // ── КНОПКИ ДЕЙСТВИЙ — крупные с отступами ──
        (active.checklist?.length > 0 && active.checklist.some(c => !c.checked))
          ? h('div', { style: { textAlign: 'center', padding: '12px 0', color: '#888', fontSize: 13 } }, '⚠ Выполните все пункты чек-листа')
          : showDefForm
            ? h('div', null,
                h('div', { style: { fontSize: 12, color: RD2, fontWeight: 500, marginBottom: 10, textTransform: 'uppercase' } },
                  defectFromPrev ? '⚠ Брак с предыдущего участка' : '⚠ Брак текущего этапа'
                ),
                h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
                  h('button', { style: defectFromPrev ? rbtn({ flex: 1, minHeight: 48, fontSize: 13 }) : gbtn({ flex: 1, minHeight: 48, fontSize: 13 }), onClick: () => setDefectFromPrev(true) }, 'С предыдущего участка'),
                  h('button', { style: !defectFromPrev ? rbtn({ flex: 1, minHeight: 48, fontSize: 13 }) : gbtn({ flex: 1, minHeight: 48, fontSize: 13 }), onClick: () => setDefectFromPrev(false) }, 'Текущий этап')
                ),
                h('select', { style: { ...S.inp, marginBottom: 10 }, value: defectReasonId, onChange: e => setDefectReasonId(e.target.value) },
                  h('option', { value: '' }, '— выберите причину —'),
                  (data.defectReasons || []).map(r => h('option', { key: r.id, value: r.id }, r.name))
                ),
                h('textarea', { style: { ...S.inp, marginBottom: 10 }, rows: 2, placeholder: 'Опишите дефект...', value: defNote, onChange: e => setDefNote(e.target.value) }),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { style: rbtn({ flex: 1, minHeight: 52, fontSize: 14 }), onClick: () => { if (!validateDefectForm()) { vibrateAction('error'); return; } vibrateAction('error'); doFinish(active, true, false, defectFromPrev ? 'previous_stage' : 'current'); } }, 'Зафиксировать брак'),
                  h('button', { style: { ...gbtn({ flex: 1, minHeight: 52, fontSize: 14 }), color: AM2, borderColor: AM4 }, onClick: () => { if (!validateDefectForm()) { vibrateAction('error'); return; } navigator.vibrate?.([30]); doFinish(active, false, true, defectFromPrev ? 'previous_stage' : 'current'); } }, 'На переделку'),
                  h('button', { style: gbtn({ minHeight: 52, padding: '8px 14px' }), onClick: () => { navigator.vibrate?.([20]); setShowDefForm(false); setDefectFromPrev(false); setDefFormErrors({}); } }, 'Отмена')
                )
              )
            : h('div', null,
                // СТОП — самая крупная кнопка
                h('button', { className: 'worker-btn worker-btn-stop', style: { marginBottom: 12 }, onClick: () => {
                vibrateAction('start');
                if (active.requiresPressureTest || active.name.toLowerCase().includes('опресс')) {
                  const order = data.orders.find(o => o.id === active.orderId);
                  setPressureOp(active);
                  setPressureForm({ workPressure: '', testPressure: '', duration: '10', tempC: '', pressureStart: '', pressureEnd: '', sweatingFound: false, defectDesc: '', verdict: 'pass' });
                  setShowPressureForm(true);
                } else {
                  doFinish(active);
                }
              } }, '■ Завершить операцию'),
                // Брак — две средние кнопки рядом
                h('div', { style: { display: 'flex', gap: 10, marginBottom: 12 } },
                  h('button', { className: 'worker-btn-defect', onClick: () => { navigator.vibrate?.([40]); setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
                  h('button', { className: 'worker-btn-defect', onClick: () => { navigator.vibrate?.([40]); setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с уч.')
                ),
                // Простой — отдельная строка
                h('button', { className: 'worker-btn-pause', onClick: () => { navigator.vibrate?.([30]); setShowDowntimeModal(true); setDowntimeStartedAt(now()); } }, '⏸ Зафиксировать простой')
              )
      ),

      // Активные операции — список карточек
      activeOpsList.length > 0 && h('div', null,
        activeOpsList.length > 1 && h('div', { style: { fontSize: 11, color: AM4, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' } },
          `В работе (${activeOpsList.length})`
        ),
        activeOpsList.map((activeItem, idx) => {
          const isFirst = idx === 0;
          const order = data.orders.find(o => o.id === activeItem.orderId);
          const itemElapsed = activeItem.startedAt ? now() - activeItem.startedAt : 0;
          const hh = String(Math.floor(itemElapsed / 3600000)).padStart(2,'0');
          const mm = String(Math.floor((itemElapsed % 3600000) / 60000)).padStart(2,'0');
          const ss = String(Math.floor((itemElapsed % 60000) / 1000)).padStart(2,'0');
          return h('div', { key: activeItem.id, style: { ...S.card, marginBottom: 12, borderLeft: `3px solid ${AM}` } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 } },
              h('div', null,
                h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: 2 } }, activeItem.name),
                h('div', { style: { fontSize: 11, color: AM4 } }, order?.number || '—')
              ),
              h('div', { style: { fontSize: 20, fontWeight: 500, color: AM, fontFamily: 'monospace' } },
                `${hh}:${mm}:${ss}`
              )
            ),
            // Показываем форму брака/завершения только для первой или если это единственная
            isFirst && showDefForm
              ? h('div', null,
                  h('div', { style: { fontSize: 12, color: RD2, fontWeight: 500, marginBottom: 10, textTransform: 'uppercase' } },
                    defectFromPrev ? '⚠ Брак с предыдущего участка' : '⚠ Брак текущего этапа'
                  ),
                  h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
                    h('button', { style: defectFromPrev ? rbtn({ flex: 1, minHeight: 48, fontSize: 13 }) : gbtn({ flex: 1, minHeight: 48, fontSize: 13 }), onClick: () => setDefectFromPrev(true) }, 'С предыдущего участка'),
                    h('button', { style: !defectFromPrev ? rbtn({ flex: 1, minHeight: 48, fontSize: 13 }) : gbtn({ flex: 1, minHeight: 48, fontSize: 13 }), onClick: () => setDefectFromPrev(false) }, 'Текущий этап')
                  ),
                  h('select', { style: { ...S.inp, marginBottom: 10 }, value: defectReasonId, onChange: e => setDefectReasonId(e.target.value) },
                    h('option', { value: '' }, '— выберите причину —'),
                    (data.defectReasons || []).map(r => h('option', { key: r.id, value: r.id }, r.name))
                  ),
                  h('textarea', { style: { ...S.inp, marginBottom: 10 }, rows: 2, placeholder: 'Опишите дефект...', value: defNote, onChange: e => setDefNote(e.target.value) }),
                  h('div', { style: { display: 'flex', gap: 8 } },
                    h('button', { style: rbtn({ flex: 1, minHeight: 52, fontSize: 14 }), onClick: () => { if (!validateDefectForm()) { vibrateAction('error'); return; } vibrateAction('error'); doFinish(activeItem, true, false, defectFromPrev ? 'previous_stage' : 'current'); setShowDefForm(false); } }, 'Зафиксировать брак'),
                    h('button', { style: { ...gbtn({ flex: 1, minHeight: 52, fontSize: 14 }), color: AM2, borderColor: AM4 }, onClick: () => { if (!validateDefectForm()) { vibrateAction('error'); return; } navigator.vibrate?.([30]); doFinish(activeItem, false, true, defectFromPrev ? 'previous_stage' : 'current'); setShowDefForm(false); } }, 'На переделку'),
                    h('button', { style: gbtn({ minHeight: 52, padding: '8px 14px' }), onClick: () => { navigator.vibrate?.([20]); setShowDefForm(false); setDefectFromPrev(false); setDefFormErrors({}); } }, 'Отмена')
                  )
                )
              : h('div', null,
                  h('button', { className: 'worker-btn worker-btn-stop', style: { marginBottom: 8 }, onClick: () => {
                    vibrateAction('start');
                    if (activeItem.requiresPressureTest || activeItem.name.toLowerCase().includes('опресс')) {
                      setPressureOp(activeItem);
                      setPressureForm({ workPressure: '', testPressure: '', duration: '10', tempC: '', pressureStart: '', pressureEnd: '', sweatingFound: false, defectDesc: '', verdict: 'pass' });
                      setShowPressureForm(true);
                    } else {
                      doFinish(activeItem);
                    }
                  } }, '■ Завершить'),
                  h('div', { style: { display: 'flex', gap: 8 } },
                    h('button', { className: 'worker-btn-defect', style: { flex: 1 }, onClick: () => { navigator.vibrate?.([40]); setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
                    h('button', { className: 'worker-btn-defect', style: { flex: 1 }, onClick: () => { navigator.vibrate?.([40]); setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с уч.')
                  )
                )
          );
        })
      ),

      // QR-операция
      canStartQr && h('div', { style: { ...S.card, border: `1.5px solid ${AM}`, background: AM3, marginBottom: 16 } },
        h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', marginBottom: 6 } }, 'Назначено по QR-коду'),
        h('div', { style: { fontSize: 15, fontWeight: 500, color: AM2, marginBottom: 4 } }, qrOp?.name),
        h('div', { style: { fontSize: 11, color: AM4, marginBottom: 16 } }, data.orders.find(o => o.id === qrOp?.orderId)?.number || ''),
        h('button', { className: 'worker-btn worker-btn-start', onClick: () => { navigator.vibrate?.([30]); doStart(qrOp); } }, '▶ Начать операцию')
      ),

      // Подсказка о достижении
      achHint && !activeOpsList.length && h('div', { style: { fontSize: 11, color: AM, textAlign: 'center', padding: '4px 0', marginBottom: 8 } }, `⭐ ${achHint}`),

      // Список заданий — показываем всегда (параллельный запуск)
      (() => {
        // Скрываем из списка операции которые уже показываются как активные карточки
        const activeIds = new Set(activeOpsList.map(o => o.id));
        const pendingOps = myOps.filter(op => !activeIds.has(op.id));
        return pendingOps.length > 0 && h('div', null,
          h('div', { style: { ...S.sec, marginBottom: 12 } }, 'Задания (' + pendingOps.length + ')'),
          pendingOps.map(op => {
          const order = data.orders.find(o => o.id === op.orderId);
          const deadlineMs = order?.deadline ? new Date(order.deadline).getTime() : null;
          const timeLeft = deadlineMs ? deadlineMs - now() : null;
          const daysLeft = timeLeft ? Math.ceil(timeLeft / 86400000) : null;
          const isUrgent  = daysLeft !== null && daysLeft <= 2;
          const isOverdue = daysLeft !== null && daysLeft < 0;
          const depsComplete = !op.dependsOn || op.dependsOn.length === 0 ||
            op.dependsOn.every(depId => { const d = data.ops.find(x => x.id === depId); return d && (d.status === 'done' || d.status === 'on_check' || d.status === 'approved'); });

          // Проверка: все материалы для этого этапа поставлены?
          const stage = (data.productionStages || []).find(s => s.name === op.name);
          const materialsReady = !stage?.requiredMaterialIds?.length ||
            stage.requiredMaterialIds.every(matId => {
              const del = (data.materialDeliveries || []).find(d => d.orderId === op.orderId && d.materialId === matId);
              return del?.status === 'confirmed' || del?.status === 'partial';
            });
          const canStart = depsComplete && materialsReady;
          // Текст подсказки почему заблокировано
          const blockReason = !depsComplete ? 'Ожидает завершения предыдущих операций'
            : !materialsReady ? '📦 Ожидает поставки материалов'
            : null;

          return h('div', { key: op.id, className: 'op-card-anim', style: {
            ...S.card, marginBottom: 14, opacity: canStart ? 1 : 0.6,
            borderLeft: isOverdue ? `4px solid ${RD}` : isUrgent ? `4px solid ${AM}` : order?.priority === 'critical' ? `4px solid ${RD}` : 'none',
            animationDelay: `${myOps.indexOf(op) * 0.05}s`,
          }},
            h('div', { style: { marginBottom: 10 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                h('div', { style: { flex: 1 } },
                  h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: 2 } }, op.name),
                  h('div', { style: { fontSize: 11, color: AM4, cursor: order ? 'pointer' : 'default', textDecoration: order ? 'underline' : 'none', textDecorationStyle: 'dotted' }, onClick: () => order && setViewOrderId(order.id) }, order?.number || '—'),
                  blockReason && h('div', { style: { fontSize: 11, color: AM2, background: AM3, padding: '2px 8px', borderRadius: 4, marginTop: 4, display: 'inline-block' } }, blockReason)
                ),
                op.isAuxiliary && op.addedByWorker === workerId && (op.status === 'pending' || op.status === 'in_progress') &&
                  h('button', { style: { background: 'none', border: 'none', fontSize: 16, color: '#bbb', cursor: 'pointer', padding: '2px 6px', minHeight: 'auto', lineHeight: 1 },
                    onClick: (e) => { e.stopPropagation(); (async () => { if (await askConfirm({ message: 'Отменить эту работу?', detail: op.name, danger: true })) cancelAuxOp(op); })(); }
                  }, '×')
              ),
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 } },
                order?.priority && h('span', { style: { fontSize: 10, color: PRIORITY[order.priority]?.color } }, PRIORITY[order.priority].label),
                daysLeft !== null && h('span', { style: { fontSize: 11, color: isOverdue ? RD : isUrgent ? AM : '#888', fontWeight: isUrgent ? 500 : 400 } },
                  isOverdue ? `просрочено ${Math.abs(daysLeft)}д` : daysLeft === 0 ? 'сегодня!' : `${daysLeft}д до срока`
                ),
                !depsComplete && h('span', { style: { fontSize: 11, color: '#888' } }, '🔒 ожидает предыдущие')
              )
            ),
            op.comment && h('div', { style: { fontSize: 12, color: '#666', background: '#f8f8f5', padding: '6px 10px', borderRadius: 6, marginBottom: 10 } }, `💬 ${op.comment}`),
            (() => {
              const drawUrl = op.drawingUrl || order?.drawingUrl;
              return drawUrl && h('a', { href: drawUrl, target: '_blank', rel: 'noopener', style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: BL, textDecoration: 'none', padding: '6px 10px', background: '#E3F2FD', borderRadius: 6, marginBottom: 10 } }, '📐 Чертёж / ТЗ');
            })(),
            // СТАРТ — крупная кнопка с отступом сверху
            op.status === 'pending' && depsComplete
              ? h('button', { className: 'worker-btn worker-btn-start', onClick: () => {
                  (async () => { if (await askConfirm({ message: 'Принять изделие в работу?', detail: 'Подтвердите что визуальный осмотр проведён', danger: false })) { navigator.vibrate?.([30]); doStart(op); } })();
                }}, '▶ Принять и начать')
              : op.status === 'pending' && !depsComplete
                ? h('div', { style: { textAlign: 'center', padding: '12px 0', color: '#888', fontSize: 12 } }, 'Ожидание предыдущих этапов')
                : op.status === 'in_progress' && !activeOps.find(ao => ao.id === op.id)
                  ? h('button', { className: 'worker-btn worker-btn-stop', onClick: () => {
                      // Восстанавливаем в activeOps и показываем карточку
                      setActiveOps(prev => prev.find(ao => ao.id === op.id) ? prev : [...prev, op]);
                    }}, '▶ Продолжить / Завершить')
                  : null
          );
        })
      ),

      !active && myOps.length === 0 && h('div', { className: 'empty-state', style: { marginTop: 32 } },
        h('div', { style: { fontSize: 32, marginBottom: 12 } }, '✓'),
        h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: 4 } }, 'Нет активных заданий'),
        h('div', { style: { fontSize: 13, color: '#aaa', marginBottom: 16 } }, 'Новые задания появятся здесь')
      ),

      // Кнопка «Записать доп. работы» — доступна когда нет активной операции
      !active && h('div', { style: { marginTop: myOps.length > 0 ? 8 : 0, marginBottom: 16 } },
        h('button', { style: { ...gbtn({ width: '100%', padding: '14px 16px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }), borderStyle: 'dashed', borderWidth: '1.5px' }, onClick: () => setShowAddOp(true) }, '+ Записать доп. работы')
      ),

      // Модал записи вспомогательных работ
      showAddOp && h('div', {
        role: 'dialog', 'aria-modal': 'true',
        style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }
      },
        h('div', { style: { background: '#fff', borderRadius: 14, padding: 20, width: 'min(420px, calc(100vw - 32px))', maxHeight: '85vh', overflowY: 'auto' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
            h('div', { style: { fontSize: 16, fontWeight: 500 } }, '📝 Дополнительные работы'),
            h('button', { style: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', padding: 4, minHeight: 'auto' }, onClick: () => setShowAddOp(false) }, '×')
          ),
          h('div', { style: { fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.5 } },
            'Запишите работы не входящие в основной маршрут: обслуживание, уборка, наладка, перемещение и другие вспомогательные задачи.'
          ),
          // 🚀 Быстрый старт: последние 5 вспомогательных работ этого рабочего
          (() => {
            const lastAuxWorks = data.ops
              .filter(o => o.isAuxiliary && o.addedByWorker === workerId && !o.archived)
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
              .slice(0, 5);
            if (lastAuxWorks.length === 0) return null;
            return h('div', { style: { marginBottom: 12, padding: 12, background: '#F5F5F2', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.08)' } },
              h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 } }, '⚡ Последние работы'),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                lastAuxWorks.map(op => h('button', {
                  key: op.id,
                  style: { ...gbtn({ fontSize: 11, padding: '6px 10px', textAlign: 'left', width: '100%' }), borderColor: '#999' },
                  onClick: () => setAddOpForm({ category: op.auxCategory || 'other', name: op.name, orderId: op.orderId || '', comment: '' })
                }, `${op.name}${op.orderId ? ` · ${data.orders.find(o => o.id === op.orderId)?.number || ''}` : ''}`))
              )
            );
          })(),
          // Категория работ
          h('div', { style: { marginBottom: 12 } },
            h('label', { style: S.lbl }, 'Категория'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
              AUX_CATEGORIES.map(cat => h('button', {
                key: cat.id,
                style: addOpForm.category === cat.id
                  ? abtn({ fontSize: 12, padding: '8px 12px' })
                  : gbtn({ fontSize: 12, padding: '8px 12px' }),
                onClick: () => setAddOpForm(p => ({ ...p, category: cat.id, name: '' }))
              }, cat.label))
            )
          ),
          // Вид работ — быстрый выбор из шаблонов категории или ввод вручную
          addOpForm.category && h('div', { style: { marginBottom: 12 } },
            h('label', { style: S.lbl }, 'Вид работ'),
            selectedCategory?.names?.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 } },
              selectedCategory.names.map(n => h('button', {
                key: n,
                style: addOpForm.name === n
                  ? { ...abtn({ fontSize: 12, padding: '6px 10px' }), background: GN, color: GN2 }
                  : gbtn({ fontSize: 12, padding: '6px 10px' }),
                onClick: () => setAddOpForm(p => ({ ...p, name: n }))
              }, n))
            ),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('input', {
                style: { ...S.inp, flex: 1 },
                placeholder: addOpForm.category === 'other' ? 'Опишите выполняемую работу...' : 'Или введите свой вариант...',
                value: selectedCategory?.names?.includes(addOpForm.name) ? '' : addOpForm.name,
                onChange: e => setAddOpForm(p => ({ ...p, name: e.target.value })),
                onKeyDown: e => e.key === 'Enter' && addWorkerOp()
              }),
              h(VoiceButton, { onResult: (text) => setAddOpForm(p => ({ ...p, name: text })) })
            )
          ),
          // Привязка к заказу (опционально)
          addOpForm.category && h('div', { style: { marginBottom: 12 } },
            h('label', { style: S.lbl }, 'Привязать к заказу (необязательно)'),
            h('select', { style: { ...S.inp, width: '100%' }, value: addOpForm.orderId, onChange: e => setAddOpForm(p => ({ ...p, orderId: e.target.value })) },
              h('option', { value: '' }, '— без привязки к заказу —'),
              availableOrders.map(o => h('option', { key: o.id, value: o.id }, `${o.number} · ${o.product}`))
            )
          ),
          // Комментарий
          addOpForm.category && h('div', { style: { marginBottom: 16 } },
            h('label', { style: S.lbl }, 'Комментарий (необязательно)'),
            h('div', { style: { display: 'flex', gap: 6 } },
              h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Описание, причина, примечание...', value: addOpForm.comment, onChange: e => setAddOpForm(p => ({ ...p, comment: e.target.value })), onKeyDown: e => e.key === 'Enter' && addWorkerOp() }),
              h(VoiceButton, { onResult: (text) => setAddOpForm(p => ({ ...p, comment: p.comment ? p.comment + ' ' + text : text })) })
            )
          ),
          // Кнопки
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { style: gbtn({ flex: 1 }), onClick: () => { setShowAddOp(false); setAddOpForm({ category: '', name: '', orderId: '', comment: '' }); } }, 'Отмена'),
            h('button', { style: abtn({ flex: 1 }), disabled: !addOpForm.name.trim(), onClick: addWorkerOp }, '+ Записать')
          )
        )
      ),

      // Выполненные (свёрнуто)
      (() => {
        const doneOps = data.ops.filter(o => o.workerIds?.includes(workerId) && (o.status === 'done' || o.status === 'defect' || o.status === 'on_check') && !o.archived)
          .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
        if (!doneOps.length) return null;
        return h('div', { style: { marginTop: 16 } },
          h('button', { style: { background: 'none', border: 'none', fontSize: 13, color: AM, cursor: 'pointer', padding: '4px 0', fontWeight: 500, minHeight: 'auto' }, onClick: () => setShowHistory(v => !v) },
            showHistory ? `▾ Скрыть выполненные (${doneOps.length})` : `▸ Выполненные операции (${doneOps.length})`
          ),
          showHistory && h('div', { style: { marginTop: 10 } },
            doneOps.slice(0, 20).map(op => {
              const order = data.orders.find(o => o.id === op.orderId);
              const dur = op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : '—';
              const isExp = historyOp === op.id;
              return h('div', { key: op.id, style: { ...S.card, marginBottom: 6, padding: 10, cursor: 'pointer', borderLeft: op.status === 'defect' ? `3px solid ${RD}` : op.status === 'on_check' ? `3px solid ${BL}` : `3px solid ${GN}` }, onClick: () => setHistoryOp(isExp ? null : op.id) },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                  h('div', null,
                    h('div', { style: { fontSize: 13, fontWeight: 500 } }, op.name),
                    h('div', { style: { fontSize: 11, color: '#888', cursor: order ? 'pointer' : 'default', textDecoration: order ? 'underline' : 'none', textDecorationStyle: 'dotted' }, onClick: () => order && setViewOrderId(order.id) }, `${order?.number || '—'} · ${dur}`)
                  ),
                  h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } }, h(Badge, { st: op.status }), h('span', { style: { fontSize: 10, color: '#aaa' } }, isExp ? '▾' : '▸'))
                ),
                isExp && h('div', { style: { marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12 } },
                  h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' } },
                    h('div', null, h('span', { style: { color: '#888' } }, 'Начало: '), op.startedAt ? new Date(op.startedAt).toLocaleTimeString() : '—'),
                    h('div', null, h('span', { style: { color: '#888' } }, 'Длит.: '), dur),
                    op.plannedHours && h('div', null, h('span', { style: { color: '#888' } }, 'План: '), `${op.plannedHours}ч`)
                  ),
                  op.defectNote && h('div', { style: { marginTop: 4, color: RD } }, h('span', { style: { color: '#888' } }, 'Дефект: '), op.defectNote),
                  op.comment && h('div', { style: { marginTop: 4 } }, h('span', { style: { color: '#888' } }, 'Комментарий: '), op.comment)
                )
              );
            })
          )
        );
        })()
      })(),

      // Модалки
      showDowntimeModal && h('div', { role: 'dialog', 'aria-modal': 'true', style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 } },
        h('div', { className: 'modal-content', style: { background: '#fff', borderRadius: 14, padding: 20, width: 'min(380px, calc(100vw - 24px))', maxHeight: '85vh', overflowY: 'auto' } },
          h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: 4, textAlign: 'center' } }, 'Фиксация простоя'),
          h(ElapsedTimer, { startedAt: downtimeStartedAt, style: { fontSize: 28, fontWeight: 500, color: RD, textAlign: 'center', margin: '10px 0', display: 'block' } }),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 } },
            data.downtimeTypes.map(dt => h('button', { key: dt.id, style: { padding: '14px 16px', fontSize: 14, fontWeight: selectedDowntimeType === dt.id ? 500 : 400, borderRadius: 10, border: selectedDowntimeType === dt.id ? `2px solid ${AM}` : '1px solid rgba(0,0,0,0.12)', background: selectedDowntimeType === dt.id ? AM3 : '#fff', color: selectedDowntimeType === dt.id ? AM2 : '#333', cursor: 'pointer', textAlign: 'left', minHeight: 52 }, onClick: () => setSelectedDowntimeType(dt.id) }, dt.name))
          ),
          data.equipment.length > 0 && h('div', { style: { marginBottom: 12 } },
            h('div', { style: { fontSize: 12, color: '#888', marginBottom: 6 } }, 'Оборудование:'),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              h('button', { style: { padding: '8px 12px', fontSize: 12, borderRadius: 8, border: !downtimeEquipmentId ? `2px solid ${AM}` : '1px solid rgba(0,0,0,0.12)', background: !downtimeEquipmentId ? AM3 : '#fff', color: !downtimeEquipmentId ? AM2 : '#666', cursor: 'pointer', minHeight: 40 }, onClick: () => setDowntimeEquipmentId('') }, 'Не связано'),
              data.equipment.filter(eq => eq.status === 'active').map(eq => h('button', { key: eq.id, style: { padding: '8px 12px', fontSize: 12, borderRadius: 8, border: downtimeEquipmentId === eq.id ? `2px solid ${AM}` : '1px solid rgba(0,0,0,0.12)', background: downtimeEquipmentId === eq.id ? AM3 : '#fff', color: downtimeEquipmentId === eq.id ? AM2 : '#666', cursor: 'pointer', minHeight: 40 }, onClick: () => setDowntimeEquipmentId(eq.id) }, eq.name))
            )
          ),
          h('div', { style: { display: 'flex', gap: 10, marginTop: 10 } },
            h('button', { style: gbtn({ flex: 1, padding: '14px', fontSize: 14 }), onClick: () => { setShowDowntimeModal(false); setSelectedDowntimeType(''); setDowntimeStartedAt(null); setDowntimeEquipmentId(''); } }, 'Отмена'),
            h('button', { style: rbtn({ flex: 1, padding: '14px', fontSize: 14, fontWeight: 500 }), onClick: () => { vibrateAction('finish'); recordDowntime(); }, disabled: !selectedDowntimeType }, 'Завершить простой')
          )
        )
      ),
      showQRScanner && h(QRScannerModal, { onScan: (text) => {
        setShowQRScanner(false);
        try {
          let opId = text.trim();
          try { const url = new URL(text); opId = url.searchParams.get('opId') || opId; } catch(e) {}
          if (!opId) { addToast('QR-код не содержит ID операции', 'error'); return; }
          const op = data.ops.find(o => o.id === opId);
          if (!op) { addToast('Операция не найдена', 'error'); return; }
          if (op.status === 'done' || op.status === 'defect') { addToast('Операция уже завершена', 'info'); return; }
          setActiveOps(prev => prev.find(a => a.id === op.id) ? prev : [...prev, op]); addToast('Операция найдена: ' + op.name, 'success');
        } catch(e) { addToast('Неверный QR-код', 'error'); }
      }, onClose: () => setShowQRScanner(false) }),
      showMaterialModal && h(MaterialConsumptionModal, { data, opId: pendingFinishOp?.id, onSave: saveMaterialConsumption, onSkip: () => { setShowMaterialModal(false); setPendingFinishOp(null); } }),

      // Кнопка QR — фиксированная
      h('div', { style: { position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', right: 20, zIndex: 40 } },
        h('button', { style: { ...abtn({ padding: '0', fontSize: 20, borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }) }, onClick: () => setShowQRScanner(true), title: 'Сканировать QR-код' }, '📷')
      )
    ),

    // ════════════════════════════════════════════
    // ВКЛАДКА: МОЙ ПРОФИЛЬ
    // ════════════════════════════════════════════
    workerTab === 'profile' && h('div', null,
      // Карточка сотрудника
      h('div', { style: { ...S.card, display: 'flex', alignItems: 'center', gap: 14, padding: 16, marginBottom: 16 } },
        h('div', { style: { width: 56, height: 56, borderRadius: '50%', background: AM3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 500, color: AM2, flexShrink: 0, position: 'relative' } },
          worker?.name?.charAt(0) || '?',
          h('div', { style: { position: 'absolute', bottom: -4, right: -4, background: AM, color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, lvl)
        ),
        h('div', { style: { flex: 1 } },
          h('div', { style: { fontSize: 16, fontWeight: 500, marginBottom: 2 } }, worker?.name || 'Сотрудник'),
          h('div', { style: { fontSize: 12, color: '#888', marginBottom: 6 } },
            [worker?.position, worker?.grade ? `разряд ${worker.grade}` : null].filter(Boolean).join(' · ') || getLevelTitle(lvl)
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { flex: 1, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' } },
              h('div', { style: { width: `${prog * 100}%`, height: 6, background: AM, borderRadius: 3 } })
            ),
            h('div', { style: { fontSize: 11, color: '#888', whiteSpace: 'nowrap' } }, `→ Ур.${lvl + 1}`)
          )
        )
      ),

      // KPI — 2×2 сетка
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 } },
        h(MC, { v: `${myStats.quality}%`, l: 'Качество / 30 дней', c: myStats.quality >= 95 ? GN : myStats.quality >= 80 ? AM : RD, fs: 28 }),
        h(MC, { v: myStats.done30, l: 'Операций / 30 дней', c: AM, fs: 28 }),
        h(MC, { v: fmtDur(myStats.workedToday), l: 'Отработано сегодня', c: AM2, fs: 22 }),
        h(MC, { v: `🤝${myStats.thanksCount}`, l: 'Благодарности', c: myStats.thanksCount > 0 ? '#F57F17' : '#888', fs: 28, onClick: () => setShowThanksHistory(v => !v) })
      ),

      // История благодарностей
      showThanksHistory && myStats.recentThanks.length > 0 && h('div', { style: { ...S.card, marginBottom: 16, padding: 12 } },
        myStats.recentThanks.map((t, i) => h('div', { key: i, style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 13 } },
          h('div', null, h('span', { style: { fontWeight: 500 } }, `🤝 ${t.from}`), t.note && h('span', { style: { color: '#888', marginLeft: 6 } }, t.note)),
          h('div', { style: { fontSize: 11, color: '#888' } }, new Date(t.ts).toLocaleDateString())
        ))
      ),

      // Часы — личный табель
      h(WorkerHoursBlock, { workerId, data, activeOpsList }),

      // Зарплата
      h(WorkerSalaryBlock, { workerId, data }),

      // Достижения
      h('div', { style: { ...S.sec, marginBottom: 12 } }, 'Достижения'),
      achHint && h('div', { style: { ...S.card, padding: '10px 14px', marginBottom: 12, background: AM3, border: `0.5px solid ${AM4}` } },
        h('div', { style: { fontSize: 11, color: AM4, marginBottom: 3 } }, 'Следующее'),
        h('div', { style: { fontSize: 13, fontWeight: 500, color: AM2 } }, `⭐ Осталось ${achHint}`)
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        Object.entries(ACHIEVEMENTS).slice(0, showAchievements ? undefined : 6).map(([id, a]) => {
          const earned = ach.includes(id);
          const pr = achProgress[id];
          const pct = pr ? Math.min(100, Math.round(pr.cur / pr.target * 100)) : 0;
          return h('div', { key: id, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: earned ? AM3 : '#f8f8f5', border: `0.5px solid ${earned ? AM4 : 'rgba(0,0,0,0.06)'}` } },
            h('span', { style: { fontSize: 22, opacity: earned ? 1 : 0.25, flexShrink: 0 } }, a.icon),
            h('div', { style: { flex: 1 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                h('span', { style: { fontSize: 13, fontWeight: 500, color: earned ? AM2 : '#888' } }, a.title),
                earned ? h('span', { style: { fontSize: 12, color: GN } }, '✓') : pr && h('span', { style: { fontSize: 11, color: '#888' } }, `${pr.cur}/${pr.target}`)
              ),
              !earned && pr && h('div', { style: { height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' } },
                h('div', { style: { height: 4, background: pct >= 80 ? GN : AM, borderRadius: 2, width: `${pct}%` } })
              )
            )
          );
        })
      ),
      Object.keys(ACHIEVEMENTS).length > 6 && h('button', { style: { background: 'none', border: 'none', fontSize: 13, color: AM, cursor: 'pointer', padding: '10px 0', width: '100%', minHeight: 'auto' }, onClick: () => setShowAchievements(v => !v) },
        showAchievements ? '▾ Скрыть' : `▸ Показать все (${Object.keys(ACHIEVEMENTS).length})`
      )
    )
  ),
  showPressureForm && pressureOp && h('div', {
    role: 'dialog', 'aria-modal': 'true',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '16px', overflowY: 'auto' },
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card)', borderRadius: 12, padding: 0, width: 'min(480px, calc(100vw - 32px))', overflow: 'hidden' } },

      h('div', { style: { background: '#1a1a18', padding: '14px 18px', color: '#fff' } },
        h('div', { style: { fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 3 } }, 'Протокол гидравлического испытания'),
        h('div', { style: { fontSize: 15, fontWeight: 500 } }, pressureOp.name),
        h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 } },
          (() => { const o = data.orders.find(x => x.id === pressureOp.orderId); return o ? `Заказ ${o.number} · ${o.product}` : ''; })()
        )
      ),

      h('div', { style: { padding: '16px 18px' } },

        // Параметры испытания
        h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 } }, 'Параметры испытания'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 } },
          ['workPressure:Рабочее давление, бар', 'testPressure:Давление испытания, бар', 'duration:Выдержка, мин', 'tempC:Темп. воды, °С'].map(s => {
            const [key, label] = s.split(':');
            return h('div', { key },
              h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 3 } }, label),
              h('input', { type: 'number', step: '0.1', style: { width: '100%', fontSize: 14, padding: '7px 10px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--fg)' },
                value: pressureForm[key] || '', onChange: e => setPressureForm(p => ({ ...p, [key]: e.target.value })) })
            );
          })
        ),

        // Результаты замеров
        h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 } }, 'Результаты замеров'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 } },
          ['pressureStart:Давление в начале, бар', 'pressureEnd:Давление в конце, бар'].map(s => {
            const [key, label] = s.split(':');
            return h('div', { key },
              h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 3 } }, label),
              h('input', { type: 'number', step: '0.01', style: { width: '100%', fontSize: 14, padding: '7px 10px', border: '0.5px solid var(--border)', borderRadius: 7, background: 'var(--card)', color: 'var(--fg)' },
                value: pressureForm[key] || '', onChange: e => setPressureForm(p => ({ ...p, [key]: e.target.value })) })
            );
          })
        ),

        // Потение швов
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13 } },
          h('input', { type: 'checkbox', checked: pressureForm.sweatingFound, onChange: e => setPressureForm(p => ({ ...p, sweatingFound: e.target.checked })), style: { width: 18, height: 18 } }),
          'Обнаружено потение швов / течи'
        ),

        // Дефекты
        pressureForm.sweatingFound && h('div', { style: { marginBottom: 12 } },
          h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 3 } }, 'Описание дефектов (место, характер)'),
          h('textarea', { rows: 2, style: { width: '100%', fontSize: 13, padding: '7px 10px', border: `0.5px solid #E24B4A`, borderRadius: 7, background: 'var(--card)', color: 'var(--fg)', resize: 'vertical' },
            value: pressureForm.defectDesc, onChange: e => setPressureForm(p => ({ ...p, defectDesc: e.target.value })), placeholder: 'Шов №3, сварное соединение фланца...' })
        ),

        // Вердикт
        h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 } }, 'Результат испытания'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
          h('button', { onClick: () => setPressureForm(p => ({ ...p, verdict: 'pass', sweatingFound: false })),
            style: { flex: 1, padding: '10px', border: `2px solid ${pressureForm.verdict === 'pass' ? '#1D9E75' : 'var(--border)'}`, borderRadius: 8, background: pressureForm.verdict === 'pass' ? 'rgba(29,158,117,0.1)' : 'transparent', color: pressureForm.verdict === 'pass' ? '#1D9E75' : 'var(--fg)', cursor: 'pointer', fontWeight: 500, fontSize: 14 } },
            '✓ Выдержал'
          ),
          h('button', { onClick: () => setPressureForm(p => ({ ...p, verdict: 'fail', sweatingFound: true })),
            style: { flex: 1, padding: '10px', border: `2px solid ${pressureForm.verdict === 'fail' ? '#E24B4A' : 'var(--border)'}`, borderRadius: 8, background: pressureForm.verdict === 'fail' ? 'rgba(226,75,74,0.1)' : 'transparent', color: pressureForm.verdict === 'fail' ? '#E24B4A' : 'var(--fg)', cursor: 'pointer', fontWeight: 500, fontSize: 14 } },
            '✕ Не выдержал'
          )
        ),

        // Кнопки действий
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { onClick: savePressureTest,
            style: { flex: 1, padding: '12px', background: pressureForm.verdict === 'pass' ? '#1D9E75' : '#E24B4A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, fontSize: 14 } },
            pressureForm.verdict === 'pass' ? '✓ Сохранить протокол' : '⚠ Зафиксировать дефект'
          ),
          h('button', { onClick: () => { setShowPressureForm(false); setPressureOp(null); },
            style: { padding: '12px 16px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13 } },
            'Отмена'
          )
        )
      )
    )
  ),

  viewOrderId && h(OrderCardModal, {
    orderId: viewOrderId, data,
    onClose: () => setViewOrderId(null),
    canEdit: false,
  }),
  confirmEl
  );
});
