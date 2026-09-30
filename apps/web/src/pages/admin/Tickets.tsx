import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { Badge, Button, Empty, ErrorNote, Loading, PageHeader, Textarea } from '../../components/ui';
import { FilterChip } from '../Teachers';
import { Thread } from '../app/Ticket';
import type { Ticket } from '../../lib/types';

export default function AdminTickets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'OPEN' | 'ANSWERED' | 'CLOSED' | ''>('OPEN');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'tickets', status],
    queryFn: () => api<{ tickets: Ticket[] }>(`/admin/tickets${status ? `?status=${status}` : ''}`).then((r) => r.tickets),
  });
  const active = q.data?.find((t) => t.id === activeId) ?? q.data?.[0];
  const send = useMutation({
    mutationFn: () => api(`/admin/tickets/${active!.id}/messages`, { method: 'POST', json: { body: reply } }),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const close = useMutation({
    mutationFn: () => api(`/admin/tickets/${active!.id}`, { method: 'PATCH', json: { status: 'CLOSED' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Поддержка" lead="Обращения учеников. Ответ сразу появляется у ученика в кабинете." />
      <div className="flex flex-wrap gap-2">
        {(['OPEN', 'ANSWERED', 'CLOSED', ''] as const).map((s) => (
          <FilterChip key={s || 'all'} active={status === s} onClick={() => (setStatus(s), setActiveId(null))}>
            {s ? STATUS_LABEL[s] : 'Все'}
          </FilterChip>
        ))}
      </div>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data?.length === 0 && <Empty title="Обращений нет" hue={3}>Здесь пусто — все вопросы решены.</Empty>}
      {q.data && q.data.length > 0 && active && (
        <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
          <ul className="m-0 list-none p-0">
            {q.data.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setActiveId(t.id)}
                  aria-current={active.id === t.id}
                  className={clsx('flex w-full flex-col gap-1 border-b border-hair-soft px-3 py-3 text-left', active.id === t.id ? 'bg-bone' : 'hover:bg-bone/50')}
                >
                  <span className="text-[16px] font-[450]">{t.subject}</span>
                  <span className="t-caption text-muted">
                    {t.user?.name} · {fmtFull(t.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal pb-4">
              <div>
                <h2 className="t-heading text-[28px]">{active.subject}</h2>
                <p className="t-caption text-muted">
                  {active.user?.name} · {active.user?.email}
                </p>
              </div>
              <Badge tone={active.status === 'OPEN' ? 'ember' : 'outline'}>{STATUS_LABEL[active.status]}</Badge>
            </header>
            <Thread messages={active.messages} meId={user?.id} />
            {active.status !== 'CLOSED' && (
              <form
                className="flex flex-col gap-3 border-t border-charcoal pt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  send.mutate();
                }}
              >
                <Textarea label="Ответ" value={reply} onChange={(e) => setReply(e.target.value)} required />
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" loading={send.isPending}>
                    Ответить
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => close.mutate()} loading={close.isPending}>
                    Закрыть обращение
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
