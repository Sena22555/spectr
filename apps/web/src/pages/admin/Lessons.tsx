import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDay, fmtTime, relativeDay, STATUS_LABEL, toLocalInput } from '../../lib/format';
import { Badge, Button, Empty, ErrorNote, Input, Loading, PageHeader, Select } from '../../components/ui';
import { WeekNav, groupByDay, useWeek } from '../app/Schedule';

interface ALesson {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  link: string | null;
  status: string;
  teacher: { id: string; hue: number; user: { name: string } };
  group: { id: string; name: string; hue: number } | null;
  student: { id: string; name: string } | null;
}

export default function AdminLessons() {
  const qc = useQueryClient();
  const week = useWeek();
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['admin', 'lessons', week.from.toISOString()],
    queryFn: () => api<{ lessons: ALesson[] }>(`/admin/lessons?from=${week.from.toISOString()}&to=${week.to.toISOString()}`).then((r) => r.lessons),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'lessons'] }),
  });
  const days = useMemo(() => groupByDay(q.data ?? []), [q.data]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Расписание школы"
        lead={week.label}
        actions={
          <>
            <WeekNav week={week} />
            <Button variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)}>
              <Plus className="size-4" /> {creating ? 'Скрыть' : 'Поставить занятие'}
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
              <li key={l.id} className={`hue-${l.group?.hue ?? l.teacher.hue} grid grid-cols-[72px_1fr_auto] items-center gap-4 border-b border-hair-soft py-3`}>
                <span className="t-heading tnum text-[26px]">{fmtTime(l.startsAt)}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-[17px] font-[450]">
                    <span className="size-2.5 shrink-0 rounded-[2px] bg-hue" aria-hidden="true" />
                    {l.group?.name ?? l.student?.name ?? l.title}
                  </p>
                  <p className="t-caption text-muted">
                    {l.teacher.user.name} · {l.durationMin} мин · {l.link ? 'ссылка есть' : 'без ссылки'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {l.status !== 'SCHEDULED' && <Badge>{STATUS_LABEL[l.status]}</Badge>}
                  {confirmId === l.id ? (
                    <span className="flex items-center gap-2">
                      <button className="press h-9 rounded-ctl bg-ember px-3 text-[14px] text-on-ember" onClick={() => del.mutate(l.id)}>
                        Удалить
                      </button>
                      <button className="link text-[14px]" onClick={() => setConfirmId(null)}>
                        Отмена
                      </button>
                    </span>
                  ) : (
                    <button
                      className="press grid size-10 place-items-center rounded-ctl text-muted hover:text-ember-text"
                      onClick={() => setConfirmId(l.id)}
                      aria-label="Удалить занятие"
                    >
                      <Trash2 className="size-4" strokeWidth={1.7} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CreateLesson({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const teachers = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => api<{ teachers: { id: string; subject: string; user: { name: string } }[] }>('/admin/teachers').then((r) => r.teachers),
  });
  const groups = useQuery({
    queryKey: ['admin', 'groups'],
    queryFn: () => api<{ groups: { id: string; name: string; teacher: { id: string } | null }[] }>('/admin/groups').then((r) => r.groups),
  });
  const students = useQuery({
    queryKey: ['admin', 'users', 'STUDENT'],
    queryFn: () => api<{ users: { id: string; name: string; email: string | null }[] }>('/admin/users?role=STUDENT').then((r) => r.users),
  });
  const [form, setForm] = useState({ teacherId: '', target: '', title: '', startsAt: toLocalInput(new Date(Date.now() + 86_400_000)), durationMin: '60', link: '' });
  const m = useMutation({
    mutationFn: () => {
      const [kind, id] = form.target.split(':');
      return api('/admin/lessons', {
        method: 'POST',
        json: {
          teacherId: form.teacherId,
          title: form.title,
          startsAt: new Date(form.startsAt).toISOString(),
          durationMin: Number(form.durationMin),
          link: form.link,
          ...(kind === 'g' ? { groupId: id } : { studentId: id }),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
      onDone();
    },
  });
  const teacherGroups = groups.data?.filter((g) => !form.teacherId || g.teacher?.id === form.teacherId);

  return (
    <form
      className="hue-1 grid gap-5 rounded-card bg-tint p-5 sm:grid-cols-2 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Select label="Преподаватель" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value, target: '' })} required>
        <option value="" disabled>
          Выберите
        </option>
        {teachers.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.user.name} · {t.subject}
          </option>
        ))}
      </Select>
      <Select label="Для кого" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required>
        <option value="" disabled>
          Группа или ученик
        </option>
        <optgroup label="Группы">
          {teacherGroups?.map((g) => (
            <option key={g.id} value={`g:${g.id}`}>
              {g.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Индивидуально">
          {students.data?.map((s) => (
            <option key={s.id} value={`s:${s.id}`}>
              {s.name}
              {s.email ? ` · ${s.email}` : ''}
            </option>
          ))}
        </optgroup>
      </Select>
      <Input label="Тема" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} />
      <Input label="Начало" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
      <Select label="Длительность" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })}>
        {[45, 60, 90, 120].map((m) => (
          <option key={m} value={m}>
            {m} минут
          </option>
        ))}
      </Select>
      <Input label="Ссылка" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" hint="Преподаватель может добавить сам" />
      {m.error && <p className="t-caption text-ember-text sm:col-span-2">{(m.error as Error).message}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={m.isPending}>
          Поставить в расписание
        </Button>
      </div>
    </form>
  );
}
