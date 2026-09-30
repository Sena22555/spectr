import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { pad2 } from './Print';
import type { Subject } from '../lib/types';

/**
 * «Рис. 1»: схема из учебника оптики. Луч (ученик) проходит через призму (школу)
 * и раскладывается на предметы. Каждый луч заканчивается ссылкой на предмет.
 * Лучи печатаются с перекрытием (multiply), на стыках смешиваются краски.
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
const N_LEFT = [-0.933, -0.359];
const N_RIGHT = [0.933, -0.359];

export function PrismHero({ subjects, caption = true }: { subjects: Subject[]; caption?: boolean }) {
  const reduce = useReducedMotion();
  const band = (BOTTOM - TOP) / 7;
  const grow = band * 0.3;
  const byHue = new Map(subjects.map((s) => [s.hue, s]));

  const spring = (delay: number) =>
    reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 320, damping: 24, delay };

  const tri = `${APEX.join(',')} ${LEFT.join(',')} ${RIGHT.join(',')}`;
  const normal = (p: number[], n: number[], len: number) => ({ x1: p[0] - n[0] * len, y1: p[1] - n[1] * len, x2: p[0] + n[0] * len, y2: p[1] + n[1] * len });
  const nl = normal(ENTRY, N_LEFT, 42);
  const nr = normal(EXIT, N_RIGHT, 42);

  return (
    <figure className="m-0">
      <div className="relative rounded-[14px] border-[1.5px] border-dashed border-ink/20 bg-paper p-3 sm:p-4">
        <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {/* лучи: клинья с перекрытием */}
            <g style={{ mixBlendMode: 'var(--blend)' as never }}>
              {Array.from({ length: 7 }, (_, i) => {
                const y1 = TOP + band * i - grow;
                const y2 = TOP + band * (i + 1) + grow;
                return (
                  <motion.polygon
                    key={i}
                    points={`${EXIT[0]},${EXIT[1]} ${RAY_END_X},${y1} ${RAY_END_X},${y2}`}
                    fill={`var(--ray-${i})`}
                    initial={reduce ? false : { scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 0.94 }}
                    transition={spring(0.55 + i * 0.06)}
                    style={{ transformBox: 'view-box', transformOrigin: `${EXIT[0]}px ${EXIT[1]}px` }}
                  />
                );
              })}
            </g>

            {/* шкала-экран */}
            <line x1={RAY_END_X + 3} y1={TOP - 6} x2={RAY_END_X + 3} y2={BOTTOM + 6} stroke="var(--ink)" strokeWidth="1.5" />
            {Array.from({ length: 8 }, (_, i) => (
              <line key={i} x1={RAY_END_X + 3} x2={RAY_END_X + 9} y1={TOP + band * i} y2={TOP + band * i} stroke="var(--ink)" strokeWidth="1.2" />
            ))}

            {/* нормали и углы */}
            <g stroke="var(--ink)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6">
              <line {...nl} />
              <line {...nr} />
            </g>
            <g fill="var(--ink)" fontFamily="var(--font-mono)" fontSize="13" fontWeight="500">
              <text x={ENTRY[0] - 44} y={ENTRY[1] - 26}>α</text>
              <text x={EXIT[0] + 30} y={EXIT[1] - 30}>β</text>
              <text x="2" y="244" fontSize="9" letterSpacing="1">БЕЛЫЙ</text>
              <text x="2" y="256" fontSize="9" letterSpacing="1">СВЕТ</text>
            </g>

            <motion.line
              x1={0}
              y1={222}
              x2={ENTRY[0]}
              y2={ENTRY[1]}
              stroke="var(--ink)"
              strokeWidth="4"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
            />

            {/* призма: заливка отпечатана со сдвигом относительно контура */}
            <motion.g
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring(0.1)}
            >
              <g style={{ mixBlendMode: 'var(--blend)' as never }}>
                <polygon points={tri} transform="translate(9 7)" fill="var(--ray-2)" />
              </g>
              <polygon points={tri} fill="none" stroke="var(--ink)" strokeWidth="4.5" strokeLinejoin="round" />
            </motion.g>

            <motion.line
              x1={ENTRY[0]}
              y1={ENTRY[1]}
              x2={EXIT[0]}
              y2={EXIT[1]}
              stroke="var(--ink)"
              strokeOpacity="0.4"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2, delay: 0.45 }}
            />
          </svg>

          <ul className="absolute inset-0 m-0 list-none p-0">
            {Array.from({ length: 7 }, (_, i) => {
              const s = byHue.get(i);
              const center = TOP + band * (i + 0.5);
              return (
                <motion.li
                  key={i}
                  className="absolute right-0 -translate-y-1/2"
                  style={{ left: `${((RAY_END_X + 16) / W) * 100}%`, top: `${(center / H) * 100}%` }}
                  initial={reduce ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={spring(0.75 + i * 0.06)}
                >
                  <Link
                    to={s ? `/subjects/${s.slug}` : '/book'}
                    className={`hue-${i} press group flex max-w-full items-center gap-1.5 leading-none no-underline`}
                  >
                    <span className="t-mono shrink-0 rounded-full bg-tint px-1.5 py-[3px] text-[10px] text-hue sm:text-[11px]">{pad2(i + 1)}</span>
                    <span className="truncate py-0.5 text-[12.5px] font-[600] text-ink group-hover:underline sm:text-[15px]">{s ? s.title : 'Свой предмет'}</span>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
      {caption && (
        <figcaption className="t-mono mt-2.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
          <span className="text-ink">Рис. 1.</span>
          <span>Луч проходит через призму школы и раскладывается на предметы</span>
        </figcaption>
      )}
    </figure>
  );
}
