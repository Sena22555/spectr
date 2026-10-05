import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { BookOpen, Check, Lock, MessageCircle, Puzzle, Sparkles, Star } from 'lucide-react';
import { Container } from '../../components/Layout';
import { Chip, ErrorNote, Skeleton } from '../../components/ui';
import { BackpackDoodle, PencilBuddy, PlaneDoodle } from '../../components/Doodles';
import { XpMeter } from '../../components/game/XpMeter';
import { LeagueBoard } from '../../components/game/League';
import { useCourse, type CourseUnit } from '../../lib/english';
import { useGame } from '../../lib/game';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';
import { usePageTitle } from '../../lib/title';

const ICONS = { sparkles: Sparkles, book: BookOpen, message: MessageCircle, puzzle: Puzzle } as const;
// змейка: смещение узлов по горизонтали
const OFFSETS = [0, 64, 0, -64];

/** «Английский: путь» — разделы от знакомства до ЕГЭ, уроки змейкой, как в приложениях для языков. */
export default function EnglishPath() {
  usePageTitle('Английский: путь');
  const q = useCourse();
  const game = useGame();
  const next = q.data?.next;

  return (
    <Container className={clsx('flex max-w-[880px] flex-col gap-10', isMiniApp ? 'pt-5 pb-10' : 'pt-8 pb-16 sm:pt-12')}>
      <header className="grid items-end gap-6 sm:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <Chip hue={5} icon={<Sparkles />}>
            бесплатно · 5–11 класс
          </Chip>
          <h1 className="t-display t-lg">
            Английский: <mark>путь</mark>
          </h1>
          <p className="t-sub max-w-[52ch] text-muted">
            Короткие уроки по 3–5 минут: новые слова с картинками и озвучкой, фразы из плиток, грамматика с правилом. Ошибки не страшны — задание вернётся в конце урока.
          </p>
        </div>
        <PencilBuddy className="hidden h-40 w-auto justify-self-end sm:block" />
      </header>

      <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
        <XpMeter xp={game.data?.xp} />
        {q.data && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col justify-center rounded-[14px] bg-[var(--tint-raw-5)] px-4 py-2.5">
              <span className="t-heading tnum text-[24px] leading-none">
                {q.data.stats.lessons}/{q.data.stats.total}
              </span>
              <span className="text-[13.5px]">уроков пройдено</span>
            </div>
            <div className="flex flex-col justify-center rounded-[14px] bg-[var(--tint-raw-3)] px-4 py-2.5">
              <span className="t-heading tnum text-[24px] leading-none">{q.data.stats.words}</span>
              <span className="text-[13.5px]">{plural(q.data.stats.words, 'слово', 'слова', 'слов')} изучено</span>
            </div>
          </div>
        )}
      </div>

      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.isPending && <Skeleton className="h-[600px]" />}
      {q.data && (
        <ol className="m-0 flex list-none flex-col gap-14 p-0">
          {q.data.units.map((u, i) => (
            <UnitBlock key={u.id} u={u} index={i} next={next ?? null} />
          ))}
        </ol>
      )}

      <LeagueBoard />

      <p className="rounded-[12px] bg-bone px-4 py-3 text-[15px] text-muted">
        Прогресс сохраняется на этом устройстве, а после входа в аккаунт — везде. Хотите заниматься с преподавателем английского?{' '}
        <Link to="/book" className="link">
          Запишитесь на занятие
        </Link>
        .
      </p>
    </Container>
  );
}

function UnitBlock({ u, index, next }: { u: CourseUnit; index: number; next: string | null }) {
  const done = u.lessons.filter((l) => l.done).length;
  const Deco = [PlaneDoodle, BackpackDoodle, PencilBuddy][index % 3]!;
  return (
    <li className={`hue-${u.hue} flex flex-col gap-8`}>
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[16px] bg-tint px-5 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-[12px] bg-paper text-[30px] shadow-sticker" aria-hidden="true">
            {u.icon}
          </span>
          <div className="flex flex-col">
            <span className="t-mono text-[12px] text-hue">
              раздел {index + 1} · {u.level} · {u.grades[0] === u.grades[1] ? `${u.grades[0]} класс` : `${u.grades[0]}–${u.grades[1]} класс`}
            </span>
            <h2 className="t-heading text-[24px] leading-tight">
              {u.title} <span className="text-ink/60">— {u.ru}</span>
            </h2>
            <span className="text-[14px] text-ink/75">Грамматика: {u.grammar}</span>
          </div>
        </div>
        <span className="t-mono rounded-full bg-paper px-3 py-1 text-[12px]">
          {done}/{u.lessons.length}
          {done === u.lessons.length ? ' ✓' : ''}
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-7">
        <Deco className={clsx('pointer-events-none absolute top-6 hidden h-28 w-auto opacity-90 md:block', index % 2 ? 'left-6' : 'right-6')} />
        {u.lessons.map((l, k) => {
          const Icon = ICONS[l.icon as keyof typeof ICONS] ?? Sparkles;
          const current = l.id === next;
          const state = l.done ? 'done' : l.open ? 'open' : 'locked';
          const node = (
            <span className="relative flex flex-col items-center gap-2" style={{ transform: `translateX(${OFFSETS[k % 4]}px)` }}>
              {current && (
                <motion.span
                  className="t-heading absolute -top-11 z-10 rounded-[10px] border-[1.5px] border-ink/15 bg-paper px-3 py-1.5 text-[14px] whitespace-nowrap text-hue shadow-sticker"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                >
                  {l.done ? 'Повторить' : 'Начать'}
                </motion.span>
              )}
              <span
                className={clsx(
                  'relative grid size-[76px] place-items-center rounded-full transition-transform',
                  state === 'locked' ? 'bg-bone text-ink/30 shadow-[0_6px_0_rgba(26,51,0,0.12)]' : 'bg-ray text-paper shadow-[0_6px_0_var(--i)] group-hover:-translate-y-1 group-active:translate-y-1 group-active:shadow-[0_2px_0_var(--i)]',
                  current && 'ring-[6px] ring-[var(--t)] ring-offset-4 ring-offset-paper',
                )}
              >
                {state === 'locked' ? <Lock className="size-7" /> : l.done ? l.perfect ? <Star className="size-8 fill-current" /> : <Check className="size-8" strokeWidth={3} /> : <Icon className="size-8" />}
              </span>
              <span className={clsx('text-[14px] font-[600]', state === 'locked' ? 'text-muted' : 'text-ink')}>{l.title}</span>
            </span>
          );
          return state === 'locked' ? (
            <span key={l.id} title="Сначала пройдите предыдущий урок" aria-label={`${l.title}: откроется после предыдущего урока`} className="cursor-not-allowed">
              {node}
            </span>
          ) : (
            <Link key={l.id} to={`/english/lesson/${l.id}`} className="group no-underline" aria-label={`Урок ${l.n}: ${l.title}${l.done ? ', пройден' : ''}`}>
              {node}
            </Link>
          );
        })}
      </div>
    </li>
  );
}
