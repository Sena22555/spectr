import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { fmtFull, STATUS_LABEL } from '../../lib/format';
import { RescheduleForm } from '../../components/LessonCards';
import { Badge, Empty, ErrorNote, Loading, PageHeader, SectionTitle } from '../../components/ui';
import type { Lesson, RescheduleRequest } from '../../lib/types';

export default function Requests() {
  const [params, setParams] = useSearchParams();
  const lessonId = params.get('lesson');
  const q = useQuery({ queryKey: ['reschedules'], queryFn: () => api<{ requests: RescheduleRequest[] }>('/me/reschedules').then((r) => r.requests) });
  const upcoming = useQuery({
    queryKey: ['schedule', 'upcoming'],
    queryFn: () => api<{ lessons: Lesson[] }>(`/me/schedule?from=${new Date().toISOString()}`).then((r) => r.lessons),
    enabled: Boolean(lessonId),
  });
  const lesson = upcoming.data?.find((l) => l.id === lessonId);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Переносы" lead="Заявку на перенос рассматривает преподаватель. Если он согласен, занятие сдвинется в расписании автоматически." />

      {lessonId && lesson && (
        <section className={`hue-${lesson.group?.hue ?? lesson.teacher?.hue ?? 2}`}>
          <SectionTitle>Перенести: {lesson.group?.name ?? lesson.title}</SectionTitle>
          <p className="mt-3 mb-4 text-muted">Сейчас: {fmtFull(lesson.startsAt)}</p>
          <RescheduleForm lesson={lesson} onDone={() => setParams({})} />
        </section>
      )}

      <section>
        <SectionTitle>Мои заявки</SectionTitle>
        {q.isPending && <Loading />}
        {q.error && <ErrorNote error={q.error} />}
        {q.data?.length === 0 && (
          <div className="mt-6">
            <Empty title="Заявок нет">Перенести занятие можно из расписания — кнопка «Перенести» в строке урока.</Empty>
          </div>
        )}
        <ul className="m-0 list-none p-0">
          {q.data?.map((r) => (
            <li key={r.id} className={clsx(`hue-${r.lesson.group?.hue ?? r.lesson.teacher?.hue ?? 2}`, 'grid gap-2 border-b border-hair-soft py-5 sm:grid-cols-[1fr_auto]')}>
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-2 text-[18px] font-[450]">
                  <span className="size-2.5 rounded-[2px] bg-hue" aria-hidden="true" />
                  {r.lesson.group?.name ?? r.lesson.title}
                </p>
                <p className="t-caption text-muted">
                  Было: {fmtFull(r.lesson.startsAt)}
                  {r.proposedAt && ` · предложено: ${fmtFull(r.proposedAt)}`}
                </p>
                <p className="text-[16px]">«{r.reason}»</p>
                {r.reply && <p className="text-[16px] text-hue">Ответ: {r.reply}</p>}
              </div>
              <div>
                <Badge tone={r.status === 'PENDING' ? 'outline' : r.status === 'APPROVED' ? 'ink' : 'ember'}>{STATUS_LABEL[r.status]}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
