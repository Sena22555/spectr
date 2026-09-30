import clsx from 'clsx';

/**
 * «Каракули на полях» из DESIGN.md: монолинейные рисунки Forest Ink с прозрачностью 30%.
 * Только атмосфера — скрыты от скринридеров.
 */
export function SketchStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx('pointer-events-none text-ink opacity-30', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 6c1.5 9 3.2 15.5 7 19.5 4.2 4 10.4 5.2 19 6.3-8.7 1.4-14.8 3-18.6 7.2-3.6 4.3-5 10.9-6.6 19-1.4-8.5-3.2-14.8-7-18.8-3.9-4-10-5.6-18.8-7.2 8.6-1.2 14.8-2.6 18.7-6.4C29.6 21.7 30.8 15.3 32 6z" />
    </svg>
  );
}

export function SketchArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 80" className={clsx('pointer-events-none text-ink opacity-30', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12c18-6 40-4 52 10 10 12 6 28-6 28s-14-16-2-22c16-8 38 4 50 24" />
      <path d="M100 42l10 12-15 2" />
    </svg>
  );
}

export function SketchSpiral({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={clsx('pointer-events-none text-ink opacity-30', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M40 40c0-3 3-5 6-4 5 1 6 8 2 12-6 6-16 3-18-5-3-10 5-20 16-20 13 0 22 12 19 25-3 15-19 23-33 18C16 61 8 45 12 30" />
    </svg>
  );
}

export function SketchSquiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 20" className={clsx('pointer-events-none text-ink opacity-30', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" preserveAspectRatio="none">
      <path d="M2 12c12-10 22 8 34 0s22-10 34 0 22 8 34 0 22-10 34 0 22 8 34 0 14-6 26-2" />
    </svg>
  );
}
