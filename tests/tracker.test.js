import test from 'node:test';
import assert from 'node:assert/strict';
import { PitchTracker, OneEuro } from '../js/tracker.js';
import { midiToFreq } from '../js/pitch.js';

const DT = 0.012;
const run = (tr, seq) => seq.map(([m, i]) => tr.update(m ? midiToFreq(m) : 0, i * DT));

test('One Euro reduce el temblor de una nota quieta', () => {
  const f = new OneEuro(1.2, 0.08);
  let seed = 3, maxDev = 0;
  for (let i = 0; i < 300; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = 60 + ((seed / 2147483647) - 0.5) * 0.2; // ±10 cents de ruido
    const y = f.filter(x, i * DT);
    if (i > 50) maxDev = Math.max(maxDev, Math.abs(y - 60));
  }
  assert.ok(maxDev < 0.045, `desviación ${maxDev}`); // ruido de ±10 cents → < 4.5 cents
});

test('sigue un cambio de nota en menos de ~80 ms', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push([60, i]);
  for (let i = 60; i < 120; i++) seq.push([64, i]);
  const out = run(tr, seq);
  const settled = out.findIndex((o, i) => i >= 60 && Math.abs(o.steady - 64) < 0.1);
  assert.ok(settled > 0 && (settled - 60) * DT < 0.08, `tardó ${(settled - 60) * DT}s`);
  assert.equal(out[119].note, 64);
});

test('ignora un salto de octava aislado y un frame espurio', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push([57, i]);
  seq.push([69, 40]);              // error de octava
  for (let i = 41; i < 45; i++) seq.push([57, i]);
  seq.push([63, 45]);              // frame espurio
  for (let i = 46; i < 60; i++) seq.push([57, i]);
  const out = run(tr, seq);
  for (const o of out.slice(10)) assert.ok(Math.abs(o.steady - 57) < 0.2, String(o.steady));
  assert.equal(out[40].freq.toFixed(1), midiToFreq(57).toFixed(1)); // octava corregida para grabar
});

test('mantiene la nota en microcortes y la suelta después', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 30; i++) seq.push([62, i]);
  for (let i = 30; i < 35; i++) seq.push([0, i]);   // 60 ms de corte
  for (let i = 35; i < 60; i++) seq.push([62, i]);
  for (let i = 60; i < 100; i++) seq.push([0, i]);  // silencio real
  const out = run(tr, seq);
  assert.ok(out.slice(30, 35).every((o) => o.voiced && o.held));
  assert.equal(out[99].voiced, false);
});

test('la curva conserva el vibrato y la aguja lo amortigua', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 300; i++) seq.push([60 + 0.4 * Math.sin(2 * Math.PI * 5.5 * i * DT), i]);
  const out = run(tr, seq).slice(100);
  const amp = (k) => (Math.max(...out.map((o) => o[k])) - Math.min(...out.map((o) => o[k]))) / 2;
  assert.ok(amp('midi') > 0.25, `curva ${amp('midi')}`);
  assert.ok(amp('steady') < amp('midi') * 0.7, `aguja ${amp('steady')}`);
  assert.ok(out.every((o) => o.note === 60));
});

test('se asienta rápido aunque el ataque de la nota llegue desviado', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push([60, i]);
  // nueva nota: los primeros frames llegan 35 cents bajos y convergen
  for (let i = 60; i < 140; i++) seq.push([65 - 0.35 * Math.exp(-(i - 60) / 2), i]);
  const out = run(tr, seq);
  const settled = out.findIndex((o, i) => i >= 60 && Math.abs(o.steady - 65) < 0.05 && out.slice(i, i + 20).every((q) => Math.abs(q.steady - 65) < 0.05));
  assert.ok((settled - 60) * DT <= 0.15, `tardó ${((settled - 60) * DT).toFixed(3)}s`);
});

test('un cambio de un semitono también se asienta enseguida', () => {
  const tr = new PitchTracker('voice');
  const seq = [];
  for (let i = 0; i < 60; i++) seq.push([64, i]);
  for (let i = 60; i < 140; i++) seq.push([65, i]);
  const out = run(tr, seq);
  const settled = out.findIndex((o, i) => i >= 60 && Math.abs(o.steady - 65) < 0.05);
  assert.ok((settled - 60) * DT <= 0.1, `tardó ${((settled - 60) * DT).toFixed(3)}s`);
});
