import type React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, LifeBuoy, RefreshCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isMiniApp } from '../lib/platform';
import { Container, homeFor } from '../components/Layout';
import { PrismHero } from '../components/PrismHero';
import { BookingForm, useSubjects, useTeachers } from '../components/BookingForm';
import { GroupCard, SubjectRow, TeacherCard } from '../components/Cards';
import { NextLesson } from '../components/LessonCards';
import { LogoMark } from '../components/Logo';
import { OverprintCircles, RegCorners, SpectrumBar } from '../components/Print';
import clsx from 'clsx';
import { ButtonLink, Monogram, SectionTitle, Skeleton } from '../components/ui';
import type { GroupCard as Group, Lesson } from '../lib/types';

export default function Home() {
  return isMiniApp ? <MiniHome /> : <Landing />;
}

function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: () => api<{ groups: Group[] }>('/groups').then((r) => r.groups) });
}

const CONTENTS = [
  { n: '01', title: 'Преподаватели', text: 'Кто ведёт занятия', to: '/teachers' },
  { n: '02', title: 'Предметы', text: 'Школа и вуз', to: '/subjects' },
  { n: '03', title: 'Мини-группы', text: 'До восьми человек', to: '/groups' },
  { n: '04', title: 'Первое занятие', text: 'Оставить заявку', to: '#book' },
];

const STEPS = [
  {
    hue: 0,
    title: 'Запись',
    text: 'Оставляете заявку на сайте или прямо в Telegram и ВКонтакте. Администратор подбирает преподавателя под класс или курс, цель и удобное время.',
  },
  {
    hue: 3,
    title: 'Занятие',
    text: 'Урок идёт по видеосвязи. Ссылка появляется в карточке занятия в личном кабинете, так что искать её в переписке не придётся.',
  },
  {
    hue: 5,
    title: 'Всё в одном месте',
    text: 'Расписание, заявка на перенос и связь с поддержкой — в кабинете. Он одинаково открывается с сайта и из мессенджеров.',
  },
];

function Landing() {
  const { user } = useAuth();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const groups = useGroups();
  const school = subjects.data?.filter((s) => s.audience !== 'STUDENTS') ?? [];
  const uni = subjects.data?.filter((s) => s.audience !== 'SCHOOL') ?? [];

  return (
    <>
      {/* Первая полоса: заголовок слева, Рис. 1 справа */}
      <Container className="grid items-center gap-10 pt-10 pb-12 md:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-16 [&>*]:min-w-0">
        <div className="flex flex-col gap-7">
          <p className="t-mono flex items-center gap-2.5 text-muted">
            <span className="inline-block h-2.5 w-10" style={{ background: 'var(--spectrum)' }} aria-hidden="true" />
            Занятия с репетитором онлайн
          </p>
          <h1 className="t-display t-xl">
            Разложим любой предмет на <mark>понятные части</mark>
          </h1>
          <p className="t-sub max-w-[36ch]">
            Школьная программа, ОГЭ и ЕГЭ, вузовская математика и физика. Один на один или в мини-группе, с расписанием, ссылками на уроки и поддержкой в одном кабинете.
          </p>
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <ButtonLink to="/book" className="min-h-14 px-7">
                Записаться на занятие <ArrowRight className="size-4" strokeWidth={2.2} />
              </ButtonLink>
              <ButtonLink to="/teachers" variant="secondary" className="min-h-14 px-6">
                Выбрать преподавателя
              </ButtonLink>
            </div>
            <p className="t-caption text-muted">Заявку можно оставить без регистрации.</p>
          </div>
        </div>
        <div>{subjects.data ? <PrismHero subjects={subjects.data} /> : <Skeleton className="aspect-[5/3]" />}</div>
      </Container>

      {/* Оглавление выпуска */}
      <Container>
        <nav aria-label="Оглавление" className="rule-thick border-b border-hair">
          <ul className="m-0 grid list-none grid-cols-2 p-0 lg:grid-cols-4">
            {CONTENTS.map((c, i) => {
              const inner = (
                <>
                  <span className="t-mono flex items-center gap-2 text-[11px] text-muted">
                    <span className="inline-block size-2" style={{ background: `var(--ray-${i * 2})` }} aria-hidden="true" />
                    {c.n}
                  </span>
                  <span className="t-heading mt-2 block text-[22px] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4 sm:text-[26px]">{c.title}</span>
                  <span className="mt-1 block text-[14px] text-muted">{c.text}</span>
                </>
              );
              const cls = clsx(
                'group block py-5 pr-4 no-underline lg:pl-6',
                i === 0 && 'lg:pl-0',
                i % 2 === 1 && 'pl-4 border-l border-hair-soft lg:pl-6',
                i > 0 && 'lg:border-l lg:border-hair-soft',
                i >= 2 && 'border-t border-hair-soft lg:border-t-0',
              );
              return (
                <li key={c.n}>
                  {c.to.startsWith('#') ? (
                    <a href={c.to} className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <Link to={c.to} className={cls}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </Container>

      {/* Как проходят занятия — три колонки с линейками */}
      <Container className="pt-20">
        <SectionTitle>Как проходят занятия</SectionTitle>
        <div className="grid gap-10 pt-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-[var(--hair-soft)]">
          {STEPS.map((s, i) => (
            <div key={s.title} className={clsx(`hue-${s.hue}`, 'flex flex-col gap-3', i > 0 && 'md:pl-8', i < 2 && 'md:pr-8')}>
              <p className="t-display text-[76px] leading-[0.8] font-[800] text-ray italic">{i + 1}</p>
              <h3 className="t-heading text-[26px]">{s.title}</h3>
              <p className="text-[17px] leading-[1.55] text-ink/85">{s.text}</p>
            </div>
          ))}
        </div>
      </Container>

      {/* Преподаватели */}
      <Container className="pt-20">
        <SectionTitle
          action={
            <Link to="/teachers" className="link inline-flex items-center gap-1.5 text-[16px] font-[500]">
              Все преподаватели <ArrowRight className="size-4" strokeWidth={1.8} />
            </Link>
          }
        >
          Преподаватели
        </SectionTitle>
        <Rail>
          {teachers.data
            ? teachers.data.slice(0, 6).map((t) => <TeacherCard key={t.id} t={t} className="h-full" />)
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[440px]" />)}
        </Rail>
      </Container>

      {/* Предметы: школьникам | студентам */}
      <Container className="pt-20">
        <SectionTitle
          action={
            <Link to="/subjects" className="link inline-flex items-center gap-1.5 text-[16px] font-[500]">
              Все предметы <ArrowRight className="size-4" strokeWidth={1.8} />
            </Link>
          }
        >
          Предметы
        </SectionTitle>
        <div className="grid gap-12 pt-8 lg:grid-cols-2 lg:gap-0 [&>*]:min-w-0">
          <section className="lg:pr-12">
            <h3 className="t-display mb-2 text-[38px]">Школьникам</h3>
            <p className="t-sub mb-5 max-w-[40ch] text-[18px] text-muted">Закрыть пробелы, подтянуть оценки, спокойно сдать ОГЭ и ЕГЭ.</p>
            <div className="border-t border-hair">
              {school.map((s, i) => (
                <SubjectRow key={s.id} s={s} index={i + 1} />
              ))}
            </div>
          </section>
          <section className="lg:border-l lg:border-hair-soft lg:pl-12">
            <h3 className="t-display mb-2 text-[38px]">Студентам</h3>
            <p className="t-sub mb-5 max-w-[40ch] text-[18px] text-muted">Разобраться в теории, решить домашние и закрыть сессию. Скоро — курсы от университета.</p>
            <div className="border-t border-hair">
              {uni.map((s, i) => (
                <SubjectRow key={s.id} s={s} index={i + 1} />
              ))}
            </div>
          </section>
        </div>
      </Container>

      {/* Группы */}
      <Container className="pt-20">
        <SectionTitle
          action={
            <Link to="/groups" className="link inline-flex items-center gap-1.5 text-[16px] font-[500]">
              Все группы <ArrowRight className="size-4" strokeWidth={1.8} />
            </Link>
          }
        >
          Мини-группы
        </SectionTitle>
        <p className="t-sub mt-5 max-w-[56ch] text-muted">
          До восьми человек, один преподаватель, постоянное расписание. У каждой группы есть свой профиль с фотографиями.
        </p>
        <Rail>
          {groups.data
            ? groups.data.slice(0, 3).map((g) => <GroupCard key={g.id} g={g} />)
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72" />)}
        </Rail>
      </Container>

      {/* Плашка 1 — ультрамарин: мессенджеры */}
      <section className="relative mt-24 overflow-hidden bg-plate-blue text-white [&_mark]:text-[#ffd21f]">
        <SpectrumBar />
        <OverprintCircles a="#ff5a8a" b="#19c3d6" blend="screen" className="absolute -right-24 -bottom-24 hidden w-[520px] opacity-80 md:block" />
        <Container className="relative grid gap-10 py-16 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="flex flex-col gap-5">
            <p className="t-mono text-white/80">Telegram · ВКонтакте</p>
            <h2 className="t-display t-lg">
              Школа живёт и <mark>в мессенджере</mark>
            </h2>
            <p className="t-sub max-w-[44ch] text-white/90">
              Откройте «Спектр» как мини-приложение: тот же кабинет, расписание, ссылки на уроки, перенос одним нажатием и поддержка.
            </p>
            <div className="flex flex-wrap gap-3">
              <MessengerLink href={import.meta.env.VITE_TELEGRAM_APP_URL} label="Открыть в Telegram" />
              <MessengerLink href={import.meta.env.VITE_VK_APP_URL} label="Открыть во ВКонтакте" />
            </div>
          </div>
          <ul className="m-0 grid list-none p-0">
            {[
              { Icon: CalendarDays, text: 'Расписание на неделю вперёд' },
              { Icon: RefreshCcw, text: 'Заявка на перенос из карточки урока' },
              { Icon: LifeBuoy, text: 'Поддержка без поиска контактов' },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-4 border-b border-white/30 py-4 text-[18px] first:border-t">
                <Icon className="size-6 shrink-0" strokeWidth={1.6} />
                {text}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Плашка 2 — подсолнух: запись */}
      <section id="book" className="relative mt-16 overflow-hidden bg-mark text-on-mark [&_mark]:text-[#b8391f]">
        <OverprintCircles a="var(--ray-0)" b="var(--ray-5)" className="absolute -top-20 -right-28 hidden w-[460px] lg:block" />
        <RegCorners className="text-[#1c1b33]/70" />
        <Container className="relative grid gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div className="flex flex-col gap-5">
            <p className="t-mono">Заявка без регистрации</p>
            <h2 className="t-display t-lg">
              Первое <mark>занятие</mark>
            </h2>
            <p className="t-sub max-w-[34ch]">Оставьте контакт — подберём преподавателя и время. Если аккаунт уже есть, заявка появится в кабинете.</p>
            {user && (
              <Link to={homeFor(user.role)} className="link w-fit text-[17px] font-[500]">
                Перейти в кабинет
              </Link>
            )}
          </div>
          <div className="border border-[#1c1b33] bg-paper p-5 text-ink shadow-[7px_7px_0_#1c1b33] sm:p-8">
            <BookingForm compact />
          </div>
        </Container>
      </section>
    </>
  );
}

/** На телефоне — горизонтальная лента с прокруткой, на планшете и шире — сетка */
function Rail({ children }: { children: React.ReactNode[] }) {
  return (
    <ul className="-mx-4 mt-8 flex list-none snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children.map((c, i) => (
        <li key={i} className="w-[78%] shrink-0 snap-start sm:w-auto">
          {c}
        </li>
      ))}
    </ul>
  );
}

function MessengerLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return (
      <span className="inline-flex min-h-12 items-center rounded-ctl border border-dashed border-white/60 px-5 text-[15px] font-[500] text-white/85" title="Ссылка появится после публикации мини-приложения">
        {label} — скоро
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center rounded-ctl border-[1.5px] border-white px-5 text-[15px] font-[600] text-white no-underline hover:bg-white hover:text-plate-blue">
      {label}
    </a>
  );
}

// ——— Главная внутри Telegram / VK ———
function MiniHome() {
  const { user, loading } = useAuth();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<{ next: Lesson | null; upcomingCount: number; pendingRequests: number; openTickets: number }>('/me/overview'),
    enabled: Boolean(user),
  });
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  return (
    <div className="flex flex-col gap-8 px-4 pt-5">
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <LogoMark className="h-7 w-9 text-ink" title="" />
          <span className="t-display text-[24px] tracking-[-0.03em]">Спектр</span>
        </span>
        {user && <Monogram name={user.name} hue={5} photoUrl={user.avatarUrl} size="sm" className="rounded-full" />}
      </header>

      {loading ? (
        <Skeleton className="h-64" />
      ) : user ? (
        <section className="flex flex-col gap-4">
          <h1 className="t-display text-[34px]">
            {greet}, {user.name.split(' ')[0]}
          </h1>
          {overview.data?.next ? (
            <NextLesson lesson={overview.data.next} />
          ) : overview.isPending ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="hue-2 flex flex-col items-start gap-3 rounded-card bg-tint p-5">
              <p className="t-heading text-[26px]">Занятий пока нет</p>
              <p className="text-[16px]">Запишитесь — администратор подберёт преподавателя и поставит урок в расписание.</p>
              <ButtonLink to="/book">Записаться</ButtonLink>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { to: '/app/schedule', label: 'Расписание', n: overview.data?.upcomingCount },
              { to: '/app/requests', label: 'Переносы', n: overview.data?.pendingRequests },
              { to: '/app/support', label: 'Поддержка', n: overview.data?.openTickets },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="press flex min-h-20 flex-col justify-between rounded-card border border-ink/20 bg-paper p-3 no-underline">
                <span className="t-heading tnum text-[26px]">{q.n ?? '—'}</span>
                <span className="text-[14px] leading-tight">{q.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <h1 className="t-display text-[38px]">Разложим любой предмет на <mark>понятные части</mark></h1>
          {subjects.data && <PrismHero subjects={subjects.data} caption={false} />}
          <div className="flex flex-col gap-3">
            <ButtonLink to="/book">Записаться на занятие</ButtonLink>
            <ButtonLink to="/login" variant="secondary">
              Войти в кабинет
            </ButtonLink>
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Предметы</SectionTitle>
        <div>{subjects.data?.map((s, i) => <SubjectRow key={s.id} s={s} index={i + 1} />)}</div>
      </section>

      <section className="pb-4">
        <SectionTitle
          action={
            <Link to="/teachers" className="link text-[16px]">
              Все
            </Link>
          }
        >
          Преподаватели
        </SectionTitle>
        <ul className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 list-none gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {teachers.data?.map((t) => (
            <li key={t.id} className="w-[72%] shrink-0 snap-start">
              <TeacherCard t={t} className="h-full" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
