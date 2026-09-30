import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { dayKey, fmtDay, relativeDay, startOfDay } from '../../lib/format';
import { LessonRow } from '../../components/LessonCards';
import { Empty, ErrorNote, Loading, PageHeader, ButtonLink } from '../../components/ui';
import type { Lesson } from '../../lib/types';

function weekStart(offset: number) {
  const d = startOfDay(new Date());
  const day = (d.getDay() + 6) % 7; // пн = 0
  d.setDate(d.getDate() - day + offset * 7);
  return d;
}

export function useWeek() {
  const [offset, setOffset] = useState(0);
  const from = weekStart(offset);
  const to = new Date(from.getTime() + 7 * 86_400_000 - 1);
  const label = `${fmtDay(from)} — ${fmtDay(to)}`;
  return { offset, setOffset, from, to, label };
}

export function WeekNav({ week }: { week: ReturnType<typeof useWeek> }) {
  return (
    <div className="flex items-center gap-2">
      <button className="press grid size-11 place-items-center rounded-ctl border border-ink/40 hover:border-ink" onClick={() => week.setOffset(week.offset - 1)} aria-label="Предыдущая неделя">
        <ChevronLeft className="size-5" strokeWidth={1.7} />
      </button>
      <p className="tnum min-w-[190px] text-center text-[17px]" aria-live="polite">
        {week.offset === 0 ? 'Эта неделя' : week.offset === 1 ? 'Следующая неделя' : week.label}
      </p>
      <button className="press grid size-11 place-items-center rounded-ctl border border-ink/40 hover:border-ink" onClick={() => week.setOffset(week.offset + 1)} aria-label="Следующая неделя">
        <ChevronRight className="size-5" strokeWidth={1.7} />
      </button>
    </div>
  );
}

export function groupByDay<T extends { startsAt: string }>(lessons: T[]) {
  const map = new Map<string, T[]>();
  for (const l of lessons) {
    const k = dayKey(l.startsAt);
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  return [...map.values()];
}

export default function Schedule() {
  const week = useWeek();
  const q = useQuery({
    queryKey: ['schedule', week.from.toISOString()],
    queryFn: () => api<{ lessons: Lesson[] }>(`/me/schedule?from=${week.from.toISOString()}&to=${week.to.toISOString()}`).then((r) => r.lessons),
  });
  const days = useMemo(() => groupByDay(q.data ?? []), [q.data]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Расписание" lead={week.label} actions={<WeekNav week={week} />} />
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data && days.length === 0 && (
        <Empty title="На этой неделе занятий нет" action={<ButtonLink to="/book" variant="secondary">Записаться ещё на занятие</ButtonLink>}>
          Посмотрите следующую неделю или запишитесь на новое занятие.
        </Empty>
      )}
      {days.map((lessons) => (
        <section key={lessons[0].id}>
          <h2 className="t-heading flex items-baseline gap-3 border-b border-charcoal pb-2 text-[26px]">
            {relativeDay(lessons[0].startsAt)}
            <span className="t-caption text-muted">{fmtDay(lessons[0].startsAt)}</span>
          </h2>
          <ul className="m-0 list-none p-0">
            {lessons.map((l) => (
              <LessonRow key={l.id} lesson={l} onReschedule />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
