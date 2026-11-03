// Seguimiento de tono en tiempo real: convierte las lecturas crudas del detector
// en una señal fluida y estable para la interfaz.
//  - Filtro "One Euro": suaviza mucho cuando la nota está quieta y casi nada
//    cuando se mueve, así no hay temblor ni retraso.
//  - Corrige saltos de octava espurios (error típico de los detectores).
//  - Descarta lecturas aisladas que saltan y vuelven (un solo frame).
//  - Mantiene la última nota durante microcortes de la señal.
//  - Histéresis en el nombre de la nota para que no parpadee entre dos.
import { freqToMidi, midiToFreq } from './pitch.js';

export class OneEuro {
  constructor(minCutoff = 1, beta = 0.05, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; this.dx = 0; return x; }
    const dt = Math.max(1e-3, t - this.t);
    const dx = (x - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (x - this.x);
    this.t = t;
    return this.x;
  }
}

export const TRACKER_PRESETS = {
  // Voz: curva ágil (se ve el vibrato) y aguja estable
  voice: { holdMs: 120, curve: [6, 0.1], steady: [1.2, 0.08], jumpConfirm: 2, octaveConfirm: 5 },
  // Guitarra: más suavizado, la cuerda decae despacio
  guitar: { holdMs: 250, curve: [3, 0.05], steady: [0.6, 0.04], jumpConfirm: 3, octaveConfirm: 8 },
};

export class PitchTracker {
  constructor(preset = 'voice') { this.setPreset(preset); }

  setPreset(name) {
    const p = TRACKER_PRESETS[name] || TRACKER_PRESETS.voice;
    this.p = p;
    this.curveF = new OneEuro(p.curve[0], p.curve[1]);
    this.steadyF = new OneEuro(p.steady[0], p.steady[1]);
    this.reset();
  }

  reset() {
    this.curveF.reset();
    this.steadyF.reset();
    this.last = null;        // último midi aceptado (crudo corregido)
    this.lastT = -Infinity;  // tiempo del último frame con voz
    this.pending = null;     // salto en espera de confirmación
    this.octaveRun = 0;
    this.note = null;
    this.out = null;
    this.fastUntil = -Infinity;
    this.awayRun = 0;
  }

  /**
   * @param {number} freq Hz (0 = sin voz)
   * @param {number} t segundos
   * @param {number} a4
   * @returns {{voiced:boolean, held:boolean, freq:number, midi:number|null, steady:number|null, note:number|null}}
   *  freq: frecuencia corregida (sin suavizar, 0 si no hay voz real) — para grabar y analizar.
   *  midi: curva suavizada ligera — para dibujar.  steady: lectura estable — para aguja y cifras.
   */
  update(freq, t, a4 = 440) {
    if (!freq) {
      if (this.out && t - this.lastT <= this.p.holdMs / 1000) {
        return { ...this.out, held: true, freq: 0 };
      }
      if (this.out) this.reset();
      return { voiced: false, held: false, freq: 0, midi: null, steady: null, note: null };
    }

    let m = freqToMidi(freq, a4);
    const recent = this.last !== null && t - this.lastT < 0.2;

    if (recent) {
      // Saltos de octava: probablemente error del detector
      const d = m - this.last;
      if (Math.abs(Math.abs(d) - 12) < 0.6) {
        this.octaveRun++;
        if (this.octaveRun < this.p.octaveConfirm) m -= 12 * Math.sign(d);
        else this.octaveRun = 0;
      } else this.octaveRun = 0;

      // Saltos grandes: confirmar con frames consecutivos antes de aceptarlos
      if (Math.abs(m - this.last) > 1.2) {
        if (this.pending && Math.abs(m - this.pending.m) < 0.8) this.pending.n++;
        else this.pending = { m, n: 1 };
        if (this.pending.n < this.p.jumpConfirm) {
          this.lastT = t;
          return this.out ? { ...this.out, held: true, freq: 0 } : { voiced: false, held: false, freq: 0, midi: null, steady: null, note: null };
        }
        // salto confirmado: la nota cambió, recolocar filtros sin arrastre
        this.curveF.reset();
        this.steadyF.reset();
        this.note = null;
        this.fastUntil = t + 0.1;
      }
      this.pending = null;
    }

    if (this.last === null) this.fastUntil = t + 0.1; // inicio de nota tras silencio
    this.last = m;
    this.lastT = t;
    const midi = this.curveF.filter(m, t);
    // Durante los primeros 100 ms de cada nota la lectura estable sigue a la curva
    // (asentamiento rápido); después se suaviza para que la aguja no tiemble.
    // Cambio de nota pequeño (p. ej. un semitono): si la voz se mantiene lejos de la
    // lectura estable varios frames seguidos, se trata como nota nueva.
    if (this.out && Math.abs(m - this.out.steady) > 0.55) {
      if (++this.awayRun >= 3) { this.fastUntil = t + 0.1; this.awayRun = 0; }
    } else this.awayRun = 0;
    if (t < this.fastUntil) this.steadyF.reset();
    const steady = this.steadyF.filter(t < this.fastUntil ? midi : m, t);
    if (this.note === null || Math.abs(steady - this.note) > 0.62) this.note = Math.round(steady);
    this.out = { voiced: true, held: false, freq: midiToFreq(m, a4), midi, steady, note: this.note };
    return this.out;
  }
}
