import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { Avatar, Button, ErrorNote, Loading, Textarea } from '../../components/ui';
import { StageBadge, type Person } from './People';

interface Card {
  person: Person;
  details: {
    email?: string | null;
    phone?: string | null;
    role?: string;
    groups?: { name: string; slug: string }[];
    bookings?: { id: string; status: string; createdAt: string; contact: string; comment: string | null; course: { title: string } | null }[];
    tickets?: { id: string; subject: string; status: string; createdAt: string }[];
    lessons?: { id: string; title: string; startsAt: string; status: string; teacher: string }[];
    platform?: string;
    username?: string | null;
    rainbows?: number;
    streak?: number;
    dailyStreak?: number;
    dailySolved?: number;
    invited?: number;
    colorTest?: string | null;
  };
  visitors: { id: string; platform: string; device: string | null; source: string; referrer: string | null; utm: string | null; landing: string | null; visits: number; views: number; firstSeen: string; lastSeen: string }[];
  timeline: { at: string; type: string; text: string; detail: string | null; count: number }[];
  canMessage: boolean;
}

const DOT: Record<string, number> = { booking: 1, register: 3, practice_solve: 5, bot_start: 4, visit: 2, admin_message: 6, diagnostic_done: 5 };

export default function AdminPerson() {
  const { kind = '', id = '' } = useParams();
  const q = useQuery({ queryKey: ['admin', 'person', kind, id], queryFn: () => api<Card>(`/admin/people/${kind}/${encodeURIComponent(id)}`) });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const { person: p, details: d, visitors, timeline, canMessage } = q.data;

  return (
    <div className="flex flex-col gap-10">
      <Link to="/admin/people" className="link inline-flex w-fit items-center gap-1.5 text-[15px]">
        <ArrowLeft className="size-4" /> Все люди
      </Link>
      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={p.name} className="size-16 text-[22px]" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="t-display t-lg [overflow-wrap:anywhere]">{p.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted">
            <StageBadge stage={p.stage} />
            {p.contact && <span>{p.contact}</span>}
            {d.phone && d.phone !== p.contact && <span>{d.phone}</span>}
            <span>· {p.sourceLabel}</span>
          </p>
        </div>
      </header>

      <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Первый визит', fmtFull(p.firstSeen)],
          ['Был последний раз', fmtFull(p.lastSeen)],
          ['Просмотров', p.views],
          ['Решено задач', p.solved],
          ['Заявок', p.bookings],
          ['Действий в боте', p.botActions],
          ['Каналы', p.channels.join(', ') || '—'],
          ['Интересы', p.interests.join(', ') || '—'],
        ].map(([label, value]) => (
          <div key={label as string} className="flex flex-col gap-1 rounded-[10px] bg-bone px-4 py-3">
            <dt className="t-mono text-[11px] text-muted">{label}</dt>
            <dd className="m-0 text-[16px] font-[550] [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>

      {canMessage ? <Message kind={kind} id={id} name={p.name} /> : p.kind !== 'visitor' && <p className="text-[15px] text-muted">У человека не подключён бот — написать можно только по контакту выше.</p>}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <h2 className="t-display t-md">Что делал</h2>
          {!timeline.length && <p className="text-muted">Событий пока нет.</p>}
          <ol className="m-0 flex list-none flex-col p-0">
            {timeline.map((e, i) => (
              <li key={i} className={`hue-${DOT[e.type] ?? 4} grid grid-cols-[14px_minmax(0,1fr)] gap-3 border-l border-hair-soft pb-4 pl-0`}>
                <span className="-ml-[7px] mt-1.5 size-3 rounded-full border-2 border-paper bg-ray" aria-hidden="true" />
                <div className="flex flex-col">
                  <p className="text-[15.5px]">
                    <b className="font-[600]">{e.text}</b>
                    {e.count > 1 && <span className="t-mono ml-1.5 text-[11px] text-muted">×{e.count}</span>}
                    {e.detail && <span className="text-muted"> — {e.detail}</span>}
                  </p>
                  <p className="t-mono text-[11px] text-muted">{fmtFull(e.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="flex flex-col gap-6">
          {d.bookings && d.bookings.length > 0 && (
            <Block title="Заявки">
              {d.bookings.map((b) => (
                <p key={b.id} className="text-[15px]">
                  {b.course?.title ?? 'Без предмета'} · <b>{STATUS_LABEL[b.status] ?? b.status}</b>
                  <span className="t-caption block text-muted">{fmtFull(b.createdAt)}</span>
                </p>
              ))}
              <Link to="/admin/bookings" className="link text-[14px]">
                К заявкам
              </Link>
            </Block>
          )}
          {d.lessons && d.lessons.length > 0 && (
            <Block title="Занятия">
              {d.lessons.slice(0, 8).map((l) => (
                <p key={l.id} className="text-[15px]">
                  {l.title}
                  <span className="t-caption block text-muted">
                    {fmtFull(l.startsAt)} · {l.teacher} · {STATUS_LABEL[l.status]}
                  </span>
                </p>
              ))}
            </Block>
          )}
          {d.groups && d.groups.length > 0 && <Block title="Группы">{d.groups.map((g) => <p key={g.slug}>{g.name}</p>)}</Block>}
          {d.tickets && d.tickets.length > 0 && (
            <Block title="Обращения">
              {d.tickets.map((t) => (
                <p key={t.id} className="text-[15px]">
                  {t.subject} · {STATUS_LABEL[t.status]}
                </p>
              ))}
              <Link to="/admin/tickets" className="link text-[14px]">
                К поддержке
              </Link>
            </Block>
          )}
          {p.kind === 'player' && (
            <Block title="В боте">
              <p>Радуг собрано: {d.rainbows ?? 0}</p>
              <p>Задач дня решено: {d.dailySolved ?? 0}, серия {d.dailyStreak ?? 0}</p>
              <p>Привёл друзей: {d.invited ?? 0}</p>
              {d.colorTest && <p>Тест «Какой ты цвет»: {d.colorTest}</p>}
            </Block>
          )}
          {visitors.length > 0 && (
            <Block title="Устройства и источники">
              {visitors.map((v) => (
                <div key={v.id} className="flex flex-col text-[14.5px]">
                  <p>
                    {v.platform === 'web' ? (v.device === 'mobile' ? 'Сайт с телефона' : 'Сайт с компьютера') : v.platform} · {v.source}
                  </p>
                  <p className="t-caption text-muted">
                    визитов {v.visits}, просмотров {v.views}
                    {v.landing ? ` · вход: ${v.landing}` : ''}
                    {v.utm ? ` · utm: ${v.utm}` : ''}
                    {v.referrer ? ` · пришёл с ${v.referrer}` : ''}
                  </p>
                </div>
              ))}
            </Block>
          )}
          {p.kind === 'user' && (
            <Link to="/admin/users" className="link text-[15px]">
              Изменить роль в «Люди и роли»
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-[12px] border-[1.5px] border-ink/15 bg-paper p-4">
      <h3 className="t-mono mb-1 text-[11px] text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Message({ kind, id, name }: { kind: string; id: string; name: string }) {
  const [text, setText] = useState('');
  const send = useMutation({ mutationFn: () => api(`/admin/people/${kind}/${encodeURIComponent(id)}/message`, { method: 'POST', json: { text } }), onSuccess: () => setText('') });
  return (
    <section className="flex flex-col gap-3 rounded-[14px] bg-bone p-5">
      <Textarea label={`Написать ${name.split(' ')[0]} в мессенджер`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: Здравствуйте! Видим, вы решали задачи по физике — хотите разобрать сложные темы с преподавателем?" />
      {send.error && <p className="t-caption text-ember-text">{(send.error as Error).message}</p>}
      {send.isSuccess && (
        <p className="t-caption" role="status">
          ✅ Отправлено
        </p>
      )}
      <Button className="w-fit" disabled={!text.trim()} loading={send.isPending} onClick={() => send.mutate()}>
        <Send className="size-4" /> Отправить через бота
      </Button>
    </section>
  );
}
