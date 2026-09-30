import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Container } from '../components/Layout';
import { TeacherCard } from '../components/Cards';
import { useTeachers } from '../components/BookingForm';
import { ErrorNote, PageHeader, Skeleton } from '../components/ui';

export default function Teachers() {
  const teachers = useTeachers();
  const [subject, setSubject] = useState<string | null>(null);
  const subjects = useMemo(() => {
    const map = new Map<string, number>();
    teachers.data?.forEach((t) => map.set(t.subject, t.hue));
    return [...map.entries()];
  }, [teachers.data]);
  const list = teachers.data?.filter((t) => !subject || t.subject === subject);

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader title="Преподаватели" lead="Каждый ведёт свой предмет и занимается как один на один, так и в мини-группах." />
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Фильтр по предмету">
        <FilterChip active={!subject} onClick={() => setSubject(null)}>
          Все
        </FilterChip>
        {subjects.map(([s, hue]) => (
          <FilterChip key={s} active={subject === s} hue={hue} onClick={() => setSubject(s)}>
            {s}
          </FilterChip>
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {teachers.error && <ErrorNote error={teachers.error} onRetry={() => teachers.refetch()} />}
        {list ? list.map((t) => <TeacherCard key={t.id} t={t} />) : Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[420px]" />)}
      </div>
    </Container>
  );
}

export function FilterChip({ active, hue, onClick, children }: { active: boolean; hue?: number; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        hue !== undefined && `hue-${hue}`,
        'press inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-[500] whitespace-nowrap transition-colors',
        active ? 'border-ink bg-ink text-paper' : 'border-ink/35 hover:border-ink',
      )}
    >
      {hue !== undefined && <span className={clsx('h-3.5 w-1 rounded-full', active ? 'bg-paper' : 'bg-hue')} aria-hidden="true" />}
      {children}
    </button>
  );
}
