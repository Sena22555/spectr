import { UNITS, findLesson, splitHint, type Gap, type Phrase, type Unit, type Word } from './content.js';

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
  | { type: 'rule'; title: string; rule: string[] }
  | { type: 'spot'; words: string[]; wrong: number; fix: string; ru: string; hint: string | null }
  /** «Скажи вслух»: браузер распознаёт речь и сверяет (если микрофона нет — шаг пропускается) */
  | { type: 'say'; text: string; ru: string };

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

function wordsLesson(unit: Unit, from: number, count: number, review: Word[]): Step[] {
  const group = unit.words.slice(from, from + count);
  const pool = unit.words;
  const steps: Step[] = [];
  // по два новых слова: карточки-словарики, затем сразу проверка
  for (let i = 0; i < group.length; i += 2) {
    const pair = group.slice(i, i + 2);
    for (const w of pair) steps.push({ type: 'new', en: w[0], ru: w[1], emoji: w[2] ?? null });
    steps.push(pickRuEn(pair[0]!, pool));
    if (pair[1]) steps.push(pickEnRu(pair[1], pool));
  }
  for (const w of sample(group, 2)) steps.push(listenWord(w, pool));
  steps.push({ type: 'match', pairs: sample(group, 5).map((w) => [w[0], w[1]]) });
  for (const w of sample(review, 3)) steps.push(Math.random() < 0.5 ? pickEnRu(w, pool) : pickRuEn(w, pool));
  for (const w of sample(
    group.filter((w) => w[0].length <= 12),
    2,
  ))
    steps.push(typeWord(w));
  return steps;
}

function phrasesLesson(unit: Unit): Step[] {
  const ph = shuffle(unit.phrases);
  const steps: Step[] = [];
  for (const p of ph.slice(0, 6)) steps.push(build(p, unit));
  for (const p of ph.slice(6, 8)) {
    const { all, answer } = options(p[0], unit.phrases.map((x) => x[0]), 3);
    steps.push({ type: 'listen', say: p[0], options: all, answer });
  }
  const p = ph[8]!;
  const { all, answer } = options(p[1], unit.phrases.map((x) => x[1]), 3);
  steps.push({ type: 'pick', prompt: 'Выберите перевод', ask: p[0], options: all.map((t) => ({ text: t, emoji: null })), answer, say: p[0] });
  for (const q of sample(
    unit.phrases.filter((x) => words(x[0]).length <= 5),
    2,
  ))
    steps.push(typePhrase(q));
  for (const q of sample(
    unit.phrases.filter((x) => words(x[0]).length <= 8),
    2,
  ))
    steps.push({ type: 'say', text: q[0], ru: q[1] });
  return steps;
}

function fill(g: Gap): Step {
  const right = g[1][g[2]]!;
  const opts = shuffle(g[1]);
  const { text, hint } = splitHint(g[0]);
  return { type: 'fill', sentence: text, options: opts, answer: opts.indexOf(right), ru: hint ? `${g[3]} (${hint})` : g[3] };
}

/** «Найди ошибку»: в предложение подставлен неверный вариант — нужно нажать на лишнее слово. */
function spot(g: Gap): Step | null {
  const { text, hint } = splitHint(g[0]);
  const wrongs = g[1].filter((o, i) => i !== g[2] && !/\s/.test(o) && o !== '—');
  if (!wrongs.length || /\s/.test(g[1][g[2]]!)) return null;
  const bad = wrongs[Math.floor(Math.random() * wrongs.length)]!;
  const [before] = text.split('___');
  const words = text.replace('___', bad).split(/\s+/).filter(Boolean);
  const wrong = before!.split(/\s+/).filter(Boolean).length;
  if (!words[wrong]?.startsWith(bad)) return null;
  return { type: 'spot', words, wrong, fix: g[1][g[2]]!, ru: g[3], hint };
}
const spots = (gaps: Gap[], n: number) => shuffle(gaps).map(spot).filter((x): x is Step => x !== null).slice(0, n);

function grammarLesson(unit: Unit): Step[] {
  const gaps = shuffle(unit.grammar.gaps);
  const steps: Step[] = [{ type: 'rule', title: unit.grammar.title, rule: unit.grammar.rule }];
  for (const g of gaps.slice(0, 8)) steps.push(fill(g));
  steps.push(...spots(gaps.slice(8), 2));
  if (steps.length < 11) steps.push(...spots(gaps.slice(0, 8), 11 - steps.length));
  for (const p of sample(unit.phrases, 2)) steps.push(build(p, unit));
  return steps;
}

/** Контрольная по разделу: всё вперемешку — слова, на слух, грамматика, фразы. */
function reviewLesson(unit: Unit): Step[] {
  const pool = unit.words;
  const steps: Step[] = [];
  const ws = sample(pool, 8);
  ws.slice(0, 3).forEach((w) => steps.push(pickRuEn(w, pool)));
  ws.slice(3, 6).forEach((w) => steps.push(pickEnRu(w, pool)));
  ws.slice(6, 8).forEach((w) => steps.push(listenWord(w, pool)));
  sample(unit.grammar.gaps, 3).forEach((g) => steps.push(fill(g)));
  steps.push(...spots(unit.grammar.gaps, 2));
  sample(unit.phrases, 2).forEach((p) => steps.push(build(p, unit)));
  const short = unit.phrases.filter((x) => words(x[0]).length <= 6);
  if (short.length) steps.push(typePhrase(sample(short, 1)[0]!));
  if (short.length) steps.push({ type: 'say', text: sample(short, 1)[0]![0], ru: '' });
  steps.push({ type: 'match', pairs: sample(pool, 5).map((w) => [w[0], w[1]]) });
  return shuffle(steps.slice(0, -1)).concat(steps.slice(-1));
}

export function makeLesson(id: string) {
  const f = findLesson(id);
  if (!f) return null;
  const { unit, lesson } = f;
  const steps =
    lesson.kind === 'words1'
      ? wordsLesson(unit, 0, 7, [])
      : lesson.kind === 'words2'
        ? wordsLesson(unit, 7, 7, unit.words.slice(0, 7))
        : lesson.kind === 'words3'
          ? wordsLesson(unit, 14, 6, unit.words.slice(0, 14))
          : lesson.kind === 'phrases'
            ? phrasesLesson(unit)
            : lesson.kind === 'grammar'
              ? grammarLesson(unit)
              : reviewLesson(unit);
  const hue = UNITS.indexOf(unit) % 7;
  return { id, n: lesson.n, title: lesson.title, unit: { id: unit.id, title: unit.title, ru: unit.ru, icon: unit.icon, hue, level: unit.level }, steps };
}
