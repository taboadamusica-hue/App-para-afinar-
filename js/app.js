import { Brain } from './brain.js';

const KEY = 'mi-ia-v1';
const $ = (s) => document.querySelector(s);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
const saved = load();
let brain = new Brain(saved.brain);
let chat = saved.chat || [];
let pending = null;      // { type: 'teach', question }
let lastAnswered = null; // { item, question }

function save() {
  chat = chat.slice(-150);
  try { localStorage.setItem(KEY, JSON.stringify({ brain: brain.data, chat })); }
  catch { /* sin almacenamiento: sigue funcionando hasta cerrar */ }
}

// ---------------- chat ----------------
const log = $('#log');

function bubble(msg, withFeedback = false) {
  const el = document.createElement('div');
  el.className = `msg ${msg.from}`;
  const p = document.createElement('p');
  p.textContent = msg.text;
  el.appendChild(p);
  if (msg.suggestion) {
    const fb = document.createElement('div');
    fb.className = 'feedback';
    const yes = Object.assign(document.createElement('button'), { textContent: `¿Te referías a «${msg.suggestion.item.questions[0].slice(0, 60)}»?` });
    yes.onclick = () => { fb.remove(); acceptSuggestion(msg.suggestion); };
    fb.append(yes);
    el.appendChild(fb);
  }
  if (withFeedback) {
    const fb = document.createElement('div');
    fb.className = 'feedback';
    const up = Object.assign(document.createElement('button'), { textContent: '👍', title: 'Buena respuesta' });
    const down = Object.assign(document.createElement('button'), { textContent: '👎', title: 'Corregir respuesta' });
    up.onclick = () => { fb.remove(); goodAnswer(msg.ctx); };
    down.onclick = () => { fb.remove(); badAnswer(msg.ctx); };
    fb.append(up, down);
    el.appendChild(fb);
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function aiSay(text, ctx, suggestion) {
  const msg = { from: 'ia', text, t: Date.now() };
  chat.push(msg);
  save();
  bubble({ ...msg, ctx, suggestion }, !!ctx);
}

function acceptSuggestion({ item, question }) {
  pending = null;
  brain.addQuestion(item, question);
  save(); renderItems();
  lastAnswered = { item, question };
  const answer = item.answers[Math.floor(Math.random() * item.answers.length)];
  aiSay(brain.fill(answer), { item, question, answer });
}

function userSay(text) {
  const msg = { from: 'user', text, t: Date.now() };
  chat.push(msg);
  bubble(msg);
}

function goodAnswer({ item, question }) {
  brain.reward(item);
  brain.addQuestion(item, question); // aprende esta forma de preguntarlo
  save();
  renderItems();
}

function badAnswer({ item, question, answer }) {
  pending = { type: 'teach', question, wrong: { item, answer } };
  aiSay('Vale, corrígeme: ¿qué debería haber respondido? (o /saltar)');
}

const HELP = `Comandos:
/aprende pregunta = respuesta → me enseñas algo al momento
   (varias respuestas: /aprende hola = ¡Hola! --- ¡Buenas!)
/olvida → olvido lo último que respondí
/saltar → cancelo lo que te estaba preguntando
/ayuda → esta ayuda
También puedes valorar mis respuestas con 👍 o 👎 para que aprenda.`;

function handle(text) {
  userSay(text);
  const cmd = text.trim();
  if (cmd.startsWith('/')) pending = null;

  if (/^\/ayuda/i.test(cmd)) return aiSay(HELP);
  if (/^\/saltar/i.test(cmd)) { pending = null; return aiSay('Hecho, lo dejamos.'); }
  if (/^\/olvida/i.test(cmd)) {
    if (!lastAnswered) return aiSay('No hay nada reciente que olvidar.');
    brain.remove(lastAnswered.item.id);
    lastAnswered = null;
    save(); renderItems();
    return aiSay('Olvidado.');
  }
  const learn = cmd.match(/^\/aprende\s+(.+?)\s*=\s*([\s\S]+)$/i);
  if (learn) {
    brain.teach(learn[1], learn[2].split(/\s+-{3,}\s+/), 'chat');
    save(); renderItems();
    return aiSay('Aprendido ✅');
  }
  if (cmd.startsWith('/')) return aiSay('No conozco ese comando. Escribe /ayuda.');

  // Si estaba esperando una respuesta pero escribes algo que ya sé, respondo
  if (pending?.type === 'teach' && !(brain.search(text, 1)[0]?.score >= 0.75)) {
    if (pending.wrong) brain.correct(pending.question, pending.wrong, text);
    else brain.teach(pending.question, text, 'chat');
    pending = null;
    save(); renderItems();
    return aiSay('¡Gracias! Lo he aprendido. Pregúntamelo cuando quieras.');
  }

  const r = brain.reply(text);
  if (r.known) {
    lastAnswered = { item: r.item, question: text };
    aiSay(r.text, { item: r.item, question: text, answer: r.answer });
  } else {
    pending = { type: 'teach', question: text };
    aiSay(r.text, null, r.suggestion ? { item: r.suggestion, question: text } : null);
  }
}

$('#send').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#msg').value.trim();
  if (!v) return;
  $('#msg').value = '';
  handle(v);
});

function renderChat() {
  log.innerHTML = '';
  if (!chat.length) aiSay(brain.fill(brain.data.personality.greeting));
  else chat.forEach((m) => bubble(m));
}

// ---------------- pestañas ----------------
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
  $('#chat').hidden = b.dataset.tab !== 'chat';
  $('#train').hidden = b.dataset.tab !== 'train';
  if (b.dataset.tab === 'chat') $('#msg').focus();
}));

// ---------------- entrenamiento ----------------
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const answersOf = (s) => s.split(/\n\s*-{3,}\s*\n/).map((x) => x.trim()).filter(Boolean);

$('#teachForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (brain.teach(lines($('#tQuestions').value), answersOf($('#tAnswers').value))) {
    e.target.reset();
    save(); renderItems();
    flash(e.target, 'Aprendido ✅');
  }
});

$('#textForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let n = 0;
  const title = $('#xTitle').value.trim();
  if ($('#xText').value.trim()) n += brain.teachText($('#xText').value, title);
  for (const f of $('#xFile').files) n += brain.teachText(await f.text(), title || f.name.replace(/\.\w+$/, ''));
  e.target.reset();
  save(); renderItems();
  flash(e.target, n ? `Aprendidos ${n} fragmentos ✅` : 'No encontré texto suficiente.');
});

function fillPersonality() {
  const p = brain.data.personality;
  $('#pName').value = p.name;
  $('#pGreeting').value = p.greeting;
  $('#pUnknown').value = p.unknown;
  $('#pThreshold').value = p.threshold;
  thresholdLabel();
  $('#title').textContent = p.name;
  document.title = p.name;
}
function thresholdLabel() {
  const v = Number($('#pThreshold').value);
  $('#pThresholdLabel').textContent = v < 0.25 ? 'Atrevida: responde aunque no esté segura' : v > 0.45 ? 'Estricta: solo si está muy segura' : 'Equilibrada';
}
$('#pThreshold').addEventListener('input', thresholdLabel);
$('#persForm').addEventListener('submit', (e) => {
  e.preventDefault();
  Object.assign(brain.data.personality, {
    name: $('#pName').value.trim() || 'Mi IA',
    greeting: $('#pGreeting').value.trim() || Brain.empty().personality.greeting,
    unknown: $('#pUnknown').value.trim() || Brain.empty().personality.unknown,
    threshold: Number($('#pThreshold').value),
  });
  save(); fillPersonality();
  flash(e.target, 'Guardado ✅');
});

function flash(form, text) {
  let n = form.querySelector('.flash');
  if (!n) { n = document.createElement('p'); n.className = 'flash'; form.appendChild(n); }
  n.textContent = text;
  setTimeout(() => n.remove(), 2500);
}

// ---------------- lista de conocimiento ----------------
function renderItems() {
  const q = $('#filter').value.toLowerCase();
  const list = $('#items');
  list.innerHTML = '';
  const items = [...brain.data.items].reverse()
    .filter((i) => !q || (i.questions.join(' ') + ' ' + i.answers.join(' ')).toLowerCase().includes(q));
  $('#count').textContent = `(${brain.data.items.length})`;
  if (!items.length) {
    list.innerHTML = `<li class="empty">${q ? 'Nada coincide con la búsqueda.' : 'Aún no sabe nada. Enséñale algo arriba o desde el chat.'}</li>`;
    return;
  }
  for (const item of items.slice(0, 300)) {
    const li = document.createElement('li');
    const view = () => {
      li.innerHTML = '';
      const qEl = document.createElement('div'); qEl.className = 'q';
      qEl.textContent = item.source === 'texto' ? '📄 Fragmento de texto' : item.questions.join(' · ');
      const aEl = document.createElement('div'); aEl.className = 'a';
      aEl.textContent = item.answers.join('  |  ');
      const actions = document.createElement('div'); actions.className = 'actions';
      const meta = document.createElement('small');
      meta.textContent = `${item.hits ? `👍 ${item.hits} · ` : ''}${item.questions.length} forma(s)`;
      const ed = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Editar' });
      const del = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Borrar', className: 'danger' });
      ed.onclick = edit;
      del.onclick = () => { brain.remove(item.id); save(); renderItems(); };
      actions.append(meta, ed, del);
      li.append(qEl, aEl, actions);
    };
    const edit = () => {
      li.innerHTML = '';
      const qs = Object.assign(document.createElement('textarea'), { rows: 3, value: item.questions.join('\n') });
      const as = Object.assign(document.createElement('textarea'), { rows: 3, value: item.answers.join('\n---\n') });
      const ok = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Guardar', className: 'primary' });
      const cancel = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancelar' });
      ok.onclick = () => {
        const nq = lines(qs.value), na = answersOf(as.value);
        if (!nq.length || !na.length) return;
        brain.update(item.id, { questions: nq, answers: na });
        save(); renderItems();
      };
      cancel.onclick = view;
      const actions = document.createElement('div'); actions.className = 'actions';
      actions.append(cancel, ok);
      li.append(label('Preguntas (una por línea)', qs), label('Respuestas (separadas con ---)', as), actions);
    };
    view();
    list.appendChild(li);
  }
}
function label(text, el) {
  const l = document.createElement('label');
  l.append(text, el);
  return l;
}
$('#filter').addEventListener('input', renderItems);

// ---------------- copias de seguridad ----------------
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(brain.data, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${brain.data.personality.name}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#import').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.items)) throw new Error();
    const replace = confirm('¿Reemplazar todo lo que sabe ahora? (Cancelar = añadirlo a lo que ya sabe)');
    if (replace) brain = new Brain({ ...Brain.empty(), ...data, personality: { ...Brain.empty().personality, ...data.personality } });
    else data.items.forEach((i) => brain.teach(i.questions, i.answers, i.source));
    save(); renderItems(); fillPersonality();
    alert('Importado ✅');
  } catch { alert('Ese archivo no es una copia válida.'); }
  e.target.value = '';
});
$('#clearChat').addEventListener('click', () => { chat = []; pending = null; save(); renderChat(); });
$('#wipe').addEventListener('click', () => {
  if (!confirm('¿Borrar todo lo que ha aprendido y el chat? No se puede deshacer.')) return;
  brain = new Brain(); chat = []; pending = null; lastAnswered = null;
  save(); renderItems(); fillPersonality(); renderChat();
});

fillPersonality();
renderItems();
renderChat();
