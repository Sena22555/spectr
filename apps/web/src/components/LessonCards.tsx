import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowUpRight, Clock, Video } from 'lucide-react';
import { Badge, Button, Input, Textarea } from './ui';
import { api } from '../lib/api';
import { fmtDay, fmtTime, relativeDay, toLocalInput, untilLabel, STATUS_LABEL } from '../lib/format';
import { haptic } from '../lib/platform';
import type { Lesson } from '../lib/types';

function hueOf(l: Lesson) {
  return l.group?.hue ?? l.teacher?.hue ?? 2;
}

/** Ссылка на занятие активна за 15 минут до начала и до конца урока */
function linkState(l: Lesson) {
  const start = new Date(l.startsAt).getTime();
  const end = start + l.durationMin * 60_000;
  const now = Date.now();
  if (!l.link) return 'none' as const;
  if (now >= start - 15 * 60_000 && now <= end) return 'live' as const;
  return 'later' as const;
}

export function NextLesson({ lesson }: { lesson: Lesson }) {
  const hue = hueOf(lesson);
  const state = linkState(lesson);
  const pending = lesson.reschedules?.some((r) => r.status === 'PENDING');
  return (
    <article className={clsx(`hue-${hue}`, 'flex flex-col gap-5 rounded-card border-t-[4px] border-ray bg-tint p-5 sm:p-8')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="t-caption text-hue">Ближайшее занятие · {untilLabel(lesson.startsAt)}</p>
        {pending && <Badge tone="outline">Перенос на рассмотрении</Badge>}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="t-display tnum text-[clamp(64px,14vw,112px)] text-hue">{fmtTime(lesson.startsAt)}</p>
        <p className="t-heading pb-2 text-[26px]">
          {relativeDay(lesson.startsAt)}, {fmtDay(lesson.startsAt)}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="t-heading text-[28px]">{lesson.group?.name ?? lesson.title}</h3>
        <p className="text-[16px] text-ink/80">
          {lesson.teacher?.subject} · {lesson.teacher?.user.name} · {lesson.durationMin} мин
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {state === 'live' ? (
          <a href={lesson.link!} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center gap-2 rounded-ctl bg-ink px-5 text-paper no-underline" onClick={() => haptic('success')}>
            <Video className="size-5" strokeWidth={1.7} /> Подключиться
          </a>
        ) : state === 'later' ? (
          <span className="inline-flex min-h-12 items-center gap-2 rounded-ctl border border-ink/40 px-5 text-[16px] text-ink/80">
            <Clock className="size-4" strokeWidth={1.7} /> Ссылка откроется за 15 минут
          </span>
        ) : (
          <span className="inline-flex min-h-12 items-center gap-2 rounded-ctl border border-dashed border-ink/50 px-5 text-[16px] text-ink/80">
            Преподаватель ещё не добавил ссылку
          </span>
        )}
        <Link to={`/app/requests?lesson=${lesson.id}`} className="link inline-flex min-h-12 items-center">
          Перенести
        </Link>
      </div>
    </article>
  );
}

/** Строка расписания в духе «Project Metadata Row»: время, маркер тона, предмет */
export function LessonRow({ lesson, showDate = false, onReschedule }: { lesson: Lesson; showDate?: boolean; onReschedule?: boolean }) {
  const [open, setOpen] = useState(false);
  const hue = hueOf(lesson);
  const state = linkState(lesson);
  const past = lesson.status !== 'SCHEDULED';
  const pending = lesson.reschedules?.some((r) => r.status === 'PENDING');

  return (
    <li className={clsx(`hue-${hue}`, 'border-b border-hair-soft')}>
      <div className="grid grid-cols-[76px_1fr] gap-x-4 gap-y-2 py-4 sm:grid-cols-[96px_1fr_auto] sm:items-center">
        <div className="flex flex-col">
          <span className={clsx('t-heading tnum text-[30px] sm:text-[34px]', past && 'text-muted line-through decoration-1')}>{fmtTime(lesson.startsAt)}</span>
          {showDate && <span className="t-caption text-muted">{fmtDay(lesson.startsAt)}</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[2px] bg-hue" aria-hidden="true" />
            <p className="truncate text-[18px] font-[450]">{lesson.group?.name ?? lesson.title}</p>
          </div>
          <p className="t-caption text-muted">
            {lesson.teacher ? `${lesson.teacher.subject} · ${lesson.teacher.user.name}` : lesson.student?.name} · {lesson.durationMin} мин
            {lesson.group && !lesson.teacher ? ' · группа' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {lesson.status !== 'SCHEDULED' && <Badge>{STATUS_LABEL[lesson.status]}</Badge>}
            {pending && <Badge tone="outline">Перенос на рассмотрении</Badge>}
          </div>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-1 sm:justify-end">
          {!past && state === 'live' && (
            <a href={lesson.link!} target="_blank" rel="noreferrer" className="press inline-flex min-h-11 items-center gap-2 rounded-ctl bg-ink px-4 text-[16px] text-paper no-underline">
              <Video className="size-4" strokeWidth={1.7} /> Подключиться
            </a>
          )}
          {!past && state === 'later' && (
            <a href={lesson.link!} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 items-center gap-1 text-[16px]">
              Ссылка на урок <ArrowUpRight className="size-4" strokeWidth={1.7} />
            </a>
          )}
          {!past && state === 'none' && <span className="t-caption text-muted">Ссылки пока нет</span>}
          {!past && onReschedule && !pending && (
            <button className="link min-h-11 text-[16px]" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? 'Отмена' : 'Перенести'}
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            <RescheduleForm lesson={lesson} onDone={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function RescheduleForm({ lesson, onDone }: { lesson: Lesson; onDone(): void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [proposed, setProposed] = useState(() => toLocalInput(new Date(new Date(lesson.startsAt).getTime() + 86_400_000)));
  const m = useMutation({
    mutationFn: () =>
      api('/me/reschedules', {
        method: 'POST',
        json: { lessonId: lesson.id, reason, proposedAt: proposed ? new Date(proposed).toISOString() : undefined },
      }),
    onSuccess: () => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['reschedules'] });
      onDone();
    },
    onError: () => haptic('error'),
  });
  return (
    <form
      className="mb-5 grid gap-4 rounded-card bg-tint p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Textarea
        label="Почему нужно перенести"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Например: в этот день контрольная в школе"
        required
        minLength={3}
        className="sm:col-span-2"
      />
      <Input label="Удобное время" type="datetime-local" value={proposed} onChange={(e) => setProposed(e.target.value)} hint="Преподаватель подтвердит или предложит другое" />
      <div className="flex items-end">
        <Button type="submit" loading={m.isPending} className="w-full sm:w-auto">
          Отправить заявку
        </Button>
      </div>
      {m.error && <p className="t-caption text-ember-text sm:col-span-2">{(m.error as Error).message}</p>}
    </form>
  );
}
