import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDay, relativeDay, toLocalInput } from '../../lib/format';
import { Button, Empty, ErrorNote, Input, Loading, PageHeader, Select } from '../../components/ui';
import { WeekNav, groupByDay, useWeek } from '../app/Schedule';
import { TeacherLessonRow } from './shared';
import type { Lesson } from '../../lib/types';

interface TGroup {
  id: string;
  name: string;
  members: { user: { id: string; name: string } }[];
}

export default function Lessons() {
  const week = useWeek();
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['teacher', 'lessons', week.from.toISOString()],
    queryFn: () => api<{ lessons: Lesson[] }>(`/teacher/lessons?from=${week.from.toISOString()}&to=${week.to.toISOString()}`).then((r) => r.lessons),
  });
  const days = useMemo(() => groupByDay(q.data ?? []), [q.data]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Занятия"
        lead={week.label}
        actions={
          <>
            <WeekNav week={week} />
            <Button variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
              <Plus className="size-4" /> {creating ? 'Скрыть' : 'Новое занятие'}
            </Button>
          </>
        }
      />
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <CreateLesson onDone={() => setCreating(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && days.length === 0 && <Empty title="На этой неделе занятий нет" hue={3} />}
      {days.map((lessons) => (
        <section key={lessons[0].id}>
          <h2 className="t-heading flex items-baseline gap-3 border-b border-charcoal pb-2 text-[26px]">
            {relativeDay(lessons[0].startsAt)} <span className="t-caption text-muted">{fmtDay(lessons[0].startsAt)}</span>
          </h2>
          <ul className="m-0 list-none p-0">
            {lessons.map((l) => (
              <TeacherLessonRow key={l.id} lesson={l} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CreateLesson({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['teacher', 'groups'], queryFn: () => api<{ groups: TGroup[] }>('/teacher/groups').then((r) => r.groups) });
  const students = useQuery({
    queryKey: ['teacher', 'students'],
    queryFn: () => api<{ students: { user: { id: string; name: string } }[] }>('/teacher/students').then((r) => r.students),
  });
  const [target, setTarget] = useState('');
  const [form, setForm] = useState({ title: '', startsAt: toLocalInput(new Date(Date.now() + 86_400_000)), durationMin: '60', link: '' });
  const m = useMutation({
    mutationFn: () => {
      const [kind, id] = target.split(':');
      return api('/teacher/lessons', {
        method: 'POST',
        json: {
          title: form.title,
          startsAt: new Date(form.startsAt).toISOString(),
          durationMin: Number(form.durationMin),
          link: form.link || undefined,
          ...(kind === 'g' ? { groupId: id } : { studentId: id }),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher'] });
      onDone();
    },
  });

  return (
    <form
      className="hue-5 grid gap-5 rounded-card bg-tint p-5 sm:grid-cols-2 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Select label="Для кого" value={target} onChange={(e) => setTarget(e.target.value)} required className="sm:col-span-2">
        <option value="" disabled>
          Выберите группу или ученика
        </option>
        <optgroup label="Группы">
          {groups.data?.map((g) => (
            <option key={g.id} value={`g:${g.id}`}>
              {g.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Индивидуально">
          {students.data?.map((s) => (
            <option key={s.user.id} value={`s:${s.user.id}`}>
              {s.user.name}
            </option>
          ))}
        </optgroup>
      </Select>
      <Input label="Тема" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} placeholder="Например: квадратные уравнения" />
      <Input label="Начало" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
      <Select label="Длительность" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })}>
        {[45, 60, 90, 120].map((m) => (
          <option key={m} value={m}>
            {m} минут
          </option>
        ))}
      </Select>
      <Input label="Ссылка на занятие" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" hint="Можно добавить позже" />
      {m.error && <p className="t-caption text-ember-text sm:col-span-2">{(m.error as Error).message}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={m.isPending}>
          Поставить в расписание
        </Button>
      </div>
    </form>
  );
}
