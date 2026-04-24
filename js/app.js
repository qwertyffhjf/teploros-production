// teploros · app.js
// Автоматически извлечено из монолита

// ==================== Таблица лидеров ====================
const Leaderboard = memo(({ data }) => {
  const workers = useMemo(() => data.workers.filter(w => !w.archived && (w.status || 'working') === 'working'), [data.workers]);
  const boards = useMemo(() => {
    const stats = workers.map(w => {
      const s = calcWorkerStats(w.id, data, Date.now());
      const doneCount = s.doneCount;
      const quality = s.doneCount + s.defectCount > 0 ? Math.round(s.doneCount / (s.doneCount + s.defectCount) * 100) : 100;
      const thanks = s.thanksReceived;
      const lvl = getWorkerLevel(doneCount);
      return { id: w.id, name: w.name, doneCount, quality, thanks, lvl, achCount: (w.achievements || []).length };
    });
    return {
      xp: [...stats].sort((a, b) => b.doneCount - a.doneCount).slice(0, 5),
      quality: [...stats].filter(s => s.doneCount >= 5).sort((a, b) => b.quality - a.quality || b.doneCount - a.doneCount).slice(0, 5),
      thanks: [...stats].filter(s => s.thanks > 0).sort((a, b) => b.thanks - a.thanks).slice(0, 5),
    };
  }, [workers, data]);

  const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
  const renderBoard = (title, list, valueKey, valueSuffix) => {
    if (list.length === 0) return null;
    return h('div', { style: { flex: 1, minWidth: 150 } },
      h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 500 } }, title),
      list.map((s, i) => h('div', { key: s.id, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12 } },
        h('span', { style: { fontSize: i < 3 ? 14 : 11, width: 22 } }, medals[i]),
        h('span', { style: { flex: 1, fontWeight: i === 0 ? 500 : 400 } }, s.name.split(' ')[0]),
        h('span', { style: { fontWeight: 500, color: AM } }, `${s[valueKey]}${valueSuffix}`)
      ))
    );
  };

  if (workers.length < 2) return null;
  return h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 0' } },
    renderBoard('Опыт', boards.xp, 'doneCount', ' оп.'),
    renderBoard('Качество', boards.quality, 'quality', '%'),
    boards.thanks.length > 0 && renderBoard('Благодарности', boards.thanks, 'thanks', '')
  );
});

// ==================== LoginScreen (единый PIN-вход, мастер-ключ для сброса PIN) ====================
const LoginScreen = ({ data, onLogin, onResetPin }) => {
  const [role, setRole] = useState('worker');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState('');
  // Состояние для режима сброса PIN мастер-ключом
  const [resetMode, setResetMode] = useState(false);
  const [resetKey, setResetKey] = useState('');
  const [resetTarget, setResetTarget] = useState(''); // id сотрудника
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const settings = data.settings || EMPTY_DATA.settings;

  // Карта PIN → роль и данные пользователя
  const resolvePin = (inputPin) => {
    const p = inputPin.trim();
    if (!p) return null;
    if (pinMatch(p, settings.masterPin || 'H_18D7OAL')) return { role: 'master', workerId: null, sectionId: null, name: 'Начальник цеха' };
    if (pinMatch(p, settings.controllerPin || 'H_18D8GW1')) return { role: 'controller', workerId: null, sectionId: null, name: 'Контролёр' };
    if (pinMatch(p, settings.warehousePin || 'H_18D99HH')) return { role: 'warehouse', workerId: null, sectionId: null, name: 'Склад' };
    if (pinMatch(p, settings.pdoPin || 'H_18DA22X')) return { role: 'pdo', workerId: null, sectionId: null, name: 'ПДО' };
    if (pinMatch(p, settings.directorPin || 'H_18DAUOD')) return { role: 'director', workerId: null, sectionId: null, name: 'Руководитель' };
    if (pinMatch(p, settings.hrPin || 'H_18DBN9T')) return { role: 'hr', workerId: null, sectionId: null, name: 'HR' };
    if (pinMatch(p, settings.shopMasterPin || 'H_18DCFV9')) return { role: 'shop_master', workerId: null, sectionId: null, name: 'Сменный мастер' };
    if (pinMatch(p, settings.adminPin || 'H_18DD8GP')) return { role: 'admin', workerId: null, sectionId: null, name: 'Администратор' };
    const worker = data.workers.find(w => pinMatch(p, w.pin));
    if (worker) return { role: 'worker', workerId: worker.id, sectionId: worker.sectionId || null, name: worker.name };
    return null;
  };

  const handleLogin = () => {
    setLoginError('');
    if (role === 'dashboard') { onLogin('dashboard', null, null); return; }
    if (!pin.trim()) { setLoginError('Введите PIN-код'); return; }
    const resolved = resolvePin(pin);
    if (!resolved) { setLoginError('Неверный PIN-код'); return; }
    // Если выбрали роль «Чат» — входим с правами сотрудника, но открываем чат
    if (role === 'chat') {
      if (resolved.role === 'worker') { onLogin('chat', resolved.workerId, resolved.sectionId); return; }
      // Мастер и контролёр тоже могут зайти в чат
      onLogin('chat_' + resolved.role, null, null);
      return;
    }
    // Обычный вход — роль определяется PIN-ом, кнопка выбора роли — подсказка, не ограничение
    onLogin(resolved.role, resolved.workerId, resolved.sectionId);
  };

  const handleMasterKeyReset = () => {
    setResetError(''); setResetSuccess('');
    if (!pinMatch(resetKey.trim(), settings.masterKey || 'H_18DETNL')) { setResetError('Неверный мастер-ключ'); return; }
    if (!resetTarget) { setResetError('Выберите сотрудника'); return; }
    if (!resetNewPin.trim() || resetNewPin.trim().length < 4) { setResetError('Новый PIN — минимум 4 цифры'); return; }
    // Проверяем что новый PIN не занят
    const conflict = data.workers.find(w => w.id !== resetTarget && pinMatch(resetNewPin.trim(), w.pin));
    if (conflict) { setResetError(`PIN уже занят (${conflict.name})`); return; }
    onResetPin(resetTarget, resetNewPin.trim());
    setResetSuccess(`PIN успешно сброшен`);
    setResetKey(''); setResetNewPin(''); setResetTarget('');
    setTimeout(() => { setResetMode(false); setResetSuccess(''); }, 2000);
  };

  const roleHints = {
    worker: 'PIN сотрудника',
    master: 'PIN мастера',
    controller: 'PIN контролёра',
    warehouse: 'PIN кладовщика',
    chat: 'Любой PIN для чата',
    dashboard: '',
  };

  if (resetMode) return h('div', { style: { minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, maxWidth: 360, margin: '0 auto' } },
    h('div', { style: { textAlign: 'center', marginBottom: 8 } },
      h('div', { style: { fontSize: 22, fontWeight: 500 } }, '🔑 Сброс PIN'),
      h('div', { style: { fontSize: 12, color: '#888', marginTop: 4 } }, 'Введите мастер-ключ для сброса любого PIN')
    ),
    h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', gap: 10 } },
      h('div', null,
        h('label', { style: S.lbl }, 'Мастер-ключ (аварийный сброс PIN)'),
        h('input', { type: 'password', inputMode: 'numeric', style: { ...S.inp, width: '100%', textAlign: 'center', fontSize: 20, letterSpacing: '0.3em' }, placeholder: '• • • •', value: resetKey, maxLength: 8, onChange: e => setResetKey(e.target.value) })
      ),
      h('div', null,
        h('label', { style: S.lbl }, 'Сотрудник'),
        h('select', { style: { ...S.inp, width: '100%' }, value: resetTarget, onChange: e => setResetTarget(e.target.value) },
          h('option', { value: '' }, '— выберите сотрудника —'),
          data.workers.map(w => h('option', { key: w.id, value: w.id }, w.name))
        )
      ),
      h('div', null,
        h('label', { style: S.lbl }, 'Новый PIN (минимум 4 цифры)'),
        h('input', { type: 'password', inputMode: 'numeric', style: { ...S.inp, width: '100%', textAlign: 'center', fontSize: 20, letterSpacing: '0.3em' }, placeholder: '• • • •', value: resetNewPin, maxLength: 8, onChange: e => setResetNewPin(e.target.value), onKeyDown: e => e.key === 'Enter' && handleMasterKeyReset() })
      )
    ),
    resetError && h('div', { role: 'alert', style: { color: RD, fontSize: 12, fontWeight: 500, textAlign: 'center' } }, resetError),
    resetSuccess && h('div', { role: 'status', style: { color: GN, fontSize: 12, fontWeight: 500, textAlign: 'center' } }, resetSuccess),
    h('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
      h('button', { style: gbtn({ flex: 1 }), onClick: () => { setResetMode(false); setResetKey(''); setResetNewPin(''); setResetTarget(''); setResetError(''); } }, '← Назад'),
      h('button', { style: abtn({ flex: 1 }), onClick: handleMasterKeyReset }, 'Сбросить PIN')
    )
  );

  return h('div', { style: { minHeight: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 } },
    h('div', { style: { textAlign: 'center', marginBottom: 16 } },
      h('div', { style: { fontSize: 32, fontWeight: 700, color: AM, lineHeight: 1.2 } }, settings.welcomeTitle || 'teploros'),
      h('div', { style: { fontSize: 14, color: '#888', letterSpacing: '0.15em', textTransform: 'uppercase' } }, settings.welcomeSubtitle || 'надежная техника')
    ),
    h('div', { style: { textAlign: 'center', marginBottom: 20 } },
      h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase', letterSpacing: '0.15em' } }, settings.welcomeLabel || 'Производственный учёт · НТ'),
      h('div', { style: { fontSize: 22, fontWeight: 500 } }, 'Вход в систему')
    ),
    // Кнопки выбора роли
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 } },
      // Производственный персонал
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' } },
        [
          ['worker',      '👷 Сотрудник'],
          ['shop_master', '🔧 Сменный мастер'],
          ['controller',  '🔍 Контролёр'],
          ['warehouse',   '📦 Склад'],
        ].map(([r, label]) => h('button', {
          key: r,
          style: role === r ? abtn({ minWidth: 110, fontSize: 12 }) : gbtn({ minWidth: 110, fontSize: 12 }),
          onClick: () => { setRole(r); setLoginError(''); setPin(''); }
        }, label))
      ),
      // Управленческий персонал
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' } },
        [
          ['pdo',      '📋 ПДО'],
          ['master',   '🔑 Начальник цеха'],
          ['director', '👔 Руководитель'],
          ['hr',       '👥 HR'],
          ['admin',    '⚙ Администратор'],
        ].map(([r, label]) => h('button', {
          key: r,
          style: role === r ? abtn({ minWidth: 110, fontSize: 12 }) : gbtn({ minWidth: 110, fontSize: 12 }),
          onClick: () => { setRole(r); setLoginError(''); setPin(''); }
        }, label))
      ),
      // Просмотр
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' } },
        [
          ['dashboard', '📊 Дашборд'],
          ['chat',      '💬 Чат'],
        ].map(([r, label]) => h('button', {
          key: r,
          style: role === r ? abtn({ minWidth: 110, fontSize: 12 }) : gbtn({ minWidth: 110, fontSize: 12 }),
          onClick: () => { setRole(r); setLoginError(''); setPin(''); }
        }, label))
      )
    ),
    // PIN-поле — для всех кроме дашборда
    role !== 'dashboard'
      ? h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
          h('div', { style: { position: 'relative', display: 'inline-block' } },
            h('input', {
              type: showPin ? 'text' : 'password', inputMode: 'numeric', autoFocus: true,
              style: { ...S.inp, width: 220, textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', padding: '10px 40px 10px 10px' },
              placeholder: '• • • •', value: pin,
              onChange: e => setPin(e.target.value),
              onKeyDown: e => e.key === 'Enter' && handleLogin(),
              maxLength: 8
            }),
            h('button', { type: 'button', style: { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 4, minHeight: 'auto' }, onClick: () => setShowPin(v => !v) }, showPin ? '🙈' : '👁')
          ),
          h('div', { style: { fontSize: 11, color: '#888' } }, roleHints[role] || 'Введите PIN-код')
        )
      : h('div', { style: { fontSize: 11, color: '#888', padding: '8px 0' } }, 'Открытый просмотр без PIN'),
    loginError && h('div', { role: 'alert', style: { color: RD, fontSize: 12, fontWeight: 500 } }, loginError),
    h('button', { style: abtn({ marginTop: 8, padding: '10px 40px', fontSize: 14 }), onClick: handleLogin }, 'Войти'),
    // Ссылка на сброс PIN мастер-ключом
    h('button', { style: { background: 'none', border: 'none', fontSize: 11, color: '#aaa', cursor: 'pointer', marginTop: 12, padding: 0, textDecoration: 'underline' }, onClick: () => setResetMode(true) }, 'Сбросить PIN мастер-ключом'),
    // Таблица лидеров
    h('div', { style: { width: '100%', maxWidth: 500, marginTop: 24, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 16 } },
      h(Leaderboard, { data })
    )
  );
};



// ==================== Dashboard (Цеховое табло) ====================
const Dashboard = memo(({ data, addToast, onOrderClick }) => {
  const [, setTick] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState([]);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 15000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const fetchOnline = () => Presence.getOnline().then(users => setOnlineUsers(users)).catch(() => {});
    fetchOnline();
    const t = setInterval(fetchOnline, 30000);
    return () => clearInterval(t);
  }, []);

  // Реальные данные
  const activeOps = useMemo(() => data.ops.filter(o => o.status === 'in_progress' && !o.archived), [data.ops]);
  const pendingOps = useMemo(() => data.ops.filter(o => o.status === 'pending' && !o.archived), [data.ops]);
  const onCheckOps = useMemo(() => data.ops.filter(o => o.status === 'on_check' && !o.archived), [data.ops]);
  const defectOps = useMemo(() => data.ops.filter(o => (o.status === 'defect' || o.status === 'rework') && !o.archived), [data.ops]);
  const doneToday = useMemo(() => { const t = new Date().setHours(0,0,0,0); return data.ops.filter(o => o.status === 'done' && o.finishedAt >= t); }, [data.ops]);
  const defectsToday = useMemo(() => { const t = new Date().setHours(0,0,0,0); return data.ops.filter(o => o.status === 'defect' && o.finishedAt >= t); }, [data.ops]);
  const downtimesToday = useMemo(() => { const t = new Date().setHours(0,0,0,0); return data.events.filter(e => e.type === 'downtime' && e.ts >= t); }, [data.events]);
  const totalDowntimeMin = useMemo(() => Math.round(downtimesToday.reduce((s, e) => s + (e.duration || 0), 0) / 60000), [downtimesToday]);
  const activeWorkers = useMemo(() => data.workers.filter(w => !w.archived && (w.status || 'working') === 'working'), [data.workers]);
  const busyWorkers = useMemo(() => new Set(activeOps.flatMap(op => op.workerIds || [])), [activeOps]);
  const freeWorkers = useMemo(() => activeWorkers.filter(w => !busyWorkers.has(w.id)), [activeWorkers, busyWorkers]);
  const criticalMaterials = useMemo(() => data.materials.filter(m => m.minStock && m.quantity <= m.minStock), [data.materials]);
  const activeOrders = useMemo(() => data.orders.filter(o => !o.archived), [data.orders]);
  const activeDuels = useMemo(() => (data.duels || []).filter(d => d.status === 'active'), [data.duels]);

  // Заказы с прогрессом
  const ordersProgress = useMemo(() => activeOrders.map(order => {
    const ops = data.ops.filter(op => op.orderId === order.id && !op.archived);
    const done = ops.filter(op => op.status === 'done').length;
    const total = ops.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const hasDefect = ops.some(op => op.status === 'defect' || op.status === 'rework');
    const daysLeft = order.deadline ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000) : null;
    return { ...order, ops, done, total, pct, hasDefect, daysLeft };
  }).sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)), [activeOrders, data.ops]);

  // Лидеры дня
  const todayLeaders = useMemo(() => {
    const t = new Date().setHours(0,0,0,0);
    const counts = {};
    data.ops.filter(op => op.status === 'done' && op.finishedAt >= t).forEach(op => {
      (op.workerIds || []).forEach(wid => { counts[wid] = (counts[wid] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([wid, count]) => ({
      name: data.workers.find(w => w.id === wid)?.name || '?', count
    }));
  }, [data.ops, data.workers]);

  const qualityToday = doneToday.length + defectsToday.length > 0 ? Math.round(doneToday.length / (doneToday.length + defectsToday.length) * 100) : 100;
  const mc = (color) => ({ ...S.card, textAlign: 'center', padding: '12px 8px', marginBottom: 0 });

  const exportToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.orders.map(o => ({ Номер: o.number, Изделие: o.product, Количество: o.qty, Дедлайн: o.deadline, Приоритет: PRIORITY[o.priority]?.label }))), 'Заказы');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.ops.map(op => ({ Заказ: data.orders.find(o => o.id === op.orderId)?.number, Операция: op.name, Статус: op.status, 'План,ч': op.plannedHours, Исполнители: (op.workerIds||[]).map(wid => data.workers.find(w => w.id === wid)?.name).join(', ') }))), 'Операции');
    XLSX.writeFile(wb, `production_${new Date().toISOString().slice(0,10)}.xlsx`);
    addToast('Экспорт завершён', 'success');
  }, [data, addToast]);

  return h('div', { style: { padding: '0 0 24px' } },
    // Заголовок с часами
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
      h('div', null,
        h('div', { style: { fontSize: 18, fontWeight: 500 } }, 'Цеховое табло'),
        h('div', { style: { fontSize: 11, color: '#888' } }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))
      ),
      h('div', { style: { textAlign: 'right' } },
        h('div', { style: { fontSize: 28, fontWeight: 500, fontFamily: 'monospace', color: AM } }, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        h('button', { style: gbtn({ fontSize: 10, padding: '3px 8px' }), onClick: exportToExcel }, '📥 Excel')
      )
    ),

    // Блок 1: Ключевые метрики дня
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 12 } },
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: GN } }, doneToday.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Выполнено')),
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: AM } }, activeOps.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'В работе')),
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: defectsToday.length > 0 ? RD : GN } }, defectsToday.length), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Брак')),
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: qualityToday >= 95 ? GN : qualityToday >= 80 ? AM : RD } }, `${qualityToday}%`), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Качество')),
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: totalDowntimeMin > 60 ? RD : AM } }, `${totalDowntimeMin}м`), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Простои')),
      h('div', { style: mc() }, h('div', { style: { fontSize: 32, fontWeight: 500, color: freeWorkers.length > 0 ? GN : AM } }, `${busyWorkers.size}/${activeWorkers.length}`), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Загрузка')),
      h('div', { style: { ...mc(), cursor: 'default', position: 'relative' }, title: onlineUsers.map(u => u.userName).join(', ') || 'Никого нет онлайн' },
        h('div', { style: { fontSize: 32, fontWeight: 500, color: onlineUsers.length > 0 ? GN : '#ccc' } }, onlineUsers.length),
        h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Онлайн'),
        onlineUsers.length > 0 && h('div', { style: { position: 'absolute', bottom: 4, left: 0, right: 0, fontSize: 9, color: '#aaa', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' } }, onlineUsers.map(u => u.userName).join(', '))
      )
    ),

    // Блок 2: Алерты (критические)
    (criticalMaterials.length > 0 || defectOps.length > 0 || ordersProgress.some(o => o.daysLeft !== null && o.daysLeft <= 2 && o.pct < 100)) && h('div', { style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12, padding: 10 } },
      h('div', { style: { fontSize: 10, color: RD, textTransform: 'uppercase', fontWeight: 500, marginBottom: 6 } }, '⚠ Требует внимания'),
      defectOps.length > 0 && h('div', { style: { marginBottom: 4 } },
        h('div', { style: { fontSize: 11, color: RD, fontWeight: 500, marginBottom: 4 } }, `⚠ ${defectOps.length} операций с браком/на переделке:`),
        defectOps.slice(0, 5).map(op => {
          const order = data.orders.find(o => o.id === op.orderId);
          const workers = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name?.split(' ')[0]).filter(Boolean).join(', ');
          return h('div', { key: op.id,
            style: { fontSize: 11, color: RD2, padding: '4px 8px', background: 'rgba(220,38,38,0.08)', borderRadius: 4, marginBottom: 3, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' },
            onClick: () => onTabChange && onTabChange('ops'),
            title: 'Нажмите чтобы перейти к операциям'
          },
            h('span', null, `${order?.number || '?'} — ${op.name}`),
            h('span', { style: { color: '#888', fontSize: 10 } }, op.status === 'rework' ? '🔧 переделка' : '✗ брак', workers ? ` · ${workers}` : '')
          );
        }),
        defectOps.length > 5 && h('div', { style: { fontSize: 10, color: RD, marginTop: 2 } }, `+${defectOps.length - 5} ещё...`)
      ),
      criticalMaterials.map(m => h('div', { key: m.id, style: { fontSize: 12, color: RD2, marginBottom: 2 } }, `Материал: ${m.name} — ${m.quantity} ${m.unit} (мин: ${m.minStock})`)),
      ordersProgress.filter(o => o.daysLeft !== null && o.daysLeft <= 2 && o.pct < 100).map(o => h('div', { key: o.id, style: { fontSize: 12, color: RD2, marginBottom: 2 } }, `Срок: ${o.number} — ${o.daysLeft <= 0 ? 'ПРОСРОЧЕН' : `${o.daysLeft} дн.`} (${o.pct}%)`))
    ),

    // Блок 3: Кто что делает (живая лента)
    h('div', { style: { ...S.card, marginBottom: 12, padding: 10 } },
      h('div', { style: S.sec }, `Сейчас в работе (${activeOps.length})`),
      activeOps.length === 0
        ? h('div', { style: { fontSize: 12, color: '#888', textAlign: 'center', padding: 8 } }, 'Нет активных операций')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
            activeOps.map(op => {
              const order = data.orders.find(o => o.id === op.orderId);
              const workers = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name?.split(' ')[0]).filter(Boolean);
              const elapsed = op.startedAt ? fmtDur(now() - op.startedAt) : '—';
              const isLong = op.plannedHours && op.startedAt && (now() - op.startedAt) > op.plannedHours * 3600000;
              return h('div', { key: op.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: isLong ? RD3 : '#f8f8f5', fontSize: 12 } },
                h('div', { style: { width: 8, height: 8, borderRadius: '50%', background: isLong ? RD : GN, flexShrink: 0 } }),
                h('span', { style: { fontWeight: 500, minWidth: 100 } }, workers.join(', ') || '—'),
                h('span', { style: { color: AM, flex: 1 } }, op.name),
                h('span', { style: { fontSize: 10, color: '#888' } }, order?.number),
                h('span', { style: { fontFamily: 'monospace', fontSize: 11, color: isLong ? RD : '#888' } }, elapsed)
              );
            })
          ),
      // Свободные рабочие
      freeWorkers.length > 0 && h('div', { style: { marginTop: 8, paddingTop: 8, borderTop: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { fontSize: 10, color: GN, marginBottom: 4 } }, `Свободны (${freeWorkers.length}):`),
        h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
          freeWorkers.map(w => h('span', { key: w.id, style: { padding: '2px 8px', background: GN3, color: GN2, borderRadius: 6, fontSize: 11 } }, w.name.split(' ')[0]))
        )
      )
    ),

    // Блок 4: Прогресс заказов
    h('div', { style: { ...S.card, marginBottom: 12, padding: 10 } },
      h('div', { style: S.sec }, `Заказы (${activeOrders.length})`),
      ordersProgress.length === 0
        ? h('div', { style: { fontSize: 12, color: '#888', textAlign: 'center', padding: 8 } }, 'Нет активных заказов')
        : ordersProgress.map(o => h('div', { key: o.id, style: { marginBottom: 8 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 } },
                onOrderClick
                  ? h('span', { style: { fontWeight: 500, color: AM, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }, onClick: () => onOrderClick(o.id), title: 'Открыть карточку' }, o.number)
                  : h('span', { style: { fontWeight: 500 } }, o.number),
                h('span', { style: { color: '#888' } }, o.product),
                o.hasDefect && h('span', { style: { fontSize: 10, color: RD, fontWeight: 500 } }, '⚠'),
                o.daysLeft !== null && h('span', { style: { fontSize: 10, padding: '1px 6px', borderRadius: 4, background: o.daysLeft <= 0 ? RD3 : o.daysLeft <= 3 ? AM3 : GN3, color: o.daysLeft <= 0 ? RD : o.daysLeft <= 3 ? AM2 : GN2 } }, o.daysLeft <= 0 ? 'просрочен' : `${o.daysLeft}д`)
              ),
              h('span', { style: { fontSize: 11, fontWeight: 500, color: o.pct === 100 ? GN : AM } }, `${o.done}/${o.total}`)
            ),
            h('div', { style: { height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' } },
              h('div', { style: { height: 6, background: o.pct === 100 ? GN : o.hasDefect ? RD : AM, borderRadius: 3, width: `${o.pct}%`, transition: 'width 0.3s' } })
            )
          ))
    ),

    // Блок 5: Лидеры дня + активные дуэли
    (todayLeaders.length > 0 || activeDuels.length > 0) && h('div', { style: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' } },
      todayLeaders.length > 0 && h('div', { style: { ...S.card, flex: 1, minWidth: 160, padding: 10, marginBottom: 0 } },
        h('div', { style: S.sec }, 'Лидеры дня'),
        todayLeaders.map((l, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 12 } },
          h('span', { style: { fontSize: i < 3 ? 14 : 11, width: 22 } }, ['🥇','🥈','🥉'][i] || `${i+1}.`),
          h('span', { style: { flex: 1, fontWeight: i === 0 ? 500 : 400 } }, l.name),
          h('span', { style: { fontWeight: 500, color: AM } }, `${l.count} оп.`)
        ))
      ),
      activeDuels.length > 0 && h('div', { style: { ...S.card, flex: 1, minWidth: 160, padding: 10, marginBottom: 0 } },
        h('div', { style: S.sec }, `⚔ Дуэли (${activeDuels.length})`),
        activeDuels.map(d => {
          const ch = data.ops.filter(op => op.workerIds?.includes(d.challengerId) && op.status === 'done' && op.finishedAt >= d.createdAt).length;
          const op = data.ops.filter(op => op.workerIds?.includes(d.opponentId) && op.status === 'done' && op.finishedAt >= d.createdAt).length;
          return h('div', { key: d.id, style: { fontSize: 11, padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } },
              h('span', null, `${d.challengerName.split(' ')[0]} vs ${d.opponentName.split(' ')[0]}`),
              h('span', { style: { color: AM, fontWeight: 500 } }, `${ch}:${op} / ${d.targetOps}`)
            )
          );
        })
      )
    ),

    // Блок 6: Очередь на контроле
    onCheckOps.length > 0 && h('div', { style: { ...S.card, marginBottom: 12, padding: 10 } },
      h('div', { style: S.sec }, `На контроле качества (${onCheckOps.length})`),
      onCheckOps.map(op => {
        const order = data.orders.find(o => o.id === op.orderId);
        const workers = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name?.split(' ')[0]).filter(Boolean);
        return h('div', { key: op.id, style: { display: 'flex', gap: 8, padding: '4px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 12 } },
          h('span', { style: { fontWeight: 500 } }, op.name),
          h('span', { style: { color: '#888' } }, order?.number),
          h('span', { style: { color: AM } }, workers.join(', '))
        );
      })
    ),

    // Блок 7: Ожидающие операции (если много)
    pendingOps.length > 5 && h('div', { style: { ...S.card, marginBottom: 12, padding: 10 } },
      h('div', { style: S.sec }, `Ожидают запуска (${pendingOps.length})`),
      h('div', { style: { fontSize: 12, color: '#888' } },
        (data.productionStages || []).map(s => {
          const count = pendingOps.filter(op => op.name === s.name).length;
          return count > 0 ? h('span', { key: s.id, style: { display: 'inline-block', padding: '3px 8px', background: '#f8f8f5', borderRadius: 6, margin: '2px 3px', fontSize: 11 } }, `${s.name}: ${count}`) : null;
        })
      )
    )
  );
});



// ==================== Error Boundary ====================
// Перехватывает ошибки React-дерева и показывает читаемое сообщение
// вместо белого экрана
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 16 }
      },
        React.createElement('div', { style: { fontSize: 48 } }, '⚠️'),
        React.createElement('div', { style: { fontSize: 20, fontWeight: 500, color: '#1a1a18' } }, 'Что-то пошло не так'),
        React.createElement('div', { style: { fontSize: 14, color: '#888', maxWidth: 400 } }, 'Произошла ошибка в приложении. Данные в Firebase не затронуты — обновите страницу для восстановления работы.'),
        React.createElement('div', { style: { fontFamily: 'monospace', fontSize: 11, color: '#E24B4A', background: '#FCEBEB', border: '0.5px solid #E24B4A', borderRadius: 8, padding: '8px 16px', maxWidth: 500, wordBreak: 'break-all' } },
          this.state.error?.message || 'Неизвестная ошибка'
        ),
        React.createElement('button', {
          style: { padding: '10px 28px', background: '#EF9F27', color: '#412402', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
          onClick: () => { this.setState({ hasError: false, error: null }); window.location.reload(); }
        }, '🔄 Перезагрузить страницу'),
        React.createElement('button', {
          style: { padding: '8px 20px', background: 'transparent', color: '#888', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 8, cursor: 'pointer', fontSize: 13 },
          onClick: () => this.setState({ hasError: false, error: null })
        }, 'Попробовать продолжить без перезагрузки')
      );
    }
    return this.props.children;
  }
}

// ==================== OrderDetailModal ====================
const OrderDetailModal = memo(({ orderId, data, onClose }) => {
  // ── Все хуки ПЕРЕД любым условным return (Rules of Hooks) ──

  // O(n) сортировка через Map индексов этапов
  const ops = useMemo(() => {
    const stageIndex = new Map((data.productionStages || []).map((s, i) => [s.name, i]));
    return data.ops
      .filter(o => o.orderId === orderId && !o.archived)
      .sort((a, b) => (stageIndex.get(a.name) ?? 99) - (stageIndex.get(b.name) ?? 99));
  }, [data.ops, data.productionStages, orderId]);

  // Себестоимость — зависит только от нужных массивов, не от объекта order
  const cost = useMemo(
    () => calcOrderCost({ id: orderId }, data),
    [orderId, data.ops, data.materialConsumptions, data.materials]
  );

  const reclamations = useMemo(
    () => (data.reclamations || []).filter(r => r.orderId === orderId),
    [data.reclamations, orderId]
  );

  // Ранний return — только после всех хуков
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return null;

  const doneOps   = ops.filter(o => o.status === 'done');
  const activeOps = ops.filter(o => o.status === 'in_progress');
  const defectOps = ops.filter(o => o.status === 'defect' || o.status === 'rework');
  const checkOps  = ops.filter(o => o.status === 'on_check');
  const pct = ops.length > 0 ? Math.round(doneOps.length / ops.length * 100) : 0;

  const priority = PRIORITY[order.priority] || PRIORITY.medium;
  const daysLeft = order.deadline
    ? Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000)
    : null;
  const deadlineColor = daysLeft === null ? '#888' : daysLeft < 0 ? RD : daysLeft <= 2 ? AM : GN;

  // Lead time
  const finishedDates = doneOps.filter(o => o.finishedAt).map(o => o.finishedAt);
  const startedDates  = ops.filter(o => o.startedAt).map(o => o.startedAt);
  const leadTime = finishedDates.length && startedDates.length
    ? fmtDur(Math.max(...finishedDates) - Math.min(...startedDates)) : '—';

  return h('div', {
    role: 'dialog', 'aria-modal': 'true', 'aria-label': `Заказ ${order.number}`,
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, overflowY: 'auto', padding: '16px 8px' },
    onClick: e => { if (e.target === e.currentTarget) onClose(); }
  },
    h('div', { style: { background: '#fff', borderRadius: 14, width: 'min(700px, 100%)', maxHeight: 'none', boxShadow: '0 8px 40px rgba(0,0,0,0.22)' } },

      // ── Шапка ──
      h('div', { style: { padding: '18px 20px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        h('div', null,
          h('div', { style: { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 } }, 'Заказ'),
          h('div', { style: { fontSize: 22, fontWeight: 600, color: AM2, lineHeight: 1.1 } }, order.number),
          h('div', { style: { fontSize: 14, color: '#444', marginTop: 4 } }, order.product),
          h('div', { style: { display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' } },
            h('span', { style: { padding: '3px 10px', borderRadius: 8, background: AM3, color: AM2, fontSize: 11, fontWeight: 500 } }, `Кол-во: ${order.qty}`),
            h('span', { style: { padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, color: priority.color, background: '#f5f5f2', border: `0.5px solid ${priority.color}` } }, priority.label),
            order.deadline && h('span', { style: { padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500, color: deadlineColor, background: '#f5f5f2' } },
              `📅 ${order.deadline}${daysLeft !== null ? ` (${daysLeft < 0 ? `просрочен ${Math.abs(daysLeft)}д` : daysLeft === 0 ? 'сегодня' : `${daysLeft}д`})` : ''}`
            ),
            h('span', { style: { padding: '3px 10px', borderRadius: 8, fontSize: 11, color: '#888', background: '#f5f5f2' } }, `Lead time: ${leadTime}`)
          )
        ),
        h('button', { onClick: onClose, 'aria-label': 'Закрыть', style: { background: 'none', border: 'none', fontSize: 24, color: '#aaa', cursor: 'pointer', lineHeight: 1, padding: 4 } }, '×')
      ),

      // ── Прогресс ──
      h('div', { style: { padding: '14px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
          h('div', { style: { fontSize: 12, fontWeight: 500 } }, `Выполнено операций: ${doneOps.length} / ${ops.length}`),
          h('div', { style: { fontSize: 14, fontWeight: 600, color: pct === 100 ? GN : AM } }, `${pct}%`)
        ),
        h('div', { style: { height: 10, background: '#f0ede8', borderRadius: 6, overflow: 'hidden' } },
          h('div', { style: { height: '100%', width: `${pct}%`, background: pct === 100 ? GN : AM, borderRadius: 6, transition: 'width .3s' } })
        ),
        h('div', { style: { display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' } },
          activeOps.length > 0 && h('span', { style: { fontSize: 11, color: AM2 } }, `▶ В работе: ${activeOps.length}`),
          checkOps.length > 0  && h('span', { style: { fontSize: 11, color: '#0277BD' } }, `🔍 Контроль: ${checkOps.length}`),
          defectOps.length > 0 && h('span', { style: { fontSize: 11, color: RD } }, `⚠ Проблемы: ${defectOps.length}`),
          ops.filter(o => o.status === 'pending').length > 0 && h('span', { style: { fontSize: 11, color: '#888' } }, `⏳ Ожидают: ${ops.filter(o => o.status === 'pending').length}`)
        )
      ),

      // ── Операции ──
      h('div', { style: { padding: '14px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: S.sec }, 'Операции'),
        ops.length === 0
          ? h('div', { style: { fontSize: 12, color: '#888' } }, 'Нет операций')
          : h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
              h('thead', null, h('tr', null,
                ['Операция', 'Исполнитель', 'Статус', 'Длительность', 'vs план'].map((t, i) =>
                  h('th', { key: i, style: S.th }, t))
              )),
              h('tbody', null, ops.map(op => {
                const workers = (op.workerIds || []).map(id => data.workers.find(w => w.id === id)?.name).filter(Boolean);
                const dur = op.startedAt && op.finishedAt ? op.finishedAt - op.startedAt
                  : op.startedAt ? Date.now() - op.startedAt : null;
                const vsplan = dur && op.plannedHours
                  ? Math.round(dur / (op.plannedHours * 3600000) * 100)
                  : null;
                const vsColor = vsplan === null ? '#888' : vsplan <= 100 ? GN : vsplan <= 130 ? AM : RD;
                return h('tr', { key: op.id, style: { background: op.status === 'defect' ? RD3 : op.status === 'in_progress' ? AM3 : 'transparent' } },
                  h('td', { style: { ...S.td, fontWeight: 500 } },
                    op.name,
                    op.defectNote && h('div', { style: { fontSize: 10, color: RD, marginTop: 2 } }, op.defectNote)
                  ),
                  h('td', { style: { ...S.td, fontSize: 11 } }, workers.join(', ') || h('span', { style: { color: '#ccc' } }, '—')),
                  h('td', { style: S.td }, h(Badge, { st: op.status })),
                  h('td', { style: { ...S.td, fontFamily: 'monospace', fontSize: 11 } },
                    dur ? fmtDur(dur) + (op.status === 'in_progress' ? ' ↻' : '') : '—'
                  ),
                  h('td', { style: { ...S.td, fontFamily: 'monospace', fontSize: 11, color: vsColor, fontWeight: vsplan ? 500 : 400 } },
                    vsplan !== null ? `${vsplan}%` : op.plannedHours ? `план ${op.plannedHours}ч` : '—'
                  )
                );
              }))
            ))
      ),

      // ── Себестоимость ──
      h('div', { style: { padding: '14px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: S.sec }, 'Себестоимость'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 } },
          h('div', { style: { textAlign: 'center', padding: '10px 8px', background: '#f8f8f5', borderRadius: 8 } },
            h('div', { style: { fontSize: 18, fontWeight: 600, color: AM2 } }, `${cost.laborHours}ч`),
            h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Трудозатраты')
          ),
          h('div', { style: { textAlign: 'center', padding: '10px 8px', background: '#f8f8f5', borderRadius: 8 } },
            h('div', { style: { fontSize: 18, fontWeight: 600, color: AM2 } }, `${cost.materialCost.toLocaleString()}₽`),
            h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Материалы')
          ),
          h('div', { style: { textAlign: 'center', padding: '10px 8px', background: AM3, borderRadius: 8 } },
            h('div', { style: { fontSize: 18, fontWeight: 600, color: AM2 } }, `${cost.totalCost.toLocaleString()}₽`),
            h('div', { style: { fontSize: 10, color: AM4, textTransform: 'uppercase' } }, 'Итого')
          )
        )
      ),

      // ── Дефекты / рекламации ──
      (defectOps.length > 0 || reclamations.length > 0) && h('div', { style: { padding: '14px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' } },
        h('div', { style: S.sec }, 'Дефекты и рекламации'),
        defectOps.length > 0 && h('div', { style: { marginBottom: 8 } },
          defectOps.map(op => {
            const reason = (data.defectReasons || []).find(r => r.id === op.defectReasonId);
            return h('div', { key: op.id, style: { padding: '6px 10px', background: RD3, borderRadius: 6, marginBottom: 4, fontSize: 12 } },
              h('span', { style: { fontWeight: 500, color: RD2 } }, op.name),
              reason && h('span', { style: { color: '#666', marginLeft: 8 } }, `· ${reason.name}`),
              op.defectNote && h('span', { style: { color: '#888', marginLeft: 8 } }, op.defectNote)
            );
          })
        ),
        reclamations.length > 0 && h('div', { style: { fontSize: 12, color: '#666' } },
          `Рекламаций: ${reclamations.length} (${reclamations.filter(r => r.status === 'open').length} открытых)`
        )
      ),

      // ── Кнопки PDF ──
      h('div', { style: { padding: '14px 20px', display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { style: gbtn({ fontSize: 12 }), onClick: () => generateRouteSheet(order, data) }, '📋 Маршрутный лист'),
        h('button', { style: gbtn({ fontSize: 12 }), onClick: () => generateFullPassport(order, data) }, '📄 Паспорт изделия'),
        h('button', { style: gbtn({ fontSize: 12 }), onClick: onClose }, 'Закрыть')
      )
    )
  );
});

// Вспомогательная функция маршрутного листа (вынесена наружу для переиспользования)


function generateRouteSheet(order, data) {
  const orderOps = (data?.ops || []).filter(op => op.orderId === order.id && !op.archived);
  const docDefinition = {
    content: [
      { text: 'Маршрутный лист', style: 'header' },
      { text: `Заказ №: ${order.number}`, style: 'subheader' },
      { text: `Изделие: ${order.product}`, margin: [0,0,0,10] },
      { text: `Количество: ${order.qty}`, margin: [0,0,0,20] },
      { table: { headerRows: 1, widths: ['auto','auto','auto','auto'], body: [
        ['Операция','Исполнитель','План. время','Отметка'],
        ...orderOps.map(op => [
          op.name,
          (op.workerIds||[]).map(id => (data?.workers||[]).find(w=>w.id===id)?.name).filter(Boolean).join(', ') || '—',
          op.plannedHours ? `${op.plannedHours} ч` : '—',
          { text: '' }
        ])
      ]}}
    ],
    styles: { header: { fontSize: 18, bold: true, margin:[0,0,0,10] }, subheader: { fontSize: 14, bold: true, margin:[0,10,0,5] } }
  };
  pdfMake.createPdf(docDefinition).download(`route_${order.number}.pdf`);
}

// ==================== InstallPromptBanner ====================
const InstallPromptBanner = memo(() => {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    // Уже установлено как PWA
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;
    // Свёрнуто в этой сессии
    if (sessionStorage.getItem('pwa_minimized')) { setMinimized(true); setShow(true); return; }

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    if (ios) { setIsIOS(true); setShow(true); return; }

    // Проверяем глобально пойманный prompt (из core.js)
    if (window._pwaPrompt) {
      promptRef.current = window._pwaPrompt;
      setHasPrompt(true);
      setShow(true);
      return;
    }

    // Слушаем если ещё не пойман
    const handler = (e) => { e.preventDefault(); promptRef.current = e; window._pwaPrompt = e; setHasPrompt(true); setShow(true); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setShow(false); window._pwaPrompt = null; });
    // Fallback — показываем инструкцию через 2 сек
    const fallback = setTimeout(() => { if (!promptRef.current) setShow(true); }, 2000);
    return () => { window.removeEventListener('beforeinstallprompt', handler); clearTimeout(fallback); };
  }, []);

  const handleInstall = async () => {
    const prompt = promptRef.current || window._pwaPrompt;
    if (!prompt) return;
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setShow(false);
    } catch(e) { /* prompt уже использован */ }
    promptRef.current = null;
    window._pwaPrompt = null;
    setHasPrompt(false);
  };

  const handleMinimize = () => {
    setMinimized(true);
    sessionStorage.setItem('pwa_minimized', '1');
  };

  if (!show) return null;

  // Мини-кнопка (после сворачивания)
  if (minimized) return h('button', {
    'aria-label': 'Установить приложение',
    style: {
      position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      right: 16, zIndex: 490,
      background: AM, color: AM2, border: 'none',
      borderRadius: '50%', width: 48, height: 48,
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      cursor: 'pointer', fontSize: 22, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      minHeight: 48
    },
    onClick: () => { setMinimized(false); sessionStorage.removeItem('pwa_minimized'); }
  }, '📲');

  // Инструкция для Android без beforeinstallprompt
  const androidInstructions = h('div', { style: { fontSize: 12, color: '#bbb', lineHeight: 1.5 } },
    'Нажмите ',
    h('span', { style: { color: AM, fontWeight: 500 } }, '⋮ (меню браузера)'),
    ' → ',
    h('span', { style: { color: AM, fontWeight: 500 } }, '«Установить приложение»'),
    ' или ',
    h('span', { style: { color: AM, fontWeight: 500 } }, '«Добавить на главный экран»')
  );

  return h('div', {
    role: 'banner',
    style: {
      position: 'fixed',
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      left: 16, right: 16, zIndex: 490,
      background: '#1a1a18', color: '#fff',
      borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      maxWidth: 480, margin: '0 auto'
    }
  },
    h('div', { style: { fontSize: 28, lineHeight: 1, flexShrink: 0 } }, '📲'),
    h('div', { style: { flex: 1 } },
      h('div', { style: { fontWeight: 600, fontSize: 14, marginBottom: 4 } }, 'Установить teploros'),
      isIOS
        ? h('div', { style: { fontSize: 12, color: '#bbb', lineHeight: 1.5 } },
            'Нажмите ',
            h('span', { style: { color: AM, fontWeight: 500 } }, '«Поделиться»'),
            ' → ',
            h('span', { style: { color: AM, fontWeight: 500 } }, '«На экран «Домой»»'),
            ' — и приложение всегда под рукой'
          )
        : hasPrompt
          ? h('div', null,
              h('div', { style: { fontSize: 12, color: '#bbb', marginBottom: 10, lineHeight: 1.5 } },
                'Работает офлайн, открывается без браузера, занимает < 1 МБ'
              ),
              h('button', {
                style: { ...abtn({ fontSize: 13, padding: '8px 20px' }) },
                onClick: handleInstall
              }, 'Установить')
            )
          : androidInstructions
    ),
    h('button', {
      onClick: handleMinimize,
      'aria-label': 'Свернуть',
      style: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 22, padding: '0 0 0 4px', lineHeight: 1, flexShrink: 0, minHeight: 'auto' }
    }, '×')
  );
});



// ==================== ShopMasterScreen (Сменный мастер) ====================
const ShopMasterScreen = memo(({ data, onUpdate, addToast, onOrderClick }) => {
  const [tab, setTab] = useState('ops');
  const { ask: askConfirm, confirmEl } = useConfirm();

  const activeOps = useMemo(() => data.ops.filter(o => o.status === 'in_progress' && !o.archived), [data.ops]);
  const pendingOps = useMemo(() => data.ops.filter(o => o.status === 'pending' && !o.archived), [data.ops]);
  const freeWorkers = useMemo(() => {
    const busy = new Set(activeOps.flatMap(o => o.workerIds || []));
    return data.workers.filter(w => !w.archived && (w.status || 'working') === 'working' && !busy.has(w.id));
  }, [data.workers, activeOps]);
  const alerts = useMemo(() => {
    const res = [];
    data.ops.filter(o => o.status === 'defect' && !o.archived).forEach(o => {
      const order = data.orders.find(x => x.id === o.orderId);
      res.push({ type: 'defect', text: `Брак: ${o.name}${order ? ` · ${order.number}` : ''}`, id: o.id });
    });
    activeOps.forEach(o => {
      if (o.plannedHours && o.startedAt && (now() - o.startedAt) > o.plannedHours * 3600000 * 1.5) {
        res.push({ type: 'overtime', text: `Превышение времени: ${o.name}`, id: o.id });
      }
    });
    return res;
  }, [data.ops, activeOps]);

  const TABS = [['ops','Операции'],['orders','Заказы'],['auxops','Доп. работы'],['journal','Журнал'],['notifications','Уведомления']];

  return h('div', null,
    confirmEl,
    h(SectionAnalytics, { section: 'production', data }),
    // Алерты
    alerts.length > 0 && h('div', { style: { background: RD3, border: `0.5px solid ${RD}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12 } },
      h('div', { style: { fontSize: 10, color: RD2, fontWeight: 500, textTransform: 'uppercase', marginBottom: 4 } }, '⚠ Требует внимания'),
      alerts.map((a, i) => h('div', { key: i, style: { fontSize: 12, color: RD2, marginBottom: 2 } }, a.text))
    ),
    // Быстрая сводка
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 14 } },
      h(MC, { v: activeOps.length, l: 'В работе', c: AM }),
      h(MC, { v: pendingOps.length, l: 'Ожидают', c: '#0277BD' }),
      h(MC, { v: freeWorkers.length, l: 'Свободны', c: freeWorkers.length > 0 ? GN : '#888' })
    ),
    // Вкладки
    h(TabBar, { tabs: TABS, tab, setTab }),
    tab === 'ops'           && h(MasterOps,           { data, onUpdate, addToast, onOrderClick }),
    tab === 'orders'        && h(MasterOrders,         { data, onUpdate, addToast, onOrderClick }),
    tab === 'auxops'        && h(AuxOpsViewer,         { data, onUpdate, addToast }),
    tab === 'journal'       && h(MasterJournal,        { data }),
    tab === 'notifications' && h(MasterNotifications,  { data })
  );
});

// ==================== PDOScreen (ПДО) ====================
const PDOScreen = memo(({ data, onUpdate, addToast, onOrderClick }) => {
  const [tab, setTab] = useState('orders');
  const TABS = [['orders','Заказы'],['ops','Операции'],['recommend','Назначения'],['kanban','Канбан'],['gantt','Гант'],['calendar','Загрузка'],['plan','План'],['reports','Отчёты'],['auxops','Доп. работы'],['journal','Журнал'],['notifications','Уведомления']];

  const overdueOrders = useMemo(() => data.orders.filter(o => !o.archived && o.deadline && new Date(o.deadline) < new Date()).length, [data.orders]);
  const activeOrders  = useMemo(() => data.orders.filter(o => !o.archived).length, [data.orders]);
  const inProgOps     = useMemo(() => data.ops.filter(o => o.status === 'in_progress' && !o.archived).length, [data.ops]);

  return h('div', null,
    h(SectionAnalytics, { section: 'production', data }),
    // Сводка
    h('div', { className: 'metrics-grid', style: { display:'grid', gap:8, marginBottom:14 } },
      h(MC, { v: activeOrders, l: 'Заказов' }),
      h(MC, { v: overdueOrders, l: 'Просрочено', c: overdueOrders > 0 ? RD : GN }),
      h(MC, { v: inProgOps, l: 'В работе', c: AM })
    ),
    // Вкладки
    h(TabBar, { tabs: TABS, tab, setTab }),
    tab === 'orders'        && h(MasterOrders,              { data, onUpdate, addToast, onOrderClick }),
    tab === 'ops'           && h(MasterOps,                 { data, onUpdate, addToast, onOrderClick }),
    tab === 'recommend'     && h(AssignmentRecommendations, { data, onUpdate, addToast }),
    tab === 'kanban'        && h(MasterKanban,              { data, onUpdate, addToast }),
    tab === 'gantt'         && h(GanttChart,                { data }),
    tab === 'calendar'      && h(ResourceCalendar,          { data, onUpdate, addToast }),
    tab === 'plan'          && h(MasterTodayPlan,           { data }),
    tab === 'reports'       && h(ReportsBuilder,            { data }),
    tab === 'auxops'        && h(AuxOpsViewer,              { data, onUpdate, addToast }),
    tab === 'journal'       && h(MasterJournal,             { data }),
    tab === 'notifications' && h(MasterNotifications,       { data })
  );
});

// ==================== DirectorScreen (Руководитель) ====================
const DirectorScreen = memo(({ data, onUpdate, addToast, onOrderClick }) => {
  const [tab, setTab] = useState('overview');
  const TABS = [['overview','Обзор'],['monthly','Отчёт месяца'],['analytics','Аналитика'],['reports','Отчёты'],['kpi','KPI / Премии'],['reclamations','Рекламации'],['auxops','Доп. работы'],['orders','Заказы'],['kanban','Канбан']];

  const period30 = useMemo(() => Date.now() - 30 * 86400000, [data]); // пересчитывается при обновлении данных
  const doneOps    = useMemo(() => data.ops.filter(o => o.status === 'done'   && o.finishedAt >= period30).length, [data.ops, period30]);
  const defectOps  = useMemo(() => data.ops.filter(o => o.status === 'defect' && o.finishedAt >= period30).length, [data.ops, period30]);
  const quality    = doneOps + defectOps > 0 ? Math.round(doneOps / (doneOps + defectOps) * 100) : 100;
  const overdue    = useMemo(() => data.orders.filter(o => !o.archived && o.deadline && new Date(o.deadline) < new Date()).length, [data.orders]);
  const recCount   = useMemo(() => (data.reclamations || []).filter(r => r.status !== 'closed').length, [data.reclamations]);
  const downtime   = useMemo(() => Math.round(data.events.filter(e => e.type === 'downtime' && e.ts >= period30).reduce((s, e) => s + (e.duration || 0), 0) / 3600000), [data.events, period30]);

  // Топ проблем для обзора
  const topIssues = useMemo(() => {
    const issues = [];
    const wmap = {};
    data.ops.filter(o => o.status === 'defect' && o.finishedAt >= period30).forEach(o => {
      (o.workerIds||[]).forEach(wid => { wmap[wid] = (wmap[wid]||0)+1; });
    });
    const topWorker = Object.entries(wmap).sort((a,b)=>b[1]-a[1])[0];
    if (topWorker) {
      const w = data.workers.find(x=>x.id===topWorker[0]);
      if (w) issues.push({ title:`Брак: ${w.name.split(' ')[0]}`, sub:`${topWorker[1]} случаев за 30 дней`, sev:'high' });
    }
    // Просроченные заказы
    if (overdue > 0) issues.push({ title:`Просрочено заказов: ${overdue}`, sub:'требуют немедленного внимания', sev:'critical' });
    // Рекламации
    if (recCount > 0) issues.push({ title:`Рекламации: ${recCount}`, sub:'открытых и в работе', sev: recCount > 3 ? 'high' : 'medium' });
    return issues;
  }, [data, overdue, recCount]);

  const sevColor = { critical: RD2, high: AM4, medium: '#888' };
  const sevBg    = { critical: RD3,  high: AM3,  medium: '#f5f5f2' };

  return h('div', null,
    h(SectionAnalytics, { section: 'production', data }),
    // KPI сводка
    h('div', { className:'metrics-grid', style:{ display:'grid', gap:8, marginBottom:14 } },
      h(MC, { v: `${quality}%`, l: 'Качество', c: quality>=95?GN:quality>=85?AM:RD }),
      h(MC, { v: overdue, l: 'Просрочено', c: overdue>0?RD:GN }),
      h(MC, { v: recCount, l: 'Рекламации', c: recCount>0?AM:GN }),
      h(MC, { v: `${downtime}ч`, l: 'Простоев/мес' })
    ),
    // Вкладки
    h(TabBar, { tabs: TABS, tab, setTab }),
    // Обзор — топ проблем
    tab === 'overview' && h('div', null,
      h('div', { style:{ fontSize:12, fontWeight:500, marginBottom:10 } }, 'Ключевые проблемы — 30 дней'),
      topIssues.length === 0
        ? h('div', { style:{ ...S.card, textAlign:'center', color:'#888', padding:24 } }, '✓ Критических проблем нет')
        : topIssues.map((issue, i) => h('div', { key:i, style:{ background: sevBg[issue.sev], border:`0.5px solid ${sevColor[issue.sev]}`, borderRadius:10, padding:'10px 14px', marginBottom:8 } },
            h('div', { style:{ fontSize:13, fontWeight:500, color: sevColor[issue.sev] } }, issue.title),
            h('div', { style:{ fontSize:11, color: sevColor[issue.sev], marginTop:2 } }, issue.sub)
          ))
    ),
    tab === 'analytics'    && h(AnalyticsDashboard, { data }),
    tab === 'reports'      && h(ReportsBuilder,     { data }),
    tab === 'monthly'      && h(MonthlyReport,       { data }),
    tab === 'kpi'          && h(KPIReport,           { data }),
    tab === 'reclamations' && h(MasterReclamations,  { data, onUpdate, addToast }),
    tab === 'auxops'       && h(AuxOpsViewer,        { data, onUpdate, addToast }),
    tab === 'orders'       && h(MasterOrders,        { data, onUpdate, addToast, onOrderClick }),
    tab === 'kanban'       && h(MasterKanban,        { data, onUpdate, addToast })
  );
});

// ==================== HRScreen (HR / Отдел кадров) ====================
const HRScreen = memo(({ data, onUpdate, addToast }) => {
  const [tab, setTab] = useState('workers');
  const TABS = [
    ['workers','Сотрудники'],['time','Табель'],
    ['instructions','Инструктажи ОТ'],['vacations','Отпуска'],
    ['kpi','KPI / Премии'],['reports','Отчёты']
  ];

  const active = useMemo(() => data.workers.filter(w => !w.archived), [data.workers]);

  // Алерты ОТ
  const instrAlerts = useMemo(() => {
    const instructions = data.instructions || [];
    let expired = 0, expiring = 0;
    active.forEach(w => {
      ['workplace','fire','electrical'].forEach(type => {
        const last = instructions.filter(i => i.workerId === w.id && i.type === type).sort((a,b) => b.dateMs - a.dateMs)[0];
        if (!last || !last.nextDate) return;
        const days = Math.ceil((last.nextDate - Date.now()) / 86400000);
        if (days < 0) expired++;
        else if (days <= 30) expiring++;
      });
    });
    return { expired, expiring };
  }, [data.instructions, active]);

  return h('div', null,
    // SectionAnalytics только на вкладке сотрудников
    tab === 'workers' && h(SectionAnalytics, { section: 'hr', data }),
    // Алерт ОТ
    (instrAlerts.expired > 0 || instrAlerts.expiring > 0) && h('div', { style:{ background: instrAlerts.expired>0 ? '#FCEBEB' : AM3, border:`0.5px solid ${instrAlerts.expired>0 ? RD : AM4}`, borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color: instrAlerts.expired>0 ? RD2 : AM2, cursor:'pointer' }, onClick:()=>setTab('instructions') },
      instrAlerts.expired > 0 && `⚠ ${instrAlerts.expired} инструктажей просрочено`,
      instrAlerts.expired > 0 && instrAlerts.expiring > 0 && ' · ',
      instrAlerts.expiring > 0 && `${instrAlerts.expiring} истекают в ближайшие 30 дней`,
      h('span', { style:{ marginLeft:8, textDecoration:'underline' } }, '→ к журналу')
    ),
    h(TabBar, { tabs: TABS, tab, setTab }),
    tab === 'workers'      && h(MasterWorkers,         { data, onUpdate, addToast }),
    tab === 'time'         && h(MasterTimeTracking,    { data, onUpdate, addToast, onWorkerClick: (wid) => setTab('workers') }),
    tab === 'instructions' && h(InstructionsTracker,   { data, onUpdate, addToast }),
    tab === 'vacations'    && h(VacationPlanner,       { data, onUpdate, addToast }),
    tab === 'kpi'          && h(KPIReport,             { data }),
    tab === 'reports'      && h(ReportsBuilder,        { data })
  );
});

// ==================== AdminScreen (Администратор) ====================
const AdminScreen = memo(({ data, onUpdate, addToast }) => {
  const [tab, setTab] = useState('stages');
  const TABS = [
    ['stages','Этапы'],['defectReasons','Причины брака'],['downtimes','Простои'],
    ['equipment','Оборудование'],['materials','Материалы'],['bom','Спецификации'],
    ['sections','Участки'],['workers','Сотрудники'],['time','Табель'],['admin','Настройки']
  ];

  return h('div', null,
    h('div', { style:{ ...S.card, background: AM3, border:`0.5px solid ${AM4}`, padding:'10px 14px', marginBottom:14 } },
      h('div', { style:{ fontSize:13, fontWeight:500, color:AM2 } }, '⚙ Администратор — настройка системы'),
      h('div', { style:{ fontSize:11, color:AM4, marginTop:2 } }, 'Справочники, оборудование, этапы производства, PIN-коды ролей')
    ),
    h(TabBar, { tabs: TABS, tab, setTab }),
    tab === 'stages'        && h(MasterProductionStages, { data, onUpdate, addToast }),
    tab === 'defectReasons' && h(MasterDefectReasons,    { data, onUpdate, addToast }),
    tab === 'downtimes'     && h(MasterDowntimes,        { data, onUpdate, addToast }),
    tab === 'equipment'     && h(MasterEquipment,        { data, onUpdate, addToast }),
    tab === 'materials'     && h(MasterMaterials,        { data, onUpdate, addToast }),
    tab === 'bom'           && h(MasterBOM,              { data, onUpdate, addToast }),
    tab === 'sections'      && h(MasterSections,         { data, onUpdate, addToast }),
    tab === 'workers'       && h(MasterWorkers,          { data, onUpdate, addToast }),
    tab === 'time'          && h(MasterTimeTracking,     { data, onUpdate, addToast, onWorkerClick: (wid) => setTab('workers') }),
    tab === 'admin'         && h(MasterAdmin,            { data, onUpdate, addToast })
  );
});



// ==================== App ====================
function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [role, setRole] = useState(null);
  const [workerId, setWorkerId] = useState(null);
  const [sectionId, setSectionId] = useState(null);
  const [initialOpId, setInitialOpId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const savingRef = useRef(false);

  useEffect(() => {
    DB.load().then(async d => {
      // П.9: Автоархивация — заказы, все операции которых завершены более 30 дней назад
      const threshold = now() - 30 * 86400000;
      let archiveCount = 0;
      const updated = { ...d, orders: d.orders.map(order => {
        if (order.archived) return order;
        const orderOps = d.ops.filter(op => op.orderId === order.id);
        if (orderOps.length === 0) return order;
        const allDone = orderOps.every(op => op.status === 'done' || op.status === 'defect');
        const lastFinished = Math.max(...orderOps.map(op => op.finishedAt || 0));
        if (allDone && lastFinished > 0 && lastFinished < threshold) { archiveCount++; return { ...order, archived: true, autoArchived: true }; }
        return order;
      })};
      if (archiveCount > 0) { await DB.save(updated); console.log(`Автоархивация: ${archiveCount} заказов`); }
      setData(archiveCount > 0 ? updated : d);
      setLoading(false); setSynced(true);
    });
    const unsub = DB.onSnapshot(newData => { if (!savingRef.current && !DB._saving) setData(newData); });
    const params = new URLSearchParams(window.location.search);
    const opId = params.get('opId');
    if (opId) setInitialOpId(opId);
    if ("Notification" in window && Notification.permission !== "denied") { Notification.requestPermission().catch(() => {}); }

    // Защита от двух вкладок: при открытии второй вкладки — предупреждение
    let bc;
    try {
      bc = new BroadcastChannel('prod_app_tab');
      bc.postMessage({ type: 'tab_open', ts: Date.now() });
      bc.onmessage = (e) => {
        if (e.data?.type === 'tab_open') {
          // Другая вкладка открылась — показываем предупреждение
          addToast('⚠ Приложение открыто в другой вкладке. Работа в двух вкладках может привести к конфликту данных.', 'error');
        }
      };
    } catch(e) { /* BroadcastChannel не поддерживается */ }

    return () => {
      unsub();
      if (bc) bc.close();
    };
  }, []);

  const save = useCallback((d) => {
    savingRef.current = true;
    setData(d);
    setIsSaving(true);
    DB.save(d).then(() => {
      // savingRef остаётся true пока Firebase не подтвердит запись
      // Сбрасываем с небольшой задержкой чтобы onSnapshot успел обработаться
      setTimeout(() => {
        savingRef.current = false;
        setIsSaving(false);
      }, 300);
    });
  }, []);

  // Мониторинг ошибок сохранения
  useEffect(() => {
    const check = setInterval(() => {
      if (DB._lastError) {
        const err = DB._lastError;
        DB._lastError = null;
        setToasts(prev => [...prev, { id: Date.now(), message: `⚠ Ошибка сохранения: ${err}`, type: 'error' }]);
      }
    }, 3000);
    return () => clearInterval(check);
  }, []);

  const goBack = () => { setRole(null); setWorkerId(null); setSectionId(null); setInitialOpId(null); setShowChat(false); window.history.replaceState({}, '', window.location.pathname); };
  const addToast = useCallback((message, type = 'info') => { const id = Date.now() + Math.random(); setToasts(prev => [...prev, { id, message, type }]); }, []);
  const removeToast = useCallback(id => setToasts(prev => prev.filter(t => t.id !== id)), []);

  // Сброс PIN через мастер-ключ (вызывается из LoginScreen)
  const handleResetPin = useCallback(async (targetWorkerId, newPin) => {
    const d = { ...data, workers: data.workers.map(w => w.id === targetWorkerId ? { ...w, pin: hashPin(newPin) } : w) };
    await DB.save(d);
    setData(d);
  }, [data]);

  // Определяем «настоящую» роль для рендера — chat_master и chat_controller рендерятся как чат
  const effectiveRole = role === 'chat_master' || role === 'chat_controller' ? 'chat' : role;

  // Текущий пользователь для чата
  const currentUser = useMemo(() => {
    if (role === 'worker' || role === 'chat') { const w = data.workers.find(w => w.id === workerId); return { id: workerId, name: w?.name || 'Сотрудник', role: 'worker' }; }
    if (role === 'master' || role === 'chat_master') return { id: 'master', name: 'Начальник цеха', role: 'master' };
    if (role === 'controller' || role === 'chat_controller') return { id: 'controller', name: 'Контролёр', role: 'controller' };
    if (role === 'warehouse') return { id: 'warehouse', name: 'Склад', role: 'warehouse' };
    return { id: 'system', name: 'Система', role: 'system' };
  }, [role, workerId, data.workers]);

  if (loading) return h('div', { style: { padding:48, textAlign:'center' } },
    h('div', { style: { fontSize:16, marginBottom:8 } }, 'Загрузка...'),
    h('div', { style: { fontSize:12, color:'#888' } }, 'Подключение к Firebase')
  );

  // QR-режим
  if (initialOpId && !role) return h('div', null,
    h('div', { style: { display:'flex', gap:12, padding:'10px 0', borderBottom:'0.5px solid rgba(0,0,0,0.08)' } },
      h('button', { style: gbtn({ fontSize:11 }), onClick: goBack }, '← На главную'),
      h('div', { style: { fontSize:12, color:'#888' } }, 'QR-операция')
    ),
    h(QRScreen, { data, opId: initialOpId, onUpdate: save, addToast }),
    h('div', null, toasts.map(t => h(Toast, { key: t.id, message: t.message, onClose: () => removeToast(t.id) })))
  );

  // Экран входа
  if (!role) return h('div', null,
    h(LoginScreen, {
      data,
      onLogin: (r, wid, sid) => {
        setRole(r);
        setWorkerId(wid);
        setSectionId(sid);
        // Запускаем presence tracking
        const userName = wid ? (appData?.workers?.find(w => w.id === wid)?.name || r) : r;
        const presenceId = wid || r;
        Presence.start(presenceId, userName);
        // chat, chat_master, chat_controller — всё это режим чата
        if (r === 'chat' || r === 'chat_master' || r === 'chat_controller') setShowChat(true);
      },
      onResetPin: handleResetPin
    }),
    h('div', null, toasts.map(t => h(Toast, { key: t.id, message: t.message, onClose: () => removeToast(t.id) })))
  );

  // Режим "только чат"
  if (effectiveRole === 'chat') return h('div', null,
    h('div', { style: { display:'flex', gap:12, padding:'10px 0', borderBottom:'0.5px solid rgba(0,0,0,0.08)', alignItems:'center' } },
      h('button', { style: gbtn({ fontSize:11 }), onClick: goBack }, '← Выход'),
      h('div', { style: { fontSize:12, color:'#888' } }, `Чат · ${currentUser.name}`)
    ),
    h(ChatScreen, { data, onUpdate: save, addToast, currentUser, onBack: goBack }),
    h('div', null, toasts.map(t => h(Toast, { key: t.id, message: t.message, onClose: () => removeToast(t.id) })))
  );

  return h('div', null,
    h('div', { style: { display:'flex', gap:12, padding:'10px 0', borderBottom:'0.5px solid rgba(0,0,0,0.08)', alignItems:'center', flexWrap:'wrap' } },
      h('button', { style: gbtn({ fontSize:11 }), onClick: goBack }, '← Выход'),
      h('div', { style: { fontSize:12, color:'#888' } },
        effectiveRole === 'master'      ? 'Начальник цеха' :
        effectiveRole === 'controller'  ? 'Контролёр'     :
        effectiveRole === 'warehouse'   ? 'Склад'          :
        effectiveRole === 'dashboard'   ? 'Дашборд'        :
        effectiveRole === 'pdo'         ? 'ПДО'            :
        effectiveRole === 'director'    ? 'Руководитель'   :
        effectiveRole === 'hr'          ? 'HR'             :
        effectiveRole === 'shop_master' ? 'Сменный мастер' :
        effectiveRole === 'admin'       ? 'Администратор'  :
        currentUser.name
      ),
      effectiveRole !== 'dashboard' && (() => {
        const chatLastRead = Number(localStorage.getItem(`chat_lastRead_${currentUser.id || 'anon'}`)) || 0;
        const unread = (data.messages || []).filter(m => m.timestamp > chatLastRead && m.senderId !== (currentUser.id || 'system')).length;
        // 🔴 Бейдж для @упоминаний — красный если есть новые упоминания текущего пользователя
        const myMentions = (data.messages || []).filter(m => m.mentions?.includes(currentUser.id) && m.timestamp > chatLastRead).length;
        return h('button', { style: showChat ? abtn({ fontSize:11 }) : gbtn({ fontSize:11, position: 'relative' }), onClick: () => setShowChat(!showChat) },
          showChat ? '💬 Чат (скрыть)' : '💬 Чат',
          !showChat && myMentions > 0 && h('span', { style: { position: 'absolute', top: -8, right: -8, background: '#E24B4A', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, border: '2px solid var(--card)' } }, '!'),
          !showChat && unread > 0 && myMentions === 0 && h('span', { style: { position: 'absolute', top: -4, right: -4, background: RD, color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500 } }, unread > 9 ? '9+' : unread)
        );
      })(),
      h('div', { style: { marginLeft:'auto', fontSize:10, display:'flex', alignItems:'center', gap:8 } },
        isSaving && h('div', { style: { display:'flex', alignItems:'center', gap:4, color: AM4, fontWeight:500 } },
          h('span', { style: {
            width: 8, height: 8, borderRadius: '50%', background: AM,
            display: 'inline-block', animation: 'pulse 1s ease-in-out infinite'
          }}),
          'Сохранение...'
        ),
        h('div', { style: { display:'flex', alignItems:'center', gap:4, color: synced ? GN : '#888' } },
          h('span', { style: { width:6, height:6, borderRadius:'50%', background: synced ? GN : '#ccc', display:'inline-block' } }),
          synced ? 'Firebase' : 'Оффлайн'
        ),
        DB._sizeWarning && h('div', { style: { display:'flex', alignItems:'center', gap:3, color: AM4, fontSize: 9 } },
          `💾 ${DB._sizeWarning} КБ`
        ),
        !synced && localStorage.getItem(QUEUE_KEY) && h('div', { style: { display:'flex', alignItems:'center', gap:3, color: AM4, fontSize: 9, fontWeight:500 } },
          '📤 Офлайн-очередь'
        )
      )
    ),
    showChat
      ? h(ChatScreen, { data, onUpdate: save, addToast, currentUser, onBack: () => setShowChat(false) })
      : h('div', null,
          effectiveRole === 'master'      && h(MasterScreen,   { data, onUpdate: save, addToast, sectionId, onOrderClick: setSelectedOrderId, role: 'master' }),
          effectiveRole === 'pdo'         && h(PDOScreen,       { data, onUpdate: save, addToast, onOrderClick: setSelectedOrderId }),
          effectiveRole === 'director'    && h(DirectorScreen,  { data, onUpdate: save, addToast, onOrderClick: setSelectedOrderId }),
          effectiveRole === 'hr'          && h(HRScreen,        { data, onUpdate: save, addToast }),
          effectiveRole === 'shop_master' && h(ShopMasterScreen,{ data, onUpdate: save, addToast, onOrderClick: setSelectedOrderId }),
          effectiveRole === 'admin'       && h(AdminScreen,     { data, onUpdate: save, addToast }),
          effectiveRole === 'controller'  && h(ControllerScreen, { data, onUpdate: save, addToast, onOrderClick: setSelectedOrderId }),
          effectiveRole === 'worker' && workerId && h(WorkerScreen, { data, workerId, sectionId, onUpdate: save, initialOpId: null, addToast }),
          effectiveRole === 'warehouse' && h(WarehouseScreen, { data, onUpdate: save, addToast }),
          effectiveRole === 'dashboard' && h(Dashboard, { data, addToast, onOrderClick: setSelectedOrderId })
        ),
    selectedOrderId && h(OrderDetailModal, { orderId: selectedOrderId, data, onClose: () => setSelectedOrderId(null) }),
    h('div', { 'aria-live': 'polite' }, toasts.map(t => h(Toast, { key: t.id, message: t.message, onClose: () => removeToast(t.id) }))),
    h(InstallPromptBanner)
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(App))
);

// PWA: Service Worker registration with auto-update
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      console.log('SW registered:', reg.scope);
      // Проверка обновлений каждые 30 минут
      setInterval(() => reg.update(), 30 * 60 * 1000);
      // Уведомление о новой версии
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Новая версия готова — показываем баннер
            const banner = document.getElementById('update-banner');
            if (banner) banner.style.display = 'flex';
          }
        });
      });
    }).catch(err => console.log('SW registration failed:', err));
  });
  // Перезагрузка после активации нового SW
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
  });
}


