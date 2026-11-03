// MUSIC MAN — interfaz principal.
import { freqToMidi, midiToFreq, noteName, nearestScaleMidi, nearestString, NOTE_NAMES, SCALES, GUITAR_TUNINGS } from './pitch.js';
import { analyzeTake, scoreSustain, scoreSequence, EMOTION_LIST } from './analysis.js';
import { MicEngine } from './audio.js';
import * as db from './db.js';
import { drawRoll, drawChart, circumplexSvg, errColor, drawSpectrum, drawSpectrogramColumn, clearSpectrogram, spectrumPeak } from './draw.js';

// ---------- Ajustes ----------
const DEFAULTS = { notation: 'latin', a4: 440, sensitivity: 5, saveAudio: true, tunerKey: 0, tunerScale: 'chromatic', exRoot: 57, guitarTuning: 'standard', spRange: 'voice', spHold: true };
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
  $('#micLabel').textContent = 'Micro activo';
  return true;
}
function stopMic() {
  if (recording || exercise) return;
  engine.stop();
  $('#micBtn').setAttribute('aria-pressed', 'false');
  $('#micLabel').textContent = 'Activar micro';
  live.track = null;
  paintVoiceTuner();
  paintGuitarTuner();
}
$('#micBtn').onclick = () => (engine.running ? stopMic() : startMic());

// ---------- Navegación ----------
// Pestañas: Canto (afinar · canciones · entrenar), Guitarra, Espectro, Progreso
const GROUP = { tuner: 'voice', songs: 'voice', song: 'voice', take: 'voice', train: 'voice', guitar: 'guitar', spectrum: 'spectrum', progress: 'progress' };
const SUB = { tuner: 'tuner', songs: 'songs', song: 'songs', take: 'songs', train: 'train' };
let lastVoiceView = 'tuner';
function go(v) {
  if (v === 'voice') v = lastVoiceView;
  view = v;
  if (SUB[v] && !BACK[v]) lastVoiceView = v;
  document.querySelectorAll('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === GROUP[v]));
  const sub = $('#subnav');
  sub.hidden = !SUB[v] || !!BACK[v];
  sub.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.go === SUB[v])));
  const titles = { tuner: 'Canto', songs: 'Canto', song: '', take: 'Tu toma', train: 'Canto', guitar: 'Guitarra', spectrum: 'Espectro', progress: 'Progreso' };
  $('#viewTitle').textContent = titles[v];
  $('#backBtn').hidden = !BACK[v];
  if (v !== 'song' && v !== 'take') document.querySelector('.topbar').style.removeProperty('--top-bg');
  engine.setMode(v === 'guitar' ? 'guitar' : 'voice');
  window.scrollTo(0, 0);
  ({ songs: renderSongs, song: renderSong, train: renderTrainLog, progress: renderProgress, guitar: renderGuitar })[v]?.();
}
const BACK = { song: 'songs', take: 'song' };
document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
  if (recording) return toast('Detén la grabación primero.');
  go(b.dataset.go);
}));
$('#backBtn').onclick = () => {
  if (recording) return toast('Detén la grabación primero.');
  if (BACK[view]) go(BACK[view]);
};

/** Color propio de cada canción (tono derivado del título) e iniciales para su portada. */
function songHue(s) {
  let h = 0;
  for (const ch of (s.title || '') + (s.artist || '')) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
const initials = (t) => (t || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const coverHtml = (s, cls = '') => `<span class="cover ${cls}" style="--hue:${songHue(s)}" aria-hidden="true">${esc(initials(s.title))}</span>`;
const scoreCls = (v) => (v >= 80 ? 'score-hi' : v >= 55 ? 'score-mid' : 'score-lo');
const CHEV = '<svg class="chev" aria-hidden="true"><use href="#i-chev"/></svg>';

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

// ---------- Lectura en vivo ----------
// El motor entrega ~83 lecturas/s ya suavizadas (js/tracker.js); aquí solo se guardan
// y la interfaz se pinta una vez por fotograma de pantalla.
const live = { points: [], track: null, t: 0, center: 60 };
engine.on((fr) => {
  const tr = fr.track;
  live.track = tr;
  live.t = fr.t;
  live.points.push({ t: fr.t, midi: tr.voiced ? tr.midi : null });
  while (live.points.length && fr.t - live.points[0].t > 10) live.points.shift();
});

/** Pinta un medidor de afinación (nota, cents, aguja, pista). */
function paintMeter(prefix, { note, cents, hz, okTol, warnTol, hint }) {
  const box = $('#' + prefix + 'Tuner');
  if (note == null) {
    box.dataset.state = 'idle';
    $('#' + prefix + 'Note').textContent = '–';
    $('#' + prefix + 'Cents').textContent = '0';
    $('#' + prefix + 'Hz').textContent = '0';
    $('#' + prefix + 'Needle').style.left = '50%';
    $('#' + prefix + 'Hint').textContent = hint;
    return;
  }
  const a = Math.abs(cents);
  box.dataset.state = a <= okTol ? 'ok' : a <= warnTol ? 'warn' : 'bad';
  $('#' + prefix + 'Note').textContent = note;
  $('#' + prefix + 'Cents').textContent = signed(cents);
  $('#' + prefix + 'Hz').textContent = hz.toFixed(1);
  $('#' + prefix + 'Needle').style.left = 50 + Math.max(-50, Math.min(50, cents)) + '%';
  $('#' + prefix + 'Hint').textContent = hint;
}

function paintVoiceTuner() {
  const tr = live.track;
  if (!tr || !tr.voiced) return paintMeter('t', { note: null, hint: engine.running ? 'Escuchando… canta una nota' : 'Activa el micro y canta una nota' });
  const target = settings.tunerScale === 'chromatic' ? tr.note : nearestScaleMidi(tr.steady, settings.tunerKey, settings.tunerScale);
  const cents = (tr.steady - target) * 100;
  const a = Math.abs(cents);
  paintMeter('t', {
    note: nn(target), cents, hz: midiToFreq(tr.steady, settings.a4), okTol: 10, warnTol: 25,
    hint: a <= 10 ? 'Afinado' : cents > 0 ? (a > 25 ? 'Alto: baja un poco' : 'Ligeramente alto') : (a > 25 ? 'Bajo: sube un poco' : 'Ligeramente bajo'),
  });
}

// ---------- Afinador de guitarra ----------
const guitar = { locked: null, tuned: new Set(), okSince: null };
const tuningNotes = () => (GUITAR_TUNINGS[settings.guitarTuning] || GUITAR_TUNINGS.standard).notes;

function renderGuitar() {
  const sel = $('#gTuning');
  sel.innerHTML = Object.entries(GUITAR_TUNINGS).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
  sel.value = settings.guitarTuning;
  const notes = tuningNotes();
  $('#gStrings').innerHTML = notes.map((m, i) => `<button class="string" data-i="${i}" aria-pressed="false" aria-label="Cuerda ${6 - i}: ${nn(m)}">
      <span class="string-num">${6 - i}</span><span class="string-note">${nn(m, false)}</span><span class="string-oct">${Math.floor(m / 12) - 1}</span></button>`).join('');
  $('#gStrings').querySelectorAll('.string').forEach((b) => (b.onclick = () => {
    const i = +b.dataset.i;
    guitar.locked = guitar.locked === i ? null : i;
    if (guitar.locked !== null) engine.playTone(notes[i], 1.6);
    paintGuitarStrings(null);
    $('#gMode').textContent = guitar.locked === null ? 'Automático: toca cualquier cuerda' : `Fijada la cuerda ${6 - i} · toca otra vez para soltarla`;
  }));
  guitar.tuned.clear();
  guitar.locked = null;
  $('#gMode').textContent = 'Automático: toca cualquier cuerda';
  paintGuitarStrings(null);
}
$('#gTuning').onchange = (e) => { settings.guitarTuning = e.target.value; saveSettings(); renderGuitar(); };

function paintGuitarStrings(active) {
  $('#gStrings').querySelectorAll('.string').forEach((b) => {
    const i = +b.dataset.i;
    b.classList.toggle('active', i === active);
    b.classList.toggle('tuned', guitar.tuned.has(i));
    b.setAttribute('aria-pressed', String(guitar.locked === i));
  });
}

function paintGuitarTuner() {
  const tr = live.track;
  if (!tr || !tr.voiced) {
    guitar.okSince = null;
    paintGuitarStrings(guitar.locked);
    return paintMeter('g', { note: null, hint: engine.running ? 'Toca una cuerda al aire' : 'Activa el micro y toca una cuerda' });
  }
  const notes = tuningNotes();
  const i = guitar.locked ?? nearestString(tr.steady, notes);
  const cents = (tr.steady - notes[i]) * 100;
  const a = Math.abs(cents);
  if (a <= 4) {
    guitar.okSince ??= live.t;
    if (live.t - guitar.okSince > 0.5) guitar.tuned.add(i);
  } else guitar.okSince = null;
  paintGuitarStrings(i);
  paintMeter('g', {
    note: nn(notes[i]), cents, hz: midiToFreq(tr.steady, settings.a4), okTol: 4, warnTol: 15,
    hint: a <= 4 ? `Cuerda ${6 - i} afinada` : cents < 0 ? 'Aprieta la clavija (sube)' : 'Afloja la clavija (baja)',
  });
}

// ---------- Analizador de espectro ----------
const SPEC_RANGES = { voice: [60, 5000], full: [20, 20000], bass: [20, 600] };
const spec = { frozen: false, hold: null, last: null };
$('#spFreeze').onclick = () => {
  spec.frozen = !spec.frozen;
  $('#spFreeze').textContent = spec.frozen ? 'Reanudar' : 'Congelar';
  $('#spFreeze').setAttribute('aria-pressed', String(spec.frozen));
};
$('#spHoldBtn').onclick = () => {
  settings.spHold = !settings.spHold;
  saveSettings();
  spec.hold = null;
  $('#spHoldBtn').setAttribute('aria-pressed', String(settings.spHold));
};
$('#spRange').onchange = (e) => { settings.spRange = e.target.value; saveSettings(); spec.hold = null; clearSpectrogram($('#spGram')); };

function paintSpectrum() {
  const sr = engine.ctx.sampleRate;
  if (!spec.frozen) {
    const db = engine.getSpectrum();
    spec.last = Float32Array.from(db);
    if (settings.spHold) {
      if (!spec.hold || spec.hold.length !== db.length) spec.hold = Float32Array.from(db);
      else for (let k = 0; k < db.length; k++) spec.hold[k] = Math.max(spec.hold[k] - 0.15, db[k]);
    }
  }
  const [fMin, fMax] = SPEC_RANGES[settings.spRange] || SPEC_RANGES.voice;
  const peak = spectrumPeak(spec.last, sr, fMin, fMax);
  const tr = live.track;
  const fund = tr && tr.voiced ? midiToFreq(tr.steady, settings.a4) : null;
  drawSpectrum($('#spCanvas'), { db: spec.last, hold: settings.spHold ? spec.hold : null, sampleRate: sr, fMin, fMax, fundamental: fund, notation: settings.notation });
  if (!spec.frozen) drawSpectrogramColumn($('#spGram'), { db: spec.last, sampleRate: sr, fMin, fMax });
  $('#spFund').textContent = fund ? `${nn(freqToMidi(fund, settings.a4))} · ${fund.toFixed(1)} Hz` : '—';
  $('#spPeak').textContent = peak && peak.db > -90 ? `${peak.freq < 1000 ? peak.freq.toFixed(1) + ' Hz' : (peak.freq / 1000).toFixed(2) + ' kHz'}` : '—';
  $('#spLevel').textContent = peak ? `${Math.round(peak.db)} dB` : '—';
}

// ---------- Bucle de dibujo (un pintado por fotograma de pantalla) ----------
function frameLoop() {
  if (engine.running) {
    const tr = live.track;
    if (tr && tr.voiced) live.center += (tr.midi - live.center) * 0.04;
    if (view === 'tuner') {
      paintVoiceTuner();
      const now = engine.ctx.currentTime;
      drawRoll($('#tRoll'), {
        points: live.points, t0: now - 6, t1: now,
        lo: live.center - 7, hi: live.center + 7,
        keyPc: settings.tunerKey, scale: settings.tunerScale, notation: settings.notation,
      });
    } else if (view === 'guitar') paintGuitarTuner();
    else if (view === 'spectrum') paintSpectrum();
    else if (view === 'song' && recording) drawRecordingRoll();
    else if (view === 'train' && exercise) drawExerciseRoll();
  }
  requestAnimationFrame(frameLoop);
}

/** Puntos de la curva en vivo desde el inicio de la grabación actual (tiempos relativos). */
function livePointsSince(t0, map = (m) => m) {
  const out = [];
  for (const p of live.points) if (p.t >= t0) out.push({ t: p.t - t0, midi: p.midi == null ? null : map(p.midi, p.t - t0) });
  return out;
}

// ---------- Canciones ----------
const emptyMsg = (title, txt) => `<div class="empty"><b>${title}</b>${txt}</div>`;

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
      return `<button class="row-item song-item" data-id="${s.id}">${coverHtml(s)}
        <span class="row-text"><span class="row-title">${esc(s.title)}</span>
        <span class="row-sub">${esc(s.artist || 'Sin artista')} · ${ts.length} toma${ts.length === 1 ? '' : 's'}${best ? ` · mejor ${best}` : ''}</span></span>
        ${last ? `<span class="row-score ${scoreCls(last.summary.score)}">${last.summary.score}</span>` : CHEV}</button>`;
    }).join('')
    : emptyMsg('Tu biblioteca está vacía', 'Añade la canción que estás preparando y graba tu primera toma.');
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
  $('#songHero').style.setProperty('--hue', songHue(s));
  document.querySelector('.topbar').style.setProperty('--top-bg', `hsl(${songHue(s)} 45% 30%)`);
  $('#sCover').style.setProperty('--hue', songHue(s));
  $('#sCover').textContent = initials(s.title);
  $('#viewTitle').textContent = '';
  const emo = EMOTION_LIST.find((e) => e.id === s.targetEmotion);
  $('#sMeta').textContent = `${s.artist || 'Sin artista'} · ${NOTE_NAMES[settings.notation][s.keyPc]} ${SCALES[s.scale].name.toLowerCase()}${emo ? ` · busca: ${emo.emoji} ${emo.label}` : ''}`;
  const takes = (await db.takesBySong(s.id)).sort((a, b) => b.date - a.date);
  $('#takeList').innerHTML = takes.length
    ? takes.map((t, i) => `<button class="row-item take-item" data-id="${t.id}">
        <span class="row-num">${takes.length - i}</span>
        <span class="row-text"><span class="row-title">Toma ${takes.length - i}</span>
        <span class="row-sub">${fmtDate(t.date)} · ${fmtTime(t.duration)} · ±${t.summary.meanAbsCents.toFixed(0)} cents</span></span>
        <span class="row-score ${scoreCls(t.summary.score)}">${t.summary.score}</span></button>`).join('')
    : emptyMsg('Sin tomas todavía', 'Pulsa el botón rojo y canta la canción. Cada toma queda registrada para ver tu evolución.');
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
  if (!engine.rec) return;
  const now = engine.ctx.currentTime - engine.rec.t0;
  const pts = livePointsSince(engine.rec.t0);
  const tr = live.track;
  if (tr && tr.voiced) recording.center += (tr.midi - recording.center) * 0.04;
  $('#sTimer').textContent = fmtTime(now);
  if (tr && tr.voiced) {
    const target = nearestScaleMidi(tr.steady, currentSong.keyPc, currentSong.scale);
    const c = (tr.steady - target) * 100;
    $('#sNow').innerHTML = `${nn(target)} <span style="color:${errColor(Math.abs(c))}">${signed(c)} cents</span>`;
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
  const sub = (label, v) => `<div class="sub"><b>${Math.round(v)}</b><span>${label}</span><div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div></div>`;
  const meter = (label, v, lo, hi) => `<div class="meter-row"><div class="bar-label"><span>${label}</span><span class="muted">${v < 0.33 ? lo : v > 0.66 ? hi : 'Medio'}</span></div><div class="bar"><i style="width:${Math.max(3, v * 100)}%"></i></div></div>`;
  const hue = songHue(song);
  document.querySelector('.topbar').style.setProperty('--top-bg', `hsl(${hue} 45% 30%)`);
  const head = `<div class="hero report-hero bleed" style="--hue:${hue}">
      <div class="report-song">${esc(song.title)} · ${fmtDate(take.date)} · ${fmtTime(take.duration)}</div>`;

  if (a.empty) {
    $('#takeReport').innerHTML = `${head}<div class="big-score">–</div><div class="big-score-label">${esc(a.tips[0])}</div></div>
      <div class="btn-row"><button id="delTake" class="btn btn-dark danger">Eliminar toma</button></div>`;
  } else {
    const e = a.emotion;
    $('#takeReport').innerHTML = `${head}
        <div class="big-score">${a.score}</div>
        <div class="big-score-label">puntuación de la toma</div>
        <div class="subs">${sub('Afinación', a.tuning.score)}${sub('Estabilidad', a.stability.score)}${sub('Expresividad', a.expressiveness)}</div>
      </div>
      <div class="player">${take.audio ? `<audio id="takeAudio" controls preload="metadata"></audio>` : '<span class="muted">Audio no guardado en esta toma</span>'}</div>
      <canvas id="takeRoll" class="roll bleed" height="260"></canvas>
      <input id="takeScroll" type="range" aria-label="Desplazar la vista de la toma" min="0" max="${Math.max(0, take.duration - 10).toFixed(2)}" step="0.05" value="0" ${take.duration <= 10 ? 'hidden' : ''}/>
      <div class="legend"><span><i style="background:var(--accent)"></i>±15 cents</span><span><i style="background:var(--warn)"></i>±30</span><span><i style="background:var(--bad)"></i>más de 30</span><span>– – nota correcta</span></div>

      <h3 class="section-title">Afinación</h3>
      <div class="facts">
        <div class="fact"><b>±${a.tuning.meanAbsCents.toFixed(1)}</b><span>cents de desviación media</span></div>
        <div class="fact"><b>${signed(a.tuning.bias, 1)}</b><span>tendencia: ${Math.abs(a.tuning.bias) < 5 ? 'centrada' : a.tuning.bias > 0 ? 'vas alto' : 'vas bajo'}</span></div>
        <div class="fact"><b>${a.tuning.inTunePct.toFixed(0)}%</b><span>del tiempo afinado (±25)</span></div>
        <div class="fact"><b>${a.range.lowName}–${a.range.highName}</b><span>rango usado</span></div>
        <div class="fact"><b>${a.vibrato.rate ? a.vibrato.rate.toFixed(1) + ' Hz' : '—'}</b><span>${a.vibrato.rate ? `vibrato ±${(a.vibrato.extent / 2).toFixed(0)} cents` : 'sin vibrato detectado'}</span></div>
        <div class="fact"><b>${a.notes.length}</b><span>notas detectadas</span></div>
      </div>

      <h3 class="section-title">Tono de voz</h3>
      <div class="meters">${meter('Brillo', a.tone.brightness, 'Oscuro', 'Brillante')}${meter('Aire en la voz', a.tone.breathiness, 'Limpio', 'Aireado')}${meter('Rango dinámico', a.tone.dynamics, 'Plano', 'Amplio')}</div>
      <div class="chips">${a.tone.labels.map((l) => `<span class="chip">${l}</span>`).join('')}</div>

      <h3 class="section-title">Emoción transmitida</h3>
      <div class="emotion">${circumplexSvg(e.valence, e.arousal)}
        <div><div class="emotion-name"><span class="emotion-emoji" aria-hidden="true">${e.emoji}</span>${e.label}</div>
        <div class="emotion-sub">Energía ${signed(e.arousal * 100)} · Valencia ${signed(e.valence * 100)}</div>
        ${e.target ? `<div class="emotion-match">Buscabas ${e.target.label.toLowerCase()}: <span class="${scoreCls(e.match)}">${e.match}%</span></div>` : ''}</div>
      </div>
      <p class="fineprint">Estimación a partir de volumen, timbre, ritmo, contorno melódico y escala.</p>

      <h3 class="section-title">Consejos</h3>
      <ul class="tips">${a.tips.map((t) => `<li>${esc(t)}</li>`).join('') || '<li>¡Buen trabajo!</li>'}</ul>
      <div class="btn-row"><button id="delTake" class="btn btn-dark danger">Eliminar toma</button></div>`;
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
  const type = exType();
  const def = EXERCISES[type];
  const root = settings.exRoot;
  const targets = def.seq ? def.seq.map((s) => root + s) : [root + Math.floor(Math.random() * 13)];
  const ex = (exercise = { type, targets, dur: def.dur, lanes: [], phase: 'listen', center: root + 4 });
  $('#exStart').classList.add('stop');
  $('#exStart').setAttribute('aria-label', 'Cancelar ejercicio');
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
    $('#exStart').classList.remove('stop');
    $('#exStart').setAttribute('aria-label', 'Empezar ejercicio');
    renderTrainLog();
  }
};

function drawExerciseRoll() {
  const ex = exercise;
  const singing = ex.phase === 'sing' && engine.rec;
  const total = ex.targets.length * ex.dur;
  const now = singing ? engine.ctx.currentTime - engine.rec.t0 : 0;
  // la curva se traslada a la octava del ejercicio para poder compararla
  const fold = (m, t) => {
    const ref = ex.targets[Math.min(ex.targets.length - 1, Math.max(0, Math.floor(t / ex.dur)))];
    return m - 12 * Math.round((m - ref) / 12);
  };
  drawRoll($('#exRoll'), {
    points: singing ? livePointsSince(engine.rec.t0, fold) : [],
    lanes: ex.lanes.length ? ex.lanes : ex.targets.map((m, i) => ({ start: i * ex.dur, end: (i + 1) * ex.dur, midi: m })),
    t0: 0, t1: total, lo: Math.min(...ex.targets) - 4, hi: Math.max(...ex.targets) + 4,
    notation: settings.notation, playhead: singing ? now : null,
  });
}

function showExerciseResult(res, targets) {
  const verdict = res.score >= 85 ? '¡Excelente!' : res.score >= 65 ? 'Bien, sigue practicando' : 'A seguir entrenando';
  let html = `<div class="ex-result"><div class="num ${scoreCls(res.score)}">${res.score}</div><div><b>${verdict}</b>`;
  if (res.meanAbsCents != null) html += `<span class="muted">Desviación media ±${res.meanAbsCents.toFixed(0)} cents</span>`;
  if (res.bias != null) html += `<span class="muted">Tendencia ${signed(res.bias)} cents${res.reachTime != null ? ` · llegaste a la nota en ${res.reachTime.toFixed(2)} s` : ''}</span>`;
  if (res.perNote) {
    html += '<div class="notes-row">' + res.perNote.map((p) => `<span class="note-chip ${p.ok ? 'ok' : 'bad'}">${nn(p.target, false)} ${p.cents == null ? '—' : signed(p.cents)}</span>`).join('') + '</div>';
  }
  $('#exResult').innerHTML = html + '</div></div>';
}

async function renderTrainLog() {
  const log = (await db.all('training')).sort((a, b) => b.date - a.date).slice(0, 15);
  $('#exLog').innerHTML = log.length
    ? log.map((l) => `<div class="row-item"><span class="row-text"><span class="row-title">${esc(l.name)} · ${nn(l.root)}</span>
        <span class="row-sub">${fmtDate(l.date)}${l.meanAbsCents != null ? ` · ±${l.meanAbsCents.toFixed(0)} cents` : ''}</span></span>
        <span class="row-score ${scoreCls(l.score)}">${l.score}</span></div>`).join('')
    : emptyMsg('Aún no hay ejercicios', 'Elige uno arriba, pulsa el botón y repite lo que escuches.');
  if (!exercise) {
    const type = exType(), def = EXERCISES[type];
    const targets = (def.seq || [0]).map((s) => settings.exRoot + s);
    drawRoll($('#exRoll'), {
      points: [], lanes: targets.map((m, i) => ({ start: i * def.dur, end: (i + 1) * def.dur, midi: m })),
      t0: 0, t1: targets.length * def.dur, lo: Math.min(...targets) - 4, hi: Math.max(...targets) + 4, notation: settings.notation,
    });
  }
}
const exType = () => document.querySelector('input[name=exType]:checked').value;
document.querySelectorAll('input[name=exType]').forEach((r) => (r.onchange = () => { if (!exercise) $('#exResult').innerHTML = ''; renderTrainLog(); }));
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
    delta = `<span class="delta ${dv <= 0 ? 'up' : 'down'}">${dv <= 0 ? 'mejor' : 'peor'} ${Math.abs(dv).toFixed(1)}</span>`;
  }
  $('#progTiles').innerHTML = `
    <div class="stat-tile"><b>${streak}</b><span>${streak === 1 ? 'día seguido' : 'días seguidos'} practicando</span></div>
    <div class="stat-tile"><b>${minutes < 10 ? minutes.toFixed(1) : minutes.toFixed(0)}</b><span>minutos cantados</span></div>
    <div class="stat-tile"><b>${takes.length}</b><span>tomas grabadas</span></div>
    <div class="stat-tile"><b>${thisW != null ? '±' + thisW.toFixed(1) : '—'}${delta}</b><span>cents medios esta semana</span></div>
    <div class="stat-tile wide"><b>${lows.length ? `${nn(Math.min(...lows))} – ${nn(Math.max(...highs))}` : '—'}</b><span>rango vocal registrado</span></div>`;
  const scoreSeries = takes.map((t) => ({ x: t.date, y: t.summary.score }));
  drawChart($('#progScore'), scoreSeries, { yMin: 0, yMax: 100 });
  drawChart($('#progCents'), takes.map((t) => ({ x: t.date, y: t.summary.meanAbsCents })), { yMin: 0, color: getComputedStyle(document.documentElement).getPropertyValue('--curve').trim() });
  const rows = songs.map((s) => {
    const ts = takes.filter((t) => t.songId === s.id);
    if (!ts.length) return null;
    const first = ts[0].summary.score, last = ts[ts.length - 1].summary.score, dlt = last - first;
    return `<div class="row-item">${coverHtml(s)}<span class="row-text"><span class="row-title">${esc(s.title)}</span>
      <span class="row-sub">${ts.length} toma${ts.length === 1 ? '' : 's'} · empezaste en ${first}</span></span>
      <span class="row-score">${last}${ts.length > 1 ? `<small class="${dlt >= 0 ? 'up' : 'down'}">${signed(dlt)}</small>` : ''}</span></div>`;
  }).filter(Boolean);
  $('#progSongs').innerHTML = rows.join('') || emptyMsg('Sin datos todavía', 'Graba tomas de tus canciones para ver cómo mejoras.');
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
  const data = { app: 'musicman', version: 1, exported: Date.now(), settings, songs, takes: takes.map(({ audio, ...t }) => t), training };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `musicman-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Copia exportada (sin audios).');
};
$('#importInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!['musicman', 'afinavoz'].includes(data.app)) throw new Error('formato');
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
window.musicman = { engine, db, go };
