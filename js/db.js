// Almacenamiento local con IndexedDB (canciones, tomas con audio, entrenamientos).
const DB_NAME = 'afinavoz'; // nombre interno heredado: no cambiarlo o se perderían los datos guardados
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('takes')) db.createObjectStore('takes', { keyPath: 'id' }).createIndex('songId', 'songId');
      if (!db.objectStoreNames.contains('training')) db.createObjectStore('training', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const all = (store) => tx(store, 'readonly', (s) => s.getAll());
export const get = (store, id) => tx(store, 'readonly', (s) => s.get(id));
export const put = (store, obj) => tx(store, 'readwrite', (s) => s.put(obj));
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());
export const takesBySong = (songId) => tx('takes', 'readonly', (s) => s.index('songId').getAll(songId));

/** Frames ⇄ formato compacto para guardar. */
export const packFrames = (frames) => frames.map((f) => [+f.t.toFixed(3), +f.f.toFixed(2), +f.c.toFixed(3), +f.a.toFixed(5), Math.round(f.b)]);
export const unpackFrames = (rows) => rows.map(([t, f, c, a, b]) => ({ t, f, c, a, b }));
