import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { useState } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { levelOf, setSound, sfx, soundOn, type Xp } from '../../lib/game';
import { Burst } from './Burst';

const COLOR_NAMES = ['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Голубой', 'Синий', 'Фиолетовый'];

/** Значок уровня: кружок цвета спектра с номером. */
export function LevelBadge({ level, hue, size = 44 }: { level: number; hue: number; size?: number }) {
  return (
    <span
      className="t-heading tnum relative grid shrink-0 place-items-center rounded-full text-paper shadow-[inset_0_-3px_0_rgba(0,0,0,0.18)]"
      style={{ width: size, height: size, background: `var(--ray-${hue})`, fontSize: size * 0.42 }}
      aria-label={`Уровень ${level}`}
    >
      {level}
    </span>
  );
}

/** Кольцо цели дня. */
function GoalRing({ value, goal }: { value: number; goal: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, value / goal);
  const done = value >= goal;
  return (
    <span className="relative grid size-11 shrink-0 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="var(--color-ink, #1a3300)" strokeOpacity="0.1" strokeWidth="5" />
        <motion.circle cx="22" cy="22" r={r} fill="none" stroke={done ? 'var(--ray-3)' : 'var(--ray-1)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - p) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </svg>
      <span className="text-[15px]">{done ? '✓' : '⚡'}</span>
    </span>
  );
}

/**
 * Табло опыта: уровень, полоска до следующего и цель дня.
 * `extra` — опыт, набранный на странице, пока сервер ещё не пересчитал.
 */
export function XpMeter({ xp, extra = 0, compact, className }: { xp: Xp | undefined; extra?: number; compact?: boolean; className?: string }) {
  const [sound, setS] = useState(soundOn);
  const total = (xp?.total ?? 0) + extra;
  const today = (xp?.today ?? 0) + extra;
  const goal = xp?.goal ?? 50;
  const lv = levelOf(total);
  const pct = Math.min(100, ((total - lv.from) / (lv.to - lv.from)) * 100);
  return (
    <div className={clsx('flex items-center gap-3 rounded-[14px] bg-bone px-3 py-2.5', className)}>
      <LevelBadge level={lv.level} hue={lv.hue} size={compact ? 36 : 44} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-[650]">
            {COLOR_NAMES[lv.hue]} луч{lv.level > 7 ? ` · ${Math.floor((lv.level - 1) / 7) + 1}-й круг` : ''}
          </span>
          <span className="t-mono tnum shrink-0 text-[11.5px] text-muted">
            {total - lv.from} / {lv.to - lv.from} XP
          </span>
        </div>
        <span className="block h-2.5 overflow-hidden rounded-full bg-ink/10">
          <motion.span className="block h-full rounded-full" style={{ background: `var(--ray-${lv.hue})` }} initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 140, damping: 22 }} />
        </span>
      </div>
      {!compact && (
        <div className="flex items-center gap-2 border-l border-dashed border-ink/20 pl-3" title="Цель дня">
          <GoalRing value={today} goal={goal} />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="t-mono text-[11px] text-muted">цель дня</span>
            <span className="tnum text-[14px] font-[650]">
              {Math.min(today, goal)}/{goal}
            </span>
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setSound(!sound);
          setS(!sound);
          if (!sound) sfx('tap');
        }}
        className="press grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
        aria-label={sound ? 'Выключить звук' : 'Включить звук'}
        aria-pressed={sound}
      >
        {sound ? <Volume2 className="size-4.5" /> : <VolumeX className="size-4.5" />}
      </button>
    </div>
  );
}

/** Окно «Новый уровень!». */
export function LevelUp({ level, onClose }: { level: number | null; onClose(): void }) {
  const hue = level ? (level - 1) % 7 : 0;
  return (
    <AnimatePresence>
      {level && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-forest/40 p-4 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Новый уровень"
            className="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-[18px] bg-paper p-8 text-center shadow-sticker"
            initial={{ scale: 0.8, y: 20, rotate: -2 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={onClose} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full hover:bg-ink/[0.06]" aria-label="Закрыть">
              <X className="size-5" />
            </button>
            <Burst fire={level} count={36} spread={220} className="left-1/2 top-[38%]" />
            <span className="spectrum-bar h-2 w-24 rounded-full" aria-hidden="true" />
            <p className="t-mono text-[12px] text-muted">новый уровень</p>
            <LevelBadge level={level} hue={hue} size={96} />
            <p className="t-display text-[30px] leading-tight">
              {COLOR_NAMES[hue]} луч{level > 7 ? ` · ${Math.floor((level - 1) / 7) + 1}-й круг` : ''}
            </p>
            <p className="text-[16px] text-muted">{hue === 6 ? 'Вся радуга собрана! Дальше — новый круг спектра.' : `До полной радуги осталось ${6 - hue} ${6 - hue === 1 ? 'цвет' : 6 - hue < 5 ? 'цвета' : 'цветов'}.`}</p>
            <button type="button" onClick={onClose} className="press mt-2 h-12 rounded-ctl bg-ink px-6 text-[15px] font-[600] text-paper hover:bg-mark hover:text-forest">
              Дальше
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
