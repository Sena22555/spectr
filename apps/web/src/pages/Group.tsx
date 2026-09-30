import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDay } from '../lib/format';
import { Container } from '../components/Layout';
import { BookingForm } from '../components/BookingForm';
import { Avatar, Empty, ErrorNote, Loading, SectionTitle } from '../components/ui';
import type { GroupCard, GroupPhoto } from '../lib/types';

interface GroupFull extends GroupCard {
  course: { slug: string; title: string; summary: string } | null;
  members: { user: { id: string; name: string; avatarUrl: string | null } }[];
}

export default function Group() {
  const { slug } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['group', slug], queryFn: () => api<{ group: GroupFull }>(`/groups/${slug}`).then((r) => r.group) });
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (q.isPending) return <Container className="py-12"><Loading /></Container>;
  if (q.error) return <Container className="py-12"><ErrorNote error={q.error} /></Container>;
  const g = q.data;
  const isMember = user && g.members.some((m) => m.user.id === user.id);
  const canUpload = user && (user.role === 'ADMIN' || (user.teacherSlug && user.teacherSlug === g.teacher?.slug));
  const free = Math.max(0, g.capacity - g._count.members);

  return (
    <div className={`hue-${g.hue}`}>
      <section className="mx-3 mt-4 rounded-[18px] bg-tint sm:mx-6">
        <Container className="grid gap-8 py-12 md:grid-cols-[1.3fr_1fr] md:items-end md:py-16">
          <div className="flex flex-col gap-5">
            {g.course && (
              <Link to={`/subjects/${g.course.slug}`} className="t-caption w-fit text-hue">
                {g.course.title}
              </Link>
            )}
            <h1 className="t-display t-xl">{g.name}</h1>
            <p className="t-sub max-w-[40ch]">{g.description}</p>
          </div>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[color-mix(in_oklab,var(--i)_45%,transparent)] pt-5">
            <div>
              <dt className="t-caption text-hue">Расписание</dt>
              <dd className="t-heading tnum m-0 text-[24px]">{g.schedule}</dd>
            </div>
            <div>
              <dt className="t-caption text-hue">Места</dt>
              <dd className="t-heading tnum m-0 text-[24px]">{free ? `${free} свободно` : 'Мест нет'}</dd>
            </div>
            {g.teacher && (
              <div className="col-span-2">
                <dt className="t-caption text-hue">Преподаватель</dt>
                <dd className="m-0">
                  <Link to={`/teachers/${g.teacher.slug}`} className="link text-[19px]">
                    {g.teacher.user.name}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </Container>
      </section>

      <Container className="py-12">
        <SectionTitle action={canUpload ? <Link to="/teach/groups" className="link text-[16px]">Добавить фото</Link> : undefined}>Фотографии</SectionTitle>
        {g.photos.length ? (
          <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
            {g.photos.map((p, i) => (
              <li key={p.id} className={i === 0 ? 'col-span-2 row-span-2' : ''}>
                <button className="press block h-full w-full overflow-hidden" onClick={() => setLightbox(i)} aria-label={p.caption ?? `Фото ${i + 1}`}>
                  <img src={p.url} alt={p.caption ?? ''} loading="lazy" className="aspect-square h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6">
            <Empty title="Фотографий пока нет" hue={g.hue}>
              Преподаватель группы добавит снимки с занятий — они появятся здесь.
            </Empty>
          </div>
        )}
      </Container>

      <Container className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <section>
          <SectionTitle>Участники</SectionTitle>
          {isMember || canUpload ? (
            <ul className="m-0 mt-4 grid list-none gap-0 p-0 sm:grid-cols-2">
              {g.members.map((m) => (
                <li key={m.user.id} className="flex items-center gap-3 border-b border-hair-soft py-3">
                  <Avatar name={m.user.name} url={m.user.avatarUrl} />
                  <span className="text-[17px]">{m.user.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-5 flex items-center gap-4">
              <div className="flex -space-x-3">
                {g.members.slice(0, 6).map((m, i) => (
                  <span key={m.user.id} className={`hue-${(g.hue + i) % 7} block size-10 rounded-full bg-tint ring-2 ring-paper`} aria-hidden="true" />
                ))}
              </div>
              <p className="text-[16px] text-muted">
                {g._count.members} участников. Имена видны только участникам группы.
              </p>
            </div>
          )}
        </section>
        {!isMember && (
          <aside className="h-fit rounded-card bg-bone p-5 sm:p-8">
            <h2 className="t-heading mb-6 text-[32px]">{free ? 'Хочу в эту группу' : 'Встать в лист ожидания'}</h2>
            <BookingForm subjectSlug={g.course?.slug} teacherSlug={g.teacher?.slug} compact />
          </aside>
        )}
      </Container>

      <AnimatePresence>
        {lightbox !== null && <Lightbox photos={g.photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Lightbox({ photos, index, onIndex, onClose }: { photos: GroupPhoto[]; index: number; onIndex(i: number): void; onClose(): void }) {
  const p = photos[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
      className="fixed inset-0 z-50 flex flex-col bg-[#1d1d1b]/95 text-[#e2dedb]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <span className="t-caption tnum">
          {index + 1} / {photos.length}
        </span>
        <button className="grid size-11 place-items-center" onClick={onClose} aria-label="Закрыть">
          <X className="size-6" strokeWidth={1.6} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <motion.img
          key={p.id}
          src={p.url}
          alt={p.caption ?? ''}
          className="max-h-[75dvh] max-w-full object-contain"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        />
        {photos.length > 1 && (
          <>
            <button className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/40" onClick={() => onIndex((index - 1 + photos.length) % photos.length)} aria-label="Предыдущее">
              <ChevronLeft className="size-6" />
            </button>
            <button className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/40" onClick={() => onIndex((index + 1) % photos.length)} aria-label="Следующее">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      <p className="px-4 py-5 text-center text-[16px]" onClick={(e) => e.stopPropagation()}>
        {p.caption ?? ''} <span className="opacity-60">{fmtDay(p.createdAt)}</span>
      </p>
    </motion.div>
  );
}
