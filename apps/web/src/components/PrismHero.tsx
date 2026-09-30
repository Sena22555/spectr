import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import type { Subject } from '../lib/types';

/**
 * Главный «авторский момент» сайта: луч (ученик) проходит через призму (школу)
 * и раскладывается на предметы. Каждый луч заканчивается ссылкой на предмет.
 * Пружины — пресеты kinetics.colorion.co: spring(320, 24) для лучей, glide для луча.
 */
const W = 600;
const H = 360;
const APEX = [130, 40];
const LEFT = [30, 300];
const RIGHT = [230, 300];
const ENTRY = [70, 196];
const EXIT = [185, 183];
const RAY_END_X = 330;
const TOP = 26;
const BOTTOM = 340;
const GAP = 3;
const RAYS = ['#c03f13', '#d9731a', '#e0b224', '#4f8a3c', '#2f8f9d', '#2b4c9b', '#6b3fa0'];

export function PrismHero({ subjects }: { subjects: Subject[] }) {
  const reduce = useReducedMotion();
  const band = (BOTTOM - TOP) / 7;
  const byHue = new Map(subjects.map((s) => [s.hue, s]));

  const spring = (delay: number) =>
    reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 24, delay };

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {RAYS.map((color, i) => {
          const y1 = TOP + band * i + GAP / 2;
          const y2 = TOP + band * (i + 1) - GAP / 2;
          return (
            <motion.polygon
              key={color}
              points={`${EXIT[0]},${EXIT[1]} ${RAY_END_X},${y1} ${RAY_END_X},${y2}`}
              fill={color}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={spring(0.55 + i * 0.06)}
              style={{ transformBox: 'view-box', transformOrigin: `${EXIT[0]}px ${EXIT[1]}px` }}
            />
          );
        })}
        <motion.line
          x1={0}
          y1={222}
          x2={ENTRY[0]}
          y2={ENTRY[1]}
          stroke="var(--ink)"
          strokeWidth="5"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
        />
        <motion.polygon
          points={`${APEX.join(',')} ${LEFT.join(',')} ${RIGHT.join(',')}`}
          fill="var(--paper)"
          stroke="var(--ink)"
          strokeWidth="7"
          strokeLinejoin="round"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring(0.1)}
        />
        <motion.line
          x1={ENTRY[0]}
          y1={ENTRY[1]}
          x2={EXIT[0]}
          y2={EXIT[1]}
          stroke="var(--ink)"
          strokeOpacity="0.3"
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, delay: 0.45 }}
        />
      </svg>

      <ul className="absolute inset-0 m-0 list-none p-0">
        {RAYS.map((_, i) => {
          const s = byHue.get(i);
          const center = TOP + band * (i + 0.5);
          return (
            <motion.li
              key={i}
              className="absolute right-0 -translate-y-1/2"
              style={{ left: `${((RAY_END_X + 10) / W) * 100}%`, top: `${(center / H) * 100}%` }}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={spring(0.75 + i * 0.06)}
            >
              <Link
                to={s ? `/subjects/${s.slug}` : '/book'}
                className={`hue-${i} press inline-flex items-center gap-1.5 max-w-full rounded-full bg-tint px-2.5 py-1 text-[13px] leading-none font-[500] text-ink no-underline hover:underline sm:text-[15px]`}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: RAYS[i] }} aria-hidden="true" />
                <span className="truncate py-0.5">{s ? s.title : 'Свой предмет'}</span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
