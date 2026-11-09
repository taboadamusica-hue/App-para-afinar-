import test from 'node:test';
import assert from 'node:assert/strict';
import { tapTempo, tempoName, barEvents, defaultAccents, nextAccent, trainerBpm, clampBpm } from '../js/metronome.js';

test('tap tempo: mediana de intervalos y reinicio tras pausa', () => {
  assert.equal(tapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(tapTempo([0, 600, 1210, 1800, 2400]), 100);
  assert.equal(tapTempo([0, 500, 1000, 9000, 9750]), 80); // la pausa larga reinicia
  assert.equal(tapTempo([100]), null);
  assert.equal(tapTempo([0, 50]), 300); // limitado al máximo
});

test('nombres de tempo y límites', () => {
  assert.equal(tempoName(60), 'Larghetto');
  assert.equal(tempoName(100), 'Andante');
  assert.equal(tempoName(130), 'Allegro');
  assert.equal(clampBpm(10), 30);
  assert.equal(clampBpm(999), 300);
});

test('eventos de un compás con subdivisión y acentos', () => {
  const ev = barEvents({ bpm: 120, sig: '4/4', subdiv: 2, accents: defaultAccents('4/4') });
  assert.equal(ev.length, 8);
  assert.deepEqual(ev.map((e) => +e.t.toFixed(3)), [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
  assert.equal(ev[0].level, 1);
  assert.equal(ev[1].level, 0.35);
  assert.equal(ev[2].level, 0.6);
  const tres = barEvents({ bpm: 60, sig: '3/4', subdiv: 3, accents: [1, 0, 0.6] });
  assert.equal(tres.length, 9);
  assert.ok(Math.abs(tres[1].t - 1 / 3) < 1e-9);
  assert.equal(tres[3].level, 0); // pulso silenciado: sus subdivisiones también
});

test('acentos por defecto en compases compuestos y ciclo de acento', () => {
  assert.deepEqual(defaultAccents('6/8'), [1, 0.6, 0.6, 0.8, 0.6, 0.6]);
  assert.deepEqual(defaultAccents('7/8'), [1, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]);
  assert.equal(nextAccent(1), 0.6);
  assert.equal(nextAccent(0.6), 0);
  assert.equal(nextAccent(0), 1);
});

test('entrenador de velocidad sube y se detiene en el objetivo', () => {
  const tr = { start: 80, step: 5, every: 4, target: 100 };
  assert.equal(trainerBpm(tr, 0), 80);
  assert.equal(trainerBpm(tr, 3), 80);
  assert.equal(trainerBpm(tr, 4), 85);
  assert.equal(trainerBpm(tr, 40), 100);
});
