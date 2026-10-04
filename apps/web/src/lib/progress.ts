import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface Progress {
  name: string | null;
  solvedTotal: number;
  solvedWeek: number;
  solvedPrevWeek: number;
  accuracy: number;
  streak: number;
  bestStreak: number;
  activeDays7: number;
  last14: { day: string; solved: number }[];
  bySubject: { key: string; title: string; solved: number; tries: number }[];
  mastered: { title: string; link: string; subject: string }[];
  weak: { title: string; link: string; subject: string }[];
  recent: { title: string; link: string; subject: string; solved: number; tries: number; kind: 'topic' | 'trainer'; total: number | null }[];
  achievements: { id: string; title: string; text: string; icon: string; earned: boolean }[];
}

export interface ParentLinkInfo {
  token: string;
  url: string;
  telegram: string | null;
  max: string | null;
}

export function useMyProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-progress', user?.id ?? 'guest'],
    queryFn: () => api<{ progress: Progress; parentLink: ParentLinkInfo | null; signedIn: boolean }>('/progress/me'),
  });
}
