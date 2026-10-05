import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { Container } from '../../components/Layout';
import { ErrorNote, Loading } from '../../components/ui';
import { GameMark } from '../../components/games/parts';
import { api } from '../../lib/api';
import { saveEnLevel } from '../../lib/games';
import { sfx } from '../../lib/game';
import { usePageTitle } from '../../lib/title';

interface Item {
  level: 'Starter' | 'A1' | 'A2' | 'B1';
  sentence: string;
  options: string[];
  answer: number;
  ru: string;
  full: string;
}
const ORDER = ['Starter', 'A1', 'A2', 'B1'] as const;
const NAMES: Record<string, string> = { Starter: 'Starter — с нуля', A1: 'A1 — начальный', A2: 'A2 — базовый', B1: 'B1 — средний' };

/** Тест на уровень СпектрLingo: 16 вопросов от простого к сложному. Без оценок — только совет, с чего начать. */
export default function Placement() {
  usePageTitle('Тест на уровень английского');
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['placement'], queryFn: () => api<{ items: Item[] }>('/english/placement'), staleTime: Infinity, gcTime: 0 });
  const [i, setI] = useState(0);
  const [score, setScore] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<number | null>(null);

  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} />
      </Container>
    );
  const items = q.data.items;
  const done = i >= items.length;
  // уровень пройден, если на нём верно 3 из 4; начинаем с первого непройденного
  const result = ORDER.find((l) => (score[l] ?? 0) < 3) ?? 'B1';
  const item = items[i];

  const choose = (k: number) => {
    if (picked !== null || !item) return;
    setPicked(k);
    const ok = k === item.answer;
    sfx(ok ? 'correct' : 'tap');
    if (ok) setScore((s) => ({ ...s, [item.level]: (s[item.level] ?? 0) + 1 }));
    setTimeout(() => {
      setPicked(null);
      setI((n) => n + 1);
    }, 650);
  };

  return (
    <Container className="flex max-w-[720px] flex-col gap-7 pt-8 pb-16">
      <Link to="/games/lingo" className="t-mono inline-flex w-fit items-center gap-1.5 text-[12px] text-muted no-underline hover:text-ink">
        <ArrowLeft className="size-3.5" /> <GameMark game="lingo" className="text-[14px]" />
      </Link>
      {!done && item ? (
        <>
          <header className="flex flex-col gap-3">
            <p className="t-mono text-[12px] text-muted">
              вопрос {i + 1} из {items.length} · без оценок, просто подбираем уровень
            </p>
            <div className="flex h-2 gap-1">
              {items.map((_, k) => (
                <span key={k} className="flex-1 rounded-full" style={{ background: k < i ? `var(--ray-${k % 7})` : 'rgb(26 51 0 / 0.1)' }} />
              ))}
            </div>
          </header>
          <AnimatePresence mode="wait">
            <motion.article key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="tape relative flex flex-col gap-5 rounded-[6px] border-[1.5px] border-ink/12 bg-paper p-7 shadow-sticker">
              <p className="t-display text-[clamp(22px,4.4vw,28px)] leading-snug">
                {item.sentence.split('___')[0]}
                <span className="mx-1 inline-block min-w-[80px] border-b-[3px] border-dashed border-ink/40 text-center">{picked !== null ? item.options[picked] : ' '}</span>
                {item.sentence.split('___')[1]}
              </p>
              <p className="text-[15px] text-muted italic">{item.ru}</p>
              <div className="flex flex-wrap gap-2.5">
                {item.options.map((o, k) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => choose(k)}
                    className={clsx(
                      'press min-h-12 rounded-[8px] border-[1.5px] px-5 text-[17px]',
                      picked === null ? 'border-ink/20 hover:bg-mark' : k === item.answer ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : picked === k ? 'border-[var(--ray-2)] bg-butter' : 'border-ink/10 opacity-60',
                    )}
                  >
                    {o}
                  </button>
                ))}
                <button type="button" onClick={() => setI((n) => n + 1)} className="link text-[14px] text-muted">
                  Не знаю
                </button>
              </div>
            </motion.article>
          </AnimatePresence>
        </>
      ) : (
        <section className="flex flex-col items-start gap-5">
          <p className="t-mono text-[12px] text-muted">итог теста</p>
          <h1 className="t-display t-lg">
            Начнём с <mark>{NAMES[result]}</mark>
          </h1>
          <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
            {ORDER.map((l) => (
              <li key={l} className="flex items-center justify-between gap-3 border-b border-dashed border-hair-soft py-2 text-[16px]">
                <span>{NAMES[l]}</span>
                <span className="t-mono tnum">{score[l] ?? 0} из 4 {(score[l] ?? 0) >= 3 ? '✓' : ''}</span>
              </li>
            ))}
          </ul>
          <p className="text-[15.5px] text-muted">Уровень можно сменить в любой момент вкладками сверху. Если станет тяжело — подскажем перейти пониже, если легко — повыше.</p>
          <button
            type="button"
            onClick={() => {
              saveEnLevel(result);
              navigate(`/games/lingo?level=${result}`);
            }}
            className="press print-shadow h-14 rounded-[10px] bg-ink px-8 text-[17px] font-[700] text-paper hover:bg-mark hover:text-forest"
          >
            Начать с {result}
          </button>
        </section>
      )}
    </Container>
  );
}
