import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtFull, plural } from '../../lib/format';
import { haptic } from '../../lib/platform';
import { Avatar, Button, Empty, ErrorNote, Input, Loading, PageHeader, Select, Textarea } from '../../components/ui';
import { RichText } from '../../components/Tex';

interface PickerSubject {
  slug: string;
  title: string;
  hue: number;
  topics: { slug: string; title: string; problems: { id: string; text: string; level: number }[] }[];
}

interface TAssignment {
  id: string;
  title: string;
  note: string;
  dueAt: string | null;
  createdAt: string;
  group: { id: string; name: string; hue: number } | null;
  student: { id: string; name: string } | null;
  problems: { id: string; text: string; topic: { title: string } }[];
  students: { id: string; name: string; avatarUrl: string | null; solved: number; done: boolean; answer: string; comment: string }[];
}

export default function TeachHomework() {
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['teacher', 'assignments'], queryFn: () => api<{ assignments: TAssignment[] }>('/teacher/assignments').then((r) => r.assignments) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Домашние задания"
        lead="Задайте задачи из практикума — они проверяются автоматически, а вы видите, кто сколько решил. Или опишите своё задание словами."
        actions={
          <Button variant={creating ? 'secondary' : 'primary'} onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <Plus className="size-4" /> {creating ? 'Скрыть' : 'Новое задание'}
          </Button>
        }
      />
      <AnimatePresence initial={false}>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <CreateAssignment onDone={() => setCreating(false)} />
          </motion.div>
        )}
      </AnimatePresence>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data && !q.data.length && !creating && (
        <Empty title="Заданий пока нет" hue={3} action={<Button onClick={() => setCreating(true)}>Задать первое</Button>}>
          Ученики получат уведомление в Telegram, а решения задач из практикума проверятся сами.
        </Empty>
      )}
      <div className="flex flex-col gap-4">
        {q.data?.map((a) => (
          <AssignmentRow key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}

function AssignmentRow({ a }: { a: TAssignment }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const del = useMutation({ mutationFn: () => api(`/teacher/assignments/${a.id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher', 'assignments'] }) });
  const total = a.problems.length;
  const complete = a.students.filter((s) => (total === 0 || s.solved === total) && (!a.note || s.done)).length;
  const hue = a.group?.hue ?? 5;
  return (
    <article className={clsx(`hue-${hue}`, 'rounded-[14px] border-[1.5px] border-ink/15 bg-paper')}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="press flex w-full items-start gap-4 p-5 text-left">
        <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full bg-ray" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-heading text-[22px] leading-tight">{a.title}</span>
          <span className="t-caption text-muted">
            {a.group?.name ?? a.student?.name} · {total ? `${total} ${plural(total, 'задача', 'задачи', 'задач')}` : 'своё задание'}
            {a.dueAt ? ` · до ${fmtFull(a.dueAt)}` : ''}
          </span>
        </span>
        <span className="t-heading tnum shrink-0 text-[20px]">
          {complete}/{a.students.length}
          <span className="t-mono block text-[10px] text-muted">сдали</span>
        </span>
        <ChevronDown className={clsx('mt-2 size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-dashed border-hair-soft p-5">
          {a.note && (
            <p className="text-[16px] whitespace-pre-line">
              <RichText text={a.note} />
            </p>
          )}
          {a.problems.length > 0 && (
            <ol className="m-0 flex flex-col gap-1 pl-5 text-[15px] text-muted">
              {a.problems.map((p) => (
                <li key={p.id}>
                  <span className="text-ink">{p.topic.title}:</span> {p.text}
                </li>
              ))}
            </ol>
          )}
          <ul className="m-0 flex list-none flex-col p-0">
            {a.students.map((s) => (
              <StudentMark key={s.id} assignmentId={a.id} s={s} total={total} needsNote={Boolean(a.note)} />
            ))}
          </ul>
          <button type="button" className="link inline-flex w-fit items-center gap-1.5 text-[14px] text-ember-text" onClick={() => confirm('Удалить задание?') && del.mutate()}>
            <Trash2 className="size-4" /> Удалить задание
          </button>
        </div>
      )}
    </article>
  );
}

function StudentMark({ assignmentId, s, total, needsNote }: { assignmentId: string; s: TAssignment['students'][number]; total: number; needsNote: boolean }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState(s.comment);
  const save = useMutation({
    mutationFn: () => api(`/teacher/assignments/${assignmentId}/marks/${s.id}`, { method: 'PATCH', json: { comment } }),
    onSuccess: () => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['teacher', 'assignments'] });
    },
  });
  const ok = (total === 0 || s.solved === total) && (!needsNote || s.done);
  return (
    <li className="flex flex-col gap-2 border-b border-hair-soft py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={s.name} url={s.avatarUrl} className="size-8 text-[12px]" />
        <span className="flex-1 text-[16px]">{s.name}</span>
        {total > 0 && (
          <span className="t-mono tnum text-[12px] text-muted">
            задачи {s.solved}/{total}
          </span>
        )}
        {needsNote && <span className={clsx('t-mono text-[12px]', s.done ? 'text-hue' : 'text-muted')}>{s.done ? 'отметил «сделал»' : 'не отметил'}</span>}
        {ok && <Check className="size-5 text-hue" strokeWidth={2.4} />}
      </div>
      {s.answer && <p className="rounded-[8px] bg-bone px-3 py-2 text-[15px] whitespace-pre-line">{s.answer}</p>}
      <div className="flex gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий ученику (придёт ему в Telegram)"
          aria-label={`Комментарий для ${s.name}`}
          className="h-10 min-w-0 flex-1 rounded-ctl border border-ink/25 bg-paper px-3 text-[15px] focus-visible:border-ink focus-visible:outline-none"
        />
        <Button variant="secondary" className="min-h-10 px-4" disabled={comment === s.comment} loading={save.isPending} onClick={() => save.mutate()}>
          Отправить
        </Button>
      </div>
    </li>
  );
}

function CreateAssignment({ onDone }: { onDone(): void }) {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: ['teacher', 'groups'], queryFn: () => api<{ groups: { id: string; name: string }[] }>('/teacher/groups').then((r) => r.groups) });
  const students = useQuery({ queryKey: ['teacher', 'students'], queryFn: () => api<{ students: { user: { id: string; name: string } }[] }>('/teacher/students').then((r) => r.students) });
  const catalog = useQuery({ queryKey: ['teacher', 'practice-problems'], queryFn: () => api<{ subjects: PickerSubject[] }>('/teacher/practice-problems').then((r) => r.subjects), staleTime: Infinity });
  const [form, setForm] = useState({ title: '', note: '', target: '', dueAt: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [subject, setSubject] = useState('physics');
  const create = useMutation({
    mutationFn: () =>
      api('/teacher/assignments', {
        method: 'POST',
        json: {
          title: form.title,
          note: form.note,
          problemIds: picked,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          groupId: form.target.startsWith('g:') ? form.target.slice(2) : null,
          studentId: form.target.startsWith('s:') ? form.target.slice(2) : null,
        },
      }),
    onSuccess: () => {
      haptic('success');
      qc.invalidateQueries({ queryKey: ['teacher', 'assignments'] });
      onDone();
    },
  });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const current = catalog.data?.find((s) => s.slug === subject);

  return (
    <form
      className="flex flex-col gap-5 rounded-[14px] bg-bone p-5 sm:p-7"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: Закон Ома — тренировка" required />
        <Select label="Кому" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required>
          <option value="">Выберите группу или ученика</option>
          {groups.data?.length ? (
            <optgroup label="Группы">
              {groups.data.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {students.data?.length ? (
            <optgroup label="Ученики">
              {students.data.map((s) => (
                <option key={s.user.id} value={`s:${s.user.id}`}>
                  {s.user.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
        <Input label="Сдать до" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} hint="Необязательно" />
      </div>
      <Textarea label="Своё задание (необязательно)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Например: решить № 214–218 из учебника и прислать ответы. Формулы можно писать в $…$" />

      <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="t-caption mb-2 p-0 font-[550]">
          Задачи из практикума {picked.length > 0 && <span className="text-muted">· выбрано {picked.length}</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {catalog.data?.map((s) => (
            <button key={s.slug} type="button" onClick={() => setSubject(s.slug)} className={clsx('press rounded-full px-3.5 py-1.5 text-[14px]', subject === s.slug ? 'bg-ink text-paper' : 'border border-ink/30 hover:bg-ink/[0.06]')}>
              {s.title}
            </button>
          ))}
        </div>
        <div className="flex max-h-[360px] flex-col gap-4 overflow-y-auto rounded-[10px] border border-ink/15 bg-paper p-4">
          {current?.topics.map((t) => (
            <div key={t.slug} className="flex flex-col gap-1">
              <p className="t-mono text-[11px] text-muted">{t.title}</p>
              {t.problems.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-[8px] px-2 py-1.5 hover:bg-mark/30">
                  <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
                  <span className="text-[15px]">
                    <span className="t-mono mr-1 text-[11px] text-muted">{'●'.repeat(p.level)}</span>
                    {p.text}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
      {create.error && <p className="t-caption text-ember-text">{(create.error as Error).message}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={create.isPending} disabled={!form.title || !form.target || (!form.note && !picked.length)}>
          Задать
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
