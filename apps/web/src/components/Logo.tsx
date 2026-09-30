import { useId } from 'react';
import clsx from 'clsx';

/** Геометрия знака: призма, входящий луч и веер из семи лучей спектра. */
export const PRISM = {
  apex: [50, 8],
  left: [18, 84],
  right: [82, 84],
  entry: [30.8, 53.6],
  exit: [67.6, 49.8],
} as const;

const RAY_COLORS = ['#c03f13', '#d9731a', '#e0b224', '#4f8a3c', '#2f8f9d', '#2b4c9b', '#6b3fa0'];

export function LogoMark({ className, title = 'Спектр' }: { className?: string; title?: string }) {
  const id = useId();
  const [ex, ey] = PRISM.exit;
  const top = 32;
  const bottom = 88;
  const step = (bottom - top) / 7;
  return (
    <svg viewBox="0 0 120 96" className={clsx('shrink-0', className)} role="img" aria-labelledby={id}>
      <title id={id}>{title}</title>
      {RAY_COLORS.map((c, i) => (
        <polygon key={c} points={`${ex},${ey} 120,${top + step * i} 120,${top + step * (i + 1)}`} fill={c} />
      ))}
      <line x1="0" y1="62" x2={PRISM.entry[0]} y2={PRISM.entry[1]} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <polygon
        points={`${PRISM.apex.join(',')} ${PRISM.left.join(',')} ${PRISM.right.join(',')}`}
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <line
        x1={PRISM.entry[0]}
        y1={PRISM.entry[1]}
        x2={ex}
        y2={ey}
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 text-ink', className)}>
      <LogoMark className={compact ? 'h-7 w-9' : 'h-8 w-10'} title="" />
      <span className="t-display text-[24px] leading-none tracking-[0.02em]">Спектр</span>
    </span>
  );
}
