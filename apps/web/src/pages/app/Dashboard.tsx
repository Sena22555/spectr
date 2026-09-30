import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { plural } from '../../lib/format';
import { homeFor } from '../../components/Layout';
import { LessonRow, NextLesson } from '../../components/LessonCards';
import { GroupCard } from '../../components/Cards';
import { ButtonLink, Empty, Loading, SectionTitle } from '../../components/ui';
import type { GroupCard as Group, Lesson } from '../../lib/types';

interface Overview {
  next: Lesson | null;
  upcomingCount: number;
  doneCount: number;
  groups: number;
  openTickets: number;
  pendingRequests: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/me/overview') });
  const schedule = useQuery({
    queryKey: ['schedule', 'week'],
    queryFn: () =>
      api<{ lessons: Lesson[] }>(`/me/schedule?from=${new Date().toISOString()}&to=${new Date(Date.now() + 7 * 86_400_000).toISOString()}`).then((r) => r.lessons),
  });
  const groups = useQuery({ queryKey: ['my-groups'], queryFn: () => api<{ groups: Group[] }>('/me/groups').then((r) => r.groups) });

  if (user && user.role !== 'STUDENT') return <Navigate to={homeFor(user.role)} replace />;
  const o = overview.data;
  const upcoming = schedule.data?.filter((l) => l.id !== o?.next?.id).slice(0, 5);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <h1 className="t-display t-lg">Здравствуйте, {user?.name.split(' ')[0]}</h1>
        {o && (
          <p className="t-sub text-muted">
            {o.upcomingCount
              ? `Впереди ${o.upcomingCount} ${plural(o.upcomingCount, 'занятие', 'занятия', 'занятий')}, уже пройдено ${o.doneCount}.`
              : 'Пока в расписании пусто.'}
          </p>
        )}
      </header>

      {overview.isPending ? (
        <Loading />
      ) : o?.next ? (
        <NextLesson lesson={o.next} />
      ) : (
        <Empty
          title="Занятий пока нет"
          action={<ButtonLink to="/book">Записаться на занятие</ButtonLink>}
        >
          Как только администратор подберёт преподавателя и время, занятие появится здесь вместе со ссылкой.
        </Empty>
      )}

      {o && (o.pendingRequests > 0 || o.openTickets > 0) && (
        <div className="flex flex-wrap gap-3">
          {o.pendingRequests > 0 && (
            <Link to="/app/requests" className="press inline-flex items-center gap-2 rounded-ctl border border-ink/40 px-4 py-3 no-underline hover:border-ink">
              <span className="h-4 w-1 rounded-full bg-ember" aria-hidden="true" />
              {o.pendingRequests} {plural(o.pendingRequests, 'заявка', 'заявки', 'заявок')} на перенос ждёт ответа
            </Link>
          )}
          {o.openTickets > 0 && (
            <Link to="/app/support" className="press inline-flex items-center gap-2 rounded-ctl border border-ink/40 px-4 py-3 no-underline hover:border-ink">
              Открытых обращений в поддержку: {o.openTickets}
            </Link>
          )}
        </div>
      )}

      <section>
        <SectionTitle
          action={
            <Link to="/app/schedule" className="link inline-flex items-center gap-1.5 text-[16px]">
              Всё расписание <ArrowRight className="size-4" strokeWidth={1.7} />
            </Link>
          }
        >
          На этой неделе
        </SectionTitle>
        {schedule.isPending ? (
          <Loading />
        ) : upcoming?.length ? (
          <ul className="m-0 list-none p-0">
            {upcoming.map((l) => (
              <LessonRow key={l.id} lesson={l} showDate onReschedule />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-muted">На ближайшие семь дней других занятий нет.</p>
        )}
      </section>

      {groups.data && groups.data.length > 0 && (
        <section>
          <SectionTitle>Мои группы</SectionTitle>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {groups.data.map((g) => (
              <GroupCard key={g.id} g={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
