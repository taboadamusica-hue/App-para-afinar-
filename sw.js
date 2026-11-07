// Service worker: funciona sin conexión y lanza recordatorios recurrentes
// aunque la app esté cerrada (donde el navegador admite Periodic Background Sync).

const CACHE = 'afinador-ia-v1';
const CONFIG = 'afinador-ia-config';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/pitch.js', 'js/instruments.js', 'js/memory.js', 'js/assistant.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== CONFIG).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});

// Configuración mínima enviada desde la app (nunca sale del dispositivo)
self.addEventListener('message', (e) => {
  if (e.data?.type === 'sync-reminder') {
    e.waitUntil(writeConfig(e.data.payload));
  }
});

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'recordatorio-practica') e.waitUntil(checkReminder());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    const open = list.find((c) => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});

async function readConfig() {
  const c = await caches.open(CONFIG);
  const r = await c.match('config');
  return r ? r.json() : null;
}

async function writeConfig(cfg) {
  const c = await caches.open(CONFIG);
  await c.put('config', new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json' } }));
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function checkReminder() {
  const cfg = await readConfig();
  if (!cfg?.reminder?.enabled) return;
  // Si hay una ventana abierta, la propia app se encarga del aviso
  const windows = await self.clients.matchAll({ type: 'window' });
  if (windows.length) return;

  const now = new Date();
  const today = dayKey(now);
  if (!cfg.reminder.days.includes(now.getDay()) || cfg.lastReminderDate === today) return;
  if (cfg.lastPractice && dayKey(new Date(cfg.lastPractice)) === today) return;
  const [h, m] = cfg.reminder.time.split(':').map(Number);
  const due = new Date(now); due.setHours(h, m, 0, 0);
  if (now < due || now - due > 3 * 3600000) return;

  const days = cfg.lastPractice ? Math.floor((now - cfg.lastPractice) / 86400000) : null;
  const body = days && days >= 2
    ? `Hace ${days} días que no afinas. Cinco minutos ahora y tu instrumento te lo agradecerá.`
    : 'Es tu hora de práctica. Afina antes de tocar.';
  await self.registration.showNotification('Afinador IA', { body, icon: 'icon.svg', tag: 'afinador-ia' });
  await writeConfig({ ...cfg, lastReminderDate: today });
}
