import { useState } from 'react';
import { LabFrame, Readout, Segmented, Slider, deg, fmt, rad } from './shared';

// Преломление: граница двух сред (закон Снеллиуса, полное отражение) и призма Ньютона с дисперсией.

const MEDIA = [
  { key: 'air', label: 'Воздух', n: 1.0, fill: 'transparent' },
  { key: 'water', label: 'Вода', n: 1.33, fill: 'var(--tint-raw-4)' },
  { key: 'glass', label: 'Стекло', n: 1.5, fill: 'var(--tint-raw-5)' },
  { key: 'diamond', label: 'Алмаз', n: 2.42, fill: 'var(--tint-raw-6)' },
] as const;
type MediumKey = (typeof MEDIA)[number]['key'];
const medium = (k: MediumKey) => MEDIA.find((m) => m.key === k)!;

const RAYS = ['var(--ray-0)', 'var(--ray-1)', 'var(--ray-2)', 'var(--ray-3)', 'var(--ray-4)', 'var(--ray-5)', 'var(--ray-6)'];

type V = [number, number];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const norm = (a: V): V => mul(a, 1 / Math.hypot(a[0], a[1]));

/** Преломление вектора d на поверхности с нормалью n (n направлена против d). null — полное отражение. */
function refract(d: V, n: V, eta: number): V | null {
  const cosi = -dot(n, d);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  return norm(add(mul(d, eta), mul(n, eta * cosi - Math.sqrt(k))));
}

/** Пересечение луча p + t·d с отрезком a–b. */
function hit(p: V, d: V, a: V, b: V): V | null {
  const e: V = [b[0] - a[0], b[1] - a[1]];
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - p[0]) * e[1] - (a[1] - p[1]) * e[0]) / den;
  const u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
  return t > 1e-6 && u >= 0 && u <= 1 ? add(p, mul(d, t)) : null;
}

export function RefractionLab() {
  const [mode, setMode] = useState<'boundary' | 'prism'>('prism');
  return (
    <LabFrame
      title={mode === 'prism' ? 'Призма Ньютона' : 'Луч на границе двух сред'}
      hue={5}
      hint={
        mode === 'prism'
          ? 'Каждый цвет преломляется под своим углом: фиолетовый сильнее, красный слабее. Разброс показателя преломления здесь увеличен, чтобы веер было хорошо видно.'
          : 'Углы отсчитываются от нормали — пунктирной линии. Попробуйте пустить луч из алмаза в воздух под большим углом: свет перестанет выходить наружу.'
      }
      controls={
        <Segmented
          label="Режим"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'prism', label: 'Призма' },
            { value: 'boundary', label: 'Граница сред' },
          ]}
        />
      }
    >
      {mode === 'prism' ? <Prism /> : <Boundary />}
    </LabFrame>
  );
}

function Boundary() {
  const [top, setTop] = useState<MediumKey>('air');
  const [bottom, setBottom] = useState<MediumKey>('glass');
  const [alpha, setAlpha] = useState(40);
  const n1 = medium(top).n;
  const n2 = medium(bottom).n;
  const s = (n1 * Math.sin(rad(alpha))) / n2;
  const tir = s > 1;
  const beta = tir ? NaN : deg(Math.asin(s));
  const O: V = [300, 190];
  const L = 175;
  const start: V = [O[0] - L * Math.sin(rad(alpha)), O[1] - L * Math.cos(rad(alpha))];
  const refl: V = [O[0] + L * Math.sin(rad(alpha)), O[1] - L * Math.cos(rad(alpha))];
  const out: V = [O[0] + L * Math.sin(rad(beta)), O[1] + L * Math.cos(rad(beta))];
  const r = 48;
  const critical = n1 > n2 ? deg(Math.asin(n2 / n1)) : null;

  return (
    <div className="flex flex-col">
      <svg viewBox="0 0 600 380" className="block h-auto w-full" role="img" aria-label={`Луч падает под углом ${alpha}°, ${tir ? 'полное внутреннее отражение' : `угол преломления ${fmt(beta, 1)}°`}`}>
        <rect x="0" y="0" width="600" height="190" fill={medium(top).fill} opacity="0.55" />
        <rect x="0" y="190" width="600" height="190" fill={medium(bottom).fill} opacity="0.75" />
        <line x1="0" y1="190" x2="600" y2="190" stroke="var(--ink)" strokeWidth="2" />
        <line x1="300" y1="14" x2="300" y2="366" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="6 6" opacity="0.6" />
        <text x="14" y="30" className="fill-[var(--ink)] text-[15px] font-[600]">
          {medium(top).label} · n = {fmt(n1)}
        </text>
        <text x="14" y="366" className="fill-[var(--ink)] text-[15px] font-[600]">
          {medium(bottom).label} · n = {fmt(n2)}
        </text>
        {/* углы */}
        <path d={`M ${O[0]} ${O[1] - r} A ${r} ${r} 0 0 0 ${O[0] - r * Math.sin(rad(alpha))} ${O[1] - r * Math.cos(rad(alpha))}`} fill="none" stroke="var(--ray-1)" strokeWidth="3" />
        <text x={O[0] - 70} y={O[1] - 58} className="fill-[var(--ink)] text-[15px] font-[700]">
          α = {alpha}°
        </text>
        {!tir && (
          <>
            <path d={`M ${O[0]} ${O[1] + r} A ${r} ${r} 0 0 0 ${O[0] + r * Math.sin(rad(beta))} ${O[1] + r * Math.cos(rad(beta))}`} fill="none" stroke="var(--ray-5)" strokeWidth="3" />
            <text x={O[0] + 24} y={O[1] + 76} className="fill-[var(--ink)] text-[15px] font-[700]">
              β = {fmt(beta, 1)}°
            </text>
          </>
        )}
        {/* лучи */}
        <line x1={start[0]} y1={start[1]} x2={O[0]} y2={O[1]} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <line x1={O[0]} y1={O[1]} x2={refl[0]} y2={refl[1]} stroke="var(--ink)" strokeWidth={tir ? 4 : 2} strokeLinecap="round" opacity={tir ? 1 : 0.22} />
        {!tir && <line x1={O[0]} y1={O[1]} x2={out[0]} y2={out[1]} stroke="var(--ray-0)" strokeWidth="4" strokeLinecap="round" />}
        <circle cx={O[0]} cy={O[1]} r="4" fill="var(--ink)" />
        {tir && (
          <text x="330" y="240" className="fill-[var(--ember-text)] text-[16px] font-[700]">
            Полное внутреннее отражение!
          </text>
        )}
      </svg>
      <div className="flex flex-col gap-4 border-t border-dashed border-hair-soft bg-paper px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <MediumPicker label="Свет идёт из" value={top} onChange={setTop} />
          <MediumPicker label="в" value={bottom} onChange={setBottom} />
        </div>
        <Slider label="Угол падения α" value={alpha} min={0} max={85} unit="°" onChange={setAlpha} />
        <Readout
          items={[
            { label: 'n₁·sin α', value: fmt(n1 * Math.sin(rad(alpha)), 3) },
            { label: 'sin β', value: tir ? '> 1' : fmt(s, 3) },
            { label: 'угол β', value: tir ? 'нет' : `${fmt(beta, 1)}°`, strong: true },
            { label: 'предельный угол', value: critical ? `${fmt(critical, 1)}°` : '—' },
          ]}
        />
      </div>
    </div>
  );
}

function MediumPicker({ label, value, onChange }: { label: string; value: MediumKey; onChange(v: MediumKey): void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-caption font-[550]">{label}</span>
      <Segmented label={label} value={value} onChange={onChange} options={MEDIA.map((m) => ({ value: m.key, label: m.label }))} />
    </div>
  );
}

function Prism() {
  const [angle, setAngle] = useState(-20);
  const [n, setN] = useState(1.52);
  const [spread, setSpread] = useState(true);
  const A: V = [300, 64];
  const B: V = [168, 300];
  const C: V = [432, 300];
  const entry: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const d = norm([Math.cos(rad(angle)), Math.sin(rad(angle))]);
  const src = add(entry, mul(d, -260));
  const nAB = norm([B[1] - A[1], A[0] - B[0]]); // наружная нормаль левой грани
  const leftNormal: V = dot(nAB, d) < 0 ? nAB : mul(nAB, -1);

  const rays = RAYS.map((color, i) => {
    const ni = spread ? n - 0.045 + i * 0.015 : n;
    const t1 = refract(d, leftNormal, 1 / ni);
    if (!t1) return null;
    const p2 = hit(entry, t1, A, C) ?? hit(entry, t1, B, C);
    if (!p2) return null;
    const onRight = Boolean(hit(entry, t1, A, C));
    const face: [V, V] = onRight ? [A, C] : [B, C];
    let fn = norm([face[1][1] - face[0][1], face[0][0] - face[1][0]]);
    if (dot(fn, t1) > 0) fn = mul(fn, -1);
    const t2 = refract(t1, fn, ni);
    return { color, p2, out: t2 ? add(p2, mul(t2, 320)) : null };
  });
  const spreadDeg = (() => {
    const outs = rays.filter((r) => r?.out).map((r) => Math.atan2(r!.out![1] - r!.p2[1], r!.out![0] - r!.p2[0]));
    return outs.length > 1 ? deg(Math.max(...outs) - Math.min(...outs)) : 0;
  })();

  return (
    <div className="flex flex-col">
      <svg viewBox="0 0 600 380" className="block h-auto w-full" role="img" aria-label="Призма раскладывает белый луч на спектр">
        <defs>
          <linearGradient id="prism-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.6" stopColor="#e3f7f4" />
            <stop offset="1" stopColor="#b9e6e2" />
          </linearGradient>
        </defs>
        {rays.map((r, i) => r?.out && <line key={i} x1={r.p2[0]} y1={r.p2[1]} x2={r.out[0]} y2={r.out[1]} stroke={r.color} strokeWidth={spread ? 7 : 4} strokeLinecap="round" opacity="0.9" style={{ mixBlendMode: 'multiply' }} />)}
        <path d={`M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} Z`} fill="url(#prism-glass)" opacity="0.92" />
        {rays.map((r, i) => r && <line key={i} x1={entry[0]} y1={entry[1]} x2={r.p2[0]} y2={r.p2[1]} stroke={spread ? r.color : '#fff'} strokeWidth="2.4" opacity={spread ? 0.75 : 1} />)}
        <path d={`M${A[0]} ${A[1]} L${B[0]} ${B[1]} L${C[0]} ${C[1]} Z`} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
        <line x1={src[0]} y1={src[1]} x2={entry[0]} y2={entry[1]} stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
        <text x={Math.max(8, src[0] + 6)} y={Math.min(372, Math.max(20, src[1] + 26))} className="fill-[var(--ink)] text-[15px] font-[600]">
          белый свет
        </text>
        {rays.every((r) => !r?.out) && (
          <text x="320" y="345" className="fill-[var(--ember-text)] text-[15px] font-[700]">
            Свет не выходит: полное отражение
          </text>
        )}
      </svg>
      <div className="flex flex-col gap-4 border-t border-dashed border-hair-soft bg-paper px-5 py-4">
        <Slider label="Наклон входящего луча" value={angle} min={-55} max={5} unit="°" onChange={setAngle} />
        <Slider label="Показатель преломления стекла" value={n} min={1.3} max={1.9} step={0.01} onChange={setN} format={(v) => fmt(v, 2)} />
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} className="size-4 accent-[var(--ink)]" />
          Дисперсия (n зависит от цвета)
        </label>
        <Readout
          items={[
            { label: 'n для красного', value: fmt(spread ? n - 0.045 : n, 3) },
            { label: 'n для фиолетового', value: fmt(spread ? n + 0.045 : n, 3) },
            { label: 'ширина веера', value: `${fmt(spreadDeg, 1)}°`, strong: true },
          ]}
        />
      </div>
    </div>
  );
}
