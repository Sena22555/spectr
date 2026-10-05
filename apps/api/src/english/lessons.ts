import { UNITS, findLesson, type Phrase, type Unit, type Word } from './content.js';

// Генератор уроков «пути»: из слов, фраз и грамматики раздела собирает 12–18 шагов разных типов,
// как в приложениях для изучения языков. Проверка ответов — на клиенте (это тренировка, а не экзамен).

export type Step =
  | { type: 'new'; en: string; ru: string; emoji: string | null }
  | { type: 'pick'; prompt: string; ask: string; options: { text: string; emoji: string | null }[]; answer: number; say: string | null }
  | { type: 'listen'; say: string; options: string[]; answer: number }
  | { type: 'build'; ru: string; tiles: string[]; answer: string[] }
  | { type: 'type'; ru: string; answers: string[] }
  | { type: 'fill'; sentence: string; options: string[]; answer: number; ru: string }
  | { type: 'match'; pairs: [string, string][] }
  | { type: 'rule'; title: string; rule: string[] };

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const sample = <T>(list: T[], n: number) => shuffle(list).slice(0, n);

/** Варианты: верный + отвлекающие, перемешанные. */
function options<T>(right: T, pool: T[], n = 4, same = (a: T, b: T) => a === b) {
  const wrong = sample(
    pool.filter((p) => !same(p, right)),
    n - 1,
  );
  const all = shuffle([right, ...wrong]);
  return { all, answer: all.findIndex((x) => same(x, right)) };
}

const words = (s: string) =>
  s
    .replace(/[.,!?]/g, '')
    .split(/\s+/)
    .filter(Boolean);

function pickRuEn(w: Word, pool: Word[]): Step {
  // если у всех вариантов есть картинка — карточки с картинками
  const withPics = pool.filter((p) => p[2]);
  const pictures = Boolean(w[2]) && withPics.length >= 4;
  const { all, answer } = options(w, pictures ? withPics : pool, 4, (a, b) => a[0] === b[0]);
  return { type: 'pick', prompt: pictures ? 'Что из этого' : 'Как сказать по-английски', ask: w[1], options: all.map((x) => ({ text: x[0], emoji: pictures ? (x[2] ?? null) : null })), answer, say: null };
}

function pickEnRu(w: Word, pool: Word[]): Step {
  const { all, answer } = options(w, pool, 4, (a, b) => a[0] === b[0]);
  return { type: 'pick', prompt: 'Выберите перевод', ask: w[0], options: all.map((x) => ({ text: x[1], emoji: null })), answer, say: w[0] };
}

function listenWord(w: Word, pool: Word[]): Step {
  const { all, answer } = options(w[0], pool.map((p) => p[0]), 4);
  return { type: 'listen', say: w[0], options: all, answer };
}

function build(p: Phrase, unit: Unit): Step {
  const answer = words(p[0]);
  const lower = new Set(answer.map((x) => x.toLowerCase()));
  const extra = sample(
    [...new Set(unit.phrases.flatMap((x) => words(x[0])).map((x) => x.toLowerCase()))].filter((x) => !lower.has(x) && x !== 'i'),
    answer.length > 6 ? 2 : 3,
  );
  return { type: 'build', ru: p[1], tiles: shuffle([...answer, ...extra]), answer };
}

const typeWord = (w: Word): Step => ({ type: 'type', ru: w[1], answers: [w[0]] });
const typePhrase = (p: Phrase): Step => ({ type: 'type', ru: p[1], answers: [p[0]] });

function wordsLesson(unit: Unit, from: number, review: Word[]): Step[] {
  const group = unit.words.slice(from, from + 6);
  const pool = unit.words;
  const steps: Step[] = [];
  for (let i = 0; i < group.length; i += 2) {
    const [a, b] = [group[i]!, group[i + 1]!];
    steps.push({ type: 'new', en: a[0], ru: a[1], emoji: a[2] ?? null }, { type: 'new', en: b[0], ru: b[1], emoji: b[2] ?? null });
    steps.push(pickRuEn(a, pool), pickEnRu(b, pool));
  }
  for (const w of sample(group, 2)) steps.push(listenWord(w, pool));
  steps.push({ type: 'match', pairs: sample(group, 5).map((w) => [w[0], w[1]]) });
  for (const w of sample(review, 2)) steps.push(Math.random() < 0.5 ? pickEnRu(w, pool) : pickRuEn(w, pool));
  for (const w of sample(
    group.filter((w) => w[0].length <= 10),
    2,
  ))
    steps.push(typeWord(w));
  return steps;
}

function phrasesLesson(unit: Unit): Step[] {
  const ph = shuffle(unit.phrases);
  const steps: Step[] = [];
  for (const p of ph.slice(0, 5)) steps.push(build(p, unit));
  for (const p of ph.slice(5, 7)) {
    const { all, answer } = options(p[0], unit.phrases.map((x) => x[0]), 3);
    steps.push({ type: 'listen', say: p[0], options: all, answer });
  }
  const p = ph[7]!;
  const { all, answer } = options(p[1], unit.phrases.map((x) => x[1]), 3);
  steps.push({ type: 'pick', prompt: 'Выберите перевод', ask: p[0], options: all.map((t) => ({ text: t, emoji: null })), answer, say: p[0] });
  for (const q of sample(
    unit.phrases.filter((x) => words(x[0]).length <= 5),
    2,
  ))
    steps.push(typePhrase(q));
  return steps;
}

function grammarLesson(unit: Unit): Step[] {
  const steps: Step[] = [{ type: 'rule', title: unit.grammar.title, rule: unit.grammar.rule }];
  for (const g of shuffle(unit.grammar.gaps)) {
    const right = g[1][g[2]]!;
    const opts = shuffle(g[1]);
    steps.push({ type: 'fill', sentence: g[0], options: opts, answer: opts.indexOf(right), ru: g[3] });
  }
  for (const p of sample(unit.phrases, 2)) steps.push(build(p, unit));
  return steps;
}

export function makeLesson(id: string) {
  const f = findLesson(id);
  if (!f) return null;
  const { unit, lesson } = f;
  const steps =
    lesson.kind === 'words1'
      ? wordsLesson(unit, 0, unit.words.slice(0, 6))
      : lesson.kind === 'words2'
        ? wordsLesson(unit, 6, unit.words.slice(0, 6))
        : lesson.kind === 'phrases'
          ? phrasesLesson(unit)
          : grammarLesson(unit);
  const hue = UNITS.indexOf(unit) % 7;
  return { id, n: lesson.n, title: lesson.title, unit: { id: unit.id, title: unit.title, ru: unit.ru, icon: unit.icon, hue }, steps };
}
