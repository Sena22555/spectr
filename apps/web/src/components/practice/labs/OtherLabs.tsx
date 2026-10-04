import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { LabFrame, Readout, Segmented, Slider, fmt } from './shared';

// ——— Двоичные числа ———
export function BinaryLab() {
  const [value, setValue] = useState(164);
  const bits = Array.from({ length: 8 }, (_, i) => 7 - i);
  const on = bits.filter((b) => value & (1 << b));
  return (
    <LabFrame
      title="Двоичный переключатель"
      hue={3}
      hint="Каждый разряд весит вдвое больше соседа справа. Включайте лампочки и смотрите, как складывается число."
      controls={<Slider label="Число" value={value} min={0} max={255} onChange={setValue} />}
    >
      <div className="flex flex-col items-center gap-6 px-4 py-8">
        <div className="grid w-full max-w-[640px] grid-cols-8 gap-1.5 sm:gap-3">
          {bits.map((b) => {
            const lit = Boolean(value & (1 << b));
            return (
              <button
                key={b}
                type="button"
                aria-pressed={lit}
                aria-label={`Разряд ${1 << b}: ${lit ? 'включён' : 'выключен'}`}
                onClick={() => setValue(value ^ (1 << b))}
                className={clsx(
                  'press flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] text-center',
                  lit ? 'border-ink bg-ink text-mark shadow-[0_3px_0_var(--ray-3)]' : 'border-ink/25 bg-paper text-muted hover:border-ink',
                )}
              >
                <span className="t-display text-[clamp(22px,5vw,40px)] leading-none">{lit ? 1 : 0}</span>
                <span className="t-mono text-[10px] sm:text-[11px]">{1 << b}</span>
              </button>
            );
          })}
        </div>
        <p className="tnum text-center text-[17px]">
          {on.length ? on.map((b) => 1 << b).join(' + ') : '0'} = <b className="t-heading text-[24px]">{value}</b>
        </p>
        <Readout
          items={[
            { label: 'двоичная', value: value.toString(2).padStart(8, '0'), strong: true },
            { label: 'десятичная', value, strong: true },
            { label: 'шестнадцатеричная', value: value.toString(16).toUpperCase(), strong: true },
            { label: 'единиц', value: on.length },
          ]}
        />
      </div>
    </LabFrame>
  );
}

// ——— Равноускоренное движение ———
export function MotionLab() {
  const [v0, setV0] = useState(4);
  const [a, setA] = useState(2);
  const [t, setT] = useState(5);
  const T = 10;
  const x = (tt: number) => v0 * tt + (a * tt * tt) / 2;
  const v = (tt: number) => v0 + a * tt;
  const xs = Array.from({ length: 41 }, (_, i) => (i / 40) * T);
  const xMax = Math.max(10, ...xs.map((tt) => Math.abs(x(tt))));
  const vMax = Math.max(5, ...xs.map((tt) => Math.abs(v(tt))));
  const W = 280;
  const H = 150;
  const plot = (f: (t: number) => number, max: number) => xs.map((tt, i) => `${i ? 'L' : 'M'} ${(tt / T) * W} ${H / 2 - (f(tt) / max) * (H / 2 - 8)}`).join(' ');
  const carX = 30 + ((x(t) + xMax) / (2 * xMax)) * 520;

  return (
    <LabFrame
      title="Разгон и торможение"
      hue={1}
      hint="Путь — площадь под графиком скорости. Сделайте ускорение отрицательным, и машина начнёт тормозить, а потом поедет назад."
      controls={
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="Начальная скорость v₀" value={v0} min={-10} max={15} unit="м/с" onChange={setV0} />
          <Slider label="Ускорение a" value={a} min={-5} max={5} step={0.5} unit="м/с²" onChange={setA} format={(n) => fmt(n, 1)} />
          <Slider label="Время t" value={t} min={0} max={T} step={0.1} unit="с" onChange={setT} format={(n) => fmt(n, 1)} />
        </div>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-6">
        <svg viewBox="0 0 580 70" className="block h-auto w-full" aria-hidden="true">
          <line x1="20" y1="52" x2="560" y2="52" stroke="var(--ink)" strokeWidth="2" />
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1={30 + i * 52} y1="48" x2={30 + i * 52} y2="56" stroke="var(--ink)" strokeWidth="1.5" opacity="0.5" />
          ))}
          <line x1="290" y1="40" x2="290" y2="60" stroke="var(--ray-0)" strokeWidth="2" />
          <motion.g animate={{ x: Math.min(540, Math.max(0, carX)) - 20 }} transition={{ type: 'spring', stiffness: 200, damping: 26 }}>
            <rect x="0" y="26" width="40" height="18" rx="6" fill="var(--mark)" stroke="var(--ink)" strokeWidth="2" />
            <rect x="8" y="18" width="22" height="12" rx="4" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
            <circle cx="10" cy="46" r="5" fill="var(--ink)" />
            <circle cx="30" cy="46" r="5" fill="var(--ink)" />
          </motion.g>
        </svg>
        <div className="grid gap-4 sm:grid-cols-2">
          <Chart title="x(t), м" path={plot(x, xMax)} t={t} T={T} y={H / 2 - (x(t) / xMax) * (H / 2 - 8)} color="var(--ray-1)" W={W} H={H} />
          <Chart title="v(t), м/с" path={plot(v, vMax)} t={t} T={T} y={H / 2 - (v(t) / vMax) * (H / 2 - 8)} color="var(--ray-5)" W={W} H={H} area />
        </div>
        <Readout
          items={[
            { label: 'скорость v', value: `${fmt(v(t), 1)} м/с`, strong: true },
            { label: 'координата x', value: `${fmt(x(t), 1)} м`, strong: true },
            { label: 'v = v₀ + at', value: `${v0} + ${fmt(a, 1)}·${fmt(t, 1)}` },
            { label: 'остановка', value: a !== 0 && -v0 / a > 0 ? `t = ${fmt(-v0 / a, 1)} с` : '—' },
          ]}
        />
      </div>
    </LabFrame>
  );
}

function Chart({ title, path, t, T, y, color, W, H, area }: { title: string; path: string; t: number; T: number; y: number; color: string; W: number; H: number; area?: boolean }) {
  const cx = (t / T) * W;
  return (
    <figure className="m-0 rounded-[10px] border border-ink/15 bg-paper p-3">
      <figcaption className="t-mono mb-1 text-[11px] text-muted">{title}</figcaption>
      <svg viewBox={`-4 0 ${W + 8} ${H}`} className="block h-auto w-full" aria-hidden="true">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--ink)" strokeWidth="1" opacity="0.35" />
        <line x1="0" y1="0" x2="0" y2={H} stroke="var(--ink)" strokeWidth="1" opacity="0.35" />
        {area && <path d={`M 0 ${H / 2} ${path.replace(/^M [\d.]+ [\d.-]+/, (m) => m.replace('M', 'L'))} L ${W} ${H / 2} Z`} fill={color} opacity="0.12" />}
        <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
        <line x1={cx} y1="0" x2={cx} y2={H} stroke="var(--ink)" strokeWidth="1" strokeDasharray="3 4" />
        <circle cx={cx} cy={y} r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      </svg>
    </figure>
  );
}

// ——— Закон Ома ———
export function OhmLab() {
  const [U, setU] = useState(12);
  const [r1, setR1] = useState(6);
  const [r2, setR2] = useState(12);
  const [mode, setMode] = useState<'series' | 'parallel'>('series');
  const R = mode === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2);
  const I = U / R;
  const P = U * I;
  const glow = Math.min(1, P / 60);
  return (
    <LabFrame
      title="Цепь с двумя резисторами"
      hue={2}
      hint="При параллельном соединении общее сопротивление всегда меньше самого маленького из резисторов — поэтому ток растёт."
      controls={
        <div className="flex flex-col gap-4">
          <Segmented label="Соединение" value={mode} onChange={setMode} options={[{ value: 'series', label: 'Последовательно' }, { value: 'parallel', label: 'Параллельно' }]} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Slider label="Напряжение U" value={U} min={1} max={24} unit="В" onChange={setU} />
            <Slider label="R₁" value={r1} min={1} max={50} unit="Ом" onChange={setR1} />
            <Slider label="R₂" value={r2} min={1} max={50} unit="Ом" onChange={setR2} />
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5 px-4 py-6">
        <svg viewBox="0 0 560 220" className="block h-auto w-full" role="img" aria-label={`Ток ${fmt(I)} ампер`}>
          <defs>
            <radialGradient id="bulb-glow">
              <stop offset="0" stopColor="var(--mark)" stopOpacity={0.95} />
              <stop offset="1" stopColor="var(--mark)" stopOpacity={0} />
            </radialGradient>
          </defs>
          <path id="ohm-wire" d="M 60 40 H 500 V 180 H 60 Z" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
          {/* батарейка */}
          <g transform="translate(60 110)">
            <rect x="-14" y="-30" width="28" height="60" fill="var(--paper)" />
            <line x1="-12" y1="-6" x2="12" y2="-6" stroke="var(--ink)" strokeWidth="4" />
            <line x1="-6" y1="6" x2="6" y2="6" stroke="var(--ink)" strokeWidth="4" />
            <text x="22" y="5" className="fill-[var(--ink)] text-[14px] font-[700]">
              {U} В
            </text>
          </g>
          {/* резисторы */}
          {mode === 'series' ? (
            <>
              <Resistor x={190} y={40} label={`R₁ = ${r1}`} />
              <Resistor x={330} y={40} label={`R₂ = ${r2}`} />
            </>
          ) : (
            <>
              <path d="M 220 40 V 20 H 400 V 40 M 220 40 V 60 H 400 V 40" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
              <Resistor x={310} y={20} label={`R₁ = ${r1}`} small />
              <Resistor x={310} y={60} label={`R₂ = ${r2}`} small />
            </>
          )}
          {/* лампочка-индикатор мощности */}
          <circle cx="280" cy="180" r={30 + glow * 30} fill="url(#bulb-glow)" opacity={0.3 + glow * 0.7} />
          <circle cx="280" cy="180" r="16" fill={glow > 0.05 ? 'var(--mark)' : 'var(--paper)'} stroke="var(--ink)" strokeWidth="2.5" />
          <path d="M 272 180 l 4 -6 l 4 6 l 4 -6 l 4 6" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
          {/* бегущие заряды: скорость ∝ току */}
          {Array.from({ length: 10 }, (_, i) => (
            <circle key={i} r="3.5" fill="var(--ray-0)">
              <animateMotion dur={`${Math.max(0.8, 14 / Math.max(I, 0.05))}s`} repeatCount="indefinite" begin={`-${i * 0.1 * Math.max(0.8, 14 / Math.max(I, 0.05))}s`}>
                <mpath href="#ohm-wire" />
              </animateMotion>
            </circle>
          ))}
        </svg>
        <Readout
          items={[
            { label: 'общее R', value: `${fmt(R)} Ом`, strong: true },
            { label: 'ток I = U/R', value: `${fmt(I)} А`, strong: true },
            { label: 'мощность P = UI', value: `${fmt(P, 1)} Вт` },
            { label: 'формула', value: mode === 'series' ? 'R = R₁ + R₂' : '1/R = 1/R₁ + 1/R₂' },
          ]}
        />
      </div>
    </LabFrame>
  );
}

function Resistor({ x, y, label, small }: { x: number; y: number; label: string; small?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-34" y="-11" width="68" height="22" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
      <text x="0" y={small ? (y < 40 ? -16 : 30) : -18} textAnchor="middle" className="fill-[var(--ink)] text-[13px] font-[700]">
        {label} Ом
      </text>
    </g>
  );
}

// ——— Квадратное уравнение ———
export function QuadraticLab() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-6);
  const [c, setC] = useState(5);
  const A = a === 0 ? 0.0001 : a;
  const D = b * b - 4 * A * c;
  const roots = D > 0 ? [(-b - Math.sqrt(D)) / (2 * A), (-b + Math.sqrt(D)) / (2 * A)].sort((p, q) => p - q) : D === 0 ? [-b / (2 * A)] : [];
  const vx = -b / (2 * A);
  const vy = A * vx * vx + b * vx + c;
  const X = 10;
  const Y = 12;
  const W = 560;
  const H = 300;
  const sx = (x: number) => ((x + X) / (2 * X)) * W;
  const sy = (y: number) => H / 2 - (y / Y) * (H / 2);
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const x = -X + (i / 200) * 2 * X;
      const y = A * x * x + b * x + c;
      pts.push(`${i ? 'L' : 'M'} ${sx(x).toFixed(1)} ${Math.max(-50, Math.min(H + 50, sy(y))).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [A, b, c]);
  return (
    <LabFrame
      title="Парабола и корни"
      hue={1}
      hint="Корни — точки, где парабола пересекает ось x. Опустите параболу ниже или выше оси — и посмотрите, как меняется знак дискриминанта."
      controls={
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="a" value={a} min={-3} max={3} step={0.5} onChange={setA} format={(n) => fmt(n, 1)} />
          <Slider label="b" value={b} min={-10} max={10} onChange={setB} />
          <Slider label="c" value={c} min={-10} max={10} onChange={setC} />
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-6">
        <p className="t-heading text-center text-[22px]">
          {fmt(a, 1)}x² {b < 0 ? '−' : '+'} {Math.abs(b)}x {c < 0 ? '−' : '+'} {Math.abs(c)} = 0
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-[10px] border border-ink/15 bg-paper" role="img" aria-label={`Дискриминант ${fmt(D)}, корней: ${roots.length}`}>
          <line x1="0" y1={sy(0)} x2={W} y2={sy(0)} stroke="var(--ink)" strokeWidth="1.5" />
          <line x1={sx(0)} y1="0" x2={sx(0)} y2={H} stroke="var(--ink)" strokeWidth="1.5" />
          {Array.from({ length: 21 }, (_, i) => i - 10).map((i) => (
            <line key={i} x1={sx(i)} y1={sy(0) - 4} x2={sx(i)} y2={sy(0) + 4} stroke="var(--ink)" opacity="0.5" />
          ))}
          <path d={path} fill="none" stroke="var(--ray-1)" strokeWidth="3.5" />
          {roots.map((r) => (
            <circle key={r} cx={sx(r)} cy={sy(0)} r="7" fill="var(--mark)" stroke="var(--ink)" strokeWidth="2.5" />
          ))}
          {Math.abs(vx) <= X && Math.abs(vy) <= Y && <circle cx={sx(vx)} cy={sy(vy)} r="4.5" fill="var(--ink)" />}
        </svg>
        <Readout
          items={[
            { label: 'D = b² − 4ac', value: fmt(D), strong: true },
            { label: 'корни', value: roots.length ? roots.map((r) => fmt(r)).join(' и ') : 'нет', strong: true },
            { label: 'вершина', value: `(${fmt(vx, 1)}; ${fmt(vy, 1)})` },
            { label: 'Виет: x₁+x₂, x₁·x₂', value: roots.length === 2 ? `${fmt(-b / A)}, ${fmt(c / A)}` : '—' },
          ]}
        />
      </div>
    </LabFrame>
  );
}

// ——— Проценты ———
export function PercentLab() {
  const [price, setPrice] = useState(1000);
  const [p1, setP1] = useState(20);
  const [p2, setP2] = useState(-20);
  const after1 = price * (1 + p1 / 100);
  const after2 = after1 * (1 + p2 / 100);
  const change = (after2 / price - 1) * 100;
  const max = Math.max(price, after1, after2) * 1.1;
  const bars = [
    { label: 'было', v: price, hue: 4 },
    { label: `${p1 >= 0 ? '+' : ''}${p1}%`, v: after1, hue: p1 >= 0 ? 3 : 0 },
    { label: `${p2 >= 0 ? '+' : ''}${p2}%`, v: after2, hue: p2 >= 0 ? 3 : 0 },
  ];
  return (
    <LabFrame
      title="Два изменения подряд"
      hue={1}
      hint="Второй процент считается от уже изменённой суммы. Поэтому +20% и −20% не возвращают к исходной цене."
      controls={
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider label="Цена" value={price} min={100} max={5000} step={100} unit="₽" onChange={setPrice} />
          <Slider label="Первое изменение" value={p1} min={-50} max={100} step={5} unit="%" onChange={setP1} />
          <Slider label="Второе изменение" value={p2} min={-50} max={100} step={5} unit="%" onChange={setP2} />
        </div>
      }
    >
      <div className="flex flex-col gap-5 px-4 py-6">
        <div className="grid grid-cols-3 items-end gap-4" style={{ height: 220 }}>
          {bars.map((b) => (
            <div key={b.label} className="flex h-full flex-col items-center justify-end gap-2">
              <span className="t-heading tnum text-[18px]">{fmt(b.v, 0)} ₽</span>
              <motion.div className={clsx(`hue-${b.hue}`, 'w-full max-w-[120px] rounded-t-[8px] border-[1.5px] border-ink bg-tint')} animate={{ height: `${(b.v / max) * 160}px` }} transition={{ type: 'spring', stiffness: 220, damping: 26 }} />
              <span className="t-mono text-[12px] text-muted">{b.label}</span>
            </div>
          ))}
        </div>
        <Readout
          items={[
            { label: 'итог', value: `${fmt(after2, 0)} ₽`, strong: true },
            { label: 'изменение', value: `${change >= 0 ? '+' : ''}${fmt(change, 1)}%`, strong: true },
            { label: 'множитель', value: `${fmt(1 + p1 / 100)} × ${fmt(1 + p2 / 100)} = ${fmt((1 + p1 / 100) * (1 + p2 / 100), 3)}` },
          ]}
        />
      </div>
    </LabFrame>
  );
}
