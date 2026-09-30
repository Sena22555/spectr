import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { haptic } from '../../lib/platform';
import { Badge, Button, Empty, ErrorNote, Input, Loading, PageHeader, SectionTitle, Textarea } from '../../components/ui';
import type { Ticket } from '../../lib/types';

const TOPICS = ['Не вижу ссылку на занятие', 'Хочу сменить преподавателя', 'Вопрос по расписанию', 'Проблема со входом'];

export default function Support() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ tickets: Ticket[] }>('/me/tickets').then((r) => r.tickets) });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () => api<{ ticket: Ticket }>('/me/tickets', { method: 'POST', json: { subject, body } }),
    onSuccess: ({ ticket }) => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/app/support/${ticket.id}`);
    },
  });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Поддержка" lead="Напишите, что случилось. Ответ придёт сюда же — в ветку обращения." />

      <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <form
          className="hue-4 flex flex-col gap-5 rounded-[16px] bg-tint p-5 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2 className="t-heading text-[28px]">Новое обращение</h2>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSubject(t)}
                className="press rounded-[6px] border border-ink/35 bg-paper/50 px-3 py-2 text-[15px] hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper"
                aria-pressed={subject === t}
              >
                {t}
              </button>
            ))}
          </div>
          <Input label="Тема" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} />
          <Textarea label="Сообщение" value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Опишите ситуацию: какое занятие, что не так" />
          {create.error && <p className="t-caption text-ember-text">{(create.error as Error).message}</p>}
          <Button type="submit" loading={create.isPending} className="self-start">
            Отправить
          </Button>
        </form>

        <div>
          <SectionTitle>Мои обращения</SectionTitle>
          {tickets.isPending && <Loading />}
          {tickets.error && <ErrorNote error={tickets.error} />}
          {tickets.data?.length === 0 && (
            <div className="mt-6">
              <Empty title="Обращений нет">Здесь появятся ваши вопросы и ответы поддержки.</Empty>
            </div>
          )}
          <ul className="m-0 list-none p-0">
            {tickets.data?.map((t) => (
              <li key={t.id}>
                <Link to={`/app/support/${t.id}`} className="grid grid-cols-[1fr_auto] gap-2 border-b border-hair-soft py-4 no-underline hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]">
                  <span className="flex flex-col gap-1">
                    <span className="text-[18px] font-[450]">{t.subject}</span>
                    <span className="t-caption line-clamp-1 text-muted">{t.messages[0]?.body}</span>
                    <span className="t-caption text-muted">{fmtFull(t.updatedAt)}</span>
                  </span>
                  <Badge tone={t.status === 'ANSWERED' ? 'ember' : 'outline'}>{STATUS_LABEL[t.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
