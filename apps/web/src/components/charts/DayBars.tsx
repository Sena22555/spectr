import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

// Столбики по дням: одна величина, один цвет, подсказка при наведении и с клавиатуры.
// Цвет — ультрамарин из палитры (--ray-5): проходит проверку контраста на бумажном фоне.

export interface DayPoint {
  day: string;
  [key: string]: number | string;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const label = (d: string) => dayFmt.format(new Date(`${d}T12:00:00`));

export function DayBars({
  data,
  field,
  title,
  height = 180,
  details,
  color = 'var(--ray-5)',
  compact,
}: {
  data: DayPoint[];
  field: string;
  title: string;
  height?: number;
  /** что ещё показать в подсказке */
  details?: { field: string; label: string }[];
  color?: string;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => Number(d[field]) || 0)), [data, field]);
  const total = data.reduce((n, d) => n + (Number(d[field]) || 0), 0);
  const W = 600;
  const H = height;
  const pad = { top: 10, bottom: compact ? 4 : 22, left: compact ? 0 : 30 };
  const innerW = W - pad.left;
  const innerH = H - pad.top - pad.bottom;
  const bw = innerW / Math.max(1, data.length);
  const gap = Math.min(2, bw * 0.25);
  const ticks = compact ? [] : [0, Math.ceil(max / 2), max];
  const hovered = hover !== null ? data[hover] : null;
  const every = Math.ceil(data.length / 6);

  return (
    <figure className="relative m-0 flex flex-col gap-2" ref={wrap}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className={clsx(compact ? 't-caption font-[550]' : 't-heading text-[19px]')}>{title}</span>
        <span className="t-heading tnum text-[19px]">{total}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" role="img" aria-label={`${title}: всего ${total} за период`} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W} y1={y} y2={y} stroke="var(--ink)" strokeOpacity={t === 0 ? 0.35 : 0.08} />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" className="fill-[var(--muted)] text-[11px]">
                {t}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const v = Number(d[field]) || 0;
          const h = (v / max) * innerH;
          const x = pad.left + i * bw + gap / 2;
          const y = pad.top + innerH - h;
          const r = Math.min(4, (bw - gap) / 2, h);
          return (
            <g key={d.day}>
              {v > 0 && (
                <path
                  d={`M${x} ${pad.top + innerH} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - gap - r} Q${x + bw - gap} ${y} ${x + bw - gap} ${y + r} V${pad.top + innerH} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {/* зона наведения шире столбика */}
              <rect
                x={pad.left + i * bw}
                y={0}
                width={bw}
                height={H}
                fill="transparent"
                tabIndex={compact ? -1 : 0}
                aria-label={`${label(d.day)}: ${v}`}
                onPointerMove={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              {!compact && i % every === 0 && (
                <text x={pad.left + i * bw + bw / 2} y={H - 4} textAnchor="middle" className="fill-[var(--muted)] text-[11px]">
                  {label(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-8 z-10 min-w-[150px] rounded-[10px] border border-ink/15 bg-paper px-3 py-2 shadow-card"
          style={{ left: `clamp(0px, calc(${(((hover ?? 0) + 0.5) / data.length) * 100}% - 75px), calc(100% - 160px))` }}
          role="status"
        >
          <p className="t-mono text-[11px] text-muted">{label(hovered.day)}</p>
          <p className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
            <b className="tnum text-[17px]">{hovered[field]}</b> <span className="text-[13px] text-muted">{title.toLowerCase()}</span>
          </p>
          {details?.map((dt) => (
            <p key={dt.field} className="text-[13px] text-muted">
              <b className="tnum text-ink">{hovered[dt.field]}</b> {dt.label}
            </p>
          ))}
        </div>
      )}
    </figure>
  );
}

/** Горизонтальная полоса-величина с подписью — для воронок и рейтингов. */
export function MeterRow({ label, value, max, note, color = 'var(--ray-5)' }: { label: string; value: number; max: number; note?: string; color?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
      <span className="text-[15px] [overflow-wrap:anywhere]">{label}</span>
      <span className="tnum text-right text-[15px] font-[650]">
        {value}
        {note && <span className="t-mono ml-2 text-[11px] font-normal text-muted">{note}</span>}
      </span>
      <div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
}
