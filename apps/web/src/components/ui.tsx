import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { initials } from '../lib/format';

// ——— Кнопки ———
type Variant = 'primary' | 'secondary' | 'ghost' | 'banner' | 'pastel';
const buttonBase =
  'press inline-flex min-h-12 items-center justify-center gap-2 rounded-ctl px-6 text-[15px] leading-none font-[600] whitespace-nowrap no-underline select-none transition-[background-color,box-shadow,color,transform] disabled:pointer-events-none disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'print-shadow bg-ink text-paper',
  secondary: 'border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
  ghost: 'bg-transparent text-ink underline decoration-1 underline-offset-[3px] hover:underline-offset-[5px] px-1',
  banner: 'bg-on-banner text-banner hover:opacity-90',
  pastel: 'border border-transparent bg-tint text-ink hover:border-ink',
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
  'w-full rounded-ctl border border-ink bg-paper px-3.5 text-[17px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-[invalid=true]:border-ember-text';

function FieldShell({ label, hint, error, className, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="t-caption text-ink">
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
      <legend className="t-caption mb-1.5 p-0 text-ink">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.value}
            className={clsx(
              'press flex min-h-12 cursor-pointer flex-col justify-center rounded-ctl border px-3 py-2 transition-colors',
              value === o.value ? 'border-ink bg-ink text-paper' : 'border-ink/40 hover:border-ink',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="text-[16px] leading-tight font-[420]">{o.label}</span>
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
        't-mono inline-flex h-6 items-center rounded-[2px] px-2 text-[11px] leading-none whitespace-nowrap',
        tone === 'ember' && 'bg-ember text-on-ember',
        tone === 'outline' && 'border border-ink/70 text-ink',
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
    <span className={clsx(`hue-${hue}`, 't-mono inline-flex h-7 items-center gap-1.5 rounded-[2px] bg-tint px-2.5 text-[11.5px] leading-none text-hue', className)}>
      <span className="size-1.5 bg-ray" aria-hidden="true" />
      {children}
    </span>
  );
}

// ——— Заглушка-портрет: две краски с наложением, пока нет настоящего фото ———
const RAY = ['var(--ray-0)', 'var(--ray-1)', 'var(--ray-2)', 'var(--ray-3)', 'var(--ray-4)', 'var(--ray-5)', 'var(--ray-6)'];

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
  const sizes = { sm: 'size-10 text-[17px]', md: 'size-16 text-[26px]', lg: 'size-28 text-[46px]', fill: 'h-full w-full text-[64px]' };
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={clsx('object-cover', sizes[size], className)} loading="lazy" />;
  }
  const h = ((hue % 7) + 7) % 7;
  const a = RAY[h];
  const b = RAY[(h + 2) % 7];
  const portrait = size === 'lg' || size === 'fill';
  const dx = ((h % 3) - 1) * 5;
  return (
    <span
      role="img"
      aria-label={name}
      className={clsx(`hue-${h}`, 'relative isolate grid place-items-center overflow-hidden bg-tint text-hue', sizes[size], className)}
    >
      {portrait ? (
        <>
          <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
            <defs>
              <pattern id={`dots-${h}`} width="5" height="5" patternUnits="userSpaceOnUse">
                <circle cx="2.5" cy="2.5" r="0.7" fill="var(--i)" />
              </pattern>
              <linearGradient id={`fade-${h}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="1" stopColor="#fff" stopOpacity="0.55" />
              </linearGradient>
              <mask id={`m-${h}`}>
                <rect width="100" height="125" fill={`url(#fade-${h})`} />
              </mask>
            </defs>
            <rect width="100" height="125" fill={`url(#dots-${h})`} mask={`url(#m-${h})`} />
            <circle cx="50" cy="60" r="38" fill="none" stroke="var(--i)" strokeOpacity="0.35" strokeWidth="0.5" strokeDasharray="1.5 2.5" />
            <g style={{ mixBlendMode: 'var(--blend)' as never }}>
              <ellipse cx={50 + dx} cy="134" rx="44" ry="44" fill={b} />
              <circle cx={50 - dx / 2} cy="62" r="21" fill={a} />
              <circle cx={58 + dx / 2} cy="66" r="21" fill={b} fillOpacity="0.8" />
            </g>
          </svg>
          <span className="t-mono absolute bottom-2 left-2.5 text-[11px] text-ink">{initials(name)}</span>
        </>
      ) : (
        <span className="t-display leading-none tracking-normal">{initials(name)}</span>
      )}
    </span>
  );
}

export function Avatar({ name, url, className }: { name: string; url?: string | null; className?: string }) {
  return url ? (
    <img src={url} alt="" className={clsx('size-9 rounded-full object-cover', className)} />
  ) : (
    <span className={clsx('grid size-9 place-items-center rounded-full bg-bone text-[14px] font-[600]', className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

// ——— Раскладка ———
export function PageHeader({ title, lead, actions, className }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={clsx('rule-thick flex flex-col gap-4 border-b border-hair pt-4 pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
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
    <div className={clsx('rule-thick border-b border-hair pt-3 pb-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 className="t-heading t-md">{children}</h2>
        {action && <div className="whitespace-nowrap">{action}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action, hue = 2 }: { title: string; children?: ReactNode; action?: ReactNode; hue?: number }) {
  return (
    <div className={clsx(`hue-${hue}`, 'flex flex-col items-start gap-3 rounded-card border-t-[3px] border-ray bg-tint p-6 sm:p-8')}>
      <p className="t-heading text-[24px]">{title}</p>
      {children && <div className="max-w-[52ch] text-[16px] text-ink/80">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Не получилось загрузить данные.';
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-ember-text/70 border-l-[4px] p-5">
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
