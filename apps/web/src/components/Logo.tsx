import { useId } from 'react';
import clsx from 'clsx';

/** Точки на схеме знака: луч входит в переднюю грань и выходит через боковую. */
export const PRISM = {
  entry: [30, 52],
  exit: [80, 46],
} as const;

/** Цвета спектра для лучей: чуть мягче основной палитры, чтобы знак не кричал. */
const BEAM = ['#e8674a', '#f29a3c', '#f4cf3a', '#68b544', '#28aeb0', '#5f6fe0', '#a865d8'];

/**
 * Знак «Спектр»: стеклянная трёхгранная призма в объёме. Передняя грань светлая,
 * боковая тёмная, на рёбрах блики, внутри виден луч. Из боковой грани выходит веер из семи цветов.
 * При наведении на родителя с классом `group` по призме пробегает блик.
 */
export function LogoMark({ className, title = 'Спектр' }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const front = 'M42 12 L12 82 L72 82 Z';
  const side = 'M42 12 L60 4 L90 74 L72 82 Z';
  const [ex, ey] = PRISM.exit;
  const [nx, ny] = PRISM.entry;
  return (
    <svg viewBox="0 0 124 96" className={clsx('shrink-0 overflow-visible', className)} role="img" aria-labelledby={`${id}t`}>
      <title id={`${id}t`}>{title}</title>
      <defs>
        <linearGradient id={`${id}f`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#d9f5f0" />
          <stop offset="1" stopColor="#8fd8d4" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4fb9b6" />
          <stop offset="1" stopColor="#1a6f73" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d={front} />
          <path d={side} />
        </clipPath>
      </defs>

      {/* веер лучей */}
      <g style={{ mixBlendMode: 'var(--blend)' as never }}>
        {BEAM.map((c, i) => {
          const step = 8.6;
          const top = 20 + i * step;
          return <polygon key={c} points={`${ex},${ey} 124,${top} 124,${top + step + 2.4}`} fill={c} fillOpacity="0.95" />;
        })}
      </g>

      {/* мягкая тень под призмой */}
      <ellipse cx="46" cy="87" rx="36" ry="4.5" fill="currentColor" fillOpacity="0.14" />

      {/* входящий луч */}
      <line x1="0" y1="62" x2={nx} y2={ny} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />

      {/* грани */}
      <path d={side} fill={`url(#${id}s)`} />
      <path d={front} fill={`url(#${id}f)`} />
      {/* луч внутри стекла */}
      <line x1={nx} y1={ny} x2={ex - 6} y2={ey + 1} stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.95" />
      {/* блики на ребре и вершине */}
      <path d="M42 12 L15 76" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" strokeOpacity="0.9" />
      <path d="M42 12 L60 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" fill="none" strokeOpacity="0.8" />
      <ellipse cx="34" cy="38" rx="3.4" ry="9" transform="rotate(20 34 38)" fill="#fff" fillOpacity="0.55" />
      {/* контур: чернилами, как у остальных рисунков */}
      <path d={`${front}`} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="M42 12 L60 4 L90 74 L72 82" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      {/* блик, пробегающий по граням при наведении */}
      <g clipPath={`url(#${id}c)`} className="pointer-events-none">
        <rect x="-40" y="0" width="30" height="96" fill={`url(#${id}g)`} transform="skewX(-20)" className="opacity-0 group-hover:opacity-100 group-hover:[animation:prism-glint_0.9s_ease-out]" />
      </g>
    </svg>
  );
}

export function Logo({ className, compact = false, inverse = false }: { className?: string; compact?: boolean; inverse?: boolean }) {
  return (
    <span className={clsx('group inline-flex items-center gap-2.5', inverse ? 'text-cream' : 'text-ink', className)}>
      <LogoMark className={clsx(compact ? 'h-8 w-10' : 'h-10 w-[52px]', 'transition-transform duration-500 group-hover:-rotate-3 group-hover:scale-105')} title="" />
      <span className="relative">
        <span className="t-display text-[24px] leading-none">Спектр</span>
        {!compact && (
          <span className="absolute -top-3 -right-9 rotate-[8deg] rounded-[3px] bg-mark px-1 py-px text-[8.5px] leading-none font-[650] text-forest">онлайн</span>
        )}
      </span>
    </span>
  );
}
