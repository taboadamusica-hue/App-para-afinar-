// Pantalla «Acordes»: reconocimiento en vivo (micro) y análisis de canciones (archivo).
import { chordName, keyName, chordNotes, chromaFromDb, bestChord, sameChord, analyzeSong } from './chords.js';
import { guitarSvg, pianoSvg } from './chordshapes.js';

export function initChords({ $, engine, settings, saveSettings, toast, db, esc, startMic, isActive }) {
  const notation = () => settings.notation;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let mode = settings.chMode || 'live';

  // ---------- Modo ----------
  const modeBtns = document.querySelectorAll('[data-chmode]');
  function setMode(m) {
    mode = m;
    settings.chMode = m;
    saveSettings();
    modeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.chmode === m)));
    $('#chLive').hidden = m !== 'live';
    $('#chSong').hidden = m !== 'song';
    if (m === 'live') startMic();
    else { renderLibrary(); }
  }
  modeBtns.forEach((b) => (b.onclick = () => setMode(b.dataset.chmode)));

  const instrument = () => document.querySelector('input[name=chInst]:checked')?.value || 'guitar';
  const diagram = (ch, size) => (instrument() === 'piano' ? pianoSvg(chordNotes(ch), ch.root, { size: size * 1.4 }) : guitarSvg(ch, { size }));

  // ---------- En vivo ----------
  const lv = { chroma: null, bass: null, cand: null, candN: 0, current: null, history: [], lastEval: 0, quietSince: 0 };
  function liveFrame(now) {
    if (now - lv.lastEval < 90) return;
    lv.lastEval = now;
    const db = engine.getSpectrum();
    if (!db) return;
    const fr = chromaFromDb(db, engine.ctx.sampleRate);
    const a = 0.35;
    lv.chroma = lv.chroma ? lv.chroma.map((v, i) => v * (1 - a) + fr.chroma[i] * a) : fr.chroma;
    lv.bass = lv.bass ? lv.bass.map((v, i) => v * (1 - a) + fr.bass[i] * a) : fr.bass;
    if (!engine.gateOpen) {
      if (!lv.quietSince) lv.quietSince = now;
      if (now - lv.quietSince > 900 && lv.current) { lv.current = null; paintLive(); }
      return;
    }
    lv.quietSince = 0;
    const best = bestChord({ chroma: lv.chroma, bass: lv.bass });
    if (best.score < 0.62) return;
    const ch = { root: best.root, type: best.type };
    if (sameChord(ch, lv.cand)) lv.candN++;
    else { lv.cand = ch; lv.candN = 1; }
    // cambiar solo si el nuevo acorde se mantiene ~0,3 s
    if (lv.candN >= 3 && !sameChord(ch, lv.current)) {
      lv.current = ch;
      lv.history.unshift(ch);
      lv.history = lv.history.slice(0, 10);
      paintLive();
    }
  }
  function paintLive() {
    const ch = lv.current;
    $('#chNow').textContent = ch ? chordName(ch, notation()) : '–';
    $('#chNow').classList.toggle('idle', !ch);
    $('#chNowSub').textContent = ch ? `${chordNotes(ch).map((pc) => chordName({ root: pc, type: 'maj' }, notation())).join(' · ')}` : engine.running ? 'Escuchando… toca o canta un acorde' : 'Activa el micro y toca un acorde';
    $('#chDiagram').innerHTML = ch ? diagram(ch, 120) : '';
    $('#chHistory').innerHTML = lv.history.length
      ? lv.history.map((c) => `<span class="chord-chip">${chordName(c, notation())}</span>`).join('')
      : '<span class="muted">Aún no hay acordes</span>';
  }

  // ---------- Canción ----------
  let song = null; // { id, name, result, audio(Blob) }
  let url = null;
  const audio = $('#chAudio');
  const capoSel = $('#chCapo');
  capoSel.innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i}">${i === 0 ? 'No' : 'Traste ' + i}</option>`).join('');
  const shift = () => (song?.transpose || 0);
  const capo = () => (song?.capo || 0);
  // acorde que suena (transpuesto) y forma a tocar con cejilla
  const sounding = (ch) => (ch ? { ...ch, root: (ch.root + shift() + 120) % 12 } : null);
  const shape = (ch) => (ch ? { ...ch, root: (ch.root + shift() - capo() + 120) % 12 } : null);
  const label = (ch) => (ch ? (capo() ? `${chordName(shape(ch), notation())}` : chordName(sounding(ch), notation())) : 'N.C.');

  async function renderLibrary() {
    const list = (await db.all('chordsongs')).sort((a, b) => b.date - a.date);
    $('#chLibrary').innerHTML = list.length
      ? list.map((s) => `<button class="row-item" data-chsong="${s.id}">
          <span class="row-text"><span class="row-title">${esc(s.name)}</span>
          <span class="row-sub">${keyName(s.result.key, notation())}${s.result.bpm ? ` · ${s.result.bpm} BPM` : ''} · ${fmt(s.result.duration)} · ${new Set(s.result.chords.filter((c) => c.chord).map((c) => chordName(c.chord))).size} acordes</span></span></button>`).join('')
      : '<div class="empty"><b>Sin canciones todavía</b>Elige un archivo y verás sus acordes, tonalidad y tempo.</div>';
    document.querySelectorAll('[data-chsong]').forEach((b) => (b.onclick = async () => openSong(await db.get('chordsongs', b.dataset.chsong))));
  }

  $('#chFile').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    $('#chProgress').hidden = false;
    $('#chProgressBar').style.width = '0%';
    $('#chProgressText').textContent = 'Leyendo el audio…';
    try {
      const ctx = await engine.ensureContext();
      const buf = await ctx.decodeAudioData(await file.arrayBuffer());
      // mezcla a mono y reduce a ~22 kHz (suficiente para acordes y el doble de rápido)
      const factor = buf.sampleRate >= 44100 ? 2 : 1;
      const len = Math.floor(buf.length / factor);
      const mono = new Float32Array(len);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          let s = 0;
          for (let k = 0; k < factor; k++) s += d[i * factor + k];
          mono[i] += s / factor / buf.numberOfChannels;
        }
      }
      $('#chProgressText').textContent = 'Buscando acordes, tonalidad y tempo…';
      const result = await analyzeSong(mono, buf.sampleRate / factor, (p) => { $('#chProgressBar').style.width = `${Math.round(p * 100)}%`; });
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name.replace(/\.[^.]+$/, ''), date: Date.now(), result, audio: file, transpose: 0, capo: 0 };
      await db.put('chordsongs', rec);
      $('#chProgress').hidden = true;
      openSong(rec);
    } catch (err) {
      console.error(err);
      $('#chProgress').hidden = true;
      toast('No se pudo leer ese archivo de audio.');
    }
  };

  function openSong(rec) {
    song = rec;
    $('#chPick').hidden = true;
    $('#chPlayer').hidden = false;
    $('#chTitle').textContent = rec.name;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(rec.audio);
    audio.src = url;
    audio.playbackRate = 1;
    $('#chSpeed').value = '1';
    capoSel.value = String(rec.capo || 0);
    loop = null;
    $('#chLoop').setAttribute('aria-pressed', 'false');
    paintSong(true);
    window.scrollTo(0, 0);
  }
  $('#chClose').onclick = () => {
    audio.pause();
    song = null;
    $('#chPlayer').hidden = true;
    $('#chPick').hidden = false;
    renderLibrary();
  };
  $('#chDelete').onclick = async () => {
    if (!song || !confirm(`¿Eliminar «${song.name}» de la biblioteca?`)) return;
    await db.del('chordsongs', song.id);
    $('#chClose').onclick();
  };
  const persist = () => song && db.put('chordsongs', song);
  $('#chTrUp').onclick = () => { song.transpose = Math.min(6, (song.transpose || 0) + 1); persist(); paintSong(true); };
  $('#chTrDown').onclick = () => { song.transpose = Math.max(-6, (song.transpose || 0) - 1); persist(); paintSong(true); };
  capoSel.onchange = () => { song.capo = +capoSel.value; persist(); paintSong(true); };
  $('#chSpeed').onchange = (e) => { audio.playbackRate = +e.target.value; };
  document.querySelectorAll('input[name=chInst]').forEach((r) => (r.onchange = () => { paintSong(true); paintLive(); }));

  let loop = null;
  $('#chLoop').onclick = () => {
    if (loop) { loop = null; }
    else {
      const segs = song.result.chords;
      const i = currentIndex(audio.currentTime);
      const a = segs[Math.max(0, i)], b = segs[Math.min(segs.length - 1, i + 3)];
      loop = { start: a.start, end: b.end };
    }
    $('#chLoop').setAttribute('aria-pressed', String(!!loop));
    paintSong(true);
  };

  function currentIndex(t) {
    const segs = song.result.chords;
    let i = segs.findIndex((s) => t >= s.start && t < s.end);
    if (i < 0) i = t >= (segs[segs.length - 1]?.end ?? 0) ? segs.length - 1 : 0;
    return i;
  }

  let lastIdx = -1;
  function paintSong(full = false) {
    if (!song) return;
    const r = song.result;
    const segs = r.chords;
    const t = audio.currentTime || 0;
    const i = currentIndex(t);
    if (full) {
      const tr = song.transpose || 0;
      $('#chTr').textContent = tr > 0 ? `+${tr}` : String(tr);
      $('#chMeta').innerHTML = `<span class="chip">${keyName(r.key, notation(), tr)}</span>${r.bpm ? `<span class="chip">${r.bpm} BPM</span>` : ''}<span class="chip">${fmt(r.duration)}</span>${capo() ? `<span class="chip">Cejilla ${capo()}: formas mostradas</span>` : ''}`;
      const pxPerSec = 22;
      $('#chTimeline').innerHTML = segs.map((s, k) => `<button class="tl-chord${s.chord ? '' : ' nc'}${loop && s.start >= loop.start && s.end <= loop.end ? ' loop' : ''}" role="listitem" data-k="${k}" style="width:${Math.max(44, (s.end - s.start) * pxPerSec)}px">${s.chord ? label(s.chord) : '·'}</button>`).join('');
      $('#chTimeline').querySelectorAll('.tl-chord').forEach((b) => (b.onclick = () => { audio.currentTime = segs[+b.dataset.k].start + 0.01; paintSong(); }));
      const uniq = [];
      for (const s of segs) if (s.chord && !uniq.some((u) => sameChord(u, s.chord))) uniq.push(s.chord);
      $('#chAll').innerHTML = uniq.map((c) => `<div class="chord-card"><b>${label(c)}</b>${diagram(shape(c), 84)}</div>`).join('') || '<span class="muted">No se detectaron acordes claros.</span>';
      lastIdx = -1;
    }
    if (i !== lastIdx) {
      lastIdx = i;
      const cur = segs[i]?.chord ?? null;
      const next = segs.slice(i + 1).find((s) => s.chord)?.chord ?? null;
      $('#chSongNow').textContent = label(cur);
      $('#chSongNext').textContent = next ? label(next) : '–';
      $('#chSongDiagram').innerHTML = cur ? diagram(shape(cur), 120) : '';
      const tl = $('#chTimeline');
      tl.querySelectorAll('.tl-chord.on').forEach((b) => b.classList.remove('on'));
      const btn = tl.querySelector(`[data-k="${i}"]`);
      if (btn) {
        btn.classList.add('on');
        tl.scrollLeft = btn.offsetLeft - tl.clientWidth / 2 + btn.clientWidth / 2;
      }
    }
  }
  audio.addEventListener('seeked', () => paintSong());

  return {
    onShow() {
      modeBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.chmode === mode)));
      $('#chLive').hidden = mode !== 'live';
      $('#chSong').hidden = mode !== 'song';
      if (mode === 'song') { if (!song) renderLibrary(); else paintSong(true); }
      else paintLive();
    },
    onFrame(now) {
      if (mode === 'live' && engine.running) liveFrame(now);
      if (mode === 'song' && song && !audio.paused) {
        if (loop && audio.currentTime >= loop.end) audio.currentTime = loop.start;
        paintSong();
      }
    },
    onLeave() { audio.pause(); },
    repaint() { paintLive(); if (song) paintSong(true); },
  };
}
