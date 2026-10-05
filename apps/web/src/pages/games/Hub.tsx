import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { ArrowRight, Medal, Swords, Target } from 'lucide-react';
import { Container } from '../../components/Layout';
import { Chip, Skeleton } from '../../components/ui';
import { LogoMark } from '../../components/Logo';
import { XpMeter } from '../../components/game/XpMeter';
import { LeagueBoard } from '../../components/game/League';
import { GameMark } from '../../components/games/parts';
import { GAME_KEYS, useGamesHub } from '../../lib/games';
import { useGame } from '../../lib/game';
import { isMiniApp } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';

const HOW = [
  ['🃏', 'Карточки', 'Каждый уровень — 8 карточек: задача, выбор, «прав ли одноклассник», найди пару, расставь по порядку.'],
  ['🌈', 'Луч', 'Верная карточка добавляет цвет в луч. Соберите все — призма вспыхнет.'],
  ['🖋️', 'Печать', 'Учитель ставит «ВЕРНО» или «ПОЧТИ». «Почти» разбираем на полях, карточка вернётся в конце.'],
  ['🏷️', 'Стикеры', 'За уровень — стикер в альбом, без ошибок — золотой. Соберите тетрадь целиком.'],
];

/** «Игры Спектра»: СпектрLingo, МатИгра, ФизИгра, КодИгра — общая витрина. */
export default function Hub() {
  usePageTitle('Игры');
  const q = useGamesHub();
  const xp = useGame();
  const byId = new Map(q.data?.games.map((g) => [g.id, g]));

  return (
    <Container className={clsx('flex flex-col gap-12', isMiniApp ? 'pt-5 pb-10' : 'pt-8 pb-16 sm:pt-12')}>
      <header className="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <Chip hue={2} icon={<Target />}>
            бесплатно · 5–11 класс · без рекламы
          </Chip>
          <h1 className="t-display t-lg">
            Игры <mark>Спектра</mark>
          </h1>
          <p className="t-sub max-w-[54ch] text-muted">Четыре тетради-игры: английский, математика, физика и информатика. Уровень — 3–5 минут, задачи каждый раз новые, а за каждый уровень — стикер в альбом.</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
          {HOW.map(([icon, title, text], i) => (
            <li key={title} className={clsx('flex flex-col gap-1 rounded-[6px] bg-paper p-4 shadow-sticker', i % 2 ? 'rotate-1' : '-rotate-1')}>
              <span className="text-[24px]" aria-hidden="true">
                {icon}
              </span>
              <b className="t-heading text-[17px]">{title}</b>
              <span className="text-[13.5px] leading-snug text-ink/75">{text}</span>
            </li>
          ))}
        </ul>
      </header>

      <XpMeter xp={xp.data?.xp} />

      <section className="grid gap-6 sm:grid-cols-2" aria-label="Игры">
        {GAME_KEYS.map((key, i) => {
          const g = byId.get(key);
          if (!g)
            return q.isPending ? <Skeleton key={key} className="h-64" /> : null;
          const pct = g.total ? Math.round((g.stickers / g.total) * 100) : 0;
          return (
            <motion.div key={key} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 300, damping: 26 }}>
              <Link
                to={`/games/${key}`}
                className={clsx(`hue-${g.hue}`, 'tape group relative flex h-full flex-col gap-4 overflow-hidden rounded-[8px] bg-tint p-6 no-underline shadow-sticker transition-transform hover:rotate-0 sm:p-7', i % 2 ? 'rotate-[0.8deg]' : '-rotate-[0.8deg]')}
              >
                <span className="graph-paper pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
                <span className="relative flex items-start justify-between gap-3">
                  <span className="flex flex-col gap-1">
                    <span className="t-mono text-[11.5px] text-hue">{g.subject}</span>
                    <GameMark game={key} className="text-[clamp(34px,5vw,46px)]" />
                  </span>
                  <span className="grid size-16 shrink-0 place-items-center rounded-[14px] bg-paper text-[34px] shadow-sticker transition-transform group-hover:-rotate-6" aria-hidden="true">
                    {g.icon}
                  </span>
                </span>
                <span className="relative text-[15.5px] text-ink/80">{g.tagline}</span>
                <span className="relative mt-auto flex flex-col gap-2">
                  <span className="flex items-baseline justify-between text-[13.5px]">
                    <span>
                      {g.chapters} глав · стикеров {g.stickers}/{g.total}
                    </span>
                    <span className="inline-flex items-center gap-1 font-[650] group-hover:underline">
                      {g.stickers ? 'Продолжить' : 'Играть'} <ArrowRight className="size-4" />
                    </span>
                  </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-paper/80">
                    <span className="block h-full rounded-full bg-ray" style={{ width: `${Math.max(pct, g.stickers ? 4 : 0)}%` }} />
                  </span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <LeagueBoard />
        <div className="flex flex-col gap-3">
          <h2 className="t-heading text-[22px]">Ещё в Спектре</h2>
          {[
            { to: '/tournament', Icon: Medal, title: 'Турнир недели', text: '10 задач на 20 минут, сертификат каждому' },
            { to: '/practice/trainers', Icon: Swords, title: 'Вызов другу', text: 'Откройте тренажёр и бросьте вызов — 5 задач на время' },
          ].map(({ to, Icon, title, text }) => (
            <Link key={to} to={to} className="lift group flex items-start gap-3 rounded-[10px] bg-bone p-4 no-underline hover:-translate-y-0.5">
              <Icon className="mt-0.5 size-5 shrink-0" />
              <span className="flex flex-col">
                <span className="lift-title text-[17px] font-[650]">{title}</span>
                <span className="text-[14px] text-ink/75">{text}</span>
              </span>
            </Link>
          ))}
          <p className="mt-auto flex items-center gap-2 text-[13.5px] text-muted">
            <LogoMark className="h-6 w-8" title="" /> Опыт из всех игр, тренажёров и турниров складывается в один уровень.
          </p>
        </div>
      </div>
    </Container>
  );
}
