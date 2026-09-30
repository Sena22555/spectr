import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { haptic, isMiniApp, platform, platformLabel } from '../lib/platform';
import { homeFor } from '../components/Layout';
import { Button, Input } from '../components/ui';
import { LogoMark } from '../components/Logo';

function AuthFrame({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-[1200px] lg:grid-cols-2">
      <aside className="hue-5 relative hidden overflow-hidden bg-tint p-12 lg:flex lg:flex-col lg:justify-between">
        <p className="t-display text-[clamp(72px,8vw,140px)] text-hue">Спектр</p>
        <LogoMark className="absolute right-[-8%] bottom-[12%] w-[70%] text-ink opacity-90" title="" />
        <p className="t-sub relative max-w-[26ch]">Расписание, ссылки на уроки и связь с преподавателем — в одном кабинете.</p>
      </aside>
      <div className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="t-display t-lg">{title}</h1>
            <p className="text-[17px] text-muted">{lead}</p>
          </div>
          {children}
          <div className="border-t border-hair-soft pt-5 text-[16px]">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { user, login, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={params.get('next') ?? homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(email, password);
      haptic('success');
      navigate(params.get('next') ?? homeFor(u.role), { replace: true });
    } catch (err) {
      haptic('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Вход"
      lead={isMiniApp ? `Не получилось войти через ${platformLabel[platform]} автоматически — войдите по почте.` : 'Войдите, чтобы видеть расписание и ссылки на занятия.'}
      footer={
        <p>
          Нет аккаунта?{' '}
          <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="link">
            Зарегистрироваться
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate={false}>
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Input label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && (
          <p className="t-caption text-ember-text" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy}>
          Войти
        </Button>
      </form>
      {import.meta.env.DEV && <DemoAccounts onPick={(e, p) => (setEmail(e), setPassword(p))} />}
    </AuthFrame>
  );
}

function DemoAccounts({ onPick }: { onPick(email: string, password: string): void }) {
  const list = [
    ['Ученица', 'student@spectr.school', 'spectr-student'],
    ['Преподаватель', 'anna@spectr.school', 'spectr-teacher'],
    ['Администратор', 'admin@spectr.school', 'spectr-admin'],
  ] as const;
  return (
    <div className="hue-2 flex flex-col gap-2 rounded-card bg-tint p-4">
      <p className="t-caption text-hue">Демо-аккаунты (видно только в режиме разработки)</p>
      <div className="flex flex-wrap gap-2">
        {list.map(([label, e, p]) => (
          <button key={e} type="button" className="press rounded-ctl border border-ink/50 px-3 py-2 text-[15px] hover:border-ink" onClick={() => onPick(e, p)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Register() {
  const { user, register, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={params.get('next') ?? homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await register({ ...form, phone: form.phone || undefined });
      haptic('success');
      navigate(params.get('next') ?? homeFor(u.role), { replace: true });
    } catch (err) {
      haptic('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Регистрация"
      lead="Аккаунт ученика: расписание, переносы и поддержка в одном месте."
      footer={
        <p>
          Уже есть аккаунт?{' '}
          <Link to="/login" className="link">
            Войти
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Input label="Имя и фамилия" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required minLength={2} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
        <Input label="Телефон" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" hint="Необязательно — чтобы администратор мог позвонить" />
        <Input
          label="Пароль"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          autoComplete="new-password"
          required
          minLength={8}
          hint="Минимум 8 символов"
        />
        {error && (
          <p className="t-caption text-ember-text" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy}>
          Создать аккаунт
        </Button>
      </form>
    </AuthFrame>
  );
}
