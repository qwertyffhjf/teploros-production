// teploros · analytics.js
// Автоматически извлечено из монолита

// ==================== ANALYTICS HELPERS ====================
// 📊 OEE (Overall Equipment Effectiveness) = Availability × Performance × Quality
const calcOEE = (data, workerId, period = 30) => {
  const t = now();
  const since = t - period * 86400000;
  
  // Доступность: время работы / планируемое время
  const allOps = data.ops.filter(op => op.workerIds?.includes(workerId) && op.finishedAt >= since);
  const downtimes = data.events.filter(e => e.workerId === workerId && e.type === 'downtime' && e.ts >= since);
  const downtimeMs = downtimes.reduce((s, e) => s + (e.durationMs || 0), 0);
  const totalMs = allOps.reduce((s, op) => s + (op.finishedAt - op.startedAt || 0), 0);
  const availability = totalMs > 0 ? Math.min(100, (1 - downtimeMs / (totalMs + downtimeMs)) * 100) : 0;
  
  // Производительность: фактическое время / плановое время
  const withPlan = allOps.filter(op => op.plannedHours && op.startedAt && op.finishedAt);
  let performance = 100;
  if (withPlan.length > 0) {
    const avgRatio = withPlan.reduce((s, op) => s + (op.finishedAt - op.startedAt) / (op.plannedHours * 3600000), 0) / withPlan.length;
    performance = Math.min(100, 100 / (avgRatio || 1));
  }
  
  // Качество: годные / всего
  const doneCount = allOps.filter(op => op.status === 'done').length;
  const defectCount = allOps.filter(op => op.status === 'defect').length;
  const quality = (doneCount + defectCount) > 0 ? (doneCount / (doneCount + defectCount)) * 100 : 100;
  
  // OEE = A × P × Q / 10000
  const oee = (availability * performance * quality) / 10000;
  
  return { oee: Math.round(oee), availability: Math.round(availability), performance: Math.round(performance), quality: Math.round(quality) };
};

// 📈 План/факт по операциям за период
const calcPlanFact = (data, period = 30) => {
  const t = now();
  const since = t - period * 86400000;
  const ops = data.ops.filter(op => op.finishedAt >= since && op.status === 'done');
  
  let plannedHours = 0, actualHours = 0;
  ops.forEach(op => {
    if (op.plannedHours) plannedHours += op.plannedHours;
    if (op.startedAt && op.finishedAt) actualHours += (op.finishedAt - op.startedAt) / 3600000;
  });
  
  const ratio = plannedHours > 0 ? (actualHours / plannedHours) : 1;
  return { plannedHours: Math.round(plannedHours * 10) / 10, actualHours: Math.round(actualHours * 10) / 10, ratio: Math.round(ratio * 100) / 100, opsCount: ops.length };
};

// 🔮 Прогноз сроков: если темп сохранится, когда закончится заказ
const calcForecast = (data, orderId) => {
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return null;
  
  const ops = data.ops.filter(op => op.orderId === orderId && !op.archived);
  const doneOps = ops.filter(op => op.status === 'done');
  const pendingOps = ops.filter(op => op.status === 'pending' || op.status === 'in_progress');
  
  if (doneOps.length === 0 || pendingOps.length === 0) return null;
  
  // Средняя скорость: часы на одну операцию
  const avgHours = doneOps.reduce((s, op) => s + (op.plannedHours || op.finishedAt - op.startedAt) / 3600000, 0) / doneOps.length;
  const remainingHours = pendingOps.length * avgHours;
  
  // Прогноз: сегодня + оставшиеся часы
  const forecastMs = remainingHours * 3600000;
  const forecastDate = new Date(now() + forecastMs);
  
  return { forecastDate, remainingHours: Math.round(remainingHours * 10) / 10, daysLeft: Math.ceil(remainingHours / 8) };
};

// ==================== MasterJournal ====================
const MasterJournal = memo(({ data, onWorkerClick }) => {
  const sortedEvents = useMemo(() => [...data.events].sort((a,b) => b.ts - a.ts).slice(0, 200), [data.events]);
  return h('div', { style: { ...S.card, maxHeight: 500, overflowY: 'auto' } },
    h('div', { style: S.sec }, 'Журнал событий (последние 200)'),
    sortedEvents.length === 0
      ? h('div', { style: { padding: 16, textAlign: 'center' } }, 'Нет событий')
      : h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Время','Тип','Сотрудник','Операция','Смена','Примечание'].map((t,i) => h('th', { key: i, style: S.th, scope: 'col' }, t)))),
          h('tbody', null, sortedEvents.map(e => {
            const worker = data.workers.find(w => w.id === e.workerId);
            const op = data.ops.find(o => o.id === e.opId);
            return h('tr', { key: e.id },
              h('td', { style: S.td }, new Date(e.ts).toLocaleString()),
              h('td', { style: S.td }, e.type),
              h('td', { style: S.td }, worker ? h(WN, { worker, onWorkerClick }) : '—'),
              h('td', { style: S.td }, op?.name || '—'),
              h('td', { style: S.td }, e.shift || '—'),
              h('td', { style: S.td }, e.note || (e.downtimeTypeId ? data.downtimeTypes.find(dt => dt.id === e.downtimeTypeId)?.name : ''))
            );
          }))
        ))
  );
});



// ==================== SectionAnalytics ====================
// Универсальная аналитическая панель: мини-KPI сверху + кнопка «Полная аналитика»
// Использование: h(SectionAnalytics, { section: 'warehouse'|'production'|'hr'|'quality'|'dashboard', data, period?, onPeriodChange? })

const useChartRef = () => {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const draw = useCallback((config) => {
    if (!canvasRef.current || !window.Chart) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    chartRef.current = new Chart(canvasRef.current, config);
  }, []);
  useEffect(() => () => { if (chartRef.current) chartRef.current.destroy(); }, []);
  return { canvasRef, draw };
};

// Маленький спарклайн (только canvas)
const MiniSparkline = memo(({ values, color, height = 36 }) => {
  const { canvasRef, draw } = useChartRef();
  useEffect(() => {
    if (!values?.length) return;
    draw({
      type: 'line',
      data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: color, borderWidth: 2, fill: true, backgroundColor: color + '22', tension: 0.4, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, animation: { duration: 800, easing: 'easeOutQuart' }, animations: { y: { duration: 800, easing: 'easeOutQuart', from: (ctx) => ctx.chart?.height ?? 0 } } }
    });
  }, [values, color, draw]);
  return h('canvas', { ref: canvasRef, style: { height, width: '100%', display: 'block' } });
});

// KPI карточка с искрой
const KpiCard = memo(({ label, value, delta, deltaDir, color, spark }) => {
  const deltaColor = deltaDir === 'up' ? GN2 : deltaDir === 'dn' ? RD2 : '#888';
  const deltaIcon  = deltaDir === 'up' ? '▲' : deltaDir === 'dn' ? '▼' : '=';
  return h('div', { style: { background: 'var(--card-solid,#fff)', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 } },
    h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' } }, label),
    h('div', { style: { fontSize: 22, fontWeight: 500, color: color || 'inherit', lineHeight: 1.1 } }, value),
    delta && h('div', { style: { fontSize: 10, color: deltaColor } }, `${deltaIcon} ${delta}`),
    spark && h(MiniSparkline, { values: spark.values, color: spark.color, height: 28 })
  );
});

// Полноэкранная аналитика (модалка)
const FullAnalyticsModal = memo(({ section, data, onClose }) => {
  const [period, setPeriod]             = useState(30);
  const [chartType, setChartType]       = useState('bar'); // bar | line
  const [archiveLoading, setArchiveLoading] = useState(false);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);
  const c1 = useChartRef(), c2 = useChartRef(), c3 = useChartRef(), c4 = useChartRef();

  // ── Данные по разделам ──
  const computed = useMemo(() => {
    if (section === 'production' || section === 'dashboard') {
      const ops = data.ops.filter(o => !o.archived && (o.finishedAt >= periodStart || o.startedAt >= periodStart));
      const done = ops.filter(o => o.status === 'done');
      const defect = ops.filter(o => o.status === 'defect');
      const inProg = ops.filter(o => o.status === 'in_progress');
      // По дням
      const days = 7;
      const dayLabels = Array.from({ length: days }, (_, i) => {
        const d = new Date(now() - (days - 1 - i) * 86400000);
        return d.toLocaleDateString('ru-RU', { weekday: 'short' });
      });
      const doneByDay = Array.from({ length: days }, (_, i) => {
        const start = now() - (days - i) * 86400000;
        const end   = now() - (days - 1 - i) * 86400000;
        return data.ops.filter(o => o.finishedAt >= start && o.finishedAt < end && o.status === 'done').length;
      });
      const defByDay = Array.from({ length: days }, (_, i) => {
        const start = now() - (days - i) * 86400000;
        const end   = now() - (days - 1 - i) * 86400000;
        return data.ops.filter(o => o.finishedAt >= start && o.finishedAt < end && o.status === 'defect').length;
      });
      // По сотрудникам
      const workerMap = {};
      done.forEach(o => (o.workerIds || []).forEach(wid => { workerMap[wid] = (workerMap[wid] || 0) + 1; }));
      const topWorkers = Object.entries(workerMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, cnt]) => ({ name: data.workers.find(w => w.id === id)?.name?.split(' ')[0] || '?', cnt }));
      // Брак по причинам
      const defReasons = {};
      defect.forEach(o => { const k = data.defectReasons?.find(r => r.id === o.defectReasonId)?.name || 'Прочее'; defReasons[k] = (defReasons[k] || 0) + 1; });
      const topDefects = Object.entries(defReasons).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return { done: done.length, defect: defect.length, inProg: inProg.length, quality: done.length + defect.length > 0 ? Math.round(done.length / (done.length + defect.length) * 100) : 100, dayLabels, doneByDay, defByDay, topWorkers, topDefects };
    }
    if (section === 'warehouse') {
      const consumptions = (data.materialConsumptions || []).filter(mc => mc.ts >= periodStart);
      const matMap = {};
      consumptions.forEach(mc => { const m = data.materials.find(x => x.id === mc.materialId); if (m) matMap[m.name] = (matMap[m.name] || 0) + mc.qty; });
      const topMats = Object.entries(matMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const critical = data.materials.filter(m => m.minStock && m.quantity <= m.minStock);
      const totalValue = data.materials.reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0);
      const receives = data.events.filter(e => e.type === 'material_receive' && e.ts >= periodStart);
      const days = 7;
      const dayLabels = Array.from({ length: days }, (_, i) => { const d = new Date(now() - (days - 1 - i) * 86400000); return d.toLocaleDateString('ru-RU', { weekday: 'short' }); });
      const rcvByDay = Array.from({ length: days }, (_, i) => { const s = now() - (days - i) * 86400000, e = now() - (days - 1 - i) * 86400000; return data.events.filter(ev => ev.type === 'material_receive' && ev.ts >= s && ev.ts < e).length; });
      const outByDay = Array.from({ length: days }, (_, i) => { const s = now() - (days - i) * 86400000, e = now() - (days - 1 - i) * 86400000; return (data.materialConsumptions || []).filter(mc => mc.ts >= s && mc.ts < e).length; });
      return { total: data.materials.length, critical: critical.length, totalValue: Math.round(totalValue), receives: receives.length, topMats, dayLabels, rcvByDay, outByDay };
    }
    if (section === 'hr') {
      const activeW = data.workers.filter(w => !w.archived);
      const working = activeW.filter(w => isWorkerOnShift(w, data.timesheet)).length;
      const absent  = activeW.filter(w => w.status === 'absent').length;
      const workerStats = activeW.map(w => {
        const ops = data.ops.filter(o => (o.workerIds || []).includes(w.id) && o.finishedAt >= periodStart);
        const done = ops.filter(o => o.status === 'done').length;
        const def  = ops.filter(o => o.status === 'defect').length;
        return { name: w.name?.split(' ')[0] || '?', done, def, rate: done + def > 0 ? Math.round(def / (done + def) * 100) : 0 };
      }).sort((a, b) => b.done - a.done).slice(0, 7);
      const statusCounts = { working: 0, absent: 0, sick: 0, vacation: 0 };
      activeW.forEach(w => { const s = getWorkerStatusToday(w.id, data.timesheet) || w.status || 'working'; if (statusCounts[s] !== undefined) statusCounts[s]++; });
      return { total: activeW.length, working, absent, statusCounts, workerStats };
    }
    if (section === 'quality') {
      const defectOps = data.ops.filter(o => o.status === 'defect' && o.finishedAt >= periodStart);
      const doneOps   = data.ops.filter(o => o.status === 'done'   && o.finishedAt >= periodStart);
      const quality   = doneOps.length + defectOps.length > 0 ? Math.round(doneOps.length / (doneOps.length + defectOps.length) * 100) : 100;
      const byReason  = {};
      defectOps.forEach(o => { const k = data.defectReasons?.find(r => r.id === o.defectReasonId)?.name || 'Прочее'; byReason[k] = (byReason[k] || 0) + 1; });
      const topReasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const byWorker = {};
      defectOps.forEach(o => (o.workerIds || []).forEach(wid => { const w = data.workers.find(x => x.id === wid)?.name?.split(' ')[0] || '?'; byWorker[w] = (byWorker[w] || 0) + 1; }));
      const topWorkers = Object.entries(byWorker).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const days = 7;
      const dayLabels = Array.from({ length: days }, (_, i) => { const d = new Date(now() - (days - 1 - i) * 86400000); return d.toLocaleDateString('ru-RU', { weekday: 'short' }); });
      const qualByDay = Array.from({ length: days }, (_, i) => {
        const s = now() - (days - i) * 86400000, e = now() - (days - 1 - i) * 86400000;
        const dn = data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'done').length;
        const df = data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'defect').length;
        return dn + df > 0 ? Math.round(dn / (dn + df) * 100) : 100;
      });
      return { quality, defects: defectOps.length, reclamations: (data.reclamations || []).length, topReasons, topWorkers, dayLabels, qualByDay };
    }
    return {};
  }, [section, data, periodStart]);

  // ── Рисуем графики ──
  useEffect(() => {
    // Общие опции — красивая анимация с easing
    // delay: каждый столбец появляется с задержкой 40ms × индекс (stagger)
    const co = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      animation: {
        duration: 700,
        easing: 'easeOutQuart',
      },
      animations: {
        // Столбцы растут снизу вверх
        y: {
          from: (ctx) => {
            if (ctx.type === 'data' && ctx.mode === 'default') {
              return ctx.chart.scales.y?.getPixelForValue(0) ?? ctx.chart.height;
            }
          },
          duration: 700,
          easing: 'easeOutQuart',
          delay: (ctx) => ctx.dataIndex * 40, // stagger 40ms на каждый столбец
        },
        // Горизонтальные (indexAxis: 'y') — растут слева
        x: {
          from: (ctx) => {
            if (ctx.type === 'data' && ctx.mode === 'default' && ctx.chart.options?.indexAxis === 'y') {
              return ctx.chart.scales.x?.getPixelForValue(0) ?? 0;
            }
          },
          duration: 650,
          easing: 'easeOutQuart',
          delay: (ctx) => ctx.dataIndex * 50,
        },
      },
    };
    if (section === 'production' || section === 'dashboard') {
      if (computed.dayLabels) {
        c1.draw({ type: 'bar', data: { labels: computed.dayLabels, datasets: [{ label: 'Выполнено', data: computed.doneByDay, backgroundColor: GN, borderRadius: 4 }, { label: 'Брак', data: computed.defByDay, backgroundColor: RD, borderRadius: 4 }] }, options: { ...co, scales: { x: { stacked: false }, y: { beginAtZero: true } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } } } });
      }
      if (computed.topWorkers?.length) {
        c2.draw({ type: 'bar', data: { labels: computed.topWorkers.map(w => w.name), datasets: [{ data: computed.topWorkers.map(w => w.cnt), backgroundColor: '#378ADD', borderRadius: 4 }] }, options: { ...co, indexAxis: 'y', scales: { x: { beginAtZero: true }, y: {} } } });
      }
      if (computed.topDefects?.length) {
        c3.draw({ type: 'bar', data: { labels: computed.topDefects.map(d => d[0].length > 14 ? d[0].slice(0, 14) + '…' : d[0]), datasets: [{ data: computed.topDefects.map(d => d[1]), backgroundColor: RD, borderRadius: 4 }] }, options: { ...co, indexAxis: 'y', scales: { x: { beginAtZero: true }, y: {} } } });
      }
    } else if (section === 'warehouse') {
      if (computed.dayLabels) {
        c1.draw({ type: 'bar', data: { labels: computed.dayLabels, datasets: [{ label: 'Приходы', data: computed.rcvByDay, backgroundColor: GN, borderRadius: 4 }, { label: 'Расходы', data: computed.outByDay, backgroundColor: AM, borderRadius: 4 }] }, options: { ...co, scales: { x: {}, y: { beginAtZero: true } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } } } });
      }
      if (computed.topMats?.length) {
        c2.draw({ type: 'bar', data: { labels: computed.topMats.map(m => m[0].length > 14 ? m[0].slice(0, 14) + '…' : m[0]), datasets: [{ data: computed.topMats.map(m => m[1]), backgroundColor: '#7F77DD', borderRadius: 4 }] }, options: { ...co, indexAxis: 'y', scales: { x: { beginAtZero: true }, y: {} } } });
      }
    } else if (section === 'hr') {
      if (computed.workerStats?.length) {
        c1.draw({ type: 'bar', data: { labels: computed.workerStats.map(w => w.name), datasets: [{ label: 'Выполнено', data: computed.workerStats.map(w => w.done), backgroundColor: GN, borderRadius: 4 }, { label: 'Брак', data: computed.workerStats.map(w => w.def), backgroundColor: RD, borderRadius: 4 }] }, options: { ...co, scales: { x: { stacked: false }, y: { beginAtZero: true } }, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } } } });
      }
      if (computed.statusCounts) {
        const sc = computed.statusCounts;
        c2.draw({ type: 'doughnut', data: { labels: ['На смене', 'Отсутствует', 'Больничный', 'Отпуск'], datasets: [{ data: [sc.working, sc.absent, sc.sick, sc.vacation], backgroundColor: [GN, RD, AM, '#7F77DD'], borderWidth: 0 }] }, options: { ...co, plugins: { legend: { display: true, position: 'right', labels: { font: { size: 10 }, boxWidth: 10 } } } } });
      }
    } else if (section === 'quality') {
      if (computed.dayLabels) {
        c1.draw({ type: 'line', data: { labels: computed.dayLabels, datasets: [{ label: 'Качество %', data: computed.qualByDay, borderColor: GN, backgroundColor: GN + '22', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: GN }] }, options: { ...co, scales: { y: { min: 70, max: 100, beginAtZero: false } }, plugins: { legend: { display: false } } } });
      }
      if (computed.topReasons?.length) {
        c2.draw({ type: 'bar', data: { labels: computed.topReasons.map(r => r[0].length > 14 ? r[0].slice(0, 14) + '…' : r[0]), datasets: [{ data: computed.topReasons.map(r => r[1]), backgroundColor: RD, borderRadius: 4 }] }, options: { ...co, indexAxis: 'y', scales: { x: { beginAtZero: true }, y: {} } } });
      }
      if (computed.topWorkers?.length) {
        c3.draw({ type: 'bar', data: { labels: computed.topWorkers.map(w => w[0]), datasets: [{ data: computed.topWorkers.map(w => w[1]), backgroundColor: AM, borderRadius: 4 }] }, options: { ...co, indexAxis: 'y', scales: { x: { beginAtZero: true }, y: {} } } });
      }
    }
  }, [computed, section, c1, c2, c3, c4]);

  const TITLES = { production: '⚙ Производство — полная аналитика', dashboard: '📊 Цех — полная аналитика', warehouse: '📦 Склад — полная аналитика', hr: '👥 Сотрудники — полная аналитика', quality: '🔍 Качество — полная аналитика' };

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, overflowY: 'auto', padding: '16px 8px' }, onClick: e => e.target === e.currentTarget && onClose() },
    h('div', { style: { background: 'var(--card-2)', borderRadius: 14, width: 'min(900px,100%)', margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' } },
      // Шапка
      h('div', { style: { background: 'var(--card-solid,#fff)', borderRadius: '14px 14px 0 0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid rgba(0,0,0,0.08)' } },
        h('div', { style: { fontSize: 15, fontWeight: 500 } }, TITLES[section] || 'Аналитика'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          // Период
          h('div', { style: { display: 'flex', gap: 4 } },
            [7, 14, 30, 90, 180, 365].map(d => h('button', {
              key: d,
              style: period === d ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }),
              onClick: () => setPeriod(d),
              title: d > 60 ? 'Данные загружаются из архива' : undefined
            }, d >= 365 ? '1г' : d >= 180 ? '6м' : `${d}д`))
          ),
          archiveLoading && h('span', { style: { fontSize: 11, color: '#EF9F27', animation: 'pulse 1s infinite' } }, '⏳ архив...'),
          h('button', { style: gbtn({ fontSize: 11 }), onClick: () => {
            const wb = XLSX.utils.book_new();
            if (section === 'warehouse' && computed.topMats) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(computed.topMats.map(([m, q]) => ({ Материал: m, Расход: q }))), 'Расход');
            }
            XLSX.writeFile(wb, `analytics_${section}_${new Date().toISOString().slice(0,10)}.xlsx`);
          } }, '📥 Excel'),
          h('button', { onClick: onClose, style: { background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer' } }, '×')
        )
      ),
      h('div', { style: { padding: 16 } },
        // Графики
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
          h('div', { style: { background: 'var(--card-solid,#fff)', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 8 } },
              section === 'warehouse' ? 'Движение по дням' :
              section === 'hr' ? 'Выработка сотрудников' :
              section === 'quality' ? 'Качество по дням (%)' : 'Выполнение по дням'
            ),
            h('div', { className: 'op-card-anim', style: { height: 200, animationDelay: '0.05s' } }, h('canvas', { ref: c1.canvasRef }))
          ),
          h('div', { style: { background: 'var(--card-solid,#fff)', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 8 } },
              section === 'warehouse' ? 'Топ расхода материалов' :
              section === 'hr' ? 'Статус сотрудников' :
              section === 'quality' ? 'Брак по причинам' : 'Выработка по сотрудникам'
            ),
            h('div', { className: 'op-card-anim', style: { height: 200, animationDelay: '0.12s' } }, h('canvas', { ref: c2.canvasRef }))
          ),
          (section === 'production' || section === 'dashboard' || section === 'quality') && h('div', { style: { background: 'var(--card-solid,#fff)', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)', gridColumn: '1 / -1' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 8 } },
              section === 'quality' ? 'Брак по исполнителям' : 'Брак по причинам'
            ),
            h('div', { className: 'op-card-anim', style: { height: 160, animationDelay: '0.18s' } }, h('canvas', { ref: c3.canvasRef }))
          )
        )
      )
    )
  );
});

// Мини-аналитика (встроена в шапку раздела)
const SectionAnalytics = memo(({ section, data }) => {
  const [expanded, setExpanded] = useState(false);
  const [period] = useState(30);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);

  const kpis = useMemo(() => {
    if (section === 'production' || section === 'dashboard') {
      const done    = data.ops.filter(o => o.status === 'done'   && o.finishedAt >= periodStart).length;
      const defect  = data.ops.filter(o => o.status === 'defect' && o.finishedAt >= periodStart).length;
      const inProg  = data.ops.filter(o => o.status === 'in_progress' && !o.archived).length;
      const quality = done + defect > 0 ? Math.round(done / (done + defect) * 100) : 100;
      const spark7  = Array.from({ length: 7 }, (_, i) => { const s = now() - (7 - i) * 86400000, e = now() - (6 - i) * 86400000; return data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'done').length; });
      return [
        { label: 'Выполнено', value: done, delta: 'за 30 дней', deltaDir: 'up', color: GN2, spark: { values: spark7, color: GN } },
        { label: 'В работе',  value: inProg, delta: 'сейчас', deltaDir: 'neu', color: AM2 },
        { label: 'Качество',  value: `${quality}%`, delta: quality >= 95 ? 'отлично' : quality >= 85 ? 'норма' : 'требует внимания', deltaDir: quality >= 95 ? 'up' : quality >= 85 ? 'neu' : 'dn', color: quality >= 95 ? GN2 : quality >= 85 ? AM2 : RD2 },
        { label: 'Брак',      value: defect, delta: 'за 30 дней', deltaDir: defect > 5 ? 'dn' : 'neu', color: defect > 0 ? RD2 : '#888' },
      ];
    }
    if (section === 'warehouse') {
      const critical = data.materials.filter(m => m.minStock && m.quantity <= m.minStock).length;
      const totalVal = Math.round(data.materials.reduce((s, m) => s + m.quantity * (m.unitCost || 0), 0) / 1000);
      const receives = data.events.filter(e => e.type === 'material_receive' && e.ts >= periodStart).length;
      const requests = data.events.filter(e => e.type === 'chat_alert' && e.alertType === 'need_material' && !e.fulfilled).length;
      return [
        { label: 'Позиций',       value: data.materials.length, delta: 'в справочнике', deltaDir: 'neu' },
        { label: 'Критичных',     value: critical, delta: 'ниже минимума', deltaDir: critical > 0 ? 'dn' : 'up', color: critical > 0 ? RD2 : GN2 },
        { label: 'Стоимость',     value: `${totalVal}к₽`, delta: 'на складе', deltaDir: 'neu', color: AM2 },
        { label: 'Заявок ожид.', value: requests, delta: 'от рабочих', deltaDir: requests > 0 ? 'dn' : 'neu', color: requests > 0 ? AM2 : '#888' },
      ];
    }
    if (section === 'hr') {
      const active  = data.workers.filter(w => !w.archived);
      const working = active.filter(w => isWorkerOnShift(w, data.timesheet)).length;
      const absent  = active.filter(w => !isWorkerOnShift(w, data.timesheet)).length;
      const avgDone = active.length > 0 ? Math.round(data.ops.filter(o => o.status === 'done' && o.finishedAt >= periodStart).length / Math.max(working, 1)) : 0;
      return [
        { label: 'Сотрудников', value: active.length, delta: 'в системе', deltaDir: 'neu' },
        { label: 'На смене',    value: working, delta: `${Math.round(working / Math.max(active.length, 1) * 100)}% явка`, deltaDir: 'up', color: GN2 },
        { label: 'Отсутствуют', value: absent, delta: 'б/л, отпуск', deltaDir: absent > 3 ? 'dn' : 'neu', color: absent > 3 ? RD2 : '#888' },
        { label: 'Ср. выработка', value: `${avgDone}оп`, delta: 'на чел/месяц', deltaDir: 'neu', color: AM2 },
      ];
    }
    if (section === 'quality') {
      const doneOps   = data.ops.filter(o => o.status === 'done'   && o.finishedAt >= periodStart);
      const defectOps = data.ops.filter(o => o.status === 'defect' && o.finishedAt >= periodStart);
      const onCheck   = data.ops.filter(o => o.status === 'on_check' && !o.archived);
      const quality   = doneOps.length + defectOps.length > 0 ? Math.round(doneOps.length / (doneOps.length + defectOps.length) * 100) : 100;
      return [
        { label: 'Качество',      value: `${quality}%`, delta: 'принято с 1 раза', deltaDir: quality >= 95 ? 'up' : quality >= 85 ? 'neu' : 'dn', color: quality >= 95 ? GN2 : AM2 },
        { label: 'Брак',          value: defectOps.length, delta: 'за 30 дней', deltaDir: defectOps.length > 5 ? 'dn' : 'neu', color: defectOps.length > 0 ? RD2 : GN2 },
        { label: 'На проверке',   value: onCheck.length, delta: 'ожидают контроля', deltaDir: onCheck.length > 3 ? 'dn' : 'neu', color: onCheck.length > 0 ? AM2 : '#888' },
        { label: 'Рекламации',    value: (data.reclamations || []).length, delta: 'всего открытых', deltaDir: (data.reclamations || []).length > 0 ? 'dn' : 'up', color: (data.reclamations || []).length > 0 ? RD2 : GN2 },
      ];
    }
    return [];
  }, [section, data, periodStart]);

  return h('div', { style: { marginBottom: 16 } },
    // KPI полоска
    h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: 8, marginBottom: 8 } },
      kpis.map((kpi, i) => h(KpiCard, { key: i, ...kpi }))
    ),
    // Кнопка полной аналитики
    h('button', {
      style: { ...gbtn({ fontSize: 11, width: '100%', padding: '7px' }), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
      onClick: () => setExpanded(true)
    }, '📊 Полная аналитика — графики, фильтры, экспорт'),
    // Модалка
    expanded && h(FullAnalyticsModal, { section, data, onClose: () => setExpanded(false) })
  );
});

// ==================== PasteImportWidget ====================
// Универсальный виджет вставки из Excel через Ctrl+V
// Использование: h(PasteImportWidget, { columns, onImport, addToast })
// columns = [{ key, label, required?, default? }]
// onImport(rows) вызывается с массивом объектов после подтверждения



// ==================== KPI-отчёт для премирования ====================
const KPIReport = memo(({ data, onWorkerClick }) => {
  const [period, setPeriod] = useState(30);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);

  const workerKPIs = useMemo(() => {
    return data.workers.map(w => {
      const wid = w.id;
      const allOps = data.ops.filter(op => op.workerIds?.includes(wid));
      const doneInPeriod = allOps.filter(op => op.status === 'done' && op.finishedAt >= periodStart);
      const defectInPeriod = allOps.filter(op => op.status === 'defect' && op.finishedAt >= periodStart);
      const totalInPeriod = doneInPeriod.length + defectInPeriod.length;
      const allDone = allOps.filter(op => op.status === 'done').length;
      const level = getWorkerLevel(allDone);
      const levelTitle = getLevelTitle(level);

      // Производительность: факт/план
      const withPlan = doneInPeriod.filter(op => op.plannedHours && op.startedAt && op.finishedAt);
      const productivity = withPlan.length > 0 ? Math.round(withPlan.reduce((s, op) => s + op.plannedHours * 3600000, 0) / withPlan.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0) * 100) : null;

      // Качество: % без брака
      const quality = totalInPeriod > 0 ? Math.round(doneInPeriod.length / totalInPeriod * 100) : 100;

      // Дисциплина: простои по вине рабочего
      const downtimes = data.events.filter(e => e.workerId === wid && e.type === 'downtime' && e.ts >= periodStart);
      const downtimeHrs = Math.round(downtimes.reduce((s, e) => s + (e.duration || 0), 0) / 3600000 * 10) / 10;

      // Универсальность: количество разных типов операций
      const uniqueOps = new Set(doneInPeriod.map(op => op.name)).size;

      // Достижения за период
      const achievements = (w.achievements || []).length;

      // Итоговый KPI-балл (0-100)
      const kpiScore = Math.min(100, Math.round(
        (doneInPeriod.length > 0 ? 20 : 0) + // есть выработка
        Math.min((productivity || 0) / 5, 25) + // производительность до 25
        Math.min(quality / 4, 25) + // качество до 25
        Math.min(uniqueOps * 3, 15) + // универсальность до 15
        Math.min(level, 10) + // уровень до 10
        (downtimeHrs === 0 ? 5 : 0) // без простоев +5
      ));

      // Рекомендация по премированию
      const bonusLevel = kpiScore >= 85 ? 'A' : kpiScore >= 70 ? 'B' : kpiScore >= 50 ? 'C' : 'D';
      const bonusPct = bonusLevel === 'A' ? 30 : bonusLevel === 'B' ? 15 : bonusLevel === 'C' ? 0 : -10;

      return { ...w, level, levelTitle, doneCount: doneInPeriod.length, defectCount: defectInPeriod.length, productivity, quality, downtimeHrs, uniqueOps, achievements, kpiScore, bonusLevel, bonusPct };
    }).filter(w => isWorkerOnShift(w, data.timesheet) || w.doneCount > 0).sort((a, b) => b.kpiScore - a.kpiScore);
  }, [data, periodStart]);

  const exportKPI = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet(workerKPIs.map(w => ({
      'Сотрудник': w.name, 'Должность': w.position || '', 'Уровень': `${w.level} (${w.levelTitle})`,
      'Операций': w.doneCount, 'Брак': w.defectCount, 'Качество %': w.quality,
      'Производит. %': w.productivity || '', 'Универсальность': w.uniqueOps,
      'Простои (ч)': w.downtimeHrs, 'KPI': w.kpiScore, 'Грейд': w.bonusLevel, 'Премия %': w.bonusPct
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI');
    XLSX.writeFile(wb, `kpi_report_${period}d_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [workerKPIs, period]);

  const bonusColors = { A: GN, B: AM, C: '#888', D: RD };

  return h('div', null,
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
      h('span', { style: { fontSize: 12, fontWeight: 500 } }, 'Период:'),
      [7, 14, 30, 60, 90].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => setPeriod(d) }, `${d} дней`)),
      h('button', { style: gbtn({ marginLeft: 'auto' }), onClick: exportKPI }, '📥 Экспорт KPI в Excel')
    ),
    // Легенда грейдов
    h('div', { style: { ...S.card, marginBottom: 12, padding: 10, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 } },
      h('span', { style: { fontWeight: 500 } }, 'Грейды:'),
      h('span', { style: { color: GN } }, 'A (85+) = +30% премия'),
      h('span', { style: { color: AM } }, 'B (70-84) = +15%'),
      h('span', { style: { color: 'var(--muted)' } }, 'C (50-69) = 0%'),
      h('span', { style: { color: RD } }, 'D (<50) = −10%')
    ),
    workerKPIs.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: 'var(--muted)' } }, 'Нет данных за период') :
      h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, ['Сотрудник', 'Ур.', 'Операций', 'Качество', 'Произв.', 'Универс.', 'Простои', 'KPI', 'Грейд'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
        h('tbody', null, workerKPIs.map((w, i) => h('tr', { key: w.id, style: { background: i === 0 ? '#FFFDE7' : 'transparent' } },
          h('td', { style: { ...S.td, fontWeight: 500 } }, h(WN, { worker: w, onWorkerClick }), i === 0 && h('span', { style: { marginLeft: 4 } }, '🏆')),
          h('td', { style: { ...S.td, textAlign: 'center' } }, h('span', { style: { padding: '2px 6px', fontSize: 10, borderRadius: 6, background: AM3, color: AM2 } }, `${w.level}`)),
          h('td', { style: { ...S.td, textAlign: 'center' } }, w.doneCount, w.defectCount > 0 && h('span', { style: { color: RD, marginLeft: 4, fontSize: 10 } }, `−${w.defectCount}`)),
          h('td', { style: { ...S.td, textAlign: 'center', color: w.quality >= 95 ? GN : w.quality >= 80 ? AM : RD, fontWeight: 500 } }, `${w.quality}%`),
          h('td', { style: { ...S.td, textAlign: 'center', color: w.productivity ? (w.productivity >= 100 ? GN : w.productivity >= 80 ? AM : RD) : '#888' } }, w.productivity ? `${w.productivity}%` : '—'),
          h('td', { style: { ...S.td, textAlign: 'center' } }, w.uniqueOps),
          h('td', { style: { ...S.td, textAlign: 'center', color: w.downtimeHrs > 0 ? RD : GN } }, w.downtimeHrs > 0 ? `${w.downtimeHrs}ч` : '✓'),
          h('td', { style: { ...S.td, textAlign: 'center', fontSize: 16, fontWeight: 500, color: bonusColors[w.bonusLevel] || '#888' } }, w.kpiScore),
          h('td', { style: { ...S.td, textAlign: 'center' } },
            h('span', { style: { display: 'inline-block', width: 28, height: 28, lineHeight: '28px', textAlign: 'center', borderRadius: '50%', fontWeight: 700, fontSize: 13, color: '#fff', background: bonusColors[w.bonusLevel] || '#888' } }, w.bonusLevel),
            h('div', { style: { fontSize: 9, color: bonusColors[w.bonusLevel], marginTop: 2 } }, `${w.bonusPct > 0 ? '+' : ''}${w.bonusPct}%`)
          )
        )))
      )))
  );
});

// ==================== Рекомендации по назначениям ====================
const AssignmentRecommendations = memo(({ data, onUpdate, addToast }) => {
  const recommendations = useMemo(() => getAssignmentRecommendations(data)
, [data]);
  const { ask: askConfirm, confirmEl } = useConfirm();

  const assignWorker = useCallback(async (opId, workerId) => {
    const op = data.ops.find(o => o.id === opId);
    if (!op) return;
    const d = { ...data, ops: data.ops.map(o => o.id === opId ? { ...o, workerIds: [...new Set([...(o.workerIds || []), workerId])] } : o) };
    const worker = data.workers.find(w => w.id === workerId);
    onUpdate(d); DB.save(d).catch(() => { onUpdate(data); addToast('Ошибка сохранения', 'error'); });
    addToast(`${worker?.name} назначен на "${op.name}"`, 'success');
  }, [data, onUpdate, addToast]);

  const assignAll = useCallback(async () => {
    if (!(await askConfirm({ message: `Назначить кандидатов на ${recommendations.length} операций?`, danger: false }))) return;
    let updated = { ...data };
    let count = 0;
    recommendations.forEach(rec => {
      if (rec.candidates.length > 0) {
        const bestId = rec.candidates[0].workerId;
        updated = { ...updated, ops: updated.ops.map(o => o.id === rec.opId ? { ...o, workerIds: [...new Set([...(o.workerIds || []), bestId])] } : o) };
        count++;
      }
    });
    if (count > 0) {
      onUpdate(updated); DB.save(updated).catch(() => { onUpdate(data); addToast('Ошибка сохранения', 'error'); });
      addToast(`Назначено: ${count} операций`, 'success');
    }
  }, [data, recommendations, onUpdate, addToast]);

  return h('div', null,
    confirmEl,
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
      h('div', { style: S.sec }, `Рекомендации по назначениям (${recommendations.length} без исполнителя)`),
      recommendations.length > 0 && h('button', { style: abtn(), onClick: assignAll }, `🤖 Назначить всех (${recommendations.length})`)
    ),
    recommendations.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: 'var(--muted)', padding: 20 } }, 'Все операции имеют исполнителей')
      : recommendations.slice(0, 20).map(rec => h('div', { key: rec.opId, style: { ...S.card, padding: 12, marginBottom: 8, borderLeft: `4px solid ${PRIORITY[rec.orderPriority]?.color || '#888'}` } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
            h('div', null,
              h('span', { style: { fontSize: 13, fontWeight: 500 } }, rec.opName),
              h('span', { style: { marginLeft: 8, fontSize: 11, color: AM } }, rec.orderNumber),
              rec.deadline && h('span', { style: { marginLeft: 8, fontSize: 10, color: 'var(--muted)' } }, `до ${rec.deadline}`)
            ),
            h('span', { style: { fontSize: 10, color: PRIORITY[rec.orderPriority]?.color } }, PRIORITY[rec.orderPriority]?.label)
          ),
          rec.candidates.filter(c => !c.divider && c.hasAccess).length === 0 && rec.candidates.filter(c => !c.divider).length === 0
            ? h('div', { style: { fontSize: 11, color: RD } }, 'Нет сотрудников')
            : h('div', { style: { display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' } },
                rec.candidates.map((c, i) => {
                  // Разделитель между группами
                  if (c.divider) {
                    return rec.candidates.some(x => !x.divider && !x.hasAccess)
                      ? h('div', { key: 'div', style: { display: 'flex', alignItems: 'center', flexShrink: 0, gap: 4 } },
                          h('div', { style: { width: 1, height: 48, background: 'rgba(0,0,0,0.1)' } }),
                          h('div', { style: { fontSize: 9, color: '#bbb', writingMode: 'vertical-lr', textOrientation: 'mixed', padding: '4px 0' } }, 'нет допуска')
                        )
                      : null;
                  }
                  const isTop = i === 0 && c.hasAccess;
                  const noBadge = !c.hasAccess;
                  return h('div', { key: c.workerId,
                    style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      borderRadius: 10, cursor: 'pointer',
                      background: noBadge ? '#f5f5f2' : isTop ? GN3 : 'var(--card-2)',
                      border: noBadge ? '0.5px solid rgba(0,0,0,0.08)' : isTop ? `0.5px solid ${GN}` : '0.5px solid rgba(0,0,0,0.1)',
                      opacity: noBadge ? 0.7 : 1,
                      minWidth: 160, maxWidth: 200 },
                    onClick: () => assignWorker(rec.opId, c.workerId) },
                    h('div', { style: { flex: 1, minWidth: 0 } },
                      h('div', { style: { fontSize: 12, fontWeight: isTop ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                        c.workerName,
                        isTop && h('span', { style: { marginLeft: 4, fontSize: 10, color: GN } }, '★')
                      ),
                      h('div', { style: { fontSize: 10, color: 'var(--muted)', marginTop: 2 } },
                        `Ур.${c.level} · Опыт:${c.details.experience} · Кач:${c.qualityScore}/25`
                      )
                    ),
                    h('div', { style: { fontSize: 15, fontWeight: 500, color: noBadge ? '#bbb' : isTop ? GN : AM, flexShrink: 0 } }, noBadge ? '—' : c.totalScore)
                  );
                })
              )
        ))
  );
});




// ==================== AiAnalyst ====================
const AiAnalyst = memo(({ data, period, allData }) => {
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [question, setQuestion] = useState('');
  const [mode,     setMode]     = useState('auto'); // 'auto' | 'custom'

  const hasKey = !!(data.settings?.openrouterApiKey || data.settings?.geminiApiKey || data.settings?.aiApiKey);

  const buildContext = () => {
    const periodStart = Date.now() - period * 86400000;
    const src = allData || data;

    // Заказы
    const activeOrders = src.orders.filter(o => !o.archived && !o.shipped);
    const overdueOrders = activeOrders.filter(o => o.deadline && new Date(o.deadline) < new Date());
    const shippedMonth = src.orders.filter(o => o.shipped && (o.shippedAt||0) > periodStart);

    // Операции
    const ops = src.ops.filter(o => (o.finishedAt||0) > periodStart);
    const done = ops.filter(o => o.status === 'done');
    const defect = ops.filter(o => o.status === 'defect');
    const quality = ops.length > 0 ? Math.round(done.length / (done.length + defect.length) * 100) : 100;

    // Топ-рабочих по операциям
    const byWorker = {};
    done.forEach(op => (op.workerIds||[]).forEach(wid => {
      if (!byWorker[wid]) byWorker[wid] = { done: 0, defect: 0 };
      byWorker[wid].done++;
    }));
    defect.forEach(op => (op.workerIds||[]).forEach(wid => {
      if (!byWorker[wid]) byWorker[wid] = { done: 0, defect: 0 };
      if (byWorker[wid]) byWorker[wid].defect++;
    }));
    const workerStats = Object.entries(byWorker).map(([wid, s]) => {
      const w = data.workers.find(x => x.id === wid);
      return { name: w?.name || 'ID:'+wid.slice(-4), done: s.done, defect: s.defect,
               quality: s.done+s.defect > 0 ? Math.round(s.done/(s.done+s.defect)*100) : 100 };
    }).sort((a,b) => b.done - a.done).slice(0, 8);

    // Нормы (топ отклонений)
    const normAlerts = Object.entries(src.opNorms||{})
      .filter(([,n]) => n.samples >= 3 && n.planned)
      .map(([name, n]) => ({ name, planned: n.planned, avg: Math.round(n.totalMs/n.samples/3600000*10)/10 }))
      .filter(n => Math.abs(n.avg - n.planned) / n.planned > 0.2)
      .sort((a,b) => Math.abs(b.avg-b.planned)/b.planned - Math.abs(a.avg-a.planned)/a.planned)
      .slice(0, 5);

    // Простои
    const downtimes = (src.events||[]).filter(e => e.type === 'downtime' && e.ts > periodStart);
    const downtimeH = Math.round(downtimes.reduce((s,e) => s+(e.duration||0),0)/3600000*10)/10;
    const downtimeByType = {};
    downtimes.forEach(e => {
      const t = (src.downtimeTypes||[]).find(x=>x.id===e.downtimeTypeId)?.name || 'Прочее';
      downtimeByType[t] = (downtimeByType[t]||0) + (e.duration||0);
    });

    // Рекламации
    const recl = (src.reclamations||[]).filter(r => (r.createdAt||0) > periodStart);

    return `ПРОИЗВОДСТВЕННАЯ СТАТИСТИКА за последние ${period} дней:

ЗАКАЗЫ:
- Активных: ${activeOrders.length}, из них просрочено: ${overdueOrders.length}
- Отгружено за период: ${shippedMonth.length}
- Просроченные: ${overdueOrders.slice(0,5).map(o=>`${o.number} (${o.product||''})`).join(', ')}

ОПЕРАЦИИ:
- Выполнено: ${done.length}, брак: ${defect.length}, качество: ${quality}%
- Всего операций в работе сейчас: ${src.ops.filter(o=>o.status==='in_progress'&&!o.archived).length}

РАБОЧИЕ (топ по операциям):
${workerStats.map(w=>`- ${w.name}: ${w.done} оп., качество ${w.quality}%${w.defect>0?`, брак ${w.defect}`:''}`).join('\n')}

ПРОСТОИ: ${downtimeH}ч за период
${Object.entries(downtimeByType).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,ms])=>`- ${t}: ${Math.round(ms/3600000*10)/10}ч`).join('\n')}

НОРМЫ (отклонения >20%):
${normAlerts.length > 0 ? normAlerts.map(n=>`- ${n.name}: план ${n.planned}ч, факт ${n.avg}ч`).join('\n') : '- отклонений нет'}

РЕКЛАМАЦИИ за период: ${recl.length}`;
  };

  const analyze = async (customQuestion) => {
    const apiKey = data.settings?.openrouterApiKey || data.settings?.geminiApiKey || data.settings?.aiApiKey;
    if (!apiKey) { setError('API ключ не задан. Добавьте OpenRouter / Gemini / Claude API Key в Система → Настройки.'); return; }

    setLoading(true); setResult(null); setError(null);

    const context = buildContext();
    const userPrompt = customQuestion || `Проанализируй производственную статистику. Дай:
1. Главные проблемы (2-3 пункта)
2. Что идёт хорошо (1-2 пункта)  
3. Конкретные рекомендации (2-3 пункта)
Пиши кратко и по делу, как опытный производственник.`;

    try {
      // 1) OpenRouter — бесплатный, OpenAI-совместимый, и в отличие от Groq
      // реально поддерживает CORS для прямых вызовов из браузера.
      // model: 'openrouter/free' — их автороутер сам выбирает доступную бесплатную модель,
      // чтобы не зависеть от конкретного ID (линейка бесплатных моделей часто меняется).
      const openrouterKey = data.settings?.openrouterApiKey;
      if (openrouterKey) {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openrouterKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Teploros MES'
          },
          body: JSON.stringify({
            model: 'openrouter/free',
            max_tokens: 800,
            temperature: 0.3,
            messages: [
              { role: 'system', content: 'Ты аналитик производственной системы. Отвечай кратко и по делу на русском.' },
              { role: 'user', content: context + '\n\n' + userPrompt }
            ]
          })
        });
        const d = await r.json();
        if (d.choices?.[0]?.message?.content) {
          setResult(d.choices[0].message.content);
          setLoading(false); return;
        }
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      }

      // 2) Gemini Flash (бесплатный, но может быть недоступен по гео)
      const geminiKey = data.settings?.geminiApiKey;
      if (geminiKey) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: context + '\n\n' + userPrompt }] }],
            generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
          })
        });
        const d = await r.json();
        if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
          setResult(d.candidates[0].content.parts[0].text);
          setLoading(false); return;
        }
        if (d.error) throw new Error(d.error.message);
      }

      // 3) Fallback: Claude API (платный, но самый качественный ответ)
      const claudeKey = data.settings?.aiApiKey;
      if (claudeKey) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800,
            system: 'Ты аналитик производственной системы. Отвечай кратко и по делу на русском.',
            messages: [{ role: 'user', content: context + '\n\n' + userPrompt }] })
        });
        const d = await r.json();
        if (d.content?.[0]?.text) { setResult(d.content[0].text); setLoading(false); return; }
        if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
      }

      throw new Error('Нет доступного API ключа');
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const QUICK = [
    'Кто из рабочих показывает лучшие результаты и почему?',
    'Какие операции чаще всего дают брак?',
    'Есть ли риск срыва дедлайнов на этой неделе?',
    'Что делать с простоями?',
  ];

  return h('div', { style: { ...S.card, marginBottom: 12, border: `0.5px solid ${AM4}` } },

    // Заголовок
    h('div', { style: { display:'flex', alignItems:'center', gap:8, marginBottom: expanded ? 12 : 0 } },
      h('span', { style: { fontSize:18 } }, '🤖'),
      h('div', { style: { flex:1 } },
        h('div', { style: { fontWeight:600, fontSize:14 } }, 'AI-аналитик'),
        h('div', { style: { fontSize:11, color:'var(--muted)' } },
          data.settings?.openrouterApiKey ? 'OpenRouter (free) · готов к работе'
          : data.settings?.geminiApiKey ? 'Gemini Flash · готов к работе'
          : data.settings?.aiApiKey ? 'Claude API · готов к работе'
          : '⚠ API ключ не задан'
        )
      ),
      result && h('button', { style: gbtn({ fontSize:11, padding:'4px 10px' }), onClick:()=>setExpanded(v=>!v) }, expanded ? '▾' : '▸'),
      h('button', {
        style: loading ? gbtn({ fontSize:12, padding:'6px 14px', opacity:0.6 }) : abtn({ fontSize:12, padding:'6px 14px' }),
        onClick: () => { setExpanded(true); analyze(mode === 'custom' ? question : null); },
        disabled: loading
      }, loading ? '⏳ Анализирую...' : '✦ Анализировать')
    ),

    expanded && h('div', null,

      // Быстрые вопросы
      !result && !loading && h('div', { style: { marginBottom:10 } },
        h('div', { style:{ fontSize:11, color:'var(--muted)', marginBottom:6 } }, 'Быстрые вопросы:'),
        h('div', { style:{ display:'flex', flexWrap:'wrap', gap:6 } },
          QUICK.map(q => h('button', { key:q, style: gbtn({ fontSize:11, padding:'4px 10px' }),
            onClick: () => { setExpanded(true); analyze(q); }
          }, q))
        )
      ),

      // Своё поле вопроса
      !result && !loading && h('div', { style:{ display:'flex', gap:8, marginTop:8 } },
        h('input', { type:'text', placeholder:'Или задай свой вопрос...', value: question,
          onChange: e => setQuestion(e.target.value),
          onKeyDown: e => e.key === 'Enter' && question.trim() && analyze(question),
          style:{ flex:1, fontSize:13, padding:'7px 10px', borderRadius:8, border:'0.5px solid rgba(0,0,0,0.15)',
            background:'var(--bg,#fff)', color:'var(--fg,#222)', outline:'none' }
        }),
        h('button', { style: abtn({ fontSize:12, padding:'6px 14px' }),
          onClick: () => question.trim() && analyze(question)
        }, 'Спросить')
      ),

      // Ошибка
      error && h('div', { style:{ padding:'10px 12px', background: RD3, borderRadius:8, fontSize:12, color: RD2, marginTop:8 } },
        '⚠ ', error,
        error.includes('API ключ') && h('span', null, ' → Система → Настройки → OpenRouter / Gemini / Claude API Key')
      ),

      // Результат
      result && h('div', { style:{ marginTop:8 } },
        h('div', { style:{ padding:'12px 14px', background:'var(--bg,#f8f8f5)', borderRadius:10,
          fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', color:'var(--fg,#222)' } }, result),
        h('div', { style:{ display:'flex', gap:8, marginTop:8 } },
          h('button', { style: gbtn({ fontSize:11, padding:'4px 10px' }),
            onClick: () => { setResult(null); setError(null); }
          }, '← Новый вопрос'),
          h('button', { style: gbtn({ fontSize:11, padding:'4px 10px' }),
            onClick: () => analyze(mode === 'custom' ? question : null)
          }, '↺ Обновить')
        )
      )
    )
  );
});

// ==================== AnalyticsDashboard (Волна 1: Lead Time, Такт, Нормы, Парето, Тренды) ====================
const AnalyticsDashboardLegacy = memo(({ data, onWorkerClick }) => {
  const [period, setPeriod] = useState(30);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);

  // ── Загрузка архивных данных для периодов > 60 дней ──
  const [archiveData, setArchiveData] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveMonthsList, setArchiveMonthsList] = useState([]);

  // Загружаем список доступных архивных месяцев
  useEffect(() => {
    DB.listArchiveMonths().then(months => setArchiveMonthsList(months)).catch(() => {});
  }, []);

  // При выборе периода > 60 дней — подгружаем нужные архивные месяцы
  useEffect(() => {
    if (period <= 60) { setArchiveData(null); return; }
    setArchiveLoading(true);
    const needed = [];
    const now_ = Date.now();
    for (let i = 0; i < Math.ceil(period / 30) + 1; i++) {
      const d = new Date(now_ - i * 30 * 86400000);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!needed.includes(key)) needed.push(key);
    }
    Promise.all(needed.map(m => DB.loadArchive(m).catch(() => null)))
      .then(results => {
        const merged = { orders:[], ops:[], events:[], materialConsumptions:[] };
        results.filter(Boolean).forEach(r => {
          ['orders','ops','events','materialConsumptions'].forEach(k => {
            if (Array.isArray(r[k])) merged[k].push(...r[k]);
          });
        });
        setArchiveData(merged);
        setArchiveLoading(false);
      })
      .catch(() => setArchiveLoading(false));
  }, [period]);

  // Объединённые данные: текущие + архивные
  const allData = useMemo(() => {
    if (!archiveData || period <= 60) return data;
    const mergeById = (curr, arch) => {
      const ids = new Set((curr||[]).map(x=>x.id));
      return [...(curr||[]), ...(arch||[]).filter(x=>!ids.has(x.id))];
    };
    return {
      ...data,
      orders: mergeById(data.orders, archiveData.orders),
      ops:    mergeById(data.ops,    archiveData.ops),
      events: mergeById(data.events, archiveData.events),
      materialConsumptions: mergeById(data.materialConsumptions, archiveData.materialConsumptions),
    };
  }, [data, archiveData, period]);
  const chartRef1 = useRef(null); const canvasRef1 = useRef(null);
  const chartRef2 = useRef(null); const canvasRef2 = useRef(null);

  // ===== 1. Lead Time по заказам =====
  const leadTimeData = useMemo(() => {
    return allData.orders.filter(o => !o.archived).map(order => {
      const ops = allData.ops.filter(op => op.orderId === order.id);
      const doneOps = ops.filter(op => op.status === 'done' && op.startedAt && op.finishedAt);
      if (doneOps.length === 0) return null;
      const firstStart = Math.min(...doneOps.map(op => op.startedAt));
      const lastFinish = Math.max(...doneOps.map(op => op.finishedAt));
      const totalElapsed = lastFinish - firstStart; // общее время от начала до конца
      const workingTime = doneOps.reduce((s, op) => s + (op.finishedAt - op.startedAt), 0); // время в работе
      const waitingTime = totalElapsed - workingTime; // время ожидания между этапами
      const allDone = ops.every(op => op.status === 'done' || op.status === 'defect');
      return { id: order.id, number: order.number, product: order.product, totalElapsed, workingTime, waitingTime, waitingPct: totalElapsed > 0 ? Math.round(waitingTime / totalElapsed * 100) : 0, opsDone: doneOps.length, opsTotal: ops.length, completed: allDone, firstStart, lastFinish };
    }).filter(Boolean).sort((a, b) => b.lastFinish - a.lastFinish);
  }, [data.orders, data.ops]);

  const avgLeadTime = leadTimeData.length > 0 ? leadTimeData.reduce((s, d) => s + d.totalElapsed, 0) / leadTimeData.length : 0;
  const avgWaitingPct = leadTimeData.length > 0 ? Math.round(leadTimeData.reduce((s, d) => s + d.waitingPct, 0) / leadTimeData.length) : 0;

  // ===== 2. Автонормирование =====
  const normSuggestions = useMemo(() => {
    const byName = {};
    allData.ops.filter(op => op.status === 'done' && op.startedAt && op.finishedAt && op.finishedAt >= periodStart).forEach(op => {
      if (!byName[op.name]) byName[op.name] = { times: [], currentNorm: null };
      byName[op.name].times.push((op.finishedAt - op.startedAt) / 3600000);
      if (op.plannedHours) byName[op.name].currentNorm = op.plannedHours;
    });
    return Object.entries(byName).map(([name, stats]) => {
      const sorted = stats.times.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = stats.times.reduce((s, t) => s + t, 0) / stats.times.length;
      const suggested = Math.round(median * 10) / 10;
      const current = stats.currentNorm;
      const deviation = current ? Math.round((avg / current - 1) * 100) : null;
      return { name, count: stats.times.length, avg: Math.round(avg * 10) / 10, median: suggested, min: Math.round(Math.min(...stats.times) * 10) / 10, max: Math.round(Math.max(...stats.times) * 10) / 10, current, suggested, deviation };
    }).filter(s => s.count >= 3).sort((a, b) => Math.abs(b.deviation || 0) - Math.abs(a.deviation || 0));
  }, [data.ops, periodStart]);

  // ===== 3. Расчёт такта =====
  const taktData = useMemo(() => {
    const completedOrders = data.orders.filter(o => {
      const ops = data.ops.filter(op => op.orderId === o.id);
      return ops.length > 0 && ops.every(op => op.status === 'done' || op.status === 'defect');
    });
    const completedInPeriod = completedOrders.filter(o => {
      const lastOp = data.ops.filter(op => op.orderId === o.id && op.finishedAt).sort((a, b) => b.finishedAt - a.finishedAt)[0];
      return lastOp && lastOp.finishedAt >= periodStart;
    });
    const pendingOrders = data.orders.filter(o => !o.archived && data.ops.some(op => op.orderId === o.id && op.status !== 'done' && op.status !== 'defect'));
    const daysInPeriod = period;
    const actualRate = completedInPeriod.length / daysInPeriod; // заказов в день
    // Требуемый такт: незавершённые заказы / оставшееся время до ближайшего дедлайна
    const withDeadline = pendingOrders.filter(o => o.deadline);
    const avgDaysToDeadline = withDeadline.length > 0 ? withDeadline.reduce((s, o) => s + Math.max(1, (new Date(o.deadline).getTime() - now()) / 86400000), 0) / withDeadline.length : 30;
    const requiredRate = pendingOrders.length > 0 ? pendingOrders.length / avgDaysToDeadline : 0;
    const taktOk = actualRate >= requiredRate || requiredRate === 0;
    return { completedInPeriod: completedInPeriod.length, pendingOrders: pendingOrders.length, actualRate: Math.round(actualRate * 100) / 100, requiredRate: Math.round(requiredRate * 100) / 100, taktOk, avgDaysToDeadline: Math.round(avgDaysToDeadline) };
  }, [data.orders, data.ops, period, periodStart]);

  // ===== 4. Парето-анализ простоев =====
  const paretoData = useMemo(() => {
    const downtimes = data.events.filter(e => e.type === 'downtime' && e.ts >= periodStart);
    const byReason = {};
    downtimes.forEach(e => {
      const reason = data.downtimeTypes.find(dt => dt.id === e.downtimeTypeId)?.name || 'Неизвестно';
      if (!byReason[reason]) byReason[reason] = { count: 0, totalMs: 0 };
      byReason[reason].count++;
      byReason[reason].totalMs += (e.duration || 0);
    });
    const sorted = Object.entries(byReason).sort((a, b) => b[1].totalMs - a[1].totalMs);
    const totalMs = sorted.reduce((s, [, v]) => s + v.totalMs, 0);
    let cumulative = 0;
    return sorted.map(([reason, stat]) => {
      cumulative += stat.totalMs;
      return { reason, count: stat.count, totalHrs: Math.round(stat.totalMs / 3600000 * 10) / 10, pct: totalMs > 0 ? Math.round(stat.totalMs / totalMs * 100) : 0, cumPct: totalMs > 0 ? Math.round(cumulative / totalMs * 100) : 0 };
    });
  }, [data.events, data.downtimeTypes, periodStart]);

  // ===== 5. Тренды качества =====
  const qualityTrends = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < Math.min(period / 7, 12); i++) {
      const weekEnd = now() - i * 7 * 86400000;
      const weekStart = weekEnd - 7 * 86400000;
      const done = data.ops.filter(op => op.status === 'done' && op.finishedAt >= weekStart && op.finishedAt < weekEnd).length;
      const defect = data.ops.filter(op => op.status === 'defect' && op.finishedAt >= weekStart && op.finishedAt < weekEnd).length;
      const total = done + defect;
      const rate = total > 0 ? Math.round(defect / total * 1000) / 10 : 0;
      weeks.push({ weekNum: i, label: i === 0 ? 'Тек.' : `-${i}нед`, done, defect, total, rate });
    }
    weeks.reverse();
    // Тренд: растёт ли брак последние 3 недели
    const recent = weeks.slice(-3);
    const trending = recent.length >= 3 && recent[2].rate > recent[1].rate && recent[1].rate > recent[0].rate && recent[2].rate > 2;
    return { weeks, trending };
  }, [data.ops, period]);

  // Chart.js для Парето
  useEffect(() => {
    if (!canvasRef1.current || !window.Chart || paretoData.length === 0) return;
    if (chartRef1.current) chartRef1.current.destroy();
    chartRef1.current = new Chart(canvasRef1.current, {
      type: 'bar',
      data: { labels: paretoData.map(d => d.reason.length > 15 ? d.reason.slice(0, 15) + '…' : d.reason), datasets: [
        { label: 'Часы простоя', data: paretoData.map(d => d.totalHrs), backgroundColor: RD, borderRadius: 4, yAxisID: 'y' },
        { label: 'Накопительный %', data: paretoData.map(d => d.cumPct), type: 'line', borderColor: AM, pointBackgroundColor: AM, yAxisID: 'y1', tension: 0.3 }
      ]},
      options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Часы' } }, y1: { position: 'right', min: 0, max: 100, title: { display: true, text: '%' }, grid: { display: false } } } }
    });
    return () => { if (chartRef1.current) chartRef1.current.destroy(); };
  }, [paretoData]);

  // Chart.js для трендов качества
  useEffect(() => {
    if (!canvasRef2.current || !window.Chart || qualityTrends.weeks.length === 0) return;
    if (chartRef2.current) chartRef2.current.destroy();
    chartRef2.current = new Chart(canvasRef2.current, {
      type: 'bar',
      data: { labels: qualityTrends.weeks.map(w => w.label), datasets: [
        { label: 'Выполнено', data: qualityTrends.weeks.map(w => w.done), backgroundColor: GN, borderRadius: 4, stack: 'a' },
        { label: 'Брак', data: qualityTrends.weeks.map(w => w.defect), backgroundColor: RD, borderRadius: 4, stack: 'a' },
        { label: 'Брак %', data: qualityTrends.weeks.map(w => w.rate), type: 'line', borderColor: AM, pointBackgroundColor: AM, yAxisID: 'y1', tension: 0.3 }
      ]},
      options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { beginAtZero: true, stacked: true, title: { display: true, text: 'Операций' } }, y1: { position: 'right', min: 0, title: { display: true, text: 'Брак %' }, grid: { display: false } } } }
    });
    return () => { if (chartRef2.current) chartRef2.current.destroy(); };
  }, [qualityTrends]);

  return h('div', null,
    // Период
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems:'center' } },
      [7, 14, 30, 60, 90].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => setPeriod(d) }, `${d} дней`)),
      archiveLoading && h('span', { style: { fontSize: 11, color: '#EF9F27' } }, '⏳ архив...')
    ),

    // AI-аналитик
    h(AiAnalyst, { data, period, allData }),

    // Алерт: тренд качества
    qualityTrends.trending && h('div', { role: 'alert', style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12, padding: 12 } },
      h('div', { style: { fontSize: 12, color: RD, fontWeight: 500 } }, '⚠ Брак растёт 3 недели подряд! Возможна системная проблема — проверьте оборудование и материалы.')
    ),

    // Такт производства
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Такт производства'),
      h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 10, marginBottom: 8 } },
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: GN } }, taktData.completedInPeriod), h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' } }, `Завершено за ${period}д`)),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: AM } }, taktData.pendingOrders), h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' } }, 'В очереди')),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: taktData.taktOk ? GN : RD } }, `${taktData.actualRate}`), h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Факт (заказов/день)')),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: taktData.taktOk ? GN : RD } }, `${taktData.requiredRate}`), h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Нужно (заказов/день)'))
      ),
      !taktData.taktOk && taktData.requiredRate > 0 && h('div', { style: { fontSize: 11, color: RD, fontWeight: 500, marginTop: 4 } }, `⚠ Производство не успевает: нужно ${taktData.requiredRate} заказов/день, факт ${taktData.actualRate}. Среднее время до дедлайна: ${taktData.avgDaysToDeadline} дней.`)
    ),

    // Lead Time
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Lead Time — время прохождения заказа'),
      leadTimeData.length === 0 ? h('div', { style: { padding: 12, color: 'var(--muted)', textAlign: 'center' } }, 'Нет завершённых операций') : h('div', null,
        h('div', { style: { display: 'flex', gap: 16, marginBottom: 12 } },
          h('div', null, h('div', { style: { fontSize: 24, fontWeight: 500, color: AM } }, fmtDur(avgLeadTime)), h('div', { style: { fontSize: 10, color: 'var(--muted)' } }, 'Средний Lead Time')),
          h('div', null, h('div', { style: { fontSize: 24, fontWeight: 500, color: avgWaitingPct > 50 ? RD : AM } }, `${avgWaitingPct}%`), h('div', { style: { fontSize: 10, color: 'var(--muted)' } }, 'Среднее ожидание'))
        ),
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Заказ', 'Изделие', 'Lead Time', 'В работе', 'Ожидание', '% ожид.', 'Операций'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, leadTimeData.slice(0, 15).map(d => h('tr', { key: d.id },
            h('td', { style: { ...S.td, color: AM, fontWeight: 500 } }, d.number),
            h('td', { style: S.td }, d.product),
            h('td', { style: { ...S.td, fontFamily: 'monospace' } }, fmtDur(d.totalElapsed)),
            h('td', { style: { ...S.td, fontFamily: 'monospace', color: GN } }, fmtDur(d.workingTime)),
            h('td', { style: { ...S.td, fontFamily: 'monospace', color: d.waitingPct > 50 ? RD : '#888' } }, fmtDur(d.waitingTime)),
            h('td', { style: { ...S.td, color: d.waitingPct > 50 ? RD : d.waitingPct > 30 ? AM : GN, fontWeight: 500 } }, `${d.waitingPct}%`),
            h('td', { style: S.td }, `${d.opsDone}/${d.opsTotal}`)
          )))
        ))
      )
    ),

    // Тренды качества (график)
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Тренды качества (по неделям)'),
      qualityTrends.weeks.length === 0 ? h('div', { style: { padding: 12, color: 'var(--muted)', textAlign: 'center' } }, 'Нет данных') : h('canvas', { ref: canvasRef2 })
    ),

    // Парето-анализ простоев (график + таблица)
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Парето-анализ простоев'),
      paretoData.length === 0 ? h('div', { style: { padding: 12, color: 'var(--muted)', textAlign: 'center' } }, 'Нет простоев за период') : h('div', null,
        h('canvas', { ref: canvasRef1, style: { marginBottom: 12 } }),
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Причина', 'Кол-во', 'Потеряно (ч)', 'Доля', 'Накопит.'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, paretoData.map((d, i) => h('tr', { key: i, style: { background: d.cumPct <= 80 ? '#FFF8E1' : 'transparent' } },
            h('td', { style: { ...S.td, fontWeight: d.cumPct <= 80 ? 500 : 400 } }, d.reason),
            h('td', { style: { ...S.td, textAlign: 'center' } }, d.count),
            h('td', { style: { ...S.td, fontFamily: 'monospace', color: RD } }, `${d.totalHrs}`),
            h('td', { style: { ...S.td, textAlign: 'center' } }, `${d.pct}%`),
            h('td', { style: { ...S.td, textAlign: 'center', fontWeight: 500, color: d.cumPct <= 80 ? RD : '#888' } }, `${d.cumPct}%`)
          )))
        )),
        h('div', { style: { fontSize: 10, color: 'var(--muted)', marginTop: 6 } }, 'Жёлтым выделены причины, дающие 80% потерь (правило Парето)')
      )
    ),

    // Автонормирование
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Нормирование операций (факт vs план)'),
      normSuggestions.length === 0 ? h('div', { style: { padding: 12, color: 'var(--muted)', textAlign: 'center' } }, 'Недостаточно данных (нужно ≥3 завершённых операций каждого типа)') :
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Операция', 'Замеров', 'Текущая норма', 'Медиана факт', 'Мин', 'Макс', 'Отклонение', 'Рекомендация'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, normSuggestions.map((s, i) => h('tr', { key: i, style: { background: s.deviation && Math.abs(s.deviation) > 30 ? '#FFF8E1' : 'transparent' } },
            h('td', { style: S.td }, s.name),
            h('td', { style: { ...S.td, textAlign: 'center' } }, s.count),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center' } }, s.current ? `${s.current}ч` : '—'),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', fontWeight: 500 } }, `${s.median}ч`),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', color: 'var(--muted)' } }, `${s.min}ч`),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', color: 'var(--muted)' } }, `${s.max}ч`),
            h('td', { style: { ...S.td, textAlign: 'center', color: s.deviation === null ? '#888' : Math.abs(s.deviation) > 30 ? RD : GN, fontWeight: 500 } }, s.deviation !== null ? `${s.deviation > 0 ? '+' : ''}${s.deviation}%` : '—'),
            h('td', { style: { ...S.td, fontSize: 11 } }, s.deviation !== null && Math.abs(s.deviation) > 20 ? `Обновить до ${s.suggested}ч` : '✓ Норма актуальна')
          )))
        ))
    )
  );
});

// ==================== ReportsBuilder (конструктор дашборда) ====================
// Метрики доступные для виджетов
const WIDGET_METRICS = [
  { id:'done_day',       cat:'Производство', name:'Выработка по дням',         types:['bar','line','area'],              color: GN },
  { id:'defect_reason',  cat:'Производство', name:'Брак по причинам',           types:['bar','horizontalBar','doughnut'], color: RD },
  { id:'worker_output',  cat:'Производство', name:'Выработка по сотрудникам',   types:['bar','horizontalBar','doughnut'], color: BL },
  { id:'quality_trend',  cat:'Качество',     name:'Качество (тренд)',            types:['line','area','bar'],              color: GN },
  { id:'defect_worker',  cat:'Качество',     name:'Брак по исполнителям',        types:['bar','horizontalBar','doughnut'], color: RD },
  { id:'downtime_cat',   cat:'Простои',      name:'Простои по категориям',       types:['doughnut','bar','horizontalBar'], color: AM },
  { id:'downtime_equip', cat:'Простои',      name:'Простои по оборудованию',     types:['bar','horizontalBar'],           color: AM4 },
  { id:'orders_prog',    cat:'Заказы',       name:'Прогресс заказов',            types:['bar','horizontalBar'],           color: '#7F77DD' },
  { id:'leadtime',       cat:'Заказы',       name:'Lead Time по заказам',        types:['bar','line'],                    color: '#7F77DD' },
  { id:'mat_consume',    cat:'Склад',        name:'Расход материалов',           types:['bar','horizontalBar','doughnut'],color: BL },
  { id:'mat_critical',   cat:'Склад',        name:'Критичные остатки',           types:['horizontalBar','bar'],           color: RD },
  { id:'worker_status',  cat:'HR',           name:'Статус сотрудников',          types:['doughnut','bar'],                color: GN },
  { id:'ops_status',     cat:'Производство', name:'Статус операций',             types:['doughnut','bar'],                color: AM },
  { id:'shift_output',   cat:'Производство', name:'Выработка по сменам',         types:['bar','line'],                    color: GN },
];

const CHART_TYPE_LABELS = { bar:'Столбцы', line:'Линия', area:'Область', doughnut:'Круговая', horizontalBar:'Горизонт.' };
const CHART_TYPE_ICONS  = { bar:'▊', line:'∿', area:'◭', doughnut:'◉', horizontalBar:'▬' };
const LAYOUT_STORAGE_KEY = 'teploros_dashboard_layout_v1';
const DEFAULT_LAYOUT = [
  { id:'w1', metric:'done_day',      type:'bar',          title:'Выработка по дням',     period:7  },
  { id:'w2', metric:'defect_reason', type:'doughnut',     title:'Брак по причинам',      period:30 },
  { id:'w3', metric:'quality_trend', type:'line',         title:'Качество (тренд, %)',   period:7  },
  { id:'w4', metric:'worker_output', type:'horizontalBar',title:'Топ сотрудников',       period:30 },
];

// Вычислить данные для метрики из реальных данных Firebase
const computeWidgetData = (metricId, data, periodDays) => {
  const periodStart = now() - periodDays * 86400000;
  const DAY_LABELS = (n) => Array.from({ length: n }, (_, i) => {
    const d = new Date(now() - (n - 1 - i) * 86400000);
    return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  });

  switch (metricId) {
    case 'done_day': {
      const n = Math.min(periodDays, 14);
      const labels = DAY_LABELS(n);
      const values = Array.from({ length: n }, (_, i) => {
        const s = now() - (n - i) * 86400000, e = now() - (n - 1 - i) * 86400000;
        return data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'done').length;
      });
      return { labels, values };
    }
    case 'defect_reason': {
      const map = {};
      data.ops.filter(o => o.status === 'defect' && o.finishedAt >= periodStart).forEach(o => {
        const k = data.defectReasons?.find(r => r.id === o.defectReasonId)?.name || 'Прочее';
        map[k] = (map[k] || 0) + 1;
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { labels: sorted.map(x => x[0]), values: sorted.map(x => x[1]) };
    }
    case 'worker_output': {
      const map = {};
      data.ops.filter(o => o.status === 'done' && o.finishedAt >= periodStart).forEach(o => {
        (o.workerIds || []).forEach(wid => {
          const name = data.workers.find(w => w.id === wid)?.name?.split(' ')[0] || '?';
          map[name] = (map[name] || 0) + 1;
        });
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 7);
      return { labels: sorted.map(x => x[0]), values: sorted.map(x => x[1]) };
    }
    case 'quality_trend': {
      const n = Math.min(periodDays, 14);
      const labels = DAY_LABELS(n);
      const values = Array.from({ length: n }, (_, i) => {
        const s = now() - (n - i) * 86400000, e = now() - (n - 1 - i) * 86400000;
        const dn = data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'done').length;
        const df = data.ops.filter(o => o.finishedAt >= s && o.finishedAt < e && o.status === 'defect').length;
        return dn + df > 0 ? Math.round(dn / (dn + df) * 100) : 100;
      });
      return { labels, values };
    }
    case 'defect_worker': {
      const map = {};
      data.ops.filter(o => o.status === 'defect' && o.finishedAt >= periodStart).forEach(o => {
        (o.workerIds || []).forEach(wid => {
          const name = data.workers.find(w => w.id === wid)?.name?.split(' ')[0] || '?';
          map[name] = (map[name] || 0) + 1;
        });
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { labels: sorted.map(x => x[0]), values: sorted.map(x => x[1]) };
    }
    case 'downtime_cat': {
      const map = { 'Оборудование': 0, 'Материалы': 0, 'Организация': 0, 'Прочее': 0 };
      data.events.filter(e => e.type === 'downtime' && e.ts >= periodStart).forEach(e => {
        const reason = data.downtimeTypes?.find(d => d.id === e.downtimeTypeId)?.name || '';
        const cat = reason.toLowerCase().includes('обор') ? 'Оборудование'
          : reason.toLowerCase().includes('матер') ? 'Материалы'
          : reason.toLowerCase().includes('орган') ? 'Организация' : 'Прочее';
        map[cat] += Math.round((e.duration || 0) / 3600000 * 10) / 10;
      });
      const entries = Object.entries(map).filter(x => x[1] > 0);
      return { labels: entries.map(x => x[0]), values: entries.map(x => x[1]) };
    }
    case 'downtime_equip': {
      const map = {};
      data.events.filter(e => e.type === 'downtime' && e.ts >= periodStart && e.equipmentId).forEach(e => {
        const eq = data.equipment?.find(x => x.id === e.equipmentId)?.name || 'Неизвестно';
        map[eq] = (map[eq] || 0) + Math.round((e.duration || 0) / 3600000 * 10) / 10;
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { labels: sorted.map(x => x[0]), values: sorted.map(x => x[1]) };
    }
    case 'orders_prog': {
      const orders = data.orders.filter(o => !o.archived).slice(0, 6);
      const labels = orders.map(o => o.number || o.id.slice(0, 6));
      const values = orders.map(o => {
        const ops = data.ops.filter(op => op.orderId === o.id);
        const done = ops.filter(op => op.status === 'done').length;
        return ops.length > 0 ? Math.round(done / ops.length * 100) : 0;
      });
      return { labels, values };
    }
    case 'leadtime': {
      const orders = data.orders.filter(o => !o.archived).slice(0, 6);
      const labels = orders.map(o => o.number || o.id.slice(0, 6));
      const values = orders.map(o => {
        const ops = data.ops.filter(op => op.orderId === o.id && op.startedAt);
        if (!ops.length) return 0;
        const start = Math.min(...ops.map(op => op.startedAt));
        const end = Math.max(...ops.filter(op => op.finishedAt).map(op => op.finishedAt));
        return end > start ? Math.round((end - start) / 86400000) : 0;
      });
      return { labels, values };
    }
    case 'mat_consume': {
      const map = {};
      (data.materialConsumptions || []).filter(mc => mc.ts >= periodStart).forEach(mc => {
        const m = data.materials.find(x => x.id === mc.materialId);
        if (m) { const k = m.name.length > 16 ? m.name.slice(0, 16) + '…' : m.name; map[k] = (map[k] || 0) + mc.qty; }
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return { labels: sorted.map(x => x[0]), values: sorted.map(x => Math.round(x[1] * 10) / 10) };
    }
    case 'mat_critical': {
      const crit = data.materials.filter(m => m.minStock && m.quantity <= m.minStock).slice(0, 6);
      return { labels: crit.map(m => m.name.length > 14 ? m.name.slice(0, 14) + '…' : m.name), values: crit.map(m => m.quantity) };
    }
    case 'worker_status': {
      const active = data.workers.filter(w => !w.archived);
      const groups = { 'На смене': 0, 'Отсутствует': 0, 'Больничный': 0, 'Отпуск': 0 };
      active.forEach(w => {
        const s = getWorkerStatusToday(w.id, data.timesheet) || w.status || 'working';
        if (s === 'working') groups['На смене']++;
        else if (s === 'absent') groups['Отсутствует']++;
        else if (s === 'sick') groups['Больничный']++;
        else if (s === 'vacation') groups['Отпуск']++;
      });
      const entries = Object.entries(groups).filter(x => x[1] > 0);
      return { labels: entries.map(x => x[0]), values: entries.map(x => x[1]) };
    }
    case 'ops_status': {
      const active = data.ops.filter(o => !o.archived);
      const g = { 'Выполнено': 0, 'В работе': 0, 'Ожидание': 0, 'Брак': 0 };
      active.forEach(o => {
        if (o.status === 'done') g['Выполнено']++;
        else if (o.status === 'in_progress') g['В работе']++;
        else if (o.status === 'pending') g['Ожидание']++;
        else if (o.status === 'defect' || o.status === 'rework') g['Брак']++;
      });
      const entries = Object.entries(g).filter(x => x[1] > 0);
      return { labels: entries.map(x => x[0]), values: entries.map(x => x[1]) };
    }
    case 'shift_output': {
      const map = {};
      data.events.filter(e => e.type === 'done' && e.ts >= periodStart).forEach(e => {
        const k = e.shift || 'Смена ?'; map[k] = (map[k] || 0) + 1;
      });
      const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
      return { labels: entries.map(x => x[0]), values: entries.map(x => x[1]) };
    }
    default: return { labels: [], values: [] };
  }
};

// Компонент одного виджета с Chart.js
const DashWidget = memo(({ widget, data, editMode, onChangeType, onRemove, onEdit }) => {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const m = WIDGET_METRICS.find(x => x.id === widget.metric);
  const color = m?.color || AM;
  const PIE_COLORS = [AM, BL, GN, RD, '#7F77DD', '#1D9E75', '#D85A30'];

  const chartData = useMemo(() => computeWidgetData(widget.metric, data, widget.period || 30), [widget.metric, widget.period, data]);

  useEffect(() => {
    if (!canvasRef.current || !window.Chart || !chartData.labels.length) return;
    if (chartRef.current) { try { chartRef.current.destroy(); } catch(e) {} chartRef.current = null; }
    const type = widget.type;
    const isDonut = type === 'doughnut';
    const isHBar  = type === 'horizontalBar';
    const isArea  = type === 'area';
    const isLine  = type === 'line';

    const datasets = isDonut
      ? [{ data: chartData.values, backgroundColor: PIE_COLORS, borderWidth: 0 }]
      : [{
          data: chartData.values,
          backgroundColor: isArea ? color + '33' : color,
          borderColor: color,
          fill: isArea,
          tension: isArea || isLine ? 0.4 : 0,
          borderRadius: (!isLine && !isArea) ? 3 : 0,
          borderWidth: isLine || isArea ? 2 : 0,
          pointRadius: isLine || isArea ? 3 : 0,
          pointBackgroundColor: color,
        }];

    try {
      chartRef.current = new Chart(canvasRef.current, {
        type: isHBar ? 'bar' : isDonut ? 'doughnut' : isArea ? 'line' : type,
        data: { labels: chartData.labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          indexAxis: isHBar ? 'y' : undefined,
          plugins: {
            legend: { display: isDonut, position: 'right', labels: { font: { size: 10 }, boxWidth: 10 } },
            tooltip: { enabled: true }
          },
          scales: isDonut ? {} : {
            x: { display: true, grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8 } },
            y: { display: true, beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } }
          },
          animation: { duration: 300 }
        }
      });
    } catch(e) { console.warn('Chart error:', e); }
    return () => { if (chartRef.current) { try { chartRef.current.destroy(); } catch(e) {} } };
  }, [chartData, widget.type, color]);

  return h('div', { style: { background: 'var(--card-solid,#fff)', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' } },
    // Заголовок виджета
    h('div', { style: { padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
      h('span', { style: { fontSize: 12, fontWeight: 500, color: 'var(--fg)', flex: 1 } }, widget.title),
      h('span', { style: { fontSize: 10, color: 'var(--muted)', marginRight: 4 } }, `${widget.period}д`),
      // В режиме редактирования — кнопки типов
      editMode && m?.types.map(t => h('button', { key: t, title: CHART_TYPE_LABELS[t],
        style: { ...( widget.type === t ? abtn({ fontSize: 10, padding: '2px 7px' }) : gbtn({ fontSize: 10, padding: '2px 7px' }) ) },
        onClick: () => onChangeType(widget.id, t)
      }, CHART_TYPE_ICONS[t])),
      // Кнопка настройки
      h('button', { title: 'Настроить виджет', style: gbtn({ fontSize: 10, padding: '2px 8px' }), onClick: () => onEdit(widget.id) }, '⚙'),
      // Удалить (только в режиме редактирования)
      editMode && h('button', { title: 'Удалить', style: { ...rbtn({ fontSize: 10, padding: '2px 7px' }) }, onClick: () => onRemove(widget.id) }, '✕')
    ),
    // График
    h('div', { style: { padding: '8px 12px 12px', height: 160 } },
      chartData.labels.length === 0
        ? h('div', { style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 } }, 'Нет данных за период')
        : h('canvas', { ref: canvasRef, style: { width: '100%', height: '100%' } })
    )
  );
});

// Панель редактирования одного виджета
const WidgetEditPanel = memo(({ widget, onUpdate, onClose }) => {
  const [form, setForm] = useState({ ...widget });
  const m = WIDGET_METRICS.find(x => x.id === form.metric);

  return h('div', { style: { background: 'var(--card-solid,#fff)', border: `1.5px solid ${AM}`, borderRadius: 10, padding: 16, marginBottom: 14 } },
    h('div', { style: { fontSize: 13, fontWeight: 500, marginBottom: 14, color: 'var(--fg)' } }, '⚙ Настройка виджета'),
    // Метрика
    h('div', { style: { marginBottom: 10 } },
      h('label', { style: S.lbl }, 'Метрика'),
      h('select', { style: S.inp, value: form.metric, onChange: e => {
        const nm = WIDGET_METRICS.find(x => x.id === e.target.value);
        setForm(p => ({ ...p, metric: e.target.value, type: nm?.types[0] || 'bar', title: nm?.name || p.title }));
      }},
        WIDGET_METRICS.map(x => h('option', { key: x.id, value: x.id }, `${x.cat}: ${x.name}`))
      )
    ),
    // Тип графика
    h('div', { style: { marginBottom: 10 } },
      h('label', { style: S.lbl }, 'Тип графика'),
      h('div', { style: { display: 'flex', gap: 5, flexWrap: 'wrap' } },
        (m?.types || ['bar']).map(t => h('button', { key: t,
          style: form.type === t ? abtn({ fontSize: 11, padding: '5px 12px' }) : gbtn({ fontSize: 11, padding: '5px 12px' }),
          onClick: () => setForm(p => ({ ...p, type: t }))
        }, `${CHART_TYPE_ICONS[t]} ${CHART_TYPE_LABELS[t]}`))
      )
    ),
    // Период
    h('div', { style: { marginBottom: 10 } },
      h('label', { style: S.lbl }, 'Период'),
      h('div', { style: { display: 'flex', gap: 5 } },
        [7, 14, 30, 90].map(d => h('button', { key: d,
          style: form.period === d ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }),
          onClick: () => setForm(p => ({ ...p, period: d }))
        }, `${d}д`))
      )
    ),
    // Название
    h('div', { style: { marginBottom: 14 } },
      h('label', { style: S.lbl }, 'Название'),
      h('input', { style: S.inp, value: form.title, onChange: e => setForm(p => ({ ...p, title: e.target.value })) })
    ),
    h('div', { style: { display: 'flex', gap: 8 } },
      h('button', { style: { ...abtn({ flex: 1 }), background: GN, color: '#fff' }, onClick: () => { onUpdate(form); onClose(); } }, '✓ Применить'),
      h('button', { style: gbtn({ flex: 1 }), onClick: onClose }, 'Отмена')
    )
  );
});

const ReportsBuilder = memo(({ data }) => {
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
    } catch(e) { return DEFAULT_LAYOUT; }
  });
  const [editMode, setEditMode]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveLayout = useCallback((newLayout) => {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newLayout)); } catch(e) {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const addWidget = useCallback((metricId) => {
    const m = WIDGET_METRICS.find(x => x.id === metricId);
    if (!m) return;
    const w = { id: 'w' + uid(), metric: metricId, type: m.types[0], title: m.name, period: 30 };
    setLayout(prev => { const nl = [...prev, w]; saveLayout(nl); return nl; });
    setShowLibrary(false);
  }, [saveLayout]);

  const removeWidget = useCallback((id) => {
    setLayout(prev => { const nl = prev.filter(w => w.id !== id); saveLayout(nl); return nl; });
    if (editingId === id) setEditingId(null);
  }, [saveLayout, editingId]);

  const changeType = useCallback((id, type) => {
    setLayout(prev => { const nl = prev.map(w => w.id === id ? { ...w, type } : w); saveLayout(nl); return nl; });
  }, [saveLayout]);

  const updateWidget = useCallback((updated) => {
    setLayout(prev => { const nl = prev.map(w => w.id === updated.id ? updated : w); saveLayout(nl); return nl; });
  }, [saveLayout]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    saveLayout(DEFAULT_LAYOUT);
    setEditingId(null);
  }, [saveLayout]);

  const editingWidget = layout.find(w => w.id === editingId);

  return h('div', null,
    // Шапка с инструкцией
    h('div', { style: { ...S.card, marginBottom: 14, padding: '12px 16px', background: AM3, border: `0.5px solid ${AM4}` } },
      h('div', { style: { fontSize: 13, fontWeight: 500, color: AM2, marginBottom: 4 } }, '📊 Конструктор дашборда'),
      h('div', { style: { fontSize: 11, color: AM4, lineHeight: 1.6 } },
        '⚙ Настроить — переключить тип графика и удалить виджеты  ·  ',
        '+ Добавить — выбрать метрику из библиотеки  ·  ',
        'Нажмите ⚙ на карточке — сменить метрику, период, название  ·  ',
        '↺ — вернуть стандартный вид'
      )
    ),
    // Шапка конструктора
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
      h('span', { style: { fontSize: 13, fontWeight: 500, flex: 1 } }, 'Конструктор дашборда'),
      saved && h('span', { style: { fontSize: 11, color: GN2, background: GN3, padding: '3px 10px', borderRadius: 20 } }, '✓ Сохранено'),
      h('button', { style: editMode ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => { setEditMode(v => !v); setShowLibrary(false); setEditingId(null); } },
        editMode ? '✓ Готово' : '✏️ Настроить'
      ),
      h('button', { style: gbtn({ fontSize: 11 }), onClick: () => { setShowLibrary(v => !v); setEditMode(true); } }, '+ Добавить'),
      h('button', { style: gbtn({ fontSize: 11 }), onClick: resetLayout, title: 'Сбросить к стандартному виду' }, '↺'),
      h('button', { style: gbtn({ fontSize: 11 }), onClick: () => {
        const wb = XLSX.utils.book_new();
        layout.forEach(w => {
          const d = computeWidgetData(w.metric, data, w.period);
          if (d.labels.length) {
            const rows = d.labels.map((l, i) => ({ Метрика: l, Значение: d.values[i] }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), w.title.slice(0, 31));
          }
        });
        XLSX.writeFile(wb, `dashboard_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }}, '📥 Excel')
    ),

    // Библиотека метрик
    showLibrary && h('div', { style: { background: 'var(--card-2)', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 14, marginBottom: 14 } },
      h('div', { style: { fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 } }, 'Выберите метрику для добавления'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 } },
        WIDGET_METRICS.map(m => h('button', { key: m.id,
          style: { ...gbtn(), textAlign: 'left', padding: '8px 10px', lineHeight: 1.4 },
          onClick: () => addWidget(m.id)
        },
          h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 } }, m.cat),
          h('div', { style: { fontSize: 12 } }, m.name)
        ))
      )
    ),

    // Панель редактирования конкретного виджета
    editingWidget && h(WidgetEditPanel, { widget: editingWidget, onUpdate: updateWidget, onClose: () => setEditingId(null) }),

    // Сетка виджетов
    layout.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: 'var(--muted)', padding: 40 } },
          h('div', { style: { fontSize: 24, marginBottom: 8 } }, '📊'),
          h('div', { style: { marginBottom: 12 } }, 'Дашборд пустой — добавьте виджеты'),
          h('button', { style: abtn(), onClick: () => { setShowLibrary(true); setEditMode(true); } }, '+ Добавить виджет')
        )
      : h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          layout.map(w => h(DashWidget, {
            key: w.id, widget: w, data, editMode,
            onChangeType: changeType,
            onRemove: removeWidget,
            onEdit: (id) => setEditingId(prev => prev === id ? null : id)
          }))
        )
  );
});


// ==================== OrderLifecycle ====================
// Вкладка «Этапы заказов» у начальника цеха.
// Показывает: KPI-метрики, таймлайны по каждому заказу, воронку этапов.
// Поддерживает выгрузку в Excel.
const OrderLifecycle = memo(({ data, onUpdate, addToast }) => {
  const [filterStatus, setFilterStatus] = React.useState('active');
  const [sortBy, setSortBy] = React.useState('contractDate');

  const DAY = 86400000;

  // Вычисляем метрики по заказу
  const enrichOrder = React.useCallback((ord) => {
    const ops = (data.ops || []).filter(o => o.orderId === ord.id && !o.archived);
    const c  = ord.contractDate   || ord.createdAt || null;
    const cu = ord.cuttingArrivedAt || null;
    const s  = ord.factStartedAt  || null;
    const f  = ord.factFinishedAt || null;
    const sh = ord.shippedAt      || null;

    const waitCuttingDays  = (c  && cu) ? Math.round((cu - c)  / DAY) : (c && !cu ? Math.round((Date.now() - c) / DAY) : null);
    const waitStartDays    = (cu && s)  ? Math.round((s  - cu) / DAY) : null;
    const productionDays   = (s  && f)  ? Math.round((f  - s)  / DAY) : (s ? Math.round((Date.now() - s) / DAY) : null);
    const totalDays        = (c  && (f || sh)) ? Math.round(((f || sh) - c) / DAY) : (c ? Math.round((Date.now() - c) / DAY) : null);

    const stage = !c ? 'unknown'
      : !cu ? 'waiting_cutting'
      : !s  ? 'ready_to_start'
      : !f  ? 'in_production'
      : !sh ? 'finished'
      : 'shipped';

    const warnCutting = stage === 'waiting_cutting' && waitCuttingDays !== null && waitCuttingDays > 5;

    return { ...ord, _ops: ops, _c: c, _cu: cu, _s: s, _f: f, _sh: sh,
      waitCuttingDays, waitStartDays, productionDays, totalDays, stage, warnCutting };
  }, [data.ops]);

  const orders = React.useMemo(() => {
    const base = (data.orders || []).filter(o => !o.archived && !o.parentOrderId);
    const enriched = base.map(enrichOrder);
    const filtered = filterStatus === 'all' ? enriched
      : filterStatus === 'active' ? enriched.filter(o => o.stage !== 'shipped')
      : enriched.filter(o => o.stage === filterStatus);
    return [...filtered].sort((a, b) => {
      if (sortBy === 'contractDate') return (b._c || 0) - (a._c || 0);
      if (sortBy === 'waitCutting')  return (b.waitCuttingDays || 0) - (a.waitCuttingDays || 0);
      if (sortBy === 'stage') {
        const order = ['waiting_cutting','ready_to_start','in_production','finished','shipped','unknown'];
        return order.indexOf(a.stage) - order.indexOf(b.stage);
      }
      return 0;
    });
  }, [data.orders, data.ops, filterStatus, sortBy, enrichOrder]);

  // KPI
  const kpi = React.useMemo(() => {
    const all = (data.orders || []).filter(o => !o.archived && !o.parentOrderId).map(enrichOrder);
    const avgWait = (arr, field) => {
      const vals = arr.map(o => o[field]).filter(v => v !== null && v >= 0);
      return vals.length ? Math.round(vals.reduce((s,v) => s+v, 0) / vals.length * 10) / 10 : null;
    };
    return {
      waitCutting:   avgWait(all, 'waitCuttingDays'),
      waitStart:     avgWait(all, 'waitStartDays'),
      production:    avgWait(all, 'productionDays'),
      warnCount:     all.filter(o => o.warnCutting).length,
      byStage: {
        waiting_cutting: all.filter(o => o.stage === 'waiting_cutting').length,
        ready_to_start:  all.filter(o => o.stage === 'ready_to_start').length,
        in_production:   all.filter(o => o.stage === 'in_production').length,
        finished:        all.filter(o => o.stage === 'finished').length,
        shipped:         all.filter(o => o.stage === 'shipped').length,
      }
    };
  }, [data.orders, data.ops, enrichOrder]);

  const fmt = ts => ts ? new Date(ts).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit' }) : '—';
  const fmtFull = ts => ts ? new Date(ts).toLocaleDateString('ru-RU') : '—';

  // Выгрузка в Excel
  const exportXLSX = React.useCallback(() => {
    const allEnriched = (data.orders || []).filter(o => !o.archived && !o.parentOrderId).map(enrichOrder);
    const rows = allEnriched.map(o => ({
      'Номер заказа':        o.number || '',
      'Изделие':             o.product || '',
      'Кол-во':              o.qty || 1,
      'Приоритет':           o.priority || '',
      'Дата договора':       fmtFull(o._c),
      'Раскрой получен':     fmtFull(o._cu),
      'Факт. старт':         fmtFull(o._s),
      'Факт. завершение':    fmtFull(o._f),
      'Отгружен':            fmtFull(o._sh),
      'Ожидание раскроя (дн.)':   o.waitCuttingDays !== null ? o.waitCuttingDays : '',
      'Лаг до старта (дн.)':      o.waitStartDays   !== null ? o.waitStartDays   : '',
      'Производство (дн.)':        o.productionDays  !== null ? o.productionDays  : '',
      'Итого (дн.)':               o.totalDays       !== null ? o.totalDays       : '',
      'Этап':               ({
        waiting_cutting: 'Ожидание раскроя',
        ready_to_start:  'Готов к старту',
        in_production:   'В производстве',
        finished:        'Завершён',
        shipped:         'Отгружен',
        unknown:         'Не определён',
      }[o.stage] || o.stage),
      '⚠ Задержка раскроя': o.warnCutting ? 'Да' : '',
    }));

    const kpiRows = [
      { 'Показатель': 'Ср. ожидание раскроя (дн.)', 'Значение': kpi.waitCutting ?? '' },
      { 'Показатель': 'Ср. лаг до старта (дн.)',    'Значение': kpi.waitStart   ?? '' },
      { 'Показатель': 'Ср. время производства (дн.)','Значение': kpi.production  ?? '' },
      { 'Показатель': 'Заказов с задержкой раскроя', 'Значение': kpi.warnCount         },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows),    'Этапы заказов');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'KPI');
    XLSX.writeFile(wb, `lifecycle_${new Date().toISOString().slice(0,10)}.xlsx`);
    addToast('Файл Excel скачан', 'success');
  }, [data.orders, data.ops, kpi, enrichOrder]);

  const STAGE_LABELS = {
    waiting_cutting: '⏳ Ожидание раскроя',
    ready_to_start:  '✅ Готов к старту',
    in_production:   '⚙ В производстве',
    finished:        '✓ Завершён',
    shipped:         '🚚 Отгружен',
    unknown:         '○ Новый',
  };
  const STAGE_COLORS = {
    waiting_cutting: '#eda100',
    ready_to_start:  '#2a78d6',
    in_production:   '#4a3aa7',
    finished:        '#1baf7a',
    shipped:         '#52514e',
    unknown:         '#b4b2a9',
  };
  const DOT_COLORS = ['#2a78d6','#4a3aa7','#eda100','#1baf7a'];

  const cardStyle = { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 };

  return h('div', null,

    // Toolbar
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 } },
      h('select', { value: filterStatus, onChange: e => setFilterStatus(e.target.value), style: { fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' } },
        h('option', { value: 'active' },           'Активные'),
        h('option', { value: 'all' },              'Все заказы'),
        h('option', { value: 'waiting_cutting' },  '⏳ Ожидают раскрой'),
        h('option', { value: 'ready_to_start' },   '✅ Готовы к старту'),
        h('option', { value: 'in_production' },    '⚙ В производстве'),
        h('option', { value: 'finished' },         '✓ Завершённые'),
        h('option', { value: 'shipped' },          '🚚 Отгруженные'),
      ),
      h('select', { value: sortBy, onChange: e => setSortBy(e.target.value), style: { fontSize: 12, padding: '6px 10px', borderRadius: 7, border: '0.5px solid var(--border)', background: 'var(--card)', color: 'var(--text)', cursor: 'pointer' } },
        h('option', { value: 'contractDate' }, 'По дате договора'),
        h('option', { value: 'waitCutting' },  'По ожиданию раскроя'),
        h('option', { value: 'stage' },        'По этапу'),
      ),
      h('button', { style: { ...gbtn({ marginLeft: 'auto' }), display: 'flex', alignItems: 'center', gap: 6 }, onClick: exportXLSX },
        '📥 Скачать Excel'
      )
    ),

    // KPI-строка
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 } },
      [
        { label: 'Ср. ожидание раскроя', value: kpi.waitCutting !== null ? `${kpi.waitCutting} дн` : '—', warn: kpi.waitCutting > 7 },
        { label: 'Ср. лаг до старта',    value: kpi.waitStart   !== null ? `${kpi.waitStart} дн`   : '—', warn: false },
        { label: 'Ср. производство',      value: kpi.production  !== null ? `${kpi.production} дн`  : '—', warn: false },
        { label: 'Задержка раскроя',      value: kpi.warnCount,                                             warn: kpi.warnCount > 0 },
      ].map((k, i) => h('div', { key: i, style: { background: 'var(--card)', border: `0.5px solid var(--border)`, borderRadius: 8, padding: '10px 12px' } },
        h('div', { style: { fontSize: 11, color: 'var(--muted)', marginBottom: 4 } }, k.label),
        h('div', { style: { fontSize: 20, fontWeight: 500, color: k.warn ? '#e34948' : 'var(--text)' } }, k.value)
      ))
    ),

    // Воронка
    h('div', { style: { ...cardStyle, marginBottom: 16 } },
      h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 } }, 'Воронка этапов'),
      ['waiting_cutting','ready_to_start','in_production','finished','shipped'].map(stage => {
        const count = kpi.byStage[stage];
        const max   = Math.max(...Object.values(kpi.byStage), 1);
        return h('div', { key: stage, style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 } },
          h('div', { style: { fontSize: 11, color: 'var(--text-secondary)', width: 160, flexShrink: 0 } }, STAGE_LABELS[stage]),
          h('div', { style: { flex: 1, height: 18, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round(count / max * 100)}%`, background: STAGE_COLORS[stage], borderRadius: 3, transition: 'width .3s' } })
          ),
          h('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--text)', width: 20, textAlign: 'right' } }, count)
        );
      })
    ),

    // Таймлайны заказов
    orders.length === 0
      ? h('div', { style: cardStyle }, h('div', { style: { fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 24 } }, 'Нет заказов для выбранного фильтра'))
      : orders.map(ord => {
          const milestones = [
            { label: 'Договор', ts: ord._c  },
            { label: 'Раскрой', ts: ord._cu },
            { label: 'Старт',   ts: ord._s  },
            { label: 'Готов',   ts: ord._f || (ord.shipped ? ord._sh : null) },
          ];
          const doneCount = milestones.filter(m => m.ts).length;
          const stageColor = STAGE_COLORS[ord.stage] || '#b4b2a9';

          return h('div', { key: ord.id, style: cardStyle },
            // Шапка
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 } },
              h('div', null,
                h('div', { style: { fontSize: 14, fontWeight: 500 } }, `№ ${ord.number} — ${ord.product || ''}`),
                h('div', { style: { fontSize: 11, color: 'var(--muted)', marginTop: 2 } },
                  [ord.qty > 1 && `${ord.qty} шт`, ord.deadline && `срок ${ord.deadline}`].filter(Boolean).join(' · ')
                )
              ),
              h('span', { style: { fontSize: 11, padding: '3px 8px', borderRadius: 4, background: stageColor + '22', color: stageColor, fontWeight: 500, flexShrink: 0 } },
                STAGE_LABELS[ord.stage] || ord.stage
              )
            ),

            // Шкала
            h('div', { style: { position: 'relative', height: 46 } },
              h('div', { style: { position: 'absolute', top: 10, left: '12.5%', right: '12.5%', height: 2, background: 'var(--border)', borderRadius: 1 } }),
              doneCount > 1 && h('div', { style: {
                position: 'absolute', top: 10, left: '12.5%',
                width: `${Math.min(((doneCount-1)/3) * 75, 75)}%`, height: 2,
                background: stageColor, borderRadius: 1
              } }),
              milestones.map((m, i) => h('div', { key: i, style: {
                position: 'absolute', left: `${12.5 + i * 25}%`, top: 0,
                transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1
              } },
                h('div', { style: {
                  width: 20, height: 20, borderRadius: '50%',
                  background: m.ts ? DOT_COLORS[i] : 'var(--border-strong)',
                  border: '2px solid var(--card)',
                  boxShadow: (!m.ts && milestones[i-1]?.ts) ? `0 0 0 3px ${DOT_COLORS[i]}33` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#fff', fontWeight: 700,
                } }, m.ts ? '✓' : (milestones[i-1]?.ts ? '·' : '')),
                h('div', { style: { fontSize: 9, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap' } }, m.label),
                h('div', { style: { fontSize: 9, color: m.ts ? 'var(--text-secondary)' : 'var(--muted)', fontWeight: m.ts ? 500 : 400 } }, fmt(m.ts))
              ))
            ),

            // Метрики под шкалой
            h('div', { style: { display: 'flex', gap: 6, marginTop: 4 } },
              ord.waitCuttingDays !== null && h('div', { style: { flex: 1, fontSize: 10, color: ord.warnCutting ? '#e34948' : 'var(--muted)' } },
                `${ord.waitCuttingDays} дн${ord.warnCutting ? ' ⚠' : ''} — раскрой`),
              ord.waitStartDays !== null && h('div', { style: { flex: 1, fontSize: 10, color: 'var(--muted)' } },
                `${ord.waitStartDays} дн — до старта`),
              ord.productionDays !== null && h('div', { style: { flex: 1, fontSize: 10, color: 'var(--muted)' } },
                `${ord.productionDays} дн — произв.`),
            ),

            // Предупреждение
            ord.warnCutting && h('div', { style: { marginTop: 8, padding: '5px 10px', background: 'var(--bg-danger)', borderRadius: 6, fontSize: 11, color: 'var(--text-danger)' } },
              `⚠ Раскрой ожидается ${ord.waitCuttingDays} дней — операции не могут начаться`
            )
          );
        })
  );
});

// ==================== ProductionReports (Сводки для руководства) ====================
// Три отчёта из запроса руководства: загрузка цеха, просроченные/горящие, сроки (lead-time).
const ProductionReports = memo(({ data, onUpdate, addToast }) => {
  const DAY = 86400000;
  const wName = React.useCallback(id => (data.workers.find(w => w.id === id)?.name) || '', [data.workers]);
  const sName = React.useCallback(id => (data.sections.find(s => s.id === id)?.name) || '', [data.sections]);

  const overdueList = React.useMemo(() => {
    const active = data.orders.filter(o => !o.archived && !o.shipped && !o.parentOrderId);
    return active.map(o => ({ o, dl: o.deadline ? Math.ceil((new Date(o.deadline) - Date.now()) / DAY) : null }))
      .filter(x => x.dl !== null && x.dl <= 3)
      .sort((a, b) => a.dl - b.dl);
  }, [data.orders]);
  const overdueCount = overdueList.filter(x => x.dl < 0).length;
  const burningCount = overdueList.filter(x => x.dl >= 0).length;

  const workloadPreview = React.useMemo(() => {
    const activeOps = data.ops.filter(o => !o.archived && (o.status === 'in_progress' || o.status === 'pending' || o.status === 'on_check' || o.status === 'rework'));
    const workers = new Set();
    activeOps.forEach(op => (op.workerIds || []).forEach(id => workers.add(id)));
    return { ops: activeOps.length, workers: workers.size };
  }, [data.ops]);

  // — Отчёт «Загрузка цеха» —
  const exportWorkload = React.useCallback(async () => {
    try {
      await ensureCdn('xlsx');
      const activeOps = data.ops.filter(o => !o.archived && (o.status === 'in_progress' || o.status === 'pending' || o.status === 'on_check' || o.status === 'rework'));
      const statusRu = { in_progress: 'в работе', pending: 'в очереди', on_check: 'на ОТК', rework: 'переделка' };

      const bySection = {};
      activeOps.forEach(op => {
        const s = sName(op.sectionId) || 'Без участка';
        if (!bySection[s]) bySection[s] = { 'Участок': s, 'В работе': 0, 'В очереди': 0, 'Плановые часы': 0 };
        if (op.status === 'in_progress') bySection[s]['В работе']++; else bySection[s]['В очереди']++;
        bySection[s]['Плановые часы'] += (op.plannedHours || 0);
      });
      const sectionRows = Object.values(bySection)
        .map(r => ({ ...r, 'Плановые часы': Math.round(r['Плановые часы'] * 10) / 10 }))
        .sort((a, b) => (b['В работе'] + b['В очереди']) - (a['В работе'] + a['В очереди']));

      const byWorker = {};
      activeOps.forEach(op => (op.workerIds || []).forEach(id => {
        if (!byWorker[id]) byWorker[id] = { 'Сотрудник': wName(id) || id, 'Участок': sName(data.workers.find(w => w.id === id)?.sectionId), 'В работе': 0, 'В очереди': 0, 'Плановые часы': 0 };
        if (op.status === 'in_progress') byWorker[id]['В работе']++; else byWorker[id]['В очереди']++;
        byWorker[id]['Плановые часы'] += (op.plannedHours || 0);
      }));
      const workerRows = Object.values(byWorker)
        .map(r => ({ ...r, 'Плановые часы': Math.round(r['Плановые часы'] * 10) / 10 }))
        .sort((a, b) => (b['В работе'] + b['В очереди']) - (a['В работе'] + a['В очереди']));

      const opRows = activeOps.map(op => ({
        'Заказ': data.orders.find(o => o.id === op.orderId)?.number || '',
        'Операция': op.name || '',
        'Состояние': statusRu[op.status] || op.status,
        'Участок': sName(op.sectionId),
        'Плановые часы': op.plannedHours != null ? op.plannedHours : '',
        'Исполнители': (op.workerIds || []).map(wName).filter(Boolean).join(', '),
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionRows.length ? sectionRows : [{ 'Участок': 'нет активных операций' }]), 'По участкам');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workerRows.length ? workerRows : [{ 'Сотрудник': 'нет активных операций' }]), 'По сотрудникам');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opRows.length ? opRows : [{ 'Заказ': 'нет активных операций' }]), 'Операции');
      XLSX.writeFile(wb, 'zagruzka_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      addToast('Отчёт по загрузке готов', 'success');
    } catch (e) { addToast('Ошибка экспорта: ' + e.message, 'error'); }
  }, [data, wName, sName, addToast]);

  // — Отчёт «Просроченные и горящие» —
  const exportOverdue = React.useCallback(async () => {
    try {
      await ensureCdn('xlsx');
      const rows = overdueList.map(({ o, dl }) => {
        const ops = getOrderOps(o, data);
        const total = ops.length, done = ops.filter(x => x.status === 'done').length;
        const cur = ops.find(x => x.status === 'in_progress') || ops.find(x => x.status === 'pending');
        const execs = [...new Set(ops.flatMap(x => (x.workerIds || []).map(wName)).filter(Boolean))].join(', ');
        return {
          'Номер': o.number || '',
          'Заказчик': o.customer || '',
          'Изделие': o.product || '',
          'Кол-во': o.qty || 1,
          'Плановый срок': o.deadline || '',
          'Состояние': dl < 0 ? ('просрочен на ' + Math.abs(dl) + ' дн') : dl === 0 ? 'срок сегодня' : ('горит, ' + dl + ' дн'),
          'Готовность, %': total ? Math.round(done / total * 100) : 0,
          'Текущая операция': cur ? cur.name : (total > 0 && done === total ? 'все операции завершены' : '—'),
          'Исполнители': execs,
          'Приоритет': (PRIORITY[o.priority] && PRIORITY[o.priority].label) || o.priority || '',
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Номер': 'нет просроченных и горящих заказов' }]), 'Просрочка и риски');
      XLSX.writeFile(wb, 'prosrochka_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      addToast('Просроченных/горящих: ' + rows.length, 'success');
    } catch (e) { addToast('Ошибка экспорта: ' + e.message, 'error'); }
  }, [overdueList, data.ops, wName, addToast]);

  // Отчёт о причинах отставания (Этап 1+3). Логика расчёта — в core.js
  // (buildLagReport/buildLagSheets), здесь только обёртка в XLSX и скачивание.
  const lagPreview = React.useMemo(() => {
    try { return buildLagReport(data, { periodDays: 14 }); }
    catch (e) { return null; }
  }, [data]);

  const exportLagReport = React.useCallback(async () => {
    try {
      await ensureCdn('xlsx');
      const rep = buildLagReport(data, { periodDays: 14 });
      const sheets = buildLagSheets(rep, data);
      const wb = XLSX.utils.book_new();
      sheets.forEach(s => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name));
      XLSX.writeFile(wb, 'otstavanie_' + new Date().toISOString().slice(0, 10) + '.xlsx');
      addToast('Отстающих заказов: ' + rep.summary.ordersLagging +
        (rep.summary.topCause ? ' · главная причина: ' + rep.summary.topCause : ''), 'success');
    } catch (e) { addToast('Ошибка экспорта: ' + e.message, 'error'); }
  }, [data, addToast]);

  const card = { ...S.card, marginBottom: 12, padding: '14px 16px' };
  const hTitle = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
  const sub = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 };

  return h('div', null,
    h('div', { style: { fontSize: 12, color: 'var(--muted)', marginBottom: 12 } },
      'Готовые выгрузки для руководства. Каждая кнопка сразу отдаёт файл Excel.'),

    h('div', { style: card },
      h('div', { style: hTitle }, '🏭 Загрузка цеха'),
      h('div', { style: sub }, 'Активных операций: ' + workloadPreview.ops + ', задействовано рабочих: ' + workloadPreview.workers + '. Выгрузка: сколько операций и плановых часов в работе и в очереди — по участкам, по сотрудникам и детализация.'),
      h('button', { style: abtn(), onClick: exportWorkload }, '📥 Скачать «Загрузка цеха»')
    ),

    h('div', { style: card },
      h('div', { style: hTitle }, '⏰ Просроченные и горящие заказы'),
      h('div', { style: sub }, 'Просрочено: ' + overdueCount + ', горит (≤3 дней): ' + burningCount + '. Выгрузка: заказчик, изделие, срок, насколько просрочен, готовность, текущая операция, исполнители.'),
      h('button', { style: abtn(), onClick: exportOverdue }, '📥 Скачать «Просрочка и риски»')
    ),

    h('div', { style: card },
      h('div', { style: hTitle }, '🔎 Причины отставания'),
      h('div', { style: sub }, lagPreview
        ? ('Отстают заказов: ' + lagPreview.summary.ordersLagging + ', суммарно ' + lagPreview.summary.totalDaysLate +
           ' дн.' + (lagPreview.summary.topCause ? ' Главная причина: ' + lagPreview.summary.topCause + '.' : '') +
           (lagPreview.summary.overloadedSections.length ? ' Перегружены участки: ' + lagPreview.summary.overloadedSections.join(', ') + '.' : '') +
           ' Выгрузка: бюджет просрочки по причинам, блокирующая операция каждого заказа, узкие места и загрузка участков.')
        : 'Анализ причин просрочки: что именно держит каждый заказ — кооперация, материалы, загрузка участка, люди, брак или нормы.'),
      h('button', { style: abtn(), onClick: exportLagReport }, '📥 Скачать «Причины отставания»')
    ),

    h('div', { style: { ...S.card, padding: '14px 16px' } },
      h('div', { style: hTitle }, '📅 Сроки производства (lead-time)'),
      h('div', { style: sub }, 'По каждому заказу этапы и длительности — ожидание раскроя, лаг до старта, время производства, фактические даты. Внизу отчёта — кнопка выгрузки в Excel.'),
      h(OrderLifecycle, { data, onUpdate, addToast })
    )
  );
});


// ============================================================
//  Power BI дашборд заказов (портфель по мощности, treemap, риск)
//  Восстановлен из git (8399068). Активен на вкладке «Аналитика»
//  как window.AnalyticsDashboard. Старый экран — AnalyticsDashboardLegacy.
// ============================================================
/* ============================================================
   analytics.js — Раздел «Аналитика» для teploros MES
   React 18 UMD (без сборщика, без JSX). Только h().
   Экспортирует глобальный компонент SectionAnalytics({ data }).

   Принципы:
   - чистый рендер поверх data.orders / data.ops (ничего не пишет в БД)
   - все производные (готовность, статус, просрочка, мощность) считаются
     из сырых заказов и операций — как это делает выгрузка
   - мощность парсится из названия модели (V2-D 300 -> 300 кВт)
   - 3 раскладки (Обзор / Производство / Риск) x 2 темы (светлая/тёмная)
   - ленивый рендер: смонтирована только активная раскладка;
     Chart.js уничтожается в cleanup useEffect (destroy)
   - выбор раскладки и темы -> localStorage
   ============================================================ */
(function () {
  'use strict';

  // --- палитра Power BI ---
  var PBI = {
    blue: '#118DFF', navy: '#12239E', teal: '#01B8AA', coral: '#E66C37',
    red: '#D64550', purple: '#6B007B', yellow: '#D9B300', emer: '#12B886', grey: '#8A8886'
  };
  var THEME = {
    light: { grid: '#eeeeee', soft: '#6b6864', tile: '#ffffff' },
    dark:  { grid: '#333130', soft: '#a19f9d', tile: '#242220' }
  };

  // --- инъекция стилей один раз ---
  function ensureStyles() {
    if (document.getElementById('analytics-styles')) return;
    var css = ''
      + '.an-root{--bg:#e6e6e6;--canvas:#F3F2F1;--tile:#fff;--ink:#242220;--soft:#6b6864;--line:#E4E2E0;--grid:#eee;--track:#f0f0f0;--hover:#f6f9ff;}'
      + '.an-root[data-atheme="dark"]{--bg:#0f0e0d;--canvas:#181614;--tile:#242220;--ink:#f3f2f1;--soft:#a19f9d;--line:#3b3a39;--grid:#333130;--track:#3b3a39;--hover:#2f2d2b;}'
      + '.an-root{font-family:"Segoe UI",-apple-system,Roboto,Arial,sans-serif;color:var(--ink);}'
      + '.an-bar{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}'
      + '.an-tabs{display:flex;gap:4px;}'
      + '.an-tab{border:1px solid var(--line);background:var(--tile);font:inherit;font-size:13px;padding:8px 16px;border-radius:6px;cursor:pointer;color:var(--soft);display:flex;align-items:center;gap:6px;}'
      + '.an-tab:hover{background:var(--hover);}'
      + '.an-tab.on{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600;}'
      + '.an-spacer{flex:1;}'
      + '.an-toggle{display:flex;gap:2px;background:var(--tile);border:1px solid var(--line);border-radius:20px;padding:3px;}'
      + '.an-toggle span{padding:5px 12px;border-radius:16px;font-size:12px;font-weight:600;color:var(--soft);cursor:pointer;}'
      + '.an-toggle span.on{background:var(--blue);color:#fff;}'
      + '.an-canvas{background:var(--canvas);border-radius:6px;padding:14px;}'
      + '.an-title{font-size:19px;font-weight:600;padding:0 4px 12px;}'
      + '.an-title small{display:block;font-size:12px;font-weight:400;color:var(--soft);margin-top:2px;}'
      + '.an-grid{display:grid;gap:12px;grid-template-columns:repeat(12,1fr);}'
      + '.an-kpis{display:grid;gap:12px;grid-template-columns:repeat(5,1fr);margin-bottom:12px;}'
      + '.an-kpi{background:var(--tile);border-radius:6px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:4px solid var(--blue);}'
      + '.an-kpi.k2{border-left-color:'+PBI.teal+';}.an-kpi.k3{border-left-color:'+PBI.coral+';}'
      + '.an-kpi.k4{border-left-color:'+PBI.red+';}.an-kpi.k5{border-left-color:'+PBI.purple+';}'
      + '.an-kpi .l{font-size:11px;color:var(--soft);font-weight:600;text-transform:uppercase;letter-spacing:.3px;}'
      + '.an-kpi .v{font-size:26px;font-weight:600;line-height:1.1;margin-top:4px;}'
      + '.an-kpi .v u{font-size:14px;font-weight:500;color:var(--soft);text-decoration:none;}'
      + '.an-kpi .s{font-size:12px;color:var(--soft);margin-top:4px;}'
      + '.an-tile{background:var(--tile);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:12px 14px;display:flex;flex-direction:column;min-height:0;}'
      + '.an-tile h4{font-size:13px;font-weight:600;margin:0;}'
      + '.an-tile .sub{font-size:11px;color:var(--soft);margin:1px 0 8px;}'
      + '.an-cw{flex:1;position:relative;min-height:190px;}'
      + '.s3{grid-column:span 3;}.s4{grid-column:span 4;}.s5{grid-column:span 5;}.s6{grid-column:span 6;}.s7{grid-column:span 7;}.s8{grid-column:span 8;}.s12{grid-column:span 12;}'
      + '.an-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}'
      + '.an-tbl th{text-align:left;font-weight:600;color:var(--soft);border-bottom:2px solid var(--line);padding:7px 8px;text-transform:uppercase;font-size:11px;letter-spacing:.3px;position:sticky;top:0;background:var(--tile);}'
      + '.an-tbl td{padding:7px 8px;border-bottom:1px solid var(--grid);}'
      + '.an-tbl tbody tr:hover{background:var(--hover);}'
      + '.an-num{text-align:right;font-variant-numeric:tabular-nums;}'
      + '.an-badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:11px;}'
      + '.an-scroll{overflow:auto;}'
      + '.an-databar{height:13px;border-radius:2px;display:inline-block;vertical-align:middle;}'
      + '.an-tree{position:relative;width:100%;flex:1;min-height:210px;}'
      + '.an-tmc{position:absolute;border:2px solid var(--canvas);border-radius:4px;overflow:hidden;padding:6px 8px;color:#fff;}'
      + '.an-tmc .a{font-size:12px;font-weight:700;line-height:1.1;}.an-tmc .b{font-size:11px;opacity:.92;margin-top:2px;}'
      + '.an-gm{display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:10px;color:var(--soft);margin-bottom:4px;}'
      + '.an-gm .r{display:flex;}.an-gm .r span{flex:1;text-align:center;}'
      + '.an-grow{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:8px;margin-bottom:5px;font-size:11px;}'
      + '.an-glbl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.an-gtrack{position:relative;height:18px;background:var(--track);border-radius:3px;}'
      + '.an-gbar{position:absolute;height:18px;border-radius:3px;top:0;display:flex;align-items:center;padding-left:6px;color:#fff;font-size:10px;font-weight:600;overflow:hidden;}'
      + '.an-empty{padding:40px;text-align:center;color:var(--soft);}'
      + '@media(max-width:900px){.an-kpis{grid-template-columns:repeat(2,1fr);}.an-grid>[class*="s"]{grid-column:span 12;}}';
    var el = document.createElement('style');
    el.id = 'analytics-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ---------- нормализация данных ----------
  function num(v, d) { return (typeof v === 'number' && !isNaN(v)) ? v : (d || 0); }
  function parsePower(name) {
    var m = String(name || '').match(/(\d{2,4})(?!.*\d)/); // последнее 2-4значное число
    return m ? parseFloat(m[1]) : 0;
  }
  function shortCust(s) {
    return String(s || '—').replace(/^(ООО|ИП|АО|ЗАО|ПАО)\s*/, '').replace(/["«»]/g, '').trim().slice(0, 22) || '—';
  }
  function shortProd(s) {
    return String(s || '').replace('Термомасляный котел ', '').replace('Teplofor ', '').trim();
  }
  function famKey(name) {
    var m = String(name || '').match(/(MV\d|VV\d|V\d|SP\d|SV\d)/);
    return m ? m[1] : 'др.';
  }
  function famName(k) {
    return ({ MV3: 'Dilex MV', VV2: 'Duplex VV', V2: 'Lex V2', V3: 'Lex V3', SP2: 'Lexor SP', 'др.': 'Прочие' })[k] || k;
  }
  var DONE_OP = { 'Выполнена': 1, 'Выполнено': 1, 'Готово': 1, 'Завершено': 1, 'Завершена': 1 };
  var INWORK_OP = { 'В работе': 1 };
  function uchastok(op) {
    var u = op.stage || op.uchastok || op.section || op['участок'];
    if (u) return u;
    var n = String(op.name || '');
    if (/крыш/i.test(n)) return 'Крышки';
    if (/теплообмен/i.test(n)) return 'Теплообменник';
    if (/окрас|покрас/i.test(n)) return 'Окраска';
    if (/кожух/i.test(n)) return 'Кожух';
    if (/опрес|гидро|ги\b/i.test(n)) return 'Опрессовка';
    if (/склад|компл/i.test(n)) return 'Склад';
    return 'Прочее';
  }

  // Собирает нормализованную модель из сырых data
  function buildModel(data) {
    var orders = (data && (data.orders || data.state && data.state.orders)) || [];
    var ops = (data && (data.ops || data.operations || (data.state && data.state.ops))) || [];
    ops = ops.filter(function (op) { return !op.archived; });

    // операции по заказу
    var opsByOrder = {};
    ops.forEach(function (op) {
      var oid = op.orderId != null ? op.orderId : op.order;
      (opsByOrder[oid] = opsByOrder[oid] || []).push(op);
    });

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var DAY = 86400000;

    var rows = orders.filter(function (o) { return !o.archived; }).map(function (o) {
      var oid = o.id != null ? o.id : o.number;
      var mine = opsByOrder[oid] || [];
      var total = mine.length;
      var done = mine.filter(function (op) { return DONE_OP[op.status]; }).length;
      var inWork = mine.some(function (op) { return INWORK_OP[op.status]; });
      var ready = total ? Math.round(done / total * 100) : 0;
      var shipped = !!(o.shipped);
      var dl = null;
      var dRaw = o.deadline || o.plannedDeadline;
      if (dRaw) { var dd = new Date(dRaw); if (!isNaN(dd)) dl = Math.floor((dd - today) / DAY); }
      var overdue = (dl != null && dl < 0 && !shipped);
      var status = shipped ? 'Отгружен'
        : total === 0 ? 'Ожидает'
          : inWork ? 'В работе'
            : done === 0 ? 'Ожидает'
              : done < total ? 'Частично выполнен'
                : 'Готов к отгрузке';
      var curOp = null;
      for (var i = 0; i < mine.length; i++) { if (!DONE_OP[mine[i].status]) { curOp = mine[i].name; break; } }
      var qty = num(o.qty, 1) || 1;
      var pwUnit = num(o['powerKw'], 0) || num(o['Мощность, кВт'], 0) || parsePower(o.product);
      return {
        num: o.number != null ? o.number : oid,
        cust: o.customer || '—',
        prod: o.product || '',
        family: famKey(o.product),
        qty: qty,
        pw: pwUnit,
        kw: pwUnit * qty,
        prio: o.priority || '',
        // Этап 7 плана БМК: тип изделия и деньги по смете/приёмке
        ptype: o.productType === 'bmk' ? 'bmk' : 'boiler',
        bmkKind: o.productType === 'bmk' ? (o.bmkKind === 'knr' ? 'КНР' : 'БМК') : null,
        estSum: o.productType === 'bmk' ? bmkEstimateTotal(o) : 0,
        factSum: o.productType === 'bmk'
          ? mine.reduce(function (s, op) { return s + ((op.bmkPayout && op.bmkPayout.total) || 0); }, 0)
          : 0,
        status: status,
        ready: ready,
        daysLeft: dl,
        overdue: overdue,
        readyShip: (total > 0 && done === total && !shipped),
        curOp: curOp,
        shippedDate: (typeof o.shipped === 'string') ? o.shipped : (shipped ? '' : null)
      };
    });

    // загрузка участков
    var uAgg = {};
    ops.forEach(function (op) {
      var u = uchastok(op);
      var a = uAgg[u] || (uAgg[u] = { u: u, open: 0, done: 0, tot: 0 });
      a.tot++;
      if (DONE_OP[op.status]) a.done++; else a.open++;
    });
    var uch = Object.keys(uAgg).map(function (k) { return uAgg[k]; }).sort(function (a, b) { return b.open - a.open; });

    // статусы операций
    var opStat = {};
    ops.forEach(function (op) { opStat[op.status] = (opStat[op.status] || 0) + 1; });

    return { rows: rows, uch: uch, opStat: opStat, opsTotal: ops.length };
  }

  // ---------- форматтеры ----------
  function kwf(v) { return v >= 1000 ? (v / 1000).toFixed(1) + ' МВт' : Math.round(v) + ' кВт'; }
  function kwParts(v) { return v >= 1000 ? [(v / 1000).toFixed(1), ' МВт'] : [String(Math.round(v)), ' кВт']; }

  // ============================================================
  //  Компонент-обёртка над одним <canvas> Chart.js
  //  Пересоздаёт график при смене config/темы; уничтожает в cleanup
  // ============================================================
  function makeChart(React) {
    var h = React.createElement, useRef = React.useRef, useEffect = React.useEffect;
    return function ChartBox(props) {
      var ref = useRef(null);
      var inst = useRef(null);
      useEffect(function () {
        if (!ref.current || typeof Chart === 'undefined') return;
        try { if (inst.current) inst.current.destroy(); } catch (e) { }
        var cfg = props.config();
        inst.current = new Chart(ref.current, cfg);
        return function () { try { if (inst.current) inst.current.destroy(); } catch (e) { } };
      }, [props.rev]);
      return h('canvas', { ref: ref });
    };
  }

  // ---------- treemap (slice & dice) ----------
  function TreeMap(React) {
    var h = React.createElement, useRef = React.useRef, useEffect = React.useEffect;
    return function (props) {
      var ref = useRef(null);
      useEffect(function () {
        var el = ref.current; if (!el) return;
        var W = el.clientWidth || 600, H = el.clientHeight || 210;
        var items = props.items.slice().sort(function (a, b) { return b.val - a.val; });
        var total = items.reduce(function (s, i) { return s + i.val; }, 0) || 1;
        var acc = 0, top = [], bot = [], half = total * 0.60;
        items.forEach(function (i) { if (acc < half) { top.push(i); acc += i.val; } else bot.push(i); });
        var html = '';
        function strip(arr, yy, hh) {
          var t = arr.reduce(function (s, i) { return s + i.val; }, 0) || 1, xx = 0;
          arr.forEach(function (i) {
            var w = i.val / t * W;
            html += '<div class="an-tmc" style="left:' + xx + 'px;top:' + yy + 'px;width:' + w + 'px;height:' + hh + 'px;background:' + i.color + '"><div class="a">' + i.label + '</div><div class="b">' + i.sub + '</div></div>';
            xx += w;
          });
        }
        var h1 = H * 0.6; strip(top, 0, h1); strip(bot, h1, H - h1);
        el.innerHTML = html;
      }, [props.rev]);
      return h('div', { className: 'an-tree', ref: ref });
    };
  }

  // ---------- вспомогательные ноды ----------
  function axis(soft, grid, stacked) {
    return { grid: { color: grid, display: grid !== null }, ticks: { color: soft }, stacked: !!stacked };
  }
  function badge(status) {
    var map = { 'Отгружен': ['#eef2ff', '#3a3ea8'], 'Частично выполнен': ['#e3f0ff', '#0b62c4'], 'В работе': ['#e3f0ff', '#0b62c4'], 'Готов к отгрузке': ['#e3f8f4', '#0a8f7f'], 'Ожидает': ['#ececec', '#666'] };
    var c = map[status] || ['#ececec', '#666'];
    return { bg: c[0], fg: c[1] };
  }

  // ============================================================
  //  Главный компонент
  // ============================================================
  function SectionAnalytics(props) {
    var React = window.React;
    var h = React.createElement;
    var useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect;

    var ChartBox = useMemo(function () { return makeChart(React); }, []);
    var Tree = useMemo(function () { return TreeMap(React); }, []);

    // тема и раскладка (с восстановлением из localStorage)
    var initTheme = 'light', initLayout = 'overview';
    try { initTheme = localStorage.getItem('teploros_an_theme') || 'light'; initLayout = localStorage.getItem('teploros_an_layout') || 'overview'; } catch (e) { }
    var themeState = useState(initTheme), theme = themeState[0], setTheme = themeState[1];
    var layoutState = useState(initLayout), layout = layoutState[0], setLayout = layoutState[1];
    var rev = theme + ':' + layout; // ключ пересборки графиков

    var T = THEME[theme] || THEME.light;
    var soft = T.soft, grid = T.grid, tileC = T.tile;

    function chooseTheme(t) { setTheme(t); try { localStorage.setItem('teploros_an_theme', t); } catch (e) { } }
    function chooseLayout(l) { setLayout(l); try { localStorage.setItem('teploros_an_layout', l); } catch (e) { } }

    useEffect(ensureStyles, []);

    // модель
    var model = useMemo(function () { return buildModel(props.data || {}); }, [props.data]);
    var rows = model.rows;

    if (!rows.length) {
      return h('div', { className: 'an-root', 'data-atheme': theme },
        h('div', { className: 'an-canvas' }, h('div', { className: 'an-empty' }, 'Нет данных по заказам для аналитики.')));
    }

    // агрегаты
    var active = rows.filter(function (o) { return o.status !== 'Отгружен'; });
    var totKw = rows.reduce(function (s, o) { return s + o.kw; }, 0);
    var shipKw = rows.filter(function (o) { return o.status === 'Отгружен'; }).reduce(function (s, o) { return s + o.kw; }, 0);
    var wipKw = active.reduce(function (s, o) { return s + o.kw; }, 0);
    var lateRows = rows.filter(function (o) { return o.overdue; });
    var lateKw = lateRows.reduce(function (s, o) { return s + o.kw; }, 0);
    var rtsN = rows.filter(function (o) { return o.readyShip; }).length;

    // ---- Аналитика БМК/КНР (этап 7 плана): портфель, план/факт по сметам ----
    var bmkRows  = rows.filter(function (o) { return o.ptype === 'bmk'; });
    var bmkAct   = bmkRows.filter(function (o) { return o.status !== 'Отгружен'; });
    var bmkEst   = bmkRows.reduce(function (s, o) { return s + o.estSum; }, 0);
    var bmkFact  = bmkRows.reduce(function (s, o) { return s + o.factSum; }, 0);
    var bmkKnrN  = bmkRows.filter(function (o) { return o.bmkKind === 'КНР'; }).length;
    var bmkLate  = bmkRows.filter(function (o) { return o.overdue; }).length;
    var bmkNoEst = bmkAct.filter(function (o) { return o.estSum === 0; }).length;
    var rub = function (v) {
      var n = Math.round(Number(v) || 0);
      if (n >= 1000000) return (n / 1000000).toFixed(1) + ' млн ₽';
      if (n >= 1000) return Math.round(n / 1000) + ' тыс ₽';
      return n + ' ₽';
    };

    // ---- KPI нода ----
    function kpi(cls, label, valNode, sub) {
      return h('div', { className: 'an-kpi ' + (cls || '') },
        h('div', { className: 'l' }, label),
        h('div', { className: 'v' }, valNode),
        h('div', { className: 's' }, sub));
    }
    function kwVal(v) { var p = kwParts(v); return [p[0], h('u', { key: 'u' }, p[1])]; }

    function tile(span, title, sub, body) {
      return h('div', { className: 'an-tile ' + span },
        h('h4', null, title), sub ? h('div', { className: 'sub' }, sub) : null,
        body);
    }
    function cw(child) { return h('div', { className: 'an-cw' }, child); }

    // ============ РАСКЛАДКА: ОБЗОР ============
    function layoutOverview() {
      // donut by status
      var st = {}; rows.forEach(function (o) { st[o.status] = (st[o.status] || 0) + o.kw; });
      var stK = Object.keys(st);
      var donut = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'doughnut',
            data: { labels: stK, datasets: [{ data: stK.map(function (k) { return st[k]; }), backgroundColor: [PBI.navy, PBI.blue, PBI.teal, PBI.grey, PBI.coral, PBI.purple], borderWidth: 2, borderColor: tileC }] },
            options: { cutout: '60%', maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: soft } }, tooltip: { callbacks: { label: function (c) { return c.label + ': ' + Math.round(c.parsed) + ' кВт'; } } } } }
          };
        }
      });
      // month
      var m = {}; rows.forEach(function (o) { if (o.shippedDate) { var p = String(o.shippedDate).split('.'); if (p.length >= 3) { var k = p[1] + '.' + p[2]; m[k] = (m[k] || 0) + o.kw; } } });
      var mk = Object.keys(m).sort();
      var monthChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar',
            data: { labels: mk.length ? mk : ['—'], datasets: [{ data: mk.length ? mk.map(function (k) { return m[k]; }) : [0], backgroundColor: PBI.blue, borderRadius: 4, barThickness: 42 }] },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return Math.round(c.parsed.y) + ' кВт'; } } } }, scales: { y: axis(soft, grid), x: axis(soft, null) } }
          };
        }
      });
      // treemap by family
      var fa = {}; rows.forEach(function (o) { fa[o.family] = (fa[o.family] || 0) + o.kw; });
      var cols = [PBI.navy, PBI.blue, PBI.teal, PBI.emer, PBI.coral, PBI.purple];
      var treeItems = Object.keys(fa).map(function (k, i) { return { label: famName(k), val: fa[k], color: cols[i % cols.length], sub: kwf(fa[k]) }; });
      // customers
      var c = {}; rows.forEach(function (o) { c[o.cust] = (c[o.cust] || 0) + o.kw; });
      var cs = Object.keys(c).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 7);
      var custChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar', data: { labels: cs.map(function (x) { return shortCust(x[0]); }), datasets: [{ data: cs.map(function (x) { return x[1]; }), backgroundColor: PBI.teal, borderRadius: 3, barThickness: 15 }] },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return Math.round(c.parsed.x) + ' кВт'; } } } }, scales: { x: axis(soft, grid), y: axis(soft, null) } }
          };
        }
      });
      var top = rows.slice().sort(function (a, b) { return b.kw - a.kw; }).slice(0, 8);
      var tbody = top.map(function (o, i) {
        var b = badge(o.status);
        return h('tr', { key: i },
          h('td', null, h('b', null, o.num)),
          h('td', null, shortCust(o.cust)),
          h('td', null, shortProd(o.prod).slice(0, 26)),
          h('td', { className: 'an-num' }, h('b', null, Math.round(o.kw))),
          h('td', null, o.prio),
          h('td', null, h('span', { className: 'an-badge', style: { background: b.bg, color: b.fg } }, o.status)));
      });
      return h('div', { className: 'an-grid' },
        tile('s4', 'По статусам', 'мощность, кВт', cw(donut)),
        tile('s8', 'Отгрузки по месяцам', 'кВт', cw(monthChart)),
        tile('s7', 'Мощность по семействам котлов', 'площадь = кВт', h(Tree, { rev: rev, items: treeItems })),
        tile('s5', 'Топ заказчиков', 'кВт', cw(custChart)),
        tile('s12', 'Крупнейшие заказы', 'по мощности',
          h('div', { className: 'an-scroll', style: { maxHeight: '210px' } },
            h('table', { className: 'an-tbl' },
              h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, 'Заказчик'), h('th', null, 'Изделие'), h('th', { className: 'an-num' }, 'кВт'), h('th', null, 'Приоритет'), h('th', null, 'Статус'))),
              h('tbody', null, tbody)))));
    }

    // ============ РАСКЛАДКА: ПРОИЗВОДСТВО ============
    function layoutProduction() {
      var uch = model.uch;
      var openOps = uch.reduce(function (s, u) { return s + u.open; }, 0);
      var qc = model.opStat['На проверке ОТК'] || 0;
      var avgReady = active.length ? Math.round(active.reduce(function (s, o) { return s + o.ready; }, 0) / active.length) : 0;

      var uchChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar', data: { labels: uch.map(function (u) { return u.u; }), datasets: [
              { label: 'Открыто', data: uch.map(function (u) { return u.open; }), backgroundColor: PBI.coral, barThickness: 16 },
              { label: 'Выполнено', data: uch.map(function (u) { return u.done; }), backgroundColor: PBI.navy, barThickness: 16 }] },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end', labels: { color: soft } } }, scales: { x: axis(soft, grid, true), y: axis(soft, null, true) } }
          };
        }
      });
      // gantt
      var gRows = active.filter(function (o) { return o.daysLeft != null; }).sort(function (a, b) { return a.daysLeft - b.daysLeft; }).slice(0, 8);
      var lo = -35, hi = 60, span = hi - lo, todayPct = (0 - lo) / span * 100;
      var gantt = h('div', null,
        h('div', { className: 'an-gm' }, h('span', null), h('div', { className: 'r' }, h('span', null, '−1 мес'), h('span', null, 'сегодня'), h('span', null, '+1 мес'), h('span', null, '+2 мес'))),
        gRows.map(function (o, i) {
          var startD = Math.max(lo, o.daysLeft - 25), endD = o.daysLeft;
          var left = (startD - lo) / span * 100, w = Math.max(3, (endD - startD) / span * 100);
          var col = o.overdue ? PBI.red : o.ready > 60 ? PBI.emer : o.daysLeft < 7 ? PBI.coral : PBI.blue;
          return h('div', { className: 'an-grow', key: i },
            h('div', { className: 'an-glbl' }, o.num + ' · ' + famName(o.family)),
            h('div', { className: 'an-gtrack' }, h('div', { className: 'an-gbar', style: { left: left + '%', width: w + '%', background: col } }, o.ready + '%')));
        }),
        h('div', { style: { position: 'relative', height: 0 } },
          h('div', { style: { position: 'absolute', left: 'calc(140px + (100% - 140px)*' + (todayPct / 100) + ')', top: '-' + (gRows.length * 23 + 4) + 'px', height: (gRows.length * 23) + 'px', borderLeft: '2px dashed ' + PBI.red } })));
      // progress
      var actSorted = active.slice().sort(function (a, b) { return b.ready - a.ready; });
      var progChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar', data: { labels: actSorted.map(function (o) { return o.num; }), datasets: [{ data: actSorted.map(function (o) { return o.ready; }), backgroundColor: actSorted.map(function (o) { return o.ready > 66 ? PBI.emer : o.ready > 33 ? PBI.yellow : PBI.coral; }), borderRadius: 3 }] },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.parsed.y + '%'; } } } }, scales: { y: { max: 100, grid: { color: grid }, ticks: { color: soft } }, x: { grid: { display: false }, ticks: { color: soft, font: { size: 9 } } } } }
          };
        }
      });
      // op status
      var os = model.opStat, osK = Object.keys(os);
      var opChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'doughnut', data: { labels: osK, datasets: [{ data: osK.map(function (k) { return os[k]; }), backgroundColor: [PBI.navy, PBI.grey, PBI.coral, PBI.teal, PBI.blue], borderWidth: 2, borderColor: tileC }] },
            options: { cutout: '60%', maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: soft } } } }
          };
        }
      });
      return h('div', { className: 'an-grid' },
        tile('s5', 'Загрузка участков', 'открытые операции по участкам', cw(uchChart)),
        tile('s7', 'График заказов (Гантт)', 'план по срокам, активные заказы', gantt),
        tile('s7', 'Готовность активных заказов', '%, по убыванию', cw(progChart)),
        tile('s5', 'Операции по статусам', 'весь пул ' + model.opsTotal, cw(opChart)));
    }

    // ============ РАСКЛАДКА: БМК / КНР (этап 7 плана БМК) ============
    function layoutBmk() {
      if (!bmkRows.length) {
        return h('div', { className: 'an-grid' },
          tile('s12', 'Нет заказов БМК', 'портфель блочно-модульных котельных пуст',
            h('div', { style: { padding: '18px 4px', color: soft, fontSize: '12px' } },
              'Заказы с типом изделия «БМК» здесь появятся автоматически. Смета работ заполняется в карточке заказа.')));
      }
      // Портфель по видам БМК/КНР
      var kindMap = {};
      bmkRows.forEach(function (o) { kindMap[o.bmkKind] = (kindMap[o.bmkKind] || 0) + 1; });
      var kindChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'doughnut',
            data: { labels: Object.keys(kindMap), datasets: [{ data: Object.keys(kindMap).map(function (k) { return kindMap[k]; }), backgroundColor: [PBI.blue, PBI.teal, PBI.coral] }] },
            options: { cutout: '60%', maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: soft } } } }
          };
        }
      });
      // План (смета) против факта (принято мастером) — топ-10 по смете
      var money = bmkRows.slice().sort(function (x, y) { return y.estSum - x.estSum; }).slice(0, 10);
      var moneyChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar',
            data: {
              labels: money.map(function (o) { return o.num; }),
              datasets: [
                { label: 'Смета', data: money.map(function (o) { return o.estSum; }), backgroundColor: PBI.blue, barThickness: 14 },
                { label: 'Принято', data: money.map(function (o) { return o.factSum; }), backgroundColor: PBI.teal, barThickness: 14 }
              ]
            },
            options: {
              maintainAspectRatio: false,
              plugins: { legend: { labels: { color: soft } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + Math.round(c.parsed.y).toLocaleString('ru-RU') + ' ₽'; } } } },
              scales: { y: axis(soft, grid), x: axis(soft, null) }
            }
          };
        }
      });
      // Стоимость работ по этапам (из принятых приёмок)
      var stageMap = {};
      var _d = props.data || {};
      (_d.ops || []).forEach(function (op) {
        if (!op.bmkPayout || !(op.bmkPayout.total > 0)) return;
        var o = (_d.orders || []).find(function (x) { return x.id === op.orderId; });
        if (!o || o.productType !== 'bmk') return;
        stageMap[op.name] = (stageMap[op.name] || 0) + op.bmkPayout.total;
      });
      var stageKeys = Object.keys(stageMap).sort(function (x, y) { return stageMap[y] - stageMap[x]; });
      var stageChart = stageKeys.length ? h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar',
            data: { labels: stageKeys, datasets: [{ data: stageKeys.map(function (k) { return stageMap[k]; }), backgroundColor: PBI.coral, borderRadius: 3, barThickness: 16 }] },
            options: {
              indexAxis: 'y', maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return Math.round(c.parsed.x).toLocaleString('ru-RU') + ' ₽'; } } } },
              scales: { x: axis(soft, grid), y: axis(soft, null) }
            }
          };
        }
      }) : h('div', { style: { padding: '16px 4px', color: soft, fontSize: '12px' } }, 'Пока нет принятых мастером работ');
      // Таблица заказов БМК
      var tb = bmkRows.slice().sort(function (x, y) { return y.estSum - x.estSum; }).map(function (o) {
        var pct = o.estSum > 0 ? Math.round(o.factSum / o.estSum * 100) : 0;
        return h('tr', { key: o.num },
          h('td', null, o.num),
          h('td', null, h('span', { style: { color: o.bmkKind === 'КНР' ? PBI.teal : PBI.blue, fontWeight: 600 } }, o.bmkKind)),
          h('td', null, shortCust(o.cust)),
          h('td', { className: 'an-num' }, Math.round(o.kw) || '—'),
          h('td', { className: 'an-num' }, o.estSum ? Math.round(o.estSum).toLocaleString('ru-RU') : '—'),
          h('td', { className: 'an-num' }, o.factSum ? Math.round(o.factSum).toLocaleString('ru-RU') : '—'),
          h('td', { className: 'an-num', style: { color: pct > 100 ? PBI.red : soft } }, o.estSum ? pct + '%' : '—'),
          h('td', null, h('span', { className: 'an-databar', style: { width: o.ready + 'px', background: o.overdue ? PBI.red : PBI.teal } }), ' ' + o.ready + '%'),
          h('td', { style: { color: o.overdue ? PBI.red : soft } }, o.status));
      });
      return h('div', { className: 'an-grid' },
        tile('s4', 'Вид изделия', 'БМК против КНР', cw(kindChart)),
        tile('s8', 'Смета против принятого', 'топ-10 заказов по стоимости работ', cw(moneyChart)),
        tile('s6', 'Стоимость работ по этапам', 'из приёмок мастера', cw(stageChart)),
        tile('s6', 'Заказы без сметы', 'требуют заполнения',
          h('div', { style: { padding: '10px 4px', fontSize: '12px', color: soft } },
            bmkNoEst === 0
              ? 'Все активные заказы БМК имеют смету ✓'
              : h('div', null,
                  h('div', { style: { fontSize: '26px', fontWeight: 700, color: PBI.yellow } }, String(bmkNoEst)),
                  'активных заказов БМК без заполненной сметы — по ним не начислить работы бригадам.'))),
        tile('s12', 'Портфель БМК / КНР', 'смета, принято, готовность',
          h('div', { className: 'an-scroll', style: { maxHeight: '260px' } },
            h('table', { className: 'an-tbl' },
              h('thead', null, h('tr', null,
                h('th', null, '№'), h('th', null, 'Вид'), h('th', null, 'Заказчик'),
                h('th', { className: 'an-num' }, 'кВт'),
                h('th', { className: 'an-num' }, 'Смета, ₽'), h('th', { className: 'an-num' }, 'Принято, ₽'),
                h('th', { className: 'an-num' }, '%'), h('th', null, 'Готовность'), h('th', null, 'Статус'))),
              h('tbody', null, tb)))));
    }

    // ============ РАСКЛАДКА: РИСК ============
    function layoutRisk() {
      var risk = active.filter(function (o) { return o.overdue || (o.daysLeft != null && o.daysLeft < 7); });
      var overdue = rows.filter(function (o) { return o.overdue && o.daysLeft != null; });
      var soon = active.filter(function (o) { return !o.overdue && o.daysLeft != null && o.daysLeft >= 0 && o.daysLeft < 7; });
      var avgLate = overdue.length ? Math.round(overdue.reduce(function (s, o) { return s + Math.abs(o.daysLeft); }, 0) / overdue.length) : 0;
      var riskKw = risk.reduce(function (s, o) { return s + o.kw; }, 0);
      var rs = risk.slice().sort(function (a, b) { return b.kw - a.kw; }).slice(0, 10);
      function colf(o) { return o.overdue ? (o.daysLeft < -20 ? PBI.red : PBI.coral) : PBI.yellow; }
      var bar = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar', data: { labels: rs.map(function (o) { return o.num; }), datasets: [{ data: rs.map(function (o) { return o.kw; }), backgroundColor: rs.map(colf), borderRadius: 3 }] },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return Math.round(c.parsed.x) + ' кВт'; } } } }, scales: { x: axis(soft, grid), y: axis(soft, null) } }
          };
        }
      });
      var od8 = overdue.slice(0, 8);
      var readyChart = h(ChartBox, {
        rev: rev, config: function () {
          return {
            type: 'bar', data: { labels: od8.map(function (o) { return o.num; }), datasets: [{ data: od8.map(function (o) { return o.ready; }), backgroundColor: od8.map(function (o) { return o.ready > 60 ? PBI.emer : o.ready > 30 ? PBI.yellow : PBI.red; }), borderRadius: 3, barThickness: 22 }] },
            options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.parsed.y + '% готовности'; } } } }, scales: { y: { max: 100, grid: { color: grid }, ticks: { color: soft } }, x: axis(soft, null) } }
          };
        }
      });
      var tbody = rs.map(function (o, i) {
        var dl = o.daysLeft;
        var dcol = dl < 0 ? { color: PBI.red, fontWeight: 700 } : dl < 7 ? { color: PBI.yellow, fontWeight: 600 } : {};
        var rc = o.ready > 60 ? PBI.emer : o.ready > 30 ? PBI.yellow : PBI.red;
        return h('tr', { key: i },
          h('td', null, h('b', null, o.num)),
          h('td', null, shortCust(o.cust)),
          h('td', null, shortProd(o.prod).slice(0, 28)),
          h('td', { className: 'an-num' }, Math.round(o.kw)),
          h('td', { className: 'an-num', style: dcol }, dl == null ? '—' : dl),
          h('td', null, h('span', { className: 'an-databar', style: { width: o.ready + 'px', background: rc } }), ' ' + o.ready + '%'),
          h('td', { style: { color: soft } }, (o.curOp || '—').slice(0, 22)));
      });
      return h('div', { className: 'an-grid' },
        tile('s7', 'кВт под риском по заказам', 'цвет = глубина просрочки', cw(bar)),
        tile('s5', 'Готовность просроченных', 'насколько близко к финишу', cw(readyChart)),
        tile('s12', 'Матрица риска', 'просроченные и близкие к сроку',
          h('div', { className: 'an-scroll', style: { maxHeight: '250px' } },
            h('table', { className: 'an-tbl' },
              h('thead', null, h('tr', null, h('th', null, '№'), h('th', null, 'Заказчик'), h('th', null, 'Изделие'), h('th', { className: 'an-num' }, 'кВт'), h('th', { className: 'an-num' }, 'Осталось дн'), h('th', null, 'Готовность'), h('th', null, 'Операция'))),
              h('tbody', null, tbody)))));
    }

    // ---- KPI-строки по раскладкам ----
    var kpisNode, bodyNode, titleNode;
    if (layout === 'overview') {
      titleNode = ['Обзор портфеля', 'структура заказов по мощности'];
      kpisNode = h('div', { className: 'an-kpis' },
        kpi('', 'Мощность портфеля', kwVal(totKw), rows.length + ' заказов'),
        kpi('k2', 'В производстве', kwVal(wipKw), active.length + ' заказов'),
        kpi('k3', 'Отгружено', kwVal(shipKw), rows.length - active.length + ' заказов'),
        kpi('k4', 'Просрочено', kwVal(lateKw), lateRows.length + ' заказов'),
        kpi('k5', 'Ср. мощность', [String(Math.round(totKw / rows.length)), h('u', { key: 'u' }, ' кВт')], 'на заказ'));
      bodyNode = layoutOverview();
    } else if (layout === 'production') {
      var openOps = model.uch.reduce(function (s, u) { return s + u.open; }, 0);
      var avgReady = active.length ? Math.round(active.reduce(function (s, o) { return s + o.ready; }, 0) / active.length) : 0;
      titleNode = ['Производство', 'загрузка участков, операции, сроки'];
      kpisNode = h('div', { className: 'an-kpis' },
        kpi('k2', 'Заказов на линии', [String(active.length)], 'не отгружено'),
        kpi('', 'Операций открыто', [String(openOps)], 'из ' + model.opsTotal + ' всего'),
        kpi('k3', 'На проверке ОТК', [String(model.opStat['На проверке ОТК'] || 0)], 'операций'),
        kpi('k5', 'Ср. готовность', [String(avgReady), h('u', { key: 'u' }, '%')], 'активных заказов'),
        kpi('k4', 'Готовы к отгрузке', [String(rtsN)], 'ждут отгрузки'));
      bodyNode = layoutProduction();
    } else if (layout === 'bmk') {
      titleNode = ['БМК / КНР', 'портфель котельных, сметы и принятые работы'];
      kpisNode = h('div', { className: 'an-kpis' },
        kpi('', 'Заказов БМК', [String(bmkRows.length)], bmkAct.length + ' в производстве'),
        kpi('k2', 'Сметы работ', [rub(bmkEst)], 'плановая стоимость'),
        kpi('k3', 'Принято мастером', [rub(bmkFact)], bmkEst > 0 ? Math.round(bmkFact / bmkEst * 100) + '% от сметы' : 'нет приёмок'),
        kpi('k5', 'КНР', [String(bmkKnrN)], 'наружное размещение'),
        kpi('k4', 'Просрочено', [String(bmkLate)], 'заказов БМК'));
      bodyNode = layoutBmk();
    } else {
      var overdue = rows.filter(function (o) { return o.overdue && o.daysLeft != null; });
      var soon = active.filter(function (o) { return !o.overdue && o.daysLeft != null && o.daysLeft >= 0 && o.daysLeft < 7; });
      var avgLate = overdue.length ? Math.round(overdue.reduce(function (s, o) { return s + Math.abs(o.daysLeft); }, 0) / overdue.length) : 0;
      var riskKw = active.filter(function (o) { return o.overdue || (o.daysLeft != null && o.daysLeft < 7); }).reduce(function (s, o) { return s + o.kw; }, 0);
      titleNode = ['Риск и сроки', 'просрочка, что горит, мощность под угрозой'];
      kpisNode = h('div', { className: 'an-kpis' },
        kpi('k4', 'кВт под риском', kwVal(riskKw), 'просроч. + <7 дн'),
        kpi('k4', 'Просрочено', [String(overdue.length)], 'заказов'),
        kpi('k3', 'Близко к сроку', [String(soon.length)], '< 7 дней'),
        kpi('', 'Ср. просрочка', [String(avgLate)], 'дней'),
        kpi('k2', 'Готовы к отгрузке', [String(rtsN)], 'можно закрыть'));
      bodyNode = layoutRisk();
    }

    function tabBtn(id, label) {
      return h('button', { className: 'an-tab' + (layout === id ? ' on' : ''), onClick: function () { chooseLayout(id); } }, label);
    }

    return h('div', { className: 'an-root', 'data-atheme': theme },
      h('div', { className: 'an-bar' },
        h('div', { className: 'an-tabs' },
          tabBtn('overview', '📊 Обзор'),
          tabBtn('production', '🏭 Производство'),
          tabBtn('bmk', '🏗 БМК'),
          tabBtn('risk', '⚠️ Риск')),
        h('div', { className: 'an-spacer' }),
        h('div', { className: 'an-toggle' },
          h('span', { className: theme === 'light' ? 'on' : '', onClick: function () { chooseTheme('light'); } }, '☀ Светлая'),
          h('span', { className: theme === 'dark' ? 'on' : '', onClick: function () { chooseTheme('dark'); } }, '🌙 Тёмная'))),
      h('div', { className: 'an-canvas' },
        h('div', { className: 'an-title' }, titleNode[0], h('small', null, titleNode[1])),
        kpisNode,
        bodyNode));
  }

  // экспорт как глобальный компонент (master.js: h(SectionAnalytics, { data }))
  window.AnalyticsDashboard = SectionAnalytics;  // Power BI дашборд заказов -> вкладка «Аналитика»
})();
