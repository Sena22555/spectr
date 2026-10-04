import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Check, ChevronDown, MessageSquareText } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtFull, plural } from '../../lib/format';
import { ProblemCard } from '../../components/practice/ProblemCard';
import { RichText } from '../../components/Tex';
import { Button, ButtonLink, Empty, ErrorNote, Loading, PageHeader, Textarea } from '../../components/ui';
import type { PracticeProblem } from '../../lib/practice';

export interface MyAssignment {
  id: string;
  title: string;
  note: string;
  dueAt: string | null;
  createdAt: string;
  teacher: { hue: number; user: { name: string } };
  group: { name: string } | null;
  problems: (PracticeProblem & { solved: boolean; topic: { subject: string; slug: string; title: string } })[];
  solved: number;
  done: boolean;
  answer: string;
  comment: string;
  complete: boolean;
}

export function useMyHomework() {
  return useQuery({ queryKey: ['my-homework'], queryFn: () => api<{ assignments: MyAssignment[] }>('/me/assignments').then((r) => r.assignments) });
}

export default function Homework() {
  const q = useMyHomework();
  const open = q.data?.filter((a) => !a.complete) ?? [];
  const closed = q.data?.filter((a) => a.complete) ?? [];
  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Домашка" lead="Задачи от преподавателя проверяются сразу, как в практикуме. Задание словами — опишите решение и отметьте «Сделал»." />
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data && !q.data.length && (
        <Empty title="Домашних заданий пока нет" action={<ButtonLink to="/practice">Потренироваться в практикуме</ButtonLink>}>
          Когда преподаватель задаст задание, оно появится здесь, а бот в Telegram пришлёт уведомление.
        </Empty>
      )}
      {open.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="t-mono text-[12px] text-muted">
            {open.length} {plural(open.length, 'задание ждёт', 'задания ждут', 'заданий ждут')}
          </h2>
          {open.map((a, i) => (
            <AssignmentCard key={a.id} a={a} defaultOpen={i === 0} />
          ))}
        </section>
      )}
      {closed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="t-mono text-[12px] text-muted">сделано</h2>
          {closed.map((a) => (
            <AssignmentCard key={a.id} a={a} />
          ))}
        </section>
      )}
    </div>
  );
}

function AssignmentCard({ a, defaultOpen = false }: { a: MyAssignment; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [answer, setAnswer] = useState(a.answer);
  const mark = useMutation({
    mutationFn: (v: { done?: boolean; answer?: string }) => api(`/me/assignments/${a.id}/mark`, { method: 'POST', json: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-homework'] }),
  });
  const overdue = a.dueAt && !a.complete && new Date(a.dueAt).getTime() < Date.now();
  const total = a.problems.length;

  return (
    <article className={clsx(`hue-${a.teacher.hue}`, 'overflow-hidden rounded-[14px] border-[1.5px]', a.complete ? 'border-transparent bg-tint' : 'border-ink/15 bg-paper')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="press flex w-full items-start gap-4 p-5 text-left sm:p-6">
        <span className={clsx('mt-1 grid size-9 shrink-0 place-items-center rounded-full', a.complete ? 'bg-ink text-mark' : 'bg-tint text-hue')}>
          {a.complete ? <Check className="size-5" strokeWidth={2.4} /> : <span className="t-mono tnum text-[12px]">{total ? `${a.solved}/${total}` : '•'}</span>}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-heading text-[22px] leading-tight">{a.title}</span>
          <span className="t-caption text-muted">
            {a.teacher.user.name}
            {a.group ? ` · ${a.group.name}` : ''}
            {a.dueAt && <span className={clsx(overdue && 'font-[600] text-ember-text')}> · сдать до {fmtFull(a.dueAt)}</span>}
          </span>
        </span>
        <ChevronDown className={clsx('mt-2 size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-col gap-5 border-t border-dashed border-hair-soft p-5 sm:p-6">
              {a.comment && (
                <p className="flex gap-3 rounded-[10px] bg-butter px-4 py-3 text-[16px]">
                  <MessageSquareText className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} />
                  <span>
                    <b>Комментарий преподавателя:</b> {a.comment}
                  </span>
                </p>
              )}
              {a.note && (
                <div className="flex flex-col gap-3">
                  <p className="t-mono text-[12px] text-muted">задание</p>
                  <p className="text-[17px] leading-relaxed whitespace-pre-line">
                    <RichText text={a.note} />
                  </p>
                  <Textarea label="Ваше решение или ответ" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Можно коротко: ответ и ход решения" />
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" loading={mark.isPending} onClick={() => mark.mutate({ answer })} disabled={answer === a.answer}>
                      Сохранить ответ
                    </Button>
                    <Button loading={mark.isPending} onClick={() => mark.mutate({ answer, done: !a.done })}>
                      {a.done ? 'Отметить как не сделано' : 'Сделал ✓'}
                    </Button>
                  </div>
                </div>
              )}
              {a.problems.map((p, i) => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <p className="t-mono text-[11px] text-muted">тема: {p.topic.title}</p>
                  <ProblemCard problem={p} index={i + 1} solved={p.solved} hue={a.teacher.hue} onSolved={() => qc.invalidateQueries({ queryKey: ['my-homework'] })} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
