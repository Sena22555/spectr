import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { Badge, Empty, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { FilterChip } from '../Teachers';
import type { Booking } from '../../lib/types';

const FLOW = ['NEW', 'CONTACTED', 'SCHEDULED', 'CLOSED'] as const;

export default function Bookings() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | (typeof FLOW)[number]>('NEW');
  const q = useQuery({ queryKey: ['admin', 'bookings'], queryFn: () => api<{ bookings: Booking[] }>('/admin/bookings').then((r) => r.bookings) });
  const m = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/bookings/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
  const list = q.data?.filter((b) => filter === 'ALL' || b.status === filter);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Заявки на запись" lead="Свяжитесь с человеком, подберите преподавателя, затем поставьте занятие в «Расписании»." />
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          Все
        </FilterChip>
        {FLOW.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {STATUS_LABEL[s]} · {q.data?.filter((b) => b.status === s).length ?? 0}
          </FilterChip>
        ))}
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {list?.length === 0 && <Empty title="Здесь пусто" hue={3} />}
      <ul className="m-0 list-none p-0">
        {list?.map((b) => (
          <li key={b.id} className="grid gap-4 border-b border-hair-soft py-5 md:grid-cols-[1.2fr_1fr_auto]">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 text-[19px] font-[450]">
                {b.status === 'NEW' && <Badge tone="ember">Новая</Badge>}
                {b.name}
              </p>
              <p className="text-[16px]">
                <a className="link" href={/^\+?\d/.test(b.contact) ? `tel:${b.contact}` : b.contact.includes('@') && !b.contact.startsWith('@') ? `mailto:${b.contact}` : `https://t.me/${b.contact.replace('@', '')}`}>
                  {b.contact}
                </a>
              </p>
              <p className="t-caption text-muted">{fmtFull(b.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-1 text-[16px]">
              <p>
                {b.course?.title ?? 'Предмет не выбран'} · {b.format ? STATUS_LABEL[b.format] : 'формат не указан'}
              </p>
              {b.teacherSlug && <p className="t-caption text-muted">Хочет к: {b.teacherSlug}</p>}
              {b.preferredTime && <p className="t-caption text-muted">Время: {b.preferredTime}</p>}
              {b.comment && <p className="t-caption">«{b.comment}»</p>}
              {b.user && <p className="t-caption text-muted">Есть аккаунт: {b.user.email ?? b.user.name}</p>}
            </div>
            <div className="flex flex-wrap items-start gap-1 md:justify-end" role="group" aria-label="Статус заявки">
              {FLOW.map((s) => (
                <button
                  key={s}
                  onClick={() => m.mutate({ id: b.id, status: s })}
                  aria-pressed={b.status === s}
                  className={clsx(
                    'press h-9 rounded-ctl border px-2.5 text-[14px]',
                    b.status === s ? 'border-ink bg-ink text-paper' : 'border-ink/30 hover:border-ink',
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
