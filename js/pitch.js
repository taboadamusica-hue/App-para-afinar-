// Detección de tono (algoritmo YIN) y utilidades musicales. Sin dependencias del DOM.

export const NOTE_NAMES = {
  latin: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
  english: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
};

export const SCALES = {
  chromatic: { name: 'Cromática', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { name: 'Mayor', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Menor natural', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: 'Menor armónica', steps: [0, 2, 3, 5, 7, 8, 11] },
  majorPenta: { name: 'Pentatónica mayor', steps: [0, 2, 4, 7, 9] },
  minorPenta: { name: 'Pentatónica menor', steps: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
};

// Afinaciones de guitarra (MIDI de la 6ª a la 1ª cuerda)
export const GUITAR_TUNINGS = {
  standard: { name: 'Estándar', notes: [40, 45, 50, 55, 59, 64] },
  dropD: { name: 'Drop D', notes: [38, 45, 50, 55, 59, 64] },
  halfDown: { name: 'Medio tono abajo', notes: [39, 44, 49, 54, 58, 63] },
  fullDown: { name: 'Un tono abajo', notes: [38, 43, 48, 53, 57, 62] },
  dropC: { name: 'Drop C', notes: [36, 43, 48, 53, 57, 62] },
  dadgad: { name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
  openG: { name: 'Open G', notes: [38, 43, 50, 55, 59, 62] },
  openD: { name: 'Open D', notes: [38, 45, 50, 54, 57, 62] },
  openE: { name: 'Open E', notes: [40, 47, 52, 56, 59, 64] },
};

/** Cuerda más cercana (índice) a un MIDI dado. */
export function nearestString(midi, notes) {
  let best = 0;
  for (let i = 1; i < notes.length; i++) if (Math.abs(midi - notes[i]) < Math.abs(midi - notes[best])) best = i;
  return best;
}

/**
 * YIN pitch detector.
 * @param {Float32Array} buf  señal mono
 * @param {number} sampleRate
 * @param {object} [opts]
 * @returns {{freq:number, clarity:number}|null}
 */
export function detectPitch(buf, sampleRate, opts = {}) {
  const minFreq = opts.minFreq ?? 60;
  const maxFreq = opts.maxFreq ?? 1400;
  const threshold = opts.threshold ?? 0.15;
  const half = Math.floor(buf.length / 2);
  const maxTau = Math.min(half - 1, Math.ceil(sampleRate / minFreq));
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  if (maxTau <= minTau + 2) return null;

  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const x = buf[i] - buf[i + tau];
      sum += x * x;
    }
    d[tau] = sum;
  }
  // Diferencia media normalizada acumulada
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Interpolación parabólica
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tau + (s2 - s0) / denom;
  }
  const freq = sampleRate / better;
  if (!isFinite(freq) || freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: Math.max(0, Math.min(1, 1 - d[tau])) };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
export const midiToFreq = (m, a4 = 440) => a4 * Math.pow(2, (m - 69) / 12);

export function noteName(midi, notation = 'latin', withOctave = true) {
  const r = Math.round(midi);
  const name = NOTE_NAMES[notation][((r % 12) + 12) % 12];
  return withOctave ? `${name}${Math.floor(r / 12) - 1}` : name;
}

/** Nota objetivo (MIDI entero) más cercana dentro de la escala. */
export function nearestScaleMidi(midi, keyPc = 0, scale = 'chromatic') {
  const steps = (SCALES[scale] || SCALES.chromatic).steps;
  const base = Math.round(midi);
  let best = base, bestDist = Infinity;
  for (let m = base - 2; m <= base + 2; m++) {
    const pc = (((m - keyPc) % 12) + 12) % 12;
    if (!steps.includes(pc)) continue;
    const dist = Math.abs(midi - m);
    if (dist < bestDist) { bestDist = dist; best = m; }
  }
  return best;
}

export const centsOff = (midi, target) => (midi - target) * 100;

// Tesituras (MIDI). range = extensión habitual; comfort = zona cómoda donde conviene trabajar.
// Valores orientativos de la clasificación vocal clásica; cada voz es distinta.
export const VOICE_TYPES = [
  { id: 'bajo', name: 'Bajo', range: [40, 64], comfort: [43, 60] },              // Mi2–Mi4 · Sol2–Do4
  { id: 'bajoBaritono', name: 'Bajo-barítono', range: [41, 65], comfort: [45, 62] }, // Fa2–Fa4 · La2–Re4
  { id: 'baritono', name: 'Barítono', range: [45, 69], comfort: [47, 64] },      // La2–La4 · Si2–Mi4
  { id: 'tenor', name: 'Tenor', range: [48, 72], comfort: [52, 69] },            // Do3–Do5 · Mi3–La4
  { id: 'contratenor', name: 'Contratenor', range: [55, 76], comfort: [59, 72] }, // Sol3–Mi5 · Si3–Do5
  { id: 'contralto', name: 'Contralto', range: [53, 77], comfort: [57, 72] },    // Fa3–Fa5 · La3–Do5
  { id: 'mezzo', name: 'Mezzosoprano', range: [57, 81], comfort: [60, 76] },     // La3–La5 · Do4–Mi5
  { id: 'soprano', name: 'Soprano', range: [60, 84], comfort: [64, 79] },        // Do4–Do6 · Mi4–Sol5
];
export const voiceType = (id) => VOICE_TYPES.find((v) => v.id === id) || null;

/**
 * Tesituras ordenadas de más a menos parecida a un rango cómodo cantado [lo, hi] (MIDI).
 * Compara con la zona cómoda y penaliza las notas que quedan fuera de la extensión.
 */
export function suggestVoiceTypes(lo, hi) {
  return VOICE_TYPES.map((v) => {
    const [c0, c1] = v.comfort, [r0, r1] = v.range;
    const dist = Math.abs(lo - c0) + Math.abs(hi - c1) + 2 * (Math.max(0, r0 - lo) + Math.max(0, hi - r1));
    return { ...v, dist };
  }).sort((a, b) => a.dist - b.dist);
}
