import { useState } from 'react';
import { Container } from '../components/Layout';
import { SubjectRow } from '../components/Cards';
import { useSubjects } from '../components/BookingForm';
import { Empty, ErrorNote, Loading, PageHeader } from '../components/ui';
import { FilterChip } from './Teachers';

type Audience = 'ALL' | 'SCHOOL' | 'STUDENTS';

export default function Subjects() {
  const subjects = useSubjects();
  const [aud, setAud] = useState<Audience>('ALL');
  const list = subjects.data?.filter((s) => s.source === 'SCHOOL' && (aud === 'ALL' || s.audience === aud || s.audience === 'ALL'));
  const university = subjects.data?.filter((s) => s.source === 'UNIVERSITY') ?? [];

  return (
    <Container className="py-8 sm:py-12">
      <PageHeader title="Предметы" lead="С чем помогают наши преподаватели. Не нашли свой предмет — напишите в заявке, подберём." />
      <div className="mt-6 flex gap-2" role="group" aria-label="Для кого">
        <FilterChip active={aud === 'ALL'} onClick={() => setAud('ALL')}>
          Все
        </FilterChip>
        <FilterChip active={aud === 'SCHOOL'} onClick={() => setAud('SCHOOL')}>
          Школьникам
        </FilterChip>
        <FilterChip active={aud === 'STUDENTS'} onClick={() => setAud('STUDENTS')}>
          Студентам
        </FilterChip>
      </div>
      <div className="mt-6 max-w-4xl">
        {subjects.isPending && <Loading />}
        {subjects.error && <ErrorNote error={subjects.error} onRetry={() => subjects.refetch()} />}
        {list?.map((s) => <SubjectRow key={s.id} s={s} />)}
      </div>
      <section className="mt-16 max-w-4xl">
        {university.length ? (
          <>
            <h2 className="t-heading t-md mb-4">Курсы от университета</h2>
            {university.map((s) => (
              <SubjectRow key={s.id} s={s} />
            ))}
          </>
        ) : (
          <Empty title="Курсы от университета — скоро" hue={6}>
            Готовим программы вместе с университетом. Когда они появятся, на них можно будет подать заявку прямо здесь.
          </Empty>
        )}
      </section>
    </Container>
  );
}
