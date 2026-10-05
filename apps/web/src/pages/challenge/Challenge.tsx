import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, Clock, Copy, Send, Swords } from 'lucide-react';
import { Container } from '../../components/Layout';
import { RichText } from '../../components/Tex';
import { Button, ButtonLink, Chip, ErrorNote, Input, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { gradesLabel } from '../../lib/practice';
import { haptic, isMiniApp, platform, shareLink } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';
import { saveNick, savedNick } from '../../lib/nick';

interface ChallengeData {
  id: string;
  creator: string;
  trainer: { id: string; title: string; skill: string; grades: [number, number] };
  problems: { id: string; text: string; unit: string | null; kind: string }[];
  runs: { id: string; name: string; score: number; timeMs: number }[];
  mine: { id: string } | null;
  count: number;
  links: { telegram: string | null; max: string | null };
}
interface RunResult {
  run: { id: string; score: number; timeMs: number };
  results: { id: string; text: string; given: string; answer: string; correct: boolean; steps: string[] }[];
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** «Вызов другу»: те же 5 задач для всех, кто открыл ссылку, и общая таблица. */
export default function ChallengePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const fresh = params.get('new') === '1';
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['challenge', id], queryFn: () => api<ChallengeData>(`/challenge/${id}`) });
  usePageTitle(q.data ? `Вызов: ${q.data.trainer.title}` : 'Вызов другу');

  const [name, setName] = useState(() => savedNick() || user?.name.split(' ')[0] || '');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!startedAt || result) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, result]);

  const submit = useMutation({
    mutationFn: () => api<RunResult>(`/challenge/${id}/run`, { method: 'POST', json: { name, answers, timeMs: Date.now() - (startedAt ?? Date.now()) } }),
    onSuccess: (r) => {
      setResult(r);
      haptic(r.run.score >= 4 ? 'success' : 'tap');
      void qc.invalidateQueries({ queryKey: ['challenge', id] });
      void qc.invalidateQueries({ queryKey: ['practice-progress'] });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="flex flex-col gap-4 py-10">
        <ErrorNote error={q.error} />
        <ButtonLink to="/practice/trainers" variant="secondary" className="w-fit">
          В сборник задач
        </ButtonLink>
      </Container>
    );

  const c = q.data;
  const done = Boolean(result || c.mine);
  const myRunId = result?.run.id ?? c.mine?.id;
  const place = myRunId ? c.runs.findIndex((r) => r.id === myRunId) + 1 : 0;
  const best = c.runs[0];
  // в мессенджере делимся ссылкой на бота — друг сразу откроет вызов там же
  const url = (platform === 'telegram' && c.links.telegram) || (platform === 'max' && c.links.max) || `${window.location.origin}/challenge/${c.id}`;
  const shareText = result
    ? `Мой результат в «Спектре»: ${result.run.score} из ${c.count} задач «${c.trainer.title}» за ${mmss(result.run.timeMs)}. Сможешь лучше?`
    : `Вызов в «Спектре»: ${c.count} задач «${c.trainer.title}». Сможешь лучше?`;
  const share = async () => {
    const r = await shareLink(url, shareText);
    if (r === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };
  const start = () => {
    saveNick(name);
    setStartedAt(Date.now());
    setNow(Date.now());
  };
  const filled = c.problems.filter((p) => (answers[p.id] ?? '').trim()).length;
  const byId = new Map(result?.results.map((r) => [r.id, r]));

  return (
    <Container className={clsx('flex max-w-[860px] flex-col gap-8', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <header className="flex flex-col gap-4">
        <Chip hue={6} icon={<Swords />}>
          вызов другу · {gradesLabel(c.trainer.grades)}
        </Chip>
        <h1 className="t-display t-lg">
          {fresh && !done ? (
            <>
              Вызов готов — <mark>решите первым</mark>
            </>
          ) : fresh ? (
            <>
              Планка поставлена — <mark>зовите друзей</mark>
            </>
          ) : (
            <>
              {c.creator} бросает вызов: <mark>{c.trainer.title}</mark>
            </>
          )}
        </h1>
        <p className="t-sub max-w-[60ch] text-muted">
          {fresh && !done
            ? `${c.count} задач. Ваш результат станет планкой, потом отправьте ссылку друзьям — у них будут те же задачи.`
            : `${c.count} задач — у всех, кто открыл эту ссылку, одинаковые. Выше в таблице тот, кто решил больше; при равенстве — кто быстрее.`}
        </p>
      </header>

      {done && (
        <section className="hue-6 flex flex-col gap-4 rounded-[14px] bg-tint p-6 sm:p-8" aria-live="polite">
          {result ? (
            <>
              <p className="t-display tnum text-[56px] leading-none">
                {result.run.score} из {c.count}
              </p>
              <p className="text-[18px]">
                {result.run.score === c.count ? 'Чисто! Все задачи решены.' : result.run.score >= 3 ? 'Хороший результат!' : 'Начало положено — разбор ниже поможет.'} Время: {mmss(result.run.timeMs)}.
                {place > 0 && c.runs.length > 1 ? ` Место в таблице вызова: ${place} из ${c.runs.length}.` : ''}
              </p>
            </>
          ) : (
            <p className="text-[18px]">Вы уже приняли этот вызов{place ? ` — место ${place} из ${c.runs.length}` : ''}. Зовите друзей: пусть попробуют обогнать.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={share}>
              <Send className="size-4" /> Отправить другу
            </Button>
            <Button variant="secondary" onClick={copy}>
              <Copy className="size-4" /> {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
            </Button>
            <ButtonLink to={`/practice/train/${c.trainer.id}`} variant="ghost">
              Потренироваться ещё
            </ButtonLink>
          </div>
        </section>
      )}

      {!done && !startedAt && (
        <section className="flex flex-col gap-4 rounded-[14px] bg-forest-2 p-6 text-cream">
          <p className="t-display text-[28px]">{best ? `Планка: ${best.score} из ${c.count} за ${mmss(best.timeMs)}` : 'Готовы?'}</p>
          <Input
            label="Как подписать вас в таблице"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            hint="Имя или ник — его увидят участники вызова."
            className="[&_label]:text-cream [&_p]:text-cream/70"
          />
          <Button variant="banner" className="w-fit" disabled={name.trim().length < 2} onClick={start}>
            <Swords className="size-4" /> Принять вызов
          </Button>
          <p className="text-[14px] text-cream/75">Время пойдёт после нажатия. Ответы можно менять до проверки.</p>
        </section>
      )}

      {startedAt && !done && (
        <div className="sticky top-20 z-10 flex items-center justify-between gap-3 rounded-[12px] border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur">
          <span className="t-heading tnum inline-flex items-center gap-2 text-[20px]">
            <Clock className="size-5" /> {mmss(now - startedAt)}
          </span>
          <span className="t-mono text-[12px] text-muted">
            заполнено {filled} из {c.count}
          </span>
          <Button onClick={() => submit.mutate()} loading={submit.isPending}>
            Проверить
          </Button>
        </div>
      )}
      {submit.error && <p className="rounded-[8px] bg-butter px-4 py-3 text-[15px]">{(submit.error as Error).message}</p>}

      {(startedAt || result) && (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {c.problems.map((p, i) => {
            const r = byId.get(p.id);
            const lines = p.text.split('\n');
            return (
              <li key={p.id} className={clsx('flex flex-col gap-3 rounded-[14px] border-[1.5px] p-5', r ? (r.correct ? 'border-transparent bg-[var(--tint-raw-3)]' : 'border-transparent bg-butter') : 'border-ink/15 bg-paper')}>
                <p className="flex items-baseline gap-3">
                  <span className="t-display tnum text-[24px] leading-none text-[var(--ray-6)]">{i + 1}</span>
                  {r && <span className="ml-auto text-[15px]">{r.correct ? <Check className="inline size-5 text-[var(--ink-3)]" /> : <span className="t-mono text-[12px] text-[var(--ink-2)]">почти</span>}</span>}
                </p>
                {lines.length > 1 ? (
                  <>
                    <p className="text-[17px]">{lines[0]}</p>
                    <pre className="m-0 overflow-x-auto rounded-ctl bg-forest px-4 py-3 font-mono text-[14px] text-cream">{lines.slice(1).join('\n')}</pre>
                  </>
                ) : (
                  <p className="text-[17px] leading-relaxed">
                    <RichText text={p.text} />
                  </p>
                )}
                {!r ? (
                  <label className="relative max-w-sm">
                    <span className="sr-only">Ответ на задачу {i + 1}</span>
                    <input
                      value={answers[p.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                      inputMode={p.kind === 'number' ? 'decimal' : 'text'}
                      placeholder="Ответ"
                      autoFocus={i === 0}
                      className="h-12 w-full rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 pr-20 text-[17px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
                    />
                    {p.unit && <span className="t-mono pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{p.unit}</span>}
                  </label>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[16px]">{r.correct ? `Верно: ${r.answer}` : `${r.given.trim() ? `Ваш ответ: ${r.given}. ` : ''}Правильно: ${r.answer}`}</p>
                    <button type="button" className="link inline-flex w-fit items-center gap-1 text-[14px]" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                      Решение <ChevronDown className={clsx('size-4 transition-transform', open === p.id && 'rotate-180')} />
                    </button>
                    {open === p.id &&
                      r.steps.map((s, k) => (
                        <p key={k} className="text-[15.5px]">
                          <RichText text={s} />
                        </p>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {startedAt && !done && (
        <Button className="w-fit" onClick={() => submit.mutate()} loading={submit.isPending}>
          Проверить ответы
        </Button>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="t-heading text-[22px]">Таблица вызова</h2>
        {c.runs.length ? (
          <ol className="m-0 flex list-none flex-col p-0">
            {c.runs.map((r, idx) => (
              <li key={r.id} className={clsx('grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-dashed border-hair-soft py-2.5', r.id === myRunId && 'rounded-[8px] bg-butter px-2')}>
                <span className="t-heading tnum text-[18px]">{idx + 1}</span>
                <span className="[overflow-wrap:anywhere]">
                  {r.name}
                  {r.id === myRunId && <span className="t-mono ml-2 text-[11px] text-muted">это вы</span>}
                </span>
                <span className="tnum text-[15px]">
                  {r.score}/{c.count} · {mmss(r.timeMs)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">Пока никто не решил — станьте первым!</p>
        )}
        <p className="pt-2 text-[15px] text-muted">
          Хотите свой вызов на другую тему? Откройте любой{' '}
          <Link to="/practice/trainers" className="link">
            тренажёр
          </Link>{' '}
          и нажмите «Вызвать друга».
        </p>
      </section>
    </Container>
  );
}
