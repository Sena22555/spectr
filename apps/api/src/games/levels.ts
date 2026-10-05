import { genAnswerText, makeProblem } from '../practice/generators.js';
import { LEVELS, findLevel, type Chapter, type Game, type OrderKind } from './content.js';

// Сборка уровня игры: 8 карточек разных видов из генераторов главы.
// Ответы уходят в браузер — это тренировка; опыт за уровень сервер начисляет сам и с потолком.

export type GStep =
  | { type: 'cheat'; title: string; lines: string[] }
  | { type: 'solve'; text: string; unit: string | null; answer: number | string; tol: number | null; display: string; hint: string; explain: string[]; blitz: number | null }
  | { type: 'choose'; text: string; options: string[]; answer: number; display: string; hint: string; explain: string[]; blitz: number | null }
  | { type: 'truefalse'; text: string; claim: string; truth: boolean; display: string; hint: string; explain: string[] }
  | { type: 'memory'; pairs: [string, string][] }
  | { type: 'order'; prompt: string; items: string[]; order: number[] };

const rnd = (n: number) => Math.floor(Math.random() * n);
const seed = () => 1 + rnd(2_000_000_000);
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const comma = (x: number) => String(Number(x.toFixed(6))).replace('.', ',').replace('-', '−');

function problem(genId: string) {
  return makeProblem(genId, seed())!.problem;
}

/** Неверные, но правдоподобные ответы: ответы той же задачи с другими числами и «промахи на единицу». */
function distractors(genId: string, p: ReturnType<typeof problem>, n: number) {
  const right = genAnswerText(p);
  const out = new Set<string>();
  if (typeof p.answer === 'number' && Number.isInteger(p.answer) && !p.display) {
    const unit = p.unit ? ` ${p.unit}` : '';
    const a = p.answer;
    for (const v of shuffle([a + 1, a - 1, a + 10, a - 10, a * 2, a === 0 ? 1 : -a, Math.round(a / 2)])) {
      if (out.size >= Math.ceil(n / 2)) break;
      const t = `${comma(v)}${unit}`;
      if (t !== right) out.add(t);
    }
  }
  for (let i = 0; i < 30 && out.size < n; i++) {
    const t = genAnswerText(problem(genId));
    if (t !== right) out.add(t);
  }
  return [...out].slice(0, n);
}

function solve(genId: string, blitz: number | null = null): GStep {
  const p = problem(genId);
  return { type: 'solve', text: p.text, unit: p.unit ?? null, answer: p.answer, tol: p.tol ?? null, display: genAnswerText(p), hint: p.hint, explain: p.steps, blitz };
}

/** В выборе и «прав ли одноклассник» подсказка о формате ответа лишняя: «Ответ — дробью…». */
const noFormat = (text: string) => text.replace(/\s*Ответ[^.]*(дроб|десятичн|округл)[^.]*\./g, '').trim();

function choose(genId: string, blitz: number | null = null): GStep {
  const p = problem(genId);
  p.text = noFormat(p.text);
  const right = genAnswerText(p);
  const options = shuffle([right, ...distractors(genId, p, 3)]);
  return { type: 'choose', text: p.text, options, answer: options.indexOf(right), display: right, hint: p.hint, explain: p.steps, blitz };
}

function truefalse(genId: string): GStep {
  const p = problem(genId);
  p.text = noFormat(p.text);
  const right = genAnswerText(p);
  const truth = Math.random() < 0.5;
  const claim = truth ? right : (distractors(genId, p, 1)[0] ?? right);
  return { type: 'truefalse', text: p.text, claim, truth: claim === right, display: right, hint: p.hint, explain: p.steps };
}

function memory(ch: Chapter): GStep {
  return { type: 'memory', pairs: shuffle(ch.pairs).slice(0, 5) };
}

// ——— «Расставьте по возрастанию» ———
const SUP = (k: number) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]!);
const UNITS: Record<'length' | 'mass' | 'time' | 'speed' | 'bytes', [string, number][]> = {
  length: [
    ['мм', 0.001],
    ['см', 0.01],
    ['м', 1],
    ['км', 1000],
  ],
  mass: [
    ['г', 0.001],
    ['кг', 1],
    ['т', 1000],
  ],
  time: [
    ['с', 1],
    ['мин', 60],
    ['ч', 3600],
  ],
  speed: [
    ['м/с', 1],
    ['км/ч', 1 / 3.6],
  ],
  bytes: [
    ['бит', 1 / 8],
    ['байт', 1],
    ['Кбайт', 1024],
  ],
};
const NICE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 72, 90, 100, 120, 150, 200, 250, 300, 500, 600, 800, 1000, 1500, 2000, 3000, 5000];

function orderItem(kind: OrderKind): [string, number] {
  switch (kind) {
    case 'integers': {
      const v = rnd(999) + 1;
      return [String(v), v];
    }
    case 'negatives': {
      const v = rnd(41) - 20;
      return [comma(v), v];
    }
    case 'fractions': {
      const q = 2 + rnd(11);
      let p = 1 + rnd(q + 2);
      // только несократимые дроби: 4/8 выглядит как подвох
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      while (gcd(p, q) !== 1) p++;
      return [`${p}/${q}`, p / q];
    }
    case 'decimals': {
      const v = (1 + rnd(250)) / 100;
      return [comma(v), v];
    }
    case 'percents': {
      const v = (1 + rnd(19)) * 5;
      const form = rnd(3);
      return form === 0 ? [`${v}%`, v / 100] : form === 1 ? [comma(v / 100), v / 100] : [`${v}/100`, v / 100];
    }
    case 'powers': {
      const b = 2 + rnd(4);
      const e = 2 + rnd(4);
      return rnd(4) === 0 ? [`√${b * b}`, b] : [`${b}${SUP(e)}`, b ** e];
    }
    case 'binary': {
      const v = 3 + rnd(120);
      return [`${v.toString(2)}₂`, v];
    }
    default: {
      const table = UNITS[kind];
      const [unit, k] = table[rnd(table.length)]!;
      const v = NICE[rnd(NICE.length)]!;
      return [`${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${unit}`, v * k];
    }
  }
}

function order(kind: OrderKind): GStep {
  const items: [string, number][] = [];
  for (let i = 0; i < 60 && items.length < 4; i++) {
    const it = orderItem(kind);
    // значения и записи не должны совпадать, иначе порядок неоднозначен
    if (items.some(([t, v]) => t === it[0] || Math.abs(v - it[1]) < 1e-9)) continue;
    items.push(it);
  }
  const shown = shuffle(items);
  const sorted = [...shown.keys()].sort((a, b) => shown[a]![1] - shown[b]![1]);
  return { type: 'order', prompt: 'Расставьте по возрастанию — нажимайте от меньшего к большему', items: shown.map((x) => x[0]), order: sorted };
}

export function makeLevel(game: Game, id: string) {
  const f = findLevel(game, id);
  if (!f) return null;
  const { chapter: ch, level } = f;
  const gens = shuffle(ch.gens);
  const g = (i: number) => gens[i % gens.length]!;
  let steps: GStep[];
  if (level.n === 1) steps = [{ type: 'cheat', title: ch.title, lines: ch.cheat }, choose(g(0)), truefalse(g(1)), choose(g(2)), memory(ch), truefalse(g(3)), choose(g(4)), order(ch.order)];
  else if (level.n === 2) steps = [solve(g(0)), choose(g(1)), solve(g(2)), truefalse(g(3)), order(ch.order), solve(g(4)), memory(ch), choose(g(5), 25)];
  else steps = [solve(g(0)), solve(g(1)), truefalse(g(2)), solve(g(3)), order(ch.order), solve(g(4)), solve(g(5)), solve(g(6), 45)];
  const ci = game.chapters.indexOf(ch);
  return {
    id,
    game: { id: game.id, name: game.name, hue: game.hue },
    chapter: { id: ch.id, title: ch.title, icon: ch.icon, n: ci + 1 },
    level: { n: level.n, title: level.title, icon: level.icon },
    levels: LEVELS.length,
    steps,
  };
}
