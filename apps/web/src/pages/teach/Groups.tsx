import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api, uploadImage } from '../../lib/api';
import { haptic } from '../../lib/platform';
import { Avatar, Empty, ErrorNote, Loading, PageHeader } from '../../components/ui';

interface TGroup {
  id: string;
  slug: string;
  name: string;
  hue: number;
  schedule: string;
  capacity: number;
  course: { title: string } | null;
  members: { user: { id: string; name: string; avatarUrl: string | null } }[];
  photos: { id: string; url: string; caption: string | null }[];
}

export default function TeachGroups() {
  const q = useQuery({ queryKey: ['teacher', 'groups'], queryFn: () => api<{ groups: TGroup[] }>('/teacher/groups').then((r) => r.groups) });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Группы и фото" lead="Добавляйте фотографии с занятий — они появятся в профиле группы." />
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data?.length === 0 && <Empty title="У вас пока нет групп">Группы создаёт администратор.</Empty>}
      {q.data?.map((g) => (
        <GroupBlock key={g.id} g={g} />
      ))}
    </div>
  );
}

function GroupBlock({ g }: { g: TGroup }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const add = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        const { url } = await uploadImage(file);
        await api(`/teacher/groups/${g.id}/photos`, { method: 'POST', json: { url, caption: caption || undefined } });
      }
    },
    onSuccess: () => {
      haptic('success');
      setCaption('');
      qc.invalidateQueries({ queryKey: ['teacher', 'groups'] });
      qc.invalidateQueries({ queryKey: ['group', g.slug] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/teacher/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher', 'groups'] }),
  });

  return (
    <section className={`hue-${g.hue} flex flex-col gap-6 rounded-card bg-tint p-5 sm:p-8`}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-caption text-hue">
            {g.course?.title} · {g.schedule}
          </p>
          <h2 className="t-heading text-[32px]">{g.name}</h2>
        </div>
        <Link to={`/groups/${g.slug}`} className="link text-[16px]">
          Открыть профиль группы
        </Link>
      </header>

      <div>
        <p className="t-caption mb-2 text-hue">
          Участники · {g.members.length} из {g.capacity}
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {g.members.map((m) => (
            <li key={m.user.id} className="flex items-center gap-2 rounded-full bg-paper/60 py-1 pr-3 pl-1">
              <Avatar name={m.user.name} url={m.user.avatarUrl} className="size-7 text-[12px]" />
              <span className="text-[15px]">{m.user.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <p className="t-caption text-hue">Фотографии · {g.photos.length}</p>
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5 lg:grid-cols-6">
          {g.photos.map((p) => (
            <li key={p.id} className="group relative aspect-square overflow-hidden">
              <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
              <button
                className="absolute top-1 right-1 grid size-9 place-items-center rounded-full bg-black/55 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={() => remove.mutate(p.id)}
                aria-label="Удалить фото"
              >
                <Trash2 className="size-4" strokeWidth={1.8} />
              </button>
            </li>
          ))}
          <li className="aspect-square">
            <button
              onClick={() => fileRef.current?.click()}
              className="press flex h-full w-full flex-col items-center justify-center gap-1 rounded-ctl border border-dashed border-ink/50 text-[14px] hover:border-ink"
              disabled={add.isPending}
            >
              <ImagePlus className="size-6" strokeWidth={1.5} />
              {add.isPending ? 'Загружаем…' : 'Добавить'}
            </button>
          </li>
        </ul>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files?.length && add.mutate(e.target.files)}
        />
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="t-caption">Подпись к следующим фото (необязательно)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="h-11 rounded-ctl border border-ink bg-paper px-3 text-[16px]"
            placeholder="Например: опыт с линзами"
          />
        </label>
        {add.error && <p className="t-caption text-ember-text">{(add.error as Error).message}</p>}
      </div>
    </section>
  );
}
