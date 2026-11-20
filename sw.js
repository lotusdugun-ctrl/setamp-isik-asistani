const CACHE_NAME = 'setamp-pro-v14';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data-cables.js',
  './js/data-fixtures.js',
  './js/data-templates.js',
  './js/calc.js',
  './js/solar.js',
  './js/solar-ui.js',
  './js/distro-ui.js',
  './js/app.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/lamps/arri-hmi.jpg',
  './assets/lamps/arri-skypanel.jpg',
  './assets/lamps/aputure-cob.jpg',
  './assets/lamps/godox-cob.jpg',
  './assets/lamps/hard-panel.jpg',
  './assets/lamps/led-tubes.svg',
  './assets/lamps/flex-mat.svg',
  './assets/lamps/tungsten-fresnel.svg',
  './assets/lamps/dino-bank.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-First: çevrimiçiyken her zaman güncel dosyayı al, çevrimdışıyken önbellekten sun
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
