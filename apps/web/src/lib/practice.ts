import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface PracticeProblem {
  id: string;
  text: string;
  kind: 'number' | 'text' | 'choice';
  unit: string | null;
  options: string[] | null;
  /** 0 — без уровня (задачи тренажёров) */
  level: 0 | 1 | 2 | 3;
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
    queryFn: () =>
      api<{ solved: string[]; tried: string[]; trainers?: Record<string, { solved: number; tries: number }> }>('/practice/progress').then((r) => ({
        solved: new Set(r.solved),
        tried: new Set(r.tried),
        trainers: r.trainers ?? {},
      })),
    staleTime: 30_000,
  });
}

export interface ExamTag {
  exam: 'ОГЭ' | 'ЕГЭ';
  subject: string;
  task: number;
}

export interface Trainer {
  id: string;
  title: string;
  subject: 'math' | 'physics' | 'informatics';
  grades: [number, number];
  skill: string;
  exams: ExamTag[];
  theory: string | null;
}

export function useTrainers() {
  return useQuery({ queryKey: ['trainers'], queryFn: () => api<{ trainers: Trainer[] }>('/practice/trainers').then((r) => r.trainers), staleTime: Infinity });
}

export const SUBJECT_NAME: Record<Trainer['subject'], string> = { math: 'Математика', physics: 'Физика', informatics: 'Информатика' };
export const SUBJECT_HUE: Record<Trainer['subject'], number> = { math: 1, physics: 5, informatics: 3 };

/** Названия заданий экзаменов, для которых есть тренажёры (по демоверсиям ФИПИ последних лет). */
export const EXAM_TASKS: Record<string, { title: string; tasks: Record<number, string> }> = {
  'ОГЭ|математика': {
    title: 'ОГЭ · математика',
    tasks: { 6: 'Вычисления с дробями', 8: 'Степени и корни', 9: 'Уравнения', 10: 'Теория вероятностей', 12: 'Расчёты по формулам', 13: 'Неравенства', 14: 'Прогрессии', 15: 'Треугольники' },
  },
  'ЕГЭ|профильная математика': {
    title: 'ЕГЭ · профильная математика',
    tasks: { 1: 'Планиметрия', 4: 'Теория вероятностей', 6: 'Простейшие уравнения', 7: 'Вычисления и преобразования', 8: 'Производная', 9: 'Задачи с прикладным содержанием', 12: 'Наибольшее и наименьшее значение' },
  },
  'ОГЭ|информатика': { title: 'ОГЭ · информатика', tasks: { 1: 'Объём информации', 3: 'Значение логического выражения', 10: 'Системы счисления' } },
  'ЕГЭ|информатика': {
    title: 'ЕГЭ · информатика',
    tasks: { 2: 'Таблицы истинности', 7: 'Кодирование изображений', 8: 'Комбинаторика', 11: 'Объём паролей', 14: 'Системы счисления' },
  },
  'ОГЭ|физика': { title: 'ОГЭ · физика', tasks: { 0: 'Расчётные задачи' } },
};

export const gradesLabel = (g: [number, number]) => (g[0] === g[1] ? `${g[0]} класс` : `${g[0]}–${g[1]} класс`);

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
