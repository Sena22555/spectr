import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export type Step =
  | { type: 'new'; en: string; ru: string; emoji: string | null }
  | { type: 'pick'; prompt: string; ask: string; options: { text: string; emoji: string | null }[]; answer: number; say: string | null }
  | { type: 'listen'; say: string; options: string[]; answer: number }
  | { type: 'build'; ru: string; tiles: string[]; answer: string[] }
  | { type: 'type'; ru: string; answers: string[] }
  | { type: 'fill'; sentence: string; options: string[]; answer: number; ru: string }
  | { type: 'match'; pairs: [string, string][] }
  | { type: 'rule'; title: string; rule: string[] };

export interface Lesson {
  id: string;
  n: number;
  title: string;
  unit: { id: string; title: string; ru: string; icon: string; hue: number };
  steps: Step[];
}

export interface CourseUnit {
  id: string;
  title: string;
  ru: string;
  level: string;
  grades: [number, number];
  icon: string;
  hue: number;
  grammar: string;
  words: number;
  lessons: { id: string; n: number; title: string; icon: string; done: boolean; perfect: boolean; open: boolean }[];
}

export function useCourse() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['english', user?.id ?? 'guest'],
    queryFn: () => api<{ units: CourseUnit[]; next: string | null; stats: { lessons: number; words: number; total: number } }>('/english/course'),
  });
}

// ——— озвучка: голос браузера, британский или американский ———
let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  const list = window.speechSynthesis?.getVoices() ?? [];
  voice = list.find((v) => v.lang === 'en-GB' && /female|google|samantha|serena|kate/i.test(v.name)) ?? list.find((v) => v.lang === 'en-GB') ?? list.find((v) => v.lang.startsWith('en')) ?? null;
}
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export function speak(text: string, slow = false) {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'en-GB';
    if (voice) u.voice = voice;
    u.rate = slow ? 0.6 : 0.92;
    window.speechSynthesis.speak(u);
  } catch {
    /* без звука тоже можно */
  }
}

// ——— проверка письменного ответа: без учёта регистра, знаков и сокращений ———
const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\b(\w+)n't\b/g, '$1 not'],
  [/\b(it|what|that|there|he|she)'s\b/g, '$1 is'],
  [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\b(i|you|we|they)'ve\b/g, '$1 have'],
  [/\b(i|you|we|they|he|she|it)'ll\b/g, '$1 will'],
  [/\blet's\b/g, 'let us'],
];
const SPELLING: [RegExp, string][] = [
  [/\b(favo|colo|neighbo|hono|behavio)ur/g, '$1r'],
  [/\bmum\b/g, 'mom'],
  [/\bgrey\b/g, 'gray'],
];

export function normalize(s: string) {
  let t = s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:"«»—–-]/g, ' ');
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  for (const [re, to] of SPELLING) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
}

function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length]![b.length]!;
}

/** Верно, опечатка (засчитываем, но показываем правильное написание) или «почти». */
export function checkTyped(given: string, answers: string[]): 'right' | 'typo' | 'almost' {
  const g = normalize(given);
  if (!g) return 'almost';
  for (const a of answers) if (normalize(a) === g) return 'right';
  for (const a of answers) {
    const n = normalize(a);
    if (n.length >= 5 && distance(n, g) <= (n.length >= 14 ? 2 : 1)) return 'typo';
  }
  return 'almost';
}
