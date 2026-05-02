// teploros · quality.js
// Автоматически извлечено из монолита

const ControllerScreen = memo(({ data, onUpdate, addToast, onOrderClick, onWorkerClick }) => {
  const pendingQC = useMemo(() => data.ops.filter(o => o.status === 'on_check' && !o.archived), [data.ops]);
  const [rejectModal, setRejectModal] = useState(null); // { op } | null
  const [rejectNote, setRejectNote] = useState('');

  const acceptOp = useCallback(async (op) => {
    const updated = { ...data, ops: data.ops.map(o => o.id === op.id ? { ...o, status: 'done' } : o), events: [...data.events, { id: uid(), type: 'qc_pass', opId: op.id, ts: now() }], _urgent: true };
    await DB.save(updated); onUpdate(updated); addToast('Операция принята', 'success');
  }, [data, onUpdate, addToast]);

  const confirmReject = useCallback(async () => {
    if (!rejectModal) return;
    const note = rejectNote.trim();
    const updated = { ...data, ops: data.ops.map(o => o.id === rejectModal.op.id ? { ...o, status: 'defect', defectNote: note || 'Не прошло контроль качества' } : o), events: [...data.events, { id: uid(), type: 'qc_reject', opId: rejectModal.op.id, ts: now(), note }], _urgent: true };
    await DB.save(updated); onUpdate(updated);
    addToast('Операция забракована', 'info');
    setRejectModal(null); setRejectNote('');
  }, [data, onUpdate, addToast, rejectModal, rejectNote]);

  return h('div', null,
    // Панель уведомлений ОТК
    h('div', { style: { ...S.card, marginBottom: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: pendingQC.length > 0 ? 'rgba(2,119,189,0.07)' : '#f8f8f5', border: pendingQC.length > 0 ? '1px solid #90CAF9' : '0.5px solid #eee' } },
      h('div', null,
        h('div', { style: { fontWeight: 600, fontSize: 13, color: pendingQC.length > 0 ? '#0277BD' : '#888' } },
          pendingQC.length > 0 ? `🔍 На контроле: ${pendingQC.length} операций` : '✓ Нет операций на контроле'
        ),
        pendingQC.length > 0 && h('div', { style: { fontSize: 11, color: '#888', marginTop: 2 } },
          pendingQC.map(op => data.orders.find(o => o.id === op.orderId)?.number).filter(Boolean).join(', ')
        )
      ),
      // Кнопка включения Push-уведомлений
      'Notification' in window && h('button', {
        style: Notification.permission === 'granted'
          ? { ...gbtn({ fontSize: 11 }), color: GN2, borderColor: GN }
          : gbtn({ fontSize: 11 }),
        onClick: () => Notification.requestPermission().then(p => {
          if (p === 'granted') addToast('✓ Push-уведомления включены! Теперь уведомления придут даже при закрытой вкладке', 'success');
          else addToast('Push-уведомления отклонены браузером', 'error');
        })
      }, Notification.permission === 'granted' ? '🔔 Push включён' : '🔕 Включить Push')
    ),
    h(SectionAnalytics, { section: 'quality', data }),
    // Модалка отклонения — вместо prompt()
    rejectModal && h('div', { role: 'dialog', 'aria-modal': 'true', style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 } },
      h('div', { style: { background: '#fff', borderRadius: 12, padding: 20, width: 'min(380px,100%)' } },
        h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, '⚠ Брак: ' + rejectModal.op.name),
        h('div', { style: { fontSize: 11, color: '#888', marginBottom: 12 } }, 'Укажите причину — это поможет при анализе'),
        h('textarea', { style: { ...S.inp, width: '100%', marginBottom: 12 }, rows: 3, placeholder: 'Опишите дефект или причину отклонения...', value: rejectNote, onChange: e => setRejectNote(e.target.value), autoFocus: true }),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { style: gbtn(), onClick: () => { setRejectModal(null); setRejectNote(''); } }, 'Отмена'),
          h('button', { style: rbtn({ padding: '8px 20px' }), onClick: confirmReject }, 'Забраковать')
        )
      )
    ),
    h('div', { style: S.card },
      h('div', { style: S.sec }, 'Операции, ожидающие контроля'),
      pendingQC.length === 0
        ? h('div', { style: { padding: 16, textAlign: 'center' } }, 'Нет операций на контроле')
        : h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null,
              ['Заказ','Операция','Сотрудник','Параметры','Действия'].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t))
            )),
            h('tbody', null, pendingQC.map(op => {
              const order = data.orders.find(o => o.id === op.orderId);
              const workerIds = op.workerIds || [];
              return h('tr', { key: op.id },
                h('td', { style: S.td },
                  onOrderClick && order
                    ? h('span', { style: { color: AM, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }, onClick: () => onOrderClick(order.id), title: 'Открыть карточку' }, order.number)
                    : order?.number || '—'
                ),
                h('td', { style: S.td }, op.name),
                h('td', { style: S.td },
                  workerIds.length === 0 ? '—' :
                  h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                    workerIds.map(wid => h(WN, { key: wid, workerId: wid, data, onWorkerClick }))
                  )
                ),
                h('td', { style: S.td }, op.weldParams ? `Шов: ${op.weldParams.seamNumber}, Электрод: ${op.weldParams.electrode}` : '—'),
                h('td', { style: S.td }, h('div', { style: { display: 'flex', gap: 4 } },
                  h('button', { style: abtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Принять операцию', onClick: () => acceptOp(op) }, 'Принять'),
                  h('button', { style: rbtn({ fontSize: 11, padding: '4px 8px' }), 'aria-label': 'Забраковать операцию', onClick: () => { setRejectModal({ op }); setRejectNote(''); } }, 'Брак')
                ))
              );
            }))
          ))
    )
  );
});



// ==================== MasterReclamations ====================
const MasterReclamations = memo(({ data, onUpdate, addToast, onWorkerClick }) => {
  const [form, setForm] = useState({ orderId: '', description: '', severity: 'minor', detectedDate: '', operationName: '', defectSource: 'external' });
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [d8Steps, setD8Steps] = useState({});
  const { ask: askConfirm, confirmEl } = useConfirm();

  const severityStyle = { critical: { bg: RD3, cl: RD2, label: 'Критическая', border: RD }, major: { bg: '#FFF3E0', cl: '#E65100', label: 'Серьёзная', border: '#FF9800' }, minor: { bg: '#FFF8E1', cl: '#F57F17', label: 'Незначительная', border: '#FFC107' } };
  const statusStyle = { open: { bg: RD3, cl: RD, label: 'Открыта' }, in_work: { bg: AM3, cl: AM2, label: 'В работе' }, closed: { bg: GN3, cl: GN2, label: 'Закрыта' } };
  const sourceStyle = { external: { bg: '#E3F2FD', cl: '#0277BD', label: '🌐 Внешняя' }, previous_stage: { bg: '#FFF3E0', cl: '#E65100', label: '🏭 С пред. участка' }, current: { bg: RD3, cl: RD2, label: '⚙ Текущий этап' } };

  const D8_LABELS = ['D1 Команда', 'D2 Проблема', 'D3 Сдерживание', 'D4 Коренная причина', 'D5 Действия', 'D6 Проверка', 'D7 Предупреждение', 'D8 Закрытие'];

  const addReclamation = useCallback(async () => {
    if (!form.orderId || !form.description.trim()) { addToast('Укажите заказ и описание', 'error'); return; }
    // Автоматически формируем команду: мастер + исполнители связанной операции
    const relatedOps = data.ops.filter(op => op.orderId === form.orderId && op.name === form.operationName && !op.archived);
    const teamWorkers = relatedOps.flatMap(op => op.workerIds || []);
    const autoTeam = ['master', ...new Set(teamWorkers)];
    const rec = { id: uid(), orderId: form.orderId, description: form.description.trim(), severity: form.severity, detectedDate: form.detectedDate || new Date().toISOString().slice(0, 10), operationName: form.operationName, status: 'open', createdAt: now(), defectSource: form.defectSource, d8: { team: autoTeam, containment: '', whys: ['', '', '', '', ''], rootCause: '', corrective: '', correctiveOwner: '', correctiveDeadline: '', validation: '', validationDate: '', preventive: '', preventiveDocs: '', closedNote: '', currentStep: 0 } };
    let d = { ...data, reclamations: [...(data.reclamations || []), rec] };
    d = logAction(d, 'reclamation_add', { orderId: form.orderId, type: form.defectSource });
    await DB.save(d); onUpdate(d);
    setForm({ orderId: '', description: '', severity: 'minor', detectedDate: '', operationName: '', defectSource: 'external' }); setShowForm(false);
    addToast(`Рекламация зарегистрирована. Команда: ${autoTeam.length} чел.`, 'success');
  }, [data, form, onUpdate, addToast]);

  // Сохранить поле D8
  const saveD8 = useCallback(async (recId, field, value) => {
    const d = { ...data, reclamations: (data.reclamations || []).map(r => r.id === recId ? { ...r, d8: { ...(r.d8 || {}), [field]: value } } : r) };
    await DB.save(d); onUpdate(d);
  }, [data, onUpdate]);

  // Перейти на следующий шаг D8
  const advanceD8 = useCallback(async (recId) => {
    const rec = (data.reclamations || []).find(r => r.id === recId);
    if (!rec) return;
    const step = (rec.d8?.currentStep || 0) + 1;
    const newStatus = step >= 1 && rec.status === 'open' ? 'in_work' : rec.status;
    const d = { ...data, reclamations: data.reclamations.map(r => r.id === recId ? { ...r, status: newStatus, d8: { ...(r.d8 || {}), currentStep: step } } : r) };
    await DB.save(d); onUpdate(d);
    setD8Steps(p => ({ ...p, [recId]: step }));
  }, [data, onUpdate]);

  // Закрыть рекламацию через D8
  const closeD8 = useCallback(async (recId) => {
    const rec = (data.reclamations || []).find(r => r.id === recId);
    if (!rec) return;
    const d8 = rec.d8 || {};
    const team = d8.team || [];
    if (team.length === 0) { addToast('Сначала добавьте команду расследования (D1)', 'error'); return; }
    if (!d8.rootCause && !d8.corrective) { addToast('Заполните хотя бы D4 (причина) и D5 (действия) перед закрытием', 'error'); return; }
    const d = { ...data, reclamations: data.reclamations.map(r => r.id === recId ? { ...r, status: 'closed', resolvedAt: now(), resolution: d8.closedNote || d8.corrective || '', d8: { ...d8, currentStep: 8 } } : r) };
    // Благодарность всем рабочим из команды (исключаем только 'master' строку, не реальных рабочих)
    const realWorkerIds = team.filter(wid => wid !== 'master').filter(wid => data.workers.some(w => w.id === wid));
    const thankEvents = realWorkerIds.map(wid => ({ id: uid(), type: 'thanks', toWorkerId: wid, fromWorkerId: 'master', ts: now(), note: '8D расследование' }));
    if (thankEvents.length) d.events = [...d.events, ...thankEvents];
    let final = d;
    realWorkerIds.forEach(wid => { const checked = checkAchievements(wid, final); if (checked !== final) final = checked; });
    await DB.save(final); onUpdate(final);
    addToast(`Рекламация закрыта. Благодарность отправлена: ${realWorkerIds.length} сотр.${realWorkerIds.length === 0 ? ' (в команде только мастер)' : ''}`, 'success');
  }, [data, onUpdate, addToast]);

  const delRec = useCallback(async (id) => {
    if (!(await askConfirm({ message: 'Удалить рекламацию?' }))) return;
    const d = { ...data, reclamations: (data.reclamations || []).filter(r => r.id !== id) };
    await DB.save(d); onUpdate(d); addToast('Удалена', 'info');
  }, [data, onUpdate, addToast]);

  const allRecs = useMemo(() => (data.reclamations || [])
.sort((a, b) => b.createdAt - a.createdAt), [data.reclamations]);
  const isExternal = (r) => r.defectSource === 'external';
  const isInternal = (r) => r.defectSource !== 'external';
  const filtered = useMemo(() => {
    let list = allRecs;
    if (filterType === 'external') list = list.filter(isExternal);
    if (filterType === 'internal') list = list.filter(isInternal);
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    return list;
  }, [allRecs, filterStatus, filterType]);
  const openCount = allRecs.filter(r => r.status !== 'closed').length;
  const externalCount = allRecs.filter(isExternal).length;
  const internalCount = allRecs.filter(isInternal).length;

  // 8D step renderer
  const renderD8Step = (rec, stepIdx) => {
    const d8 = rec.d8 || {};
    const order = data.orders.find(o => o.id === rec.orderId);
    const linkedOp = rec.opId ? data.ops.find(o => o.id === rec.opId) : null;
    const workerNames = linkedOp?.workerIds?.map(wid => data.workers.find(w => w.id === wid)?.name).filter(Boolean) || [];
    const defectReason = rec.defectReasonId ? data.defectReasons?.find(r => r.id === rec.defectReasonId)?.name : null;
    const inp = { style: { ...S.inp, width: '100%', fontSize: 12 } };
    const lbl = (t) => h('div', { style: { ...S.lbl, marginTop: 8 } }, t);

    if (stepIdx === 0) {
      const opName = linkedOp?.name || rec.operationName || '';
      const linkedWorkerIds = linkedOp?.workerIds || [];
      const notInTeam = data.workers.filter(w => isWorkerOnShift(w, data.timesheet) && !(d8.team || []).includes(w.id));
      // Группа 1: непосредственные исполнители операции
      const executors = notInTeam.filter(w => linkedWorkerIds.includes(w.id));
      // Группа 2: имеют допуск к этому типу операции
      const competent = opName ? notInTeam.filter(w => !linkedWorkerIds.includes(w.id) && w.competences?.length && w.competences.includes(opName)) : [];
      // Группа 3: остальные — только в раскрывающемся списке
      const others = notInTeam.filter(w => !executors.includes(w) && !competent.includes(w));
      return h('div', null,
        lbl('Команда расследования'),
        (d8.team || []).length > 0 && h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 } },
          (d8.team || []).map(wid => {
            const w = wid === 'master' ? { name: 'Начальник цеха' } : data.workers.find(w => w.id === wid);
            return h('span', { key: wid, style: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: AM3, borderRadius: 6, fontSize: 11, color: AM2 } },
              wid !== 'master'
                ? h(WN, { workerId: wid, data, onWorkerClick, style: { color: AM2 } })
                : (w?.name || wid),
              h('span', { style: { cursor: 'pointer', fontWeight: 500, marginLeft: 2 }, onClick: () => saveD8(rec.id, 'team', (d8.team || []).filter(id => id !== wid)) }, '×')
            );
          })
        ),
        // Быстрые кнопки
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
          !(d8.team || []).includes('master') && h('button', { style: gbtn({ fontSize: 11 }), onClick: () => saveD8(rec.id, 'team', [...(d8.team || []), 'master']) }, '+ Начальник цеха'),
          linkedWorkerIds.length > 0 && !(d8.team || []).some(id => linkedWorkerIds.includes(id)) && h('button', { style: abtn({ fontSize: 11 }), onClick: () => saveD8(rec.id, 'team', [...new Set([...(d8.team || []), 'master', ...linkedWorkerIds])]) }, '⚡ Нач. цеха + исполнители'),
          opName && competent.length > 0 && !(d8.team || []).length && h('button', { style: gbtn({ fontSize: 11 }), onClick: () => saveD8(rec.id, 'team', ['master', ...competent.slice(0, 3).map(w => w.id)]) }, `⚡ Нач. цеха + допущенные к «${opName.length > 12 ? opName.slice(0, 12) + '…' : opName}»`)
        ),
        // Группа 1: исполнители операции
        executors.length > 0 && h('div', { style: { marginTop: 4 } },
          h('div', { style: { fontSize: 10, color: RD, marginBottom: 4, fontWeight: 500 } }, 'Исполнители операции:'),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
            executors.map(w => h('button', { key: w.id, style: { ...gbtn({ fontSize: 11, padding: '4px 10px' }), borderColor: RD, color: RD2 }, onClick: () => saveD8(rec.id, 'team', [...(d8.team || []), w.id]) }, `+ ${w.name}`))
          )
        ),
        // Группа 2: с допуском к этой операции
        competent.length > 0 && h('div', { style: { marginTop: 6 } },
          h('div', { style: { fontSize: 10, color: AM, marginBottom: 4 } }, `Допущены к «${opName}»:`),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
            competent.map(w => h('button', { key: w.id, style: gbtn({ fontSize: 10, padding: '3px 8px' }), onClick: () => saveD8(rec.id, 'team', [...(d8.team || []), w.id]) }, `+ ${w.name}`))
          )
        ),
        // Группа 3: остальные — скрыты в раскрывающемся списке
        others.length > 0 && h('details', { style: { marginTop: 6, fontSize: 11 } },
          h('summary', { style: { cursor: 'pointer', color: '#888' } }, `Другие сотрудники (${others.length})`),
          h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 } },
            others.map(w => h('button', { key: w.id, style: gbtn({ fontSize: 10, padding: '3px 8px' }), onClick: () => saveD8(rec.id, 'team', [...(d8.team || []), w.id]) }, `+ ${w.name}`))
          )
        ),
        !opName && executors.length === 0 && competent.length === 0 && h('div', { style: { fontSize: 11, color: '#888', marginTop: 4 } }, 'Не указан этап операции — все сотрудники в разделе «Другие»')
      );
    }

    if (stepIdx === 1) return h('div', null,
      lbl('Описание проблемы'),
      h('div', { style: { background: '#f8f8f5', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, marginBottom: 8 } }, rec.description || '—'),
      (workerNames.length > 0 || defectReason) && h('div', { style: { background: RD3, borderRadius: 8, padding: '10px 12px', marginBottom: 8, fontSize: 12 } },
        workerNames.length > 0 && h('div', { style: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { color: '#888' } }, 'Исполнитель: '),
          ...(linkedOp?.workerIds || []).map(wid => h(WN, { key: wid, workerId: wid, data, onWorkerClick, style: { fontWeight: 500, color: RD2 } }))
        ),
        defectReason && h('div', null, h('span', { style: { color: '#888' } }, 'Причина: '), defectReason),
        rec.defectNote && h('div', null, h('span', { style: { color: '#888' } }, 'Описание: '), rec.defectNote)
      ),
      linkedOp && h('div', { style: { fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' } },
        h('div', null, h('span', { style: { color: '#888' } }, 'Заказ: '), order?.number || '—'),
        h('div', null, h('span', { style: { color: '#888' } }, 'Операция: '), linkedOp.name),
        linkedOp.startedAt && h('div', null, h('span', { style: { color: '#888' } }, 'Начата: '), new Date(linkedOp.startedAt).toLocaleString()),
        linkedOp.finishedAt && h('div', null, h('span', { style: { color: '#888' } }, 'Завершена: '), new Date(linkedOp.finishedAt).toLocaleString())
      )
    );

    if (stepIdx === 2) return h('div', null,
      lbl('Сдерживающие меры (что сделали немедленно)'),
      h('textarea', { ...inp, rows: 3, placeholder: 'Остановлена партия, отозвано изделие, усилен контроль...', value: d8.containment || '', onChange: e => saveD8(rec.id, 'containment', e.target.value) })
    );

    if (stepIdx === 3) return h('div', null,
      lbl('5 Почему — анализ коренной причины'),
      [0, 1, 2, 3, 4].map(i => h('div', { key: i, style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 } },
        h('div', { style: { width: 24, height: 24, borderRadius: '50%', background: (d8.whys || [])[i] ? AM3 : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: (d8.whys || [])[i] ? AM2 : '#aaa', flexShrink: 0 } }, i + 1),
        h('input', { ...inp, style: { ...inp.style, flex: 1 }, placeholder: i === 0 ? 'Почему произошла проблема?' : `Почему ${i + 1}?`, value: (d8.whys || [])[i] || '', onChange: e => { const w = [...(d8.whys || ['', '', '', '', ''])]; w[i] = e.target.value; saveD8(rec.id, 'whys', w); } })
      )),
      lbl('Итоговая коренная причина'),
      h('textarea', { ...inp, rows: 2, placeholder: 'Одна главная причина на основе анализа...', value: d8.rootCause || '', onChange: e => saveD8(rec.id, 'rootCause', e.target.value) })
    );

    if (stepIdx === 4) return h('div', null,
      lbl('Корректирующие действия'),
      h('textarea', { ...inp, rows: 3, placeholder: 'Что конкретно меняем в процессе...', value: d8.corrective || '', onChange: e => saveD8(rec.id, 'corrective', e.target.value) }),
      lbl('Ответственный'),
      h('select', { ...inp, value: d8.correctiveOwner || '', onChange: e => saveD8(rec.id, 'correctiveOwner', e.target.value) },
        h('option', { value: '' }, '— назначить —'),
        h('option', { value: 'master' }, 'Начальник цеха'),
        data.workers.filter(w => isWorkerOnShift(w, data.timesheet)).map(w => h('option', { key: w.id, value: w.id }, w.name))
      ),
      lbl('Срок выполнения'),
      h('input', { type: 'date', ...inp, value: d8.correctiveDeadline || '', onChange: e => saveD8(rec.id, 'correctiveDeadline', e.target.value) })
    );

    if (stepIdx === 5) return h('div', null,
      lbl('Метод и результат проверки'),
      h('textarea', { ...inp, rows: 3, placeholder: 'Как проверяли: контрольная партия, повторная опрессовка, статистика за период...', value: d8.validation || '', onChange: e => saveD8(rec.id, 'validation', e.target.value) }),
      lbl('Дата проверки'),
      h('input', { type: 'date', ...inp, value: d8.validationDate || '', onChange: e => saveD8(rec.id, 'validationDate', e.target.value) })
    );

    if (stepIdx === 6) return h('div', null,
      lbl('Изменения в процессе / документации'),
      h('textarea', { ...inp, rows: 3, placeholder: 'Обновлённые инструкции, добавленные контрольные точки, новые этапы...', value: d8.preventive || '', onChange: e => saveD8(rec.id, 'preventive', e.target.value) }),
      lbl('Обучение персонала'),
      h('input', { ...inp, placeholder: 'Кто, когда, что именно', value: d8.preventiveDocs || '', onChange: e => saveD8(rec.id, 'preventiveDocs', e.target.value) })
    );

    if (stepIdx === 7) return h('div', null,
      lbl('Итог расследования'),
      h('textarea', { ...inp, rows: 3, placeholder: 'Краткое резюме: что было, почему, что сделали, что изменили', value: d8.closedNote || '', onChange: e => saveD8(rec.id, 'closedNote', e.target.value) }),
      (d8.team || []).length > 0 && h('div', { style: { marginTop: 12 } },
        lbl('Команда расследования'),
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          (d8.team || []).map(wid => {
            const w = wid === 'master' ? null : data.workers.find(w => w.id === wid);
            return w
              ? h(WN, { key: wid, worker: w, onWorkerClick, style: { padding: '4px 10px', background: GN3, color: GN2, borderRadius: 6, fontSize: 11, display: 'inline-block' } })
              : h('span', { key: wid, style: { padding: '4px 10px', background: GN3, color: GN2, borderRadius: 6, fontSize: 11 } }, 'Начальник цеха');
          })
        )
      ),
      h('button', { style: { ...abtn({ width: '100%', padding: '12px', fontSize: 14, marginTop: 12 }), background: GN, color: '#fff' }, onClick: () => closeD8(rec.id) }, '✓ Закрыть рекламацию и отправить благодарность команде')
    );
    return null;
  };

  return h('div', null,
    confirmEl,
    // Сводка
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 10, marginBottom: 12 } },
      h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: allRecs.length > 0 ? AM : GN } }, allRecs.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Всего')),
      h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: openCount > 0 ? RD : GN } }, openCount), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Открытых')),
      h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: '#0277BD' } }, externalCount), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Внешних')),
      h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: '#E65100' } }, internalCount), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Внутренних')),
      h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: '#888' } }, allRecs.filter(r => r.severity === 'critical').length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Критических'))
    ),
    // Фильтры
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' } },
      h('span', { style: { fontSize: 11, color: '#888', alignSelf: 'center', marginRight: 4 } }, 'Тип:'),
      [['all', 'Все'], ['external', '🌐 Внешние'], ['internal', '🏭 Внутренние']].map(([id, label]) =>
        h('button', { key: id, style: filterType === id ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => setFilterType(id) }, label)
      )
    ),
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
      h('span', { style: { fontSize: 11, color: '#888', marginRight: 4 } }, 'Статус:'),
      [['all', 'Все'], ['open', 'Открытые'], ['in_work', 'В работе'], ['closed', 'Закрытые']].map(([id, label]) =>
        h('button', { key: id, style: filterStatus === id ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => setFilterStatus(id) }, label)
      ),
      h('button', { style: abtn({ marginLeft: 'auto' }), onClick: () => setShowForm(v => !v) }, showForm ? '✕ Свернуть' : '+ Новая рекламация')
    ),
    h(PasteImportWidget, { addToast, hint: 'Вставить рекламации из Excel',
      columns: [
        { key: 'description', label: 'Описание дефекта', required: true },
        { key: 'orderNumber', label: 'Номер заказа',     required: false, default: '' },
        { key: 'severity',    label: 'Серьёзность',      required: false, default: 'minor' },
        { key: 'source',      label: 'Источник',         required: false, default: 'external' },
      ],
      onImport: async (rows) => {
        const orderMap = {};
        data.orders.forEach(o => { orderMap[o.number?.toLowerCase()] = o.id; });
        const items = rows.filter(r => r.description).map(r => ({
          id: uid(), description: r.description,
          orderId: orderMap[r.orderNumber?.toLowerCase()] || '',
          severity: ['minor','major','critical'].includes(r.severity) ? r.severity : 'minor',
          defectSource: ['external','current','previous_stage'].includes(r.source) ? r.source : 'external',
          status: 'open', detectedDate: new Date().toISOString().slice(0,10), createdAt: now(), d8Steps: {}
        }));
        if (!items.length) { addToast('Нет данных для импорта', 'error'); return; }
        const d = { ...data, reclamations: [...(data.reclamations||[]), ...items] };
        await DB.save(d); onUpdate(d); addToast(`Добавлено рекламаций: ${items.length}`, 'success');
      }}),
    // Форма создания
    showForm && h('div', { style: { ...S.card, marginBottom: 12, border: `0.5px solid ${AM}` } },
      h('div', { style: { display: 'flex', gap: 6, marginBottom: 12 } },
        h('button', { style: form.defectSource === 'external' ? abtn({ flex: 1 }) : gbtn({ flex: 1 }), onClick: () => setForm(p => ({ ...p, defectSource: 'external' })) }, '🌐 Внешняя'),
        h('button', { style: form.defectSource === 'current' ? abtn({ flex: 1, background: '#E65100' }) : gbtn({ flex: 1 }), onClick: () => setForm(p => ({ ...p, defectSource: 'current' })) }, '⚙ Внутренняя'),
        h('button', { style: form.defectSource === 'previous_stage' ? abtn({ flex: 1, background: '#FF9800' }) : gbtn({ flex: 1 }), onClick: () => setForm(p => ({ ...p, defectSource: 'previous_stage' })) }, '🏭 С пред. участка')
      ),
      h('div', { className: 'form-row', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('div', { style: { flex: 2, minWidth: 160 } }, h('label', { style: S.lbl }, 'Заказ'), h('select', { style: { ...S.inp, width: '100%' }, value: form.orderId, onChange: e => setForm(p => ({ ...p, orderId: e.target.value })) }, h('option', { value: '' }, '— заказ —'), data.orders.filter(o => !o.archived).map(o => h('option', { key: o.id, value: o.id }, `${o.number} — ${o.product}`)))),
        h('div', { style: { flex: 1, minWidth: 140 } }, h('label', { style: S.lbl }, 'Этап'), h('select', { style: { ...S.inp, width: '100%' }, value: form.operationName, onChange: e => setForm(p => ({ ...p, operationName: e.target.value })) }, h('option', { value: '' }, '— этап —'), (data.productionStages || []).map(s => h('option', { key: s.id || s.name, value: s.name }, s.name)))),
        h('div', { style: { flex: 1, minWidth: 120 } }, h('label', { style: S.lbl }, 'Серьёзность'), h('select', { style: { ...S.inp, width: '100%' }, value: form.severity, onChange: e => setForm(p => ({ ...p, severity: e.target.value })) }, h('option', { value: 'minor' }, 'Незначительная'), h('option', { value: 'major' }, 'Серьёзная'), h('option', { value: 'critical' }, 'Критическая'))),
        h('div', { style: { flex: 1, minWidth: 120 } }, h('label', { style: S.lbl }, 'Дата'), h('input', { type: 'date', style: { ...S.inp, width: '100%' }, value: form.detectedDate, onChange: e => setForm(p => ({ ...p, detectedDate: e.target.value })) }))
      ),
      h('div', { style: { marginTop: 8 } }, h('label', { style: S.lbl }, 'Описание'), h('textarea', { style: { ...S.inp, width: '100%' }, rows: 3, placeholder: 'Описание проблемы...', value: form.description, onChange: e => setForm(p => ({ ...p, description: e.target.value })) })),
      h('div', { style: { marginTop: 10, display: 'flex', gap: 8 } }, h('button', { style: abtn(), onClick: addReclamation }, 'Зарегистрировать'), h('button', { style: gbtn(), onClick: () => setShowForm(false) }, 'Отмена'))
    ),
    // Список
    filtered.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 32 } }, 'Нет рекламаций')
      : filtered.map(rec => {
          const order = data.orders.find(o => o.id === rec.orderId);
          const sev = severityStyle[rec.severity] || severityStyle.minor;
          const st = statusStyle[rec.status] || statusStyle.open;
          const src = sourceStyle[rec.defectSource] || sourceStyle.external;
          const isExpanded = expandedId === rec.id;
          const d8 = rec.d8 || {};
          const d8Step = d8Steps[rec.id] ?? (d8.currentStep || 0);
          const completedSteps = d8.currentStep || 0;

          return h('div', { key: rec.id, style: { ...S.card, padding: 0, marginBottom: 10, borderLeft: `4px solid ${sev.border}`, overflow: 'hidden' } },
            // Шапка
            h('div', { style: { padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, onClick: () => {
              setExpandedId(isExpanded ? null : rec.id);
              // Инициализировать d8 для старых рекламаций
              if (!isExpanded && !rec.d8) {
                const linkedW = rec.opId ? (data.ops.find(o => o.id === rec.opId)?.workerIds || []) : [];
                const initD8 = { team: linkedW.length ? ['master', ...linkedW] : [], containment: '', whys: ['', '', '', '', ''], rootCause: '', corrective: '', correctiveOwner: '', correctiveDeadline: '', validation: '', validationDate: '', preventive: '', preventiveDocs: '', closedNote: '', currentStep: 0 };
                const d = { ...data, reclamations: data.reclamations.map(r => r.id === rec.id ? { ...r, d8: initD8 } : r) };
                DB.save(d).then(() => onUpdate(d));
              }
            } },
              h('div', { style: { flex: 1 } },
                h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 } },
                  h('span', { style: { fontSize: 13, fontWeight: 500 } }, order ? `${order.number} — ${order.product}` : '—'),
                  h('span', { style: { padding: '2px 8px', fontSize: 10, borderRadius: 6, background: src.bg, color: src.cl, fontWeight: 500 } }, src.label),
                  h('span', { style: { padding: '2px 8px', fontSize: 10, borderRadius: 6, background: sev.bg, color: sev.cl, fontWeight: 500 } }, sev.label),
                  h('span', { style: { padding: '2px 8px', fontSize: 10, borderRadius: 6, background: st.bg, color: st.cl, fontWeight: 500 } }, st.label)
                ),
                h('div', { style: { fontSize: 11, color: '#888' } },
                  new Date(rec.createdAt).toLocaleDateString(),
                  rec.operationName && h('span', { style: { marginLeft: 8, color: AM } }, `Этап: ${rec.operationName}`)
                ),
                // Мини прогресс-бар 8D
                completedSteps > 0 && h('div', { style: { display: 'flex', gap: 2, marginTop: 6, maxWidth: 160 } },
                  [0, 1, 2, 3, 4, 5, 6, 7].map(i => h('div', { key: i, style: { flex: 1, height: 4, borderRadius: 2, background: i < completedSteps ? GN : i === completedSteps ? AM : '#e0e0e0' } }))
                )
              ),
              h('span', { style: { fontSize: 11, color: '#aaa', flexShrink: 0, marginLeft: 8 } }, isExpanded ? '▾' : '▸')
            ),
            // 8D визард
            isExpanded && h('div', { style: { padding: '0 14px 14px', borderTop: '0.5px solid rgba(0,0,0,0.06)' } },
              // Шаги навигации
              h('div', { style: { display: 'flex', gap: 2, margin: '12px 0 4px' } },
                D8_LABELS.map((label, i) => h('div', { key: i, style: { flex: 1, height: 6, borderRadius: 3, cursor: 'pointer', background: i < completedSteps ? GN : i === d8Step ? AM : '#e0e0e0' }, onClick: () => setD8Steps(p => ({ ...p, [rec.id]: i })) }))
              ),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginBottom: 12 } },
                h('span', null, D8_LABELS[d8Step]),
                h('span', null, `Шаг ${d8Step + 1} из 8`)
              ),
              // Содержимое шага
              h('div', { style: { minHeight: 120 } },
                h('div', { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, D8_LABELS[d8Step]),
                renderD8Step(rec, d8Step)
              ),
              // Навигация
              h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.06)' } },
                d8Step > 0
                  ? h('button', { style: gbtn({ fontSize: 11 }), onClick: () => setD8Steps(p => ({ ...p, [rec.id]: d8Step - 1 })) }, '← Назад')
                  : h('div'),
                d8Step < 7
                  ? h('button', { style: abtn({ fontSize: 11 }), onClick: () => { if (d8Step >= completedSteps) advanceD8(rec.id); setD8Steps(p => ({ ...p, [rec.id]: d8Step + 1 })); } }, d8Step >= completedSteps ? 'Сохранить и далее →' : 'Далее →')
                  : rec.status !== 'closed' ? null : h('div'),
                h('button', { style: rbtn({ fontSize: 10, padding: '4px 8px' }), onClick: () => delRec(rec.id) }, '✕')
              )
            )
          );
        })
  );
});



