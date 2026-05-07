// teploros Service Worker v3 — устойчивое кеширование
const APP_CACHE = 'teploros-app-v20260507';
const CDN_CACHE = 'teploros-cdn-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/core.js',
  './js/shared.js',
  './js/qms.js',
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
];

// Установка — кешируем по одному, не падаем если файл недоступен
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

// Активация — удаляем только старые APP-кеши, CDN не трогаем
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(n => n.startsWith('teploros-app-') && n !== APP_CACHE)
          .map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Запросы
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase, Google Analytics — не кешируем, всегда сеть
  if (
    url.hostname.includes('firebasejs') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('googletagmanager') ||
    url.hostname.includes('google-analytics')
  ) {
    return;
  }

  // Локальные файлы (JS, HTML) — network-first с fallback в кеш
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(APP_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // CDN (Chart.js, XLSX, React, pdfmake...) — cache-first, отдельный кеш
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CDN_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request));
    })
  );
});

// SKIP_WAITING от update-banner
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
