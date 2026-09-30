import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Camera } from 'lucide-react';
import { api, uploadImage } from '../../lib/api';
import { haptic } from '../../lib/platform';
import { Button, Empty, ErrorNote, Input, Loading, Monogram, PageHeader, Textarea } from '../../components/ui';

const HUE_NAMES = ['Красный', 'Оранжевый', 'Жёлтый', 'Зелёный', 'Бирюзовый', 'Синий', 'Фиолетовый'];

export function HuePicker({ value, onChange }: { value: number; onChange(h: number): void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="t-caption mb-1.5 p-0">Цвет в спектре</legend>
      <div className="flex gap-1.5">
        {HUE_NAMES.map((name, i) => (
          <label key={name} className={clsx(`hue-${i}`, 'press relative grid size-11 cursor-pointer place-items-center rounded-[6px] bg-tint', value === i && 'ring-2 ring-ink ring-offset-2 ring-offset-paper')}>
            <input type="radio" name="hue" className="sr-only" checked={value === i} onChange={() => onChange(i)} aria-label={name} />
            <span className="size-3 rounded-[4px] bg-hue" aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface ATeacher {
  id: string;
  slug: string;
  subject: string;
  headline: string;
  bio: string;
  experience: number;
  photoUrl: string | null;
  hue: number;
  published: boolean;
  user: { id: string; name: string; email: string | null };
  _count: { groups: number; lessons: number };
}

export default function AdminTeachers() {
  const q = useQuery({ queryKey: ['admin', 'teachers'], queryFn: () => api<{ teachers: ATeacher[] }>('/admin/teachers').then((r) => r.teachers) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Преподаватели"
        lead={
          <>
            Профили, которые видят ученики. Новый преподаватель появляется здесь, когда вы даёте ему роль в разделе{' '}
            <Link to="/admin/users" className="link">
              «Люди и роли»
            </Link>
            .
          </>
        }
      />
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data?.length === 0 && <Empty title="Преподавателей пока нет" />}
      <div className="flex flex-col gap-5">
        {q.data?.map((t) => (
          <TeacherEditor key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

function TeacherEditor({ t }: { t: ATeacher }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: t.subject, headline: t.headline, bio: t.bio, experience: String(t.experience), hue: t.hue, published: t.published, photoUrl: t.photoUrl ?? '' });
  const save = useMutation({
    mutationFn: (data: Partial<typeof form>) =>
      api(`/admin/teachers/${t.id}`, { method: 'PATCH', json: { ...data, ...(data.experience !== undefined ? { experience: Number(data.experience) } : {}) } }),
    onSuccess: () => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['admin', 'teachers'] });
      qc.invalidateQueries({ queryKey: ['teachers'] });
    },
  });
  const photo = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadImage(file);
      setForm((f) => ({ ...f, photoUrl: url }));
      return api(`/admin/teachers/${t.id}`, { method: 'PATCH', json: { photoUrl: url } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  });

  return (
    <section className={`hue-${form.hue} rounded-[16px] bg-tint`}>
      <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <button className="press group relative size-20 overflow-hidden rounded-[16px]" onClick={() => fileRef.current?.click()} aria-label={`Загрузить фото: ${t.user.name}`}>
          <Monogram name={t.user.name} hue={form.hue} photoUrl={form.photoUrl || null} size="fill" className="text-[30px]" />
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-6" strokeWidth={1.6} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
        <div className="min-w-0 flex-1">
          <p className="t-heading text-[26px]">{t.user.name}</p>
          <p className="t-caption text-hue">
            {t.subject} · групп {t._count.groups} · занятий {t._count.lessons} · {t.published ? 'виден на сайте' : 'скрыт с сайта'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Свернуть' : 'Редактировать'}
        </Button>
      </div>
      {open && (
        <form
          className="grid gap-5 border-t border-[color-mix(in_oklab,var(--i)_35%,transparent)] p-5 sm:grid-cols-2 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <Input label="Предмет" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Input label="Стаж, лет" type="number" min={0} max={60} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
          <Input label="Коротко о подходе" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="sm:col-span-2" />
          <Textarea label="О преподавателе" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="sm:col-span-2" />
          <HuePicker value={form.hue} onChange={(hue) => setForm({ ...form, hue })} />
          <label className="flex items-center gap-3 self-end pb-3">
            <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} className="size-5 accent-[var(--ink)]" />
            <span className="text-[17px]">Показывать на сайте</span>
          </label>
          {save.error && <p className="t-caption text-ember-text sm:col-span-2">{(save.error as Error).message}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Сохранить
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
