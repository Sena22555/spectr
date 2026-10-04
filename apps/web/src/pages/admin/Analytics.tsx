import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus, Table2, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import { plural } from '../../lib/format';
import { ButtonLink, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { DayBars, MeterRow, type DayPoint } from '../../components/charts/DayBars';

interface Analytics {
  days: number;
  kpi: {
    visitors: number;
    visitorsPrev: number;
    newVisitors: number;
    botUsers: number;
    newBotUsers: number;
    signups: number;
    signupsPrev: number;
    bookings: number;
    bookingsPrev: number;
    newStudents: number;
    practiceSolved: number;
    practicePeople: number;
  };
  funnel: { key: string; label: string; value: number }[];
  botFunnel: { key: string; label: string; value: number }[];
  bookingsByStatus: Record<string, number>;
  daily: (DayPoint & { visitors: number; bookings: number; signups: number; botStarts: number; solved: number })[];
  sources: { key: string; label: string; visitors: number; bookings: number; students: number }[];
  pages: { path: string; label: string; views: number }[];
  practice: { topic: string; title: string; tries: number; solved: number; people: number }[];
  platforms: Record<string, number>;
  devices: Record<string, number>;
}

const PERIODS = [7, 30, 90] as const;
const PLATFORM: Record<string, string> = { web: 'Сайт', telegram: 'Telegram', vk: 'ВКонтакте', max: 'MAX' };
const DEVICE: Record<string, string> = { mobile: 'Телефон', desktop: 'Компьютер' };
const pct = (a: number, b: number) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : '—');

export default function AdminAnalytics() {
  const [days, setDays] = useState<number>(30);
  const [table, setTable] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'analytics', days], queryFn: () => api<Analytics>(`/admin/analytics?days=${days}`), placeholderData: keepPreviousData });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Аналитика"
        lead="Откуда приходят люди, что смотрят и на каком шаге уходят. Чтобы поработать с конкретными людьми, откройте раздел «Люди и воронка»."
        actions={
          <ButtonLink to="/admin/people" variant="secondary">
            <UsersRound className="size-4" /> Люди и воронка
          </ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Период">
        {PERIODS.map((p) => (
          <button key={p} role="radio" aria-checked={days === p} onClick={() => setDays(p)} className={clsx('press rounded-full px-4 py-2 text-[14px]', days === p ? 'bg-ink text-paper' : 'border border-ink/30 hover:bg-ink/[0.06]')}>
            {p} дней
          </button>
        ))}
      </div>

      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className={clsx('flex flex-col gap-12 transition-opacity', q.isFetching && 'opacity-60')}>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Главные цифры">
            <Kpi label="Посетители сайта" value={q.data.kpi.visitors} prev={q.data.kpi.visitorsPrev} note={`новых ${q.data.kpi.newVisitors}`} />
            <Kpi label="Заявки на занятия" value={q.data.kpi.bookings} prev={q.data.kpi.bookingsPrev} note={`конверсия ${pct(q.data.kpi.bookings, q.data.kpi.visitors + q.data.kpi.newBotUsers)}`} />
            <Kpi label="Регистрации" value={q.data.kpi.signups} prev={q.data.kpi.signupsPrev} note={`новых учеников ${q.data.kpi.newStudents}`} />
            <Kpi label="В ботах" value={q.data.kpi.botUsers} note={`новых ${q.data.kpi.newBotUsers}`} />
          </section>

          <section className="flex flex-col gap-5 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="t-display t-md">По дням</h2>
              <button type="button" className="link inline-flex items-center gap-1.5 text-[14px]" onClick={() => setTable((v) => !v)} aria-pressed={table}>
                <Table2 className="size-4" /> {table ? 'Графики' : 'Таблица'}
              </button>
            </div>
            {table ? (
              <DailyTable data={q.data.daily} />
            ) : (
              <>
                <DayBars
                  data={q.data.daily}
                  field="visitors"
                  title="Посетители"
                  details={[
                    { field: 'bookings', label: 'заявок' },
                    { field: 'signups', label: 'регистраций' },
                    { field: 'botStarts', label: 'новых в ботах' },
                    { field: 'solved', label: 'решено задач' },
                  ]}
                />
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <DayBars data={q.data.daily} field="bookings" title="Заявки" height={90} compact color="var(--ink)" />
                  <DayBars data={q.data.daily} field="signups" title="Регистрации" height={90} compact color="var(--ink)" />
                  <DayBars data={q.data.daily} field="botStarts" title="Новые в ботах" height={90} compact color="var(--ink)" />
                  <DayBars data={q.data.daily} field="solved" title="Решено задач" height={90} compact color="var(--ink)" />
                </div>
              </>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Funnel title="Воронка сайта" steps={q.data.funnel} />
            <Funnel title="Воронка ботов" steps={q.data.botFunnel} />
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="t-display t-md">Источники</h2>
            <div className="overflow-x-auto rounded-[14px] border-[1.5px] border-ink/15 bg-paper">
              <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
                <thead>
                  <tr className="t-mono border-b border-dashed border-hair-soft text-[11px] text-muted">
                    <th className="px-4 py-3 font-normal">откуда</th>
                    <th className="px-4 py-3 text-right font-normal">новых людей</th>
                    <th className="px-4 py-3 text-right font-normal">заявок</th>
                    <th className="px-4 py-3 text-right font-normal">конверсия</th>
                    <th className="px-4 py-3 text-right font-normal">учатся</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.sources.map((s) => (
                    <tr key={s.key} className="border-b border-hair-soft last:border-0">
                      <td className="px-4 py-3">{s.label}</td>
                      <td className="tnum px-4 py-3 text-right">{s.visitors}</td>
                      <td className="tnum px-4 py-3 text-right">{s.bookings}</td>
                      <td className="tnum px-4 py-3 text-right font-[600]">{pct(s.bookings, s.visitors)}</td>
                      <td className="tnum px-4 py-3 text-right">{s.students}</td>
                    </tr>
                  ))}
                  {!q.data.sources.length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted">
                        Пока нет данных за период. Метки utm_source в ссылках из рекламы и соцсетей покажутся здесь отдельными строками.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
              <h2 className="t-heading text-[22px]">Что смотрят</h2>
              {q.data.pages.map((p) => (
                <MeterRow key={p.path} label={p.path === '/' ? p.label : `${p.label} · ${p.path}`} value={p.views} max={q.data.pages[0]?.views ?? 1} />
              ))}
              {!q.data.pages.length && <p className="text-muted">Просмотров пока нет.</p>}
            </section>
            <section className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
              <h2 className="t-heading text-[22px]">Практикум</h2>
              <p className="t-caption text-muted">
                Решено задач: <b className="text-ink">{q.data.kpi.practiceSolved}</b> · решали {q.data.kpi.practicePeople} {plural(q.data.kpi.practicePeople, 'человек', 'человека', 'человек')}
              </p>
              {q.data.practice.map((t) => (
                <MeterRow key={t.topic} label={t.title} value={t.people} max={q.data.practice[0]?.people ?? 1} note={`решено ${t.solved} из ${t.tries}`} />
              ))}
              {!q.data.practice.length && <p className="text-muted">Задачи за период ещё не решали.</p>}
            </section>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Split title="Площадки" data={q.data.platforms} names={PLATFORM} />
            <Split title="Устройства" data={q.data.devices} names={DEVICE} />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, prev, note }: { label: string; value: number; prev?: number; note?: string }) {
  const diff = prev === undefined ? null : value - prev;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5">
      <p className="t-caption text-muted">{label}</p>
      <p className="t-display tnum text-[48px] leading-none">{value}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        {diff !== null && (
          <span className={clsx('inline-flex items-center gap-0.5 font-[600]', diff > 0 ? 'text-[var(--ink-3)]' : diff < 0 ? 'text-ember-text' : '')}>
            {diff > 0 ? <ArrowUpRight className="size-3.5" /> : diff < 0 ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
            {diff > 0 ? '+' : ''}
            {diff} к прошлому периоду
          </span>
        )}
        {note && <span>{note}</span>}
      </p>
    </div>
  );
}

function Funnel({ title, steps }: { title: string; steps: { key: string; label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0;
  return (
    <section className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
      <h2 className="t-heading text-[22px]">{title}</h2>
      {steps.map((s, i) => (
        <MeterRow key={s.key} label={`${i + 1}. ${s.label}`} value={s.value} max={top || 1} note={i ? pct(s.value, top) : undefined} />
      ))}
    </section>
  );
}

function Split({ title, data, names }: { title: string; data: Record<string, number>; names: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;
  const total = entries.reduce((n, [, v]) => n + v, 0);
  return (
    <section className="flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
      <h2 className="t-heading text-[22px]">{title}</h2>
      {entries.map(([k, v]) => (
        <MeterRow key={k} label={names[k] ?? k} value={v} max={max} note={pct(v, total)} color="var(--ink)" />
      ))}
      {!entries.length && <p className="text-muted">Нет данных.</p>}
    </section>
  );
}

function DailyTable({ data }: { data: Analytics['daily'] }) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead className="sticky top-0 bg-paper">
          <tr className="t-mono text-[11px] text-muted">
            {['день', 'посетители', 'заявки', 'регистрации', 'в ботах', 'задачи'].map((h) => (
              <th key={h} className="border-b border-dashed border-hair-soft px-3 py-2 text-right font-normal first:text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d) => (
            <tr key={d.day} className="border-b border-hair-soft">
              <td className="px-3 py-2">{d.day}</td>
              {[d.visitors, d.bookings, d.signups, d.botStarts, d.solved].map((v, i) => (
                <td key={i} className="tnum px-3 py-2 text-right">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


