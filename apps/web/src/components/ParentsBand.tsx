import { BellRing, ChartNoAxesColumn, Gift, NotebookPen } from 'lucide-react';
import { Container } from './Layout';
import { Reveal } from './Reveal';
import { ButtonLink, Chip } from './ui';

const POINTS = [
  {
    Icon: ChartNoAxesColumn,
    hue: 5,
    title: 'Кабинет родителя',
    text: 'Расписание ребёнка по дням, домашка со статусами, слово преподавателя и что стоит подтянуть. Можно добавить нескольких детей.',
  },
  { Icon: BellRing, hue: 1, title: 'Сводки в Telegram и MAX', text: 'Утром — что у ребёнка сегодня, за 15 минут — напоминание об уроке, после сдачи домашки — уведомление, в воскресенье — итог недели.' },
  { Icon: NotebookPen, hue: 3, title: 'Домашка проверяется сама', text: 'Задачи из практикума и тренажёров проверяются автоматически, а преподаватель видит результат и оставляет комментарий.' },
  { Icon: Gift, hue: 2, title: 'Бесплатно и без рекламы', text: 'Тренажёры для 5–11 класса, задания в формате ОГЭ и ЕГЭ и проверка уровня — бесплатно, даже без регистрации.' },
];

/** Блок главной для родителей: прозрачность, напоминания, проверка домашки, бесплатный практикум. */
export function ParentsBand() {
  return (
    <Container className="pt-28">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <Reveal className="flex flex-col gap-5">
          <Chip hue={6}>родителям</Chip>
          <h2 className="t-display t-lg">
            Видно, как идут дела, — <mark>без расспросов</mark>
          </h2>
          <p className="t-sub max-w-[42ch] text-muted">Мы сделали так, чтобы родителю не нужно было звонить преподавателю и проверять тетради: всё важное приходит само.</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <ButtonLink to="/register?as=parent">Кабинет родителя</ButtonLink>
            <ButtonLink to="/practice/check/math" variant="secondary">
              Проверить уровень ребёнка
            </ButtonLink>
          </div>
          <p className="t-caption text-muted">Кабинет и проверка уровня бесплатные. Проверка займёт 5 минут и покажет, какие темы подтянуть.</p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {POINTS.map(({ Icon, hue, title, text }, i) => (
            <Reveal key={title} delay={(i % 2) * 0.06}>
              <article className={`hue-${hue} flex h-full flex-col gap-3 rounded-[14px] bg-tint p-6`}>
                <span className="grid size-10 place-items-center rounded-full bg-forest text-mark">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <h3 className="t-heading text-[22px] leading-tight">{title}</h3>
                <p className="text-[16px] leading-relaxed text-ink/85">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}
