import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Dumbbell, Infinity as InfinityIcon, Target } from 'lucide-react';
import { Container } from '../../components/Layout';
import { Chip, ErrorNote, Skeleton } from '../../components/ui';
import { EXAM_TASKS, SUBJECT_HUE, SUBJECT_NAME, gradesLabel, useProgress, useTrainers, type Trainer } from '../../lib/practice';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';

const GRADES = [5, 6, 7, 8, 9, 10, 11];
const GRADE_KEY = 'spectr.grade';

function savedGrade() {
  try {
    const g = Number(localStorage.getItem(GRADE_KEY));
    return GRADES.includes(g) ? g : 7;
  } catch {
    return 7;
  }
}

/** Сборник задач: тренажёры по классам и по номерам заданий ОГЭ/ЕГЭ. */
export default function Trainers() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'exams' ? 'exams' : 'grades';
  const q = useTrainers();
  const progress = useProgress();
  const [grade, setGrade] = useState(savedGrade);
  useEffect(() => {
    try {
      localStorage.setItem(GRADE_KEY, String(grade));
    } catch {
      /* ignore */
    }
  }, [grade]);

  return (
    <Container className={clsx('flex flex-col gap-10', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <nav aria-label="Хлебные крошки" className="t-mono -mb-4 flex items-center gap-2 text-[12px] text-muted">
        <Link to="/practice" className="link">
          практикум
        </Link>
        <span aria-hidden="true">/</span> сборник задач
      </nav>
      <header className="grid items-end gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          <Chip hue={3} icon={<InfinityIcon />}>
            бесплатно · задачи не кончаются
          </Chip>
          <h1 className="t-display t-lg">
            Сборник задач <mark>5–11 класс</mark> и ОГЭ/ЕГЭ
          </h1>
          <p className="t-sub max-w-[56ch] text-muted">
            Каждый тренажёр — бесконечный: числа каждый раз новые, ответ проверяется сразу. Ошиблись — подскажем, ещё раз — покажем решение по шагам.
          </p>
        </div>
        <ol className="m-0 grid list-none gap-2 p-0 text-[15.5px]">
          {['Выберите класс или номер задания экзамена', 'Решайте: после ответа — сразу «верно» или подсказка', 'Каждые 10 задач — итог и совет, что повторить'].map((s, i) => (
            <li key={s} className="flex items-center gap-3 rounded-[10px] bg-bone px-3 py-2">
              <span className="t-mono grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] text-mark">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Как искать задачи">
        {[
          ['grades', 'По классам', Dumbbell],
          ['exams', 'ОГЭ и ЕГЭ по номерам', Target],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Dumbbell;
          return (
            <button
              key={key as string}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams(key === 'grades' ? {} : { tab: 'exams' }, { replace: true })}
              className={clsx('press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-[550]', tab === key ? 'bg-ink text-paper' : 'border border-ink/30 hover:bg-ink/[0.06]')}
            >
              <I className="size-4" /> {label as string}
            </button>
          );
        })}
      </div>

      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.isPending && <Skeleton className="h-96" />}
      {q.data &&
        (tab === 'grades' ? (
          <ByGrade trainers={q.data} grade={grade} setGrade={setGrade} stats={progress.data?.trainers ?? {}} />
        ) : (
          <ByExam trainers={q.data} stats={progress.data?.trainers ?? {}} />
        ))}
    </Container>
  );
}

function ByGrade({ trainers, grade, setGrade, stats }: { trainers: Trainer[]; grade: number; setGrade(g: number): void; stats: Record<string, { solved: number }> }) {
  const list = trainers.filter((t) => t.grades[0] <= grade && grade <= t.grades[1]);
  const bySubject = (['math', 'physics', 'informatics'] as const).map((s) => [s, list.filter((t) => t.subject === s)] as const).filter(([, l]) => l.length);
  return (
    <section className="flex flex-col gap-8" aria-label="Тренажёры по классам">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Класс">
        <span className="t-caption mr-1 text-muted">Класс:</span>
        {GRADES.map((g) => (
          <button
            key={g}
            role="radio"
            aria-checked={grade === g}
            onClick={() => setGrade(g)}
            className={clsx('press t-heading grid size-12 place-items-center rounded-full text-[19px]', grade === g ? 'bg-mark text-forest shadow-[0_0_0_2px_var(--ink)]' : 'bg-bone hover:bg-butter')}
          >
            {g}
          </button>
        ))}
      </div>
      {bySubject.map(([subject, items]) => (
        <div key={subject} className="flex flex-col gap-4">
          <h2 className="t-display t-md">{SUBJECT_NAME[subject]}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <TrainerCard key={t.id} t={t} solved={stats[t.id]?.solved ?? 0} />
            ))}
          </div>
        </div>
      ))}
      {!bySubject.length && <p className="text-muted">Для этого класса тренажёры скоро появятся.</p>}
    </section>
  );
}

function ByExam({ trainers, stats }: { trainers: Trainer[]; stats: Record<string, { solved: number }> }) {
  const groups = useMemo(() => {
    const out: { key: string; title: string; rows: { task: number; title: string; trainers: Trainer[] }[] }[] = [];
    for (const [key, meta] of Object.entries(EXAM_TASKS)) {
      const [exam, subject] = key.split('|');
      const rows = Object.entries(meta.tasks)
        .map(([task, title]) => ({ task: Number(task), title, trainers: trainers.filter((t) => t.exams.some((e) => e.exam === exam && e.subject === subject && e.task === Number(task))) }))
        .filter((r) => r.trainers.length)
        .sort((a, b) => a.task - b.task);
      if (rows.length) out.push({ key, title: meta.title, rows });
    }
    return out;
  }, [trainers]);
  return (
    <section className="flex flex-col gap-10" aria-label="Задания ОГЭ и ЕГЭ">
      <p className="max-w-[70ch] rounded-[10px] bg-bone px-4 py-3 text-[15px] text-muted">
        Задачи авторские, в формате заданий экзамена: числа каждый раз новые, решения — по шагам. Номера — по демоверсиям ФИПИ последних лет; если в новом году нумерация сдвинется, мы её обновим.
      </p>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-3">
          <h2 className="t-display t-md">{g.title}</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {g.rows.map((row) => (
              <li key={row.task} className="grid gap-3 border-b border-dashed border-hair-soft py-4 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-center">
                <p className="flex items-baseline gap-3">
                  {row.task > 0 && <span className="t-display tnum text-[28px] leading-none text-[var(--ray-5)]">№{row.task}</span>}
                  <span className="text-[17px] font-[550]">{row.title}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {row.trainers.map((t) => (
                    <Link key={t.id} to={`/practice/train/${t.id}`} className={`hue-${SUBJECT_HUE[t.subject]} press inline-flex items-center gap-2 rounded-full bg-tint px-4 py-2 text-[15px] no-underline hover:-translate-y-0.5`}>
                      {t.title}
                      {(stats[t.id]?.solved ?? 0) > 0 && <span className="t-mono text-[11px] text-hue">✓ {stats[t.id]!.solved}</span>}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function TrainerCard({ t, solved }: { t: Trainer; solved: number }) {
  const hue = SUBJECT_HUE[t.subject];
  return (
    <Link to={`/practice/train/${t.id}`} className={clsx(`hue-${hue}`, 'lift group flex h-full flex-col gap-2 rounded-[12px] border-[1.5px] border-ink/15 bg-paper p-5 no-underline hover:-translate-y-1 hover:border-ink/40')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-mono text-[11px] text-muted">{gradesLabel(t.grades)}</span>
        {t.exams.map((e) => (
          <span key={`${e.exam}${e.subject}${e.task}`} className="t-mono rounded-full bg-tint px-2 py-0.5 text-[10.5px] text-hue">
            {e.exam}
            {e.task ? ` №${e.task}` : ''}
          </span>
        ))}
      </div>
      <h3 className="lift-title t-heading text-[21px] leading-tight">{t.title}</h3>
      <p className="text-[15px] text-muted">{t.skill}</p>
      <p className="t-mono mt-auto pt-2 text-[12px] text-muted">{solved ? `решено ${solved} ${plural(solved, 'задача', 'задачи', 'задач')}` : 'начать →'}</p>
    </Link>
  );
}
