// Análisis de tomas: afinación, estabilidad, vibrato, timbre y emoción estimada.
// Funciones puras (sin DOM) para poder probarlas en Node.
//
// Formato de frame: { t: segundos, f: Hz (0 = sin voz), c: claridad 0..1, a: RMS, b: centroide espectral Hz }

import { freqToMidi, nearestScaleMidi, noteName } from './pitch.js';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
};
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};
const toDb = (a) => 20 * Math.log10(Math.max(a, 1e-6));

/** Centroide espectral a partir de magnitudes en dB (AnalyserNode.getFloatFrequencyData). */
export function spectralCentroid(magDb, sampleRate, fftSize, minHz = 80, maxHz = 8000) {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(minHz / binHz));
  const hi = Math.min(magDb.length - 1, Math.ceil(maxHz / binHz));
  let num = 0, den = 0;
  for (let i = lo; i <= hi; i++) {
    const m = Math.pow(10, magDb[i] / 20);
    num += m * i * binHz;
    den += m;
  }
  return den > 0 ? num / den : 0;
}

function movingAverage(arr, win) {
  const out = new Array(arr.length);
  const h = Math.max(1, Math.floor(win / 2));
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(arr.length - 1, i + h); j++) { s += arr[j]; n++; }
    out[i] = s / n;
  }
  return out;
}

/** Divide la toma en notas a partir de los frames con voz. */
export function segmentNotes(frames, { keyPc = 0, scale = 'chromatic', a4 = 440 } = {}) {
  const notes = [];
  let cur = null;
  let last = null;
  const close = () => {
    if (cur && cur.frames.length && cur.frames[cur.frames.length - 1].t - cur.frames[0].t >= 0.12) notes.push(cur);
    cur = null;
  };
  for (const fr of frames) {
    if (!fr.f) continue;
    const midi = freqToMidi(fr.f, a4);
    const p = { ...fr, midi };
    if (cur) {
      const recent = cur.frames.slice(-12).map((x) => x.midi);
      const ref = mean(recent);
      if (p.t - last.t > 0.09 || Math.abs(midi - ref) > 0.7) close();
    }
    if (!cur) cur = { frames: [] };
    cur.frames.push(p);
    last = p;
  }
  close();

  return notes.map((n) => {
    const fs = n.frames;
    const start = fs[0].t, end = fs[fs.length - 1].t;
    const centerMidi = median(fs.map((x) => x.midi));
    const target = nearestScaleMidi(centerMidi, keyPc, scale);
    const cents = fs.map((x) => (x.midi - target) * 100);
    const times = fs.map((x) => x.t);
    // Ataque = primeros 80 ms; parte estable = el resto
    const steadyIdx = fs.findIndex((x) => x.t - start >= 0.08);
    const steady = steadyIdx > 0 ? cents.slice(steadyIdx) : cents;
    const attack = steadyIdx > 0 ? cents.slice(0, steadyIdx) : cents.slice(0, 1);
    const dt = fs.length > 1 ? (end - start) / (fs.length - 1) : 1 / 60;
    const vib = analyzeVibrato(steady, dt);
    const slow = movingAverage(steady, Math.round(0.25 / dt));
    return {
      start, end, duration: end - start, target, name: noteName(target),
      centerMidi,
      meanCents: mean(steady),
      absCents: mean(steady.map(Math.abs)),
      attackCents: mean(attack),
      drift: std(slow),
      vibrato: vib,
      level: mean(fs.map((x) => x.a)),
      curve: { times, cents },
    };
  });
}

/** Detecta vibrato en una serie de cents (muestreo dt). */
export function analyzeVibrato(cents, dt) {
  const dur = cents.length * dt;
  if (dur < 0.4) return { present: false, rate: 0, extent: 0 };
  const trend = movingAverage(cents, Math.round(0.25 / dt));
  const res = cents.map((c, i) => c - trend[i]);
  let crossings = 0;
  for (let i = 1; i < res.length; i++) if ((res[i - 1] < 0) !== (res[i] < 0)) crossings++;
  const rate = crossings / 2 / dur;
  const extent = 2 * Math.SQRT2 * std(res); // pico a pico aproximado
  const present = rate >= 3.5 && rate <= 8.5 && extent >= 20 && extent <= 250;
  return { present, rate, extent };
}

const EMOTIONS = [
  { id: 'alegre', label: 'Alegre / enérgico', emoji: '😄', a: 1, v: 1 },
  { id: 'tenso', label: 'Tenso / intenso', emoji: '😤', a: 1, v: -1 },
  { id: 'sereno', label: 'Sereno / tierno', emoji: '😌', a: -1, v: 1 },
  { id: 'triste', label: 'Triste / melancólico', emoji: '😢', a: -1, v: -1 },
  { id: 'apasionado', label: 'Apasionado', emoji: '🔥', a: 1, v: 0 },
  { id: 'intimo', label: 'Íntimo / contenido', emoji: '🤫', a: -1, v: 0 },
  { id: 'calido', label: 'Cálido / luminoso', emoji: '🙂', a: 0, v: 1 },
  { id: 'nostalgico', label: 'Nostálgico', emoji: '🥀', a: 0, v: -1 },
  { id: 'neutro', label: 'Neutro', emoji: '😐', a: 0, v: 0 },
];
export const EMOTION_LIST = EMOTIONS;

const EMOTION_HINTS = {
  alegre: 'más volumen y brillo, ritmo ágil, ataques limpios y contorno ascendente',
  tenso: 'más presión y volumen, timbre brillante/metálico y ataques marcados',
  sereno: 'volumen moderado, legato, timbre cálido y vibrato suave',
  triste: 'menos volumen, timbre más oscuro, tempo más lento y notas que caen',
  apasionado: 'crescendos amplios, vibrato presente y mucho contraste dinámico',
  intimo: 'voz más suave y cercana, algo de aire y poca variación de volumen',
  calido: 'timbre redondo, volumen medio y frases ligadas',
  nostalgico: 'timbre oscuro, frases que descienden y dinámica contenida',
  neutro: 'sin intención marcada',
};

function classifyEmotion(arousal, valence) {
  const q = (x) => (x > 0.15 ? 1 : x < -0.15 ? -1 : 0);
  const a = q(arousal), v = q(valence);
  return EMOTIONS.find((e) => e.a === a && e.v === v);
}

/**
 * Análisis completo de una toma.
 * @param {Array} frames
 * @param {{keyPc?:number, scale?:string, a4?:number, notation?:string, targetEmotion?:string}} opts
 */
export function analyzeTake(frames, opts = {}) {
  const { keyPc = 0, scale = 'chromatic', a4 = 440, notation = 'latin', targetEmotion = null } = opts;
  const duration = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  const voiced = frames.filter((f) => f.f > 0);
  const notes = segmentNotes(frames, { keyPc, scale, a4 });

  if (notes.length === 0) {
    return { empty: true, duration, notes: [], score: 0, tips: ['No se detectó voz suficiente. Acércate al micro o sube la sensibilidad.'] };
  }

  // --- Afinación (ponderada por duración) ---
  const totalDur = notes.reduce((s, n) => s + n.duration, 0);
  const wmean = (fn) => notes.reduce((s, n) => s + fn(n) * n.duration, 0) / totalDur;
  const meanAbsCents = wmean((n) => n.absCents);
  const bias = wmean((n) => n.meanCents);
  const allSteady = notes.flatMap((n) => n.curve.cents.slice(Math.min(5, n.curve.cents.length - 1)));
  const inTunePct = (100 * allSteady.filter((c) => Math.abs(c) <= 25).length) / allSteady.length;
  const tuningScore = clamp(100 - (meanAbsCents - 5) * 2.2, 0, 100);

  // --- Estabilidad ---
  const drift = wmean((n) => n.drift);
  const stabilityScore = clamp(100 - (drift - 3) * 3, 0, 100);

  // --- Vibrato ---
  const longNotes = notes.filter((n) => n.duration >= 0.5);
  const vibNotes = longNotes.filter((n) => n.vibrato.present);
  const vibrato = {
    ratio: longNotes.length ? vibNotes.length / longNotes.length : 0,
    rate: mean(vibNotes.map((n) => n.vibrato.rate)),
    extent: mean(vibNotes.map((n) => n.vibrato.extent)),
  };

  // --- Rango ---
  const midis = notes.map((n) => n.target);
  const low = Math.min(...midis), high = Math.max(...midis);

  // --- Timbre ---
  const dbs = voiced.map((f) => toDb(f.a));
  const dynRangeDb = percentile(dbs, 90) - percentile(dbs, 10);
  const meanDb = mean(dbs);
  const centroid = median(voiced.map((f) => f.b).filter((b) => b > 0));
  const clarity = mean(voiced.map((f) => f.c));
  const brightness = clamp((centroid - 700) / 2600);
  const breathiness = clamp((0.97 - clarity) / 0.22);
  const dynamics = clamp((dynRangeDb - 3) / 15);
  const tone = {
    centroid, clarity, dynRangeDb, meanDb, brightness, breathiness, dynamics,
    labels: [
      brightness < 0.33 ? 'Oscuro / cálido' : brightness > 0.66 ? 'Brillante / metálico' : 'Timbre equilibrado',
      breathiness > 0.6 ? 'Aireado / soplado' : breathiness < 0.3 ? 'Limpio / enfocado' : 'Algo de aire',
      dynamics < 0.25 ? 'Dinámica plana' : dynamics > 0.65 ? 'Dinámica amplia' : 'Dinámica moderada',
    ],
  };

  // --- Expresividad ---
  const pitchVar = clamp(std(notes.map((n) => n.centerMidi)) / 5);
  const expressiveness = clamp(0.45 * dynamics + 0.3 * vibrato.ratio + 0.25 * pitchVar) * 100;

  // --- Emoción (modelo circunflejo: activación × valencia) ---
  const loud = clamp((meanDb + 45) / 30);
  const rate = clamp(notes.length / Math.max(1, duration) / 4);
  const half = Math.floor(notes.length / 2);
  const contour = notes.length >= 4 ? mean(notes.slice(half).map((n) => n.centerMidi)) - mean(notes.slice(0, half).map((n) => n.centerMidi)) : 0;
  const modeCue = ['major', 'majorPenta'].includes(scale) ? 1 : ['minor', 'harmonicMinor', 'minorPenta', 'blues'].includes(scale) ? -1 : 0;
  const arousal = clamp(0.35 * loud + 0.2 * rate + 0.2 * brightness + 0.15 * dynamics + 0.1 * pitchVar) * 2 - 1;
  const valence = clamp(
    0.5 + 0.22 * (brightness * 2 - 1) + 0.2 * modeCue + 0.18 * (rate * 2 - 1) + 0.1 * clamp(contour / 4, -1, 1) - 0.1 * (breathiness * 2 - 1) * 0.5,
  ) * 2 - 1;
  const emo = classifyEmotion(arousal, valence);
  const emotion = { arousal, valence, ...emo, intensity: Math.min(1, Math.hypot(arousal, valence)) };
  if (targetEmotion) {
    const t = EMOTIONS.find((e) => e.id === targetEmotion);
    if (t) {
      const dist = Math.hypot(t.a - emo.a, t.v - emo.v);
      emotion.target = t;
      emotion.match = t.id === emo.id ? 100 : Math.round(clamp(1 - dist / 2.83) * 100);
      emotion.hint = t.id === emo.id ? null : `Para sonar más «${t.label.toLowerCase()}»: ${EMOTION_HINTS[t.id]}.`;
    }
  }

  // --- Puntuación global ---
  const score = Math.round(0.55 * tuningScore + 0.25 * stabilityScore + 0.2 * expressiveness);

  // --- Consejos ---
  const tips = [];
  const nn = (m) => noteName(m, notation);
  if (meanAbsCents <= 12) tips.push('¡Afinación muy precisa! Sigue así.');
  if (bias > 8) tips.push(`Tiendes a ir alto (sostenido): +${bias.toFixed(0)} cents de media. Relaja la presión y escucha antes de entrar.`);
  if (bias < -8) tips.push(`Tiendes a quedarte bajo (calado): ${bias.toFixed(0)} cents de media. Piensa la nota "arriba" y mantén el apoyo.`);
  const atk = mean(notes.filter((n) => n.duration > 0.25).map((n) => n.attackCents));
  if (atk < -35) tips.push('Entras por debajo de las notas (scoop). Intenta atacar directamente en la nota.');
  if (atk > 35) tips.push('Entras por encima de las notas y luego bajas. Prepara la nota antes de cantarla.');
  if (high - low >= 5) {
    const cut = low + (high - low) * 0.66;
    const hi = notes.filter((n) => n.target >= cut), lo = notes.filter((n) => n.target < cut);
    const hiErr = mean(hi.map((n) => n.absCents)), loErr = mean(lo.map((n) => n.absCents));
    if (hi.length && lo.length && hiErr > 20 && hiErr > loErr * 1.4) tips.push(`Las notas agudas (desde ${nn(Math.round(cut))}) desafinan más (${hiErr.toFixed(0)} vs ${loErr.toFixed(0)} cents). No empujes: más apoyo y menos volumen arriba.`);
  }
  const byNote = {};
  for (const n of notes) (byNote[n.target] ||= []).push(n.meanCents);
  const worst = Object.entries(byNote)
    .map(([m, cs]) => ({ m: +m, err: mean(cs), n: cs.length }))
    .filter((x) => x.n >= 2 && Math.abs(x.err) > 18)
    .sort((a, b) => Math.abs(b.err) - Math.abs(a.err))
    .slice(0, 2);
  if (worst.length) tips.push('Notas más difíciles: ' + worst.map((w) => `${nn(w.m)} (${w.err > 0 ? '+' : ''}${w.err.toFixed(0)} cents)`).join(', ') + '.');
  if (stabilityScore < 60) tips.push('La nota "se mueve" mientras la sostienes. Practica notas largas con el ejercicio de Nota sostenida.');
  if (vibrato.rate > 7.5) tips.push('Tu vibrato es rápido/nervioso (' + vibrato.rate.toFixed(1) + ' Hz). Busca uno más relajado (5–6.5 Hz).');
  if (longNotes.length >= 3 && vibrato.ratio === 0) tips.push('No hay vibrato en notas largas. Prueba a soltarlo al final de las frases.');
  if (breathiness > 0.65) tips.push('Mucho aire en la voz. Si no es intencionado, trabaja el cierre de cuerdas (ejercicios con "ng" o "vvv").');
  if (dynamics < 0.2) tips.push('Dinámica muy plana: juega con crescendos y matices para transmitir más.');
  if (emotion.hint) tips.push(emotion.hint);

  return {
    empty: false,
    duration, voicedRatio: duration ? voiced.length / frames.length : 0,
    notes: notes.map(({ curve, ...rest }) => rest),
    noteCurves: notes.map((n) => n.curve),
    tuning: { meanAbsCents, bias, inTunePct, score: tuningScore },
    stability: { drift, score: stabilityScore },
    vibrato,
    range: { low, high, lowName: nn(low), highName: nn(high) },
    tone, emotion, expressiveness, score, tips,
  };
}

/** Cents respecto al objetivo ignorando la octava (para voces que cantan una octava abajo/arriba). */
export const foldOctave = (c) => c - 1200 * Math.round(c / 1200);

/** Ejercicio de nota sostenida: frames contra una nota objetivo (cualquier octava). */
export function scoreSustain(frames, targetMidi, a4 = 440) {
  const v = frames.filter((f) => f.f > 0);
  if (v.length < 5) return { score: 0, meanAbsCents: null, bias: null, inTunePct: 0, reachTime: null };
  const t0 = frames[0].t;
  const cents = v.map((f) => ({ t: f.t - t0, c: foldOctave((freqToMidi(f.f, a4) - targetMidi) * 100) }));
  const reach = cents.find((x) => Math.abs(x.c) <= 25);
  const steady = cents.filter((x) => x.t - (reach ? reach.t : cents[0].t) >= 0.25).map((x) => x.c);
  const s = steady.length ? steady : cents.map((x) => x.c);
  const meanAbsCents = mean(s.map(Math.abs));
  const inTunePct = (100 * s.filter((c) => Math.abs(c) <= 25).length) / s.length;
  const score = Math.round(clamp(100 - (meanAbsCents - 5) * 2.2, 0, 100) * 0.7 + inTunePct * 0.3);
  return { score, meanAbsCents, bias: mean(s), inTunePct, reachTime: reach ? reach.t : null };
}

/** Ejercicio de secuencia (escala): cada nota dura `noteDur` segundos. */
export function scoreSequence(frames, targets, noteDur, a4 = 440) {
  if (!frames.length) return { score: 0, perNote: [] };
  const t0 = frames[0].t;
  const perNote = targets.map((m, i) => {
    const from = t0 + i * noteDur + 0.15 * noteDur, to = t0 + (i + 1) * noteDur;
    const seg = frames.filter((f) => f.f > 0 && f.t >= from && f.t <= to);
    if (seg.length < 3) return { target: m, cents: null, ok: false };
    const c = median(seg.map((f) => foldOctave((freqToMidi(f.f, a4) - m) * 100)));
    return { target: m, cents: c, ok: Math.abs(c) <= 25 };
  });
  const sung = perNote.filter((p) => p.cents !== null);
  const meanAbs = sung.length ? mean(sung.map((p) => Math.abs(p.cents))) : 100;
  const coverage = sung.length / targets.length;
  const score = Math.round(clamp(100 - (meanAbs - 5) * 2.2, 0, 100) * coverage);
  return { score, perNote, meanAbsCents: meanAbs };
}
