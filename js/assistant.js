// Asistente de IA privado: aprende de tus sesiones de afinación en el propio
// dispositivo y te habla de forma proactiva. No usa red ni servicios externos.

import { midiToName } from './pitch.js';
import { INSTRUMENTS } from './instruments.js';
import { saveMemory, todayKey, weekKey } from './memory.js';

const DAY = 86400000;
const MIN = 60000;

export class Assistant {
  constructor(memory, { onMessage, notify }) {
    this.mem = memory;
    this.onMessage = onMessage;
    this.notify = notify;
    this.session = null;
    this.live = {};          // estado por cuerda en la sesión actual
    this.lastProactive = 0;
  }

  // ---------- utilidades ----------
  say(text, kind = 'tip', { push = false } = {}) {
    const msg = { t: Date.now(), text, kind, from: 'ia' };
    this.mem.feed.push(msg);
    saveMemory(this.mem);
    this.onMessage(msg);
    if (push) this.notify(text);
  }

  stringName(midi) {
    const { name, octave } = midiToName(midi);
    return `${name}${octave}`;
  }

  statsFor(key) {
    if (!this.mem.strings[key]) {
      this.mem.strings[key] = { obs: 0, devs: [], tuned: 0, tuneMs: [], drifts: 0, lastSeen: 0 };
    }
    return this.mem.strings[key];
  }

  get instrument() { return this.mem.settings.instrument; }

  // ---------- ciclo de sesión ----------
  startSession() {
    if (this.session) return;
    this.session = { start: Date.now(), end: null, instrument: this.instrument, tuned: 0, lastTunedAt: null, retuneWarned: false };
    this.live = {};
    this.mem.sessions.push(this.session);
    saveMemory(this.mem);
  }

  endSession() {
    if (!this.session) return;
    this.session.end = Date.now();
    const mins = Math.round((this.session.end - this.session.start) / MIN);
    if (this.session.tuned > 0) {
      this.say(`Sesión guardada: ${this.session.tuned} cuerda(s) afinada(s) en ${Math.max(1, mins)} min.`, 'info');
    }
    this.session = null;
    saveMemory(this.mem);
  }

  // Lo llama el afinador con cada lectura estable que encaja con una cuerda.
  observe({ midi, cents }) {
    if (!this.session) return;
    const now = Date.now();
    const key = `${this.instrument}:${midi}`;
    const live = this.live[key] || (this.live[key] = { firstAt: now, firstCents: cents, initialDone: false, inTuneSince: null, tunedAt: null, offSince: null, warnedDrift: false });
    const stats = this.statsFor(key);
    stats.lastSeen = now;

    // 1) Primera lectura de la sesión: cuánto llegó desafinada
    if (!live.initialDone && now - live.firstAt > 400) {
      live.initialDone = true;
      stats.obs++;
      stats.devs.push(Math.round(live.firstCents));
      stats.devs = stats.devs.slice(-30);
      this.commentOnArrival(midi, live.firstCents, stats);
    }

    // 2) Detectar cuándo queda afinada
    if (Math.abs(cents) <= 3) {
      live.inTuneSince ??= now;
      live.offSince = null;
      if (!live.tunedAt && now - live.inTuneSince > 700) {
        live.tunedAt = now;
        live.warnedDrift = false;
        stats.tuned++;
        stats.tuneMs.push(now - live.firstAt);
        stats.tuneMs = stats.tuneMs.slice(-30);
        this.session.tuned++;
        this.session.lastTunedAt = now;
        saveMemory(this.mem);
        this.onTuned(midi);
      }
    } else {
      live.inTuneSince = null;
      // 3) Ya estaba afinada y se ha vuelto a ir: deriva
      if (live.tunedAt && Math.abs(cents) > 10) {
        live.offSince ??= now;
        if (!live.warnedDrift && now - live.offSince > 1200) {
          live.warnedDrift = true;
          live.tunedAt = null;
          stats.drifts++;
          saveMemory(this.mem);
          const dir = cents > 0 ? 'alta' : 'baja';
          let extra = '';
          if (stats.drifts >= 4) extra = ' Se desafina a menudo: revisa la clavija o plantéate cambiar la cuerda.';
          this.say(`La cuerda ${this.stringName(midi)} se ha vuelto a desafinar (${Math.round(Math.abs(cents))} cents ${dir}).${extra}`, 'alert');
        }
      }
    }
  }

  commentOnArrival(midi, cents, stats) {
    if (!this.mem.settings.proactive) return;
    const name = this.stringName(midi);
    const abs = Math.abs(cents);
    if (stats.devs.length >= 5) {
      const recent = avg(stats.devs.slice(-5).map(Math.abs));
      const older = avg(stats.devs.slice(0, -5).map(Math.abs));
      if (stats.devs.length >= 10 && recent > older + 6) {
        this.say(`${name} llega cada vez más desafinada (media ${Math.round(recent)} cents frente a ${Math.round(older)} antes). Puede que la cuerda esté vieja.`, 'insight');
        return;
      }
    }
    if (abs > 30) {
      this.say(`${name} viene muy ${cents > 0 ? 'alta' : 'baja'} (${Math.round(abs)} cents). Gira despacio y deja que la cuerda se asiente.`, 'tip');
    }
  }

  onTuned(midi) {
    const strings = INSTRUMENTS[this.instrument]?.strings || [];
    if (!strings.length) return;
    const tunedAll = strings.every((m) => this.live[`${this.instrument}:${m}`]?.tunedAt);
    if (tunedAll) {
      this.say('¡Todas las cuerdas afinadas! Te avisaré si alguna se mueve mientras tocas.', 'success');
    } else {
      const pending = strings.filter((m) => !this.live[`${this.instrument}:${m}`]?.tunedAt);
      // Sugiere la siguiente cuerda: la que históricamente más se desafina
      const next = pending.sort((a, b) => this.meanAbsDev(b) - this.meanAbsDev(a))[0];
      if (next !== undefined && this.mem.settings.proactive) {
        this.onMessage({ t: Date.now(), text: `${this.stringName(midi)} lista. Siguiente: ${this.stringName(next)}.`, kind: 'hint', from: 'ia', ephemeral: true });
      }
    }
  }

  meanAbsDev(midi) {
    const s = this.mem.strings[`${this.instrument}:${midi}`];
    return s && s.devs.length ? avg(s.devs.map(Math.abs)) : 0;
  }

  // ---------- proactividad ----------
  greet() {
    const today = todayKey();
    if (this.mem.lastGreeting === today) return;
    this.mem.lastGreeting = today;
    const parts = [];
    const lastSession = [...this.mem.sessions].reverse().find((s) => s.tuned > 0);

    if (!lastSession) {
      parts.push('Hola. Soy tu asistente de afinación privado: aprendo de cómo se desafina tu instrumento sin enviar nada fuera de este dispositivo. Pulsa «Empezar» y toca una cuerda.');
    } else {
      const days = Math.floor((startOfDay(Date.now()) - startOfDay(lastSession.start)) / DAY);
      const streak = this.streak();
      if (days === 0) parts.push('¡Otra vez por aquí hoy!');
      else if (days === 1) parts.push(streak > 1 ? `Llevas ${streak} días seguidos. ¡A por el ${streak + 1}º!` : 'Ayer afinaste; hoy toca mantener el ritmo.');
      else parts.push(`Hace ${days} días que no afinas. Tras unos días las cuerdas suelen moverse más de lo normal.`);

      const worst = this.worstString();
      if (worst) parts.push(`Empieza por ${worst.name}: suele llegar ${worst.dir} unos ${worst.mean} cents.`);
    }

    const suggestion = this.reminderSuggestion();
    if (suggestion) parts.push(suggestion);

    this.say(parts.join(' '), 'greeting');
  }

  worstString() {
    const prefix = `${this.instrument}:`;
    let best = null;
    for (const [key, s] of Object.entries(this.mem.strings)) {
      if (!key.startsWith(prefix) || s.devs.length < 3) continue;
      const mean = avg(s.devs.map(Math.abs));
      if (mean < 5) continue;
      if (!best || mean > best.mean) {
        const signed = avg(s.devs);
        best = { name: this.stringName(Number(key.slice(prefix.length))), mean: Math.round(mean), dir: signed >= 0 ? 'alta' : 'baja' };
      }
    }
    return best;
  }

  streak() {
    const days = new Set(this.mem.sessions.filter((s) => s.tuned > 0).map((s) => todayKey(new Date(s.start))));
    let n = 0;
    const d = new Date();
    if (!days.has(todayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(todayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  favouriteHour() {
    const hours = new Array(24).fill(0);
    const real = this.mem.sessions.filter((s) => s.tuned > 0);
    real.forEach((s) => hours[new Date(s.start).getHours()]++);
    const max = Math.max(...hours);
    return real.length >= 4 && max >= 3 ? hours.indexOf(max) : null;
  }

  reminderSuggestion() {
    if (this.mem.settings.reminder.enabled) return null;
    const h = this.favouriteHour();
    if (h === null) return null;
    return `Sueles practicar sobre las ${h}:00. ¿Activo un recordatorio diario a esa hora en Ajustes?`;
  }

  // Se ejecuta periódicamente (cada ~30 s) mientras la app está abierta.
  tick(now = Date.now()) {
    // Recordatorio recurrente
    const r = this.mem.settings.reminder;
    if (r.enabled && this.isReminderDue(now)) {
      this.mem.lastReminderDate = todayKey(new Date(now));
      const worst = this.worstString();
      const extra = worst ? ` Empieza por ${worst.name}.` : '';
      this.say(`Es tu hora de práctica (${r.time}). Afina antes de tocar.${extra}`, 'reminder', { push: true });
    }

    // Resumen semanal (lunes)
    const wk = weekKey(new Date(now));
    if (this.mem.settings.weeklySummary && new Date(now).getDay() === 1 && this.mem.lastWeeklySummary !== wk) {
      this.mem.lastWeeklySummary = wk;
      const summary = this.weeklySummary(now);
      if (summary) this.say(summary, 'summary', { push: true });
      else saveMemory(this.mem);
    }

    // Dentro de una sesión: recomendar reafinar tras un rato tocando
    if (this.session?.lastTunedAt && !this.session.retuneWarned && now - this.session.lastTunedAt > 25 * MIN && this.mem.settings.proactive) {
      this.session.retuneWarned = true;
      this.say('Llevas un buen rato tocando desde la última afinación. Con el calor de las manos y la tensión las cuerdas se mueven: ¿un repaso rápido?', 'tip', { push: document.hidden });
    }
  }

  isReminderDue(now) {
    const r = this.mem.settings.reminder;
    const d = new Date(now);
    if (!r.days.includes(d.getDay())) return false;
    if (this.mem.lastReminderDate === todayKey(d)) return false;
    const [h, m] = r.time.split(':').map(Number);
    const due = new Date(d); due.setHours(h, m, 0, 0);
    // Si ya practicaste hoy antes de la hora, no molesta
    const practisedToday = this.mem.sessions.some((s) => s.tuned > 0 && todayKey(new Date(s.start)) === todayKey(d));
    return now >= due.getTime() && now - due.getTime() < 3 * 3600000 && !practisedToday;
  }

  weeklySummary(now = Date.now()) {
    const since = now - 7 * DAY;
    const week = this.mem.sessions.filter((s) => s.start >= since && s.tuned > 0);
    if (!week.length) return 'Resumen semanal: esta semana no has afinado. ¿Lo retomamos hoy?';
    const days = new Set(week.map((s) => todayKey(new Date(s.start)))).size;
    const tuned = week.reduce((a, s) => a + s.tuned, 0);
    const worst = this.worstString();
    return `Resumen semanal: ${week.length} sesiones en ${days} día(s), ${tuned} cuerdas afinadas.` + (worst ? ` La más inestable: ${worst.name}.` : '');
  }

  // ---------- conversación local ----------
  answer(text) {
    const q = normalize(text);
    this.mem.feed.push({ t: Date.now(), text, kind: 'user', from: 'user' });
    let reply;

    if (/(hola|buenas|hey)/.test(q)) reply = '¡Hola! Pregúntame por tus estadísticas, qué cuerda se desafina más, tu racha, o pídeme un consejo.';
    else if (/(estadistic|resumen|progreso|como voy)/.test(q)) reply = this.statsText();
    else if (/(peor|mas se desafina|inestable|que cuerda)/.test(q)) {
      const w = this.worstString();
      reply = w ? `${w.name} es la más inestable: llega de media ${w.mean} cents ${w.dir}.` : 'Aún no tengo datos suficientes. Afina unas cuantas sesiones y te lo digo.';
    } else if (/(racha|seguidos|dias)/.test(q)) {
      const s = this.streak();
      reply = s ? `Llevas ${s} día(s) seguido(s) afinando.` : 'Ahora mismo no tienes racha. ¡Hoy es buen día para empezar una!';
    } else if (/(recordator|avis|recuerda)/.test(q)) {
      const r = this.mem.settings.reminder;
      reply = r.enabled ? `Tienes un recordatorio a las ${r.time}. Puedes cambiarlo en Ajustes.` : 'No tienes recordatorios activos. Actívalos en Ajustes y te aviso cada día a la hora que elijas.';
    } else if (/(privad|datos|nube|internet|servidor)/.test(q)) {
      reply = 'Todo lo que aprendo se guarda solo en este dispositivo. No hay servidores, cuentas ni envío de audio. Puedes exportar o borrar mi memoria en Ajustes.';
    } else if (/(consejo|tip|ayuda|como afino|truco)/.test(q)) {
      reply = pick([
        'Afina siempre subiendo hacia la nota: si te pasas, baja por debajo y vuelve a subir. Así la cuerda queda más estable.',
        'Toca la cuerda con fuerza media y deja que suene; el ataque inicial suele salir algo alto.',
        'Las cuerdas nuevas se estiran: afina, estíralas suavemente con la mano y vuelve a afinar dos o tres veces.',
        'Afina en la misma postura en la que vas a tocar: la tensión del mástil cambia un poco.',
        'Si tocas con otros, acordad el La de referencia (440, 442…). Lo cambias en Ajustes.',
      ]);
    } else if (/(la ?4|440|442|referencia|calibr)/.test(q)) {
      reply = `Tu referencia actual es La4 = ${this.mem.settings.a4} Hz. Muchas orquestas usan 442.`;
    } else {
      reply = 'Soy un asistente local y sencillo: entiendo preguntas sobre estadísticas, la cuerda más inestable, tu racha, recordatorios, privacidad y consejos de afinación.';
    }
    this.say(reply, 'answer');
  }

  statsText() {
    const real = this.mem.sessions.filter((s) => s.tuned > 0);
    if (!real.length) return 'Todavía no hay sesiones guardadas.';
    const tuned = real.reduce((a, s) => a + s.tuned, 0);
    const prefix = `${this.instrument}:`;
    const times = Object.entries(this.mem.strings).filter(([k]) => k.startsWith(prefix)).flatMap(([, s]) => s.tuneMs);
    const t = times.length ? ` Tardas de media ${Math.round(avg(times) / 1000)} s por cuerda.` : '';
    const w = this.worstString();
    return `${real.length} sesiones, ${tuned} cuerdas afinadas, racha de ${this.streak()} día(s).${t}` + (w ? ` Cuerda más inestable: ${w.name}.` : '');
  }
}

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function normalize(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
