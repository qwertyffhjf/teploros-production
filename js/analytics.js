<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>teploros · Аналитика (прототип analytics.js)</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
<style>
:root{
  --blue:#118DFF;--navy:#12239E;--teal:#01B8AA;--coral:#E66C37;--red:#D64550;
  --purple:#6B007B;--yellow:#D9B300;--emer:#12B886;--amber:#F2C811;
}
/* ===== LIGHT (default) ===== */
[data-theme="light"]{
  --bg:#e6e6e6;--canvas:#F3F2F1;--tile:#fff;--ink:#242220;--soft:#6b6864;
  --line:#E4E2E0;--grid:#eeeeee;--track:#f0f0f0;--hover:#f6f9ff;
}
/* ===== DARK ===== */
[data-theme="dark"]{
  --bg:#0f0e0d;--canvas:#181614;--tile:#242220;--ink:#f3f2f1;--soft:#a19f9d;
  --line:#3b3a39;--grid:#333130;--track:#3b3a39;--hover:#2f2d2b;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;transition:background .2s}
.appbar{height:48px;background:var(--canvas);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;padding:0 16px;position:sticky;top:0;z-index:30}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}
.brand .sq{width:16px;height:16px;border-radius:3px;background:conic-gradient(from 45deg,#F2C811,#E66C37,#118DFF,#01B8AA)}
.sep{width:1px;height:22px;background:var(--line)}
.path{font-size:13px;color:var(--soft)}
.spacer{flex:1}
.theme-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--soft);background:var(--tile);border:1px solid var(--line);border-radius:20px;padding:3px 4px;cursor:pointer;user-select:none}
.theme-toggle .opt{padding:4px 11px;border-radius:16px;font-weight:600}
.theme-toggle .opt.on{background:var(--blue);color:#fff}
.tabs{display:flex;gap:4px;background:var(--canvas);border-bottom:1px solid var(--line);padding:6px 16px 0;position:sticky;top:48px;z-index:20}
.tab{border:1px solid transparent;border-bottom:none;background:transparent;font:inherit;font-size:13px;padding:9px 18px;border-radius:6px 6px 0 0;cursor:pointer;color:var(--soft);position:relative;top:1px;display:flex;align-items:center;gap:6px}
.tab:hover{background:var(--hover);color:var(--ink)}
.tab.active{background:var(--tile);border-color:var(--line);color:var(--ink);font-weight:600}
.tab.active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--tile)}
.stage{padding:16px;display:none}
.stage.active{display:block}
.canvas{background:var(--canvas);border-radius:6px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.14);max-width:1280px;margin:0 auto}
.rt-title{font-size:20px;font-weight:600;padding:2px 6px 12px;color:var(--ink)}
.rt-title small{display:block;font-size:12px;font-weight:400;color:var(--soft);margin-top:2px}
.grid{display:grid;gap:12px}
.kpis{grid-template-columns:repeat(5,1fr)}
.kpi{background:var(--tile);border-radius:6px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:4px solid var(--blue)}
.kpi.k2{border-left-color:var(--teal)}.kpi.k3{border-left-color:var(--coral)}
.kpi.k4{border-left-color:var(--red)}.kpi.k5{border-left-color:var(--purple)}
.kpi .lbl{font-size:11px;color:var(--soft);font-weight:600;text-transform:uppercase;letter-spacing:.3px}
.kpi .val{font-size:27px;font-weight:600;line-height:1.1;margin-top:4px;color:var(--ink)}
.kpi .val .u{font-size:14px;font-weight:500;color:var(--soft)}
.kpi .sub{font-size:12px;margin-top:4px;color:var(--soft)}
.up{color:var(--emer);font-weight:600}.down{color:var(--red);font-weight:600}
.tile{background:var(--tile);border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:12px 14px;display:flex;flex-direction:column;min-height:0}
.tile h3{font-size:13px;font-weight:600;color:var(--ink)}
.tile .th-sub{font-size:11px;color:var(--soft);margin:1px 0 8px}
.chart-wrap{flex:1;position:relative;min-height:190px}
table.pbi{width:100%;border-collapse:collapse;font-size:12.5px}
table.pbi thead th{text-align:left;font-weight:600;color:var(--soft);border-bottom:2px solid var(--line);padding:7px 8px;position:sticky;top:0;background:var(--tile);text-transform:uppercase;font-size:11px;letter-spacing:.3px}
table.pbi td{padding:7px 8px;border-bottom:1px solid var(--grid);color:var(--ink)}
table.pbi tbody tr:hover{background:var(--hover)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:11px}
.b-prod{background:#e3f0ff;color:#0b62c4}.b-ship{background:#eef2ff;color:#3a3ea8}
.b-new{background:#ececec;color:#666}.b-late{background:#fde7ea;color:#b1283a}
[data-theme="dark"] .b-prod{background:#123a5c;color:#7cc0ff}
[data-theme="dark"] .b-ship{background:#26264a;color:#9a9df0}
[data-theme="dark"] .b-new{background:#333130;color:#c8c6c4}
[data-theme="dark"] .b-late{background:#4a1f26;color:#ff8a9c}
.scroll{overflow:auto}
.databar{height:13px;border-radius:2px;display:inline-block;vertical-align:middle}
.grid12{grid-template-columns:repeat(12,1fr)}
.s3{grid-column:span 3}.s4{grid-column:span 4}.s5{grid-column:span 5}.s6{grid-column:span 6}
.s7{grid-column:span 7}.s8{grid-column:span 8}.s12{grid-column:span 12}
.treemap{position:relative;width:100%;flex:1;min-height:210px}
.tm-cell{position:absolute;border:2px solid var(--canvas);border-radius:4px;overflow:hidden;padding:6px 8px;color:#fff;display:flex;flex-direction:column}
.tm-cell .t1{font-size:12px;font-weight:700;line-height:1.1}
.tm-cell .t2{font-size:11px;opacity:.92;margin-top:2px}
.gauge-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
.gauge-center .g1{font-size:30px;font-weight:700;color:var(--ink)}.gauge-center .g2{font-size:11px;color:var(--soft)}
.gantt-months{display:grid;grid-template-columns:140px 1fr;gap:8px;font-size:10px;color:var(--soft);margin-bottom:4px}
.gantt-months .gm{display:flex}.gantt-months .gm span{flex:1;text-align:center}
.gantt-row{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:8px;margin-bottom:5px;font-size:11px}
.g-lbl{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gantt-track{position:relative;height:18px;background:var(--track);border-radius:3px}
.gantt-bar{position:absolute;height:18px;border-radius:3px;top:0;display:flex;align-items:center;padding-left:6px;color:#fff;font-size:10px;font-weight:600;overflow:hidden}
.footnote{max-width:1280px;margin:10px auto 0;font-size:11px;color:#8a8886;text-align:center}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}
 .grid12 .s3,.grid12 .s4,.grid12 .s5,.grid12 .s6,.grid12 .s7,.grid12 .s8{grid-column:span 12}}
</style>
</head>
<body data-theme="light">
<div class="appbar">
  <div class="brand"><span class="sq"></span> teploros · Аналитика</div>
  <span class="sep"></span><span class="path">Заказы · единица измерения — кВт / МВт</span>
  <span class="spacer"></span>
  <div class="theme-toggle" id="themeToggle">
    <span class="opt on" data-theme-opt="light">☀ Светлая</span>
    <span class="opt" data-theme-opt="dark">🌙 Тёмная</span>
  </div>
</div>
<div class="tabs">
  <button class="tab active" data-stage="overview">📊 Обзор</button>
  <button class="tab" data-stage="production">🏭 Производство</button>
  <button class="tab" data-stage="risk">⚠️ Риск</button>
</div>

<!-- ===== OVERVIEW ===== -->
<div class="stage active" id="stage-overview">
 <div class="canvas">
  <div class="rt-title">Обзор портфеля <small>структура заказов по мощности · данные на 13.08.2026</small></div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi"><div class="lbl">Мощность портфеля</div><div class="val" id="o_pw">—</div><div class="sub">39 заказов</div></div>
    <div class="kpi k2"><div class="lbl">В производстве</div><div class="val" id="o_wip">—</div><div class="sub">17 заказов</div></div>
    <div class="kpi k3"><div class="lbl">Отгружено</div><div class="val" id="o_ship">—</div><div class="sub">22 заказа</div></div>
    <div class="kpi k4"><div class="lbl">Просрочено</div><div class="val" id="o_late">—</div><div class="sub">5 заказов</div></div>
    <div class="kpi k5"><div class="lbl">Ср. мощность</div><div class="val" id="o_avg">—</div><div class="sub">на заказ</div></div>
  </div>
  <div class="grid grid12">
    <div class="tile s4"><h3>По статусам</h3><div class="th-sub">мощность, кВт</div><div class="chart-wrap"><canvas id="o_donut"></canvas></div></div>
    <div class="tile s8"><h3>Отгрузки по месяцам</h3><div class="th-sub">кВт</div><div class="chart-wrap"><canvas id="o_month"></canvas></div></div>
    <div class="tile s7"><h3>Мощность по семействам котлов</h3><div class="th-sub">площадь = кВт</div><div class="treemap" id="o_tree"></div></div>
    <div class="tile s5"><h3>Топ заказчиков</h3><div class="th-sub">кВт</div><div class="chart-wrap"><canvas id="o_cust"></canvas></div></div>
    <div class="tile s12"><h3>Крупнейшие заказы</h3><div class="th-sub">по мощности</div>
      <div class="scroll" style="max-height:210px"><table class="pbi">
        <thead><tr><th>№</th><th>Заказчик</th><th>Изделие</th><th class="num">кВт</th><th>Приоритет</th><th>Статус</th></tr></thead>
        <tbody id="o_tbody"></tbody></table></div></div>
  </div>
 </div>
 <div class="footnote">Прототип рендера analytics.js · мощность распознаётся из модели/поля «Мощность, кВт»</div>
</div>

<!-- ===== PRODUCTION ===== -->
<div class="stage" id="stage-production">
 <div class="canvas">
  <div class="rt-title">Производство <small>загрузка участков, операции, сроки</small></div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi k2"><div class="lbl">Заказов на линии</div><div class="val" id="pr_wip">—</div><div class="sub">не отгружено</div></div>
    <div class="kpi"><div class="lbl">Операций открыто</div><div class="val" id="pr_ops">—</div><div class="sub">из 460 всего</div></div>
    <div class="kpi k3"><div class="lbl">На проверке ОТК</div><div class="val" id="pr_qc">—</div><div class="sub">операций</div></div>
    <div class="kpi k5"><div class="lbl">Ср. готовность</div><div class="val" id="pr_ready">—</div><div class="sub">активных заказов</div></div>
    <div class="kpi k4"><div class="lbl">Готовы к отгрузке</div><div class="val" id="pr_rts">—</div><div class="sub">ждут отгрузки</div></div>
  </div>
  <div class="grid grid12">
    <div class="tile s5"><h3>Загрузка участков</h3><div class="th-sub">открытые операции по участкам</div><div class="chart-wrap"><canvas id="pr_uch"></canvas></div></div>
    <div class="tile s7"><h3>График заказов (Гантт)</h3><div class="th-sub">план по срокам, активные заказы</div><div id="pr_gantt" style="margin-top:4px"></div></div>
    <div class="tile s7"><h3>Готовность активных заказов</h3><div class="th-sub">%, по убыванию</div><div class="chart-wrap"><canvas id="pr_prog"></canvas></div></div>
    <div class="tile s5"><h3>Операции по статусам</h3><div class="th-sub">весь пул 460</div><div class="chart-wrap"><canvas id="pr_opstat"></canvas></div></div>
  </div>
 </div>
 <div class="footnote">Прототип рендера analytics.js · данные из листов «Заказы» и «Операции»</div>
</div>

<!-- ===== RISK ===== -->
<div class="stage" id="stage-risk">
 <div class="canvas">
  <div class="rt-title">Риск и сроки <small>просрочка, что горит, мощность под угрозой</small></div>
  <div class="grid kpis" style="margin-bottom:12px">
    <div class="kpi k4"><div class="lbl">кВт под риском</div><div class="val" id="r_pw">—</div><div class="sub">просроч. + &lt;7 дн</div></div>
    <div class="kpi k4"><div class="lbl">Просрочено</div><div class="val" id="r_late">—</div><div class="sub">заказов</div></div>
    <div class="kpi k3"><div class="lbl">Близко к сроку</div><div class="val" id="r_soon">—</div><div class="sub">&lt; 7 дней</div></div>
    <div class="kpi"><div class="lbl">Ср. просрочка</div><div class="val" id="r_days">—</div><div class="sub">дней</div></div>
    <div class="kpi k2"><div class="lbl">Готовы к отгрузке</div><div class="val" id="r_rts">—</div><div class="sub">можно закрыть</div></div>
  </div>
  <div class="grid grid12">
    <div class="tile s7"><h3>кВт под риском по заказам</h3><div class="th-sub">цвет = глубина просрочки</div><div class="chart-wrap"><canvas id="r_bar"></canvas></div></div>
    <div class="tile s5"><h3>Готовность просроченных</h3><div class="th-sub">насколько близко к финишу</div><div class="chart-wrap"><canvas id="r_ready"></canvas></div></div>
    <div class="tile s12"><h3>Матрица риска</h3><div class="th-sub">просроченные и близкие к сроку</div>
      <div class="scroll" style="max-height:250px"><table class="pbi">
        <thead><tr><th>№</th><th>Заказчик</th><th>Изделие</th><th class="num">кВт</th><th class="num">Осталось дн</th><th>Готовность</th><th>Операция</th></tr></thead>
        <tbody id="r_tbody"></tbody></table></div></div>
  </div>
 </div>
 <div class="footnote">Прототип рендера analytics.js · риск = «Просрочен» или осталось &lt; 7 дней</div>
</div>

<script>
/* ============================================================
   Прототип рендера будущего analytics.js.
   Паттерн ровно как будет в боевом модуле:
   - чистый рендер поверх ORDERS/UCHASTKI (в MES это будет data.*)
   - ленивая отрисовка: строим только активную раскладку
   - destroy() всех графиков при переключении вкладки/темы
   - тема через data-theme на <body>, выбор в localStorage
   ============================================================ */
const ORDERS = [{"num":"51/26","cust":"ООО \"СК ИДЕА-Л\"","prod":"Термомасляный котел Teplofor Dilex MV3-DD 150","pw":150.0,"qty":1,"prio":"Средний","status":"Частично выполнен","ready":50,"daysLeft":-30,"overdue":true,"readyShip":false,"op":"Опрессовка котла","shipped":null,"family":"MV3"},{"num":"38/26","cust":"ООО \"АИСС\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 300","pw":300.0,"qty":1,"prio":"Средний","status":"Частично выполнен","ready":86,"daysLeft":-10,"overdue":true,"readyShip":false,"op":"Сборка/сварка топки","shipped":null,"family":"VV2"},{"num":"43/26","cust":"ИП Бекрешев Константин Викторович","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 400","pw":400.0,"qty":2,"prio":"Средний","status":"Частично выполнен","ready":20,"daysLeft":-4,"overdue":true,"readyShip":false,"op":"Заполнение крышек","shipped":null,"family":"VV2"},{"num":"45/26-1","cust":"ООО \"СМУ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 300","pw":300.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":-4,"overdue":true,"readyShip":false,"op":"—","shipped":null,"family":"V2"},{"num":"45/26-2","cust":"ООО \"СМУ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 350","pw":350.0,"qty":1,"prio":"Средний","status":"Частично выполнен","ready":44,"daysLeft":-4,"overdue":true,"readyShip":false,"op":"Сварка задней крышки","shipped":null,"family":"V2"},{"num":"К46/26 ДЛЯ КНР Lextop DN 200","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 200 (200 кВт, 6 бар,115С)","pw":200.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":1,"overdue":false,"readyShip":false,"op":"Поставка комплектующих на МВХ","shipped":null,"family":"V2"},{"num":"41/26","cust":"ООО \"БЕЛРУСИМПЭКС\"","prod":"Водогрейный котел трехходовой Teplofor Lex V3-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Частично выполнен","ready":13,"daysLeft":2,"overdue":false,"readyShip":false,"op":"Сварка передней крышки","shipped":null,"family":"V3"},{"num":"44/26","cust":"ООО \"СКЛАД\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 1200","pw":1200.0,"qty":2,"prio":"Средний","status":"В работе","ready":7,"daysLeft":2,"overdue":false,"readyShip":false,"op":"Сварка задней крышки","shipped":null,"family":"V2"},{"num":"42/26-1","cust":"ООО \"КАПИТАЛГРАНДСТРОЙ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 200","pw":200.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":7,"overdue":false,"readyShip":false,"op":"—","shipped":null,"family":"V2"},{"num":"42/26-2","cust":"ООО \"КАПИТАЛГРАНДСТРОЙ\"","prod":"Котел водогрейный двухходовой Teplofor Lex V2-D 500","pw":500.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":7,"overdue":false,"readyShip":false,"op":"—","shipped":null,"family":"V2"},{"num":"42/26","cust":"ООО \"ПАПИНА ФЕРМА\"","prod":"Паровой двухходовой котел Teplofor Lexor SP2-D 2500","pw":2500.0,"qty":1,"prio":"Высокий","status":"Частично выполнен","ready":50,"daysLeft":12,"overdue":false,"readyShip":false,"op":"Заполнение крышек","shipped":null,"family":"SP2"},{"num":"55/26","cust":"ООО УК \"ПОЛЁТ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 70","pw":70.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":12,"overdue":false,"readyShip":false,"op":"—","shipped":null,"family":"V2"},{"num":"54/26","cust":"ООО \"КВИКС\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 300","pw":300.0,"qty":1,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":15,"overdue":false,"readyShip":false,"op":"Поставка комплектующих на МВХ","shipped":null,"family":"V2"},{"num":"56/26","cust":"ООО \"ЭНЕРГО ГРУПП\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":18,"overdue":false,"readyShip":false,"op":"Поставка комплектующих на МВХ","shipped":null,"family":"VV2"},{"num":"39/26","cust":"ООО \"ОНКРАФТ\"","prod":"Котел водогрейный Teplofor Lex V2-D 2500, 6 бар","pw":2500.0,"qty":1,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":22,"overdue":false,"readyShip":false,"op":"Поставка комплектующих на МВХ","shipped":null,"family":"V2"},{"num":"49/26","cust":"ООО \"СПЕЦ-СЕРВИС\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 2000","pw":2000.0,"qty":3,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":28,"overdue":false,"readyShip":false,"op":"—","shipped":null,"family":"V2"},{"num":"57/26","cust":"ИП Ежелев Виктор Григорьевич","prod":"Водогрейный котел трехходовой Teplofor Lex V3-D 2500","pw":2500.0,"qty":2,"prio":"Средний","status":"Ожидает","ready":0,"daysLeft":38,"overdue":false,"readyShip":false,"op":"Поставка комплектующих на МВХ","shipped":null,"family":"V3"},{"num":"37/26","cust":"ООО \"НТ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 300","pw":300.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-13,"overdue":false,"readyShip":true,"op":"—","shipped":"11.08.2026","family":"V2"},{"num":"36/26","cust":"ИП Горохова Светлана Николаевна","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 150","pw":150.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-24,"overdue":false,"readyShip":true,"op":"—","shipped":"11.08.2026","family":"V2"},{"num":"35/1/26","cust":"ООО \"КЭО\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 2000","pw":2000.0,"qty":1,"prio":"Высокий","status":"Отгружен","ready":100,"daysLeft":-30,"overdue":false,"readyShip":true,"op":"—","shipped":"11.08.2026","family":"VV2"},{"num":"34/26","cust":"ООО \"ПТ-СЕРВИС\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 500","pw":500.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-31,"overdue":false,"readyShip":true,"op":"—","shipped":"11.08.2026","family":"V2"},{"num":"61/26","cust":"ИП Куликовских Михаил Евгеньевич","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 800","pw":800.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-38,"overdue":false,"readyShip":true,"op":"—","shipped":"11.08.2026","family":"V2"},{"num":"01/4/26/900","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 900","pw":900.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":92,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/3/26/1500","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 1500","pw":1500.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":67,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/3/26/4500","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 4500","pw":4500.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":33,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/1/26/1000","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":82,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/2/26/1000","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":83,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/2/26/3500","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 3500","pw":3500.0,"qty":3,"prio":"Средний","status":"Отгружен","ready":33,"daysLeft":-13,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"01/1/26/2000","cust":"—","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 2000","pw":2000.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":83,"daysLeft":-17,"overdue":false,"readyShip":false,"op":"—","shipped":"31.07.2026","family":"V2"},{"num":"53/","cust":"ООО \"СПЕЦЭКСПЕРТИЗА\"","prod":"Двухходовой котел узкий Teplofor Lexender UV2-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-59,"overdue":false,"readyShip":true,"op":"—","shipped":"15.07.2026","family":"V2"},{"num":"58/26/1","cust":"—","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 800","pw":800.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-44,"overdue":false,"readyShip":true,"op":"—","shipped":"08.07.2026","family":"VV2"},{"num":"31/1/26","cust":"ООО \"КСИ\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 500 бесшовная труба","pw":500.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-40,"overdue":false,"readyShip":true,"op":"—","shipped":"07.07.2026","family":"VV2"},{"num":"31/26","cust":"ООО \"КСИ\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 1800","pw":1800.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":93,"daysLeft":-40,"overdue":false,"readyShip":false,"op":"—","shipped":"07.07.2026","family":"VV2"},{"num":"14/26","cust":"ООО \"ВМС ИНЖИНИРИНГ\"","prod":"Водогрейный котел двухходовой Teplofor Lex V2-D 600","pw":600.0,"qty":2,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-83,"overdue":false,"readyShip":true,"op":"—","shipped":"26.06.2026","family":"V2"},{"num":"33/1/26","cust":"—","prod":"котел 1800мВт для КНР","pw":1800.0,"qty":1,"prio":"Высокий","status":"Отгружен","ready":100,"daysLeft":-74,"overdue":false,"readyShip":true,"op":"—","shipped":"24.06.2026","family":"др."},{"num":"21/26","cust":"ООО \"ГК\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 1000","pw":1000.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-59,"overdue":false,"readyShip":true,"op":"—","shipped":"23.06.2026","family":"VV2"},{"num":"45/26","cust":"ИП Бекрешев Константин Викторович","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 600","pw":600.0,"qty":3,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-71,"overdue":false,"readyShip":true,"op":"—","shipped":"11.06.2026","family":"VV2"},{"num":"8/26","cust":"ООО \"КУЛОН-СЕРВИС-ГАЗ\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 700","pw":700.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-75,"overdue":false,"readyShip":true,"op":"—","shipped":"11.06.2026","family":"VV2"},{"num":"17/26","cust":"ООО \"ТАНДЕМ КЛИМАТ МСК\"","prod":"Сдвоенный вертикальный котел Teplofor Duplex VV2-D 600","pw":600.0,"qty":1,"prio":"Средний","status":"Отгружен","ready":100,"daysLeft":-83,"overdue":false,"readyShip":true,"op":"—","shipped":"08.06.2026","family":"VV2"}];
const UCH = [{"u":"Крышки","open":43,"done":70,"tot":113},{"u":"Теплообменник","open":43,"done":110,"tot":153},{"u":"Окраска","open":29,"done":33,"tot":62},{"u":"Кожух","open":28,"done":22,"tot":50},{"u":"Опресcовка","open":12,"done":19,"tot":31},{"u":"Склад","open":7,"done":5,"tot":12}];
const P={blue:'#118DFF',navy:'#12239E',teal:'#01B8AA',coral:'#E66C37',red:'#D64550',purple:'#6B007B',yellow:'#D9B300',emer:'#12B886',grey:'#8A8886'};
Chart.defaults.font.family='Segoe UI, sans-serif';Chart.defaults.font.size=11;
Chart.defaults.plugins.legend.labels.boxWidth=10;Chart.defaults.plugins.legend.labels.boxHeight=10;

const charts={};
function destroyAll(){Object.values(charts).forEach(c=>{try{c.destroy()}catch(e){}});for(const k in charts)delete charts[k];}

/* ---- helpers ---- */
const kw=o=>o.pw*o.qty;
const isShipped=o=>o.status==='Отгружен';
const active=ORDERS.filter(o=>!isShipped(o));
const kwf=v=>v>=1000?(v/1000).toFixed(1)+' МВт':Math.round(v)+' кВт';
const kwU=v=>v>=1000?[(v/1000).toFixed(1),' МВт']:[Math.round(v),' кВт'];
const short=s=>String(s).replace(/^(ООО|ИП|АО|ЗАО|ПАО)\s*/,'').replace(/["«»]/g,'').slice(0,22);
const fam=k=>({MV3:'Dilex MV',VV2:'Duplex VV',V2:'Lex V2',V3:'Lex V3',SP2:'Lexor SP',['др.']:'Прочие'}[k]||k);
const prod=s=>String(s).replace('Термомасляный котел ','').replace('Teplofor ','');
function themeColor(name){return getComputedStyle(document.body).getPropertyValue('--'+name).trim();}
const badge=s=>{const m={'Отгружен':'b-ship','Частично выполнен':'b-prod','В работе':'b-prod','Ожидает':'b-new'};return '<span class="badge '+(m[s]||'b-new')+'">'+s+'</span>'};

/* ---- treemap ---- */
function treemap(el,items){
  const W=el.clientWidth||600,H=el.clientHeight||210;
  items.sort((a,b)=>b.val-a.val);
  const total=items.reduce((s,i)=>s+i.val,0)||1;
  let html='',acc=0,top=[],bot=[],half=total*0.60;
  items.forEach(i=>{acc<half?(top.push(i),acc+=i.val):bot.push(i)});
  const strip=(arr,yy,hh)=>{const t=arr.reduce((s,i)=>s+i.val,0)||1;let xx=0;
    arr.forEach(i=>{const w=i.val/t*W;html+=`<div class="tm-cell" style="left:${xx}px;top:${yy}px;width:${w}px;height:${hh}px;background:${i.color}"><div class="t1">${i.label}</div><div class="t2">${i.sub}</div></div>`;xx+=w});};
  const h1=H*0.6;strip(top,0,h1);strip(bot,h1,H-h1);el.innerHTML=html;
}

/* ---- axis colors follow theme ---- */
function axis(){const g=themeColor('grid'),s=themeColor('soft');return {grid:{color:g},ticks:{color:s}};}

/* ============ OVERVIEW ============ */
function buildOverview(){
  const totKw=ORDERS.reduce((s,o)=>s+kw(o),0);
  const shipKw=ORDERS.filter(isShipped).reduce((s,o)=>s+kw(o),0);
  const wipKw=active.reduce((s,o)=>s+kw(o),0);
  const lateKw=ORDERS.filter(o=>o.overdue).reduce((s,o)=>s+kw(o),0);
  const set=(id,v)=>{const[n,u]=kwU(v);document.getElementById(id).innerHTML=n+'<span class="u">'+u+'</span>'};
  set('o_pw',totKw);set('o_wip',wipKw);set('o_ship',shipKw);set('o_late',lateKw);
  document.getElementById('o_avg').innerHTML=Math.round(totKw/ORDERS.length)+'<span class="u"> кВт</span>';
  // donut by status (kW)
  const st={};ORDERS.forEach(o=>{st[o.status]=(st[o.status]||0)+kw(o)});
  charts.od=new Chart(o_donut,{type:'doughnut',data:{labels:Object.keys(st),datasets:[{data:Object.values(st),backgroundColor:[P.navy,P.blue,P.teal,P.grey,P.coral],borderWidth:2,borderColor:themeColor('tile')}]},options:{cutout:'60%',plugins:{legend:{position:'right',labels:{color:themeColor('soft')}},tooltip:{callbacks:{label:c=>c.label+': '+Math.round(c.parsed)+' кВт'}}},maintainAspectRatio:false}});
  // month
  const m={};ORDERS.forEach(o=>{if(o.shipped){const p=o.shipped.split('.');const k=p[1]+'.'+p[2];m[k]=(m[k]||0)+kw(o)}});
  const ord=['06.2026','07.2026','08.2026'];
  charts.om=new Chart(o_month,{type:'bar',data:{labels:['Июнь','Июль','Август'],datasets:[{data:ord.map(k=>m[k]||0),backgroundColor:P.blue,borderRadius:4,barThickness:46}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>Math.round(c.parsed.y)+' кВт'}}},scales:{y:axis(),x:{grid:{display:false},ticks:{color:themeColor('soft')}}},maintainAspectRatio:false}});
  // treemap by family
  const fa={};ORDERS.forEach(o=>{fa[o.family]=(fa[o.family]||0)+kw(o)});
  const cols=[P.navy,P.blue,P.teal,P.emer,P.coral,P.purple];
  requestAnimationFrame(()=>treemap(o_tree,Object.entries(fa).map(([k,v],i)=>({label:fam(k),val:v,color:cols[i%cols.length],sub:kwf(v)}))));
  // customers
  const c={};ORDERS.forEach(o=>{c[o.cust]=(c[o.cust]||0)+kw(o)});
  const cs=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,7);
  charts.oc=new Chart(o_cust,{type:'bar',data:{labels:cs.map(x=>short(x[0])),datasets:[{data:cs.map(x=>x[1]),backgroundColor:P.teal,borderRadius:3,barThickness:15}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>Math.round(c.parsed.x)+' кВт'}}},scales:{x:axis(),y:{grid:{display:false},ticks:{color:themeColor('soft')}}},maintainAspectRatio:false}});
  // table
  const top=[...ORDERS].sort((a,b)=>kw(b)-kw(a)).slice(0,8);
  o_tbody.innerHTML=top.map(o=>`<tr><td><b>${o.num}</b></td><td>${short(o.cust)}</td><td>${prod(o.prod).slice(0,26)}</td><td class="num"><b>${Math.round(kw(o))}</b></td><td>${o.prio}</td><td>${badge(o.status)}</td></tr>`).join('');
}

/* ============ PRODUCTION ============ */
function buildProduction(){
  const openOps=UCH.reduce((s,u)=>s+u.open,0);
  document.getElementById('pr_wip').textContent=active.length;
  document.getElementById('pr_ops').textContent=openOps;
  document.getElementById('pr_qc').textContent=7;
  document.getElementById('pr_ready').innerHTML=Math.round(active.reduce((s,o)=>s+o.ready,0)/active.length)+'<span class="u">%</span>';
  document.getElementById('pr_rts').textContent=ORDERS.filter(o=>o.readyShip).length;
  // участки
  charts.pu=new Chart(pr_uch,{type:'bar',data:{labels:UCH.map(u=>u.u),datasets:[
    {label:'Открыто',data:UCH.map(u=>u.open),backgroundColor:P.coral,barThickness:16},
    {label:'Выполнено',data:UCH.map(u=>u.done),backgroundColor:P.navy,barThickness:16}
  ]},options:{indexAxis:'y',plugins:{legend:{position:'top',align:'end',labels:{color:themeColor('soft')}}},scales:{x:{stacked:true,...axis()},y:{stacked:true,grid:{display:false},ticks:{color:themeColor('soft')}}},maintainAspectRatio:false}});
  // gantt
  buildGantt();
  // progress
  const act=[...active].sort((a,b)=>b.ready-a.ready);
  charts.pp=new Chart(pr_prog,{type:'bar',data:{labels:act.map(o=>o.num),datasets:[{data:act.map(o=>o.ready),backgroundColor:act.map(o=>o.ready>66?P.emer:o.ready>33?P.yellow:P.coral),borderRadius:3}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'% · '+act[c.dataIndex].cust.slice(0,20)}}},scales:{y:{max:100,...axis()},x:{grid:{display:false},ticks:{color:themeColor('soft'),font:{size:9}}}},maintainAspectRatio:false}});
  // op status
  const os={'Выполнена':293,'Ожидает':158,'На проверке ОТК':7,'В работе':2};
  charts.pos=new Chart(pr_opstat,{type:'doughnut',data:{labels:Object.keys(os),datasets:[{data:Object.values(os),backgroundColor:[P.navy,P.grey,P.coral,P.teal],borderWidth:2,borderColor:themeColor('tile')}]},options:{cutout:'60%',plugins:{legend:{position:'right',labels:{color:themeColor('soft')}}},maintainAspectRatio:false}});
}
function buildGantt(){
  const el=document.getElementById('pr_gantt');
  const rows=[...active].filter(o=>typeof o.daysLeft==='number').sort((a,b)=>a.daysLeft-b.daysLeft).slice(0,8);
  // scale: daysLeft from -35 .. +60
  const lo=-35,hi=60,span=hi-lo;
  const today=(0-lo)/span*100;
  let html=`<div class="gantt-months"><span></span><div class="gm"><span>−1 мес</span><span>сегодня</span><span>+1 мес</span><span>+2 мес</span></div></div>`;
  rows.forEach(o=>{
    const startD=Math.max(lo,o.daysLeft-25), endD=o.daysLeft;
    const left=(startD-lo)/span*100, w=Math.max(3,(endD-startD)/span*100);
    const col=o.overdue?P.red:o.ready>60?P.emer:o.daysLeft<7?P.coral:P.blue;
    html+=`<div class="gantt-row"><div class="g-lbl">${o.num} · ${fam(o.family)}</div><div class="gantt-track"><div class="gantt-bar" style="left:${left}%;width:${w}%;background:${col}">${o.ready}%</div></div></div>`;
  });
  html+=`<div style="position:relative;height:0"><div style="position:absolute;left:calc(140px + (100% - 140px)*${today/100});top:-${rows.length*23+6}px;height:${rows.length*23}px;border-left:2px dashed var(--red)"></div></div>`;
  el.innerHTML=html;
}

/* ============ RISK ============ */
function buildRisk(){
  const risk=active.filter(o=>o.overdue||(typeof o.daysLeft==='number'&&o.daysLeft<7));
  const riskKw=risk.reduce((s,o)=>s+kw(o),0);
  const overdue=ORDERS.filter(o=>o.overdue&&typeof o.daysLeft==='number');
  const soon=active.filter(o=>!o.overdue&&typeof o.daysLeft==='number'&&o.daysLeft>=0&&o.daysLeft<7);
  const avgLate=overdue.length?Math.round(overdue.reduce((s,o)=>s+Math.abs(o.daysLeft),0)/overdue.length):0;
  const set=(id,v)=>{const[n,u]=kwU(v);document.getElementById(id).innerHTML=n+'<span class="u">'+u+'</span>'};
  set('r_pw',riskKw);
  document.getElementById('r_late').textContent=overdue.length;
  document.getElementById('r_soon').textContent=soon.length;
  document.getElementById('r_days').textContent=avgLate;
  document.getElementById('r_rts').textContent=ORDERS.filter(o=>o.readyShip).length;
  const rs=[...risk].sort((a,b)=>kw(b)-kw(a)).slice(0,10);
  const col=o=>o.overdue?(o.daysLeft<-20?P.red:P.coral):P.yellow;
  charts.rb=new Chart(r_bar,{type:'bar',data:{labels:rs.map(o=>o.num),datasets:[{data:rs.map(o=>kw(o)),backgroundColor:rs.map(col),borderRadius:3}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>Math.round(c.parsed.x)+' кВт'}}},scales:{x:axis(),y:{grid:{display:false},ticks:{color:themeColor('soft')}}},maintainAspectRatio:false}});
  charts.rr=new Chart(r_ready,{type:'bar',data:{labels:overdue.slice(0,8).map(o=>o.num),datasets:[{data:overdue.slice(0,8).map(o=>o.ready),backgroundColor:overdue.slice(0,8).map(o=>o.ready>60?P.emer:o.ready>30?P.yellow:P.red),borderRadius:3,barThickness:22}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'% готовности'}}},scales:{y:{max:100,...axis()},x:{grid:{display:false},ticks:{color:themeColor('soft')}}},maintainAspectRatio:false}});
  r_tbody.innerHTML=rs.map(o=>{const dl=o.daysLeft;const dcol=dl<0?'color:var(--red);font-weight:700':dl<7?'color:var(--yellow);font-weight:600':'';
    return `<tr><td><b>${o.num}</b></td><td>${short(o.cust)}</td><td>${prod(o.prod).slice(0,28)}</td><td class="num">${Math.round(kw(o))}</td><td class="num" style="${dcol}">${dl}</td><td><span class="databar" style="width:${o.ready}px;background:${o.ready>60?P.emer:o.ready>30?P.yellow:P.red}"></span> ${o.ready}%</td><td style="color:var(--soft)">${(o.op||'—').slice(0,22)}</td></tr>`}).join('');
}

/* ============ router ============ */
const builders={overview:buildOverview,production:buildProduction,risk:buildRisk};
let current='overview';
function render(stage){destroyAll();builders[stage]();current=stage;}

document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.stage').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');document.getElementById('stage-'+t.dataset.stage).classList.add('active');
  render(t.dataset.stage);
  try{localStorage.setItem('teploros_analytics_layout',t.dataset.stage)}catch(e){}
}));

/* theme */
function setTheme(th){
  document.body.setAttribute('data-theme',th);
  document.querySelectorAll('[data-theme-opt]').forEach(o=>o.classList.toggle('on',o.dataset.themeOpt===th));
  try{localStorage.setItem('teploros_analytics_theme',th)}catch(e){}
  render(current); // перерисовать графики под цвета темы
}
document.querySelectorAll('[data-theme-opt]').forEach(o=>o.addEventListener('click',()=>setTheme(o.dataset.themeOpt)));

/* restore saved prefs */
let savedTheme='light',savedLayout='overview';
try{savedTheme=localStorage.getItem('teploros_analytics_theme')||'light';savedLayout=localStorage.getItem('teploros_analytics_layout')||'overview'}catch(e){}
document.body.setAttribute('data-theme',savedTheme);
document.querySelectorAll('[data-theme-opt]').forEach(o=>o.classList.toggle('on',o.dataset.themeOpt===savedTheme));
if(savedLayout!=='overview'){document.querySelector('.tab[data-stage="'+savedLayout+'"]')?.click();}
else render('overview');
window.addEventListener('resize',()=>render(current));
</script>
</body>
</html>
