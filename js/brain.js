// "Cerebro" de la IA: aprende de lo que le enseñas y responde buscando lo más
// parecido. Todo ocurre en el navegador; no hay red ni servicios externos.

const STOP = new Set(('a al algo como cual cuales cuando cuanto cuanta donde quien quienes algun alguna algunas alguno algunos ante con contra de del desde donde durante e el ella ellas ellos en entre era eres es esa esas ese eso esos esta estas este esto estos estoy fue ha han has hay he la las le les lo los me mi mis muy nos o os para pero por que se ser si sin sobre son su sus te ti tu tus un una unas uno unos y ya yo').split(' '));

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stem(w) {
  if (w.length > 5) w = w.replace(/(mente|ciones|cion|idades|idad)$/, '');
  if (w.length > 4) w = w.replace(/(es|s)$/, '');
  if (w.length > 4) w = w.replace(/[aeo]$/, '');
  return w;
}

export function tokens(s) {
  const all = normalize(s).split(' ').filter(Boolean);
  const content = all.filter((w) => !STOP.has(w));
  return (content.length ? content : all).map(stem);
}

function trigrams(s) {
  const t = ` ${normalize(s)} `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class Brain {
  constructor(data) {
    this.data = data || Brain.empty();
    this.reindex();
  }

  static empty() {
    return {
      version: 1,
      personality: {
        name: 'Mi IA',
        greeting: '¡Hola! Soy tu IA. Todavía no sé casi nada: enséñame en la pestaña «Entrenar» o escribiendo /aprende pregunta = respuesta.',
        unknown: 'No sé responder a eso todavía. ¿Qué debería contestar? Escríbelo y lo aprenderé (o escribe /saltar).',
        threshold: 0.28,
      },
      items: [], // { id, questions: [], answers: [], source, hits, created }
    };
  }

  reindex() {
    this.entries = [];
    const df = new Map();
    for (const item of this.data.items) {
      for (const q of item.questions) {
        const tk = tokens(q);
        const tf = new Map();
        tk.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
        new Set(tk).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
        this.entries.push({ item, tf, tri: trigrams(q), len: tk.length });
      }
    }
    this.df = df;
    this.N = this.entries.length;
    for (const e of this.entries) e.vec = this.vec(e.tf);
  }

  idf(t) { return Math.log(1 + (this.N + 1) / ((this.df.get(t) || 0) + 1)); }

  vec(tf) {
    const v = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * this.idf(t);
      v.set(t, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  }

  // Devuelve las mejores coincidencias para un mensaje.
  search(text, limit = 3) {
    const qtf = new Map();
    tokens(text).forEach((t) => qtf.set(t, (qtf.get(t) || 0) + 1));
    const q = this.vec(qtf);
    const qtri = trigrams(text);
    const best = new Map();
    for (const e of this.entries) {
      const d = e.vec;
      let dot = 0;
      for (const [t, w] of q.v) if (d.v.has(t)) dot += w * d.v.get(t);
      const cos = dot / (q.norm * d.norm);
      const fuzzy = jaccard(qtri, e.tri);
      const bonus = Math.min(0.05, (e.item.hits || 0) * 0.005);
      const score = 0.65 * cos + 0.35 * fuzzy + bonus;
      const prev = best.get(e.item.id);
      if (!prev || score > prev.score) best.set(e.item.id, { item: e.item, score });
    }
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  reply(text) {
    const [top] = this.search(text, 1);
    if (!top || top.score < this.data.personality.threshold) {
      const suggestion = top && top.score >= 0.12 ? top.item : null;
      return { known: false, text: this.fill(this.data.personality.unknown), suggestion };
    }
    const answers = top.item.answers;
    const answer = answers[Math.floor(Math.random() * answers.length)];
    return { known: true, item: top.item, score: top.score, answer, text: this.fill(answer) };
  }

  fill(s) {
    const now = new Date();
    return s
      .replace(/\{nombre\}/g, this.data.personality.name)
      .replace(/\{hora\}/g, now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))
      .replace(/\{fecha\}/g, now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  // ---- entrenamiento ----
  teach(questions, answers, source = 'manual') {
    const qs = [].concat(questions).map((s) => s.trim()).filter(Boolean);
    const as = [].concat(answers).map((s) => s.trim()).filter(Boolean);
    if (!qs.length || !as.length) return null;
    // Si ya existe una pregunta idéntica, amplía ese conocimiento
    const key = new Set(qs.map(normalize));
    const existing = this.data.items.find((i) => i.questions.some((q) => key.has(normalize(q))));
    if (existing) {
      qs.forEach((q) => { if (!existing.questions.some((x) => normalize(x) === normalize(q))) existing.questions.push(q); });
      as.forEach((a) => { if (!existing.answers.includes(a)) existing.answers.push(a); });
      this.reindex();
      return existing;
    }
    const item = { id: uid(), questions: qs, answers: as, source, hits: 0, created: Date.now() };
    this.data.items.push(item);
    this.reindex();
    return item;
  }

  // Aprende de un texto largo: cada fragmento se convierte en conocimiento.
  teachText(text, title = '') {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 15);
    const chunks = [];
    for (const p of paragraphs) {
      const sentences = p.match(/[^.!?¡¿]+[.!?]*/g) || [p];
      let buf = '';
      for (const s of sentences) {
        if ((buf + s).length > 320 && buf) { chunks.push(buf.trim()); buf = ''; }
        buf += s;
      }
      if (buf.trim()) chunks.push(buf.trim());
    }
    // Cada frase sirve para encontrar el fragmento; la respuesta es el fragmento entero
    chunks.forEach((c) => {
      const sentences = (c.match(/[^.!?]+[.!?]*/g) || [c]).map((x) => x.trim()).filter((x) => x.length > 3);
      const questions = sentences.map((x) => (title ? `${title}: ${x}` : x));
      this.data.items.push({ id: uid(), questions, answers: [c], source: 'texto', hits: 0, created: Date.now() });
    });
    this.reindex();
    return chunks.length;
  }

  addQuestion(item, question) {
    if (!item.questions.some((q) => normalize(q) === normalize(question))) item.questions.push(question.trim());
    this.reindex();
  }

  // Corrige una respuesta equivocada: sustituye la respuesta dada o crea
  // conocimiento nuevo si la pregunta encajó por error con otra cosa.
  correct(question, wrong, newAnswer) {
    const item = this.data.items.find((i) => i.id === wrong.item.id);
    if (item && item.questions.some((q) => normalize(q) === normalize(question))) {
      const idx = item.answers.indexOf(wrong.answer);
      if (idx >= 0) item.answers[idx] = newAnswer.trim(); else item.answers.push(newAnswer.trim());
      this.reindex();
      return item;
    }
    return this.teach(question, newAnswer, 'chat');
  }

  reward(item) { item.hits = (item.hits || 0) + 1; }

  update(id, { questions, answers }) {
    const item = this.data.items.find((i) => i.id === id);
    if (!item) return;
    item.questions = questions.filter(Boolean);
    item.answers = answers.filter(Boolean);
    this.reindex();
  }

  remove(id) {
    this.data.items = this.data.items.filter((i) => i.id !== id);
    this.reindex();
  }
}
