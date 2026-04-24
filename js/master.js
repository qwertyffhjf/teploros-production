// teploros · master.js
// Автоматически извлечено из монолита

const MasterOps = memo(({ data, onUpdate, onShowQR, addToast, onOrderClick, onWorkerClick }) => {
  const stagesList = useMemo(() => (data.productionStages || []).map(s => s.name)
, [data.productionStages]);
  const { ask: askConfirm, confirmEl } = useConfirm();
  const [form, setForm] = useState({ orderId: '', name: '', workerIds: [], plannedHours: '', sectionId: '', equipmentId: '', plannedStartDate: '', drawingUrl: '' });
  const [filt, setFilt] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [fieldErrors, setFieldErrors] = useState({});
  const [opsFilterType, setOpsFilterType] = useState('');
  const [selectedOps, setSelectedOps] = useState(new Set());
  const opsProductTypes = data.settings?.productTypes || [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }];

  const autoAssign = useCallback(() => {
    if (!form.name) { addToast('Сначала выберите операцию', 'error'); return; }
    const workerId = autoAssignWorker(data, form.name);
    if (!workerId) { addToast('Не найден подходящий свободный сотрудник', 'error'); return; }
    setForm(p => ({ ...p, workerIds: [...new Set([...p.workerIds, workerId])] }));
    addToast(`Назначен сотрудник ${data.workers.find(w => w.id === workerId)?.name}`, 'success');
  }, [data, form.name, addToast]);

  const validate = () => {
    const errors = {};
    if (!form.orderId) errors.orderId = 'Выберите заказ';
    if (!form.name.trim()) errors.name = 'Введите название операции';
    if (form.plannedHours && (isNaN(form.plannedHours) || Number(form.plannedHours) <= 0)) errors.plannedHours = 'Плановое время должно быть положительным числом';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setForm({ orderId: '', name: '', workerIds: [], plannedHours: '', sectionId: '', equipmentId: '', plannedStartDate: '', drawingUrl: '' }); setFieldErrors({}); setEditingId(null); };

  const addOrUpdate = useCallback(async () => {
    if (!validate()) return;
    // Проверка компетенций назначенных рабочих
    if (form.workerIds.length > 0 && form.name) {
      const invalid = data.workers.filter(w => form.workerIds.includes(w.id) && w.competences && w.competences.length > 0 && !w.competences.includes(form.name));
      if (invalid.length > 0) { addToast(`У ${invalid.map(w => w.name).join(', ')} нет допуска к «${form.name}»`, 'error'); return; }
    }
    if (editingId) {
      const updatedOps = data.ops.map(o => o.id === editingId ? { ...o, orderId: form.orderId, name: form.name.trim(), workerIds: form.workerIds, plannedHours: form.plannedHours ? Number(form.plannedHours) : undefined, sectionId: form.sectionId || null, equipmentId: form.equipmentId || null, plannedStartDate: form.plannedStartDate ? new Date(form.plannedStartDate).getTime() : undefined, drawingUrl: form.drawingUrl.trim() || undefined } : o);
      const d = { ...data, ops: updatedOps };
      await DB.save(d); onUpdate(d); resetForm(); addToast('Операция обновлена', 'success');
    } else {
      const op = { id: uid(), orderId: form.orderId, name: form.name.trim(), workerIds: form.workerIds, status: 'pending', createdAt: now(), plannedHours: form.plannedHours ? Number(form.plannedHours) : undefined, archived: false, sectionId: form.sectionId || null, equipmentId: form.equipmentId || null, plannedStartDate: form.plannedStartDate ? new Date(form.plannedStartDate).getTime() : undefined, drawingUrl: form.drawingUrl.trim() || undefined, requiresQC: form.name.includes('свар') || form.name.includes('Опресовка') };
      const d = { ...data, ops: [...data.ops, op] };
      await DB.save(d); onUpdate(d); resetForm(); addToast('Операция добавлена', 'success');
    }
  }, [form, editingId, data, onUpdate, addToast]);

  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Переместить операцию в архив?', danger: false }))) return;
    let d = { ...data, ops: data.ops.map(o => o.id === id ? { ...o, archived: true } : o) };
    d = logAction(d, 'op_archive', { opId: id, opName: data.ops.find(o => o.id === id)?.name });
    await DB.save(d); onUpdate(d); addToast('Операция архивирована', 'info');
  }, [data, onUpdate, addToast]);

  const restore = useCallback(async (id) => {
    const d = { ...data, ops: data.ops.map(o => o.id === id ? { ...o, archived: false } : o) };
    await DB.save(d); onUpdate(d); addToast('Операция восстановлена', 'success');
  }, [data, onUpdate, addToast]);

  const assignWorkers = useCallback(async (opId, workerIds) => {
    const op = data.ops.find(o => o.id === opId);
    const invalidWorkers = data.workers.filter(w => workerIds.includes(w.id) && w.competences && w.competences.length > 0 && !w.competences.includes(op.name));
    if (invalidWorkers.length > 0) { addToast(`У следующих сотрудников нет компетенции: ${invalidWorkers.map(w => w.name).join(', ')}`, 'error'); return; }
    
    const d = { ...data, ops: data.ops.map(o => o.id === opId ? { ...o, workerIds } : o) };
    await DB.save(d); onUpdate(d); addToast('Исполнители изменены', 'info');
  }, [data, onUpdate, addToast]);

  const toggleOpSelection = (opId) => {
    const newSelected = new Set(selectedOps);
    if (newSelected.has(opId)) {
      newSelected.delete(opId);
    } else {
      newSelected.add(opId);
    }
    setSelectedOps(newSelected);
  };

  const selectAllVisible = () => {
    if (selectedOps.size === opsToShow.length) {
      setSelectedOps(new Set());
    } else {
      setSelectedOps(new Set(opsToShow.map(op => op.id)));
    }
  };

  const deleteSelected = async () => {
    if (selectedOps.size === 0) return;
    const d = { ...data, ops: data.ops.filter(op => !selectedOps.has(op.id)) };
    await DB.save(d); onUpdate(d); setSelectedOps(new Set()); addToast(`Удалено ${selectedOps.size} операций`, 'success');
  };

  const edit = useCallback(op => {
    setForm({ orderId: op.orderId, name: op.name, workerIds: op.workerIds || [], plannedHours: op.plannedHours || '', sectionId: op.sectionId || '', equipmentId: op.equipmentId || '', plannedStartDate: op.plannedStartDate ? new Date(op.plannedStartDate).toISOString().slice(0,16) : '', drawingUrl: op.drawingUrl || '' });
    setEditingId(op.id);
  }, []);

  const opsToShow = useMemo(() => {
    let filtered = data.ops.filter(o => showArchived ? true : !o.archived);
    // Фильтр по типу продукции (через заказ)
    if (opsFilterType) {
      const typeOrderIds = new Set(data.orders.filter(o => o.productType === opsFilterType).map(o => o.id));
      filtered = filtered.filter(o => typeOrderIds.has(o.orderId));
    }
    if (filt === 'active') filtered = filtered.filter(o => o.status === 'in_progress');
    else if (filt === 'pending') filtered = filtered.filter(o => o.status === 'pending');
    else if (filt === 'issues') filtered = filtered.filter(o => o.status === 'defect' || o.status === 'rework');
    else if (filt === 'on_check') filtered = filtered.filter(o => o.status === 'on_check');
    else if (filt !== 'all') filtered = filtered.filter(o => o.orderId === filt);
    return filtered;
  }, [data.ops, data.orders, filt, showArchived, opsFilterType]);

  const paginated = useMemo(() => { const start = (page-1)*pageSize; return opsToShow.slice(start, start+pageSize); }, [opsToShow, page]);
  useEffect(() => { setPage(1); }, [filt, showArchived]);
  
  // 🔥 Горячая клавиша Delete для удаления выбранных операций
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedOps.size > 0) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOps]);

  return h('div', null,
    confirmEl,
    !editingId && h(PasteImportWidget, { addToast, hint: 'Вставить операции из Excel',
      columns: [
        { key: 'orderNumber',  label: 'Номер заказа', required: true },
        { key: 'name',         label: 'Операция',     required: true },
        { key: 'plannedHours', label: 'План, ч',       required: false, default: '' },
      ],
      onImport: async (rows) => {
        const orderMap = {};
        data.orders.forEach(o => { orderMap[o.number.toLowerCase()] = o.id; });
        let added = 0;
        let newOps = [...data.ops];
        rows.forEach(r => {
          const orderId = orderMap[r.orderNumber?.toLowerCase()];
          if (!orderId || !r.name) return;
          newOps.push({ id: uid(), orderId, name: r.name, status: 'pending',
            workerIds: [], plannedHours: Number(r.plannedHours) || undefined,
            sectionId: '', equipmentId: '', drawingUrl: '', createdAt: now() });
          added++;
        });
        if (!added) { addToast('Не найдено подходящих операций (проверьте номера заказов)', 'error'); return; }
        const d = { ...data, ops: newOps };
        await DB.save(d); onUpdate(d); addToast(`Добавлено операций: ${added}`, 'success');
      }}),
    // Форма создания/редактирования операции
    h('div', { style: S.card },
      h('div', { style: S.sec }, editingId ? '📝 Редактировать операцию' : 'Создать операцию'),
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' } },
        !editingId && h('div', { style: { minWidth: 150 } }, h('select', { style: { ...S.inp, width: '100%' }, value: form.orderId, onChange: e => setForm(p => ({ ...p, orderId: e.target.value })) }, h('option', { value: '' }, '— заказ —'), data.orders.map(o => h('option', { key: o.id, value: o.id }, o.number))), fieldErrors.orderId && h('div', { className: 'error-message' }, fieldErrors.orderId)),
        h('div', { style: { flex: 1, minWidth: 160 } }, h('select', { style: { ...S.inp, width: '100%' }, value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }, h('option', { value: '' }, '— операция —'), stagesList.map(stage => h('option', { key: stage, value: stage }, stage))), fieldErrors.name && h('div', { className: 'error-message' }, fieldErrors.name)),
        h('div', { style: { minWidth: 200 } },
          h('div', { style: { fontSize: 10, color: '#888', marginBottom: 4 } }, 'Исполнители'),
          h('div', { className: 'checkbox-group', style: { display: 'flex', flexDirection: 'column', gap: 6 } }, (() => {
            const allWorkers = data.workers.filter(w => !w.archived && (w.status || 'working') === 'working');
            // Сортировка: 1) Есть нужная компетенция, 2) Без ограничений, 3) Нет компетенции
            const hasComp = allWorkers.filter(w => form.name && w.competences?.length > 0 && w.competences.includes(form.name));
            const noRestriction = allWorkers.filter(w => !w.competences || w.competences.length === 0);
            const noComp = allWorkers.filter(w => form.name && w.competences?.length > 0 && !w.competences.includes(form.name));
            const sorted = [...hasComp, ...noRestriction, ...noComp];
            return sorted.map(w => {
              const isSelected = form.workerIds.includes(w.id);
              const hasRelevantComp = form.name && w.competences?.includes(form.name);
              const noCompRestriction = !w.competences || w.competences.length === 0;
              const notQualified = form.name && w.competences?.length > 0 && !w.competences.includes(form.name);
              return h('span', { key: w.id,
                style: {
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: notQualified ? 'not-allowed' : 'pointer',
                  background: isSelected ? AM3 : notQualified ? '#fafafa' : '#f5f5f5',
                  color: isSelected ? AM2 : notQualified ? '#ccc' : '#666',
                  fontSize: 13,
                  fontWeight: isSelected ? 500 : 400,
                  border: isSelected ? `1.5px solid ${AM}` : notQualified ? '1px solid #eee' : '1px solid #ddd',
                  userSelect: 'none',
                  opacity: notQualified ? 0.5 : 1,
                },
                title: hasRelevantComp ? `✓ Допущен к "${form.name}"` : noCompRestriction ? 'Без ограничений по компетенциям' : `Нет допуска к "${form.name}"`,
                onClick: () => {
                  if (notQualified) return;
                  if (isSelected) setForm(p => ({ ...p, workerIds: p.workerIds.filter(id => id !== w.id) }));
                  else setForm(p => ({ ...p, workerIds: [...p.workerIds, w.id] }));
                }
              }, isSelected ? '✓ ' : hasRelevantComp ? '★ ' : '', w.name);
            });
          })()),
          h('button', { style: gbtn({ marginTop: 4, fontSize: 11, padding: '4px 8px' }), onClick: autoAssign }, '🤖 Подобрать')
        ),
        h('div', { style: { minWidth: 100 } },
          h('input', { type: 'number', step: '0.1', style: { ...S.inp, width: '100%' }, placeholder: 'План, ч', value: form.plannedHours, onChange: e => setForm(p => ({ ...p, plannedHours: e.target.value })) }),
          (() => {
            const norm = data.opNorms?.[form.name];
            if (!norm || norm.samples < 2) return null;
            const suggested = Math.round(norm.totalMs / norm.samples / 3600000 * 10) / 10;
            return h('div', { style: { fontSize: 10, color: AM4, marginTop: 2, cursor: 'pointer' }, onClick: () => setForm(p => ({ ...p, plannedHours: String(suggested) })) },
              `↑ норма ${suggested}ч (${norm.samples} оп.)`
            );
          })()
        ),
        h('div', { style: { minWidth: 140 } }, h('input', { style: { ...S.inp, width: '100%' }, placeholder: 'Ссылка на чертёж', value: form.drawingUrl, onChange: e => setForm(p => ({ ...p, drawingUrl: e.target.value })) })),
        h('button', { type: 'button', style: abtn(), onClick: addOrUpdate }, editingId ? '✓' : '+'),
        editingId && h('button', { type: 'button', style: gbtn(), onClick: () => resetForm() }, 'Отмена')
      )
    ),
    // Фильтр по типу продукции
    h('div', { style: { display: 'flex', gap: 4, marginBottom: 8 } },
      h('button', { style: !opsFilterType ? abtn({ fontSize: 11, padding: '4px 12px' }) : gbtn({ fontSize: 11, padding: '4px 12px' }), onClick: () => setOpsFilterType('') }, 'Все'),
      opsProductTypes.map(pt => h('button', { key: pt.id, style: opsFilterType === pt.id ? abtn({ fontSize: 11, padding: '4px 12px' }) : gbtn({ fontSize: 11, padding: '4px 12px' }), onClick: () => setOpsFilterType(pt.id) }, pt.label))
    ),
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
      [['all','Все'],['pending','Ожидают'],['active','В работе'],['on_check','На контроле'],['issues','Проблемы']].map(([id,l]) => h('button', { key: id, style: filt === id ? abtn() : gbtn(), onClick: () => setFilt(id) }, l)),
      data.orders.filter(o => !o.archived).map(o => h('button', { key: o.id, style: filt === o.id ? abtn({ fontSize: 10 }) : gbtn({ fontSize: 10 }), onClick: () => setFilt(o.id) }, o.number)),
      h('label', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
        h('input', { type: 'checkbox', checked: showArchived, onChange: e => setShowArchived(e.target.checked) }), 'Показать архивные'
      )
    ),
    // 🎯 Контролы для пакетного удаления
    selectedOps.size > 0 && h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'rgba(220, 38, 38, 0.1)', borderRadius: 6, alignItems: 'center', flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 12, color: '#666', fontWeight: 500 } }, `Выбрано: ${selectedOps.size} операций`),
      h('button', { style: { padding: '4px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 500 }, onClick: deleteSelected }, '🗑️ Удалить (или нажми Delete)'),
      h('button', { style: gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setSelectedOps(new Set()) }, 'Отмена')
    ),
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
      paginated.length > 0 && h('button', { style: gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: selectAllVisible }, selectedOps.size === opsToShow.length && opsToShow.length > 0 ? '☑️ Убрать выделение' : '☐ Выбрать видимые')
    ),
    paginated.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Нет операций')
      : h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, [h('th', { style: { ...S.th, width: 32, textAlign: 'center', padding: '8px 4px' } }, '☐'), ...['ID','Операция','Заказ','Исполнители','Участок','Оборуд.','План, ч','План. старт','Чертёж','Статус','Время',''].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t))])),
          h('tbody', null, paginated.map(op => {
            const ord = data.orders.find(o => o.id === op.orderId);
            const section = data.sections.find(s => s.id === op.sectionId);
            const eq = data.equipment.find(e => e.id === op.equipmentId);
            const dur = op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : op.startedAt ? fmtDur(now() - op.startedAt) + ' ↻' : '—';
            return [h('tr', { key: op.id, style: { background: op.archived ? '#eee' : (op.status === 'defect' ? RD3 : op.status === 'rework' ? AM3 : op.status === 'on_check' ? '#E1F5FE' : editingId === op.id ? AM3 : 'transparent'), cursor: 'pointer' }, onClick: () => toggleOpSelection(op.id) },
              h('td', { style: { ...S.td, width: 32, textAlign: 'center', padding: '8px 4px', userSelect: 'none' }, onClick: (e) => { e.stopPropagation(); toggleOpSelection(op.id); } }, selectedOps.has(op.id) ? '☑' : '☐'),
              h('td', { style: { ...S.td, fontFamily: 'monospace', fontSize: 10 } }, op.id),
              h('td', { style: { ...S.td, fontWeight: 500 } }, op.name, op.defectNote && h('div', { style: { fontSize: 10, color: RD } }, op.defectNote)),
              h('td', { style: { ...S.td, fontSize: 11 } },
                onOrderClick && ord
                  ? h('span', { style: { color: AM, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }, onClick: () => onOrderClick(ord.id), title: 'Открыть карточку заказа' }, ord.number)
                  : h('span', { style: { color: AM } }, ord?.number || '—')
              ),
              h('td', { style: { ...S.td, minWidth: 120 } },
                (op.workerIds || []).length > 0 && h('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 } },
                  (op.workerIds || []).map(wid => {
                    const w = data.workers.find(w => w.id === wid);
                    return w ? h('span', { key: wid, style: { display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px', fontSize: 10, background: AM3, color: AM2, borderRadius: 6 } },
                      h(WN, { workerId: wid, data, onWorkerClick, style: { fontSize: 11 } }),
                      !op.archived && h('span', { style: { cursor: 'pointer', fontWeight: 500, marginLeft: 2 }, onClick: () => assignWorkers(op.id, (op.workerIds || []).filter(id => id !== wid)) }, '×')
                    ) : null;
                  })
                ),
                !op.archived && h('details', { style: { fontSize: 10 } },
                  h('summary', { style: { cursor: 'pointer', color: AM, userSelect: 'none', padding: '2px 0', fontWeight: 500 } }, '➕ Добавить'),
                  h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', maxHeight: 120, overflowY: 'auto' } },
                    data.workers.filter(w => !w.archived && (w.status || 'working') === 'working' && (!w.competences || w.competences.length === 0 || w.competences.includes(op.name)) && !(op.workerIds || []).includes(w.id))
                      .map(w => h('div', { key: w.id, style: { padding: '4px 8px', borderRadius: 4, cursor: 'pointer', background: '#f5f5f5', fontSize: 11, userSelect: 'none', transition: 'all 0.2s', border: '1px solid #ddd' }, onClick: () => assignWorkers(op.id, [...(op.workerIds || []), w.id]) },
                        h('span', { style: { color: GN, fontWeight: 500, marginRight: 4 } }, '+'), w.name
                      ))
                  )
                )
              ),
              h('td', { style: { ...S.td, fontSize: 11 } }, section?.name || '—'),
              h('td', { style: { ...S.td, fontSize: 11 } }, eq?.name || '—'),
              h('td', { style: { ...S.td, textAlign: 'center' } }, op.plannedHours || '—'),
              h('td', { style: { ...S.td, fontSize: 11 } }, op.plannedStartDate ? new Date(op.plannedStartDate).toLocaleString() : '—'),
              h('td', { style: { ...S.td, fontSize: 11 } }, op.drawingUrl ? h('a', { href: op.drawingUrl, target: '_blank', rel: 'noopener', style: { color: BL, textDecoration: 'none' } }, '📐') : '—'),
              h('td', { style: S.td }, h(Badge, { st: op.status })),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, dur),
              h('td', { style: S.td },
                h('div', { style: { display: 'flex', gap: 4 } },
                  !op.archived ? [
                    h('button', { key: 'qr', style: gbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => onShowQR(op, data.workers.find(w => w.id === op.workerIds?.[0])) }, 'QR'),
                    h('button', { key: 'edit', style: (editingId === op.id ? abtn : gbtn)({ fontSize: 11, padding: '4px 8px' }), onClick: () => editingId === op.id ? resetForm() : edit(op) }, editingId === op.id ? '✕' : '✎'),
                    editingId !== op.id && h('button', { key: 'del', style: rbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => del(op.id) }, '✕')
                  ] : h('button', { style: gbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => restore(op.id) }, '↩')
                )
              )
            ),
            // Inline-редактирование — карточка под строкой
            editingId === op.id && h('tr', { key: op.id + '_edit' },
              h('td', { colSpan: 12, style: { padding: '10px', background: AM3, borderBottom: `2px solid ${AM}` } },
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' } },
                  h('div', { style: { minWidth: 140 } }, h('div', { style: S.lbl }, 'Операция'), h('select', { style: { ...S.inp, width: '100%', fontSize: 11 }, value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }, stagesList.map(s => h('option', { key: s, value: s }, s)))),
                  h('div', { style: { minWidth: 100 } }, h('div', { style: S.lbl }, 'Участок'), h('select', { style: { ...S.inp, width: '100%', fontSize: 11 }, value: form.sectionId, onChange: e => setForm(p => ({ ...p, sectionId: e.target.value })) }, h('option', { value: '' }, '—'), data.sections.map(s => h('option', { key: s.id, value: s.id }, s.name)))),
                  h('div', { style: { minWidth: 100 } }, h('div', { style: S.lbl }, 'Оборудов.'), h('select', { style: { ...S.inp, width: '100%', fontSize: 11 }, value: form.equipmentId, onChange: e => setForm(p => ({ ...p, equipmentId: e.target.value })) }, h('option', { value: '' }, '—'), data.equipment.map(eq => h('option', { key: eq.id, value: eq.id }, eq.name)))),
                  h('div', { style: { minWidth: 80 } }, h('div', { style: S.lbl }, 'План, ч'), h('input', { type: 'number', step: '0.1', style: { ...S.inp, width: '100%', fontSize: 11 }, value: form.plannedHours, onChange: e => setForm(p => ({ ...p, plannedHours: e.target.value })) })),
                  h('div', { style: { minWidth: 130 } }, h('div', { style: S.lbl }, 'План. старт'), h('input', { type: 'datetime-local', style: { ...S.inp, width: '100%', fontSize: 11 }, value: form.plannedStartDate, onChange: e => setForm(p => ({ ...p, plannedStartDate: e.target.value })) })),
                  h('div', { style: { minWidth: 130 } }, h('div', { style: S.lbl }, 'Чертёж'), h('input', { style: { ...S.inp, width: '100%', fontSize: 11 }, placeholder: 'URL', value: form.drawingUrl, onChange: e => setForm(p => ({ ...p, drawingUrl: e.target.value })) })),
                  h('button', { style: abtn({ padding: '7px 16px' }), onClick: addOrUpdate }, '✓ Сохранить'),
                  h('button', { style: gbtn({ padding: '7px 12px' }), onClick: resetForm }, 'Отмена')
                )
              )
            )];
          }))
        ))),
    h('div', { className: 'pagination' },
      h('button', { style: gbtn({ opacity: page === 1 ? 0.4 : 1 }), disabled: page === 1, onClick: () => setPage(p => Math.max(1, p-1)) }, '← Пред'),
      h('span', { style: { fontSize: 12 } }, `${page} / ${Math.ceil(opsToShow.length / pageSize) || 1}`),
      h('button', { style: gbtn({ opacity: page >= Math.ceil(opsToShow.length / pageSize) ? 0.4 : 1 }), disabled: page >= Math.ceil(opsToShow.length / pageSize), onClick: () => setPage(p => p+1) }, 'След →')
    )
  );
});

// ==================== MasterOrders ====================
// ==================== Редактор зависимостей операций ====================
const DependencyEditor = memo(({ data, orderId, onUpdate, addToast, onClose }) => {
  const order = data.orders.find(o => o.id === orderId);
  const ops = useMemo(() => data.ops.filter(op => op.orderId === orderId && !op.archived), [data.ops, orderId]);

  const toggleDep = useCallback(async (opId, depId) => {
    const op = ops.find(o => o.id === opId);
    if (!op) return;
    const deps = op.dependsOn || [];
    const newDeps = deps.includes(depId) ? deps.filter(d => d !== depId) : [...deps, depId];
    // Проверка циклов
    const checkCycle = (target, visited = new Set()) => {
      if (visited.has(target)) return true;
      visited.add(target);
      const t = ops.find(o => o.id === target);
      return (t?.dependsOn || []).some(d => d === opId || checkCycle(d, visited));
    };
    if (!deps.includes(depId) && checkCycle(depId)) {
      addToast('Нельзя: циклическая зависимость', 'error'); return;
    }
    const d = { ...data, ops: data.ops.map(o => o.id === opId ? { ...o, dependsOn: newDeps.length > 0 ? newDeps : undefined } : o) };
    await DB.save(d); onUpdate(d);
  }, [data, ops, onUpdate, addToast, orderId]);

  // Автоустановка: все последовательно
  const setAllSequential = useCallback(async () => {
    const sorted = [...ops];
    const updated = data.ops.map(o => {
      const idx = sorted.findIndex(s => s.id === o.id);
      if (idx <= 0 || o.orderId !== orderId) return { ...o, dependsOn: o.orderId === orderId ? undefined : o.dependsOn };
      return { ...o, dependsOn: [sorted[idx - 1].id] };
    });
    const d = { ...data, ops: updated };
    await DB.save(d); onUpdate(d); addToast('Все операции последовательно', 'success');
  }, [data, ops, orderId, onUpdate, addToast]);

  // Автоустановка: все параллельно (без зависимостей)
  const setAllParallel = useCallback(async () => {
    const d = { ...data, ops: data.ops.map(o => o.orderId === orderId ? { ...o, dependsOn: undefined } : o) };
    await DB.save(d); onUpdate(d); addToast('Все операции параллельно', 'success');
  }, [data, orderId, onUpdate, addToast]);

  // Визуальная карта: какие операции от каких зависят
  const depMap = useMemo(() => {
    const map = {};
    ops.forEach(op => { map[op.id] = { op, deps: op.dependsOn || [], dependents: [] }; });
    ops.forEach(op => { (op.dependsOn || []).forEach(depId => { if (map[depId]) map[depId].dependents.push(op.id); }); });
    return map;
  }, [ops]);

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 } },
    h('div', { className: 'modal-content', style: { background: '#fff', borderRadius: 12, padding: 20, width: 'min(700px, calc(100vw - 24px))', maxHeight: '90vh', overflowY: 'auto' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 } },
        h('div', null,
          h('div', { style: { fontSize: 16, fontWeight: 500 } }, `Зависимости: ${order?.number || '—'}`),
          h('div', { style: { fontSize: 11, color: '#888' } }, `${ops.length} операций · нажмите на ячейку для переключения`)
        ),
        h('button', { style: gbtn({ fontSize: 14, padding: '4px 12px' }), onClick: onClose }, '×')
      ),
      // Легенда
      h('div', { style: { display: 'flex', gap: 12, marginBottom: 12, padding: '8px 12px', background: '#f8f8f5', borderRadius: 6, fontSize: 11, flexWrap: 'wrap' } },
        h('span', { style: { fontWeight: 500, color: '#666' } }, 'Как пользоваться:'),
        h('span', null, '✓ — строка зависит от колонки (ждёт её завершения)'),
        h('span', null, '— — сама операция'),
        h('span', null, '⇉ — параллельные (независимые)'),
        h('span', null, '↓ — после предыдущей')
      ),
      // Быстрые действия
      h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
        h('button', { style: gbtn({ fontSize: 11 }), onClick: setAllSequential }, '↓ Все последовательно'),
        h('button', { style: gbtn({ fontSize: 11 }), onClick: setAllParallel }, '⇉ Все параллельно')
      ),
      // Матрица зависимостей
      h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
        h('thead', null, h('tr', null,
          h('th', { style: { ...S.th, position: 'sticky', left: 0, background: '#f8f8f5', zIndex: 1 } }, 'Операция ↓ зависит от →'),
          ops.map(op => h('th', { key: op.id, style: { ...S.th, writingMode: 'vertical-lr', textOrientation: 'mixed', minWidth: 30, maxWidth: 40, height: 80, padding: '4px 2px' } }, op.name.length > 10 ? op.name.slice(0, 10) + '…' : op.name))
        )),
        h('tbody', null, ops.map(op => h('tr', { key: op.id },
          h('td', { style: { ...S.td, fontWeight: 500, position: 'sticky', left: 0, background: '#fff', zIndex: 1, minWidth: 120 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h(Badge, { st: op.status }),
              h('span', { style: { fontSize: 11 } }, op.name.length > 14 ? op.name.slice(0, 14) + '…' : op.name)
            )
          ),
          ops.map(depOp => {
            const isSelf = op.id === depOp.id;
            const isDep = (op.dependsOn || []).includes(depOp.id);
            return h('td', { key: depOp.id, style: { ...S.td, textAlign: 'center', padding: 2, cursor: isSelf ? 'default' : 'pointer', background: isSelf ? '#f0f0f0' : isDep ? GN3 : 'transparent' },
              onClick: isSelf ? undefined : () => toggleDep(op.id, depOp.id)
            }, isSelf ? '—' : isDep ? h('span', { style: { color: GN, fontWeight: 500, fontSize: 14 } }, '✓') : '');
          })
        )))
      )),
      // Визуальная последовательность
      h('div', { style: { marginTop: 16 } },
        h('div', { style: S.sec }, 'Последовательность выполнения'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          ops.map(op => {
            const deps = (op.dependsOn || []).map(depId => ops.find(o => o.id === depId)?.name).filter(Boolean);
            const isParallel = deps.length === 0;
            return h('div', { key: op.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: isParallel ? '#E3F2FD' : '#f8f8f5', fontSize: 12 } },
              h('span', { style: { fontSize: 14 } }, isParallel ? '⇉' : '↓'),
              h('span', { style: { fontWeight: 500 } }, op.name),
              h(Badge, { st: op.status }),
              deps.length > 0 && h('span', { style: { color: '#888', fontSize: 10 } }, `после: ${deps.join(', ')}`)
            );
          })
        )
      )
    )
  );
});

// ==================== DepsScreen: Зависимости операций ====================
const DepsScreen = memo(({ data, onUpdate, addToast }) => {
  const [selOrderId, setSelOrderId] = useState('');
  const activeOrders = useMemo(() => data.orders.filter(o => !o.archived), [data.orders]);
  const selectedOrder = selOrderId ? data.orders.find(o => o.id === selOrderId) : null;

  return h('div', { style: { padding: '12px 0 80px' } },
    // Легенда использования
    h('div', { style: { ...S.card, marginBottom: 12, padding: '10px 14px', background: '#E3F2FD', border: '0.5px solid #90CAF9' } },
      h('div', { style: { fontWeight: 500, fontSize: 12, color: '#1565C0', marginBottom: 6 } }, 'ℹ Как использовать взаимосвязи операций'),
      h('div', { style: { fontSize: 11, color: '#1976D2', lineHeight: 1.6 } },
        h('div', null, '✓ в ячейке — строка ЖДЁТ завершения колонки (зависит от неё)'),
        h('div', null, '⇉ синий фон — операция параллельная (начинается сразу)'),
        h('div', null, '↓ — операция последовательная (после другой)'),
        h('div', null, '🔴/🟡/🟢 цвет колонки — покрытие сотрудниками'),
        h('div', null, '← Установите зависимости чтобы система показывала правильный порядок на Гант-диаграмме и в Канбан')
      )
    ),
    // Выбор заказа
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Выберите заказ'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        activeOrders.map(o => {
          const ops = data.ops.filter(op => op.orderId === o.id && !op.archived);
          const hasDeps = ops.some(op => op.dependsOn?.length > 0);
          return h('button', { key: o.id,
            style: selOrderId === o.id ? abtn({ fontSize: 12 }) : gbtn({ fontSize: 12 }),
            onClick: () => setSelOrderId(selOrderId === o.id ? '' : o.id)
          },
            o.number,
            h('span', { style: { fontSize: 10, marginLeft: 4, opacity: 0.7 } }, `${ops.length} оп.`),
            hasDeps && h('span', { style: { fontSize: 10, marginLeft: 4, color: GN } }, '🔗')
          );
        })
      )
    ),
    // Редактор зависимостей
    selectedOrder
      ? h(DependencyEditorInline, { data, orderId: selOrderId, onUpdate, addToast })
      : h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 24, fontSize: 13 } },
          '← Выберите заказ для настройки зависимостей операций'
        )
  );
});

// Inline версия DependencyEditor (без модального окна)
const DependencyEditorInline = memo(({ data, orderId, onUpdate, addToast }) => {
  const order = data.orders.find(o => o.id === orderId);
  const ops = useMemo(() => data.ops.filter(op => op.orderId === orderId && !op.archived), [data.ops, orderId]);

  const toggleDep = useCallback(async (opId, depId) => {
    const op = ops.find(o => o.id === opId);
    if (!op) return;
    const deps = op.dependsOn || [];
    const newDeps = deps.includes(depId) ? deps.filter(d => d !== depId) : [...deps, depId];
    const checkCycle = (target, visited = new Set()) => {
      if (visited.has(target)) return true;
      visited.add(target);
      const t = ops.find(o => o.id === target);
      return (t?.dependsOn || []).some(d => d === opId || checkCycle(d, visited));
    };
    if (!deps.includes(depId) && checkCycle(depId)) { addToast('Нельзя: циклическая зависимость', 'error'); return; }
    const d = { ...data, ops: data.ops.map(o => o.id === opId ? { ...o, dependsOn: newDeps.length > 0 ? newDeps : undefined } : o) };
    await DB.save(d); onUpdate(d);
  }, [data, ops, onUpdate, addToast, orderId]);

  const setAllSequential = useCallback(async () => {
    const updated = data.ops.map(o => {
      const idx = ops.findIndex(s => s.id === o.id);
      if (idx <= 0 || o.orderId !== orderId) return { ...o, dependsOn: o.orderId === orderId ? undefined : o.dependsOn };
      return { ...o, dependsOn: [ops[idx - 1].id] };
    });
    const d = { ...data, ops: updated };
    await DB.save(d); onUpdate(d); addToast('Все последовательно', 'success');
  }, [data, ops, orderId, onUpdate, addToast]);

  const setAllParallel = useCallback(async () => {
    const d = { ...data, ops: data.ops.map(o => o.orderId === orderId ? { ...o, dependsOn: undefined } : o) };
    await DB.save(d); onUpdate(d); addToast('Все параллельно', 'success');
  }, [data, orderId, onUpdate, addToast]);

  return h('div', { style: S.card },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
      h('div', { style: { fontSize: 14, fontWeight: 500 } }, `Зависимости: ${order?.number}`),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { style: gbtn({ fontSize: 11 }), onClick: setAllSequential }, '↓ Все последовательно'),
        h('button', { style: gbtn({ fontSize: 11 }), onClick: setAllParallel }, '⇉ Все параллельно')
      )
    ),
    h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
      h('thead', null, h('tr', null,
        h('th', { style: { ...S.th, position: 'sticky', left: 0, background: '#f8f8f5', zIndex: 1 } }, 'Операция ↓ зависит от →'),
        ops.map(op => h('th', { key: op.id, style: { ...S.th, writingMode: 'vertical-lr', minWidth: 30, maxWidth: 40, height: 80, padding: '4px 2px' } }, op.name.length > 10 ? op.name.slice(0, 10) + '…' : op.name))
      )),
      h('tbody', null, ops.map(op => h('tr', { key: op.id },
        h('td', { style: { ...S.td, fontWeight: 500, position: 'sticky', left: 0, background: '#fff', zIndex: 1, minWidth: 120 } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h(Badge, { st: op.status }),
            h('span', null, op.name.length > 14 ? op.name.slice(0, 14) + '…' : op.name)
          )
        ),
        ops.map(depOp => {
          const isSelf = op.id === depOp.id;
          const isDep = (op.dependsOn || []).includes(depOp.id);
          return h('td', { key: depOp.id, style: { ...S.td, textAlign: 'center', padding: 2, cursor: isSelf ? 'default' : 'pointer', background: isSelf ? '#f0f0f0' : isDep ? GN3 : 'transparent' },
            onClick: isSelf ? undefined : () => toggleDep(op.id, depOp.id)
          }, isSelf ? '—' : isDep ? h('span', { style: { color: GN, fontWeight: 500, fontSize: 14 } }, '✓') : '');
        })
      )))
    )),
    h('div', { style: { marginTop: 16 } },
      h('div', { style: S.sec }, 'Последовательность'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        ops.map(op => {
          const deps = (op.dependsOn || []).map(depId => ops.find(o => o.id === depId)?.name).filter(Boolean);
          return h('div', { key: op.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: deps.length === 0 ? '#E3F2FD' : '#f8f8f5', fontSize: 12 } },
            h('span', { style: { fontSize: 14 } }, deps.length === 0 ? '⇉' : '↓'),
            h('span', { style: { fontWeight: 500 } }, op.name),
            h(Badge, { st: op.status }),
            deps.length > 0 && h('span', { style: { color: '#888', fontSize: 10 } }, `после: ${deps.join(', ')}`)
          );
        })
      )
    )
  );
});

const MasterOrders = memo(({ data, onUpdate, addToast, onOrderClick }) => {
  const [form, setForm] = useState({ number: '', product: '',
 qty: '', deadline: '', priority: 'medium', bomId: '', productType: '' });
  const { ask: askConfirm, confirmEl } = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showShipped, setShowShipped] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [fieldErrors, setFieldErrors] = useState({});
  const [depEditorOrderId, setDepEditorOrderId] = useState(null);
  const [printOrderId, setPrintOrderId] = useState(null);
  const [filterType, setFilterType] = useState('');
  const productTypes = data.settings?.productTypes || [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }];

  const validate = () => {
    const errors = {};
    if (!form.number.trim()) errors.number = 'Введите номер заказа';
    else { const exists = data.orders.some(o => o.number === form.number && o.id !== editingId && !o.archived); if (exists) errors.number = 'Такой номер уже существует'; }
    if (!form.product.trim()) errors.product = 'Введите название изделия';
    const qtyNum = Number(form.qty);
    if (!form.qty || isNaN(qtyNum) || qtyNum <= 0) errors.qty = 'Количество должно быть положительным числом';
    if (form.deadline) { const today = new Date(); today.setHours(0,0,0,0); if (new Date(form.deadline) < today) errors.deadline = 'Дата отгрузки не может быть раньше сегодняшнего дня'; }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createDefaultOps = useCallback((orderId, productType, orderQty) => {
    const stages = (data.productionStages || []).filter(s => !productType || s.productType === productType);
    return stages.map(stage => ({ id: uid(), orderId, name: stage.name, qty: orderQty, workerIds: [], workerQty: {}, status: 'pending', createdAt: now(), plannedHours: undefined, archived: false, sectionId: null, equipmentId: null, plannedStartDate: undefined, requiresQC: stage.name.includes('свар') || stage.name.includes('Опресовка') }));
  }, [data.productionStages]);

  const addOrUpdate = useCallback(async () => {
    if (!validate()) return;
    if (editingId) {
      const updatedOrders = data.orders.map(o => o.id === editingId ? { ...o, ...form, qty: Number(form.qty), priority: form.priority } : o);
      const d = { ...data, orders: updatedOrders };
      await DB.save(d); onUpdate(d); setEditingId(null); setForm({ number: '', product: '', qty: '', deadline: '', priority: 'medium', bomId: '', productType: '' }); setFieldErrors({}); addToast('Заказ обновлён', 'success');
    } else {
      const newOrder = { id: uid(), ...form, qty: Number(form.qty), createdAt: now(), archived: false };
      const newOps = createDefaultOps(newOrder.id, form.productType, Number(form.qty));
      // BOM: предупреждение о дефиците (не блокирует создание)
      if (form.bomId) {
        const bom = data.bomTemplates.find(b => b.id === form.bomId);
        if (bom?.materials?.length) {
          const qty = Number(form.qty) || 1;
          const deficit = bom.materials.filter(m => {
            const mat = data.materials.find(dm => dm.id === m.materialId);
            return !mat || mat.quantity < m.qty * qty;
          });
          if (deficit.length > 0) addToast(`⚠ Дефицит ${deficit.length} материалов по BOM. Заказ создан, но проверьте остатки.`, 'warning');
          // Создать резервирование материалов
          const reservations = bom.materials.filter(m => m.materialId).map(m => ({
            id: uid(), orderId: newOrder.id, materialId: m.materialId,
            qty: m.qty * qty, reservedAt: now()
          }));
          if (reservations.length > 0) {
            const d = { ...data, orders: [...data.orders, newOrder], ops: [...data.ops, ...newOps], materialReservations: [...(data.materialReservations || []), ...reservations] };
            await DB.save(d); onUpdate(d); setForm({ number: '', product: '', qty: '', deadline: '', priority: 'medium', bomId: '', productType: '' }); setFieldErrors({}); addToast('Заказ создан, материалы зарезервированы', 'success');
            if (newOps.length > 0) setPrintOrderId(newOrder.id);
            return;
          }
        }
      }
      const d = { ...data, orders: [...data.orders, newOrder], ops: [...data.ops, ...newOps] };
      await DB.save(d); onUpdate(d); setForm({ number: '', product: '', qty: '', deadline: '', priority: 'medium', bomId: '', productType: '' }); setFieldErrors({}); addToast('Заказ создан', 'success');
      if (newOps.length > 0) setPrintOrderId(newOrder.id);
    }
  }, [form, editingId, data, createDefaultOps, onUpdate, addToast]);

  const shipOrder = useCallback(async id => {
    const order = data.orders.find(o => o.id === id);
    const ops = data.ops.filter(op => op.orderId === id && !op.archived);
    const allDone = ops.length > 0 && ops.every(op => op.status === 'done' || op.status === 'defect');
    if (!allDone) {
      if (!(await askConfirm({ message: `Отгрузить заказ ${order?.number}?`, detail: 'Не все операции завершены. Отгрузить всё равно?', danger: false }))) return;
    }
    let d = { ...data, orders: data.orders.map(o => o.id === id ? { ...o, shipped: true, shippedAt: Date.now() } : o) };
    d = logAction(d, 'order_shipped', { orderId: id, orderNumber: order?.number });
    await DB.save(d); onUpdate(d); addToast(`Заказ ${order?.number} отгружен ✓`, 'success');
  }, [data, onUpdate, addToast]);

  const del = useCallback(async id => {
    if (!(await askConfirm({ message: 'Переместить заказ в архив?', danger: false }))) return;
    let d = { ...data, orders: data.orders.map(o => o.id === id ? { ...o, archived: true } : o) };
    d = logAction(d, 'order_archive', { orderId: id, orderNumber: data.orders.find(o => o.id === id)?.number });
    await DB.save(d); onUpdate(d); addToast('Заказ архивирован', 'info');
  }, [data, onUpdate, addToast]);

  const restore = useCallback(async id => {
    let d = { ...data, orders: data.orders.map(o => o.id === id ? { ...o, archived: false } : o) };
    d = logAction(d, 'order_restore', { orderId: id });
    await DB.save(d); onUpdate(d); addToast('Заказ восстановлен', 'success');
  }, [data, onUpdate, addToast]);

  const edit = useCallback(ord => { setForm({ number: ord.number, product: ord.product, qty: String(ord.qty), deadline: ord.deadline || '', priority: ord.priority || 'medium', bomId: '', productType: ord.productType || '' }); setEditingId(ord.id); }, []);

  const ordersToShow = useMemo(() => data.orders.filter(o => (showArchived ? true : !o.archived) && (!o.shipped || showShipped) && (!filterType || o.productType === filterType)).sort((a,b) => { const priorityOrder = { critical:0, high:1, medium:2, low:3 }; return (priorityOrder[a.priority]||4) - (priorityOrder[b.priority]||4) || (b.createdAt||0) - (a.createdAt||0); }), [data.orders, showArchived, showShipped, filterType]);
  const paginated = useMemo(() => { const start = (page-1)*pageSize; return ordersToShow.slice(start, start+pageSize); }, [ordersToShow, page]);
  useEffect(() => { setPage(1); }, [showArchived]);

  return h('div', null,
    confirmEl,
    h(PasteImportWidget, { addToast, hint: 'Вставить заказы из Excel',
      columns: [
        { key: 'number',   label: 'Номер заказа', required: true },
        { key: 'product',  label: 'Изделие',       required: true },
        { key: 'qty',      label: 'Количество',    required: false, default: '1' },
        { key: 'deadline', label: 'Срок (дата)',   required: false, default: '' },
        { key: 'priority', label: 'Приоритет',     required: false, default: 'medium' },
      ],
      onImport: async (rows) => {
        const existing = new Set(data.orders.map(o => o.number.toLowerCase()));
        const items = rows.filter(r => r.number && r.product && !existing.has(r.number.toLowerCase()))
          .map(r => ({ id: uid(), number: r.number, product: r.product,
            qty: Number(r.qty) || 1, deadline: r.deadline || '',
            priority: ['critical','high','medium','low'].includes(r.priority) ? r.priority : 'medium',
            status: 'active', createdAt: now() }));
        if (!items.length) { addToast('Все номера заказов уже существуют', 'info'); return; }
        let d = { ...data, orders: [...data.orders, ...items] };
        d = logAction(d, 'orders_batch_import', { count: items.length });
        await DB.save(d); onUpdate(d); addToast(`Добавлено заказов: ${items.length}`, 'success');
      }}),
    depEditorOrderId && h(DependencyEditor, { data, orderId: depEditorOrderId, onUpdate, addToast, onClose: () => setDepEditorOrderId(null) }),
    printOrderId && (() => {
      const pOrder = data.orders.find(o => o.id === printOrderId);
      const pOps = data.ops.filter(o => o.orderId === printOrderId && !o.archived);
      // 🔧 Показываем QR только если есть хотя бы одна операция с назначенными рабочими
      const hasAssignedWorkers = pOps.some(op => op.workerIds && op.workerIds.length > 0);
      if (!pOrder || pOps.length === 0 || !hasAssignedWorkers) return null;
      return h(QRModal, { ops: pOps, order: pOrder, worker: null, onClose: () => setPrintOrderId(null) });
    })(),
    h('div', { style: S.card },
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('div', { style: { minWidth: 120 } }, h('input', { style: S.inp, placeholder: 'Номер', value: form.number, onChange: e => setForm(p => ({ ...p, number: e.target.value })) }), fieldErrors.number && h('div', { className: 'error-message' }, fieldErrors.number)),
        h('div', { style: { flex: 1, minWidth: 160 } }, h('input', { style: { ...S.inp, width: '100%' }, placeholder: 'Изделие', value: form.product, onChange: e => setForm(p => ({ ...p, product: e.target.value })) }), fieldErrors.product && h('div', { className: 'error-message' }, fieldErrors.product)),
        h('div', { style: { minWidth: 70 } }, h('input', { type: 'number', style: { ...S.inp, width: '100%' }, placeholder: 'Кол-во', value: form.qty, onChange: e => setForm(p => ({ ...p, qty: e.target.value })) }), fieldErrors.qty && h('div', { className: 'error-message' }, fieldErrors.qty)),
        h('div', { style: { minWidth: 140 } }, h('input', { type: 'date', style: { ...S.inp, width: '100%' }, value: form.deadline, onChange: e => setForm(p => ({ ...p, deadline: e.target.value })) }), fieldErrors.deadline && h('div', { className: 'error-message' }, fieldErrors.deadline)),
        h('div', { style: { minWidth: 120 } }, h('select', { style: { ...S.inp, width: '100%' }, value: form.priority, onChange: e => setForm(p => ({ ...p, priority: e.target.value })) }, h('option', { value: 'low' }, 'Низкий'), h('option', { value: 'medium' }, 'Средний'), h('option', { value: 'high' }, 'Высокий'), h('option', { value: 'critical' }, 'Критический'))),
        h('div', { style: { minWidth: 100 } }, h('select', { style: { ...S.inp, width: '100%' }, value: form.productType, onChange: e => setForm(p => ({ ...p, productType: e.target.value })) }, h('option', { value: '' }, 'Тип'), productTypes.map(pt => h('option', { key: pt.id, value: pt.id }, pt.label)))),
        h('div', { style: { minWidth: 140 } }, h('select', { style: { ...S.inp, width: '100%' }, value: form.bomId, onChange: e => setForm(p => ({ ...p, bomId: e.target.value })) }, h('option', { value: '' }, '— без BOM —'), data.bomTemplates.filter(b => !form.productType || b.productType === form.productType || !b.productType).map(b => h('option', { key: b.id, value: b.id }, b.productName)))),
        h('button', { type: 'button', style: abtn(), onClick: addOrUpdate }, editingId ? '✓' : '+'),
        editingId && h('button', { type: 'button', style: gbtn(), onClick: () => { setEditingId(null); setForm({ number: '', product: '', qty: '', deadline: '', priority: 'medium', bomId: '', productType: '' }); setFieldErrors({}); } }, 'Отмена')
      ),
      // Проверка остатков при выборе BOM
      form.bomId && form.qty && (() => {
        const bom = data.bomTemplates.find(b => b.id === form.bomId);
        if (!bom || !bom.materials?.length) return null;
        const qty = Number(form.qty) || 1;
        const checks = bom.materials.map(m => {
          const mat = data.materials.find(dm => dm.id === m.materialId);
          const need = m.qty * qty;
          const have = mat?.quantity || 0;
          return { name: mat?.name || '?', need, have, unit: mat?.unit || '', ok: have >= need };
        });
        const allOk = checks.every(c => c.ok);
        return h('div', { style: { marginTop: 10, padding: '8px 12px', borderRadius: 8, background: allOk ? GN3 : RD3, border: `0.5px solid ${allOk ? GN : RD}` } },
          h('div', { style: { fontSize: 11, fontWeight: 500, color: allOk ? GN2 : RD2, marginBottom: allOk ? 0 : 4 } }, allOk ? `✓ Все материалы в наличии (BOM: ${bom.productName})` : `⚠ Дефицит материалов (BOM: ${bom.productName}):`),
          !allOk && checks.filter(c => !c.ok).map((c, i) => h('div', { key: i, style: { fontSize: 11, color: RD2 } }, `${c.name}: нужно ${c.need} ${c.unit}, есть ${c.have} ${c.unit}`))
        );
      })()
    ),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' } },
      h('div', { style: { display: 'flex', gap: 4 } },
        h('button', { style: !filterType ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterType('') }, 'Все'),
        productTypes.map(pt => h('button', { key: pt.id, style: filterType === pt.id ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterType(pt.id) }, pt.label))
      ),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
        h('input', { type: 'checkbox', checked: showArchived, onChange: e => setShowArchived(e.target.checked) }), 'Архивные'
      ),
      h('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
        h('input', { type: 'checkbox', checked: showShipped, onChange: e => setShowShipped(e.target.checked) }), 'Отгружен'
      )
    ),
    paginated.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Заказов нет')
      : h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Номер','Изделие','Тип','Кол-во','Дата отгрузки','Приоритет','Операций','Материалы','Статус',''].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t)))),
          h('tbody', null, paginated.map(ord => {
            const ops = data.ops.filter(o => o.orderId === ord.id);
            const done = ops.filter(o => o.status === 'done').length;
            const def = ops.filter(o => o.status === 'defect').length;
            const st = ops.length === 0 ? 'pending' : done === ops.length ? 'done' : ops.some(o => o.status === 'in_progress') ? 'in_progress' : 'pending';
            const nearDeadline = isShipmentNear(ord.deadline) && st !== 'done';
            const matConsumption = (data.materialConsumptions || []).filter(mc => ops.some(op => op.id === mc.opId));
            const matCost = matConsumption.reduce((s, mc) => { const mat = data.materials.find(m => m.id === mc.materialId); return s + mc.qty * (mat?.unitCost || 0); }, 0);
            return h('tr', { key: ord.id, style: { background: ord.archived ? '#eee' : 'transparent' } },
              h('td', { style: { ...S.td, fontWeight: 500 } },
                onOrderClick
                  ? h('span', { style: { color: AM, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }, onClick: () => onOrderClick(ord.id), title: 'Открыть карточку' }, ord.number)
                  : h('span', { style: { color: AM } }, ord.number),
                nearDeadline && h('span', { style: { marginLeft: 6, color: RD } }, '⏳')
              ),
              h('td', { style: S.td }, ord.product),
              h('td', { style: { ...S.td, fontSize: 11 } }, (productTypes.find(pt => pt.id === ord.productType)?.label) || '—'),
              h('td', { style: S.td }, ord.qty),
              h('td', { style: { ...S.td, color: nearDeadline ? RD : '#888' } }, ord.deadline || '—'),
              h('td', { style: { ...S.td, color: PRIORITY[ord.priority]?.color || '#888' } }, PRIORITY[ord.priority]?.label || '—'),
              h('td', { style: S.td }, `${done}/${ops.length}`, def > 0 && h('span', { style: { marginLeft: 4, color: RD } }, `⚠ ${def}`)),
              h('td', { style: { ...S.td, fontFamily: 'monospace', fontSize: 11 } }, matConsumption.length > 0 ? `${matCost.toLocaleString()}₽` : '—'),
              h('td', { style: S.td }, h(Badge, { st: ord.shipped ? 'shipped' : st })),
              h('td', { style: S.td }, h('div', { style: { display: 'flex', gap: 4 } },
                !ord.archived ? [
                  h('button', { key: 'edit', style: gbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Редактировать', onClick: () => edit(ord) }, '✎'),
                  h('button', { key: 'del', style: rbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'В архив', onClick: () => del(ord.id) }, '✕'),
                  h('button', { key: 'passport', style: gbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Паспорт PDF', onClick: () => generateFullPassport(ord, data) }, '📄'),
                  h('button', { key: 'route', style: gbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Маршрутный лист PDF', onClick: () => generateRouteSheet(ord, data) }, '📋'),
                  h('button', { key: 'deps', style: gbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Зависимости операций', onClick: () => setDepEditorOrderId(ord.id) }, '🔗'),
                  !ord.shipped && h('button', { key: 'ship', style: { ...gbtn({ fontSize: 11, padding: '4px 8px' }), color: GN2, borderColor: GN }, 'aria-label': 'Отгрузить заказ', onClick: () => shipOrder(ord.id) }, '🚚'),
                  ord.shipped && h('span', { key: 'shipped', style: { fontSize: 10, padding: '3px 6px', background: GN3, color: GN2, borderRadius: 4, fontWeight: 500 } }, `✓ Отгружен${ord.shippedAt ? ' ' + new Date(ord.shippedAt).toLocaleDateString('ru') : ''}`)
                ] : h('button', { style: gbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Восстановить', onClick: () => restore(ord.id) }, '↩ Восстановить')
              ))
            );
          }))
        ))),
    h('div', { className: 'pagination' },
      h('button', { style: gbtn({ opacity: page === 1 ? 0.4 : 1 }), disabled: page === 1, onClick: () => setPage(p => Math.max(1, p-1)) }, '← Пред'),
      h('span', { style: { fontSize: 12 } }, `${page} / ${Math.ceil(ordersToShow.length / pageSize) || 1}`),
      h('button', { style: gbtn({ opacity: page >= Math.ceil(ordersToShow.length / pageSize) ? 0.4 : 1 }), disabled: page >= Math.ceil(ordersToShow.length / pageSize), onClick: () => setPage(p => p+1) }, 'След →')
    )
  );
});



// ==================== GanttChart ====================
const GanttChart = memo(({ data }) => {
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; });
  const [daysCount, setDaysCount] = useState(14);
  const operations = useMemo(() => data.ops.filter(op => op.plannedStartDate && !op.archived && op.status !== 'done' && op.status !== 'defect'), [data.ops]);
  const timeline = useMemo(() => {
    const start = startDate.getTime(); const end = start + daysCount*86400000;
    const days = [];
    for (let i=0; i<daysCount; i++) { const date = new Date(start + i*86400000); days.push({ date, day:date.getDate(), month:date.getMonth()+1, dayOfWeek:date.toLocaleDateString('ru',{weekday:'short'}) }); }
    return { days, start, end };
  }, [startDate, daysCount]);
  const bars = useMemo(() => operations.map(op => {
    const start = op.plannedStartDate; const end = start + (op.plannedHours ? op.plannedHours*3600000 : 4*3600000);
    if (end < timeline.start || start > timeline.end) return null;
    const left = ((start - timeline.start) / (timeline.end - timeline.start))*100;
    const width = ((end - start) / (timeline.end - timeline.start))*100;
    const order = data.orders.find(o => o.id === op.orderId);
    return { ...op, orderNumber: order?.number, left, width };
  }).filter(b => b), [operations, timeline, data.orders]);
  const changeDate = (delta) => { const newStart = new Date(startDate); newStart.setDate(newStart.getDate() + delta); setStartDate(newStart); };
  return h('div', { style: S.card },
    h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 } },
      h('div', { style: { display:'flex', gap:8 } }, h('button', { style: gbtn(), onClick: () => changeDate(-7) }, '-7д'), h('button', { style: gbtn(), onClick: () => changeDate(-1) }, '-1д'), h('button', { style: gbtn(), onClick: () => changeDate(1) }, '+1д'), h('button', { style: gbtn(), onClick: () => changeDate(7) }, '+7д')),
      h('div', { style: { display:'flex', gap:8 } }, h('button', { style: gbtn(), onClick: () => setDaysCount(7) }, '7 дней'), h('button', { style: gbtn(), onClick: () => setDaysCount(14) }, '14 дней'))
    ),
    h('div', { className:'gantt-container' },
      h('div', { style: { display:'flex', flexDirection:'column' } },
        h('div', { className:'gantt-row' }, h('div', { className:'gantt-label' }, 'Операции'), h('div', { className:'gantt-timeline' }, timeline.days.map((day,idx) => h('div', { key:idx, className:'gantt-cell', style:{flex:1} }, `${day.day}.${day.month} ${day.dayOfWeek}`)))),
        bars.map(bar => h('div', { key:bar.id, className:'gantt-row', style:{ position:'relative', height:'40px' } },
          h('div', { className:'gantt-label', style:{ display:'flex', alignItems:'center', gap:4 } }, h('span', { style:{ fontWeight:500 } }, bar.orderNumber), h('span', { style:{ fontSize:10, color:'#888' } }, bar.name)),
          h('div', { className:'gantt-timeline', style:{ position:'relative' } }, h('div', { className:'gantt-bar', style:{ left:`${bar.left}%`, width:`${bar.width}%`, position:'absolute', top:4, height:'32px', background: bar.status === 'in_progress' ? AM : BL } }, `${bar.name} (${bar.orderNumber})`))
        ))
      )
    )
  );
});

// ==================== ResourceCalendar ====================
const ResourceCalendar = memo(({ data, onUpdate, addToast, onWorkerClick }) => {
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d; });
  const [daysCount] = useState(14);
  const [showModal, setShowModal] = useState(null);
  const [availForm, setAvailForm] = useState({ workerId:'', startDate:'', endDate:'', type:'vacation' });
  const days = useMemo(() => { const start = startDate.getTime(); const arr = []; for (let i=0; i<daysCount; i++) arr.push(new Date(start + i*86400000)); return arr; }, [startDate, daysCount]);
  const getAvailability = (workerId, date) => { const avail = data.workerAvailabilities?.find(a => a.workerId === workerId && date >= a.startDate && date <= a.endDate); return avail ? avail.type : null; };
  const getWorkerOpsCount = (workerId, date) => { const startOfDay = new Date(date).setHours(0,0,0,0); const endOfDay = new Date(date).setHours(23,59,59,999); return data.ops.filter(op => op.workerIds?.includes(workerId) && op.plannedStartDate >= startOfDay && op.plannedStartDate <= endOfDay && op.status !== 'done' && op.status !== 'defect').length; };
  const getWorkerPlannedHours = (workerId, date) => { const startOfDay = new Date(date).setHours(0,0,0,0); const endOfDay = new Date(date).setHours(23,59,59,999); return data.ops.filter(op => op.workerIds?.includes(workerId) && op.plannedStartDate >= startOfDay && op.plannedStartDate <= endOfDay && op.status !== 'done' && op.status !== 'defect').reduce((sum,op) => sum + (op.plannedHours || 0), 0); };
  const addAvailability = async () => {
    if (!availForm.workerId || !availForm.startDate || !availForm.endDate) return;
    const newAvail = { id: uid(), workerId: availForm.workerId, startDate: new Date(availForm.startDate).getTime(), endDate: new Date(availForm.endDate).getTime(), type: availForm.type };
    const updated = { ...data, workerAvailabilities: [...(data.workerAvailabilities || []), newAvail] };
    await DB.save(updated); onUpdate(updated); setShowModal(null); setAvailForm({ workerId:'', startDate:'', endDate:'', type:'vacation' }); addToast('Период недоступности добавлен', 'success');
  };
  const deleteAvailability = async (id) => { const updated = { ...data, workerAvailabilities: (data.workerAvailabilities || []).filter(a => a.id !== id) }; await DB.save(updated); onUpdate(updated); addToast('Период удалён', 'info'); };
  const changeWeek = (delta) => { const newStart = new Date(startDate); newStart.setDate(newStart.getDate() + delta*7); setStartDate(newStart); };
  return h('div', { style: { ...S.card } },
    h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 } },
      h('div', { style: { display:'flex', gap:8 } }, h('button', { style: gbtn(), onClick: () => changeWeek(-1) }, '-1 нед'), h('button', { style: gbtn(), onClick: () => changeWeek(1) }, '+1 нед')),
      h('button', { style: abtn(), onClick: () => setShowModal({}) }, 'Задать отпуск/больничный')
    ),
    h('div', { className: 'table-responsive' }, h('table', { className:'worker-calendar-table' },
      h('thead', null, h('tr', null, h('th', { style:{width:'150px'} }, 'Сотрудник'), days.map(d => h('th', { key: d.getTime() }, `${d.getDate()}.${d.getMonth()+1} (${d.toLocaleDateString('ru',{weekday:'short'})})`)))),
      h('tbody', null, data.workers.filter(w => !w.archived).map(w => {
        const availabilities = (data.workerAvailabilities || []).filter(a => a.workerId === w.id);
        return h('tr', { key: w.id },
          h('td', { style: { fontWeight:500 } }, h(WN, { worker: w, onWorkerClick }),
            h('div', { style: { fontSize:10, color:'#888' } }, availabilities.map(a => `${a.type === 'vacation' ? 'Отпуск' : 'Больничный'} ${new Date(a.startDate).toLocaleDateString()}–${new Date(a.endDate).toLocaleDateString()}`).join(', ')),
            h('button', { style: gbtn({ fontSize:10, padding:'2px 6px', marginTop:4 }), 'aria-label': `Добавить отсутствие для ${w.name}`, onClick: () => setShowModal({ workerId: w.id }) }, '+')
          ),
          days.map(d => {
            const avail = getAvailability(w.id, d);
            const opsCount = getWorkerOpsCount(w.id, d);
            const plannedHours = getWorkerPlannedHours(w.id, d);
            let cellClass = 'worker-cell';
            if (avail === 'vacation') cellClass = 'worker-cell vacation';
            if (avail === 'sick') cellClass = 'worker-cell sick';
            if (opsCount > 3 || plannedHours > 8) cellClass = 'worker-cell overload';
            return h('td', { key: d.getTime(), className: cellClass },
              h('div', { style:{ fontSize:13, fontWeight:500 } }, opsCount || ''),
              plannedHours > 0 && h('div', { style:{ fontSize:10, color:'#888' } }, `${plannedHours}ч`)
            );
          })
        );
      }))
    )),
    showModal && h('div', { role:'dialog','aria-modal':'true','aria-label':'Период недоступности', style: { position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 } },
      h('div', { style: { background:'#fff',borderRadius:12,padding:24,width:'min(320px, calc(100vw - 32px))' } },
        h('div', { style: { fontSize:16, fontWeight:500, marginBottom:16 } }, 'Период недоступности'),
        h('select', { style: { ...S.inp, width:'100%', marginBottom:12 }, value: availForm.workerId, onChange: e => setAvailForm(p => ({ ...p, workerId: e.target.value })) }, h('option', { value:'' }, '— сотрудник —'), data.workers.map(w => h('option', { key: w.id, value: w.id }, w.name))),
        h('input', { type:'date', style: { ...S.inp, width:'100%', marginBottom:12 }, value: availForm.startDate, onChange: e => setAvailForm(p => ({ ...p, startDate: e.target.value })) }),
        h('input', { type:'date', style: { ...S.inp, width:'100%', marginBottom:12 }, value: availForm.endDate, onChange: e => setAvailForm(p => ({ ...p, endDate: e.target.value })) }),
        h('select', { style: { ...S.inp, width:'100%', marginBottom:16 }, value: availForm.type, onChange: e => setAvailForm(p => ({ ...p, type: e.target.value })) }, h('option', { value:'vacation' }, 'Отпуск'), h('option', { value:'sick' }, 'Больничный')),
        h('div', { style: { display:'flex', gap:8, justifyContent:'flex-end' } },
          h('button', { style: gbtn(), onClick: () => setShowModal(null) }, 'Отмена'),
          h('button', { style: abtn(), onClick: addAvailability }, 'Сохранить')
        )
      )
    )
  );
});

// ==================== MasterKanban (с WIP-лимитами) ====================
const MasterKanban = memo(({ data, onUpdate, addToast }) => {
  const stagesList = useMemo(() => (data.productionStages || []).map(s => s.name), [data.productionStages]);
  const wipLimits = data.settings?.wipLimits || {};
  const [editingWip, setEditingWip] = useState(null);
  const [wipValue, setWipValue] = useState('');

  const saveWipLimit = useCallback(async (stage, limit) => {
    const val = Number(limit);
    if (isNaN(val) || val < 0) return;
    const newLimits = { ...wipLimits, [stage]: val || undefined };
    if (!val) delete newLimits[stage];
    const d = { ...data, settings: { ...data.settings, wipLimits: newLimits } };
    await DB.save(d); onUpdate(d); setEditingWip(null); setWipValue('');
    addToast(val ? `WIP-лимит: ${stage} = ${val}` : `WIP-лимит снят: ${stage}`, 'success');
  }, [data, wipLimits, onUpdate, addToast]);

  const columns = useMemo(() => stagesList.map(stage => {
    const opsAtStage = data.ops.filter(op => op.name === stage && !op.archived);
    const active = opsAtStage.filter(op => op.status === 'in_progress' || op.status === 'pending' || op.status === 'on_check');
    const wip = wipLimits[stage] || 0;
    const overWip = wip > 0 && active.length > wip;
    return { stage, pending: opsAtStage.filter(op => op.status === 'pending'), in_progress: opsAtStage.filter(op => op.status === 'in_progress'), on_check: opsAtStage.filter(op => op.status === 'on_check'), done: opsAtStage.filter(op => op.status === 'done'), defect: opsAtStage.filter(op => op.status === 'defect' || op.status === 'rework'), total: opsAtStage.length, activeCount: active.length, wipLimit: wip, overWip };
  }), [stagesList, data.ops, wipLimits]);

  const overWipStages = columns.filter(c => c.overWip);

  return h('div', { style: { overflowX:'auto', paddingBottom:16 } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
      h('div', { style: S.sec }, 'Канбан-доска производства'),
      h('div', { style: { fontSize: 10, color: '#888' } }, 'Нажмите на лимит для изменения')
    ),
    // Алерт превышения WIP
    overWipStages.length > 0 && h('div', { role: 'alert', style: { padding: '8px 12px', background: RD3, border: `0.5px solid ${RD}`, borderRadius: 8, marginBottom: 10, fontSize: 11 } },
      h('span', { style: { fontWeight: 500, color: RD } }, '⚠ Превышен WIP-лимит: '),
      h('span', { style: { color: RD2 } }, overWipStages.map(c => `${c.stage} (${c.activeCount}/${c.wipLimit})`).join(', '))
    ),
    h('div', { style: { display:'flex', gap:8, minWidth: columns.length*160 } },
      columns.map(col => h('div', { key: col.stage, className: 'kanban-col', style: { flex:'0 0 150px', background: col.overWip ? '#FFF0F0' : '#fff', border: col.overWip ? `1px solid ${RD}` : '0.5px solid rgba(0,0,0,0.1)', borderRadius:10, padding:10, fontSize:11 } },
        h('div', { style: { fontSize:10, fontWeight:500, color:AM4, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 } }, col.stage),
        // WIP-лимит
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
          editingWip === col.stage
            ? h('div', { style: { display: 'flex', gap: 4 } },
                h('input', { type: 'number', style: { ...S.inp, width: 40, padding: '2px 4px', fontSize: 11 }, value: wipValue, onChange: e => setWipValue(e.target.value), onKeyDown: e => e.key === 'Enter' && saveWipLimit(col.stage, wipValue), autoFocus: true }),
                h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: GN }, onClick: () => saveWipLimit(col.stage, wipValue) }, '✓'),
                h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#888' }, onClick: () => setEditingWip(null) }, '✕')
              )
            : h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: col.overWip ? RD : col.wipLimit ? AM : '#bbb', padding: 0 }, onClick: () => { setEditingWip(col.stage); setWipValue(col.wipLimit || ''); } },
                col.wipLimit ? `WIP: ${col.activeCount}/${col.wipLimit}` : 'Лимит: ∞'
              )
        ),
        h('div', { style: { display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 } },
          col.pending.length>0 && h('span', { style:{ padding:'2px 6px', fontSize:10, borderRadius:6, background:'#f0ede8', color:'#666' } }, `⏳ ${col.pending.length}`),
          col.in_progress.length>0 && h('span', { style:{ padding:'2px 6px', fontSize:10, borderRadius:6, background:AM3, color:AM2 } }, `▶ ${col.in_progress.length}`),
          col.on_check.length>0 && h('span', { style:{ padding:'2px 6px', fontSize:10, borderRadius:6, background:'#E1F5FE', color:'#0277BD' } }, `🔍 ${col.on_check.length}`),
          col.done.length>0 && h('span', { style:{ padding:'2px 6px', fontSize:10, borderRadius:6, background:GN3, color:GN2 } }, `✓ ${col.done.length}`),
          col.defect.length>0 && h('span', { style:{ padding:'2px 6px', fontSize:10, borderRadius:6, background:RD3, color:RD2 } }, `⚠ ${col.defect.length}`)
        ),
        col.total>0 && h('div', { style: { height:4, background:'#eee', borderRadius:2, overflow:'hidden', marginBottom:6 } }, h('div', { style: { width: `${(col.done.length/col.total)*100}%`, height:4, background:GN, borderRadius:2 } })),
        col.in_progress.map(op => { const order = data.orders.find(o => o.id === op.orderId); const workerNames = op.workerIds?.map(id => data.workers.find(w => w.id === id)?.name).filter(Boolean).join(', ') || '—'; return h('div', { key: op.id, style: { padding:'6px 8px', background:AM3, borderRadius:6, marginBottom:4, borderLeft:`3px solid ${AM}` } }, h('div', { style: { fontSize:11, fontWeight:500, color:AM2 } }, order?.number || '—'), workerNames && h('div', { style: { fontSize:10, color:AM4 } }, workerNames), op.startedAt && h('div', { style: { fontSize:9, color:'#888' } }, fmtDur(now() - op.startedAt))); }),
        col.defect.map(op => { const order = data.orders.find(o => o.id === op.orderId); return h('div', { key: op.id, style: { padding:'6px 8px', background:RD3, borderRadius:6, marginBottom:4, borderLeft:`3px solid ${RD}` } }, h('div', { style: { fontSize:11, fontWeight:500, color:RD2 } }, order?.number || '—'), h('div', { style: { fontSize:10, color:RD } }, op.defectNote || 'Брак')); })
      ))
    )
  );
});



// ==================== MasterScreen ====================
const MasterScreen = memo(({ data, onUpdate, addToast, sectionId, onOrderClick, onWorkerClick, role }) => {
  const [qrOpData, setQrOpData] = useState(null);

  // Конфигурация вкладок по ролям
  const ALL_GROUPS = {
    production: { label: '⚙ Производство', tabs: [['ops','Операции'],['recommend','Назначения'],['kanban','Канбан'],['gantt','Гант'],['calendar','Загрузка'],['deps','Зависимости'],['orders','Заказы'],['plan','План']] },
    reference:  { label: '📋 Справочники', tabs: [['workers','Сотрудники'],['stages','Этапы'],['defectReasons','Причины брака'],['downtimes','Простои'],['materials','Материалы'],['equipment','Оборудование'],['bom','Спецификации'],['sections','Участки']] },
    analytics:  { label: '📊 Аналитика',   tabs: [['reports','Отчёты'],['analytics','Аналитика'],['qms','Качество'],['kpi','KPI / Премии'],['reclamations','Рекламации'],['auxops','Доп. работы'],['journal','Журнал'],['notifications','Уведомления']] },
    system:     { label: '🔧 Система',      tabs: [['time','Учёт времени'],['admin','Управление']] }
  };

  // Вкладки для каждой роли
  const ROLE_TABS = {
    master:      ALL_GROUPS, // полный доступ
    pdo: {
      production: { label: '⚙ Производство', tabs: [['ops','Операции'],['recommend','Назначения'],['kanban','Канбан'],['gantt','Гант'],['calendar','Загрузка'],['orders','Заказы'],['plan','План']] },
      analytics:  { label: '📊 Аналитика',   tabs: [['reports','Отчёты'],['qms','Качество'],['auxops','Доп. работы'],['journal','Журнал'],['notifications','Уведомления']] },
    },
    director: {
      analytics:  { label: '📊 Аналитика',   tabs: [['analytics','Аналитика'],['qms','Качество'],['kpi','KPI / Премии'],['reports','Отчёты'],['reclamations','Рекламации'],['auxops','Доп. работы']] },
      production: { label: '⚙ Производство', tabs: [['orders','Заказы'],['kanban','Канбан']] },
    },
    hr: {
      reference:  { label: '👥 Сотрудники',  tabs: [['workers','Сотрудники']] },
      analytics:  { label: '📊 Аналитика',   tabs: [['kpi','KPI / Премии'],['reports','Отчёты']] },
      system:     { label: '🕐 Учёт',         tabs: [['time','Учёт времени']] },
    },
    shop_master: {
      production: { label: '⚙ Производство', tabs: [['ops','Операции'],['recommend','Назначения'],['kanban','Канбан'],['orders','Заказы']] },
      analytics:  { label: '📊 Аналитика',   tabs: [['auxops','Доп. работы'],['journal','Журнал'],['notifications','Уведомления'],['reports','Отчёты']] },
    },
    admin: {
      reference:  { label: '📋 Справочники', tabs: [['workers','Сотрудники'],['stages','Этапы'],['defectReasons','Причины брака'],['downtimes','Простои'],['materials','Материалы'],['equipment','Оборудование'],['bom','Спецификации'],['sections','Участки']] },
      system:     { label: '🔧 Система',      tabs: [['time','Учёт времени'],['admin','Управление']] },
    },
  };

  const tabGroups = ROLE_TABS[role] || ALL_GROUPS;
  const firstGroup = Object.keys(tabGroups)[0];
  const [activeGroup, setActiveGroup] = useState(firstGroup);
  const [tab, setTab] = useState(tabGroups[firstGroup]?.tabs[0]?.[0] || 'ops');
  const currentTabs = tabGroups[activeGroup]?.tabs || [];
  const switchGroup = (g) => { setActiveGroup(g); setTab(tabGroups[g].tabs[0][0]); };
  const filteredData = useMemo(() => {
    if (!sectionId) return data;
    return { ...data, ops: data.ops.filter(o => o.sectionId === sectionId || !o.sectionId), workers: data.workers.filter(w => w.sectionId === sectionId || !w.sectionId) };
  }, [data, sectionId]);

  // Сводка мастера — мемоизируем чтобы не пересчитывать на каждый рендер
  const masterSummary = useMemo(() => {
    const activeOps   = data.ops.filter(o => o.status === 'in_progress' && !o.archived);
    const pendingOps  = data.ops.filter(o => o.status === 'pending' && !o.archived);
    const defectOps   = data.ops.filter(o => (o.status === 'defect' || o.status === 'rework') && !o.archived);
    const onCheckOps  = data.ops.filter(o => o.status === 'on_check' && !o.archived);
    const wipOrders   = data.orders.filter(o => !o.archived && data.ops.some(op => op.orderId === o.id && op.status === 'in_progress'));
    const freeWorkers = data.workers.filter(w => (w.status || 'working') === 'working' && !data.ops.some(op => op.status === 'in_progress' && op.workerIds?.includes(w.id)));
    return { activeOps, pendingOps, defectOps, onCheckOps, wipOrders, freeWorkers };
  }, [data.ops, data.orders, data.workers]);
  return h('div', { style: { padding:'0 0 24px' } },
    qrOpData && h(QRModal, { ops:[qrOpData.op], order: data.orders.find(o => o.id === qrOpData.op.orderId), worker: qrOpData.worker, onClose: () => setQrOpData(null) }),
    // Онбординг мастера — автоматически скрывается когда всё настроено
    role === 'master' && h(MasterOnboarding, { data, onDone: () => {} }),
    // Группы вкладок
    h('div', { className: 'tab-groups', style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
      Object.entries(tabGroups).map(([gid, g]) => h('button', { key: gid, style: activeGroup === gid ? abtn({ fontSize: 12, padding: '6px 14px' }) : gbtn({ fontSize: 12, padding: '6px 14px' }), onClick: () => switchGroup(gid) }, g.label))
    ),
    // Вкладки внутри группы — скролл
    h('div', { style: { borderBottom:'0.5px solid rgba(0,0,0,0.08)', marginBottom:16 }, role: 'tablist' },
      h('div', { className: 'tabs-scroll' },
        currentTabs.map(([id,label]) => h('button', { key: id, role: 'tab', 'aria-selected': tab === id, onClick: () => setTab(id), style: { padding:'8px 16px', background:'transparent', border:'none', borderBottom: tab === id ? `2px solid ${AM}` : '2px solid transparent', color: tab === id ? AM : '#888', cursor:'pointer', fontSize:13, minHeight: 40 } }, label))
      )
    ),
    tab === 'ops' && h('div', null,
      h(SectionAnalytics, { section: 'production', data }),
      // Сводка мастера
      (() => {
        const { activeOps, pendingOps, defectOps, onCheckOps, wipOrders, freeWorkers } = masterSummary;
        return h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 16 } },
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: AM } }, activeOps.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'В работе')),
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: BL } }, pendingOps.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Ожидают')),
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: '#0277BD' } }, onCheckOps.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Контроль')),
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: RD } }, defectOps.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Проблемы')),
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: AM4 } }, wipOrders.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'НЗП')),
          h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 22, fontWeight: 500, color: GN } }, freeWorkers.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Свободны'))
        );
      })(),
      h(LoadForecastWidget, { data }),
      h(MasterOps, { data: filteredData, onUpdate, onShowQR: (op, worker) => setQrOpData({ op, worker }), addToast, onOrderClick, onWorkerClick })
    ),
    tab === 'recommend' && h(AssignmentRecommendations, { data, onUpdate, addToast }),
    tab === 'kanban' && h(MasterKanban, { data, onUpdate, addToast }),
    tab === 'gantt' && h(GanttChart, { data }),
    tab === 'calendar' && h(ResourceCalendar, { data, onUpdate, addToast, onWorkerClick }),
    tab === 'deps' && h(DepsScreen, { data, onUpdate, addToast }),
    tab === 'orders' && h(MasterOrders, { data, onUpdate, addToast, onOrderClick }),
    tab === 'workers' && h(MasterWorkers, { data, onUpdate, addToast }),
    tab === 'stages' && h(MasterProductionStages, { data, onUpdate, addToast }),
    tab === 'defectReasons' && h(MasterDefectReasons, { data, onUpdate, addToast }),
    tab === 'downtimes' && h(MasterDowntimes, { data, onUpdate, addToast }),
    tab === 'materials' && h(MasterMaterials, { data, onUpdate, addToast }),
    tab === 'equipment' && h(MasterEquipment, { data, onUpdate, addToast }),
    tab === 'bom' && h(MasterBOM, { data, onUpdate, addToast }),
    tab === 'time' && h(MasterTimeTracking, { data, onUpdate, addToast, onWorkerClick }),
    tab === 'journal' && h(MasterJournal, { data, onWorkerClick }),
    tab === 'sections' && h(MasterSections, { data, onUpdate, addToast }),
    tab === 'plan' && h(MasterTodayPlan, { data, onWorkerClick }),
    tab === 'notifications' && h(MasterNotifications, { data }),
    tab === 'reports' && h(ReportsBuilder, { data }),
    tab === 'analytics' && h(AnalyticsDashboard, { data, onWorkerClick }),
    tab === 'qms' && h(QMSScreen, { data, onUpdate, addToast, onWorkerClick }),
    tab === 'kpi' && h(KPIReport, { data, onWorkerClick }),
    tab === 'reclamations' && h(MasterReclamations, { data, onUpdate, addToast, onWorkerClick }),
    tab === 'auxops' && h(AuxOpsViewer, { data, onUpdate, addToast, onWorkerClick }),
    tab === 'admin' && h(MasterAdmin, { data, onUpdate, addToast })
  );
});


// ==================== QMSScreen: Управление качеством ====================
const QMSScreen = memo(({ data, onUpdate, addToast, onWorkerClick }) => {
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterStage, setFilterStage] = useState('');
  const [investigatingDefectId, setInvestigatingDefectId] = useState(null);
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [preventiveMeasure, setPreventiveMeasure] = useState('');

  // Получить все дефекты, отфильтровать
  const allDefects = data.defects || [];
  const filtered = allDefects.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterStage && d.operationName !== filterStage) return false;
    return true;
  });

  // Парето анализ
  const paretoData = paretoDefectAnalysis(filtered);
  const sourceAnalysis = defectSourceAnalysis(filtered);
  const stageAnalysis = defectsByStage(filtered);

  // KPI
  const kpi = qmsKPI(filtered, data);

  // Сохранить разбор дефекта
  const resolveDefect = async (defectId, status) => {
    const updated = data.defects.map(d =>
      d.id === defectId
        ? {
            ...d,
            status,
            investigationDate: status !== 'open' ? Date.now() : null,
            investigatedBy: status !== 'open' ? data.currentUser?.name || '?' : null,
            rootCause: status !== 'open' ? rootCause : null,
            preventiveMeasure: status !== 'open' ? preventiveMeasure : null,
            investigationNotes
          }
        : d
    );
    const d = { ...data, defects: updated };
    await DB.save(d);
    onUpdate(d);
    setInvestigatingDefectId(null);
    setRootCause('');
    setPreventiveMeasure('');
    setInvestigationNotes('');
    addToast(`Дефект отмечен как "${status}"`, 'success');
  };

  return h('div', { style: { padding: '16px 12px 80px' } },
    // КПИ карточки
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 } },
      h('div', { style: { ...S.card, padding: '12px', textAlign: 'center' } },
        h('div', { style: { fontSize: 20, fontWeight: 600, color: RD } }, kpi.totalDefects),
        h('div', { style: { fontSize: 10, color: '#888', marginTop: 4 } }, 'Всего дефектов')
      ),
      h('div', { style: { ...S.card, padding: '12px', textAlign: 'center' } },
        h('div', { style: { fontSize: 20, fontWeight: 600, color: '#FF9800' } }, kpi.openDefects),
        h('div', { style: { fontSize: 10, color: '#888', marginTop: 4 } }, 'Открыто')
      ),
      h('div', { style: { ...S.card, padding: '12px', textAlign: 'center' } },
        h('div', { style: { fontSize: 20, fontWeight: 600, color: GN } }, kpi.resolvedDefects),
        h('div', { style: { fontSize: 10, color: '#888', marginTop: 4 } }, 'Разрешено')
      ),
      h('div', { style: { ...S.card, padding: '12px', textAlign: 'center' } },
        h('div', { style: { fontSize: 20, fontWeight: 600, color: AM } }, `${kpi.resolutionRate}%`),
        h('div', { style: { fontSize: 10, color: '#888', marginTop: 4 } }, 'Разрешено, %')
      )
    ),

    // Статистика источников
    h('div', { style: { ...S.card, marginBottom: 16 } },
      h('div', { style: S.sec }, 'Источник дефектов'),
      h('div', { style: { display: 'flex', gap: 16, fontSize: 12 } },
        h('div', null,
          h('div', { style: { fontWeight: 500, color: '#666' } }, 'Мой брак'),
          h('div', { style: { fontSize: 16, fontWeight: 600, color: RD } }, sourceAnalysis.thisStage),
          h('div', { style: { fontSize: 10, color: '#888' } }, `${sourceAnalysis.thisStagePercent}%`)
        ),
        h('div', null,
          h('div', { style: { fontWeight: 500, color: '#666' } }, 'С предыдущего'),
          h('div', { style: { fontSize: 16, fontWeight: 600, color: '#FF9800' } }, sourceAnalysis.previousStage),
          h('div', { style: { fontSize: 10, color: '#888' } }, `${sourceAnalysis.previousStagePercent}%`)
        )
      )
    ),

    // Парето (топ типы дефектов)
    h('div', { style: { ...S.card, marginBottom: 16 } },
      h('div', { style: S.sec }, '📊 Парето — Типы дефектов (80/20)'),
      paretoData.length === 0
        ? h('div', { style: { textAlign: 'center', color: '#888', padding: '20px', fontSize: 12 } }, 'Нет дефектов')
        : h('div', null,
            paretoData.map(item =>
              h('div', { key: item.type, style: { marginBottom: 10 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } },
                  h('span', { style: { fontWeight: 500 } }, item.type),
                  h('span', { style: { color: '#888' } }, `${item.count} (${item.percent}%) → ${item.cumulative}%`)
                ),
                h('div', { style: { background: '#f0f0f0', height: 8, borderRadius: 4, overflow: 'hidden' } },
                  h('div', { style: { background: item.cumulative > 80 ? GN : AM, height: 8, width: `${item.cumulative}%`, borderRadius: 4 } })
                )
              )
            )
          )
    ),

    // Дефекты по этапам
    h('div', { style: { ...S.card, marginBottom: 16 } },
      h('div', { style: S.sec }, 'Дефекты по этапам'),
      stageAnalysis.length === 0
        ? h('div', { style: { textAlign: 'center', color: '#888', padding: '20px', fontSize: 12 } }, 'Нет дефектов')
        : h('div', null,
            stageAnalysis.slice(0, 5).map(item =>
              h('div', { key: item.stage, style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid #eee', fontSize: 12 } },
                h('span', null, item.stage),
                h('span', { style: { fontWeight: 600, color: RD } }, item.count)
              )
            )
          )
    ),

    // Фильтры и список дефектов
    h('div', { style: { marginBottom: 12 } },
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
        h('button', { style: filterStatus === 'open' ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterStatus('open') }, 'Открыто'),
        h('button', { style: filterStatus === 'investigating' ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterStatus('investigating') }, 'Разбирается'),
        h('button', { style: filterStatus === 'resolved' ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterStatus('resolved') }, 'Разрешено'),
        h('button', { style: filterStatus === '' ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setFilterStatus('') }, 'Все')
      )
    ),

    // Список дефектов
    h('div', { style: { ...S.card, padding: 0 } },
      filtered.length === 0
        ? h('div', { style: { textAlign: 'center', padding: '30px', color: '#888', fontSize: 12 } }, 'Нет дефектов по выбранным фильтрам')
        : h('div', null,
            filtered.map(d => {
              const order = data.orders.find(o => o.id === d.orderId);
              const worker = data.workers.find(w => w.id === d.workerId);
              const isInvestigating = investigatingDefectId === d.id;

              return h('div', { key: d.id, style: { padding: '12px', borderBottom: '0.5px solid #eee', background: d.status === 'resolved' ? '#f5f5f5' : d.status === 'investigating' ? '#FFF3E0' : '#fff' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
                  h('div', null,
                    h('div', { style: { fontWeight: 500, fontSize: 12 } }, d.defectType),
                    h('div', { style: { fontSize: 11, color: '#888', marginTop: 2, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' } },
                      h('span', null, `${order?.number || '?'} → ${d.operationName} →`),
                      h(WN, { workerId: d.workerId, data, onWorkerClick })
                    )
                  ),
                  h('span', { style: { fontSize: 10, padding: '2px 6px', borderRadius: 3, background: d.status === 'resolved' ? GN3 : d.status === 'investigating' ? '#FFE0B2' : '#FFF3CD', color: d.status === 'resolved' ? GN2 : d.status === 'investigating' ? '#E65100' : '#856404' } },
                    d.status === 'open' ? 'Открыто' : d.status === 'investigating' ? 'Разбирается' : 'Разрешено'
                  )
                ),
                h('div', { style: { fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.4 } }, d.description),
                h('div', { style: { fontSize: 10, color: '#999', marginBottom: 8 } },
                  `Источник: ${d.source === 'previous_stage' ? '🔙 С предыдущего' : '👤 Мой брак'} • ${new Date(d.createdAt).toLocaleString('ru')}`
                ),
                
                isInvestigating
                  ? h('div', { style: { background: '#f9f9f9', padding: '10px', borderRadius: 6, marginTop: 8 } },
                      h('div', { style: { fontSize: 11, fontWeight: 500, marginBottom: 8 } }, 'Разбор дефекта'),
                      h('textarea', { style: { ...S.inp, width: '100%', minHeight: 60, marginBottom: 8, fontSize: 12 }, placeholder: 'Первопричина...', value: rootCause, onChange: e => setRootCause(e.target.value) }),
                      h('textarea', { style: { ...S.inp, width: '100%', minHeight: 60, marginBottom: 8, fontSize: 12 }, placeholder: 'Какие меры принять чтобы не повторилось?', value: preventiveMeasure, onChange: e => setPreventiveMeasure(e.target.value) }),
                      h('textarea', { style: { ...S.inp, width: '100%', minHeight: 40, marginBottom: 8, fontSize: 12 }, placeholder: 'Примечания...', value: investigationNotes, onChange: e => setInvestigationNotes(e.target.value) }),
                      h('div', { style: { display: 'flex', gap: 6 } },
                        h('button', { style: gbtn({ flex: 1, fontSize: 11 }), onClick: () => resolveDefect(d.id, 'resolved') }, '✓ Разрешено'),
                        h('button', { style: { ...gbtn({ flex: 1, fontSize: 11 }), color: '#666' }, onClick: () => setInvestigatingDefectId(null) }, 'Назад')
                      )
                    )
                  : h('div', { style: { display: 'flex', gap: 6 } },
                      d.status === 'open' && h('button', { style: gbtn({ flex: 1, fontSize: 11 }), onClick: () => { setInvestigatingDefectId(d.id); setRootCause(''); setPreventiveMeasure(''); setInvestigationNotes(''); } }, 'Разобрать'),
                      h('button', { style: gbtn({ flex: 1, fontSize: 11 }), onClick: () => resolveDefect(d.id, 'wontfix') }, '✗ Не рассматр.')
                    )
              );
            })
          )
    )
  );
});


const CostAnalytics = memo(({ data, onUpdate, addToast }) => {
  const [showRates, setShowRates] = useState(false);
  
  // 💰 Отчёт по себестоимости всех заказов
  const costReport = useMemo(() => getCostReport(data), [data.orders?.length, data.ops?.length, data.workers?.length]);
  
  return h('div', null,
    h('div', { style: S.card },
      h('div', { style: S.sec }, '💰 Рентабельность заказов'),
      h('div', { style: { display:'flex', gap:8, marginBottom:12 } },
        h('button', { style: gbtn({ fontSize:11, padding:'6px 10px' }), onClick: () => setShowRates(v => !v) }, showRates ? '▼ Ставки' : '▶ Ставки сотрудников')
      ),
      // 📋 Таблица себестоимости
      h('div', { className:'table-responsive' }, h('table', { style: { width:'100%', borderCollapse:'collapse', fontSize:11 } },
        h('thead', null, h('tr', null,
          ['Заказ','Цена','Материал','Рабсила','Себест','Прибыль','Маржа'].map((h, i) => h('th', { key:i, style: S.th }, h))
        )),
        h('tbody', null, costReport.map(r => h('tr', { key:r.orderId },
          h('td', { style: S.td }, data.orders?.find(o => o.id === r.orderId)?.number || '—'),
          h('td', { style: S.td }, `${r.price} ₽`),
          h('td', { style: S.td }, `${r.materialCost} ₽`),
          h('td', { style: S.td }, `${r.laborCost} ₽`),
          h('td', { style: S.td }, `${r.totalCost} ₽`),
          h('td', { style: { ...S.td, color: r.profit >= 0 ? GN : RD, fontWeight:500 } }, `${r.profit} ₽`),
          h('td', { style: { ...S.td, background: r.margin >= 20 ? '#E8F5E9' : r.margin >= 0 ? '#FFF8E1' : '#FFF0F0', fontWeight:500 } }, `${r.margin}%`)
        )))
      )),
      // 📊 Ставки сотрудников (редактируемо)
      showRates && h('div', { style: { marginTop:16, padding:12, background:'#f8f8f5', borderRadius:8 } },
        h('div', { style: { fontSize:12, fontWeight:500, marginBottom:12 } }, 'Установить часовую ставку (руб/час):'),
        data.workers?.filter(w => !w.archived).map(w => h('div', { key:w.id, style: { display:'flex', gap:8, marginBottom:8, alignItems:'center' } },
          h('div', { style: { flex:1, fontSize:12 } }, w.name),
          h('input', { type:'number', min:100, max:5000, step:50, style: { ...S.inp, width:80, fontSize:12 }, value: w.hourlyRate || 200, onChange: e => {
            const newRate = parseInt(e.target.value);
            if (newRate > 0) setWorkerRate(data, w.id, newRate, onUpdate).then(() => addToast(`Ставка ${w.name}: ${newRate} ₽/ч`, 'success'));
          } }),
          h('span', { style: { fontSize:11, color:'#888' } }, '₽/ч')
        ))
      )
    )
  );
});

// ==================== QRScreen ====================
const QRScreen = memo(({ data, opId, onUpdate, addToast }) => {
  const op = data.ops.find(o => o.id === opId);
  const order = op ? data.orders.find(o => o.id === op.orderId) : null;
  const workerNames = op ? op.workerIds?.map(id => data.workers.find(w => w.id === id)?.name).filter(Boolean).join(', ') : '';
  const [defNote, setDefNote] = useState('');
  const [defectReasonId, setDefectReasonId] = useState('');
  const [showDefForm, setShowDefForm] = useState(false);
  const [defectFromPrev, setDefectFromPrev] = useState(true);
  const [showDowntimeModal, setShowDowntimeModal] = useState(false);
  const [selectedDowntimeType, setSelectedDowntimeType] = useState('');
  const [, setTick] = useState(0);
  const [weldParams, setWeldParams] = useState({ seamNumber:'', electrode:'', result:'ok' });
  const [downtimeStartedAt, setDowntimeStartedAt] = useState(null);
  const [downtimeEquipmentId, setDowntimeEquipmentId] = useState('');

  useEffect(() => {
    if (!op || op.status !== 'in_progress') return;
    const t = setInterval(() => setTick(n => n+1), 1000);
    return () => clearInterval(t);
  }, [op?.status]);

  // ── Все useCallback ДО раннего return (Rules of Hooks) ──
  const handleStart = useCallback(async () => {
    if (!op || op.status !== 'pending') return;
    const workerId = op.workerIds?.[0];
    const worker = data.workers.find(w => w.id === workerId);
    if (worker && worker.competences && worker.competences.length > 0 && !worker.competences.includes(op.name)) { addToast('У сотрудника нет компетенции', 'error'); return; }
    const result = buildStartUpdate(data, op, workerId);
    const updated = { ...data, ops: result.ops, events: result.events };
    await DB.save(updated); onUpdate(updated); addToast('Операция начата', 'success');
  }, [data, op, onUpdate, addToast]);

  const handleFinish = useCallback(async (isDefect=false, isRework=false, source='current') => {
    if (!op || op.status !== 'in_progress') return;
    const workerId = op.workerIds?.[0];
    const result = buildFinishUpdate(data, op, workerId, { isDefect, isRework, source, defNote, defectReasonId, weldParams });
    const updated = { ...data, ops: result.ops, events: result.events, reclamations: result.reclamations };
    const allAchUpdated = (op.workerIds || []).reduce((acc, wid) => { const r = checkAchievements(wid, acc); return r; }, updated);
    const final = allAchUpdated !== updated ? allAchUpdated : updated;
    await DB.save(final); onUpdate(final);
    setShowDefForm(false); setDefNote(''); setDefectReasonId(''); setWeldParams({ seamNumber:'', electrode:'', result:'ok' });
    addToast('Операция завершена', 'info');
  }, [data, op, onUpdate, defNote, defectReasonId, weldParams, addToast]);

  const recordDowntime = useCallback(async () => {
    if (!op || !selectedDowntimeType) return addToast('Выберите причину', 'error');
    const shift = getCurrentShift(data.settings?.shifts);
    const duration = downtimeStartedAt ? now() - downtimeStartedAt : 0;
    const newEvent = { id: uid(), type:'downtime', workerId: op.workerIds?.[0], opId: op.id, ts: now(), downtimeTypeId: selectedDowntimeType, shift, startedAt: downtimeStartedAt || now(), duration, equipmentId: downtimeEquipmentId || undefined };
    const updated = { ...data, events: [...data.events, newEvent] };
    await DB.save(updated); onUpdate(updated);
    setShowDowntimeModal(false); setSelectedDowntimeType(''); setDowntimeStartedAt(null); setDowntimeEquipmentId('');
    addToast('Простой зафиксирован', 'success');
  }, [data, op, selectedDowntimeType, downtimeStartedAt, onUpdate, addToast]);

  // ── Ранний return — только после всех хуков ──
  if (!op || op.archived) return h('div', { style: { ...S.card, textAlign:'center', padding: 24 } },
    h('div', { style: { fontSize: 16, marginBottom: 8 } }, '⏳ Поиск операции...'),
    h('div', { style: { fontSize: 12, color: '#888', marginBottom: 16 } }, `ID: ${opId}`),
    h('div', { style: { fontSize: 12, color: '#888' } }, 'Если операция не появится — данные ещё не синхронизированы. Обновите страницу.'),
    h('button', { style: abtn({ marginTop: 12 }), onClick: () => window.location.reload() }, '🔄 Обновить')
  );
  const elapsed = op.startedAt && !op.finishedAt ? now() - op.startedAt : 0;

  const renderQRActions = () => {
    if (showDefForm) return h('div', null,
      h('div', { style: { fontSize: 11, color: RD, fontWeight: 500, marginBottom: 6, textTransform: 'uppercase' } }, 'Фиксация брака'),
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
        h('button', { type: 'button', style: defectFromPrev ? rbtn({ flex:1, fontSize:11 }) : gbtn({ flex:1, fontSize:11 }), onClick: () => setDefectFromPrev(true) }, 'С пред. участка'),
        h('button', { type: 'button', style: !defectFromPrev ? rbtn({ flex:1, fontSize:11 }) : gbtn({ flex:1, fontSize:11 }), onClick: () => setDefectFromPrev(false) }, 'Текущий этап')
      ),
      h('select', { style: { ...S.inp, width:'100%', marginBottom:8 }, value: defectReasonId, onChange: e => setDefectReasonId(e.target.value) }, h('option', { value:'' }, '— выберите причину —'), (data.defectReasons || []).map(r => h('option', { key: r.id, value: r.id }, r.name))),
      h('textarea', { style: { ...S.inp, width:'100%', marginBottom:8 }, rows:2, placeholder:'Опишите дефект...', value: defNote, onChange: e => setDefNote(e.target.value) }),
      h('div', { style: { display:'flex', gap:6 } },
        h('button', { style: rbtn({ flex:1 }), onClick: () => handleFinish(true, false, defectFromPrev ? 'previous_stage' : 'current') }, 'Зафиксировать брак'),
        h('button', { style: { ...gbtn({ flex:1 }), color:AM2, borderColor:AM4 }, onClick: () => handleFinish(false, true, defectFromPrev ? 'previous_stage' : 'current') }, 'Переделка'),
        h('button', { style: gbtn({ flex:1 }), onClick: () => { setShowDefForm(false); setDefectFromPrev(true); } }, 'Отмена')
      )
    );
    if (op.name.includes('свар')) return h('div', null,
      h('div', { style: { display:'flex', gap:8, marginBottom:8 } }, h('input', { style: { ...S.inp, flex:1 }, placeholder:'Номер шва', value: weldParams.seamNumber, onChange: e => setWeldParams(p => ({ ...p, seamNumber: e.target.value })) }), h('input', { style: { ...S.inp, flex:1 }, placeholder:'Тип электрода', value: weldParams.electrode, onChange: e => setWeldParams(p => ({ ...p, electrode: e.target.value })) })),
      h('div', { style: { display:'flex', gap:8, marginBottom:8 } },
        h('label', { style: { display:'flex', alignItems:'center', gap:4 } }, h('input', { type:'radio', name:`weldResult_qr_${op.id}`, value:'ok', checked: weldParams.result === 'ok', onChange: e => setWeldParams(p => ({ ...p, result: e.target.value })) }), 'Принято'),
        h('label', { style: { display:'flex', alignItems:'center', gap:4 } }, h('input', { type:'radio', name:`weldResult_qr_${op.id}`, value:'fail', checked: weldParams.result === 'fail', onChange: e => setWeldParams(p => ({ ...p, result: e.target.value })) }), 'Брак')
      ),
      h('div', { className: 'action-btns', style: { display:'flex', gap:8, flexWrap:'wrap' } },
        op.status === 'pending' && workerNames && h('button', { style: abtn({ flex:1, padding:'12px' }), onClick: handleStart }, '▶ Старт'),
        op.status === 'in_progress' && h('button', { style: { ...abtn({ flex:1 }), background:GN, color:GN2 }, onClick: () => handleFinish() }, '✓ Завершить'),
        op.status === 'in_progress' && h('button', { style: rbtn({ flex:1 }), onClick: () => { setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с пред.'),
        op.status === 'in_progress' && h('button', { style: { ...rbtn({ flex:1 }), background:'#FFF0F0', borderColor:'#F09595' }, onClick: () => { setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
        (op.status === 'pending' || op.status === 'in_progress') && h('button', { style: gbtn({ flex:1 }), onClick: () => { setShowDowntimeModal(true); setDowntimeStartedAt(now()); } }, '⏸ Простой')
      )
    );
    return h('div', { className: 'action-btns', style: { display:'flex', gap:8, flexWrap:'wrap' } },
      op.status === 'pending' && workerNames && h('button', { style: abtn({ flex:1, padding:'12px' }), onClick: handleStart }, '▶ Старт'),
      op.status === 'in_progress' && h('button', { style: { ...abtn({ flex:1 }), background:GN, color:GN2 }, onClick: () => handleFinish() }, '✓ Завершить'),
      op.status === 'in_progress' && h('button', { style: rbtn({ flex:1 }), onClick: () => { setShowDefForm(true); setDefectFromPrev(true); } }, '⚠ Брак с пред.'),
      op.status === 'in_progress' && h('button', { style: { ...rbtn({ flex:1 }), background:'#FFF0F0', borderColor:'#F09595' }, onClick: () => { setShowDefForm(true); setDefectFromPrev(false); } }, '⚠ Мой брак'),
      (op.status === 'pending' || op.status === 'in_progress') && h('button', { style: gbtn({ flex:1 }), onClick: () => { setShowDowntimeModal(true); setDowntimeStartedAt(now()); } }, '⏸ Простой')
    );
  };

  return h('div', { style: { maxWidth:420, margin:'0 auto', padding:'16px 12px' } },
    h('div', { style: { ...S.card, border: `1px solid ${AM}`, background:AM3 } },
      h('div', { style: { fontSize:10, color:AM, textTransform:'uppercase', marginBottom:6 } }, 'Операция по QR-коду'),
      h('div', { style: { fontSize:18, fontWeight:500, color:AM2 } }, op.name),
      h('div', { style: { fontSize:14, color:AM, marginBottom:8 } }, order?.number || '—'),
      h('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom:16, background:'#fff', borderRadius:8, padding:8 } },
        h('div', { style: { width:32, height:32, borderRadius:'50%', background:AM3, display:'flex', alignItems:'center', justifyContent:'center' } }, workerNames?.[0] || '?'),
        h('div', null, h('div', { style: { fontSize:13, fontWeight:500 } }, workerNames || 'Не назначен'), h('div', { style: { fontSize:10, color:'#888' } }, 'Плановый исполнитель'))
      ),
      h('div', { style: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 } }, h(Badge, { st: op.status }), op.status === 'in_progress' && h('div', { style: { fontSize:24, fontWeight:500, color:AM } }, fmtDur(elapsed))),
      renderQRActions()
    ),
    showDowntimeModal && h('div', { role:'dialog','aria-modal':'true','aria-label':'Фиксация простоя', style: { position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 } },
      h('div', { style: { background:'#fff',borderRadius:12,padding:24,width:'min(300px, calc(100vw - 32px))' } },
        h('div', { style: { fontSize:14, fontWeight:500, marginBottom:12 } }, 'Причина простоя'),
        h('select', { style: { ...S.inp, width:'100%', marginBottom:16 }, value: selectedDowntimeType, onChange: e => setSelectedDowntimeType(e.target.value) }, h('option', { value:'' }, '— выберите —'), data.downtimeTypes.map(dt => h('option', { key: dt.id, value: dt.id }, dt.name))),
        h('div', { style: { display:'flex', gap:8, justifyContent:'flex-end' } }, h('button', { style: gbtn(), onClick: () => setShowDowntimeModal(false) }, 'Отмена'), h('button', { style: abtn(), onClick: recordDowntime }, 'Зафиксировать'))
      )
    )
  );
});



