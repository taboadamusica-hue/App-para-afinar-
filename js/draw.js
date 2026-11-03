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
