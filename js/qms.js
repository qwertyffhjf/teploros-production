// ==================== QMS (Quality Management System) ====================

/**
 * Структура дефекта:
 * {
 *   id: string,
 *   orderId: string,
 *   opId: string (операция где обнаружена),
 *   workerId: string (кто обнаружил),
 *   operationName: string (название этапа),
 *   
 *   // Описание дефекта
 *   defectType: string (категория),
 *   description: string (что именно),
 *   source: 'this_stage' | 'previous_stage' (где возник дефект),
 *   
 *   // Метаданные
 *   createdAt: number (timestamp),
 *   status: 'open' | 'investigating' | 'resolved' | 'wontfix',
 *   
 *   // Разбор дефекта
 *   investigationDate: number,
 *   investigatedBy: string (кто разбирался),
 *   rootCause: string (причина),
 *   preventiveMeasure: string (какие меры принять),
 *   investigationNotes: string (примечания)
 * }
 */

// Стандартные типы дефектов (по ГОСТ 15895)
const DEFECT_TYPES = [
  'Геометрия (размер, форма)',
  'Сварка (неполный шов, раковина)',
  'Коррозия/Окраска',
  'Механические повреждения',
  'Упаковка',
  'Прочее'
];

// ==================== Создание дефекта ====================
const createDefect = (orderId, opId, workerId, operationName, defectType, description, source = 'this_stage') => ({
  id: `def_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  orderId,
  opId,
  workerId,
  operationName,
  defectType,
  description,
  source, // 'this_stage' = дефект от этого рабочего, 'previous_stage' = унаследован с предыдущего
  createdAt: Date.now(),
  status: 'open',
  investigationDate: null,
  investigatedBy: null,
  rootCause: null,
  preventiveMeasure: null,
  investigationNotes: null
});

// ==================== Аналитика дефектов ====================

/**
 * Парето анализ дефектов (80/20 правило)
 * Возвращает типы дефектов отсортированные по количеству с процентом
 */
const paretoDefectAnalysis = (defects) => {
  const byType = {};
  defects.forEach(d => {
    byType[d.defectType] = (byType[d.defectType] || 0) + 1;
  });
  
  const total = defects.length;
  const sorted = Object.entries(byType)
    .map(([type, count]) => ({ type, count, percent: Math.round(count / total * 100) }))
    .sort((a, b) => b.count - a.count);
  
  let cumulative = 0;
  return sorted.map(item => {
    cumulative += item.percent;
    return { ...item, cumulative };
  });
};

/**
 * Анализ источников дефектов
 * Какие дефекты "с предыдущего этапа" (не виноват текущий рабочий)
 */
const defectSourceAnalysis = (defects) => {
  const thisStage = defects.filter(d => d.source === 'this_stage').length;
  const previousStage = defects.filter(d => d.source === 'previous_stage').length;
  const total = defects.length;
  
  return {
    thisStage,
    previousStage,
    total,
    thisStagePercent: total > 0 ? Math.round(thisStage / total * 100) : 0,
    previousStagePercent: total > 0 ? Math.round(previousStage / total * 100) : 0
  };
};

/**
 * Дефекты по этапам (какой этап даёт больше всего дефектов?)
 */
const defectsByStage = (defects) => {
  const byOp = {};
  defects.forEach(d => {
    const key = `${d.operationName}`;
    byOp[key] = (byOp[key] || 0) + 1;
  });
  
  return Object.entries(byOp)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Статистика по рабочим (кто как обнаруживает дефекты)
 * Не как "виновный" а как "контролёр"
 */
const defectDetectionByWorker = (defects, data) => {
  const byWorker = {};
  defects.forEach(d => {
    if (!byWorker[d.workerId]) {
      const w = data.workers?.find(x => x.id === d.workerId);
      byWorker[d.workerId] = { workerId: d.workerId, workerName: w?.name || '?', detected: 0, prevented: 0 };
    }
    byWorker[d.workerId].detected++;
    
    // Если "with source previous_stage" и этот рабочий это обнаружил - он помог предотвратить проблему
    if (d.source === 'previous_stage') {
      byWorker[d.workerId].prevented++;
    }
  });
  
  return Object.values(byWorker).sort((a, b) => b.detected - a.detected);
};

/**
 * Тренды дефектов во времени
 * Кол-во дефектов по дням/неделям
 */
const defectTrend = (defects, periodDays = 30) => {
  const now = Date.now();
  const startDate = now - periodDays * 86400000;
  
  const byDay = {};
  defects.filter(d => d.createdAt >= startDate).forEach(d => {
    const day = new Date(d.createdAt).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  
  return Object.entries(byDay)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Поиск дефектов - для фильтрации и анализа
 */
const filterDefects = (defects, { orderId = null, opId = null, status = null, source = null, workerId = null } = {}) => {
  return defects.filter(d => {
    if (orderId && d.orderId !== orderId) return false;
    if (opId && d.opId !== opId) return false;
    if (status && d.status !== status) return false;
    if (source && d.source !== source) return false;
    if (workerId && d.workerId !== workerId) return false;
    return true;
  });
};

/**
 * Синтез: КПІ для дашборда
 */
const qmsKPI = (defects, data) => {
  const total = defects.length;
  const open = defects.filter(d => d.status === 'open').length;
  const investigating = defects.filter(d => d.status === 'investigating').length;
  const resolved = defects.filter(d => d.status === 'resolved').length;
  
  const sourceAnalysis = defectSourceAnalysis(defects);
  const paretoData = paretoDefectAnalysis(defects);
  const topDefect = paretoData[0];
  
  return {
    totalDefects: total,
    openDefects: open,
    investigatingDefects: investigating,
    resolvedDefects: resolved,
    resolutionRate: total > 0 ? Math.round(resolved / total * 100) : 0,
    previousStagePercent: sourceAnalysis.previousStagePercent,
    topDefectType: topDefect?.type || '—',
    topDefectPercent: topDefect?.percent || 0,
    averageResolutionTime: calculateAverageResolutionTime(defects)
  };
};

/**
 * Среднее время разрешения дефекта
 */
const calculateAverageResolutionTime = (defects) => {
  const resolved = defects.filter(d => d.status === 'resolved' && d.investigationDate && d.createdAt);
  if (resolved.length === 0) return 0;
  
  const avgMs = resolved.reduce((sum, d) => sum + (d.investigationDate - d.createdAt), 0) / resolved.length;
  return Math.round(avgMs / 3600000); // часы
};
