import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageTitle } from '../../lib/title';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, BookOpen, Flame, RotateCcw, Swords, Trophy } from 'lucide-react';
import { Container } from '../../components/Layout';
import { ProblemCard } from '../../components/practice/ProblemCard';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { SUBJECT_HUE, gradesLabel, type PracticeProblem, type Trainer } from '../../lib/practice';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { saveNick, savedNick } from '../../lib/nick';

const ROUND = 10;
interface Next {
  trainer: Trainer;
  problem: PracticeProblem;
}

const bestKey = (id: string) => `spectr.best.${id}`;
function readBest(id: string) {
  try {
    return Number(localStorage.getItem(bestKey(id))) || 0;
  } catch {
    return 0;
  }
}

/** Тренажёр: бесконечные задачи одного типа, серия правильных подряд и итог каждые 10 задач. */
export default function Train() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [n, setN] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [current, setCurrent] = useState<{ done: boolean; correct: boolean } | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => readBest(id));
  // задача засчитывается один раз, даже если после разбора ответить ещё раз
  const doneRef = useRef(false);
  const q = useQuery({ queryKey: ['train', id, n], queryFn: () => api<Next>(`/practice/trainers/${id}/next`), staleTime: Infinity, gcTime: 60_000 });
  usePageTitle(q.data ? `Тренажёр: ${q.data.trainer.title}` : null);
  // следующую задачу подгружаем заранее, чтобы «Дальше» срабатывало мгновенно
  useEffect(() => {
    void qc.prefetchQuery({ queryKey: ['train', id, n + 1], queryFn: () => api<Next>(`/practice/trainers/${id}/next`), staleTime: Infinity });
  }, [qc, id, n]);

  const onResult = useCallback(
    (r: { correct: boolean; firstTry: boolean }) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setCurrent({ done: true, correct: r.correct });
      setResults((list) => [...list, r.correct]);
      setStreak((s) => {
        const next = r.correct ? s + 1 : 0;
        if (next > best) {
          setBest(next);
          try {
            localStorage.setItem(bestKey(id), String(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [best, id],
  );

  const roundResults = results.slice(Math.floor((results.length - 1) / ROUND) * ROUND);
  const roundDone = current?.done && results.length > 0 && results.length % ROUND === 0;
  const next = () => {
    doneRef.current = false;
    setCurrent(null);
    setN((x) => x + 1);
  };

  useEffect(() => {
    if (!current?.done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !roundDone) next();
    };
    // небольшая пауза, чтобы Enter от ответа не перелистнул сразу
    const tm = setTimeout(() => window.addEventListener('keydown', onKey), 300);
    return () => {
      clearTimeout(tm);
      window.removeEventListener('keydown', onKey);
    };
  }, [current, roundDone]);

  if (q.isPending && !q.data)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} onRetry={() => q.refetch()} />
      </Container>
    );
  const { trainer: t, problem } = q.data!;
  const hue = SUBJECT_HUE[t.subject];
  const inRound = results.length % ROUND === 0 && current?.done ? ROUND : results.length % ROUND;
  const correctInRound = roundResults.filter(Boolean).length;

  return (
    <Container className={clsx('max-w-[820px]', isMiniApp ? 'pt-4 pb-8' : 'pt-6 pb-10 sm:pt-10')}>
      <div className={`hue-${hue} flex flex-col gap-7`}>
        <nav aria-label="Хлебные крошки" className="t-mono flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <Link to="/practice" className="link">
            практикум
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/practice/trainers" className="link">
            сборник задач
          </Link>
        </nav>
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-mono rounded-full bg-tint px-3 py-1 text-[12px] text-hue">{gradesLabel(t.grades)}</span>
            {t.exams.map((e) => (
              <span key={`${e.exam}${e.subject}${e.task}`} className="t-mono rounded-full border border-ink/20 px-3 py-1 text-[12px]">
                {e.exam} · {e.subject}
                {e.task ? ` · №${e.task}` : ''}
              </span>
            ))}
          </div>
          <h1 className="t-display t-lg">{t.title}</h1>
          <p className="text-[17px] text-muted">{t.skill}</p>
        </header>

        {/* табло: задача раунда, серия, рекорд */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex flex-col rounded-[12px] bg-bone px-4 py-3">
            <span className="t-mono text-[11px] text-muted">задача</span>
            <span className="t-heading tnum text-[24px]">
              {Math.min(inRound + (current?.done ? 0 : 1), ROUND)} / {ROUND}
            </span>
          </div>
          <div className={clsx('flex flex-col rounded-[12px] px-4 py-3 transition-colors', streak >= 3 ? 'bg-mark' : 'bg-bone')}>
            <span className="t-mono text-[11px] text-muted">серия</span>
            <span className="t-heading tnum inline-flex items-center gap-1 text-[24px]">
              <Flame className={clsx('size-5', streak ? 'text-[var(--ray-0)]' : 'text-muted')} /> {streak}
            </span>
          </div>
          <div className="flex flex-col rounded-[12px] bg-bone px-4 py-3">
            <span className="t-mono text-[11px] text-muted">рекорд</span>
            <span className="t-heading tnum inline-flex items-center gap-1 text-[24px]">
              <Trophy className="size-5 text-[var(--ray-2)]" /> {best}
            </span>
          </div>
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: ROUND }, (_, i) => {
            const r = roundDone ? roundResults[i] : results.slice(results.length - (results.length % ROUND))[i];
            return <span key={i} className={clsx('h-1.5 flex-1 rounded-full', r === true ? 'bg-ray' : r === false ? 'bg-[var(--ray-2)]' : 'bg-ink/12')} />;
          })}
        </div>

        <AnimatePresence mode="wait">
          {roundDone ? (
            <motion.section key="round" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 rounded-[14px] bg-tint p-6 sm:p-8" aria-live="polite">
              <p className="t-mono text-[12px] text-hue">итог десятки</p>
              <p className="t-display tnum text-[56px] leading-none">
                {correctInRound} из {ROUND}
              </p>
              <p className="max-w-[52ch] text-[18px]">
                {correctInRound >= 9
                  ? 'Блестяще! Навык уверенный — можно переходить к задачам посложнее.'
                  : correctInRound >= 6
                    ? 'Хорошо получается! Ещё одна десятка — и будет совсем уверенно.'
                    : 'Начало положено. Загляните в теорию — там коротко и с примером, — и попробуйте ещё раз.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={next}>
                  <RotateCcw className="size-4" /> Ещё десять
                </Button>
                {t.theory && (
                  <ButtonLink to={`/practice/${t.theory}`} variant="secondary">
                    <BookOpen className="size-4" /> Теория по теме
                  </ButtonLink>
                )}
                <ButtonLink to="/practice/trainers" variant="ghost">
                  Другие тренажёры
                </ButtonLink>
              </div>
              <ChallengeInvite trainerId={t.id} />
            </motion.section>
          ) : (
            <motion.div key={problem.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-4">
              <ProblemCard problem={problem} hue={hue} onResult={onResult} autoFocus />
              {current?.done && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
                  <Button onClick={next} autoFocus>
                    Следующая задача <ArrowRight className="size-4" />
                  </Button>
                  <span className="t-caption text-muted">или Enter</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <aside className="flex flex-col gap-2 border-t border-dashed border-hair-soft pt-5 text-[15px] text-muted">
          <p>
            Как это работает: задачи бесконечные — числа каждый раз новые. Ошиблись — появится «Почти!» и подсказка, со второй попытки откроется решение. Каждые {ROUND} задач — итог.
          </p>
          {!roundDone && <ChallengeInvite trainerId={t.id} compact />}
          {results.length > 0 && (
            <p>
              Сегодня решено: <b className="text-ink">{results.filter(Boolean).length}</b> {plural(results.filter(Boolean).length, 'задача', 'задачи', 'задач')}.
            </p>
          )}
        </aside>
      </div>
    </Container>
  );
}

/** «Вызвать друга»: 5 задач этого тренажёра на время, ссылка для друзей с общей таблицей. */
function ChallengeInvite({ trainerId, compact }: { trainerId: string; compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => savedNick() || user?.name.split(' ')[0] || '');
  const create = useMutation({
    mutationFn: () => api<{ id: string }>('/challenge', { method: 'POST', json: { trainerId, name } }),
    onSuccess: (r) => {
      saveNick(name);
      navigate(`/challenge/${r.id}?new=1`);
    },
  });
  if (!open)
    return compact ? (
      <button type="button" onClick={() => setOpen(true)} className="link inline-flex w-fit items-center gap-2 text-ink">
        <Swords className="size-4" /> Вызвать друга: 5 задач на время, кто решит лучше
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className="press inline-flex w-fit items-center gap-2 rounded-full border border-ink/30 bg-paper px-4 py-2 text-[15px] font-[550] hover:bg-mark">
        <Swords className="size-4" /> Вызвать друга
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-[12px] bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
        <span className="text-[14px] font-[550] text-ink">Как подписать вас в таблице вызова</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          autoFocus
          placeholder="Имя или ник"
          className="h-11 rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3 text-[16px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
        />
      </label>
      <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
        <Swords className="size-4" /> Создать вызов
      </Button>
      {create.error && <p className="w-full text-[14px] text-ink">{(create.error as Error).message}</p>}
      <p className="w-full text-[13.5px] text-muted">Сначала решите 5 задач сами, потом отправьте ссылку — у друзей будут те же задачи.</p>
    </form>
  );
}
