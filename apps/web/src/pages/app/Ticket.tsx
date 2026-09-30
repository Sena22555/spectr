import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { Badge, Button, ErrorNote, Loading, Textarea } from '../../components/ui';
import type { Ticket as TicketT, TicketMessage } from '../../lib/types';

export function Thread({ messages, meId }: { messages: TicketMessage[]; meId?: string }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {messages.map((m) => {
        const mine = m.author.id === meId;
        return (
          <li key={m.id} className={clsx('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
            <div className={clsx('max-w-[46ch] rounded-card px-4 py-3 text-[17px] leading-snug', mine ? 'bg-bone' : 'hue-4 bg-tint')}>{m.body}</div>
            <p className="t-caption text-muted">
              {mine ? 'Вы' : m.author.role === 'STUDENT' ? m.author.name : `${m.author.name} · поддержка`} · {fmtFull(m.createdAt)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function Ticket() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<{ ticket: TicketT }>(`/me/tickets/${id}`).then((r) => r.ticket) });
  const send = useMutation({
    mutationFn: () => api(`/me/tickets/${id}/messages`, { method: 'POST', json: { body } }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['ticket', id] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const t = q.data;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Link to="/app/support" className="link inline-flex w-fit items-center gap-1.5 text-[16px]">
        <ArrowLeft className="size-4" strokeWidth={1.7} /> Все обращения
      </Link>
      <header className="flex flex-col gap-3 border-b border-charcoal pb-5">
        <Badge tone={t.status === 'ANSWERED' ? 'ember' : 'outline'} className="w-fit">
          {STATUS_LABEL[t.status]}
        </Badge>
        <h1 className="t-heading t-lg">{t.subject}</h1>
      </header>
      <Thread messages={t.messages} meId={user?.id} />
      {t.status !== 'CLOSED' && (
        <form
          className="flex flex-col gap-3 border-t border-charcoal pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Textarea label="Ответить" value={body} onChange={(e) => setBody(e.target.value)} required />
          {send.error && <p className="t-caption text-ember-text">{(send.error as Error).message}</p>}
          <Button type="submit" loading={send.isPending} className="self-start">
            Отправить
          </Button>
        </form>
      )}
    </div>
  );
}
