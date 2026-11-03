// Motor de micrófono: captura, detección de tono por frame, grabación y tonos de referencia.
import { detectPitch, rms, midiToFreq } from './pitch.js';
import { spectralCentroid } from './analysis.js';

export class MicEngine {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.listeners = new Set();
    this.running = false;
    this.rec = null;
  }

  async ensureContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  async start() {
    if (this.running) return;
    const ctx = await this.ensureContext();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.src.connect(this.analyser);
    this.timeBuf = new Float32Array(this.analyser.fftSize);
    this.freqBuf = new Float32Array(this.analyser.frequencyBinCount);
    this.running = true;
    // setInterval en lugar de rAF para seguir midiendo aunque la pestaña pierda el foco
    this.timer = setInterval(() => this.tick(), 20);
  }

  stop() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.stream.getTracks().forEach((t) => t.stop());
    this.src.disconnect();
    this.running = false;
  }

  tick() {
    const { sensitivity = 5, a4 = 440 } = this.getSettings();
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    const a = rms(this.timeBuf);
    const gate = Math.pow(10, -(22 + sensitivity * 4) / 20); // sensibilidad 5 → -42 dBFS
    let f = 0, c = 0, b = 0;
    if (a > gate) {
      const p = detectPitch(this.timeBuf, this.ctx.sampleRate, { minFreq: 60, maxFreq: 1400 });
      if (p && p.clarity > 0.75) {
        f = p.freq; c = p.clarity;
        this.analyser.getFloatFrequencyData(this.freqBuf);
        b = spectralCentroid(this.freqBuf, this.ctx.sampleRate, this.analyser.fftSize);
      }
    }
    const frame = { t: this.ctx.currentTime, f, c, a, b, a4 };
    if (this.rec) this.rec.frames.push({ ...frame, t: frame.t - this.rec.t0 });
    this.listeners.forEach((fn) => fn(frame));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Graba frames (y audio si withAudio). */
  startRecording(withAudio = true) {
    this.rec = { t0: this.ctx.currentTime, frames: [], chunks: [], mr: null };
    if (withAudio && window.MediaRecorder) {
      const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
      try {
        const mr = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = (e) => e.data.size && this.rec?.chunks.push(e.data);
        mr.start(250);
        this.rec.mr = mr;
      } catch { /* sin audio, solo frames */ }
    }
  }

  async stopRecording() {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return null;
    let blob = null;
    if (rec.mr) {
      await new Promise((res) => { rec.mr.onstop = res; rec.mr.stop(); });
      blob = new Blob(rec.chunks, { type: rec.mr.mimeType || 'audio/webm' });
    }
    return { frames: rec.frames, blob };
  }

  /** Toca una nota de referencia (onda suave). Devuelve una promesa al terminar. */
  async playTone(midi, dur = 1, when = 0) {
    const ctx = await this.ensureContext();
    const { a4 = 440 } = this.getSettings();
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.value = osc2.frequency.value = midiToFreq(midi, a4);
    osc2.frequency.value *= 2;
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.setValueAtTime(0.25, t + dur - 0.12);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    osc.connect(lp); osc2.connect(g2).connect(lp);
    lp.connect(g).connect(ctx.destination);
    osc.start(t); osc2.start(t); osc.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
    return new Promise((r) => setTimeout(r, (when + dur) * 1000));
  }
}
