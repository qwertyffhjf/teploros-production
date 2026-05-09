// teploros · reference.js
// Автоматически извлечено из монолита

const PasteImportWidget = memo(({ columns, onImport, addToast, hint }) => {
  const [open, setOpen]       = useState(false);
  const [preview, setPreview] = useState(null); // { headers, rows, colMap }
  const [colMap, setColMap]   = useState({});
  const [step, setStep]       = useState('paste'); // paste | map | confirm

  const reset = useCallback(() => {
    setOpen(false); setPreview(null); setColMap({}); setStep('paste');
  }, []);

  // Парсинг TSV из буфера обмена
  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text') || '';
    if (!text.trim()) { addToast('Буфер обмена пуст', 'error'); return; }
    const rows = text.trim().split('\n').map(line =>
      line.split('\t').map(c => c.trim().replace(/^"|"$/g, ''))
    ).filter(r => r.some(c => c));
    if (rows.length < 1) { addToast('Нет данных', 'error'); return; }

    const headers = rows[0];
    const dataRows = rows.length > 1 && rows[0].some(c => isNaN(Number(c.replace(',','.')))) ? rows.slice(1) : rows;
    const hdrs = rows.length > 1 && rows[0].some(c => isNaN(Number(c.replace(',','.')))) ? headers : headers.map((_, i) => `Столбец ${i+1}`);

    // Автодетект колонок по synonyms
    const synonyms = {
      name:         ['наим','назв','name','имя','фио','должн','матер','участок','оборуд','номенкл','этап','причин','тип'],
      number:       ['номер','number','№','заказ','артикул','инвент'],
      product:      ['изделие','product','продукт'],
      qty:          ['кол','qty','количес','кол-во','остат'],
      unit:         ['ед','unit','мера'],
      price:        ['цен','price','стоим','руб'],
      position:     ['должн','position','роль','специал'],
      grade:        ['разряд','grade','квалиф'],
      pin:          ['pin','пин','пароль'],
      plannedHours: ['час','hour','план','норм'],
      type:         ['тип','type','вид','категор'],
      inventoryNo:  ['инвент','inv','табел','номер инв'],
      deadline:     ['срок','deadline','дата','до'],
    };

    const autoMap = {};
    columns.forEach(col => {
      const patterns = synonyms[col.key] || [col.key.toLowerCase()];
      for (const h of hdrs) {
        const hn = h.toLowerCase().replace(/\s+/g,' ').trim();
        if (patterns.some(p => hn.includes(p))) { autoMap[col.key] = h; break; }
      }
    });

    setPreview({ headers: hdrs, rows: dataRows });
    setColMap(autoMap);
    // Если 1 колонка — пропускаем маппинг
    if (hdrs.length === 1 || columns.length === 1) {
      autoMap[columns[0].key] = hdrs[0];
      setColMap(autoMap);
      setStep('confirm');
    } else {
      setStep('map');
    }
  }, [columns, addToast]);

  // Финальные строки после маппинга
  const mappedRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map(row => {
      const obj = {};
      columns.forEach(col => {
        const h = colMap[col.key];
        const val = h !== undefined ? (row[preview.headers.indexOf(h)] ?? '') : (col.default ?? '');
        obj[col.key] = val.toString().trim();
      });
      return obj;
    }).filter(r => columns.filter(c => c.required).every(c => r[c.key]));
  }, [preview, colMap, columns]);

  if (!open) return h('button', {
    style: { ...gbtn({ fontSize: 12 }), display: 'flex', alignItems: 'center', gap: 6 },
    onClick: () => setOpen(true),
    title: hint || 'Вставить данные из Excel (Ctrl+V)'
  }, '📋 Вставить из Excel');

  return h('div', { style: { border: `1.5px solid ${AM}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, background: AM3 } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
      h('div', { style: { fontSize: 13, fontWeight: 500, color: AM2 } },
        step === 'paste'   ? '📋 Вставить из Excel — скопируйте ячейки и нажмите Ctrl+V' :
        step === 'map'     ? '📋 Настройте колонки' :
                             `📋 Превью — ${mappedRows.length} строк`
      ),
      h('button', { style: { background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18 }, onClick: reset }, '×')
    ),

    // Шаг 1: зона вставки
    step === 'paste' && h('div', {
      onPaste: handlePaste,
      tabIndex: 0,
      style: { border: `2px dashed ${AM}`, borderRadius: 8, padding: '20px', textAlign: 'center', cursor: 'text', background: '#fff', outline: 'none', fontSize: 13, color: '#888' },
    },
      h('div', { style: { fontSize: 24, marginBottom: 6 } }, '📋'),
      h('div', { style: { fontWeight: 500, color: '#555', marginBottom: 4 } }, 'Кликните сюда и нажмите Ctrl+V'),
      h('div', { style: { fontSize: 11 } }, 'Скопируйте ячейки из Excel или Google Sheets, заголовки — необязательны')
    ),

    // Шаг 2: маппинг колонок
    step === 'map' && h('div', null,
      h('div', { style: { fontSize: 11, color: '#666', marginBottom: 8 } },
        `Найдено ${preview.rows.length} строк, ${preview.headers.length} столбцов. Сопоставьте колонки:`
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 } },
        columns.map(col => h('div', { key: col.key },
          h('label', { style: S.lbl }, `${col.required ? '* ' : ''}${col.label}`),
          h('select', {
            style: { ...S.inp, borderColor: col.required && !colMap[col.key] ? AM : undefined },
            value: colMap[col.key] || '',
            onChange: e => setColMap(p => ({ ...p, [col.key]: e.target.value }))
          },
            h('option', { value: '' }, col.required ? '— выберите —' : '— не использовать —'),
            preview.headers.map(h2 => h('option', { key: h2, value: h2 }, `${h2} (пример: ${preview.rows[0]?.[preview.headers.indexOf(h2)] || '—'})` ))
          )
        ))
      ),
      // Превью первых строк
      h('div', { className: 'table-responsive', style: { marginBottom: 10 } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
          h('thead', null, h('tr', null, preview.headers.slice(0, 5).map(hd =>
            h('th', { key: hd, style: { ...S.th, background: Object.values(colMap).includes(hd) ? AM3 : '#f8f8f5' } }, hd)
          ))),
          h('tbody', null, preview.rows.slice(0, 3).map((row, i) =>
            h('tr', { key: i }, preview.headers.slice(0, 5).map((hd, j) =>
              h('td', { key: j, style: { ...S.td, background: Object.values(colMap).includes(hd) ? '#fffbf0' : 'transparent' } }, row[j] || '')
            ))
          ))
        )
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { style: gbtn({ flex: 1 }), onClick: () => setStep('paste') }, '← Назад'),
        h('button', { style: abtn({ flex: 2 }), onClick: () => {
          if (columns.filter(c => c.required).some(c => !colMap[c.key])) {
            addToast('Укажите обязательные колонки', 'error'); return;
          }
          setStep('confirm');
        }}, `Далее: проверить (${preview.rows.length}) →`)
      )
    ),

    // Шаг 3: превью строк
    step === 'confirm' && h('div', null,
      h('div', { style: { fontSize: 11, color: GN2, marginBottom: 8 } }, `✓ Готово к добавлению: ${mappedRows.length} строк`),
      h('div', { className: 'table-responsive', style: { maxHeight: 180, overflowY: 'auto', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 6, marginBottom: 10 } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          h('thead', null, h('tr', null, columns.filter(c => colMap[c.key] || c.required).map(c =>
            h('th', { key: c.key, style: { ...S.th, position: 'sticky', top: 0, background: '#f8f8f5' } }, c.label)
          ))),
          h('tbody', null, mappedRows.slice(0, 10).map((row, i) =>
            h('tr', { key: i, style: { background: i % 2 ? '#fafafa' : 'transparent' } },
              columns.filter(c => colMap[c.key] || c.required).map(c =>
                h('td', { key: c.key, style: S.td }, row[c.key] || '—')
              )
            )
          )),
          mappedRows.length > 10 && h('tr', null, h('td', { colSpan: columns.length, style: { ...S.td, color: '#888', textAlign: 'center' } }, `... ещё ${mappedRows.length - 10} строк`))
        )
      ),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', { style: gbtn({ flex: 1 }), onClick: () => setStep(preview.headers.length > 1 ? 'map' : 'paste') }, '← Назад'),
        h('button', { style: { ...abtn({ flex: 2 }), background: GN, color: '#fff' }, onClick: () => { onImport(mappedRows); reset(); } },
          `✓ Добавить ${mappedRows.length} записей`
        )
      )
    )
  );
});

// ==================== MasterSections ====================


const MasterSections = memo(({ data, onUpdate, addToast }) => {
  const [newName, setNewName] = useState('');
  const { ask: askConfirm, confirmEl } = useConfirm();
  const add = useCallback(async () => {
    if (!newName.trim()) return;
    const newSection = { id: uid(), name: newName.trim() };
    const d = { ...data, sections: [...data.sections, newSection] };
    await DB.save(d); onUpdate(d); setNewName(''); addToast('Участок добавлен', 'success');
  }, [data, newName, onUpdate, addToast]);
  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить участок?' }))) return;
    const d = { ...data, sections: data.sections.filter(s => s.id !== id), workers: data.workers.map(w => w.sectionId === id ? { ...w, sectionId: null } : w), ops: data.ops.map(o => o.sectionId === id ? { ...o, sectionId: null } : o) };
    await DB.save(d); onUpdate(d); addToast('Участок удалён', 'info');
  }, [data, askConfirm, onUpdate, addToast]);
  const importSections = useCallback(async (rows) => {
    const existing = new Set(data.sections.map(s => s.name.toLowerCase()));
    const items = rows.filter(r => r.name && !existing.has(r.name.toLowerCase())).map(r => ({ id: uid(), name: r.name }));
    if (!items.length) { addToast('Все участки уже существуют', 'info'); return; }
    const d = { ...data, sections: [...data.sections, ...items] };
    await DB.save(d); onUpdate(d); addToast(`Добавлено: ${items.length}`, 'success');
  }, [data, onUpdate, addToast]);
  return h('div', null,
    confirmEl,
    h(PasteImportWidget, { addToast, hint: 'Вставить список участков из Excel',
      columns: [{ key: 'name', label: 'Название участка', required: true }],
      onImport: importSections }),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Добавить участок'),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Заготовительный цех', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => e.key === 'Enter' && add() }),
        h('button', { type: 'button', style: abtn(), onClick: add }, '+ Добавить')
      )
    ),
    data.sections.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Нет участков')
      : h('div', { style: { ...S.card } }, data.sections.map(s =>
          h('div', { key: s.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
            h('span', { style: { fontSize: 13 } }, s.name),
            h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': `Удалить участок ${s.name}`, onClick: () => del(s.id) }, 'Удалить')
          )
        ))
  );
});

// ==================== MasterEquipment ====================
const MasterEquipment = memo(({ data, onUpdate, addToast }) => {
  const EQ_STATUS = { active: { label: 'Работает', bg: GN3, cl: GN2 }, maintenance: { label: 'На ТО', bg: AM3, cl: AM2 }, repair: { label: 'Ремонт', bg: RD3, cl: RD2 }, decommissioned: { label: 'Списано', bg: '#f0f0f0', cl: '#888' } };
  const [form, setForm] = useState({ name: '', type: '', inventoryNo: '', status: 'active' });
  const { ask: askConfirm, confirmEl } = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const add = useCallback(async () => {
    if (!form.name.trim()) return;
    const eq = { id: uid(), name: form.name.trim(), type: form.type.trim() || 'станок', inventoryNo: form.inventoryNo.trim(), status: form.status, totalHours: 0 };
    if (editingId) {
      const d = { ...data, equipment: data.equipment.map(e => e.id === editingId ? { ...e, name: form.name.trim(), type: form.type.trim(), inventoryNo: form.inventoryNo.trim(), status: form.status } : e) };
      await DB.save(d); onUpdate(d); setEditingId(null); addToast('Оборудование обновлено', 'success');
    } else {
      const d = { ...data, equipment: [...data.equipment, eq] };
      await DB.save(d); onUpdate(d); addToast('Оборудование добавлено', 'success');
    }
    setForm({ name: '', type: '', inventoryNo: '', status: 'active' });
  }, [data, form, editingId, onUpdate, addToast]);
  const del = useCallback(async (id) => { if (!(await askConfirm({ message: 'Удалить?' }))) return; const d = { ...data, equipment: data.equipment.filter(e => e.id !== id) }; await DB.save(d); onUpdate(d); addToast('Удалено', 'info'); }, [data, onUpdate, addToast]);
  const edit = useCallback((eq) => { setForm({ name: eq.name, type: eq.type || '', inventoryNo: eq.inventoryNo || '', status: eq.status || 'active' }); setEditingId(eq.id); }, []);

  // Подсчёт наработки
  const eqHours = useMemo(() => {
    const hours = {};
    data.ops.filter(op => op.equipmentId && op.status === 'done' && op.startedAt && op.finishedAt).forEach(op => {
      hours[op.equipmentId] = (hours[op.equipmentId] || 0) + (op.finishedAt - op.startedAt) / 3600000;
    });
    return hours;
  }, [data.ops]);

  return h('div', null,
    confirmEl,
    h(PasteImportWidget, { addToast, hint: 'Вставить оборудование из Excel',
      columns: [
        { key: 'name',        label: 'Название',      required: true },
        { key: 'type',        label: 'Тип/категория', required: false, default: 'станок' },
        { key: 'inventoryNo', label: 'Инв. номер',    required: false, default: '' },
      ],
      onImport: async (rows) => {
        const existing = new Set(data.equipment.map(e => e.name.toLowerCase()));
        const items = rows.filter(r => r.name && !existing.has(r.name.toLowerCase()))
          .map(r => ({ id: uid(), name: r.name, type: r.type || 'станок', inventoryNo: r.inventoryNo || '', status: 'active', totalHours: 0 }));
        if (!items.length) { addToast('Всё оборудование уже существует', 'info'); return; }
        const d = { ...data, equipment: [...data.equipment, ...items] };
        await DB.save(d); onUpdate(d); addToast(`Добавлено: ${items.length}`, 'success');
      }}),
    h('div', { style: S.card },
      h('div', { style: S.sec }, editingId ? 'Редактировать' : 'Добавить оборудование'),
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('input', { style: { ...S.inp, flex: 2, minWidth: 150 }, placeholder: 'Наименование', value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }),
        h('input', { style: { ...S.inp, flex: 1, minWidth: 80 }, placeholder: 'Тип', value: form.type, onChange: e => setForm(p => ({ ...p, type: e.target.value })) }),
        h('input', { style: { ...S.inp, flex: 1, minWidth: 100 }, placeholder: 'Инв. №', value: form.inventoryNo, onChange: e => setForm(p => ({ ...p, inventoryNo: e.target.value })) }),
        h('select', { style: { ...S.inp, minWidth: 110 }, value: form.status, onChange: e => setForm(p => ({ ...p, status: e.target.value })) },
          Object.entries(EQ_STATUS).map(([k, v]) => h('option', { key: k, value: k }, v.label))
        ),
        h('button', { style: abtn(), onClick: add }, editingId ? '✓' : '+'),
        editingId && h('button', { style: gbtn(), onClick: () => { setEditingId(null); setForm({ name: '', type: '', inventoryNo: '', status: 'active' }); } }, '✕')
      )
    ),
    data.equipment.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Нет оборудования')
      : h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Наименование', 'Тип', 'Инв. №', 'Статус', 'Наработка', ''].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, data.equipment.map(eq => {
            const st = EQ_STATUS[eq.status] || EQ_STATUS.active;
            const hrs = eqHours[eq.id] || 0;
            return h('tr', { key: eq.id },
              h('td', { style: S.td }, eq.name),
              h('td', { style: S.td }, eq.type),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, eq.inventoryNo || '—'),
              h('td', { style: S.td }, h('span', { style: { padding: '2px 8px', fontSize: 10, borderRadius: 6, background: st.bg, color: st.cl } }, st.label)),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, `${hrs.toFixed(1)} ч`),
              h('td', { style: S.td }, h('div', { style: { display: 'flex', gap: 4 } },
                h('button', { style: gbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => edit(eq) }, '✎'),
                h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => del(eq.id) }, '✕')
              ))
            );
          }))
        )))
  );
});

// ==================== MasterMaterials ====================
const MasterMaterials = memo(({ data, onUpdate, addToast }) => {
  const [form, setForm] = useState({ name: '', unit: '', quantity: '', batch: '', unitCost: '', minStock: '' });
  const [editingId, setEditingId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [search, setSearch] = useState('');
  const [adjustModal, setAdjustModal] = useState(null); // {mat} — модал корректировки
  const [adjustForm, setAdjustForm] = useState({ qty: '', comment: '' });
  const [selectedIds, setSelectedIds] = useState(new Set()); // для пакетного удаления
  const { ask: askConfirm, confirmEl } = useConfirm();

  const openAdjust = useCallback((mat) => {
    setAdjustModal(mat);
    setAdjustForm({ qty: String(mat.quantity), comment: '' });
  }, []);

  const saveAdjust = useCallback(async () => {
    if (!adjustModal) return;
    const newQty = parseFloat(adjustForm.qty);
    if (isNaN(newQty) || newQty < 0) { addToast('Введите корректное количество', 'error'); return; }
    if (!adjustForm.comment.trim()) { addToast('Укажите причину корректировки', 'error'); return; }
    const diff = newQty - adjustModal.quantity;
    const historyEntry = { id: uid(), ts: now(), oldQty: adjustModal.quantity, newQty, diff, comment: adjustForm.comment.trim() };
    const d = { ...data, materials: data.materials.map(m => m.id === adjustModal.id
      ? { ...m, quantity: newQty, adjustHistory: [...(m.adjustHistory || []), historyEntry] }
      : m
    )};
    await DB.save(d); onUpdate(d);
    setAdjustModal(null); setAdjustForm({ qty: '', comment: '' });
    addToast(`Остаток скорректирован: ${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10} ${adjustModal.unit}`, 'success');
  }, [data, adjustModal, adjustForm, onUpdate, addToast]);

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Введите название';
    if (!form.unit.trim()) errors.unit = 'Ед. изм.';
    const qty = Number(form.quantity);
    if (form.quantity === '' || isNaN(qty) || qty < 0) errors.quantity = 'Кол-во ≥ 0';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const resetForm = () => { setForm({ name: '', unit: '', quantity: '', batch: '', unitCost: '', minStock: '' }); setFieldErrors({}); setEditingId(null); };
  const addOrUpdate = useCallback(async () => {
    if (!validate()) return;
    const mat = { name: form.name.trim(), unit: form.unit.trim(), quantity: Number(form.quantity), batch: form.batch.trim(), unitCost: form.unitCost ? Number(form.unitCost) : 0, minStock: form.minStock ? Number(form.minStock) : 0 };
    if (editingId) {
      const d = { ...data, materials: data.materials.map(m => m.id === editingId ? { ...m, ...mat } : m) };
      await DB.save(d); onUpdate(d); resetForm(); addToast('Материал обновлён', 'success');
    } else {
      const d = { ...data, materials: [...data.materials, { id: uid(), ...mat }] };
      await DB.save(d); onUpdate(d); resetForm(); addToast('Материал добавлен', 'success');
    }
  }, [form, editingId, data, onUpdate, addToast]);
  const del = useCallback(async (id) => { if (!(await askConfirm({ message: 'Удалить материал?' }))) return; const d = { ...data, materials: data.materials.filter(m => m.id !== id) }; await DB.save(d); onUpdate(d); addToast('Удалён', 'info'); }, [data, onUpdate, addToast]);

  const delSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = await askConfirm({ message: `Удалить ${selectedIds.size} позиц.?`, detail: 'Действие необратимо', danger: true });
    if (!ok) return;
    const d = { ...data, materials: data.materials.filter(m => !selectedIds.has(m.id)) };
    await DB.save(d); onUpdate(d);
    setSelectedIds(new Set());
    addToast(`Удалено ${selectedIds.size} позиций`, 'info');
  }, [data, selectedIds, onUpdate, addToast, askConfirm]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAll = (items) => setSelectedIds(prev =>
    prev.size === items.length ? new Set() : new Set(items.map(m => m.id))
  );
  const edit = useCallback((m) => { setForm({ name: m.name, unit: m.unit, quantity: String(m.quantity), batch: m.batch || '', unitCost: m.unitCost ? String(m.unitCost) : '', minStock: m.minStock ? String(m.minStock) : '' }); setEditingId(m.id); }, []);

  // Импорт из Excel
  const importExcel = useCallback((event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { addToast('Файл пустой', 'error'); return; }
        const imported = rows.map(r => {
          const name = r['Название'] || r['Наименование'] || r['name'] || r['Name'] || Object.values(r)[0] || '';
          const unit = r['Ед. изм.'] || r['Единица'] || r['unit'] || r['Unit'] || 'шт';
          const qty = Number(r['Количество'] || r['Кол-во'] || r['Остаток'] || r['quantity'] || r['Qty'] || 0);
          const cost = Number(r['Цена'] || r['Цена/ед.'] || r['unitCost'] || r['Price'] || 0);
          const batch = r['Партия'] || r['batch'] || r['Batch'] || '';
          const minStock = Number(r['Мин. остаток'] || r['minStock'] || 0);
          if (!name.toString().trim()) return null;
          // Обновляем существующий материал по имени, или создаём новый
          const existing = data.materials.find(m => m.name.toLowerCase() === name.toString().trim().toLowerCase());
          if (existing) return { ...existing, quantity: qty || existing.quantity, unitCost: cost || existing.unitCost, batch: batch || existing.batch, minStock: minStock || existing.minStock };
          return { id: uid(), name: name.toString().trim(), unit: unit.toString(), quantity: qty, unitCost: cost, batch: batch.toString(), minStock };
        }).filter(Boolean);
        const existingIds = imported.filter(m => data.materials.some(dm => dm.id === m.id)).map(m => m.id);
        const newMats = imported.filter(m => !existingIds.includes(m.id));
        const updatedMats = data.materials.map(m => { const upd = imported.find(im => im.id === m.id); return upd || m; });
        const d = { ...data, materials: [...updatedMats, ...newMats] };
        DB.save(d).then(() => { onUpdate(d); addToast(`Импортировано: ${imported.length} позиций`, 'success'); });
      } catch(ex) { addToast('Ошибка чтения Excel: ' + ex.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }, [data, onUpdate, addToast]);

  // Экспорт в Excel
  const exportExcel = useCallback(() => {
    const rows = data.materials.map(m => ({ 'Название': m.name, 'Ед. изм.': m.unit, 'Количество': m.quantity, 'Цена/ед.': m.unitCost || '', 'Партия': m.batch || '', 'Мин. остаток': m.minStock || '', 'Стоимость': (m.quantity * (m.unitCost || 0)) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Материалы');
    XLSX.writeFile(wb, `materials_${new Date().toISOString().slice(0,10)}.xlsx`);
    addToast('Экспорт завершён', 'success');
  }, [data.materials, addToast]);

  const lowStock = data.materials.filter(m => m.minStock > 0 && m.quantity <= m.minStock);
  const filtered = search ? data.materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase())) : data.materials;
  const totalValue = data.materials.reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0);

  return h('div', null,
    confirmEl,
    // Модал корректировки остатка
    adjustModal && h('div', { style: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 } },
      h('div', { style: { background:'#fff', borderRadius:14, padding:20, width:'min(360px, calc(100vw - 24px))', maxHeight:'85vh', overflowY:'auto' } },
        h('div', { style: { fontSize:15, fontWeight:500, marginBottom:4 } }, 'Корректировка: '+adjustModal.name),
        h('div', { style: { fontSize:12, color:'#888', marginBottom:16 } }, 'Текущий остаток: '+adjustModal.quantity+' '+adjustModal.unit),
        h('label', { style: S.lbl }, 'Новое количество'),
        h('input', { type:'number', min:0, step:'0.001', style: { ...S.inp, marginBottom:10 }, value: adjustForm.qty, onChange: e => setAdjustForm(p => ({ ...p, qty: e.target.value })) }),
        (() => {
          const newQty = parseFloat(adjustForm.qty);
          const diff = !isNaN(newQty) ? newQty - adjustModal.quantity : null;
          return diff !== null && diff !== 0 ? h('div', { style: { fontSize:12, color: diff > 0 ? GN2 : RD2, background: diff > 0 ? GN3 : '#FCEBEB', borderRadius:6, padding:'4px 10px', marginBottom:10 } },
            (diff > 0 ? '+' : '')+Math.round(diff*1000)/1000+' '+adjustModal.unit
          ) : null;
        })(),
        h('label', { style: S.lbl }, 'Причина корректировки *'),
        h('textarea', { style: { ...S.inp, marginBottom:10 }, rows:3, placeholder:'Инвентаризация, пересчёт, ошибка учёта...', value: adjustForm.comment, onChange: e => setAdjustForm(p => ({ ...p, comment: e.target.value })) }),
        adjustModal.adjustHistory?.length > 0 && h('div', { style: { marginBottom:12 } },
          h('div', { style: { fontSize:11, color:'#888', marginBottom:6 } }, 'История ('+adjustModal.adjustHistory.length+'):'),
          adjustModal.adjustHistory.slice(-3).reverse().map((h2, i) => h('div', { key:i, style: { fontSize:11, padding:'4px 8px', background:'#f8f8f5', borderRadius:6, marginBottom:4 } },
            h('div', { style: { display:'flex', justifyContent:'space-between' } },
              h('span', { style: { color: h2.diff >= 0 ? GN2 : RD2, fontWeight:500 } }, (h2.diff >= 0 ? '+' : '')+Math.round(h2.diff*1000)/1000+' -> '+h2.newQty),
              h('span', { style: { color:'#aaa' } }, new Date(h2.ts).toLocaleDateString())
            ),
            h('div', { style: { color:'#888', marginTop:2 } }, h2.comment)
          ))
        ),
        h('div', { style: { display:'flex', gap:8 } },
          h('button', { style: abtn({ flex:1 }), onClick: saveAdjust }, 'Сохранить'),
          h('button', { style: gbtn({ flex:1 }), onClick: () => setAdjustModal(null) }, 'Отмена')
        )
      )
    ),
    h(PasteImportWidget, { addToast, hint: 'Вставить материалы из Excel',
      columns: [
        { key: 'name',     label: 'Название',        required: true },
        { key: 'unit',     label: 'Ед. изм.',         required: false, default: 'шт' },
        { key: 'quantity', label: 'Количество',       required: false, default: '0' },
        { key: 'unitCost', label: 'Цена за ед. (₽)',  required: false, default: '' },
        { key: 'minStock', label: 'Мин. остаток',     required: false, default: '' },
      ],
      onImport: async (rows) => {
        const existing = new Set(data.materials.map(m => m.name.toLowerCase()));
        const items = rows.filter(r => r.name && !existing.has(r.name.toLowerCase()))
          .map(r => ({ id: uid(), name: r.name, unit: r.unit || 'шт',
            quantity: Number(r.quantity) || 0, unitCost: Number(r.unitCost) || 0,
            minStock: Number(r.minStock) || 0, batch: '' }));
        if (!items.length) { addToast('Все материалы уже существуют', 'info'); return; }
        const d = { ...data, materials: [...data.materials, ...items] };
        await DB.save(d); onUpdate(d); addToast(`Добавлено: ${items.length}`, 'success');
      }}),
    // Предупреждение о критических остатках
    lowStock.length > 0 && h('div', { role: 'alert', style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12 } },
      h('div', { style: { fontSize: 10, color: RD, textTransform: 'uppercase', fontWeight: 500, marginBottom: 6 } }, `⚠ Критические остатки (${lowStock.length})`),
      lowStock.map(m => h('div', { key: m.id, style: { fontSize: 12, color: RD2 } }, `${m.name}: ${m.quantity} ${m.unit} (мин. ${m.minStock})`))
    ),
    // Сводка
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 12 } },
      h(MC, { v: data.materials.length, l: 'Позиций', fs: 22 }),
      h(MC, { v: lowStock.length, l: 'Критично', c: RD, fs: 22 }),
      h(MC, { v: `${Math.round(totalValue).toLocaleString()}₽`, l: 'Стоимость склада', c: AM, fs: 18 })
    ),
    // Импорт / Экспорт
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
      h('button', { style: abtn(), onClick: () => document.getElementById('mat-import-xlsx').click() }, '📤 Импорт Excel'),
      h('input', { type: 'file', id: 'mat-import-xlsx', style: { display: 'none' }, accept: '.xlsx,.xls,.csv', onChange: importExcel }),
      h('button', { style: gbtn(), onClick: exportExcel }, '📥 Экспорт Excel'),
      h('input', { style: { ...S.inp, flex: 1, minWidth: 150 }, placeholder: 'Поиск материала...', value: search, onChange: e => setSearch(e.target.value) })
    ),
    // Форма
    h('div', { style: S.card },
      h('div', { style: S.sec }, editingId ? 'Редактировать' : 'Добавить материал'),
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('div', { style: { flex: 2, minWidth: 150 } }, h('input', { style: { ...S.inp }, placeholder: 'Название', value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }), fieldErrors.name && h('div', { className: 'error-message' }, fieldErrors.name)),
        h('div', { style: { flex: 1, minWidth: 60 } }, h('input', { style: { ...S.inp }, placeholder: 'Ед.', value: form.unit, onChange: e => setForm(p => ({ ...p, unit: e.target.value })) }), fieldErrors.unit && h('div', { className: 'error-message' }, fieldErrors.unit)),
        h('div', { style: { flex: 1, minWidth: 70 } }, h('input', { type: 'number', step: '0.01', style: { ...S.inp }, placeholder: 'Кол-во', value: form.quantity, onChange: e => setForm(p => ({ ...p, quantity: e.target.value })) }), fieldErrors.quantity && h('div', { className: 'error-message' }, fieldErrors.quantity)),
        h('div', { style: { flex: 1, minWidth: 70 } }, h('input', { type: 'number', style: { ...S.inp }, placeholder: 'Цена₽', value: form.unitCost, onChange: e => setForm(p => ({ ...p, unitCost: e.target.value })) })),
        h('div', { style: { flex: 1, minWidth: 70 } }, h('input', { type: 'number', style: { ...S.inp }, placeholder: 'Мин.ост.', value: form.minStock, onChange: e => setForm(p => ({ ...p, minStock: e.target.value })) })),
        h('div', { style: { flex: 1, minWidth: 80 } }, h('input', { style: { ...S.inp }, placeholder: 'Партия', value: form.batch, onChange: e => setForm(p => ({ ...p, batch: e.target.value })) })),
        h('button', { style: abtn(), onClick: addOrUpdate }, editingId ? '✓' : '+'),
        editingId && h('button', { style: gbtn(), onClick: resetForm }, '✕')
      ),
      h('div', { style: { fontSize: 10, color: '#888', marginTop: 6 } }, 'Excel: колонки «Название», «Ед. изм.», «Количество», «Цена/ед.», «Партия», «Мин. остаток». При совпадении названия — обновляет остаток.')
    ),
    // Панель пакетного удаления
    selectedIds.size > 0 && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(226,75,74,0.08)', border: `0.5px solid ${RD}`, borderRadius: 8, marginBottom: 8 } },
      h('span', { style: { fontSize: 13, color: RD, fontWeight: 500 } }, `Выбрано: ${selectedIds.size}`),
      h('button', { onClick: delSelected, style: { fontSize: 12, padding: '5px 14px', background: RD, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 } },
        `🗑 Удалить ${selectedIds.size} позиц.`),
      h('button', { onClick: () => setSelectedIds(new Set()), style: { fontSize: 12, padding: '5px 10px', background: 'transparent', border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer' } },
        'Снять выбор')
    ),
    // Таблица
    filtered.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Нет материалов') :
      h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null,
          h('th', { style: { ...S.th, width: 36 } },
            h('input', { type: 'checkbox', checked: selectedIds.size === filtered.length && filtered.length > 0, onChange: () => toggleAll(filtered),
              style: { width: 14, height: 14, cursor: 'pointer', accentColor: RD } })
          ),
          ['Название','Ед.','Остаток','Мин.','Цена','Стоимость','Партия',''].map((t,i) => h('th', { key: i, style: S.th }, t))
        )),
        h('tbody', null, filtered.map(m => {
          const isLow = m.minStock > 0 && m.quantity <= m.minStock;
          const isSel = selectedIds.has(m.id);
          return h('tr', { key: m.id, style: { background: isSel ? 'rgba(226,75,74,0.06)' : isLow ? RD3 : 'transparent', transition: 'background 0.1s' } },
            h('td', { style: { ...S.td, width: 36 } },
              h('input', { type: 'checkbox', checked: isSel, onChange: () => toggleSelect(m.id),
                style: { width: 14, height: 14, cursor: 'pointer', accentColor: RD } })
            ),
            h('td', { style: S.td }, m.name),
            h('td', { style: S.td }, m.unit),
            h('td', { style: { ...S.td, fontWeight: 500, color: isLow ? RD : 'inherit' } }, m.quantity),
            h('td', { style: { ...S.td, color: '#888' } }, m.minStock || '—'),
            h('td', { style: S.td }, m.unitCost ? `${m.unitCost}₽` : '—'),
            h('td', { style: { ...S.td, color: AM } }, m.unitCost ? `${Math.round(m.quantity * m.unitCost).toLocaleString()}₽` : '—'),
            h('td', { style: S.td }, m.batch || '—'),
            h('td', { style: S.td }, h('div', { style: { display: 'flex', gap: 4 } },
              h('button', { style: gbtn({ fontSize: 11, padding: '4px 8px' }), title: 'Скорректировать остаток', onClick: () => openAdjust(m) }, '±'),
              h('button', { style: gbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => edit(m) }, '✎'),
              h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => del(m.id) }, '✕')
            ))
          );
        }))
      )))
  );
});

// ==================== MasterBOM ====================
const MasterBOM = memo(({ data, onUpdate, addToast }) => {
  const [form, setForm] = useState({ productName: '', productType: '' });
  const { ask: askConfirm, confirmEl } = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [matForm, setMatForm] = useState({ bomId: '', materialId: '', qty: '' });
  const productTypes = data.settings?.productTypes || [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }];

  const add = useCallback(async () => {
    if (!form.productName.trim()) { addToast('Введите название изделия', 'error'); return; }
    const bom = { id: uid(), productName: form.productName.trim(), materials: [], productType: form.productType || undefined };
    const d = { ...data, bomTemplates: [...data.bomTemplates, bom] };
    await DB.save(d); onUpdate(d); setForm({ productName: '', productType: '' }); addToast('Спецификация создана', 'success');
  }, [data, form, onUpdate, addToast]);

  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить спецификацию?' }))) return;
    const d = { ...data, bomTemplates: data.bomTemplates.filter(b => b.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Удалена', 'info');
  }, [data, onUpdate, addToast]);

  const addMaterial = useCallback(async (bomId) => {
    const bid = bomId || matForm.bomId;
    if (!bid || !matForm.materialId || !matForm.qty || Number(matForm.qty) <= 0) { addToast('Заполните все поля', 'error'); return; }
    const d = { ...data, bomTemplates: data.bomTemplates.map(b => b.id === bid ? { ...b, materials: [...(b.materials || []), { materialId: matForm.materialId, qty: Number(matForm.qty) }] } : b) };
    await DB.save(d); onUpdate(d); setMatForm(p => ({ ...p, materialId: '', qty: '' })); addToast('Материал добавлен в спецификацию', 'success');
  }, [data, matForm, onUpdate, addToast]);

  const removeMaterial = useCallback(async (bomId, idx) => {
    const d = { ...data, bomTemplates: data.bomTemplates.map(b => b.id === bomId ? { ...b, materials: b.materials.filter((_, i) => i !== idx) } : b) };
    await DB.save(d); onUpdate(d);
  }, [data, onUpdate]);

  // Импорт BOM из Excel
  const importBOM = useCallback((event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws);
        if (rows.length === 0) { addToast('Файл пустой', 'error'); return; }
        // Группируем по изделию
        const grouped = {};
        rows.forEach(r => {
          const product = (r['Изделие'] || r['Продукт'] || r['Product'] || '').toString().trim();
          const matName = (r['Материал'] || r['Название'] || r['Material'] || '').toString().trim();
          const qty = Number(r['Количество'] || r['Кол-во'] || r['Qty'] || 0);
          if (!product || !matName) return;
          if (!grouped[product]) grouped[product] = [];
          // Найти materialId по имени
          const mat = data.materials.find(m => m.name.toLowerCase() === matName.toLowerCase());
          grouped[product].push({ materialId: mat?.id || null, materialName: matName, qty });
        });
        const newBoms = Object.entries(grouped).map(([productName, materials]) => {
          const existing = data.bomTemplates.find(b => b.productName.toLowerCase() === productName.toLowerCase());
          if (existing) return { ...existing, materials: materials.map(m => ({ materialId: m.materialId, qty: m.qty, _name: m.materialName })) };
          return { id: uid(), productName, materials: materials.map(m => ({ materialId: m.materialId, qty: m.qty, _name: m.materialName })) };
        });
        const existingIds = newBoms.filter(b => data.bomTemplates.some(db => db.id === b.id)).map(b => b.id);
        const updated = data.bomTemplates.map(b => { const upd = newBoms.find(nb => nb.id === b.id); return upd || b; });
        const brandNew = newBoms.filter(b => !existingIds.includes(b.id));
        const d = { ...data, bomTemplates: [...updated, ...brandNew] };
        DB.save(d).then(() => { onUpdate(d); addToast(`Импортировано: ${newBoms.length} спецификаций`, 'success'); });
      } catch(ex) { addToast('Ошибка чтения: ' + ex.message, 'error'); }
    };
    reader.readAsArrayBuffer(file); event.target.value = '';
  }, [data, onUpdate, addToast]);

  // Проверка остатков по BOM
  const checkStock = useCallback((bom, qty = 1) => {
    return (bom.materials || []).map(m => {
      const mat = data.materials.find(dm => dm.id === m.materialId);
      const need = m.qty * qty;
      const have = mat?.quantity || 0;
      return { name: mat?.name || m._name || '?', unit: mat?.unit || '', need, have, deficit: Math.max(0, need - have), ok: have >= need };
    });
  }, [data.materials]);

  return h('div', null,
    confirmEl,
    // Импорт
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 12 } },
      h('button', { style: abtn(), onClick: () => document.getElementById('bom-import-xlsx').click() }, '📤 Импорт BOM из Excel'),
      h('input', { type: 'file', id: 'bom-import-xlsx', style: { display: 'none' }, accept: '.xlsx,.xls,.csv', onChange: importBOM }),
      h('div', { style: { fontSize: 10, color: '#888', alignSelf: 'center' } }, 'Excel: колонки «Изделие», «Материал», «Количество»')
    ),
    // Создать
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Создать спецификацию'),
      h(PasteImportWidget, { addToast, hint: 'Вставить спецификации из Excel (Изделие | Материал | Кол-во | Ед.)',
        columns: [
          { key: 'productName', label: 'Изделие', required: true },
          { key: 'materialName', label: 'Материал', required: false, default: '' },
          { key: 'qty', label: 'Количество', required: false, default: '' },
          { key: 'unit', label: 'Ед. изм.', required: false, default: '' },
        ],
        onImport: async (rows) => {
          let updated = [...data.bomTemplates];
          let addedBom = 0, addedMat = 0;
          rows.forEach(r => {
            const pname = r.productName?.trim(); if (!pname) return;
            let bom = updated.find(b => b.productName.toLowerCase() === pname.toLowerCase());
            if (!bom) { bom = { id: uid(), productName: pname, materials: [] }; updated.push(bom); addedBom++; }
            if (r.materialName?.trim()) {
              const mat = data.materials.find(m => normStr(m.name) === normStr(r.materialName));
              if (mat) { bom.materials = [...(bom.materials||[]), { materialId: mat.id, qty: Number(r.qty)||1 }]; addedMat++; }
            }
          });
          const d = { ...data, bomTemplates: updated };
          await DB.save(d); onUpdate(d);
          addToast(`Спецификации: +${addedBom} изделий, +${addedMat} позиций материалов`, 'success');
        }}),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Название изделия (Котёл КВ-100...)', value: form.productName, onChange: e => setForm(p => ({ ...p, productName: e.target.value })), onKeyDown: e => e.key === 'Enter' && add() }),
        h('select', { style: { ...S.inp, width: 120 }, value: form.productType, onChange: e => setForm(p => ({ ...p, productType: e.target.value })) }, h('option', { value: '' }, 'Тип'), productTypes.map(pt => h('option', { key: pt.id, value: pt.id }, pt.label))),
        h('button', { style: abtn(), onClick: add }, '+ Создать')
      )
    ),
    // Спецификации
    data.bomTemplates.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888' } }, 'Нет спецификаций. Создайте или импортируйте из Excel.') :
      data.bomTemplates.map(bom => {
        const stock = checkStock(bom);
        const allOk = stock.every(s => s.ok);
        return h('div', { key: bom.id, style: { ...S.card, padding: 14 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
            h('div', null,
              h('span', { style: { fontSize: 15, fontWeight: 500 } }, bom.productName),
              h('span', { style: { marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 6, background: allOk ? GN3 : RD3, color: allOk ? GN2 : RD2 } }, allOk ? '✓ В наличии' : '⚠ Дефицит')
            ),
            h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => del(bom.id) }, '✕')
          ),
          // Материалы спецификации
          (bom.materials || []).length > 0 ? h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null, ['Материал', 'Нужно', 'На складе', 'Статус', ''].map((t, i) => h('th', { key: i, style: S.th }, t)))),
            h('tbody', null, stock.map((s, i) => h('tr', { key: i, style: { background: s.ok ? 'transparent' : RD3 } },
              h('td', { style: S.td }, s.name),
              h('td', { style: S.td }, `${s.need} ${s.unit}`),
              h('td', { style: S.td }, `${s.have} ${s.unit}`),
              h('td', { style: { ...S.td, color: s.ok ? GN : RD, fontWeight: 500 } }, s.ok ? '✓' : `−${s.deficit}`),
              h('td', { style: S.td }, h('button', { style: { background: 'none', border: 'none', color: RD, cursor: 'pointer' }, onClick: () => removeMaterial(bom.id, i) }, '×'))
            )))
          )) : h('div', { style: { fontSize: 12, color: '#888', marginBottom: 8 } }, 'Нет материалов. Добавьте ниже.'),
          // Добавить материал
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
            h('select', { style: { ...S.inp, flex: 2 }, value: matForm.bomId === bom.id ? matForm.materialId : '', onChange: e => setMatForm({ bomId: bom.id, materialId: e.target.value, qty: matForm.bomId === bom.id ? matForm.qty : '' }) },
              h('option', { value: '' }, '— материал —'),
              data.materials.map(m => h('option', { key: m.id, value: m.id }, `${m.name} (${m.quantity} ${m.unit})`))
            ),
            h('input', { type: 'number', step: '0.1', style: { ...S.inp, width: 80 }, placeholder: 'Кол-во', value: matForm.bomId === bom.id ? matForm.qty : '', onChange: e => setMatForm({ bomId: bom.id, materialId: matForm.bomId === bom.id ? matForm.materialId : '', qty: e.target.value }) }),
            h('button', { style: abtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => addMaterial(bom.id) }, '+')
          )
        );
      })
  );
});

// ==================== MasterTodayPlan (с автопересчётом и каскадными алертами) ====================
const MasterTodayPlan = memo(({ data }) => {
  const { plannedToday, nowTime, cascadeAlerts, delayedOrders } = useMemo(() => {
    const todayStart = new Date().setHours(0,0,0,0);
    const todayEnd = new Date().setHours(23,59,59,999);
    const nowTime = now();
    const plannedToday = data.ops
      .filter(op => op.plannedStartDate && op.plannedStartDate >= todayStart && op.plannedStartDate <= todayEnd && !op.archived)
      .sort((a,b) => a.plannedStartDate - b.plannedStartDate);

    // Каскадный анализ задержек
    const cascadeAlerts = [];
    const delayedOrders = new Set();
    // Для каждого заказа: если текущая операция задерживается → пересчитать последующие
    data.orders.filter(o => !o.archived).forEach(order => {
      const ops = data.ops.filter(op => op.orderId === order.id && !op.archived).sort((a, b) => (a.plannedStartDate || 0) - (b.plannedStartDate || 0));
      let accumulatedDelay = 0;
      ops.forEach((op, idx) => {
        if (op.status === 'in_progress' && op.plannedHours && op.startedAt) {
          const expectedEnd = op.startedAt + op.plannedHours * 3600000;
          if (nowTime > expectedEnd) {
            const delay = nowTime - expectedEnd;
            accumulatedDelay += delay;
          }
        }
        if (op.status === 'done' && op.finishedAt && op.plannedHours && op.startedAt) {
          const expectedEnd = op.startedAt + op.plannedHours * 3600000;
          if (op.finishedAt > expectedEnd) accumulatedDelay += (op.finishedAt - expectedEnd);
        }
      });
      if (accumulatedDelay > 1800000) { // > 30 минут
        delayedOrders.add(order.id);
        // Проверить дедлайн
        if (order.deadline) {
          const deadlineMs = new Date(order.deadline).getTime();
          const remainingOps = ops.filter(op => op.status !== 'done' && op.status !== 'defect');
          const remainingHours = remainingOps.reduce((s, op) => s + (op.plannedHours || 2), 0);
          const newExpectedEnd = nowTime + remainingHours * 3600000;
          if (newExpectedEnd > deadlineMs) {
            cascadeAlerts.push({
              orderId: order.id, orderNumber: order.number, delay: accumulatedDelay,
              deadline: order.deadline, expectedEnd: newExpectedEnd,
              overshoot: newExpectedEnd - deadlineMs,
              remainingOps: remainingOps.length
            });
          }
        }
      }
    });
    cascadeAlerts.sort((a, b) => a.overshoot - b.overshoot);
    return { plannedToday, nowTime, cascadeAlerts, delayedOrders };
  }, [data.ops, data.orders]);

  return h('div', null,
    // Каскадные алерты
    cascadeAlerts.length > 0 && h('div', { role: 'alert', style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12 } },
      h('div', { style: { fontSize: 10, color: RD, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 } }, `⚠ Прогноз срыва дедлайна (${cascadeAlerts.length} заказов)`),
      cascadeAlerts.map(a => h('div', { key: a.orderId, style: { padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 12 } },
        h('div', { style: { fontWeight: 500, color: RD2 } }, `Заказ ${a.orderNumber}`),
        h('div', { style: { color: '#666', fontSize: 11 } },
          `Накопленная задержка: ${fmtDur(a.delay)} · Дедлайн: ${a.deadline} · `,
          h('span', { style: { fontWeight: 500, color: RD } }, `Опоздание: ~${fmtDur(a.overshoot)}`),
          ` · Осталось операций: ${a.remainingOps}`
        )
      ))
    ),

    // План на сегодня
    h('div', { style: { ...S.card, overflowX: 'auto' } },
      h('div', { style: S.sec }, `План на сегодня (${plannedToday.length})`),
      plannedToday.length === 0
        ? h('div', { style: { padding: 16, textAlign: 'center', color: '#888' } }, 'Нет запланированных операций на сегодня')
        : h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null, ['Заказ','Операция','Исполнитель','Плановое начало','Статус','Задержка'].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t)))),
            h('tbody', null, plannedToday.map(op => {
              const order = data.orders.find(o => o.id === op.orderId);
              const workerNames = op.workerIds?.map(id => data.workers.find(w => w.id === id)?.name).filter(Boolean).join(', ') || '—';
              const overdue = !op.startedAt && op.plannedStartDate < nowTime;
              const delay = overdue ? nowTime - op.plannedStartDate : 0;
              const isDelayedOrder = delayedOrders.has(op.orderId);
              return h('tr', { key: op.id, style: { background: overdue ? RD3 : isDelayedOrder ? '#FFF8E1' : 'transparent' } },
                h('td', { style: { ...S.td, color: AM, fontWeight: 500 } }, order?.number || '—'),
                h('td', { style: S.td }, op.name),
                h('td', { style: S.td }, workerNames),
                h('td', { style: S.td }, new Date(op.plannedStartDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
                h('td', { style: S.td }, h(Badge, { st: op.status })),
                h('td', { style: { ...S.td, color: delay > 0 ? RD : GN, fontWeight: delay > 0 ? 500 : 400 } }, delay > 0 ? `+${fmtDur(delay)}` : '✓')
              );
            }))
          ))
    )
  );
});

// ==================== MasterNotifications ====================


const MasterNotifications = memo(({ data }) => {
  const notifications = useMemo(() => {
    const list = [];
    const nowTime = now();
    data.ops.forEach(op => {
      if (op.status === 'pending' && op.plannedStartDate && op.plannedStartDate < nowTime - 3600000) {
        const order = data.orders.find(o => o.id === op.orderId);
        list.push({ id: `overdue-${op.id}`, type: 'overdue', message: `Операция "${op.name}" (заказ ${order?.number}) не начата более часа` });
      }
    });
    const recentDowntimes = data.events.filter(e => e.type === 'downtime' && e.ts > nowTime - 1800000);
    recentDowntimes.forEach(e => {
      const worker = data.workers.find(w => w.id === e.workerId);
      const reason = data.downtimeTypes.find(d => d.id === e.downtimeTypeId)?.name;
      list.push({ id: `downtime-${e.id}`, type: 'downtime', message: `Простой: ${worker?.name} — ${reason}` });
    });
    data.orders.forEach(order => {
      if (isShipmentNear(order.deadline) && !order.archived) list.push({ id: `deadline-${order.id}`, type: 'deadline', message: `Заказ ${order.number} близок к дате отгрузки` });
    });
    return list.slice(0, 10);
  }, [data]);
  return h('div', { style: { ...S.card, marginBottom: 12 } },
    h('div', { style: { ...S.sec, display: 'flex', alignItems: 'center' } },
      'Уведомления',
      notifications.length > 0 && h('span', { className: 'notification-badge', 'aria-label': `${notifications.length} уведомлений` }, notifications.length)
    ),
    notifications.length === 0
      ? h('div', { style: { padding: 8, color: '#888' } }, 'Нет новых уведомлений')
      : notifications.map(n => h('div', { key: n.id, style: { padding: '6px 0', borderBottom: '0.5px solid #eee', fontSize: 12, color: n.type === 'overdue' ? RD : (n.type === 'deadline' ? AM : '#333') } }, n.message))
  );
});

// ==================== MasterProductionStages ====================
const MasterProductionStages = memo(({ data, onUpdate, addToast }) => {
  const [newName, setNewName] = useState('');
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [editingMaterials, setEditingMaterials] = useState(null);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [stageType, setStageType] = useState('boiler');
  const { ask: askConfirm, confirmEl } = useConfirm();

  const toggleStageMaterial = async (stageId, matId) => {
    const stage = (data.productionStages || []).find(s => s.id === stageId);
    if (!stage) return;
    const current = stage.requiredMaterialIds || [];
    const updated = current.includes(matId) ? current.filter(id => id !== matId) : [...current, matId];
    const d = { ...data, productionStages: data.productionStages.map(s => s.id === stageId ? { ...s, requiredMaterialIds: updated } : s) };
    await DB.save(d); onUpdate(d);
  };
  const productTypes = data.settings?.productTypes || [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }];
  const allStages = data.productionStages || [];
  const typeStages = allStages.filter(s => s.productType === stageType);

  const addStage = async () => {
    if (!newName.trim()) return;
    const newStage = { id: uid(), name: newName.trim(), checklist: [], productType: stageType };
    const d = { ...data, productionStages: [...allStages, newStage] };
    await DB.save(d); onUpdate(d); setNewName(''); addToast('Этап добавлен', 'success');
  };
  const deleteStage = async (id) => {
    if (!(await askConfirm({ message: 'Удалить этап?' }))) return;
    const d = { ...data, productionStages: allStages.filter(s => s.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Этап удалён', 'info');
  };
  const moveUp = (index) => {
    if (index === 0) return;
    const n = [...typeStages]; [n[index-1], n[index]] = [n[index], n[index-1]];
    const other = allStages.filter(s => s.productType !== stageType);
    const d = { ...data, productionStages: [...other, ...n] }; DB.save(d).then(() => onUpdate(d));
  };
  const moveDown = (index) => {
    if (index === typeStages.length-1) return;
    const n = [...typeStages]; [n[index], n[index+1]] = [n[index+1], n[index]];
    const other = allStages.filter(s => s.productType !== stageType);
    const d = { ...data, productionStages: [...other, ...n] }; DB.save(d).then(() => onUpdate(d));
  };
  const saveStageDefaults = async (stageId, defaults) => {
    const d = { ...data, productionStages: allStages.map(s => s.id === stageId ? { ...s, ...defaults } : s) };
    await DB.save(d); onUpdate(d); addToast('Настройки этапа сохранены', 'success');
  };

  const addCheckItem = async (stageId) => {
    if (!newCheckItem.trim()) return;
    const d = { ...data, productionStages: allStages.map(s => s.id === stageId ? { ...s, checklist: [...(s.checklist || []), newCheckItem.trim()] } : s) };
    await DB.save(d); onUpdate(d); setNewCheckItem('');
  };
  const removeCheckItem = async (stageId, idx) => {
    const d = { ...data, productionStages: allStages.map(s => s.id === stageId ? { ...s, checklist: (s.checklist || []).filter((_, i) => i !== idx) } : s) };
    await DB.save(d); onUpdate(d);
  };
  return h('div', null,
    confirmEl,
    // Вкладки типов продукции
    h('div', { style: { display: 'flex', gap: 4, marginBottom: 12 } },
      productTypes.map(pt => h('button', { key: pt.id, style: stageType === pt.id ? abtn({ fontSize: 12, padding: '6px 14px' }) : gbtn({ fontSize: 12, padding: '6px 14px' }), onClick: () => setStageType(pt.id) }, pt.label + ` (${allStages.filter(s => s.productType === pt.id).length})`))
    ),
    h(PasteImportWidget, { addToast, hint: 'Вставить этапы из Excel',
      columns: [{ key: 'name', label: 'Название этапа', required: true }],
      onImport: async (rows) => {
        const existing = new Set(allStages.map(s=>s.name.toLowerCase()));
        const items = rows.filter(r=>r.name&&!existing.has(r.name.toLowerCase())).map(r=>({id:uid(),name:r.name,checklist:[],productType:stageType}));
        if(!items.length){addToast('Все этапы уже существуют','info');return;}
        const d={...data,productionStages:[...allStages,...items]};
        await DB.save(d);onUpdate(d);addToast(`Добавлено: ${items.length}`,'success');
      }}),
    h('div', { style: S.card },
      h('div', { style: S.sec }, `Добавить этап · ${productTypes.find(p => p.id === stageType)?.label || stageType}`),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Название этапа', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => e.key === 'Enter' && addStage() }),
        h('button', { style: abtn(), onClick: addStage }, '+ Добавить')
      )
    ),
    h('div', { style: S.card },
      h('div', { style: S.sec }, `Этапы · ${productTypes.find(p => p.id === stageType)?.label || stageType} (${typeStages.length})`),
      typeStages.length === 0
        ? h('div', { style: { padding: 16, textAlign: 'center', color: '#888' } }, 'Нет этапов для этого типа продукции. Добавьте выше.')
        : typeStages.map((stage, index) =>
            h('div', { key: stage.id, style: { padding: '8px 0', borderBottom: '0.5px solid #eee' } },
              h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                  h('span', { style: { fontSize: 13, fontWeight: 500 } }, stage.name),
                  (stage.checklist?.length > 0) && h('span', { style: { fontSize: 10, color: AM, background: AM3, padding: '1px 6px', borderRadius: 6 } }, `${stage.checklist.length} пунктов`),
                  (stage.requiredMaterialIds?.length > 0) && h('span', { style: { fontSize: 10, color: GN2, background: GN3, padding: '1px 6px', borderRadius: 6 } }, `📦 ${stage.requiredMaterialIds.length} материала`)
                ),
                h('div', { style: { display: 'flex', gap: 4 } },
                  h('button', { style: gbtn({ fontSize: 10, padding: '4px 6px' }), onClick: () => setEditingChecklist(editingChecklist === stage.id ? null : stage.id) }, editingChecklist === stage.id ? '▾ Чек-лист' : '▸ Чек-лист'),
                  h('button', { style: { ...gbtn({ fontSize: 10, padding: '4px 6px' }), ...(stage.requiredMaterialIds?.length > 0 ? { color: GN2, borderColor: GN } : {}) }, onClick: () => setEditingMaterials(editingMaterials === stage.id ? null : stage.id) }, editingMaterials === stage.id ? '▾ Материалы' : `▸ Материалы${stage.requiredMaterialIds?.length ? ` (${stage.requiredMaterialIds.length})` : ''}`),
                  h('button', { style: { ...gbtn({ fontSize: 10, padding: '4px 6px' }), ...(stage.sectionId || stage.equipmentId || stage.plannedHours || stage.drawingUrl ? { color: AM2, borderColor: AM } : {}) }, onClick: () => setEditingDefaults(editingDefaults === stage.id ? null : stage.id) }, editingDefaults === stage.id ? '▾ Настройки' : `▸ Настройки${stage.sectionId || stage.equipmentId || stage.plannedHours || stage.drawingUrl ? ' ●' : ''}`),
                  h('button', { style: gbtn({ fontSize: 11, padding: '4px 6px' }), onClick: () => moveUp(index), disabled: index === 0 }, '↑'),
                  h('button', { style: gbtn({ fontSize: 11, padding: '4px 6px' }), onClick: () => moveDown(index), disabled: index === (data.productionStages || []).length-1 }, '↓'),
                  h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), onClick: () => deleteStage(stage.id) }, '✕')
                )
              ),
              // Редактор материалов
              editingMaterials === stage.id && h('div', { style: { marginTop: 8, padding: '10px 12px', background: '#f0f8f0', borderRadius: 8, border: `1px solid ${GN}` } },
                h('div', { style: { fontSize: 10, color: GN2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontWeight: 500 } }, '📦 Материалы необходимые для начала этого этапа'),
                h('div', { style: { fontSize: 11, color: '#666', marginBottom: 8 } }, 'Отмеченные материалы должны поступить на склад прежде чем операция станет доступна рабочему'),
                (data.materials || []).length === 0
                  ? h('div', { style: { fontSize: 12, color: '#888', padding: 8 } }, 'Нет материалов в справочнике. Сначала добавьте материалы в раздел Материалы.')
                  : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 } },
                      (data.materials || []).map(mat => {
                        const checked = (stage.requiredMaterialIds || []).includes(mat.id);
                        return h('label', { key: mat.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6, background: checked ? GN3 : '#fff', border: `1px solid ${checked ? GN : '#ddd'}`, cursor: 'pointer', fontSize: 12 } },
                          h('input', { type: 'checkbox', checked, onChange: () => toggleStageMaterial(stage.id, mat.id), style: { width: 16, height: 16, accentColor: GN, cursor: 'pointer' } }),
                          h('div', null,
                            h('div', { style: { fontWeight: checked ? 500 : 400, color: checked ? GN2 : '#333' } }, mat.name),
                            mat.unit && h('div', { style: { fontSize: 10, color: '#888' } }, mat.unit)
                          )
                        );
                      })
                    )
              ),

              // Редактор настроек этапа (участок, оборудование, норма, чертёж)
              editingDefaults === stage.id && h(StageDefaultsEditor, {
                key: stage.id,
                stage,
                data,
                onSave: (defaults) => { saveStageDefaults(stage.id, defaults); setEditingDefaults(null); },
                onClose: () => setEditingDefaults(null),
              }),

              // Редактор чек-листа
              editingChecklist === stage.id && h('div', { style: { marginTop: 8, padding: '10px 12px', background: '#f8f8f5', borderRadius: 8 } },
                h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 } }, 'Чек-лист (при запуске операции копируется рабочему)'),
                (stage.checklist || []).map((item, idx) =>
                  h('div', { key: idx, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 } },
                    h('span', { style: { color: '#888', fontSize: 10, width: 16 } }, `${idx + 1}.`),
                    h('span', { style: { flex: 1 } }, item),
                    h('span', { style: { cursor: 'pointer', color: RD, fontSize: 14 }, onClick: () => removeCheckItem(stage.id, idx) }, '×')
                  )
                ),
                h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
                  h('input', { style: { ...S.inp, flex: 1, fontSize: 12 }, placeholder: 'Новый пункт проверки...', value: newCheckItem, onChange: e => setNewCheckItem(e.target.value), onKeyDown: e => e.key === 'Enter' && addCheckItem(stage.id) }),
                  h('button', { style: abtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => addCheckItem(stage.id) }, '+')
                ),
                (stage.checklist || []).length === 0 && h('div', { style: { fontSize: 11, color: '#888', padding: 4 } }, 'Нет пунктов. Добавьте пункты проверки для этого этапа.')
              )
            )
          )
    )
  );
});

// ==================== StageDefaultsEditor ====================
// Встроенный редактор настроек этапа: участок, оборудование, норма, чертёж
const StageDefaultsEditor = memo(({ stage, data, onSave, onClose }) => {
  const [form, setForm] = useState({
    sectionId:    stage.sectionId    || '',
    equipmentId:  stage.equipmentId  || '',
    plannedHours: stage.plannedHours ? String(stage.plannedHours) : '',
    drawingUrl:   stage.drawingUrl   || '',
  });

  const handleSave = () => {
    onSave({
      sectionId:    form.sectionId    || null,
      equipmentId:  form.equipmentId  || null,
      plannedHours: form.plannedHours ? Number(form.plannedHours) : null,
      drawingUrl:   form.drawingUrl.trim() || null,
    });
  };

  const sectionName  = form.sectionId   ? (data.sections  || []).find(s => s.id === form.sectionId)?.name   : null;
  const equipName    = form.equipmentId ? (data.equipment || []).find(e => e.id === form.equipmentId)?.name  : null;

  return h('div', { style: { marginTop: 8, padding: '12px 14px', background: AM3, borderRadius: 8, border: `0.5px solid ${AM4}` } },
    h('div', { style: { fontSize: 10, color: AM2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600 } },
      '⚙ Настройки по умолчанию — подставляются во все новые операции этого этапа'
    ),
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 } },
      // Участок
      h('div', null,
        h('div', { style: { fontSize: 10, color: AM2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 } }, 'Участок'),
        h('select', {
          style: { ...S.inp, width: '100%', fontSize: 12 },
          value: form.sectionId,
          onChange: e => setForm(p => ({ ...p, sectionId: e.target.value }))
        },
          h('option', { value: '' }, '— не задан —'),
          (data.sections || []).map(s => h('option', { key: s.id, value: s.id }, s.name))
        ),
        sectionName && h('div', { style: { fontSize: 10, color: AM4, marginTop: 2 } }, `✓ ${sectionName}`)
      ),
      // Оборудование
      h('div', null,
        h('div', { style: { fontSize: 10, color: AM2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 } }, 'Оборудование'),
        h('select', {
          style: { ...S.inp, width: '100%', fontSize: 12 },
          value: form.equipmentId,
          onChange: e => setForm(p => ({ ...p, equipmentId: e.target.value }))
        },
          h('option', { value: '' }, '— не задано —'),
          (data.equipment || []).map(eq => h('option', { key: eq.id, value: eq.id }, eq.name))
        ),
        equipName && h('div', { style: { fontSize: 10, color: AM4, marginTop: 2 } }, `✓ ${equipName}`)
      ),
      // Норма времени
      h('div', null,
        h('div', { style: { fontSize: 10, color: AM2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 } }, 'Норма времени, ч'),
        h('input', {
          type: 'number', step: '0.5', min: '0',
          style: { ...S.inp, width: '100%', fontSize: 12 },
          placeholder: 'напр. 2.5',
          value: form.plannedHours,
          onChange: e => setForm(p => ({ ...p, plannedHours: e.target.value }))
        })
      ),
      // Ссылка на чертёж
      h('div', null,
        h('div', { style: { fontSize: 10, color: AM2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontWeight: 500 } }, 'Ссылка на чертёж / инструкцию'),
        h('input', {
          type: 'text',
          style: { ...S.inp, width: '100%', fontSize: 12 },
          placeholder: 'https://...',
          value: form.drawingUrl,
          onChange: e => setForm(p => ({ ...p, drawingUrl: e.target.value }))
        }),
        form.drawingUrl && h('a', { href: form.drawingUrl, target: '_blank', rel: 'noopener', style: { fontSize: 10, color: BL, marginTop: 2, display: 'block' } }, '📐 Открыть ссылку')
      )
    ),
    h('div', { style: { display: 'flex', gap: 6 } },
      h('button', { style: abtn({ fontSize: 11, padding: '5px 12px' }), onClick: handleSave }, '✓ Сохранить'),
      h('button', { style: gbtn({ fontSize: 11, padding: '5px 12px' }), onClick: onClose }, 'Отмена')
    )
  );
});

// ==================== MasterDefectReasons ====================
const MasterDefectReasons = memo(({ data, onUpdate, addToast }) => {
  const [newName, setNewName] = useState('');
  const { confirmEl, askConfirm } = useConfirm();
  const add = useCallback(async () => {
    if (!newName.trim()) return;
    if (data.defectReasons.some(r => r.name.toLowerCase() === newName.trim().toLowerCase())) { addToast('Такая причина уже существует', 'error'); return; }
    const newReason = { id: uid(), name: newName.trim() };
    const d = { ...data, defectReasons: [...(data.defectReasons || []), newReason] };
    await DB.save(d); onUpdate(d); setNewName(''); addToast('Причина брака добавлена', 'success');
  }, [data, newName, onUpdate, addToast]);
  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить причину брака?' }))) return;
    if (data.ops.some(op => op.defectReasonId === id)) { addToast('Нельзя удалить причину, уже использованную', 'error'); return; }
    const d = { ...data, defectReasons: (data.defectReasons || []).filter(r => r.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Причина удалена', 'info');
  }, [data, onUpdate, addToast]);
  return h('div', null,
    confirmEl,
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Добавить причину брака'),
      h(PasteImportWidget, { addToast, hint: 'Вставить причины брака из Excel',
        columns: [{ key: 'name', label: 'Причина брака', required: true }],
        onImport: async (rows) => {
          const existing = new Set((data.defectReasons||[]).map(s=>s.name.toLowerCase()));
          const items = rows.filter(r=>r.name&&!existing.has(r.name.toLowerCase())).map(r=>({id:uid(),name:r.name}));
          if(!items.length){addToast('Все причины уже существуют','info');return;}
          const d={...data,defectReasons:[...(data.defectReasons||[]),...items]};
          await DB.save(d);onUpdate(d);addToast(`Добавлено: ${items.length}`,'success');
        }}),
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', { style: { ...S.inp, flex: 1 }, placeholder: 'Нарушение технологии, дефект материала...', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => e.key === 'Enter' && add() }),
        h('button', { style: abtn(), onClick: add }, '+ Добавить')
      )
    ),
    (data.defectReasons || []).length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center' } }, 'Нет причин брака')
      : h('div', { style: { ...S.card } }, (data.defectReasons || []).map(r =>
          h('div', { key: r.id, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
            h('span', { style: { fontSize: 13 } }, r.name),
            h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': `Удалить причину ${r.name}`, onClick: () => del(r.id) }, 'Удалить')
          )
        ))
  );
});

// ==================== MasterOps ====================


// ==================== MasterDowntimes ====================
const MasterDowntimes = memo(({ data, onUpdate, addToast }) => {
  const [newName, setNewName] = useState('');
  const { ask: askConfirm, confirmEl } = useConfirm();
  const add = useCallback(async () => {
    if (!newName.trim()) return;
    if (data.downtimeTypes.some(d => d.name.toLowerCase() === newName.trim().toLowerCase())) { addToast('Такая причина уже существует', 'error'); return; }
    const newType = { id: uid(), name: newName.trim() };
    const d = { ...data, downtimeTypes: [...data.downtimeTypes, newType] };
    await DB.save(d); onUpdate(d); setNewName(''); addToast('Причина простоя добавлена', 'success');
  }, [data, newName, onUpdate, addToast]);
  const del = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить причину простоя?' }))) return;
    if (data.events.some(e => e.downtimeTypeId === id)) { addToast('Нельзя удалить причину, уже использованную', 'error'); return; }
    const d = { ...data, downtimeTypes: data.downtimeTypes.filter(dt => dt.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Причина удалена', 'info');
  }, [data, onUpdate, addToast]);
  return h('div', null,
    confirmEl,
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Добавить причину простоя'),
      h(PasteImportWidget, { addToast, hint: 'Вставить причины простоя из Excel',
        columns: [{ key: 'name', label: 'Причина простоя', required: true }],
        onImport: async (rows) => {
          const existing = new Set(data.downtimeTypes.map(s=>s.name.toLowerCase()));
          const items = rows.filter(r=>r.name&&!existing.has(r.name.toLowerCase())).map(r=>({id:uid(),name:r.name}));
          if(!items.length){addToast('Все причины уже существуют','info');return;}
          const d={...data,downtimeTypes:[...data.downtimeTypes,...items]};
          await DB.save(d);onUpdate(d);addToast(`Добавлено: ${items.length}`,'success');
        }}),
      h('div', { style: { display:'flex', gap:8 } },
        h('input', { style: { ...S.inp, flex:1 }, placeholder: 'Нет материала, поломка...', value: newName, onChange: e => setNewName(e.target.value), onKeyDown: e => e.key === 'Enter' && add() }),
        h('button', { type:'button', style: abtn(), onClick: add }, '+ Добавить')
      )
    ),
    data.downtimeTypes.length === 0
      ? h('div', { style: { ...S.card, textAlign:'center', padding:32 } }, 'Нет причин простоев')
      : h('div', { style: { ...S.card } }, data.downtimeTypes.map(dt =>
          h('div', { key: dt.id, style: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' } },
            h('span', { style: { fontSize:13 } }, dt.name),
            h('button', { style: rbtn({ fontSize:11, padding:'4px 8px' }), 'aria-label': `Удалить ${dt.name}`, onClick: () => del(dt.id) }, 'Удалить')
          )
        ))
  );
});

// ==================== MasterAdmin ====================
// ==================== ArchiveViewer ====================
const ArchiveViewer = memo(({ data }) => {
  const [months, setMonths]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [archive, setArchive]   = useState(null);
  const [open, setOpen]         = useState(false);

  const loadMonths = useCallback(async () => {
    setLoading(true);
    const ms = await DB.listArchiveMonths();
    setMonths(ms);
    setLoading(false);
  }, []);

  const loadMonth = useCallback(async (month) => {
    setSelected(month);
    setArchive(null);
    const d = await DB.loadArchive(month);
    setArchive(d);
  }, []);

  if (!open) return h('div', { style: { ...S.card, marginBottom: 12, cursor: 'pointer' }, onClick: () => { setOpen(true); loadMonths(); } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('div', null,
        h('div', { style: S.sec }, '📦 Архив заказов'),
        h('div', { style: { fontSize: 11, color: '#888' } }, 'Заказы старше 90 дней переносятся в архив автоматически')
      ),
      h('span', { style: { fontSize: 12, color: AM4 } }, 'Открыть →')
    )
  );

  return h('div', { style: { ...S.card, marginBottom: 12 } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
      h('div', { style: S.sec }, '📦 Архив заказов'),
      h('button', { style: gbtn({ fontSize: 11 }), onClick: () => setOpen(false) }, '× Закрыть')
    ),
    loading && h('div', { style: { fontSize: 12, color: '#888', textAlign: 'center', padding: 12 } }, 'Загрузка...'),
    months.length === 0 && !loading && h('div', { style: { fontSize: 12, color: '#888', textAlign: 'center', padding: 12 } }, 'Архивных данных нет'),
    months.length > 0 && h('div', null,
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
        months.map(m => h('button', { key: m,
          style: selected === m ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }),
          onClick: () => loadMonth(m)
        }, m))
      ),
      archive && h('div', null,
        h('div', { style: { fontSize: 11, color: '#888', marginBottom: 8 } },
          `${archive.orders?.length || 0} заказов · ${archive.ops?.length || 0} операций`
        ),
        h('div', { className: 'table-responsive' },
          h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null,
              ['Номер','Изделие','Операций','Статус'].map(t => h('th', { key: t, style: S.th }, t))
            )),
            h('tbody', null, (archive.orders || []).map(o => {
              const ops = (archive.ops || []).filter(op => op.orderId === o.id);
              return h('tr', { key: o.id },
                h('td', { style: S.td }, o.number || '—'),
                h('td', { style: S.td }, o.product || '—'),
                h('td', { style: S.td }, ops.length),
                h('td', { style: S.td }, h('span', { style: { fontSize: 10, padding: '2px 8px', borderRadius: 6, background: GN3, color: GN2 } }, 'Архив'))
              );
            }))
          )
        )
      )
    )
  );
});

// ==================== Storage Monitor ====================
const StorageMonitor = memo(({ data, addToast }) => {
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  // Вычисляем размер БД
  const getPayloadSize = (obj) => JSON.stringify(obj).length;
  const payloadSize = useMemo(() => getPayloadSize(data), [data]);
  const sizeKb = Math.round(payloadSize / 1024);
  const sizeMb = (sizeKb / 1024).toFixed(2);
  const percentFilled = Math.round(sizeKb / 1024 * 100); // 1MB = 1024KB
  const isCritical = percentFilled > 80;
  
  // Топ объектов по размеру
  const getTopObjects = useMemo(() => {
    const items = [
      { name: 'orders', size: getPayloadSize(data.orders || []) },
      { name: 'ops', size: getPayloadSize(data.ops || []) },
      { name: 'events', size: getPayloadSize(data.events || []) },
      { name: 'messages', size: getPayloadSize(data.messages || []) },
      { name: 'workers', size: getPayloadSize(data.workers || []) },
      { name: 'materials', size: getPayloadSize(data.materials || []) },
      { name: 'materialConsumptions', size: getPayloadSize(data.materialConsumptions || []) },
      { name: 'reclamations', size: getPayloadSize(data.reclamations || []) },
      { name: 'timesheet', size: getPayloadSize(data.timesheet || {}) },
    ].sort((a, b) => b.size - a.size).slice(0, 5);
    return items;
  }, [data]);
  
  // Проверка целостности
  const checkIntegrity = useMemo(() => {
    const issues = [];
    
    // Заказы без operations
    (data.orders || []).forEach(o => {
      if (!o.id) issues.push(`❌ Заказ без ID`);
      if (!Array.isArray(o.operationIds)) issues.push(`⚠️ Заказ ${o.id}: operationIds не массив`);
    });
    
    // Operations без заказа
    (data.ops || []).forEach(op => {
      const orderExists = data.orders?.find(o => o.id === op.orderId);
      if (!orderExists) issues.push(`⚠️ Операция ${op.id}: заказ ${op.orderId} не найден`);
    });
    
    // Workers без ID
    (data.workers || []).forEach(w => {
      if (!w.id) issues.push(`❌ Worker без ID: ${w.name}`);
    });
    
    return issues.length > 0 ? issues.slice(0, 10) : ['✅ Целостность OK'];
  }, [data]);
  
  // Дубликаты
  const findDuplicates = useMemo(() => {
    const dupMap = {};
    (data.events || []).forEach(e => {
      const key = `${e.type}:${e.workerId}:${e.ts}`;
      dupMap[key] = (dupMap[key] || 0) + 1;
    });
    return Object.entries(dupMap).filter(([k, v]) => v > 1).slice(0, 5);
  }, [data]);
  
  return h('div', null,
    h('div', { style: S.card },
      h('div', { style: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 } },
        h('div', { style: S.sec }, '💾 Мониторинг хранилища'),
        h('button', { style: gbtn({ fontSize:11, padding:'4px 12px' }), onClick: () => setShowAnalysis(v => !v) }, showAnalysis ? '▼ Закрыть' : '▶ Анализ')
      ),
      h('div', { style: { display:'flex', gap:16, marginBottom:12, flexWrap:'wrap' } },
        h('div', null,
          h('div', { style: { fontSize:10, color:'#888', textTransform:'uppercase', marginBottom:4 } }, 'Размер БД'),
          h('div', { style: { fontSize:20, fontWeight:700, color: isCritical ? '#d32f2f' : AM } }, `${sizeMb} МБ`),
          h('div', { style: { fontSize:10, color:'#888' } }, `${percentFilled}% заполнено`)
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('div', { style: { fontSize:10, color:'#888', textTransform:'uppercase', marginBottom:4 } }, 'Прогресс'),
          h('div', { style: { height:8, background:'#f0f0f0', borderRadius:4, overflow:'hidden' } },
            h('div', { style: { height:'100%', background: isCritical ? '#d32f2f' : AM, width:`${Math.min(percentFilled, 100)}%`, transition:'width 0.3s' } })
          ),
          isCritical && h('div', { style: { fontSize:11, color:'#d32f2f', marginTop:4, fontWeight:500 } }, '⚠️ Критичное заполнение! Старые данные будут архивированы.')
        )
      ),
      showAnalysis && h('div', null,
        h('div', { style: { marginBottom:12, padding:10, background:'#f8f8f5', borderRadius:8 } },
          h('div', { style: { fontSize:12, fontWeight:500, marginBottom:8, color:'#333' } }, 'Топ объектов по размеру:'),
          getTopObjects.map(item => h('div', { key:item.name, style: { fontSize:11, display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'0.5px solid rgba(0,0,0,0.05)' } },
            h('span', null, item.name),
            h('span', { style: { fontWeight:500, color:AM } }, `${Math.round(item.size / 1024)} КБ`)
          ))
        ),
        h('div', { style: { marginBottom:12, padding:10, background:'#fef8f5', borderRadius:8 } },
          h('div', { style: { fontSize:12, fontWeight:500, marginBottom:8, color:'#333' } }, 'Целостность данных:'),
          checkIntegrity.map((issue, i) => h('div', { key:i, style: { fontSize:11, padding:'3px 0', color: issue.startsWith('✅') ? '#2e7d32' : '#d32f2f', fontFamily:'monospace', wordBreak:'break-word' } }, issue))
        ),
        findDuplicates.length > 0 && h('div', { style: { padding:10, background:'#fff3e0', borderRadius:8 } },
          h('div', { style: { fontSize:12, fontWeight:500, marginBottom:8, color:'#333' } }, `⚠️ Найдено ${findDuplicates.length} дубликатов событий:`),
          findDuplicates.map(([key, count], i) => h('div', { key:i, style: { fontSize:10, padding:'2px 0', color:'#e65100' } }, `${key}: ${count}x`))
        )
      )
    )
  );
});

const MasterAdmin = memo(({ data, onUpdate, addToast }) => {
  const settings = data.settings || EMPTY_DATA.settings;
  // PIN-поля — всегда вводим новый, не показываем хеш
  const [masterPin, setMasterPin] = useState('');
  const [controllerPin, setControllerPin] = useState('');
  const [warehousePin, setWarehousePin] = useState('');
  const [pdoPin, setPdoPin] = useState('');
  const [directorPin, setDirectorPin] = useState('');
  const [hrPin, setHrPin] = useState('');
  const [shopMasterPin, setShopMasterPin] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [welcomeTitle, setWelcomeTitle] = useState(settings.welcomeTitle || 'teploros');
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(settings.welcomeSubtitle || 'надежная техника');
  const [welcomeLabel, setWelcomeLabel] = useState(settings.welcomeLabel || 'Производственный учёт · НТ');
  const [labelWidth, setLabelWidth] = useState(settings.labelWidth || 50);
  const [labelHeight, setLabelHeight] = useState(settings.labelHeight || 35);
  const [editPins, setEditPins] = useState({});

  const savePins = useCallback(async () => {
    // Собираем только заполненные поля — пустые означают «не менять»
    const updates = {};
    const pinFields = [
      ['masterPin', masterPin, 'PIN начальника цеха'],
      ['controllerPin', controllerPin, 'PIN контролёра'],
      ['warehousePin', warehousePin, 'PIN склада'],
      ['pdoPin', pdoPin, 'PIN ПДО'],
      ['directorPin', directorPin, 'PIN руководителя'],
      ['hrPin', hrPin, 'PIN HR'],
      ['shopMasterPin', shopMasterPin, 'PIN сменного мастера'],
      ['adminPin', adminPin, 'PIN администратора'],
    ];
    for (const [key, val, label] of pinFields) {
      if (val.trim()) {
        if (val.trim().length < 4) { addToast(`${label}: минимум 4 цифры`, 'error'); return; }
        const conflict = data.workers.find(w => pinMatch(val.trim(), w.pin));
        if (conflict) { addToast(`${label} совпадает с PIN сотрудника ${conflict.name}`, 'error'); return; }
        updates[key] = hashPin(val.trim());
      }
    }
    if (masterKey.trim()) {
      if (masterKey.trim().length < 4) { addToast('Мастер-ключ: минимум 4 символа', 'error'); return; }
      updates.masterKey = hashPin(masterKey.trim());
    }
    // Проверка на совпадение мастер и контролёр (если оба обновляются)
    const effMaster = updates.masterPin || settings.masterPin;
    const effController = updates.controllerPin || settings.controllerPin;
    if (masterPin.trim() && controllerPin.trim() && masterPin.trim() === controllerPin.trim()) {
      addToast('PIN мастера и контролёра должны отличаться', 'error'); return;
    }
    if (Object.keys(updates).length === 0) { addToast('Введите новые значения для обновления', 'info'); return; }
    const d = { ...data, settings: { ...settings, ...updates } };
    await DB.save(d); onUpdate(d);
    // Очищаем поля
    setMasterPin(''); setControllerPin(''); setWarehousePin('');
    setPdoPin(''); setDirectorPin(''); setHrPin('');
    setShopMasterPin(''); setAdminPin(''); setMasterKey('');
    addToast('PIN-коды обновлены', 'success');
  }, [data, settings, masterPin, controllerPin, warehousePin, pdoPin, directorPin, hrPin, shopMasterPin, adminPin, masterKey, onUpdate, addToast]);

  const saveWelcome = useCallback(async () => {
    const d = { ...data, settings: { ...settings, welcomeTitle: welcomeTitle.trim(), welcomeSubtitle: welcomeSubtitle.trim(), welcomeLabel: welcomeLabel.trim(), labelWidth: parseInt(labelWidth) || 50, labelHeight: parseInt(labelHeight) || 35 } };
    await DB.save(d); onUpdate(d); addToast('Текст главной страницы обновлён', 'success');
  }, [data, settings, welcomeTitle, welcomeSubtitle, welcomeLabel, onUpdate, addToast]);

  const genRandomPin = useCallback(async (workerId) => {
    let pin;
    do {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      // Проверяем что случайный PIN не совпадает ни с одним существующим
    } while (
      pinMatch(pin, settings.masterPin) || pinMatch(pin, settings.controllerPin) ||
      pinMatch(pin, settings.masterKey) || data.workers.some(w => w.id !== workerId && pinMatch(pin, w.pin))
    );
    const d = { ...data, workers: data.workers.map(w => w.id === workerId ? { ...w, pin: hashPin(pin) } : w) };
    await DB.save(d); onUpdate(d); addToast(`Новый PIN: ${pin}`, 'success');
  }, [data, settings, onUpdate, addToast]);

  const saveWorkerPin = useCallback(async (workerId, newPin) => {
    if (!newPin.trim() || newPin.trim().length < 4) { addToast('Минимум 4 цифры', 'error'); return; }
    // Проверяем что не совпадает с системными PIN
    if (pinMatch(newPin.trim(), settings.masterPin) || pinMatch(newPin.trim(), settings.controllerPin) || pinMatch(newPin.trim(), settings.masterKey)) {
      addToast('Этот PIN зарезервирован системой', 'error'); return;
    }
    const conflict = data.workers.find(w => w.id !== workerId && pinMatch(newPin.trim(), w.pin));
    if (conflict) { addToast(`PIN уже занят (${conflict.name})`, 'error'); return; }
    const d = { ...data, workers: data.workers.map(w => w.id === workerId ? { ...w, pin: hashPin(newPin.trim()) } : w) };
    await DB.save(d); onUpdate(d);
    setEditPins(prev => ({ ...prev, [workerId]: '' }));
    addToast('PIN изменён', 'success');
  }, [data, settings, onUpdate, addToast]);

  return h('div', null,
    h(ArchiveViewer, { data }),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'PIN-коды доступа'),
      h('div', { style: { background: '#fffbe6', border: '0.5px solid #f5c518', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#7a5900' } },
        '⚠ PIN мастера и контролёра не должны совпадать с PIN сотрудников. Мастер-ключ — аварийный сброс любого PIN, храните его в тайне.'
      ),
      h('div', { style: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 } },
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl, htmlFor: 'adminMasterPin' }, 'PIN начальника цеха'),
          h('input', { id:'adminMasterPin', type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: masterPin, maxLength: 8, onChange: e => setMasterPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl, htmlFor: 'adminControllerPin' }, 'PIN контролёра'),
          h('input', { id:'adminControllerPin', type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: controllerPin, maxLength: 8, onChange: e => setControllerPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN склада'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: warehousePin, maxLength: 8, onChange: e => setWarehousePin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN ПДО'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: pdoPin, maxLength: 8, onChange: e => setPdoPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN руководителя'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: directorPin, maxLength: 8, onChange: e => setDirectorPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN HR / Отдел кадров'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: hrPin, maxLength: 8, onChange: e => setHrPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN сменного мастера'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: shopMasterPin, maxLength: 8, onChange: e => setShopMasterPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'PIN администратора'),
          h('input', { type:'text', inputMode:'numeric', style: { ...S.inp, width:'100%', fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый PIN...', value: adminPin, maxLength: 8, onChange: e => setAdminPin(e.target.value) })
        ),
        h('div', { style: { flex:1, minWidth:150 } },
          h('label', { style: S.lbl }, 'Мастер-ключ (сброс любого PIN)'),
          h('div', { style: { display:'flex', gap:6 } },
            h('input', { type: showMasterKey ? 'text' : 'password', style: { ...S.inp, flex:1, fontFamily:'monospace', letterSpacing:'0.2em' }, placeholder: 'Новый ключ...', value: masterKey, maxLength: 8, onChange: e => setMasterKey(e.target.value) }),
            h('button', { style: gbtn({ fontSize:11, padding:'4px 8px' }), onClick: () => setShowMasterKey(v => !v), 'aria-label': 'Показать/скрыть мастер-ключ' }, showMasterKey ? '🙈' : '👁')
          )
        )
      ),
      h('button', { style: abtn(), onClick: savePins }, 'Сохранить PIN-коды'),
      h('div', { style: { fontSize: 10, color: '#888', marginTop: 6 } }, '💡 Заполняйте только те поля, которые хотите изменить. Пустые поля сохранят текущие значения.')
    ),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Текст главной страницы'),
      h('div', { style: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 } },
        h('div', { style: { flex:1, minWidth:180 } }, h('label', { style: S.lbl }, 'Заголовок'), h('input', { type:'text', style: { ...S.inp, width:'100%' }, value: welcomeTitle, onChange: e => setWelcomeTitle(e.target.value) })),
        h('div', { style: { flex:1, minWidth:180 } }, h('label', { style: S.lbl }, 'Подзаголовок'), h('input', { type:'text', style: { ...S.inp, width:'100%' }, value: welcomeSubtitle, onChange: e => setWelcomeSubtitle(e.target.value) })),
        h('div', { style: { flex:1, minWidth:180 } }, h('label', { style: S.lbl }, 'Метка'), h('input', { type:'text', style: { ...S.inp, width:'100%' }, value: welcomeLabel, onChange: e => setWelcomeLabel(e.target.value) }))
      ),
      h('div', { style: { ...S.card, background:'#f8f8f5', marginBottom:12, textAlign:'center' } },
        h('div', { style: { fontSize:10, color:'#888', marginBottom:8 } }, 'Предпросмотр:'),
        h('div', { style: { fontSize:24, fontWeight:700, color:AM } }, welcomeTitle),
        h('div', { style: { fontSize:12, color:'#888', letterSpacing:'0.15em', textTransform:'uppercase' } }, welcomeSubtitle),
        h('div', { style: { fontSize:10, color:AM4, textTransform:'uppercase', letterSpacing:'0.15em', marginTop:8 } }, welcomeLabel)
      ),
      h('button', { style: abtn(), onClick: saveWelcome }, 'Сохранить текст')
    ),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Размер этикетки (мм)'),
      h('div', { style: { display:'flex', gap:12, alignItems:'flex-end', marginBottom:8 } },
        h('div', { style: { flex:1 } }, h('label', { style: S.lbl }, 'Ширина'), h('input', { type:'number', min:20, max:150, style: { ...S.inp, width:'100%' }, value: labelWidth, onChange: e => setLabelWidth(e.target.value) })),
        h('div', { style: { flex:1 } }, h('label', { style: S.lbl }, 'Высота'), h('input', { type:'number', min:15, max:150, style: { ...S.inp, width:'100%' }, value: labelHeight, onChange: e => setLabelHeight(e.target.value) })),
        h('button', { style: abtn({ height:36 }), onClick: saveWelcome }, 'Сохранить')
      ),
      h('div', { style: { fontSize:11, color:'#888' } }, 'По умолчанию: 50 × 35. Применяется при печати QR-этикеток.')
    ),
    h(StorageMonitor, { data, addToast }),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Резервное копирование'),
      h('div', { style: { display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:8 } },
        h(BackupButton, { data }),
        h(RestoreButton, { onRestore: async (parsed, fileName) => {
          // Мастер-ключ для восстановления
          const masterKey = prompt('Введите мастер-ключ для восстановления данных:');
          if (!masterKey) return;
          if (!pinMatch(masterKey, data.settings?.masterKey)) {
            addToast('Неверный мастер-ключ', 'error');
            return;
          }
          const counts = `${parsed.orders?.length || 0} заказов · ${parsed.ops?.length || 0} операций · ${parsed.workers?.length || 0} сотрудников`;
          if (!(await askConfirm({ message: `Восстановить данные из "${fileName}"?`, detail: counts + '. Текущие данные будут заменены. Отменить нельзя.', danger: true }))) return;
          const withLog = logAction(parsed, 'data_restore', { fileName, counts });
          await DB.save(withLog); onUpdate(withLog);
          addToast('Данные восстановлены из резервной копии', 'success');
        }})
      ),
      h('div', { style: { fontSize:11, color:'#888' } }, 'Сохраните резервную копию перед чисткой или восстановлением. Восстановление требует мастер-ключ.')
    ),
    (() => {
      // Журнал действий админа — последние 20 записей
      const adminActions = (data.events || [])
        .filter(e => e.type === 'action' && ['data_restore', 'worker_archive', 'order_archive', 'cleanup_events', 'cleanup_archived', 'cleanup_messages'].includes(e.action))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 20);
      if (adminActions.length === 0) return null;
      const labels = {
        data_restore: '📥 Восстановление из копии',
        worker_archive: '👤 Архивация сотрудника',
        order_archive: '📦 Архивация заказа',
        cleanup_events: '🧹 Очистка событий',
        cleanup_messages: '💬 Очистка сообщений',
        cleanup_archived: '🗑 Удаление архива'
      };
      return h('div', { style: S.card },
        h('div', { style: S.sec }, `Журнал действий админа · последние ${adminActions.length}`),
        h('div', { style: { maxHeight: 240, overflowY: 'auto' } },
          adminActions.map(e => h('div', { key: e.id, style: { fontSize: 11, padding: '5px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', gap: 12 } },
            h('span', null, labels[e.action] || e.action, e.details?.counts ? ` · ${e.details.counts}` : e.details?.fileName ? ` · ${e.details.fileName}` : ''),
            h('span', { style: { color: '#888', whiteSpace: 'nowrap' } }, new Date(e.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))
          ))
        )
      );
    })(),
    (() => {
      const sizeBytes = JSON.stringify(data).length;
      const sizeKb = Math.round(sizeBytes / 1024);
      const limitKb = 1024;
      const pct = Math.round(sizeBytes / (limitKb * 1024) * 100);
      const pctColor = pct < 50 ? GN : pct < 80 ? AM : RD;
      const counts = {
        'Заказы': (data.orders || []).length,
        'Операции': (data.ops || []).length,
        'События': (data.events || []).length,
        'Материалы': (data.materials || []).length,
        'Рекламации': (data.reclamations || []).length,
        'Сообщения': (data.messages || []).length,
        'Сотрудники': (data.workers || []).length,
      };
      let cleanupEventsDays = 90;
      let cleanupMsgDays = 30;
      const cleanOldEvents = async () => {
        const days = cleanupEventsDays;
        const cutoff = Date.now() - days * 86400000;
        const kept = (data.events || []).filter(e => (e.ts || 0) >= cutoff);
        const removed = (data.events || []).length - kept.length;
        if (removed === 0) { addToast('Нечего удалять', 'info'); return; }
        if (!window.confirm(`Удалить ${removed} событий старше ${days} дней? Нельзя отменить.`)) return;
        let d = { ...data, events: kept };
        d = logAction(d, 'cleanup_events', { counts: `${removed} событий`, days });
        await DB.save(d); onUpdate(d);
        addToast(`Удалено ${removed} событий`, 'success');
      };
      const cleanOldMessages = async () => {
        const days = cleanupMsgDays;
        const cutoff = Date.now() - days * 86400000;
        const kept = (data.messages || []).filter(m => (m.ts || 0) >= cutoff);
        const removed = (data.messages || []).length - kept.length;
        if (removed === 0) { addToast('Нечего удалять', 'info'); return; }
        if (!window.confirm(`Удалить ${removed} сообщений старше ${days} дней?`)) return;
        let d = { ...data, messages: kept };
        d = logAction(d, 'cleanup_messages', { counts: `${removed} сообщений`, days });
        await DB.save(d); onUpdate(d);
        addToast(`Удалено ${removed} сообщений`, 'success');
      };
      const cleanArchived = async () => {
        const archived = (data.orders || []).filter(o => o.archived);
        if (archived.length === 0) { addToast('Нет архивных заказов', 'info'); return; }
        if (!window.confirm(`Удалить ${archived.length} архивных заказов вместе с операциями? Нельзя отменить.`)) return;
        const archivedIds = new Set(archived.map(o => o.id));
        let d = { ...data,
          orders: (data.orders || []).filter(o => !o.archived),
          ops: (data.ops || []).filter(o => !archivedIds.has(o.orderId))
        };
        d = logAction(d, 'cleanup_archived', { counts: `${archived.length} заказов` });
        await DB.save(d); onUpdate(d);
        addToast(`Удалено ${archived.length} заказов`, 'success');
      };
      const periodOpts = [7, 30, 60, 90, 180];
      return h('div', { style: S.card },
        h('div', { style: S.sec }, 'Служебное · диагностика данных'),
        h('div', { style: { marginBottom: 12 } },
          h('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 } },
            h('span', { style: { fontSize: 12, color: '#666' } }, `Занято: ${sizeKb} КБ из ${limitKb} КБ`),
            h('span', { style: { fontSize: 14, fontWeight: 500, color: pctColor } }, `${pct}%`)
          ),
          h('div', { style: { height: 8, background: '#eee', borderRadius: 4, overflow:'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.min(pct, 100)}%`, background: pctColor, transition: 'width 0.3s' } })
          )
        ),
        h('div', { style: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:8, marginBottom:12 } },
          Object.entries(counts).map(([k, v]) =>
            h('div', { key: k, style: { background: '#f8f8f5', borderRadius: 6, padding: '6px 10px' } },
              h('div', { style: { fontSize: 10, color: '#888' } }, k),
              h('div', { style: { fontSize: 16, fontWeight: 500 } }, v)
            )
          )
        ),
        // Очистка событий
        h('div', { style: { background: '#f8f8f5', borderRadius: 6, padding: 10, marginBottom: 8 } },
          h('div', { style: { fontSize: 11, color: '#888', marginBottom: 6 } }, 'Удалить события старше:'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('select', { defaultValue: '90', style: { ...S.inp, width: 100 }, onChange: e => { cleanupEventsDays = parseInt(e.target.value); } },
              periodOpts.map(d => h('option', { key: d, value: d }, `${d} дней`))
            ),
            h('button', { style: gbtn({ fontSize: 12 }), onClick: cleanOldEvents }, '🧹 Очистить')
          )
        ),
        // Очистка сообщений
        h('div', { style: { background: '#f8f8f5', borderRadius: 6, padding: 10, marginBottom: 8 } },
          h('div', { style: { fontSize: 11, color: '#888', marginBottom: 6 } }, 'Удалить сообщения чата старше:'),
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
            h('select', { defaultValue: '30', style: { ...S.inp, width: 100 }, onChange: e => { cleanupMsgDays = parseInt(e.target.value); } },
              periodOpts.map(d => h('option', { key: d, value: d }, `${d} дней`))
            ),
            h('button', { style: gbtn({ fontSize: 12 }), onClick: cleanOldMessages }, '💬 Очистить')
          )
        ),
        // Архивные заказы
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          h('button', { style: gbtn({ fontSize: 12 }), onClick: cleanArchived }, '🗑 Удалить архивные заказы'),
          h('button', { style: gbtn({ fontSize: 12 }), onClick: async () => {
            const hidden = (data.ops || []).filter(o => o.hiddenFromFeed);
            if (hidden.length === 0) { addToast('Нет скрытых операций', 'info'); return; }
            const d = { ...data, ops: data.ops.map(o => o.hiddenFromFeed ? { ...o, hiddenFromFeed: false } : o) };
            await DB.save(d); onUpdate(d);
            addToast(`Восстановлено ${hidden.length} скрытых операций`, 'success');
          }}, `👁 Показать скрытые операции (${(data.ops || []).filter(o => o.hiddenFromFeed).length})`),
          h('button', { style: gbtn({ fontSize: 12 }), onClick: async () => {
            const hidden = (data.ops || []).filter(o => o.hiddenFromFeed && o.status === 'done');
            if (hidden.length === 0) { addToast('Нет скрытых завершённых операций', 'info'); return; }
            if (!window.confirm(`Архивировать ${hidden.length} скрытых завершённых операций?`)) return;
            const ids = new Set(hidden.map(o => o.id));
            const d = { ...data, ops: data.ops.map(o => ids.has(o.id) ? { ...o, archived: true } : o) };
            await DB.save(d); onUpdate(d);
            addToast(`Архивировано ${hidden.length} операций`, 'info');
          }}, `📁 Архивировать скрытые`)
        )
      );
    })(),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Функции производства'),
      h('label', { style: { display:'flex', alignItems:'center', gap: 12, cursor:'pointer', padding: '8px 0' } },
        h('input', { type:'checkbox',
          checked: !!(data.settings?.materialTrackingEnabled),
          style: { width: 20, height: 20, accentColor: AM, flexShrink: 0 },
          onChange: async (e) => {
            const d = { ...data, settings: { ...(data.settings || {}), materialTrackingEnabled: e.target.checked } };
            await DB.save(d); onUpdate(d);
            addToast(e.target.checked ? 'Списание материалов включено' : 'Списание материалов отключено', 'success');
          }
        }),
        h('div', null,
          h('div', { style: { fontSize: 13, fontWeight: 500 } }, 'Запрашивать списание материалов после операции'),
          h('div', { style: { fontSize: 11, color: '#888', marginTop: 2 } }, 'Оператору будет предложено указать расход материалов при завершении каждой операции')
        )
      )
    ),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'PIN-коды сотрудников'),
      data.workers.length === 0
        ? h('div', { style: { fontSize:12, color:'#888', padding:8 } }, 'Нет сотрудников')
        : h('div', { className: 'table-responsive' }, h('table', { style: { width:'100%', borderCollapse:'collapse' } },
            h('thead', null, h('tr', null,
              ['Сотрудник','Текущий PIN','Новый PIN','Действия'].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t))
            )),
            h('tbody', null, data.workers.map(w =>
              h('tr', { key: w.id },
                h('td', { style: S.td }, w.name),
                h('td', { style: { ...S.td, fontFamily:'monospace', fontSize:14, fontWeight:500, letterSpacing:'0.2em' } },
                  w.pin
                    ? w.pin.startsWith('H_')
                      ? h('span', { title: 'PIN сохранён (захеширован). Введите новый для замены.' }, '••••')
                      : w.pin
                    : h('span', { style: { color: '#aaa', fontFamily: 'inherit', fontSize: 12, letterSpacing: 0 } }, 'не задан')
                ),
                h('td', { style: S.td },
                  h('input', {
                    type:'text', inputMode:'numeric',
                    style: { ...S.inp, width:100, fontFamily:'monospace', letterSpacing:'0.15em', fontSize:13 },
                    placeholder: 'Новый PIN', maxLength: 8,
                    value: editPins[w.id] || '',
                    onChange: e => setEditPins(prev => ({ ...prev, [w.id]: e.target.value })),
                    onKeyDown: e => e.key === 'Enter' && editPins[w.id] && saveWorkerPin(w.id, editPins[w.id])
                  })
                ),
                h('td', { style: S.td }, h('div', { style: { display:'flex', gap:4 } },
                  editPins[w.id] && h('button', {
                    style: abtn({ fontSize:11, padding:'4px 8px' }),
                    onClick: () => saveWorkerPin(w.id, editPins[w.id])
                  }, '✓'),
                  h('button', {
                    style: gbtn({ fontSize:11, padding:'4px 8px' }),
                    'aria-label': `Случайный PIN для ${w.name}`,
                    onClick: () => genRandomPin(w.id)
                  }, '🎲 Случайный')
                ))
              )
            ))
          ))
    ),
    // Настройка смен
    h(ShiftSettings, { data, onUpdate, addToast })
  );
});

// ==================== ShiftSettings ====================
const ShiftSettings = memo(({ data, onUpdate, addToast }) => {
  const shifts = data.settings?.shifts || [{ id: 1, name: 'Смена 1', start: 8, end: 17 }];
  const schedule = data.settings?.workSchedule || { type: '5/2', startDate: '', customPattern: [] };
  const [form, setForm] = useState({ name: '', start: '', end: '' });
  const [schedForm, setSchedForm] = useState({ type: schedule.type, startDate: schedule.startDate || '', customPattern: (schedule.customPattern || []).join(',') });

  const addShift = useCallback(async () => {
    if (!form.name.trim() || form.start === '' || form.end === '') { addToast('Заполните все поля смены', 'error'); return; }
    const newShift = { id: Date.now(), name: form.name.trim(), start: Number(form.start), end: Number(form.end) };
    const d = { ...data, settings: { ...data.settings, shifts: [...shifts, newShift] } };
    await DB.save(d); onUpdate(d); setForm({ name: '', start: '', end: '' }); addToast('Смена добавлена', 'success');
  }, [data, shifts, form, onUpdate, addToast]);

  const removeShift = useCallback(async (id) => {
    const d = { ...data, settings: { ...data.settings, shifts: shifts.filter(s => s.id !== id) } };
    await DB.save(d); onUpdate(d); addToast('Смена удалена', 'info');
  }, [data, shifts, onUpdate, addToast]);

  const saveSchedule = useCallback(async () => {
    const pattern = schedForm.type === 'custom'
      ? schedForm.customPattern.split(',').map(x => x.trim()).filter(Boolean).map(Number).filter(n => n === 0 || n === 1)
      : [];
    const ws = { type: schedForm.type, startDate: schedForm.startDate, customPattern: pattern };
    const d = { ...data, settings: { ...data.settings, workSchedule: ws } };
    await DB.save(d); onUpdate(d); addToast('График работы сохранён', 'success');
  }, [data, schedForm, onUpdate, addToast]);

  const SCHEDULE_TYPES = [
    { id: '5/2',    label: '5/2 — пятидневка (пн–пт)',        desc: 'Суббота и воскресенье выходные' },
    { id: '6/1',    label: '6/1 — шестидневка (пн–сб)',        desc: 'Только воскресенье выходной' },
    { id: '2/2',    label: '2/2 — два через два',              desc: 'Укажите дату начала отсчёта' },
    { id: '3/3',    label: '3/3 — три через три',              desc: 'Укажите дату начала отсчёта' },
    { id: '4/2',    label: '4/2 — четыре через два',           desc: 'Укажите дату начала отсчёта' },
    { id: 'custom', label: 'Свой график',                       desc: 'Задайте паттерн: 1=рабочий, 0=выходной (через запятую)' },
  ];

  return h('div', null,
    // График работы
    h('div', { style: { ...S.card, marginTop: 16 } },
      h('div', { style: S.sec }, 'График работы'),
      h('div', { style: { fontSize: 11, color: '#888', marginBottom: 12 } },
        'Определяет какие дни считаются выходными в табеле учёта рабочего времени'
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 } },
        SCHEDULE_TYPES.map(st => h('label', { key: st.id, style: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: schedForm.type === st.id ? AM3 : '#f8f8f5', border: `0.5px solid ${schedForm.type === st.id ? AM4 : 'rgba(0,0,0,0.08)'}`, cursor: 'pointer' } },
          h('input', { type: 'radio', name: 'schedtype', value: st.id, checked: schedForm.type === st.id, onChange: () => setSchedForm(p => ({ ...p, type: st.id })), style: { marginTop: 2, accentColor: AM } }),
          h('div', null,
            h('div', { style: { fontSize: 13, fontWeight: 500, color: schedForm.type === st.id ? AM2 : '#333' } }, st.label),
            h('div', { style: { fontSize: 11, color: '#888', marginTop: 1 } }, st.desc)
          )
        ))
      ),
      // Дата начала отсчёта для сменных графиков
      ['2/2','3/3','4/2','custom'].includes(schedForm.type) && h('div', { style: { marginBottom: 12 } },
        h('label', { style: S.lbl }, 'Дата начала отсчёта паттерна'),
        h('input', { type: 'date', style: { ...S.inp, maxWidth: 200 }, value: schedForm.startDate, onChange: e => setSchedForm(p => ({ ...p, startDate: e.target.value })) }),
        h('div', { style: { fontSize: 11, color: '#888', marginTop: 4 } }, 'С этой даты начинается цикл рабочих/выходных дней')
      ),
      // Свой паттерн
      schedForm.type === 'custom' && h('div', { style: { marginBottom: 12 } },
        h('label', { style: S.lbl }, 'Паттерн (1=рабочий, 0=выходной)'),
        h('input', { style: S.inp, placeholder: 'Пример: 1,1,1,1,0,0 — для 4/2', value: schedForm.customPattern, onChange: e => setSchedForm(p => ({ ...p, customPattern: e.target.value })) }),
        schedForm.customPattern && h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 } },
          schedForm.customPattern.split(',').map((v, i) => {
            const isWork = v.trim() === '1';
            return h('div', { key: i, style: { width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, background: isWork ? GN3 : '#f5f5f2', color: isWork ? GN2 : '#888', border: `0.5px solid ${isWork ? GN : 'rgba(0,0,0,0.1)'}` } }, i + 1);
          })
        )
      ),
      h('button', { style: abtn(), onClick: saveSchedule }, 'Сохранить график')
    ),

    // Смены (временные диапазоны)
    h('div', { style: { ...S.card, marginTop: 16 } },
      h('div', { style: S.sec }, 'Временные диапазоны смен'),
      h('div', { style: { fontSize: 11, color: '#888', marginBottom: 10 } }, 'Используются для разбивки журнала событий и отчётов по сменам.'),
      shifts.length > 0 && h('div', { style: { marginBottom: 12 } },
        shifts.map(s => h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
          h('span', { style: { flex: 1, fontSize: 13 } }, `${s.name} (${s.start}:00 — ${s.end}:00)`),
          h('button', { style: rbtn({ fontSize: 11, padding: '3px 8px' }), onClick: () => removeShift(s.id) }, '✕')
        ))
      ),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('input', { style: { ...S.inp, flex: 2, minWidth: 120 }, placeholder: 'Название смены', value: form.name, onChange: e => setForm(p => ({ ...p, name: e.target.value })) }),
        h('input', { type: 'number', min: 0, max: 23, style: { ...S.inp, width: 70 }, placeholder: 'С (ч)', value: form.start, onChange: e => setForm(p => ({ ...p, start: e.target.value })) }),
        h('input', { type: 'number', min: 0, max: 24, style: { ...S.inp, width: 70 }, placeholder: 'До (ч)', value: form.end, onChange: e => setForm(p => ({ ...p, end: e.target.value })) }),
        h('button', { style: abtn(), onClick: addShift }, '+ Добавить')
      )
    )
  );
});
