import { useSearchParams } from 'react-router-dom';
import { Container } from '../components/Layout';
import { BookingForm } from '../components/BookingForm';

export default function Book() {
  const [params] = useSearchParams();
  return (
    <Container className="grid gap-10 py-8 sm:py-12 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-5">
        <h1 className="t-display t-xl">Запись на занятие</h1>
        <p className="t-sub max-w-[36ch] text-ink/85">Расскажите, с чем нужна помощь. Администратор подберёт преподавателя и время и поставит занятие в расписание.</p>
        <ol className="m-0 mt-4 flex list-none flex-col p-0">
          {['Заявка', 'Подбор преподавателя и времени', 'Занятие в расписании и ссылка в кабинете'].map((step, i) => (
            <li key={step} className={`hue-${[1, 3, 5][i]} flex items-center gap-4 border-b border-hair-soft py-3`}>
              <span className="grid size-8 place-items-center rounded-ctl bg-tint text-[15px] font-[500] text-hue tnum">{i + 1}</span>
              <span className="text-[17px]">{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-card bg-bone p-5 sm:p-8">
        <BookingForm subjectSlug={params.get('subject') ?? undefined} teacherSlug={params.get('teacher') ?? undefined} />
      </div>
    </Container>
  );
}
