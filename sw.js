/* StudyForge service worker — cache-first so the app works offline after the first load. */
var CACHE = 'studyforge-v3-1';
var ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/logic.js',
  'js/session.js',
  'js/storage.js',
  'js/sound.js',
  'js/ui.js',
  'js/fx.js',
  'js/radio.js',
  'vendor/gsap.min.js',
  'js/scene3d.js',
  'js/finale.js',
  'vendor/studyforge3d.bundle.js',
  'fonts/InterTight-var.woff2',
  'fonts/Fraunces-var.woff2',
  'fonts/Fraunces-var-italic.woff2',
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
    return Promise.all(keys.filter(function (k) { return k.indexOf('studyforge-v2') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Leave other sites (e.g. YouTube) alone.
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(function (c) { return c.match(e.request, { ignoreSearch: true }); }).then(function (hit) {
      var network = fetch(e.request).then(function (res) {
        if (res.ok) {
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
