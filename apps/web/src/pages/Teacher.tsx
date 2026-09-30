import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { plural } from '../lib/format';
import { Container } from '../components/Layout';
import { BookingForm } from '../components/BookingForm';
import { ErrorNote, Loading, Monogram, SectionTitle, Tag } from '../components/ui';
import type { TeacherCard } from '../lib/types';

interface TeacherFull extends TeacherCard {
  bio: string;
  courses: { id: string; slug: string; title: string; summary: string; hue: number; format: string; level: string }[];
  groups: { id: string; slug: string; name: string; schedule: string; hue: number; capacity: number; _count: { members: number } }[];
}

export default function Teacher() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['teacher', slug], queryFn: () => api<{ teacher: TeacherFull }>(`/teachers/${slug}`).then((r) => r.teacher) });
  if (q.isPending) return <Container className="py-12"><Loading /></Container>;
  if (q.error) return <Container className="py-12"><ErrorNote error={q.error} /></Container>;
  const t = q.data;
  const [first, ...rest] = t.bio.split(' ');

  return (
    <div className={`hue-${t.hue}`}>
      <section className="mx-3 mt-4 rounded-[18px] bg-tint sm:mx-6">
        <Container className="grid gap-8 py-10 md:grid-cols-[minmax(0,420px)_1fr] md:items-end md:py-16">
          <div className="w-full max-w-[420px] -rotate-2 rounded-[12px] bg-paper p-3 shadow-sticker transition-transform duration-500 hover:rotate-0">
            <div className="aspect-[4/5] overflow-hidden rounded-[8px]">
              <Monogram name={t.user.name} hue={t.hue} photoUrl={t.photoUrl} size="fill" className="text-[120px]" />
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <Tag hue={t.hue} className="w-fit bg-paper/60">
              {t.subject}
            </Tag>
            <h1 className="t-display t-xl">{t.user.name}</h1>
            <p className="t-sub max-w-[36ch]">{t.headline}</p>
            <p className="t-caption text-hue">
              Стаж {t.experience} {plural(t.experience, 'год', 'года', 'лет')}
            </p>
          </div>
        </Container>
      </section>

      <Container className="grid gap-12 py-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-10">
          <section>
            <SectionTitle>О преподавателе</SectionTitle>
            <p className="mt-5 max-w-[62ch] text-[19px] leading-[1.5]">
              {first} {rest.join(' ')}
            </p>
          </section>
          {t.courses.length > 0 && (
            <section>
              <SectionTitle>Предметы</SectionTitle>
              <ul className="m-0 list-none p-0">
                {t.courses.map((c) => (
                  <li key={c.id} className="border-b border-hair-soft py-4">
                    <Link to={`/subjects/${c.slug}`} className="t-heading text-[26px] no-underline hover:underline">
                      {c.title}
                    </Link>
                    <p className="text-[16px] text-muted">
                      {c.level} · {c.format}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {t.groups.length > 0 && (
            <section>
              <SectionTitle>Группы</SectionTitle>
              <ul className="m-0 list-none p-0">
                {t.groups.map((g) => (
                  <li key={g.id} className={`hue-${g.hue} flex items-baseline justify-between gap-4 border-b border-hair-soft py-4`}>
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
          <h2 className="t-heading text-[32px]">Записаться на занятие</h2>
          <p className="mt-2 mb-6 text-[16px] text-muted">Преподаватель: {t.user.name}</p>
          <BookingForm teacherSlug={t.slug} subjectSlug={t.courses[0]?.slug} compact />
        </aside>
      </Container>
    </div>
  );
}
