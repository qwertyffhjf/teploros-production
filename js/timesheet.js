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
  const CODES = ['Б','ОТ','ОЗ','К','НН'];
  const CODE_LABELS = {
    'Б':  'Б — больничный (нетрудоспособность)',
    'ОТ': 'ОТ — очередной отпуск',
    'ОЗ': 'ОЗ — отпуск за свой счёт',
    'К':  'К — служебная командировка',
    'НН': 'НН — неявка по невыясненной причине',
  };

  const dim = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  const activeWorkers = useMemo(() => data.workers.filter(w => !w.archived), [data.workers]);
  const showWorkers = selWorker ? activeWorkers.filter(w => w.id === selWorker) : activeWorkers;

  // Читаем сохранённые значения табеля из data.timesheet[YYYY-MM][workerId][day]
  const tsKey = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}`;
  const tsData = (data.timesheet || {})[tsKey] || {};

  const getCellVal = (workerId, day) => tsData[workerId]?.[day] || null;

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
    await DB.save(d); onUpdate(d);
  }, [data, viewYear, viewMonth, onUpdate]);

  const openPopup = useCallback((workerId, day) => {
    const val = getCellVal(workerId, day);
    setActiveCell({ workerId, day });
    setPopupVal(val?.h != null ? String(val.h) : val?.code || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [tsData]);

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
    if (val.h >= 8) return { bg: GN3, cl: GN2, lbl: val.h };
    if (val.h > 0)  return { bg: AM3, cl: AM2, lbl: val.h };
    return { bg: 'var(--color-background-secondary)', cl: '#bbb', lbl: '·' };
  };

  const exportXlsx = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const header = ['Сотрудник', ...days.map(d => d), 'Итого ч', 'Дней'];
    const rows = [header];
    showWorkers.forEach(w => {
      const row = [w.name];
      let totH = 0, totD = 0;
      days.forEach(d => {
        const dow = new Date(viewYear, viewMonth, d).getDay();
        if (!isWorkday(viewYear, viewMonth, d, data.settings)) { row.push('В'); return; }
        const val = getCellVal(w.id, d);
        if (!val) { row.push(''); return; }
        if (val.h != null) { totH += val.h; totD++; row.push(val.h); }
        else row.push(val.code || '');
      });
      rows.push([...row, totH, totD]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Табель ${viewMonth+1}.${viewYear}`);
    XLSX.writeFile(wb, `tabeli_T13_${viewMonth+1}_${viewYear}.xlsx`);
    addToast('Табель выгружен в Excel (Т-13)', 'success');
  }, [showWorkers, days, viewYear, viewMonth, tsData, addToast]);

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
    await DB.save(d); onUpdate(d);
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
            h('th', { style:{ ...S.th, position:'sticky', top:0, left:0, zIndex:3, background:'#f8f8f5', minWidth:160, textAlign:'left', padding:'6px 10px' } }, 'Сотрудник'),
            days.map(d => {
              const dow = new Date(viewYear, viewMonth, d).getDay();
              const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
              return h('th', { key:d, style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'#f8f8f5', minWidth:32, color: isWe ? RD : undefined } },
                d, h('br'), h('span', { style:{ fontSize:9, fontWeight:400 } }, DOW[dow])
              );
            }),
            h('th', { style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'#f8f8f5', minWidth:48 } }, 'Итого')
          )),
          h('tbody', null,
            showWorkers.map(w => {
              let totH = 0;
              return h('tr', { key:w.id },
                h('td', { style:{ ...S.td, position:'sticky', left:0, zIndex:1, background:'#fff', boxShadow:'2px 0 4px rgba(0,0,0,0.04)', padding:'6px 10px', fontWeight:500 } }, w.name),
                days.map(d => {
                  const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                  const val = getCellVal(w.id, d);
                  const { bg, cl, lbl } = cellStyle(val);
                  if (val?.h) totH += val.h;
                  const isActive = activeCell?.workerId === w.id && activeCell?.day === d;
                  // Выходные: если нет данных — точка, если есть — показываем как обычно
                  const weBg = val ? bg : 'transparent';
                  const weCl = val ? cl : '#ddd';
                  const weLbl = val ? lbl : '·';
                  return h('td', { key:d, style:{ ...S.td, padding:2, background: isWe && !val ? 'rgba(226,75,74,0.04)' : undefined } },
                    h('span', {
                      style:{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:28, height:24, borderRadius:4, fontSize:11, fontWeight:500, cursor:'pointer', background:weBg, color:weCl, outline: isActive ? `2px solid ${AM}` : 'none' },
                      onClick: () => openPopup(w.id, d),
                      title: isWe ? 'Выходной — нажмите чтобы внести часы (работа в выходной)' : undefined
                    }, weLbl)
                  );
                }),
                h('td', { style:{ ...S.td, fontWeight:500, background:'#f8f8f5', padding:'4px 6px' } }, totH > 0 ? `${Math.round(totH*10)/10}ч` : '')
              );
            }),
            // Итоговая строка
            showWorkers.length > 1 && h('tr', null,
              h('td', { style:{ ...S.td, position:'sticky', left:0, background:'#f8f8f5', fontWeight:500, fontSize:10, color:'#888', padding:'4px 10px' } }, 'Итого чел·ч'),
              days.map(d => {
                let sum = 0;
                showWorkers.forEach(w => { const v = getCellVal(w.id, d); if (v?.h) sum += v.h; });
                const dow = new Date(viewYear, viewMonth, d).getDay();
                const isWe = !isWorkday(viewYear, viewMonth, d, data.settings);
                return h('td', { key:d, style:{ ...S.td, background: isWe ? 'rgba(226,75,74,0.04)' : '#f8f8f5', fontSize:10, fontWeight:500, color: sum > 0 ? AM2 : '#ccc' } }, sum > 0 ? Math.round(sum*10)/10 : '');
              }),
              h('td', { style:{ ...S.td, background:'#f8f8f5' } })
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
        // Быстрые кнопки
        h('div', { style:{ display:'flex', gap:4, marginBottom:8, flexWrap:'wrap' } },
          [8,7,6,4].map(v => h('button', { key:v,
            style:{ padding:'4px 8px', borderRadius:6, fontSize:12, fontWeight:500, background:GN3, color:GN2, border:`0.5px solid ${GN}`, cursor:'pointer' },
            onClick: () => setPopupVal(String(v))
          }, `${v}ч`))
        ),
        // Коды Т-13
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



