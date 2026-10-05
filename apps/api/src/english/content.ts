import type { Gap, Level, Unit } from './types.js';
import { STARTER } from './units/starter.js';
import { A1 } from './units/a1.js';
import { A2 } from './units/a2.js';
import { B1 } from './units/b1.js';
import { CAFE, CLASSROOM, HOTEL, MAYBE, OBJECTS, OPINION, QUESTIONS } from './units/extra.js';

export type { Gap, Level, Phrase, Unit, Word } from './types.js';

/** вставить разделы после раздела с указанным id */
function after(list: Unit[], id: string, ...add: Unit[]) {
  const i = list.findIndex((u) => u.id === id);
  return [...list.slice(0, i + 1), ...add, ...list.slice(i + 1)];
}

// «СпектрLingo»: 46 разделов от нуля до B1 (920 слов) по программе English File, Face2Face и Speakout.
// В разделе 20 слов, 10 фраз, грамматика с правилом и 10 заданиями. «Ситуации» — живые диалоги.
export const UNITS: Unit[] = [
  ...STARTER,
  CLASSROOM,
  ...after(A1, 'people', QUESTIONS),
  CAFE,
  ...after(after(A2, 'stories', OBJECTS), 'future', MAYBE),
  HOTEL,
  ...B1,
  OPINION,
];

export const LEVELS: { id: Level; title: string; about: string }[] = [
  { id: 'Starter', title: 'С нуля', about: 'Буквы уже знакомы, но слов почти нет: привет, цвета, числа, семья, «я умею».' },
  { id: 'A1', title: 'A1 · начальный', about: 'Глагол to be, there is, Present Simple и Continuous, сравнения. Можно рассказать о себе.' },
  { id: 'A2', title: 'A2 · базовый', about: 'Прошедшее время, планы и будущее, советы и правила. Можно рассказать историю.' },
  { id: 'B1', title: 'B1 · средний', about: 'Present Perfect, условные, пассив, косвенная речь, словообразование — уровень ОГЭ и база ЕГЭ.' },
];

export const LESSONS = [
  { n: 1, kind: 'words1', title: 'Словарик', icon: 'sparkles' },
  { n: 2, kind: 'words2', title: 'Словарик 2', icon: 'book' },
  { n: 3, kind: 'words3', title: 'Словарик 3', icon: 'book' },
  { n: 4, kind: 'phrases', title: 'Фразы', icon: 'message' },
  { n: 5, kind: 'grammar', title: 'Грамматика', icon: 'puzzle' },
  { n: 6, kind: 'review', title: 'Контрольная', icon: 'star' },
] as const;

export const lessonId = (unit: string, n: number) => `${unit}-${n}`;
export function findLesson(id: string) {
  const m = /^([a-z0-9]+)-([1-6])$/.exec(id);
  if (!m) return null;
  const unit = UNITS.find((u) => u.id === m[1]);
  const lesson = LESSONS.find((l) => l.n === Number(m[2]));
  return unit && lesson ? { unit, lesson } : null;
}

/** «___ is my pen. (у меня в руке)» → текст без подсказки в скобках и сама подсказка. */
export function splitHint(sentence: string) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(sentence);
  return m ? { text: m[1]!, hint: m[2]! } : { text: sentence, hint: null };
}
export const fillGap = (g: Gap) => splitHint(g[0]).text.replace('___', g[1][g[2]]!);

let texts: Set<string> | null = null;
/** Все английские тексты курса — только их можно озвучивать. */
export function englishTexts() {
  if (texts) return texts;
  texts = new Set<string>();
  for (const u of UNITS) {
    for (const w of u.words) texts.add(w[0]);
    for (const p of u.phrases) texts.add(p[0]);
    for (const g of u.grammar.gaps) texts.add(fillGap(g));
  }
  return texts;
}
