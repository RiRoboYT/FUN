/* StudyForge service worker — cache-first so the app works offline after the first load. */
var CACHE = 'studyforge-v1';
var ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/logic.js',
  'js/session.js',
  'js/storage.js',
  'js/sound.js',
  'js/ui.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('studyforge-v1') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(e.request).then(function (res) {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
      // Serve the cache instantly and refresh it in the background.
      return hit ? (network.catch(function () {}), hit) : network;
    })
  );
});
