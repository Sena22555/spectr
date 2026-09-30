import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Empty, ErrorNote, Input, Loading, PageHeader, Select, Textarea } from '../../components/ui';
import { HuePicker } from './Teachers';

interface AGroup {
  id: string;
  slug: string;
  name: string;
  description: string;
  schedule: string;
  capacity: number;
  hue: number;
  teacher: { id: string; user: { name: string } } | null;
  course: { id: string; title: string } | null;
  members: { user: { id: string; name: string; email: string | null } }[];
  _count: { photos: number; lessons: number };
}

export default function AdminGroups() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'groups'], queryFn: () => api<{ groups: AGroup[] }>('/admin/groups').then((r) => r.groups) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Группы"
        lead="Состав, расписание и преподаватель каждой группы."
        actions={
          <Button variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)}>
            <Plus className="size-4" /> {creating ? 'Скрыть' : 'Новая группа'}
          </Button>
        }
      />
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
            <GroupForm onDone={() => setCreating(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data?.length === 0 && <Empty title="Групп пока нет" />}
      <div className="grid gap-5 xl:grid-cols-2">
        {q.data?.map((g) => (
          <GroupAdmin key={g.id} g={g} />
        ))}
      </div>
    </div>
  );
}

function GroupAdmin({ g }: { g: AGroup }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState('');
  const students = useQuery({
    queryKey: ['admin', 'users', 'STUDENT'],
    queryFn: () => api<{ users: { id: string; name: string; email: string | null }[] }>('/admin/users?role=STUDENT').then((r) => r.users),
  });
  const add = useMutation({
    mutationFn: (userId: string) => api(`/admin/groups/${g.id}/members`, { method: 'POST', json: { userId } }),
    onSuccess: () => {
      setAdding('');
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/admin/groups/${g.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] }),
  });
  const memberIds = new Set(g.members.map((m) => m.user.id));

  return (
    <section className={`hue-${g.hue} flex flex-col gap-5 rounded-[16px] bg-tint p-5 sm:p-6`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="t-caption text-hue">
            {g.course?.title ?? 'Без предмета'} · {g.schedule || 'расписание не задано'}
          </p>
          <h2 className="t-heading text-[28px]">{g.name}</h2>
          <p className="t-caption text-ink/75">
            {g.teacher?.user.name ?? 'Преподаватель не назначен'} · {g._count.lessons} занятий · {g._count.photos} фото
          </p>
        </div>
        <Link to={`/groups/${g.slug}`} className="link shrink-0 text-[15px]">
          Профиль
        </Link>
      </header>
      <div>
        <p className="t-caption mb-2 text-hue">
          Участники · {g.members.length} из {g.capacity}
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {g.members.map((m) => (
            <li key={m.user.id} className="flex items-center gap-1 rounded-[6px] bg-paper/70 py-1 pr-1 pl-2.5 text-[15px]">
              {m.user.name}
              <button className="grid size-7 place-items-center rounded-[4px] hover:bg-ink/10" onClick={() => remove.mutate(m.user.id)} aria-label={`Убрать ${m.user.name} из группы`}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (adding) add.mutate(adding);
        }}
      >
        <label className="sr-only" htmlFor={`add-${g.id}`}>
          Добавить ученика
        </label>
        <select id={`add-${g.id}`} value={adding} onChange={(e) => setAdding(e.target.value)} className="h-11 min-w-0 flex-1 rounded-[6px] border border-ink bg-paper px-3 text-[15px]">
          <option value="">Добавить ученика…</option>
          {students.data
            ?.filter((s) => !memberIds.has(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <Button type="submit" className="min-h-11 px-4" disabled={!adding} loading={add.isPending}>
          Добавить
        </Button>
      </form>
    </section>
  );
}

function GroupForm({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const teachers = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => api<{ teachers: { id: string; subject: string; user: { name: string } }[] }>('/admin/teachers').then((r) => r.teachers),
  });
  const courses = useQuery({ queryKey: ['admin', 'courses'], queryFn: () => api<{ courses: { id: string; title: string }[] }>('/admin/courses').then((r) => r.courses) });
  const [form, setForm] = useState({ name: '', description: '', schedule: '', capacity: '8', hue: 0, teacherId: '', courseId: '' });
  const m = useMutation({
    mutationFn: () =>
      api('/admin/groups', {
        method: 'POST',
        json: { ...form, capacity: Number(form.capacity), teacherId: form.teacherId || null, courseId: form.courseId || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      onDone();
    },
  });
  return (
    <form
      className={`hue-${form.hue} grid gap-5 rounded-[16px] bg-tint p-5 sm:grid-cols-2 sm:p-8`}
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Input label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="ЕГЭ · Физика" />
      <Input label="Расписание (текстом)" value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Вт, Чт · 17:00" />
      <Select label="Преподаватель" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
        <option value="">Не назначен</option>
        {teachers.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.user.name} · {t.subject}
          </option>
        ))}
      </Select>
      <Select label="Предмет" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
        <option value="">Без предмета</option>
        {courses.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </Select>
      <Input label="Мест в группе" type="number" min={1} max={200} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
      <HuePicker value={form.hue} onChange={(hue) => setForm({ ...form, hue })} />
      <Textarea label="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="sm:col-span-2" />
      {m.error && <p className="t-caption text-ember-text sm:col-span-2">{(m.error as Error).message}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={m.isPending}>
          Создать группу
        </Button>
      </div>
    </form>
  );
}
