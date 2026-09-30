import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import clsx from 'clsx';
import { CalendarDays, Home, Menu, UserRound, UsersRound, X } from 'lucide-react';
import { Logo } from './Logo';
import { PencilBuddy } from './Doodles';
import { Avatar, ButtonLink, Loading } from './ui';
import { useAuth } from '../lib/auth';
import { isMiniApp, setTelegramBack } from '../lib/platform';
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
  return (
    <>
      <Outlet />
      {__DEMO__ && <DemoBar />}
    </>
  );
}

/** Панель демо-версии: быстрый вход под любой ролью, чтобы посмотреть все кабинеты. */
function DemoBar() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const as = async (email: string, password: string) => {
    const u = await login(email, password);
    setOpen(false);
    navigate(homeFor(u.role));
  };
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2 print:hidden" style={{ bottom: isMiniApp ? 84 : undefined }}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="flex w-[260px] flex-col gap-1 rounded-[12px] border-[1.5px] border-forest/15 bg-paper p-2 text-ink shadow-sticker"
          >
            <p className="t-mono px-2 pt-1 pb-1.5 text-[11px] text-muted">войти в демо как</p>
            {[
              ['Ученица', 'student@spectr.school', 'spectr-student'],
              ['Преподаватель', 'anna@spectr.school', 'spectr-teacher'],
              ['Администратор', 'admin@spectr.school', 'spectr-admin'],
            ].map(([label, e, p]) => (
              <button key={e} className="press rounded-full px-3 py-2 text-left text-[14px] hover:bg-mark hover:text-forest" onClick={() => as(e, p)}>
                {label}
              </button>
            ))}
            {user && (
              <button
                className="press rounded-full px-3 py-2 text-left text-[14px] text-muted hover:bg-ink/[0.06]"
                onClick={() => {
                  logout();
                  setOpen(false);
                  navigate('/');
                }}
              >
                Выйти
              </button>
            )}
            <p className="px-2 pt-1 pb-1 text-[12px] leading-snug text-muted">Демо без сервера: изменения живут до перезагрузки страницы.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="press t-mono flex h-10 items-center gap-2 rounded-full bg-forest px-4 text-[12px] text-mark shadow-sticker hover:-translate-y-0.5"
      >
        демо{user ? ` · ${user.name.split(' ')[0]}` : ''}
      </button>
    </div>
  );
}

/** Плавный переход между страницами: новая страница всплывает на пружине. */
function PageTransition() {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
      <Outlet />
    </motion.div>
  );
}

/** Тонкая полоса спектра вверху: растёт по мере прокрутки. */
function ScrollBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });
  return <motion.div className="spectrum-bar fixed inset-x-0 top-0 z-50 h-[3px] origin-left" style={{ scaleX }} aria-hidden="true" />;
}

// ——— Сайт ———
export function SiteLayout() {
  if (isMiniApp) return <MiniLayout />;
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollBar />
      <SiteHeader />
      <main className="flex-1">
        <PageTransition />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div
        className={clsx(
          'mx-auto flex h-[64px] max-w-[1120px] items-center justify-between gap-4 rounded-[14px] border-[1.5px] border-dashed px-3 transition-[background-color,box-shadow,border-color] duration-300 sm:px-4',
          scrolled ? 'border-ink/25 bg-paper/97 shadow-card backdrop-blur-md' : 'border-ink/15 bg-paper/90 backdrop-blur-sm',
        )}
      >
        <Link to="/" className="no-underline" aria-label="Спектр — на главную">
          <Logo />
        </Link>
        <nav aria-label="Разделы" className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  'press rounded-full px-3.5 py-2 text-[14px] font-[560] no-underline',
                  isActive ? 'bg-mark text-forest' : 'hover:bg-ink/[0.06]',
                )
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
                <ButtonLink to="/login" variant="secondary" className="min-h-10 border px-4 text-[14px]">
                  Войти
                </ButtonLink>
              </span>
              <span className="hidden md:block">
                <ButtonLink to="/book" className="min-h-10 px-4 text-[14px]">
                  Записаться <span aria-hidden="true">→</span>
                </ButtonLink>
              </span>
            </>
          )}
          <button
            className="press grid size-11 place-items-center rounded-full hover:bg-ink/[0.06] lg:hidden"
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
      <div className="flex h-[76px] items-center justify-between border-b border-dashed border-hair-soft px-5">
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
            <NavLink to={n.to} className={({ isActive }) => clsx('t-display block border-b border-dashed border-hair-soft py-3 text-[38px] no-underline', isActive && '[&>span]:bg-mark')}>
              <span className="rounded-md px-1">{n.label}</span>
            </NavLink>
          </motion.div>
        ))}
      </nav>
    </motion.div>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-28 bg-forest-2 text-cream">
      <div className="relative mx-auto grid max-w-[1120px] gap-10 px-5 pt-16 pb-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <PencilBuddy className="pointer-events-none absolute -top-[150px] right-6 hidden w-[120px] text-cream md:block" />
        <div className="flex flex-col gap-4">
          <Logo inverse />
          <p className="max-w-[38ch] text-[16px] text-cream/80">
            Онлайн-школа занятий с репетитором. Школьная программа, ОГЭ и ЕГЭ, вузовская математика и физика.
          </p>
          <ButtonLink to="/book" variant="banner" className="mt-2 w-fit">
            Записаться на занятие <span aria-hidden="true">→</span>
          </ButtonLink>
        </div>
        <nav className="flex flex-col gap-2.5" aria-label="Разделы сайта">
          <p className="t-mono mb-1 text-mark">школа</p>
          {PUBLIC_NAV.map((n) => (
            <Link key={n.to} to={n.to} className="link w-fit">
              {n.label}
            </Link>
          ))}
          <Link to="/book" className="link w-fit">
            Записаться на занятие
          </Link>
        </nav>
        <div className="flex flex-col gap-2.5">
          <p className="t-mono mb-1 text-mark">ученикам</p>
          <Link to="/app" className="link w-fit">
            Личный кабинет
          </Link>
          <Link to="/app/support" className="link w-fit">
            Поддержка
          </Link>
        </div>
      </div>
      <div className="border-t border-dashed border-cream/20">
        <p className="t-mono mx-auto max-w-[1120px] px-5 py-5 text-[11px] text-cream/60 sm:px-8">© {new Date().getFullYear()} Спектр · разложим любой предмет на понятные части</p>
      </div>
    </footer>
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-dashed border-hair-soft bg-paper/95 backdrop-blur-md"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={label}>
            <NavLink to={to} end={end} className="group relative flex h-16 flex-col items-center justify-center gap-1 no-underline">
              {({ isActive }) => (
                <>
                  <span className={clsx('grid h-8 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-mark text-forest')}>
                    <Icon className={clsx('size-[21px]', isActive ? '' : 'text-muted')} strokeWidth={isActive ? 2 : 1.6} />
                  </span>
                  <span className={clsx('text-[12px] leading-none', isActive ? 'font-[500] text-ink' : 'text-muted')}>{label}</span>
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
        <header className="sticky top-0 z-30 border-b border-dashed border-hair-soft bg-paper/90 backdrop-blur-md">
          <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
            <Link to="/" className="no-underline" aria-label="На главную">
              <Logo compact />
            </Link>
            <div className="flex items-center gap-4">
              <span className="hidden items-center gap-2 text-[15px] text-muted sm:inline-flex">
                <Avatar name={user.name} url={user.avatarUrl} className="size-8 text-[12px]" />
                {user.name}
              </span>
              <button className="link text-[16px]" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
        </header>
      )}
      {/* мобильная навигация по разделам кабинета */}
      <nav aria-label="Разделы кабинета" className="sticky top-0 z-20 border-b border-dashed border-hair-soft bg-paper/95 backdrop-blur-md lg:hidden" style={isMiniApp ? undefined : { top: 68 }}>
        <ul className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
          {flat.map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  clsx('press block rounded-full px-3.5 py-2 text-[14px] font-[500] leading-none whitespace-nowrap no-underline', isActive ? 'bg-mark text-forest' : 'text-ink hover:bg-ink/[0.06]')
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
                <p className="t-mono mb-2 px-3 text-muted">{s.title.toLowerCase()}</p>
                {s.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      clsx('press my-0.5 rounded-full px-3 py-2 text-[15px] no-underline', isActive ? 'bg-mark font-[600] text-forest' : 'text-muted hover:bg-ink/[0.06] hover:text-ink')
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
          <PageTransition />
        </div>
      </div>
      {isMiniApp && <BottomTabs />}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1200px] px-4 sm:px-8', className)}>{children}</div>;
}
