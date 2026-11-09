// Metrónomo: lógica pura + programador de audio preciso (Web Audio, "lookahead").
// Los clics se programan en el reloj de audio con antelación, así no se desajustan
// aunque el hilo principal esté ocupado.

export const TIME_SIGNATURES = {
  '2/4': { beats: 2, unit: 4 }, '3/4': { beats: 3, unit: 4 }, '4/4': { beats: 4, unit: 4 }, '5/4': { beats: 5, unit: 4 },
  '6/8': { beats: 6, unit: 8 }, '7/8': { beats: 7, unit: 8 }, '9/8': { beats: 9, unit: 8 }, '12/8': { beats: 12, unit: 8 },
};
// Subdivisiones de cada pulso
export const SUBDIVISIONS = { 1: 'Negras', 2: 'Corcheas', 3: 'Tresillos', 4: 'Semicorcheas' };
export const BPM_MIN = 30, BPM_MAX = 300;

const TEMPO_NAMES = [
  [40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'],
  [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo'],
];
export const tempoName = (bpm) => TEMPO_NAMES.find(([max]) => bpm < max)[1];
export const clampBpm = (b) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(b)));

/** Acentos por defecto: 1 = fuerte, 0.6 = normal, 0 = silencio. En compases de 6/8, 9/8, 12/8 se acentúa cada 3. */
export function defaultAccents(sig) {
  const { beats, unit } = TIME_SIGNATURES[sig];
  return Array.from({ length: beats }, (_, i) => (i === 0 ? 1 : unit === 8 && beats % 3 === 0 && i % 3 === 0 ? 0.8 : 0.6));
}
/** Ciclo al tocar un pulso: fuerte → normal → silencio → fuerte. */
export const nextAccent = (a) => (a >= 0.95 ? 0.6 : a > 0 ? 0 : 1);

/** Tap tempo: BPM a partir de los instantes de los toques (ms). Ignora toques viejos (>2 s de pausa). */
export function tapTempo(times) {
  const recent = [];
  for (let i = times.length - 1; i >= 0; i--) {
    if (recent.length && recent[0] - times[i] > 2000) break;
    recent.unshift(times[i]);
  }
  if (recent.length < 2) return null;
  const last = recent.slice(-6);
  const iv = [];
  for (let i = 1; i < last.length; i++) iv.push(last[i] - last[i - 1]);
  iv.sort((a, b) => a - b);
  const med = iv[Math.floor(iv.length / 2)];
  return clampBpm(60000 / med);
}

/** Entrenador de velocidad: BPM tras `bar` compases completados. */
export function trainerBpm({ start, step, every, target }, bar) {
  const up = Math.floor(bar / every) * step;
  return clampBpm(step >= 0 ? Math.min(target, start + up) : Math.max(target, start + up));
}

/**
 * Secuencia de clics de un compás. Devuelve [{t (segundos desde el inicio del compás), beat, sub, level}].
 * En compases de corchea (x/8) el BPM se refiere a la corchea.
 */
export function barEvents({ bpm, sig, subdiv, accents }) {
  const { beats } = TIME_SIGNATURES[sig];
  const beatDur = 60 / bpm, out = [];
  for (let b = 0; b < beats; b++) {
    for (let s = 0; s < subdiv; s++) {
      const level = s === 0 ? accents[b] : accents[b] > 0 ? 0.35 : 0;
      out.push({ t: b * beatDur + (s * beatDur) / subdiv, beat: b, sub: s, level });
    }
  }
  return out;
}

const SOUNDS = {
  click: { name: 'Clic' }, wood: { name: 'Madera' }, beep: { name: 'Pitido' }, cowbell: { name: 'Cencerro' },
};
export const SOUND_NAMES = Object.fromEntries(Object.entries(SOUNDS).map(([k, v]) => [k, v.name]));

/** Programador de audio. state es un objeto vivo {bpm, sig, subdiv, accents, sound, volume, trainer, muteBars}. */
export class Metronome {
  constructor(getCtx, state) {
    this.getCtx = getCtx;
    this.state = state;
    this.running = false;
    this.queue = []; // clics programados (para la parte visual)
    this.onBar = null;
  }

  async start() {
    if (this.running) return;
    const ctx = await this.getCtx();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    this.noise = this.noise || makeNoise(ctx);
    this.running = true;
    this.bar = 0;
    this.idx = 0;
    this.barStart = ctx.currentTime + 0.08;
    this.events = null;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.running = false;
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, now, 0.01);
    const old = this.out;
    setTimeout(() => old.disconnect(), 200);
    this.queue = [];
  }

  /** BPM efectivo del compás actual (con entrenador de velocidad). */
  currentBpm() {
    const s = this.state;
    return s.trainer?.on ? trainerBpm(s.trainer, this.bar) : s.bpm;
  }

  schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (true) {
      if (!this.events) {
        this.barBpm = this.currentBpm();
        this.events = barEvents({ ...this.state, bpm: this.barBpm });
        this.barDur = TIME_SIGNATURES[this.state.sig].beats * 60 / this.barBpm;
        this.onBar?.(this.bar, this.barBpm);
      }
      if (this.idx >= this.events.length) {
        this.barStart += this.barDur;
        this.bar++;
        this.idx = 0;
        this.events = null;
        continue;
      }
      const ev = this.events[this.idx];
      const t = this.barStart + ev.t;
      if (t > ahead) break;
      const s = this.state;
      // compases en silencio (entrenamiento del pulso interno)
      const muted = s.muteBars?.on && (this.bar % (s.muteBars.play + s.muteBars.mute)) >= s.muteBars.play;
      if (ev.level > 0 && !muted) this.click(t, ev.level, ev.sub === 0 && ev.beat === 0 && ev.level >= 0.95);
      this.queue.push({ t, beat: ev.beat, sub: ev.sub, level: muted ? 0 : ev.level, bar: this.bar });
      if (this.queue.length > 64) this.queue.splice(0, this.queue.length - 64);
      this.idx++;
    }
  }

  click(t, level, downbeat) {
    const ctx = this.ctx, s = this.state;
    const g = ctx.createGain();
    const vol = (s.volume ?? 0.8) * level;
    g.connect(this.out);
    const pitch = downbeat ? 1.5 : level < 0.5 ? 0.8 : 1;
    if (s.sound === 'wood') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800 * pitch; bp.Q.value = 6;
      src.connect(bp).connect(g);
      g.gain.setValueAtTime(vol * 3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.start(t); src.stop(t + 0.06);
      return;
    }
    const osc = ctx.createOscillator();
    const decay = s.sound === 'beep' ? 0.09 : s.sound === 'cowbell' ? 0.18 : 0.03;
    osc.type = s.sound === 'beep' ? 'sine' : s.sound === 'cowbell' ? 'square' : 'triangle';
    osc.frequency.value = (s.sound === 'beep' ? 880 : s.sound === 'cowbell' ? 560 : 1250) * pitch;
    if (s.sound === 'cowbell') {
      const osc2 = ctx.createOscillator();
      osc2.type = 'square'; osc2.frequency.value = 845 * pitch;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * pitch; bp.Q.value = 2;
      osc.connect(bp); osc2.connect(bp); bp.connect(g);
      osc2.start(t); osc2.stop(t + decay + 0.02);
    } else osc.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * (s.sound === 'cowbell' ? 0.5 : 0.9), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.start(t); osc.stop(t + decay + 0.02);
  }
}

function makeNoise(ctx) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
