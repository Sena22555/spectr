import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarCheck, ArrowRight } from 'lucide-react';
import { ProblemCard } from './ProblemCard';
import { useProgress, type DailyTask as Daily } from '../../lib/practice';

const dateLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/** «Задача дня»: одна задача для всех, меняется каждый день. */
export function DailyTask({ daily, className }: { daily: Daily; className?: string }) {
  const progress = useProgress();
  const solved = progress.data?.solved.has(daily.problem.id) ?? false;
  return (
    <section className={clsx(`hue-${daily.subject.hue}`, 'tape relative flex flex-col gap-4 rounded-[14px] bg-tint p-5 pt-7 shadow-sticker sm:p-7 sm:pt-8', className)} aria-label="Задача дня">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-forest text-mark">
            <CalendarCheck className="size-5" strokeWidth={2} />
          </span>
          <div>
            <p className="t-mono text-[11px] text-hue">задача дня · {dateLabel.format(new Date())}</p>
            <p className="t-heading text-[22px] leading-tight">
              {daily.subject.title} → {daily.topic.title}
            </p>
          </div>
        </div>
        <Link to={`/practice/${daily.subject.slug}/${daily.topic.slug}`} className="link inline-flex items-center gap-1.5 text-[15px]">
          Теория по теме <ArrowRight className="size-4" strokeWidth={1.8} />
        </Link>
      </header>
      <ProblemCard problem={daily.problem} solved={solved} hue={daily.subject.hue} />
      <p className="t-caption text-hue">Новая задача — каждый день. В Telegram-боте можно решать её прямо в чате и держать серию 🔥</p>
    </section>
  );
}
