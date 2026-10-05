import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Award, Check, ChevronDown, Clock, Medal, Trophy } from 'lucide-react';
import { Container } from '../../components/Layout';
import { RichText } from '../../components/Tex';
import { Button, ButtonLink, Chip, ErrorNote, Input, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { saveNick, savedNick } from '../../lib/nick';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';
import { usePageTitle } from '../../lib/title';

interface Info {
  week: { key: string; monday: string; sunday: string };
  tasks: number;
  minutes: number;
  leagues: { key: string; title: string; grades: [number, number]; players: number }[];
  mine: { id: string; league: string; finished: boolean; score: number }[];
}
interface TProblem {
  id: string;
  title: string;
  subject: string;
  text: string;
  unit: string | null;
  kind: string;
}
interface Started {
  entry: { id: string; name: string; startedAt: string; finished: boolean; score: number };
  leftMs: number;
  problems: TProblem[];
}
interface Finished {
  entry: { id: string; name: string; score: number; timeMs: number; place: number };
  results: { id: string; title: string; text: string; answer: string; given: string; correct: boolean; steps: string[]; theory: string | null; trainer: string }[];
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const fmtDate = (iso: string) => dayMonth.format(new Date(`${iso}T12:00:00`));
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const SUBJECT_HUE: Record<string, number> = { math: 1, physics: 5, informatics: 3 };

export default function Tournament() {
  usePageTitle('Турнир недели');
  const [params, setParams] = useSearchParams();
  const info = useQuery({ queryKey: ['tournament'], queryFn: () => api<Info>('/tournament') });
  const league = params.get('league') ?? '';
  const [run, setRun] = useState<Started | null>(null);
  const [result, setResult] = useState<Finished | null>(null);

  if (info.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (info.error)
    return (
      <Container className="py-10">
        <ErrorNote error={info.error} onRetry={() => info.refetch()} />
      </Container>
    );
  const i = info.data;
  const current = i.leagues.find((l) => l.key === league);

  return (
    <Container className={clsx('flex max-w-[960px] flex-col gap-10', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <header className="flex flex-col gap-4">
        <Chip hue={2} icon={<Trophy />}>
          бесплатно · раз в неделю
        </Chip>
        <h1 className="t-display t-lg">
          Турнир недели <mark>«Спектра»</mark>
        </h1>
        <p className="t-sub max-w-[60ch] text-muted">
          {i.tasks} задач для вашего класса, {i.minutes} минут, одна попытка. Каждому участнику — сертификат, тройке лидеров — грамота победителя. Новый турнир — каждый понедельник.
        </p>
        <p className="t-mono text-[12px] text-muted">
          эта неделя: {fmtDate(i.week.monday)} — {fmtDate(i.week.sunday)}
        </p>
      </header>

      {result ? (
        <Results r={result} league={current?.title ?? ''} onTable={() => setResult(null)} />
      ) : run && current ? (
        <Run started={run} league={current.key} minutes={i.minutes} onFinish={setResult} />
      ) : (
        <>
          <section className="flex flex-col gap-4" aria-labelledby="leagues">
            <h2 id="leagues" className="t-display t-md">
              Выберите лигу
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {i.leagues.map((l, idx) => {
                const mine = i.mine.find((m) => m.league === l.key);
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => setParams({ league: l.key }, { replace: true })}
                    aria-pressed={league === l.key}
                    className={clsx(
                      `hue-${[2, 1, 5, 6][idx]}`,
                      'press flex flex-col items-start gap-1 rounded-[14px] p-5 text-left',
                      league === l.key ? 'bg-tint shadow-[0_0_0_2px_var(--ink)]' : 'bg-tint/70 hover:-translate-y-0.5',
                    )}
                  >
                    <span className="t-heading text-[22px]">{l.title}</span>
                    <span className="text-[14px] text-ink/75">
                      {l.players ? `${l.players} ${plural(l.players, 'участник', 'участника', 'участников')}` : 'будьте первым'}
                    </span>
                    {mine && <span className="t-mono mt-1 rounded-full bg-paper px-2 py-0.5 text-[11px]">{mine.finished ? `ваш результат: ${mine.score}/${i.tasks}` : 'вы начали'}</span>}
                  </button>
                );
              })}
            </div>
          </section>
          {current && <LeagueBlock key={current.key} league={current} info={i} onStarted={setRun} onResult={setResult} />}
          <Rules minutes={i.minutes} tasks={i.tasks} />
        </>
      )}
    </Container>
  );
}

function LeagueBlock({ league, info, onStarted, onResult }: { league: Info['leagues'][number]; info: Info; onStarted(s: Started): void; onResult(r: Finished): void }) {
  const { user } = useAuth();
  const [name, setName] = useState(() => savedNick() || user?.name.split(' ')[0] || '');
  const mine = info.mine.find((m) => m.league === league.key);
  const board = useQuery({ queryKey: ['tournament', 'board', league.key], queryFn: () => api<{ top: { id: string; name: string; score: number; timeMs: number }[] }>(`/tournament/${league.key}/leaderboard`) });
  const start = useMutation({
    mutationFn: () => {
      saveNick(name);
      return api<Started>(`/tournament/${league.key}/start`, { method: 'POST', json: { name } });
    },
    onSuccess: (s) => (s.entry.finished ? showResult.mutate() : onStarted(s)),
  });
  const showResult = useMutation({ mutationFn: () => api<Finished>(`/tournament/${league.key}/finish`, { method: 'POST', json: { answers: {} } }), onSuccess: onResult });

  return (
    <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-4 rounded-[14px] bg-forest-2 p-6 text-cream">
        <p className="t-mono text-[12px] text-mark">лига: {league.title}</p>
        {mine?.finished ? (
          <>
            <p className="t-display text-[28px]">
              Вы уже прошли турнир: {mine.score} из {info.tasks}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="banner" loading={showResult.isPending} onClick={() => showResult.mutate()}>
                Результат и разбор
              </Button>
              <ButtonLink to={`/tournament/certificate/${mine.id}`} variant="ghost" className="text-cream">
                Сертификат
              </ButtonLink>
            </div>
            <p className="text-[14px] text-cream/75">Следующий турнир откроется в понедельник.</p>
          </>
        ) : (
          <>
            <p className="t-display text-[28px]">{mine ? 'Вы начали — можно продолжить' : 'Готовы?'}</p>
            {!mine && (
              <Input
                label="Как подписать вас в таблице"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                hint="Имя или ник. В таблице его увидят другие участники."
                className="[&_label]:text-cream [&_p]:text-cream/70"
              />
            )}
            {start.error && <p className="rounded-[8px] bg-butter px-3 py-2 text-[15px] text-forest">{(start.error as Error).message}</p>}
            <Button variant="banner" className="w-fit" loading={start.isPending} onClick={() => start.mutate()}>
              {mine ? 'Продолжить' : 'Начать турнир'}
            </Button>
            <p className="text-[14px] text-cream/75">
              {info.tasks} задач · {info.minutes} минут · ответы можно менять до конца
            </p>
          </>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="t-heading text-[22px]">Таблица лиги</h3>
        {board.data?.top.length ? (
          <ol className="m-0 flex list-none flex-col p-0">
            {board.data.top.map((e, idx) => (
              <li key={e.id} className={clsx('grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-dashed border-hair-soft py-2.5', idx < 3 && 'font-[600]')}>
                <span className="t-heading tnum text-[18px]">{idx < 3 ? ['🥇', '🥈', '🥉'][idx] : idx + 1}</span>
                <span className="[overflow-wrap:anywhere]">{e.name}</span>
                <span className="tnum text-[15px]">
                  {e.score}/{info.tasks} · {mmss(e.timeMs)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">Пока никто не прошёл турнир этой недели — станьте первым!</p>
        )}
      </div>
    </section>
  );
}

function Run({ started, league, minutes, onFinish }: { started: Started; league: string; minutes: number; onFinish(r: Finished): void }) {
  const qc = useQueryClient();
  const key = `spectr.tournament.${started.entry.id}`;
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  });
  const deadline = useMemo(() => Date.now() + started.leftMs, [started.leftMs]);
  const [left, setLeft] = useState(started.leftMs);
  const [confirm, setConfirm] = useState(false);
  const finish = useMutation({
    mutationFn: () => api<Finished>(`/tournament/${league}/finish`, { method: 'POST', json: { answers } }),
    onSuccess: (r) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ['tournament'] });
      onFinish(r);
    },
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(answers));
    } catch {
      /* ignore */
    }
  }, [answers, key]);
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, deadline - Date.now())), 500);
    return () => clearInterval(t);
  }, [deadline]);
  useEffect(() => {
    if (left === 0 && !finish.isPending && !finish.isSuccess) finish.mutate();
  }, [left, finish]);
  const filled = started.problems.filter((p) => (answers[p.id] ?? '').trim()).length;

  return (
    <section className="flex flex-col gap-6" aria-label="Задачи турнира">
      <div className="sticky top-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur">
        <span className={clsx('t-heading tnum inline-flex items-center gap-2 text-[22px]', left < 120_000 && 'text-ember-text')}>
          <Clock className="size-5" /> {mmss(left)}
        </span>
        <span className="t-mono text-[12px] text-muted">
          заполнено {filled} из {started.problems.length}
        </span>
        <Button onClick={() => (filled < started.problems.length ? setConfirm(true) : finish.mutate())} loading={finish.isPending}>
          Завершить
        </Button>
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-butter px-4 py-3" role="alert">
          <span className="text-[16px]">Ещё не на все задачи есть ответ. Завершить всё равно?</span>
          <Button onClick={() => finish.mutate()} loading={finish.isPending}>
            Да, завершить
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Ещё подумаю
          </Button>
        </div>
      )}
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {started.problems.map((p, i) => (
          <li key={p.id} className={`hue-${SUBJECT_HUE[p.subject] ?? 2} flex flex-col gap-3 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-5`}>
            <p className="t-mono text-[12px] text-muted">
              задача {i + 1} · {p.title}
            </p>
            {p.text.includes('\n') ? (
              <>
                <p className="text-[17px]">{p.text.split('\n')[0]}</p>
                <pre className="m-0 overflow-x-auto rounded-ctl bg-forest px-4 py-3 font-mono text-[14px] text-cream">{p.text.split('\n').slice(1).join('\n')}</pre>
              </>
            ) : (
              <p className="text-[17px] leading-relaxed">
                <RichText text={p.text} />
              </p>
            )}
            <label className="relative max-w-sm">
              <span className="sr-only">Ответ на задачу {i + 1}</span>
              <input
                value={answers[p.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                inputMode={p.kind === 'number' ? 'decimal' : 'text'}
                placeholder="Ответ"
                className="h-12 w-full rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 pr-20 text-[17px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
              />
              {p.unit && <span className="t-mono pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{p.unit}</span>}
            </label>
          </li>
        ))}
      </ol>
      <Button className="w-fit" onClick={() => (filled < started.problems.length ? setConfirm(true) : finish.mutate())} loading={finish.isPending}>
        Завершить и узнать результат
      </Button>
      <p className="t-caption text-muted">Ответы сохраняются в браузере: если страница закроется, можно вернуться и продолжить, пока не вышли {minutes} минут.</p>
    </section>
  );
}

function Results({ r, league, onTable }: { r: Finished; league: string; onTable(): void }) {
  const [open, setOpen] = useState<string | null>(null);
  const wrongTrainers = [...new Set(r.results.filter((x) => !x.correct).map((x) => x.trainer))];
  return (
    <section className="flex flex-col gap-7" aria-live="polite">
      <div className="hue-2 flex flex-col gap-3 rounded-[14px] bg-tint p-6 sm:p-8">
        <p className="t-mono inline-flex items-center gap-2 text-[12px] text-hue">
          <Medal className="size-4" /> {league} · {r.entry.name}
        </p>
        <p className="t-display tnum text-[60px] leading-none">
          {r.entry.score} из {r.results.length}
        </p>
        <p className="text-[18px]">
          Место в лиге: <b>{r.entry.place}</b> · время {mmss(r.entry.timeMs)}.{' '}
          {r.entry.score >= 8 ? 'Блестяще!' : r.entry.score >= 5 ? 'Хороший результат!' : 'Отличное начало — разбор ниже поможет подтянуть.'}
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink to={`/tournament/certificate/${r.entry.id}`}>
            <Award className="size-4" /> {r.entry.place <= 3 ? 'Грамота победителя' : 'Сертификат участника'}
          </ButtonLink>
          <Button variant="secondary" onClick={onTable}>
            Таблица лиги
          </Button>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {r.results.map((x, i) => (
          <li key={x.id} className={clsx('rounded-[12px] border-[1.5px] p-4', x.correct ? 'border-transparent bg-[var(--tint-raw-3)]' : 'border-transparent bg-butter')}>
            <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
              <span className="mt-0.5 shrink-0">{x.correct ? <Check className="size-5 text-[var(--ink-3)]" /> : '🟡'}</span>
              <span className="flex-1">
                <span className="t-mono block text-[11px] text-muted">
                  задача {i + 1} · {x.title}
                </span>
                <span className="text-[16px]">{x.correct ? `Верно: ${x.answer}` : `${x.given ? `Ваш ответ: ${x.given}. ` : 'Без ответа. '}Правильно: ${x.answer}`}</span>
              </span>
              <ChevronDown className={clsx('size-5 shrink-0 transition-transform', open === x.id && 'rotate-180')} />
            </button>
            <AnimatePresence>
              {open === x.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="flex flex-col gap-1.5 pt-3 pl-8 text-[15.5px]">
                    <p className="whitespace-pre-line text-muted">{x.text}</p>
                    {x.steps.map((s, k) => (
                      <p key={k}>
                        <RichText text={s} />
                      </p>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ol>
      {wrongTrainers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="t-heading text-[22px]">Потренироваться перед следующим турниром</h3>
          <div className="flex flex-wrap gap-2">
            {wrongTrainers.map((id) => (
              <Link key={id} to={`/practice/train/${id}`} className="press rounded-full bg-bone px-4 py-2 text-[15px] no-underline hover:bg-butter">
                🏋️ {r.results.find((x) => x.trainer === id)?.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Rules({ minutes, tasks }: { minutes: number; tasks: number }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Правила">
      {[
        ['🗓', 'Каждую неделю', 'Новые задачи — с понедельника, итоги — в воскресенье вечером.'],
        ['⏱', `${minutes} минут`, `${tasks} задач по математике, физике и информатике для вашего класса.`],
        ['🎯', 'Одна попытка', 'Ответы можно менять, пока не нажали «Завершить» или не вышло время.'],
        ['🏅', 'Сертификат каждому', 'Распечатайте или отправьте родителям. Тройке лидеров — грамота.'],
      ].map(([icon, title, text]) => (
        <div key={title} className="flex flex-col gap-1.5 rounded-[12px] bg-bone p-4">
          <span className="text-[26px]" aria-hidden="true">
            {icon}
          </span>
          <b className="text-[16px]">{title}</b>
          <span className="text-[14.5px] text-muted">{text}</span>
        </div>
      ))}
    </section>
  );
}
