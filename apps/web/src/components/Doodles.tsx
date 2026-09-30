import { useId, type CSSProperties, type ReactNode } from 'react';
import { BEAM, PRISM } from './Logo';
import clsx from 'clsx';

/**
 * Иллюстрации «от руки»: линия цвета чернил, заливки — бумага, маркер и стикеры.
 * Лёгкое дрожание линии даёт фильтр feTurbulence + feDisplacementMap, поэтому
 * контуры выглядят нарисованными, а не векторными.
 */
function Sheet({ viewBox, className, children, style, label }: { viewBox: string; className?: string; children: ReactNode; style?: CSSProperties; label?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox={viewBox}
      className={clsx('overflow-visible', className)}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <filter id={`rough-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="2.2" />
        </filter>
      </defs>
      <g
        filter={`url(#rough-${id})`}
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

const PAPER = 'var(--paper)';

/** Листок с каракулями текста */
export function PaperDoodle({ className, style, lines = 5 }: { className?: string; style?: CSSProperties; lines?: number }) {
  return (
    <Sheet viewBox="0 0 120 150" className={className} style={style}>
      <path d="M10 8h78l22 22v112H10z" fill={PAPER} />
      <path d="M88 8v22h22" />
      {Array.from({ length: lines }, (_, i) => (
        <path key={i} d={`M24 ${46 + i * 16}c6-6 10 6 16 0s10 6 16 0 10 6 16 0 ${i % 2 ? '8 4 12 0' : '10 6 16 0'}`} strokeWidth="2" />
      ))}
      <path d="M24 122c10-10 18 8 28-2" strokeWidth="2.2" />
    </Sheet>
  );
}

/** Бумажный самолётик с пунктирным следом */
export function PlaneDoodle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Sheet viewBox="0 0 220 120" className={className} style={style}>
      <path d="M4 104c30-6 54-20 70-40s40-26 62-18" strokeDasharray="6 8" strokeWidth="2" style={{ animation: 'dash 1.6s linear infinite' }} />
      <path d="M140 44l74-36-40 82-14-30z" fill={PAPER} />
      <path d="M160 60l54-52M160 60l-4 28 18-18" />
    </Sheet>
  );
}

/** Карандаш */
export function PencilDoodle({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Sheet viewBox="0 0 160 40" className={className} style={style}>
      <path d="M20 8h110l24 12-24 12H20z" fill="var(--mark)" />
      <path d="M130 8v24M144 15l10 5-10 5z" />
      <path d="M8 8h12v24H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" fill="var(--tint-raw-6)" />
      <path d="M20 20h104" strokeWidth="1.6" />
    </Sheet>
  );
}

/** Сцена для первого экрана: книги с кружкой, ноутбук с уроком, призма раскладывает свет на цвета. */
export function DeskScene({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 1200 360" className={className} label="Рисунок: урок по видеосвязи на ноутбуке, рядом стопка книг и призма, которая раскладывает луч на цвета">
      {/* стопка книг и кружка */}
      <g>
        <path d="M230 344v-30h170v30z" fill="var(--tint-raw-4)" />
        <path d="M244 314v-26h150v26z" fill="var(--tint-raw-6)" />
        <path d="M222 288v-28h160v28z" fill="var(--tint-raw-3)" />
        <path d="M252 329h120M262 301h110M240 274h120" strokeWidth="1.6" />
        <path d="M290 260v-40a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v40z" fill={PAPER} />
        <path d="M350 226c20 0 20 26 0 26" />
        <path d="M304 234h32" strokeWidth="1.6" />
        <g strokeWidth="2" style={{ strokeDasharray: '4 6', animation: 'dash 2.4s linear infinite' }}>
          <path d="M306 206c-8-10 8-16 0-28" />
          <path d="M322 202c-8-12 8-18 0-32" />
          <path d="M338 206c-8-10 8-16 0-28" />
        </g>
      </g>

      {/* ноутбук: урок по видеосвязи */}
      <g>
        <rect x="476" y="150" width="248" height="180" rx="12" fill={PAPER} />
        <rect x="490" y="164" width="220" height="152" rx="6" fill="var(--tint-raw-3)" />
        {/* преподаватель */}
        <path d="M512 316c2-26 14-38 36-40h8c22 2 34 14 36 40" fill={PAPER} />
        <ellipse cx="552" cy="246" rx="20" ry="23" fill={PAPER} />
        <path d="M532 240c-2-18 10-26 20-26 14 0 22 10 20 26-6-8-12-10-20-10s-14 2-20 10z" fill="var(--ink)" />
        <path d="M545 248h.1M559 248h.1" strokeWidth="3.4" />
        <path d="M546 259c4 3 8 3 12 0" strokeWidth="2" />
        {/* доска с формулой */}
        <rect x="610" y="184" width="86" height="62" rx="4" fill={PAPER} />
        <text x="620" y="210" fontFamily="var(--font-mono)" fontSize="15" fill="var(--ink)" stroke="none">a²+b²</text>
        <text x="636" y="232" fontFamily="var(--font-mono)" fontSize="15" fill="var(--ink)" stroke="none">=c²</text>
        {/* окошко ученика */}
        <rect x="628" y="258" width="68" height="46" rx="4" fill="var(--mark)" />
        <circle cx="662" cy="276" r="8" fill={PAPER} />
        <path d="M646 304c2-10 8-14 16-14s14 4 16 14" fill={PAPER} strokeWidth="2" />
        <path d="M448 344l28-14h248l28 14z" fill={PAPER} />
        <path d="M578 337h44" />
      </g>

      {/* призма в объёме и спектр */}
      <ScenePrism />

      {/* стакан с карандашами */}
      <g>
        <path d="M1066 344l-8-74h64l-8 74z" fill="var(--tint-raw-0)" />
        <path d="M1074 270l-14-58 10-4 16 62" fill="var(--mark)" />
        <path d="M1094 270l4-72h12l-4 72" fill="var(--tint-raw-5)" />
        <path d="M1108 270l16-50 10 4-14 46" fill="var(--tint-raw-3)" />
        <path d="M1064 290h52" strokeWidth="1.6" />
      </g>

      {/* край стола */}
      <path d="M0 346h1200" stroke="var(--terracotta)" strokeWidth="7" />
    </Sheet>
  );
}

/** Призма для сцены: та же, что в логотипе, крупнее. Каждые несколько секунд опыт повторяется: луч, стекло, веер цветов. */
function ScenePrism() {
  const id = useId().replace(/:/g, '');
  const { apex, left, right, depth, entry, exit } = PRISM;
  const front = `M${apex[0]} ${apex[1]} L${left[0]} ${left[1]} L${right[0]} ${right[1]} Z`;
  const side = `M${apex[0]} ${apex[1]} L${apex[0] + depth[0]} ${apex[1] + depth[1]} L${right[0] + depth[0]} ${right[1] + depth[1]} L${right[0]} ${right[1]} Z`;
  const band = 8.4;
  return (
    <g transform="translate(742 176) scale(2.05)" strokeWidth="1.5">
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
      <g stroke="none">
        {BEAM.map((c, i) => (
          <polygon key={c} className="scene-ray" style={{ ['--i' as string]: i }} points={`${exit[0]},${exit[1]} 124,${12 + i * band} 124,${12 + i * band + band + 1.2}`} fill={c} />
        ))}
      </g>
      <path d={`M${apex[0] + depth[0]} ${apex[1] + depth[1]} L${left[0] + depth[0]} ${left[1] + depth[1]} L${right[0] + depth[0]} ${right[1] + depth[1]} M${left[0] + depth[0]} ${left[1] + depth[1]} L${left[0]} ${left[1]}`} strokeOpacity="0.4" strokeWidth="1" />
      <g style={{ animation: 'float-a 8s ease-in-out infinite', ['--rot' as string]: '0deg' }}>
        <path d={side} fill={`url(#${id}s)`} fillOpacity="0.92" stroke="none" />
        <path d={front} fill={`url(#${id}f)`} fillOpacity="0.9" stroke="none" />
        <path d={`M${apex[0] + 1} ${apex[1] + 6} L${left[0] + 7} ${left[1] - 12}`} stroke="#fff" strokeWidth="2.4" />
        <path d={front} strokeWidth="2.4" />
        <path d={`M${apex[0]} ${apex[1]} L${apex[0] + depth[0]} ${apex[1] + depth[1]} L${right[0] + depth[0]} ${right[1] + depth[1]} L${right[0]} ${right[1]}`} strokeWidth="2.4" />
        <line className="scene-in" x1="0" y1="62" x2={entry[0]} y2={entry[1]} strokeWidth="3.2" pathLength="1" />
        <line className="scene-glass" x1={entry[0]} y1={entry[1]} x2={exit[0]} y2={exit[1]} stroke="#fff" strokeWidth="3" pathLength="1" />
      </g>
    </g>
  );
}

/** Телефон с формой записи */
export function PhoneDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 120 120" className={className}>
      <rect x="34" y="8" width="52" height="100" rx="10" fill={PAPER} />
      <path d="M52 16h16" />
      <rect x="42" y="30" width="36" height="10" rx="3" fill="var(--tint-raw-3)" strokeWidth="1.8" />
      <rect x="42" y="46" width="36" height="10" rx="3" fill={PAPER} strokeWidth="1.8" />
      <rect x="42" y="62" width="36" height="10" rx="3" fill={PAPER} strokeWidth="1.8" />
      <rect x="42" y="82" width="36" height="14" rx="4" fill="var(--mark)" strokeWidth="1.8" />
      <path d="M92 30l10-6M94 44h12M92 58l10 6" strokeWidth="2" />
    </Sheet>
  );
}

/** Календарь с отмеченным днём */
export function CalendarDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 120 120" className={className}>
      <rect x="14" y="22" width="92" height="84" rx="8" fill={PAPER} />
      <path d="M14 44h92" />
      <path d="M36 14v16M84 14v16" strokeWidth="3" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect key={`${r}${c}`} x={24 + c * 20} y={52 + r * 17} width="12" height="10" rx="2" strokeWidth="1.5" fill={r === 1 && c === 2 ? 'var(--mark)' : 'none'} />
        )),
      )}
      <path d="M58 66c8-2 16 2 18 8" strokeWidth="1.8" />
    </Sheet>
  );
}

/** Маленький ноутбук со звонком */
export function LaptopDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 140 110" className={className}>
      <rect x="24" y="14" width="92" height="64" rx="6" fill={PAPER} />
      <rect x="32" y="22" width="76" height="48" rx="3" fill="var(--mark)" />
      <circle cx="58" cy="40" r="8" fill={PAPER} strokeWidth="2" />
      <path d="M44 70c2-12 8-16 14-16s12 4 14 16" fill={PAPER} strokeWidth="2" />
      <rect x="80" y="30" width="22" height="16" rx="2" fill="var(--tint-raw-4)" strokeWidth="1.8" />
      <path d="M8 92l16-14h92l16 14z" fill={PAPER} />
    </Sheet>
  );
}

/** Мишень со стрелами-карандашами */
export function TargetDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 200 190" className={className}>
      <ellipse cx="100" cy="176" rx="70" ry="8" fill="var(--ink)" fillOpacity="0.9" stroke="none" />
      <path d="M72 160l-14 18M128 160l14 18" />
      <circle cx="100" cy="96" r="66" fill={PAPER} />
      <circle cx="100" cy="96" r="48" fill="var(--tint-raw-4)" />
      <circle cx="100" cy="96" r="30" fill={PAPER} />
      <circle cx="100" cy="96" r="13" fill="var(--mark)" />
      <path d="M100 96l58-60" strokeWidth="3" />
      <path d="M150 30l16-6-6 16z" fill="var(--mark)" />
      <path d="M100 96l-62-52" strokeWidth="3" />
      <path d="M44 38l-14-6 4 14z" fill="var(--tint-raw-6)" />
      <path d="M22 150c4-6 6-12 4-18M180 150c-4-6-6-12-4-18M166 170c2-6 6-8 10-8" strokeWidth="2" />
    </Sheet>
  );
}

/** Карандаш-человечек для подвала */
export function PencilBuddy({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 160 200" className={className}>
      <path d="M36 150l18 40M76 150l-6 40" />
      <path d="M40 190h20M60 190h18" />
      <g style={{ transformOrigin: '60px 90px', animation: 'wiggle 3.5s ease-in-out infinite' }}>
        <path d="M34 44h52v96H34z" fill="var(--mark)" />
        <path d="M34 140l26 26 26-26z" fill="var(--tint-raw-1)" />
        <path d="M54 160l6 6 6-6" fill="var(--ink)" />
        <path d="M34 24h52v20H34z" fill="var(--tint-raw-6)" />
        <path d="M34 24a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4" />
        <circle cx="50" cy="74" r="2.8" fill="var(--ink)" />
        <circle cx="70" cy="74" r="2.8" fill="var(--ink)" />
        <path d="M52 88c4 4 12 4 16 0" />
        <path d="M34 90c-12 4-20 0-26-10M86 92c14-2 22-14 26-26" />
        <path d="M112 66l8-14M112 66l14-4M112 66l12 8" strokeWidth="2" />
      </g>
      <path d="M126 40c6-4 10-12 8-20M140 52c6-2 12-6 14-12" strokeWidth="2" />
    </Sheet>
  );
}

/** Иконки для стикеров «Для кого» */
export function BackpackDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 100 100" className={className}>
      <path d="M26 40c0-16 10-26 24-26s24 10 24 26v46H26z" fill={PAPER} />
      <path d="M40 14c0-6 4-8 10-8s10 2 10 8" />
      <rect x="34" y="56" width="32" height="20" rx="4" fill="var(--mark)" />
      <path d="M34 64h32M26 50H16v28h10M74 50h10v28H74" />
    </Sheet>
  );
}

export function CapDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 100 100" className={className}>
      <path d="M8 40l42-18 42 18-42 18z" fill={PAPER} />
      <path d="M26 48v20c8 8 40 8 48 0V48" fill="var(--tint-raw-5)" />
      <path d="M86 42v24" />
      <path d="M82 66h8l2 12h-12z" fill="var(--mark)" />
    </Sheet>
  );
}

export function GroupDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 110 100" className={className}>
      <circle cx="30" cy="40" r="11" fill={PAPER} />
      <path d="M12 84c2-16 8-24 18-24s16 8 18 24" fill="var(--tint-raw-3)" />
      <circle cx="80" cy="40" r="11" fill={PAPER} />
      <path d="M62 84c2-16 8-24 18-24s16 8 18 24" fill="var(--tint-raw-6)" />
      <circle cx="55" cy="32" r="12" fill={PAPER} />
      <path d="M34 88c2-18 10-28 21-28s19 10 21 28" fill="var(--mark)" />
    </Sheet>
  );
}

export function DuoDoodle({ className }: { className?: string }) {
  return (
    <Sheet viewBox="0 0 110 100" className={className}>
      <path d="M58 8h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H76l-10 8v-8h-8a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill="var(--mark)" />
      <path d="M64 20h28M64 28h18" strokeWidth="2" />
      <circle cx="30" cy="46" r="12" fill={PAPER} />
      <path d="M10 92c2-18 10-26 20-26s18 8 20 26" fill="var(--tint-raw-4)" />
      <circle cx="78" cy="58" r="10" fill={PAPER} />
      <path d="M62 94c2-14 8-20 16-20s14 6 16 20" fill={PAPER} />
    </Sheet>
  );
}

/** Жёлтая «клякса» по краю экрана */
export function Blob({ className, color = 'var(--mark)' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={clsx('pointer-events-none', className)} aria-hidden="true">
      <path d="M40 10c40-14 110-6 138 34s20 110-24 136-118 22-142-20S0 24 40 10z" fill={color} />
    </svg>
  );
}

/** Стрелка от руки между шагами */
export function ArrowDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 24" className={clsx('overflow-visible', className)} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2 12h110" strokeDasharray="5 6" style={{ animation: 'dash 1.8s linear infinite' }} />
      <path d="M104 5l10 7-10 7" />
    </svg>
  );
}
