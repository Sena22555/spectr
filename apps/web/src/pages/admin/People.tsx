import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ChevronRight, Megaphone, Search, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDay, plural } from '../../lib/format';
import { Avatar, Button, ErrorNote, Loading, PageHeader, Textarea } from '../../components/ui';

export interface Person {
  kind: 'user' | 'player' | 'visitor';
  id: string;
  name: string;
  contact: string | null;
  role: string | null;
  channels: string[];
  chats: string[];
  source: string;
  sourceLabel: string;
  firstSeen: string;
  lastSeen: string;
  views: number;
  solved: number;
  botActions: number;
  bookings: number;
  lastBookingStatus: string | null;
  isStudent: boolean;
  stage: string;
  interests: string[];
}

type Segment = 'warm' | 'booked' | 'practice' | 'students' | 'bot' | 'anon' | 'all';

const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: 'warm', label: 'Смотрели, но не записались', hint: 'Заходили несколько раз, решали задачи или играли в боте — но заявку не оставили. Им стоит написать первыми.' },
  { key: 'booked', label: 'Оставили заявку', hint: 'Заявка есть, но занятий пока нет. Проверьте, что с каждым связались.' },
  { key: 'practice', label: 'Решают задачи', hint: 'Пользуются бесплатным практикумом, но ещё не учатся в школе.' },
  { key: 'students', label: 'Учатся', hint: 'У человека есть занятия или группа.' },
  { key: 'bot', label: 'Только в ботах', hint: 'Запустили бота, но ещё не входили на сайт. Написать им можно прямо отсюда.' },
  { key: 'anon', label: 'Анонимные гости', hint: 'Заходили на сайт без входа. Контактов нет, но видно, что смотрели.' },
  { key: 'all', label: 'Все', hint: 'Все аккаунты, игроки ботов и гости, заходившие больше одного раза.' },
];

const timeAgo = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(1, min)} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} ${plural(d, 'день', 'дня', 'дней')} назад` : fmtDay(iso);
};

export default function AdminPeople() {
  const [segment, setSegment] = useState<Segment>('warm');
  const [q, setQ] = useState('');
  const [broadcast, setBroadcast] = useState(false);
  const people = useQuery({
    queryKey: ['admin', 'people', segment, q],
    queryFn: () => api<{ people: Person[]; counts: Record<Segment, number> }>(`/admin/people?${new URLSearchParams({ segment, ...(q ? { q } : {}) })}`),
    placeholderData: keepPreviousData,
  });
  const current = SEGMENTS.find((s) => s.key === segment)!;
  const canBroadcast = segment !== 'anon';

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Люди и воронка"
        lead="Каждый, кто приходил: с сайта, из мини-приложений и ботов. Откройте человека — увидите, что он смотрел, и сможете написать ему в мессенджер."
        actions={
          canBroadcast && (
            <Button variant="secondary" onClick={() => setBroadcast((v) => !v)} aria-expanded={broadcast}>
              <Megaphone className="size-4" /> Рассылка
            </Button>
          )
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Сегменты">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={clsx('press shrink-0 rounded-full px-4 py-2 text-[14px] whitespace-nowrap', segment === s.key ? 'bg-ink text-paper' : 'border border-ink/30 hover:bg-ink/[0.06]')}
          >
            {s.label}
            {people.data && <span className={clsx('tnum ml-2 text-[12px]', segment === s.key ? 'text-mark' : 'text-muted')}>{people.data.counts[s.key]}</span>}
          </button>
        ))}
      </div>
      <p className="-mt-4 max-w-[70ch] text-[15px] text-muted">{current.hint}</p>

      <AnimatePresence initial={false}>
        {broadcast && canBroadcast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Broadcast segment={segment} label={current.label} onDone={() => setBroadcast(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <label className="relative">
        <span className="sr-only">Поиск по имени или контакту</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" strokeWidth={1.7} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, почта, @ник" className="h-11 w-full rounded-ctl border border-ink/40 bg-paper pr-3 pl-9 text-[16px] placeholder:text-muted" />
      </label>

      {people.isPending && <Loading />}
      {people.error && <ErrorNote error={people.error} onRetry={() => people.refetch()} />}
      {people.data && !people.data.people.length && <p className="py-8 text-center text-muted">В этом сегменте пока никого.</p>}

      <ul className={clsx('m-0 flex list-none flex-col p-0 transition-opacity', people.isFetching && 'opacity-60')}>
        {people.data?.people.map((p) => (
          <li key={`${p.kind}:${p.id}`}>
            <Link to={`/admin/people/${p.kind}/${encodeURIComponent(p.id)}`} className="press grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-hair-soft py-3.5 no-underline hover:bg-ink/[0.03]">
              <Avatar name={p.name} className="size-10 text-[14px]" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 text-[16.5px] font-[500]">
                  <span className="[overflow-wrap:anywhere]">{p.name}</span>
                  <StageBadge stage={p.stage} />
                </p>
                <p className="t-caption flex flex-wrap gap-x-3 text-muted">
                  {p.contact && <span>{p.contact}</span>}
                  <span>{p.sourceLabel}</span>
                  {p.channels.length > 0 && <span>{p.channels.join(', ')}</span>}
                  {p.interests.length > 0 && <span>интересы: {p.interests.join(', ')}</span>}
                </p>
                <p className="t-mono flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {p.views > 0 && <span>просмотров {p.views}</span>}
                  {p.solved > 0 && <span>задач {p.solved}</span>}
                  {p.botActions > 0 && <span>действий в боте {p.botActions}</span>}
                  {p.bookings > 0 && <span>заявок {p.bookings}</span>}
                </p>
              </div>
              <span className="flex items-center gap-2 text-right">
                <span className="t-caption hidden text-muted sm:inline">{timeAgo(p.lastSeen)}</span>
                <ChevronRight className="size-4 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const hue = stage === 'Учится' ? 3 : stage === 'Оставил заявку' ? 1 : stage === 'Решает задачи' ? 5 : stage === 'Присматривается' ? 2 : 4;
  return <span className={`hue-${hue} t-mono rounded-full bg-tint px-2 py-0.5 text-[11px] text-hue`}>{stage.toLowerCase()}</span>;
}

function Broadcast({ segment, label, onDone }: { segment: Segment; label: string; onDone(): void }) {
  const [text, setText] = useState('');
  const seg = segment === 'anon' ? 'all' : segment;
  const dry = useQuery({ queryKey: ['admin', 'broadcast-dry', seg], queryFn: () => api<{ recipients: number }>('/admin/broadcast', { method: 'POST', json: { segment: seg, text: '·', dry: true } }) });
  const send = useMutation({ mutationFn: () => api<{ recipients: number; sent: number }>('/admin/broadcast', { method: 'POST', json: { segment: seg, text } }) });
  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-bone p-5 sm:p-6">
      <p className="t-heading text-[20px]">Рассылка: «{label}»</p>
      <p className="text-[15px] text-muted">
        Сообщение уйдёт в Telegram и MAX тем, у кого подключён бот:{' '}
        <b className="text-ink">
          {dry.data?.recipients ?? '…'} {plural(dry.data?.recipients ?? 0, 'человек', 'человека', 'человек')}
        </b>
        . Пишите по делу: например, пригласите на пробную диагностику или напомните о задаче дня.
      </p>
      {send.isSuccess ? (
        <p className="text-[16px]" role="status">
          ✅ Отправлено: {send.data.sent} из {send.data.recipients}.
        </p>
      ) : (
        <>
          <Textarea label="Текст" value={text} onChange={(e) => setText(e.target.value)} placeholder="Здравствуйте! В «Спектре» открылась новая мини-группа по физике…" />
          {send.error && <p className="t-caption text-ember-text">{(send.error as Error).message}</p>}
          <div className="flex flex-wrap gap-3">
            <Button disabled={!text.trim() || !dry.data?.recipients} loading={send.isPending} onClick={() => confirm(`Отправить ${dry.data?.recipients} людям?`) && send.mutate()}>
              <Send className="size-4" /> Отправить
            </Button>
            <Button variant="ghost" onClick={onDone}>
              Отмена
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
