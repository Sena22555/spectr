import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, Check, Gauge, X } from 'lucide-react';
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

/** Диагностика: по задаче из каждой темы, без подсказок, в конце — разбор слабых мест. */
export default function PracticeDiagnostic() {
  const { subject = '' } = useParams();
  const q = useQuery({ queryKey: ['diagnostic', subject], queryFn: () => api<Diagnostic>(`/practice/diagnostic/${subject}`), staleTime: Infinity });
  const check = useCheck();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<{ correct: boolean; answer: string | null }[]>([]);
  const [value, setValue] = useState('');
  const [flash, setFlash] = useState<boolean | null>(null);

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

  const answer = async (raw: string) => {
    if (!raw.trim() || check.isPending) return;
    const r = await check.mutateAsync({ problemId: problems[step]!.id, answer: raw });
    haptic(r.correct ? 'success' : 'error');
    setFlash(r.correct);
    const next = [...answers, { correct: r.correct, answer: r.answer }];
    setAnswers(next);
    setTimeout(() => {
      setFlash(null);
      setValue('');
      setStep((n) => n + 1);
      if (step + 1 >= problems.length) {
        void api(`/practice/diagnostic/${subject}/done`, { method: 'POST', json: { score: next.filter((a) => a.correct).length, total: problems.length } }).catch(() => undefined);
      }
    }, 650);
  };

  return (
    <Container className="max-w-[780px] py-8 sm:py-12">
      <div className={`hue-${s.hue} flex flex-col gap-8`}>
        <header className="flex flex-col gap-3">
          <p className="t-mono inline-flex items-center gap-2 text-[12px] text-hue">
            <Gauge className="size-4" /> диагностика · {s.title.toLowerCase()}
          </p>
          <h1 className="t-display t-lg">{done ? 'Ваш результат' : step < 0 ? `Проверьте уровень по предмету «${s.title}»` : `Вопрос ${step + 1} из ${problems.length}`}</h1>
          {step >= 0 && !done && (
            <div className="flex gap-1.5" aria-hidden="true">
              {problems.map((_, i) => (
                <span key={i} className={clsx('h-1.5 flex-1 rounded-full', i < answers.length ? (answers[i]!.correct ? 'bg-ray' : 'bg-ember-text/60') : i === step ? 'bg-ink' : 'bg-ink/15')} />
              ))}
            </div>
          )}
        </header>

        {step < 0 && (
          <div className="flex flex-col gap-5">
            <p className="t-sub text-muted">
              {problems.length} {plural(problems.length, 'задача', 'задачи', 'задач')} — по одной из каждой темы. Без подсказок и без таймера. В конце покажем, какие темы уже в порядке, а какие стоит подтянуть.
            </p>
            <Button className="w-fit" onClick={() => setStep(0)}>
              Начать <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step >= 0 && !done && (
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="flex flex-col gap-5 rounded-[14px] border-[1.5px] border-ink/15 bg-paper p-6">
              <p className="t-mono text-[12px] text-muted">тема: {problems[step]!.topic.title}</p>
              <p className="text-[19px] leading-relaxed">
                <RichText text={problems[step]!.text} />
              </p>
              {problems[step]!.kind === 'choice' ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {problems[step]!.options!.map((o, i) => (
                    <button key={i} type="button" disabled={flash !== null} onClick={() => answer(String(i))} className="press min-h-12 rounded-ctl border-[1.5px] border-ink/25 px-4 py-2.5 text-left text-[16px] hover:border-ink hover:bg-mark/40">
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
                    onChange={(e) => setValue(e.target.value)}
                    inputMode={problems[step]!.kind === 'number' ? 'decimal' : 'text'}
                    placeholder={problems[step]!.unit ? `Ответ, ${problems[step]!.unit}` : 'Ответ'}
                    aria-label="Ответ"
                    className="h-12 min-w-0 flex-1 basis-48 rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 text-[17px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
                  />
                  <Button type="submit" disabled={!value.trim() || flash !== null}>
                    Ответить
                  </Button>
                  <button type="button" className="link px-2 text-[15px] text-muted" onClick={() => answer('—')}>
                    Не знаю
                  </button>
                </form>
              )}
              {flash !== null && (
                <p className={clsx('t-heading inline-flex items-center gap-2 text-[20px]', flash ? 'text-hue' : 'text-ember-text')} role="status">
                  {flash ? <Check className="size-5" /> : <X className="size-5" />} {flash ? 'Верно' : 'Мимо'}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {done && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end gap-4">
              <p className="t-display tnum text-[72px] leading-none text-hue">
                {score}/{problems.length}
              </p>
              <p className="max-w-[40ch] pb-2 text-[18px]">
                {score === problems.length
                  ? 'Отличная база! Самое время взяться за задачи со звёздочкой.'
                  : score >= problems.length / 2
                    ? 'Хорошая основа — несколько тем стоит подтянуть.'
                    : 'Есть что наверстать — начните с тем, отмеченных ниже.'}
              </p>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {problems.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-dashed border-hair-soft py-3">
                  <span className="flex items-center gap-3">
                    <span className={clsx('grid size-7 place-items-center rounded-full', answers[i]?.correct ? 'bg-tint text-hue' : 'bg-[var(--tint-raw-0)] text-ember-text')}>
                      {answers[i]?.correct ? <Check className="size-4" /> : <X className="size-4" />}
                    </span>
                    <span className="text-[17px]">{p.topic.title}</span>
                  </span>
                  <Link to={`/practice/${s.slug}/${p.topic.slug}`} className="link shrink-0 text-[15px]">
                    {answers[i]?.correct ? 'Тема' : 'Разобрать'}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <ButtonLink
                to={`/book?subject=${s.course}&note=${encodeURIComponent(`Диагностика по предмету «${s.title}»: ${score} из ${problems.length}. Темы для разбора: ${problems.filter((_, i) => !answers[i]?.correct).map((p) => p.topic.title).join(', ') || 'нет'}`)}`}
              >
                Разобрать слабые темы с репетитором
              </ButtonLink>
              <ButtonLink to="/practice" variant="secondary">
                В практикум
              </ButtonLink>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
