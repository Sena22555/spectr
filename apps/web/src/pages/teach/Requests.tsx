import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { fmtFull, STATUS_LABEL, toLocalInput } from '../../lib/format';
import { haptic } from '../../lib/platform';
import { Avatar, Badge, Button, Empty, ErrorNote, Input, Loading, PageHeader } from '../../components/ui';
import type { RescheduleRequest } from '../../lib/types';

/** Общий список заявок на перенос: у преподавателя — свои, у админа — все */
export function RescheduleList({ endpoint, queryKey }: { endpoint: '/teacher/reschedules' | '/admin/reschedules'; queryKey: string[] }) {
  const q = useQuery({ queryKey, queryFn: () => api<{ requests: RescheduleRequest[] }>(endpoint).then((r) => r.requests) });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  if (!q.data.length) return <Empty title="Заявок на перенос нет" hue={3} />;
  const pending = q.data.filter((r) => r.status === 'PENDING');
  const done = q.data.filter((r) => r.status !== 'PENDING');
  return (
    <div className="flex flex-col gap-10">
      {pending.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {pending.map((r) => (
            <PendingRequest key={r.id} r={r} endpoint={endpoint} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section>
          <h2 className="t-heading border-b border-charcoal pb-2 text-[26px]">Рассмотренные</h2>
          <ul className="m-0 list-none p-0">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hair-soft py-3">
                <span className="text-[16px]">
                  {r.user?.name} · {r.lesson.group?.name ?? r.lesson.title} · {fmtFull(r.lesson.startsAt)}
                </span>
                <Badge tone={r.status === 'APPROVED' ? 'ink' : 'outline'}>{STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PendingRequest({ r, endpoint }: { r: RescheduleRequest; endpoint: string }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [time, setTime] = useState(r.proposedAt ? toLocalInput(r.proposedAt) : toLocalInput(r.lesson.startsAt));
  const m = useMutation({
    mutationFn: (status: 'APPROVED' | 'DECLINED') =>
      api(`${endpoint}/${r.id}`, {
        method: 'PATCH',
        json: { status, reply: reply || undefined, newStartsAt: status === 'APPROVED' ? new Date(time).toISOString() : undefined },
      }),
    onSuccess: () => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['teacher'] });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const hue = r.lesson.group?.hue ?? 5;
  return (
    <li className={clsx(`hue-${hue}`, 'grid gap-5 rounded-card bg-tint p-5 sm:p-6 lg:grid-cols-[1fr_1fr]')}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={r.user?.name ?? '?'} url={r.user?.avatarUrl} className="bg-paper/70" />
          <div>
            <p className="text-[18px] font-[450]">{r.user?.name}</p>
            <p className="t-caption text-hue">{r.lesson.group?.name ?? r.lesson.title}</p>
          </div>
        </div>
        <p className="text-[17px]">«{r.reason}»</p>
        <dl className="t-caption m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-hue">Сейчас</dt>
          <dd className="m-0">{fmtFull(r.lesson.startsAt)}</dd>
          {r.proposedAt && (
            <>
              <dt className="text-hue">Просят</dt>
              <dd className="m-0">{fmtFull(r.proposedAt)}</dd>
            </>
          )}
        </dl>
      </div>
      <div className="flex flex-col gap-4">
        <Input label="Новое время" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        <Input label="Комментарий ученику" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Необязательно" />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => m.mutate('APPROVED')} loading={m.isPending && m.variables === 'APPROVED'}>
            Перенести
          </Button>
          <Button variant="secondary" onClick={() => m.mutate('DECLINED')} loading={m.isPending && m.variables === 'DECLINED'}>
            Отклонить
          </Button>
        </div>
        {m.error && <p className="t-caption text-ember-text">{(m.error as Error).message}</p>}
      </div>
    </li>
  );
}

export default function TeachRequests() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Переносы" lead="Если согласны — выберите время и нажмите «Перенести». Занятие сдвинется, ученик увидит ответ в кабинете." />
      <RescheduleList endpoint="/teacher/reschedules" queryKey={['teacher', 'reschedules']} />
    </div>
  );
}
