import { useId } from 'react';
import clsx from 'clsx';

/**
 * Геометрия знака. Призма стоит трёхгранником: передняя грань, правая боковая (сквозь стекло видны
 * задние рёбра). Белый луч входит слева, преломляется в стекле и выходит через боковую грань.
 */
export const PRISM = {
  apex: [42, 14],
  left: [10, 76],
  right: [74, 76],
  depth: [16, -8],
  entry: [23.4, 50],
  exit: [68, 44],
} as const;

/** Семь цветов спектра, сверху вниз: от красного к фиолетовому. */
export const BEAM = ['#e8674a', '#f29a3c', '#f4cf3a', '#68b544', '#28aeb0', '#5f6fe0', '#a865d8'];

/**
 * Знак «Спектр»: стеклянная призма и опыт Ньютона.
 * В покое видна готовая радуга. При наведении на родителя с классом `group`
 * сначала летит луч, доходит до призмы, а потом радуга раскрывается веером
 * (анимации `lg-*` в styles.css).
 */
export function LogoMark({ className, title = 'Спектр' }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const { apex, left, right, depth, entry, exit } = PRISM;
  const [ax, ay] = apex;
  const [lx, ly] = left;
  const [rx, ry] = right;
  const [dx, dy] = depth;
  const [nx, ny] = entry;
  const [ex, ey] = exit;
  const front = `M${ax} ${ay} L${lx} ${ly} L${rx} ${ry} Z`;
  const side = `M${ax} ${ay} L${ax + dx} ${ay + dy} L${rx + dx} ${ry + dy} L${rx} ${ry} Z`;
  const band = 8.4;
  return (
    <svg viewBox="0 0 124 96" className={clsx('lg shrink-0 overflow-visible', className)} role="img" aria-labelledby={`${id}t`}>
      <title id={`${id}t`}>{title}</title>
      <defs>
        <linearGradient id={`${id}f`} x1="0.05" y1="0" x2="0.95" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e3f7f4" />
          <stop offset="1" stopColor="#b9e6e2" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cdeeea" />
          <stop offset="1" stopColor="#7cc9c6" />
        </linearGradient>
      </defs>

      {/* радуга: семь лучей из точки выхода */}
      <g>
        {BEAM.map((c, i) => {
          const top = 12 + i * band;
          return (
            <polygon
              key={c}
              className="lg-ray"
              style={{ ['--i' as string]: i }}
              points={`${ex},${ey} 124,${top} 124,${top + band + 1.2}`}
              fill={c}
            />
          );
        })}
      </g>

      {/* задние рёбра видны сквозь стекло */}
      <path d={`M${ax + dx} ${ay + dy} L${lx + dx} ${ly + dy} L${rx + dx} ${ry + dy}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4" strokeLinejoin="round" />
      <path d={`M${lx + dx} ${ly + dy} L${lx} ${ly}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4" />

      {/* стеклянные грани */}
      <path d={side} fill={`url(#${id}s)`} fillOpacity="0.92" />
      <path d={front} fill={`url(#${id}f)`} fillOpacity="0.9" />

      {/* блик и ребро */}
      <path d={`M${ax + 1} ${ay + 6} L${lx + 7} ${ly - 12}`} stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d={`M${ax + 2.4} ${ay + 1.4} L${ax + dx - 2} ${ay + dy + 3}`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" strokeOpacity="0.9" />

      {/* контур */}
      <path d={front} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d={`M${ax} ${ay} L${ax + dx} ${ay + dy} L${rx + dx} ${ry + dy} L${rx} ${ry}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

      {/* луч: снаружи чернилами, внутри стекла белый */}
      <line className="lg-in" x1="0" y1="62" x2={nx} y2={ny} stroke="currentColor" strokeWidth="4" strokeLinecap="round" pathLength="1" />
      <line className="lg-glass" x1={nx} y1={ny} x2={ex} y2={ey} stroke="#fff" strokeWidth="3.4" strokeLinecap="round" pathLength="1" />
    </svg>
  );
}

export function Logo({ className, compact = false, inverse = false }: { className?: string; compact?: boolean; inverse?: boolean }) {
  return (
    <span className={clsx('group inline-flex items-center gap-2.5', inverse ? 'text-cream' : 'text-ink', className)}>
      <LogoMark className={clsx(compact ? 'h-8 w-10' : 'h-10 w-[52px]')} title="" />
      <span className="relative">
        <span className="t-display text-[24px] leading-none">Спектр</span>
        {!compact && (
          <span className="absolute -top-3 -right-9 rotate-[8deg] rounded-[3px] bg-mark px-1 py-px text-[8.5px] leading-none font-[650] text-forest">онлайн</span>
        )}
      </span>
    </span>
  );
}
