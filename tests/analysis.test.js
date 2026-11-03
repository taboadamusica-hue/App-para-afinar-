import test from 'node:test';
import assert from 'node:assert/strict';
import { midiToFreq } from '../js/pitch.js';
import { analyzeTake, segmentNotes, analyzeVibrato, scoreSustain, scoreSequence, spectralCentroid } from '../js/analysis.js';

const FPS = 50;
/** Genera frames sintéticos: lista de [midi, dur, centsOffset, vibrato{rate,extent}] con silencios entre notas. */
function synth(notes, { gap = 0.15, amp = 0.1, centroid = 1500, clarity = 0.95 } = {}) {
  const frames = [];
  let t = 0;
  for (const [midi, dur, off = 0, vib = null] of notes) {
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      const tt = i / FPS;
      const v = vib ? (vib.extent / 2) * Math.sin(2 * Math.PI * vib.rate * tt) : 0;
      frames.push({ t, f: midiToFreq(midi + (off + v) / 100), c: clarity, a: amp, b: centroid });
      t += 1 / FPS;
    }
    for (let i = 0; i < Math.round(gap * FPS); i++) { frames.push({ t, f: 0, c: 0, a: 0.001, b: 0 }); t += 1 / FPS; }
  }
  return frames;
}

test('segmenta notas separadas por silencios', () => {
  const notes = segmentNotes(synth([[60, 0.5], [62, 0.5], [64, 0.5]]));
  assert.equal(notes.length, 3);
  assert.deepEqual(notes.map((n) => n.target), [60, 62, 64]);
});

test('segmenta legato (sin silencios) por cambio de nota', () => {
  const notes = segmentNotes(synth([[60, 0.5], [64, 0.5], [67, 0.5]], { gap: 0 }));
  assert.deepEqual(notes.map((n) => n.target), [60, 64, 67]);
});

test('toma afinada → puntuación de afinación alta', () => {
  const r = analyzeTake(synth([[60, 0.8], [62, 0.8], [64, 0.8], [65, 0.8], [67, 1]]), { keyPc: 0, scale: 'major' });
  assert.ok(r.tuning.meanAbsCents < 2, String(r.tuning.meanAbsCents));
  assert.ok(r.tuning.score > 95);
  assert.equal(r.tuning.inTunePct, 100);
  assert.equal(r.range.lowName, 'Do4');
  assert.equal(r.range.highName, 'Sol4');
});

test('toma calada → sesgo negativo y consejo', () => {
  const r = analyzeTake(synth([[60, 0.8, -30], [62, 0.8, -30], [64, 0.8, -30], [65, 0.8, -30]]), { scale: 'major' });
  assert.ok(Math.abs(r.tuning.bias + 30) < 2);
  assert.ok(r.tuning.score < 60);
  assert.ok(r.tips.some((t) => t.includes('calado')));
});

test('detecta vibrato a 5.5 Hz', () => {
  const v = analyzeVibrato(Array.from({ length: 100 }, (_, i) => 40 * Math.sin(2 * Math.PI * 5.5 * (i / FPS))), 1 / FPS);
  assert.ok(v.present);
  assert.ok(Math.abs(v.rate - 5.5) < 0.6, String(v.rate));
  assert.ok(v.extent > 60 && v.extent < 100, String(v.extent));
  const flat = analyzeVibrato(new Array(100).fill(0), 1 / FPS);
  assert.equal(flat.present, false);
});

test('emoción: fuerte+brillante+rápido vs suave+oscuro+lento', () => {
  const happy = analyzeTake(
    synth(Array.from({ length: 12 }, (_, i) => [[60, 64, 67, 72][i % 4], 0.22]), { gap: 0.03, amp: 0.4, centroid: 3200 }),
    { scale: 'major' },
  );
  const sad = analyzeTake(
    synth([[64, 1.6], [62, 1.6], [60, 2]], { amp: 0.01, centroid: 800, clarity: 0.85 }),
    { scale: 'minor', keyPc: 9 },
  );
  assert.ok(happy.emotion.arousal > sad.emotion.arousal);
  assert.ok(happy.emotion.valence > sad.emotion.valence);
  assert.equal(happy.emotion.id, 'alegre');
  assert.equal(sad.emotion.id, 'triste');
  assert.ok(happy.tone.brightness > sad.tone.brightness);
});

test('emoción objetivo da porcentaje de coincidencia y pista', () => {
  const r = analyzeTake(synth([[64, 1.6], [62, 1.6], [60, 2]], { amp: 0.01, centroid: 800 }), { scale: 'minor', targetEmotion: 'alegre' });
  assert.ok(r.emotion.match < 50);
  assert.ok(r.emotion.hint);
});

test('toma vacía', () => {
  const r = analyzeTake([{ t: 0, f: 0, c: 0, a: 0, b: 0 }]);
  assert.equal(r.empty, true);
});

test('ejercicios: nota sostenida y secuencia', () => {
  const good = scoreSustain(synth([[57, 3, 3]], { gap: 0 }), 57);
  assert.ok(good.score > 90);
  const bad = scoreSustain(synth([[57, 3, 45]], { gap: 0 }), 57);
  assert.ok(bad.score < 40);
  const seq = scoreSequence(synth([[60, 1], [62, 1], [64, 1]], { gap: 0 }), [60, 62, 64], 1);
  assert.ok(seq.score > 90);
  assert.ok(seq.perNote.every((p) => p.ok));
  // una octava por debajo también cuenta
  assert.ok(scoreSustain(synth([[45, 3, 3]], { gap: 0 }), 57).score > 90);
  assert.ok(scoreSequence(synth([[48, 1], [50, 1], [52, 1]], { gap: 0 }), [60, 62, 64], 1).score > 90);
});

test('centroide espectral', () => {
  const fft = 2048, sr = 48000, mags = new Float32Array(fft / 2).fill(-200);
  mags[Math.round(1000 / (sr / fft))] = 0;
  assert.ok(Math.abs(spectralCentroid(mags, sr, fft) - 1000) < 30);
});
