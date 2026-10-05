import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Check, Flame, Lightbulb, Snail, Volume2, X } from 'lucide-react';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { PencilBuddy } from '../../components/Doodles';
import { Burst } from '../../components/game/Burst';
import { LevelUp, XpMeter } from '../../components/game/XpMeter';
import { api } from '../../lib/api';
import { canSpeak, checkTyped, speak, type Lesson, type Step } from '../../lib/english';
import { levelOf, sfx, useGame, useRefreshGame } from '../../lib/game';
import { haptic } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';

type Answer = number | string | number[] | null;
type Verdict = { ok: boolean; typo?: boolean; correct: string };

const PRAISE = ['Отлично!', 'Верно!', 'Супер!', 'Так держать!', 'Блестяще!', 'Точно в цель!'];
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Урок английского: шаги по одному, проверка внизу, ошибки повторяются в конце. */
export default function EnglishLesson() {
  const { id = '' } = useParams();
  const [round, setRound] = useState(0);
  const q = useQuery({ queryKey: ['english-lesson', id, round], queryFn: () => api<Lesson>(`/english/lesson/${id}`), staleTime: Infinity, gcTime: 0 });
  usePageTitle(q.data ? `${q.data.unit.title}: ${q.data.title}` : 'Урок английского');
  if (q.isPending)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loading label="Готовим урок…" />
      </div>
    );
  if (q.error)
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <ErrorNote error={q.error} />
        <ButtonLink to="/english" variant="secondary" className="w-fit">
          К пути
        </ButtonLink>
      </div>
    );
  return <Session key={round} lesson={q.data} onAgain={() => setRound((r) => r + 1)} />;
}

const graded = (s: Step) => s.type !== 'new' && s.type !== 'rule';

function Session({ lesson, onAgain }: { lesson: Lesson; onAgain(): void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const game = useGame();
  const refreshGame = useRefreshGame();
  const [queue, setQueue] = useState(() => lesson.steps.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const retried = useRef(new Set<number>());
  const [mistakes, setMistakes] = useState(0);
  const [answer, setAnswer] = useState<Answer>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [combo, setCombo] = useState(0);
  const [fire, setFire] = useState(0);
  const [started] = useState(() => Date.now());
  const [result, setResult] = useState<{ xp: number; ms: number } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const idx = queue[pos]!;
  const step = lesson.steps[idx]!;
  const isRetry = pos >= lesson.steps.length;
  const hue = lesson.unit.hue;

  const finish = useMutation({
    mutationFn: () => api<{ xp: number }>('/english/result', { method: 'POST', json: { lessonId: lesson.id, total: lesson.steps.filter(graded).length, mistakes } }),
    onSuccess: (r) => {
      const before = game.data?.xp.total ?? 0;
      setResult({ xp: r.xp, ms: Date.now() - started });
      sfx('finish');
      setFire((n) => n + 1);
      if (game.data && levelOf(before + r.xp).level > levelOf(before).level) setTimeout(() => setLevelUp(levelOf(before + r.xp).level), 900);
      void refreshGame();
      void qc.invalidateQueries({ queryKey: ['english'] });
    },
  });

  const canCheck = useMemo(() => {
    if (step.type === 'new' || step.type === 'rule') return true;
    if (step.type === 'match') return false;
    if (step.type === 'build') return Array.isArray(answer) && answer.length > 0;
    if (step.type === 'type') return typeof answer === 'string' && answer.trim().length > 0;
    return typeof answer === 'number';
  }, [step, answer]);

  const settle = useCallback(
    (ok: boolean, correct: string, typo = false, say?: string | null) => {
      setVerdict({ ok, correct, typo });
      if (say) setTimeout(() => speak(say), 150);
      if (ok) {
        haptic('success');
        sfx('correct');
        setFire((n) => n + 1);
        setCombo((c) => {
          const n = c + 1;
          if (n === 5 || n === 10 || n === 15) setTimeout(() => sfx('combo'), 200);
          return n;
        });
      } else {
        haptic('tap');
        sfx('almost');
        setCombo(0);
        setMistakes((m) => m + 1);
        // ошибку повторим в конце урока, один раз
        if (!retried.current.has(idx)) {
          retried.current.add(idx);
          setQueue((q) => [...q, idx]);
        }
      }
    },
    [idx],
  );

  const next = useCallback(() => {
    if (pos + 1 >= queue.length) {
      finish.mutate();
      return;
    }
    setPos((p) => p + 1);
    setAnswer(null);
    setVerdict(null);
  }, [pos, queue.length, finish]);

  const check = useCallback(() => {
    if (step.type === 'new' || step.type === 'rule') return next();
    if (!canCheck) return;
    // озвучиваем английский вариант: либо само слово задания, либо верный вариант
    if (step.type === 'pick') return settle(answer === step.answer, step.options[step.answer]!.text, false, step.say ?? step.options[step.answer]!.text);
    if (step.type === 'listen') return settle(answer === step.answer, step.options[step.answer]!, false, step.say);
    if (step.type === 'fill') {
      const full = step.sentence.replace('___', step.options[step.answer]!);
      return settle(answer === step.answer, full, false, full.replace(/\s*\([A-Z]+\)$/, ''));
    }
    if (step.type === 'build') {
      const given = (answer as number[]).map((i) => step.tiles[i]).join(' ');
      const right = step.answer.join(' ');
      return settle(given.toLowerCase() === right.toLowerCase(), right, false, right);
    }
    if (step.type === 'type') {
      const v = checkTyped(answer as string, step.answers);
      return settle(v !== 'almost', step.answers[0]!, v === 'typo', step.answers[0]);
    }
  }, [step, answer, canCheck, settle, next]);

  // Enter — проверить / дальше; цифры — выбрать вариант
  useEffect(() => {
    if (result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        verdict ? next() : check();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        verdict ? next() : check();
      }
      const n = Number(e.key);
      if (!verdict && n >= 1 && n <= 4 && (step.type === 'pick' || step.type === 'listen' || step.type === 'fill') && n <= step.options.length) setAnswer(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict, next, check, step, result]);

  if (result) return <Summary lesson={lesson} result={result} mistakes={mistakes} fire={fire} onAgain={onAgain} levelUp={levelUp} onCloseLevel={() => setLevelUp(null)} xp={game.data?.xp} />;

  const progress = (pos + (verdict ? 1 : 0)) / queue.length;
  const locked = Boolean(verdict);

  return (
    <div className={`hue-${hue} flex min-h-dvh flex-col bg-paper`}>
      {/* верхняя панель */}
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <button
          type="button"
          onClick={() => {
            if (pos === 0 || window.confirm('Выйти из урока? Пройденные шаги этого урока не сохранятся.')) navigate('/english');
          }}
          className="press grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
          aria-label="Выйти из урока"
        >
          <X className="size-6" />
        </button>
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Прогресс урока">
          <motion.div className="relative h-full rounded-full bg-ray" initial={false} animate={{ width: `${Math.max(4, progress * 100)}%` }} transition={{ type: 'spring', stiffness: 160, damping: 24 }}>
            <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/40" />
          </motion.div>
        </div>
        <span className={clsx('t-heading tnum inline-flex w-14 shrink-0 items-center justify-end gap-1 text-[18px]', combo >= 3 ? 'text-[var(--ray-0)]' : 'text-muted')} aria-label={`Серия верных: ${combo}`}>
          <Flame className="size-5" /> {combo}
        </span>
      </div>

      <main className="relative mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pt-6 pb-48 sm:px-6 sm:pt-10">
        <Burst fire={fire} className="left-1/2 top-1/3" />
        {isRetry && step.type !== 'new' && <p className="t-mono mb-3 text-[12px] text-[var(--ink-2)]">повторяем: в прошлый раз было «почти»</p>}
        <AnimatePresence mode="wait">
          <motion.div key={pos} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }} className="flex flex-col gap-6">
            <StepView step={step} answer={answer} setAnswer={setAnswer} locked={locked} onMatchDone={() => settle(true, '', false)} onMatchMiss={() => sfx('almost')} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* нижняя панель: проверка и вердикт */}
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-20 border-t-[1.5px] transition-colors',
          !verdict && 'border-ink/12 bg-paper',
          verdict?.ok && 'border-transparent bg-[var(--tint-raw-3)]',
          verdict && !verdict.ok && 'border-transparent bg-butter',
        )}
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-5">
          <AnimatePresence mode="wait">
            {verdict ? (
              <motion.div key="v" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3" role="status">
                <span className={clsx('grid size-11 shrink-0 place-items-center rounded-full text-[22px]', verdict.ok ? 'bg-paper text-[var(--ink-3)]' : 'bg-paper')}>{verdict.ok ? <Check className="size-6" strokeWidth={3} /> : '🟡'}</span>
                <div className="flex flex-col">
                  <p className={clsx('t-heading text-[22px] leading-tight', verdict.ok ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]')}>
                    {verdict.ok ? (verdict.typo ? 'Верно, но с опечаткой' : combo >= 5 ? `Серия ${combo}! ${PRAISE[combo % PRAISE.length]}` : PRAISE[(pos + combo) % PRAISE.length]) : 'Почти!'}
                  </p>
                  {verdict.correct && (!verdict.ok || verdict.typo) && (
                    <p className="text-[16px]">
                      {verdict.typo ? 'Правильно пишется: ' : 'Правильный ответ: '}
                      <b>{verdict.correct}</b>
                    </p>
                  )}
                  {!verdict.ok && <p className="text-[14px] text-ink/70">Это задание ещё вернётся в конце урока.</p>}
                </div>
              </motion.div>
            ) : (
              <motion.span key="s" className="hidden text-[14px] text-muted sm:block">
                {step.type === 'new' || step.type === 'rule' ? 'Запомните и идите дальше' : step.type === 'match' ? 'Соедините пары' : 'Enter — проверить'}
              </motion.span>
            )}
          </AnimatePresence>
          {step.type !== 'match' || verdict ? (
            <button
              type="button"
              autoFocus={Boolean(verdict)}
              onClick={verdict ? next : check}
              disabled={!verdict && !canCheck}
              className={clsx(
                'press h-14 w-full shrink-0 rounded-[12px] px-8 text-[17px] font-[700] tracking-wide disabled:cursor-not-allowed sm:w-auto sm:min-w-[200px]',
                verdict ? (verdict.ok ? 'bg-[var(--ink-3)] text-paper' : 'bg-ink text-paper') : 'bg-ink text-paper shadow-[0_4px_0_var(--ray-2)] hover:-translate-y-0.5 disabled:bg-ink/15 disabled:text-ink/40 disabled:shadow-none',
              )}
            >
              {finish.isPending ? 'Сохраняем…' : verdict ? 'Дальше' : step.type === 'new' || step.type === 'rule' ? 'Понятно' : 'Проверить'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Speaker({ text, big, autoPlay }: { text: string; big?: boolean; autoPlay?: boolean }) {
  useEffect(() => {
    if (autoPlay) {
      const t = setTimeout(() => speak(text), 250);
      return () => clearTimeout(t);
    }
  }, [text, autoPlay]);
  if (!canSpeak()) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => speak(text)}
        className={clsx('press grid place-items-center rounded-[14px] bg-[var(--ray-5)] text-paper shadow-[0_4px_0_var(--ink-5)] hover:-translate-y-0.5', big ? 'size-24' : 'size-11')}
        aria-label="Послушать"
      >
        <Volume2 className={big ? 'size-11' : 'size-5'} />
      </button>
      {big && (
        <button type="button" onClick={() => speak(text, true)} className="press grid size-14 place-items-center rounded-[12px] bg-bone text-ink hover:bg-mark" aria-label="Послушать медленно">
          <Snail className="size-6" />
        </button>
      )}
    </span>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <PencilBuddy className="h-28 w-auto shrink-0 sm:h-32" />
      <div className="relative mb-8 rounded-[14px] border-[1.5px] border-ink/20 bg-paper px-4 py-3 text-[19px] leading-snug shadow-[0_2px_0_rgba(26,51,0,0.1)]">
        <span className="absolute top-1/2 -left-[9px] size-4 -translate-y-1/2 rotate-45 border-b-[1.5px] border-l-[1.5px] border-ink/20 bg-paper" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="t-display text-[clamp(24px,4.5vw,32px)] leading-tight">{children}</h1>;
}

function Option({ i, chosen, locked, right, onClick, children }: { i: number; chosen: boolean; locked: boolean; right: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      aria-pressed={chosen}
      className={clsx(
        'press flex min-h-14 items-center gap-3 rounded-[12px] border-[1.5px] px-4 py-3 text-left text-[17px] shadow-[0_3px_0_rgba(26,51,0,0.12)] transition-colors disabled:cursor-default',
        locked && right ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && chosen ? 'border-[var(--ray-2)] bg-butter' : chosen ? 'border-ink bg-mark' : 'border-ink/20 bg-paper hover:border-ink/50 hover:bg-bone',
      )}
    >
      <span className="t-mono hidden size-6 shrink-0 place-items-center rounded-[6px] border border-ink/20 text-[11px] text-muted sm:grid">{i + 1}</span>
      {children}
    </button>
  );
}

function StepView({ step, answer, setAnswer, locked, onMatchDone, onMatchMiss }: { step: Step; answer: Answer; setAnswer(a: Answer): void; locked: boolean; onMatchDone(miss: number): void; onMatchMiss(): void }) {
  if (step.type === 'new')
    return (
      <>
        <p className="t-mono text-[12px] text-hue">новое слово</p>
        <div className="flex -rotate-1 flex-col items-center gap-4 self-center rounded-[18px] bg-tint px-10 py-8 text-center shadow-sticker sm:px-16">
          <span className="text-[84px] leading-none" aria-hidden="true">
            {step.emoji ?? '✦'}
          </span>
          <span className="flex items-center gap-3">
            <span className="t-display text-[clamp(32px,7vw,46px)] leading-none">{step.en}</span>
            <Speaker text={step.en} autoPlay />
          </span>
          <span className="text-[20px] text-ink/80">{step.ru}</span>
        </div>
      </>
    );

  if (step.type === 'rule')
    return (
      <>
        <p className="t-mono inline-flex items-center gap-2 text-[12px] text-hue">
          <Lightbulb className="size-4" /> правило
        </p>
        <Title>{step.title}</Title>
        <ul className="m-0 flex list-none flex-col gap-3 rounded-[14px] bg-butter p-5 sm:p-6">
          {step.rule.map((r) => (
            <li key={r} className="flex gap-3 text-[17px] leading-relaxed">
              <span className="mt-2.5 size-2 shrink-0 rounded-full bg-ink" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
        <p className="text-[15px] text-muted">Дальше — задания на это правило. Если что, загляните сюда ещё раз: повтор урока бесплатный.</p>
      </>
    );

  if (step.type === 'pick') {
    const pictures = step.options.every((o) => o.emoji);
    return (
      <>
        <Title>
          {step.prompt === 'Выберите перевод' ? (
            <span className="flex flex-wrap items-center gap-3">
              Выберите перевод {step.say && <Speaker text={step.say} autoPlay />}
            </span>
          ) : (
            <>
              {step.prompt} — «{step.ask}»?
            </>
          )}
        </Title>
        {step.prompt === 'Выберите перевод' && <p className="t-display text-[30px]">{step.ask}</p>}
        {pictures ? (
          <div className="grid grid-cols-2 gap-3">
            {step.options.map((o, i) => (
              <button
                key={o.text}
                type="button"
                disabled={locked}
                onClick={() => setAnswer(i)}
                aria-pressed={answer === i}
                className={clsx(
                  'press flex flex-col items-center gap-2 rounded-[14px] border-[1.5px] px-3 py-5 shadow-[0_4px_0_rgba(26,51,0,0.12)] transition-colors disabled:cursor-default',
                  locked && i === step.answer ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && answer === i ? 'border-[var(--ray-2)] bg-butter' : answer === i ? 'border-ink bg-mark' : 'border-ink/20 bg-paper hover:border-ink/50 hover:bg-bone',
                )}
              >
                <span className="text-[56px] leading-none" aria-hidden="true">
                  {o.emoji}
                </span>
                <span className="text-[17px] font-[600]">{o.text}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {step.options.map((o, i) => (
              <Option key={o.text} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
                {o.text}
              </Option>
            ))}
          </div>
        )}
      </>
    );
  }

  if (step.type === 'listen') {
    const speech = canSpeak();
    return (
      <>
        <Title>{speech ? 'Что вы услышали?' : 'Выберите, что написано'}</Title>
        {speech ? (
          <div className="flex justify-center py-2">
            <Speaker text={step.say} big autoPlay />
          </div>
        ) : (
          <p className="t-display text-[30px]">{step.say}</p>
        )}
        <div className="grid gap-3">
          {step.options.map((o, i) => (
            <Option key={o} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
              {o}
            </Option>
          ))}
        </div>
      </>
    );
  }

  if (step.type === 'fill') {
    const [before, after] = step.sentence.split('___');
    const picked = typeof answer === 'number' ? step.options[answer] : null;
    return (
      <>
        <Title>Вставьте пропущенное</Title>
        <p className="text-[clamp(21px,4vw,26px)] leading-relaxed">
          {before}
          <span className={clsx('mx-1 inline-block min-w-[96px] rounded-[8px] border-b-[3px] px-2 text-center font-[650]', picked ? 'border-ink bg-mark' : 'border-dashed border-ink/40 bg-bone')}>{picked ?? ' '}</span>
          {after}
        </p>
        <p className="text-[16px] text-muted">{step.ru}</p>
        <div className="flex flex-wrap gap-3">
          {step.options.map((o, i) => (
            <Option key={o} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
              {o}
            </Option>
          ))}
        </div>
      </>
    );
  }

  if (step.type === 'build') {
    const chosen = Array.isArray(answer) ? answer : [];
    return (
      <>
        <Title>Соберите перевод</Title>
        <Bubble>{step.ru}</Bubble>
        <div className="flex min-h-[112px] flex-wrap content-start gap-2 border-y-[1.5px] border-dashed border-ink/20 py-3" aria-label="Ваш ответ">
          {chosen.map((ti) => (
            <motion.button
              layout
              key={ti}
              type="button"
              disabled={locked}
              onClick={() => setAnswer(chosen.filter((x) => x !== ti))}
              className="press rounded-[10px] border-[1.5px] border-ink/25 bg-paper px-3.5 py-2 text-[18px] shadow-[0_3px_0_rgba(26,51,0,0.15)]"
            >
              {step.tiles[ti]}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {step.tiles.map((t, ti) =>
            chosen.includes(ti) ? (
              <span key={ti} className="rounded-[10px] bg-ink/[0.07] px-3.5 py-2 text-[18px] text-transparent select-none" aria-hidden="true">
                {t}
              </span>
            ) : (
              <motion.button
                layout
                key={ti}
                type="button"
                disabled={locked}
                onClick={() => {
                  sfx('tap');
                  setAnswer([...chosen, ti]);
                }}
                className="press rounded-[10px] border-[1.5px] border-ink/25 bg-paper px-3.5 py-2 text-[18px] shadow-[0_3px_0_rgba(26,51,0,0.15)] hover:bg-bone"
              >
                {t}
              </motion.button>
            ),
          )}
        </div>
      </>
    );
  }

  if (step.type === 'type')
    return (
      <>
        <Title>Напишите по-английски</Title>
        <Bubble>{step.ru}</Bubble>
        <label className="flex flex-col gap-2">
          <span className="sr-only">Ваш перевод</span>
          <textarea
            value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={locked}
            autoFocus
            rows={2}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
            placeholder="Пишите здесь…"
            className="w-full resize-none rounded-[12px] border-[1.5px] border-ink/25 bg-bone/60 px-4 py-3 text-[19px] focus-visible:border-ink focus-visible:bg-paper focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
          />
          <span className="text-[13.5px] text-muted">Заглавные буквы и точка не важны, сокращения (I’m, don’t) тоже засчитаем.</span>
        </label>
      </>
    );

  return <Match key={step.pairs.map((p) => p[0]).join('|')} pairs={step.pairs} locked={locked} onDone={onMatchDone} onMiss={onMatchMiss} />;
}

function Match({ pairs, locked, onDone, onMiss }: { pairs: [string, string][]; locked: boolean; onDone(miss: number): void; onMiss(): void }) {
  const left = useMemo(() => [...pairs].sort(() => Math.random() - 0.5), [pairs]);
  const right = useMemo(() => [...pairs].sort(() => Math.random() - 0.5), [pairs]);
  const [selL, setSelL] = useState<string | null>(null);
  const [selR, setSelR] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [miss, setMiss] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!selL || !selR) return;
    const pair = pairs.find((p) => p[0] === selL);
    if (pair && pair[1] === selR) {
      sfx('tap');
      speak(selL);
      const nd = new Set(done).add(selL);
      setDone(nd);
      if (nd.size === pairs.length) setTimeout(() => onDone(miss), 250);
    } else {
      onMiss();
      setMiss((m) => m + 1);
      setFlash(`${selL}|${selR}`);
      setTimeout(() => setFlash(null), 450);
    }
    setSelL(null);
    setSelR(null);
  }, [selL, selR]); // eslint-disable-line react-hooks/exhaustive-deps

  const cell = (text: string, side: 'l' | 'r') => {
    const matched = side === 'l' ? done.has(text) : pairs.some((p) => p[1] === text && done.has(p[0]));
    const sel = side === 'l' ? selL === text : selR === text;
    const wrong = flash && (side === 'l' ? flash.startsWith(`${text}|`) : flash.endsWith(`|${text}`));
    return (
      <motion.button
        key={text}
        type="button"
        disabled={matched || locked}
        animate={wrong ? { x: [0, -6, 6, -3, 3, 0] } : { x: 0 }}
        onClick={() => (side === 'l' ? setSelL(text) : setSelR(text))}
        className={clsx(
          'press min-h-14 rounded-[12px] border-[1.5px] px-3 py-2.5 text-[17px] shadow-[0_3px_0_rgba(26,51,0,0.12)] transition-colors',
          matched ? 'border-transparent bg-[var(--tint-raw-3)] text-ink/40 shadow-none' : wrong ? 'border-[var(--ray-2)] bg-butter' : sel ? 'border-ink bg-mark' : 'border-ink/20 bg-paper hover:bg-bone',
        )}
      >
        {text}
      </motion.button>
    );
  };
  return (
    <>
      <Title>Соедините пары</Title>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">{left.map((p) => cell(p[0], 'l'))}</div>
        <div className="flex flex-col gap-3">{right.map((p) => cell(p[1], 'r'))}</div>
      </div>
    </>
  );
}

function Summary({
  lesson,
  result,
  mistakes,
  fire,
  onAgain,
  levelUp,
  onCloseLevel,
  xp,
}: {
  lesson: Lesson;
  result: { xp: number; ms: number };
  mistakes: number;
  fire: number;
  onAgain(): void;
  levelUp: number | null;
  onCloseLevel(): void;
  xp: Parameters<typeof XpMeter>[0]['xp'];
}) {
  const total = lesson.steps.filter(graded).length;
  const accuracy = Math.round((Math.max(0, total - mistakes) / total) * 100);
  return (
    <div className={`hue-${lesson.unit.hue} flex min-h-dvh flex-col items-center justify-center gap-7 bg-paper px-4 py-10 text-center`}>
      <LevelUp level={levelUp} onClose={onCloseLevel} />
      <div className="relative">
        <Burst fire={fire} count={44} spread={280} className="left-1/2 top-1/2" />
        <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="grid size-32 place-items-center rounded-full bg-tint text-[64px] shadow-sticker">
          {mistakes === 0 ? '🏆' : lesson.unit.icon}
        </motion.div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="t-mono text-[12px] text-hue">
          {lesson.unit.title} · урок {lesson.n}
        </p>
        <h1 className="t-display text-[clamp(32px,6vw,48px)] leading-none">{mistakes === 0 ? 'Без единой ошибки!' : 'Урок пройден!'}</h1>
      </div>
      <div className="grid w-full max-w-md grid-cols-3 gap-3">
        {[
          ['опыт', `+${result.xp}`, 'bg-mark'],
          ['точность', `${accuracy}%`, 'bg-[var(--tint-raw-3)]'],
          ['время', mmss(result.ms), 'bg-[var(--tint-raw-5)]'],
        ].map(([label, value, bg], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.12 }} className={clsx('flex flex-col gap-1 rounded-[14px] px-3 py-4', bg)}>
            <span className="t-mono text-[11px] text-ink/70">{label}</span>
            <span className="t-heading tnum text-[26px]">{value}</span>
          </motion.div>
        ))}
      </div>
      <XpMeter xp={xp} className="w-full max-w-md" />
      <div className="flex w-full max-w-md flex-col gap-3">
        <Link to="/english" className="press grid h-14 place-items-center rounded-[12px] bg-ink text-[17px] font-[700] text-paper no-underline shadow-[0_4px_0_var(--ray-2)] hover:-translate-y-0.5">
          Продолжить путь
        </Link>
        <Button variant="secondary" onClick={onAgain}>
          Повторить урок
        </Button>
      </div>
    </div>
  );
}
