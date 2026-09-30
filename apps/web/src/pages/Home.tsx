import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useScroll, useTransform, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  Check,
  LifeBuoy,
  MessageCircle,
  Mic,
  MonitorUp,
  Phone,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Video,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isMiniApp } from '../lib/platform';
import { Container, homeFor } from '../components/Layout';
import { PrismHero } from '../components/PrismHero';
import { BookingForm, useSubjects, useTeachers } from '../components/BookingForm';
import { GroupCard, SubjectRow, TeacherCard } from '../components/Cards';
import { NextLesson } from '../components/LessonCards';
import { LogoMark } from '../components/Logo';
import { Reveal } from '../components/Reveal';
import {
  ArrowDoodle,
  BackpackDoodle,
  Blob,
  CalendarDoodle,
  CapDoodle,
  DeskScene,
  DuoDoodle,
  GroupDoodle,
  LaptopDoodle,
  PaperDoodle,
  PencilDoodle,
  PhoneDoodle,
  PlaneDoodle,
  TargetDoodle,
} from '../components/Doodles';
import { ButtonLink, Chip, Monogram, SectionTitle, Skeleton, Squiggle } from '../components/ui';
import type { GroupCard as Group, Lesson } from '../lib/types';

export default function Home() {
  return isMiniApp ? <MiniHome /> : <Landing />;
}

function useGroups() {
  return useQuery({ queryKey: ['groups'], queryFn: () => api<{ groups: Group[] }>('/groups').then((r) => r.groups) });
}

const FLOW = [
  { Doodle: PhoneDoodle, label: 'заявка', title: 'Оставляете заявку', text: 'На сайте, в Telegram или во ВКонтакте. Регистрация не нужна.' },
  { Doodle: CalendarDoodle, label: 'подбор', title: 'Подбираем время', text: 'Администратор находит преподавателя под класс или курс, цель и удобное время.' },
  { Doodle: LaptopDoodle, label: 'урок', title: 'Занимаетесь', text: 'Урок по видеосвязи. Ссылка — в карточке занятия в кабинете.' },
];

const AUDIENCE = [
  { hue: 2, Doodle: BackpackDoodle, label: 'школьникам', title: 'Школьникам', text: 'Закрыть пробелы, подтянуть оценки, спокойно сдать ОГЭ и ЕГЭ.', rot: -5 },
  { hue: 6, Doodle: CapDoodle, label: 'студентам', title: 'Студентам', text: 'Разобраться в теории, решить домашние и закрыть сессию. Скоро — курсы от университета.', rot: 6 },
  { hue: 4, Doodle: GroupDoodle, label: 'мини-группы', title: 'Мини-группы', text: 'До восьми человек, один преподаватель, постоянное расписание и профиль группы с фото.', rot: 5 },
  { hue: 3, Doodle: DuoDoodle, label: 'один на один', title: 'Индивидуально', text: 'Свой темп и свой план: преподаватель занимается только с вами.', rot: -4 },
];

const FAQ = [
  {
    q: 'Можно записаться без регистрации?',
    a: 'Да. Оставьте имя и контакт в форме записи — администратор свяжется, подберёт преподавателя и время. Аккаунт понадобится позже, чтобы видеть расписание и ссылки на уроки.',
  },
  {
    q: 'Как проходит занятие?',
    a: 'По видеосвязи. Ссылка на урок появляется в карточке занятия в личном кабинете и открывается за 15 минут до начала.',
  },
  {
    q: 'Что если занятие нужно перенести?',
    a: 'В карточке урока есть кнопка «Перенести». Напишите причину и удобное время — преподаватель подтвердит перенос или предложит другое.',
  },
  {
    q: 'Можно пользоваться школой из Telegram или ВКонтакте?',
    a: '«Спектр» открывается как мини-приложение в обоих мессенджерах: тот же кабинет, расписание, переносы и поддержка. Вход — автоматически, по вашему аккаунту в мессенджере.',
  },
  {
    q: 'Сколько человек в мини-группе?',
    a: 'До восьми. У группы один преподаватель и постоянное расписание, а на странице группы — её профиль с фотографиями.',
  },
  {
    q: 'Какие предметы есть?',
    a: 'Школьная программа и подготовка к ОГЭ и ЕГЭ, а для студентов — высшая математика, общая физика и другие вузовские предметы. Полный список — в разделе «Предметы».',
  },
  {
    q: 'Как выбрать преподавателя?',
    a: 'Посмотрите профили в разделе «Преподаватели» и укажите нужного в заявке. Или оставьте поле пустым — подберём сами.',
  },
  {
    q: 'Куда писать, если что-то не работает?',
    a: 'В раздел «Поддержка» в личном кабинете. Ответ придёт туда же, искать контакты не придётся.',
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
      <Hero />
      <ProductBand />
      <Ticker items={subjects.data?.map((s) => s.title) ?? ['Математика', 'Физика', 'Информатика', 'Английский язык']} />

      {/* Шаги */}
      <Container className="pt-24 text-center">
        <Reveal>
          <h2 className="t-display t-lg mx-auto max-w-[18ch]">
            От заявки до урока <mark>за минуту.</mark>
          </h2>
        </Reveal>
        <div className="mx-auto mt-14 grid max-w-[980px] items-start gap-10 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
          {FLOW.map(({ Doodle, label, title, text }, i) => (
            <FlowStep key={label} i={i} Doodle={Doodle} label={label} title={title} text={text} last={i === FLOW.length - 1} />
          ))}
        </div>
      </Container>

      <LessonFeature />
      <ScheduleFeature />
      <Audience />

      {/* Преподаватели */}
      <Container className="pt-28">
        <SectionTitle
          action={
            <Link to="/teachers" className="link inline-flex items-center gap-1.5 text-[16px] font-[550]">
              Все преподаватели <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          }
        >
          Преподаватели
        </SectionTitle>
        <p className="t-sub mt-6 max-w-[52ch] text-muted">Выберите преподавателя сами или оставьте заявку — подберём под класс, курс и цель.</p>
        <Rail>
          {teachers.data
            ? teachers.data.slice(0, 6).map((t, i) => (
                <Reveal key={t.id} delay={(i % 3) * 0.06} className="h-full">
                  <TeacherCard t={t} className="h-full" />
                </Reveal>
              ))
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[440px]" />)}
        </Rail>
      </Container>

      {/* Предметы */}
      <Container className="pt-28">
        <SectionTitle
          action={
            <Link to="/subjects" className="link inline-flex items-center gap-1.5 text-[16px] font-[550]">
              Все предметы <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          }
        >
          Предметы
        </SectionTitle>
        <div className="grid gap-14 pt-12 lg:grid-cols-2 lg:gap-14 [&>*]:min-w-0">
          <Reveal as="section">
            <Chip hue={2} className="mb-4">
              школьникам
            </Chip>
            <p className="t-sub mb-5 max-w-[40ch] text-[18px] text-muted">Закрыть пробелы, подтянуть оценки, спокойно сдать ОГЭ и ЕГЭ.</p>
            <div>
              {school.map((s, i) => (
                <SubjectRow key={s.id} s={s} index={i + 1} />
              ))}
            </div>
          </Reveal>
          <Reveal as="section" delay={0.08}>
            <Chip hue={6} className="mb-4">
              студентам
            </Chip>
            <p className="t-sub mb-5 max-w-[40ch] text-[18px] text-muted">Разобраться в теории, решить домашние и закрыть сессию. Скоро — курсы от университета.</p>
            <div>
              {uni.map((s, i) => (
                <SubjectRow key={s.id} s={s} index={i + 1} />
              ))}
            </div>
          </Reveal>
        </div>
      </Container>

      {/* Группы */}
      <Container className="pt-28">
        <SectionTitle
          action={
            <Link to="/groups" className="link inline-flex items-center gap-1.5 text-[16px] font-[550]">
              Все группы <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
          }
        >
          Мини-группы
        </SectionTitle>
        <p className="t-sub mt-6 max-w-[56ch] text-muted">До восьми человек, один преподаватель, постоянное расписание. У каждой группы есть свой профиль с фотографиями.</p>
        <Rail>
          {groups.data
            ? groups.data.slice(0, 3).map((g, i) => (
                <Reveal key={g.id} delay={i * 0.07} className="h-full pt-3">
                  <GroupCard g={g} />
                </Reveal>
              ))
            : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72" />)}
        </Rail>
      </Container>

      <Faq />

      {/* Запись */}
      <Container className="pt-24">
        <Reveal as="section">
          <div id="book" className="relative overflow-hidden rounded-[14px] bg-[#a8e5e5] text-forest">
            <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:p-14">
              <div className="flex flex-col gap-5">
                <Chip hue={2} icon={<Sparkles />}>
                  заявка без регистрации
                </Chip>
                <h2 className="t-display text-[clamp(34px,4.2vw,54px)]">
                  Первое занятие.
                  <br />
                  Без лишних шагов.
                </h2>
                <p className="max-w-[36ch] text-[18px] leading-relaxed">
                  Оставьте контакт — подберём преподавателя и время. Если аккаунт уже есть, заявка появится в кабинете.
                </p>
                {user && (
                  <Link to={homeFor(user.role)} className="link w-fit text-[17px] font-[550]">
                    Перейти в кабинет
                  </Link>
                )}
                <TargetDoodle className="mt-auto hidden w-[190px] self-start lg:block" />
              </div>
              <div className="rounded-[12px] border-[1.5px] border-forest/15 bg-paper p-5 text-ink shadow-sticker sm:p-8">
                <BookingForm compact />
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const yLeft = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 90]);
  const yRight = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -70]);
  const yPlane = useTransform(scrollY, [0, 600], [0, reduce ? 0 : -140]);

  return (
    <section className="relative overflow-hidden pt-14 sm:pt-20">
      {/* летающие листки по краям */}
      <motion.div style={{ y: yLeft }} className="pointer-events-none absolute top-[46%] left-[4%] hidden w-[108px] lg:block" aria-hidden="true">
        <PaperDoodle className="float-a w-full" style={{ ['--rot' as string]: '-22deg' }} />
      </motion.div>
      <motion.div style={{ y: yRight }} className="pointer-events-none absolute top-[40%] right-[5%] hidden w-[124px] lg:block" aria-hidden="true">
        <PaperDoodle className="float-b w-full" lines={4} style={{ ['--rot' as string]: '16deg' }} />
      </motion.div>
      <motion.div style={{ y: yPlane }} className="pointer-events-none absolute top-[12%] right-[10%] hidden w-[190px] lg:block" aria-hidden="true">
        <PlaneDoodle className="w-full" />
      </motion.div>
      <motion.div style={{ y: yRight }} className="pointer-events-none absolute top-[16%] left-[9%] hidden w-[130px] -rotate-[24deg] lg:block" aria-hidden="true">
        <PencilDoodle className="w-full" />
      </motion.div>

      <div className="relative mx-auto flex max-w-[860px] flex-col items-center px-5 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
          <Chip hue={2} icon={<LogoMark className="h-3 w-4 text-mark" title="" />}>
            занятия с репетитором онлайн
          </Chip>
        </motion.div>
        <motion.h1
          className="t-display t-xl mt-7"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.06 }}
        >
          Разложим любой предмет на <mark>понятные части.</mark>
        </motion.h1>
        <motion.p
          className="mt-6 max-w-[44ch] text-[clamp(18px,1.7vw,21px)] leading-[1.5]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.14 }}
        >
          Школьная программа, ОГЭ и ЕГЭ, вузовская математика и физика. Один на один или в мини-группе — с расписанием, ссылками на уроки и поддержкой в одном кабинете.
        </motion.p>
        <motion.div
          className="mt-9 flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.22 }}
        >
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to="/book" className="min-h-14 px-7 text-[16px]">
              Записаться на занятие <ArrowRight className="size-4" strokeWidth={2.4} />
            </ButtonLink>
            <ButtonLink to="/teachers" variant="secondary" className="min-h-14 px-6 text-[16px]">
              Выбрать преподавателя
            </ButtonLink>
          </div>
          <p className="t-mono text-[12px] text-muted">без регистрации · заявка за минуту</p>
        </motion.div>
      </div>

      <div className="relative mx-auto mt-10 max-w-[1240px] overflow-x-clip px-2 sm:mt-6">
        <Blob className="absolute -bottom-10 -left-24 w-[190px] sm:w-[380px]" />
        <Blob className="absolute right-[-80px] -bottom-24 w-[220px] rotate-90 opacity-70" color="var(--tint-raw-6)" />
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.3 }}>
          <DeskScene className="relative -ml-[45%] w-[190%] max-w-none sm:ml-0 sm:w-full" />
        </motion.div>
      </div>
    </section>
  );
}

/** Тёмно-зелёная полоса под «столом»: из неё выглядывает кабинет ученика. */
function ProductBand() {
  return (
    <section className="relative bg-forest-2 pb-20 text-cream dark:bg-banner">
      <Container className="pt-14">
        <Reveal y={60}>
          <CabinetMock />
        </Reveal>
        <div className="mx-auto mt-10 grid max-w-[980px] gap-6 text-center sm:grid-cols-3">
          {[
            { Icon: CalendarDays, text: 'Расписание на неделю вперёд' },
            { Icon: RefreshCcw, text: 'Перенос из карточки урока' },
            { Icon: LifeBuoy, text: 'Поддержка без поиска контактов' },
          ].map(({ Icon, text }, i) => (
            <Reveal key={text} delay={i * 0.06} className="flex flex-col items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-mark text-forest">
                <Icon className="size-5" strokeWidth={1.9} />
              </span>
              <p className="text-[16px] text-cream/90">{text}</p>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <MessengerLink href={import.meta.env.VITE_TELEGRAM_APP_URL} label="Открыть в Telegram" />
          <MessengerLink href={import.meta.env.VITE_VK_APP_URL} label="Открыть во ВКонтакте" />
        </div>
      </Container>
    </section>
  );
}

function MessengerLink({ href, label }: { href?: string; label: string }) {
  if (!href) {
    return (
      <span className="t-mono inline-flex min-h-11 items-center rounded-full border-[1.5px] border-dashed border-cream/40 px-5 text-[12.5px] text-cream/80" title="Ссылка появится после публикации мини-приложения">
        {label.toLowerCase()} — скоро
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="press inline-flex min-h-11 items-center rounded-full border-[1.5px] border-cream px-5 text-[14px] font-[600] text-cream no-underline hover:-translate-y-0.5 hover:bg-mark hover:text-forest hover:border-mark">
      {label}
    </a>
  );
}

/** Макет кабинета — иллюстрация интерфейса, данные демонстрационные. */
function CabinetMock() {
  const [left, setLeft] = useState(2 * 3600 + 14 * 60);
  useEffect(() => {
    const t = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const hh = Math.floor(left / 3600);
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="mx-auto max-w-[980px] overflow-hidden rounded-[14px] border border-cream/10 bg-paper text-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)]" aria-label="Пример личного кабинета ученика" role="img">
      <div className="flex items-center gap-2 border-b border-dashed border-hair-soft px-4 py-3">
        <span className="size-3 rounded-full bg-ray-0" style={{ background: 'var(--ray-0)' }} />
        <span className="size-3 rounded-full" style={{ background: 'var(--ray-2)' }} />
        <span className="size-3 rounded-full" style={{ background: 'var(--ray-3)' }} />
        <span className="t-mono ml-3 truncate rounded-full bg-bone px-3 py-1 text-[11px] text-muted">spectr.school/app</span>
      </div>
      <div className="grid md:grid-cols-[190px_1fr]">
        <div className="hidden flex-col gap-1 border-r border-dashed border-hair-soft p-4 md:flex">
          <p className="t-mono mb-1 px-2 text-[11px] text-muted">учёба</p>
          {['Обзор', 'Расписание', 'Переносы', 'Поддержка'].map((x, i) => (
            <span key={x} className={clsx('rounded-full px-3 py-1.5 text-[14px]', i === 0 ? 'bg-mark font-[600] text-forest' : 'text-muted')}>
              {x}
            </span>
          ))}
        </div>
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1.2fr_1fr]">
          <div className="hue-3 flex flex-col gap-4 rounded-[12px] bg-tint p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="t-mono text-[11.5px] text-hue">ближайшее занятие</p>
              <span className="t-mono tnum rounded-full bg-paper px-2.5 py-1 text-[11px]">
                через {hh}:{mm}:{ss}
              </span>
            </div>
            <p className="t-display tnum text-[clamp(56px,8vw,84px)] leading-none text-hue">17:00</p>
            <div>
              <p className="t-heading text-[22px]">ОГЭ · Математика</p>
              <p className="text-[15px] text-ink/75">Анна Лебедева · 60 мин · мини-группа</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-ctl bg-ink px-4 text-[14px] font-[600] text-paper">
                <Video className="size-4" /> Подключиться
              </span>
              <span className="inline-flex min-h-10 items-center rounded-ctl border-[1.5px] border-ink/25 px-4 text-[14px]">Перенести</span>
            </div>
          </div>
          <div className="flex flex-col">
            <p className="t-mono mb-2 text-[11.5px] text-muted">на этой неделе</p>
            {[
              { t: '17:00', d: 'Сегодня', n: 'ОГЭ · Математика', h: 3 },
              { t: '18:00', d: 'Среда', n: 'ЕГЭ · Физика', h: 5 },
              { t: '16:30', d: 'Пятница', n: 'Информатика', h: 4 },
              { t: '12:00', d: 'Суббота', n: 'Английский язык', h: 1 },
            ].map((l) => (
              <div key={l.n} className={clsx(`hue-${l.h}`, 'flex items-center gap-3 border-b border-dashed border-hair-soft py-2.5 last:border-0')}>
                <span className="t-heading tnum w-14 text-[18px]">{l.t}</span>
                <span className="size-2.5 shrink-0 rounded-full bg-ray" />
                <span className="min-w-0 flex-1 truncate text-[14.5px]">{l.n}</span>
                <span className="t-mono text-[11px] text-muted">{l.d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Ticker({ items }: { items: string[] }) {
  const row = [...items, ...items, ...items];
  return (
    <div className="relative z-10 -mt-7 -rotate-[1.5deg] overflow-hidden border-y-[1.5px] border-forest bg-mark py-3 text-forest" aria-hidden="true">
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-8">
        {[...row, ...row].map((x, i) => (
          <span key={i} className="t-display flex items-center gap-8 text-[22px] whitespace-nowrap">
            {x}
            <span className="text-[18px]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function FlowStep({
  i,
  Doodle,
  label,
  title,
  text,
  last,
}: {
  i: number;
  Doodle: (p: { className?: string }) => React.ReactElement;
  label: string;
  title: string;
  text: string;
  last: boolean;
}) {
  return (
    <>
      <Reveal delay={i * 0.12} className="flex flex-col items-center gap-3">
        <div className="wiggle-hover grid size-32 place-items-center">
          <Doodle className="w-28" />
        </div>
        <h3 className="t-heading text-[22px]">{title}</h3>
        <p className="max-w-[28ch] text-[16px] text-muted">{text}</p>
      </Reveal>
      {!last && (
        <Reveal delay={i * 0.12 + 0.08} className="hidden flex-col items-center gap-1 pt-12 text-muted md:flex">
          <span className="t-mono text-[12px]">{FLOW[i + 1].label}</span>
          <ArrowDoodle className="w-24" />
        </Reveal>
      )}
      {last && <span className="sr-only">{label}</span>}
    </>
  );
}

/** Фича 1: жёлтая карточка + макет видеозвонка */
function LessonFeature() {
  const [sec, setSec] = useState(23 * 60 + 5);
  useEffect(() => {
    const t = setInterval(() => setSec((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  return (
    <Container className="pt-32">
      <Reveal>
        <Chip hue={2} icon={<Video />} className="mb-4">
          занятия
        </Chip>
        <div className="grid overflow-hidden rounded-[14px] lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex flex-col gap-5 bg-mark p-7 text-forest sm:p-10">
            <h2 className="t-display text-[clamp(28px,2.7vw,38px)] leading-[1.1]">
              Занимайтесь спокойно — ссылку и расписание мы держим под рукой.
            </h2>
            <Squiggle className="h-3 w-44 [&_path]:stroke-forest" />
            <p className="max-w-[44ch] text-[17px] leading-relaxed">
              Урок идёт по видеосвязи. Ссылка появляется в карточке занятия и открывается за 15 минут до начала — искать её в переписке не нужно.
            </p>
            <p className="t-mono mt-auto border-t border-dashed border-forest/30 pt-4 text-[12px]">работает на сайте, в Telegram и во ВКонтакте</p>
          </div>
          <div className="flex flex-col bg-[#1d2118] p-3 sm:p-4" role="img" aria-label="Пример видеозанятия">
            <div className="grid flex-1 grid-cols-[1.6fr_1fr] gap-3">
              <div className="relative min-h-[240px] overflow-hidden rounded-[10px]">
                <Monogram name="Анна Лебедева" hue={4} size="fill" className="absolute inset-0" />
                <span className="t-mono absolute bottom-2.5 left-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">Анна · преподаватель</span>
                <span className="t-mono absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                  <span className="size-2 rounded-full bg-[#ff6b4a]" style={{ animation: 'pulse-dot 1.4s infinite' }} />
                  идёт урок · {time}
                </span>
              </div>
              <div className="grid grid-rows-2 gap-3">
                <div className="relative overflow-hidden rounded-[10px]">
                  <Monogram name="Вы" hue={6} size="fill" className="absolute inset-0" />
                  <span className="t-mono absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] text-white">вы</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] bg-mark p-3 text-center text-forest">
                  <LogoMark className="h-8 w-10" title="" />
                  <p className="text-[12.5px] leading-tight font-[600]">Спектр сохранит урок в расписании</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 px-1 text-white/80">
              <span className="t-mono hidden text-[11px] sm:block">огэ · математика</span>
              <div className="flex gap-2">
                {[Mic, Video, MonitorUp, MessageCircle].map((Icon, i) => (
                  <span key={i} className="grid size-9 place-items-center rounded-full bg-white/10">
                    <Icon className="size-4" />
                  </span>
                ))}
                <span className="grid size-9 place-items-center rounded-full bg-[#e5484d] text-white">
                  <Phone className="size-4 rotate-[135deg]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Container>
  );
}

const SCHEDULE_TABS = [
  { Icon: CalendarDays, title: 'Всё расписание в одном месте', text: 'Индивидуальные уроки и занятия группы — на одной неделе, с временем и ссылками.' },
  { Icon: RefreshCcw, title: 'Перенос одной кнопкой', text: 'Причина и удобное время — прямо из карточки урока. Ответ преподавателя придёт туда же.' },
  { Icon: LifeBuoy, title: 'Поддержка в кабинете', text: 'Вопрос по оплате, ссылке или расписанию — в чат поддержки, без поиска контактов.' },
];

/** Фича 2: список с подсветкой + меняющийся макет справа */
function ScheduleFeature() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % SCHEDULE_TABS.length), 4200);
    return () => clearInterval(t);
  }, [paused]);

  return (
    <Container className="pt-32">
      <Reveal className="flex flex-col items-center text-center">
        <Chip hue={3} icon={<CalendarDays />}>
          кабинет
        </Chip>
        <h2 className="t-display t-lg mt-5 max-w-[20ch]">
          Одно расписание <mark>на все занятия.</mark>
        </h2>
        <p className="mt-5 max-w-[52ch] text-[18px] text-muted">Кабинет одинаково открывается с сайта и из мессенджеров. Ученик всегда знает, когда следующее занятие и где ссылка.</p>
      </Reveal>
      <div className="mt-14 grid items-stretch gap-8 lg:grid-cols-[0.95fr_1.05fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div role="tablist" aria-label="Возможности кабинета" className="flex flex-col border-l-[3px] border-forest dark:border-ink">
          {SCHEDULE_TABS.map(({ Icon, title, text }, i) => (
            <button
              key={title}
              role="tab"
              aria-selected={active === i}
              onClick={() => {
                setActive(i);
                setPaused(true);
              }}
              className="group relative flex items-start gap-4 border-b border-dashed border-hair-soft py-6 pr-4 pl-5 text-left last:border-0"
            >
              {active === i && (
                <motion.span
                  layoutId="sched-hl"
                  className="absolute inset-y-2 right-0 left-2 -z-0 -rotate-[0.6deg] rounded-[6px] bg-[#d5f5c2] dark:bg-tint-3"
                  style={{ background: 'var(--tint-3)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative grid size-12 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink/70 bg-paper">
                <Icon className="size-6" strokeWidth={1.6} />
              </span>
              <span className="relative flex flex-col gap-1">
                <span className="t-heading text-[21px]">{title}</span>
                <span className="text-[15.5px] leading-snug text-ink/75">{text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="relative min-h-[380px] overflow-hidden rounded-[14px] p-5 sm:p-7" style={{ background: 'var(--tint-3)' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 18, rotate: 1.5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -14, rotate: -1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="h-full"
            >
              {active === 0 ? <WeekMock /> : active === 1 ? <RescheduleMock /> : <SupportMock />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Container>
  );
}

function MockCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('h-full rounded-[12px] bg-paper p-5 text-ink shadow-card', className)}>{children}</div>;
}

function WeekMock() {
  const days = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const marks: Record<number, number> = { 0: 3, 2: 5, 4: 4, 5: 1 };
  return (
    <MockCard>
      <div className="flex items-center justify-between">
        <p className="t-heading text-[18px]">Неделя</p>
        <span className="t-mono text-[11px] text-muted">4 занятия</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
        {days.map((d, i) => (
          <div key={d} className={clsx('flex flex-col items-center gap-1.5 rounded-[8px] py-2', i === 0 && 'bg-mark text-forest')}>
            <span className="t-mono text-[10.5px]">{d}</span>
            <span className="t-heading tnum text-[17px]">{12 + i}</span>
            <span className={clsx('size-1.5 rounded-full', marks[i] !== undefined ? '' : 'opacity-0')} style={{ background: `var(--ray-${marks[i] ?? 0})` }} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col">
        {[
          { t: '17:00', n: 'ОГЭ · Математика', w: 'Анна Лебедева', h: 3 },
          { t: '18:00', n: 'ЕГЭ · Физика', w: 'Вера Соколова', h: 5 },
          { t: '16:30', n: 'Информатика', w: 'Илья Громов', h: 4 },
        ].map((l) => (
          <div key={l.n} className={clsx(`hue-${l.h}`, 'flex items-center gap-3 border-t border-dashed border-hair-soft py-3')}>
            <span className="t-heading tnum w-14 text-[18px]">{l.t}</span>
            <span className="h-8 w-1 rounded-full bg-ray" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-[550]">{l.n}</span>
              <span className="t-caption text-muted">{l.w}</span>
            </span>
          </div>
        ))}
      </div>
    </MockCard>
  );
}

function RescheduleMock() {
  return (
    <MockCard className="flex flex-col gap-4">
      <div className="hue-5 flex items-center gap-3 rounded-[10px] bg-tint p-3">
        <span className="t-heading tnum text-[22px] text-hue">18:00</span>
        <span className="text-[15px]">ЕГЭ · Физика, среда</span>
      </div>
      <div>
        <p className="t-caption mb-1.5 font-[550]">Почему нужно перенести</p>
        <div className="rounded-ctl border-[1.5px] border-ink bg-paper px-3.5 py-3 text-[15px] shadow-[0_0_0_4px_var(--mark)]">
          В среду контрольная в школе, можно на четверг?<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-ink" />
        </div>
      </div>
      <div>
        <p className="t-caption mb-1.5 font-[550]">Удобное время</p>
        <div className="rounded-ctl border-[1.5px] border-ink/25 px-3.5 py-3 text-[15px]">Четверг, 18:00</div>
      </div>
      <span className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-ctl bg-ink px-5 text-[14px] font-[600] text-paper">
        <Send className="size-4" /> Отправить заявку
      </span>
    </MockCard>
  );
}

function SupportMock() {
  return (
    <MockCard className="flex flex-col gap-3">
      <p className="t-heading text-[18px]">Поддержка</p>
      <div className="max-w-[80%] self-end rounded-[14px] rounded-br-[4px] bg-mark px-4 py-2.5 text-[15px] text-forest">Не вижу ссылку на урок в 17:00</div>
      <div className="flex max-w-[85%] items-end gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-forest text-mark">
          <LogoMark className="h-4 w-5" title="" />
        </span>
        <div className="rounded-[14px] rounded-bl-[4px] bg-bone px-4 py-2.5 text-[15px]">Она откроется за 15 минут до начала — прямо в карточке занятия.</div>
      </div>
      <div className="max-w-[80%] self-end rounded-[14px] rounded-br-[4px] bg-mark px-4 py-2.5 text-[15px] text-forest">Понял, спасибо!</div>
      <div className="mt-auto flex items-center gap-2 rounded-full border-[1.5px] border-ink/20 py-1.5 pr-1.5 pl-4 text-[14px] text-muted">
        <span className="flex-1">Написать сообщение…</span>
        <span className="grid size-9 place-items-center rounded-full bg-ink text-paper">
          <Send className="size-4" />
        </span>
      </div>
    </MockCard>
  );
}

/** «Для кого»: терракотовый лист в линейку со стикерами */
function Audience() {
  return (
    <section className="mt-32">
      <Container>
        <div className="ruled relative overflow-hidden rounded-[14px] bg-terracotta px-5 py-14 text-cream sm:px-10 sm:py-20">
          <div className="grid items-center gap-y-12 lg:grid-cols-[1fr_1.1fr_1fr] lg:gap-x-6">
            <div className="flex flex-col items-center gap-8 lg:gap-14">
              {AUDIENCE.slice(0, 2).map((a, i) => (
                <AudienceNote key={a.label} {...a} delay={i * 0.1} />
              ))}
            </div>
            <Reveal className="order-first text-center lg:order-none">
              <Chip hue={2} icon={<Sparkles />} className="mb-5">
                для кого
              </Chip>
              <h2 className="t-display text-[clamp(34px,4vw,54px)] leading-[1.05]">
                Подстроимся под <span className="relative inline-block">вашу задачу<Squiggle className="absolute -bottom-2 left-0 h-3 w-full [&_path]:stroke-mark" /></span>.
              </h2>
              <p className="mx-auto mt-6 max-w-[34ch] text-[17px] text-cream/90">Школа и вуз, один на один или в мини-группе. Преподавателя и время подбираем под цель.</p>
              <div className="mt-8 flex justify-center">
                <ButtonLink to="/book" variant="banner" className="min-h-12">
                  Подобрать занятие <ArrowRight className="size-4" strokeWidth={2.4} />
                </ButtonLink>
              </div>
            </Reveal>
            <div className="flex flex-col items-center gap-8 lg:gap-14">
              {AUDIENCE.slice(2).map((a, i) => (
                <AudienceNote key={a.label} {...a} delay={0.15 + i * 0.1} />
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function AudienceNote({
  hue,
  Doodle,
  label,
  title,
  text,
  rot,
  delay,
}: (typeof AUDIENCE)[number] & { delay: number }) {
  return (
    <Reveal rotate={rot} delay={delay} className="w-full max-w-[290px]">
      <div className={clsx(`hue-${hue}`, 'sticker relative flex flex-col items-center gap-2 px-6 pt-6 pb-7 text-center transition-transform duration-300 hover:scale-[1.04] hover:rotate-2')}>
        <span className="t-mono absolute -top-3 left-4 flex items-center gap-1.5 rounded-[4px] bg-paper px-2 py-1 text-[10.5px] text-forest shadow-card">
          <span className="size-1.5 rounded-full bg-forest" /> {label}
        </span>
        <Doodle className="h-20 w-24" />
        <h3 className="t-heading text-[24px]">{title}</h3>
        <p className="text-[15px] leading-snug">{text}</p>
      </div>
    </Reveal>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Container className="pt-32">
      <Reveal className="text-center">
        <h2 className="t-display t-lg">
          Вопросы, которые <mark>задают часто.</mark>
        </h2>
      </Reveal>
      <ul className="mx-auto mt-12 max-w-[860px] list-none p-0">
        {FAQ.map((f, i) => {
          const isOpen = open === i;
          return (
            <Reveal as="li" key={f.q} delay={Math.min(i, 5) * 0.04} y={16} className="border-b-[1.5px] border-ink/80 first:border-t-[1.5px]">
              <h3>
                <button
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="text-[18px] font-[550] sm:text-[19px]">
                    <span className="t-mono mr-2 text-[15px] text-muted">В:</span>
                    <span className="bg-[linear-gradient(var(--mark),var(--mark))] bg-[length:0%_40%] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover:bg-[length:100%_40%]">{f.q}</span>
                  </span>
                  <span className={clsx('grid size-9 shrink-0 place-items-center rounded-full transition-[transform,background-color] duration-300', isOpen ? 'rotate-45 bg-mark text-forest' : 'group-hover:bg-ink/[0.06]')}>
                    <Plus className="size-5" strokeWidth={2.2} />
                  </span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-[64ch] pb-6 pl-8 text-[17px] leading-relaxed text-ink/80">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Reveal>
          );
        })}
      </ul>
      <p className="mt-8 flex items-center justify-center gap-2 text-center text-[15px] text-muted">
        <Check className="size-4" /> Не нашли ответ?{' '}
        <Link to="/app/support" className="link">
          Напишите в поддержку
        </Link>
      </p>
    </Container>
  );
}

/** На телефоне — горизонтальная лента с прокруткой, на планшете и шире — сетка */
function Rail({ children }: { children: React.ReactNode[] }) {
  return (
    <ul className="-mx-4 mt-10 flex list-none snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pt-2 pb-6 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-7 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {children.map((c, i) => (
        <li key={i} className="w-[80%] shrink-0 snap-start sm:w-auto">
          {c}
        </li>
      ))}
    </ul>
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
          <span className="t-display text-[24px]">Спектр</span>
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
            <div className="hue-2 sticker flex -rotate-[0.8deg] flex-col items-start gap-3 p-5">
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
              <Link key={q.to} to={q.to} className="press flex min-h-20 flex-col justify-between rounded-card border-[1.5px] border-dashed border-ink/25 bg-paper p-3 no-underline hover:bg-mark hover:text-forest">
                <span className="t-heading tnum text-[26px]">{q.n ?? '—'}</span>
                <span className="text-[14px] leading-tight">{q.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <h1 className="t-display text-[36px]">Разложим любой предмет на <mark>понятные части.</mark></h1>
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
