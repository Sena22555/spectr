import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'motion/react';
import clsx from 'clsx';
import { Check, Lightbulb, Eye, RotateCcw } from 'lucide-react';
import { RichText } from '../Tex';
import { useCheck, type CheckResult, type PracticeProblem } from '../../lib/practice';
import { haptic } from '../../lib/platform';
import { sfx, xpForAnswer } from '../../lib/game';
import { Burst, XpFloat } from '../game/Burst';

const LEVELS = ['', 'Разминка', 'Основа', 'Со звёздочкой'];

/** Задача с проверкой: ввод или выбор ответа, подсказка, разбор. */
export function ProblemCard({
  problem,
  index,
  solved: solvedBefore = false,
  hue = 2,
  onSolved,
  onResult,
  autoFocus,
}: {
  problem: PracticeProblem;
  index?: number;
  solved?: boolean;
  hue?: number;
  onSolved?(): void;
  /** когда задача закончена: решена или открыт разбор */
  onResult?(r: { correct: boolean; firstTry: boolean }): void;
  autoFocus?: boolean;
}) {
  const check = useCheck();
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hint, setHint] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [again, setAgain] = useState(false);
  const solved = result?.correct || (solvedBefore && !again);
  const [fire, setFire] = useState(0);
  const [gain, setGain] = useState(0);
  const shake = useAnimationControls();

  const submit = async (answer: string) => {
    if (!answer.trim()) return;
    const r = await check.mutateAsync({ problemId: problem.id, answer });
    setResult(r);
    if (r.correct) {
      haptic('success');
      sfx('correct');
      // опыт даём только за первое решение задачи
      setGain(solvedBefore ? 0 : xpForAnswer(wrong === 0));
      setFire((n) => n + 1);
      onSolved?.();
      onResult?.({ correct: true, firstTry: wrong === 0 });
    } else {
      haptic('tap');
      sfx('almost');
      void shake.start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.4 } });
      setWrong((n) => n + 1);
      if (r.solution) onResult?.({ correct: false, firstTry: false });
    }
  };

  const onForm = (e: FormEvent) => {
    e.preventDefault();
    void submit(value);
  };

  const reveal = async () => {
    const r = await check.mutateAsync({ problemId: problem.id, answer: '', reveal: true });
    setResult({ ...r, correct: false });
    onResult?.({ correct: false, firstTry: false });
  };

  return (
    <motion.article
      animate={shake}
      id={problem.id}
      className={clsx(
        `hue-${hue}`,
        'relative flex scroll-mt-28 flex-col gap-4 rounded-[12px] border-[1.5px] p-5 transition-colors sm:p-6',
        solved ? 'border-transparent bg-tint' : problem.self ? 'dashed-box bg-paper' : 'border-ink/15 bg-paper',
      )}
    >
      <Burst fire={fire} className="left-1/2 top-1/2" />
      {gain > 0 && <XpFloat fire={fire} amount={gain} />}
      <header className="flex flex-wrap items-center gap-2">
        {index !== undefined && <span className="t-mono rounded-full bg-ink px-2.5 py-1 text-[11px] text-paper">задача {index}</span>}
        {problem.level > 0 && (
          <span className="t-mono text-[12px] text-muted" title={LEVELS[problem.level]}>
            {'●'.repeat(problem.level)}
            <span className="opacity-30">{'●'.repeat(3 - problem.level)}</span> {LEVELS[problem.level]?.toLowerCase()}
          </span>
        )}
        {problem.self && <span className="t-mono rounded-full bg-mark px-2.5 py-1 text-[11px] text-forest">для самостоятельного решения</span>}
        {solved && (
          <span className="ml-auto inline-flex items-center gap-1 text-[14px] font-[600] text-hue">
            <Check className="size-4" strokeWidth={2.4} /> решено
          </span>
        )}
      </header>

      {problem.text.includes('\n') ? (
        <div className="flex flex-col gap-2">
          <p className="text-[18px] leading-relaxed">{problem.text.split('\n')[0]}</p>
          <pre className="m-0 overflow-x-auto rounded-ctl bg-forest px-4 py-3 font-mono text-[14.5px] leading-relaxed text-cream">{problem.text.split('\n').slice(1).join('\n')}</pre>
        </div>
      ) : (
        <p className="text-[18px] leading-relaxed">
          <RichText text={problem.text} />
        </p>
      )}

      {solved && !result ? (
        <button type="button" className="link inline-flex w-fit items-center gap-1.5 text-[15px]" onClick={() => setAgain(true)}>
          <RotateCcw className="size-4" strokeWidth={1.8} /> Решить ещё раз
        </button>
      ) : problem.kind === 'choice' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {problem.options!.map((o, i) => {
            const chosen = picked === i;
            return (
              <button
                key={i}
                type="button"
                disabled={check.isPending || Boolean(result?.correct)}
                onClick={() => {
                  setPicked(i);
                  void submit(String(i));
                }}
                className={clsx(
                  'press min-h-12 rounded-ctl border-[1.5px] px-4 py-2.5 text-left text-[16px] disabled:cursor-default',
                  chosen && result?.correct && 'border-ink bg-ink text-paper',
                  chosen && result && !result.correct && 'border-[var(--ray-2)] bg-butter',
                  !(chosen && result) && 'border-ink/25 hover:border-ink hover:bg-mark/40',
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        !result?.correct && (
          <form onSubmit={onForm} className="flex flex-wrap items-stretch gap-2">
            <label className="relative min-w-0 flex-1 basis-48">
              <span className="sr-only">Ваш ответ</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode={problem.kind === 'number' ? 'decimal' : 'text'}
                autoFocus={autoFocus}
                autoComplete="off"
                placeholder={problem.kind === 'number' ? 'Ответ числом' : 'Ваш ответ'}
                className="h-12 w-full rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 pr-20 text-[17px] transition-[border-color,box-shadow] hover:border-ink/50 focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
              />
              {problem.unit && <span className="t-mono pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{problem.unit}</span>}
            </label>
            <button type="submit" disabled={check.isPending || !value.trim()} className="press print-shadow h-12 rounded-ctl bg-ink px-5 text-[15px] font-[600] text-paper hover:bg-mark hover:text-forest disabled:opacity-50">
              Проверить
            </button>
          </form>
        )
      )}

      <AnimatePresence initial={false}>
        {result && !result.correct && result.solution === null && (
          <motion.p
            key={`wrong-${wrong}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-ctl bg-butter px-3.5 py-2.5 text-[16px]"
            role="status"
          >
            <span aria-hidden="true">🟡</span>
            <span>
              <b>Почти!</b> {wrong === 1 ? 'Проверьте вычисления — или загляните в подсказку, она рядом.' : 'Ещё одна попытка — и откроем разбор по шагам. Ошибаться здесь можно, так и учатся.'}
            </span>
          </motion.p>
        )}
        {result?.correct && (
          <motion.div key="ok" initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex items-center gap-3" role="status">
            <span className="spectrum-bar h-2 w-16 rounded-full" aria-hidden="true" />
            <p className="t-heading text-[22px]">Верно!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!solved && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {!problem.self || wrong > 0 ? (
            <button type="button" className="link inline-flex items-center gap-1.5 text-[15px]" onClick={() => setHint((v) => !v)} aria-expanded={hint}>
              <Lightbulb className="size-4" strokeWidth={1.8} /> {hint ? 'Скрыть подсказку' : 'Подсказка'}
            </button>
          ) : (
            <span className="t-caption text-muted">Подсказка откроется после первой попытки</span>
          )}
          {!result?.solution && (
            <button type="button" className="link inline-flex items-center gap-1.5 text-[15px] text-muted" onClick={reveal} disabled={check.isPending}>
              <Eye className="size-4" strokeWidth={1.8} /> Показать решение
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {hint && !solved && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-ctl bg-butter px-4 py-3 text-[16px]"
          >
            💡 <RichText text={problem.hint} />
          </motion.p>
        )}
        {result?.solution && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 rounded-ctl border-l-4 border-ray bg-paper/70 py-3 pr-3 pl-4">
              <p className="t-mono text-[12px] text-muted">решение</p>
              {result.solution.map((s, i) => (
                <p key={i} className="text-[16.5px] leading-relaxed">
                  <RichText text={s} />
                </p>
              ))}
              {!result.correct && result.answer && (
                <p className="text-[16px]">
                  Ответ: <b>{result.answer}</b>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
