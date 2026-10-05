import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import clsx from 'clsx';
import { LogoMark } from '../Logo';
import { GAME_META, type GameKey } from '../../lib/games';
import { sfx } from '../../lib/game';
import { speak } from '../../lib/english';

/** Название игры: «Спектр» + «Lingo», «Мат» + «Игра» — вторая часть цветом игры, курсивом. */
export function GameMark({ game, className }: { game: GameKey; className?: string }) {
  const m = GAME_META[game];
  return (
    <span className={clsx('t-display inline-flex items-baseline leading-none', className)}>
      {m.name[0]}
      <span className="italic" style={{ color: `var(--ray-${m.hue})` }}>
        {m.name[1]}
      </span>
    </span>
  );
}

export type BeamCell = 'todo' | 'now' | 'ok' | 'almost';

/**
 * Луч: каждая верная карточка добавляет свой цвет спектра, луч входит в призму.
 * Когда все цвета собраны — призма вспыхивает.
 */
export function Beam({ cells, full }: { cells: BeamCell[]; full: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={cells.length} aria-valuenow={cells.filter((c) => c === 'ok').length} aria-label="Луч урока">
      <div className="flex h-3.5 min-w-0 flex-1 items-center gap-[3px] rounded-full bg-ink/[0.06] p-[3px]">
        {cells.map((c, i) => (
          <motion.span
            key={i}
            className={clsx('h-full flex-1 rounded-full', c === 'todo' && 'bg-ink/10', c === 'now' && 'bg-ink/25')}
            style={c === 'ok' ? { background: `var(--ray-${i % 7})` } : c === 'almost' ? { background: 'repeating-linear-gradient(135deg, var(--ray-2) 0 3px, var(--butter) 3px 6px)' } : undefined}
            initial={false}
            animate={c === 'now' ? { opacity: [0.5, 1, 0.5] } : { opacity: 1, scaleY: c === 'ok' ? [1.6, 1] : 1 }}
            transition={c === 'now' ? { repeat: Infinity, duration: 1.4 } : { duration: 0.35 }}
          />
        ))}
      </div>
      <motion.span animate={full ? { rotate: [0, -12, 12, 0], scale: [1, 1.25, 1] } : {}} transition={{ duration: 0.8 }} className="shrink-0">
        <LogoMark className="h-7 w-9" title="" />
      </motion.span>
    </div>
  );
}

/** Печать учителя на карточке: «ВЕРНО» зелёными чернилами или «ПОЧТИ» жёлтыми. */
export function Stamp({ kind }: { kind: 'ok' | 'almost' | null }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {kind && (
        <motion.span
          key={kind}
          aria-hidden="true"
          className={clsx(
            't-display pointer-events-none absolute -top-3 right-3 z-10 grid size-[104px] place-items-center rounded-full border-[5px] border-double text-center text-[19px] leading-none tracking-wider mix-blend-multiply sm:right-6',
            kind === 'ok' ? 'border-[var(--ink-3)] text-[var(--ink-3)]' : 'border-[var(--ray-1)] text-[var(--ink-1)]',
          )}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 2.3, rotate: -30 }}
          animate={{ opacity: 0.92, scale: 1, rotate: kind === 'ok' ? -14 : 10 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        >
          <span>
            {kind === 'ok' ? 'ВЕРНО' : 'ПОЧТИ'}
            <span className="mt-1 block text-[10px] tracking-[0.2em]">{kind === 'ok' ? '★ ★ ★' : 'ещё раз'}</span>
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** «Найди пару»: карточки лежат рубашкой вверх, открываем по две. */
export function Memory({ pairs, onDone, onMiss, speakLeft }: { pairs: [string, string][]; onDone(): void; onMiss(): void; speakLeft?: boolean }) {
  const cards = useMemo(
    () =>
      pairs
        .flatMap(([a, b], i) => [
          { key: `${i}a`, pair: i, text: a, left: true },
          { key: `${i}b`, pair: i, text: b, left: false },
        ])
        .sort(() => Math.random() - 0.5),
    [pairs],
  );
  const [open, setOpen] = useState<string[]>([]);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open.map((k) => cards.find((c) => c.key === k)!);
    setBusy(true);
    if (a!.pair === b!.pair) {
      sfx('tap');
      if (speakLeft) speak((a!.left ? a : b)!.text);
      const nf = new Set(found).add(a!.pair);
      setTimeout(() => {
        setFound(nf);
        setOpen([]);
        setBusy(false);
        if (nf.size === pairs.length) setTimeout(onDone, 300);
      }, 350);
    } else {
      onMiss();
      setTimeout(() => {
        setOpen([]);
        setBusy(false);
      }, 850);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {cards.map((c, i) => {
        const shown = open.includes(c.key) || found.has(c.pair);
        const done = found.has(c.pair);
        return (
          <button
            key={c.key}
            type="button"
            disabled={busy || shown}
            onClick={() => setOpen((o) => [...o, c.key])}
            className="relative h-[86px] [perspective:600px]"
            aria-label={shown ? c.text : 'Закрытая карточка'}
          >
            <motion.span className="absolute inset-0 [transform-style:preserve-3d]" initial={false} animate={{ rotateY: shown ? 180 : 0 }} transition={{ duration: 0.35 }}>
              <span className="absolute inset-0 grid place-items-center overflow-hidden rounded-[12px] border-[1.5px] border-ink/15 bg-paper shadow-[0_3px_0_rgba(26,51,0,0.12)] [backface-visibility:hidden]">
                <span className="graph-paper absolute inset-0" aria-hidden="true" />
                <span className="relative size-6 rounded-full" style={{ background: `var(--ray-${i % 7})` }} />
              </span>
              <span
                className={clsx(
                  'absolute inset-0 grid place-items-center rounded-[12px] border-[1.5px] px-2 text-center text-[15px] leading-tight font-[600] [backface-visibility:hidden] [transform:rotateY(180deg)]',
                  done ? 'border-transparent bg-[var(--tint-raw-3)]' : 'border-ink bg-mark',
                )}
              >
                {c.text}
              </span>
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}

/** Таймер блиц-карточки: кольцо тает, по нулю — «время вышло». */
export function BlitzTimer({ seconds, running, onEnd }: { seconds: number; running: boolean; onEnd(): void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      onEnd();
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, running]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <span className={clsx('t-heading tnum inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14px]', left <= 5 && running ? 'bg-butter text-[var(--ink-2)]' : 'bg-[var(--tint-raw-0)] text-[var(--ink-0)]')} aria-label={`Блиц: осталось ${left} секунд`}>
      <svg viewBox="0 0 36 36" className="size-5 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="5" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray={c} strokeDashoffset={c * (1 - left / seconds)} />
      </svg>
      блиц · {left}
    </span>
  );
}
