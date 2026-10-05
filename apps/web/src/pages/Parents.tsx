import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { usePageTitle } from '../lib/title';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarDays, GraduationCap, NotebookPen, UserRound } from 'lucide-react';
import { Container } from '../components/Layout';
import { ProgressView } from '../components/practice/ProgressView';
import { Button, ButtonLink, ErrorNote, Loading } from '../components/ui';
import { api } from '../lib/api';
import { fmtFull } from '../lib/format';
import type { ParentLinkInfo, Progress } from '../lib/progress';

interface Report {
  child: string;
  progress: Progress;
  school: {
    lessonsDone30: number;
    nextLesson: { title: string; startsAt: string; teacher: string } | null;
    homework: { total: number; complete: number };
    teacherComments: string[];
    isStudent: boolean;
  };
  subscribe: ParentLinkInfo;
}

/** Отчёт для родителя по ссылке от ребёнка: без входа, только успехи. */
export default function Parents() {
  const { token = '' } = useParams();
  const q = useQuery({ queryKey: ['parent-report', token], queryFn: () => api<Report>(`/progress/parent/${token}`) });
  usePageTitle(q.data ? `Отчёт для родителей: ${q.data.child}` : null);
  // личный отчёт не должен попадать в поиск
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} />
      </Container>
    );
  const { child, progress, school, subscribe } = q.data;
  return (
    <Container className="flex max-w-[1000px] flex-col gap-10 pt-8 pb-10 sm:pt-12">
      <header className="flex flex-col gap-3">
        <p className="t-mono text-[12px] text-muted">отчёт для родителей · обновляется сам</p>
        <h1 className="t-display t-lg">Как идут дела: {child}</h1>
        <p className="t-sub max-w-[60ch] text-muted">
          Здесь видно, сколько задач решено в практикуме «Спектра», какие темы уже получаются и что стоит подтянуть. Ссылкой поделился сам ученик; контакты и переписка сюда не попадают.
        </p>
      </header>

      {school.isStudent && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Занятия в школе">
          <div className="flex items-start gap-3 rounded-[14px] bg-bone p-5">
            <GraduationCap className="mt-1 size-5 shrink-0" />
            <div>
              <p className="t-display tnum text-[34px] leading-none">{school.lessonsDone30}</p>
              <p className="text-[15px]">занятий с преподавателем за месяц</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[14px] bg-bone p-5">
            <NotebookPen className="mt-1 size-5 shrink-0" />
            <div>
              <p className="t-display tnum text-[34px] leading-none">
                {school.homework.complete}/{school.homework.total}
              </p>
              <p className="text-[15px]">домашних заданий сдано за месяц</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[14px] bg-bone p-5">
            <CalendarDays className="mt-1 size-5 shrink-0" />
            <div>
              <p className="text-[17px] font-[650]">{school.nextLesson ? fmtFull(school.nextLesson.startsAt) : 'Пока не назначено'}</p>
              <p className="text-[15px]">{school.nextLesson ? `следующее занятие · ${school.nextLesson.teacher}` : 'следующее занятие'}</p>
            </div>
          </div>
        </section>
      )}
      {school.teacherComments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="t-heading text-[22px]">Слово преподавателя</h2>
          {school.teacherComments.map((c, i) => (
            <p key={i} className="rounded-[12px] bg-butter px-4 py-3 text-[16px]">
              «{c}»
            </p>
          ))}
        </section>
      )}

      <ProgressView p={progress} forParent />

      <ParentCabinetInvite token={token} child={child} />

      <section className="grid gap-4 rounded-[14px] bg-forest-2 p-6 text-cream sm:grid-cols-[1.4fr_1fr] sm:items-center sm:p-8">
        <div className="flex flex-col gap-2">
          <p className="t-mono inline-flex items-center gap-2 text-[12px] text-mark">
            <Bell className="size-4" /> отчёт раз в неделю
          </p>
          <p className="t-display text-[clamp(24px,3vw,32px)]">Получайте сводку в мессенджер по воскресеньям</p>
          <p className="text-[15.5px] text-cream/80">Коротко: сколько решено, что получается, что подтянуть и когда следующее занятие. Отписаться — одной кнопкой.</p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          {subscribe.telegram && (
            <a href={subscribe.telegram} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center justify-center rounded-ctl bg-mark px-6 text-[15px] font-[600] text-forest no-underline hover:-translate-y-0.5">
              Подписаться в Telegram
            </a>
          )}
          {subscribe.max && (
            <a href={subscribe.max} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center justify-center rounded-ctl border-[1.5px] border-cream px-6 text-[15px] font-[600] text-cream no-underline">
              Подписаться в MAX
            </a>
          )}
        </div>
      </section>

      <section className="flex flex-col items-start gap-3">
        <h2 className="t-heading text-[22px]">Хотите, чтобы дело пошло быстрее?</h2>
        <p className="max-w-[60ch] text-[16px] text-muted">Преподаватель «Спектра» разберёт темы из списка «Стоит подтянуть» — индивидуально или в мини-группе до шести человек.</p>
        <ButtonLink to={`/book?note=${encodeURIComponent(`Родитель: хочу занятия для ребёнка (${child}). Подтянуть: ${progress.weak.map((w) => w.title).join(', ') || 'по результатам практикума'}`)}`}>
          Записаться на занятие
        </ButtonLink>
      </section>
    </Container>
  );
}

/** Из отчёта — в кабинет родителя: расписание по дням, домашка, слово преподавателя, сводки в боте. */
function ParentCabinetInvite({ token, child }: { token: string; child: string }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const claim = useMutation({
    mutationFn: () => api<{ childId: string; roleChanged: boolean }>('/family/claim', { method: 'POST', json: { token } }),
    onSuccess: (r) => {
      if (r.roleChanged) refresh();
      navigate(`/family?child=${r.childId}`);
    },
  });
  const canClaim = user && (user.role === 'PARENT' || user.role === 'ADMIN' || user.role === 'STUDENT');
  return (
    <section className="hue-4 grid gap-5 rounded-[14px] bg-tint p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div className="flex flex-col gap-2">
        <p className="t-mono inline-flex items-center gap-2 text-[12px] text-hue">
          <UserRound className="size-4" /> кабинет родителя · бесплатно
        </p>
        <p className="t-display text-[clamp(24px,3vw,32px)] leading-tight">Расписание, домашка и слово преподавателя — в одном месте</p>
        <p className="text-[15.5px] text-ink/80">Утром бот пришлёт, какие сегодня занятия, за 15 минут напомнит об уроке, а в воскресенье — подведёт итог недели. Можно добавить нескольких детей.</p>
      </div>
      <div className="flex flex-col gap-2 lg:items-end">
        {canClaim ? (
          <Button loading={claim.isPending} onClick={() => claim.mutate()}>
            Добавить в мой кабинет: {child}
          </Button>
        ) : (
          <>
            <ButtonLink to={`/register?as=parent&family=${encodeURIComponent(token)}`}>Завести кабинет родителя</ButtonLink>
            <ButtonLink to={`/login?next=${encodeURIComponent(`/parents/${token}`)}`} variant="ghost">
              У меня уже есть аккаунт
            </ButtonLink>
          </>
        )}
        {claim.error && <p className="rounded-[8px] bg-butter px-3 py-2 text-[14.5px]">{(claim.error as Error).message}</p>}
      </div>
    </section>
  );
}
