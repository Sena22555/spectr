import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CalendarDays, Check, Flame, MessageCircle, NotebookPen, Plus, Send, Sparkles, UserRound } from 'lucide-react';
import { ProgressView } from '../../components/practice/ProgressView';
import { Button, ButtonLink, Chip, Empty, ErrorNote, Monogram, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDay, fmtFull, fmtTime, plural, relativeDay, untilLabel } from '../../lib/format';
import { haptic } from '../../lib/platform';
import type { Progress } from '../../lib/progress';
import { usePageTitle } from '../../lib/title';

interface ChildSummary {
  child: { id: string; name: string; avatarUrl: string | null };
  groups: { id: string; name: string; hue: number }[];
  upcoming: { id: string; title: string; startsAt: string; durationMin: number; teacher: string; group: string | null; hue: number }[];
  past: { id: string; title: string; startsAt: string; status: string; teacher: string }[];
  homework: { id: string; title: string; teacher: string; dueAt: string | null; createdAt: string; tasks: number; complete: boolean; started: boolean; overdue: boolean; comment: string | null }[];
  progress: Progress;
}
interface FamilyData {
  children: ChildSummary[];
  messengers: { telegram: boolean; max: boolean };
}

const first = (name: string) => name.split(' ')[0] ?? name;

/** Кабинет родителя: расписание, домашка, слово преподавателя и практика каждого ребёнка. */
export default function Family() {
  const q = useQuery({ queryKey: ['family'], queryFn: () => api<FamilyData>('/family') });
  const [params, setParams] = useSearchParams();
  const children = q.data?.children ?? [];
  const active = children.find((c) => c.child.id === params.get('child')) ?? children[0];
  usePageTitle(active ? `Кабинет родителя: ${first(active.child.name)}` : 'Кабинет родителя');

  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <Chip hue={4} icon={<UserRound />}>
          кабинет родителя
        </Chip>
        <h1 className="t-display t-lg">{active ? <><mark>{first(active.child.name)}</mark>: как идут дела</> : <>Добавьте <mark>ребёнка</mark></>}</h1>
        {children.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Дети">
            {children.map((c, i) => (
              <button
                key={c.child.id}
                role="tab"
                aria-selected={c.child.id === active?.child.id}
                onClick={() => setParams({ child: c.child.id }, { replace: true })}
                className={clsx('press inline-flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-[15px] font-[550]', c.child.id === active?.child.id ? 'bg-ink text-paper' : 'border border-ink/30 hover:bg-ink/[0.06]')}
              >
                <Monogram name={c.child.name} hue={i + 3} photoUrl={c.child.avatarUrl} size="sm" className="!size-8 rounded-full !text-[13px]" />
                {first(c.child.name)}
              </button>
            ))}
          </div>
        )}
      </header>

      {active ? <ChildView c={active} /> : <NoChildren />}

      <Messengers linked={q.data.messengers} hasChildren={children.length > 0} />

      {children.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-dashed border-hair-soft pt-6">
          <h2 className="t-heading text-[20px]">Ещё один ребёнок учится в «Спектре»?</h2>
          <AddChild compact />
        </section>
      )}
    </div>
  );
}

function ChildView({ c }: { c: ChildSummary }) {
  const now = Date.now();
  const upcoming = c.upcoming.filter((l) => new Date(l.startsAt).getTime() > now - 60 * 60_000);
  const next = upcoming[0];
  const hwDone = c.homework.filter((h) => h.complete).length;
  const comments = c.homework.filter((h) => h.comment);
  // занятия, сгруппированные по дням
  const days: { key: string; items: typeof upcoming }[] = [];
  for (const l of upcoming) {
    const key = new Date(l.startsAt).toDateString();
    const d = days.find((x) => x.key === key);
    if (d) d.items.push(l);
    else days.push({ key, items: [l] });
  }
  const name = first(c.child.name);

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Коротко">
        <Stat hue={5} icon={<CalendarDays />} big={next ? fmtTime(next.startsAt) : '—'} label={next ? `${relativeDay(next.startsAt).toLowerCase()}: ${next.title}` : 'ближайших занятий пока нет'} sub={next ? untilLabel(next.startsAt) : undefined} />
        <Stat hue={3} icon={<NotebookPen />} big={c.homework.length ? `${hwDone}/${c.homework.length}` : '—'} label="домашек сдано" sub={c.homework.length ? undefined : 'заданий пока не было'} />
        <Stat hue={1} icon={<Flame />} big={String(c.progress.streak)} label={`${plural(c.progress.streak, 'день', 'дня', 'дней')} подряд с задачами`} sub={c.progress.bestStreak > c.progress.streak ? `рекорд — ${c.progress.bestStreak}` : undefined} />
        <Stat
          hue={6}
          icon={<Sparkles />}
          big={String(c.progress.solvedWeek)}
          label={`${plural(c.progress.solvedWeek, 'задача', 'задачи', 'задач')} за неделю`}
          sub={`${c.progress.english.week ? `английский: ${c.progress.english.week} ${plural(c.progress.english.week, 'урок', 'урока', 'уроков')} · ` : ''}дней с практикой: ${c.progress.activeDays7} из 7`}
        />
      </section>

      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr]">
        <section className="flex flex-col gap-4" aria-labelledby="sched">
          <h2 id="sched" className="t-display t-md">
            Расписание
          </h2>
          {days.length ? (
            <ol className="m-0 flex list-none flex-col gap-5 p-0">
              {days.map((d) => (
                <li key={d.key} className="flex flex-col gap-2">
                  <p className="t-mono text-[12.5px] text-muted">
                    {relativeDay(d.items[0]!.startsAt)} · {fmtDay(d.items[0]!.startsAt)}
                  </p>
                  {d.items.map((l) => (
                    <div key={l.id} className={clsx(`hue-${l.hue % 7}`, 'grid grid-cols-[64px_1fr] items-start gap-3 rounded-[12px] bg-tint px-4 py-3')}>
                      <span className="t-heading tnum text-[20px] leading-tight">{fmtTime(l.startsAt)}</span>
                      <span className="flex flex-col">
                        <span className="text-[16.5px] font-[600]">{l.title}</span>
                        <span className="text-[14px] text-ink/75">
                          {l.teacher}
                          {l.group ? ` · группа «${l.group}»` : ' · индивидуально'} · {l.durationMin} мин
                        </span>
                      </span>
                    </div>
                  ))}
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-[12px] bg-bone px-4 py-3 text-[15.5px] text-muted">На ближайшие две недели занятий нет. Когда преподаватель их назначит, они появятся здесь и в боте.</p>
          )}
          {c.past.length > 0 && (
            <details className="text-[15px]">
              <summary className="link w-fit cursor-pointer">Прошедшие занятия за месяц ({c.past.length})</summary>
              <ul className="m-0 mt-2 flex list-none flex-col p-0">
                {c.past.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 border-b border-dashed border-hair-soft py-2">
                    <span>{l.title}</span>
                    <span className="t-mono text-[12px] text-muted">{l.status === 'CANCELLED' ? 'отменено' : fmtFull(l.startsAt)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="flex flex-col gap-4" aria-labelledby="hw">
          <h2 id="hw" className="t-display t-md">
            Домашка
          </h2>
          {c.homework.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {c.homework.map((h) => (
                <li key={h.id} className="flex flex-col gap-1 rounded-[12px] border-[1.5px] border-ink/12 bg-paper px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[16px] font-[600]">{h.title}</span>
                    <HwState h={h} />
                  </div>
                  <span className="text-[13.5px] text-muted">
                    {h.teacher}
                    {h.dueAt ? ` · срок ${fmtFull(h.dueAt)}` : ''}
                    {h.tasks ? ` · ${h.tasks} ${plural(h.tasks, 'задание', 'задания', 'заданий')} с проверкой` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[12px] bg-bone px-4 py-3 text-[15.5px] text-muted">Домашних заданий за последние недели не было.</p>
          )}
          {comments.length > 0 && (
            <div className="flex flex-col gap-2 pt-2">
              <h3 className="t-heading inline-flex items-center gap-2 text-[19px]">
                <MessageCircle className="size-5" /> Слово преподавателя
              </h3>
              {comments.slice(0, 3).map((h) => (
                <figure key={h.id} className="m-0 rounded-[12px] bg-butter px-4 py-3">
                  <blockquote className="m-0 text-[16px]">«{h.comment}»</blockquote>
                  <figcaption className="t-mono pt-1 text-[12px] text-muted">
                    {h.teacher} · к заданию «{h.title}»
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="practice">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="practice" className="t-display t-md">
            Самостоятельная практика
          </h2>
          <p className="max-w-[48ch] text-[14.5px] text-muted">Задачи, которые {name} решает сам(а) в практикуме, тренажёрах и боте: что получается и что стоит подтянуть.</p>
        </div>
        <ProgressView p={c.progress} forParent />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-[14px] bg-bone p-5">
        <p className="mr-auto max-w-[52ch] text-[15.5px]">Хотите добавить предмет, сменить время или обсудить успехи с преподавателем?</p>
        <ButtonLink to={`/book?note=${encodeURIComponent(`Родитель ученика ${c.child.name}`)}`}>Записать на занятие</ButtonLink>
        <ButtonLink to="/app/support" variant="secondary">
          Написать в школу
        </ButtonLink>
        <Unlink childId={c.child.id} name={name} />
      </section>
    </div>
  );
}

function Stat({ hue, icon, big, label, sub }: { hue: number; icon: React.ReactNode; big: string; label: string; sub?: string }) {
  return (
    <div className={clsx(`hue-${hue}`, 'flex flex-col gap-1 rounded-[14px] bg-tint p-5')}>
      <span className="grid size-8 place-items-center rounded-[7px] bg-forest text-mark [&>svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <span className="t-display tnum pt-1 text-[34px] leading-none">{big}</span>
      <span className="text-[15px] text-ink">{label}</span>
      {sub && <span className="t-mono text-[12px] text-hue">{sub}</span>}
    </div>
  );
}

function HwState({ h }: { h: ChildSummary['homework'][number] }) {
  if (h.complete)
    return (
      <span className="t-mono inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--tint-raw-3)] px-2.5 py-0.5 text-[12px] text-[var(--ink-3)]">
        <Check className="size-3.5" /> сдано
      </span>
    );
  if (h.overdue) return <span className="t-mono shrink-0 rounded-full bg-butter px-2.5 py-0.5 text-[12px] text-[var(--ink-2)]">ждёт сдачи</span>;
  return <span className="t-mono shrink-0 rounded-full bg-bone px-2.5 py-0.5 text-[12px] text-muted">{h.started ? 'в работе' : 'не начато'}</span>;
}

function Unlink({ childId, name }: { childId: string; name: string }) {
  const qc = useQueryClient();
  const [ask, setAsk] = useState(false);
  const m = useMutation({
    mutationFn: () => api(`/family/children/${childId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family'] }),
  });
  if (!ask)
    return (
      <button type="button" className="link text-[14px] text-muted" onClick={() => setAsk(true)}>
        Отвязать
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-[14px]">
      Убрать {name} из кабинета?
      <Button variant="secondary" loading={m.isPending} onClick={() => m.mutate()}>
        Да
      </Button>
      <button type="button" className="link" onClick={() => setAsk(false)}>
        Нет
      </button>
    </span>
  );
}

function NoChildren() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
      <Empty title="Привяжите ребёнка — это минута" hue={4}>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {['Ребёнок входит в «Спектр» и открывает Профиль → «Родители».', 'Нажимает «Получить код» — появится код из 6 символов.', 'Вы вводите код здесь — и видите расписание, домашку и успехи.'].map((s, i) => (
            <li key={s} className="flex items-start gap-3">
              <span className="t-mono grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] text-mark">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </Empty>
      <div className="flex flex-col gap-4">
        <AddChild />
        <p className="text-[15px] text-muted">
          Ребёнок ещё не учится в «Спектре»?{' '}
          <Link to="/book" className="link">
            Запишите на занятие
          </Link>{' '}
          или начните с{' '}
          <Link to="/practice/check/math" className="link">
            бесплатной проверки уровня
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function AddChild({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ childId: string; roleChanged: boolean }>('/family/claim', { method: 'POST', json: { code } }),
    onSuccess: (r) => {
      haptic('success');
      setCode('');
      if (r.roleChanged) refresh();
      void qc.invalidateQueries({ queryKey: ['family'] });
    },
    onError: () => haptic('error'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <form onSubmit={submit} className={clsx('flex flex-col gap-3', !compact && 'rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5')}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[15px] font-[600]">Код ребёнка</span>
        <span className="flex flex-wrap gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            placeholder="K7Q2MX"
            autoComplete="off"
            spellCheck={false}
            className="t-heading h-12 w-[11ch] rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 text-center text-[22px] tracking-[0.18em] uppercase focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
          />
          <Button type="submit" loading={m.isPending} disabled={code.length !== 6}>
            <Plus className="size-4" /> Добавить
          </Button>
        </span>
      </label>
      {m.error && <p className="rounded-[8px] bg-butter px-3 py-2 text-[14.5px]">{(m.error as Error).message}</p>}
      {m.isSuccess && <p className="text-[14.5px] text-[var(--ink-3)]">Готово! Ребёнок добавлен.</p>}
    </form>
  );
}

function Messengers({ linked, hasChildren }: { linked: { telegram: boolean; max: boolean }; hasChildren: boolean }) {
  const link = useMutation({
    mutationFn: (platform: 'telegram' | 'max') => api<{ url: string }>(`/auth/link/${platform}/start`, { method: 'POST', json: {} }),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
  const any = linked.telegram || linked.max;
  return (
    <section className={clsx('grid gap-5 rounded-[14px] p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center', any ? 'bg-bone' : 'bg-forest-2 text-cream')}>
      <div className="flex flex-col gap-3">
        <p className={clsx('t-mono inline-flex items-center gap-2 text-[12px]', any ? 'text-muted' : 'text-mark')}>
          <Bell className="size-4" /> {any ? `сводки приходят в ${[linked.telegram && 'Telegram', linked.max && 'MAX'].filter(Boolean).join(' и ')}` : 'сводки в мессенджер'}
        </p>
        <p className="t-display text-[clamp(22px,3vw,30px)] leading-tight">{any ? 'Бот уже на связи' : 'Узнавайте главное, не заходя на сайт'}</p>
        <ul className={clsx('m-0 flex list-none flex-col gap-1.5 p-0 text-[15.5px]', any ? 'text-ink/85' : 'text-cream/85')}>
          <li>☀️ утром — какие сегодня занятия и что сдать</li>
          <li>⏰ за 15 минут — напоминание об уроке</li>
          <li>✅ когда ребёнок сдал домашку и что сказал преподаватель</li>
          <li>📊 в воскресенье — итог недели</li>
        </ul>
        {!hasChildren && any && <p className="text-[14px] text-muted">Сводки начнут приходить, как только вы добавите ребёнка.</p>}
      </div>
      {!(linked.telegram && linked.max) && (
        <div className="flex flex-col gap-3 lg:items-end">
          {!linked.telegram && (
            <Button variant={any ? 'secondary' : 'banner'} loading={link.isPending && link.variables === 'telegram'} onClick={() => link.mutate('telegram')}>
              <Send className="size-4" /> Подключить Telegram
            </Button>
          )}
          {!linked.max && (
            <Button variant={any ? 'secondary' : 'ghost'} className={any ? '' : 'text-cream'} loading={link.isPending && link.variables === 'max'} onClick={() => link.mutate('max')}>
              Подключить MAX
            </Button>
          )}
          {link.error && <p className="text-[14px]">{(link.error as Error).message}</p>}
        </div>
      )}
    </section>
  );
}
