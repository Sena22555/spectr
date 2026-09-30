import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { CalendarDays, Home, Menu, UserRound, UsersRound, X, Moon, Sun, MonitorSmartphone } from 'lucide-react';
import { Logo } from './Logo';
import { ButtonLink, Loading } from './ui';
import { useAuth } from '../lib/auth';
import { isMiniApp, setTelegramBack, getThemePref, setThemePref, type ThemePref } from '../lib/platform';
import type { Role } from '../lib/types';

const PUBLIC_NAV = [
  { to: '/teachers', label: 'Преподаватели' },
  { to: '/subjects', label: 'Предметы' },
  { to: '/groups', label: 'Группы' },
];


/** Корневая оболочка: Telegram-«Назад», скролл наверх при переходе */
export function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
    const roots = ['/', '/app', '/app/schedule', '/teachers', '/teach', '/admin'];
    setTelegramBack(!roots.includes(location.pathname), () => navigate(-1));
  }, [location.pathname, navigate]);
  return <Outlet />;
}

// ——— Сайт ———
export function SiteLayout() {
  if (isMiniApp) return <MiniLayout />;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 rounded-[16px] border border-charcoal bg-paper pr-2 pl-4 shadow-[var(--shadow-glow)] sm:pr-3 sm:pl-5">
        <Link to="/" className="no-underline" aria-label="Спектр — на главную">
          <Logo />
        </Link>
        <nav aria-label="Разделы" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx('rounded-[6px] px-3 py-2 text-[15px] font-[500] no-underline transition-colors', isActive ? 'bg-mark text-[#1a3300]' : 'hover:bg-bone')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <span className="hidden sm:block">
              <ButtonLink to={homeFor(user.role)} className="min-h-10 px-4 text-[14px]">
                Кабинет
              </ButtonLink>
            </span>
          ) : (
            <>
              <span className="hidden sm:block">
                <ButtonLink to="/login" variant="secondary" className="min-h-10 px-4 text-[14px]">
                  Войти
                </ButtonLink>
              </span>
              <span className="hidden md:block">
                <ButtonLink to="/book" className="min-h-10 px-4 text-[14px]">
                  Записаться
                </ButtonLink>
              </span>
            </>
          )}
          <button
            className="press grid size-11 place-items-center rounded-[6px] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Открыть меню"
            aria-expanded={open}
          >
            <Menu className="size-6" strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <AnimatePresence>{open && <MobileMenu onClose={() => setOpen(false)} />}</AnimatePresence>
    </header>
  );
}

function MobileMenu({ onClose }: { onClose(): void }) {
  const { user } = useAuth();
  const items = [...PUBLIC_NAV, { to: '/book', label: 'Записаться' }, user ? { to: homeFor(user.role), label: 'Кабинет' } : { to: '/login', label: 'Войти' }];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Меню"
      className="fixed inset-0 z-40 flex flex-col bg-paper"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <div className="flex h-16 items-center justify-between border-b border-charcoal px-4">
        <Logo />
        <button className="press grid size-11 place-items-center rounded-full" onClick={onClose} aria-label="Закрыть меню">
          <X className="size-6" strokeWidth={1.6} />
        </button>
      </div>
      <nav className="flex flex-col px-4 pt-4" aria-label="Меню">
        {items.map((n, i) => (
          <motion.div
            key={n.to}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24, delay: 0.04 * i }}
          >
            <NavLink to={n.to} className="t-display block border-b border-hair-soft py-3 text-[40px] no-underline">
              {n.label}
            </NavLink>
          </motion.div>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <ThemeSwitch />
      </div>
    </motion.div>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-charcoal">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-[40ch] text-muted">
            Онлайн-школа занятий с репетитором. Школьная программа, ОГЭ и ЕГЭ, вузовская математика и физика.
          </p>
        </div>
        <nav className="flex flex-col gap-2" aria-label="Разделы сайта">
          <p className="t-caption text-muted">Школа</p>
          {PUBLIC_NAV.map((n) => (
            <Link key={n.to} to={n.to} className="link w-fit">
              {n.label}
            </Link>
          ))}
          <Link to="/book" className="link w-fit">
            Записаться на занятие
          </Link>
        </nav>
        <div className="flex flex-col gap-2">
          <p className="t-caption text-muted">Ученикам</p>
          <Link to="/app" className="link w-fit">
            Личный кабинет
          </Link>
          <Link to="/app/support" className="link w-fit">
            Поддержка
          </Link>
          <div className="mt-4">
            <ThemeSwitch />
          </div>
        </div>
      </div>
      <div className="border-t border-hair-soft">
        <p className="t-caption mx-auto max-w-[1200px] px-4 py-5 text-muted sm:px-8">© {new Date().getFullYear()} Спектр</p>
      </div>
    </footer>
  );
}

export function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  const options: { v: ThemePref; label: string; Icon: typeof Sun }[] = [
    { v: 'light', label: 'Светлая', Icon: Sun },
    { v: 'dark', label: 'Тёмная', Icon: Moon },
    { v: 'system', label: 'Как в системе', Icon: MonitorSmartphone },
  ];
  return (
    <div role="radiogroup" aria-label="Тема оформления" className="inline-flex rounded-[6px] border border-ink/40 p-0.5">
      {options.map(({ v, label, Icon }) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => {
            setThemePref(v);
            setPref(v);
          }}
          className={clsx('press grid h-9 w-11 place-items-center rounded-[4px]', pref === v ? 'bg-ink text-paper' : 'text-ink')}
        >
          <Icon className="size-4" strokeWidth={1.7} />
        </button>
      ))}
    </div>
  );
}

// ——— Мини-приложение: компактная шапка + нижние вкладки ———
function MiniLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="pb-safe flex-1">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}

export function BottomTabs() {
  const { user } = useAuth();
  const teacher = user && (user.role === 'TEACHER' || (user.role === 'ADMIN' && user.teacherId));
  const tabs = [
    { to: '/', label: 'Главная', Icon: Home, end: true },
    { to: teacher ? '/teach' : '/app/schedule', label: teacher ? 'Занятия' : 'Расписание', Icon: CalendarDays, end: false },
    { to: '/teachers', label: 'Преподаватели', Icon: UsersRound, end: false },
    { to: user ? '/app' : '/login', label: user ? 'Кабинет' : 'Войти', Icon: UserRound, end: true },
  ];
  return (
    <nav
      aria-label="Вкладки"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-charcoal bg-paper"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={label}>
            <NavLink to={to} end={end} className="group relative flex h-16 flex-col items-center justify-center gap-1 no-underline">
              {({ isActive }) => (
                <>
                  <Icon className={clsx('size-[22px]', isActive ? 'text-ink' : 'text-muted')} strokeWidth={isActive ? 2 : 1.6} />
                  <span className={clsx('text-[12px] leading-none', isActive ? 'font-[500] text-ink' : 'text-muted')}>{label}</span>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-[2px] w-10 bg-ink"
                      transition={{ duration: 0.4, ease: [0.65, 0, 0.35, 1] }}
                    />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ——— Кабинет ———
interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function homeFor(role: Role) {
  return role === 'ADMIN' ? '/admin' : role === 'TEACHER' ? '/teach' : '/app';
}

function sectionsFor(role: Role, hasTeacher: boolean) {
  const sections: { title: string; items: NavItem[] }[] = [];
  if (role === 'STUDENT') {
    sections.push({
      title: 'Учёба',
      items: [
        { to: '/app', label: 'Обзор', end: true },
        { to: '/app/schedule', label: 'Расписание' },
        { to: '/app/requests', label: 'Переносы' },
        { to: '/app/support', label: 'Поддержка' },
      ],
    });
  }
  if (role === 'TEACHER' || (role === 'ADMIN' && hasTeacher)) {
    sections.push({
      title: 'Преподавание',
      items: [
        { to: '/teach', label: 'Сегодня', end: true },
        { to: '/teach/lessons', label: 'Занятия' },
        { to: '/teach/students', label: 'Ученики' },
        { to: '/teach/requests', label: 'Переносы' },
        { to: '/teach/groups', label: 'Группы и фото' },
      ],
    });
  }
  if (role === 'ADMIN') {
    sections.push({
      title: 'Школа',
      items: [
        { to: '/admin', label: 'Сводка', end: true },
        { to: '/admin/bookings', label: 'Заявки на запись' },
        { to: '/admin/lessons', label: 'Расписание' },
        { to: '/admin/groups', label: 'Группы' },
        { to: '/admin/users', label: 'Люди и роли' },
        { to: '/admin/teachers', label: 'Преподаватели' },
        { to: '/admin/subjects', label: 'Предметы' },
        { to: '/admin/requests', label: 'Переносы' },
        { to: '/admin/tickets', label: 'Поддержка' },
      ],
    });
  }
  sections.push({ title: 'Аккаунт', items: [{ to: '/app/profile', label: 'Профиль' }] });
  return sections;
}

export function AppLayout({ roles }: { roles?: Role[] }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Loading />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;

  const sections = sectionsFor(user.role, Boolean(user.teacherId));
  const flat = sections.flatMap((s) => s.items);

  return (
    <div className="flex min-h-dvh flex-col">
      {!isMiniApp && (
        <header className="sticky top-0 z-30 border-b border-charcoal bg-paper">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
            <Link to="/" className="no-underline" aria-label="На главную">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-4">
              <span className="hidden text-[16px] text-muted sm:inline">{user.name}</span>
              <button className="link text-[16px]" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
        </header>
      )}
      {/* мобильная навигация по разделам кабинета */}
      <nav aria-label="Разделы кабинета" className="sticky top-0 z-20 border-b border-hair-soft bg-paper lg:hidden" style={isMiniApp ? undefined : { top: 64 }}>
        <ul className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {flat.map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx('press block rounded-full px-3.5 py-2 text-[14px] font-[500] leading-none whitespace-nowrap no-underline', isActive ? 'bg-mark text-[#1a3300]' : 'text-ink')
                }
              >
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className={clsx('mx-auto grid w-full max-w-[1200px] flex-1 gap-10 px-4 pt-6 sm:px-8 lg:grid-cols-[220px_1fr] lg:pt-10', isMiniApp ? 'pb-safe' : 'pb-20')}>
        <aside className="hidden lg:block">
          <nav aria-label="Разделы кабинета" className="sticky top-24 flex flex-col gap-8">
            {sections.map((s) => (
              <div key={s.title} className="flex flex-col">
                <p className="t-mono mb-2 px-2.5 text-muted uppercase">{s.title}</p>
                {s.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      clsx('my-0.5 rounded-[6px] px-2.5 py-2 text-[15px] no-underline transition-colors', isActive ? 'bg-mark font-[600] text-[#1a3300]' : 'text-muted hover:bg-bone hover:text-ink')
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
      {isMiniApp && <BottomTabs />}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1200px] px-4 sm:px-8', className)}>{children}</div>;
}
