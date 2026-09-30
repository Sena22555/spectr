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

/**
 * Знак «печатный»: призма отпечатана в две краски со сдвигом (жёлтая заливка съехала
 * относительно контура), а лучи налезают друг на друга и на стыках смешиваются.
 */
export function LogoMark({ className, title = 'Спектр' }: { className?: string; title?: string }) {
  const id = useId();
  const [ex, ey] = PRISM.exit;
  const top = 30;
  const bottom = 90;
  const step = (bottom - top) / 7;
  const grow = step * 0.35;
  const tri = `${PRISM.apex.join(',')} ${PRISM.left.join(',')} ${PRISM.right.join(',')}`;
  return (
    <svg viewBox="0 0 120 96" className={clsx('shrink-0', className)} role="img" aria-labelledby={id}>
      <title id={id}>{title}</title>
      <g style={{ mixBlendMode: 'var(--blend)' as never }}>
        {Array.from({ length: 7 }, (_, i) => (
          <polygon key={i} points={`${ex},${ey} 120,${top + step * i - grow} 120,${top + step * (i + 1) + grow}`} fill={`var(--ray-${i})`} />
        ))}
      </g>
      <line x1="0" y1="62" x2={PRISM.entry[0]} y2={PRISM.entry[1]} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <g style={{ mixBlendMode: 'var(--blend)' as never }}>
        <polygon points={tri} transform="translate(4 3)" fill="var(--ray-2)" />
      </g>
      <polygon points={tri} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
      <line x1={PRISM.entry[0]} y1={PRISM.entry[1]} x2={ex} y2={ey} stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, compact = false, inverse = false }: { className?: string; compact?: boolean; inverse?: boolean }) {
  return (
    <span className={clsx('group inline-flex items-center gap-2', inverse ? 'text-cream' : 'text-ink', className)}>
      <LogoMark className={clsx(compact ? 'h-7 w-9' : 'h-8 w-10', 'transition-transform duration-500 group-hover:-rotate-6')} title="" />
      <span className="relative">
        <span className="t-display text-[24px] leading-none">Спектр</span>
        {!compact && (
          <span className="t-mono absolute -top-3 -right-9 rotate-[8deg] rounded-[3px] bg-mark px-1 py-px text-[8.5px] leading-none text-forest">
            онлайн
          </span>
        )}
      </span>
    </span>
  );
}
