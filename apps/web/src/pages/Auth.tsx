import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { haptic, isMiniApp, platform, platformLabel } from '../lib/platform';
import { homeFor } from '../components/Layout';
import { Button, Input } from '../components/ui';
import { LogoMark } from '../components/Logo';
import type { User } from '../lib/types';
import { LaptopDoodle, PaperDoodle, PencilDoodle } from '../components/Doodles';

function AuthFrame({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-64px)] w-full max-w-[1200px] lg:grid-cols-2">
      <aside className="relative m-4 hidden overflow-hidden rounded-[18px] bg-mark p-12 text-forest lg:flex lg:flex-col lg:justify-between">
        <div className="relative">
          <LogoMark className="h-12 w-16" title="" />
          <p className="t-display mt-6 max-w-[12ch] text-[clamp(40px,4vw,56px)]">Всё про учёбу — в одном кабинете.</p>
        </div>
        <PaperDoodle className="float-a absolute top-[34%] right-[10%] w-[110px]" style={{ ['--rot' as string]: '14deg' }} />
        <PencilDoodle className="absolute top-[58%] left-[8%] w-[150px] -rotate-12" />
        <LaptopDoodle className="absolute right-[-4%] bottom-[6%] w-[62%]" />
        <p className="relative max-w-[26ch] text-[18px]">Расписание, ссылки на уроки и связь с преподавателем.</p>
      </aside>
      <div className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className="mx-auto flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="t-display t-lg">{title}</h1>
            <p className="text-[17px] text-muted">{lead}</p>
          </div>
          {children}
          <div className="border-t border-dashed border-hair-soft pt-5 text-[16px]">{footer}</div>
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
        <Link to={`/reset${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="link -mt-2 self-start text-[15px]">
          Забыли пароль?
        </Link>
        {error && (
          <p className="t-caption text-ember-text" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy}>
          Войти
        </Button>
      </form>
      {(import.meta.env.DEV || __DEMO__) && <DemoAccounts onPick={(e, p) => (setEmail(e), setPassword(p))} />}
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
    <div className="hue-2 flex -rotate-[0.5deg] flex-col gap-2 rounded-[10px] bg-tint p-4 shadow-sticker">
      <p className="t-caption text-hue">Демо-аккаунты — нажмите, чтобы войти</p>
      <div className="flex flex-wrap gap-2">
        {list.map(([label, e, p]) => (
          <button key={e} type="button" className="press rounded-full border-[1.5px] border-forest/40 bg-paper px-4 py-2 text-[15px] hover:-translate-y-0.5 hover:border-forest" onClick={() => onPick(e, p)}>
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
  const [step, setStep] = useState<'form' | 'code'>('form');

  if (step === 'code' && user) {
    return <VerifyEmail email={user.email ?? form.email} onDone={(u) => navigate(params.get('next') ?? homeFor(u.role), { replace: true })} />;
  }
  if (!loading && user && step === 'form') return <Navigate to={params.get('next') ?? homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await register({ ...form, phone: form.phone || undefined });
      haptic('success');
      if (u.emailVerified || __DEMO__) navigate(params.get('next') ?? homeFor(u.role), { replace: true });
      else setStep('code');
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

function useCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(60)] as const;
}

const codeInputProps = {
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  pattern: '\\d{6}',
  maxLength: 6,
  required: true,
};

/** Шаг после регистрации: код из письма. Аккаунт уже создан, код можно ввести и позже из профиля. */
function VerifyEmail({ email, onDone }: { email: string; onDone(u: User): void }) {
  const { verifyEmail, resendCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, startCooldown] = useCooldown();
  useEffect(startCooldown, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await verifyEmail(code);
      haptic('success');
      onDone(u);
    } catch (err) {
      haptic('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNote(null);
    try {
      await resendCode();
      setNote('Отправили новый код.');
      startCooldown();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AuthFrame
      title="Проверьте почту"
      lead={`Мы отправили шестизначный код на ${email}. Если письма нет, загляните в «Спам».`}
      footer={
        <p>
          Не приходит?{' '}
          {left > 0 ? (
            <span className="text-muted">Новый код можно запросить через {left} с</span>
          ) : (
            <button type="button" className="link" onClick={resend}>
              Отправить ещё раз
            </button>
          )}
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <Input label="Код из письма" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} {...codeInputProps} autoFocus />
        {note && <p className="t-caption text-muted">{note}</p>}
        {error && (
          <p className="t-caption text-ember-text" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy}>
          Подтвердить
        </Button>
      </form>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const { confirmReset, requestReset } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, startCooldown] = useCooldown();

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestReset(email);
      setSent(true);
      startCooldown();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await confirmReset({ email, code, password });
      haptic('success');
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      haptic('error');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const errorNote = error && (
    <p className="t-caption text-ember-text" role="alert">
      {error}
    </p>
  );

  return (
    <AuthFrame
      title="Смена пароля"
      lead={sent ? `Если аккаунт с почтой ${email} есть, код уже в пути. Введите его и новый пароль.` : 'Пришлём код на почту, с которой вы регистрировались.'}
      footer={
        <p>
          Вспомнили?{' '}
          <Link to="/login" className="link">
            Войти
          </Link>
          {sent && (
            <>
              {' · '}
              {left > 0 ? (
                <span className="text-muted">новый код через {left} с</span>
              ) : (
                <button type="button" className="link" onClick={() => send()}>
                  отправить код ещё раз
                </button>
              )}
            </>
          )}
        </p>
      }
    >
      {!sent ? (
        <form className="flex flex-col gap-5" onSubmit={send}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          {errorNote}
          <Button type="submit" loading={busy}>
            Получить код
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={confirm}>
          <Input label="Код из письма" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} {...codeInputProps} autoFocus />
          <Input
            label="Новый пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            hint="Минимум 8 символов"
          />
          {errorNote}
          <Button type="submit" loading={busy}>
            Сменить пароль и войти
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
