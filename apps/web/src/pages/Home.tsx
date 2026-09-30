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
import { SketchArrow, SketchSpiral, SketchSquiggle, SketchStar } from '../components/Sketch';
import { ButtonLink, Monogram, SectionTitle, Skeleton } from '../components/ui';
import type { GroupCard as Group, Lesson } from '../lib/types';

export default function Home() {
  return isMiniApp ? <MiniHome /> : <Landing />;
}

function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: () => api<{ groups: Group[] }>('/groups').then((r) => r.groups) });
}

function Landing() {
  const { user } = useAuth();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const groups = useGroups();
  const school = subjects.data?.filter((s) => s.audience !== 'STUDENTS') ?? [];
  const uni = subjects.data?.filter((s) => s.audience !== 'SCHOOL') ?? [];

  return (
    <>
      {/* Hero: луч → призма → предметы */}
      <Container className="relative grid items-center gap-10 pt-12 pb-10 md:grid-cols-[1.2fr_1fr] md:pt-20 md:pb-16">
        <SketchStar className="absolute top-6 right-[46%] hidden size-12 md:block" />
        <SketchSpiral className="absolute bottom-0 left-[38%] hidden size-16 lg:block" />
        <div className="relative flex flex-col gap-7">
          <h1 className="t-display t-xl">
            Разложим любой предмет на <mark>понятные части</mark>
          </h1>
          <p className="t-sub max-w-[36ch]">
            Занятия с репетитором онлайн: школьная программа, ОГЭ и ЕГЭ, вузовская математика и физика. Один на один или в мини-группе.
          </p>
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <ButtonLink to="/book" className="min-h-14 px-8">
                <ArrowRight className="size-4" strokeWidth={2} /> Записаться на занятие
              </ButtonLink>
              <ButtonLink to="/teachers" variant="secondary" className="min-h-14 px-6">
                Выбрать преподавателя
              </ButtonLink>
            </div>
            <p className="t-caption text-muted">Заявку можно оставить без регистрации.</p>
          </div>
          <SketchArrow className="absolute -bottom-16 left-[52%] hidden w-28 rotate-6 md:block" />
        </div>
        <div className="md:pl-4">
          {subjects.data ? <PrismHero subjects={subjects.data} /> : <Skeleton className="aspect-[5/3]" />}
        </div>
      </Container>

      {/* Как проходят занятия — газетные колонки с буквицей */}
      <Container className="py-6">
        <h2 className="t-display t-lg mb-8 max-w-[18ch]">Как проходят <mark>занятия</mark></h2>
        <div className="grid gap-8 md:grid-cols-3 md:gap-5">
          <div className="rounded-[16px] border border-ink p-6">
            <p className="t-mono mb-4 text-muted">шаг 1</p>
            <h3 className="t-heading mb-2 text-[24px]">Запись</h3>
            <p className="text-[17px] leading-[1.5]">
              Оставляете заявку на сайте или прямо в Telegram и ВКонтакте. Администратор подбирает преподавателя под класс или курс, цель и удобное время.
            </p>
          </div>
          <div className="rounded-[16px] border border-ink p-6">
            <p className="t-mono mb-4 text-muted">шаг 2</p>
            <h3 className="t-heading mb-2 text-[24px]">Занятие</h3>
            <p className="text-[17px] leading-[1.45]">
              Урок идёт по видеосвязи. Ссылка появляется в карточке занятия в личном кабинете, так что искать её в переписке не придётся.
            </p>
          </div>
          <div className="rounded-[16px] border border-ink p-6">
            <p className="t-mono mb-4 text-muted">шаг 3</p>
            <h3 className="t-heading mb-2 text-[24px]">Всё в одном месте</h3>
            <p className="text-[17px] leading-[1.45]">
              Расписание, заявка на перенос и связь с поддержкой — в кабинете. Он одинаково открывается с сайта и из мессенджеров.
            </p>
          </div>
        </div>
      </Container>

      {/* Преподаватели */}
      <Container className="py-16">
        <SectionTitle
          action={
            <Link to="/teachers" className="link inline-flex items-center gap-1.5 text-[17px]">
              Все преподаватели <ArrowRight className="size-4" strokeWidth={1.7} />
            </Link>
          }
        >
          Преподаватели
        </SectionTitle>
        <Rail>
          {teachers.data
            ? teachers.data.slice(0, 6).map((t) => <TeacherCard key={t.id} t={t} className="h-full" />)
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[420px]" />)}
        </Rail>
      </Container>

      {/* Школьникам / Студентам — цветные блоки */}
      <Container className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="hue-2 rounded-[16px] bg-tint p-6 sm:p-10">
          <h2 className="t-display t-lg mb-3">Школьникам</h2>
          <p className="mb-6 max-w-[42ch] text-[17px] text-ink/80">Закрыть пробелы, подтянуть оценки, спокойно сдать ОГЭ и ЕГЭ.</p>
          <div className="border-t border-[color-mix(in_oklab,var(--i)_45%,transparent)]">
            {school.map((s) => (
              <SubjectRow key={s.id} s={s} />
            ))}
          </div>
        </section>
        <section className="hue-6 rounded-[16px] bg-tint p-6 sm:p-10">
          <h2 className="t-display t-lg mb-3">Студентам</h2>
          <p className="mb-6 max-w-[42ch] text-[17px] text-ink/80">Разобраться в теории, решить домашние и закрыть сессию. Скоро — курсы от университета.</p>
          <div className="border-t border-[color-mix(in_oklab,var(--i)_45%,transparent)]">
            {uni.map((s) => (
              <SubjectRow key={s.id} s={s} />
            ))}
          </div>
        </section>
      </Container>

      {/* Группы */}
      <Container className="py-16">
        <SectionTitle
          action={
            <Link to="/groups" className="link inline-flex items-center gap-1.5 text-[17px]">
              Все группы <ArrowRight className="size-4" strokeWidth={1.7} />
            </Link>
          }
        >
          Мини-группы
        </SectionTitle>
        <p className="mt-4 max-w-[60ch] text-[17px] text-muted">
          До восьми человек, один преподаватель, постоянное расписание. У каждой группы есть свой профиль с фотографиями.
        </p>
        <Rail>
          {groups.data
            ? groups.data.slice(0, 3).map((g) => <GroupCard key={g.id} g={g} />)
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72" />)}
        </Rail>
      </Container>

      {/* Мессенджеры */}
      <Container>
        <section className="hue-4 grid gap-8 rounded-[16px] bg-tint p-6 sm:p-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="t-display t-lg">Школа живёт и <mark>в мессенджере</mark></h2>
            <p className="max-w-[48ch] text-[17px] text-ink/85">
              Откройте «Спектр» как мини-приложение в Telegram или ВКонтакте. Там тот же кабинет: расписание, ссылки на уроки, перенос одним нажатием и поддержка.
            </p>
            <div className="flex flex-wrap gap-3">
              <MessengerLink href={import.meta.env.VITE_TELEGRAM_APP_URL} label="Открыть в Telegram" />
              <MessengerLink href={import.meta.env.VITE_VK_APP_URL} label="Открыть во ВКонтакте" />
            </div>
          </div>
          <ul className="m-0 grid list-none gap-0 p-0">
            {[
              { Icon: CalendarDays, text: 'Расписание на неделю вперёд' },
              { Icon: RefreshCcw, text: 'Заявка на перенос из карточки урока' },
              { Icon: LifeBuoy, text: 'Поддержка без поиска контактов' },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-4 border-b border-[color-mix(in_oklab,var(--i)_35%,transparent)] py-4 text-[18px] last:border-0">
                <Icon className="size-6 shrink-0 text-hue" strokeWidth={1.6} />
                {text}
              </li>
            ))}
          </ul>
        </section>
      </Container>

      {/* Запись — mint-стикер, без тёмных полос (правило DESIGN.md) */}
      <Container className="mt-16">
        <section id="book" className="hue-3 relative grid gap-10 overflow-hidden rounded-[16px] bg-tint p-6 sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:p-14">
          <SketchSquiggle className="absolute top-8 right-8 hidden w-40 md:block" />
          <div className="flex flex-col gap-5">
            <h2 className="t-display t-lg">
              Первое <mark>занятие</mark>
            </h2>
            <p className="t-sub max-w-[34ch]">Оставьте контакт — подберём преподавателя и время. Если уже есть аккаунт, заявка появится в кабинете.</p>
            {user && (
              <Link to={homeFor(user.role)} className="link w-fit text-[17px]">
                Перейти в кабинет
              </Link>
            )}
          </div>
          <div className="rounded-[16px] border border-ink bg-paper p-5 text-ink sm:p-8">
            <BookingForm compact />
          </div>
        </section>
      </Container>
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
      <span className="inline-flex min-h-12 items-center rounded-[6px] border border-dashed border-ink/50 px-5 text-[16px] text-ink/75" title="Ссылка появится после публикации мини-приложения">
        {label} — скоро
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center rounded-[6px] border border-ink px-5 text-[17px] no-underline hover:bg-ink hover:text-paper">
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
          <span className="t-display text-[22px] tracking-[0.02em]">Спектр</span>
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
            <div className="hue-2 flex flex-col items-start gap-3 rounded-[16px] bg-tint p-5">
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
              <Link key={q.to} to={q.to} className="press flex min-h-20 flex-col justify-between rounded-[16px] border border-ink/20 bg-paper p-3 no-underline">
                <span className="t-heading tnum text-[26px]">{q.n ?? '—'}</span>
                <span className="text-[14px] leading-tight">{q.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <h1 className="t-display text-[38px]">Разложим любой предмет на <mark>понятные части</mark></h1>
          {subjects.data && <PrismHero subjects={subjects.data} />}
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
        <div>{subjects.data?.map((s) => <SubjectRow key={s.id} s={s} />)}</div>
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
