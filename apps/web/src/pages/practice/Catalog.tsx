import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, BookOpen, Check, Clock, Dumbbell, FlaskConical, Gauge, Medal, Sparkles, Target, Trophy } from 'lucide-react';
import { Container } from '../../components/Layout';
import { Reveal } from '../../components/Reveal';
import { DailyTask } from '../../components/practice/DailyTask';
import { ButtonLink, Chip, ErrorNote, Skeleton } from '../../components/ui';
import { usePractice, useProgress, type PracticeSubjectCard, type TopicCard } from '../../lib/practice';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';

export default function PracticeCatalog() {
  const q = usePractice();
  const progress = useProgress();
  const subjects = q.data?.subjects ?? [];
  const totalProblems = subjects.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.problems, 0), 0);
  const totalTopics = subjects.reduce((n, s) => n + s.topics.length, 0);
  const labs = subjects.reduce((n, s) => n + s.topics.filter((t) => t.widget).length, 0);
  const solved = progress.data?.solved.size ?? 0;

  return (
    <Container className={clsx('flex flex-col gap-14', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <header className="grid items-end gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <Chip hue={3} icon={<Sparkles />}>
            бесплатно · без регистрации
          </Chip>
          <h1 className="t-display t-lg">
            Практикум: <mark>решай и проверяй</mark> сразу
          </h1>
          <p className="t-sub max-w-[52ch] text-muted">
            Короткая теория, формулы, живые опыты и задачи с мгновенной проверкой. Ошиблись — подскажем, сдались — покажем разбор по шагам.
          </p>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-3">
          {[
            [totalTopics, plural(totalTopics, 'тема', 'темы', 'тем')],
            [totalProblems, plural(totalProblems, 'задача', 'задачи', 'задач')],
            [labs, plural(labs, 'опыт', 'опыта', 'опытов')],
          ].map(([n, label], i) => (
            <div key={i} className={`hue-${[5, 1, 3][i]} flex flex-col rounded-[12px] bg-tint p-4`}>
              <dd className="t-display tnum m-0 text-[clamp(30px,4vw,44px)] text-hue">{q.data ? n : '—'}</dd>
              <dt className="text-[15px]">{label}</dt>
            </div>
          ))}
        </dl>
      </header>

      <nav aria-label="Разделы практикума" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { to: '/practice/trainers', title: 'Сборник 5–11 класс', text: 'Бесконечные тренажёры по классам', hue: 1, Icon: Dumbbell },
          { to: '/practice/trainers?tab=exams', title: 'ОГЭ и ЕГЭ', text: 'Задания по номерам экзамена', hue: 5, Icon: Target },
          { to: '#topics', title: 'Темы с теорией', text: 'Коротко, с формулами и опытами', hue: 3, Icon: BookOpen },
          { to: '/practice/check/math', title: 'Проверить уровень', text: '5 минут, без оценок', hue: 2, Icon: Gauge },
          { to: '/tournament', title: 'Турнир недели', text: '10 задач, сертификат каждому', hue: 0, Icon: Medal },
          { to: '/practice/progress', title: 'Мой прогресс', text: 'Достижения и отчёт для родителей', hue: 6, Icon: Trophy },
        ].map(({ to, title, text, hue, Icon }) =>
          to.startsWith('#') ? (
            <a key={to} href={to} className={`hue-${hue} lift group flex items-start gap-3 rounded-[12px] bg-tint p-4 no-underline hover:-translate-y-0.5`}>
              <Icon className="mt-0.5 size-5 shrink-0 text-hue" />
              <span className="flex flex-col">
                <span className="lift-title text-[17px] font-[650]">{title}</span>
                <span className="text-[14px] text-ink/75">{text}</span>
              </span>
            </a>
          ) : (
            <Link key={to} to={to} className={`hue-${hue} lift group flex items-start gap-3 rounded-[12px] bg-tint p-4 no-underline hover:-translate-y-0.5`}>
              <Icon className="mt-0.5 size-5 shrink-0 text-hue" />
              <span className="flex flex-col">
                <span className="lift-title text-[17px] font-[650]">{title}</span>
                <span className="text-[14px] text-ink/75">{text}</span>
              </span>
            </Link>
          ),
        )}
      </nav>

      {solved > 0 && (
        <p className="-mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-mark px-4 py-2 text-[15px] text-forest">
          <Check className="size-4" strokeWidth={2.4} /> Вы уже решили {solved} {plural(solved, 'задачу', 'задачи', 'задач')} — прогресс сохраняется
        </p>
      )}

      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data ? <DailyTask daily={q.data.daily} /> : <Skeleton className="h-72" />}

      <span id="topics" className="-mb-8 scroll-mt-28" aria-hidden="true" />
      {q.isPending
        ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-80" />)
        : subjects.map((s) => <SubjectBlock key={s.slug} s={s} solved={progress.data?.solved} />)}

      <Reveal>
        <section className="hue-4 relative grid gap-6 overflow-hidden rounded-[14px] bg-forest-2 p-7 text-cream sm:p-10 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div className="flex flex-col gap-3">
            <p className="t-mono text-mark">застряли на теме?</p>
            <h2 className="t-display text-[clamp(28px,3.4vw,42px)]">Разберём с репетитором — один на один или в мини-группе</h2>
            <p className="max-w-[48ch] text-[17px] text-cream/80">Преподаватель увидит, что вы уже решали в практикуме, и начнёт с того места, где стало сложно.</p>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <ButtonLink to="/book" variant="banner">
              Записаться на занятие <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </section>
      </Reveal>
    </Container>
  );
}

function SubjectBlock({ s, solved }: { s: PracticeSubjectCard; solved?: Set<string> }) {
  const done = s.topics.reduce((n, t) => n + t.ids.filter((id) => solved?.has(id)).length, 0);
  const total = s.topics.reduce((n, t) => n + t.problems, 0);
  return (
    <section id={s.slug} className="flex scroll-mt-28 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-dashed border-hair-soft pb-5">
        <div className="flex max-w-[60ch] flex-col gap-2">
          <h2 className="t-display t-lg flex items-center gap-3">
            <span aria-hidden="true">{s.emoji}</span> {s.title}
          </h2>
          <p className="t-sub text-muted">{s.blurb}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {done > 0 && (
            <span className="t-mono text-[12px] text-muted">
              решено {done} из {total}
            </span>
          )}
          <ButtonLink to={`/practice/check/${s.slug}`} variant="secondary" className="min-h-11">
            <Gauge className="size-4" strokeWidth={1.8} /> Проверить уровень за 5 минут
          </ButtonLink>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {s.topics.map((t, i) => (
          <Reveal key={t.slug} delay={(i % 3) * 0.05} className="h-full">
            <TopicTile subject={s} t={t} solved={t.ids.filter((id) => solved?.has(id)).length} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function TopicTile({ subject, t, solved }: { subject: PracticeSubjectCard; t: TopicCard; solved: number }) {
  const complete = solved === t.problems && t.problems > 0;
  return (
    <Link
      to={`/practice/${subject.slug}/${t.slug}`}
      className={clsx(`hue-${subject.hue}`, 'lift group relative flex h-full flex-col gap-3 rounded-[12px] border-[1.5px] p-5 no-underline hover:-translate-y-1', complete ? 'border-transparent bg-tint' : 'border-ink/15 bg-paper hover:border-ink/40')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="t-mono text-[11px] text-muted">{t.level}</span>
        {t.widget && (
          <span className="t-mono inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-[11px] text-hue">
            <FlaskConical className="size-3" strokeWidth={2.2} /> опыт
          </span>
        )}
      </div>
      <h3 className="lift-title t-heading text-[23px] leading-tight">{t.title}</h3>
      <p className="text-[15.5px] text-muted">{t.summary}</p>
      <div className="mt-auto flex items-center gap-3 pt-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10" aria-label={`Решено ${solved} из ${t.problems}`}>
          <motion.div className="h-full rounded-full bg-ray" initial={{ width: 0 }} animate={{ width: `${(solved / t.problems) * 100}%` }} />
        </div>
        <span className="t-mono tnum text-[11px] text-muted">
          {solved}/{t.problems}
        </span>
        <span className="t-mono inline-flex items-center gap-1 text-[11px] text-muted">
          <Clock className="size-3" /> {t.minutes} мин
        </span>
      </div>
    </Link>
  );
}
