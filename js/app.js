import { detectPitch, freqToMidi, midiToName, midiToFreq } from './pitch.js';
import { INSTRUMENTS } from './instruments.js';
import { loadMemory, saveMemory, clearMemory, exportMemory } from './memory.js';
import { Assistant } from './assistant.js';

const $ = (s) => document.querySelector(s);
let mem = loadMemory();

// ---------- notificaciones ----------
async function notify(text) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification('Afinador IA', { body: text, icon: 'icon.svg', tag: 'afinador-ia' });
    else new Notification('Afinador IA', { body: text, icon: 'icon.svg' });
  } catch { /* sin notificaciones */ }
}

// ---------- feed del asistente ----------
const feed = $('#feed');
function renderMessage(msg) {
  if (msg.ephemeral) return toast(msg.text);
  const el = document.createElement('div');
  el.className = `msg ${msg.from} ${msg.kind}`;
  el.textContent = msg.text;
  const time = document.createElement('time');
  time.textContent = new Date(msg.t).toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  el.appendChild(time);
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  if (msg.from === 'ia' && msg.kind !== 'answer' && !msg._noToast) toast(msg.text);
}
function renderFeed() {
  feed.innerHTML = '';
  mem.feed.slice(-40).forEach((m) => renderMessage({ ...m, ephemeral: false, _noToast: true }));
}
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

let ai = new Assistant(mem, { onMessage: renderMessage, notify });

// ---------- afinador ----------
let audioCtx, analyser, stream, rafId, buf;
const history = [];
let lastTarget = null, sameTargetFrames = 0;

function renderStrings() {
  const box = $('#strings');
  box.innerHTML = '';
  for (const m of INSTRUMENTS[mem.settings.instrument].strings) {
    const b = document.createElement('span');
    b.className = 'string';
    b.dataset.midi = m;
    const { name, octave } = midiToName(m);
    b.textContent = `${name}${octave}`;
    box.appendChild(b);
  }
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    ai.say('No tengo acceso al micrófono. Permítelo en el navegador para poder afinar.', 'alert');
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096;
  buf = new Float32Array(analyser.fftSize);
  src.connect(analyser);
  $('#toggle').textContent = 'Parar';
  document.body.classList.add('listening');
  ai.startSession();
  loop();
}

function stop() {
  cancelAnimationFrame(rafId);
  stream?.getTracks().forEach((t) => t.stop());
  audioCtx?.close();
  audioCtx = null;
  $('#toggle').textContent = 'Empezar';
  document.body.classList.remove('listening');
  showIdle();
  ai.endSession();
}

function showIdle() {
  $('#note').textContent = '–';
  $('#octave').textContent = '';
  $('#cents').textContent = 'Toca una cuerda';
  $('#freq').textContent = '';
  setNeedle(0, false);
}

function setNeedle(cents, active) {
  const c = Math.max(-50, Math.min(50, cents));
  $('#needle').style.transform = `rotate(${c * 0.9}deg)`;
  const g = $('#gauge');
  g.classList.toggle('active', active);
  g.classList.toggle('ok', active && Math.abs(cents) <= 3);
  g.classList.toggle('near', active && Math.abs(cents) > 3 && Math.abs(cents) <= 10);
}

let lastRun = 0;
function loop(ts = 0) {
  rafId = requestAnimationFrame(loop);
  if (ts - lastRun < 45) return;
  lastRun = ts;
  analyser.getFloatTimeDomainData(buf);
  const res = detectPitch(buf, audioCtx.sampleRate);
  if (!res || res.confidence < 0.85) {
    history.length = 0;
    sameTargetFrames = 0;
    return;
  }
  history.push(res.freq);
  if (history.length > 5) history.shift();
  const freq = [...history].sort((a, b) => a - b)[Math.floor(history.length / 2)];
  const a4 = mem.settings.a4;
  const midiF = freqToMidi(freq, a4);

  const strings = INSTRUMENTS[mem.settings.instrument].strings;
  let target = Math.round(midiF);
  if (strings.length) {
    target = strings.reduce((best, m) => (Math.abs(m - midiF) < Math.abs(best - midiF) ? m : best), strings[0]);
    if (Math.abs(target - midiF) > 1.5) target = Math.round(midiF); // nota fuera de las cuerdas
  }
  const cents = (midiF - target) * 100;
  const { name, octave } = midiToName(target);

  $('#note').textContent = name;
  $('#octave').textContent = octave;
  $('#cents').textContent = Math.abs(cents) <= 3 ? '¡Afinada!' : `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents · ${cents > 0 ? 'baja un poco' : 'sube un poco'}`;
  $('#freq').textContent = `${freq.toFixed(1)} Hz → ${midiToFreq(target, a4).toFixed(1)} Hz`;
  setNeedle(cents, true);
  document.querySelectorAll('.string').forEach((s) => s.classList.toggle('current', Number(s.dataset.midi) === target));

  sameTargetFrames = target === lastTarget ? sameTargetFrames + 1 : 0;
  lastTarget = target;
  const isString = !strings.length || strings.includes(target);
  if (sameTargetFrames >= 3 && isString && Math.abs(cents) < 100) {
    ai.observe({ midi: target, cents });
    const el = document.querySelector(`.string[data-midi="${target}"]`);
    if (el && ai.live[`${mem.settings.instrument}:${target}`]?.tunedAt) el.classList.add('done');
  }
}

$('#toggle').addEventListener('click', () => (audioCtx ? stop() : start()));

// ---------- chat ----------
$('#ask').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#question');
  const q = input.value.trim();
  if (!q) return;
  renderMessage({ t: Date.now(), text: q, kind: 'user', from: 'user' });
  input.value = '';
  ai.answer(q);
});
document.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
  renderMessage({ t: Date.now(), text: b.dataset.quick, kind: 'user', from: 'user' });
  ai.answer(b.dataset.quick);
}));

// ---------- ajustes ----------
const dlg = $('#settings');
const instSel = $('#instrument');
for (const [k, v] of Object.entries(INSTRUMENTS)) instSel.add(new Option(v.label, k));

function fillSettings() {
  const s = mem.settings;
  instSel.value = s.instrument;
  $('#a4').value = s.a4;
  $('#proactive').checked = s.proactive;
  $('#reminderOn').checked = s.reminder.enabled;
  $('#reminderTime').value = s.reminder.time;
  $('#weekly').checked = s.weeklySummary;
  document.querySelectorAll('#days input').forEach((c) => (c.checked = s.reminder.days.includes(Number(c.value))));
  updateNotifStatus();
}
function updateNotifStatus() {
  const p = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#notifStatus').textContent = {
    granted: 'Notificaciones activadas.',
    denied: 'Notificaciones bloqueadas en el navegador. Los avisos aparecerán dentro de la app.',
    default: 'Permite notificaciones para recibir avisos aunque no estés mirando la app.',
    unsupported: 'Este navegador no admite notificaciones; los avisos aparecerán dentro de la app.',
  }[p];
  $('#notifBtn').hidden = p !== 'default';
}

$('#openSettings').addEventListener('click', () => { fillSettings(); dlg.showModal(); });
$('#closeSettings').addEventListener('click', () => dlg.close());
instSel.addEventListener('change', () => { mem.settings.instrument = instSel.value; saveMemory(mem); renderStrings(); });
$('#a4').addEventListener('change', (e) => { mem.settings.a4 = Math.min(460, Math.max(415, Number(e.target.value) || 440)); e.target.value = mem.settings.a4; saveMemory(mem); });
$('#proactive').addEventListener('change', (e) => { mem.settings.proactive = e.target.checked; saveMemory(mem); });
$('#weekly').addEventListener('change', (e) => { mem.settings.weeklySummary = e.target.checked; saveMemory(mem); });
$('#reminderOn').addEventListener('change', async (e) => {
  mem.settings.reminder.enabled = e.target.checked;
  saveMemory(mem);
  if (e.target.checked) {
    await askNotifications();
    await registerPeriodicSync();
    ai.say(`Hecho: te recordaré afinar a las ${mem.settings.reminder.time} los días marcados.`, 'info');
  }
});
$('#reminderTime').addEventListener('change', (e) => { mem.settings.reminder.time = e.target.value || '19:00'; saveMemory(mem); });
document.querySelectorAll('#days input').forEach((c) => c.addEventListener('change', () => {
  mem.settings.reminder.days = [...document.querySelectorAll('#days input:checked')].map((x) => Number(x.value));
  saveMemory(mem);
}));
$('#notifBtn').addEventListener('click', askNotifications);
$('#export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(exportMemory(mem));
  a.download = 'memoria-afinador-ia.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#wipe').addEventListener('click', () => {
  if (!confirm('¿Borrar todo lo que ha aprendido el asistente? No se puede deshacer.')) return;
  if (audioCtx) stop();
  mem = clearMemory();
  ai = new Assistant(mem, { onMessage: renderMessage, notify });
  renderFeed();
  renderStrings();
  fillSettings();
  ai.say('Memoria borrada. Empezamos de cero.', 'info');
});

async function askNotifications() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* nada */ }
  }
  updateNotifStatus();
}

// Recordatorios con la app cerrada (Chrome/Edge con la PWA instalada).
async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && 'periodicSync' in reg) {
      await reg.periodicSync.register('recordatorio-practica', { minInterval: 60 * 60 * 1000 });
    }
  } catch { /* no soportado: los recordatorios funcionan mientras la app está abierta */ }
}

// ---------- arranque ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    saveMemory(mem); // sincroniza la configuración de recordatorios con el SW
    if (mem.settings.reminder.enabled) registerPeriodicSync();
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => saveMemory(mem));
}

renderStrings();
renderFeed();
showIdle();
ai.greet();
ai.tick();
setInterval(() => ai.tick(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ai.tick(); });
window.addEventListener('pagehide', () => ai.endSession());
