// Dibujo en canvas: rollo de piano tipo "Melodyne", gráficas y anillos.
import { noteName, SCALES } from './pitch.js';

export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function setupCanvas(canvas) {
  if (!canvas.dataset.h) canvas.dataset.h = canvas.getAttribute('height');
  const h = +canvas.dataset.h;
  canvas.style.height = h + 'px';
  const w = canvas.clientWidth || 300;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

export const errColor = (absCents) => (absCents <= 15 ? cssVar('--accent') : absCents <= 30 ? cssVar('--warn') : cssVar('--bad'));

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Rollo de piano.
 * o = { points:[{t,midi|null}], notes:[{start,end,target,meanCents,absCents}], lanes:[{start,end,midi}],
 *       t0, t1, lo, hi, keyPc, scale, notation, playhead }
 */
export function drawRoll(canvas, o) {
  const { ctx, w, h } = setupCanvas(canvas);
  const { t0, t1, keyPc = 0, scale = 'chromatic', notation = 'latin' } = o;
  const lo = Math.floor(o.lo), hi = Math.ceil(o.hi);
  const gutter = 38;
  const rowH = h / (hi - lo + 1);
  const x = (t) => gutter + ((t - t0) / (t1 - t0)) * (w - gutter);
  const y = (m) => h - (m - lo + 0.5) * rowH;
  const steps = (SCALES[scale] || SCALES.chromatic).steps;

  ctx.fillStyle = cssVar('--roll-bg');
  ctx.fillRect(0, 0, w, h);
  ctx.font = `600 ${Math.min(11, Math.max(8, rowH * 0.7))}px Figtree, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  for (let m = lo; m <= hi; m++) {
    const pc = (((m - keyPc) % 12) + 12) % 12;
    const inScale = scale !== 'chromatic' && steps.includes(pc);
    if (inScale || m % 2 === 0) {
      ctx.fillStyle = inScale ? cssVar('--roll-scale') : cssVar('--roll-row');
      ctx.fillRect(gutter, y(m) - rowH / 2, w - gutter, rowH);
    }
    if (rowH >= 9 || m % 12 === 0 || pc === 0) {
      ctx.fillStyle = cssVar('--muted');
      ctx.fillText(noteName(m, notation), 3, y(m));
    }
  }

  // Franja de tesitura en el margen: verde = zona cómoda, ámbar = extensión
  if (o.band) {
    for (let m = lo; m <= hi; m++) {
      const inComfort = m >= o.band.comfort[0] && m <= o.band.comfort[1];
      const inRange = m >= o.band.range[0] && m <= o.band.range[1];
      if (!inRange) continue;
      ctx.fillStyle = inComfort ? cssVar('--accent') : cssVar('--warn');
      ctx.globalAlpha = inComfort ? 0.9 : 0.6;
      ctx.fillRect(gutter - 4, y(m) - rowH / 2 + 0.5, 3, rowH - 1);
    }
    ctx.globalAlpha = 1;
  }

  // Carriles objetivo (ejercicios)
  for (const l of o.lanes || []) {
    if (l.end < t0 || l.start > t1) continue;
    ctx.fillStyle = cssVar('--accent-soft');
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 1;
    roundRect(ctx, x(l.start), y(l.midi) - rowH / 2, x(l.end) - x(l.start), rowH, 5);
    ctx.fill(); ctx.stroke();
  }

  // Bloques de nota (posición vertical = nota + desviación media)
  for (const n of o.notes || []) {
    if (n.end < t0 || n.start > t1) continue;
    const yy = y(n.target + n.meanCents / 100);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = errColor(n.absCents);
    roundRect(ctx, x(n.start), yy - rowH * 0.45, Math.max(4, x(n.end) - x(n.start)), rowH * 0.9, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    // línea fina en la nota correcta
    ctx.strokeStyle = cssVar('--muted');
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x(n.start), y(n.target)); ctx.lineTo(x(n.end), y(n.target)); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Curva de tono
  ctx.strokeStyle = cssVar('--curve');
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let pen = false, prevT = -1;
  for (const p of o.points || []) {
    if (p.t < t0 - 0.1 || p.t > t1 + 0.1) { pen = false; continue; }
    if (p.midi == null || p.t - prevT > 0.1) pen = false;
    if (p.midi != null) {
      if (pen) ctx.lineTo(x(p.t), y(p.midi)); else ctx.moveTo(x(p.t), y(p.midi));
      pen = true;
    }
    prevT = p.t;
  }
  ctx.stroke();

  if (o.playhead != null && o.playhead >= t0 && o.playhead <= t1) {
    ctx.strokeStyle = cssVar('--text');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x(o.playhead), 0); ctx.lineTo(x(o.playhead), h); ctx.stroke();
  }
}

/** Gráfica de línea simple. series = [{x:number(ms), y}] */
export function drawChart(canvas, series, { yMin, yMax, color, fmt = (v) => v.toFixed(0), empty = 'Sin datos todavía' } = {}) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.font = '600 11px Figtree, system-ui, sans-serif';
  if (series.length === 0) {
    ctx.fillStyle = cssVar('--muted');
    ctx.textAlign = 'center';
    ctx.fillText(empty, w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }
  const ys = series.map((p) => p.y);
  const lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys, lo + 1);
  const L = 30, R = 8, T = 8, B = 20;
  const X = (i) => L + (series.length === 1 ? (w - L - R) / 2 : (i / (series.length - 1)) * (w - L - R));
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  ctx.strokeStyle = cssVar('--line');
  ctx.fillStyle = cssVar('--muted');
  ctx.textBaseline = 'middle';
  for (let k = 0; k <= 2; k++) {
    const v = lo + ((hi - lo) * k) / 2;
    ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w - R, Y(v)); ctx.stroke();
    ctx.fillText(fmt(v), 2, Y(v));
  }
  const d = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(d(series[0].x), L, h - 4);
  if (series.length > 1) { ctx.textAlign = 'right'; ctx.fillText(d(series[series.length - 1].x), w - R, h - 4); ctx.textAlign = 'left'; }
  const c = color || cssVar('--accent');
  ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath();
  series.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.y)) : ctx.moveTo(X(i), Y(p.y))));
  ctx.stroke();
  ctx.fillStyle = c;
  series.forEach((p, i) => { ctx.beginPath(); ctx.arc(X(i), Y(p.y), 3, 0, Math.PI * 2); ctx.fill(); });
}

/** Mapa valencia × activación. */
export function circumplexSvg(valence, arousal) {
  const cx = 50 + valence * 42, cy = 50 - arousal * 42;
  return `<svg viewBox="0 0 100 100" width="110" height="110" aria-label="Mapa emocional">
  <rect x="2" y="2" width="96" height="96" rx="10" fill="var(--roll-row)"/>
  <line x1="50" y1="6" x2="50" y2="94" stroke="var(--line)"/><line x1="6" y1="50" x2="94" y2="50" stroke="var(--line)"/>
  <text x="50" y="12" font-size="8" text-anchor="middle" fill="var(--muted)">energía</text>
  <text x="50" y="94" font-size="8" text-anchor="middle" fill="var(--muted)">calma</text>
  <text x="8" y="53" font-size="8" fill="var(--muted)">−</text><text x="88" y="53" font-size="8" fill="var(--muted)">+</text>
  <circle cx="${cx}" cy="${cy}" r="6" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/></svg>`;
}

// ---------- Espectro ----------
const DB_MIN = -100, DB_MAX = -10;
const fmtHz = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

/** Pico del espectro entre fMin y fMax, con interpolación parabólica. */
export function spectrumPeak(db, sampleRate, fMin, fMax) {
  if (!db) return null;
  const binHz = sampleRate / (2 * db.length);
  const lo = Math.max(1, Math.floor(fMin / binHz)), hi = Math.min(db.length - 2, Math.ceil(fMax / binHz));
  let k = lo;
  for (let i = lo; i <= hi; i++) if (db[i] > db[k]) k = i;
  const a = db[k - 1], b = db[k], c = db[k + 1];
  const den = a - 2 * b + c;
  const off = den ? (0.5 * (a - c)) / den : 0;
  return { freq: (k + off) * binHz, db: b };
}

/** Magnitud máxima (dB) en la banda de frecuencias que cubre un píxel. */
function bandDb(db, binHz, f0, f1) {
  const k0 = f0 / binHz, k1 = f1 / binHz;
  if (k1 - k0 < 1) {
    // banda más estrecha que un bin: interpolación lineal
    const k = (k0 + k1) / 2, i = Math.floor(k), t = k - i;
    return (db[i] ?? DB_MIN) * (1 - t) + (db[i + 1] ?? DB_MIN) * t;
  }
  let m = -Infinity;
  for (let i = Math.floor(k0); i <= Math.ceil(k1) && i < db.length; i++) if (db[i] > m) m = db[i];
  return m;
}

export function drawSpectrum(canvas, { db, hold, sampleRate, fMin, fMax, fundamental, notation = 'latin' }) {
  const { ctx, w, h } = setupCanvas(canvas);
  const L = 34, B = 20, T = 8;
  const pw = w - L - 6, ph = h - T - B;
  const lf0 = Math.log10(fMin), lf1 = Math.log10(fMax);
  const X = (f) => L + ((Math.log10(f) - lf0) / (lf1 - lf0)) * pw;
  const Y = (d) => T + (1 - (Math.max(DB_MIN, Math.min(DB_MAX, d)) - DB_MIN) / (DB_MAX - DB_MIN)) * ph;
  ctx.fillStyle = cssVar('--roll-bg');
  ctx.fillRect(0, 0, w, h);

  // Rejilla
  ctx.font = '600 10.5px Figtree, system-ui, sans-serif';
  ctx.strokeStyle = cssVar('--roll-row');
  ctx.fillStyle = cssVar('--dim');
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  for (const d of [-90, -70, -50, -30]) {
    ctx.beginPath(); ctx.moveTo(L, Y(d)); ctx.lineTo(w - 6, Y(d)); ctx.stroke();
    ctx.fillText(String(d), 4, Y(d));
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
    if (f < fMin || f > fMax) continue;
    ctx.beginPath(); ctx.moveTo(X(f), T); ctx.lineTo(X(f), T + ph); ctx.stroke();
    ctx.fillText(fmtHz(f), X(f), h - 5);
  }
  ctx.textAlign = 'left';
  if (!db) return;

  const binHz = sampleRate / (2 * db.length);
  const series = (arr) => {
    const pts = [];
    for (let x = 0; x <= pw; x++) {
      const f0 = Math.pow(10, lf0 + (x / pw) * (lf1 - lf0));
      const f1 = Math.pow(10, lf0 + ((x + 1) / pw) * (lf1 - lf0));
      pts.push([L + x, Y(bandDb(arr, binHz, f0, f1))]);
    }
    return pts;
  };

  if (hold) {
    ctx.strokeStyle = cssVar('--muted');
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    series(hold).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const pts = series(db);
  const curve = cssVar('--curve');
  const grad = ctx.createLinearGradient(0, T, 0, T + ph);
  grad.addColorStop(0, curve + '66');
  grad.addColorStop(1, curve + '05');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(L, T + ph);
  pts.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(L + pw, T + ph);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = curve;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();

  // Fundamental (tono detectado) y sus armónicos
  if (fundamental && fundamental >= fMin && fundamental <= fMax) {
    ctx.strokeStyle = cssVar('--accent');
    for (let n = 1; n <= 8; n++) {
      const f = fundamental * n;
      if (f > fMax) break;
      ctx.globalAlpha = n === 1 ? 1 : 0.35;
      ctx.lineWidth = n === 1 ? 1.5 : 1;
      ctx.setLineDash(n === 1 ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(X(f), T); ctx.lineTo(X(f), T + ph); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--accent');
    ctx.font = '700 12px Figtree, system-ui, sans-serif';
    const label = noteName(69 + 12 * Math.log2(fundamental / 440), notation);
    const lx = Math.min(X(fundamental) + 6, w - 40);
    ctx.fillText(label, lx, T + 14);
  }
}

// Mapa de color del espectrograma: fondo → azul → menta → ámbar → blanco
const STOPS = [[0, [18, 18, 21]], [0.35, [40, 70, 150]], [0.6, [74, 222, 154]], [0.82, [251, 191, 74]], [1, [255, 255, 255]]];
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
    const [p0, c0] = STOPS[k], [p1, c1] = STOPS[k + 1];
    const t = (v - p0) / (p1 - p0);
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * t;
  }
  return lut;
})();

export function clearSpectrogram(canvas) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.fillStyle = 'rgb(18,18,21)';
  ctx.fillRect(0, 0, w, h);
  canvas.dataset.ready = '1';
}

/** Añade una columna al espectrograma (desplaza la imagen 2 px a la izquierda). */
export function drawSpectrogramColumn(canvas, { db, sampleRate, fMin, fMax }) {
  if (!db) return;
  const dpr = window.devicePixelRatio || 1;
  const wantW = Math.round((canvas.clientWidth || 300) * dpr);
  if (!canvas.dataset.ready || canvas.width !== wantW) clearSpectrogram(canvas);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, step = Math.max(1, Math.round(2 * dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, step, 0, W - step, H, 0, 0, W - step, H);
  const img = ctx.createImageData(step, H);
  const binHz = sampleRate / (2 * db.length);
  const lf0 = Math.log10(fMin), lf1 = Math.log10(fMax);
  for (let y = 0; y < H; y++) {
    const f0 = Math.pow(10, lf0 + (1 - (y + 1) / H) * (lf1 - lf0));
    const f1 = Math.pow(10, lf0 + (1 - y / H) * (lf1 - lf0));
    const v = Math.max(0, Math.min(1, (bandDb(db, binHz, f0, f1) - DB_MIN) / (DB_MAX - DB_MIN - 10)));
    const li = Math.round(v * 255) * 3;
    for (let x = 0; x < step; x++) {
      const o = (y * step + x) * 4;
      img.data[o] = LUT[li]; img.data[o + 1] = LUT[li + 1]; img.data[o + 2] = LUT[li + 2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, W - step, 0);
}
