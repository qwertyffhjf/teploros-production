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
  return h('div', { style: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 } },
    h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' } }, label),
    h('div', { style: { fontSize: 22, fontWeight: 500, color: color || 'inherit', lineHeight: 1.1 } }, value),
    delta && h('div', { style: { fontSize: 10, color: deltaColor } }, `${deltaIcon} ${delta}`),
    spark && h(MiniSparkline, { values: spark.values, color: spark.color, height: 28 })
  );
});

// Полноэкранная аналитика (модалка)
const FullAnalyticsModal = memo(({ section, data, onClose }) => {
  const [period, setPeriod]       = useState(30);
  const [chartType, setChartType] = useState('bar'); // bar | line
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
    h('div', { style: { background: '#f5f5f2', borderRadius: 14, width: 'min(900px,100%)', margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' } },
      // Шапка
      h('div', { style: { background: '#fff', borderRadius: '14px 14px 0 0', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid rgba(0,0,0,0.08)' } },
        h('div', { style: { fontSize: 15, fontWeight: 500 } }, TITLES[section] || 'Аналитика'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          // Период
          h('div', { style: { display: 'flex', gap: 4 } },
            [7, 14, 30, 90].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11, padding: '4px 10px' }) : gbtn({ fontSize: 11, padding: '4px 10px' }), onClick: () => setPeriod(d) }, `${d}д`))
          ),
          h('button', { style: gbtn({ fontSize: 11 }), onClick: () => {
            const wb = XLSX.utils.book_new();
            if (section === 'warehouse' && computed.topMats) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(computed.topMats.map(([m, q]) => ({ Материал: m, Расход: q }))), 'Расход');
            }
            XLSX.writeFile(wb, `analytics_${section}_${new Date().toISOString().slice(0,10)}.xlsx`);
          } }, '📥 Excel'),
          h('button', { onClick: onClose, style: { background: 'none', border: 'none', fontSize: 22, color: '#aaa', cursor: 'pointer' } }, '×')
        )
      ),
      h('div', { style: { padding: 16 } },
        // Графики
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 } },
          h('div', { style: { background: '#fff', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 8 } },
              section === 'warehouse' ? 'Движение по дням' :
              section === 'hr' ? 'Выработка сотрудников' :
              section === 'quality' ? 'Качество по дням (%)' : 'Выполнение по дням'
            ),
            h('div', { className: 'op-card-anim', style: { height: 200, animationDelay: '0.05s' } }, h('canvas', { ref: c1.canvasRef }))
          ),
          h('div', { style: { background: '#fff', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 8 } },
              section === 'warehouse' ? 'Топ расхода материалов' :
              section === 'hr' ? 'Статус сотрудников' :
              section === 'quality' ? 'Брак по причинам' : 'Выработка по сотрудникам'
            ),
            h('div', { className: 'op-card-anim', style: { height: 200, animationDelay: '0.12s' } }, h('canvas', { ref: c2.canvasRef }))
          ),
          (section === 'production' || section === 'dashboard' || section === 'quality') && h('div', { style: { background: '#fff', borderRadius: 10, padding: '12px 14px', border: '0.5px solid rgba(0,0,0,0.08)', gridColumn: '1 / -1' } },
            h('div', { style: { fontSize: 11, fontWeight: 500, color: '#555', marginBottom: 8 } },
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
      h('span', { style: { color: '#888' } }, 'C (50-69) = 0%'),
      h('span', { style: { color: RD } }, 'D (<50) = −10%')
    ),
    workerKPIs.length === 0 ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888' } }, 'Нет данных за период') :
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
    await DB.save(d); onUpdate(d);
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
      await DB.save(updated); onUpdate(updated);
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
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 20 } }, 'Все операции имеют исполнителей')
      : recommendations.slice(0, 20).map(rec => h('div', { key: rec.opId, style: { ...S.card, padding: 12, marginBottom: 8, borderLeft: `4px solid ${PRIORITY[rec.orderPriority]?.color || '#888'}` } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
            h('div', null,
              h('span', { style: { fontSize: 13, fontWeight: 500 } }, rec.opName),
              h('span', { style: { marginLeft: 8, fontSize: 11, color: AM } }, rec.orderNumber),
              rec.deadline && h('span', { style: { marginLeft: 8, fontSize: 10, color: '#888' } }, `до ${rec.deadline}`)
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
                      background: noBadge ? '#f5f5f2' : isTop ? GN3 : '#f8f8f5',
                      border: noBadge ? '0.5px solid rgba(0,0,0,0.08)' : isTop ? `0.5px solid ${GN}` : '0.5px solid rgba(0,0,0,0.1)',
                      opacity: noBadge ? 0.7 : 1,
                      minWidth: 160, maxWidth: 200 },
                    onClick: () => assignWorker(rec.opId, c.workerId) },
                    h('div', { style: { flex: 1, minWidth: 0 } },
                      h('div', { style: { fontSize: 12, fontWeight: isTop ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                        c.workerName,
                        isTop && h('span', { style: { marginLeft: 4, fontSize: 10, color: GN } }, '★')
                      ),
                      h('div', { style: { fontSize: 10, color: '#888', marginTop: 2 } },
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



// ==================== AnalyticsDashboard (Волна 1: Lead Time, Такт, Нормы, Парето, Тренды) ====================
const AnalyticsDashboard = memo(({ data, onWorkerClick }) => {
  const [period, setPeriod] = useState(30);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);
  const chartRef1 = useRef(null); const canvasRef1 = useRef(null);
  const chartRef2 = useRef(null); const canvasRef2 = useRef(null);

  // ===== 1. Lead Time по заказам =====
  const leadTimeData = useMemo(() => {
    return data.orders.filter(o => !o.archived).map(order => {
      const ops = data.ops.filter(op => op.orderId === order.id);
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
    data.ops.filter(op => op.status === 'done' && op.startedAt && op.finishedAt && op.finishedAt >= periodStart).forEach(op => {
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
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' } },
      [7, 14, 30, 60, 90].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11 }) : gbtn({ fontSize: 11 }), onClick: () => setPeriod(d) }, `${d} дней`))
    ),

    // Алерт: тренд качества
    qualityTrends.trending && h('div', { role: 'alert', style: { ...S.card, background: RD3, border: `0.5px solid ${RD}`, marginBottom: 12, padding: 12 } },
      h('div', { style: { fontSize: 12, color: RD, fontWeight: 500 } }, '⚠ Брак растёт 3 недели подряд! Возможна системная проблема — проверьте оборудование и материалы.')
    ),

    // Такт производства
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Такт производства'),
      h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 10, marginBottom: 8 } },
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: GN } }, taktData.completedInPeriod), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, `Завершено за ${period}д`)),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: AM } }, taktData.pendingOrders), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'В очереди')),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: taktData.taktOk ? GN : RD } }, `${taktData.actualRate}`), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Факт (заказов/день)')),
        h('div', { style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0 } }, h('div', { style: { fontSize: 28, fontWeight: 500, color: taktData.taktOk ? GN : RD } }, `${taktData.requiredRate}`), h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase' } }, 'Нужно (заказов/день)'))
      ),
      !taktData.taktOk && taktData.requiredRate > 0 && h('div', { style: { fontSize: 11, color: RD, fontWeight: 500, marginTop: 4 } }, `⚠ Производство не успевает: нужно ${taktData.requiredRate} заказов/день, факт ${taktData.actualRate}. Среднее время до дедлайна: ${taktData.avgDaysToDeadline} дней.`)
    ),

    // Lead Time
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Lead Time — время прохождения заказа'),
      leadTimeData.length === 0 ? h('div', { style: { padding: 12, color: '#888', textAlign: 'center' } }, 'Нет завершённых операций') : h('div', null,
        h('div', { style: { display: 'flex', gap: 16, marginBottom: 12 } },
          h('div', null, h('div', { style: { fontSize: 24, fontWeight: 500, color: AM } }, fmtDur(avgLeadTime)), h('div', { style: { fontSize: 10, color: '#888' } }, 'Средний Lead Time')),
          h('div', null, h('div', { style: { fontSize: 24, fontWeight: 500, color: avgWaitingPct > 50 ? RD : AM } }, `${avgWaitingPct}%`), h('div', { style: { fontSize: 10, color: '#888' } }, 'Среднее ожидание'))
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
      qualityTrends.weeks.length === 0 ? h('div', { style: { padding: 12, color: '#888', textAlign: 'center' } }, 'Нет данных') : h('canvas', { ref: canvasRef2 })
    ),

    // Парето-анализ простоев (график + таблица)
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Парето-анализ простоев'),
      paretoData.length === 0 ? h('div', { style: { padding: 12, color: '#888', textAlign: 'center' } }, 'Нет простоев за период') : h('div', null,
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
        h('div', { style: { fontSize: 10, color: '#888', marginTop: 6 } }, 'Жёлтым выделены причины, дающие 80% потерь (правило Парето)')
      )
    ),

    // Автонормирование
    h('div', { style: { ...S.card, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Нормирование операций (факт vs план)'),
      normSuggestions.length === 0 ? h('div', { style: { padding: 12, color: '#888', textAlign: 'center' } }, 'Недостаточно данных (нужно ≥3 завершённых операций каждого типа)') :
        h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Операция', 'Замеров', 'Текущая норма', 'Медиана факт', 'Мин', 'Макс', 'Отклонение', 'Рекомендация'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, normSuggestions.map((s, i) => h('tr', { key: i, style: { background: s.deviation && Math.abs(s.deviation) > 30 ? '#FFF8E1' : 'transparent' } },
            h('td', { style: S.td }, s.name),
            h('td', { style: { ...S.td, textAlign: 'center' } }, s.count),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center' } }, s.current ? `${s.current}ч` : '—'),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', fontWeight: 500 } }, `${s.median}ч`),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', color: '#888' } }, `${s.min}ч`),
            h('td', { style: { ...S.td, fontFamily: 'monospace', textAlign: 'center', color: '#888' } }, `${s.max}ч`),
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

  return h('div', { style: { background: '#fff', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' } },
    // Заголовок виджета
    h('div', { style: { padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '0.5px solid rgba(0,0,0,0.05)' } },
      h('span', { style: { fontSize: 12, fontWeight: 500, color: '#333', flex: 1 } }, widget.title),
      h('span', { style: { fontSize: 10, color: '#aaa', marginRight: 4 } }, `${widget.period}д`),
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
        ? h('div', { style: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 12 } }, 'Нет данных за период')
        : h('canvas', { ref: canvasRef, style: { width: '100%', height: '100%' } })
    )
  );
});

// Панель редактирования одного виджета
const WidgetEditPanel = memo(({ widget, onUpdate, onClose }) => {
  const [form, setForm] = useState({ ...widget });
  const m = WIDGET_METRICS.find(x => x.id === form.metric);

  return h('div', { style: { background: '#fff', border: `1.5px solid ${AM}`, borderRadius: 10, padding: 16, marginBottom: 14 } },
    h('div', { style: { fontSize: 13, fontWeight: 500, marginBottom: 14, color: '#333' } }, '⚙ Настройка виджета'),
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
    showLibrary && h('div', { style: { background: '#f8f8f5', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 14, marginBottom: 14 } },
      h('div', { style: { fontSize: 11, fontWeight: 500, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 } }, 'Выберите метрику для добавления'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 } },
        WIDGET_METRICS.map(m => h('button', { key: m.id,
          style: { ...gbtn(), textAlign: 'left', padding: '8px 10px', lineHeight: 1.4 },
          onClick: () => addWidget(m.id)
        },
          h('div', { style: { fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 } }, m.cat),
          h('div', { style: { fontSize: 12 } }, m.name)
        ))
      )
    ),

    // Панель редактирования конкретного виджета
    editingWidget && h(WidgetEditPanel, { widget: editingWidget, onUpdate: updateWidget, onClose: () => setEditingId(null) }),

    // Сетка виджетов
    layout.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 40 } },
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
