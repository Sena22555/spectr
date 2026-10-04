import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface PracticeProblem {
  id: string;
  text: string;
  kind: 'number' | 'text' | 'choice';
  unit: string | null;
  options: string[] | null;
  level: 1 | 2 | 3;
  self: boolean;
  hint: string;
}

export interface TopicCard {
  slug: string;
  title: string;
  level: string;
  minutes: number;
  summary: string;
  widget: Widget | null;
  problems: number;
  ids: string[];
}

export type Widget = 'refraction' | 'binary' | 'motion' | 'ohm' | 'quadratic' | 'percent';

export interface PracticeSubjectCard {
  slug: string;
  title: string;
  hue: number;
  emoji: string;
  blurb: string;
  course: string;
  topics: TopicCard[];
}

export interface DailyTask {
  subject: { slug: string; title: string; hue: number };
  topic: { slug: string; title: string };
  problem: PracticeProblem;
}

export interface TopicFull {
  subject: { slug: string; title: string; hue: number; emoji: string; course: string };
  topic: {
    slug: string;
    title: string;
    level: string;
    minutes: number;
    summary: string;
    widget?: Widget;
    theory: { kind: 'p' | 'tip' | 'warn'; text: string }[];
    formulas: { tex: string; plain: string; label: string }[];
    example: { text: string; steps: string[] };
    problems: PracticeProblem[];
  };
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
}

export interface CheckResult {
  correct: boolean;
  answer: string | null;
  solution: string[] | null;
  tries: number;
}

export function usePractice() {
  return useQuery({ queryKey: ['practice'], queryFn: () => api<{ subjects: PracticeSubjectCard[]; daily: DailyTask }>('/practice'), staleTime: 5 * 60_000 });
}

export function useTopic(subject: string, topic: string) {
  return useQuery({ queryKey: ['practice', subject, topic], queryFn: () => api<TopicFull>(`/practice/${subject}/${topic}`), staleTime: 5 * 60_000 });
}

export function useProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['practice-progress', user?.id ?? 'guest'],
    queryFn: () => api<{ solved: string[]; tried: string[] }>('/practice/progress').then((r) => ({ solved: new Set(r.solved), tried: new Set(r.tried) })),
    staleTime: 30_000,
  });
}

export function useCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { problemId: string; answer: string; reveal?: boolean }) => api<CheckResult>('/practice/check', { method: 'POST', json: v }),
    onSuccess: (r) => {
      if (r.correct) {
        qc.invalidateQueries({ queryKey: ['practice-progress'] });
        qc.invalidateQueries({ queryKey: ['my-homework'] });
      }
    },
  });
}

export const LEVEL_LABEL = ['', 'разминка', 'основа', 'со звёздочкой'] as const;
