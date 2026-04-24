// teploros · hr.js
// Автоматически извлечено из монолита

// ==================== MasterWorkers ====================
const MasterWorkers = memo(({ data, onUpdate, addToast, focusWorkerId }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [cardWorker, setCardWorker] = useState(() => focusWorkerId ? data.workers.find(w => w.id === focusWorkerId) || null : null);
  const [thanksModal, setThanksModal] = useState(null);
  const { ask: askConfirm, confirmEl } = useConfirm();
  const [thanksNote, setThanksNote] = useState('');
  const [form, setForm] = useState({ name: '', position: '', grade: '', tabNumber: '', pin: '', sectionId: '', competences: [], status: 'working' });

  const resetForm = () => { setForm({ name: '', position: '', grade: '', tabNumber: '', pin: '', sectionId: '', competences: [], status: 'working' }); setEditingWorker(null); setShowAddForm(false); };

  const addOrUpdate = useCallback(async () => {
    if (!form.name.trim()) { addToast('Введите имя сотрудника', 'error'); return; }
    if (!form.pin.trim()) { addToast('Введите PIN-код', 'error'); return; }
    const pinExists = data.workers.some(w => w.id !== editingWorker && pinMatch(form.pin.trim(), w.pin));
    if (pinExists) { addToast('Такой PIN-код уже занят', 'error'); return; }
    if (editingWorker) {
      const d = { ...data, workers: data.workers.map(w => w.id === editingWorker ? { ...w, name: form.name.trim(), position: form.position.trim(), grade: form.grade.trim(), tabNumber: form.tabNumber.trim(), pin: hashPin(form.pin.trim()), sectionId: form.sectionId || null, competences: form.competences, status: form.status } : w) };
      await DB.save(d); onUpdate(d); addToast('Сотрудник обновлён', 'success');
    } else {
      const w = { id: uid(), name: form.name.trim(), position: form.position.trim(), grade: form.grade.trim(), tabNumber: form.tabNumber.trim(), pin: hashPin(form.pin.trim()), sectionId: form.sectionId || null, competences: form.competences, status: form.status };
      const d = { ...data, workers: [...data.workers, w] };
      await DB.save(d); onUpdate(d); addToast('Сотрудник добавлен', 'success');
    }
    resetForm();
  }, [form, editingWorker, data, onUpdate, addToast]);

  const del = useCallback(async id => {
    if (!(await askConfirm({ message: 'Архивировать сотрудника?', detail: 'История операций сохранится.' }))) return;
    const name = data.workers.find(w => w.id === id)?.name;
    let d = { ...data,
      workers: data.workers.map(w => w.id === id ? { ...w, archived: true, status: 'absent', dismissedAt: Date.now() } : w),
      ops: data.ops.map(o => (o.status === 'pending' && o.workerIds?.includes(id)) ? { ...o, workerIds: o.workerIds.filter(wid => wid !== id) } : o)
    };
    d = logAction(d, 'worker_archive', { workerId: id, workerName: name });
    await DB.save(d); onUpdate(d); addToast('Сотрудник архивирован (история сохранена)', 'info');
  }, [data, onUpdate, addToast]);

  const permanentDelete = useCallback(async id => {
    const w = data.workers.find(w => w.id === id);
    const hasOps = data.ops.some(op => op.workerIds?.includes(id) && (op.status === 'done' || op.status === 'in_progress'));
    if (hasOps) { addToast('Нельзя удалить: у сотрудника есть выполненные операции. Используйте архивирование.', 'error'); return; }
    if (!(await askConfirm({ message: `Удалить ${w?.name || ''}?`, detail: 'Это действие необратимо.' }))) return;
    const d = { ...data,
      workers: data.workers.filter(w => w.id !== id),
      ops: data.ops.map(o => o.workerIds?.includes(id) ? { ...o, workerIds: o.workerIds.filter(wid => wid !== id) } : o)
    };
    await DB.save(d); onUpdate(d); addToast('Сотрудник удалён', 'info');
  }, [data, onUpdate, addToast]);

  const edit = useCallback(w => { setForm({ name: w.name, position: w.position || '', grade: w.grade || '', tabNumber: w.tabNumber || '', pin: w.pin || '', sectionId: w.sectionId || '', competences: w.competences || [], status: w.status || 'working' }); setEditingWorker(w.id); setShowAddForm(false); }, []);
  const updateStatus = useCallback(async (id, status) => { let d = { ...data, workers: data.workers.map(w => w.id === id ? { ...w, status } : w) }; d = logAction(d, 'worker_status', { workerId: id, workerName: data.workers.find(w => w.id === id)?.name, newStatus: status }); await DB.save(d); onUpdate(d); }, [data, onUpdate]);
  const sendThanks = useCallback(async (toWorkerId, note) => {
    const newEvent = { id: uid(), type: 'thanks', toWorkerId, fromWorkerId: null, ts: now(), note: note || '' };
    const updated = { ...data, events: [...data.events, newEvent] };
    const withAch = checkAchievements(toWorkerId, updated);
    const final = withAch !== updated ? withAch : updated;
    await DB.save(final); onUpdate(final); setThanksModal(null); setThanksNote(''); addToast('Благодарность отправлена', 'success');
  }, [data, onUpdate, addToast]);

  const [showArchivedWorkers, setShowArchivedWorkers] = useState(false);

  const period30 = useMemo(() => now() - 30*86400000, []);

  const workersEnriched = useMemo(() => data.workers.map(w => {
    const opsDone = data.ops.filter(op => op.workerIds?.includes(w.id) && op.status === 'done' && op.finishedAt >= period30);
    const opsDefect = data.ops.filter(op => op.workerIds?.includes(w.id) && op.status === 'defect' && op.finishedAt >= period30);
    const opsActive = data.ops.filter(op => op.workerIds?.includes(w.id) && op.status === 'in_progress');
    const avgTime = opsDone.length > 0 ? opsDone.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0) / opsDone.length : 0;
    const total = opsDone.length + opsDefect.length;
    const defectRate = total > 0 ? (opsDefect.length / total * 100) : 0;
    const downtimes = data.events.filter(e => e.workerId === w.id && e.type === 'downtime' && e.ts >= period30).length;
    const section = data.sections.find(s => s.id === w.sectionId);
    const todayStart = new Date().setHours(0,0,0,0);
    const checkin = data.events.find(e => e.workerId === w.id && e.type === 'checkin_manual' && e.ts >= todayStart);
    const allTimeDone = data.ops.filter(op => op.workerIds?.includes(w.id) && op.status === 'done').length;
    return { ...w, opsDone: opsDone.length, opsDefect: opsDefect.length, opsActive: opsActive.length, avgTime, defectRate, downtimes, sectionName: section?.name || '', checkinTime: checkin ? new Date(checkin.ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : null, allTimeDone, level: getWorkerLevel(allTimeDone), levelProgress: getLevelProgress(allTimeDone) };
  }), [data.workers, data.ops, data.events, data.sections, period30]);

  const filtered = useMemo(() => {
    let list = workersEnriched.filter(w => showArchivedWorkers ? w.archived : !w.archived);
    if (search) list = list.filter(w => w.name.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') list = list.filter(w => (w.status || 'working') === statusFilter);
    if (sectionFilter) list = list.filter(w => w.sectionId === sectionFilter);
    if (positionFilter) list = list.filter(w => w.position === positionFilter);
    return list.sort((a,b) => a.name.localeCompare(b.name));
  }, [workersEnriched, search, statusFilter, sectionFilter, positionFilter, showArchivedWorkers]);

  const restoreWorker = useCallback(async id => {
    let d = { ...data, workers: data.workers.map(w => w.id === id ? { ...w, archived: false, status: 'working', dismissedAt: null } : w) };
    d = logAction(d, 'worker_restore', { workerId: id, workerName: data.workers.find(w => w.id === id)?.name });
    await DB.save(d); onUpdate(d); addToast('Сотрудник восстановлен', 'success');
  }, [data, onUpdate, addToast]);

  const summary = useMemo(() => {
    const active = data.workers.filter(w => !w.archived);
    const s = { total: active.length, working:0, absent:0, sick:0, vacation:0 };
    active.forEach(w => { const k = w.status || 'working'; if (s[k] !== undefined) s[k]++; });
    const workingWorkers = workersEnriched.filter(w => !w.archived && (w.status || 'working') === 'working');
    const avgLoad = workingWorkers.length > 0 ? Math.round(workingWorkers.reduce((sum,w) => sum + w.opsActive, 0) / workingWorkers.length * 100) || 0 : 0;
    return { ...s, avgLoad };
  }, [data.workers, workersEnriched]);

  const toggleCompetence = (comp) => { setForm(p => ({ ...p, competences: p.competences.includes(comp) ? p.competences.filter(c => c !== comp) : [...p.competences, comp] })); };
  const stagesForMatrix = useMemo(() => data.productionStages || [], [data.productionStages]);
  const archivedCount = useMemo(() => data.workers.filter(w => w.archived).length, [data.workers]);
  // Покрытие навыков: Map<stageName, count> — мемоизируем чтобы не пересчитывать в render
  const competenceCoverage = useMemo(() => {
    const map = {};
    const active = data.workers.filter(w => !w.archived && (w.status || 'working') === 'working');
    (data.productionStages || []).forEach(s => {
      map[s.name] = active.filter(w => (w.competences || []).includes(s.name)).length;
    });
    return map;
  }, [data.workers, data.productionStages]);

  const renderWorkerForm = (isInline = false) => h('div', { style: isInline ? {} : { ...S.card, border: `1px solid ${AM}`, marginBottom: 16 } },
    !isInline && h('div', { style: S.sec }, editingWorker ? 'Редактировать сотрудника' : 'Новый сотрудник'),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
      h('input', { style: { ...S.inp, flex:2, minWidth:150 }, placeholder:'ФИО', value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }),
      h('input', { style: { ...S.inp, flex:1, minWidth:120 }, placeholder:'Должность', value: form.position, onChange: e => setForm(p => ({ ...p, position: e.target.value })) }),
      h('input', { style: { ...S.inp, width:80 }, placeholder:'Разряд', value: form.grade, onChange: e => setForm(p => ({ ...p, grade: e.target.value })) }),
      h('input', { style: { ...S.inp, width:80 }, placeholder:'Таб. №', value: form.tabNumber, onChange: e => setForm(p => ({ ...p, tabNumber: e.target.value })) }),
      h('input', { type:'password', style: { ...S.inp, width:80 }, placeholder:'PIN', value: form.pin, onChange: e => setForm(p => ({ ...p, pin: e.target.value })), maxLength:6 }),
      h('select', { style: { ...S.inp, minWidth:120 }, value: form.sectionId, onChange: e => setForm(p => ({ ...p, sectionId: e.target.value })) }, h('option', { value:'' }, '— участок —'), data.sections.map(s => h('option', { key: s.id, value: s.id }, s.name))),
      h('select', { style: { ...S.inp, minWidth:120 }, value: form.status, onChange: e => setForm(p => ({ ...p, status: e.target.value })) }, Object.entries(WORKER_STATUS).map(([k,v]) => h('option', { key: k, value: k }, v.label)))
    ),
    h('div', { style: { marginBottom: 12 } },
      h('div', { style: { fontSize: 11, color: '#888', marginBottom: 6 } }, 'Допуск к операциям'),
      h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } }, stagesForMatrix.map(s =>
        h('button', { key: s.id, type: 'button', style: { padding:'3px 10px', fontSize:11, borderRadius:8, border:'0.5px solid ' + (form.competences.includes(s.name) ? AM : 'rgba(0,0,0,0.15)'), background: form.competences.includes(s.name) ? AM3 : '#fff', color: form.competences.includes(s.name) ? AM2 : '#888', cursor:'pointer' }, onClick: () => toggleCompetence(s.name) }, s.name)
      ))
    ),
    h('div', { style: { display: 'flex', gap: 8 } },
      h('button', { style: abtn(), onClick: addOrUpdate }, editingWorker ? '✓ Сохранить' : '+ Добавить'),
      h('button', { style: gbtn(), onClick: resetForm }, 'Отмена')
    )
  );

  return h('div', null,
    confirmEl,
    cardWorker && h(WorkerCardModal, { worker: cardWorker, data, onClose: () => setCardWorker(null) }),
    thanksModal && h('div', { role:'dialog','aria-modal':'true','aria-label':'Отправить благодарность', style: { position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 } },
      h('div', { style: { background:'#fff',borderRadius:12,padding:24,width:'min(320px, calc(100vw - 32px))' } },
        h('div', { style: { fontSize:16, fontWeight:500, marginBottom:16 } }, `Благодарность для ${thanksModal.name}`),
        h('textarea', { style: { ...S.inp, width:'100%', marginBottom:16 }, rows:3, placeholder:'Комментарий (необязательно)', value: thanksNote, onChange: e => setThanksNote(e.target.value) }),
        h('div', { style: { display:'flex', gap:8, justifyContent:'flex-end' } },
          h('button', { style: gbtn(), onClick: () => { setThanksModal(null); setThanksNote(''); } }, 'Отмена'),
          h('button', { style: abtn(), onClick: () => sendThanks(thanksModal.id, thanksNote) }, 'Отправить')
        )
      )
    ),
    h('div', { className: 'metrics-grid', style: { display:'grid', gap:10, marginBottom:16 } },
      h(MC, { v: summary.total, l: 'Всего' }),
      h(MC, { v: summary.working, l: 'На смене', c: GN }),
      h(MC, { v: summary.absent+summary.sick+summary.vacation, l: 'Отсутствуют', c: RD }),
      h(MC, { v: `${summary.avgLoad}%`, l: 'Загрузка, ср.', c: AM })
    ),
    h('div', { style: { display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap' } },
      h('input', { style: { ...S.inp, flex:1, minWidth:180 }, placeholder:'Поиск по имени...', value: search, onChange: e => setSearch(e.target.value) }),
      h('div', { style: { display:'flex', gap:4, flexWrap:'wrap' } }, [['all','Все'],['working','На смене'],['absent','Отсутствуют'],['sick','Больничный'],['vacation','Отпуск']].map(([id,label]) => h('button', { key: id, style: statusFilter === id ? abtn({ fontSize:11, padding:'5px 10px' }) : gbtn({ fontSize:11, padding:'5px 10px' }), onClick: () => setStatusFilter(id) }, label))),
      h('select', { style: { ...S.inp, minWidth: 130 }, value: sectionFilter, onChange: e => setSectionFilter(e.target.value) },
        h('option', { value: '' }, '— все участки —'),
        (data.sections || []).map(s => h('option', { key: s.id, value: s.id }, s.name))
      ),
      (() => {
        const positions = [...new Set(data.workers.filter(w => w.position).map(w => w.position))].sort();
        return h('select', { style: { ...S.inp, minWidth: 130 }, value: positionFilter, onChange: e => setPositionFilter(e.target.value) },
          h('option', { value: '' }, '— все должности —'),
          positions.map(p => h('option', { key: p, value: p }, p))
        );
      })(),
      (sectionFilter || positionFilter) && h('button', { style: gbtn({ fontSize: 11, padding: '5px 8px' }), onClick: () => { setSectionFilter(''); setPositionFilter(''); } }, '✕ Сбросить'),
      h('label', { style: { display:'flex', alignItems:'center', gap:4, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' } },
        h('input', { type:'checkbox', checked: showArchivedWorkers, onChange: e => setShowArchivedWorkers(e.target.checked) }),
        `Архив (${archivedCount})`
      ),
      !showArchivedWorkers && h('button', { style: abtn({ marginLeft:'auto' }), onClick: () => { resetForm(); setShowAddForm(true); } }, '+ Добавить')
    ),
    h('div', { style: { display:'flex', gap:8, marginBottom:16 } },
      h('button', { style: viewMode === 'list' ? abtn() : gbtn(), onClick: () => setViewMode('list') }, 'Список'),
      h('button', { style: viewMode === 'matrix' ? abtn() : gbtn(), onClick: () => setViewMode('matrix') }, 'Матрица компетенций')
    ),
    h(PasteImportWidget, { addToast, hint: 'Вставить сотрудников из Excel',
      columns: [
        { key: 'name',     label: 'ФИО',           required: true },
        { key: 'position', label: 'Должность',      required: false, default: '' },
        { key: 'grade',    label: 'Разряд',         required: false, default: '' },
        { key: 'pin',      label: 'PIN (4-6 цифр)', required: false, default: '' },
      ],
      onImport: async (rows) => {
        const existing = new Set(data.workers.map(w => w.name.toLowerCase()));
        const items = rows.filter(r => r.name && !existing.has(r.name.toLowerCase()))
          .map(r => ({ id: uid(), name: r.name, position: r.position || '',
            grade: r.grade || '', pin: r.pin || '', tabNumber: '',
            sectionId: '', competences: [], status: 'working', achievements: [] }));
        if (!items.length) { addToast('Все сотрудники уже существуют', 'info'); return; }
        const d = { ...data, workers: [...data.workers, ...items] };
        await DB.save(d); onUpdate(d); addToast(`Добавлено: ${items.length}`, 'success');
      }}),
    viewMode === 'list' ? h('div', null,
      showAddForm && renderWorkerForm(),
      filtered.length === 0
        ? h('div', { style: { ...S.card, textAlign:'center', padding:32 } }, 'Сотрудники не найдены')
        : filtered.map(w => {
            const ws = WORKER_STATUS[w.status] || WORKER_STATUS.working;
            if (editingWorker === w.id) return h('div', { key: w.id, style: { ...S.card, marginBottom:10, padding:16, border: `1px solid ${AM}` } }, renderWorkerForm(true));
            return h('div', { key: w.id, id: `worker-card-${w.id}`, style: { ...S.card, marginBottom:10, padding:16 } },
              h('div', { style: { display:'flex', alignItems:'flex-start', gap:14 } },
                h('div', { style: { width:44, height:44, borderRadius:'50%', background: ws.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:500, color: ws.cl, flexShrink:0, border:'0.5px solid '+ws.br } }, w.name?.charAt(0) || '?'),
                h('div', { style: { flex:1, minWidth:0 } },
                  h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 } },
                    h('div', null,
                      h('div', { style: { display:'flex', alignItems:'center', gap:8 } },
                        h('div', { style: { fontSize:15, fontWeight:500 } }, w.name),
                        h('span', { style: { display:'inline-block', padding:'1px 8px', fontSize:10, borderRadius:8, background:AM3, color:AM2, fontWeight:500 } }, `Ур. ${w.level} · ${getLevelTitle(w.level)}`),
                        h('button', { style: gbtn({ fontSize:11, padding:'2px 6px' }), 'aria-label': `Поблагодарить ${w.name}`, onClick: () => setThanksModal({ id: w.id, name: w.name }) }, '👏')
                      ),
                      h('div', { style: { fontSize:12, color:'#888' } }, [w.position, w.grade ? `${w.grade} разр.` : null, w.tabNumber ? `Таб. ${w.tabNumber}` : null, w.sectionName].filter(Boolean).join(' · ') || '—')
                    ),
                    h('div', { style: { display:'flex', gap:6, alignItems:'center' } },
                      h('span', { style: { display:'inline-block', padding:'3px 10px', fontSize:10, borderRadius:8, fontWeight:500, background: ws.bg, color: ws.cl, border:'0.5px solid '+ws.br } }, ws.label),
                      w.checkinTime && h('span', { style: { fontSize:11, color:'#888' } }, `с ${w.checkinTime}`)
                    )
                  ),
                  h('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom:10 } },
                    h('div', { style: { fontSize:11, color:'#888', whiteSpace:'nowrap' } }, `${w.allTimeDone} оп.`),
                    h('div', { style: { flex:1, height:5, background:'#eee', borderRadius:3, overflow:'hidden' } }, h('div', { style: { width: `${w.levelProgress*100}%`, height:5, background:AM, borderRadius:3 } })),
                    h('div', { style: { fontSize:10, color:'#888', whiteSpace:'nowrap' } }, `→ Ур. ${w.level+1}`)
                  ),
                  h('div', { style: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 } },
                    h('div', { style: { textAlign:'center', padding:'6px 4px', background:'#f8f8f5', borderRadius:8 } }, h('div', { style: { fontSize:16, fontWeight:500, color:GN } }, w.opsDone), h('div', { style: { fontSize:10, color:'#888' } }, 'выполн.')),
                    h('div', { style: { textAlign:'center', padding:'6px 4px', background:'#f8f8f5', borderRadius:8 } }, h('div', { style: { fontSize:16, fontWeight:500, color:AM } }, w.avgTime ? fmtDur(w.avgTime) : '—'), h('div', { style: { fontSize:10, color:'#888' } }, 'ср. время')),
                    h('div', { style: { textAlign:'center', padding:'6px 4px', background:'#f8f8f5', borderRadius:8 } }, h('div', { style: { fontSize:16, fontWeight:500, color: w.defectRate > 5 ? RD : GN } }, `${w.defectRate.toFixed(1)}%`), h('div', { style: { fontSize:10, color:'#888' } }, 'брак')),
                    h('div', { style: { textAlign:'center', padding:'6px 4px', background:'#f8f8f5', borderRadius:8 } }, h('div', { style: { fontSize:16, fontWeight:500, color:BL } }, w.opsActive), h('div', { style: { fontSize:10, color:'#888' } }, 'в работе'))
                  ),
                  // Часы из табеля за текущий месяц
                  (() => {
                    const now = new Date();
                    const ym = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;
                    const tsMonth = data.timesheet?.[w.id] || {};
                    const totalH = Object.values(tsMonth).reduce((s, cell) => s + (cell?.h || 0), 0);
                    return totalH > 0 ? h('div', { style: { marginBottom: 8, padding: '6px 10px', background: GN3, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('span', { style: { fontSize: 11, color: GN2 } }, `📋 Табель ${now.toLocaleString('ru', { month: 'long' })}`),
                      h('span', { style: { fontSize: 13, fontWeight: 600, color: GN2 } }, `${Math.round(totalH * 10) / 10} ч`)
                    ) : null;
                  })(),
                  w.achievements && w.achievements.length > 0 && h('div', { style: { marginBottom:8 } },
                    h('div', { style: { fontSize:10, color:'#888', marginBottom:4 } }, `Достижения (${w.achievements.length})`),
                    h('div', { style: { display:'flex', gap:4, flexWrap:'wrap' } }, w.achievements.slice(0,6).map(achId => { const a = ACHIEVEMENTS[achId]; return a ? h('span', { key: achId, title: `${a.title}: ${a.desc}`, style: { padding:'2px 8px', fontSize:11, background:'#f8f8f5', borderRadius:8, cursor:'default' } }, `${a.icon} ${a.title}`) : null; }), w.achievements.length > 6 && h('span', { style: { fontSize:11, color:'#888', padding:'2px 4px' } }, `+${w.achievements.length-6}`))
                  ),
                  w.competences && w.competences.length > 0 && h('div', { style: { marginBottom:8 } },
                    h('div', { style: { fontSize:10, color:'#888', marginBottom:4 } }, 'Допуск к операциям'),
                    h('div', { style: { display:'flex', gap:4, flexWrap:'wrap' } }, w.competences.map(c => h('span', { key: c, style: { padding:'2px 8px', fontSize:10, background:AM3, color:AM2, borderRadius:8 } }, c)))
                  ),
                  h('div', { style: { display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' } },
                    h('button', { style: gbtn({ fontSize:11, padding:'4px 10px' }), onClick: () => setCardWorker(w) }, '📊 Подробнее'),
                    !w.archived && h('button', { style: gbtn({ fontSize:11, padding:'4px 10px' }), onClick: () => edit(w) }, '✎ Редактировать'),
                    !w.archived && h('select', { style: { ...S.inp, fontSize:11, padding:'4px 6px' }, 'aria-label': 'Статус сотрудника', value: w.status || 'working', onChange: e => updateStatus(w.id, e.target.value) }, Object.entries(WORKER_STATUS).map(([k,v]) => h('option', { key: k, value: k }, v.label))),
                    !w.archived
                      ? h('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
                          h('button', { style: rbtn({ fontSize:11, padding:'4px 8px' }), onClick: () => del(w.id) }, '📦 Архив'),
                          h('button', { style: { ...rbtn({ fontSize:11, padding:'4px 8px' }), background: '#fff', color: RD, borderColor: RD }, onClick: () => permanentDelete(w.id) }, '🗑')
                        )
                      : h('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
                          h('button', { style: { ...gbtn({ fontSize:11, padding:'4px 8px' }), color: GN2, borderColor: GN }, onClick: () => restoreWorker(w.id) }, '↩ Восстановить'),
                          h('button', { style: { ...rbtn({ fontSize:11, padding:'4px 8px' }), background: '#fff', color: RD, borderColor: RD }, onClick: () => permanentDelete(w.id) }, '🗑 Удалить')
                        )
                  )
                )
              )
            );
          })
    ) : h('div', null,
      // Светофор — покрытие навыков
      h('div', { style: { ...S.card, marginBottom: 12, padding: 10 } },
        h('div', { style: { ...S.sec, marginBottom: 6 } }, 'Покрытие навыков'),
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          stagesForMatrix.map(s => {
            const count = competenceCoverage[s.name] ?? 0;
            const color = count === 0 ? RD : count <= 2 ? AM : GN;
            const bg = count === 0 ? RD3 : count <= 2 ? AM3 : GN3;
            return h('div', { key: s.id, style: { padding: '6px 10px', borderRadius: 8, background: bg, border: `0.5px solid ${color}`, fontSize: 11, textAlign: 'center', minWidth: 80 } },
              h('div', { style: { fontSize: 16, fontWeight: 500, color } }, count),
              h('div', { style: { fontSize: 10, color, marginTop: 2 } }, s.name.length > 12 ? s.name.slice(0, 12) + '…' : s.name)
            );
          })
        ),
        h('div', { style: { display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: '#888' } },
          h('span', null, '🔴 0 чел — критично'), h('span', null, '🟡 1-2 чел — риск'), h('span', null, '🟢 3+ чел — норма')
        )
      ),
      // Легенда уровней — ВВЕРХУ
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', fontSize: 11 } },
        h('span', { style: { fontWeight: 500, color: '#666', marginRight: 4 } }, 'Уровни:'),
        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: '#f5f5f2', color: '#ccc', fontSize: 11 } }, '— нет допуска'),
        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: '#FFF8E1', color: '#F57F17', fontSize: 11 } }, 'Нов. — новичок'),
        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: AM3, color: AM2, fontSize: 11 } }, 'Ком. — компетентен'),
        h('span', { style: { padding: '2px 8px', borderRadius: 4, background: GN3, color: GN2, fontSize: 11 } }, 'Эксп. — эксперт'),
        h('span', { style: { color: '#aaa', fontSize: 10, alignSelf: 'center' } }, '· Нажмите ячейку для переключения')
      ),
      // Матрица с уровнями
      h('div', { style: { ...S.card, padding: 0, overflow: 'auto', maxHeight: '70vh' } }, h('table', { style: { borderCollapse:'collapse', width:'100%', fontSize:12 } },
        h('thead', null, h('tr', null,
          h('th', { style: { ...S.th, position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#f8f8f5', minWidth: 160, boxShadow: '2px 0 4px rgba(0,0,0,0.06)' }, scope: 'col' }, 'Сотрудник'),
          stagesForMatrix.map(s => {
            const count = competenceCoverage[s.name] ?? 0;
            const color = count === 0 ? RD : count <= 2 ? AM : GN;
            return h('th', { key: s.id, style: { ...S.th, borderBottom: `3px solid ${color}`, position: 'sticky', top: 0, zIndex: 2, background: '#f8f8f5', whiteSpace: 'nowrap', minWidth: 90 } }, s.name);
          })
        )),
        h('tbody', null, data.workers.filter(w => !w.archived).map(w => h('tr', { key: w.id },
          h('td', { style: { ...S.td, fontWeight:500, position: 'sticky', left: 0, zIndex: 1, background: '#fff', boxShadow: '2px 0 4px rgba(0,0,0,0.06)', minWidth: 160 } }, w.name),
          stagesForMatrix.map(s => {
            const level = (w.competenceLevels || {})[s.name] || 0;
            const has = (w.competences || []).includes(s.name);
            const levelColors = { 0: { bg: '#f5f5f2', cl: '#ccc', label: '—' }, 1: { bg: '#FFF8E1', cl: '#F57F17', label: 'Нов.' }, 2: { bg: AM3, cl: AM2, label: 'Ком.' }, 3: { bg: GN3, cl: GN2, label: 'Эксп.' } };
            const lc = levelColors[level] || levelColors[0];
            return h('td', { key: s.id, style: { ...S.td, textAlign:'center', padding: '4px', cursor: 'pointer' }, onClick: async () => {
              const newLevel = (level + 1) % 4;
              const newLevels = { ...(w.competenceLevels || {}), [s.name]: newLevel };
              const newComps = newLevel > 0 ? [...new Set([...(w.competences || []), s.name])] : (w.competences || []).filter(c => c !== s.name);
              if (newLevel === 0) delete newLevels[s.name];
              const d = { ...data, workers: data.workers.map(ww => ww.id === w.id ? { ...ww, competences: newComps, competenceLevels: newLevels } : ww) };
              await DB.save(d); onUpdate(d);
            }},
              h('span', { style: { display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500, background: lc.bg, color: lc.cl, minWidth: 36 } }, lc.label)
            );
          })
        )))
      ))
    )
});

// ==================== InstructionsTracker (ОТ) ====================
const INSTRUCTION_TYPES = [
  { id: 'initial',     label: 'Вводный',                  months: null },
  { id: 'workplace',   label: 'На рабочем месте',          months: 12 },
  { id: 'fire',        label: 'Противопожарный',           months: 12 },
  { id: 'electrical',  label: 'Электробезопасность',       months: 12 },
  { id: 'unplanned',   label: 'Внеплановый',               months: null },
  { id: 'targeted',    label: 'Целевой',                   months: null },
];

const InstructionsTracker = memo(({ data, onUpdate, addToast }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ workerId: '', type: 'workplace', date: new Date().toISOString().slice(0,10), conductedBy: '', note: '' });
  const [filter, setFilter] = useState('all'); // all | expiring | expired
  const { ask: askConfirm, confirmEl } = useConfirm();

  const instructions = data.instructions || [];
  const workers = data.workers.filter(w => !w.archived);

  const save = useCallback(async () => {
    if (!form.workerId || !form.date) { addToast('Заполните сотрудника и дату', 'error'); return; }
    const type = INSTRUCTION_TYPES.find(t => t.id === form.type);
    const dateMs = new Date(form.date).getTime();
    const nextDate = type?.months ? new Date(form.date).setMonth(new Date(form.date).getMonth() + type.months) : null;
    const entry = { id: uid(), workerId: form.workerId, type: form.type, date: form.date, dateMs, nextDate, conductedBy: form.conductedBy.trim(), note: form.note.trim(), createdAt: now() };
    const d = { ...data, instructions: [...instructions, entry] };
    await DB.save(d); onUpdate(d);
    setForm({ workerId: '', type: 'workplace', date: new Date().toISOString().slice(0,10), conductedBy: '', note: '' });
    setShowForm(false); addToast('Инструктаж записан', 'success');
  }, [data, instructions, form, onUpdate, addToast]);

  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить запись об инструктаже?' }))) return;
    const d = { ...data, instructions: instructions.filter(i => i.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Удалено', 'info');
  }, [data, instructions, onUpdate, addToast]);

  // Статус инструктажа
  const getStatus = (instr) => {
    if (!instr.nextDate) return 'ok';
    const daysLeft = Math.ceil((instr.nextDate - now()) / 86400000);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'ok';
  };

  // Сводка по сотрудникам — последний инструктаж каждого типа
  const workerSummary = useMemo(() => {
    return workers.map(w => {
      const wInstr = instructions.filter(i => i.workerId === w.id);
      const byType = {};
      INSTRUCTION_TYPES.forEach(t => {
        const last = wInstr.filter(i => i.type === t.id).sort((a,b) => b.dateMs - a.dateMs)[0];
        byType[t.id] = last;
      });
      const hasExpired  = Object.values(byType).some(i => i && getStatus(i) === 'expired');
      const hasExpiring = Object.values(byType).some(i => i && getStatus(i) === 'expiring');
      return { worker: w, byType, hasExpired, hasExpiring };
    });
  }, [workers, instructions]);

  const expired  = workerSummary.filter(s => s.hasExpired).length;
  const expiring = workerSummary.filter(s => s.hasExpiring && !s.hasExpired).length;

  const shown = filter === 'expired'  ? workerSummary.filter(s => s.hasExpired) :
                filter === 'expiring' ? workerSummary.filter(s => s.hasExpiring) :
                workerSummary;

  const statusStyle = { ok: { bg: GN3, cl: GN2, lbl: '✓' }, expiring: { bg: AM3, cl: AM2, lbl: '!' }, expired: { bg: '#FCEBEB', cl: RD2, lbl: '✕' }, none: { bg: '#f5f5f2', cl: '#ccc', lbl: '—' } };

  return h('div', null,
    confirmEl,
    // KPI
    h('div', { style: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 } },
      h(MC, { v: workers.length, l: 'Сотрудников' }),
      h(MC, { v: expiring, l: 'Истекают (30 дн)', c: expiring > 0 ? AM2 : '#888', onClick: () => setFilter(f => f==='expiring'?'all':'expiring') }),
      h(MC, { v: expired, l: 'Просрочены', c: expired > 0 ? RD : '#888', onClick: () => setFilter(f => f==='expired'?'all':'expired') })
    ),

    // Шапка
    h('div', { style:{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' } },
      h('div', { style:{ fontSize:13, fontWeight:500, flex:1 } }, 'Журнал инструктажей ОТ'),
      [['all','Все'],['expiring','Истекают'],['expired','Просрочены']].map(([id,l]) =>
        h('button', { key:id, style: filter===id ? abtn({fontSize:11}) : gbtn({fontSize:11}), onClick: () => setFilter(id) }, l)
      ),
      h('button', { style: abtn(), onClick: () => setShowForm(v => !v) }, '+ Записать инструктаж')
    ),

    // Форма
    showForm && h('div', { style: { ...S.card, border:`1.5px solid ${AM}`, marginBottom:14 } },
      h('div', { style:{ fontSize:13, fontWeight:500, marginBottom:12 } }, 'Новая запись'),
      h('div', { style:{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 } },
        h('div', { style:{ flex:2, minWidth:180 } },
          h('label', { style:S.lbl }, 'Сотрудник *'),
          h('select', { style:S.inp, value: form.workerId, onChange: e => setForm(p => ({ ...p, workerId: e.target.value })) },
            h('option', { value:'' }, '— выберите —'),
            workers.map(w => h('option', { key:w.id, value:w.id }, w.name))
          )
        ),
        h('div', { style:{ flex:2, minWidth:180 } },
          h('label', { style:S.lbl }, 'Вид инструктажа *'),
          h('select', { style:S.inp, value: form.type, onChange: e => setForm(p => ({ ...p, type: e.target.value })) },
            INSTRUCTION_TYPES.map(t => h('option', { key:t.id, value:t.id }, t.label + (t.months ? ` (раз в ${t.months} мес)` : '')))
          )
        ),
        h('div', { style:{ flex:1, minWidth:130 } },
          h('label', { style:S.lbl }, 'Дата *'),
          h('input', { type:'date', style:S.inp, value:form.date, onChange: e => setForm(p => ({ ...p, date: e.target.value })) })
        )
      ),
      h('div', { style:{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 } },
        h('div', { style:{ flex:2, minWidth:180 } },
          h('label', { style:S.lbl }, 'Кто проводил'),
          h('input', { style:S.inp, placeholder:'ФИО инструктора', value:form.conductedBy, onChange: e => setForm(p => ({ ...p, conductedBy: e.target.value })) })
        ),
        h('div', { style:{ flex:3, minWidth:200 } },
          h('label', { style:S.lbl }, 'Примечание'),
          h('input', { style:S.inp, placeholder:'Дополнительная информация', value:form.note, onChange: e => setForm(p => ({ ...p, note: e.target.value })) })
        )
      ),
      h('div', { style:{ display:'flex', gap:8 } },
        h('button', { style: abtn({ flex:1 }), onClick: save }, '✓ Сохранить'),
        h('button', { style: gbtn({ flex:1 }), onClick: () => setShowForm(false) }, 'Отмена')
      )
    ),

    // Матрица: сотрудник × виды инструктажей
    h('div', { style:{ ...S.card, padding:0, overflow:'auto', maxHeight:'60vh' } },
      h('table', { style:{ borderCollapse:'collapse', fontSize:11, width:'100%' } },
        h('thead', null, h('tr', null,
          h('th', { style:{ ...S.th, position:'sticky', top:0, left:0, zIndex:3, background:'#f8f8f5', minWidth:160, textAlign:'left', padding:'6px 10px' } }, 'Сотрудник'),
          INSTRUCTION_TYPES.map(t => h('th', { key:t.id, style:{ ...S.th, position:'sticky', top:0, zIndex:2, background:'#f8f8f5', minWidth:90, fontSize:10 } }, t.label))
        )),
        h('tbody', null, shown.map(({ worker: w, byType }) =>
          h('tr', { key:w.id },
            h('td', { style:{ ...S.td, position:'sticky', left:0, background:'#fff', zIndex:1, padding:'6px 10px', fontWeight:500, boxShadow:'2px 0 4px rgba(0,0,0,0.04)' } }, w.name),
            INSTRUCTION_TYPES.map(t => {
              const instr = byType[t.id];
              const st = instr ? getStatus(instr) : 'none';
              const { bg, cl, lbl } = statusStyle[st];
              const daysLeft = instr?.nextDate ? Math.ceil((instr.nextDate - now()) / 86400000) : null;
              return h('td', { key:t.id, style:{ ...S.td, padding:4, textAlign:'center' } },
                h('span', { title: instr ? `${instr.date}${daysLeft !== null ? (daysLeft < 0 ? ` (просрочен ${Math.abs(daysLeft)} дн)` : ` (${daysLeft} дн)`) : ''}` : 'Не проводился',
                  style:{ display:'inline-flex', flexDirection:'column', alignItems:'center', justifyContent:'center', width:50, padding:'3px 4px', borderRadius:4, background:bg, color:cl, fontSize:10, fontWeight:500, cursor:'default' } },
                  lbl,
                  instr && h('span', { style:{ fontSize:9, opacity:0.8 } }, instr.date.slice(0,7))
                )
              );
            })
          )
        ))
      )
    ),

    // Последние записи
    instructions.length > 0 && h('div', { style:{ marginTop:14 } },
      h('div', { style:{ fontSize:12, fontWeight:500, color:'#888', marginBottom:8 } }, 'Последние записи'),
      [...instructions].sort((a,b) => b.dateMs - a.dateMs).slice(0,10).map(instr => {
        const w = data.workers.find(x => x.id === instr.workerId);
        const t = INSTRUCTION_TYPES.find(x => x.id === instr.type);
        const st = getStatus(instr);
        return h('div', { key:instr.id, style:{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'0.5px solid rgba(0,0,0,0.06)' } },
          h('div', { style:{ flex:1, fontSize:12 } },
            h('span', { style:{ fontWeight:500 } }, w?.name || '—'),
            h('span', { style:{ color:'#888', margin:'0 6px' } }, '·'),
            t?.label || instr.type,
            h('span', { style:{ color:'#888', marginLeft:6, fontSize:11 } }, instr.date)
          ),
          st !== 'ok' && h('span', { style:{ fontSize:10, padding:'1px 6px', borderRadius:4, background: st==='expired'?'#FCEBEB':AM3, color: st==='expired'?RD2:AM2 } }, st==='expired'?'Просрочен':'Истекает'),
          h('button', { style:{ background:'none', border:'none', color:'#ccc', cursor:'pointer', fontSize:14 }, onClick:() => del(instr.id) }, '×')
        );
      })
    )
  );
});

// ==================== VacationPlanner ====================
const VacationPlanner = memo(({ data, onUpdate, addToast }) => {
  const today = new Date().toISOString().slice(0,10);
  const [form, setForm] = useState({ workerId:'', startDate:'', endDate:'', note:'' });
  const [showForm, setShowForm] = useState(false);
  const { ask: askConfirm, confirmEl } = useConfirm();

  const vacations = data.vacations || [];
  const workers = data.workers.filter(w => !w.archived);

  const save = useCallback(async () => {
    if (!form.workerId || !form.startDate || !form.endDate) { addToast('Заполните все поля', 'error'); return; }
    if (form.endDate < form.startDate) { addToast('Дата окончания раньше начала', 'error'); return; }
    const start = new Date(form.startDate), end = new Date(form.endDate);
    const days = Math.ceil((end - start) / 86400000) + 1;
    const entry = { id: uid(), workerId: form.workerId, startDate: form.startDate, endDate: form.endDate, days, note: form.note.trim(), createdAt: now(), approved: false };
    const d = { ...data, vacations: [...vacations, entry] };
    await DB.save(d); onUpdate(d);
    setForm({ workerId:'', startDate:'', endDate:'', note:'' }); setShowForm(false);
    addToast(`Отпуск ${days} дней записан`, 'success');
  }, [data, vacations, form, onUpdate, addToast]);

  const toggle = useCallback(async (id) => {
    const d = { ...data, vacations: vacations.map(v => v.id === id ? { ...v, approved: !v.approved } : v) };
    await DB.save(d); onUpdate(d);
  }, [data, vacations, onUpdate]);

  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить запись об отпуске?' }))) return;
    const d = { ...data, vacations: vacations.filter(v => v.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Удалено', 'info');
  }, [data, vacations, onUpdate, addToast]);

  const getVacStatus = (v) => {
    if (v.endDate < today) return 'past';
    if (v.startDate <= today) return 'active';
    const days = Math.ceil((new Date(v.startDate) - new Date()) / 86400000);
    if (days <= 14) return 'soon';
    return 'planned';
  };

  const statusLabels = { past:'Завершён', active:'Идёт', soon:'Скоро', planned:'Запланирован' };
  const statusColors = { past:['#f5f5f2','#888'], active:[GN3,GN2], soon:[AM3,AM2], planned:['#E6F1FB','#0C447C'] };

  // Кто в отпуске сейчас / скоро
  const activeNow = vacations.filter(v => getVacStatus(v) === 'active').length;
  const soon14 = vacations.filter(v => getVacStatus(v) === 'soon').length;

  return h('div', null,
    confirmEl,
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 } },
      h(MC, { v: activeNow, l: 'В отпуске сейчас', c: activeNow>0?GN:'#888' }),
      h(MC, { v: soon14, l: 'Уходят (14 дн)', c: soon14>0?AM:'#888' }),
      h(MC, { v: vacations.length, l: 'Всего записей' })
    ),

    h('div', { style:{ display:'flex', gap:8, marginBottom:12, alignItems:'center' } },
      h('div', { style:{ fontSize:13, fontWeight:500, flex:1 } }, 'Плановые отпуска'),
      h('button', { style: abtn(), onClick:() => setShowForm(v=>!v) }, '+ Добавить')
    ),

    showForm && h('div', { style:{ ...S.card, border:`1.5px solid ${AM}`, marginBottom:14 } },
      h('div', { style:{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:10 } },
        h('div', { style:{ flex:2, minWidth:180 } },
          h('label', { style:S.lbl }, 'Сотрудник *'),
          h('select', { style:S.inp, value:form.workerId, onChange:e=>setForm(p=>({...p, workerId:e.target.value})) },
            h('option', { value:'' }, '— выберите —'),
            workers.map(w => h('option', { key:w.id, value:w.id }, w.name))
          )
        ),
        h('div', { style:{ flex:1, minWidth:130 } },
          h('label', { style:S.lbl }, 'Начало *'),
          h('input', { type:'date', style:S.inp, value:form.startDate, onChange:e=>setForm(p=>({...p, startDate:e.target.value})) })
        ),
        h('div', { style:{ flex:1, minWidth:130 } },
          h('label', { style:S.lbl }, 'Конец *'),
          h('input', { type:'date', style:S.inp, value:form.endDate, onChange:e=>setForm(p=>({...p, endDate:e.target.value})) })
        ),
        h('div', { style:{ flex:2, minWidth:180 } },
          h('label', { style:S.lbl }, 'Примечание'),
          h('input', { style:S.inp, placeholder:'Основной, учебный...', value:form.note, onChange:e=>setForm(p=>({...p, note:e.target.value})) })
        )
      ),
      form.startDate && form.endDate && form.endDate >= form.startDate && h('div', { style:{ fontSize:12, color:AM2, background:AM3, borderRadius:6, padding:'4px 10px', marginBottom:10 } },
        `${Math.ceil((new Date(form.endDate)-new Date(form.startDate))/86400000)+1} календарных дней`
      ),
      h('div', { style:{ display:'flex', gap:8 } },
        h('button', { style: abtn({ flex:1 }), onClick:save }, '✓ Сохранить'),
        h('button', { style: gbtn({ flex:1 }), onClick:()=>setShowForm(false) }, 'Отмена')
      )
    ),

    h('div', { style:{ ...S.card, padding:0 } },
      h('table', { style:{ borderCollapse:'collapse', width:'100%', fontSize:12 } },
        h('thead', null, h('tr', null,
          ['Сотрудник','Начало','Конец','Дней','Статус','Утверждён',''].map((t,i) => h('th', { key:i, style:S.th }, t))
        )),
        h('tbody', null, [...vacations].sort((a,b) => a.startDate.localeCompare(b.startDate)).map(v => {
          const w = data.workers.find(x => x.id === v.workerId);
          const st = getVacStatus(v);
          const [bg, cl] = statusColors[st];
          return h('tr', { key:v.id },
            h('td', { style:S.td }, w?.name || '—'),
            h('td', { style:S.td }, v.startDate),
            h('td', { style:S.td }, v.endDate),
            h('td', { style:{ ...S.td, textAlign:'center' } }, v.days),
            h('td', { style:S.td }, h('span', { style:{ padding:'2px 8px', borderRadius:4, background:bg, color:cl, fontSize:10 } }, statusLabels[st])),
            h('td', { style:{ ...S.td, textAlign:'center' } },
              h('input', { type:'checkbox', checked:v.approved, onChange:()=>toggle(v.id), style:{ accentColor:GN, width:16, height:16 } })
            ),
            h('td', { style:S.td }, h('button', { style:{ background:'none', border:'none', color:'#ccc', cursor:'pointer' }, onClick:()=>del(v.id) }, '×'))
          );
        })),
        vacations.length === 0 && h('tr', null, h('td', { colSpan:7, style:{ ...S.td, textAlign:'center', color:'#888', padding:24 } }, 'Нет записей об отпусках'))
      )
    )
  );
});

// ==================== MonthlyReport ====================
const MonthlyReport = memo(({ data }) => {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  const periodStart = new Date(year, month, 1).getTime();
  const periodEnd   = new Date(year, month+1, 0, 23, 59, 59).getTime();

  const report = useMemo(() => {
    const ops = data.ops.filter(o => o.finishedAt >= periodStart && o.finishedAt <= periodEnd);
    const done    = ops.filter(o => o.status === 'done').length;
    const defect  = ops.filter(o => o.status === 'defect').length;
    const total   = done + defect;
    const quality = total > 0 ? Math.round(done/total*100) : 100;

    const orders = data.orders.filter(o => !o.archived);
    const completed = orders.filter(o => {
      const oOps = data.ops.filter(op => op.orderId === o.id);
      return oOps.length > 0 && oOps.every(op => op.status === 'done' || op.status === 'defect');
    });
    const overdue = orders.filter(o => o.deadline && new Date(o.deadline) < new Date() && !completed.find(c => c.id === o.id));

    const downtimeMs = data.events.filter(e => e.type==='downtime' && e.ts>=periodStart && e.ts<=periodEnd).reduce((s,e) => s+(e.duration||0), 0);

    const activeWorkers = data.workers.filter(w => !w.archived);
    const topWorkers = activeWorkers.map(w => ({
      name: w.name,
      done: ops.filter(o => o.status==='done' && o.workerIds?.includes(w.id)).length,
      defects: ops.filter(o => o.status==='defect' && o.workerIds?.includes(w.id)).length,
    })).filter(w => w.done+w.defects > 0).sort((a,b) => b.done - a.done).slice(0,5);

    // Нормы — топ операций с расхождением факт/план
    const normsAlert = Object.entries(data.opNorms || {}).map(([name, n]) => {
      const avgH = Math.round(n.totalMs / n.samples / 360000) / 10;
      const planned = data.productionStages?.find(s => s.name === name);
      return { name, avgH, samples: n.samples };
    }).sort((a,b) => b.samples - a.samples).slice(0,5);

    return { done, defect, total, quality, orders: orders.length, completed: completed.length, overdue: overdue.length, downtimeH: Math.round(downtimeMs/3600000*10)/10, topWorkers, normsAlert };
  }, [data, month, year]);

  const exportReport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Сводный отчёт за '+MONTHS[month]+' '+year],[''],
      ['ПРОИЗВОДСТВО'],
      ['Выполнено операций', report.done],
      ['Брак', report.defect],
      ['Качество (%)', report.quality],
      ['Простои (ч)', report.downtimeH],[''],
      ['ЗАКАЗЫ'],
      ['Активных заказов', report.orders],
      ['Завершено за период', report.completed],
      ['Просрочено', report.overdue],[''],
      ['ТОП СОТРУДНИКОВ'],
      ['Сотрудник','Операций','Брак'],
      ...report.topWorkers.map(w => [w.name, w.done, w.defects])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Отчёт');
    XLSX.writeFile(wb, `report_${month+1}_${year}.xlsx`);
  }, [report, month, year]);

  const kpi = [
    [report.done, 'Операций выполнено', report.done > 0 ? GN : '#888'],
    [`${report.quality}%`, 'Качество', report.quality>=95?GN:report.quality>=85?AM:RD],
    [`${report.downtimeH}ч`, 'Простоев', report.downtimeH > 0 ? AM2 : '#888'],
    [report.completed+'/'+report.orders, 'Заказов завершено', GN2],
    [report.overdue, 'Просрочено', report.overdue > 0 ? RD : '#888'],
    [report.defect, 'Брак', report.defect > 0 ? RD : '#888'],
  ];

  return h('div', null,
    h('div', { style:{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 } },
      h('button', { style:gbtn({padding:'6px 12px'}), onClick:()=>{ let m=month-1,y=year; if(m<0){m=11;y--;} setMonth(m); setYear(y); } }, '‹'),
      h('span', { style:{ fontSize:15, fontWeight:500, minWidth:140, textAlign:'center' } }, `${MONTHS[month]} ${year}`),
      h('button', { style:gbtn({padding:'6px 12px'}), onClick:()=>{ let m=month+1,y=year; if(m>11){m=0;y++;} setMonth(m); setYear(y); } }, '›'),
      h('button', { style:abtn({marginLeft:'auto'}), onClick:exportReport }, '📥 Excel')
    ),

    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 } },
      kpi.map(([v,l,c]) => h(MC, { key: l, v, l, c, fs: 26 }))
    ),

    report.topWorkers.length > 0 && h('div', { style:S.card },
      h('div', { style:S.sec }, 'Топ сотрудников'),
      report.topWorkers.map((w,i) => h('div', { key:i, style:{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' } },
        h('div', { style:{ width:20, height:20, borderRadius:'50%', background:AM3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500, color:AM2 } }, i+1),
        h('div', { style:{ flex:1, fontSize:13 } }, w.name),
        h('div', { style:{ fontSize:12, color:GN2, fontWeight:500 } }, `${w.done} оп.`),
        w.defects > 0 && h('div', { style:{ fontSize:11, color:RD2, background:'#FCEBEB', padding:'1px 6px', borderRadius:4 } }, `${w.defects} брак`)
      ))
    ),

    report.normsAlert.length > 0 && h('div', { style:S.card },
      h('div', { style:S.sec }, 'Накопленные нормы времени'),
      h('div', { style:{ fontSize:11, color:'#888', marginBottom:8 } }, 'Средний фактический результат — используйте для планирования'),
      report.normsAlert.map((n,i) => h('div', { key:i, style:{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' } },
        h('div', { style:{ flex:1, fontSize:12 } }, n.name),
        h('div', { style:{ fontSize:12, fontWeight:500, color:AM2 } }, `${n.avgH}ч`),
        h('div', { style:{ fontSize:11, color:'#888' } }, `(${n.samples} выборок)`)
      ))
    )
  );
});




// ==================== VacationTimeline (График отпусков — визуальная шкала) ====================
const VacationTimeline = memo(({ data }) => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

  const workers = useMemo(() => data.workers.filter(w => !w.archived), [data.workers]);
  const vacations = useMemo(() => (data.vacations || []).filter(v => {
    const s = new Date(v.startDate), e = new Date(v.endDate);
    return s.getFullYear() === year || e.getFullYear() === year;
  }), [data.vacations, year]);

  const daysInYear = useMemo(() => {
    const arr = [];
    for (let m = 0; m < 12; m++) arr.push(new Date(year, m + 1, 0).getDate());
    return arr;
  }, [year]);
  const totalDays = daysInYear.reduce((s, d) => s + d, 0);

  // По каждому дню года — сколько человек в отпуске
  const overlapDays = useMemo(() => {
    const dayMap = new Array(totalDays).fill(0);
    vacations.forEach(v => {
      const s = new Date(v.startDate), e = new Date(v.endDate);
      const yearStart = new Date(year, 0, 1).getTime();
      const dayStart = Math.max(0, Math.floor((s.getTime() - yearStart) / 86400000));
      const dayEnd = Math.min(totalDays - 1, Math.floor((e.getTime() - yearStart) / 86400000));
      for (let d = dayStart; d <= dayEnd; d++) dayMap[d]++;
    });
    return dayMap;
  }, [vacations, year, totalDays]);

  const stats = useMemo(() => {
    const withVac = new Set(vacations.map(v => v.workerId));
    const overlapCount = overlapDays.filter(d => d >= 2).length;
    const maxOverlap = Math.max(0, ...overlapDays);
    return { total: vacations.length, workers: withVac.size, overlapDays: overlapCount, maxOverlap };
  }, [vacations, overlapDays]);

  const getBar = (v) => {
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year, 11, 31).getTime();
    const s = Math.max(new Date(v.startDate).getTime(), yearStart);
    const e = Math.min(new Date(v.endDate).getTime(), yearEnd);
    const left = (s - yearStart) / (yearEnd - yearStart) * 100;
    const width = Math.max(0.5, (e - s) / (yearEnd - yearStart) * 100);
    return { left, width };
  };

  const fmtD = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  return h('div', null,
    // Год + сводка
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' } },
      h('button', { style: gbtn({ padding: '6px 12px' }), onClick: () => setYear(y => y - 1) }, '‹'),
      h('span', { style: { fontSize: 18, fontWeight: 500, minWidth: 60, textAlign: 'center' } }, year),
      h('button', { style: gbtn({ padding: '6px 12px' }), onClick: () => setYear(y => y + 1) }, '›'),
      h('button', { style: gbtn({ padding: '6px 10px', fontSize: 11 }), onClick: () => setYear(today.getFullYear()) }, 'Сегодня')
    ),
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 14 } },
      h(MC, { v: stats.total, l: 'Отпусков' }),
      h(MC, { v: stats.workers, l: 'Сотрудников' }),
      h(MC, { v: `${stats.overlapDays} дн`, l: 'Пересечения', c: stats.overlapDays > 0 ? RD : GN }),
      h(MC, { v: stats.maxOverlap, l: 'Макс. одноврем.', c: stats.maxOverlap >= 3 ? RD : stats.maxOverlap >= 2 ? AM : GN })
    ),
    // Полоса перекрытий
    stats.overlapDays > 0 && h('div', { style: { ...S.card, padding: 10, marginBottom: 12 } },
      h('div', { style: { fontSize: 10, color: RD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 500 } }, '⚠ Пересечения отпусков'),
      h('div', { style: { display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden', background: '#f5f5f2' } },
        overlapDays.map((cnt, i) => h('div', { key: i, style: {
          flex: 1, background: cnt >= 3 ? RD : cnt >= 2 ? AM : 'transparent',
          opacity: cnt >= 2 ? 0.7 : 0
        }}))
      ),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 2 } },
        MONTHS.map(m => h('span', { key: m, style: { fontSize: 8, color: '#aaa', flex: 1, textAlign: 'center' } }, m))
      )
    ),
    // Таймлайн
    vacations.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 24 } }, 'Нет запланированных отпусков в ' + year + ' году')
      : h('div', { style: { ...S.card, padding: 0, overflowX: 'auto' } },
          // Заголовок месяцев
          h('div', { style: { display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.08)', position: 'sticky', top: 0, background: '#fff', zIndex: 2 } },
            h('div', { style: { width: 140, flexShrink: 0, padding: '8px 10px', fontSize: 10, color: '#888', fontWeight: 500 } }, 'Сотрудник'),
            h('div', { style: { flex: 1, display: 'flex', minWidth: 600 } },
              MONTHS.map((m, i) => {
                const isNow = today.getFullYear() === year && today.getMonth() === i;
                return h('div', { key: m, style: {
                  flex: daysInYear[i], textAlign: 'center', fontSize: 10, padding: '8px 0',
                  color: isNow ? AM2 : '#888', fontWeight: isNow ? 600 : 400,
                  background: isNow ? AM3 : 'transparent',
                  borderLeft: i > 0 ? '0.5px solid rgba(0,0,0,0.06)' : 'none'
                }}, m);
              })
            )
          ),
          // Строки сотрудников
          workers.map(w => {
            const wVacs = vacations.filter(v => v.workerId === w.id);
            if (wVacs.length === 0) return null;
            return h('div', { key: w.id, style: { display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.04)', minHeight: 36, alignItems: 'center' } },
              h('div', { style: { width: 140, flexShrink: 0, padding: '6px 10px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, w.name),
              h('div', { style: { flex: 1, position: 'relative', minWidth: 600, height: 28 } },
                // Сетка месяцев
                MONTHS.map((_, i) => {
                  const left = daysInYear.slice(0, i).reduce((s, d) => s + d, 0) / totalDays * 100;
                  return i > 0 ? h('div', { key: i, style: { position: 'absolute', left: left + '%', top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.04)' } }) : null;
                }),
                // Полоски отпусков
                wVacs.map(v => {
                  const bar = getBar(v);
                  const hasOverlap = vacations.some(ov => ov.id !== v.id && ov.workerId !== w.id &&
                    new Date(v.startDate) < new Date(ov.endDate) && new Date(v.endDate) > new Date(ov.startDate));
                  return h('div', { key: v.id, title: fmtD(v.startDate) + ' — ' + fmtD(v.endDate) + (v.approved ? ' ✓' : ' (не утв.)') + (hasOverlap ? ' ⚠ пересечение' : ''),
                    style: {
                      position: 'absolute', top: 4, height: 20, borderRadius: 4,
                      left: bar.left + '%', width: bar.width + '%', minWidth: 6,
                      background: hasOverlap ? RD : v.approved ? '#378ADD' : AM,
                      opacity: v.approved ? 0.85 : 0.5,
                      border: hasOverlap ? '1.5px solid ' + RD2 : 'none',
                      cursor: 'default', fontSize: 9, color: '#fff', fontWeight: 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 3px'
                    }
                  }, bar.width > 4 ? fmtD(v.startDate) : '');
                })
              )
            );
          }),
          // Легенда
          h('div', { style: { display: 'flex', borderTop: '0.5px solid rgba(0,0,0,0.08)', padding: '8px 10px', gap: 16, fontSize: 11, color: '#888' } },
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('div', { style: { width: 12, height: 12, background: '#378ADD', borderRadius: 3, opacity: 0.85 } }), 'Утверждён'),
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('div', { style: { width: 12, height: 12, background: AM, borderRadius: 3, opacity: 0.5 } }), 'Не утверждён'),
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 4 } }, h('div', { style: { width: 12, height: 12, background: RD, borderRadius: 3, border: '1px solid ' + RD2 } }), 'Пересечение')
          )
        )
  );
});
