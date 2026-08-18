// teploros Service Worker v4 — Итерация 4: cache-first для версионированных файлов
const APP_CACHE = 'teploros-app-v20261006';
const CDN_CACHE = 'teploros-cdn-v1';
const CDN_MAX_ENTRIES = 20; // 4.2: лимит записей CDN-кеша

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/core.js',
  './js/shared.js',
  './js/qms.js',
  './js/gdrive.js',
  './js/spec-parser.js',
  './js/drawing-parser.js',
  './js/analytics.js',
  './js/timesheet.js',
  './js/auxops.js',
  './js/reference.js',
  './js/quality.js',
  './js/hr.js',
  './js/chat.js',
  './js/warehouse.js',
  './js/master.js',
  './js/worker.js',
  './js/app.js',
  './78878.webp',
];

// Установка — кешируем по одному, не падаем если файл недоступен
// 4.3: skipWaiting() возвращён — без него новый SW ждёт закрытия всех вкладок,
// и пользователи застревают на старой версии. Баннер остаётся для UI-уведомления,
// но перезагрузка теперь происходит автоматически через controllerchange → reload.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache =>
      Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] skip:', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

// Активация — удаляем старые APP-кеши + чистим CDN-кеш (4.2)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(n => n.startsWith('teploros-app-') && n !== APP_CACHE)
          .map(n => caches.delete(n))
      )
    ).then(() =>
      // 4.2: CDN-кеш растёт бесконечно — оставляем последние CDN_MAX_ENTRIES записей
      caches.open(CDN_CACHE).then(cache =>
        cache.keys().then(requests => {
          const excess = requests.slice(0, Math.max(0, requests.length - CDN_MAX_ENTRIES));
          return Promise.all(excess.map(r => cache.delete(r)));
        })
      ).catch(() => {})
    )
  );
  self.clients.claim();
});

// Запросы
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Сторонние сервисы — не кешируем, пропускаем напрямую
  if (url.origin !== location.origin) {
    // CDN (React, XLSX, pdfmake, Chart.js и т.д.) — cache-first
    if (
      url.hostname.includes('cdnjs.cloudflare.com') ||
      url.hostname.includes('cdn.jsdelivr.net') ||
      url.hostname.includes('unpkg.com') ||
      url.hostname.includes('gstatic.com')
    ) {
      event.respondWith(
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CDN_CACHE).then(cache => cache.put(event.request, clone));
            }
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      );
      return;
    }
    // Всё остальное внешнее (Firebase, Google, Analytics) — только сеть, не трогаем
    return;
  }

  // Навигационные запросы (?opId=..., ?receive=... и т.д.) — всегда отдаём index.html
  // caches.match не найдёт URL с query-параметрами, поэтому ищем index.html явно
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then(cached =>
            cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          )
        )
    );
    return;
  }

  // 4.1: Версионированные локальные файлы (?v=...) — CACHE-FIRST
  // Версия в URL гарантирует свежесть: при деплое URL меняется → кеш промахивается → файл грузится из сети.
  // Это безопасно и экономит 1–2 сек на каждом открытии приложения.
  if (url.origin === location.origin && url.search.includes('v=')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  // Локальные статические файлы БЕЗ версии (иконки, manifest и т.д.) — network-first с fallback в кеш
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response('', { status: 503 })
        )
      )
  );
});

// SKIP_WAITING от update-banner
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Push-уведомление ОТК: воркер отправляет NOTIFY_QC с данными операции
  if (event.data?.type === 'NOTIFY_QC') {
    const { opName, orderNumber } = event.data;
    self.registration.showNotification('🔍 Требуется контроль ОТК', {
      body: 'Заказ ' + orderNumber + ' · ' + opName,
      icon: './78878.webp',
      badge: './78878.webp',
      tag: 'qc-' + Date.now(),
      requireInteraction: true,
      data: { url: self.registration.scope }
    });
  }
});

// Клик по уведомлению — открыть/сфокусировать вкладку
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(self.registration.scope));
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data?.url || self.registration.scope);
    })
  );
});
