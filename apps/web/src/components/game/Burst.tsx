import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const COLORS = ['var(--ray-0)', 'var(--ray-1)', 'var(--ray-2)', 'var(--ray-3)', 'var(--ray-4)', 'var(--ray-5)', 'var(--ray-6)'];

/** Россыпь «осколков спектра» из точки: срабатывает, когда растёт `fire`. */
export function Burst({ fire, count = 22, spread = 160, className = 'left-1/2 top-1/2' }: { fire: number; count?: number; spread?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [shots, setShots] = useState<{ key: number; parts: { x: number; y: number; r: number; c: string; w: number; h: number; d: number }[] }[]>([]);
  useEffect(() => {
    if (!fire || reduce) return;
    const parts = Array.from({ length: count }, (_, i) => {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = spread * (0.45 + Math.random() * 0.55);
      return { x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.75 - 30, r: Math.random() * 540 - 270, c: COLORS[i % 7]!, w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, d: 0.7 + Math.random() * 0.4 };
    });
    setShots((s) => [...s.slice(-2), { key: fire, parts }]);
    const t = setTimeout(() => setShots((s) => s.filter((x) => x.key !== fire)), 1300);
    return () => clearTimeout(t);
  }, [fire, count, spread, reduce]);
  return (
    <span className={`pointer-events-none absolute z-20 size-0 ${className}`} aria-hidden="true">
      <AnimatePresence>
        {shots.map((s) =>
          s.parts.map((p, i) => (
            <motion.span
              key={`${s.key}-${i}`}
              className="absolute rounded-[1.5px]"
              style={{ background: p.c, width: p.w, height: p.h }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.6 }}
              animate={{ x: p.x, y: [0, p.y, p.y + 60], rotate: p.r, opacity: [1, 1, 0], scale: 1 }}
              transition={{ duration: p.d, ease: [0.2, 0.7, 0.4, 1] }}
            />
          )),
        )}
      </AnimatePresence>
    </span>
  );
}

/** «+15 XP» всплывает и тает. */
export function XpFloat({ fire, amount, className = 'right-4 top-4' }: { fire: number; amount: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={`pointer-events-none absolute z-20 ${className}`} aria-hidden="true">
      <AnimatePresence>
        {fire > 0 && (
          <motion.span
            key={fire}
            className="t-heading tnum absolute right-0 rounded-full bg-mark px-3 py-1 text-[16px] whitespace-nowrap text-forest shadow-sticker"
            initial={{ opacity: 0, y: reduce ? 0 : 10, scale: 0.8 }}
            animate={{ opacity: [0, 1, 1, 0], y: reduce ? 0 : -36, scale: 1 }}
            transition={{ duration: 1.4, times: [0, 0.15, 0.7, 1] }}
          >
            +{amount} XP
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
