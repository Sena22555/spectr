import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { Empty, ErrorNote, Loading, PageHeader, SectionTitle } from '../../components/ui';
import { TeacherLessonRow } from './shared';
import type { Lesson } from '../../lib/types';

interface Overview {
  teacher: { subject: string; hue: number };
  today: Lesson[];
  week: number;
  groups: number;
  pending: number;
  missingLinks: number;
}

export default function Today() {
  const q = useQuery({ queryKey: ['teacher', 'overview'], queryFn: () => api<Overview>('/teacher/overview') });
  const upcoming = useQuery({
    queryKey: ['teacher', 'lessons', 'next'],
    queryFn: () =>
      api<{ lessons: Lesson[] }>(`/teacher/lessons?from=${new Date(new Date().setHours(24, 0, 0, 0)).toISOString()}&to=${new Date(Date.now() + 3 * 86_400_000).toISOString()}`).then(
        (r) => r.lessons,
      ),
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;

  const todos = [
    o.missingLinks > 0 && { to: '/teach/lessons', text: `${o.missingLinks} ${plural(o.missingLinks, 'занятие', 'занятия', 'занятий')} без ссылки` },
    o.pending > 0 && { to: '/teach/requests', text: `${o.pending} ${plural(o.pending, 'заявка', 'заявки', 'заявок')} на перенос` },
  ].filter(Boolean) as { to: string; text: string }[];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        title="Сегодня"
        lead={`На неделе ${o.week} ${plural(o.week, 'занятие', 'занятия', 'занятий')}, групп: ${o.groups}.`}
      />

      {todos.length > 0 && (
        <section className="hue-0 flex flex-col gap-3 rounded-card bg-tint p-5 sm:p-6">
          <p className="t-heading text-[24px]">Нужно ваше внимание</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
            {todos.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className="link inline-flex items-center gap-2 text-[17px]">
                  <span className="size-2 rounded-full bg-ember" aria-hidden="true" />
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>Занятия сегодня</SectionTitle>
        {o.today.length ? (
          <ul className="m-0 list-none p-0">
            {o.today.map((l) => (
              <TeacherLessonRow key={l.id} lesson={l} />
            ))}
          </ul>
        ) : (
          <div className="mt-6">
            <Empty title="Сегодня занятий нет" hue={3}>
              Можно спокойно подготовиться к следующим.
            </Empty>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Ближайшие дни</SectionTitle>
        {upcoming.isPending ? (
          <Loading />
        ) : upcoming.data?.length ? (
          <ul className="m-0 list-none p-0">
            {upcoming.data.map((l) => (
              <TeacherLessonRow key={l.id} lesson={l} showDate />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-muted">В ближайшие три дня занятий нет.</p>
        )}
      </section>
    </div>
  );
}
