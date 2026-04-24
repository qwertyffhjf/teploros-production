// teploros · core.js
// Автоматически извлечено из монолита

const { useState, useEffect, useRef, useMemo, useCallback, memo, createElement: h } = React;

// ==================== PWA: ловим beforeinstallprompt глобально (до монтирования React) ====================
window._pwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window._pwaPrompt = e; });

// ==================== Константы ====================
const AM = '#EF9F27', AM2 = '#412402', AM3 = '#FAEEDA', AM4 = '#BA7517';
const GN = '#1D9E75', GN2 = '#04342C', GN3 = '#E1F5EE';
const RD = '#E24B4A', RD2 = '#501313', RD3 = '#FCEBEB';
const BL = '#378ADD';

const PRIORITY = {
  low: { label: 'Низкий', color: '#888' },
  medium: { label: 'Средний', color: BL },
  high: { label: 'Высокий', color: AM },
  critical: { label: 'Критический', color: RD }
};

const STATUS = {
  pending: { label: 'Ожидает', bg: '#f0ede8', cl: '#666', br: '#ccc' },
  in_progress: { label: 'В работе', bg: '#FAEEDA', cl: AM2, br: AM4 },
  on_check: { label: 'На контроле', bg: '#E1F5FE', cl: '#0277BD', br: '#4FC3F7' },
  done: { label: 'Выполнено', bg: GN3, cl: GN2, br: GN },
  defect: { label: 'Брак', bg: RD3, cl: RD2, br: RD },
  rework: { label: 'Переделка', bg: '#FAEEDA', cl: AM2, br: AM4 },
  shipped: { label: 'Отгружен', bg: '#E8F5E9', cl: '#1B5E20', br: '#4CAF50' },
};

const OPERATION_STAGES = [
  'Снабжение комплектующими','Раскрой','Сварка крышек','Заполнение крышек',
  'Вальцовка обечайки','Раскрой жаровых труб','Сборка/сварки топки',
  'Сборка/сварка котла','Установка/сварка жаровых труб','Опресовка',
  'Предварительный окрас','Установка кожуха','Установка крышек','Финишный окрас'
];

const WORKER_STATUS = {
  working: { label: 'На смене', bg: GN3, cl: GN2, br: GN },
  absent: { label: 'Отсутствует', bg: '#f0ede8', cl: '#666', br: '#ccc' },
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
  if (!worker) return data;
  const nowTime = Date.now();
  const stats = calcWorkerStats(workerId, data, nowTime);
  const current = worker.achievements || [];
  const newAch = [...current];
  const justEarned = [];
  for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
    if (!newAch.includes(id) && ach.condition(stats)) { newAch.push(id); justEarned.push(id); }
  }
  if (justEarned.length > 0) {
    let d = { ...data, workers: data.workers.map(w => w.id === workerId ? { ...w, achievements: newAch } : w) };
    // Публикация в чат
    const achMessages = justEarned.map(aid => ({
      id: uid(), senderId: 'system', senderName: 'Система', senderRole: 'system',
      text: `${ACHIEVEMENTS[aid].icon} ${worker.name} получил награду «${ACHIEVEMENTS[aid].title}»! ${ACHIEVEMENTS[aid].desc}`,
      type: 'achievement', timestamp: nowTime
    }));
    d.messages = [...(d.messages || []), ...achMessages].slice(-200);
    return d;
  }
  return data;
};

// ==================== Автоподбор исполнителя (уровень, опыт, качество, загрузка) ====================
const scoreWorkerForOp = (worker, opName, data) => {
  const wid = worker.id;
  const allOps = data.ops.filter(op => op.workerIds?.includes(wid));
  const doneThisType = allOps.filter(op => op.name === opName && op.status === 'done');
  const defectThisType = allOps.filter(op => op.name === opName && op.status === 'defect');
  const activeCount = data.ops.filter(op => (op.status === 'in_progress' || op.status === 'pending') && op.workerIds?.includes(wid)).length;
  const allDone = allOps.filter(op => op.status === 'done').length;
  const level = getWorkerLevel(allDone);

  // Опыт по этому типу операции (0-30 баллов)
  const expScore = Math.min(doneThisType.length * 2, 30);
  // Качество по этому типу (0-25 баллов)
  const total = doneThisType.length + defectThisType.length;
  const qualityScore = total > 0 ? Math.round((doneThisType.length / total) * 25) : 12;
  // Скорость: средний факт/план (0-20 баллов)
  const withPlan = doneThisType.filter(op => op.plannedHours && op.startedAt && op.finishedAt);
  const avgRatio = withPlan.length > 0 ? withPlan.reduce((s, op) => s + (op.finishedAt - op.startedAt) / (op.plannedHours * 3600000), 0) / withPlan.length : 1;
  const speedScore = Math.max(0, Math.round((2 - avgRatio) * 10));
  // Уровень (0-15 баллов)
  const levelScore = Math.min(level, 15);
  // Загрузка (штраф: -10 за каждую активную задачу)
  const loadPenalty = activeCount * 10;

  return { workerId: wid, workerName: worker.name, level, expScore, qualityScore, speedScore, levelScore, loadPenalty,
    totalScore: expScore + qualityScore + speedScore + levelScore - loadPenalty,
    details: { experience: doneThisType.length, defects: defectThisType.length, avgRatio: Math.round(avgRatio * 100), activeOps: activeCount }
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
    (w.status || 'working') === 'working' &&
    (anyHasCompetences ? w.competences?.includes(opName) : true) &&
    !data.ops.some(op => op.status === 'in_progress' && op.workerIds?.includes(w.id))
  );
  if (candidates.length === 0) return null;
  const scored = candidates.map(w => scoreWorkerForOp(w, opName, data)).sort((a, b) => b.totalScore - a.totalScore);
  return scored[0]?.workerId || null;
};

// Рекомендации по всем ожидающим операциям
const getAssignmentRecommendations = (data) => {
  const pendingOps = data.ops.filter(op => op.status === 'pending' && !op.archived && (!op.workerIds || op.workerIds.length === 0));
  return pendingOps.map(op => {
    const order = data.orders.find(o => o.id === op.orderId);
    const anyHasCompetences = data.workers.some(w => !w.archived && w.competences?.length > 0);
    const activeWorkers = data.workers.filter(w => !w.archived && (w.status || 'working') === 'working');

    const qualified = activeWorkers
      .filter(w => !anyHasCompetences || w.competences?.includes(op.name))
      .map(w => ({ ...scoreWorkerForOp(w, op.name, data), hasAccess: true }))
      .sort((a, b) => b.totalScore - a.totalScore);

    const others = activeWorkers
      .filter(w => anyHasCompetences && !w.competences?.includes(op.name))
      .map(w => ({ ...scoreWorkerForOp(w, op.name, data), hasAccess: false }))
      .sort((a, b) => a.workerName.localeCompare(b.workerName, 'ru'));

    const scored = [...qualified, { divider: true }, ...others].filter(Boolean);

    return { opId: op.id, opName: op.name, orderNumber: order?.number || '—', orderPriority: order?.priority || 'medium', deadline: order?.deadline, candidates: scored };
  }).sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return (prio[a.orderPriority] || 4) - (prio[b.orderPriority] || 4);
  });
};

// ==================== Утилиты ====================
const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
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
// ⚠️ SECURITY: Перед использованием в production примени Security Rules!
// Смотри FIREBASE_SECURITY_RULES.txt в корне проекта.
// Сейчас БД открыта — любой может читать/писать. После Rules будет закрыто.
firebase.initializeApp({
  apiKey: "AIzaSyAR4Hvt4I80tbQKI2HLTKM8rbLSas2QFDw",
  authDomain: "teploros-11774.firebaseapp.com",
  projectId: "teploros-11774",
  storageBucket: "teploros-11774.firebasestorage.app",
  messagingSenderId: "151146225873",
  appId: "1:151146225873:web:f37d7ce9f9859dcb5de5f0"
});
const firestore = firebase.firestore();
const DOC_REF = firestore.collection('app').doc('production_v14');
const PRESENCE_REF = firestore.collection('presence');

// ==================== Presence (онлайн пользователи) ====================
const Presence = {
  _id: null,
  start(userId, userName) {
    if (!userId) return;
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
  auxStats: {},       // агрегация вспомогательных работ: {"YYYY-MM": {total, totalMs, byCategory:{cat:{count,ms}}, byWorker:{wid:{count,ms}}}}
  messages: [], reclamations: [], duels: [], materialReservations: [], defects: [],
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
    productTypes: [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }]
  }
};

const CACHE_KEY    = 'prod_app_v14_cache';
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

const DB = {
  _saveTimer:   null,
  _saveResolve: null,   // resolve-функция текущего pending save Promise
  _saving:      false,  // true пока идёт сохранение (от вызова до завершения записи) — блокирует onSnapshot
  _lastError:   null,
  _sizeWarning: null,
  _online:      true,    // текущий статус сети
  _version:     null,    // версия последних загруженных данных (для optimistic locking)
  _saveHistory: [],      // 📜 История сохранений: [{ts, version, userId, summary}] — последние 10

  // ── Загрузка ──────────────────────────────────────────────────────────────
  async load() {
    cleanStaleLocalStorageKeys();
    // Пытаемся отправить накопленную офлайн-очередь
    await DB._flushQueue();
    try {
      const snap = await DOC_REF.get();
      if (snap.exists) {
        let parsed = typeof snap.data().payload === 'string'
          ? JSON.parse(snap.data().payload)
          : snap.data();
        // Запоминаем версию документа (для optimistic locking)
        DB._version = snap.data().updatedAt?.toMillis?.() || snap.data()._version || Date.now();
        DB._online = true;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsed, savedAt: Date.now() }));
          localStorage.setItem(VERSION_KEY, String(DB._version));
        } catch(e) {
          localStorage.removeItem(CACHE_KEY);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsed, savedAt: Date.now() })); } catch(e2) {}
        }
        return migrateData({ ...EMPTY_DATA, ...parsed });
      }
    } catch(e) {
      console.warn('Firebase load failed, using cache:', e);
      DB._online = false;
    }
    // Firebase недоступен — используем кэш
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        const cacheData = cached.data || cached;
        const savedAt   = cached.savedAt || 0;
        const age = Date.now() - savedAt;
        if (age > CACHE_TTL) {
          console.warn(`Cache TTL expired (${Math.round(age/3600000)}h old)`);
          localStorage.removeItem(CACHE_KEY);
        }
        return { ...EMPTY_DATA, ...cacheData };
      }
    } catch(e) {}
    return EMPTY_DATA;
  },

  // ── Сохранение ────────────────────────────────────────────────────────────
  async save(data) {
    DB._saving = true; // Блокируем onSnapshot немедленно
    try {
      let toSave = { ...data };

      // Ограничиваем размер массивов
      if (toSave.events?.length > 2000)               toSave.events               = toSave.events.slice(-2000);
      if (toSave.materialConsumptions?.length > 2000)  toSave.materialConsumptions = toSave.materialConsumptions.slice(-2000);
      if (toSave.reclamations?.length > 500)           toSave.reclamations         = toSave.reclamations.slice(-500);
      if (toSave.messages?.length > 200)               toSave.messages             = toSave.messages.slice(-200);
      if (toSave.duels?.length > 100)                  toSave.duels                = toSave.duels.slice(-100);

      // ── Архивация старых заказов в отдельный документ Firestore ──
      const archiveThreshold = Date.now() - 90 * 86400000;
      const toArchive = (toSave.orders || []).filter(o =>
        o.archived && (o.archivedAt || o.createdAt || 0) < archiveThreshold
      );
      if (toArchive.length > 0) {
        const archiveIds = new Set(toArchive.map(o => o.id));
        const archiveOps = (toSave.ops || []).filter(o => archiveIds.has(o.orderId));
        const byMonth = {};
        toArchive.forEach(o => {
          const d = new Date(o.archivedAt || o.createdAt || Date.now());
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          if (!byMonth[key]) byMonth[key] = { orders:[], ops:[] };
          byMonth[key].orders.push(o);
          byMonth[key].ops.push(...archiveOps.filter(op => op.orderId === o.id));
        });
        if (DB._online) {
          Object.entries(byMonth).forEach(([month, chunk]) => {
            firebase.firestore().collection(ARCHIVE_COLL).doc(month)
              .set({ orders: firebase.firestore.FieldValue.arrayUnion(...chunk.orders),
                     ops:    firebase.firestore.FieldValue.arrayUnion(...chunk.ops),
                     updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                   { merge: true })
              .catch(e => console.warn('Archive save error:', e));
          });
        }
        toSave.orders = toSave.orders.filter(o => !archiveIds.has(o.id));
        toSave.ops    = (toSave.ops || []).filter(o => !archiveIds.has(o.orderId));
        console.log(`Архивировано: ${toArchive.length} заказов → ${Object.keys(byMonth).join(', ')}`);
      }

      // ── Контроль размера ──
      const payload  = JSON.stringify(toSave);
      const sizeKb   = Math.round(payload.length / 1024);
      if (sizeKb > 900) {
        toSave.events               = (toSave.events || []).slice(-1000);
        toSave.materialConsumptions = (toSave.materialConsumptions || []).slice(-1000);
        DB._lastError = `⚠ Данных ${sizeKb} КБ — лимит 1 МБ. Старые заказы архивируются автоматически.`;
        console.warn(`Payload: ${sizeKb} KB`);
      } else if (sizeKb > 700) {
        DB._sizeWarning = sizeKb;
      } else {
        DB._sizeWarning = null;
      }

      // Обновляем кэш немедленно
      const newVersion = Date.now();
      try {
        localStorage.setItem(CACHE_KEY,   JSON.stringify({ data: toSave, savedAt: Date.now() }));
        localStorage.setItem(VERSION_KEY, String(newVersion));
      } catch(e) {}

      // ── Debounce с Promise — каждый вызов возвращает промис, разрешаемый по факту записи ──
      // Если предыдущий debounce ещё не сработал — отменяем его и резолвим (данные superseded)
      if (DB._saveTimer) clearTimeout(DB._saveTimer);
      if (DB._saveResolve) { DB._saveResolve(); DB._saveResolve = null; }

      return new Promise((resolve) => {
        DB._saveResolve = resolve;
        DB._saveTimer = setTimeout(async () => {
          DB._saveResolve = null;
          if (!DB._online) {
            DB._enqueue(toSave);
            resolve({ ...toSave, _version: newVersion });
            setTimeout(() => { DB._saving = false; }, 500);
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
                  const remoteData = typeof snap.data().payload === 'string' ? JSON.parse(snap.data().payload) : snap.data();
                  // Мержим массивы: наши новые записи добавляем к удалённым
                  const mergeArrayById = (remote, local, key) => {
                    const remoteMap = new Map((remote || []).map(item => [item[key], item]));
                    (local || []).forEach(item => remoteMap.set(item[key], item)); // наши перезаписывают по id
                    return [...remoteMap.values()];
                  };
                  toSave.orders = mergeArrayById(remoteData.orders, toSave.orders, 'id');
                  toSave.ops = mergeArrayById(remoteData.ops, toSave.ops, 'id');
                  toSave.workers = mergeArrayById(remoteData.workers, toSave.workers, 'id');
                  toSave.materials = mergeArrayById(remoteData.materials, toSave.materials, 'id');
                  // Events, messages — конкатенируем и дедуплицируем
                  const mergeEvents = (remote, local) => {
                    const ids = new Set((local || []).map(e => e.id));
                    return [...(local || []), ...(remote || []).filter(e => !ids.has(e.id))].sort((a, b) => (a.ts || 0) - (b.ts || 0));
                  };
                  toSave.events = mergeEvents(remoteData.events, toSave.events).slice(-2000);
                  toSave.messages = mergeEvents(remoteData.messages, toSave.messages).slice(-200);
                  DB._lastError = '⚠ Данные объединены с изменениями другого пользователя.';
                } catch(mergeErr) {
                  console.warn('Merge failed, using last-write-wins:', mergeErr);
                  DB._lastError = '⚠ Данные обновились — ваши изменения применены поверх.';
                }
              }
            }
            await DOC_REF.set({
              payload:   JSON.stringify(toSave),
              _version:  newVersion,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            DB._version = newVersion;
            localStorage.setItem(VERSION_KEY, String(newVersion));
            DB._online = true;
            DB._clearQueue();
            // 📜 Логируем в историю: последние 10 сохранений
            const orderCount = toSave.orders?.length || 0;
            const opCount = toSave.ops?.length || 0;
            const workerCount = toSave.workers?.length || 0;
            DB._saveHistory.unshift({ ts: newVersion, version: newVersion, summary: `${orderCount}заказ ${opCount}опер ${workerCount}раб` });
            if (DB._saveHistory.length > 10) DB._saveHistory.pop();
          } catch(e) {
            console.error('Firebase save error:', e);
            DB._lastError = e.message;
            DB._online = false;
            DB._enqueue(toSave);
          }
          resolve({ ...toSave, _version: newVersion });
          setTimeout(() => { DB._saving = false; }, 500);
        }, 800); // Уменьшаем debounce: 800ms вместо 1000ms — быстрее сохраняет
      });
    } catch(e) { console.error(e); DB._lastError = e.message; DB._saving = false; }
  },

  // ── Офлайн-очередь ────────────────────────────────────────────────────────
  _enqueue(data) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify({ data, ts: Date.now() }));
      console.log('Сохранено в офлайн-очередь');
    } catch(e) {}
  },
  _clearQueue() {
    try { localStorage.removeItem(QUEUE_KEY); } catch(e) {}
  },
  async _flushQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const { data, ts } = JSON.parse(raw);
      if (!data) return;
      const age = Date.now() - ts;
      console.log(`Офлайн-очередь: отправляем данные (${Math.round(age/60000)} мин назад)...`);
      await DOC_REF.set({
        payload:   JSON.stringify(data),
        _version:  Date.now(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      DB._clearQueue();
      DB._online = true;
      console.log('Офлайн-очередь отправлена успешно');
    } catch(e) {
      // Firebase всё ещё недоступен — очередь остаётся
      DB._online = false;
    }
  },

  // 📜 История: получить список последних 10 сохранений
  getSaveHistory() {
    return DB._saveHistory.map(h => ({ ...h, date: new Date(h.ts).toLocaleString() }));
  },

  // ↩️ Откат: вернуть предыдущее сохранённое состояние (индекс 0 = последнее, 1 = пред-последнее и т.д.)
  async rollback(historyIndex) {
    if (!DB._saveHistory[historyIndex]) return { error: 'История не найдена' };
    try {
      const snap = await DOC_REF.get();
      if (!snap.exists) return { error: 'Нет данных для отката' };
      
      let currentData = typeof snap.data().payload === 'string'
        ? JSON.parse(snap.data().payload)
        : snap.data();
      
      // Берём версию из истории и используем её как маркер
      const targetVersion = DB._saveHistory[historyIndex].version;
      
      // Кэшируем текущее состояние в истории перед откатом
      currentData._rolledBackAt = now();
      currentData._rolledBackFrom = DB._version;
      
      await DOC_REF.set({
        payload: JSON.stringify(currentData),
        _version: now(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      DB._version = now();
      return { success: true, message: `Откачено на версию из ${new Date(targetVersion).toLocaleString()}` };
    } catch(e) {
      return { error: e.message };
    }
  },

  // ── Realtime listener ─────────────────────────────────────────────────────
  onSnapshot(callback) {
    return DOC_REF.onSnapshot(
      snap => {
        DB._online = true;
        if (snap.exists) {
          let parsed = typeof snap.data().payload === 'string'
            ? JSON.parse(snap.data().payload)
            : snap.data();
          callback(migrateData({ ...EMPTY_DATA, ...parsed }));
        }
      },
      err => { DB._online = false; console.warn('Snapshot error:', err); }
    );
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
  if (d.ops) d = { ...d, ops: migrateWorkerIds(d.ops) };
  if (!d.productionStages || d.productionStages.length === 0) {
    d = { ...d, productionStages: OPERATION_STAGES.map(name => ({ id: uid(), name, productType: 'boiler' })) };
  }
  // Миграция: пометить этапы без типа как 'boiler'
  if (d.productionStages?.some(s => !s.productType)) {
    d = { ...d, productionStages: d.productionStages.map(s => s.productType ? s : { ...s, productType: 'boiler' }) };
  }
  return d;
};

// ==================== Стили и кнопки ====================
const S = {
  card: { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 12 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', borderBottom: '0.5px solid var(--border-soft)', fontWeight: 500, minHeight: 40 },
  td: { padding: '10px 10px', fontSize: 13, borderBottom: '0.5px solid var(--border-soft)', color: 'var(--fg)', verticalAlign: 'middle', minHeight: 40 },
  inp: { background: 'var(--card)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 16, outline: 'none', minHeight: 44 },
  lbl: { fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block', fontWeight: 500 },
  sec: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, fontWeight: 600 }
};
const abtn = (e) => ({ padding: '10px 16px', background: AM, color: AM2, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 44, ...e });
const gbtn = (e) => ({ padding: '10px 16px', background: 'transparent', color: 'var(--fg)', border: '0.5px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 44, ...e });
const rbtn = (e) => ({ padding: '10px 16px', background: RD3, color: RD2, border: `0.5px solid ${RD}`, borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, minHeight: 44, ...e });

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
    h('div', { style: { background: '#fff', borderRadius: 12, padding: 24, width: 'min(360px,100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } },
      h('div', { style: { fontSize: 15, fontWeight: 500, marginBottom: cfg.detail ? 6 : 20, lineHeight: 1.4 } }, cfg.msg),
      cfg.detail && h('div', { style: { fontSize: 12, color: '#888', marginBottom: 20, lineHeight: 1.5 } }, cfg.detail),
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
  return h('span', { style: { display: 'inline-block', padding: '2px 8px', fontSize: 10, borderRadius: 8, fontWeight: 500, background: s.bg, color: s.cl, border: `0.5px solid ${s.br}` } }, s.label);
});

const Toast = memo(({ message, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return h('div', { className: 'toast', role: 'status', 'aria-live': 'polite' }, message);
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

// ==================== Общие компоненты: MC (MetricCard), TabBar ====================
// MC — карточка метрики (KPI). Использование: h(MC, { v: '42', l: 'Заказов', c: GN, onClick: fn })
const MC = memo(({ v, l, c, onClick, fs }) => h('div', {
  style: { ...S.card, textAlign: 'center', padding: 10, marginBottom: 0, cursor: onClick ? 'pointer' : 'default' },
  onClick
}, h('div', { style: { fontSize: fs || 24, fontWeight: 500, color: c || 'inherit' } }, v),
   h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase', marginTop: 2 } }, l)
));

// TabBar — горизонтальные вкладки. Использование: h(TabBar, { tabs: [['id','Label']], tab, setTab })
const TabBar = memo(({ tabs, tab, setTab }) => h('div', {
  style: { display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', borderBottom: '0.5px solid rgba(0,0,0,0.08)', paddingBottom: 8 }
}, h('div', { className: 'tabs-scroll', style: { display: 'flex', gap: 4 } },
  tabs.map(([id, label]) => h('button', {
    key: id,
    style: tab === id ? abtn({ fontSize: 12 }) : gbtn({ fontSize: 12 }),
    onClick: () => setTab(id)
  }, label))
)));

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
      padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#555', ...style }
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
        padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#555', ...style }
    }, '📥 Загрузить из файла')
  );
});

// ==================== OfflineIndicator (баннер связи) ====================
const OfflineIndicator = memo(() => {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    // Показываем баннер только если реально нет сети браузера
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  if (!offline) return null;
  return h('div', {
    style: { position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
      background: RD, color: '#fff', textAlign: 'center',
      padding: '6px 12px', fontSize: 12, fontWeight: 500 }
  }, '⚡ Нет связи — изменения сохранятся при восстановлении');
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
  const stage = (data.productionStages || []).find(s => s.name === op.name);
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
