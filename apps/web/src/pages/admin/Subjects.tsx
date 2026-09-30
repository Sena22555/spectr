import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, ErrorNote, Input, Loading, PageHeader, Select, Textarea } from '../../components/ui';
import { HuePicker } from './Teachers';

interface ACourse {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  source: 'SCHOOL' | 'UNIVERSITY';
  audience: 'SCHOOL' | 'STUDENTS' | 'ALL';
  university: string | null;
  level: string;
  format: string;
  hue: number;
  published: boolean;
  teacher: { id: string; user: { name: string } } | null;
  _count: { groups: number; enrollments: number };
}

const EMPTY = { title: '', summary: '', description: '', level: '', format: 'Индивидуально или мини-группа', audience: 'SCHOOL', source: 'SCHOOL', university: '', hue: 0, teacherId: '', published: true };

export default function AdminSubjects() {
  const [editing, setEditing] = useState<ACourse | 'new' | null>(null);
  const q = useQuery({ queryKey: ['admin', 'courses'], queryFn: () => api<{ courses: ACourse[] }>('/admin/courses').then((r) => r.courses) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Предметы"
        lead="Направления, по которым можно записаться. Источник «Университет» — задел под будущие курсы от вуза."
        actions={
          <Button onClick={() => setEditing(editing === 'new' ? null : 'new')}>
            <Plus className="size-4" /> Новый предмет
          </Button>
        }
      />
      {editing === 'new' && <SubjectForm onDone={() => setEditing(null)} />}
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      <ul className="m-0 list-none p-0">
        {q.data?.map((c) => (
          <li key={c.id} className={`hue-${c.hue} border-b border-hair-soft`}>
            <div className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-2 text-[19px] font-[450]">
                  <span className="size-2.5 rounded-[2px] bg-hue" aria-hidden="true" />
                  {c.title}
                  {!c.published && <span className="t-caption text-muted">· скрыт</span>}
                  {c.source === 'UNIVERSITY' && <span className="t-caption text-hue">· университет</span>}
                </p>
                <p className="t-caption text-muted">
                  {c.level} · {c.teacher?.user.name ?? 'без преподавателя'} · групп {c._count.groups}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setEditing(editing !== 'new' && editing?.id === c.id ? null : c)}>
                {editing !== 'new' && editing?.id === c.id ? 'Свернуть' : 'Изменить'}
              </Button>
            </div>
            {editing !== 'new' && editing?.id === c.id && <SubjectForm course={c} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubjectForm({ course, onDone }: { course?: ACourse; onDone(): void }) {
  const qc = useQueryClient();
  const teachers = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => api<{ teachers: { id: string; subject: string; user: { name: string } }[] }>('/admin/teachers').then((r) => r.teachers),
  });
  const [form, setForm] = useState(
    course
      ? { ...EMPTY, ...course, university: course.university ?? '', teacherId: course.teacher?.id ?? '' }
      : EMPTY,
  );
  const m = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        summary: form.summary,
        description: form.description,
        level: form.level,
        format: form.format,
        audience: form.audience,
        source: form.source,
        university: form.university || undefined,
        hue: form.hue,
        teacherId: form.teacherId || null,
        published: form.published,
      };
      return course ? api(`/admin/courses/${course.id}`, { method: 'PATCH', json: body }) : api('/admin/courses', { method: 'POST', json: body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] });
      qc.invalidateQueries({ queryKey: ['subjects'] });
      onDone();
    },
  });
  return (
    <form
      className={`hue-${form.hue} mb-5 grid gap-5 rounded-card bg-tint p-5 sm:grid-cols-2 sm:p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Input label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} />
      <Input label="Уровень" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="7–11 класс" />
      <Input label="Коротко" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} required minLength={2} className="sm:col-span-2" />
      <Textarea label="Как занимаемся" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="sm:col-span-2" />
      <Input label="Формат" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} />
      <Select label="Для кого" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
        <option value="SCHOOL">Школьникам</option>
        <option value="STUDENTS">Студентам</option>
        <option value="ALL">Всем</option>
      </Select>
      <Select label="Преподаватель" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
        <option value="">Не назначен</option>
        {teachers.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.user.name} · {t.subject}
          </option>
        ))}
      </Select>
      <Select label="Источник" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
        <option value="SCHOOL">Школа «Спектр»</option>
        <option value="UNIVERSITY">Университет (скоро)</option>
      </Select>
      {form.source === 'UNIVERSITY' && <Input label="Университет" value={form.university} onChange={(e) => setForm({ ...form, university: e.target.value })} />}
      <HuePicker value={form.hue} onChange={(hue) => setForm({ ...form, hue })} />
      <label className="flex items-center gap-3 self-end pb-3">
        <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="size-5 accent-[var(--ink)]" />
        <span className="text-[17px]">Показывать на сайте</span>
      </label>
      {m.error && <p className="t-caption text-ember-text sm:col-span-2">{(m.error as Error).message}</p>}
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={m.isPending}>
          {course ? 'Сохранить' : 'Добавить предмет'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
