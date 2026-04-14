// teploros · chat.js
// Автоматически извлечено из монолита

// ==================== ChatScreen ====================
const ChatScreen = memo(({ data, onUpdate, addToast, currentUser, onBack }) => {
  const [newMessage, setNewMessage] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showThanks, setShowThanks] = useState(false);
  const [showDuelCreate, setShowDuelCreate] = useState(false);
  const [duelTarget, setDuelTarget] = useState('');
  const [duelOps, setDuelOps] = useState(3);
  const [contextOp, setContextOp] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [viewProfileId, setViewProfileId] = useState(null);
  const [showPeople, setShowPeople] = useState(false);
  const messagesEndRef = useRef(null);

  const deleteMessage = useCallback(async (msgId) => {
    const d = { ...data, messages: (data.messages || []).filter(m => m.id !== msgId) };
    await DB.save(d); onUpdate(d);
  }, [data, onUpdate]);

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(scrollToBottom, [data.messages]);

  // П.4: Счётчик непрочитанных
  const lastReadKey = `chat_lastRead_${currentUser.id || 'anon'}`;
  useEffect(() => { localStorage.setItem(lastReadKey, String(now())); }, [data.messages?.length, lastReadKey]);

  const myId = currentUser.id || 'system';
  const isMaster = currentUser.role === 'master';
  const isWarehouse = currentUser.role === 'warehouse';

  // Текущая операция рабочего (для контекста)
  const activeOp = useMemo(() => {
    if (!currentUser.id || currentUser.role !== 'worker') return null;
    return data.ops.find(op => op.status === 'in_progress' && op.workerIds?.includes(currentUser.id));
  }, [data.ops, currentUser]);

  const sendMessage = useCallback(async (text, type = 'text', extra = {}) => {
    if (!text?.trim()) return;
    const opData = contextOp ? data.ops.find(o => o.id === contextOp) : activeOp;
    const orderData = opData ? data.orders.find(o => o.id === opData.orderId) : null;
    const message = {
      id: uid(), senderId: myId,
      senderName: currentUser.name || 'Система',
      senderRole: currentUser.role,
      text: text.trim(), type,
      timestamp: now(),
      pinned: isAnnouncement && (isMaster || isWarehouse),
      opId: opData?.id || undefined,
      opName: opData?.name || undefined,
      orderNumber: orderData?.number || undefined,
      ...extra
    };
    const updatedMessages = [...(data.messages || []), message].slice(-200);
    let updated = { ...data, messages: updatedMessages };
    // Уведомления для мастера и склада при быстрых действиях
    const notifyTypes = ['need_material', 'equipment_issue', 'need_help', 'drawing_question'];
    if (notifyTypes.includes(type)) {
      const notifTargets = type === 'need_material' ? ['master', 'warehouse'] : ['master'];
      const notif = { id: uid(), type: 'chat_alert', alertType: type, senderId: myId, senderName: currentUser.name, text: text.trim(), opName: opData?.name, orderNumber: orderData?.number, targets: notifTargets, ts: now(), read: false };
      updated = { ...updated, events: [...updated.events, notif] };
    }
    await DB.save(updated); onUpdate(updated);
    setNewMessage(''); setContextOp(''); setIsAnnouncement(false); setShowQuickActions(false);
  }, [data, myId, currentUser, contextOp, activeOp, isAnnouncement, isMaster, isWarehouse, onUpdate]);

  // Быстрые действия
  const quickActions = [
    { icon: '🔧', label: 'Нужен материал', type: 'need_material' },
    { icon: '⚠️', label: 'Проблема с оборудованием', type: 'equipment_issue' },
    { icon: '📋', label: 'Вопрос по чертежу', type: 'drawing_question' },
    { icon: '🆘', label: 'Нужна помощь', type: 'need_help' },
    { icon: '✅', label: 'Задача выполнена', type: 'task_done' },
    { icon: '⏸', label: 'Жду решения', type: 'waiting' }
  ];

  // Отправить благодарность
  const sendThanks = useCallback(async (toWorkerId) => {
    const toWorker = data.workers.find(w => w.id === toWorkerId);
    if (!toWorker) return;
    const text = `🤝 ${currentUser.name} благодарит ${toWorker.name}!`;
    const thankEvent = { id: uid(), type: 'thanks', toWorkerId, fromWorkerId: myId, ts: now() };
    const message = { id: uid(), senderId: 'system', senderName: 'Система', senderRole: 'system', text, type: 'thanks', timestamp: now(), toWorkerId, fromWorkerId: myId };
    const updatedMessages = [...(data.messages || []), message].slice(-200);
    const updated = { ...data, messages: updatedMessages, events: [...data.events, thankEvent] };
    const withAch = checkAchievements(toWorkerId, updated);
    await DB.save(withAch !== updated ? withAch : updated);
    onUpdate(withAch !== updated ? withAch : updated);
    setShowThanks(false);
    addToast(`Благодарность отправлена ${toWorker.name}`, 'success');
  }, [data, myId, currentUser, onUpdate, addToast]);

  // Дуэли
  const createDuel = useCallback(async () => {
    if (!duelTarget || duelTarget === myId) { addToast('Выберите соперника', 'error'); return; }
    const opponent = data.workers.find(w => w.id === duelTarget);
    const duel = { id: uid(), challengerId: myId, challengerName: currentUser.name, opponentId: duelTarget, opponentName: opponent?.name || '?', targetOps: duelOps, status: 'active', createdAt: now(), challengerOps: 0, opponentOps: 0 };
    const msg = { id: uid(), senderId: 'system', senderName: 'Система', senderRole: 'system', text: `⚔ ${currentUser.name} вызывает ${opponent?.name} на дуэль! Кто первым выполнит ${duelOps} операций?`, type: 'achievement', timestamp: now() };
    const d = { ...data, duels: [...(data.duels || []), duel], messages: [...(data.messages || []), msg].slice(-200) };
    await DB.save(d); onUpdate(d);
    setShowDuelCreate(false); setDuelTarget(''); setDuelOps(3);
    addToast(`Дуэль начата! Цель: ${duelOps} операций`, 'success');
  }, [data, myId, currentUser, duelTarget, duelOps, onUpdate, addToast]);

  const activeDuels = useMemo(() => (data.duels || []).filter(d => d.status === 'active'), [data.duels]);
  const myDuels = useMemo(() => activeDuels.filter(d => d.challengerId === myId || d.opponentId === myId), [activeDuels, myId]);

  const messages = useMemo(() => (data.messages || []).slice().sort((a, b) => a.timestamp - b.timestamp), [data.messages]);
  const pinnedMessages = useMemo(() => messages.filter(m => m.pinned), [messages]);
  const regularMessages = useMemo(() => messages.filter(m => !m.pinned), [messages]);

  // Стили сообщений по типу
  const typeStyles = {
    need_material: { bg: '#FFF3E0', border: '#FF9800', icon: '🔧' },
    equipment_issue: { bg: RD3, border: RD, icon: '⚠️' },
    drawing_question: { bg: '#E3F2FD', border: BL, icon: '📋' },
    need_help: { bg: '#FCE4EC', border: '#E91E63', icon: '🆘' },
    task_done: { bg: GN3, border: GN, icon: '✅' },
    waiting: { bg: AM3, border: AM, icon: '⏸' },
    thanks: { bg: '#FFF8E1', border: '#FFC107', icon: '🤝' },
    achievement: { bg: '#E8F5E9', border: '#4CAF50', icon: '🏆' }
  };

  return h('div', { style: { ...S.card, height: '100%', minHeight: 500, display: 'flex', flexDirection: 'column', padding: 12 } },
    // Шапка с кнопкой назад
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
      h('div', { style: S.sec }, '💬 Чат производства'),
      onBack && h('button', { style: gbtn({ fontSize: 11, padding: '4px 12px' }), onClick: onBack }, '← Назад')
    ),

    // Закреплённые объявления
    pinnedMessages.length > 0 && h('div', { style: { marginBottom: 8 } },
      pinnedMessages.slice(-3).map(m => h('div', { key: m.id, style: { padding: '8px 12px', background: AM3, borderLeft: `3px solid ${AM}`, borderRadius: '0 8px 8px 0', marginBottom: 4, fontSize: 12 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('div', null, h('span', { style: { fontWeight: 500, color: AM2 } }, '📌 '), m.text),
          h('div', { style: { fontSize: 9, color: AM4, whiteSpace: 'nowrap', marginLeft: 8 } }, new Date(m.timestamp).toLocaleDateString())
        )
      ))
    ),

    // Сообщения
    h('div', { 'aria-live': 'polite', style: { flex: 1, overflowY: 'auto', padding: 8, background: '#fafaf8', borderRadius: 8, marginBottom: 8 } },
      regularMessages.length === 0 && h('div', { style: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 32 } }, 'Сообщений пока нет. Используйте быстрые кнопки для общения.'),
      regularMessages.map(m => {
        const ts = typeStyles[m.type];
        const isMe = m.senderId === myId;
        return h('div', { key: m.id, style: { marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' } },
          h('div', { style: { fontSize: 10, color: '#888', marginBottom: 2, display: 'flex', gap: 6, alignItems: 'center' } },
            h('span', { style: { fontWeight: 500, cursor: m.senderId !== 'system' ? 'pointer' : 'default', color: m.senderId !== 'system' ? AM : '#888' }, onClick: () => { const w = data.workers.find(w => w.id === m.senderId); if (w) setViewProfileId(w.id); } }, m.senderName),
            m.senderRole === 'master' && h('span', { style: { fontSize: 9, padding: '1px 4px', background: AM3, color: AM2, borderRadius: 4 } }, 'мастер'),
            m.orderNumber && h('span', { style: { fontSize: 9, color: AM } }, `📋 ${m.orderNumber}`),
            m.opName && h('span', { style: { fontSize: 9, color: '#666' } }, `→ ${m.opName}`),
            (isMaster || m.senderId === myId) && m.senderId !== 'system' &&
              h('button', { title: 'Удалить сообщение', style: { background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 12, padding: '0 2px', lineHeight: 1, marginLeft: 2 }, onClick: () => deleteMessage(m.id) }, '×')
          ),
          h('div', { style: {
            background: ts ? ts.bg : isMe ? AM3 : '#fff',
            border: ts ? `1px solid ${ts.border}` : '0.5px solid rgba(0,0,0,0.1)',
            borderRadius: 12, padding: '8px 14px', maxWidth: '85%', fontSize: 13
          }},
            ts && h('span', { style: { marginRight: 6 } }, ts.icon),
            m.text
          ),
          h('div', { style: { fontSize: 9, color: '#aaa', marginTop: 2 } }, new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        );
      }),
      h('div', { ref: messagesEndRef })
    ),

    // Быстрые действия (раскрывающиеся)
    showQuickActions && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 } },
      quickActions.map(qa => h('button', { key: qa.type, type: 'button',
        style: { padding: '10px 6px', fontSize: 12, borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)', background: (typeStyles[qa.type]?.bg) || '#fff', color: '#333', cursor: 'pointer', textAlign: 'center', minHeight: 44 },
        onClick: () => sendMessage(`${qa.icon} ${qa.label}`, qa.type)
      }, `${qa.icon}\n${qa.label}`))
    ),

    // Благодарности (выбор коллеги)
    showThanks && h('div', { style: { ...S.card, marginBottom: 8, padding: 10 } },
      h('div', { style: { fontSize: 11, fontWeight: 500, marginBottom: 6 } }, '🤝 Кому сказать спасибо?'),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        data.workers.filter(w => w.id !== myId && (w.status || 'working') === 'working').map(w =>
          h('button', { key: w.id, style: { padding: '8px 14px', fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', cursor: 'pointer', minHeight: 40 }, onClick: () => sendThanks(w.id) }, w.name)
        ),
        h('button', { style: gbtn({ fontSize: 11 }), onClick: () => setShowThanks(false) }, '✕ Отмена')
      )
    ),

    // Создание дуэли
    showDuelCreate && h('div', { style: { ...S.card, marginBottom: 8, padding: 10 } },
      h('div', { style: { fontSize: 11, fontWeight: 500, marginBottom: 6 } }, '⚔ Вызвать на дуэль'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' } },
        h('div', { style: { flex: 2, minWidth: 140 } },
          h('div', { style: S.lbl }, 'Соперник'),
          h('select', { style: { ...S.inp, width: '100%', fontSize: 12 }, value: duelTarget, onChange: e => setDuelTarget(e.target.value) },
            h('option', { value: '' }, '— выберите —'),
            data.workers.filter(w => w.id !== myId && !w.archived && (w.status || 'working') === 'working').map(w => h('option', { key: w.id, value: w.id }, w.name))
          )
        ),
        h('div', { style: { minWidth: 80 } },
          h('div', { style: S.lbl }, 'Цель (операций)'),
          h('select', { style: { ...S.inp, width: '100%', fontSize: 12 }, value: duelOps, onChange: e => setDuelOps(Number(e.target.value)) },
            [3, 5, 7, 10].map(n => h('option', { key: n, value: n }, n))
          )
        ),
        h('button', { style: abtn({ padding: '7px 14px' }), onClick: createDuel }, '⚔ Вызвать!'),
        h('button', { style: gbtn({ padding: '7px 10px' }), onClick: () => setShowDuelCreate(false) }, '✕')
      )
    ),

    // Активные дуэли
    myDuels.length > 0 && h('div', { style: { marginBottom: 8 } },
      myDuels.map(d => {
        const isChallenger = d.challengerId === myId;
        const myOpsCount = data.ops.filter(op => op.workerIds?.includes(myId) && op.status === 'done' && op.finishedAt >= d.createdAt).length;
        const oppId = isChallenger ? d.opponentId : d.challengerId;
        const oppOpsCount = data.ops.filter(op => op.workerIds?.includes(oppId) && op.status === 'done' && op.finishedAt >= d.createdAt).length;
        const myPct = Math.min(100, Math.round(myOpsCount / d.targetOps * 100));
        const oppPct = Math.min(100, Math.round(oppOpsCount / d.targetOps * 100));
        const oppName = isChallenger ? d.opponentName : d.challengerName;
        return h('div', { key: d.id, style: { ...S.card, padding: 10, marginBottom: 4, border: `0.5px solid ${AM}`, background: AM3 } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
            h('span', { style: { fontSize: 12, fontWeight: 500, color: AM2 } }, `⚔ Дуэль: ${d.targetOps} операций`),
            h('span', { style: { fontSize: 10, color: '#888' } }, fmtDur(now() - d.createdAt))
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            h('div', null,
              h('div', { style: { fontSize: 11, fontWeight: 500, color: myPct >= 100 ? GN : AM2 } }, `Я: ${myOpsCount}/${d.targetOps}`),
              h('div', { style: { height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 3 } }, h('div', { style: { height: 6, background: myPct >= 100 ? GN : AM, borderRadius: 3, width: `${myPct}%` } }))
            ),
            h('div', null,
              h('div', { style: { fontSize: 11, fontWeight: 500, color: oppPct >= 100 ? GN : '#888' } }, `${oppName}: ${oppOpsCount}/${d.targetOps}`),
              h('div', { style: { height: 6, background: 'rgba(0,0,0,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 3 } }, h('div', { style: { height: 6, background: oppPct >= 100 ? GN : '#ccc', borderRadius: 3, width: `${oppPct}%` } }))
            )
          )
        );
      })
    ),

    // Привязка к операции
    contextOp && (() => {
      const op = data.ops.find(o => o.id === contextOp);
      const order = op ? data.orders.find(o => o.id === op.orderId) : null;
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: AM3, borderRadius: 6, marginBottom: 6, fontSize: 11 } },
        h('span', { style: { color: AM } }, `📋 ${order?.number || '—'} → ${op?.name || '—'}`),
        h('button', { style: { background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 14, padding: 0 }, onClick: () => setContextOp('') }, '×')
      );
    })(),

    // Панель ввода
    h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
      // Кнопки инструментов
      h('div', { style: { display: 'flex', gap: 4 } },
        h('button', { type: 'button', title: 'Быстрые действия', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: showQuickActions ? AM3 : 'transparent' }, onClick: () => { setShowQuickActions(v => !v); setShowThanks(false); } }, '⚡'),
        h('button', { type: 'button', title: 'Спасибо коллеге', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: showThanks ? AM3 : 'transparent' }, onClick: () => { setShowThanks(v => !v); setShowQuickActions(false); setShowDuelCreate(false); } }, '🤝'),
        h('button', { type: 'button', title: 'Дуэль', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: showDuelCreate ? AM3 : 'transparent' }, onClick: () => { setShowDuelCreate(v => !v); setShowQuickActions(false); setShowThanks(false); } }, '⚔'),
        h('button', { type: 'button', title: 'Сотрудники', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: showPeople ? AM3 : 'transparent' }, onClick: () => setShowPeople(v => !v) }, '👥'),
        activeOp && h('button', { type: 'button', title: 'Привязать к текущей операции', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: contextOp ? AM3 : 'transparent' }, onClick: () => setContextOp(contextOp ? '' : activeOp.id) }, '📋'),
        isMaster && h('button', { type: 'button', title: 'Закрепить как объявление', style: { ...gbtn({ padding: '8px 10px', fontSize: 14 }), background: isAnnouncement ? AM3 : 'transparent' }, onClick: () => setIsAnnouncement(v => !v) }, '📌')
      ),
      h('input', { style: { ...S.inp, flex: 1, minWidth: 120 }, placeholder: isAnnouncement ? 'Объявление для всех...' : 'Сообщение...', value: newMessage, onChange: e => setNewMessage(e.target.value), onKeyDown: e => e.key === 'Enter' && !e.shiftKey && sendMessage(newMessage) }),
      h('button', { style: abtn({ padding: '10px 16px' }), onClick: () => sendMessage(newMessage) }, '→')
    ),

    // Каталог сотрудников
    showPeople && h('div', { style: { ...S.card, marginTop: 8, padding: 10, maxHeight: 300, overflowY: 'auto' } },
      h('div', { style: S.sec }, 'Сотрудники производства'),
      data.workers.filter(w => !w.archived).map(w => {
        const s = calcWorkerStats(w.id, data, Date.now());
        const lvl = getWorkerLevel(s.doneCount);
        return h('div', { key: w.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', cursor: 'pointer' }, onClick: () => { setViewProfileId(w.id); setShowPeople(false); } },
          h('div', { style: { width: 32, height: 32, borderRadius: '50%', background: AM3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: AM2, position: 'relative' } },
            w.name?.charAt(0) || '?',
            h('div', { style: { position: 'absolute', bottom: -2, right: -2, background: AM, color: '#fff', fontSize: 8, fontWeight: 500, borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, lvl)
          ),
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 12, fontWeight: 500 } }, w.name),
            h('div', { style: { fontSize: 10, color: '#888' } }, `${getLevelTitle(lvl)} · ${s.doneCount} оп. · 🤝${s.thanksReceived}`)
          ),
          (w.achievements || []).length > 0 && h('div', { style: { display: 'flex', gap: 2 } },
            (w.achievements || []).slice(0, 4).map(aid => h('span', { key: aid, style: { fontSize: 12 }, title: ACHIEVEMENTS[aid]?.title }, ACHIEVEMENTS[aid]?.icon || ''))
          ),
          w.id !== myId && h('button', { style: gbtn({ fontSize: 10, padding: '3px 8px' }), onClick: (e) => { e.stopPropagation(); sendThanks(w.id); setShowPeople(false); } }, '🤝')
        );
      })
    ),

    // Просмотр профиля сотрудника
    viewProfileId && (() => {
      const w = data.workers.find(w => w.id === viewProfileId);
      if (!w) return null;
      const s = calcWorkerStats(w.id, data, Date.now());
      const lvl = getWorkerLevel(s.doneCount);
      const quality = s.doneCount + s.defectCount > 0 ? Math.round(s.doneCount / (s.doneCount + s.defectCount) * 100) : 100;
      const earned = w.achievements || [];
      return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80 }, onClick: () => setViewProfileId(null) },
        h('div', { style: { background: '#fff', borderRadius: 12, padding: 20, width: 'min(380px, calc(100vw - 32px))', maxHeight: '85vh', overflowY: 'auto' }, onClick: e => e.stopPropagation() },
          // Шапка
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
            h('div', { style: { width: 52, height: 52, borderRadius: '50%', background: AM3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 500, color: AM2, position: 'relative' } },
              w.name?.charAt(0) || '?',
              h('div', { style: { position: 'absolute', bottom: -3, right: -3, background: AM, color: '#fff', fontSize: 11, fontWeight: 500, borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, lvl)
            ),
            h('div', { style: { flex: 1 } },
              h('div', { style: { fontSize: 16, fontWeight: 500 } }, w.name),
              h('div', { style: { fontSize: 12, color: AM } }, `${getLevelTitle(lvl)} · Уровень ${lvl}`),
              w.position && h('div', { style: { fontSize: 11, color: '#888' } }, w.position)
            ),
            h('button', { style: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888' }, onClick: () => setViewProfileId(null) }, '×')
          ),
          // Метрики
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 } },
            h('div', { style: { ...S.card, textAlign: 'center', padding: 8, marginBottom: 0 } }, h('div', { style: { fontSize: 16, fontWeight: 500, color: AM } }, s.doneCount), h('div', { style: { fontSize: 8, color: '#888', textTransform: 'uppercase' } }, 'Операций')),
            h('div', { style: { ...S.card, textAlign: 'center', padding: 8, marginBottom: 0 } }, h('div', { style: { fontSize: 16, fontWeight: 500, color: quality >= 95 ? GN : AM } }, `${quality}%`), h('div', { style: { fontSize: 8, color: '#888', textTransform: 'uppercase' } }, 'Качество')),
            h('div', { style: { ...S.card, textAlign: 'center', padding: 8, marginBottom: 0 } }, h('div', { style: { fontSize: 16, fontWeight: 500, color: '#F57F17' } }, s.thanksReceived), h('div', { style: { fontSize: 8, color: '#888', textTransform: 'uppercase' } }, 'Спасибо')),
            h('div', { style: { ...S.card, textAlign: 'center', padding: 8, marginBottom: 0 } }, h('div', { style: { fontSize: 16, fontWeight: 500 } }, earned.length), h('div', { style: { fontSize: 8, color: '#888', textTransform: 'uppercase' } }, 'Наград'))
          ),
          // Достижения
          earned.length > 0 && h('div', null,
            h('div', { style: S.sec }, `Награды (${earned.length}/${Object.keys(ACHIEVEMENTS).length})`),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
              earned.map(aid => {
                const a = ACHIEVEMENTS[aid];
                return a ? h('div', { key: aid, style: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: AM3, borderRadius: 6, fontSize: 11 }, title: a.desc },
                  h('span', { style: { fontSize: 14 } }, a.icon),
                  h('span', { style: { color: AM2, fontWeight: 500 } }, a.title)
                ) : null;
              })
            )
          ),
          // Кнопка благодарности
          w.id !== myId && h('button', { style: abtn({ width: '100%', padding: 12 }), onClick: () => { sendThanks(w.id); setViewProfileId(null); } }, `🤝 Сказать спасибо ${w.name.split(' ')[0]}`)
        )
      );
    })()
  );
});



