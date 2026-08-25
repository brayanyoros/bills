/* Bills — service worker: cacheia o app shell pra abrir rápido e funcionar offline
   (gráficos/Excel dependem de CDN e não funcionam sem internet, como já avisado no app). */
var CACHE_NAME = 'bills-shell-v3';
var APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './storage.js',
  './finance.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var isSameOrigin = new URL(event.request.url).origin === self.location.origin;

  if (isSameOrigin) {
    // Arquivos do próprio app: serve do cache primeiro (abre instantâneo), atualiza em segundo plano.
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        var networkFetch = fetch(event.request).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || networkFetch;
      })
    );
  } else {
    // CDN (fontes, Chart.js, SheetJS): tenta a rede primeiro, cai pro cache se offline.
    event.respondWith(
      fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return res;
      }).catch(function () { return caches.match(event.request); })
    );
  }
});
