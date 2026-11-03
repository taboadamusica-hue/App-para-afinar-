// Reconocimiento de acordes, tonalidad y tempo. Funciones puras (sin DOM).
//
// Método: cromagrama (energía de las 12 notas) → comparación con plantillas de acordes
// (incluyendo armónicos) + bajo → suavizado temporal con Viterbi. Tonalidad con perfiles
// de Krumhansl-Schmuckler. Tempo por autocorrelación de la envolvente de ataques.
import { magnitudeSpectrum } from './fft.js';

export const CHORD_TYPES = {
  maj: { iv: [0, 4, 7], suffix: { latin: '', english: '' }, cost: 0 },
  min: { iv: [0, 3, 7], suffix: { latin: 'm', english: 'm' }, cost: 0 },
  '7': { iv: [0, 4, 7, 10], suffix: { latin: '7', english: '7' }, cost: 0.015 },
  m7: { iv: [0, 3, 7, 10], suffix: { latin: 'm7', english: 'm7' }, cost: 0.015 },
  maj7: { iv: [0, 4, 7, 11], suffix: { latin: 'maj7', english: 'maj7' }, cost: 0.015 },
  sus4: { iv: [0, 5, 7], suffix: { latin: 'sus4', english: 'sus4' }, cost: 0.05 },
  sus2: { iv: [0, 2, 7], suffix: { latin: 'sus2', english: 'sus2' }, cost: 0.05 },
  dim: { iv: [0, 3, 6], suffix: { latin: 'dim', english: 'dim' }, cost: 0.06 },
  aug: { iv: [0, 4, 8], suffix: { latin: 'aug', english: 'aug' }, cost: 0.06 },
};
const ROOTS = {
  latin: ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'],
  english: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
};

/** Nombre de un acorde {root, type}; null → "N.C." (sin acorde). */
export function chordName(ch, notation = 'latin', shift = 0) {
  if (!ch) return 'N.C.';
  return ROOTS[notation][(((ch.root + shift) % 12) + 12) % 12] + CHORD_TYPES[ch.type].suffix[notation];
}
export const keyName = (k, notation = 'latin', shift = 0) =>
  `${ROOTS[notation][(((k.root + shift) % 12) + 12) % 12]} ${k.mode === 'major' ? (notation === 'latin' ? 'mayor' : 'major') : (notation === 'latin' ? 'menor' : 'minor')}`;
export const chordNotes = (ch) => CHORD_TYPES[ch.type].iv.map((i) => (ch.root + i) % 12);

// Plantillas: cada nota del acorde aporta también su 3er y 5º armónico (quinta y tercera arriba)
const TEMPLATES = [];
for (let root = 0; root < 12; root++) {
  for (const [type, def] of Object.entries(CHORD_TYPES)) {
    const v = new Float64Array(12);
    for (const iv of def.iv) {
      const pc = (root + iv) % 12;
      v[pc] += 1;
      v[(pc + 7) % 12] += 0.2;
      v[(pc + 4) % 12] += 0.1;
    }
    const n = Math.hypot(...v);
    TEMPLATES.push({ root, type, v: v.map((x) => x / n), cost: def.cost });
  }
}
export const N_STATES = TEMPLATES.length + 1; // + "sin acorde"

/** Cromagrama de un espectro de magnitudes lineales. Devuelve {chroma, bass, energy}. */
export function chromaFromMagnitudes(mags, sampleRate, fftSize) {
  const chroma = new Float64Array(12), bass = new Float64Array(12);
  const binHz = sampleRate / fftSize;
  let energy = 0;
  const k0 = Math.max(1, Math.floor(50 / binHz)), k1 = Math.min(mags.length - 1, Math.ceil(2200 / binHz));
  for (let k = k0; k <= k1; k++) {
    const f = k * binHz;
    const m = mags[k];
    // solo picos locales: reduce el ruido y la fuga espectral
    if (m <= mags[k - 1] || m < mags[k + 1]) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const w = Math.sqrt(m);
    energy += m * m;
    if (f < 1800) chroma[pc] += w;
    if (f < 260) bass[pc] += w;
  }
  return { chroma, bass, energy };
}

/** Cromagrama desde dB (AnalyserNode.getFloatFrequencyData). */
export function chromaFromDb(db, sampleRate) {
  const mags = new Float32Array(db.length);
  for (let i = 0; i < db.length; i++) mags[i] = Math.pow(10, db[i] / 20);
  return chromaFromMagnitudes(mags, sampleRate, db.length * 2);
}

const norm = (v) => { const n = Math.hypot(...v); return n > 0 ? v.map((x) => x / n) : v; };

/** Puntuaciones de todos los acordes para un frame (coseno + refuerzo del bajo). */
export function chordScores({ chroma, bass }) {
  const c = norm(chroma), b = norm(bass);
  const bSum = b.reduce((s, x) => s + x, 0);
  return TEMPLATES.map((t) => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += c[i] * t.v[i];
    const bassBoost = bSum > 0 ? 0.12 * b[t.root] : 0;
    return s + bassBoost - t.cost;
  });
}

/** Mejor acorde de un frame (para el modo en vivo). */
export function bestChord(frame) {
  const sc = chordScores(frame);
  let k = 0;
  for (let i = 1; i < sc.length; i++) if (sc[i] > sc[k]) k = i;
  return { root: TEMPLATES[k].root, type: TEMPLATES[k].type, score: sc[k], scores: sc };
}

/**
 * Secuencia de acordes suavizada con Viterbi.
 * @param frames [{chroma,bass,energy}]  @param hop segundos por frame
 * @returns [{start,end,chord:{root,type}|null}]
 */
export function decodeChords(frames, hop, { switchPenalty = 0.9, sharpness = 14, silence = null } = {}) {
  if (!frames.length) return [];
  const energies = frames.map((f) => f.energy).sort((a, b) => a - b);
  const silenceThr = silence ?? Math.max(1e-9, energies[Math.floor(energies.length * 0.5)] * 0.02);
  const S = N_STATES, NC = S - 1, T = frames.length;
  const back = new Uint16Array(T * S);
  let prev = new Float64Array(S);
  for (let t = 0; t < T; t++) {
    const quiet = frames[t].energy < silenceThr;
    const sc = quiet ? null : chordScores(frames[t]);
    const emit = new Float64Array(S);
    for (let s = 0; s < NC; s++) emit[s] = quiet ? -6 : sharpness * sc[s];
    emit[NC] = quiet ? 0 : sharpness * 0.55;
    if (t === 0) { prev = emit; continue; }
    // mejor estado anterior (para transiciones con cambio)
    let bestPrev = 0;
    for (let s = 1; s < S; s++) if (prev[s] > prev[bestPrev]) bestPrev = s;
    const cur = new Float64Array(S);
    for (let s = 0; s < S; s++) {
      const stay = prev[s], move = prev[bestPrev] - switchPenalty * sharpness * 0.4;
      if (stay >= move || bestPrev === s) { cur[s] = stay + emit[s]; back[t * S + s] = s; }
      else { cur[s] = move + emit[s]; back[t * S + s] = bestPrev; }
    }
    prev = cur;
  }
  let s = 0;
  for (let i = 1; i < S; i++) if (prev[i] > prev[s]) s = i;
  const path = new Uint16Array(T);
  for (let t = T - 1; t >= 0; t--) { path[t] = s; s = back[t * S + s]; }

  const segs = [];
  for (let t = 0; t < T; t++) {
    const st = path[t];
    const chord = st === NC ? null : { root: TEMPLATES[st].root, type: TEMPLATES[st].type };
    const last = segs[segs.length - 1];
    if (last && sameChord(last.chord, chord)) last.end = (t + 1) * hop;
    else segs.push({ start: t * hop, end: (t + 1) * hop, chord });
  }
  return mergeShort(segs, 0.35);
}

export const sameChord = (a, b) => (a === null && b === null) || (a && b && a.root === b.root && a.type === b.type);

function mergeShort(segs, minDur) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && (s.end - s.start < minDur || sameChord(last.chord, s.chord))) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

// Perfiles de Krumhansl-Kessler
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db || 1);
}
/** Tonalidad a partir de un cromagrama acumulado. */
export function detectKey(chroma) {
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [mode, prof] of [['major', KK_MAJOR], ['minor', KK_MINOR]]) {
      const rot = Array.from({ length: 12 }, (_, i) => prof[(i - r + 12) % 12]);
      const c = corr(Array.from(chroma), rot);
      if (!best || c > best.score) best = { root: r, mode, score: c };
    }
  }
  return best;
}

/** Tempo (BPM) y pulsos a partir de una envolvente de ataques muestreada cada `hop` s. */
export function estimateTempo(onset, hop) {
  const n = onset.length;
  if (n < 50) return null;
  const mean = onset.reduce((s, x) => s + x, 0) / n;
  const o = onset.map((x) => x - mean);
  let best = null;
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = 60 / bpm / hop;
    let s = 0;
    for (let i = 0; i + lag * 2 < n; i++) {
      const j = i + lag, j2 = i + 2 * lag;
      const v1 = o[Math.floor(j)] * (1 - (j % 1)) + (o[Math.floor(j) + 1] || 0) * (j % 1);
      const v2 = o[Math.floor(j2)] * (1 - (j2 % 1)) + (o[Math.floor(j2) + 1] || 0) * (j2 % 1);
      s += o[i] * (v1 + 0.5 * v2);
    }
    // preferencia suave por tempos habituales (≈ 90–130)
    s *= Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    if (!best || s > best.s) best = { bpm, s };
  }
  // fase: desplazamiento que más energía de ataque recoge
  const period = 60 / best.bpm / hop;
  let bestPhase = 0, bestSum = -Infinity;
  for (let ph = 0; ph < period; ph += 0.5) {
    let sum = 0;
    for (let x = ph; x < n; x += period) sum += onset[Math.round(x)] || 0;
    if (sum > bestSum) { bestSum = sum; bestPhase = ph; }
  }
  const beats = [];
  for (let x = bestPhase; x < n; x += period) beats.push(x * hop);
  return { bpm: Math.round(best.bpm), beats };
}

/** Ajusta los cambios de acorde al pulso más cercano (si está a menos de un tercio de pulso). */
export function snapToBeats(segs, beats) {
  if (!beats || beats.length < 2) return segs;
  const period = beats[1] - beats[0];
  const snap = (t) => {
    let lo = 0, hi = beats.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (beats[mid] < t) lo = mid; else hi = mid; }
    const b = Math.abs(beats[lo] - t) < Math.abs(beats[hi] - t) ? beats[lo] : beats[hi];
    return Math.abs(b - t) < period / 3 ? b : t;
  };
  const out = segs.map((s, i) => ({ ...s, start: i === 0 ? s.start : snap(s.start) }));
  for (let i = 0; i < out.length - 1; i++) out[i].end = out[i + 1].start;
  return out.filter((s) => s.end - s.start > 0.05);
}

/**
 * Analiza un audio completo (mono). Asíncrono por tramos para no bloquear la interfaz.
 * @param {Float32Array} x  @param {number} sr
 * @param {(p:number)=>void} [onProgress]
 */
export async function analyzeSong(x, sr, onProgress = () => {}) {
  const N = sr > 30000 ? 8192 : 4096, hop = N / 2;
  const frames = [];
  const total = Math.max(1, Math.floor((x.length - N) / hop));
  const mags = new Float32Array(N / 2);
  const keyChroma = new Float64Array(12);
  // envolvente de ataques (flujo de energía en tramos de 512 muestras)
  const oh = 512, onset = [];
  let prevE = 0;
  for (let i = 0; i + oh <= x.length; i += oh) {
    let e = 0;
    for (let j = 0; j < oh; j++) e += x[i + j] * x[i + j];
    const le = Math.log1p(1000 * e);
    onset.push(Math.max(0, le - prevE));
    prevE = le;
  }
  for (let f = 0; f < total; f++) {
    magnitudeSpectrum(x, f * hop, N, mags);
    const fr = chromaFromMagnitudes(mags, sr, N);
    frames.push(fr);
    for (let i = 0; i < 12; i++) keyChroma[i] += fr.chroma[i];
    if (f % 40 === 0) { onProgress(f / total); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress(1);
  const hopS = hop / sr;
  const tempo = estimateTempo(onset, oh / sr);
  let chords = decodeChords(frames, hopS);
  if (tempo) chords = snapToBeats(chords, tempo.beats);
  return { duration: x.length / sr, chords, key: detectKey(keyChroma), bpm: tempo?.bpm ?? null, beats: tempo?.beats ?? [] };
}
