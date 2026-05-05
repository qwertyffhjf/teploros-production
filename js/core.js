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
    isWorkerOnShift(w, data.timesheet) &&
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
    const activeWorkers = data.workers.filter(w => !w.archived && isWorkerOnShift(w, data.timesheet));

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

// Защита: если Firebase CDN не загрузился (сеть недоступна) — не крашим весь core.js.
// Приложение запустится в офлайн-режиме из кэша Service Worker.
if (typeof firebase === 'undefined') {
  console.warn('Firebase CDN не загрузился — работаем из кэша');
} else {
firebase.initializeApp({
  apiKey: "AIzaSyAR4Hvt4I80tbQKI2HLTKM8rbLSas2QFDw",
  authDomain: "teploros-11774.firebaseapp.com",
  projectId: "teploros-11774",
  storageBucket: "teploros-11774.firebasestorage.app",
  messagingSenderId: "151146225873",
  appId: "1:151146225873:web:f37d7ce9f9859dcb5de5f0"
});
}
const firestore = typeof firebase !== 'undefined' ? firebase.firestore() : null;
const DOC_REF    = firestore ? firestore.collection('app').doc('production_v14') : null;
const WH_DOC_REF = firestore ? firestore.collection('app').doc('warehouse_v1') : null;   // Склад — отдельный документ
const PRESENCE_REF = firestore.collection('presence');

// Поля которые живут в warehouse_v1 (не в production_v14)
const WH_FIELDS = ['materials','bomTemplates','materialConsumptions','materialReservations','materialDeliveries','equipment'];

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
    productTypes: [{ id: 'boiler', label: 'Котлы' }, { id: 'bmk', label: 'БМК' }]
  }
};

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



// ==================== canShipOrder ====================
// Проверяет готовность заказа к отгрузке с учётом комплектующих
const canShipOrder = (order) => {
  if (!order) return false;
  const components = order.components || [];
  if (components.length === 0) return true;
  return components.every(c => c.status === 'confirmed');
};

// Статус комплектующих заказа
const getComponentsStatus = (order) => {
  const components = order?.components || [];
  if (components.length === 0) return null;
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
  if (cell.h > 0)                                 return 'working';
  return 'absent';
};

// Проверяет что сотрудник сейчас на смене (источник — табель, fallback — w.status)
const isWorkerOnShift = (worker, timesheet) => {
  const fromTs = getWorkerStatusToday(worker.id, timesheet);
  if (fromTs !== null) return fromTs === 'working';
  return (worker.status || 'working') === 'working';
};

// ==================== useTheme ====================
// Хук управления темой: light / dark / system
// Сохраняет выбор в localStorage, применяет класс на <html>
const useTheme = () => {
  const stored = localStorage.getItem('tp_theme') || 'system';
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
    localStorage.setItem('tp_theme', t);
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
    h('div', { className: 'modal-animated', style: { background: '#fff', borderRadius: 16, padding: 28, width: 'min(400px, 100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' } },

      !delivery
        ? h('div', { style: { textAlign: 'center', padding: 24 } },
            h('div', { style: { fontSize: 40, marginBottom: 12 } }, '❌'),
            h('div', { style: { fontSize: 16, fontWeight: 500, color: RD2, marginBottom: 8 } }, 'Поставка не найдена'),
            h('div', { style: { fontSize: 13, color: '#888', marginBottom: 20 } }, `ID: ${deliveryId}`),
            h('button', { style: gbtn({ width: '100%' }), onClick: onClose }, 'Закрыть')
          )

        : delivery.status === 'confirmed'
          ? h('div', { style: { textAlign: 'center', padding: 24 } },
              h('div', { style: { fontSize: 40, marginBottom: 12 } }, '✅'),
              h('div', { style: { fontSize: 16, fontWeight: 500, color: GN2, marginBottom: 8 } }, 'Поставка уже подтверждена'),
              h('div', { style: { fontSize: 13, color: '#888', marginBottom: 4 } }, mat?.name),
              h('div', { style: { fontSize: 13, color: '#888', marginBottom: 20 } }, `Заказ: ${order?.number || delivery.orderId}`),
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
                  h('div', null, h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Заказ'), h('div', { style: { fontWeight: 500, color: AM2 } }, order?.number || delivery.orderId)),
                  h('div', null, h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Этап'), h('div', { style: { fontWeight: 500 } }, delivery.stageName)),
                  h('div', null, h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Требуется'), h('div', { style: { fontWeight: 500, color: RD2 } }, `${delivery.requiredQty} ${delivery.unit}`)),
                  delivery.deliveredQty > 0 && h('div', null, h('div', { style: { fontSize: 10, color: '#888', textTransform: 'uppercase' } }, 'Уже принято'), h('div', { style: { fontWeight: 500, color: GN2 } }, `${delivery.deliveredQty} ${delivery.unit}`))
                )
              ),

              // Ввод количества
              h('div', { style: { marginBottom: 14 } },
                h('label', { style: { fontSize: 12, color: '#666', display: 'block', marginBottom: 6 } }, `Принято фактически (${delivery.unit})`),
                h('input', {
                  type: 'number', min: 0, autoFocus: true,
                  style: { width: '100%', padding: '12px 14px', fontSize: 18, fontWeight: 500, border: `2px solid ${AM}`, borderRadius: 8, outline: 'none', textAlign: 'center' },
                  value: qty,
                  onChange: e => setQty(e.target.value)
                })
              ),

              // Примечание
              h('div', { style: { marginBottom: 20 } },
                h('label', { style: { fontSize: 12, color: '#666', display: 'block', marginBottom: 6 } }, 'Примечание (накладная, поставщик)'),
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
    await DB._flushQueue();

    // Если Firebase не загрузился (CDN недоступен) — сразу идём в кэш
    if (!DOC_REF) {
      console.warn('Firebase недоступен — загружаем из кэша');
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data: cacheData } = JSON.parse(cached);
          return { ...EMPTY_DATA, ...cacheData };
        }
      } catch(e) {}
      return EMPTY_DATA;
    }

    try {
      // Загружаем оба документа параллельно
      const [snap, whSnap] = await Promise.all([
        DOC_REF.get(),
        WH_DOC_REF.get()
      ]);
      if (snap.exists) {
        let parsed = typeof snap.data().payload === 'string'
          ? JSON.parse(snap.data().payload)
          : snap.data();
        // Подмешиваем данные склада
        if (whSnap.exists) {
          let whParsed = typeof whSnap.data().payload === 'string'
            ? JSON.parse(whSnap.data().payload)
            : whSnap.data();
          WH_FIELDS.forEach(f => { if (whParsed[f] !== undefined) parsed[f] = whParsed[f]; });
          try { localStorage.setItem(WH_CACHE_KEY, JSON.stringify({ data: whParsed, savedAt: Date.now() })); } catch(e) {}
        }
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
    // Firebase недоступен — объединяем оба кэша
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        let cacheData = cached.data || cached;
        // Подмешиваем кэш склада
        try {
          const whRaw = localStorage.getItem(WH_CACHE_KEY);
          if (whRaw) {
            const whCached = JSON.parse(whRaw);
            const whData = whCached.data || whCached;
            WH_FIELDS.forEach(f => { if (whData[f] !== undefined) cacheData[f] = whData[f]; });
          }
        } catch(e) {}
        const savedAt = cached.savedAt || 0;
        const age = Date.now() - savedAt;
        if (age > CACHE_TTL) {
          console.warn('Cache TTL expired (' + Math.round(age/3600000) + 'h old)');
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

      // ── Стрипаем null/false/пустые поля из операций — экономит ~60% размера ops ──
      const OP_DEFAULTS = {
        workerQty: '{}', plannedHours: null, archived: false, sectionId: null,
        equipmentId: null, plannedStartDate: null, drawingUrl: null,
        defectNote: null, defectReasonId: null, defectSource: null,
        hiddenFromFeed: false, checklistDone: '[]', weldParams: null,
        finishedAt: null, startedAt: null, dependsOn: '[]', photos: '[]'
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
        toSave.events               = (toSave.events || []).slice(-1000);
        toSave.materialConsumptions = (toSave.materialConsumptions || []).slice(-1000);
        // Оставляем только последние 3 месяца табеля
        toSave.timesheet = pruneTimesheet(toSave.timesheet, 3);
        const sizeAfter = Math.round(JSON.stringify(toSave).length / 1024);
        DB._lastError = `⚠ Данных ${sizeKb}→${sizeAfter} КБ — лимит 1 МБ. Старые данные очищены.`;
        console.warn(`Payload: ${sizeKb} KB → ${sizeAfter} KB after pruning`);
      } else if (sizeKb > 700) {
        // Превентивно: оставляем последние 6 месяцев
        toSave.timesheet = pruneTimesheet(toSave.timesheet, 6);
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
            // Разделяем данные: складские → warehouse_v1, остальное → production_v14
            const whData = {};
            const mainData = { ...toSave };
            WH_FIELDS.forEach(f => {
              if (mainData[f] !== undefined) {
                whData[f] = mainData[f];
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
            await Promise.all(savePromises);
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
    // Храним последние данные из обоих документов для слияния
    let lastMain = null;
    let lastWh   = null;

    const merge = () => {
      if (!lastMain) return;
      const merged = { ...EMPTY_DATA, ...lastMain };
      if (lastWh) WH_FIELDS.forEach(f => { if (lastWh[f] !== undefined) merged[f] = lastWh[f]; });
      callback(migrateData(merged));
    };

    const unsubMain = DOC_REF.onSnapshot(
      snap => {
        DB._online = true;
        if (DB._saving) return; // Блокируем входящие пока сами сохраняем
        if (snap.exists) {
          lastMain = typeof snap.data().payload === 'string'
            ? JSON.parse(snap.data().payload)
            : snap.data();
          merge();
        }
      },
      err => { DB._online = false; console.warn('Snapshot error:', err); }
    );

    const unsubWh = WH_DOC_REF.onSnapshot(
      snap => {
        if (DB._saving) return;
        if (snap.exists) {
          lastWh = typeof snap.data().payload === 'string'
            ? JSON.parse(snap.data().payload)
            : snap.data();
          merge();
        }
      },
      err => console.warn('WH Snapshot error:', err)
    );

    // Возвращаем функцию отписки от обоих
    return () => { unsubMain(); unsubWh(); };
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
    h('div', { className: 'modal-animated', style: { background: '#fff', borderRadius: 12, padding: 24, width: 'min(360px,100%)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } },
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
const useDirtyGuard = (isDirty, onClose, message = 'Есть несохранённые изменения. Закрыть без сохранения?', ask = null) => {
  return useCallback(async () => {
    if (!isDirty) { onClose(); return; }
    let ok;
    if (typeof ask === 'function') {
      ok = await ask({
        message,
        detail: 'Введённые данные будут потеряны',
        danger: true,
        confirmText: 'Закрыть',
        cancelText: 'Остаться',
      });
    } else {
      ok = window.confirm(message);
    }
    if (ok) onClose();
  }, [isDirty, onClose, message, ask]);
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
const EmptyState = memo(({ icon, title, desc, action, onAction, positive = false, compact = false }) => {
  return h('div', {
    className: 'op-card-anim',
    style: {
      textAlign: 'center',
      padding: compact ? '20px 16px' : '36px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: compact ? 6 : 10,
    }
  },
    // Иконка в кружке
    h('div', {
      style: {
        width:  compact ? 44 : 64,
        height: compact ? 44 : 64,
        borderRadius: '50%',
        background: positive ? GN3 : 'var(--border-soft, #f0ede8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: compact ? 20 : 28,
        marginBottom: compact ? 0 : 4,
        flexShrink: 0,
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
    }, `+ ${action}`)
  );
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
        background: '#fff',
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
          fontSize: 13, color: '#666', lineHeight: 1.5,
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
        background: 'var(--card, #fff)',
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
    h('div', { style: { fontSize: 9, color: '#888', textTransform: 'uppercase', marginTop: 2 } }, l)
  );
});

// TabBar — горизонтальные вкладки с анимированным индикатором активной вкладки.
// Использование: h(TabBar, { tabs: [['id','Label']], tab, setTab })
const TabBar = memo(({ tabs, tab, setTab }) => h('div', {
  style: { display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', borderBottom: '0.5px solid rgba(0,0,0,0.08)', paddingBottom: 8 }
},
  h('div', { className: 'tabs-scroll', style: { display: 'flex', gap: 4 } },
    tabs.map(([id, label]) => h('button', {
      key: id,
      style: {
        ...(tab === id ? abtn({ fontSize: 12 }) : gbtn({ fontSize: 12 })),
        position: 'relative',
        transition: 'background 0.18s, color 0.18s, transform 0.12s',
      },
      onClick: () => { navigator.vibrate?.([15]); setTab(id); },
      onMouseEnter: (e) => { if (tab !== id) e.currentTarget.style.transform = 'translateY(-1px)'; },
      onMouseLeave: (e) => { e.currentTarget.style.transform = ''; },
    }, label))
  )
));

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
