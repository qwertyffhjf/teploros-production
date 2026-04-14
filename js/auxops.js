// teploros · auxops.js
// Автоматически извлечено из монолита

// ==================== AuxOpsViewer (Доп. работы — сводка для мастера) ====================
const AUX_CAT_LABELS = { maintenance: '🔧 Обслуживание', cleaning: '🧹 Уборка', logistics: '📦 Логистика', setup: '⚙ Наладка', other: '📝 Прочее' };

const AuxOpsViewer = memo(({ data, onUpdate, addToast }) => {
  const [period, setPeriod] = useState(7);
  const periodStart = useMemo(() => now() - period * 86400000, [period]);
  const { canvasRef: trendRef, draw: drawTrend } = useChartRef();

  const auxOps = useMemo(() => {
    return data.ops
      .filter(o => o.isAuxiliary && (o.createdAt >= periodStart || o.startedAt >= periodStart || o.finishedAt >= periodStart))
      .sort((a, b) => (b.finishedAt || b.startedAt || b.createdAt || 0) - (a.finishedAt || a.startedAt || a.createdAt || 0));
  }, [data.ops, periodStart]);

  const stats = useMemo(() => {
    const byCat = {};
    const byWorker = {};
    let totalMs = 0, doneCount = 0;
    auxOps.forEach(op => {
      const cat = op.auxCategory || 'other';
      byCat[cat] = (byCat[cat] || 0) + 1;
      (op.workerIds || []).forEach(wid => {
        const name = data.workers.find(w => w.id === wid)?.name?.split(' ')[0] || '?';
        byWorker[name] = (byWorker[name] || 0) + 1;
      });
      if (op.status === 'done' && op.startedAt && op.finishedAt) {
        totalMs += op.finishedAt - op.startedAt;
        doneCount++;
      }
    });
    return { total: auxOps.length, byCat, byWorker, totalHours: Math.round(totalMs / 3600000 * 10) / 10, doneCount };
  }, [auxOps, data.workers]);

  // Тренд по месяцам из auxStats (агрегированные данные)
  const trend = useMemo(() => {
    const as = data.auxStats || {};
    const months = Object.keys(as).sort().slice(-6); // последние 6 месяцев
    if (months.length === 0) return null;
    const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    return {
      labels: months.map(m => { const [, mm] = m.split('-'); return MONTHS_SHORT[parseInt(mm) - 1] || m; }),
      counts: months.map(m => as[m]?.total || 0),
      hours: months.map(m => Math.round((as[m]?.totalMs || 0) / 3600000 * 10) / 10),
      months
    };
  }, [data.auxStats]);

  // Рисуем тренд-график
  useEffect(() => {
    if (!trend || !window.Chart) return;
    drawTrend({
      type: 'bar',
      data: {
        labels: trend.labels,
        datasets: [
          { label: 'Работ', data: trend.counts, backgroundColor: AM, borderRadius: 4, yAxisID: 'y' },
          { label: 'Часов', data: trend.hours, type: 'line', borderColor: GN, borderWidth: 2, pointRadius: 3, pointBackgroundColor: GN, fill: false, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Работ', font: { size: 10 } } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Часов', font: { size: 10 } } }
        },
        animation: { duration: 300 }
      }
    });
  }, [trend, drawTrend]);

  const exportXls = useCallback(() => {
    const rows = auxOps.map(op => {
      const worker = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name).filter(Boolean).join(', ');
      const order = data.orders.find(o => o.id === op.orderId);
      return {
        'Дата': op.createdAt ? new Date(op.createdAt).toLocaleDateString() : '—',
        'Категория': AUX_CAT_LABELS[op.auxCategory] || 'Прочее',
        'Работа': op.name,
        'Сотрудник': worker || '—',
        'Заказ': order?.number || '—',
        'Статус': STATUS[op.status]?.label || op.status,
        'Время (ч)': op.startedAt && op.finishedAt ? Math.round((op.finishedAt - op.startedAt) / 3600000 * 10) / 10 : '—',
        'Комментарий': op.comment || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Доп. работы');
    XLSX.writeFile(wb, `aux_ops_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [auxOps, data]);

  return h('div', null,
    // Период
    h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' } },
      [7, 14, 30].map(d => h('button', { key: d, style: period === d ? abtn({ fontSize: 11, padding: '5px 10px' }) : gbtn({ fontSize: 11, padding: '5px 10px' }), onClick: () => setPeriod(d) }, `${d} дн`)),
      h('button', { style: gbtn({ fontSize: 11, padding: '5px 10px', marginLeft: 'auto' }), onClick: exportXls }, '📥 Excel')
    ),
    // Сводка
    h('div', { className: 'metrics-grid', style: { display: 'grid', gap: 8, marginBottom: 14 } },
      h(MC, { v: stats.total, l: 'Записей' }),
      h(MC, { v: stats.doneCount, l: 'Выполнено', c: GN }),
      h(MC, { v: `${stats.totalHours}ч`, l: 'Трудозатраты', c: AM }),
      h(MC, { v: Object.keys(stats.byWorker).length, l: 'Сотрудников' })
    ),
    // Тренд по месяцам (из auxStats)
    trend && h('div', { style: { ...S.card, padding: 12, marginBottom: 12 } },
      h('div', { style: S.sec }, 'Динамика по месяцам'),
      h('div', { style: { height: 180 } },
        h('canvas', { ref: trendRef, style: { height: '100%', width: '100%' } })
      ),
      // Детализация по месяцам — текстовая
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
        trend.months.map((m, i) => {
          const ms = (data.auxStats || {})[m];
          if (!ms) return null;
          const topCat = Object.entries(ms.byCategory || {}).sort((a, b) => b[1].count - a[1].count)[0];
          return h('div', { key: m, style: { flex: '1 1 120px', minWidth: 120, background: '#f8f8f5', borderRadius: 8, padding: '6px 10px', fontSize: 11 } },
            h('div', { style: { fontWeight: 500, color: AM2, marginBottom: 2 } }, trend.labels[i]),
            h('div', null, `${ms.total} работ · ${Math.round(ms.totalMs / 3600000 * 10) / 10}ч`),
            topCat && h('div', { style: { color: '#888', marginTop: 2 } }, `${AUX_CAT_LABELS[topCat[0]]?.split(' ')[0] || topCat[0]}: ${topCat[1].count}`)
          );
        })
      )
    ),
    // По категориям
    Object.keys(stats.byCat).length > 0 && h('div', { style: { ...S.card, padding: 12, marginBottom: 12 } },
      h('div', { style: S.sec }, 'По категориям'),
      Object.entries(stats.byCat).sort((a, b) => b[1] - a[1]).map(([cat, cnt]) =>
        h('div', { key: cat, style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 13 } },
          h('span', null, AUX_CAT_LABELS[cat] || cat),
          h('span', { style: { fontWeight: 500, color: AM } }, cnt)
        )
      )
    ),
    // По исполнителям
    Object.keys(stats.byWorker).length > 0 && h('div', { style: { ...S.card, padding: 12, marginBottom: 12 } },
      h('div', { style: S.sec }, 'По исполнителям'),
      Object.entries(stats.byWorker).sort((a, b) => b[1] - a[1]).map(([name, cnt]) =>
        h('div', { key: name, style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid rgba(0,0,0,0.05)', fontSize: 13 } },
          h('span', null, name),
          h('span', { style: { fontWeight: 500, color: AM } }, cnt)
        )
      )
    ),
    // Таблица
    auxOps.length === 0
      ? h('div', { style: { ...S.card, textAlign: 'center', color: '#888', padding: 24 } }, `Нет доп. работ за ${period} дней`)
      : h('div', { style: { ...S.card, padding: 0 } }, h('div', { className: 'table-responsive' }, h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
          h('thead', null, h('tr', null, ['Дата', 'Категория', 'Работа', 'Сотрудник', 'Заказ', 'Статус', 'Время'].map((t, i) => h('th', { key: i, style: S.th }, t)))),
          h('tbody', null, auxOps.slice(0, 50).map(op => {
            const workers = (op.workerIds || []).map(wid => data.workers.find(w => w.id === wid)?.name?.split(' ')[0]).filter(Boolean).join(', ');
            const order = data.orders.find(o => o.id === op.orderId);
            const dur = op.startedAt && op.finishedAt ? fmtDur(op.finishedAt - op.startedAt) : '—';
            return h('tr', { key: op.id },
              h('td', { style: S.td }, op.createdAt ? new Date(op.createdAt).toLocaleDateString() : '—'),
              h('td', { style: { ...S.td, fontSize: 11 } }, AUX_CAT_LABELS[op.auxCategory] || '📝'),
              h('td', { style: { ...S.td, fontWeight: 500 } }, op.name),
              h('td', { style: S.td }, workers || '—'),
              h('td', { style: { ...S.td, color: AM } }, order?.number || '—'),
              h('td', { style: S.td }, h(Badge, { st: op.status })),
              h('td', { style: { ...S.td, fontFamily: 'monospace' } }, dur)
            );
          }))
        )))
  );
});



