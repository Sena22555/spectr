import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Link2, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDay, fmtTime, STATUS_LABEL } from '../../lib/format';
import { haptic } from '../../lib/platform';
import { Badge, Button } from '../../components/ui';
import type { Lesson } from '../../lib/types';

/** Строка занятия для преподавателя: ссылка редактируется прямо в строке */
export function TeacherLessonRow({ lesson, showDate }: { lesson: Lesson; showDate?: boolean }) {
  const qc = useQueryClient();
  const [link, setLink] = useState(lesson.link ?? '');
  const [editing, setEditing] = useState(!lesson.link && lesson.status === 'SCHEDULED');
  const hue = lesson.group?.hue ?? 5;
  const pending = (lesson.reschedules?.length ?? 0) > 0;

  const update = useMutation({
    mutationFn: (data: Partial<Pick<Lesson, 'link' | 'status'>>) => api(`/teacher/lessons/${lesson.id}`, { method: 'PATCH', json: data }),
    onSuccess: () => {
      haptic('success');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['teacher'] });
    },
  });

  return (
    <li className={clsx(`hue-${hue}`, 'grid gap-3 border-b border-hair-soft py-4 sm:grid-cols-[96px_1fr_minmax(0,360px)] sm:items-center sm:gap-5 [&>*]:min-w-0')}>
      <div className="flex items-baseline gap-3 sm:flex-col sm:gap-0">
        <span className={clsx('t-heading tnum text-[32px]', lesson.status !== 'SCHEDULED' && 'text-muted')}>{fmtTime(lesson.startsAt)}</span>
        {showDate && <span className="t-caption text-muted">{fmtDay(lesson.startsAt)}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-start gap-2 text-[18px] font-[450]">
          <span className="mt-1 h-4 w-1 shrink-0 rounded-full bg-ray" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{lesson.group?.name ?? lesson.student?.name ?? lesson.title}</span>
        </p>
        <p className="t-caption flex items-center gap-2 text-muted">
          {lesson.group ? (
            <>
              <UsersRound className="size-3.5" strokeWidth={1.7} /> группа · {lesson.group._count?.members ?? '—'} чел.
            </>
          ) : (
            'индивидуально'
          )}
          · {lesson.durationMin} мин
        </p>
        <div className="flex flex-wrap gap-2">
          {lesson.status !== 'SCHEDULED' && <Badge>{STATUS_LABEL[lesson.status]}</Badge>}
          {pending && <Badge tone="ember">Просят перенос</Badge>}
          {!lesson.link && lesson.status === 'SCHEDULED' && <Badge tone="outline">Нет ссылки</Badge>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ link });
            }}
          >
            <label className="sr-only" htmlFor={`link-${lesson.id}`}>
              Ссылка на занятие
            </label>
            <input
              id={`link-${lesson.id}`}
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://telemost.yandex.ru/…"
              className="h-11 min-w-0 flex-1 rounded-ctl border border-ink bg-paper px-3 text-[15px] placeholder:text-muted"
            />
            <Button type="submit" loading={update.isPending} className="min-h-11 px-4" aria-label="Сохранить ссылку">
              <Check className="size-4" />
            </Button>
          </form>
        ) : lesson.link ? (
          <div className="flex items-center gap-3">
            <a href={lesson.link} target="_blank" rel="noreferrer" className="link inline-flex min-w-0 items-center gap-1.5 text-[15px]">
              <Link2 className="size-4 shrink-0" strokeWidth={1.7} />
              <span className="truncate">{lesson.link.replace(/^https?:\/\//, '')}</span>
            </a>
            <button className="link shrink-0 text-[15px]" onClick={() => setEditing(true)}>
              Изменить
            </button>
          </div>
        ) : null}
        {update.error && <p className="t-caption text-ember-text">{(update.error as Error).message}</p>}
        {lesson.status === 'SCHEDULED' && new Date(lesson.startsAt).getTime() < Date.now() && (
          <div className="flex gap-3">
            <button className="link text-[15px]" onClick={() => update.mutate({ status: 'DONE' })}>
              Отметить проведённым
            </button>
            <button className="link text-[15px] text-ember-text" onClick={() => update.mutate({ status: 'CANCELLED' })}>
              Не состоялось
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
