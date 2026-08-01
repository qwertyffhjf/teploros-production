// teploros · core.js
// Автоматически извлечено из монолита

const { useState, useEffect, useRef, useMemo, useCallback, memo, createElement: h } = React;

// ==================== PWA: ловим beforeinstallprompt глобально (до монтирования React) ====================
window._pwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._pwaPrompt = e; });

// ==================== Константы ====================
// Цветовые токены — раньше читались через getComputedStyle() ОДИН РАЗ при
// загрузке core.js и замораживались в const. При переключении темы (☀️/🌙 в
// шапке, useTheme) меняется только CSS data-theme — чистый CSS (var(--x))
// подхватывает это мгновенно, а эти застывшие JS-константы — нет, отсюда
// нечитаемые цвета после смены режима без перезагрузки страницы.
// Теперь это просто строки var(--токен, fallback) — браузер резолвит их
// живьём на каждой отрисовке, никакого JS-кеширования цвета больше нет.
const AM  = 'var(--c-am,  #EF9F27)', AM2 = 'var(--c-am2, #412402)';
const AM3 = 'var(--c-am3, #FAEEDA)', AM4 = 'var(--c-am4, #BA7517)';
const GN  = 'var(--c-gn,  #1D9E75)', GN2 = 'var(--c-gn2, #04342C)', GN3 = 'var(--c-gn3, #E1F5EE)';
const RD  = 'var(--c-rd,  #E24B4A)', RD2 = 'var(--c-rd2, #501313)', RD3 = 'var(--c-rd3, #FCEBEB)';
const BL  = 'var(--c-bl,  #378ADD)';

const PRIORITY = {
  low: { label: 'Низкий', color: 'var(--muted)' },
  medium: { label: 'Средний', color: BL },
  high: { label: 'Высокий', color: AM },
  critical: { label: 'Критический', color: RD }
};

const STATUS = {
  // Glass: статусы читают CSS-токены → корректны в обеих темах и меняются на лету
  pending:     { label: 'Ожидает',     bg: 'var(--st-pending-bg)', cl: 'var(--st-pending-cl)', br: 'var(--st-pending-br)' },
  in_progress: { label: 'В работе',    bg: 'var(--st-run-bg)',     cl: 'var(--st-run-cl)',     br: 'var(--st-run-br)', cls: 'badge-in-progress' },
  on_check:    { label: 'На контроле', bg: 'var(--st-chk-bg)',     cl: 'var(--st-chk-cl)',     br: 'var(--st-chk-br)' },
  done:        { label: 'Выполнено',   bg: 'var(--st-ok-bg)',      cl: 'var(--st-ok-cl)',      br: 'var(--st-ok-br)', cls: 'op-done' },
  defect:      { label: 'Брак',        bg: 'var(--st-al-bg)',      cl: 'var(--st-al-cl)',      br: 'var(--st-al-br)' },
  rework:      { label: 'Переделка',   bg: 'var(--st-warn-bg)',    cl: 'var(--st-warn-cl)',    br: 'var(--st-warn-br)' },
  shipped:     { label: 'Отгружен',    bg: 'var(--st-ok-bg)',      cl: 'var(--st-ok-cl)',      br: 'var(--st-ok-br)' },
};

const OPERATION_STAGES = [
  'Снабжение комплектующими','Раскрой','Сварка крышек','Заполнение крышек',
  'Вальцовка обечайки','Раскрой жаровых труб','Сборка/сварки топки',
  'Сборка/сварка котла','Установка/сварка жаровых труб','Опрессовка',
  'Предварительный окрас','Установка кожуха','Установка крышек','Финишный окрас'
];

const WORKER_STATUS = {
  working: { label: 'На смене', bg: GN3, cl: GN2, br: GN },
  absent: { label: 'Отсутствует', bg: 'var(--st-pending-bg)', cl: '#666', br: '#ccc' },
  sick: { label: 'Больничный', bg: RD3, cl: RD2, br: RD },
  vacation: { label: 'Отпуск', bg: '#E6F1FB', cl: '#042C53', br: BL }
};

// ==================== Категории вспомогательных работ ====================
const AUX_CATEGORIES = [
  { id: 'maintenance', label: '🔧 Обслуживание оборудования', names: ['Профилактика оборудования', 'Ремонт оборудования', 'Смазка механизмов', 'Замена расходников'] },
  { id: 'cleaning', label: '🧹 Уборка / порядок', names: ['Уборка рабочего места', 'Уборка цеха', 'Уборка территории', 'Вынос отходов'] },
  { id: 'logistics', label: '📦 Перемещение / логистика', names: ['Перемещение заготовок', 'Разгрузка материалов', 'Подготовка комплектующих', 'Складские работы'] },
  { id: 'setup', label: '⚙ Наладка / подготовка', names: ['Наладка станка', 'Подготовка оснастки', 'Переналадка', 'Пробный запуск'] },
  { id: 'other', label: '📝 Прочее', names: [] },
];
const AUX_CAT_LABELS = Object.fromEntries(AUX_CATEGORIES.map(c => [c.id, c.label]));

// ==================== Достижения ====================
const ACHIEVEMENTS = {
  first_op: { icon: '⭐', title: 'Первая операция', desc: 'Выполнена первая операция', condition: (s) => s.doneCount >= 1 },
  ops_10: { icon: '🔧', title: 'Десятка', desc: 'Выполнено 10 операций', condition: (s) => s.doneCount >= 10 },
  ops_50: { icon: '⚙️', title: 'Профессионал', desc: 'Выполнено 50 операций', condition: (s) => s.doneCount >= 50 },
  ops_100: { icon: '🏆', title: 'Стахановец', desc: 'Выполнено 100 операций', condition: (s) => s.doneCount >= 100 },
  ops_500: { icon: '👑', title: 'Ветеран', desc: 'Выполнено 500 операций', condition: (s) => s.doneCount >= 500 },
  quality_star: { icon: '💎', title: 'Безупречное качество', desc: 'Более 50 операций, брак менее 1%', condition: (s) => s.doneCount >= 50 && s.defectRate < 1 },
  weld_master: { icon: '🔥', title: 'Мастер сварки', desc: '50 сварочных операций', condition: (s) => s.weldCount >= 50 },
  speed_demon: { icon: '⚡', title: 'Скоростной монтаж', desc: 'Среднее время на 20% быстрее плана (мин. 10 операций)', condition: (s) => s.doneWithPlan >= 10 && s.avgRatio < 0.8 },
  no_downtime: { icon: '🛡️', title: 'Нет простоям', desc: '0 простоев за 30 дней (минимум 5 операций)', condition: (s) => s.downtimes30d === 0 && s.doneCount >= 5 && s.doneCount7d >= 1 },
  streak_5: { icon: '🎯', title: 'Серия 5', desc: '5 операций подряд без брака', condition: (s) => s.currentStreak >= 5 },
  streak_20: { icon: '🎪', title: 'Серия 20', desc: '20 операций подряд без брака', condition: (s) => s.currentStreak >= 20 },
  multi_skill: { icon: '🌟', title: 'Универсал', desc: 'Выполнял 5+ разных типов операций', condition: (s) => s.uniqueOpTypes >= 5 },
  detective_10: { icon: '🔍', title: 'Бдительный', desc: 'Обнаружил 10 браков на предыдущих этапах', condition: (s) => s.detectedDefects >= 10 },
  thanks_5: { icon: '🤝', title: 'Спасибо, коллега!', desc: 'Получил 5 благодарностей', condition: (s) => s.thanksReceived >= 5 },
  golden_hands_100: { icon: '🪙', title: 'Золотые руки', desc: '100 операций без брака', condition: (s) => s.doneCount >= 100 && s.defectCount === 0 },
  universal_2_3: { icon: '🔄', title: 'Универсал 2.0', desc: 'Работал на 3+ разных участках', condition: (s) => s.uniqueSections >= 3 },
  weekend_5: { icon: '🌙', title: 'Трудоголик', desc: '5 операций в выходные дни', condition: (s) => s.weekendOps >= 5 },
  virtuoso_10: { icon: '🎻', title: 'Виртуоз', desc: '10 операций быстрее 50% плана', condition: (s) => s.fastOps >= 10 },
  no_downtime_7: { icon: '🛡️', title: 'Антипростой', desc: '7 дней без простоев (минимум 3 операции за неделю)', condition: (s) => s.downtimes7d === 0 && s.doneCount7d >= 3 },
  speed_streak_5: { icon: '🚀', title: 'Скоростной рывок', desc: '5 операций подряд быстрее плана на 20%', condition: (s) => s.bestSpeedStreak >= 5 }
};

const getWorkerLevel = (doneCount) => Math.floor(doneCount / 10) + 1;
const getLevelProgress = (doneCount) => (doneCount % 10) / 10;
const getLevelTitle = (level) => {
  if (level >= 50) return 'Легенда';
  if (level >= 30) return 'Мастер';
  if (level >= 20) return 'Эксперт';
  if (level >= 10) return 'Профессионал';
  if (level >= 5) return 'Опытный';
  if (level >= 3) return 'Работник';
  return 'Новичок';
};

const calcWorkerStats = (workerId, data, nowTime) => {
  const t = nowTime || Date.now();
  const d30 = t - 30 * 86400000;
  const d7 = t - 7 * 86400000;
  
  // Один проход по ops
  let doneCount = 0, defectCount = 0, weldCount = 0, doneWithPlan = 0, detectedDefects = 0, doneCount7d = 0, weekendOps = 0, fastOps = 0;
  let sumRatio = 0;
  const doneOps = [], defectOps = [], withPlan = [];
  
  for (const op of data.ops) {
    if (!op.workerIds?.includes(workerId)) continue;
    
    if (op.status === 'done') {
      doneOps.push(op);
      doneCount++;
      if (op.finishedAt >= d7) doneCount7d++;
      if (op.name?.toLowerCase().includes('свар')) weldCount++;
      if (op.plannedHours && op.startedAt && op.finishedAt) {
        withPlan.push(op);
        doneWithPlan++;
        const actual = op.finishedAt - op.startedAt;
        const planned = op.plannedHours * 3600000;
        sumRatio += actual / planned;
        if (actual < planned * 0.5) fastOps++;
      }
      if (op.finishedAt) {
        const d = new Date(op.finishedAt);
        if (d.getDay() === 0 || d.getDay() === 6) weekendOps++;
      }
    } else if (op.status === 'defect') {
      defectOps.push(op);
      defectCount++;
    }
    
    if (op.defectSource === 'previous_stage') detectedDefects++;
  }
  
  const total = doneCount + defectCount;
  const defectRate = total > 0 ? (defectCount / total * 100) : 0;
  const avgRatio = doneWithPlan > 0 ? sumRatio / doneWithPlan : 1;
  
  // События (фильтруем только нужные)
  let downtimes30d = 0, downtimes7d = 0, thanksReceived = 0;
  for (const e of data.events) {
    if (e.workerId === workerId && e.type === 'downtime') {
      if (e.ts >= d30) downtimes30d++;
      if (e.ts >= d7) downtimes7d++;
    }
    if (e.type === 'thanks' && e.toWorkerId === workerId) thanksReceived++;
  }
  
  // Стреки (нужны отсортированные ops)
  const sorted = [...doneOps, ...defectOps].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  let currentStreak = 0;
  for (const op of sorted) { if (op.status === 'done') currentStreak++; else break; }
  
  // Уникальные значения
  const uniqueOpTypes = new Set(doneOps.map(op => op.name)).size;
  const uniqueSections = new Set(doneOps.map(op => op.sectionId).filter(id => id)).size;
  
  // Лучший стрик скорости
  const withPlanSorted = [...withPlan].sort((a, b) => a.finishedAt - b.finishedAt);
  let bestSpeedStreak = 0, currentSpeedStreak = 0;
  for (const op of withPlanSorted) {
    const actual = op.finishedAt - op.startedAt;
    const planned = op.plannedHours * 3600000;
    if (actual < planned * 0.8) { currentSpeedStreak++; if (currentSpeedStreak > bestSpeedStreak) bestSpeedStreak = currentSpeedStreak; }
    else currentSpeedStreak = 0;
  }
  
  return { doneCount, defectCount, defectRate, weldCount, doneWithPlan, avgRatio, downtimes30d, downtimes7d, doneCount7d, currentStreak, uniqueOpTypes, detectedDefects, thanksReceived, uniqueSections, weekendOps, fastOps, bestSpeedStreak };
};

const checkAchievements = (workerId, data) => {
  const worker = data.workers.find(w => w.id === workerId);
  // Возвращает { data, justEarned: [] } — всегда, даже если ничего не заработано
  if (!worker) return { data, justEarned: [] };

  const nowTime = Date.now();
  const stats   = calcWorkerStats(workerId, data, nowTime);

  // FIX: используем Set для O(1) lookup и защиты от дублей из Firebase
  const currentSet = new Set(worker.achievements || []);
  const justEarned = [];

  // Итерируем в фиксированном порядке ключей ACHIEVEMENTS
  for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
    if (!currentSet.has(id) && ach.condition(stats)) {
      currentSet.add(id);
      justEarned.push(id);
    }
  }

  if (justEarned.length === 0) return { data, justEarned: [] };

  const newAchArray = [...currentSet]; // порядок: старые + новые
  let d = {
    ...data,
    workers: data.workers.map(w =>
      w.id === workerId ? { ...w, achievements: newAchArray } : w
    ),
  };

  // Публикация в чат — одно сообщение на достижение
  const achMessages = justEarned.map(aid => ({
    id: uid(), senderId: 'system', senderName: 'Система', senderRole: 'system',
    text: `${ACHIEVEMENTS[aid].icon} ${worker.name} получил награду «${ACHIEVEMENTS[aid].title}»! ${ACHIEVEMENTS[aid].desc}`,
    type: 'achievement', timestamp: nowTime,
  }));
  d.messages = [...(d.messages || []), ...achMessages].slice(-200);

  return { data: d, justEarned };
};

// ==================== Автоподбор исполнителя (уровень, опыт, качество, загрузка) ====================
// Итерация 3.2: строит индекс Map<workerId, Op[]> за один проход по data.ops.
// Раньше scoreWorkerForOp делал 4 полных прохода по data.ops НА КАЖДОГО кандидата,
// а getAssignmentRecommendations вызывал его для каждого рабочего × каждой pending-
// операции — квадратичная сложность. Индекс строится один раз и переиспользуется.
const buildOpsByWorkerIndex = (data) => {
  const idx = new Map();
  for (const op of data.ops) {
    if (!op.workerIds) continue;
    for (const wid of op.workerIds) {
      let arr = idx.get(wid);
      if (!arr) { arr = []; idx.set(wid, arr); }
      arr.push(op);
    }
  }
  return idx;
};

// scoreWorkerForOp(worker, opName, data, opsByWorker?)
// opsByWorker — опциональный предвычисленный индекс из buildOpsByWorkerIndex(data).
// Если не передан — строится локально (обратная совместимость для одиночных вызовов).
const scoreWorkerForOp = (worker, opName, data, opsByWorker) => {
  const wid = worker.id;
  // Берём операции рабочего из индекса (O(1)) вместо фильтрации всех ops (O(n)).
  const allOps = opsByWorker
    ? (opsByWorker.get(wid) || [])
    : data.ops.filter(op => op.workerIds?.includes(wid));

  // Один проход по операциям рабочего вместо 4 отдельных filter().
  let doneThisTypeCount = 0, defectThisTypeCount = 0, activeCount = 0, allDone = 0;
  const withPlan = [];
  for (const op of allOps) {
    const isThisType = op.name === opName;
    if (op.status === 'done') {
      allDone++;
      if (isThisType) {
        doneThisTypeCount++;
        if (op.plannedHours && op.startedAt && op.finishedAt) withPlan.push(op);
      }
    } else if (op.status === 'defect') {
      if (isThisType) defectThisTypeCount++;
    }
    if (op.status === 'in_progress' || op.status === 'pending') activeCount++;
  }
  const level = getWorkerLevel(allDone);

  // Опыт по этому типу операции (0-30 баллов)
  const expScore = Math.min(doneThisTypeCount * 2, 30);
  // Качество по этому типу (0-25 баллов)
  const total = doneThisTypeCount + defectThisTypeCount;
  const qualityScore = total > 0 ? Math.round((doneThisTypeCount / total) * 25) : 12;
  // Скорость: средний факт/план (0-20 баллов)
  const avgRatio = withPlan.length > 0 ? withPlan.reduce((s, op) => s + (op.finishedAt - op.startedAt) / (op.plannedHours * 3600000), 0) / withPlan.length : 1;
  const speedScore = Math.max(0, Math.round((2 - avgRatio) * 10));
  // Уровень (0-15 баллов)
  const levelScore = Math.min(level, 15);
  // Загрузка (штраф: -10 за каждую активную задачу)
  const loadPenalty = activeCount * 10;

  return { workerId: wid, workerName: worker.name, level, expScore, qualityScore, speedScore, levelScore, loadPenalty,
    totalScore: expScore + qualityScore + speedScore + levelScore - loadPenalty,
    details: { experience: doneThisTypeCount, defects: defectThisTypeCount, avgRatio: Math.round(avgRatio * 100), activeOps: activeCount }
  };
};

// 💰 Себестоимость заказа: материалы + рабочая сила
const calcOrderCostDetail = (data, orderId) => {
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return { error: 'Заказ не найден' };
  
  // Материалы: материал.цена × количество
  let materialCost = 0;
  (order.materialList || []).forEach(m => {
    const material = data.materials?.find(mat => mat.id === m.materialId);
    if (material && m.qty) {
      materialCost += (material.unitPrice || 0) * m.qty;
    }
  });
  
  // Рабочая сила: сумма (часы × ставка) по каждому сотруднику
  let laborCost = 0;
  const ops = data.ops.filter(op => op.orderId === orderId && !op.archived && op.status === 'done');
  const workerHours = {}; // workerId -> часы
  
  ops.forEach(op => {
    if (op.workerIds) {
      const opHours = op.finishedAt && op.startedAt ? (op.finishedAt - op.startedAt) / 3600000 : (op.plannedHours || 0);
      op.workerIds.forEach(wid => {
        workerHours[wid] = (workerHours[wid] || 0) + opHours;
      });
    }
  });
  
  Object.entries(workerHours).forEach(([wid, hours]) => {
    const worker = data.workers?.find(w => w.id === wid);
    if (worker) {
      const rate = worker.hourlyRate || 200; // дефолт 200 руб/час
      laborCost += hours * rate;
    }
  });
  
  const totalCost = materialCost + laborCost;
  const profit = (order.price || 0) - totalCost;
  const margin = order.price > 0 ? Math.round((profit / order.price) * 100) : 0;
  
  return { orderId, materialCost: Math.round(materialCost), laborCost: Math.round(laborCost), totalCost: Math.round(totalCost), price: order.price, profit: Math.round(profit), margin, opsCount: ops.length, workerCount: Object.keys(workerHours).length };
};

// 📊 Отчёт себестоимости: все заказы с рентабельностью
const getCostReport = (data) => {
  const orders = data.orders.filter(o => !o.archived && o.status === 'done');
  return orders.map(order => calcOrderCostDetail(data, order.id))
    .filter(r => !r.error)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 50);
};

// 🔧 Установить ставку сотрудника (руб/час)
const setWorkerRate = async (data, workerId, hourlyRate, onUpdate) => {
  const worker = data.workers.find(w => w.id === workerId);
  if (!worker) return false;
  
  const d = { ...data, workers: data.workers.map(w => w.id === workerId ? { ...w, hourlyRate } : w) };
  await DB.save(d);
  onUpdate(d);
  return true;
};

const autoAssignWorker = (data, opName) => {
  const anyHasCompetences = data.workers.some(w => !w.archived && w.competences?.length > 0);
  const candidates = data.workers.filter(w =>
    !w.archived &&
    isWorkerOnShift(w, data.timesheet) &&
    (anyHasCompetences ? w.competences?.includes(opName) : true) &&
    !data.ops.some(op => op.status === 'in_progress' && op.workerIds?.includes(w.id))
  );
  if (candidates.length === 0) return null;
  // Итерация 3.2: индекс строится один раз для всех кандидатов
  const opsByWorker = buildOpsByWorkerIndex(data);
  const scored = candidates.map(w => scoreWorkerForOp(w, opName, data, opsByWorker)).sort((a, b) => b.totalScore - a.totalScore);
  return scored[0]?.workerId || null;
};

// Рекомендации по всем ожидающим операциям
const getAssignmentRecommendations = (data) => {
  const pendingOps = data.ops.filter(op => op.status === 'pending' && !op.archived && (!op.workerIds || op.workerIds.length === 0));
  // Итерация 3.2: индекс ops по рабочим строится ОДИН раз, а не заново для
  // каждого scoreWorkerForOp внутри двойного цикла.
  const opsByWorker = buildOpsByWorkerIndex(data);
  const anyHasCompetences = data.workers.some(w => !w.archived && w.competences?.length > 0);
  const activeWorkers = data.workers.filter(w => !w.archived && isWorkerOnShift(w, data.timesheet));

  return pendingOps.map(op => {
    const order = data.orders.find(o => o.id === op.orderId);

    const qualified = activeWorkers
      .filter(w => !anyHasCompetences || w.competences?.includes(op.name))
      .map(w => ({ ...scoreWorkerForOp(w, op.name, data, opsByWorker), hasAccess: true }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const others = activeWorkers
      .filter(w => anyHasCompetences && !w.competences?.includes(op.name))
      .map(w => ({ ...scoreWorkerForOp(w, op.name, data, opsByWorker), hasAccess: false }))
      .sort((a, b) => a.workerName.localeCompare(b.workerName, 'ru'));

    const scored = [...qualified, { divider: true }, ...others].filter(Boolean);

    return { opId: op.id, opName: op.name, orderNumber: order?.number || '—', orderPriority: order?.priority || 'medium', deadline: order?.deadline, candidates: scored };
  }).sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return (prio[a.orderPriority] || 4) - (prio[b.orderPriority] || 4);
  });
};

// ==================== Утилиты ====================
// Генератор ID: используем crypto.randomUUID (современные браузеры) с fallback на UUID-подобный формат
// КРИТИЧНЫЕ ИЗМЕНЕНИЯ (Итерация 1.1):
//   - Старый uid() выдавал 6 символов base-36 (~2.18B вариантов) → коллизии при 6k+ записей
//   - Новый uid() выдаёт 36 символов UUID → 2^128 ≈ 3.4×10^38 вариантов → коллизии практически невозможны
const uid = (() => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Современные браузеры (Chrome 92+, Firefox 76+, Safari 15.1+)
    return () => crypto.randomUUID();
  }
  // Fallback: UUID v4-подобный формат вручную (для старых браузеров/мобильных)
  // Формат: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (где x = random, y = random с битом версии)
  return () => {
    const segments = [];
    // Создаём 16 случайных байтов
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    // UUID v4: установить version bits (4) в позиции 7, variant bits (2) в позиции 9
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    // Форматируем как строку xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    for (let i = 0; i < 16; i++) {
      const hex = bytes[i].toString(16).padStart(2, '0');
      if (i === 4 || i === 6 || i === 8 || i === 10) segments.push('-');
      segments.push(hex);
    }
    return segments.join('');
  };
})();
const now = () => Date.now();
// Вынесена общая функция смены
const getCurrentShift = () => {
  const d = new Date();
  return `${d.toISOString().slice(0,10)}-${Math.floor(d.getHours() / 8) + 1}`;
};
const fmtDur = (ms) => {
  if (!ms || ms <= 0) return '—';
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return hh > 0 ? `${hh}ч ${mm}м` : mm > 0 ? `${mm}м ${ss}с` : `${ss}с`;
};
const isShipmentNear = (deadline) => {
  if (!deadline) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - today;
  const diffDays = Math.ceil(diffTime / (1000*60*60*24));
  return diffDays <= 2 && diffDays >= 0;
};
// Хэширование PIN (DJB2 + salt)
const hashPin = (pin) => {
  if (!pin) return '';
  if (pin.startsWith('H_')) return pin;
  let h = 5381;
  const s = 'teploros_nt_' + pin;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return 'H_' + (h >>> 0).toString(36).toUpperCase();
};
const pinMatch = (input, stored) => {
  if (!stored || !input) return false;
  if (stored.startsWith('H_')) return hashPin(input) === stored;
  return input === stored; // обратная совместимость
};

// ==================== Firebase ====================
// ⚠️ SECURITY: ВНИМАНИЕ — применены Firebase Security Rules (Итерация 1.2)
// Смотри FIREBASE_SECURITY_RULES.txt в корне проекта.
// Доступ ограничен только аутентифицированными пользователями (Anonymous Auth).

// Защита: если Firebase CDN не загрузился — не крашим весь core.js. DOC_REF
// останется null, DB.load() бросит OFFLINE-ошибку, App покажет блокирующий экран.
if (typeof firebase === 'undefined') {
  console.warn('Firebase CDN не загрузился — приложение покажет экран «Нет соединения»');
} else {
firebase.initializeApp({
  apiKey: "AIzaSyAR4Hvt4I80tbQKI2HLTKM8rbLSas2QFDw",
  authDomain: "teploros-11774.firebaseapp.com",
  projectId: "teploros-11774",
  storageBucket: "teploros-11774.firebasestorage.app",
  messagingSenderId: "151146225873",
  appId: "1:151146225873:web:f37d7ce9f9859dcb5de5f0"
});

// ── Инициализация Firebase Auth (Anonymous) — Итерация 1.2 (с ожиданием загрузки) ────
// Каждый пользователь автоматически входит анонимно. Это позволяет применить
// Security Rules `allow read, write: if request.auth != null`.
// В будущем (Этап 2-3): будут использованы PIN-токены или SMS-верификация.
// 
// ВАЖНО: firebase.auth может загружаться асинхронно с CDN. Ждём его до 10 секунд.
// Если не загрузился — приложение всё равно работает (auth опционален пока Rules не строгие).
let _authInitAttempts = 0;
const MAX_AUTH_ATTEMPTS = 20; // 20 × 500мс = 10 секунд максимум
const initializeFirebaseAuth = () => {
  if (typeof firebase === 'undefined') {
    // Firebase core не загрузился вообще — auth не нужен
    return;
  }
  
  if (typeof firebase.auth !== 'function') {
    // firebase.auth ещё не готов (CDN загружается) — ждём
    _authInitAttempts++;
    if (_authInitAttempts >= MAX_AUTH_ATTEMPTS) {
      console.warn('[Firebase Auth] Auth SDK не загрузился за 10 сек — работаем без auth. ' +
                   'Приложение функционирует, но Security Rules требуют auth. ' +
                   'Проверьте подключение firebase-auth-compat.js.');
      return; // Прекращаем попытки, приложение работает дальше
    }
    setTimeout(initializeFirebaseAuth, 500);
    return;
  }
  
  // firebase.auth готов — инициализируем
  const auth = firebase.auth();
  auth.onAuthStateChanged((user) => {
    if (!user) {
      // Нет пользователя — входим анонимно
      auth.signInAnonymously().catch((err) => {
        console.warn('[Firebase Auth] Anonymous login failed:', err.code, err.message);
        // Не блокируем — приложение работает из кэша
      });
    } else {
      console.log('[Firebase Auth] Logged in as', user.uid.slice(0, 8) + '...');
    }
  });
};

// Запустить инициализацию (функция сама ждёт если нужно, но не дольше 10 сек)
initializeFirebaseAuth();
}
const firestore = typeof firebase !== 'undefined' ? firebase.firestore() : null;
// ── ONLINE-ONLY режим ───────────────────────────────────────────────────────
// Локальная персистентность Firestore (IndexedDB) в compat SDK не включается
// без явного enablePersistence() — а мы его не вызываем. Дополнительно online-
// only обеспечивается тем, что onSnapshot игнорирует снапшоты fromCache, а
// DB.load/save не используют localStorage-кэш данных. Настройки SDK НЕ трогаем:
// вызов firestore.settings() вызывал предупреждение "overriding the original
// host" и не был нужен для online-only.
if (firestore) {
  // Чистим любую IndexedDB-персистентность, оставшуюся от прежних версий,
  // где мог вызываться enablePersistence. Молча — если БД занята, не критично.
  try {
    if (firestore.clearPersistence) firestore.clearPersistence().catch(() => {});
  } catch(e) {}
}
const DOC_REF    = firestore ? firestore.collection('app').doc('production_v14') : null;
const WH_DOC_REF = firestore ? firestore.collection('app').doc('warehouse_v1') : null;   // Склад — отдельный документ
const TS_DOC_REF = firestore ? firestore.collection('app').doc('timesheet_v1') : null;  // Табель — отдельный документ (Итерация 6.2)
const EV_DOC_REF = firestore ? firestore.collection('app').doc('events_v1') : null;    // События — отдельный документ (Итерация 6.1)
const PRESENCE_REF = firestore ? firestore.collection('presence') : null;
const BACKUP_REF = firestore ? firestore.collection('app_backups') : null; // Реальные снапшоты для восстановления (не метаданные)

// Поля которые живут в warehouse_v1 (не в production_v14)
const WH_FIELDS = ['materials','bomTemplates','materialConsumptions','materialReservations','materialDeliveries','equipment'];
// Поля которые живут в timesheet_v1 (не в production_v14) — Итерация 6.2
const TS_FIELDS = ['timesheet'];
// Поля которые живут в events_v1 (не в production_v14) — Итерация 6.1
const EV_FIELDS = ['events'];

// ==================== Presence (онлайн пользователи) ====================
const Presence = {
  _id: null,
  start(userId, userName) {
    if (!userId || !PRESENCE_REF) return;
    this._id = userId;
    const ref = PRESENCE_REF.doc(userId);
    const update = () => ref.set({ userId, userName: userName || '?', lastSeen: Date.now(), online: true }).catch(() => {});
    update();
    this._interval = setInterval(update, 30000); // ping каждые 30 сек
    // При закрытии страницы
    window.addEventListener('beforeunload', () => {
      ref.set({ userId, userName, lastSeen: Date.now(), online: false }).catch(() => {});
      clearInterval(this._interval);
    });
  },
  async getOnline() {
    try {
      if (!PRESENCE_REF) return [];
      const snap = await PRESENCE_REF.get();
      const threshold = Date.now() - 60000; // 60 сек
      return snap.docs.map(d => d.data()).filter(u => u.online && u.lastSeen > threshold);
    } catch { return []; }
  }
};

const EMPTY_DATA = {
  orders: [], ops: [], workers: [], downtimeTypes: [], events: [], materials: [], sections: [], equipment: [],
  bomTemplates: [], materialConsumptions: [], productionStages: [], defectReasons: [], workerAvailabilities: [], timesheet: {},
  instructions: [],   // инструктажи ОТ: [{id, workerId, type, date, nextDate, conductedBy, note}]
  vacations: [],      // плановые отпуска: [{id, workerId, startDate, endDate, approved, note}]
  opNorms: {},        // нормы операций: {opName: {planned: N, samples: N, totalMs: N}}
  toolIssues: [],     // выдача инструмента: [{id, toolName, invNumber, cost, category,
                        //   workerId, issuedAt, issuedBy, issuedNote, condition:'new'|'good'|'worn',
                        //   returnedAt, returnedBy, returnedNote, returnCondition, status:'active'|'returned'|'written_off'}]
  pieceworkRates: [], // сдельные расценки: [{id, type:'v2d'|'v3d', powerMin, powerMax, heatExchanger, coverFront, coverBack, rolling}]
  extraWorks: [],     // каталог допрасценок (от прайса или вручную):
                       // [{id, key:'tube_sheet_joint'|'furnace_joint'|'duplex_piping'|..., name, paramLabel, paramUnit,
                       //   tiers:[{min,max,price}], source:'price'|'manual'}]
  auxStats: {},       // агрегация вспомогательных работ: {"YYYY-MM": {total, totalMs, byCategory:{cat:{count,ms}}, byWorker:{wid:{count,ms}}}}
  messages: [], reclamations: [], duels: [], materialReservations: [], defects: [],
  pressureTests: [],   // протоколы гидравлических испытаний
  materialDeliveries: [],  // поставки материалов: [{id, orderId, materialId, stageName, requiredQty, deliveredQty, unit, status, confirmedAt, confirmedBy}]
  // components хранятся внутри каждого order: order.components = [{id, name, qty, unit, code, price, status}]
  settings: {
    // Единый PIN-вход: все роли входят по PIN (хеши DJB2, дефолтные значения: 0000, 1111, 2222, 3333, 4444, 5555, 6666, 7777)
    masterPin: 'H_18D7OAL',
    controllerPin: 'H_18D8GW1',
    warehousePin: 'H_18D99HH',
    pdoPin: 'H_18DA22X',
    directorPin: 'H_18DAUOD',
    hrPin: 'H_18DBN9T',
    shopMasterPin: 'H_18DCFV9',
    adminPin: 'H_18DD8GP',
    masterKey: 'H_18DETNL',       // Мастер-ключ: сброс PIN (дефолт: 9999), сменить при первом запуске
    welcomeTitle: 'teploros', welcomeSubtitle: 'надежная техника',
    welcomeLabel: 'Производственный учёт · НТ',
    labelWidth: 50,    // ширина этикетки мм
    labelHeight: 35,    // высота этикетки мм
    loginWidgets: ['activeOrders', 'onCheck', 'freeWorkers'], // показатели смены на экране входа (см. LOGIN_WIDGETS)
    productTypes: [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }]
  }
};

// Каталог показателей для левой панели экрана входа (LoginScreen) —
// админ выбирает до 3 штук в разделе "Экран входа" (reference.js).
// id должен совпадать с ключом, который вычисляет LoginScreen в app.js.
// icon/tone — для визуального веса карточки (см. виджеты в HR/Master —
// иконка + цветовой акцент вместо голого числа на белом фоне).
// tone: 'brand' | 'ok' | 'warn' | 'al' | 'chk' | 'run' — совпадает с --st-* токенами.
const LOGIN_WIDGETS = [
  { id: 'activeOrders',      label: 'Заказов в работе',            icon: '📦', tone: 'run'   },
  { id: 'onCheck',           label: 'На контроле ОТК',              icon: '🔍', tone: 'chk'   },
  { id: 'doneToday',         label: 'Выполнено сегодня',            icon: '✅', tone: 'ok'    },
  { id: 'defectsToday',      label: 'Брак/переделка сегодня',       icon: '⚠️', tone: 'al'    },
  { id: 'freeWorkers',       label: 'Свободные сотрудники',         icon: '👷', tone: 'ok'    },
  { id: 'criticalMaterials', label: 'Критичные остатки материалов', icon: '📉', tone: 'warn'  },
  { id: 'downtimeToday',     label: 'Простои сегодня, мин',         icon: '⏱️', tone: 'warn'  },
  { id: 'nearestDeadline',   label: 'Ближайший дедлайн, дн',        icon: '📅', tone: 'al'    },
  { id: 'onlineNow',         label: 'Сейчас онлайн',                icon: '🟢', tone: 'brand' },
];

const CACHE_KEY    = 'prod_app_v14_cache';
const WH_CACHE_KEY = 'prod_wh_v1_cache';   // Кэш склада
const CACHE_TTL    = 12 * 3600000;  // 12 часов
const QUEUE_KEY    = 'prod_app_v14_queue'; // офлайн-очередь
const VERSION_KEY  = 'prod_app_v14_version'; // версия для optimistic locking
const ARCHIVE_COLL = 'production_archive';   // Firestore коллекция архива

// Очистка мусорных ключей localStorage
const cleanStaleLocalStorageKeys = () => {
  try {
    const staleThreshold = Date.now() - 30 * 86400000;
    const prefixes = ['chat_lastRead_', 'worker_level_'];
    Object.keys(localStorage).forEach(k => {
      if (prefixes.some(p => k.startsWith(p))) {
        const val = Number(localStorage.getItem(k));
        if (val && val < staleThreshold) localStorage.removeItem(k);
      }
    });
  } catch(e) {}
};




// ==================== Сдельная оплата ====================
// Найти расценку для котла по типу и мощности
const findPieceworkRate = (data, boilerType, powerKw) => {
  const rates = data.pieceworkRates || [];
  if (!rates.length || !boilerType || !powerKw) return null;
  return rates.find(r =>
    r.type === boilerType &&
    powerKw >= (r.powerMin || 0) &&
    powerKw <= (r.powerMax || Infinity)
  ) || null;
};

// Рассчитать сдельный заработок рабочего за заказ
// Возвращает { heatExchanger: N, coverFront: N, coverBack: N, rolling: N, total: N }
// skipFields — Set полей ('heatExchanger'|'coverFront'|'coverBack'|'rolling'), которые
// уже посчитаны через op.earning и не должны учитываться повторно (см. PayrollExport
// в hr.js). Без этого параметра функция считает по всему заказу с нуля — что раньше
// приводило либо к задвоению (если считать всегда), либо к недоплате (если пропускать
// весь заказ при частичном покрытии) — найдено при аудите.
const calcPieceworkEarnings = (data, workerId, orderId, skipFields = null) => {
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return null;

  const boilerType  = order.boilerType || null;   // 'v2d' | 'v3d'
  const powerKw     = order.powerKw || 0;
  const qty         = order.qty || 1;
  const rate        = findPieceworkRate(data, boilerType, powerKw);
  if (!rate) return null;

  const sections = data.sections || [];
  const orderOps = data.ops.filter(o => o.orderId === orderId && !o.archived);

  // Считаем по pieceworkField участка (новая логика)
  const calcByField = (field) => {
    if (skipFields && skipFields.has(field)) return 0;
    if (!rate[field]) return 0;
    // Находим все участки с этим pieceworkField
    const fieldSections = sections.filter(s =>
      s.pieceworkField === field && (s.payType === 'piecework' || s.payType === 'mixed')
    );
    if (!fieldSections.length) return 0;
    let total = 0;
    fieldSections.forEach(sec => {
      const sectionOps = orderOps.filter(o => o.sectionId === sec.id);
      const workerSet = new Set();
      sectionOps.forEach(op => (op.workerIds||[]).forEach(wid => workerSet.add(wid)));
      if (workerSet.has(workerId) && workerSet.size > 0) {
        total += Math.round(rate[field] * qty / Math.max(workerSet.size, 1));
      }
    });
    return total;
  };

  // Обратная совместимость: если pieceworkField не настроен — fallback на ключевые слова
  const hasFieldConfig = sections.some(s => s.pieceworkField);
  let heatExchanger = 0, coverFront = 0, coverBack = 0, rolling = 0;

  if (hasFieldConfig) {
    heatExchanger = calcByField('heatExchanger');
    coverFront    = calcByField('coverFront');
    coverBack     = calcByField('coverBack');
    rolling       = calcByField('rolling');
  } else {
    // Fallback: старая логика по ключевым словам
    const findSection = (keyword) =>
      sections.find(s => s.name.toLowerCase().includes(keyword.toLowerCase()))?.id;
    const heatSectionId  = findSection('теплообменник');
    const coverSectionId = findSection('крышк');
    const isSectionPW = (sid) => {
      const sec = sections.find(s => s.id === sid);
      return sec?.payType === 'piecework' || sec?.payType === 'mixed';
    };
    const calcShare = (sectionId, rateAmount) => {
      if (!sectionId || !rateAmount || !isSectionPW(sectionId)) return 0;
      const sectionOps = orderOps.filter(o => o.sectionId === sectionId);
      const workerSet = new Set();
      sectionOps.forEach(op => (op.workerIds||[]).forEach(wid => workerSet.add(wid)));
      if (!workerSet.has(workerId) || workerSet.size === 0) return 0;
      return Math.round(rateAmount * qty / Math.max(workerSet.size, 1));
    };
    heatExchanger = (skipFields && skipFields.has('heatExchanger')) ? 0 : calcShare(heatSectionId, rate.heatExchanger);
    coverFront    = (skipFields && skipFields.has('coverFront'))    ? 0 : calcShare(coverSectionId, rate.coverFront);
    coverBack     = (skipFields && skipFields.has('coverBack'))     ? 0 : calcShare(coverSectionId, rate.coverBack);
  }

  const total = heatExchanger + coverFront + coverBack + rolling;
  return { heatExchanger, coverFront, coverBack, rolling, total, rate, boilerType, powerKw };
};

// Рассчитать сдельный заработок для одной операции при её завершении
// Возвращает { amount, field, rateId, boilerType, powerKw } или null
// Ищет цену допработы в каталоге по ключу категории и значению параметра.
// Возвращает { price, tier } или null.
const findExtraWorkPrice = (data, key, paramValue) => {
  const cat = (data.extraWorks || []).find(c => c.key === key);
  if (!cat) return null;
  const p = Number(paramValue);
  if (!isFinite(p)) return null;
  const tier = (cat.tiers || []).find(t => p >= (t.min || 0) && p <= (t.max || Infinity));
  return tier ? { price: tier.price, tier, category: cat } : null;
};

// Считает op.earning для операции. Работает для 2 сценариев:
//   1) обычная сдельная op — по section.pieceworkField и pieceworkRates
//   2) op-допработа (isExtraWork) — по замороженной цене op.extraAmount (не пересчитывается,
//      даже если каталог поменяли — цена фиксируется в момент создания записи)
// Возвращает { amount, field, ... } или null если оплата не сдельная.
const calcOpPieceworkEarning = (data, op) => {
  if (!op.orderId) return null;
  const workerCount = Math.max((op.workerIds || []).length, 1);

  // Ветка 1: допработа с замороженной ценой (см. worker.js AddExtraWorkModal)
  if (op.isExtraWork && op.extraAmount) {
    const amount = Math.round(op.extraAmount / workerCount);
    return {
      amount,
      field: 'extra',
      source: 'extra_work',
      extraKey: op.extraKey || null,
      extraParam: op.extraParam != null ? op.extraParam : null,
      extraQty: op.extraQty || 1,
      extraTotalAmount: op.extraAmount,   // общая сумма до деления — для аудита
    };
  }

  // Ветка 2: обычная сдельная операция.
  //
  // Носитель настройки оплаты — ЭТАП (настраивается в HR → Расценки →
  // «Привязка этапов к расценкам»). Если у этапа задан pieceworkField,
  // участок в расчёте не участвует вообще — ни payType, ни его поле.
  //
  // Если у этапа поля нет — работает legacy-путь через участок
  // (для старых конфигураций, где 1 участок = 1 колонка прайса).
  const stage   = op.stageId   ? (data.productionStages || []).find(s => s.id === op.stageId)   : null;
  const section = op.sectionId ? (data.sections || []).find(s => s.id === op.sectionId) : null;

  let field = null;
  if (stage && stage.pieceworkField) {
    field = stage.pieceworkField;                       // новый путь: этап решает всё
  } else if (section && section.pieceworkField
      && (section.payType === 'piecework' || section.payType === 'mixed')) {
    field = section.pieceworkField;                     // legacy: наследуем от участка
  }
  if (!field) return null;

  const order = (data.orders || []).find(o => o.id === op.orderId);
  if (!order) return null;

  const rate = findPieceworkRate(data, order.boilerType, order.powerKw);
  if (!rate || !rate[field]) return null;

  // Доля этапа в сумме расценки:
  // - null/undefined → 100% (обратная совместимость для старых конфигураций)
  // - 0              → этап явно не оплачивается
  // - >0             → процент от цены колонки
  // В новом UI «Привязка этапов» доля всегда проставляется явно (0 или >0),
  // поэтому fallback на 100% там не срабатывает.
  let paymentShare = 100;
  if (stage && stage.paymentShare != null && stage.paymentShare !== '') {
    paymentShare = Number(stage.paymentShare);
  }
  if (!isFinite(paymentShare) || paymentShare <= 0) return null;

  const qty = order.qty || 1;
  const amount = Math.round(rate[field] * qty * paymentShare / 100 / workerCount);
  if (amount <= 0) return null;

  return { amount, field, rateId: rate.id, boilerType: order.boilerType, powerKw: order.powerKw, paymentShare };
};



// ==================== useVirtualList — виртуализация длинных списков ====================
// Рендерит только видимые строки + overscan. Без библиотек.
// Использование:
//   const { containerProps, totalHeight, virtualItems } = useVirtualList({
//     items: filteredWorkers,   // весь массив
//     itemHeight: 72,           // высота одной строки в px
//     overscan: 5,              // сколько строк рендерить за пределами видимости
//     containerRef,             // ref контейнера со скроллом
//   });
const useVirtualList = ({ items, itemHeight, overscan = 5, containerRef }) => {
  const [scrollTop, setScrollTop] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(600);

  React.useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    // Начальный размер
    setContainerHeight(el.clientHeight || 600);

    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setContainerHeight(el.clientHeight || 600);

    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(onResize)
      : null;
    if (ro) ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, [containerRef]);

  const totalHeight = items.length * itemHeight;

  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIdx   = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const virtualItems = [];
  for (let i = startIdx; i <= endIdx; i++) {
    virtualItems.push({
      index:  i,
      item:   items[i],
      offset: i * itemHeight,
    });
  }

  return { totalHeight, virtualItems, startIdx, endIdx };
};

// VirtualList — компонент-обёртка для простых случаев
// h(VirtualList, { items, itemHeight: 72, renderItem: (item, index) => h(...), emptyState: h(...) })
const VirtualList = memo(({ items, itemHeight = 72, renderItem, emptyState = null, style = {} }) => {
  const containerRef = React.useRef(null);
  const { totalHeight, virtualItems } = useVirtualList({ items, itemHeight, containerRef });

  if (items.length === 0) return emptyState;

  // Порог: виртуализировать только если > 40 записей
  // (меньше — нет смысла, только накладные расходы)
  if (items.length <= 40) {
    return h('div', { style },
      items.map((item, i) => renderItem(item, i))
    );
  }

  return h('div', {
    ref: containerRef,
    style: {
      overflowY: 'auto',
      maxHeight: Math.min(items.length * itemHeight, 600),
      position: 'relative',
      ...style,
    }
  },
    // Spacer задаёт полную высоту для scrollbar
    h('div', { style: { height: totalHeight, position: 'relative' } },
      virtualItems.map(({ item, index, offset }) =>
        h('div', {
          key: item.id || index,
          style: {
            position: 'absolute',
            top: offset,
            left: 0,
            right: 0,
            height: itemHeight,
          }
        }, renderItem(item, index))
      )
    )
  );
});

// ==================== OfflineQueue — очередь операций для IndexedDB ====================
// Когда нет сети: сохраняем снапшот данных в IndexedDB
// При восстановлении: отправляем в Firebase и чистим очередь
const OfflineQueue = (() => {
  const DB_NAME = 'teploros_offline';
  const STORE   = 'pending_saves';
  const DB_VER  = 1;
  let _db = null;

  const open = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });

  return {
    // Добавить снапшот данных в очередь
    async enqueue(data, label = '') {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add({
          payload: JSON.stringify(data),
          ts: Date.now(),
          label,
        });
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        console.log(`[OfflineQueue] Сохранено офлайн: ${label}`);
        return true;
      } catch(e) {
        console.error('[OfflineQueue] enqueue failed:', e);
        return false;
      }
    },

    // Получить все записи из очереди
    async getAll() {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readonly');
        return await new Promise((res, rej) => {
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror   = () => rej(req.error);
        });
      } catch(e) { return []; }
    },

    // Удалить запись по id
    async remove(id) {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
      } catch(e) { console.error('[OfflineQueue] remove failed:', e); }
    },

    // Очистить всю очередь
    async clear() {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
      } catch(e) {}
    },

    // Количество записей в очереди
    async count() {
      try {
        const db = await open();
        const tx = db.transaction(STORE, 'readonly');
        return await new Promise((res) => {
          const req = tx.objectStore(STORE).count();
          req.onsuccess = () => res(req.result || 0);
          req.onerror   = () => res(0);
        });
      } catch(e) { return 0; }
    },

    // Отправить всё из очереди в Firebase (вызывается при восстановлении сети)
    async flush(onProgress) {
      const items = await this.getAll();
      if (items.length === 0) return 0;

      console.log(`[OfflineQueue] Отправляем ${items.length} записей в Firebase...`);
      let sent = 0;

      for (const item of items) {
        try {
          const data = JSON.parse(item.payload);
          await DB.save(data);
          await this.remove(item.id);
          sent++;
          if (onProgress) onProgress(sent, items.length, item.label);
        } catch(e) {
          console.error(`[OfflineQueue] flush error for id=${item.id}:`, e);
          break; // останавливаемся при ошибке — сеть снова пропала
        }
      }

      console.log(`[OfflineQueue] Отправлено ${sent} из ${items.length}`);
      return sent;
    }
  };
})();

// ==================== canShipOrder ====================
// Проверяет готовность заказа к отгрузке с учётом комплектующих
const canShipOrder = (order) => {
  if (!order) return false;
  // Защита: components может прийти как строка '[]' или '[{...}]' из Firebase
  let components = order.components || [];
  if (typeof components === 'string') {
    try { components = JSON.parse(components); } catch(e) { components = []; }
  }
  if (!Array.isArray(components) || components.length === 0) return true;
  return components.every(c => c.status === 'confirmed');
};

// Статус комплектующих заказа
// ==================== getStage — единый резолвер этапа операции ====================
// Сначала по stageId (надёжно), fallback по name (старые данные до миграции)
const getStage = (data, op) => {
  const stages = data.productionStages || [];
  if (op.stageId) {
    const byId = stages.find(s => s.id === op.stageId);
    if (byId) return byId;
  }
  return stages.find(s => s.name === op.name) || null;
};

const getComponentsStatus = (order) => {
  let components = order?.components || [];
  if (typeof components === 'string') {
    try { components = JSON.parse(components); } catch(e) { components = []; }
  }
  if (!Array.isArray(components) || components.length === 0) return null;
  const confirmed = components.filter(c => c.status === 'confirmed').length;
  const total = components.length;
  if (confirmed === total) return { label: `✓ Все комплектующие (${total})`, color: GN, ok: true };
  return { label: `📦 Комплектующие: ${confirmed}/${total}`, color: AM, ok: false };
};

// ==================== getWorkerStatusToday ====================
// Единый источник истины — статус сотрудника из табеля за сегодня
// Структура табеля: data.timesheet['YYYY-MM'][workerId][day]
// Возвращает: 'working' | 'sick' | 'vacation' | 'absent' | null (нет записи)
const getWorkerStatusToday = (workerId, timesheet) => {
  const now = new Date();
  const day = now.getDate();
  const tsKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cell = timesheet?.[tsKey]?.[workerId]?.[day];
  if (!cell) return null; // нет записи в табеле
  if (cell.code === 'Б')                          return 'sick';
  if (cell.code === 'ОТ' || cell.code === 'ОЗ')  return 'vacation';
  if (cell.code === 'К')                          return 'vacation';
  if (cell.code === 'НН')                         return 'absent';
  if (cell.code === 'У')                          return 'absent';
  if (cell.code === 'СД')                         return 'working'; // сдельная оплата = на смене
  if (cell.h > 0)                                 return 'working';
  return 'absent';
};

// Проверяет что сотрудник сейчас на смене (источник — только табель)
// Нет записи в табеле = не на смене (не считаем w.status)
const isWorkerOnShift = (worker, timesheet) => {
  const fromTs = getWorkerStatusToday(worker.id, timesheet);
  if (fromTs === null) return false; // нет записи в табеле — не на смене
  return fromTs === 'working';
};

// ==================== useTheme ====================
// Хук управления темой: light / dark / system
// Сохраняет выбор в localStorage, применяет класс на <html>
const useTheme = () => {
  const stored = (() => { try { return localStorage.getItem('tp_theme') || 'system'; } catch(e) { return 'system'; } })();
  const [theme, setThemeState] = React.useState(stored);

  React.useEffect(() => {
    const apply = (t) => {
      const root = document.documentElement;
      if (t === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else if (t === 'light') {
        root.setAttribute('data-theme', 'light');
      } else {
        root.removeAttribute('data-theme');
      }
    };
    apply(theme);
  }, [theme]);

  const setTheme = (t) => {
    try { localStorage.setItem('tp_theme', t); } catch(e) {}
    setThemeState(t);
  };

  return [theme, setTheme];
};

// ==================== ReceiveDeliveryScreen ====================
// Показывается при открытии ?receive=deliveryId (QR-код на материале)
const ReceiveDeliveryScreen = memo(({ deliveryId, data, onUpdate, currentUserId, addToast, onClose }) => {
  const delivery = (data.materialDeliveries || []).find(d => d.id === deliveryId);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Инициализируем qty когда нашли delivery
  useEffect(() => {
    if (delivery) setQty(String(delivery.requiredQty - (delivery.deliveredQty || 0)));
  }, [delivery?.id]);

  const mat   = delivery ? data.materials?.find(m => m.id === delivery.materialId) : null;
  const order = delivery ? data.orders?.find(o => o.id === delivery.orderId) : null;

  const handleConfirm = async (isPartial) => {
    if (!delivery) return;
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { addToast('Укажите количество', 'error'); return; }
    setSaving(true);
    try {
      const alreadyDelivered = delivery.deliveredQty || 0;
      const totalDelivered = alreadyDelivered + qtyNum;
      const status = isPartial || totalDelivered < delivery.requiredQty ? 'partial' : 'confirmed';

      const updDeliveries = (data.materialDeliveries || []).map(d =>
        d.id === delivery.id ? { ...d, status, deliveredQty: totalDelivered, confirmedAt: now(), confirmedBy: currentUserId, note } : d
      );
      const updMaterials = (data.materials || []).map(m =>
        m.id === delivery.materialId ? { ...m, quantity: (m.quantity || 0) + qtyNum } : m
      );
      const event = { id: uid(), type: 'material_receive', materialId: delivery.materialId, orderId: delivery.orderId, deliveryId: delivery.id, qty: qtyNum, ts: now(), confirmedBy: currentUserId, note };
      const d = { ...data, materialDeliveries: updDeliveries, materials: updMaterials, events: [...data.events, event] };
      await DB.save(d); onUpdate(d);
      addToast(status === 'confirmed' ? '✅ Поставка подтверждена!' : '⚡ Частичная поставка принята', 'success');
      onClose();
    } catch(e) {
      addToast('Ошибка сохранения', 'error');
    } finally {
      setSaving(false);
    }
  };

  return h('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card-solid,#fff)', borderRadius: 16, padding: 28, width: 'min(400px, 100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' } },

      !delivery
        ? h('div', { style: { textAlign: 'center', padding: 24 } },
            h('div', { style: { fontSize: 40, marginBottom: 12 } }, '❌'),
            h('div', { style: { fontSize: 16, fontWeight: 500, color: RD2, marginBottom: 8 } }, 'Поставка не найдена'),
            h('div', { style: { fontSize: 13, color: 'var(--muted)', marginBottom: 20 } }, `ID: ${deliveryId}`),
            h('button', { style: gbtn({ width: '100%' }), onClick: onClose }, 'Закрыть')
          )

        : delivery.status === 'confirmed'
          ? h('div', { style: { textAlign: 'center', padding: 24 } },
              h('div', { style: { fontSize: 40, marginBottom: 12 } }, '✅'),
              h('div', { style: { fontSize: 16, fontWeight: 500, color: GN2, marginBottom: 8 } }, 'Поставка уже подтверждена'),
              h('div', { style: { fontSize: 13, color: 'var(--muted)', marginBottom: 4 } }, mat?.name),
              h('div', { style: { fontSize: 13, color: 'var(--muted)', marginBottom: 20 } }, `Заказ: ${order?.number || delivery.orderId}`),
              h('button', { style: gbtn({ width: '100%' }), onClick: onClose }, 'Закрыть')
            )

          : h('div', null,
              // Шапка
              h('div', { style: { textAlign: 'center', marginBottom: 20 } },
                h('div', { style: { fontSize: 32, marginBottom: 8 } }, '📦'),
                h('div', { style: { fontSize: 18, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 } }, 'Приёмка материала'),
                delivery.status === 'partial' && h('div', { style: { fontSize: 12, color: AM2, background: AM3, padding: '3px 10px', borderRadius: 12, display: 'inline-block', marginBottom: 4 } }, '⚡ Частичная поставка — уже принято')
              ),

              // Информация о материале
              h('div', { style: { background: '#f5f1eb', borderRadius: 10, padding: '14px 16px', marginBottom: 20 } },
                h('div', { style: { fontSize: 15, fontWeight: 500, color: '#1a1a1a', marginBottom: 6 } }, mat?.name || delivery.materialId),
                h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 } },
                  h('div', null, h('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Заказ'), h('div', { style: { fontWeight: 500, color: AM2 } }, order?.number || delivery.orderId)),
                  h('div', null, h('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Этап'), h('div', { style: { fontWeight: 500 } }, delivery.stageName)),
                  h('div', null, h('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Требуется'), h('div', { style: { fontWeight: 500, color: RD2 } }, `${delivery.requiredQty} ${delivery.unit}`)),
                  delivery.deliveredQty > 0 && h('div', null, h('div', { style: { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' } }, 'Уже принято'), h('div', { style: { fontWeight: 500, color: GN2 } }, `${delivery.deliveredQty} ${delivery.unit}`))
                )
              ),

              // Ввод количества
              h('div', { style: { marginBottom: 14 } },
                h('label', { style: { fontSize: 12, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 } }, `Принято фактически (${delivery.unit})`),
                h('input', {
                  type: 'number', min: 0, autoFocus: true,
                  style: { width: '100%', padding: '12px 14px', fontSize: 18, fontWeight: 500, border: `2px solid ${AM}`, borderRadius: 8, outline: 'none', textAlign: 'center' },
                  value: qty,
                  onChange: e => setQty(e.target.value)
                })
              ),

              // Примечание
              h('div', { style: { marginBottom: 20 } },
                h('label', { style: { fontSize: 12, color: 'var(--fg-muted)', display: 'block', marginBottom: 6 } }, 'Примечание (накладная, поставщик)'),
                h('input', {
                  type: 'text', placeholder: 'Например: Накл. №123, ООО Металлснаб',
                  style: { width: '100%', padding: '10px 14px', fontSize: 13, border: '1px solid #ddd', borderRadius: 8, outline: 'none' },
                  value: note, onChange: e => setNote(e.target.value)
                })
              ),

              // Кнопки
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                Number(qty) >= delivery.requiredQty - (delivery.deliveredQty || 0)
                  ? h('button', {
                      style: { ...abtn({ fontSize: 15, padding: '14px' }), width: '100%', background: GN, borderColor: GN2 },
                      onClick: () => handleConfirm(false),
                      disabled: saving
                    }, saving ? '...' : `✅ Принять полностью — ${qty} ${delivery.unit}`)
                  : h('button', {
                      style: { ...abtn({ fontSize: 15, padding: '14px' }), width: '100%', background: AM, borderColor: AM2 },
                      onClick: () => handleConfirm(true),
                      disabled: saving
                    }, saving ? '...' : `⚡ Принять частично — ${qty} ${delivery.unit}`),
                h('button', { style: { ...gbtn({ fontSize: 13 }), width: '100%' }, onClick: onClose }, 'Отмена')
              )
            )
    )
  );
});

// ==================== Merge-хелперы (Итерация 2.2) ====================
// Вынесены из DB.save() наружу, чтобы их мог переиспользовать и DB._flushQueue()
// при разгрузке офлайн-очереди. Раньше merge-логика жила только внутри save(),
// а _flushQueue() писал через .set() БЕЗ merge — то есть при разгрузке очереди
// затирал целиком любые правки, сделанные другими, пока клиент был офлайн.

// Трёхстороннее слияние массива объектов по ключу id.
// remote — что сейчас на сервере, local — что хотим записать, base — снапшот на
// момент последней синхронизации (DB._baseData). Поле изменено локально
// (отличается от base) → берём локальное; не менялось → берём серверное.
// Объект удалён локально (есть в base, нет в local) → не реанимируем.
// Объект удалён на сервере (есть в base, нет в remote) → не реанимируем.
// Без base → fallback на object-level объединение (не хуже старого поведения).
const _mergeArrayById = (remote, local, key, base) => {
  if (!base) {
    const remoteMap = new Map((remote || []).map(item => [item[key], item]));
    (local || []).forEach(item => remoteMap.set(item[key], item));
    return [...remoteMap.values()];
  }
  const remoteMap = new Map((remote || []).map(i => [i[key], i]));
  const baseMap   = new Map((base   || []).map(i => [i[key], i]));
  const result = new Map(remoteMap);
  (local || []).forEach(localItem => {
    const id = localItem[key];
    const remoteItem = remoteMap.get(id);
    const baseItem = baseMap.get(id);
    if (!remoteItem) {
      if (baseItem) return; // удалено на сервере — не реанимируем
      result.set(id, localItem); // новый локальный объект
      return;
    }
    if (!baseItem) {
      result.set(id, localItem); // нет базы для этого id — берём наше целиком
      return;
    }
    const mergedItem = { ...remoteItem };
    const allKeys = new Set([...Object.keys(localItem), ...Object.keys(baseItem)]);
    allKeys.forEach(k => {
      if (JSON.stringify(localItem[k]) !== JSON.stringify(baseItem[k])) mergedItem[k] = localItem[k];
    });
    result.set(id, mergedItem);
  });
  const localIds = new Set((local || []).map(i => i[key]));
  baseMap.forEach((_, id) => { if (!localIds.has(id)) result.delete(id); });
  return [...result.values()];
};

// Глубокий мердж табеля timesheet[месяц][workerId][день] — без потери чужих записей.
const _mergeTimesheet = (remote, local) => {
  const out = { ...(remote || {}) };
  Object.keys(local || {}).forEach(month => {
    out[month] = { ...(out[month] || {}) };
    Object.keys(local[month] || {}).forEach(workerId => {
      out[month][workerId] = { ...(out[month][workerId] || {}), ...(local[month][workerId] || {}) };
    });
  });
  return out;
};

// Конкатенация + дедупликация по id, сортировка по времени (events, messages).
const _mergeEvents = (remote, local) => {
  const ids = new Set((local || []).map(e => e.id));
  return [...(local || []), ...(remote || []).filter(e => !ids.has(e.id))].sort((a, b) => (a.ts || 0) - (b.ts || 0));
};

// Полное слияние объекта toSave с remoteData/remoteWh/remoteTs/remoteEv относительно base (DB._baseData).
// Мутирует и возвращает toSave. Используется и в save() (при конфликте версий),
// и в _flushQueue() (при разгрузке офлайн-очереди).
const _mergeFullState = (toSave, remoteData, remoteWh, remoteTs, remoteEv, base) => {
  base = base || {};
  remoteData = remoteData || {};
  remoteWh = remoteWh || {};
  remoteTs = remoteTs || {};
  remoteEv = remoteEv || {};
  toSave.orders  = _mergeArrayById(remoteData.orders,  toSave.orders,  'id', base.orders);
  toSave.ops     = _mergeArrayById(remoteData.ops,     toSave.ops,     'id', base.ops);
  toSave.workers = _mergeArrayById(remoteData.workers, toSave.workers, 'id', base.workers);
  toSave.materials             = _mergeArrayById(remoteWh.materials,             toSave.materials,             'id', base.materials);
  toSave.materialConsumptions  = _mergeArrayById(remoteWh.materialConsumptions,  toSave.materialConsumptions,  'id', base.materialConsumptions);
  toSave.materialReservations  = _mergeArrayById(remoteWh.materialReservations,  toSave.materialReservations,  'id', base.materialReservations);
  toSave.materialDeliveries    = _mergeArrayById(remoteWh.materialDeliveries,    toSave.materialDeliveries,    'id', base.materialDeliveries);
  toSave.equipment             = _mergeArrayById(remoteWh.equipment,             toSave.equipment,             'id', base.equipment);
  toSave.reclamations = _mergeArrayById(remoteData.reclamations, toSave.reclamations, 'id', base.reclamations);
  toSave.duels        = _mergeArrayById(remoteData.duels,        toSave.duels,        'id', base.duels);
  // Итерация 6.2: табель из remoteTs (timesheet_v1), fallback на remoteData
  const remoteTimesheet = remoteTs.timesheet || remoteData.timesheet;
  toSave.timesheet = _mergeTimesheet(remoteTimesheet, toSave.timesheet);
  toSave.settings = { ...(remoteData.settings || {}), ...(toSave.settings || {}) };
  // Итерация 6.1: события из remoteEv (events_v1), fallback на remoteData
  const remoteEvents = remoteEv.events || remoteData.events;
  toSave.events = _mergeEvents(remoteEvents, toSave.events).slice(-2000);
  toSave.messages = _mergeEvents(remoteData.messages, toSave.messages).slice(-200);
  return toSave;
};

const DB = {
  _saveTimer:   null,
  _saveResolve: null,   // resolve-функция текущего pending save Promise
  _saving:      false,  // true пока идёт сохранение (от вызова до завершения записи) — блокирует onSnapshot
  _lastError:   null,
  _sizeWarning: null,
  _online:      true,    // текущий статус сети
  _version:     null,    // версия последних загруженных данных (для optimistic locking)
  _saveHistory: [],      // 📜 История сохранений: [{ts, version, userId, summary}] — последние 10
  _lastBackupAt: null,   // ⏱ когда последний раз писали реальный снапшот в app_backups
  // «База» для трёхстороннего слияния при конфликте (аудит): снапшот данных на момент,
  // когда локальная сессия последний раз была синхронизирована с сервером — либо через
  // load(), либо через принятый onSnapshot, либо сразу после успешного save(). Сравнивая
  // toSave с этой базой, можно понять, какие именно ПОЛЯ объекта реально изменились
  // локально, и переносить в результат слияния только их — а не весь объект целиком.
  // Без базы (например сразу после холодного старта в офлайне) merge падает обратно на
  // старое object-level поведение — это безопасный fallback, не хуже, чем было раньше.
  _baseData: null,
  // Итерация 2.1: буфер для snapshot, пришедшего во время активного save().
  // Хранит функцию-применитель последнего входящего snapshot; дренируется
  // по таймеру, как только _saving спадёт. См. onSnapshot ниже.
  _pendingSnapshot: null,
  _pendingSnapshotDrainer: null,
  // Итерация 2.3: последний toSave, ожидающий записи в debounce-окне.
  // Используется beforeunload-хуком, чтобы не потерять правки при закрытии
  // вкладки до срабатывания debounce-таймера. Очищается после успешной записи.
  _pendingSave: null,

  // ── Загрузка ──────────────────────────────────────────────────────────────
  async load() {
    cleanStaleLocalStorageKeys();

    // ── ONLINE-ONLY режим ──────────────────────────────────────────────────
    // Приложение работает ТОЛЬКО при живом соединении с Firestore. Причина:
    // офлайн-режим приводил к потере данных — устройство, поработавшее из кэша,
    // при возврате сети выгружало устаревшее состояние и затирало правки других
    // пользователей. Убрав офлайн-загрузку, мы гарантируем, что данные всегда
    // читаются из облака напрямую и не могут устареть.
    //
    // Если Firebase недоступен — НЕ отдаём кэш, а бросаем ошибку. App покажет
    // блокирующий экран «Нет соединения» до восстановления сети.
    if (!DOC_REF) {
      DB._online = false;
      throw new Error('OFFLINE: Firebase недоступен (CDN не загрузился)');
    }

    // Загружаем все документы параллельно — если сети нет, DOC_REF.get()
    // отклонится, и мы уйдём в catch → бросаем OFFLINE-ошибку.
    let snap, whSnap, tsSnap, evSnap;
    try {
      [snap, whSnap, tsSnap, evSnap] = await Promise.all([
        DOC_REF.get(),
        WH_DOC_REF.get(),
        TS_DOC_REF ? TS_DOC_REF.get() : Promise.resolve(null),
        EV_DOC_REF ? EV_DOC_REF.get() : Promise.resolve(null)
      ]);
    } catch(e) {
      console.warn('Firebase load failed (offline):', e);
      DB._online = false;
      throw new Error('OFFLINE: нет соединения с сервером');
    }

    if (snap.exists) {
      let parsed;
      try {
        parsed = typeof snap.data().payload === 'string'
          ? JSON.parse(snap.data().payload)
          : snap.data();
      } catch(e) { console.error('DB.load main JSON.parse failed', e); parsed = {}; }
      // Подмешиваем данные склада
      if (whSnap.exists) {
        let whParsed;
        try {
          whParsed = typeof whSnap.data().payload === 'string'
            ? JSON.parse(whSnap.data().payload)
            : whSnap.data();
        } catch(e) { console.error('DB.load wh JSON.parse failed', e); whParsed = {}; }
        WH_FIELDS.forEach(f => { if (whParsed[f] !== undefined) parsed[f] = whParsed[f]; });
      }
      // Итерация 6.2: подмешиваем табель из отдельного документа
      // Если timesheet_v1 существует — берём оттуда, иначе табель остаётся
      // из основного документа (обратная совместимость при первом деплое).
      if (tsSnap && tsSnap.exists) {
        let tsParsed;
        try {
          tsParsed = typeof tsSnap.data().payload === 'string'
            ? JSON.parse(tsSnap.data().payload)
            : tsSnap.data();
        } catch(e) { console.error('DB.load ts JSON.parse failed', e); tsParsed = {}; }
        TS_FIELDS.forEach(f => { if (tsParsed[f] !== undefined) parsed[f] = tsParsed[f]; });
      }
      // Итерация 6.1: подмешиваем события из отдельного документа
      if (evSnap && evSnap.exists) {
        let evParsed;
        try {
          evParsed = typeof evSnap.data().payload === 'string'
            ? JSON.parse(evSnap.data().payload)
            : evSnap.data();
        } catch(e) { console.error('DB.load ev JSON.parse failed', e); evParsed = {}; }
        EV_FIELDS.forEach(f => { if (evParsed[f] !== undefined) parsed[f] = evParsed[f]; });
      }
      DB._version = snap.data().updatedAt?.toMillis?.() || snap.data()._version || Date.now();
      DB._online = true;
      try { localStorage.setItem(VERSION_KEY, String(DB._version)); } catch(e) {}
      const loaded = migrateData({ ...EMPTY_DATA, ...parsed });
      DB._baseData = loaded;
      return loaded;
    }
    // Документ не существует (первый запуск на пустой базе) — но сеть есть.
    DB._online = true;
    return EMPTY_DATA;
  },

  // ── Сохранение ────────────────────────────────────────────────────────────
  async save(data) {
    DB._saving = true; // Блокируем onSnapshot немедленно
    try {
      let toSave = { ...data };

      // ── Стрипаем null/false/пустые поля из операций — экономит ~60% размера ops ──
      const OP_DEFAULTS = {
        workerQty: '{}', plannedHours: null, archived: false, sectionId: null,
        equipmentId: null, plannedStartDate: null, drawingUrl: null,
        defectNote: null, defectReasonId: null, defectSource: null,
        hiddenFromFeed: false, checklistDone: '[]', weldParams: null, earning: null,
        finishedAt: null, startedAt: null, dependsOn: '[]', photos: '[]', stageId: null
      };
      if (toSave.ops?.length > 0) {
        toSave.ops = toSave.ops.map(op => {
          const stripped = {};
          for (const [k, v] of Object.entries(op)) {
            const def = OP_DEFAULTS[k];
            if (def === null && v === null) continue;
            if (def === false && v === false) continue;
            if (def === '{}' && (v === null || (typeof v === 'object' && Object.keys(v||{}).length === 0))) continue;
            if (def === '[]' && (v === null || (Array.isArray(v) && v.length === 0))) continue;
            stripped[k] = v;
          }
          return stripped;
        });
      }

      // ── Стрипаем null поля из заказов ──
      const ORDER_DEFAULTS = {
        archived: false, shipped: false, autoArchived: false,
        bomId: null, productCode: null, specs: null, customer: null,
        source: null, components: '[]', archivedAt: null, shippedAt: null
      };
      if (toSave.orders?.length > 0) {
        toSave.orders = toSave.orders.map(order => {
          const stripped = {};
          for (const [k, v] of Object.entries(order)) {
            const def = ORDER_DEFAULTS[k];
            if (def === null && v === null) continue;
            if (def === false && v === false) continue;
            if (def === '[]' && (v === null || (Array.isArray(v) && v.length === 0))) continue;
            stripped[k] = v;
          }
          return stripped;
        });
      }

      // Ограничиваем размер вспомогательных массивов
      if (toSave.reclamations?.length > 500) toSave.reclamations = toSave.reclamations.slice(-500);
      if (toSave.messages?.length > 200)     toSave.messages     = toSave.messages.slice(-200);
      if (toSave.duels?.length > 100)        toSave.duels        = toSave.duels.slice(-100);

      // ── Архивация по месяцам: заказы + ops + events + materialConsumptions ──
      // Всё старше порога → production_archive/{YYYY-MM}, из основного документа удаляется
      const archiveThreshold = Date.now() - 60 * 86400000; // 60 дней в основном документе

      // Группировщик по месяцу
      const byMonth = {};
      const ensureMonth = (key) => {
        if (!byMonth[key]) byMonth[key] = { orders:[], ops:[], events:[], materialConsumptions:[] };
      };
      const monthKey = (ts) => {
        const d = new Date(ts || Date.now());
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      };

      // Заказы старше порога
      const toArchiveOrders = (toSave.orders || []).filter(o =>
        o.archived && (o.archivedAt || o.createdAt || 0) < archiveThreshold
      );
      const archiveOrderIds = new Set(toArchiveOrders.map(o => o.id));
      toArchiveOrders.forEach(o => {
        const key = monthKey(o.archivedAt || o.createdAt);
        ensureMonth(key);
        byMonth[key].orders.push(o);
      });

      // Операции архивированных заказов
      const toArchiveOps = (toSave.ops || []).filter(o => archiveOrderIds.has(o.orderId));
      toArchiveOps.forEach(op => {
        const key = monthKey(op.createdAt || op.finishedAt);
        ensureMonth(key);
        byMonth[key].ops.push(op);
      });

      // Events старше порога (кроме 'thanks' — благодарности всегда храним в основном документе)
      const eventsToArchive = (toSave.events || []).filter(e =>
        e.type !== 'thanks' && (e.ts || 0) < archiveThreshold
      );
      eventsToArchive.forEach(e => {
        const key = monthKey(e.ts);
        ensureMonth(key);
        byMonth[key].events.push(e);
      });
      const archivedEventIds = new Set(eventsToArchive.map(e => e.id));

      // materialConsumptions старше порога
      const consToArchive = (toSave.materialConsumptions || []).filter(c =>
        (c.ts || c.createdAt || 0) < archiveThreshold
      );
      consToArchive.forEach(c => {
        const key = monthKey(c.ts || c.createdAt);
        ensureMonth(key);
        byMonth[key].materialConsumptions.push(c);
      });
      const archivedConsIds = new Set(consToArchive.map(c => c.id));

      // Сохраняем в Firestore архив
      const hasArchiveData = Object.keys(byMonth).length > 0;
      if (hasArchiveData && DB._online) {
        Object.entries(byMonth).forEach(([month, chunk]) => {
          const update = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
          if (chunk.orders.length)              update.orders              = firebase.firestore.FieldValue.arrayUnion(...chunk.orders);
          if (chunk.ops.length)                 update.ops                 = firebase.firestore.FieldValue.arrayUnion(...chunk.ops);
          if (chunk.events.length)              update.events              = firebase.firestore.FieldValue.arrayUnion(...chunk.events);
          if (chunk.materialConsumptions.length) update.materialConsumptions = firebase.firestore.FieldValue.arrayUnion(...chunk.materialConsumptions);
          firebase.firestore().collection(ARCHIVE_COLL).doc(month)
            .set(update, { merge: true })
            .catch(e => console.warn('Archive save error:', e));
        });
        const totalArchived = Object.values(byMonth).reduce((s,c) =>
          s + c.orders.length + c.events.length + c.materialConsumptions.length, 0);
        console.log(`Архивировано: ${totalArchived} записей → ${Object.keys(byMonth).join(', ')}`);
      }

      // Удаляем из основного документа всё что ушло в архив
      if (archiveOrderIds.size > 0) {
        toSave.orders = toSave.orders.filter(o => !archiveOrderIds.has(o.id));
        toSave.ops    = (toSave.ops || []).filter(o => !archiveOrderIds.has(o.orderId));
      }
      if (archivedEventIds.size > 0)
        toSave.events = (toSave.events || []).filter(e => !archivedEventIds.has(e.id));
      if (archivedConsIds.size > 0)
        toSave.materialConsumptions = (toSave.materialConsumptions || []).filter(c => !archivedConsIds.has(c.id));

      // ── Контроль размера (Итерация 3.3: переиспользуем сериализацию) ──
      // toSave сериализуется здесь для замера размера. Если pruning ниже не
      // сработает (обычный случай, <700КБ), эта же строка пойдёт в localStorage-
      // кэш — не сериализуем toSave второй раз. Флаг pruned отслеживает, менялся
      // ли toSave после первой сериализации.
      let payload  = JSON.stringify(toSave);
      const sizeKb = Math.round(payload.length / 1024);
      let pruned   = false;

      // Вспомогательная функция: оставить только N последних месяцев табеля
      const pruneTimesheet = (ts, keepMonths) => {
        if (!ts || typeof ts !== 'object') return ts;
        const keys = Object.keys(ts)
          .filter(k => /^\d{4}-\d{2}$/.test(k)) // только ключи формата YYYY-MM
          .sort(); // сортировка по дате
        const toDelete = keys.slice(0, Math.max(0, keys.length - keepMonths));
        if (toDelete.length === 0) return ts;
        const pruned = { ...ts };
        toDelete.forEach(k => delete pruned[k]);
        console.log(`Timesheet pruned: удалены месяцы ${toDelete.join(', ')}`);
        return pruned;
      };

      if (sizeKb > 900) {
        // Аварийная защита — архивация должна была сработать раньше
        // Оставляем только благодарности и события за последние 30 дней
        const emergency30 = Date.now() - 30 * 86400000;
        toSave.events = (toSave.events || []).filter(e =>
          e.type === 'thanks' || (e.ts || 0) > emergency30
        );
        toSave.materialConsumptions = (toSave.materialConsumptions || []).filter(c =>
          (c.ts || c.createdAt || 0) > emergency30
        );
        // Оставляем только последние 3 месяца табеля
        toSave.timesheet = pruneTimesheet(toSave.timesheet, 3);
        pruned = true;
        const sizeAfter = Math.round(JSON.stringify(toSave).length / 1024);
        DB._lastError = `⚠ Данных ${sizeKb}→${sizeAfter} КБ — аварийная очистка. Данные сохранены в архив.`;
        console.warn(`Payload: ${sizeKb} KB → ${sizeAfter} KB after emergency pruning`);
      } else if (sizeKb > 700) {
        // Превентивно: оставляем последние 6 месяцев
        toSave.timesheet = pruneTimesheet(toSave.timesheet, 6);
        pruned = true;
        DB._sizeWarning = sizeKb;
      } else {
        DB._sizeWarning = null;
      }

      // Online-only: НЕ пишем данные в localStorage-кэш. Раньше кэш служил для
      // офлайн-загрузки, но офлайн-режим убран (см. DB.load). Держим только
      // номер версии для optimistic locking. payload/pruned больше не нужны для кэша.
      const newVersion = Date.now();
      try {
        localStorage.setItem(VERSION_KEY, String(newVersion));
      } catch(e) {}

      // ── Debounce с Promise — каждый вызов возвращает промис, разрешаемый по факту записи ──
      // Если предыдущий debounce ещё не сработал — отменяем его и резолвим (данные superseded)
      if (DB._saveTimer) clearTimeout(DB._saveTimer);
      if (DB._saveResolve) { DB._saveResolve(); DB._saveResolve = null; }

      // Online-only: убрана запись в beforeunload-очередь. При офлайне сохранять
      // некуда — приложение покажет блокирующий экран.

      return new Promise((resolve, reject) => {
        DB._saveResolve = resolve;
        DB._saveTimer = setTimeout(async () => {
          DB._saveResolve = null;
          if (!DB._online) {
            // ONLINE-ONLY: нет сети — НЕ сохраняем в очередь (это был источник
            // затирания чужих правок при возврате сети). Сообщаем об ошибке,
            // ничего не пишем локально. Блокирующий экран в App не даст
            // пользователю продолжать вносить изменения без сети.
            DB._lastError = 'Нет соединения с сервером. Изменения НЕ сохранены — дождитесь восстановления сети.';
            DB._saving = false;
            reject(new Error('OFFLINE: сохранение невозможно без сети'));
            return;
          }
          try {
            // ── Optimistic locking ──
            const snap = await DOC_REF.get().catch(() => null);
            if (snap && snap.exists) {
              const remoteVersion = snap.data().updatedAt?.toMillis?.() || snap.data()._version || 0;
              const localVersion  = Number(localStorage.getItem(VERSION_KEY)) || 0;
              if (remoteVersion > localVersion && remoteVersion !== newVersion) {
                console.log('📝 Conflict detected: remote version is newer — merging changes');
                // ── Мержим вместо перезаписи: берём удалённые данные как базу, накладываем наши изменения ──
                try {
                  let remoteData;
                  try { remoteData = typeof snap.data().payload === 'string' ? JSON.parse(snap.data().payload) : snap.data(); } catch(e) { remoteData = {}; }
                  // Складские поля (materials, materialConsumptions и т.д.) живут в ОТДЕЛЬНОМ документе warehouse_v1,
                  // не в production_v14 — нужно забрать его отдельно, иначе сравнение идёт с пустотой.
                  let remoteWh = {};
                  try {
                    const whSnap = await WH_DOC_REF.get().catch(() => null);
                    if (whSnap && whSnap.exists) {
                      remoteWh = typeof whSnap.data().payload === 'string' ? JSON.parse(whSnap.data().payload) : whSnap.data();
                    }
                  } catch(e) { remoteWh = {}; }
                  // Итерация 6.2: табель живёт в timesheet_v1 — забираем его для merge
                  let remoteTs = {};
                  try {
                    const tsSnap = TS_DOC_REF ? await TS_DOC_REF.get().catch(() => null) : null;
                    if (tsSnap && tsSnap.exists) {
                      remoteTs = typeof tsSnap.data().payload === 'string' ? JSON.parse(tsSnap.data().payload) : tsSnap.data();
                    }
                  } catch(e) { remoteTs = {}; }
                  // Итерация 6.1: события живут в events_v1 — забираем для merge
                  let remoteEv = {};
                  try {
                    const evSnap = EV_DOC_REF ? await EV_DOC_REF.get().catch(() => null) : null;
                    if (evSnap && evSnap.exists) {
                      remoteEv = typeof evSnap.data().payload === 'string' ? JSON.parse(evSnap.data().payload) : evSnap.data();
                    }
                  } catch(e) { remoteEv = {}; }
                  // ── Field-level merge (аудит + Итерация 2.2) ────────────────────────
                  // Логика вынесена в _mergeFullState / _mergeArrayById (см. выше по файлу),
                  // чтобы её мог переиспользовать и _flushQueue() при разгрузке офлайн-очереди.
                  //
                  // Суть: сравниваем каждое поле объекта с «базой» (DB._baseData — снапшот на
                  // момент последней синхронизации). Поле расходится с базой → поменяли мы →
                  // берём наше. Не менялось локально → берём серверное. Удалено локально или
                  // на сервере → не реанимируем. Без базы → fallback на object-level слияние.
                  _mergeFullState(toSave, remoteData, remoteWh, remoteTs, remoteEv, DB._baseData || {});
                  DB._lastError = '⚠ Данные объединены с изменениями другого пользователя.';
                } catch(mergeErr) {
                  console.warn('Merge failed, using last-write-wins:', mergeErr);
                  DB._lastError = '⚠ Данные обновились — ваши изменения применены поверх.';
                }
              }
            }
            // Разделяем данные: складские → warehouse_v1, табель → timesheet_v1, события → events_v1, остальное → production_v14
            const whData = {};
            const tsData = {};
            const evData = {};
            const mainData = { ...toSave };
            WH_FIELDS.forEach(f => {
              if (mainData[f] !== undefined) {
                whData[f] = mainData[f];
                delete mainData[f];
              }
            });
            // Итерация 6.2: табель → отдельный документ
            TS_FIELDS.forEach(f => {
              if (mainData[f] !== undefined) {
                tsData[f] = mainData[f];
                delete mainData[f];
              }
            });
            // Итерация 6.1: события → отдельный документ
            EV_FIELDS.forEach(f => {
              if (mainData[f] !== undefined) {
                evData[f] = mainData[f];
                delete mainData[f];
              }
            });

            // Сохраняем параллельно
            const savePromises = [
              DOC_REF.set({
                payload:   JSON.stringify(mainData),
                _version:  newVersion,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              })
            ];
            if (Object.keys(whData).length > 0) {
              savePromises.push(
                WH_DOC_REF.set({
                  payload:   JSON.stringify(whData),
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                })
              );
              // Обновляем кэш склада
              try { localStorage.setItem(WH_CACHE_KEY, JSON.stringify({ data: whData, savedAt: Date.now() })); } catch(e) {}
            }
            // Итерация 6.2: табель → отдельный документ
            if (TS_DOC_REF && Object.keys(tsData).length > 0) {
              savePromises.push(
                TS_DOC_REF.set({
                  payload:   JSON.stringify(tsData),
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                })
              );
            }
            // Итерация 6.1: события → отдельный документ
            if (EV_DOC_REF && Object.keys(evData).length > 0) {
              savePromises.push(
                EV_DOC_REF.set({
                  payload:   JSON.stringify(evData),
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                })
              );
            }
            await Promise.all(savePromises);
            DB._version = newVersion;
            localStorage.setItem(VERSION_KEY, String(newVersion));
            DB._online = true;
            DB._pendingSave = null; // Итерация 2.3: записано — beforeunload больше не нужен
            DB._clearQueue();
            // toSave только что успешно записан (смёрженный или нет) — это и есть новое
            // согласованное состояние. Следующий save() в этой же сессии должен сравнивать
            // локальные правки именно с ним, а не со старой базой.
            DB._baseData = toSave;
            // 📜 Логируем в историю: последние 10 сохранений
            const orderCount = toSave.orders?.length || 0;
            const opCount = toSave.ops?.length || 0;
            const workerCount = toSave.workers?.length || 0;
            DB._saveHistory.unshift({ ts: newVersion, version: newVersion, summary: `${orderCount}заказ ${opCount}опер ${workerCount}раб` });
            if (DB._saveHistory.length > 10) DB._saveHistory.pop();
            // 💾 Реальный снапшот для восстановления — не чаще раза в 10 минут, не блокирует сохранение
            if (BACKUP_REF && (!DB._lastBackupAt || newVersion - DB._lastBackupAt > 10 * 60 * 1000)) {
              DB._lastBackupAt = newVersion;
              BACKUP_REF.doc(String(newVersion)).set({
                payload: JSON.stringify(toSave),
                ts: newVersion,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }).then(() => {
                // Чистим старые снапшоты, оставляем последние 30 (≈5 часов истории при шаге 10 мин)
                BACKUP_REF.orderBy('ts', 'desc').get().then(qs => {
                  qs.docs.slice(30).forEach(d => d.ref.delete().catch(() => {}));
                }).catch(() => {});
              }).catch(e => console.warn('Backup write failed:', e));
            }
          } catch(e) {
            console.error('Firebase save error:', e);
            DB._lastError = 'Ошибка сохранения: ' + e.message + '. Изменения НЕ сохранены.';
            DB._online = false;
            // ONLINE-ONLY: не кладём в очередь — при ошибке записи сообщаем и
            // отклоняем промис. Данные не теряются: они остались в UI-стейте,
            // пользователь увидит блокирующий экран и повторит после сети.
            DB._saving = false;
            reject(new Error('SAVE_FAILED: ' + e.message));
            return;
          }
          resolve({ ...toSave, _version: newVersion });
          setTimeout(() => { DB._saving = false; }, 500);
        }, 800); // Уменьшаем debounce: 800ms вместо 1000ms — быстрее сохраняет
      });
    } catch(e) { console.error(e); DB._lastError = e.message; DB._saving = false; }
  },

  // ── Офлайн-очередь УБРАНА (online-only режим) ──────────────────────────────
  // Раньше эти методы копили данные в localStorage при офлайне и выгружали при
  // возврате сети — это и был источник затирания чужих правок. Теперь приложение
  // работает только онлайн, очередь не нужна. Методы оставлены как no-op, чтобы
  // случайные вызовы из старого кода не падали. Заодно чистим любую очередь,
  // оставшуюся в localStorage от предыдущих версий.
  _enqueue(data) { /* online-only: no-op */ },
  _clearQueue() { try { localStorage.removeItem(QUEUE_KEY); } catch(e) {} },
  async _flushQueue() { /* online-only: no-op */ },

  // 📜 История: получить список последних 10 сохранений (метаданные — для UI-журнала действий)
  getSaveHistory() {
    return DB._saveHistory.map(h => ({ ...h, date: new Date(h.ts).toLocaleString() }));
  },

  // 💾 Список реальных снапшотов для восстановления (app_backups) — это то, что РЕАЛЬНО можно откатить
  async listBackups() {
    if (!BACKUP_REF) return [];
    try {
      const qs = await BACKUP_REF.orderBy('ts', 'desc').limit(30).get();
      return qs.docs.map(d => ({ id: d.id, ts: d.data().ts, date: new Date(d.data().ts).toLocaleString() }));
    } catch(e) { console.warn('listBackups failed:', e); return []; }
  },

  // ↩️ Восстановление из реального снапшота (старый rollback() ничего не восстанавливал — только переписывал текущие данные с пометкой)
  async restoreFromBackup(backupId) {
    if (!BACKUP_REF) return { error: 'Бэкапы не настроены' };
    try {
      const snap = await BACKUP_REF.doc(backupId).get();
      if (!snap.exists) return { error: 'Снапшот не найден' };
      const restored = typeof snap.data().payload === 'string' ? JSON.parse(snap.data().payload) : snap.data();

      // Перед восстановлением — бэкапим ТЕКУЩЕЕ состояние, чтобы можно было вернуться обратно
      const cur = await DOC_REF.get().catch(() => null);
      if (cur && cur.exists) {
        const curWh = await WH_DOC_REF.get().catch(() => null);
        const curTs = TS_DOC_REF ? await TS_DOC_REF.get().catch(() => null) : null;
        const curEv = EV_DOC_REF ? await EV_DOC_REF.get().catch(() => null) : null;
        const curMain = typeof cur.data().payload === 'string' ? JSON.parse(cur.data().payload) : cur.data();
        const curWhData = curWh && curWh.exists ? (typeof curWh.data().payload === 'string' ? JSON.parse(curWh.data().payload) : curWh.data()) : {};
        const curTsData = curTs && curTs.exists ? (typeof curTs.data().payload === 'string' ? JSON.parse(curTs.data().payload) : curTs.data()) : {};
        const curEvData = curEv && curEv.exists ? (typeof curEv.data().payload === 'string' ? JSON.parse(curEv.data().payload) : curEv.data()) : {};
        const preRestoreTs = Date.now();
        await BACKUP_REF.doc(String(preRestoreTs)).set({
          payload: JSON.stringify({ ...curMain, ...curWhData, ...curTsData, ...curEvData }),
          ts: preRestoreTs,
          note: 'авто-снимок перед восстановлением',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
      }

      // Разделяем восстанавливаемые данные на production_v14 / warehouse_v1 / timesheet_v1 / events_v1
      const whData = {};
      const tsData = {};
      const evData = {};
      const mainData = { ...restored };
      WH_FIELDS.forEach(f => { if (mainData[f] !== undefined) { whData[f] = mainData[f]; delete mainData[f]; } });
      TS_FIELDS.forEach(f => { if (mainData[f] !== undefined) { tsData[f] = mainData[f]; delete mainData[f]; } });
      EV_FIELDS.forEach(f => { if (mainData[f] !== undefined) { evData[f] = mainData[f]; delete mainData[f]; } });

      const newVersion = Date.now();
      await Promise.all([
        DOC_REF.set({ payload: JSON.stringify(mainData), _version: newVersion, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
        Object.keys(whData).length > 0
          ? WH_DOC_REF.set({ payload: JSON.stringify(whData), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
          : Promise.resolve(),
        TS_DOC_REF && Object.keys(tsData).length > 0
          ? TS_DOC_REF.set({ payload: JSON.stringify(tsData), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
          : Promise.resolve(),
        EV_DOC_REF && Object.keys(evData).length > 0
          ? EV_DOC_REF.set({ payload: JSON.stringify(evData), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
          : Promise.resolve()
      ]);
      DB._version = newVersion;
      localStorage.setItem(VERSION_KEY, String(newVersion));
      DB._baseData = restored;
      return { success: true, message: `Восстановлено состояние на ${new Date(snap.data().ts).toLocaleString()}` };
    } catch(e) {
      return { error: e.message };
    }
  },

  // ── Realtime listener ─────────────────────────────────────────────────────
  onSnapshot(callback) {
    // Храним последние данные из всех документов для слияния
    let lastMain = null;
    let lastWh   = null;
    let lastTs   = null;  // Итерация 6.2: табель
    let lastEv   = null;  // Итерация 6.1: события

    const merge = () => {
      if (!lastMain) return;
      const merged = { ...EMPTY_DATA, ...lastMain };
      if (lastWh) WH_FIELDS.forEach(f => { if (lastWh[f] !== undefined) merged[f] = lastWh[f]; });
      // Итерация 6.2: табель из отдельного документа (приоритет над тем что может быть в main)
      if (lastTs) TS_FIELDS.forEach(f => { if (lastTs[f] !== undefined) merged[f] = lastTs[f]; });
      // Итерация 6.1: события из отдельного документа
      if (lastEv) EV_FIELDS.forEach(f => { if (lastEv[f] !== undefined) merged[f] = lastEv[f]; });
      const migrated = migrateData(merged);
      // Это принятое (не заблокированное _saving) обновление становится новой базой
      // для будущего трёхстороннего слияния — см. DB._baseData.
      DB._baseData = migrated;
      callback(migrated);
    };

    // ── Итерация 2.1: Буферизация snapshot при активном сохранении ──────────
    // Если идёт сохранение, запоминаем последний snapshot в буфере
    // (раздельно для main, warehouse, timesheet) и применяем сразу после
    // снятия блокировки. Так чужие правки не теряются.
    if (!DB._pendingSnapshotDrainer) {
      DB._pendingSnapshotDrainer = setInterval(() => {
        if (!DB._saving && DB._pendingSnapshot) {
          const buf = DB._pendingSnapshot;
          DB._pendingSnapshot = null;
          try { if (buf.main) buf.main(); } catch(e) { console.warn('pendingSnapshot main drain failed:', e); }
          try { if (buf.wh)   buf.wh();   } catch(e) { console.warn('pendingSnapshot wh drain failed:', e); }
          try { if (buf.ts)   buf.ts();   } catch(e) { console.warn('pendingSnapshot ts drain failed:', e); }
          try { if (buf.ev)   buf.ev();   } catch(e) { console.warn('pendingSnapshot ev drain failed:', e); }
        }
      }, 200);
    }

    const unsubMain = DOC_REF.onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        // ONLINE-ONLY: снапшот из локального кэша SDK (fromCache=true) означает,
        // что мы читаем НЕ актуальные данные с сервера. Игнорируем такие снапшоты
        // и помечаем офлайн — App покажет блокирующий экран.
        if (snap.metadata.fromCache) { DB._online = false; return; }
        DB._online = true;
        if (!snap.exists) return;
        const apply = () => {
          try {
            lastMain = typeof snap.data().payload === 'string'
              ? JSON.parse(snap.data().payload)
              : snap.data();
          } catch(e) {
            console.error('onSnapshot main: JSON.parse failed', e);
          }
          merge();
        };
        if (DB._saving) {
          if (!DB._pendingSnapshot) DB._pendingSnapshot = {};
          DB._pendingSnapshot.main = apply;
          return;
        }
        apply();
      },
      err => { DB._online = false; console.warn('Snapshot error:', err); }
    );

    const unsubWh = WH_DOC_REF.onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        if (snap.metadata.fromCache) return; // ONLINE-ONLY: игнорируем кэш SDK
        if (!snap.exists) return;
        const apply = () => {
          try {
            lastWh = typeof snap.data().payload === 'string'
              ? JSON.parse(snap.data().payload)
              : snap.data();
          } catch(e) {
            console.error('onSnapshot wh: JSON.parse failed', e);
          }
          merge();
        };
        if (DB._saving) {
          if (!DB._pendingSnapshot) DB._pendingSnapshot = {};
          DB._pendingSnapshot.wh = apply;
          return;
        }
        apply();
      },
      err => console.warn('WH Snapshot error:', err)
    );

    // Итерация 6.2: слушаем табель отдельно
    const unsubTs = TS_DOC_REF ? TS_DOC_REF.onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        if (snap.metadata.fromCache) return;
        if (!snap.exists) return;
        const apply = () => {
          try {
            lastTs = typeof snap.data().payload === 'string'
              ? JSON.parse(snap.data().payload)
              : snap.data();
          } catch(e) {
            console.error('onSnapshot ts: JSON.parse failed', e);
          }
          merge();
        };
        if (DB._saving) {
          if (!DB._pendingSnapshot) DB._pendingSnapshot = {};
          DB._pendingSnapshot.ts = apply;
          return;
        }
        apply();
      },
      err => console.warn('TS Snapshot error:', err)
    ) : null;

    // Итерация 6.1: слушаем события отдельно
    const unsubEv = EV_DOC_REF ? EV_DOC_REF.onSnapshot(
      { includeMetadataChanges: true },
      snap => {
        if (snap.metadata.fromCache) return;
        if (!snap.exists) return;
        const apply = () => {
          try {
            lastEv = typeof snap.data().payload === 'string'
              ? JSON.parse(snap.data().payload)
              : snap.data();
          } catch(e) {
            console.error('onSnapshot ev: JSON.parse failed', e);
          }
          merge();
        };
        if (DB._saving) {
          if (!DB._pendingSnapshot) DB._pendingSnapshot = {};
          DB._pendingSnapshot.ev = apply;
          return;
        }
        apply();
      },
      err => console.warn('EV Snapshot error:', err)
    ) : null;

    // Возвращаем функцию отписки от всех
    return () => { unsubMain(); unsubWh(); if (unsubTs) unsubTs(); if (unsubEv) unsubEv(); };
  },

  // ── Загрузка архива ───────────────────────────────────────────────────────
  async loadArchive(month) {
    try {
      const snap = await firebase.firestore().collection(ARCHIVE_COLL).doc(month).get();
      if (snap.exists) return snap.data();
    } catch(e) { console.warn('Archive load error:', e); }
    return null;
  },
  async listArchiveMonths() {
    try {
      const snaps = await firebase.firestore().collection(ARCHIVE_COLL).get();
      return snaps.docs.map(d => d.id).sort().reverse();
    } catch(e) { return []; }
  }
};

// ── Мониторинг сети (online-only режим) ─────────────────────────────────────
// Офлайн-очередь и её разгрузка убраны. Вместо этого следим за статусом сети,
// чтобы App мог показать/убрать блокирующий экран «Нет соединения».
if (typeof window !== 'undefined' && DOC_REF) {
  // Чистим любую очередь, оставшуюся в localStorage от старых версий приложения.
  try { localStorage.removeItem(QUEUE_KEY); } catch(e) {}
  try { localStorage.removeItem(CACHE_KEY); } catch(e) {}
  try { localStorage.removeItem(WH_CACHE_KEY); } catch(e) {}

  // Браузерные события сети — быстрый сигнал для UI. Реальный статус
  // подтверждается успехом/провалом Firestore-операций (DB._online).
  window.addEventListener('offline', () => { DB._online = false; });
  window.addEventListener('online', () => {
    // Сеть вернулась на уровне ОС — пробуем лёгкий пинг Firestore, чтобы
    // подтвердить реальную доступность и снять блокирующий экран.
    DOC_REF.get().then(() => { DB._online = true; }).catch(() => { DB._online = false; });
  });
}

// Миграция workerId → workerIds (используется при загрузке, снапшоте)
const migrateWorkerIds = (ops) => {
  if (!ops) return ops;
  return ops.map(op => {
    if (op.workerId !== undefined && !op.workerIds) {
      const migrated = { ...op, workerIds: op.workerId ? [op.workerId] : [] };
      delete migrated.workerId;
      return migrated;
    }
    return op;
  });
};

// Миграция данных: заполняет productionStages из OPERATION_STAGES если пусто
const migrateData = (d) => {
  if (!d.pressureTests) d.pressureTests = [];
  if (d.ops) d = { ...d, ops: migrateWorkerIds(d.ops) };
  if (!d.productionStages || d.productionStages.length === 0) {
    d = { ...d, productionStages: OPERATION_STAGES.map(name => ({ id: uid(), name, productType: 'boiler' })) };
  }
  // Миграция: пометить этапы без типа как 'boiler'
  if (d.productionStages?.some(s => !s.productType)) {
    d = { ...d, productionStages: d.productionStages.map(s => s.productType ? s : { ...s, productType: 'boiler' }) };
  }
  // Миграция: operationIds должен быть массивом (старые заказы могут хранить объект или undefined)
  if (d.orders?.some(o => o.operationIds !== undefined && !Array.isArray(o.operationIds))) {
    d = { ...d, orders: d.orders.map(o => {
      if (o.operationIds !== undefined && !Array.isArray(o.operationIds)) {
        const { operationIds, ...rest } = o;
        return rest;
      }
      return o;
    })};
  }
  // Нормализуем order.components: строка '[]' или '[{...}]' → массив
  if (d.orders?.some(o => typeof o.components === 'string')) {
    d = { ...d, orders: d.orders.map(o => {
      if (typeof o.components !== 'string') return o;
      try {
        const parsed = JSON.parse(o.components);
        return { ...o, components: Array.isArray(parsed) ? parsed : [] };
      } catch(e) { return { ...o, components: [] }; }
    })};
    console.log('Миграция: нормализованы components из строки в массив');
  }

  // Миграция: проставить stageId операциям у которых его нет (связь по name → id)
  if (d.ops?.some(op => !op.stageId) && d.productionStages?.length > 0) {
    const stagesByName = {};
    d.productionStages.forEach(s => { if (!stagesByName[s.name]) stagesByName[s.name] = s.id; });
    let migrated = 0;
    d = { ...d, ops: d.ops.map(op => {
      if (op.stageId) return op;
      const sid = stagesByName[op.name];
      if (sid) { migrated++; return { ...op, stageId: sid }; }
      return op;
    })};
    if (migrated > 0) console.log('Миграция: проставлен stageId для ' + migrated + ' операций');
  }

  // Удаляем операции с orderId: null (осиротевшие операции)
  if (d.ops?.some(op => !op.orderId)) {
    const before = d.ops.length;
    d = { ...d, ops: d.ops.filter(op => op.orderId) };
    if (d.ops.length < before) {
      console.log('Удалено осиротевших операций: ' + (before - d.ops.length));
    }
  }

  // Дедупликация событий по id (убираем дубликаты material_receive и других)
  if (d.events?.length > 0) {
    const seen = new Set();
    const deduped = d.events.filter(e => {
      if (!e.id) return true; // без id — оставляем
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    if (deduped.length < d.events.length) {
      console.log('Дедупликация событий: убрано ' + (d.events.length - deduped.length) + ' дублей');
      d = { ...d, events: deduped };
    }
  }

  // Миграция табеля: старый формат timesheet[workerId][day] → новый timesheet[YYYY-MM][workerId][day]
  // Определяем старый формат: ключи верхнего уровня — это ID сотрудников (не YYYY-MM)
  if (d.timesheet && typeof d.timesheet === 'object') {
    const keys = Object.keys(d.timesheet);
    const hasOldFormat = keys.some(k => !/^\d{4}-\d{2}$/.test(k));
    if (hasOldFormat) {
      console.log('Миграция табеля: конвертируем в формат YYYY-MM...');
      const now = new Date();
      const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const newTimesheet = {};
      // Копируем уже правильные ключи YYYY-MM
      keys.filter(k => /^\d{4}-\d{2}$/.test(k)).forEach(k => {
        newTimesheet[k] = d.timesheet[k];
      });
      // Переносим старые записи в текущий месяц (лучшее из возможного без метаданных дат)
      const oldKeys = keys.filter(k => !/^\d{4}-\d{2}$/.test(k));
      if (oldKeys.length > 0) {
        if (!newTimesheet[currentYm]) newTimesheet[currentYm] = {};
        oldKeys.forEach(workerId => {
          newTimesheet[currentYm][workerId] = d.timesheet[workerId];
        });
        console.log(`Перенесено ${oldKeys.length} записей табеля в ${currentYm}`);
      }
      d = { ...d, timesheet: newTimesheet };
    }
  }

  return d;
};

// ==================== Стили и кнопки ====================
const S = {
  // Glass: полупрозрачная карточка + blur из токена --glass-blur (html[data-noblur] отключает)
  card: { background: 'var(--card)', border: '1px solid var(--card-stroke, var(--border))', borderRadius: 16, padding: 16, marginBottom: 12, backdropFilter: 'var(--glass-blur, none)', WebkitBackdropFilter: 'var(--glass-blur, none)', boxShadow: 'var(--card-shadow, none)' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: '0.5px solid var(--border-soft)', fontWeight: 500, minHeight: 40 },
  td: { padding: '10px 10px', fontSize: 13, borderBottom: '0.5px solid var(--border-soft)', color: 'var(--fg)', verticalAlign: 'middle', minHeight: 40 },
  inp: { background: 'var(--inp-bg, var(--card))', border: '1px solid var(--card-stroke, var(--border))', borderRadius: 10, padding: '10px 12px', fontSize: 16, outline: 'none', minHeight: 44, color: 'var(--fg)' },
  lbl: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block', fontWeight: 500 },
  sec: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 600 }
};
const abtn = (e) => ({ padding: '10px 16px', background: 'var(--btn-accent, ' + AM + ')', color: 'var(--btn-accent-ink, #0B0E1A)', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 44, boxShadow: 'var(--btn-accent-glow, none)', ...e }); // Glass: градиентный акцент из токена
const gbtn = (e) => ({ padding: '10px 16px', background: 'var(--btn-ghost-bg, transparent)', color: 'var(--fg)', border: '1px solid var(--card-stroke, var(--border))', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 44, ...e });
const rbtn = (e) => ({ padding: '10px 16px', background: 'var(--st-al-bg, ' + RD3 + ')', color: 'var(--st-al-cl, ' + RD2 + ')', border: '1px solid var(--st-al-br, ' + RD + ')', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 44, ...e });

// ==================== ErrorBoundary (Итерация 1.3) ====================
// Ловит исключения при рендере и показывает fallback вместо белого экрана.
// Использование: h(ErrorBoundary, { name: 'WorkerScreen' }, h(WorkerScreen, props))
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
    // История последних 10 ошибок в window (для диагностики)
    if (!window._tpErrorLog) window._tpErrorLog = [];
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error(`[ErrorBoundary: ${this.props.name}]`, error, errorInfo);
    // Логируем в историю (последние 10)
    window._tpErrorLog.unshift({ 
      name: this.props.name || 'unknown', 
      message: error.toString(), 
      stack: error.stack, 
      ts: Date.now() 
    });
    if (window._tpErrorLog.length > 10) window._tpErrorLog.pop();
  }
  
  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };
  
  render() {
    if (this.state.hasError) {
      return h('div', {
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 24, background: 'var(--bg)', color: 'var(--fg)', textAlign: 'center'
        }
      },
        h('div', { style: { fontSize: 48, marginBottom: 16 } }, '⚠️'),
        h('div', { style: { fontSize: 18, fontWeight: 500, marginBottom: 8 } }, 'Произошла ошибка'),
        h('div', { style: { fontSize: 13, color: 'var(--muted)', marginBottom: 20, maxWidth: 400, lineHeight: 1.6 } },
          `В модуле "${this.props.name || 'система'}" произошла критическая ошибка. `,
          'Попробуйте перезагрузить страницу или очистить кеш браузера.'
        ),
        this.state.error && h('div', { 
          style: { 
            background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 16, 
            maxWidth: 500, fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', 
            textAlign: 'left', overflowX: 'auto', lineHeight: 1.4 
          } 
        }, this.state.error.toString()),
        h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center' } },
          h('button', { style: abtn(), onClick: this.handleReset }, '↻ Повторить'),
          h('button', { style: gbtn(), onClick: () => window.location.reload() }, '↻ Перезагрузить страницу')
        )
      );
    }
    
    return this.props.children;
  }
}

// ==================== useConfirm (заменяет все confirm()) ====================
const useConfirm = () => {
  const [cfg, setCfg] = useState(null);
  const ask = useCallback((opts) => new Promise(resolve =>
    setCfg({ msg: opts.message || 'Вы уверены?', detail: opts.detail || '', danger: opts.danger ?? true, resolve })
  ), []);
  const answer = useCallback((yes) => { if (cfg) { cfg.resolve(yes); setCfg(null); } }, [cfg]);
  const confirmEl = cfg ? h('div', {
    role: 'dialog', 'aria-modal': 'true',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 16 }
  },
    h('div', { className: 'modal-animated', style: { background: 'var(--card-solid, #fff)', color: 'var(--fg)', borderRadius: 16, padding: 24, width: 'min(360px,100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.28)' } },
      h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: cfg.detail ? 6 : 20, lineHeight: 1.4 } }, cfg.msg),
      cfg.detail && h('div', { style: { fontSize: 12, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 } }, cfg.detail),
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h('button', { style: gbtn({ minWidth: 80 }), onClick: () => answer(false) }, 'Отмена'),
        h('button', { style: cfg.danger ? rbtn({ minWidth: 80 }) : abtn({ minWidth: 80 }), onClick: () => answer(true) }, 'Подтвердить')
      )
    )
  ) : null;
  return { ask, confirmEl };
};

const Badge = memo(({ st }) => {
  const s = STATUS[st] || STATUS.pending;
  return h('span', { style: { display: 'inline-block', padding: '3px 11px', fontSize: 10.5, borderRadius: 999, fontWeight: 600, letterSpacing: '0.01em', background: s.bg, color: s.cl, border: `1px solid ${s.br}`, whiteSpace: 'nowrap' } }, s.label);
});

const Toast = memo(({ message, onClose, type = 'info', action = null }) => {
  const [exiting, setExiting] = useState(false);

  // ttl: если у action есть ttl — используем его, иначе 3000мс
  const ttl = action?.ttl || 3000;

  useEffect(() => {
    const exitTimer  = setTimeout(() => setExiting(true), ttl - 400);
    const closeTimer = setTimeout(onClose, ttl);
    return () => { clearTimeout(exitTimer); clearTimeout(closeTimer); };
  }, [onClose, ttl]);

  const accent = type === 'success' ? GN : type === 'error' ? RD : type === 'info' ? BL : AM;

  return h('div', {
    className: 'toast',
    role: 'status',
    'aria-live': 'polite',
    style: {
      borderLeft: `3px solid ${accent}`,
      animation: exiting
        ? '_tpToastOut 0.35s cubic-bezier(0.4,0,1,1) forwards'
        : '_tpToastIn  0.3s  cubic-bezier(0.2,0,0,1) both',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }
  },
    // Цветная точка
    h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 } }),
    // Текст
    h('span', { style: { flex: 1 } }, message),
    // Кнопка Undo (если передана)
    action && h('button', {
      onClick: (e) => {
        e.stopPropagation();
        action.action?.();
        onClose();
      },
      style: {
        background: 'none',
        border: `0.5px solid ${accent}88`,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 500,
        color: accent,
        cursor: 'pointer',
        flexShrink: 0,
        fontFamily: 'inherit',
        transition: 'background 0.12s',
      },
      onMouseEnter: e => e.currentTarget.style.background = accent + '18',
      onMouseLeave: e => e.currentTarget.style.background = 'none',
    }, action.label || 'Отменить')
  );
});

const ElapsedTimer = memo(({ startedAt, style }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return h('div', { style }, startedAt ? fmtDur(now() - startedAt) : '—');
});


// ==================== useDebounce — дебаунс значения ====================
// Возвращает значение которое обновляется только после паузы в delay мс.
// Использование: const debouncedSearch = useDebounce(search, 400);
const useDebounce = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
};

// ==================== useDebouncedSave — дебаунс сохранения ====================
// Откладывает DB.save на delay мс после последнего изменения.
// Полезно для часто обновляемых полей (поиск, матрица компетенций).
// Использование:
//   const scheduleSave = useDebouncedSave(data, onUpdate, 800);
//   scheduleSave(newData); // вызывать при каждом изменении
const useDebouncedSave = (data, onUpdate, delay = 800) => {
  const timerRef  = useRef(null);
  const pendingRef = useRef(null);

  // При размонтировании — сбрасываем таймер (НЕ сохраняем — это намеренно,
  // финальное сохранение должно идти через явный save)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return useCallback((newData) => {
    // Optimistic update — мгновенно
    onUpdate(newData);
    pendingRef.current = newData;

    // Сбрасываем предыдущий таймер
    if (timerRef.current) clearTimeout(timerRef.current);

    // Откладываем сохранение
    timerRef.current = setTimeout(async () => {
      const toSave = pendingRef.current;
      if (!toSave) return;
      pendingRef.current = null;
      window._tpSaveCount = (window._tpSaveCount || 0) + 1;
      window.dispatchEvent(new CustomEvent('_tpSaveStart'));
      try {
        await DB.save(toSave);
      } catch {
        onUpdate(data); // откат при ошибке
      } finally {
        window._tpSaveCount = Math.max(0, (window._tpSaveCount || 1) - 1);
        window.dispatchEvent(new CustomEvent('_tpSaveEnd'));
      }
    }, delay);
  }, [data, onUpdate, delay]);
};

// ==================== useIsDirty — отслеживание несохранённых изменений ====================
// Сравнивает текущее значение формы с исходным.
// Использование:
//   const isDirty = useIsDirty(form, initialForm);
const useIsDirty = (current, initial) => {
  return useMemo(() => {
    if (!initial) return false;
    return JSON.stringify(current) !== JSON.stringify(initial);
  }, [current, initial]);
};

// ==================== useDirtyGuard — защита от потери несохранённых данных ====================
// Оборачивает функцию закрытия формы — спрашивает подтверждение если есть изменения.
// Использование:
//   const guardedClose = useDirtyGuard(isDirty, resetForm, 'Закрыть без сохранения?');
const useDirtyGuard = (isDirty, onClose, message = 'Есть несохранённые изменения. Закрыть без сохранения?', askFn = null) => {
  const { ask } = useConfirm();
  const confirm = askFn || ask;
  return useCallback(async () => {
    if (!isDirty) { onClose(); return; }
    const ok = await confirm({
      message,
      detail: 'Введённые данные будут потеряны',
      danger: true,
      confirmText: 'Закрыть',
      cancelText: 'Остаться',
    });
    if (ok) onClose();
  }, [isDirty, onClose, message, confirm]);
};

// ==================== DirtyBadge — индикатор несохранённых изменений ====================
// Маленькая метка рядом с заголовком формы.
// Использование: isDirty && h(DirtyBadge)
const DirtyBadge = memo(() =>
  h('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 10,
      color: AM2,
      background: AM3,
      border: `0.5px solid ${AM4}`,
      borderRadius: 10,
      padding: '1px 7px',
      fontWeight: 500,
      animation: '_tpFadeIn 0.2s ease-out both',
      verticalAlign: 'middle',
      marginLeft: 6,
    }
  },
    h('span', { style: { width: 5, height: 5, borderRadius: '50%', background: AM, display: 'inline-block' } }),
    'Не сохранено'
  )
);

// ==================== EmptyState — пустое состояние с подсказкой ====================
// Использование:
//   h(EmptyState, { icon: '📋', title: 'Нет заказов', desc: 'Создайте первый заказ', action: 'Создать заказ', onAction: () => setShowForm(true) })
//   h(EmptyState, { icon: '🔍', title: 'Ничего не найдено', desc: 'Попробуйте изменить фильтры' })
//   h(EmptyState, { icon: '✓', title: 'Всё выполнено', desc: 'Нет операций в работе', positive: true })
const EmptyState = memo(({ icon, title, desc, action, onAction, positive = false, compact = false, hint = null }) => {
  return h('div', {
    className: 'op-card-anim',
    style: {
      textAlign: 'center',
      padding: compact ? '20px 16px' : '40px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: compact ? 6 : 10,
    }
  },
    // Иконка в кружке с лёгкой пульсацией для позитивных состояний
    h('div', {
      style: {
        width:  compact ? 44 : 72,
        height: compact ? 44 : 72,
        borderRadius: '50%',
        background: positive ? GN3 : 'var(--brand-soft, #fdf3e0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: compact ? 20 : 32,
        marginBottom: compact ? 0 : 6,
        flexShrink: 0,
        boxShadow: positive ? `0 0 0 8px ${GN3}` : '0 0 0 8px var(--brand-soft, #fdf3e0)',
      }
    }, icon),

    // Заголовок
    h('div', {
      style: {
        fontSize: compact ? 13 : 15,
        fontWeight: 500,
        color: 'var(--fg, #333)',
      }
    }, title),

    // Описание
    desc && h('div', {
      style: {
        fontSize: compact ? 11 : 12,
        color: 'var(--muted, #888)',
        lineHeight: 1.55,
        maxWidth: 260,
      }
    }, desc),

    // Кнопка действия
    action && onAction && h('button', {
      onClick: onAction,
      style: {
        marginTop: compact ? 4 : 8,
        padding: '7px 18px',
        borderRadius: 8,
        background: AM3,
        border: `0.5px solid ${AM4}`,
        color: AM2,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.15s, transform 0.1s',
      },
      onMouseEnter: e => { e.currentTarget.style.background = AM; e.currentTarget.style.color = '#fff'; },
      onMouseLeave: e => { e.currentTarget.style.background = AM3; e.currentTarget.style.color = AM2; },
      onMouseDown:  e => { e.currentTarget.style.transform = 'scale(0.97)'; },
      onMouseUp:    e => { e.currentTarget.style.transform = ''; },
    }, `+ ${action}`),
    hint && h('div', {
      style: { fontSize: 11, color: 'var(--muted, #888)', marginTop: 6, opacity: 0.75, lineHeight: 1.5, maxWidth: 260 }
    }, hint)
  );
});

// ==================== DataTable — единый компонент таблиц данных ====================
// Заменяет ручную вёрстку h('table') + S.th/S.td (аудит, Блок 4). Стили — в CSS
// классах .tp-table (index.html), не inline: изменение вида таблиц во всей системе
// делается в одном месте. Hover, sticky, плотности — через CSS, без onMouseEnter.
//
// Использование:
//   h(DataTable, {
//     columns: [
//       { key: 'number', label: 'Заказ', render: r => h('span', { className: 'tp-link', onClick: ... }, r.number) },
//       { key: 'free',   label: 'Свободно', num: true, sortValue: r => r.free },
//       { key: 'act',    label: '', sortable: false, render: r => h('button', ...) },
//     ],
//     rows,                      // массив объектов; ключ строки — row.id (или getRowId)
//     density: 'normal',         // 'compact' | 'normal' | 'relaxed'
//     sortable: true,            // сортировка кликом по заголовку: asc → desc → исходный порядок
//     defaultSort: null,         // { key, dir: 'asc'|'desc' } или null (исходный порядок rows)
//     onRowClick: (row) => {},   // опционально; интерактивные элементы в ячейках должны
//                                // вызывать e.stopPropagation(), чтобы не триггерить строку
//     rowClassName: (row) => '', // 'tp-row--danger' | '--warning' | '--success' | '--info' | '--selected' | '--muted'
//     rowStyle: (row) => ({}),   // inline-стиль строки поверх классов (opacity и т.п.)
//     renderAfterRow: (row) => node|null,  // раскрывающаяся строка после row (см. ведомость hr.js)
//     footerCells: [{ content, colSpan, num }],  // итоговая строка (tfoot)
//     empty: { icon, title, desc },  // EmptyState при rows.length === 0
//     stickyHeader: true,
//     maxHeight: null,           // px — вертикальный скролл внутри таблицы
//     card: true,                // обернуть в S.card (padding: 0)
//   })
//
// Колонка: { key, label, render?, sortValue?, sortable?, num?, center?, width?, title? }
//   render(row, index) — содержимое ячейки; по умолчанию row[key] (null → '—')
//   sortValue(row)     — значение для сортировки; по умолчанию row[key]
//   num: true          — числовая колонка (вправо + tabular-nums)
//   center: true       — по центру (для коротких статусов)
const DataTable = memo(({
  columns, rows,
  density = 'normal',
  sortable = true,
  defaultSort = null,
  onRowClick = null,
  rowClassName = null,
  rowStyle = null,       // (row) => styleObj — inline-стиль строки (opacity, borderLeft-акценты)
  renderAfterRow = null, // (row, i) => node|null — full-width строка ПОСЛЕ row (inline-редактирование,
                         // раскрывающаяся детализация); рендерится как tr > td[colSpan] с padding: 0
  footerCells = null,    // [{ content, colSpan?, num?, style? }] — итоговая строка в tfoot (ИТОГО)
  empty = null,
  stickyHeader = true,
  maxHeight = null,
  card = true,
  getRowId = null,
}) => {
  // Хуки — строго до любых early return (React error #310)
  const [sort, setSort] = useState(defaultSort);

  const sortedRows = useMemo(() => {
    const src = rows || [];
    if (!sort || !sort.key) return src;
    const col = (columns || []).find(c => c.key === sort.key);
    if (!col) return src;
    const getVal = col.sortValue || ((r) => r[sort.key]);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...src].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // пустые значения — всегда в конец
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'ru', { numeric: true }) * dir;
    });
  }, [rows, sort, columns]);

  const toggleSort = (col) => {
    if (!sortable || col.sortable === false) return;
    setSort(prev => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return defaultSort; // третий клик — возврат к исходному порядку
    });
  };

  if (!rows || rows.length === 0) {
    if (!empty) return null;
    const es = h(EmptyState, { compact: true, ...empty });
    return card ? h('div', { style: S.card }, es) : es;
  }

  const tableCls = [
    'tp-table',
    density === 'compact' && 'tp-table--compact',
    density === 'relaxed' && 'tp-table--relaxed',
    stickyHeader && 'tp-table--sticky',
  ].filter(Boolean).join(' ');

  const table = h('div', {
    className: 'tp-table-wrap',
    style: maxHeight ? { maxHeight, overflowY: 'auto' } : undefined,
  },
    h('table', { className: tableCls },
      h('thead', null, h('tr', null,
        columns.map(col => {
          const canSort = sortable && col.sortable !== false;
          const active = sort && sort.key === col.key;
          return h('th', {
            key: col.key, scope: 'col', title: col.title,
            className: [
              col.num && 'tp-th--num',
              col.center && 'tp-th--center',
              canSort && 'tp-th--sortable',
            ].filter(Boolean).join(' ') || undefined,
            style: col.width ? { width: col.width } : undefined,
            onClick: canSort ? () => toggleSort(col) : undefined,
            'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined,
          },
            col.label,
            active && h('span', { className: 'tp-sort-arrow' }, sort.dir === 'asc' ? '▲' : '▼')
          );
        })
      )),
      h('tbody', null, sortedRows.flatMap((row, i) => {
        const rid = getRowId ? getRowId(row) : (row.id != null ? row.id : i);
        const stateCls = rowClassName ? rowClassName(row) : '';
        const mainTr = h('tr', {
          key: rid,
          className: [stateCls, onRowClick && 'tp-row--clickable'].filter(Boolean).join(' ') || undefined,
          style: rowStyle ? rowStyle(row) : undefined,
          onClick: onRowClick ? () => onRowClick(row) : undefined,
        },
          columns.map(col => h('td', {
            key: col.key,
            className: [col.num && 'tp-td--num', col.center && 'tp-td--center'].filter(Boolean).join(' ') || undefined,
          }, col.render ? col.render(row, i) : (row[col.key] != null ? row[col.key] : '—')))
        );
        const after = renderAfterRow ? renderAfterRow(row, i) : null;
        if (!after) return [mainTr];
        return [mainTr, h('tr', { key: rid + '_after' },
          h('td', { colSpan: columns.length, style: { padding: 0 } }, after)
        )];
      })),
      footerCells && footerCells.length > 0 && h('tfoot', null, h('tr', null,
        footerCells.map((fc, i) => h('td', {
          key: i,
          colSpan: fc.colSpan || 1,
          className: fc.num ? 'tp-td--num' : undefined,
          style: fc.style,
        }, fc.content))
      ))
    )
  );

  return card ? h('div', { style: { ...S.card, padding: 0, overflow: 'hidden' } }, table) : table;
});

// ==================== useSave — универсальный хук сохранения ====================
// Заменяет паттерн: await DB.save(d); onUpdate(d); addToast(...)
// Использование:
//   const save = useSave(data, onUpdate, addToast);
//   save(newData, { msg: 'Заказ сохранён', undo: () => save(data, { msg: 'Отменено' }) });
//
// Возвращает функцию save(newData, opts) где opts:
//   msg     {string}   — текст toast при успехе
//   type    {string}   — тип toast ('success'|'info'|'error')
//   undo    {function} — если передана, toast показывает кнопку «Отменить» 5 сек
//   silent  {boolean}  — не показывать toast
//   onDone  {function} — колбэк после успешного сохранения
const useSave = (data, onUpdate, addToast) => {
  // Глобальный счётчик незавершённых сохранений
  // Используем window чтобы SaveStatusBar мог читать состояние
  const save = useCallback(async (newData, opts = {}) => {
    const { msg, type = 'success', undo, silent = false, onDone } = opts;

    // 1. Optimistic update — UI реагирует мгновенно
    onUpdate(newData);

    // 2. Сигнализируем о начале сохранения
    window._tpSaveCount = (window._tpSaveCount || 0) + 1;
    window.dispatchEvent(new CustomEvent('_tpSaveStart'));

    try {
      await DB.save(newData);

      // 3. Успех — показываем toast с опциональным Undo
      if (!silent && msg) {
        addToast(msg, type, undo ? { label: 'Отменить', action: undo, ttl: 5000 } : null);
      }
      onDone?.();
    } catch (err) {
      // 4. Ошибка — откатываем и сообщаем
      onUpdate(data);
      addToast('Не удалось сохранить — проверьте соединение', 'error');
    } finally {
      window._tpSaveCount = Math.max(0, (window._tpSaveCount || 1) - 1);
      window.dispatchEvent(new CustomEvent('_tpSaveEnd'));
    }
  }, [data, onUpdate, addToast]);

  return save;
};

// ==================== SaveStatusBar — строка статуса сохранения ====================
// Крепится в нижнем правом углу экрана. Показывает:
//   • «Сохранение...» пока идут запросы
//   • «✓ Сохранено» на 2 секунды после последнего сохранения
//   • «Нет соединения» если офлайн (синергия с индикатором сети из shared.js)
// Монтируется один раз в App, не требует пропсов.
const SaveStatusBar = memo(() => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'

  useEffect(() => {
    let savedTimer = null;

    const onStart = () => {
      clearTimeout(savedTimer);
      setStatus('saving');
    };

    const onEnd = () => {
      if ((window._tpSaveCount || 0) > 0) return; // ещё есть незавершённые
      setStatus('saved');
      savedTimer = setTimeout(() => setStatus('idle'), 2500);
    };

    const onOffline = () => setStatus('error');
    const onOnline  = () => {
      if (status === 'error') setStatus('idle');
    };

    window.addEventListener('_tpSaveStart', onStart);
    window.addEventListener('_tpSaveEnd',   onEnd);
    window.addEventListener('offline',      onOffline);
    window.addEventListener('online',       onOnline);

    return () => {
      clearTimeout(savedTimer);
      window.removeEventListener('_tpSaveStart', onStart);
      window.removeEventListener('_tpSaveEnd',   onEnd);
      window.removeEventListener('offline',      onOffline);
      window.removeEventListener('online',       onOnline);
    };
  }, []);

  if (status === 'idle') return null;

  const configs = {
    saving: { icon: '◌', text: 'Сохранение...', color: AM,   bg: AM3,   pulse: true  },
    saved:  { icon: '✓', text: 'Сохранено',     color: GN2,  bg: GN3,   pulse: false },
    error:  { icon: '!', text: 'Нет соединения', color: RD2,  bg: RD3,   pulse: true  },
  };
  const cfg = configs[status];

  return h('div', {
    style: {
      position: 'fixed',
      bottom: 72, // над нижней навигацией
      right: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 12px',
      borderRadius: 20,
      background: cfg.bg,
      border: `0.5px solid ${cfg.color}44`,
      fontSize: 12,
      fontWeight: 500,
      color: cfg.color,
      zIndex: 800,
      pointerEvents: 'none',
      animation: '_tpFadeIn 0.2s ease-out both',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      userSelect: 'none',
    }
  },
    h('span', {
      style: {
        fontSize: 13,
        animation: cfg.pulse ? '_tpSpinner 1s linear infinite' : 'none',
        display: 'inline-block',
        opacity: status === 'saving' ? 1 : 1,
      }
    }, status === 'saving' ? null : cfg.icon),
    status === 'saving' && h('span', {
      style: {
        width: 12, height: 12,
        border: `1.5px solid ${AM}44`,
        borderTopColor: AM,
        borderRadius: '50%',
        animation: '_tpSpinner 0.65s linear infinite',
        flexShrink: 0,
      }
    }),
    cfg.text
  );
});

// ==================== useCountUp — анимированный счётчик цифр ====================
// Принимает target (число) и duration (мс). Возвращает текущее значение анимации.
// Использует requestAnimationFrame + easeOutCubic — плавно «набегает» до target.
// Перезапускается при изменении target (новые данные из Firebase).
const useCountUp = (target, duration = 900) => {
  const [val, setVal] = React.useState(0);
  const rafRef = React.useRef(null);
  const startRef = React.useRef(null);
  const fromRef = React.useRef(0);

  React.useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    // Анимируем от текущего значения к новому (плавная дельта при обновлении данных)
    fromRef.current = val;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const p = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(fromRef.current + (target - fromRef.current) * ease));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target]);

  return val;
};

// ==================== AnimatedBar — прогресс-бар с анимацией от 0 ====================
// Монтируется с width:0, через 1 кадр переключается на target — CSS transition делает остальное.
// Это безопаснее чем JS-анимация width (не вызывает reflow при каждом кадре).
const AnimatedBar = memo(({ pct, color, height = 6, delay = 0 }) => {
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    // Два кадра: первый — убедиться что браузер нарисовал width:0, второй — переключить
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setWidth(pct);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return h('div', { style: { height, background: 'rgba(0,0,0,0.08)', borderRadius: height / 2, overflow: 'hidden' } },
    h('div', {
      style: {
        height: '100%',
        width: `${width}%`,
        borderRadius: height / 2,
        background: color,
        transition: `width 1.1s cubic-bezier(0.4, 0, 0.2, 1) ${delay}s`,
        willChange: 'width',
      }
    })
  );
});

// ==================== AchievementPopup — pop-up достижения с конфетти ====================
// Вызов: h(AchievementPopup, { achievement: ACHIEVEMENTS['ops_10'], onClose: fn })
// achievement = { icon, title, desc } из объекта ACHIEVEMENTS
// Конфетти — чистый Canvas без библиотек, ~80 частиц, 3 секунды
const AchievementPopup = memo(({ achievement, onClose, workerName }) => {
  const canvasRef = React.useRef(null);
  const rafRef    = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  // Запуск анимации появления через 1 кадр
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Конфетти на canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;

    const COLORS = ['#EF9F27','#1D9E75','#378ADD','#E24B4A','#9B59B6','#F39C12','#2ECC71','#3498DB'];
    const SHAPES = ['rect', 'circle', 'line'];

    // Генерируем 90 частиц — стартуют сверху с разбросом
    const particles = Array.from({ length: 90 }, (_, i) => ({
      x:  Math.random() * W,
      y: -Math.random() * H * 0.3,
      w:  6 + Math.random() * 8,
      h:  4 + Math.random() * 6,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      opacity: 1,
      gravity: 0.12 + Math.random() * 0.08,
      drag: 0.99,
    }));

    let startTime = null;
    const DURATION = 3500; // мс

    const tick = (ts) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      ctx.clearRect(0, 0, W, H);

      let alive = 0;
      for (const p of particles) {
        // Физика
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.x  += p.vx;
        p.y  += p.vy;
        p.rot += p.vr;

        // Fade-out в последнюю секунду
        if (elapsed > DURATION - 1000) {
          p.opacity = Math.max(0, p.opacity - 0.012);
        }

        if (p.y < H + 20 && p.opacity > 0.01) {
          alive++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;

          if (p.shape === 'rect') {
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          } else if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-p.w / 2, 0);
            ctx.lineTo(p.w / 2, 0);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      if (alive > 0 && elapsed < DURATION + 500) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Автозакрытие через 4 секунды
  React.useEffect(() => {
    const id = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 350); // ждём exit-анимацию
    }, 4000);
    return () => clearTimeout(id);
  }, [onClose]);

  if (!achievement) return null;

  return h('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 9998,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', // клики проходят сквозь
    }
  },
    // Canvas конфетти — полный экран
    h('canvas', {
      ref: canvasRef,
      style: {
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }
    }),

    // Карточка достижения
    h('div', {
      onClick: onClose,
      style: {
        position: 'relative', zIndex: 1,
        background: 'var(--card-solid,#fff)',
        borderRadius: 20,
        padding: '28px 32px',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        maxWidth: 320, width: 'calc(100vw - 48px)',
        pointerEvents: 'auto',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.7) translateY(20px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
        cursor: 'pointer',
      }
    },
      // Иконка в кружке
      h('div', {
        style: {
          width: 80, height: 80,
          borderRadius: '50%',
          background: AM3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, margin: '0 auto 16px',
          boxShadow: `0 0 0 4px ${AM3}, 0 0 0 8px ${AM}44`,
          animation: visible ? '_tpAchIcon 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' : 'none',
        }
      }, achievement.icon),

      // Надпись «Новое достижение!»
      h('div', {
        style: {
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: AM2,
          marginBottom: 6,
          animation: visible ? '_tpFadeIn 0.3s ease-out 0.3s both' : 'none',
        }
      }, '🎉 Новое достижение!'),

      // Название
      h('div', {
        style: {
          fontSize: 22, fontWeight: 600, color: '#1a1a1a',
          marginBottom: 8, lineHeight: 1.2,
          animation: visible ? '_tpFadeIn 0.3s ease-out 0.35s both' : 'none',
        }
      }, achievement.title),

      // Описание
      h('div', {
        style: {
          fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.5,
          marginBottom: 16,
          animation: visible ? '_tpFadeIn 0.3s ease-out 0.4s both' : 'none',
        }
      }, achievement.desc),

      // Имя рабочего (если передано)
      workerName && h('div', {
        style: {
          fontSize: 12, color: AM4, fontWeight: 500,
          animation: visible ? '_tpFadeIn 0.3s ease-out 0.45s both' : 'none',
        }
      }, workerName),

      // Подсказка «нажмите чтобы закрыть»
      h('div', {
        style: {
          marginTop: 16, fontSize: 11, color: '#bbb',
          animation: visible ? '_tpFadeIn 0.3s ease-out 1.5s both' : 'none',
        }
      }, 'Нажмите чтобы закрыть')
    )
  );
});

// ==================== AppSkeleton (загрузочный экран вместо «Загрузка...») ====================
// Показывается пока App ждёт DB.load(). Имитирует структуру LoginScreen —
// пользователь сразу видит «форму» и понимает что система загружается.
// Использует только transform/opacity — никакого reflow.

const AppSkeleton = memo(() => {
  // Shimmer-анимация через inline keyframes (не требует изменений в CSS-файлах)
  React.useEffect(() => {
    if (document.getElementById('_tp_skel_style')) return;
    const style = document.createElement('style');
    style.id = '_tp_skel_style';
    style.textContent = `
      @keyframes _tpShimmer {
        0%   { opacity: 0.35 }
        50%  { opacity: 0.75 }
        100% { opacity: 0.35 }
      }
      @keyframes _tpFadeIn {
        from { opacity: 0; transform: translateY(6px) }
        to   { opacity: 1; transform: translateY(0) }
      }
      @keyframes _tpSpinner {
        to { transform: rotate(360deg) }
      }
      @media (prefers-reduced-motion: reduce) {
        ._tpSkel, ._tpFadeIn, ._tpSpinner { animation: none !important; }
      }

      /* ── Тактильная обратная связь на кнопках WorkerScreen ── */
      /* Только transform + opacity — никакого reflow */
      .worker-btn,
      .worker-btn-start,
      .worker-btn-stop,
      .worker-btn-defect,
      .worker-btn-pause {
        transition: transform 0.08s ease-out, opacity 0.1s ease-out, background-color 0.15s;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      .worker-btn:active,
      .worker-btn-start:active,
      .worker-btn-stop:active,
      .worker-btn-defect:active,
      .worker-btn-pause:active {
        transform: scale(0.96);
        opacity: 0.82;
      }

      /* ── Появление карточек заданий (staggered fadeUp) ── */
      @keyframes _tpCardIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .op-card-anim {
        animation: _tpCardIn 0.22s ease-out both;
      }

      /* ── Hover на строках таблиц (мастер, ОТК, склад) ── */
      table tbody tr {
        transition: background-color 0.12s;
      }
      table tbody tr:hover {
        background-color: rgba(239,159,39,0.06);
        cursor: pointer;
      }

      /* ── Плавные переходы цвета/фона — не затрагивает layout ── */
      * { transition: color 0.12s, background-color 0.12s, border-color 0.12s, opacity 0.12s; }
      /* Кнопки воркера переопределяют wildcard для более быстрого отклика */
      .worker-btn, .worker-btn-start, .worker-btn-stop,
      .worker-btn-defect, .worker-btn-pause {
        transition: transform 0.08s ease-out, opacity 0.1s ease-out, background-color 0.15s !important;
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          transition-duration: 0ms !important;
          animation-duration: 0ms !important;
        }
      }

      /* ── Валидация форм — shake + border ── */
      @keyframes _tpShake {
        0%, 100% { transform: translateX(0); }
        20%       { transform: translateX(-6px); }
        40%       { transform: translateX(5px); }
        60%       { transform: translateX(-4px); }
        80%       { transform: translateX(3px); }
      }
      .field-error input,
      .field-error select,
      .field-error textarea {
        border-color: #E24B4A !important;
        box-shadow: 0 0 0 2px rgba(226,75,74,0.15);
        animation: _tpShake 0.35s cubic-bezier(0.36,0.07,0.19,0.97) both;
      }
      .field-valid input,
      .field-valid select,
      .field-valid textarea {
        border-color: #1D9E75 !important;
        box-shadow: 0 0 0 2px rgba(29,158,117,0.12);
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .error-hint {
        font-size: 11px;
        color: #E24B4A;
        margin-top: 3px;
        display: flex;
        align-items: center;
        gap: 4px;
        animation: _tpFadeIn 0.2s ease-out both;
      }
      .error-hint::before { content: '⚠'; font-size: 10px; }

      /* error-message уже используется в master.js — улучшаем */
      .error-message {
        font-size: 11px;
        color: #E24B4A;
        margin-top: 3px;
        display: flex;
        align-items: center;
        gap: 4px;
        animation: _tpFadeIn 0.2s ease-out both;
      }
      .error-message::before { content: '⚠'; font-size: 10px; }

      /* Кнопка сабмита в состоянии загрузки */
      .btn-loading {
        opacity: 0.7;
        pointer-events: none;
        position: relative;
      }
      .btn-loading::after {
        content: '';
        position: absolute;
        right: 12px; top: 50%;
        transform: translateY(-50%);
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.4);
        border-top-color: #fff;
        border-radius: 50%;
        animation: _tpSpinner 0.65s linear infinite;
      }

      /* ── Kanban Drag-and-Drop ── */
      /* grab-курсор только на draggable картах, не на всей доске */
      [draggable="true"] { cursor: grab; }
      [draggable="true"]:active { cursor: grabbing; }

      /* Канбан-колонка подсвечивается при наведении с картой */
      .kanban-col {
        transition: border 0.15s, background 0.15s, box-shadow 0.15s;
      }

      /* Карточка поднимается при hover (без drag) */
      .kanban-col [draggable="true"]:not(:active):hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transition: transform 0.15s, box-shadow 0.15s;
      }

      /* Drop-зона мигает рамкой при валидном dragover */
      @keyframes _tpDropPulse {
        0%, 100% { border-color: rgba(239,159,39,0.4); }
        50%       { border-color: rgba(239,159,39,0.9); }
      }

      /* ── SaveStatusBar ── */
      #_tp_save_bar {
        transition: opacity 0.25s, transform 0.25s;
      }

      /* ── Toast enter / exit анимации ── */
      @keyframes _tpToastIn {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)    scale(1); }
      }
      @keyframes _tpToastOut {
        from { opacity: 1; transform: translateY(0)  scale(1)    maxHeight: 80px; }
        to   { opacity: 0; transform: translateY(8px) scale(0.95); }
      }

      /* ── Achievement icon bounce ── */
      @keyframes _tpAchIcon {
        0%   { transform: scale(0) rotate(-15deg); }
        60%  { transform: scale(1.2) rotate(5deg); }
        100% { transform: scale(1) rotate(0deg); }
      }

      /* ── Пульсирующая точка активных операций ── */
      @keyframes _tpPulseRing {
        0%   { transform: scale(1); opacity: 1; }
        100% { transform: scale(2.6); opacity: 0; }
      }
      .pulse-dot-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        height: 10px;
        flex-shrink: 0;
      }
      .pulse-dot-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        animation: _tpPulseRing 1.8s ease-out infinite;
      }
      .pulse-dot-core {
        position: absolute;
        inset: 2px;
        border-radius: 50%;
      }

      /* ── Мигание просроченных дедлайнов ── */
      @keyframes _tpOverdueBlink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
      .overdue-blink {
        animation: _tpOverdueBlink 1.3s ease-in-out infinite;
      }

      /* ── Появление KPI-карточек дашборда ── */
      @keyframes _tpMetricIn {
        from { opacity: 0; transform: scale(0.92); }
        to   { opacity: 1; transform: scale(1); }
      }
      .metric-card-anim {
        animation: _tpMetricIn 0.28s ease-out both;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Одна блок-кость skeleton
  const Bone = ({ w = '100%', h = 14, r = 6, mb = 0, delay = 0 }) =>
    React.createElement('div', {
      className: '_tpSkel',
      style: {
        width: w, height: h, borderRadius: r,
        background: 'var(--border-soft, rgba(0,0,0,0.08))',
        marginBottom: mb,
        animation: `_tpShimmer 1.5s ease-in-out ${delay}s infinite`,
        flexShrink: 0,
      }
    });

  // Карточка-скелет: имитирует S.card
  const SkelCard = ({ children, delay = 0, mt = 0 }) =>
    React.createElement('div', {
      style: {
        background: 'var(--card-solid, #fff)',
        border: '0.5px solid var(--border, rgba(0,0,0,0.1))',
        borderRadius: 12,
        padding: 16,
        marginTop: mt,
        animation: `_tpFadeIn 0.3s ease-out ${delay}s both`,
      }
    }, children);

  return React.createElement('div', {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
      gap: 0,
    }
  },
    // Логотип / заголовок — имитирует «teploros / надежная техника»
    React.createElement('div', {
      style: {
        textAlign: 'center',
        marginBottom: 28,
        animation: '_tpFadeIn 0.4s ease-out both',
      }
    },
      React.createElement(Bone, { w: 140, h: 28, r: 8, mb: 8 }),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center' } },
        React.createElement(Bone, { w: 100, h: 12, r: 6, delay: 0.05 })
      )
    ),

    // Блок выбора роли — имитирует 2 ряда кнопок
    React.createElement(SkelCard, { delay: 0.08 },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
        [0, 0.04, 0.08, 0.12].map((d, i) =>
          React.createElement(Bone, { key: i, w: 110, h: 40, r: 8, delay: d })
        )
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' } },
        [0.05, 0.09, 0.13, 0.17, 0.21].map((d, i) =>
          React.createElement(Bone, { key: i, w: 110, h: 40, r: 8, delay: d })
        )
      )
    ),

    // Поле PIN-кода
    React.createElement('div', {
      style: {
        marginTop: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        animation: '_tpFadeIn 0.3s ease-out 0.15s both',
      }
    },
      React.createElement(Bone, { w: 220, h: 48, r: 8, delay: 0.1 }),
      React.createElement(Bone, { w: 120, h: 44, r: 8, delay: 0.12 })
    ),

    // Спиннер + подпись внизу
    React.createElement('div', {
      style: {
        marginTop: 36,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        animation: '_tpFadeIn 0.3s ease-out 0.2s both',
      }
    },
      React.createElement('div', {
        style: {
          width: 22,
          height: 22,
          border: `2px solid var(--border-soft, rgba(0,0,0,0.1))`,
          borderTopColor: AM,
          borderRadius: '50%',
          animation: '_tpSpinner 0.75s linear infinite',
        }
      }),
      React.createElement('div', {
        style: {
          fontSize: 11,
          color: 'var(--muted, #999)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }
      }, 'Подключение к серверу')
    )
  );
});

// ==================== Общие компоненты: MC (MetricCard), TabBar ====================
// MC — карточка метрики (KPI) с анимацией появления и счётчиком для чисел.
// Использование: h(MC, { v: 42, l: 'Заказов', c: GN, onClick: fn })
const MC = memo(({ v, l, c, onClick, fs }) => {
  // Анимируем только числа — строки ('42%', '—') оставляем как есть
  const isNum   = typeof v === 'number' && isFinite(v);
  const counted = useCountUp(isNum ? v : 0, 750);
  const display = isNum ? counted : v;

  return h('div', {
    className: 'metric-card-anim',
    style: {
      ...S.card,
      textAlign: 'center',
      padding: 10,
      marginBottom: 0,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.15s, box-shadow 0.15s',
    },
    onClick,
    onMouseEnter: onClick ? (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; } : undefined,
    onMouseLeave: onClick ? (e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; } : undefined,
  },
    h('div', { style: { fontSize: fs || 24, fontWeight: 500, color: c || 'inherit', fontVariantNumeric: isNum ? 'tabular-nums' : 'normal' } }, display),
    h('div', { style: { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginTop: 2 } }, l)
  );
});

// TabBar — горизонтальные вкладки с анимированным индикатором активной вкладки.
// Использование: h(TabBar, { tabs: [['id','Label']], tab, setTab })
const TabBar = memo(({ tabs, tab, setTab }) =>
  h('div', { className: 'tab-pill-wrap', role: 'tablist' },
    tabs.map(([id, label]) => h('button', {
      key: id,
      role: 'tab',
      'aria-selected': tab === id,
      className: 'tab-pill' + (tab === id ? ' active' : ''),
      onClick: () => { navigator.vibrate?.([10]); setTab(id); },
    }, label))
  )
);

// ==================== CommandPalette (Cmd+K глобальный поиск) ====================
// ==================== Ленивая подгрузка office/field бандлов (аудит, perf) ====================
// Раньше index.html грузил все модули (master/hr/analytics/warehouse/auxops/quality/
// timesheet/qms/reference/worker) статическими <script defer> ВСЕМ пользователям сразу,
// независимо от роли. Рабочий на телефоне в цеху скачивал и парсил ~1.3 МБ кода
// мастерского интерфейса, HR, аналитики — которым никогда не пользуется.
//
// Разбор app.js показал: реально изолирован только worker.js — ни один другой файл на
// него не ссылается, и сам он ни на что не ссылается. Все остальные модули образуют
// один плотно связанный кластер (например MasterScreen в master.js использует
// MasterWorkers из hr.js, AnalyticsDashboard из analytics.js, MasterReclamations из
// quality.js и т.д.) — растащить их по ролям без более глубокого рефакторинга нельзя.
// Поэтому бандла два:
//   field  — только рабочий кабинет (worker.js)
//   office — все остальные роли (мастер/ПДО/директор/HR/админ/склад/контролёр)
//
// Порядок файлов внутри office сохранён таким же, каким он был в index.html — на
// случай скрытых зависимостей порядка объявления между файлами.
const CDN = {
  xlsx:        { url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
                 fallback: 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
                 check: () => typeof window.XLSX !== 'undefined' },
  pdfmake:     { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
                 fallback: 'https://unpkg.com/pdfmake@0.2.7/build/pdfmake.min.js',
                 check: () => typeof window.pdfMake !== 'undefined' },
  vfsFonts:    { url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.min.js',
                 fallback: 'https://unpkg.com/pdfmake@0.2.7/build/vfs_fonts.js',
                 check: () => typeof window.pdfMake !== 'undefined' && !!window.pdfMake.vfs },
  chartjs:     { url: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
                 fallback: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
                 check: () => typeof window.Chart !== 'undefined' },
  html5qrcode: { url: 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
                 fallback: 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
                 check: () => typeof window.Html5Qrcode !== 'undefined' },
};

const BUNDLES = {
  // worker.js использует calcDayData из timesheet.js (проверено скриптом при аудите) —
  // поэтому timesheet.js входит в оба бандла. Дублирование ~32 КБ дешевле, чем городить
  // отдельный «shared2»-слой ради одной функции. html5-qrcode нужен только сканеру QR
  // в кабинете рабочего (единственный потребитель — worker.js, проверено).
  field:  ['cdn:html5qrcode', 'js/timesheet.js', 'js/worker.js'],
  // xlsx/pdfmake/vfs_fonts/chartjs (аудит, perf): раньше грузились статическими <script>
  // БЕЗ defer в <head> — блокировали парсинг страницы для абсолютно всех пользователей,
  // даже тех, кто ни разу не жал «Экспорт в Excel» или «Печать PDF». Суммарно больше
  // 3 МБ синхронной загрузки на пустом месте. Все реальные вызовы XLSX/pdfMake/Chart
  // живут в office-файлах (analytics/auxops/hr/reference/timesheet/warehouse) — код не
  // выполняется, пока office-экран не отрендерен, так что достаточно догрузить библиотеки
  // вместе с бандлом. Два вызова в ВСЕГДА загруженных app.js/shared.js (экспорт заказов,
  // протокол ГИ) обёрнуты отдельным ensureCdn() прямо в обработчике клика.
  office: ['cdn:xlsx', 'cdn:pdfmake', 'cdn:vfsFonts', 'cdn:chartjs',
           'js/qms.js', 'js/analytics.js', 'js/timesheet.js', 'js/auxops.js',
           'js/reference.js', 'js/quality.js', 'js/hr.js', 'js/warehouse.js', 'js/master.js'],
};

// Версия берём с собственного тега <script> core.js — core.js грузится синхронно
// (без defer) самым первым, поэтому document.currentScript на момент его выполнения
// надёжно указывает на его же тег. Так все бандлы всегда используют ту же версию,
// что прописана в index.html, без риска рассинхрона при следующих деплоях.
const SCRIPT_VERSION = (() => {
  try {
    const src = document.currentScript && document.currentScript.src || '';
    const m = src.match(/[?&]v=([^&]+)/);
    return m ? m[1] : '';
  } catch(e) { return ''; }
})();

const _loadedBundles   = new Set();
const _bundlePromises  = {};
const _loadedCdn        = new Set();
const _cdnPromises      = {};

// Общий загрузчик одной CDN-библиотеки с fallback на второй источник — тот же паттерн,
// что раньше был в <head> через onerror. check() пропускает загрузку, если библиотека
// почему-то уже есть в window (например уже была загружена другим путём).
function ensureCdn(key) {
  const spec = CDN[key];
  if (!spec) return Promise.reject(new Error('Неизвестная CDN-библиотека: ' + key));
  if (_loadedCdn.has(key) || spec.check()) { _loadedCdn.add(key); return Promise.resolve(); }
  if (_cdnPromises[key]) return _cdnPromises[key];
  _cdnPromises[key] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = spec.url;
    s.onload = () => { _loadedCdn.add(key); resolve(); };
    s.onerror = () => {
      const s2 = document.createElement('script');
      s2.src = spec.fallback;
      s2.onload = () => { _loadedCdn.add(key); resolve(); };
      s2.onerror = () => reject(new Error('Не удалось загрузить ' + key));
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
  return _cdnPromises[key];
}

// Грузим элементы бандла последовательно (не Promise.all) — сохраняем тот же порядок
// выполнения, что был в статических <script defer> тегах. Элементы вида 'cdn:xlsx'
// уходят через ensureCdn, остальные — как локальные версионированные js/-файлы.
function _loadScriptSeq(items) {
  return items.reduce((p, item) => p.then(() => {
    if (item.startsWith('cdn:')) return ensureCdn(item.slice(4));
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = item + (SCRIPT_VERSION ? '?v=' + SCRIPT_VERSION : '');
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Не удалось загрузить ' + item));
      document.body.appendChild(s);
    });
  }), Promise.resolve());
}

function ensureBundleLoaded(name) {
  if (_loadedBundles.has(name)) return Promise.resolve();
  if (_bundlePromises[name]) return _bundlePromises[name];
  const files = BUNDLES[name] || [];
  _bundlePromises[name] = _loadScriptSeq(files).then(() => { _loadedBundles.add(name); });
  return _bundlePromises[name];
}

function bundleForRole(role) {
  return role === 'worker' ? 'field' : 'office';
}

const CommandPalette = memo(({ data, onClose, onNavigate }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo(() => {
    if (!q.trim() || q.trim().length < 2) return [];
    const term = q.toLowerCase().trim();
    const out = [];

    // Заказы
    (data.orders || []).filter(o => !o.archived).forEach(o => {
      const haystack = [o.number, o.product, o.productType, o.serialNumber, o.boilerType, o.drawingUrl].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term)) out.push({ type: 'order', icon: '📦', title: `Заказ №${o.number}`, sub: o.product || '—', id: o.id, data: o });
    });

    // Сотрудники
    (data.workers || []).filter(w => !w.archived).forEach(w => {
      const haystack = [w.name, w.position, w.phone, w.email].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term)) out.push({ type: 'worker', icon: '👤', title: w.name, sub: w.position || '—', id: w.id, data: w });
    });

    // Операции
    (data.ops || []).filter(o => !o.archived && o.status !== 'done').forEach(o => {
      const order = (data.orders || []).find(x => x.id === o.orderId);
      const haystack = [o.name, order?.number, order?.product, o.sectionId].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term)) out.push({ type: 'op', icon: '⚙️', title: o.name, sub: order ? `Заказ №${order.number}` : '— без заказа —', id: o.id, data: o });
    });

    // Материалы
    (data.materials || []).forEach(m => {
      const haystack = [m.name, m.unit, m.category, m.supplier].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term)) out.push({ type: 'material', icon: '🗂', title: m.name, sub: m.supplier || m.category || '—', id: m.id, data: m });
    });

    // Участки
    (data.sections || []).forEach(s => {
      if (s.name.toLowerCase().includes(term)) out.push({ type: 'section', icon: '🏭', title: s.name, sub: s.payType === 'piecework' ? 'Сдельный' : 'Почасовой', id: s.id, data: s });
    });

    // Оборудование
    (data.equipment || []).forEach(e => {
      const haystack = [e.name, e.model, e.location].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(term)) out.push({ type: 'equipment', icon: '🔩', title: e.name, sub: e.location || e.model || '—', id: e.id, data: e });
    });

    return out.slice(0, 12);
  }, [q, data]);

  const TYPE_LABEL = { order: 'Заказ', worker: 'Сотрудник', op: 'Операция', material: 'Материал', section: 'Участок', equipment: 'Оборудование' };

  return h('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 },
    onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
  },
    h('div', { className: 'palette-box', style: { width: '100%', maxWidth: 580, background: 'var(--card)', borderRadius: 16, border: '0.5px solid var(--border)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' } },
      // Строка поиска
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: q && results.length ? '0.5px solid var(--border-soft)' : 'none' } },
        h('span', { style: { fontSize: 18, opacity: 0.5 } }, '🔍'),
        h('input', {
          ref: inputRef,
          type: 'text', placeholder: 'Поиск по заказам, сотрудникам, операциям…',
          value: q, onChange: e => setQ(e.target.value),
          style: { flex: 1, border: 'none', background: 'transparent', fontSize: 16, outline: 'none', color: 'var(--fg)' }
        }),
        q && h('button', { onClick: () => setQ(''), style: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', padding: '0 4px' } }, '✕'),
        h('kbd', { style: { fontSize: 11, color: 'var(--muted)', background: 'var(--card-2)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '2px 6px' } }, 'Esc')
      ),

      // Результаты
      results.length > 0 && h('div', { style: { maxHeight: 380, overflowY: 'auto' } },
        results.map((r, i) =>
          h('div', {
            key: r.id + i,
            style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', borderBottom: '0.5px solid var(--border-soft)', transition: 'background 120ms' },
            onMouseEnter: e => { e.currentTarget.style.background = 'var(--card-2)'; },
            onMouseLeave: e => { e.currentTarget.style.background = ''; },
            onClick: () => { onNavigate(r); onClose(); }
          },
            h('span', { style: { fontSize: 20, flexShrink: 0 } }, r.icon),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 14, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.title),
              h('div', { style: { fontSize: 12, color: 'var(--muted)', marginTop: 1 } }, r.sub)
            ),
            h('span', { style: { fontSize: 11, color: 'var(--muted)', background: 'var(--card-2)', border: '0.5px solid var(--border-soft)', borderRadius: 5, padding: '2px 7px', flexShrink: 0 } }, TYPE_LABEL[r.type] || r.type)
          )
        )
      ),

      // Пустое состояние
      q.trim().length >= 2 && results.length === 0 && h('div', { style: { padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 } },
        'Ничего не найдено по «', h('b', null, q), '»'
      ),

      // Подсказка снизу
      !q && h('div', { style: { padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center' } },
        h('span', { style: { fontSize: 12, color: 'var(--muted)' } }, 'Начните вводить для поиска'),
        h('span', { style: { flex: 1 } }),
        h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, '↑↓ навигация'),
        h('span', { style: { fontSize: 11, color: 'var(--muted)' } }, '↵ открыть')
      )
    )
  );
});

const vibrateOnAchievement = () => { try { if (navigator.vibrate) navigator.vibrate([100, 50, 200, 50, 100]); } catch(e) {} };
const vibrateAction = (type = 'start') => {
  try {
    if (navigator.vibrate) {
      if (type === 'start')  navigator.vibrate([100]);
      if (type === 'finish') navigator.vibrate([100, 50, 100, 50, 200]);
      if (type === 'error')  navigator.vibrate([300, 100, 300]);
      if (type === 'scan')   navigator.vibrate([50, 30, 50]);
    } else {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = type === 'error' ? 220 : type === 'finish' ? 660 : 440;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch(e) {}
};

// П.10+15: Логирование действий (мастер + история операции)
// ==================== BackupButton (резервная копия в JSON) ====================
const BackupButton = memo(({ data, style }) => {
  const exportJson = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 16).replace(':', '-');
      a.href = url; a.download = `teploros_backup_${ts}.json`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
    } catch(e) { alert('Ошибка экспорта: ' + e.message); }
  };
  return h('button', { type: 'button', onClick: exportJson,
    style: { background: 'transparent', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
      padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--fg-muted)', ...style }
  }, '💾 Резервная копия');
});

// ==================== RestoreButton (восстановление из JSON) ====================
const RestoreButton = memo(({ onRestore, style }) => {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('Неверный формат файла');
        // Базовая валидация структуры
        const required = ['orders', 'ops', 'workers'];
        const missing = required.filter(k => !Array.isArray(parsed[k]));
        if (missing.length > 0) throw new Error('В файле нет обязательных полей: ' + missing.join(', '));
        onRestore(parsed, file.name);
      } catch(err) {
        alert('Ошибка загрузки: ' + err.message);
      }
      e.target.value = ''; // сбросить input чтобы можно было загрузить тот же файл снова
    };
    reader.readAsText(file);
  };
  return h('div', { style: { display: 'inline-block' } },
    h('input', { ref: inputRef, type: 'file', accept: '.json,application/json', onChange: handleFile, style: { display: 'none' } }),
    h('button', { type: 'button', onClick: () => inputRef.current?.click(),
      style: { background: 'transparent', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
        padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--fg-muted)', ...style }
    }, '📥 Загрузить из файла')
  );
});

// ==================== OfflineIndicator (баннер связи) ====================
const OfflineIndicator = memo(() => {
  const [offline, setOffline] = useState(false);
  const [dbIssue, setDbIssue] = useState(null); // отдельно от browser-online: реальный статус записи в Firestore
  useEffect(() => {
    // Показываем баннер если реально нет сети браузера
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Поллим реальный статус Firestore-записи каждые 3 сек — раньше сбой записи (DB._online=false)
    // никак не показывался пользователю, если у браузера при этом был интернет (напр. ERR_NETWORK_IO_SUSPENDED)
    const poll = setInterval(() => {
      if (!DB._online && DB._lastError) setDbIssue(DB._lastError);
      else setDbIssue(null);
    }, 3000);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); clearInterval(poll); };
  }, []);
  if (!offline && !dbIssue) return null;
  return h('div', {
    style: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
      background: RD, color: '#fff', textAlign: 'center',
      padding: '6px 12px', fontSize: 12, fontWeight: 500 }
  }, offline ? '⚡ Нет связи — изменения сохранятся при восстановлении' : `⚠ Не удалось сохранить в облако: ${dbIssue} — изменения в локальном кэше, повторим автоматически`);
});

// ==================== VoiceButton (голосовой ввод) ====================
const VoiceButton = memo(({ onResult, style }) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const supported = typeof webkitSpeechRecognition !== 'undefined' || typeof SpeechRecognition !== 'undefined';
  if (!supported) return null;
  const toggle = () => {
    if (listening && recRef.current) { recRef.current.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ru-RU'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) onResult(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    vibrateAction('scan');
  };
  return h('button', { type: 'button', 'aria-label': listening ? 'Остановить запись' : 'Голосовой ввод',
    style: { background: listening ? RD : 'transparent', color: listening ? '#fff' : '#888',
      border: listening ? 'none' : '0.5px solid rgba(0,0,0,0.15)', borderRadius: 8,
      width: 36, height: 36, cursor: 'pointer', fontSize: 16, display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: 'auto',
      animation: listening ? 'pulse 1s ease-in-out infinite' : 'none', ...style },
    onClick: toggle
  }, listening ? '⏹' : '🎤');
});

const logAction = (data, action, details) => {
  const entry = { id: uid(), type: 'action_log', action, details, ts: now(), shift: getCurrentShift(data?.settings?.shifts) };
  return { ...data, events: [...data.events, entry] };
};

// ==================== Общие утилиты операций (WorkerScreen + QRScreen) ====================
// Строит обновление стейта для СТАРТА операции
const buildStartUpdate = (data, op, workerId) => {
  const startedAt = now();
  const shift = getCurrentShift(data?.settings?.shifts);
  const newEvents = [{ id: uid(), type: 'start', opId: op.id, workerId, workerIds: op.workerIds || [workerId], ts: startedAt, shift }];
  // Авто чек-ин при первой операции за день
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const hasCheckinToday = data.events.some(e => e.workerId === workerId && e.type === 'checkin_auto' && e.ts >= todayStart);
  if (!hasCheckinToday) newEvents.push({ id: uid(), type: 'checkin_auto', workerId, ts: startedAt, shift });
  // Копировать чек-лист из шаблона этапа если ещё нет
  const stage = getStage(data, op);
  const needsChecklist = stage?.checklist?.length > 0 && !op.checklist;
  return {
    ops: data.ops.map(o => o.id === op.id ? { ...o, status: 'in_progress', startedAt, workerIds: o.workerIds?.includes(workerId) ? o.workerIds : [...(o.workerIds || []), workerId], ...(needsChecklist ? { checklist: stage.checklist.map(text => ({ text, checked: false })) } : {}) } : o),
    events: [...data.events, ...newEvents],
    _startedAt: startedAt,
    _hasCheckin: hasCheckinToday
  };
};

// Строит обновление стейта для ЗАВЕРШЕНИЯ операции
// params: { defNote, defectReasonId, weldParams, isDefect, isRework, source }
const buildFinishUpdate = (data, op, workerId, params = {}) => {
  const { defNote = '', defectReasonId = '', weldParams = null, isDefect = false, isRework = false, source = 'current' } = params;
  const finishedAt = now();
  const shift = getCurrentShift(data?.settings?.shifts);
  let status = isDefect ? 'defect' : isRework ? 'rework' : 'done';
  let updatedOp = { ...op, finishedAt, defectNote: defNote || undefined };
  if (isDefect) { updatedOp.defectSource = source; updatedOp.defectReasonId = defectReasonId; }
  if (isRework) updatedOp.defectSource = source;
  if (op.requiresQC && status === 'done') { status = 'on_check'; }
  if (op.name.includes('свар') && weldParams?.seamNumber && weldParams?.electrode) {
    updatedOp.weldParams = { seamNumber: weldParams.seamNumber, electrode: weldParams.electrode, result: weldParams.result };
    if (weldParams.result === 'fail') { status = 'defect'; updatedOp.defectNote = 'Сварка забракована'; }
  }
  updatedOp.status = status;

  // Начисление сдельной оплаты — считается один раз при переходе в 'done' или 'on_check'
  // и замораживается в op.earning. Если по логике участка/расценки платить нечего — earning остаётся null.
  // При status === 'defect' / 'rework' — начисления НЕТ (за брак не платят, см. прайс).
  if ((status === 'done' || status === 'on_check') && !updatedOp.earning) {
    const earning = calcOpPieceworkEarning(data, updatedOp);
    if (earning && earning.amount > 0) {
      updatedOp.earning = earning;
    }
  }

  const eventEntry = { id: uid(), type: status, opId: op.id, workerId, workerIds: op.workerIds || [workerId], ts: finishedAt, note: defNote || undefined, shift, defectSource: (isDefect || isRework) ? source : undefined, defectReasonId: isDefect ? defectReasonId : undefined };
  // Если брак — создать запись рекламации
  let reclamations = data.reclamations || [];
  if (isDefect) {
    reclamations = [...reclamations, { id: uid(), opId: op.id, orderId: op.orderId, workerIds: op.workerIds || [workerId], defectReasonId, defectNote: defNote, defectSource: source, createdAt: finishedAt, status: 'open', d8: { team: ['master', ...(op.workerIds || [workerId])], containment: '', whys: ['', '', '', '', ''], rootCause: '', corrective: '', correctiveOwner: '', correctiveDeadline: '', validation: '', validationDate: '', preventive: '', preventiveDocs: '', closedNote: '', currentStep: 0 } }];
  }
  // Накапливаем статистику для нормирования (только успешные операции с временем)
  let opNorms = { ...(data.opNorms || {}) };
  if (status === 'done' && op.startedAt && finishedAt && op.name) {
    const elapsed = finishedAt - op.startedAt;
    const existing = opNorms[op.name] || { samples: 0, totalMs: 0 };
    opNorms[op.name] = { samples: existing.samples + 1, totalMs: existing.totalMs + elapsed };
  }

  // Агрегация вспомогательных работ: помесячная статистика
  let auxStats = { ...(data.auxStats || {}) };
  if (op.isAuxiliary && status === 'done' && op.startedAt && finishedAt) {
    const d = new Date(finishedAt);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const elapsed = finishedAt - op.startedAt;
    const cat = op.auxCategory || 'other';
    const prev = auxStats[monthKey] || { total: 0, totalMs: 0, byCategory: {}, byWorker: {} };
    const prevCat = prev.byCategory[cat] || { count: 0, ms: 0 };
    const newByCategory = { ...prev.byCategory, [cat]: { count: prevCat.count + 1, ms: prevCat.ms + elapsed } };
    const newByWorker = { ...prev.byWorker };
    (op.workerIds || [workerId]).forEach(wid => {
      const pw = newByWorker[wid] || { count: 0, ms: 0 };
      newByWorker[wid] = { count: pw.count + 1, ms: pw.ms + elapsed };
    });
    auxStats[monthKey] = { total: prev.total + 1, totalMs: prev.totalMs + elapsed, byCategory: newByCategory, byWorker: newByWorker };
  }

  return {
    ops: data.ops.map(o => o.id === op.id ? updatedOp : o),
    events: [...data.events, eventEntry],
    reclamations,
    opNorms,
    auxStats,
    _status: status,
    _finishedAt: finishedAt,
    _updatedOp: updatedOp
  };
};



// Нормализация строки для нечёткого поиска (используется в reference.js, warehouse.js)
const normStr = (s) => s.toString().toLowerCase().trim()
  .replace(/\s+/g, ' ').replace(/[-–—_]/g, ' ')
  .replace(/ё/g, 'е').replace(/[().,;]/g, '');

// ==================== Экспорт глобальных компонентов (Итерация 1.3) ====================
// ErrorBoundary и другие компоненты должны быть доступны из других скриптов (app.js и т.д.)
// явно регистрируем их в window объекте
if (typeof window !== 'undefined') {
  window.ErrorBoundary = ErrorBoundary;
  console.log('[Core] ErrorBoundary registered as window.ErrorBoundary');
}
