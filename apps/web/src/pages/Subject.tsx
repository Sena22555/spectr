import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Container } from '../components/Layout';
import { BookingForm } from '../components/BookingForm';
import { ErrorNote, Loading, Monogram, SectionTitle } from '../components/ui';
import type { Subject as SubjectT } from '../lib/types';

interface SubjectFull extends SubjectT {
  groups: { id: string; slug: string; name: string; schedule: string; hue: number; capacity: number; _count: { members: number } }[];
}

export default function Subject() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['subject', slug], queryFn: () => api<{ course: SubjectFull }>(`/courses/${slug}`).then((r) => r.course) });
  if (q.isPending) return <Container className="py-12"><Loading /></Container>;
  if (q.error) return <Container className="py-12"><ErrorNote error={q.error} /></Container>;
  const s = q.data;

  return (
    <div className={`hue-${s.hue}`}>
      <section className="bg-tint">
        <Container className="flex flex-col gap-5 py-12 md:py-20">
          <p className="t-caption text-hue">
            {s.level} · {s.format}
          </p>
          <h1 className="t-display t-xl max-w-[14ch]">{s.title}</h1>
          <p className="t-sub max-w-[44ch]">{s.summary}</p>
        </Container>
      </section>
      <Container className="grid gap-12 py-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle>Как занимаемся</SectionTitle>
            <p className="mt-5 max-w-[62ch] text-[19px] leading-[1.5]">{s.description}</p>
          </section>
          {s.teacher && (
            <section>
              <SectionTitle>Преподаватель</SectionTitle>
              <Link to={`/teachers/${s.teacher.slug}`} className="mt-5 flex items-center gap-5 no-underline">
                <Monogram name={s.teacher.user.name} hue={s.teacher.hue} photoUrl={s.teacher.photoUrl} size="lg" className="rounded-card" />
                <span className="flex flex-col gap-1">
                  <span className="t-heading text-[28px] hover:underline">{s.teacher.user.name}</span>
                  <span className="text-[16px] text-muted">{s.teacher.headline}</span>
                </span>
              </Link>
            </section>
          )}
          {s.groups.length > 0 && (
            <section>
              <SectionTitle>Мини-группы</SectionTitle>
              <ul className="m-0 list-none p-0">
                {s.groups.map((g) => (
                  <li key={g.id} className="flex items-baseline justify-between gap-4 border-b border-hair-soft py-4">
                    <Link to={`/groups/${g.slug}`} className="t-heading text-[24px] no-underline hover:underline">
                      {g.name}
                    </Link>
                    <span className="t-caption tnum text-right text-muted">
                      {g.schedule}
                      <br />
                      {g._count.members} из {g.capacity} мест
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="h-fit rounded-card bg-bone p-5 sm:p-8 lg:sticky lg:top-24">
          <h2 className="t-heading mb-6 text-[32px]">Записаться</h2>
          <BookingForm subjectSlug={s.slug} teacherSlug={s.teacher?.slug} compact />
        </aside>
      </Container>
    </div>
  );
}
