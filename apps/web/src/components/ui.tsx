import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { initials } from '../lib/format';

// ——— Кнопки ———
type Variant = 'primary' | 'secondary' | 'ghost' | 'banner' | 'pastel';
const buttonBase =
  'press inline-flex min-h-12 items-center justify-center gap-2 rounded-ctl px-6 text-[15px] leading-none font-[600] whitespace-nowrap no-underline select-none disabled:pointer-events-none disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'print-shadow bg-ink text-paper hover:bg-mark hover:text-forest',
  secondary: 'border-[1.5px] border-ink bg-paper/60 text-ink hover:-translate-y-0.5 hover:bg-mark hover:text-forest hover:border-forest',
  ghost: 'bg-transparent text-ink underline decoration-1 underline-offset-[3px] hover:underline-offset-[5px] px-1',
  banner: 'bg-mark text-forest hover:-translate-y-0.5',
  pastel: 'border-[1.5px] border-transparent bg-tint text-ink hover:border-ink hover:-translate-y-0.5',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button className={clsx(buttonBase, variants[variant], className)} disabled={loading || props.disabled} {...props}>
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={clsx(buttonBase, variants[variant], className)} {...props} />;
}

// ——— Поля ———
interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
}

const control =
  'w-full rounded-ctl border-[1.5px] border-ink/25 bg-paper px-3.5 text-[17px] text-ink transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-ink/50 focus-visible:border-ink focus-visible:shadow-[0_0_0_4px_var(--mark)] focus-visible:outline-none aria-[invalid=true]:border-ember-text';

function FieldShell({ label, hint, error, className, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="t-caption font-[550] text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="t-caption text-ember-text" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="t-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, className, ...props },
  ref,
) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        className={clsx(control, 'h-12')}
        {...props}
      />
    </FieldShell>
  );
});

export function Textarea({ label, hint, error, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        className={clsx(control, 'min-h-28 resize-y py-3 leading-snug')}
        {...props}
      />
    </FieldShell>
  );
}

export function Select({ label, hint, error, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={clsx(
          control,
          'h-12 appearance-none bg-[length:12px] bg-[right_14px_center] bg-no-repeat pr-10',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2369645f' stroke-width='1.6'/%3E%3C/svg%3E\")]",
        )}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

// ——— Выбор из вариантов (сегменты) ———
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange(v: T): void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="t-caption mb-1.5 p-0 font-[550] text-ink">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        {options.map((o) => (
          <label
            key={o.value}
            className={clsx(
              'press flex min-h-12 cursor-pointer flex-col justify-center rounded-ctl border-[1.5px] px-3 py-2 has-[:focus-visible]:shadow-[0_0_0_4px_var(--mark)]',
              value === o.value ? 'border-ink bg-ink text-paper' : 'border-ink/25 hover:border-ink hover:bg-mark/40',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="text-[15.5px] leading-tight font-[500] [overflow-wrap:anywhere]">{o.label}</span>
            {o.hint && <span className={clsx('t-caption', value === o.value ? 'text-paper/80' : 'text-muted')}>{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ——— Бейджи и теги ———
export function Badge({ tone = 'outline', children, className }: { tone?: 'ember' | 'outline' | 'ink'; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        't-mono inline-flex h-6 items-center rounded-full px-2.5 text-[11px] leading-none whitespace-nowrap',
        tone === 'ember' && 'bg-ember text-on-ember',
        tone === 'outline' && 'border border-ink/40 text-ink',
        tone === 'ink' && 'bg-ink text-paper',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Tag({ hue, children, className }: { hue: number; children: ReactNode; className?: string }) {
  return (
    <span className={clsx(`hue-${hue}`, 't-mono inline-flex h-7 items-center gap-1.5 rounded-full bg-tint px-3 text-[12px] leading-none text-hue', className)}>
      {children}
    </span>
  );
}

// ——— Заглушка-портрет: рисунок-набросок на цветном стикере, пока нет настоящего фото ———
export function Monogram({
  name,
  hue,
  photoUrl,
  className,
  size = 'md',
}: {
  name: string;
  hue: number;
  photoUrl?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'fill';
}) {
  const sizes = { sm: 'size-10 text-[15px]', md: 'size-16 text-[24px]', lg: 'size-28 text-[42px]', fill: 'h-full w-full text-[64px]' };
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={clsx('object-cover', sizes[size], className)} loading="lazy" />;
  }
  const h = ((hue % 7) + 7) % 7;
  const portrait = size === 'lg' || size === 'fill';
  return (
    <span role="img" aria-label={name} className={clsx(`hue-${h}`, 'relative isolate grid place-items-center overflow-hidden bg-tint text-hue', sizes[size], className)}>
      {portrait ? <Sketch seed={h} /> : <span className="t-display leading-none">{initials(name)}</span>}
    </span>
  );
}

/** Набросок человека: причёска и аксессуар зависят от оттенка, чтобы портреты различались. */
const HAIR_BACK = [
  'M28 54c-4-24 8-40 26-40s30 16 26 40c0 14 2 22 6 28H22c4-6 6-14 6-28z',
  'M29 58c-5-24 6-40 25-40s30 16 25 40c-2 6-4 10-8 12H37c-4-2-6-6-8-12z',
  null,
  null,
  null,
  'M28 54c-4-24 8-40 26-40s30 16 26 40c0 10 0 18 4 24H24c4-6 4-14 4-24z',
  null,
];
const HAIR_TOP = [
  'M32 46c2-14 10-22 22-22s20 8 22 22c-8-8-14-12-22-12-6 6-14 10-22 12z',
  'M32 44c2-14 10-20 22-20s20 6 22 20c-10-2-18-6-22-12-4 6-12 10-22 12z',
  'M32 44c-2-16 8-26 22-26s24 10 22 26c-6-6-14-8-22-8s-16 2-22 8z',
  'M32 42c0-14 10-22 22-22s22 8 22 22c-8-4-14-6-22-6s-14 2-22 6zM46 20a8 8 0 1 1 16 0',
  'M31 44c-2-16 9-26 23-26s25 10 23 26l-5-7-6 5-6-7-6 6-6-6-6 7-6-5z',
  'M32 46c2-14 10-22 22-22s20 8 22 22c-6-6-12-10-22-10s-16 4-22 10z',
  'M33 40c4-14 30-18 42-2-2 4-4 6-8 6-4-6-10-8-18-8-6 0-12 2-16 4z',
];

function Sketch({ seed }: { seed: number }) {
  const back = HAIR_BACK[seed];
  const dark = seed % 2 === 0;
  const acc = seed % 3;
  return (
    <svg viewBox="0 0 108 120" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 h-[86%] w-full" aria-hidden="true">
      <g fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {back && <path d={back} fill={dark ? 'var(--ink)' : 'var(--r)'} />}
        <path d="M12 122c2-22 14-36 32-40h20c18 4 30 18 32 40" fill="var(--paper)" />
        <path d="M44 82c2 6 6 9 10 9s8-3 10-9" />
        <path d="M45 72v10M63 72v10" />
        <ellipse cx="54" cy="50" rx="22" ry="26" fill="var(--paper)" />
        <path d={HAIR_TOP[seed]} fill={dark ? 'var(--ink)' : 'var(--r)'} />
        <g style={{ transformOrigin: '54px 52px', animation: 'blink 5s infinite' }}>
          <path d="M46 52h.1M62 52h.1" strokeWidth="3.6" />
        </g>
        <path d="M49 63c3 2.5 7 2.5 10 0" />
        {acc === 1 && <path d="M38 52a7 6 0 1 0 14 0a7 6 0 1 0-14 0zM56 52a7 6 0 1 0 14 0a7 6 0 1 0-14 0zM52 52h4" strokeWidth="1.8" />}
        {acc === 2 && <path d="M41 60c-1 1-1 3 0 4M67 60c1 1 1 3 0 4" strokeWidth="1.6" />}
      </g>
    </svg>
  );
}

export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return url ? (
    <img src={url} alt="" className={clsx('size-9 rounded-full object-cover', className)} />
  ) : (
    <span className={clsx('grid size-9 place-items-center rounded-full bg-mark text-[14px] font-[650] text-forest', className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// ——— Раскладка ———
export function PageHeader({ title, lead, actions, className }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={clsx('flex flex-col gap-4 border-b border-dashed border-hair-soft pt-2 pb-7 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="t-display t-lg">{title}</h1>
        {lead && <p className="t-sub max-w-[60ch] text-muted">{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('pt-2 pb-2', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 className="t-display t-md relative w-fit">
          {children}
          <Squiggle className="absolute -bottom-3 left-0 h-3 w-[min(100%,160px)] " />
        </h2>
        {action && <div className="whitespace-nowrap">{action}</div>}
      </div>
    </div>
  );
}

/** Волнистая линия от руки — подчёркивает заголовки разделов. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 12" preserveAspectRatio="none" className={clsx('pointer-events-none overflow-visible', className)} aria-hidden="true">
      <path d="M2 8c14-6 24-6 34 0s22 6 34 0 22-6 34 0 22 6 34 0 12-4 20-2" fill="none" stroke="var(--ray-2)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Рубрика: тёмный квадрат с иконкой и подпись моноширинным на цветной плашке, как этикетка. */
export function Chip({ icon, children, hue = 2, className }: { icon?: ReactNode; children: ReactNode; hue?: number; className?: string }) {
  return (
    <span className={clsx(`hue-${hue}`, 'inline-flex h-7 w-fit items-stretch overflow-hidden rounded-[5px] text-[12px]', className)}>
      <span className="grid w-7 place-items-center bg-forest text-mark [&>svg]:size-3.5" aria-hidden="true">
        {icon ?? <span className="h-3 w-1 rounded-full bg-mark" />}
      </span>
      <span className="t-mono flex items-center bg-sticky px-2.5 text-forest">{children}</span>
    </span>
  );
}

export function Empty({ title, children, action, hue = 2 }: { title: string; children?: ReactNode; action?: ReactNode; hue?: number }) {
  return (
    <div className={clsx(`hue-${hue}`, 'relative flex -rotate-[0.6deg] flex-col items-start gap-3 rounded-[6px] bg-tint p-6 shadow-sticker sm:p-8')}>
      <p className="t-heading text-[24px]">{title}</p>
      {children && <div className="max-w-[52ch] text-[16px] text-ink/85">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Не получилось загрузить данные.';
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border-[1.5px] border-dashed border-ember-text/70 bg-[color-mix(in_oklab,var(--tint-raw-0)_22%,transparent)] p-5">
      <p className="text-ember-text">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Попробовать ещё раз
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-card bg-bone', className)} aria-hidden="true" />;
}

export function Loading({ label = 'Загружаем…' }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={label}>
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24 opacity-60" />
    </div>
  );
}
