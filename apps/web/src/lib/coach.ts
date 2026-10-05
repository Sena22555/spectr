import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { coachOn, playQueue, playUrl, setCoachOn, stopVoice, ttsUrl } from './voice';
import type { GameKey } from './games';

// Голосовой комментатор: мгновенная заготовленная фраза (сотни вариантов, не повторяется подряд)
// и, после ошибки, — личный разбор от нейросети её же голосом.

export type CoachEvent = 'start' | 'ok' | 'okHard' | 'streak' | 'almost' | 'almostAgain' | 'timeout' | 'perfect' | 'finish' | 'finishTough';

export const COACH_FACE: Record<GameKey, string> = { lingo: '🎧', math: '🧮', physics: '⚡', code: '🤖' };

interface CoachData {
  name: string;
  voice: string;
  lines: Record<CoachEvent, string[]>;
  tts: boolean;
  llm: boolean;
}

export function useCoachData(game: GameKey) {
  return useQuery({ queryKey: ['coach', game], queryFn: () => api<CoachData>(`/ai/coach/${game}`), staleTime: Infinity, retry: false });
}

export function useCoach(game: GameKey) {
  const q = useCoachData(game);
  const [on, setOn] = useState(coachOn);
  const [bubble, setBubble] = useState<{ text: string; key: number; thinking?: boolean } | null>(null);
  const recent = useRef<string[]>([]);
  const busy = useRef(0);

  // заранее подгружаем пару фраз на каждый случай, чтобы первая реакция была мгновенной
  useEffect(() => {
    if (!q.data?.tts || !on) return;
    for (const list of Object.values(q.data.lines)) for (const t of list.slice(0, 1)) void fetch(ttsUrl(t, q.data.voice)).catch(() => undefined);
  }, [q.data, on]);

  useEffect(() => () => stopVoice(), []);

  const say = useCallback(
    (ev: CoachEvent) => {
      const d = q.data;
      if (!d) return Promise.resolve();
      const pool = d.lines[ev].filter((t) => !recent.current.includes(t));
      const text = (pool.length ? pool : d.lines[ev])[Math.floor(Math.random() * (pool.length || d.lines[ev].length))]!;
      recent.current = [text, ...recent.current].slice(0, 8);
      setBubble({ text, key: Date.now() });
      if (!on || !d.tts) return Promise.resolve();
      return playUrl(ttsUrl(text, d.voice)).then(() => undefined);
    },
    [q.data, on],
  );

  /** Личный разбор ошибки: говорит после короткой реакции. */
  const hint = useCallback(
    async (task: string, given: string, correct: string, after?: Promise<void>) => {
      const d = q.data;
      if (!d?.llm || !on) return;
      const id = ++busy.current;
      setBubble((b) => (b ? { ...b, thinking: true } : { text: '', key: Date.now(), thinking: true }));
      try {
        const r = await api<{ text: string; voice: string; sig: string }>('/ai/hint', { method: 'POST', json: { game, task: task.slice(0, 600), given: given.slice(0, 120), correct: correct.slice(0, 200) } });
        if (id !== busy.current) return;
        await after;
        if (id !== busy.current) return;
        setBubble({ text: r.text, key: Date.now() });
        if (d.tts) void playQueue([{ t: r.text, v: r.voice, sig: r.sig }]);
      } catch {
        if (id === busy.current) setBubble((b) => (b ? { ...b, thinking: false } : null));
      }
    },
    [q.data, on, game],
  );

  /** Проверенная подсказка к задаче (подписана сервером) — звучит сразу после короткой реакции. */
  const tip = useCallback(
    async (say: { t: string; v: string; sig: string }, after?: Promise<void>) => {
      const id = ++busy.current;
      await after;
      if (id !== busy.current) return;
      setBubble({ text: say.t, key: Date.now() });
      if (on && q.data?.tts) void playQueue([say]);
    },
    [on, q.data],
  );

  /** Новая карточка: старый разбор больше не нужен. */
  const reset = useCallback(() => {
    busy.current++;
    stopVoice();
    setBubble(null);
  }, []);

  const toggle = useCallback(() => {
    setOn((v) => {
      setCoachOn(!v);
      if (v) stopVoice();
      return !v;
    });
  }, []);

  return { name: q.data?.name ?? null, ready: Boolean(q.data), on, toggle, say, hint, tip, reset, bubble };
}
