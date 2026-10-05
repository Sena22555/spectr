import { ArrowRight, Dumbbell, FlaskConical, Gauge, Languages, Puzzle, Sparkles, Target } from 'lucide-react';
import { Container } from '../Layout';
import { Reveal } from '../Reveal';
import { ButtonLink, Chip, Skeleton } from '../ui';
import { DailyTask } from './DailyTask';
import { usePractice } from '../../lib/practice';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Блок главной: бесплатный практикум и задача дня прямо на странице. */
export function PracticeBand() {
  const q = usePractice();
  const links = useQuery({ queryKey: ['config'], queryFn: () => api<{ telegramUrl: string | null; maxUrl?: string | null }>('/config'), staleTime: Infinity });
  if (q.error) return null;
  const topics = q.data?.subjects.reduce((n, s) => n + s.topics.length, 0);
  const problems = q.data?.subjects.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.problems, 0), 0);
  return (
    <Container className="pt-24">
      <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <Reveal className="flex flex-col gap-5 lg:sticky lg:top-28">
          <Chip hue={3} icon={<Sparkles />}>
            бесплатно · без регистрации
          </Chip>
          <h2 className="t-display t-lg">
            Попробуйте прямо сейчас — <mark>решите задачу дня</mark>
          </h2>
          <p className="t-sub max-w-[44ch] text-muted">Бесплатный практикум «Спектра»: короткая теория, формулы, живые опыты и задачи с мгновенной проверкой и разбором.</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[17px]">
            {[
              { Icon: Dumbbell, text: 'Сборник для 5–11 класса: бесконечные тренажёры, ответ проверяется сразу' },
              { Icon: Target, text: 'ОГЭ и ЕГЭ по номерам заданий: математика, информатика, физика' },
              { Icon: Languages, text: 'Английский: путь из 48 уроков по 5 минут — слова с картинками и озвучкой, фразы из плиток, грамматика' },
              { Icon: Puzzle, text: `${topics ?? '13'} тем с теорией и ${problems ?? '65'} задачами с разбором` },
              { Icon: FlaskConical, text: 'Опыты: призма Ньютона, цепь, парабола, двоичный код' },
              { Icon: Gauge, text: 'Проверка уровня за 5 минут — без оценок, с советом, что подтянуть' },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="hue-3 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-tint text-hue">
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink to="/practice">
              Открыть практикум <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink to="/english" variant="secondary">
              Английский
            </ButtonLink>
          </div>
          {links.data?.telegramUrl && (
            <p className="t-caption text-muted">
              Нравится решать? Задача дня приходит и в{' '}
              <a href={links.data.telegramUrl} target="_blank" rel="noreferrer" className="link">
                Telegram-бот
              </a>
              {links.data.maxUrl && (
                <>
                  {' '}и{' '}
                  <a href={links.data.maxUrl} target="_blank" rel="noreferrer" className="link">
                    бот в MAX
                  </a>
                </>
              )}{' '}
              — с серией дней и «Радугой знаний».
            </p>
          )}
        </Reveal>
        <Reveal delay={0.08}>{q.data ? <DailyTask daily={q.data.daily} /> : <Skeleton className="h-[420px]" />}</Reveal>
      </div>
    </Container>
  );
}
