// teploros Service Worker v3 — модульная структура
const CACHE_NAME = 'teploros-v5-20260427';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/core.js',
  './js/shared.js',
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
  // CDN (кешируются при первом запросе)
];

// Установка — кешируем все локальные файлы
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Активация — удаляем старые кеши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Запросы — network-first для JS/HTML (всегда свежий код), cache-first для CDN
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase, Google Analytics — не кешируем
  if (url.hostname.includes('firebasejs') || url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis') || url.hostname.includes('googletagmanager') ||
      url.hostname.includes('google-analytics')) {
    return;
  }

  // Локальные файлы (JS, HTML) — network-first
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN (Chart.js, XLSX, React, etc.) — cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// Обработка сообщений (SKIP_WAITING от update-banner)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
