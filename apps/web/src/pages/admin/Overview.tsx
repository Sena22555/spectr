import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';

interface Overview {
  users: number;
  teachers: number;
  students: number;
  groups: number;
  courses: number;
  newBookings: number;
  pendingRequests: number;
  openTickets: number;
  upcoming: number;
}

interface Week {
  kpi: { visitors: number; bookings: number; signups: number; newBotUsers: number; practiceSolved: number };
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') });
  const week = useQuery({ queryKey: ['admin', 'analytics', 7], queryFn: () => api<Week>('/admin/analytics?days=7') });
  const warm = useQuery({ queryKey: ['admin', 'people', 'warm', ''], queryFn: () => api<{ counts: { warm: number; booked: number } }>('/admin/people?segment=warm') });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;

  const inbox = [
    { to: '/admin/bookings', n: o.newBookings, label: plural(o.newBookings, 'новая заявка на запись', 'новые заявки на запись', 'новых заявок на запись'), hue: 1 },
    { to: '/admin/requests', n: o.pendingRequests, label: plural(o.pendingRequests, 'перенос ждёт решения', 'переноса ждут решения', 'переносов ждут решения'), hue: 5 },
    { to: '/admin/tickets', n: o.openTickets, label: plural(o.openTickets, 'открытое обращение', 'открытых обращения', 'открытых обращений'), hue: 4 },
  ];

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Сводка" lead="Что требует ответа прямо сейчас и как устроена школа." />
      <section className="grid gap-4 md:grid-cols-3">
        {inbox.map((i) => (
          <Link key={i.to} to={i.to} className={`hue-${i.hue} lift group flex min-h-44 flex-col justify-between rounded-[14px] bg-tint p-5 no-underline hover:-translate-y-1 hover:-rotate-1 sm:p-6`}>
            <span className="flex items-start justify-between">
              <span className="t-display tnum text-[72px] text-hue">{i.n}</span>
              <ArrowUpRight className="size-5 text-hue transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.7} />
            </span>
            <span className="text-[18px] leading-snug">{i.label}</span>
          </Link>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Link to="/admin/analytics" className="lift group flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 no-underline hover:border-ink/40 sm:p-6">
          <span className="flex items-center justify-between">
            <span className="t-mono inline-flex items-center gap-2 text-[12px] text-muted">
              <TrendingUp className="size-4" /> за 7 дней
            </span>
            <ArrowUpRight className="size-5" strokeWidth={1.7} />
          </span>
          <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['посетителей', week.data?.kpi.visitors],
              ['новых в ботах', week.data?.kpi.newBotUsers],
              ['заявок', week.data?.kpi.bookings],
              ['решено задач', week.data?.kpi.practiceSolved],
            ].map(([label, n]) => (
              <div key={label as string}>
                <dd className="t-display tnum m-0 text-[40px] leading-none">{n ?? '—'}</dd>
                <dt className="t-caption text-muted">{label}</dt>
              </div>
            ))}
          </dl>
          <span className="lift-title text-[15px] font-[550]">Открыть аналитику</span>
        </Link>
        <Link to="/admin/people" className="hue-2 lift group flex flex-col justify-between gap-3 rounded-[14px] bg-tint p-5 no-underline hover:-translate-y-1 sm:p-6">
          <span className="t-display tnum text-[64px] leading-none text-hue">{warm.data?.counts.warm ?? '—'}</span>
          <span className="text-[18px] leading-snug">
            {plural(warm.data?.counts.warm ?? 0, 'человек смотрел', 'человека смотрели', 'человек смотрели')} школу, но не записались — им можно написать
          </span>
          <span className="lift-title text-[15px] font-[550]">Люди и воронка →</span>
        </Link>
      </section>

      <section>
        <h2 className="t-heading border-b border-charcoal pb-2 text-[26px]">Школа</h2>
        <dl className="m-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Ученики', o.students, '/admin/users'],
            ['Преподаватели', o.teachers, '/admin/teachers'],
            ['Группы', o.groups, '/admin/groups'],
            ['Предметы', o.courses, '/admin/subjects'],
            ['Занятий впереди', o.upcoming, '/admin/lessons'],
            ['Всего аккаунтов', o.users, '/admin/users'],
          ].map(([label, n, to]) => (
            <Link key={label as string} to={to as string} className="flex flex-col gap-1 border-b border-hair-soft py-4 pr-4 no-underline hover:underline">
              <dt className="t-caption text-muted">{label}</dt>
              <dd className="t-heading tnum m-0 text-[34px]">{n}</dd>
            </Link>
          ))}
        </dl>
      </section>
    </div>
  );
}
