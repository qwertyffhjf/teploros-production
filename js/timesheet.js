// teploros · timesheet.js
// Автоматически извлечено из монолита

// ==================== MasterTimeTracking ====================
// ── Вспомогательная функция: данные одного дня для сотрудника ──
// Определяет является ли день рабочим по графику из настроек
const isWorkday = (year, month, day, settings) => {
  const ws = settings?.workSchedule || { type: '5/2' };
  const date = new Date(year, month, day);
  const dow = date.getDay(); // 0=вс, 6=сб

  if (ws.type === '5/2') return dow !== 0 && dow !== 6;
  if (ws.type === '6/1') return dow !== 0;

  // Сменные графики: нужна дата начала
  if (!ws.startDate) {
    // Fallback: 5/2 если дата не задана
    return dow !== 0 && dow !== 6;
  }

  const patterns = {
    '2/2': [1, 1, 0, 0],
    '3/3': [1, 1, 1, 0, 0, 0],
    '4/2': [1, 1, 1, 1, 0, 0],
  };

  const pattern = ws.type === 'custom'
    ? (ws.customPattern || [])
    : (patterns[ws.type] || [1, 1, 1, 1, 1, 0, 0]);

  if (!pattern.length) return dow !== 0 && dow !== 6;

  const start = new Date(ws.startDate);
  const diffDays = Math.floor((date - start) / 86400000);
  const idx = ((diffDays % pattern.length) + pattern.length) % pattern.length;
  return pattern[idx] === 1;
};

const calcDayData = (workerId, year, month, day, data) => {
  if (!isWorkday(year, month, day, data.settings)) return { type: 'we', code: 'В', h: 0 };

  // ── Приоритет 1: ручной ввод в табеле (мастер вписал часы/код) ──
  const tsKey = `${year}-${String(month+1).padStart(2,'0')}`;
  const tsVal = (data.timesheet || {})[tsKey]?.[workerId]?.[day];
  if (tsVal) {
    if (tsVal.code === 'Б')  return { type: 'sick', code: 'Б', h: 0, src: 'табель' };
    if (tsVal.code === 'ОТ') return { type: 'vac', code: 'ОТ', h: 0, src: 'табель' };
    if (tsVal.code === 'ОЗ') return { type: 'vac', code: 'ОЗ', h: 0, src: 'табель' };
    if (tsVal.code === 'К')  return { type: 'full', code: 'К', h: tsVal.h || 8, src: 'табель' };
    if (tsVal.code === 'НН') return { type: 'abs', code: 'НН', h: 0, src: 'табель' };
    if (tsVal.code === 'СД') return { type: 'ops', code: 'СД', h: 0, src: 'сдельная' };
    if (tsVal.h != null && tsVal.h > 0) return { type: tsVal.h >= 8 ? 'full' : 'ops', code: 'Я', h: tsVal.h, src: 'табель' };
  }

  const w = data.workers.find(x => x.id === workerId);
  const dayStart = new Date(year, month, day).getTime();
  const dayEnd   = new Date(year, month, day, 23, 59, 59, 999).getTime();
  // Статус сотрудника как источник кода
  if (w?.status === 'sick')     return { type: 'sick', code: 'Б',  h: 0, src: 'статус' };
  if (w?.status === 'vacation') return { type: 'vac',  code: 'ОТ', h: 0, src: 'статус' };
  // Ручные отметки
  const checkin  = data.events.find(e => e.workerId === workerId && e.type === 'checkin_manual'  && e.ts >= dayStart && e.ts <= dayEnd);
  const checkout = data.events.find(e => e.workerId === workerId && e.type === 'checkout_manual' && e.ts >= dayStart && e.ts <= dayEnd);
  if (checkin && checkout) {
    const h = Math.round((checkout.ts - checkin.ts) / 3600000 * 10) / 10;
    const hR = Math.min(h, 12);
    return { type: 'full', code: 'Я', h: hR, src: 'ручная отметка', inn: new Date(checkin.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), out: new Date(checkout.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) };
  }
  if (checkin) {
    return { type: 'half', code: 'Я', h: 0, src: 'ручная отметка', inn: new Date(checkin.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), out: '—' };
  }
  // По операциям
  const dayOps = data.ops.filter(o => o.workerIds?.includes(workerId) && o.status === 'done' && o.startedAt >= dayStart && o.finishedAt <= dayEnd && o.startedAt && o.finishedAt);
  if (dayOps.length > 0) {
    const firstStart = Math.min(...dayOps.map(o => o.startedAt));
    const lastEnd    = Math.max(...dayOps.map(o => o.finishedAt));
    const h = Math.round((lastEnd - firstStart) / 3600000 * 10) / 10;
    return { type: 'ops', code: 'Я', h: Math.min(h, 12), src: 'по операциям', inn: new Date(firstStart).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), out: new Date(lastEnd).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), ops: dayOps.length };
  }
  // Авто-checkin
  const autoIn = data.events.find(e => e.workerId === workerId && e.type === 'checkin_auto' && e.ts >= dayStart && e.ts <= dayEnd);
  if (autoIn) return { type: 'half', code: 'Я', h: 0, src: 'автоматически', inn: new Date(autoIn.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }), out: '—' };
  return { type: 'abs', code: 'НН', h: 0, src: 'нет данных' };
};

const MasterTimeTracking = memo(({ data, onUpdate, addToast, onWorkerClick }) => {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [selWorker, setSelWorker] = useState('');
  const [activeCell, setActiveCell] = useState(null); // {workerId, day, rect}
  const [popupVal,  setPopupVal]  = useState('');
  const [showImport, setShowImport] = useState(false);
  const [pasteText, setPasteText]  = useState('');
  const tableRef = useRef(null);
  const inputRef = useRef(null);

  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
  const CODES = ['Б','ОТ','ОЗ','К','НН','У','СД'];
  const CODE_LABELS = {
    'Б':  'Б — больничный (нетрудоспособность)',
    'ОТ': 'ОТ — очередной отпуск',
    'ОЗ': 'ОЗ — отпуск за свой счёт',
    'К':  'К — служебная командировка',
    'НН': 'НН — неявка по невыясненной причине',
    'У':  'У — уволен',
    'СД': 'СД — сдельная оплата труда',
  };

  const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  
  // Показываем: активных + уволенных В МЕСЯЦЕ ПРОСМОТРА
  const monthStart = new Date(viewYear, viewMonth, 1).getTime();
  const monthEnd = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).getTime();
  
  const activeWorkers = useMemo(() => data.workers.filter(w => {
    if (!w.archived) return true;
    // Уволенный — показываем только в месяц увольнения
    if (w.dismissedAt) {
      return w.dismissedAt >= monthStart && w.dismissedAt <= monthEnd;
    }
    return false;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')), [data.workers, viewYear, viewMonth]);
  
  const showWorkers = selWorker ? activeWorkers.filter(w => w.id === selWorker) : activeWorkers;

  // Итерация 6.2: мгновенное обновление экрана, сохранение на сервер с задержкой.
  // onUpdate здесь = App.save(), который уже включает DB.save(). Чтобы не вызывать
  // его при каждом клике, разделяем: экран обновляем сразу через локальный стейт,
  // а onUpdate (= save) вызываем один раз через 1.5 сек после последнего нажатия.
  const tsTimerRef = useRef(null);
  const tsPendingRef = useRef(null);
  const [localTs, setLocalTs] = useState(null);
  // Сбрасываем локальный стейт когда data.timesheet обновится с сервера
  useEffect(() => { setLocalTs(null); }, [data.timesheet]);
  // Эффективный timesheet: локальный (если есть правки) или серверный
  const effectiveTs = localTs || data.timesheet || {};

  // Читаем сохранённые значения табеля из effectiveTs[YYYY-MM][workerId][day]
  const tsKey = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
  const tsData = (effectiveTs)[tsKey] || {};

  const getCellVal = (workerId, day) => {
    // Если сотрудник уволен — после даты увольнения автоматически "У"
    const worker = data.workers.find(w => w.id === workerId);
    if (worker?.dismissedAt) {
      const dismissDay = new Date(worker.dismissedAt).getDate();
      const dismissMonth = new Date(worker.dismissedAt).getMonth();
      const dismissYear = new Date(worker.dismissedAt).getFullYear();
      if (viewYear === dismissYear && viewMonth === dismissMonth && day > dismissDay) {
        return { code: 'У' };
      }
    }
    return tsData[workerId]?.[day] || null;
  };

  const scheduleTs = useCallback((newData) => {
    tsPendingRef.current = newData;
    if (tsTimerRef.current) clearTimeout(tsTimerRef.current);
    tsTimerRef.current = setTimeout(() => {
      const toSave = tsPendingRef.current;
      if (toSave) {
        tsPendingRef.current = null;
        onUpdate(toSave); // одно сохранение пакетом
      }
    }, 1500);
  }, [onUpdate]);

  // Очистка таймера + финальное сохранение при размонтировании
  useEffect(() => () => {
    if (tsTimerRef.current) clearTimeout(tsTimerRef.current);
    if (tsPendingRef.current) {
      onUpdate(tsPendingRef.current);
      tsPendingRef.current = null;
    }
  }, []);

  const setCellVal = useCallback((workerId, day, val) => {
    const key = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
    const newTs = {
      ...(effectiveTs),
      [key]: {
        ...((effectiveTs)[key] || {}),
        [workerId]: {
          ...(((effectiveTs)[key] || {})[workerId] || {}),
          [day]: val || null
        }
      }
    };
    // Мгновенно обновляем экран через локальный стейт
    setLocalTs(newTs);
    // Планируем сохранение на сервер (одно, через 1.5 сек)
    scheduleTs({ ...data, timesheet: newTs });
  }, [data, effectiveTs, viewYear, viewMonth, scheduleTs]);

  const openPopup = useCallback((workerId, day) => {
    const val = getCellVal(workerId, day);
    setActiveCell({ workerId, day });
    setPopupVal(val?.h != null ? String(val.h) : val?.code || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const saveCell = useCallback(() => {
    if (!activeCell) return;
    const { workerId, day } = activeCell;
    const h = parseFloat(popupVal);
    if (!isNaN(h) && h >= 0 && h <= 24) {
      setCellVal(workerId, day, { h, code: null });
    }
    setActiveCell(null); setPopupVal('');
  }, [activeCell, popupVal, setCellVal]);

  const setCode = useCallback((code) => {
    if (!activeCell) return;
    const { workerId, day } = activeCell;
    setCellVal(workerId, day, code ? { h: null, code } : null);
    setActiveCell(null); setPopupVal('');
  }, [activeCell, setCellVal]);

  const cellStyle = (val) => {
    // Раньше здесь были захардкоженные светлые hex — всегда одинаковые
    // независимо от темы, из-за чего в тёмном режиме ячейки выглядели
    // как светлые пятна на тёмном фоне. Теперь используются семантические
    // --st-* токены, которые уже определены отдельно для light/dark.
    if (!val) return { bg: 'var(--card-2)', cl: 'var(--muted)', lbl: '·' };
    if (val.code === 'Б')  return { bg: 'var(--st-al-bg)',    cl: 'var(--st-al-cl)',    lbl: 'Б' };
    if (val.code === 'ОТ') return { bg: 'var(--st-run-bg)',   cl: 'var(--st-run-cl)',   lbl: 'ОТ' };
    if (val.code === 'ОЗ') return { bg: 'var(--st-warn-bg)',  cl: 'var(--st-warn-cl)',  lbl: 'ОЗ' };
    if (val.code === 'К')  return { bg: 'var(--st-ok-bg)',    cl: 'var(--st-ok-cl)',    lbl: 'К' };
    if (val.code === 'НН') return { bg: 'var(--st-pending-bg)', cl: 'var(--st-pending-cl)', lbl: 'НН' };
    if (val.code === 'У')  return { bg: 'var(--card-2)',      cl: 'var(--muted)',       lbl: 'У' };
    if (val.code === 'СД') return { bg: 'var(--st-chk-bg)',   cl: 'var(--st-chk-cl)',   lbl: 'СД' };
    if (val.h >= 8) return { bg: GN3, cl: GN2, lbl: val.h };
    if (val.h > 0)  return { bg: AM3, cl: AM2, lbl: val.h };
    return { bg: 'var(--card-2)', cl: 'var(--muted)', lbl: '·' };
  };

  const exportXlsx = useCallback(() => {
    try {
      const wb = XLSX.utils.book_new();
      const orgName = data.settings?.welcomeTitle || 'teploros';
      const orgSub = data.settings?.welcomeSubtitle || '';
      const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();

      // Собираем данные через calcDayData (табель + операции + статусы)
      const wData = showWorkers.map((w, idx) => {
        let h1Days = 0, h1Hours = 0, h2Days = 0, h2Hours = 0;
        const absences = {};
        const dayCells = {};
        for (let d = 1; d <= lastDay; d++) {
          const dd = calcDayData(w.id, viewYear, viewMonth, d, data);
          dayCells[d] = dd;
          if (dd.code === 'В') continue;
          if (dd.h > 0) {
            if (d <= 15) { h1Days++; h1Hours += dd.h; } else { h2Days++; h2Hours += dd.h; }
          }
          if (dd.code && dd.code !== 'Я' && dd.code !== 'В') {
            absences[dd.code] = (absences[dd.code] || 0) + 1;
          }
        }
        const absPairs = Object.entries(absences).slice(0, 2);
        return { w, idx: idx + 1, dayCells, h1Days, h1Hours: Math.round(h1Hours * 10) / 10, h2Days, h2Hours: Math.round(h2Hours * 10) / 10, totalDays: h1Days + h2Days, totalHours: Math.round((h1Hours + h2Hours) * 10) / 10, absPairs };
      });

      const rows = [];
      // Шапка
      rows.push([orgName + (orgSub ? ' · ' + orgSub : ''), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Форма по ОКУД 0301008']);
      rows.push([]);
      rows.push(['', '', '', '', '', '', '', 'ТАБЕЛЬ УЧЁТА РАБОЧЕГО ВРЕМЕНИ']);
      rows.push(['', '', '', '', '', '', '', 'за ' + monthNames[viewMonth] + ' ' + viewYear + ' г.', '', '', '', 'Номер: ' + (viewMonth + 1), '', 'Дата: ' + lastDay + '.' + String(viewMonth + 1).padStart(2, '0') + '.' + viewYear]);
      rows.push([]);

      // Заголовки
      const hRow = ['№', 'ФИО', 'Должность', 'Таб.№'];
      for (let d = 1; d <= 15; d++) hRow.push(d);
      hRow.push('I пол.дн', 'I пол.ч');
      for (let d = 16; d <= lastDay; d++) hRow.push(d);
      hRow.push('II пол.дн', 'II пол.ч', 'Итого дн', 'Итого ч', 'Код', 'Дни', 'Код', 'Дни');
      rows.push(hRow);

      // Дни недели
      const dowRow = ['', '', '', ''];
      for (let d = 1; d <= 15; d++) dowRow.push(['вс','пн','вт','ср','чт','пт','сб'][new Date(viewYear, viewMonth, d).getDay()]);
      dowRow.push('', '');
      for (let d = 16; d <= lastDay; d++) dowRow.push(['вс','пн','вт','ср','чт','пт','сб'][new Date(viewYear, viewMonth, d).getDay()]);
      rows.push(dowRow);

      // Данные — на каждого сотрудника 2 строки: коды и часы
      wData.forEach(wd => {
        const { w, idx, dayCells, h1Days, h1Hours, h2Days, h2Hours, totalDays, totalHours, absPairs } = wd;
        // Строка кодов
        const codeRow = [idx, w.name, w.position || '', (w.id || '').slice(-3)];
        for (let d = 1; d <= 15; d++) codeRow.push(dayCells[d]?.code || '');
        codeRow.push(h1Days, h1Hours);
        for (let d = 16; d <= lastDay; d++) codeRow.push(dayCells[d]?.code || '');
        codeRow.push(h2Days, h2Hours, totalDays, totalHours);
        codeRow.push(absPairs[0]?.[0] || '', absPairs[0]?.[1] || '', absPairs[1]?.[0] || '', absPairs[1]?.[1] || '');
        rows.push(codeRow);
        // Строка часов
        const hourRow = ['', '', '', ''];
        for (let d = 1; d <= 15; d++) hourRow.push(dayCells[d]?.h > 0 ? dayCells[d].h : '');
        hourRow.push('', '');
        for (let d = 16; d <= lastDay; d++) hourRow.push(dayCells[d]?.h > 0 ? dayCells[d].h : '');
        rows.push(hourRow);
      });

      rows.push([]);
      rows.push(['Ответственное лицо', '', '_______________', '', '/_______________/', '', '', '', 'Руководитель', '', '_______________', '', '/_______________/']);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      // Ширины колонок
      const cols = [{ wch: 4 }, { wch: 22 }, { wch: 12 }, { wch: 6 }];
      for (let i = 0; i < 15; i++) cols.push({ wch: 4 });
      cols.push({ wch: 6 }, { wch: 6 });
      for (let d = 16; d <= lastDay; d++) cols.push({ wch: 4 });
      cols.push({ wch: 6 }, { wch: 6 }, { wch: 7 }, { wch: 7 }, { wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 4 });
      ws['!cols'] = cols;

      XLSX.utils.book_append_sheet(wb, ws, 'T-13');
      XLSX.writeFile(wb, 'T-13_' + String(viewMonth + 1).padStart(2, '0') + '_' + viewYear + '.xlsx');
      addToast('Табель Т-13 выгружен', 'success');
    } catch(e) {
      console.error('Export T-13 error:', e);
      addToast('Ошибка экспорта: ' + e.message, 'error');
    }
  }, [showWorkers, viewYear, viewMonth, data, addToast]);

  const doImport = useCallback(() => {
    if (!pasteText.trim()) return;
    const rows = pasteText.trim().split('\n').map(r => r.split('\t'));
    let imported = 0;
    const newTs = { ...(effectiveTs) };
    const key = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
    if (!newTs[key]) newTs[key] = {};
    rows.forEach(row => {
      if (row.length < 2) return;
      const name = row[0].trim().toLowerCase();
      const w = activeWorkers.find(w => w.name.toLowerCase().includes(name.split(' ')[0]));
      if (!w) return;
      if (!newTs[key][w.id]) newTs[key][w.id] = {};
      row.slice(1).forEach((cell, i) => {
        const d = i + 1; if (d > dim) return;
        const v = cell.trim();
        if (!v || v === 'В' || v === '-') return;
        const h = parseFloat(v);
        if (!isNaN(h) && h >= 0 && h <= 24) { newTs[key][w.id][d] = { h, code: null }; imported++; }
        else if (CODES.includes(v)) { newTs[key][w.id][d] = { h: null, code: v }; imported++; }
      });
    });
    setLocalTs(newTs);
    scheduleTs({ ...data, timesheet: newTs });
    setPasteText(''); setShowImport(false);
    addToast(`Импортировано: ${imported} ячеек`, 'success');
  }, [pasteText, data, effectiveTs, viewYear, viewMonth, activeWorkers, dim, scheduleTs, addToast]);

  // Закрытие попапа по Escape/Enter
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setActiveCell(null); setPopupVal(''); }
      if (e.key === 'Enter' && activeCell) saveCell();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCell, saveCell]);

  const workerName = activeCell ? activeWorkers.find(w => w.id === activeCell.workerId)?.name?.split(' ')[0] : '';

  return h('div', null,
    // Шапка
    h('div', { style: { display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:14 } },
      h('button', { style: gbtn({ padding:'6px 12px' }), onClick: () => { let m=viewMonth-1,y=viewYear; if(m<0){m=11;y--;} setViewMonth(m); setViewYear(y); setActiveCell(null); } }, '‹'),
      h('span', { style: { fontSize:15, fontWeight:500, minWidth:140, textAlign:'center' } }, `${MONTHS_RU[viewMonth]} ${viewYear}`),
      h('button', { style: gbtn({ padding:'6px 12px' }), onClick: () => { let m=viewMonth+1,y=viewYear; if(m>11){m=0;y++;} setViewMonth(m); setViewYear(y); setActiveCell(null); } }, '›'),
      h('select', { style: { ...S.inp, width:'auto', fontSize:13 }, value: selWorker, onChange: e => setSelWorker(e.target.value) },
        h('option', { value:'' }, 'Все сотрудники'),
        activeWorkers.map(w => h('option', { key:w.id, value:w.id }, w.name))
      ),
      h('button', { style: gbtn({ fontSize:12 }), onClick: () => setShowImport(v => !v) }, '📋 Импорт'),
      h('button', { style: abtn({ fontSize:12, marginLeft:'auto' }), onClick: exportXlsx }, '📥 Т-13 Excel')
    ),

    // Импорт
    showImport && h('div', { style: { ...S.card, border:`1px dashed ${AM4}`, background: AM3, marginBottom:14 } },
      h('div', { style: { fontSize:13, fontWeight:500, color:AM2, marginBottom:4 } }, '📋 Импорт из Excel'),
      h('div', { style: { fontSize:11, color:AM4, marginBottom:8 } },
        'Скопируйте строки из Excel: первая колонка — фамилия, далее значения по дням (числа или Б/ОТ/ОЗ/К/НН). Вставьте Ctrl+V.'
      ),
      h('textarea', { style: { ...S.inp, width:'100%', fontSize:12, fontFamily:'monospace', resize:'vertical' },
        rows:4, placeholder:'Вставьте данные Ctrl+V...\nИванов\t8\t8\t\t8\t7\tБ\t8...',
        value: pasteText, onChange: e => setPasteText(e.target.value)
      }),
      h('div', { style: { display:'flex', gap:8, marginTop:8 } },
        h('button', { style: abtn({ flex:1 }), onClick: doImport }, 'Импортировать'),
        h('button', { style: gbtn({ flex:1 }), onClick: () => { setShowImport(false); setPasteText(''); } }, 'Отмена')
      )
    ),

    // Легенда
    h('div', { style: { display:'flex', gap:8, flexWrap:'wrap', marginBottom:10, alignItems:'center' } },
      [
        [GN3, GN2, '8ч — норма явки'],
        [AM3, AM2, '< 8ч — неполный день'],
        ['var(--st-al-bg)',      'var(--st-al-cl)',      'Б — больничный'],
        ['var(--st-run-bg)',     'var(--st-run-cl)',     'ОТ — очередной отпуск'],
        ['var(--st-warn-bg)',    'var(--st-warn-cl)',    'ОЗ — отпуск за свой счёт'],
        ['var(--st-ok-bg)',      'var(--st-ok-cl)',      'К — командировка'],
        ['var(--st-pending-bg)', 'var(--st-pending-cl)', 'НН — неявка невыясненная'],
        ['var(--card-2)',        'var(--muted)',         'У — уволен'],
        ['var(--st-chk-bg)',     'var(--st-chk-cl)',     'СД — сдельная оплата'],
        ['rgba(226,75,74,0.08)', 'rgba(226,75,74,0.5)',  'В — выходной/праздник'],
      ].map(([bg, cl, l]) =>
        h('div', { key:l, style:{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--fg-muted)' } },
          h('div', { style:{ width:12, height:12, background:bg, borderRadius:2, border:`0.5px solid ${cl}`, flexShrink:0 } }),
          l
        )
      )
    ),

    // Таблица с попапом
    h('div', { ref: tableRef, style:{ position:'relative' } },
      h('div', { style:{ ...S.card, padding:0, overflow:'auto', maxHeight:'65vh' } },
        h('table', { style:{ borderCollapse:'collapse', width:'100%', fontSize:11 } },
          h('thead', null, h('tr', null,
            h('th', { style:{ ...S.th, position:'sticky', top:0, left:0, zIndex:3, background:'var(--th-bg)', minWidth:160, textAlign:'left', padding:'6px 10px' } }, 'Сотрудник'),
            days.map(d => {
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
              return h('th', { key:d, style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'var(--th-bg)', minWidth:32, color: isWe ? RD : undefined } },
                d, h('br'), h('span', { style:{ fontSize:9, fontWeight:400 } }, DOW[dow])
              );
            }),
            h('th', { style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'var(--th-bg)', minWidth:48 } }, 'Итого')
          )),
          h('tbody', null,
            showWorkers.map(w => {
              let totH = 0;
              const isDismissed = !!w.dismissedAt;
              const dismissDay = isDismissed ? new Date(w.dismissedAt).getDate() : 999;
              
              // Проверка сроков: удостоверения, медосмотр, инструктажи
              const checkExpiry = () => {
                const today = new Date();
                const issues = [];
                
                // Проверка удостоверений
                (w.licences || []).forEach(lic => {
                  if (lic.expiryDate) {
                    const expDate = new Date(lic.expiryDate);
                    if (expDate < today) issues.push('expired_licence');
                  }
                });
                
                // Проверка медосмотра
                if (w.medicalExamNextDate) {
                  const medDate = new Date(w.medicalExamNextDate);
                  if (medDate < today) issues.push('expired_medical');
                }
                
                // Проверка инструктажей (если есть данные)
                if (w.instructions && w.instructions.length > 0) {
                  const lastInstructions = {};
                  w.instructions.forEach(ins => {
                    if (!lastInstructions[ins.type] || new Date(ins.date) > new Date(lastInstructions[ins.type].date)) {
                      lastInstructions[ins.type] = ins;
                    }
                  });
                  
                  // Повторный инструктаж должен быть ежегодно
                  const repeatInstructions = lastInstructions['repeat'];
                  if (repeatInstructions) {
                    const insDate = new Date(repeatInstructions.date);
                    const nextYear = new Date(insDate);
                    nextYear.setFullYear(nextYear.getFullYear() + 1);
                    if (nextYear < today) issues.push('expired_instruction');
                  }
                }
                
                return issues;
              };
              
              const expiryIssues = checkExpiry();
              const hasIssues = expiryIssues.length > 0;
              return h('tr', { key:w.id },
                h('td', { style:{ ...S.td, position:'sticky', left:0, zIndex:1, background: hasIssues ? RD3 : 'var(--th-bg)', boxShadow:'2px 0 4px rgba(0,0,0,0.15)', padding:'6px 10px', fontWeight:500, color: hasIssues ? RD2 : (isDismissed ? 'var(--muted)' : undefined) } },
                  h(WN, { worker: w, onWorkerClick, style: { color: hasIssues ? RD2 : (isDismissed ? 'var(--muted)' : undefined), fontWeight: hasIssues ? 600 : 500 } }),
                  hasIssues && h('span', { style: { fontSize: 8, marginLeft: 4, color: RD2, fontWeight: 600 } }, '⚠'),
                  isDismissed && h('span', { style: { fontSize: 9, color: isDismissed && !hasIssues ? 'var(--muted)' : RD2, marginLeft: 4 } }, '(ув.)')
                ),
                days.map(d => {
                  const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                  const val = getCellVal(w.id, d);
                  const isAfterDismissal = isDismissed && d > dismissDay;
                  const { bg, cl, lbl } = cellStyle(val);
                  if (val?.h) totH += val.h;
                  const isActive = activeCell?.workerId === w.id && activeCell?.day === d;
                  const weBg = isAfterDismissal ? 'var(--card-2)' : (val ? bg : 'transparent');
                  const weCl = isAfterDismissal ? 'var(--muted)' : (val ? cl : 'var(--muted)');
                  const weLbl = isAfterDismissal ? 'У' : (val ? lbl : '·');
                  return h('td', { key:d, style:{ ...S.td, padding:2, background: isWe && !val && !isAfterDismissal ? 'rgba(226,75,74,0.04)' : undefined } },
                    h('span', {
                      style:{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:24, borderRadius:4, fontSize:11, fontWeight:500, cursor: isAfterDismissal ? 'default' : 'pointer', background:weBg, color:weCl, outline: isActive ? `2px solid ${AM}` : 'none', opacity: isAfterDismissal ? 0.6 : 1 },
                      onClick: isAfterDismissal ? undefined : () => openPopup(w.id, d),
                      title: isAfterDismissal ? 'Сотрудник уволен' : (isWe ? 'Выходной — нажмите чтобы внести часы (работа в выходной)' : undefined)
                    }, weLbl)
                  );
                }),
                h('td', { style:{ ...S.td, fontWeight:500, background:'var(--card-2)', padding:'4px 6px' } }, totH > 0 ? `${Math.round(totH*10)/10}ч` : '')
              );
            }),
            // Итоговая строка — всегда показывается
            h('tr', null,
              h('td', { style:{ ...S.td, position:'sticky', left:0, background:'var(--th-bg)', fontWeight:500, fontSize:10, color:'var(--muted)', padding:'4px 10px' } }, 'Итого чел·ч'),
              days.map(d => {
                let sum = 0;
                showWorkers.forEach(w => { const v = getCellVal(w.id, d); if (v?.h) sum += v.h; });
                const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                return h('td', { key:d, style:{ ...S.td, background: isWe ? 'rgba(226,75,74,0.04)' : 'var(--card-2)', fontSize:10, fontWeight:500, color: sum > 0 ? AM2 : 'var(--muted)' } }, sum > 0 ? Math.round(sum*10)/10 : '');
              }),
              h('td', { style:{ ...S.td, background:'var(--card-2)', fontWeight:500, fontSize:10, color:AM2, padding:'4px 6px' } }, (() => {
                let total = 0;
                days.forEach(d => showWorkers.forEach(w => { const v = getCellVal(w.id, d); if (v?.h) total += v.h; }));
                return total > 0 ? `${Math.round(total*10)/10}ч` : '';
              })())
            )
          )
        )
      ),


      // Попап ввода
      activeCell && h('div', {
        style:{ position:'absolute', top:40, left:'50%', transform:'translateX(-50%)', background:'var(--card-solid,#fff)', border:`1.5px solid ${AM}`, borderRadius:12, padding:14, zIndex:50, width:260, boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }
      },
        h('div', { style:{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6, display:'flex', alignItems:'center', gap:6 } },
          `${workerName} · ${activeCell.day} ${MONTHS_RU[viewMonth].toLowerCase()}`,
          (() => { const dow = new Date(viewYear, viewMonth, activeCell.day).getDay(); return (dow===0||dow===6) ? h('span', { style:{ background: RD3, color:RD2, fontSize:10, padding:'1px 6px', borderRadius:4 } }, 'выходной') : null; })()
        ),
        h('input', { ref: inputRef, type:'number', min:0, max:24, step:0.5,
          style:{ ...S.inp, fontSize:22, fontWeight:500, textAlign:'center', marginBottom:8 },
          placeholder:'ч', value: popupVal,
          onChange: e => setPopupVal(e.target.value)
        }),
        h('div', { style:{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' } },
          [8,7,6,4].map(v => h('button', { key:v,
            style:{ padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:500, background:GN3, color:GN2, border:`0.5px solid ${GN}`, cursor:'pointer' },
            onClick: () => {
              if (!activeCell) return;
              setCellVal(activeCell.workerId, activeCell.day, { h: v, code: null });
              setActiveCell(null); setPopupVal('');
            }
          }, `${v}ч`))
        ),
        h('div', { style:{ fontSize:11, color:'var(--muted)', marginBottom:6 } }, 'Отсутствие / особые случаи:'),
        h('div', { style:{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 } },
          CODES.map(code => h('button', { key:code,
            style:{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:400, cursor:'pointer', background:'var(--card-2)', color:'var(--fg)', border:'0.5px solid var(--border)', textAlign:'left' },
            onClick: () => setCode(code)
          }, CODE_LABELS[code])),
          h('button', { style:{ padding:'5px 10px', borderRadius:6, fontSize:11, cursor:'pointer', background:'none', color:'var(--muted)', border:'0.5px solid var(--border)', textAlign:'left' }, onClick: () => setCode('') }, '× очистить ячейку')
        ),
        h('div', { style:{ display:'flex', gap:6 } },
          h('button', { style: abtn({ flex:1, fontSize:13 }), onClick: saveCell }, 'Сохранить'),
          h('button', { style: gbtn({ fontSize:13 }), onClick: () => { setActiveCell(null); setPopupVal(''); } }, '✕')
        )
      )
    )
  );
});
