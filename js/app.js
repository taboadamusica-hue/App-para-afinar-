// AfinaVoz — interfaz principal.
import { freqToMidi, noteName, nearestScaleMidi, NOTE_NAMES, SCALES } from './pitch.js';
import { analyzeTake, scoreSustain, scoreSequence, EMOTION_LIST } from './analysis.js';
import { MicEngine } from './audio.js';
import * as db from './db.js';
import { drawRoll, drawChart, ringSvg, circumplexSvg, errColor } from './draw.js';

// ---------- Ajustes ----------
const DEFAULTS = { notation: 'latin', a4: 440, sensitivity: 5, saveAudio: true, tunerKey: 0, tunerScale: 'chromatic', exRoot: 57 };
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('afinavoz.settings') || '{}') }; } catch { /* sin storage */ }
const saveSettings = () => { try { localStorage.setItem('afinavoz.settings', JSON.stringify(settings)); } catch { /* */ } };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nn = (m, oct = true) => noteName(m, settings.notation, oct);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtDate = (ms) => new Date(ms).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const signed = (v, d = 0) => (v > 0 ? '+' : '') + v.toFixed(d);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2600);
}

const engine = new MicEngine(() => settings);
let view = 'tuner';
let currentSong = null;
let currentTakeId = null;

// ---------- Micrófono ----------
async function startMic() {
  if (engine.running) return true;
  try {
    await engine.start();
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Permiso de micrófono denegado.' : 'No se pudo abrir el micrófono.');
    return false;
  }
  $('#micBtn').setAttribute('aria-pressed', 'true');
  $('#micLabel').textContent = 'Activo';
  $('#tHint').textContent = 'Escuchando…';
  return true;
}
function stopMic() {
  if (recording || exercise) return;
  engine.stop();
  $('#micBtn').setAttribute('aria-pressed', 'false');
  $('#micLabel').textContent = 'Micro';
  $('#tHint').innerHTML = 'Pulsa <b>Micro</b> y canta una nota.';
}
$('#micBtn').onclick = () => (engine.running ? stopMic() : startMic());

// ---------- Navegación ----------
function go(v) {
  view = v;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  const tab = { song: 'songs', take: 'songs' }[v] || v;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === tab));
  window.scrollTo(0, 0);
  ({ songs: renderSongs, song: renderSong, train: renderTrainLog, progress: renderProgress, tuner: () => {} })[v]?.();
}
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
  if (recording) return toast('Detén la grabación primero.');
  go(b.dataset.go);
}));

// ---------- Selects compartidos ----------
function fillKeySelect(sel, value) {
  sel.innerHTML = NOTE_NAMES[settings.notation].map((n, i) => `<option value="${i}">${n}</option>`).join('');
  sel.value = value;
}
function fillScaleSelect(sel, value) {
  sel.innerHTML = Object.entries(SCALES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  sel.value = value;
}
function fillRootSelect() {
  const sel = $('#exRoot');
  const opts = [];
  for (let m = 40; m <= 79; m++) opts.push(`<option value="${m}">${nn(m)}</option>`);
  sel.innerHTML = opts.join('');
  sel.value = settings.exRoot;
}
function refreshSelects() {
  fillKeySelect($('#tKey'), settings.tunerKey);
  fillScaleSelect($('#tScale'), settings.tunerScale);
  fillRootSelect();
}
$('#tKey').onchange = (e) => { settings.tunerKey = +e.target.value; saveSettings(); };
$('#tScale').onchange = (e) => { settings.tunerScale = e.target.value; saveSettings(); };
$('#exRoot').onchange = (e) => { settings.exRoot = +e.target.value; saveSettings(); };

// ---------- Afinador en vivo ----------
const live = { points: [], recent: [], lastVoiced: 0, center: 60 };
engine.on((fr) => {
  const midi = fr.f ? freqToMidi(fr.f, settings.a4) : null;
  if (midi != null) {
    live.recent.push(fr.f);
    if (live.recent.length > 5) live.recent.shift();
    live.lastVoiced = fr.t;
  } else if (fr.t - live.lastVoiced > 0.15) live.recent = [];
  live.points.push({ t: fr.t, midi });
  while (live.points.length && fr.t - live.points[0].t > 8) live.points.shift();
  if (midi != null) live.center += (midi - live.center) * 0.05;
  if (view === 'tuner') updateTunerReadout(fr);
});

function updateTunerReadout(fr) {
  const needle = $('#tNeedle');
  if (!live.recent.length) {
    if (fr.t - live.lastVoiced > 0.6) {
      $('#tNote').textContent = '–';
      needle.className = 'needle';
      needle.style.left = '50%';
    }
    return;
  }
  const f = [...live.recent].sort((a, b) => a - b)[Math.floor(live.recent.length / 2)];
  const midi = freqToMidi(f, settings.a4);
  const target = nearestScaleMidi(midi, settings.tunerKey, settings.tunerScale);
  const cents = (midi - target) * 100;
  $('#tNote').textContent = nn(target);
  $('#tCents').textContent = signed(cents);
  $('#tHz').textContent = f.toFixed(1);
  const pos = 50 + Math.max(-50, Math.min(50, cents));
  needle.style.left = pos + '%';
  const a = Math.abs(cents);
  needle.className = 'needle ' + (a <= 10 ? 'ok' : a <= 25 ? 'warn' : 'bad');
  $('#tHint').textContent = a <= 10 ? '¡Afinado!' : cents > 0 ? 'Un poco alto ↓' : 'Un poco bajo ↑';
}

// ---------- Bucle de dibujo ----------
function frameLoop() {
  if (engine.running) {
    if (view === 'tuner') {
      const now = engine.ctx.currentTime;
      drawRoll($('#tRoll'), {
        points: live.points, t0: now - 6, t1: now,
        lo: live.center - 7, hi: live.center + 7,
        keyPc: settings.tunerKey, scale: settings.tunerScale, notation: settings.notation,
      });
    } else if (view === 'song' && recording) drawRecordingRoll();
    else if (view === 'train' && exercise) drawExerciseRoll();
  }
  requestAnimationFrame(frameLoop);
}

// ---------- Canciones ----------
const emptyMsg = (txt) => `<div class="card empty">${txt}</div>`;

async function renderSongs() {
  const [songs, takes] = await Promise.all([db.all('songs'), db.all('takes')]);
  const bySong = {};
  for (const t of takes) (bySong[t.songId] ||= []).push(t);
  songs.sort((a, b) => (b.updated || b.created) - (a.updated || a.created));
  $('#songList').innerHTML = songs.length
    ? songs.map((s) => {
      const ts = (bySong[s.id] || []).sort((a, b) => a.date - b.date);
      const last = ts[ts.length - 1];
      const best = ts.reduce((m, t) => Math.max(m, t.summary.score), 0);
      return `<div class="card song-item" data-id="${s.id}">
        <div class="info"><div class="title">${esc(s.title)}</div>
        <div class="muted small">${esc(s.artist || 'Sin artista')} · ${NOTE_NAMES[settings.notation][s.keyPc]} ${SCALES[s.scale].name.toLowerCase()} · ${ts.length} toma${ts.length === 1 ? '' : 's'}${best ? ` · mejor ${best}` : ''}</div></div>
        <div class="badge">${last ? last.summary.score : '–'}<small>última</small></div></div>`;
    }).join('')
    : emptyMsg('Aún no tienes canciones.<br>Crea una para empezar a registrar tu afinación.');
  document.querySelectorAll('.song-item').forEach((el) => (el.onclick = async () => {
    currentSong = await db.get('songs', el.dataset.id);
    go('song');
  }));
}

function openSongDialog(song = null) {
  const f = $('#songForm');
  $('#songDialogTitle').textContent = song ? 'Editar canción' : 'Nueva canción';
  fillKeySelect(f.keyPc, song?.keyPc ?? 0);
  fillScaleSelect(f.scale, song?.scale ?? 'major');
  f.targetEmotion.innerHTML = '<option value="">Sin preferencia</option>' +
    EMOTION_LIST.filter((e) => e.id !== 'neutro').map((e) => `<option value="${e.id}">${e.emoji} ${e.label}</option>`).join('');
  f.title.value = song?.title || '';
  f.artist.value = song?.artist || '';
  f.targetEmotion.value = song?.targetEmotion || '';
  $('#songDelete').hidden = !song;
  const dlg = $('#songDialog');
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const data = {
      ...(song || { id: db.uid(), created: Date.now() }),
      title: f.title.value.trim() || 'Sin título', artist: f.artist.value.trim(),
      keyPc: +f.keyPc.value, scale: f.scale.value, targetEmotion: f.targetEmotion.value || null, updated: Date.now(),
    };
    await db.put('songs', data);
    currentSong = data;
    go('song');
  };
  dlg.showModal();
}
$('#newSongBtn').onclick = () => openSongDialog();
$('#sEdit').onclick = () => openSongDialog(currentSong);
$('#songDelete').onclick = async () => {
  if (!confirm(`¿Eliminar «${currentSong.title}» y todas sus tomas?`)) return;
  const takes = await db.takesBySong(currentSong.id);
  await Promise.all(takes.map((t) => db.del('takes', t.id)));
  await db.del('songs', currentSong.id);
  $('#songDialog').close();
  currentSong = null;
  go('songs');
};

async function renderSong() {
  if (!currentSong) return go('songs');
  const s = currentSong;
  $('#sTitle').textContent = s.title;
  const emo = EMOTION_LIST.find((e) => e.id === s.targetEmotion);
  $('#sMeta').textContent = `${s.artist || 'Sin artista'} · ${NOTE_NAMES[settings.notation][s.keyPc]} ${SCALES[s.scale].name.toLowerCase()}${emo ? ` · busca: ${emo.emoji} ${emo.label}` : ''}`;
  const takes = (await db.takesBySong(s.id)).sort((a, b) => b.date - a.date);
  $('#takeList').innerHTML = takes.length
    ? takes.map((t, i) => `<div class="card take-item" data-id="${t.id}">
        <div class="info"><b>Toma ${takes.length - i}</b> <span class="muted small">· ${fmtDate(t.date)} · ${fmtTime(t.duration)}</span>
        <div class="muted small">±${t.summary.meanAbsCents.toFixed(0)} cents · ${t.summary.inTunePct.toFixed(0)}% afinado${t.summary.emotionLabel ? ' · ' + t.summary.emotionLabel : ''}</div></div>
        <div class="badge">${t.summary.score}</div></div>`).join('')
    : emptyMsg('Pulsa el botón rojo y canta la canción.<br>Cada toma queda registrada para ver tu evolución.');
  document.querySelectorAll('.take-item').forEach((el) => (el.onclick = () => { currentTakeId = el.dataset.id; renderTake(); }));
  const chron = [...takes].reverse();
  drawChart($('#sTrend'), chron.map((t) => ({ x: t.date, y: t.summary.score })), { yMin: 0, yMax: 100, empty: 'Tu evolución aparecerá aquí' });
  resetRecordingRoll();
}

// ---------- Grabación de tomas ----------
let recording = null;
function resetRecordingRoll() {
  $('#sTimer').textContent = '0:00';
  $('#sNow').textContent = 'Listo para grabar';
  drawRoll($('#sRoll'), { points: [], t0: 0, t1: 8, lo: 55, hi: 72, keyPc: currentSong.keyPc, scale: currentSong.scale, notation: settings.notation });
}

$('#sRec').onclick = async () => {
  if (recording) return stopTake();
  if (!(await startMic())) return;
  engine.startRecording(settings.saveAudio);
  recording = { center: 62 };
  $('#sRec').classList.add('recording');
  $('#sNow').textContent = 'Grabando… canta';
};

function drawRecordingRoll() {
  const frames = engine.rec?.frames || [];
  const now = frames.length ? frames[frames.length - 1].t : 0;
  const pts = [];
  for (let i = Math.max(0, frames.length - 500); i < frames.length; i++) {
    const f = frames[i];
    pts.push({ t: f.t, midi: f.f ? freqToMidi(f.f, settings.a4) : null });
  }
  const lastV = pts.filter((p) => p.midi != null).slice(-1)[0];
  if (lastV) recording.center += (lastV.midi - recording.center) * 0.05;
  $('#sTimer').textContent = fmtTime(now);
  if (lastV && now - lastV.t < 0.3) {
    const target = nearestScaleMidi(lastV.midi, currentSong.keyPc, currentSong.scale);
    $('#sNow').innerHTML = `${nn(target)} <span style="color:${errColor(Math.abs((lastV.midi - target) * 100))}">${signed((lastV.midi - target) * 100)} cents</span>`;
  }
  drawRoll($('#sRoll'), {
    points: pts, t0: Math.max(0, now - 8), t1: Math.max(8, now),
    lo: recording.center - 8, hi: recording.center + 8,
    keyPc: currentSong.keyPc, scale: currentSong.scale, notation: settings.notation,
  });
}

async function stopTake() {
  const res = await engine.stopRecording();
  recording = null;
  $('#sRec').classList.remove('recording');
  const frames = res.frames;
  const duration = frames.length ? frames[frames.length - 1].t : 0;
  const voiced = frames.filter((f) => f.f > 0).length;
  if (duration < 2 || voiced < 20) {
    toast('Toma demasiado corta o sin voz detectada.');
    return resetRecordingRoll();
  }
  const a = analyzeTake(frames, songOpts(currentSong));
  const take = {
    id: db.uid(), songId: currentSong.id, date: Date.now(), duration,
    frames: db.packFrames(frames), audio: res.blob,
    summary: summarize(a),
  };
  await db.put('takes', take);
  currentSong.updated = Date.now();
  await db.put('songs', currentSong);
  currentTakeId = take.id;
  renderTake();
}

const songOpts = (s) => ({ keyPc: s.keyPc, scale: s.scale, a4: settings.a4, notation: settings.notation, targetEmotion: s.targetEmotion });
const summarize = (a) => a.empty
  ? { score: 0, meanAbsCents: 0, bias: 0, inTunePct: 0, stability: 0, expressiveness: 0 }
  : {
    score: a.score, meanAbsCents: a.tuning.meanAbsCents, bias: a.tuning.bias, inTunePct: a.tuning.inTunePct,
    stability: a.stability.score, expressiveness: a.expressiveness, low: a.range.low, high: a.range.high,
    emotionId: a.emotion.id, emotionLabel: `${a.emotion.emoji} ${a.emotion.label}`,
  };

// ---------- Informe de toma ----------
async function renderTake() {
  const take = await db.get('takes', currentTakeId);
  if (!take) return go('song');
  const song = currentSong || (await db.get('songs', take.songId));
  const frames = db.unpackFrames(take.frames);
  const a = analyzeTake(frames, songOpts(song));
  go('take');
  const bar = (label, v) => `<div><div class="bar-label"><span>${label}</span><b>${Math.round(v)}</b></div><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${v >= 80 ? 'var(--accent)' : v >= 55 ? 'var(--warn)' : 'var(--bad)'}"></i></div></div>`;
  const pct = (label, v) => `<div><div class="bar-label"><span>${label}</span><b>${Math.round(v * 100)}%</b></div><div class="bar"><i style="width:${v * 100}%;background:var(--curve)"></i></div></div>`;

  if (a.empty) {
    $('#takeReport').innerHTML = `<div class="card"><h2>${esc(song.title)}</h2><p>${a.tips[0]}</p><button id="delTake" class="btn danger">Eliminar toma</button></div>`;
  } else {
    const e = a.emotion;
    $('#takeReport').innerHTML = `
      <div class="card">
        <h2>${esc(song.title)}</h2><div class="muted small">${fmtDate(take.date)} · ${fmtTime(take.duration)}</div>
        <div class="score-head" style="margin-top:12px">${ringSvg(a.score)}
          <div class="subscores">${bar('Afinación', a.tuning.score)}${bar('Estabilidad', a.stability.score)}${bar('Expresividad', a.expressiveness)}</div>
        </div>
      </div>
      <div class="card">
        <div class="playbar">${take.audio ? `<audio id="takeAudio" controls preload="metadata"></audio>` : '<span class="muted small">Audio no guardado</span>'}</div>
        <canvas id="takeRoll" class="roll" height="260" style="margin-top:10px"></canvas>
        <input id="takeScroll" type="range" min="0" max="${Math.max(0, take.duration - 10).toFixed(2)}" step="0.05" value="0" ${take.duration <= 10 ? 'hidden' : ''}/>
        <div class="muted small">Bloques: verde ≤15 cents, amarillo ≤30, rojo &gt;30. La línea discontinua es la nota correcta.</div>
      </div>
      <div class="card"><h3>Afinación</h3><div class="stats">
        <div class="stat"><b>±${a.tuning.meanAbsCents.toFixed(1)}</b><span>cents de desviación media</span></div>
        <div class="stat"><b>${signed(a.tuning.bias, 1)}</b><span>tendencia (${a.tuning.bias > 0 ? 'alto' : 'bajo'})</span></div>
        <div class="stat"><b>${a.tuning.inTunePct.toFixed(0)}%</b><span>del tiempo afinado (±25)</span></div>
        <div class="stat"><b>${a.range.lowName}–${a.range.highName}</b><span>rango usado</span></div>
        <div class="stat"><b>${a.vibrato.rate ? a.vibrato.rate.toFixed(1) + ' Hz' : '—'}</b><span>vibrato${a.vibrato.rate ? ` (±${(a.vibrato.extent / 2).toFixed(0)} c, ${Math.round(a.vibrato.ratio * 100)}% notas largas)` : ''}</span></div>
        <div class="stat"><b>${a.notes.length}</b><span>notas detectadas</span></div>
      </div></div>
      <div class="card"><h3>Tono de voz</h3>
        <div class="subscores">${pct('Brillo', a.tone.brightness)}${pct('Aire en la voz', a.tone.breathiness)}${pct('Rango dinámico', a.tone.dynamics)}</div>
        <div class="chips">${a.tone.labels.map((l) => `<span class="chip">${l}</span>`).join('')}</div>
      </div>
      <div class="card"><h3>Emoción transmitida</h3>
        <div class="emotion">${circumplexSvg(e.valence, e.arousal)}
          <div><div class="emoji">${e.emoji}</div><b>${e.label}</b>
          <div class="muted small">Energía ${signed(e.arousal * 100)} · Valencia ${signed(e.valence * 100)}</div>
          ${e.target ? `<div style="margin-top:6px">Buscabas ${e.target.emoji} ${e.target.label}: <b>${e.match}%</b> de coincidencia</div>` : ''}</div>
        </div>
        <p class="muted small">Estimación a partir de volumen, timbre, ritmo, contorno melódico y escala.</p>
      </div>
      <div class="card"><h3>Consejos</h3><ul class="tips">${a.tips.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>¡Buen trabajo!</li>'}</ul></div>
      <button id="delTake" class="btn danger block">Eliminar toma</button>`;
  }

  $('#delTake').onclick = async () => {
    if (!confirm('¿Eliminar esta toma?')) return;
    await db.del('takes', take.id);
    go('song');
  };
  if (a.empty) return;

  const points = frames.map((f) => ({ t: f.t, midi: f.f ? freqToMidi(f.f, settings.a4) : null }));
  const lo = a.range.low - 3, hi = a.range.high + 3;
  let offset = 0;
  const audio = $('#takeAudio');
  const draw = () => drawRoll($('#takeRoll'), {
    points, notes: a.notes, t0: offset, t1: offset + Math.min(10, Math.max(2, take.duration)), lo, hi,
    keyPc: song.keyPc, scale: song.scale, notation: settings.notation,
    playhead: audio && !audio.paused ? audio.currentTime : audio?.currentTime || null,
  });
  draw();
  $('#takeScroll').oninput = (ev) => { offset = +ev.target.value; draw(); };
  if (audio) {
    audio.src = URL.createObjectURL(take.audio);
    const follow = () => {
      if (view !== 'take') return;
      const t = audio.currentTime;
      if (take.duration > 10 && (t < offset || t > offset + 9)) { offset = Math.max(0, Math.min(take.duration - 10, t - 2)); $('#takeScroll').value = offset; }
      draw();
      if (!audio.paused) requestAnimationFrame(follow);
    };
    audio.onplay = follow;
    audio.onseeked = follow;
  }
}

// ---------- Entrenamiento ----------
let exercise = null;
const EXERCISES = {
  sustain: { name: 'Nota sostenida', seq: [0], dur: 4 },
  random: { name: 'Nota al azar', seq: null, dur: 4 },
  scale: { name: 'Escala mayor', seq: [0, 2, 4, 5, 7, 5, 4, 2, 0], dur: 0.8 },
  minor: { name: 'Escala menor', seq: [0, 2, 3, 5, 7, 5, 3, 2, 0], dur: 0.8 },
  arpeggio: { name: 'Arpegio', seq: [0, 4, 7, 12, 7, 4, 0], dur: 0.9 },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

$('#exStart').onclick = async () => {
  if (exercise) { exercise.cancel = true; return; }
  if (!(await startMic())) return;
  const type = $('#exType').value;
  const def = EXERCISES[type];
  const root = settings.exRoot;
  const targets = def.seq ? def.seq.map((s) => root + s) : [root + Math.floor(Math.random() * 13)];
  const ex = (exercise = { type, targets, dur: def.dur, lanes: [], phase: 'listen', center: root + 4 });
  $('#exStart').textContent = 'Cancelar';
  $('#exResult').innerHTML = '';
  const status = $('#exStatus'), tgt = $('#exTarget');
  try {
    status.textContent = 'Escucha la referencia…';
    for (const m of targets) {
      if (ex.cancel) throw 0;
      tgt.textContent = nn(m);
      await engine.playTone(m, targets.length > 1 ? Math.min(0.7, def.dur) : 1.4);
    }
    for (const n of ['3', '2', '1']) {
      if (ex.cancel) throw 0;
      status.textContent = `Prepárate… ${n}`;
      await wait(500);
    }
    ex.phase = 'sing';
    ex.lanes = targets.map((m, i) => ({ start: i * def.dur, end: (i + 1) * def.dur, midi: m }));
    engine.startRecording(false);
    status.textContent = '¡Canta!';
    const total = targets.length * def.dur;
    while (true) {
      const t = engine.rec?.frames.slice(-1)[0]?.t || 0;
      if (ex.cancel) throw 0;
      if (t >= total) break;
      const idx = Math.min(targets.length - 1, Math.floor(t / def.dur));
      tgt.textContent = nn(targets[idx]);
      await wait(40);
    }
    const { frames } = await engine.stopRecording();
    const res = targets.length === 1 ? scoreSustain(frames, targets[0], settings.a4) : scoreSequence(frames, targets, def.dur, settings.a4);
    await db.put('training', {
      id: db.uid(), date: Date.now(), type, name: def.name, root, targets, score: res.score,
      meanAbsCents: res.meanAbsCents, duration: total,
    });
    showExerciseResult(res, targets);
    status.textContent = 'Terminado';
  } catch (err) {
    if (err !== 0) console.error(err);
    if (engine.rec) await engine.stopRecording();
    status.textContent = 'Cancelado';
  } finally {
    exercise = null;
    $('#exStart').textContent = 'Empezar';
    renderTrainLog();
  }
};

function drawExerciseRoll() {
  const ex = exercise;
  const frames = ex.phase === 'sing' ? engine.rec?.frames || [] : [];
  const total = ex.targets.length * ex.dur;
  const now = frames.length ? frames[frames.length - 1].t : 0;
  drawRoll($('#exRoll'), {
    // la curva se traslada a la octava del ejercicio para poder compararla
    points: frames.map((f) => {
      if (!f.f) return { t: f.t, midi: null };
      const m = freqToMidi(f.f, settings.a4);
      const ref = ex.targets[Math.min(ex.targets.length - 1, Math.floor(f.t / ex.dur))];
      return { t: f.t, midi: m - 12 * Math.round((m - ref) / 12) };
    }),
    lanes: ex.lanes.length ? ex.lanes : ex.targets.map((m, i) => ({ start: i * ex.dur, end: (i + 1) * ex.dur, midi: m })),
    t0: 0, t1: total, lo: Math.min(...ex.targets) - 4, hi: Math.max(...ex.targets) + 4,
    notation: settings.notation, playhead: ex.phase === 'sing' ? now : null,
  });
}

function showExerciseResult(res, targets) {
  const verdict = res.score >= 85 ? '¡Excelente!' : res.score >= 65 ? 'Bien, sigue practicando' : 'A seguir entrenando';
  let html = `<div class="score-head">${ringSvg(res.score)}<div><b>${verdict}</b>`;
  if (res.meanAbsCents != null) html += `<div class="muted">Desviación media ±${res.meanAbsCents.toFixed(0)} cents</div>`;
  if (res.bias != null) html += `<div class="muted">Tendencia ${signed(res.bias)} cents${res.reachTime != null ? ` · llegaste a la nota en ${res.reachTime.toFixed(2)} s` : ''}</div>`;
  html += '</div></div>';
  if (res.perNote) {
    html += '<div class="pill-row">' + res.perNote.map((p) => `<span class="pill ${p.ok ? 'ok' : 'bad'}">${nn(p.target, false)} ${p.cents == null ? '—' : signed(p.cents)}</span>`).join('') + '</div>';
  }
  $('#exResult').innerHTML = html;
}

async function renderTrainLog() {
  const log = (await db.all('training')).sort((a, b) => b.date - a.date).slice(0, 15);
  $('#exLog').innerHTML = log.length
    ? log.map((l) => `<div class="card take-item"><div class="info"><b>${esc(l.name)}</b> <span class="muted small">· ${nn(l.root)} · ${fmtDate(l.date)}</span>
        ${l.meanAbsCents != null ? `<div class="muted small">±${l.meanAbsCents.toFixed(0)} cents</div>` : ''}</div><div class="badge">${l.score}</div></div>`).join('')
    : emptyMsg('Todavía no has hecho ejercicios.');
  if (!exercise) {
    const type = $('#exType').value, def = EXERCISES[type];
    const targets = (def.seq || [0]).map((s) => settings.exRoot + s);
    drawRoll($('#exRoll'), {
      points: [], lanes: targets.map((m, i) => ({ start: i * def.dur, end: (i + 1) * def.dur, midi: m })),
      t0: 0, t1: targets.length * def.dur, lo: Math.min(...targets) - 4, hi: Math.max(...targets) + 4, notation: settings.notation,
    });
  }
}
$('#exType').onchange = renderTrainLog;
$('#exRoot').addEventListener('change', renderTrainLog);

// ---------- Progreso ----------
async function renderProgress() {
  const [takes, training, songs] = await Promise.all([db.all('takes'), db.all('training'), db.all('songs')]);
  takes.sort((a, b) => a.date - b.date);
  const minutes = (takes.reduce((s, t) => s + t.duration, 0) + training.reduce((s, t) => s + (t.duration || 0), 0)) / 60;
  const days = new Set([...takes, ...training].map((x) => new Date(x.date).toDateString()));
  let streak = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  const week = 7 * 864e5, now = Date.now();
  const avg = (arr) => (arr.length ? arr.reduce((s, t) => s + t.summary.meanAbsCents, 0) / arr.length : null);
  const thisW = avg(takes.filter((t) => now - t.date < week));
  const prevW = avg(takes.filter((t) => now - t.date >= week && now - t.date < 2 * week));
  const lows = takes.map((t) => t.summary.low).filter((x) => x != null);
  const highs = takes.map((t) => t.summary.high).filter((x) => x != null);
  let delta = '';
  if (thisW != null && prevW != null) {
    const dv = thisW - prevW;
    delta = ` <small class="${dv <= 0 ? 'up' : 'down'}">${dv <= 0 ? '▼' : '▲'} ${Math.abs(dv).toFixed(1)}</small>`;
  }
  $('#progTiles').innerHTML = `
    <div class="tile"><b>${takes.length}</b><span>tomas grabadas</span></div>
    <div class="tile"><b>${minutes < 10 ? minutes.toFixed(1) : minutes.toFixed(0)}</b><span>minutos cantados</span></div>
    <div class="tile"><b>${streak} 🔥</b><span>días seguidos</span></div>
    <div class="tile"><b>${thisW != null ? '±' + thisW.toFixed(1) : '—'}${delta}</b><span>cents medios esta semana</span></div>
    <div class="tile" style="grid-column:1/-1"><b>${lows.length ? `${nn(Math.min(...lows))} – ${nn(Math.max(...highs))}` : '—'}</b><span>rango vocal registrado</span></div>`;
  const scoreSeries = takes.map((t) => ({ x: t.date, y: t.summary.score }));
  drawChart($('#progScore'), scoreSeries, { yMin: 0, yMax: 100 });
  drawChart($('#progCents'), takes.map((t) => ({ x: t.date, y: t.summary.meanAbsCents })), { yMin: 0, color: getComputedStyle(document.documentElement).getPropertyValue('--curve').trim() });
  const rows = songs.map((s) => {
    const ts = takes.filter((t) => t.songId === s.id);
    if (!ts.length) return null;
    const first = ts[0].summary.score, last = ts[ts.length - 1].summary.score, dlt = last - first;
    return `<div class="song-prog"><span>${esc(s.title)} <span class="muted small">(${ts.length})</span></span>
      <span>${first} → <b>${last}</b> ${ts.length > 1 ? `<span class="${dlt >= 0 ? 'up' : 'down'}">${signed(dlt)}</span>` : ''}</span></div>`;
  }).filter(Boolean);
  $('#progSongs').innerHTML = rows.join('') || '<div class="muted">Graba tomas de tus canciones para ver tu mejora.</div>';
}

// ---------- Ajustes ----------
function bindSettings() {
  $('#setNotation').value = settings.notation;
  $('#setA4').value = settings.a4;
  $('#setSens').value = settings.sensitivity;
  $('#setAudio').checked = settings.saveAudio;
  $('#setNotation').onchange = (e) => { settings.notation = e.target.value; saveSettings(); refreshSelects(); renderProgress(); };
  $('#setA4').onchange = (e) => { settings.a4 = Math.max(415, Math.min(466, +e.target.value || 440)); e.target.value = settings.a4; saveSettings(); };
  $('#setSens').oninput = (e) => { settings.sensitivity = +e.target.value; saveSettings(); };
  $('#setAudio').onchange = (e) => { settings.saveAudio = e.target.checked; saveSettings(); };
}

$('#exportBtn').onclick = async () => {
  const [songs, takes, training] = await Promise.all([db.all('songs'), db.all('takes'), db.all('training')]);
  const data = { app: 'afinavoz', version: 1, exported: Date.now(), settings, songs, takes: takes.map(({ audio, ...t }) => t), training };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `afinavoz-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Copia exportada (sin audios).');
};
$('#importInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'afinavoz') throw new Error('formato');
    for (const s of data.songs || []) await db.put('songs', s);
    for (const t of data.takes || []) await db.put('takes', t);
    for (const t of data.training || []) await db.put('training', t);
    toast('Copia importada.');
    renderProgress();
  } catch { toast('Archivo no válido.'); }
  e.target.value = '';
};
$('#wipeBtn').onclick = async () => {
  if (!confirm('¿Borrar todas las canciones, tomas y entrenamientos? No se puede deshacer.')) return;
  await Promise.all(['songs', 'takes', 'training'].map(db.clear));
  toast('Datos borrados.');
  renderProgress();
};

// ---------- Inicio ----------
refreshSelects();
bindSettings();
drawRoll($('#tRoll'), { points: [], t0: 0, t1: 6, lo: 53, hi: 67, keyPc: settings.tunerKey, scale: settings.tunerScale, notation: settings.notation });
requestAnimationFrame(frameLoop);
window.addEventListener('resize', () => view === 'progress' && renderProgress());
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Exponer para pruebas manuales
window.afinavoz = { engine, db, go };
