import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { CourseUnit, Lesson, Step as LingoStep } from './english';

// «Игры Спектра»: СпектрLingo (английский) и МатИгра, ФизИгра, КодИгра.
// У всех игр одна тетрадь (главы и стикеры-уровни) и один экран игры — карточки, луч и печать.

export type GameKey = 'lingo' | 'math' | 'physics' | 'code';
export const GAME_KEYS: GameKey[] = ['lingo', 'math', 'physics', 'code'];

export const GAME_META: Record<GameKey, { name: [string, string]; subject: string; hue: number; icon: string }> = {
  lingo: { name: ['Спектр', 'Lingo'], subject: 'Английский', hue: 5, icon: '🇬🇧' },
  math: { name: ['Мат', 'Игра'], subject: 'Математика', hue: 1, icon: '🧮' },
  physics: { name: ['Физ', 'Игра'], subject: 'Физика', hue: 4, icon: '🔭' },
  code: { name: ['Код', 'Игра'], subject: 'Информатика', hue: 6, icon: '💻' },
};
export const isGame = (x: string): x is GameKey => (GAME_KEYS as string[]).includes(x);

export type HintSay = { t: string; v: string; sig: string };

export type GStep =
  | { type: 'cheat'; title: string; lines: string[] }
  | { type: 'solve'; text: string; unit: string | null; answer: number | string; tol: number | null; display: string; hint: string; explain: string[]; blitz: number | null; hintSay?: HintSay }
  | { type: 'choose'; text: string; options: string[]; answer: number; display: string; hint?: string; explain: string[]; blitz: number | null; hintSay?: HintSay }
  | { type: 'truefalse'; text: string; claim: string; truth: boolean; display: string; hint?: string; explain: string[]; hintSay?: HintSay }
  | { type: 'memory'; pairs: [string, string][] }
  | { type: 'order'; prompt: string; items: string[]; order: number[] };

export type AnyStep = GStep | LingoStep;

export interface PlayLevel {
  id: string;
  game: GameKey;
  chapter: { title: string; icon: string; hue: number; level?: string };
  level: { n: number; title: string };
  levels: number;
  steps: AnyStep[];
}

interface ServerLevel {
  id: string;
  game: { id: GameKey; name: string; hue: number };
  chapter: { id: string; title: string; icon: string; n: number };
  level: { n: number; title: string; icon: string };
  levels: number;
  steps: GStep[];
}

export interface GameMap {
  game?: { id: string; name: string; tagline: string; hue: number; icon: string };
  units: CourseUnit[];
  next: string | null;
  stats: { lessons: number; words: number; total: number };
  /** только у СпектрLingo: уровни и как на них идут дела */
  levels?: { id: string; title: string; about: string; units: number; done: number; accuracy: number | null; struggle: boolean; easy: boolean }[];
}

export const EN_LEVEL_KEY = 'spectr.enLevel';
export function savedEnLevel() {
  try {
    return localStorage.getItem(EN_LEVEL_KEY);
  } catch {
    return null;
  }
}
export function saveEnLevel(level: string) {
  try {
    localStorage.setItem(EN_LEVEL_KEY, level);
  } catch {
    /* ignore */
  }
}

export function useGameMap(game: GameKey) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['game-map', game, user?.id ?? 'guest'],
    queryFn: () => api<GameMap>(game === 'lingo' ? '/english/course' : `/games/${game}`),
  });
}

export interface HubGame {
  id: GameKey;
  name: string;
  subject: string;
  tagline: string;
  hue: number;
  icon: string;
  chapters: number;
  stickers: number;
  total: number;
}
export function useGamesHub() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['games-hub', user?.id ?? 'guest'], queryFn: () => api<{ games: HubGame[] }>('/games') });
}

export async function loadLevel(game: GameKey, id: string): Promise<PlayLevel> {
  if (game === 'lingo') {
    const l = await api<Lesson>(`/english/lesson/${id}`);
    return { id: l.id, game, chapter: { title: l.unit.title, icon: l.unit.icon, hue: l.unit.hue, level: l.unit.level }, level: { n: l.n, title: l.title }, levels: 4, steps: l.steps };
  }
  const l = await api<ServerLevel>(`/games/${game}/level/${id}`);
  return { id: l.id, game, chapter: { title: l.chapter.title, icon: l.chapter.icon, hue: (l.game.hue + l.chapter.n - 1) % 7 }, level: { n: l.level.n, title: l.level.title }, levels: l.levels, steps: l.steps };
}

export function saveResult(game: GameKey, levelId: string, total: number, mistakes: number, blitz: boolean) {
  return game === 'lingo'
    ? api<{ xp: number }>('/english/result', { method: 'POST', json: { lessonId: levelId, total, mistakes } })
    : api<{ xp: number }>('/games/result', { method: 'POST', json: { game, levelId, total, mistakes, blitz } });
}

/** Следующий уровень той же главы: «ab-2» → «ab-3», если такой есть. */
export function nextLevelId(id: string, levels: number) {
  const m = /^(.*)-(\d)$/.exec(id);
  if (!m || Number(m[2]) >= levels) return null;
  return `${m[1]}-${Number(m[2]) + 1}`;
}

/** Проверка ответа к задаче-генератору: та же логика, что на сервере (дроби, запятая, допуск). */
export function checkSolve(step: Extract<GStep, { type: 'solve' }>, raw: string) {
  if (typeof step.answer === 'string') {
    const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
    return norm(raw) === norm(step.answer);
  }
  const s = raw.trim().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(',', '.').replace(/[^0-9.\-+/eE]/g, '');
  let value: number;
  if (/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/.test(s)) {
    const [a, b] = s.split('/').map(Number);
    value = b ? a! / b! : NaN;
  } else value = s === '' ? NaN : Number(s);
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - step.answer) <= (step.tol ?? 1e-6);
}
