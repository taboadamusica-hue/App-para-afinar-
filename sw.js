// Service worker: funciona sin conexión.
const CACHE = 'musicman-v3';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'fonts/figtree-latin.woff2',
  'js/app.js', 'js/pitch.js', 'js/analysis.js', 'js/audio.js', 'js/db.js', 'js/draw.js', 'js/tracker.js'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
// Red primero, caché como respaldo (así las actualizaciones llegan enseguida)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
