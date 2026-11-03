import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSong, bestChord, chromaFromMagnitudes, chordName, detectKey, estimateTempo, chordNotes } from '../js/chords.js';
import { magnitudeSpectrum } from '../js/fft.js';

const SR = 22050;
const mf = (m) => 440 * 2 ** ((m - 69) / 12);
/** Acorde sintético tipo piano: notas con armónicos y decaimiento; ataque cada pulso. */
function render(prog, bpm = 100, beatsPer = 4, bassOct = true) {
  const beat = 60 / bpm, out = new Float32Array(Math.ceil(prog.length * beatsPer * beat * SR));
  prog.forEach((notes, ci) => {
    for (let b = 0; b < beatsPer; b++) {
      const t0 = (ci * beatsPer + b) * beat, n0 = Math.floor(t0 * SR), len = Math.floor(beat * SR);
      const all = bassOct ? [...notes, notes[0] - 12] : notes;
      for (const m of all) {
        const f = mf(m);
        for (let i = 0; i < len && n0 + i < out.length; i++) {
          const t = i / SR, env = Math.exp(-3 * t) * Math.min(1, i / 60);
          out[n0 + i] += 0.08 * env * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.2 * Math.sin(6 * Math.PI * f * t));
        }
      }
    }
  });
  return out;
}

test('FFT: pico en la frecuencia correcta', () => {
  const n = 4096, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
  const m = magnitudeSpectrum(x, 0, n);
  let k = 0;
  for (let i = 1; i < m.length; i++) if (m[i] > m[k]) k = i;
  assert.ok(Math.abs(k * SR / n - 440) < SR / n);
});

test('reconoce triadas mayores, menores y séptimas en un frame', () => {
  const cases = [[[60, 64, 67], 'Do'], [[57, 60, 64], 'Lam'], [[55, 59, 62, 65], 'Sol7'], [[62, 65, 69], 'Rem'], [[65, 69, 72, 76], 'Famaj7']];
  for (const [notes, name] of cases) {
    const x = render([notes], 120, 1);
    const fr = chromaFromMagnitudes(magnitudeSpectrum(x, 1000, 4096), SR, 4096);
    assert.equal(chordName(bestChord(fr)), name);
  }
});

test('progresión Do–Lam–Fa–Sol: acordes, tonalidad y tempo', async () => {
  const prog = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
  const x = render([...prog, ...prog], 100, 4);
  const r = await analyzeSong(x, SR);
  const names = r.chords.filter((c) => c.chord && c.end - c.start > 1).map((c) => chordName(c.chord));
  assert.deepEqual(names, ['Do', 'Lam', 'Fa', 'Sol', 'Do', 'Lam', 'Fa', 'Sol']);
  assert.equal(r.key.root, 0);
  assert.equal(r.key.mode, 'major');
  assert.ok(Math.abs(r.bpm - 100) <= 2 || Math.abs(r.bpm - 200) <= 3 || Math.abs(r.bpm - 50) <= 2, String(r.bpm));
  // cambios cerca de los compases (cada 2.4 s)
  const lam = r.chords.find((c) => chordName(c.chord) === 'Lam');
  assert.ok(Math.abs(lam.start - 2.4) < 0.3, String(lam.start));
});

test('nombres, transposición y notas', () => {
  assert.equal(chordName({ root: 9, type: 'min' }, 'english'), 'Am');
  assert.equal(chordName({ root: 9, type: 'min' }, 'latin', 3), 'Dom');
  assert.equal(chordName(null), 'N.C.');
  assert.deepEqual(chordNotes({ root: 7, type: '7' }), [7, 11, 2, 5]);
  assert.equal(detectKey([1, 0, 0.6, 0, 0.8, 0.7, 0, 0.9, 0, 0.6, 0, 0.5]).root, 0);
  assert.equal(estimateTempo([1, 2], 0.01), null);
});

test('posiciones de guitarra: abiertos y cejillas correctos', async () => {
  const { guitarVoicing } = await import('../js/chordshapes.js');
  const STD = [40, 45, 50, 55, 59, 64];
  const pcs = (v) => new Set(v.frets.map((f, i) => (f < 0 ? null : (STD[i] + f) % 12)).filter((x) => x !== null));
  const types = { maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
  for (let root = 0; root < 12; root++) {
    for (const [type, iv] of Object.entries(types)) {
      const v = guitarVoicing({ root, type });
      const want = new Set(iv.map((i) => (root + i) % 12));
      const got = pcs(v);
      for (const pc of got) assert.ok(want.has(pc), `${root} ${type}: nota ${pc} fuera del acorde (${v.frets})`);
      assert.ok(got.has(root), `${root} ${type}: falta la raíz`);
      assert.ok(got.size >= Math.min(3, want.size), `${root} ${type}: pocas notas (${v.frets})`);
      assert.ok(Math.max(...v.frets) <= 15);
    }
  }
  assert.deepEqual(guitarVoicing({ root: 5, type: 'maj' }).frets, [1, 3, 3, 2, 1, 1]); // Fa con cejilla
  assert.deepEqual(guitarVoicing({ root: 0, type: 'maj' }).frets, [-1, 3, 2, 0, 1, 0]); // Do abierto
});
