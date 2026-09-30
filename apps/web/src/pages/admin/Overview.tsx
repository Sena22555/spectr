import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
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

export default function AdminOverview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview') });
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
          <Link key={i.to} to={i.to} className={`hue-${i.hue} lift group flex min-h-44 flex-col justify-between rounded-card border-t-[4px] border-ray bg-tint p-5 no-underline sm:p-6`}>
            <span className="flex items-start justify-between">
              <span className="t-display tnum text-[72px] text-hue">{i.n}</span>
              <ArrowUpRight className="size-5 text-hue transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.7} />
            </span>
            <span className="text-[18px] leading-snug">{i.label}</span>
          </Link>
        ))}
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
