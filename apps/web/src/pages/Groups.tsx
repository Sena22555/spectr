import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Container } from '../components/Layout';
import { GroupCard } from '../components/Cards';
import { ErrorNote, PageHeader, Skeleton } from '../components/ui';
import type { GroupCard as Group } from '../lib/types';

export default function Groups() {
  const q = useQuery({ queryKey: ['groups'], queryFn: () => api<{ groups: Group[] }>('/groups').then((r) => r.groups) });
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader title="Мини-группы" lead="До восьми человек, постоянное расписание и один преподаватель. В профиле группы — фотографии с занятий." />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
        {q.data ? q.data.map((g) => <GroupCard key={g.id} g={g} />) : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    </Container>
  );
}
