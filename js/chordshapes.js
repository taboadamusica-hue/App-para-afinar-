// Posiciones de acordes de guitarra y diagramas SVG (guitarra y piano).
// Cuerdas de 6ª (Mi grave) a 1ª (Mi agudo); -1 = no se toca, 0 = al aire.

// Acordes abiertos habituales (raíz en notación inglesa → tipo → trastes)
const OPEN = {
  C: { maj: [-1, 3, 2, 0, 1, 0], '7': [-1, 3, 2, 3, 1, 0], maj7: [-1, 3, 2, 0, 0, 0], sus2: [-1, 3, 0, 0, 3, 3], sus4: [-1, 3, 3, 0, 1, 1] },
  D: { maj: [-1, -1, 0, 2, 3, 2], min: [-1, -1, 0, 2, 3, 1], '7': [-1, -1, 0, 2, 1, 2], m7: [-1, -1, 0, 2, 1, 1], maj7: [-1, -1, 0, 2, 2, 2], sus4: [-1, -1, 0, 2, 3, 3], sus2: [-1, -1, 0, 2, 3, 0] },
  E: { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0] },
  F: { maj7: [-1, -1, 3, 2, 1, 0] },
  G: { maj: [3, 2, 0, 0, 0, 3], '7': [3, 2, 0, 0, 0, 1], maj7: [3, 2, 0, 0, 0, 2] },
  A: { maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0] },
  B: { '7': [-1, 2, 1, 2, 0, 2] },
};
const EN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Formas móviles (desplazamientos respecto al traste r de la raíz)
const E_SHAPE = { // raíz en la 6ª cuerda
  maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, -1, 1, 1, 0, -1], sus4: [0, 2, 2, 2, 0, 0],
};
const A_SHAPE = { // raíz en la 5ª cuerda
  maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], dim: [-1, 0, 1, 2, 1, -1], aug: [-1, 0, 3, 2, 2, -1],
};
const MUTE_IN_SHAPE = { maj7: [1, 5] }; // posiciones que la forma E deja sin tocar

function moveShape(shape, r, muteIdx = []) {
  return shape.map((o, i) => (o === -1 || muteIdx.includes(i) ? -1 : r + o));
}

/** Posición de guitarra para {root (0=Do), type}. Devuelve {frets, barre, base}. */
export function guitarVoicing({ root, type }) {
  const open = OPEN[EN[root]]?.[type];
  const cands = [];
  if (open) cands.push({ frets: open, open: true });
  if (E_SHAPE[type]) {
    const r = (root - 4 + 12) % 12 || 12;
    const raw = E_SHAPE[type].map((o, i) => ((MUTE_IN_SHAPE[type] || []).includes(i) ? -1 : o === -1 ? -1 : r + o));
    cands.push({ frets: raw, barreFret: r });
  }
  if (A_SHAPE[type]) {
    const r = (root - 9 + 12) % 12 || 12;
    cands.push({ frets: moveShape(A_SHAPE[type], r), barreFret: type === 'dim' || type === 'aug' ? null : r });
  }
  const maxFret = (c) => Math.max(...c.frets);
  cands.sort((a, b) => (a.open ? -1 : 0) - (b.open ? -1 : 0) || maxFret(a) - maxFret(b));
  const c = cands[0];
  const played = c.frets.filter((f) => f > 0);
  const min = played.length ? Math.min(...played) : 1;
  const base = maxFret(c) <= 4 ? 1 : min;
  let barre = null;
  if (!c.open && c.barreFret && c.barreFret > 0) {
    const idx = c.frets.map((f, i) => (f === c.barreFret ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 2) barre = { fret: c.barreFret, from: idx[0], to: idx[idx.length - 1] };
  }
  return { frets: c.frets, barre, base };
}

/** SVG de un diagrama de guitarra. */
export function guitarSvg(ch, { size = 120 } = {}) {
  const { frets, barre, base } = guitarVoicing(ch);
  const W = 100, H = 120, x0 = 18, x1 = 88, y0 = 26, fh = 18, nF = 5;
  const sx = (i) => x0 + (i * (x1 - x0)) / 5;
  const fy = (f) => y0 + (f - base + 0.5) * fh;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${size}" height="${(size * H) / W}" class="chord-svg" role="img" aria-label="Posición de guitarra">`;
  s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${nF * fh}" fill="none"/>`;
  for (let f = 0; f <= nF; f++) s += `<line x1="${x0}" x2="${x1}" y1="${y0 + f * fh}" y2="${y0 + f * fh}" class="cs-fret${f === 0 && base === 1 ? ' cs-nut' : ''}"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${sx(i)}" x2="${sx(i)}" y1="${y0}" y2="${y0 + nF * fh}" class="cs-string"/>`;
  if (base > 1) s += `<text x="${x0 - 5}" y="${y0 + fh * 0.62}" text-anchor="end" class="cs-base">${base}</text>`;
  frets.forEach((f, i) => {
    if (f === -1) s += `<text x="${sx(i)}" y="${y0 - 8}" text-anchor="middle" class="cs-mute">×</text>`;
    else if (f === 0) s += `<circle cx="${sx(i)}" cy="${y0 - 11}" r="4" class="cs-open"/>`;
  });
  if (barre) s += `<rect x="${sx(barre.from) - 6}" y="${fy(barre.fret) - 6}" width="${sx(barre.to) - sx(barre.from) + 12}" height="12" rx="6" class="cs-dot"/>`;
  frets.forEach((f, i) => {
    if (f > 0 && !(barre && f === barre.fret && i >= barre.from && i <= barre.to)) s += `<circle cx="${sx(i)}" cy="${fy(f)}" r="6.2" class="cs-dot"/>`;
  });
  return s + '</svg>';
}

/** SVG de un teclado de dos octavas con las notas del acorde marcadas (desde la raíz). */
export function pianoSvg(notesPc, root, { size = 168 } = {}) {
  const whites = [0, 2, 4, 5, 7, 9, 11], blacks = [1, 3, 6, 8, 10];
  const start = 0; // empieza en Do
  const W = 14 * 12, H = 64;
  // notas absolutas: raíz en la primera octava y el resto por encima
  const abs = notesPc.map((pc) => { let n = pc; while (n < root) n += 12; return n; });
  const on = new Set(abs);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${size}" height="${(size * H) / W}" class="chord-svg piano-svg" role="img" aria-label="Posición de piano">`;
  for (let o = 0; o < 2; o++) whites.forEach((pc, i) => {
    const n = start + o * 12 + pc, x = (o * 7 + i) * 12;
    s += `<rect x="${x + 0.5}" y="0.5" width="11" height="${H - 1}" rx="2" class="pk-white${on.has(n) ? ' pk-on' : ''}"/>`;
  });
  for (let o = 0; o < 2; o++) blacks.forEach((pc) => {
    const n = start + o * 12 + pc;
    const wi = whites.filter((w) => w < pc).length;
    const x = (o * 7 + wi) * 12 - 3.5;
    s += `<rect x="${x}" y="0" width="7" height="${H * 0.6}" rx="1.5" class="pk-black${on.has(n) ? ' pk-on' : ''}"/>`;
  });
  return s + '</svg>';
}
