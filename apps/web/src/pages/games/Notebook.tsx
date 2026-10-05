import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { ArrowLeft, Lock, Play, Star } from 'lucide-react';
import { Container } from '../../components/Layout';
import { ErrorNote, Skeleton } from '../../components/ui';
import { XpMeter } from '../../components/game/XpMeter';
import { LeagueBoard } from '../../components/game/League';
import { GameMark } from '../../components/games/parts';
import type { CourseUnit } from '../../lib/english';
import { GAME_META, isGame, saveEnLevel, savedEnLevel, useGameMap, type GameKey, type GameMap } from '../../lib/games';
import { ChatLauncher } from '../../components/games/Chat';
import { useGame } from '../../lib/game';
import { isMiniApp } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';

const TAGLINE: Record<GameKey, string> = {
  lingo: 'Английский карточками: словарик с озвучкой, фразы из слов, «найди пару» и грамматика. От «Hello!» до словообразования ЕГЭ.',
  math: 'От устного счёта до профильного ЕГЭ. Задачи каждый раз новые: решай, выбирай, лови ошибки одноклассника.',
  physics: 'Движение, силы, тепло, ток и свет. Задачи с числами, единицы измерения и формулы — в игре на скорость.',
  code: 'Двоичный код, объём информации, логика и Python — короткими уровнями по 3–5 минут.',
};

/** Тетрадь игры: главы-развороты, в каждой — слоты под стикеры уровней. */
export default function Notebook() {
  const { game = '' } = useParams();
  const valid = isGame(game);
  const q = useGameMap((valid ? game : 'math') as GameKey);
  const xp = useGame();
  const meta = valid ? GAME_META[game] : null;
  usePageTitle(meta ? meta.name.join('') : 'Игры');
  if (!valid || !meta) return <Navigate to="/games" replace />;
  const stickers = q.data?.stats.lessons ?? 0;
  const total = q.data?.stats.total ?? 0;

  return (
    <Container className={clsx('flex max-w-[960px] flex-col gap-9', isMiniApp ? 'pt-5 pb-10' : 'pt-8 pb-16 sm:pt-12')}>
      <Link to="/games" className="t-mono inline-flex w-fit items-center gap-1.5 text-[12px] text-muted no-underline hover:text-ink">
        <ArrowLeft className="size-3.5" /> все игры
      </Link>
      <header className={`hue-${meta.hue} grid items-end gap-6 sm:grid-cols-[1.5fr_1fr]`}>
        <div className="flex flex-col gap-4">
          <p className="t-mono text-[12px] text-hue">
            {meta.icon} {meta.subject} · бесплатно · 5–11 класс
          </p>
          <h1>
            <GameMark game={game} className="text-[clamp(44px,8vw,76px)]" />
          </h1>
          <p className="t-sub max-w-[54ch] text-muted">{TAGLINE[game]}</p>
        </div>
        <div className="flex -rotate-2 flex-col items-center gap-1 justify-self-start rounded-[6px] bg-tint px-6 py-4 shadow-sticker sm:justify-self-end">
          <span className="t-mono text-[11px] text-hue">альбом стикеров</span>
          <span className="t-display tnum text-[40px] leading-none">
            {stickers}
            <span className="text-[22px] text-ink/50">/{total || '—'}</span>
          </span>
        </div>
      </header>

      <XpMeter xp={xp.data?.xp} />

      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.isPending && <Skeleton className="h-[520px]" />}
      {q.data && game === 'lingo' && q.data.levels ? (
        <LingoLevels data={q.data} />
      ) : (
        q.data && (
          <ol className="m-0 flex list-none flex-col gap-7 p-0">
            {q.data.units.map((u, i) => (
              <Chapter key={u.id} u={u} index={i} game={game} next={q.data!.next} />
            ))}
          </ol>
        )
      )}
      <ChatLauncher game={game} where={meta.name.join('')} />

      <LeagueBoard />
      <p className="rounded-[10px] bg-bone px-4 py-3 text-[15px] text-muted">
        {game === 'lingo'
          ? 'Уровни как в учебниках English File и Face2Face: Starter → A1 → A2 → B1. В разделе — три словарика, фразы, грамматика и контрольная. Застрял — подскажем уровень пониже, легко — повыше.'
          : 'Главы открыты все — начинайте со своего класса. Уровни в главе идут по порядку: Разминка, Тренировка, Испытание.'}{' '}
        Прогресс сохраняется, а после входа в аккаунт — на всех устройствах.
      </p>
    </Container>
  );
}

/** СпектрLingo: уровни как в учебниках, выбор уровня, тест и мягкий совет «полегче / посложнее». */
function LingoLevels({ data }: { data: GameMap }) {
  const [params, setParams] = useSearchParams();
  const levels = data.levels!;
  const started = data.units.some((u) => u.lessons.some((l) => l.done));
  const fromUrl = params.get('level');
  const [level, setLevel] = useState<string | null>(() => (fromUrl && levels.some((l) => l.id === fromUrl) ? fromUrl : savedEnLevel()));
  useEffect(() => {
    if (fromUrl && levels.some((l) => l.id === fromUrl)) {
      setLevel(fromUrl);
      saveEnLevel(fromUrl);
    }
  }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (id: string) => {
    setLevel(id);
    saveEnLevel(id);
    setParams({ level: id }, { replace: true });
  };
  // уровень ещё не выбран и уроков не было — предлагаем выбрать или пройти тест
  if (!level && !started)
    return (
      <section className="flex flex-col gap-5" aria-label="Выбор уровня">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="t-display t-md">С какого уровня начнём?</h2>
          <Link to="/games/lingo/test" className="press print-shadow inline-flex h-12 items-center rounded-[10px] bg-ink px-5 text-[15px] font-[650] text-paper no-underline hover:bg-mark hover:text-forest">
            Тест на уровень · 3 минуты
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {levels.map((l, i) => (
            <button key={l.id} type="button" onClick={() => choose(l.id)} className={clsx(`hue-${[3, 2, 1, 5][i]}`, 'press tape relative flex flex-col items-start gap-2 rounded-[8px] bg-tint p-5 text-left shadow-sticker transition-transform hover:-rotate-1')}>
              <span className="t-display text-[30px] leading-none">{l.id === 'Starter' ? 'Starter' : l.id}</span>
              <span className="t-mono text-[12px] text-hue">{l.title} · {l.units} разделов</span>
              <span className="text-[15px] text-ink/80">{l.about}</span>
            </button>
          ))}
        </div>
      </section>
    );
  const current = levels.find((l) => l.id === level) ?? levels[0]!;
  const idx = levels.indexOf(current);
  const units = data.units.filter((u) => u.level === current.id);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Уровень">
        {levels.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === current.id}
            onClick={() => choose(l.id)}
            className={clsx('press rounded-full px-4 py-2 text-[15px] font-[600]', l.id === current.id ? 'bg-ink text-paper' : 'border border-ink/25 hover:bg-ink/[0.06]')}
          >
            {l.id}
          </button>
        ))}
        <Link to="/games/lingo/test" className="link ml-auto text-[14px]">
          Тест на уровень
        </Link>
      </div>
      <p className="text-[15.5px] text-muted">{current.about}</p>
      {current.struggle && idx > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] bg-butter px-4 py-3">
          <p className="mr-auto text-[15.5px]">
            Похоже, <b>{current.id}</b> пока тяжеловат — последние уроки на {Math.round((current.accuracy ?? 0) * 100)}%. Это нормально! Укрепим базу уровнем ниже?
          </p>
          <button type="button" onClick={() => choose(levels[idx - 1]!.id)} className="press rounded-[8px] bg-ink px-4 py-2 text-[14.5px] font-[650] text-paper">
            Перейти на {levels[idx - 1]!.id}
          </button>
        </div>
      )}
      {current.easy && idx < levels.length - 1 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[8px] bg-[var(--tint-raw-3)] px-4 py-3">
          <p className="mr-auto text-[15.5px]">Слишком легко? Последние уроки — почти без ошибок. Можно попробовать {levels[idx + 1]!.id}.</p>
          <button type="button" onClick={() => choose(levels[idx + 1]!.id)} className="press rounded-[8px] bg-ink px-4 py-2 text-[14.5px] font-[650] text-paper">
            Попробовать {levels[idx + 1]!.id}
          </button>
        </div>
      )}
      <ol className="m-0 flex list-none flex-col gap-7 p-0">
        {units.map((u) => (
          <Chapter key={u.id} u={u} index={data.units.indexOf(u)} game="lingo" next={data.next} />
        ))}
      </ol>
    </section>
  );
}

function Chapter({ u, index, game, next }: { u: CourseUnit; index: number; game: GameKey; next: string | null }) {
  const done = u.lessons.filter((l) => l.done).length;
  return (
    <li className={`hue-${u.hue} relative grid gap-5 overflow-hidden rounded-[8px] border-[1.5px] border-ink/10 bg-paper p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7`}>
      <span className="graph-paper pointer-events-none absolute inset-0" aria-hidden="true" />
      <span className="absolute inset-y-0 left-0 w-1.5 bg-ray" aria-hidden="true" />
      <div className="relative flex flex-col gap-2 pl-2">
        <p className="t-mono text-[11.5px] text-hue">
          {game === 'lingo' ? `раздел ${index + 1} · ${u.level}` : u.level} · {u.grades[0] === u.grades[1] ? `${u.grades[0]} класс` : `${u.grades[0]}–${u.grades[1]} класс`}
        </p>
        <h2 className="t-heading flex items-center gap-2.5 text-[25px] leading-tight">
          <span aria-hidden="true">{u.icon}</span>
          {u.title}
          {game === 'lingo' && <span className="text-[18px] font-[500] text-ink/55">· {u.ru}</span>}
        </h2>
        <p className="max-w-[48ch] text-[14.5px] text-ink/70">{game === 'lingo' ? `Грамматика: ${u.grammar}` : u.ru}</p>
        <div className="mt-1 flex h-2 max-w-[220px] gap-1" aria-label={`Пройдено ${done} из ${u.lessons.length}`}>
          {u.lessons.map((l, k) => (
            <span key={l.id} className="flex-1 rounded-full" style={{ background: l.done ? `var(--ray-${(u.hue + k) % 7})` : 'rgb(26 51 0 / 0.1)' }} />
          ))}
        </div>
      </div>
      <div className="relative flex flex-wrap gap-3 sm:gap-4">
        {u.lessons.map((l, k) => {
          const state = l.done ? 'done' : l.open ? 'open' : 'locked';
          const current = l.id === next;
          const slot = (
            <span className="flex w-[84px] flex-col items-center gap-1.5">
              {state === 'done' ? (
                <motion.span
                  initial={false}
                  whileHover={{ rotate: 0, scale: 1.06 }}
                  className="tape relative grid size-[78px] place-items-center rounded-[14px] bg-tint text-[38px] shadow-sticker"
                  style={{ rotate: `${[-5, 4, -3, 6][k % 4]}deg` }}
                >
                  {u.icon}
                  {l.perfect && (
                    <span className="absolute -right-2 -bottom-2 grid size-7 place-items-center rounded-full bg-ink text-mark">
                      <Star className="size-3.5 fill-current" />
                    </span>
                  )}
                </motion.span>
              ) : (
                <span
                  className={clsx(
                    'relative grid size-[78px] place-items-center rounded-[14px] border-2 border-dashed',
                    state === 'open' ? 'border-ink/50 bg-paper text-ink group-hover:bg-mark' : 'border-ink/15 text-ink/25',
                    current && 'border-solid border-ink bg-mark',
                  )}
                >
                  {state === 'locked' ? <Lock className="size-6" /> : <Play className="size-7 fill-current" />}
                  {current && (
                    <motion.span className="absolute -inset-1.5 rounded-[18px] border-2 border-[var(--r)]" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.8 }} aria-hidden="true" />
                  )}
                </span>
              )}
              <span className={clsx('text-center text-[12.5px] leading-tight font-[600]', state === 'locked' ? 'text-muted' : 'text-ink')}>{l.title}</span>
            </span>
          );
          return state === 'locked' ? (
            <span key={l.id} title="Откроется после предыдущего уровня" aria-label={`${l.title}: откроется после предыдущего уровня`} className="cursor-not-allowed">
              {slot}
            </span>
          ) : (
            <Link key={l.id} to={`/games/${game}/play/${l.id}`} className="group no-underline" aria-label={`${u.title}, ${l.title}${l.done ? ': пройден, сыграть ещё' : ''}`}>
              {slot}
            </Link>
          );
        })}
      </div>
    </li>
  );
}
