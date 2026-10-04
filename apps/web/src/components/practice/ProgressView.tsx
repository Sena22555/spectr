import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Flame, Target, TrendingUp } from 'lucide-react';
import { plural } from '../../lib/format';
import type { Progress } from '../../lib/progress';

const dayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const SUBJECT_HUE: Record<string, number> = { math: 1, physics: 5, informatics: 3 };

/** Сводка прогресса: цифры, две недели по дням, предметы, что освоено и что подтянуть, достижения. */
export function ProgressView({ p, forParent = false }: { p: Progress; forParent?: boolean }) {
  const max = Math.max(1, ...p.last14.map((d) => d.solved));
  const diff = p.solvedWeek - p.solvedPrevWeek;
  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Главные цифры">
        <div className="hue-3 flex flex-col gap-1 rounded-[14px] bg-tint p-5">
          <span className="t-mono inline-flex items-center gap-1.5 text-[12px] text-hue">
            <Target className="size-4" /> за 7 дней
          </span>
          <span className="t-display tnum text-[52px] leading-none">{p.solvedWeek}</span>
          <span className="text-[15px]">
            {plural(p.solvedWeek, 'задача решена', 'задачи решено', 'задач решено')}
            {diff > 0 && <b className="text-[var(--ink-3)]"> · +{diff} к прошлой неделе</b>}
          </span>
        </div>
        <div className={clsx('flex flex-col gap-1 rounded-[14px] p-5', p.streak >= 3 ? 'bg-mark' : 'bg-bone')}>
          <span className="t-mono inline-flex items-center gap-1.5 text-[12px] text-muted">
            <Flame className="size-4 text-[var(--ray-0)]" /> серия дней
          </span>
          <span className="t-display tnum text-[52px] leading-none">{p.streak}</span>
          <span className="text-[15px]">
            {p.activeDays7} из 7 дней с задачами · рекорд {p.bestStreak}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[14px] bg-bone p-5">
          <span className="t-mono inline-flex items-center gap-1.5 text-[12px] text-muted">
            <TrendingUp className="size-4" /> всего
          </span>
          <span className="t-display tnum text-[52px] leading-none">{p.solvedTotal}</span>
          <span className="text-[15px]">{p.solvedTotal ? `точность ${p.accuracy}%` : 'начните с задачи дня'}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="days">
        <h2 id="days" className="t-heading text-[22px]">
          Две недели по дням
        </h2>
        <div className="flex h-[140px] items-end gap-1.5" role="img" aria-label={`Решено по дням: ${p.last14.map((d) => d.solved).join(', ')}`}>
          {p.last14.map((d, i) => (
            <div key={d.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.solved}`}>
              {d.solved > 0 && <span className="t-mono tnum text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100">{d.solved}</span>}
              <span className={clsx('w-full rounded-t-[4px]', d.solved ? 'bg-[var(--ray-5)]' : 'bg-ink/8')} style={{ height: `${Math.max(4, (d.solved / max) * 100)}%` }} />
              <span className={clsx('t-mono text-[10px]', i === 13 ? 'font-[700] text-ink' : 'text-muted')}>{dayFmt.format(new Date(`${d.day}T12:00:00`)).replace('.', '')}</span>
            </div>
          ))}
        </div>
      </section>

      {p.bySubject.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="t-heading text-[22px]">✅ Получается</h2>
            {p.mastered.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {p.mastered.map((m) => (
                  <li key={m.link}>
                    <Link to={m.link} className={`hue-${SUBJECT_HUE[m.subject] ?? 3} press inline-flex rounded-full bg-tint px-3.5 py-1.5 text-[15px] no-underline`}>
                      {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">Здесь появятся темы, которые уже уверенно получаются: все задачи темы или 10 задач тренажёра с точностью от 80%.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="t-heading text-[22px]">🟡 Стоит подтянуть</h2>
            {p.weak.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {p.weak.map((m) => (
                  <li key={m.link}>
                    <Link to={m.link} className="press inline-flex rounded-full bg-butter px-3.5 py-1.5 text-[15px] no-underline">
                      {m.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">Пока ничего — так держать.</p>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="ach">
        <h2 id="ach" className="t-heading text-[22px]">
          Достижения · {p.achievements.filter((a) => a.earned).length} из {p.achievements.length}
        </h2>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
          {p.achievements.map((a) => (
            <li
              key={a.id}
              className={clsx('flex flex-col items-center gap-1.5 rounded-[14px] p-4 text-center', a.earned ? 'bg-mark shadow-sticker' : 'border-[1.5px] border-dashed border-ink/20 opacity-70')}
              title={a.text}
            >
              <span className={clsx('text-[34px] leading-none', !a.earned && 'grayscale')} aria-hidden="true">
                {a.icon}
              </span>
              <span className="text-[15px] font-[650]">{a.title}</span>
              <span className="text-[13px] text-ink/70">{a.earned ? 'получено' : a.text}</span>
            </li>
          ))}
        </ul>
        {!forParent && <p className="t-caption text-muted">Достижения считаются по задачам практикума, тренажёров и задачи дня в боте.</p>}
      </section>
    </div>
  );
}
