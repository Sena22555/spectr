import { useId, type ReactNode } from 'react';
import clsx from 'clsx';
import { FlaskConical } from 'lucide-react';

/** Рамка интерактивной «лабораторной»: миллиметровка, заголовок, подпись. */
export function LabFrame({ title, hint, children, controls, hue = 4 }: { title: string; hint: string; children: ReactNode; controls: ReactNode; hue?: number }) {
  return (
    <section className={clsx(`hue-${hue}`, 'overflow-hidden rounded-[14px] border-[1.5px] border-ink/15 bg-paper')} aria-label={`Интерактив: ${title}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-dashed border-hair-soft px-5 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-tint text-hue">
          <FlaskConical className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="t-mono text-[11px] text-muted">лабораторная · потрогайте ползунки</p>
          <h3 className="t-heading text-[20px] leading-tight">{title}</h3>
        </div>
      </header>
      <div className="graph-paper relative">{children}</div>
      <div className="flex flex-col gap-4 border-t border-dashed border-hair-soft px-5 py-4">
        {controls}
        <p className="t-caption text-muted">{hint}</p>
      </div>
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange(v: number): void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="t-caption font-[550]">
          {label}
        </label>
        <output htmlFor={id} className="t-heading tnum text-[18px]">
          {format ? format(value) : value}
          {unit && <span className="t-mono ml-1 text-[12px] text-muted">{unit}</span>}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="lab-range h-6 w-full cursor-pointer appearance-none bg-transparent"
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void; label: string }) {
  return (
    <div className="inline-flex w-fit flex-wrap rounded-full border border-ink/30 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('press rounded-full px-3.5 py-1.5 text-[14px]', value === o.value ? 'bg-ink text-paper' : 'hover:bg-ink/[0.07]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Readout({ items }: { items: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="flex flex-col">
          <dt className="t-mono text-[11px] text-muted">{i.label}</dt>
          <dd className={clsx('tnum m-0', i.strong ? 't-heading text-[22px]' : 'text-[17px] font-[550]')}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—');
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
