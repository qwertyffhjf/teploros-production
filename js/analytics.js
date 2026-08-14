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
    var soft = T.soft, grid = T.grid, tile = T.tile;

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
            data: { labels: stK, datasets: [{ data: stK.map(function (k) { return st[k]; }), backgroundColor: [PBI.navy, PBI.blue, PBI.teal, PBI.grey, PBI.coral, PBI.purple], borderWidth: 2, borderColor: tile }] },
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
            type: 'doughnut', data: { labels: osK, datasets: [{ data: osK.map(function (k) { return os[k]; }), backgroundColor: [PBI.navy, PBI.grey, PBI.coral, PBI.teal, PBI.blue], borderWidth: 2, borderColor: tile }] },
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
  window.SectionAnalytics = SectionAnalytics;
})();
