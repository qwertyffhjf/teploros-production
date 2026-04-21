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

const MasterTimeTracking = memo(({ data, onUpdate, addToast }) => {
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

  // Читаем сохранённые значения табеля из data.timesheet[YYYY-MM][workerId][day]
  const tsKey = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
  const tsData = (data.timesheet || {})[tsKey] || {};

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

  const setCellVal = useCallback(async (workerId, day, val) => {
    const key = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
    const newTs = {
      ...(data.timesheet || {}),
      [key]: {
        ...((data.timesheet || {})[key] || {}),
        [workerId]: {
          ...(((data.timesheet || {})[key] || {})[workerId] || {}),
          [day]: val || null
        }
      }
    };
    const d = { ...data, timesheet: newTs };
    const saved = await DB.save(d); 
    if (saved) { onUpdate(saved); }
  }, [data, viewYear, viewMonth, onUpdate]);

  const openPopup = useCallback((workerId, day) => {
    const val = getCellVal(workerId, day);
    setActiveCell({ workerId, day });
    setPopupVal(val?.h != null ? String(val.h) : val?.code || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const saveCell = useCallback(async () => {
    if (!activeCell) return;
    const { workerId, day } = activeCell;
    const h = parseFloat(popupVal);
    if (!isNaN(h) && h >= 0 && h <= 24) {
      await setCellVal(workerId, day, { h, code: null });
    }
    setActiveCell(null); setPopupVal('');
  }, [activeCell, popupVal, setCellVal]);

  const setCode = useCallback(async (code) => {
    if (!activeCell) return;
    const { workerId, day } = activeCell;
    await setCellVal(workerId, day, code ? { h: null, code } : null);
    setActiveCell(null); setPopupVal('');
  }, [activeCell, setCellVal]);

  const cellStyle = (val) => {
    if (!val) return { bg: 'var(--color-background-secondary)', cl: '#bbb', lbl: '·' };
    if (val.code === 'Б')  return { bg: '#FCEBEB', cl: '#791F1F', lbl: 'Б' };
    if (val.code === 'ОТ') return { bg: '#E6F1FB', cl: '#0C447C', lbl: 'ОТ' };
    if (val.code === 'ОЗ') return { bg: '#FFF3E0', cl: '#E65100', lbl: 'ОЗ' };
    if (val.code === 'К')  return { bg: '#E8F5E9', cl: '#2E7D32', lbl: 'К' };
    if (val.code === 'НН') return { bg: '#F1EFE8', cl: '#888',   lbl: 'НН' };
    if (val.code === 'У')  return { bg: '#E0E0E0', cl: '#444',   lbl: 'У' };
    if (val.code === 'СД') return { bg: '#EDE7F6', cl: '#4527A0', lbl: 'СД' };
    if (val.h >= 8) return { bg: GN3, cl: GN2, lbl: val.h };
    if (val.h > 0)  return { bg: AM3, cl: AM2, lbl: val.h };
    return { bg: 'var(--color-background-secondary)', cl: '#bbb', lbl: '·' };
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

  const doImport = useCallback(async () => {
    if (!pasteText.trim()) return;
    const rows = pasteText.trim().split('\n').map(r => r.split('\t'));
    let imported = 0;
    const newTs = { ...(data.timesheet || {}) };
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
    const d = { ...data, timesheet: newTs };
    const saved = await DB.save(d); if (saved) onUpdate(saved);
    setPasteText(''); setShowImport(false);
    addToast(`Импортировано: ${imported} ячеек`, 'success');
  }, [pasteText, data, viewYear, viewMonth, activeWorkers, dim, onUpdate, addToast]);

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
        [GN3,  GN2,      '8ч — норма явки'],
        [AM3,  AM2,      '< 8ч — неполный день'],
        ['#FCEBEB', '#791F1F', 'Б — больничный'],
        ['#E6F1FB', '#0C447C', 'ОТ — очередной отпуск'],
        ['#FFF3E0', '#E65100', 'ОЗ — отпуск за свой счёт'],
        ['#E8F5E9', '#2E7D32', 'К — командировка'],
        ['#F1EFE8', '#888',    'НН — неявка невыясненная'],
        ['#E0E0E0', '#444',    'У — уволен'],
        ['#EDE7F6', '#4527A0', 'СД — сдельная оплата'],
        ['rgba(226,75,74,0.08)', 'rgba(226,75,74,0.5)', 'В — выходной/праздник'],
      ].map(([bg, cl, l]) =>
        h('div', { key:l, style:{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#555' } },
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
            h('th', { style:{ ...S.th, position:'sticky', top:0, left:0, zIndex:3, background:'var(--color-background-secondary)', minWidth:160, textAlign:'left', padding:'6px 10px' } }, 'Сотрудник'),
            days.map(d => {
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
              return h('th', { key:d, style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'var(--color-background-secondary)', minWidth:32, color: isWe ? RD : undefined } },
                d, h('br'), h('span', { style:{ fontSize:9, fontWeight:400 } }, DOW[dow])
              );
            }),
            h('th', { style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'var(--color-background-secondary)', minWidth:48 } }, 'Итого')
          )),
          h('tbody', null,
            showWorkers.map(w => {
              let totH = 0;
              const isDismissed = !!w.dismissedAt;
              const dismissDay = isDismissed ? new Date(w.dismissedAt).getDate() : 999;
              return h('tr', { key:w.id },
                h('td', { style:{ ...S.td, position:'sticky', left:0, zIndex:1, background:'var(--color-background-primary)', boxShadow:'2px 0 4px rgba(0,0,0,0.04)', padding:'6px 10px', fontWeight:500, color: isDismissed ? '#999' : undefined } }, 
                  w.name, 
                  isDismissed && h('span', { style: { fontSize: 9, color: '#999', marginLeft: 4 } }, '(ув.)')
                ),
                days.map(d => {
                  const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                  const val = getCellVal(w.id, d);
                  const isAfterDismissal = isDismissed && d > dismissDay;
                  const { bg, cl, lbl } = cellStyle(val);
                  if (val?.h) totH += val.h;
                  const isActive = activeCell?.workerId === w.id && activeCell?.day === d;
                  const weBg = isAfterDismissal ? '#E0E0E0' : (val ? bg : 'transparent');
                  const weCl = isAfterDismissal ? '#444' : (val ? cl : '#ddd');
                  const weLbl = isAfterDismissal ? 'У' : (val ? lbl : '·');
                  return h('td', { key:d, style:{ ...S.td, padding:2, background: isWe && !val && !isAfterDismissal ? 'rgba(226,75,74,0.04)' : undefined } },
                    h('span', {
                      style:{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:24, borderRadius:4, fontSize:11, fontWeight:500, cursor: isAfterDismissal ? 'default' : 'pointer', background:weBg, color:weCl, outline: isActive ? `2px solid ${AM}` : 'none', opacity: isAfterDismissal ? 0.6 : 1 },
                      onClick: isAfterDismissal ? undefined : () => openPopup(w.id, d),
                      title: isAfterDismissal ? 'Сотрудник уволен' : (isWe ? 'Выходной — нажмите чтобы внести часы (работа в выходной)' : undefined)
                    }, weLbl)
                  );
                }),
                h('td', { style:{ ...S.td, fontWeight:500, background:'var(--color-background-secondary)', padding:'4px 6px' } }, totH > 0 ? `${Math.round(totH*10)/10}ч` : '')
              );
            }),
            // Итоговая строка — всегда показывается
            h('tr', null,
              h('td', { style:{ ...S.td, position:'sticky', left:0, background:'var(--color-background-secondary)', fontWeight:500, fontSize:10, color:'var(--color-text-tertiary)', padding:'4px 10px' } }, 'Итого чел·ч'),
              days.map(d => {
                let sum = 0;
                showWorkers.forEach(w => { const v = getCellVal(w.id, d); if (v?.h) sum += v.h; });
                const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                return h('td', { key:d, style:{ ...S.td, background: isWe ? 'rgba(226,75,74,0.04)' : 'var(--color-background-secondary)', fontSize:10, fontWeight:500, color: sum > 0 ? AM2 : 'var(--color-text-tertiary)' } }, sum > 0 ? Math.round(sum*10)/10 : '');
              }),
              h('td', { style:{ ...S.td, background:'var(--color-background-secondary)', fontWeight:500, fontSize:10, color:AM2, padding:'4px 6px' } }, (() => {
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
        style:{ position:'absolute', top:40, left:'50%', transform:'translateX(-50%)', background:'#fff', border:`1.5px solid ${AM}`, borderRadius:12, padding:14, zIndex:50, width:260, boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }
      },
        h('div', { style:{ fontSize:11, color:'#888', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6, display:'flex', alignItems:'center', gap:6 } },
          `${workerName} · ${activeCell.day} ${MONTHS_RU[viewMonth].toLowerCase()}`,
          (() => { const dow = new Date(viewYear, viewMonth, activeCell.day).getDay(); return (dow===0||dow===6) ? h('span', { style:{ background:'#FCEBEB', color:RD2, fontSize:10, padding:'1px 6px', borderRadius:4 } }, 'выходной') : null; })()
        ),
        h('input', { ref: inputRef, type:'number', min:0, max:24, step:0.5,
          style:{ ...S.inp, fontSize:22, fontWeight:500, textAlign:'center', marginBottom:8 },
          placeholder:'ч', value: popupVal,
          onChange: e => setPopupVal(e.target.value)
        }),
        h('div', { style:{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' } },
          [8,7,6,4].map(v => h('button', { key:v,
            style:{ padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:500, background:GN3, color:GN2, border:`0.5px solid ${GN}`, cursor:'pointer' },
            onClick: () => setPopupVal(String(v))
          }, `${v}ч`))
        ),
        h('div', { style:{ fontSize:11, color:'#888', marginBottom:6 } }, 'Отсутствие / особые случаи:'),
        h('div', { style:{ display:'flex', flexDirection:'column', gap:4, marginBottom:10 } },
          CODES.map(code => h('button', { key:code,
            style:{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:400, cursor:'pointer', background:'#f5f5f2', color:'#333', border:'0.5px solid rgba(0,0,0,0.1)', textAlign:'left' },
            onClick: () => setCode(code)
          }, CODE_LABELS[code])),
          h('button', { style:{ padding:'5px 10px', borderRadius:6, fontSize:11, cursor:'pointer', background:'none', color:'#aaa', border:'0.5px solid rgba(0,0,0,0.08)', textAlign:'left' }, onClick: () => setCode('') }, '× очистить ячейку')
        ),
        h('div', { style:{ display:'flex', gap:6 } },
          h('button', { style: abtn({ flex:1, fontSize:13 }), onClick: saveCell }, 'Сохранить'),
          h('button', { style: gbtn({ fontSize:13 }), onClick: () => { setActiveCell(null); setPopupVal(''); } }, '✕')
        )
      )
    )
  );
});
