import { useState, type FormEvent } from 'react';
import { usePageTitle } from '../../lib/title';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, Check, Gauge, Sparkles } from 'lucide-react';
import { Container } from '../../components/Layout';
import { RichText } from '../../components/Tex';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useCheck, type PracticeProblem } from '../../lib/practice';
import { haptic } from '../../lib/platform';
import { plural } from '../../lib/format';

interface Diagnostic {
  subject: { slug: string; title: string; hue: number; course: string };
  problems: (PracticeProblem & { topic: { slug: string; title: string } })[];
}

interface Answer {
  correct: boolean;
  skipped: boolean;
  answer: string | null;
  solution: string[] | null;
}

/**
 * Диагностика: по одной простой задаче из каждой темы.
 * Это не контрольная: ошибаться можно. После ответа сразу показываем правильный ответ,
 * дальше человек сам нажимает «Дальше». В конце — что уже знаешь и что подтянуть.
 */
export default function PracticeDiagnostic() {
  const { subject = '' } = useParams();
  const q = useQuery({ queryKey: ['diagnostic', subject], queryFn: () => api<Diagnostic>(`/practice/diagnostic/${subject}`), staleTime: Infinity });
  const check = useCheck();
  usePageTitle(q.data ? `Проверка уровня: ${q.data.subject.title}` : null);
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [current, setCurrent] = useState<Answer | null>(null);

  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} />
      </Container>
    );
  const { subject: s, problems } = q.data;
  const done = step >= problems.length;
  const score = answers.filter((a) => a.correct).length;
  const problem = problems[step];

  const answer = async (raw: string, skipped = false) => {
    if (!problem || check.isPending || current) return;
    let r = skipped ? null : await check.mutateAsync({ problemId: problem.id, answer: raw });
    // не угадали — сразу показываем ответ и короткий разбор, чтобы было чему научиться
    if (!r?.correct) r = { ...(await check.mutateAsync({ problemId: problem.id, answer: '', reveal: true })), correct: false };
    haptic(r.correct ? 'success' : 'tap');
    setCurrent({ correct: r.correct, skipped, answer: r.answer, solution: r.solution });
  };

  const next = () => {
    if (!current) return;
    const all = [...answers, current];
    setAnswers(all);
    setCurrent(null);
    setValue('');
    setPicked(null);
    setStep((n) => n + 1);
    if (step + 1 >= problems.length) {
      void api(`/practice/diagnostic/${subject}/done`, { method: 'POST', json: { score: all.filter((a) => a.correct).length, total: problems.length } }).catch(() => undefined);
    }
  };

  const weak = problems.filter((_, i) => answers[i] && !answers[i]!.correct);

  return (
    <Container className="max-w-[780px] py-8 sm:py-12">
      <div className={`hue-${s.hue} flex flex-col gap-8`}>
        <header className="flex flex-col gap-3">
          <p className="t-mono inline-flex items-center gap-2 text-[12px] text-hue">
            <Gauge className="size-4" /> проверка уровня · {s.title.toLowerCase()}
          </p>
          <h1 className="t-display t-lg">{done ? 'Вот что получилось' : step < 0 ? `Что вы уже знаете по предмету «${s.title}»?` : `Задача ${step + 1} из ${problems.length}`}</h1>
          {step >= 0 && !done && (
            <div className="flex gap-1.5" aria-hidden="true">
              {problems.map((_, i) => (
                <span
                  key={i}
                  className={clsx('h-2 flex-1 rounded-full transition-colors', i < answers.length ? (answers[i]!.correct ? 'bg-ray' : 'bg-[var(--ray-2)]') : i === step ? 'bg-ink' : 'bg-ink/15')}
                />
              ))}
            </div>
          )}
        </header>

        {step < 0 && (
          <div className="flex flex-col gap-6">
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[17px]">
              {[
                `${problems.length} ${plural(problems.length, 'простая задача', 'простые задачи', 'простых задач')} — по одной из каждой темы. Займёт минут пять.`,
                'Это не контрольная и не оценка. Ошибаться можно: после каждого ответа сразу покажем правильный и коротко объясним.',
                'Не знаете — жмите «Пропустить», это тоже честный ответ.',
                'В конце увидите, какие темы уже в порядке, а какие стоит подтянуть, — со ссылками на теорию и задачи.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <Check className="mt-1 size-5 shrink-0 text-hue" strokeWidth={2.2} />
                  {t}
                </li>
              ))}
            </ul>
            <Button className="w-fit" onClick={() => setStep(0)}>
              Начать <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {problem && !done && (
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="flex flex-col gap-5 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-6">
              <p className="t-mono text-[12px] text-muted">тема: {problem.topic.title}</p>
              <p className="text-[19px] leading-relaxed">
                <RichText text={problem.text} />
              </p>

              {problem.kind === 'choice' ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {problem.options!.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={Boolean(current) || check.isPending}
                      onClick={() => {
                        setPicked(i);
                        void answer(String(i));
                      }}
                      className={clsx(
                        'press min-h-12 rounded-ctl border-[1.5px] px-4 py-2.5 text-left text-[16px] disabled:cursor-default',
                        picked === i && current?.correct && 'border-ink bg-ink text-paper',
                        picked === i && current && !current.correct && 'border-[var(--ray-2)] bg-butter',
                        !(picked === i && current) && 'border-ink/25 hover:border-ink hover:bg-mark/40',
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void answer(value);
                  }}
                >
                  <input
                    autoFocus
                    value={value}
                    disabled={Boolean(current)}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode={problem.kind === 'number' ? 'decimal' : 'text'}
                    placeholder={problem.unit ? `Ответ, ${problem.unit}` : 'Ответ'}
                    aria-label="Ответ"
                    className="h-12 min-w-0 flex-1 basis-48 rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 text-[17px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none disabled:opacity-70"
                  />
                  {!current && (
                    <Button type="submit" disabled={!value.trim()} loading={check.isPending}>
                      Ответить
                    </Button>
                  )}
                </form>
              )}

              {!current && (
                <button type="button" className="link w-fit text-[15px] text-muted" onClick={() => answer('', true)} disabled={check.isPending}>
                  Пропустить — пока не знаю
                </button>
              )}

              {current && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4" role="status">
                  {current.correct ? (
                    <p className="t-heading flex items-center gap-2 text-[22px] text-hue">
                      <Sparkles className="size-5" /> Верно!
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-[12px] bg-butter px-4 py-3">
                      <p className="text-[17px]">
                        🟡 <b>{current.skipped ? 'Хорошо, что честно!' : 'Почти!'}</b> Правильный ответ: <b>{current.answer}</b>. Ничего страшного — эту тему подтянем.
                      </p>
                      {current.solution?.[0] && (
                        <p className="text-[15.5px] text-ink/85">
                          <RichText text={current.solution.join(' ')} />
                        </p>
                      )}
                    </div>
                  )}
                  <Button className="w-fit" onClick={next} autoFocus>
                    {step + 1 < problems.length ? 'Дальше' : 'Посмотреть итог'} <ArrowRight className="size-4" />
                  </Button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {done && (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-2">
              <p className="t-display tnum text-[64px] leading-none text-hue">
                {score} из {problems.length}
              </p>
              <p className="max-w-[52ch] text-[18px]">
                {score === problems.length
                  ? 'Отличная база! Можно браться за задачи «со звёздочкой» в практикуме.'
                  : score >= problems.length / 2
                    ? 'Хорошая основа. Пара тем просит внимания — ниже ссылки, с чего начать.'
                    : 'Начало положено! Ниже темы, с которых удобнее стартовать. Каждая — минут на десять, с разбором.'}
              </p>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {problems.map((p, i) => {
                const ok = answers[i]?.correct;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-dashed border-hair-soft py-3">
                    <span className="flex items-center gap-3">
                      <span className={clsx('t-mono rounded-full px-2.5 py-1 text-[11px]', ok ? 'bg-tint text-hue' : 'bg-butter text-[var(--ink-2)]')}>{ok ? '✓ знаю' : '◐ подтянуть'}</span>
                      <span className="text-[17px]">{p.topic.title}</span>
                    </span>
                    <Link to={`/practice/${s.slug}/${p.topic.slug}`} className="link shrink-0 text-[15px]">
                      {ok ? 'Задачи сложнее' : 'Разобрать тему'}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-3">
              {weak.length > 0 && (
                <ButtonLink to={`/practice/${s.slug}/${weak[0]!.topic.slug}`}>
                  Начать с темы «{weak[0]!.topic.title}» <ArrowRight className="size-4" />
                </ButtonLink>
              )}
              <ButtonLink
                variant={weak.length ? 'secondary' : 'primary'}
                to={`/book?subject=${s.course}&note=${encodeURIComponent(`Проверка уровня «${s.title}»: ${score} из ${problems.length}. Подтянуть: ${weak.map((p) => p.topic.title).join(', ') || 'всё в порядке'}`)}`}
              >
                Разобрать с репетитором
              </ButtonLink>
            </div>
            <p className="t-caption text-muted">Это не оценка: проверку можно пройти ещё раз в любой момент — и увидеть, как вырос результат.</p>
          </div>
        )}
      </div>
    </Container>
  );
}
