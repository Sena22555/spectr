import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, Clock, RotateCcw } from 'lucide-react';
import { Container } from '../../components/Layout';
import { RichText } from '../../components/Tex';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { EXAM_TASKS, useCheck, type CheckResult } from '../../lib/practice';
import { isMiniApp } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';

interface Variant {
  key: string;
  title: string;
  exam: string;
  items: { task: number; trainer: { id: string; title: string }; problem: { id: string; text: string; kind: string; unit: string | null } }[];
}

const SUBJECT_BY_KEY: Record<string, string> = { 'oge-math': 'ОГЭ|математика', 'ege-math': 'ЕГЭ|профильная математика', 'oge-inf': 'ОГЭ|информатика', 'ege-inf': 'ЕГЭ|информатика' };
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Пробный вариант: по заданию на каждый номер экзамена, который есть в тренажёрах; итог по номерам. */
export default function VariantPage() {
  const { key = '' } = useParams();
  const [round, setRound] = useState(0);
  const q = useQuery({ queryKey: ['variant', key, round], queryFn: () => api<Variant>(`/practice/variant/${key}`), staleTime: Infinity });
  usePageTitle(q.data ? `Пробный вариант: ${q.data.title}` : 'Пробный вариант');
  const check = useCheck();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, CheckResult> | null>(null);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (results) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [results]);

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
  const v = q.data;
  const names = EXAM_TASKS[SUBJECT_BY_KEY[v.key] ?? '']?.tasks ?? {};

  const finish = async () => {
    setBusy(true);
    const out: Record<string, CheckResult> = {};
    for (const it of v.items) {
      const raw = (answers[it.problem.id] ?? '').trim();
      // пустой ответ не отправляем как попытку — просто открываем решение
      let r = await check.mutateAsync({ problemId: it.problem.id, answer: raw, reveal: !raw });
      // в пробнике разбор нужен сразу, даже после первой ошибки
      if (!r.correct && !r.answer) r = { ...(await check.mutateAsync({ problemId: it.problem.id, answer: '', reveal: true })), correct: false };
      out[it.problem.id] = r;
    }
    setResults(out);
    setBusy(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const again = () => {
    setAnswers({});
    setResults(null);
    setRound((r) => r + 1);
  };
  const score = results ? v.items.filter((it) => results[it.problem.id]?.correct).length : 0;
  const weak = results ? v.items.filter((it) => !results[it.problem.id]?.correct) : [];

  return (
    <Container className={clsx('flex max-w-[860px] flex-col gap-8', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <header className="flex flex-col gap-3">
        <p className="t-mono text-[12px] text-muted">
          <Link to="/practice/trainers?tab=exams" className="link">
            ОГЭ и ЕГЭ
          </Link>{' '}
          / пробный вариант
        </p>
        <h1 className="t-display t-lg">Пробный вариант: {v.title}</h1>
        <p className="t-sub max-w-[60ch] text-muted">
          По одному заданию на каждый номер первой части, который есть в нашем сборнике ({v.items.length}). Числа каждый раз новые. Ответы проверим в конце и покажем, какие номера подтянуть.
        </p>
      </header>

      {results ? (
        <section className="hue-5 flex flex-col gap-3 rounded-[14px] bg-tint p-6" aria-live="polite">
          <p className="t-display tnum text-[56px] leading-none">
            {score} из {v.items.length}
          </p>
          <p className="text-[17px]">
            {score === v.items.length ? 'Все номера решены — отличная форма!' : score >= v.items.length / 2 ? 'Хороший результат. Ниже — номера, которые стоит подтянуть.' : 'Начало положено. Тренажёры по номерам ниже помогут быстро подтянуть.'}{' '}
            Время: {mmss(now - started)}.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button onClick={again}>
              <RotateCcw className="size-4" /> Новый вариант
            </Button>
            {weak[0] && (
              <ButtonLink to={`/practice/train/${weak[0].trainer.id}`} variant="secondary">
                Тренажёр: №{weak[0].task}
              </ButtonLink>
            )}
          </div>
        </section>
      ) : (
        <div className="sticky top-20 z-10 flex items-center justify-between gap-3 rounded-[12px] border border-ink/15 bg-paper/95 px-4 py-3 backdrop-blur">
          <span className="t-heading tnum inline-flex items-center gap-2 text-[20px]">
            <Clock className="size-5" /> {mmss(now - started)}
          </span>
          <span className="t-mono text-[12px] text-muted">
            заполнено {v.items.filter((it) => (answers[it.problem.id] ?? '').trim()).length} из {v.items.length}
          </span>
          <Button onClick={finish} loading={busy}>
            Проверить
          </Button>
        </div>
      )}

      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {v.items.map((it) => {
          const r = results?.[it.problem.id];
          return (
            <li key={it.problem.id} className={clsx('flex flex-col gap-3 rounded-[14px] border-[1.5px] p-5', r ? (r.correct ? 'border-transparent bg-[var(--tint-raw-3)]' : 'border-transparent bg-butter') : 'border-ink/15 bg-paper')}>
              <p className="flex flex-wrap items-baseline gap-3">
                {it.task > 0 && <span className="t-display tnum text-[24px] leading-none text-[var(--ray-5)]">№{it.task}</span>}
                <span className="t-mono text-[12px] text-muted">{names[it.task] ?? it.trainer.title}</span>
                {r && <span className="ml-auto text-[15px]">{r.correct ? <Check className="inline size-5 text-[var(--ink-3)]" /> : '🟡'}</span>}
              </p>
              {it.problem.text.includes('\n') ? (
                <>
                  <p className="text-[17px]">{it.problem.text.split('\n')[0]}</p>
                  <pre className="m-0 overflow-x-auto rounded-ctl bg-forest px-4 py-3 font-mono text-[14px] text-cream">{it.problem.text.split('\n').slice(1).join('\n')}</pre>
                </>
              ) : (
                <p className="text-[17px] leading-relaxed">
                  <RichText text={it.problem.text} />
                </p>
              )}
              {!r ? (
                <label className="relative max-w-sm">
                  <span className="sr-only">Ответ на задание {it.task}</span>
                  <input
                    value={answers[it.problem.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [it.problem.id]: e.target.value }))}
                    inputMode={it.problem.kind === 'number' ? 'decimal' : 'text'}
                    placeholder="Ответ"
                    className="h-12 w-full rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 pr-20 text-[17px] focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none"
                  />
                  {it.problem.unit && <span className="t-mono pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted">{it.problem.unit}</span>}
                </label>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[16px]">
                    {r.correct ? `Верно: ${r.answer}` : `${answers[it.problem.id]?.trim() ? `Ваш ответ: ${answers[it.problem.id]}. ` : ''}Правильно: ${r.answer}`}
                  </p>
                  <button type="button" className="link inline-flex w-fit items-center gap-1 text-[14px]" onClick={() => setOpen(open === it.problem.id ? null : it.problem.id)} aria-expanded={open === it.problem.id}>
                    Решение <ChevronDown className={clsx('size-4 transition-transform', open === it.problem.id && 'rotate-180')} />
                  </button>
                  {open === it.problem.id &&
                    r.solution?.map((s, k) => (
                      <p key={k} className="text-[15.5px]">
                        <RichText text={s} />
                      </p>
                    ))}
                  {!r.correct && (
                    <Link to={`/practice/train/${it.trainer.id}`} className="link w-fit text-[14px]">
                      Тренажёр «{it.trainer.title}» →
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!results && (
        <Button className="w-fit" onClick={finish} loading={busy}>
          Проверить ответы
        </Button>
      )}
    </Container>
  );
}
