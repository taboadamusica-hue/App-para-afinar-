// Pantalla «Metrónomo».
import { Metronome, TIME_SIGNATURES, SUBDIVISIONS, SOUND_NAMES, tempoName, clampBpm, tapTempo, defaultAccents, nextAccent } from './metronome.js';

export function initMetronome({ $, engine, settings, saveSettings }) {
  // Estado persistente (ajustes) — el metrónomo lee este objeto en vivo
  const saved = settings.metro || {};
  const state = {
    bpm: clampBpm(saved.bpm ?? 100),
    sig: TIME_SIGNATURES[saved.sig] ? saved.sig : '4/4',
    subdiv: saved.subdiv ?? 1,
    sound: SOUND_NAMES[saved.sound] ? saved.sound : 'click',
    volume: saved.volume ?? 0.8,
    accents: null,
    trainer: { on: false, start: 100, step: 5, every: 4, target: 140, ...(saved.trainer || {}) },
    muteBars: { on: false, play: 2, mute: 2, ...(saved.muteBars || {}) },
  };
  state.trainer.on = false; // el entrenador siempre empieza apagado
  state.accents = Array.isArray(saved.accents) && saved.accents.length === TIME_SIGNATURES[state.sig].beats ? saved.accents : defaultAccents(state.sig);
  const persist = () => {
    settings.metro = { bpm: state.bpm, sig: state.sig, subdiv: state.subdiv, sound: state.sound, volume: state.volume, accents: state.accents, trainer: state.trainer, muteBars: state.muteBars };
    saveSettings();
  };

  const metro = new Metronome(() => engine.ensureContext(), state);
  let wakeLock = null;

  // ---------- Controles ----------
  const fillSelect = (sel, entries, value) => {
    sel.innerHTML = entries.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
    sel.value = String(value);
  };
  fillSelect($('#mSig'), Object.keys(TIME_SIGNATURES).map((k) => [k, k]), state.sig);
  fillSelect($('#mSub'), Object.entries(SUBDIVISIONS), state.subdiv);
  fillSelect($('#mSound'), Object.entries(SOUND_NAMES), state.sound);
  fillSelect($('#mTrStep'), [1, 2, 3, 5, 10].map((n) => [n, `+${n}`]), state.trainer.step);
  fillSelect($('#mTrEvery'), [1, 2, 4, 8, 16].map((n) => [n, `${n} ${n === 1 ? 'compás' : 'compases'}`]), state.trainer.every);
  fillSelect($('#mMutePlay'), [1, 2, 3, 4, 8].map((n) => [n, `${n}`]), state.muteBars.play);
  fillSelect($('#mMuteMute'), [1, 2, 3, 4].map((n) => [n, `${n}`]), state.muteBars.mute);
  $('#mTrTarget').value = state.trainer.target;
  $('#mMuteOn').checked = state.muteBars.on;
  $('#mVol').value = state.volume;

  function setBpm(b) {
    state.bpm = clampBpm(b);
    if (state.trainer.on && !metro.running) state.trainer.start = state.bpm;
    paintTempo(state.bpm);
    persist();
  }
  function paintTempo(bpm) {
    $('#mBpm').textContent = bpm;
    $('#mTempoName').textContent = state.trainer.on && metro.running ? `${tempoName(bpm)} · subiendo hasta ${state.trainer.target}` : tempoName(bpm);
    $('#mSlider').value = state.bpm;
  }

  $('#mSlider').oninput = (e) => setBpm(+e.target.value);
  // Mantener pulsado − / + repite
  for (const [id, d] of [['#mMinus', -1], ['#mPlus', 1]]) {
    const btn = $(id);
    let rep = null, delay = null;
    const stop = () => { clearTimeout(delay); clearInterval(rep); };
    btn.onpointerdown = (e) => {
      e.preventDefault();
      setBpm(state.bpm + d);
      delay = setTimeout(() => { rep = setInterval(() => setBpm(state.bpm + d), 70); }, 400);
    };
    btn.onpointerup = btn.onpointerleave = btn.onpointercancel = stop;
    btn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setBpm(state.bpm + d); } };
  }
  const taps = [];
  $('#mTap').onclick = () => {
    taps.push(performance.now());
    if (taps.length > 12) taps.shift();
    const b = tapTempo(taps);
    if (b) setBpm(b);
    const t = $('#mTap');
    t.classList.add('tapped');
    setTimeout(() => t.classList.remove('tapped'), 90);
  };
  $('#mHalf').onclick = () => setBpm(state.bpm * 2 > 300 || state.bpm >= 160 ? state.bpm / 2 : state.bpm * 2);
  $('#mSig').onchange = (e) => { state.sig = e.target.value; state.accents = defaultAccents(state.sig); renderBeats(); persist(); };
  $('#mSub').onchange = (e) => { state.subdiv = +e.target.value; persist(); };
  $('#mSound').onchange = (e) => { state.sound = e.target.value; persist(); };
  $('#mVol').oninput = (e) => { state.volume = +e.target.value; persist(); };

  function paintTrainerRows() {
    $('#mTrRow').classList.toggle('off', !state.trainer.on);
    $('#mMuteRow').classList.toggle('off', !state.muteBars.on);
  }
  $('#mTrOn').onchange = (e) => {
    state.trainer.on = e.target.checked;
    state.trainer.start = state.bpm;
    if (state.trainer.on && state.trainer.target <= state.bpm) { state.trainer.target = Math.min(300, state.bpm + 20); $('#mTrTarget').value = state.trainer.target; }
    if (metro.running) { metro.bar = 0; }
    paintTrainerRows(); paintTempo(state.bpm); persist();
  };
  $('#mTrStep').onchange = (e) => { state.trainer.step = +e.target.value; persist(); };
  $('#mTrEvery').onchange = (e) => { state.trainer.every = +e.target.value; persist(); };
  $('#mTrTarget').onchange = (e) => { state.trainer.target = clampBpm(+e.target.value || 140); e.target.value = state.trainer.target; persist(); };
  $('#mMuteOn').onchange = (e) => { state.muteBars.on = e.target.checked; paintTrainerRows(); persist(); };
  $('#mMutePlay').onchange = (e) => { state.muteBars.play = +e.target.value; persist(); };
  $('#mMuteMute').onchange = (e) => { state.muteBars.mute = +e.target.value; persist(); };
  paintTrainerRows();

  // ---------- Pulsos ----------
  const levelName = (a) => (a >= 0.95 ? 'strong' : a > 0 ? 'normal' : 'mute');
  const levelLabel = { strong: 'fuerte', normal: 'normal', mute: 'en silencio' };
  function renderBeats() {
    const box = $('#mBeats');
    box.classList.toggle('dense', state.accents.length > 7);
    box.innerHTML = state.accents.map((a, i) => `<button class="beat" data-i="${i}" data-level="${levelName(a)}" aria-label="Pulso ${i + 1}: ${levelLabel[levelName(a)]}"><i></i></button>`).join('');
    box.querySelectorAll('.beat').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.i;
      state.accents[i] = nextAccent(state.accents[i]);
      b.dataset.level = levelName(state.accents[i]);
      b.setAttribute('aria-label', `Pulso ${i + 1}: ${levelLabel[b.dataset.level]}`);
      persist();
    }));
  }
  renderBeats();

  // ---------- Iniciar / parar ----------
  async function start() {
    // iOS: que suene aunque el interruptor de silencio esté activado
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* */ }
    if (state.trainer.on) state.trainer.start = state.bpm;
    await metro.start();
    $('#mStart').classList.add('stop');
    $('#mStart').setAttribute('aria-label', 'Parar metrónomo');
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* sin bloqueo de pantalla */ }
  }
  function stop() {
    metro.stop();
    $('#mStart').classList.remove('stop');
    $('#mStart').setAttribute('aria-label', 'Iniciar metrónomo');
    $('#mBeats').querySelectorAll('.beat.on').forEach((b) => b.classList.remove('on'));
    $('#mStage').classList.remove('flash', 'downbeat');
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
    paintTempo(state.bpm);
  }
  $('#mStart').onclick = () => (metro.running ? stop() : start());
  metro.onBar = (bar, bpm) => { if (state.trainer.on) setTimeout(() => paintTempo(bpm), 0); };

  // ---------- Parte visual sincronizada con el audio ----------
  let lastShown = null;
  function frame() {
    if (!metro.running) return;
    const now = metro.ctx.currentTime;
    // el último clic que ya ha sonado
    let ev = null;
    for (const q of metro.queue) if (q.t <= now) ev = q;
    if (ev && ev !== lastShown && now - ev.t < 0.12) {
      lastShown = ev;
      if (ev.sub === 0) {
        const beats = $('#mBeats').querySelectorAll('.beat');
        beats.forEach((b, i) => b.classList.toggle('on', i === ev.beat));
        const st = $('#mStage');
        st.classList.toggle('downbeat', ev.beat === 0 && ev.level >= 0.95);
        if (ev.level > 0) {
          st.classList.add('flash');
          setTimeout(() => st.classList.remove('flash'), 60);
        }
      }
    }
  }

  paintTempo(state.bpm);
  return {
    onFrame: frame,
    toggle: () => (metro.running ? stop() : start()),
    get running() { return metro.running; },
    repaint() { paintTempo(state.bpm); },
  };
}
