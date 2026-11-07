// Memoria local del asistente. Nunca sale del dispositivo: solo localStorage
// y, para los recordatorios en segundo plano, la Cache del service worker.

const KEY = 'afinador-ia-memoria-v1';

export function defaultMemory() {
  return {
    version: 1,
    settings: {
      instrument: 'guitarra',
      a4: 440,
      proactive: true,
      reminder: { enabled: false, time: '19:00', days: [1, 2, 3, 4, 5, 6, 0] },
      weeklySummary: true,
    },
    sessions: [],          // { start, end, instrument, tuned }
    strings: {},           // 'instrumento:midi' -> estadísticas
    lastReminderDate: null,
    lastWeeklySummary: null,
    lastGreeting: null,
    feed: [],              // { t, text, kind, from }
  };
}

export function loadMemory() {
  const base = defaultMemory();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      ...base,
      ...saved,
      settings: { ...base.settings, ...saved.settings, reminder: { ...base.settings.reminder, ...(saved.settings?.reminder || {}) } },
    };
  } catch {
    return base;
  }
}

export function saveMemory(mem) {
  mem.sessions = mem.sessions.slice(-300);
  mem.feed = mem.feed.slice(-80);
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch { /* almacenamiento no disponible: la app sigue funcionando en memoria */ }
  syncToServiceWorker(mem);
}

export function clearMemory() {
  try { localStorage.removeItem(KEY); } catch { /* nada */ }
  const fresh = defaultMemory();
  syncToServiceWorker(fresh);
  return fresh;
}

export function exportMemory(mem) {
  return new Blob([JSON.stringify(mem, null, 2)], { type: 'application/json' });
}

// El service worker no puede leer localStorage, así que le pasamos solo lo
// mínimo para poder lanzar recordatorios cuando la app está cerrada.
function syncToServiceWorker(mem) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const lastSession = mem.sessions[mem.sessions.length - 1];
  navigator.serviceWorker.controller.postMessage({
    type: 'sync-reminder',
    payload: {
      reminder: mem.settings.reminder,
      lastReminderDate: mem.lastReminderDate,
      lastPractice: lastSession ? lastSession.end || lastSession.start : null,
    },
  });
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
