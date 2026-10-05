import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';
import { useAuth } from './auth';

// Игровой слой практикума: опыт, уровни-цвета спектра, цель дня, звуки.
// Опыт считает сервер (15 за задачу с первой попытки, 10 — не сразу, плюс уроки английского).

export interface Xp {
  total: number;
  today: number;
  goal: number;
  level: number;
  from: number;
  to: number;
  hue: number;
  title: string;
}

export function useGame() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['game', user?.id ?? 'guest'],
    queryFn: () => api<{ xp: Xp; streak: number; bestStreak: number }>('/progress/game'),
    staleTime: 30_000,
  });
}

export function useRefreshGame() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: ['game'] }), [qc]);
}

export const xpForAnswer = (firstTry: boolean) => (firstTry ? 15 : 10);

/** Тот же расчёт уровня, что на сервере: чтобы показать повышение уровня сразу. */
export function levelOf(xp: number) {
  let level = 1;
  let from = 0;
  let step = 100;
  while (xp >= from + step) {
    from += step;
    level++;
    step += 50;
  }
  return { level, from, to: from + step, hue: (level - 1) % 7 };
}

// ——— звуки: синтез в браузере, без файлов; выключаются одной кнопкой ———
const SOUND_KEY = 'spectr.sound';
export function soundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

/** Мягкие звуки: «верно» — два светлых тона, «почти» — тихий низкий, комбо и уровень — арпеджио. */
export function sfx(kind: 'correct' | 'almost' | 'combo' | 'level' | 'finish' | 'tap') {
  if (!soundOn()) return;
  const c = audio();
  if (!c) return;
  try {
    if (kind === 'correct') {
      tone(c, 784, 0, 0.16, 'triangle');
      tone(c, 1175, 0.08, 0.22, 'triangle');
    } else if (kind === 'almost') {
      tone(c, 330, 0, 0.18, 'sine', 0.08);
      tone(c, 294, 0.1, 0.22, 'sine', 0.06);
    } else if (kind === 'combo') {
      [784, 988, 1175, 1568].forEach((f, i) => tone(c, f, i * 0.06, 0.16, 'triangle', 0.1));
    } else if (kind === 'level' || kind === 'finish') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, f, i * 0.09, 0.3, 'triangle', 0.11));
    } else tone(c, 660, 0, 0.06, 'sine', 0.05);
  } catch {
    /* звук не обязателен */
  }
}
