import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch, freqToMidi, midiToFreq, noteName, nearestScaleMidi } from '../js/pitch.js';

const SR = 44100;
function voice(freq, n = 2048, harmonics = [1, 0.5, 0.3, 0.2], phase = 0) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    harmonics.forEach((a, k) => { s += a * Math.sin(2 * Math.PI * freq * (k + 1) * (i / SR) + phase); });
    b[i] = s * 0.3;
  }
  return b;
}

test('YIN detecta tonos puros y con armónicos con < 3 cents de error', () => {
  for (const f of [82.41, 110, 196, 261.63, 440, 659.25, 987.77]) {
    for (const h of [[1], [1, 0.6, 0.4, 0.3, 0.2]]) {
      const r = detectPitch(voice(f, 2048, h), SR);
      assert.ok(r, `sin resultado para ${f}`);
      const cents = 1200 * Math.log2(r.freq / f);
      assert.ok(Math.abs(cents) < 3, `${f} Hz → ${r.freq.toFixed(2)} (${cents.toFixed(2)} c)`);
      assert.ok(r.clarity > 0.9);
    }
  }
});

test('YIN devuelve null con ruido', () => {
  const b = new Float32Array(2048);
  let seed = 1;
  for (let i = 0; i < b.length; i++) { seed = (seed * 16807) % 2147483647; b[i] = (seed / 2147483647 - 0.5) * 0.5; }
  assert.equal(detectPitch(b, SR), null);
});

test('conversiones MIDI y nombres de nota', () => {
  assert.equal(freqToMidi(440), 69);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
  assert.equal(noteName(60), 'Do4');
  assert.equal(noteName(69, 'english'), 'A4');
  assert.equal(noteName(61.4, 'latin', false), 'Do#');
  assert.ok(Math.abs(freqToMidi(432, 432) - 69) < 1e-9);
});

test('nota de escala más cercana', () => {
  // Do mayor: Do# (61) no está en la escala → 60 o 62
  assert.ok([60, 62].includes(nearestScaleMidi(61, 0, 'major')));
  assert.equal(nearestScaleMidi(61.3, 0, 'major'), 62);
  assert.equal(nearestScaleMidi(64.4, 0, 'major'), 64);
  assert.equal(nearestScaleMidi(61.2, 0, 'chromatic'), 61);
  // La menor: Sol# no, Sol sí
  assert.equal(nearestScaleMidi(67.9, 9, 'minor'), 67);
});

test('afinaciones de guitarra y cuerda más cercana', async () => {
  const { GUITAR_TUNINGS, nearestString } = await import('../js/pitch.js');
  const std = GUITAR_TUNINGS.standard.notes;
  assert.deepEqual(std.map((m) => noteName(m, 'english')), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.equal(nearestString(45.3, std), 1);   // La2 algo alta → 5ª cuerda
  assert.equal(nearestString(63.6, std), 5);   // Mi4 algo baja → 1ª cuerda
  assert.equal(GUITAR_TUNINGS.dropD.notes[0], 38);
});

test('pico del espectro con interpolación', async () => {
  const { spectrumPeak } = await import('../js/draw.js');
  const n = 4096, sr = 48000, binHz = sr / (2 * n);
  const db = new Float32Array(n).fill(-110);
  const f = 440, k = f / binHz;
  for (let i = 0; i < n; i++) db[i] = Math.max(-110, -20 - 40 * (i - k) ** 2);
  const p = spectrumPeak(db, sr, 60, 5000);
  assert.ok(Math.abs(p.freq - 440) < 1, String(p.freq));
});

test('tesituras: datos coherentes y sugerencia por rango', async () => {
  const { VOICE_TYPES, suggestVoiceTypes } = await import('../js/pitch.js');
  for (const v of VOICE_TYPES) {
    assert.ok(v.range[0] <= v.comfort[0] && v.comfort[1] <= v.range[1], v.id);
    assert.ok(v.range[1] - v.range[0] >= 20, v.id);
  }
  assert.equal(suggestVoiceTypes(52, 69)[0].id, 'tenor');      // Mi3–La4
  assert.equal(suggestVoiceTypes(43, 60)[0].id, 'bajo');       // Sol2–Do4
  assert.equal(suggestVoiceTypes(64, 79)[0].id, 'soprano');    // Mi4–Sol5
  assert.equal(suggestVoiceTypes(60, 75)[0].id, 'mezzo');      // Do4–Re#5
  assert.equal(suggestVoiceTypes(47, 64)[0].id, 'baritono');   // Si2–Mi4
});
