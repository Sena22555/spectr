import clsx from 'clsx';

/** Цветовая шкала — семь красок подряд, как контрольная полоса на типографском оттиске. */
export function SpectrumBar({ className }: { className?: string }) {
  return <div className={clsx('spectrum-bar', className)} aria-hidden="true" />;
}

/** Приводочная метка (мишень) — стоит по углам «рисунков» и цветных плашек. */
export function RegMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={clsx('size-5 text-current', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="12" cy="12" r="5.5" />
      <path d="M12 0v9M12 15v9M0 12h9M15 12h9" />
    </svg>
  );
}

/** Четыре метки по углам родителя (родителю нужен `relative`). */
export function RegCorners({ className }: { className?: string }) {
  const c = clsx('absolute size-4', className);
  return (
    <>
      <RegMark className={clsx(c, 'top-1.5 left-1.5')} />
      <RegMark className={clsx(c, 'top-1.5 right-1.5')} />
      <RegMark className={clsx(c, 'bottom-1.5 left-1.5')} />
      <RegMark className={clsx(c, 'right-1.5 bottom-1.5')} />
    </>
  );
}

/**
 * Круги двух красок с наложением (multiply): на пересечении получается третий цвет.
 * Декор для цветных плашек, чисто атмосфера.
 */
export function OverprintCircles({ a, b, blend = 'multiply', className }: { a: string; b: string; blend?: 'multiply' | 'screen'; className?: string }) {
  return (
    <svg viewBox="0 0 320 240" className={clsx('pointer-events-none', className)} aria-hidden="true">
      <g style={{ mixBlendMode: blend }}>
        <circle cx="120" cy="120" r="96" fill={a} />
        <circle cx="200" cy="120" r="96" fill={b} />
      </g>
    </svg>
  );
}

/** Цветовая шкала с числами, для «оглавления» и подписей. */
export function pad2(n: number) {
  return String(n).padStart(2, '0');
}
