import { prisma } from './prisma.js';
import { findGenerator } from '../practice/generators.js';

// Состав и статус домашнего задания. В поле problemIds хранятся через запятую:
//   id задач практикума (opt-1, kin-3 …) и задания тренажёров вида tr:<генератор>:<сколько решить>.
// Один расчёт для сайта, ботов и отчёта родителям.

export interface Tasks {
  problems: string[];
  trainers: { id: string; count: number; title: string }[];
}

export function parseTasks(problemIds: string): Tasks {
  const tokens = problemIds.split(',').filter(Boolean);
  const problems: string[] = [];
  const trainers: Tasks['trainers'] = [];
  for (const t of tokens) {
    const m = /^tr:([a-z0-9-]+):(\d{1,2})$/.exec(t);
    if (m) {
      const gen = findGenerator(m[1]!);
      if (gen) trainers.push({ id: gen.id, count: Math.max(1, Math.min(50, Number(m[2]))), title: gen.title });
    } else problems.push(t);
  }
  return { problems, trainers };
}

export interface AssignmentLike {
  id: string;
  problemIds: string;
  note: string;
  createdAt: Date;
  marks?: { userId: string; done: boolean }[];
}

export interface Status {
  solvedProblems: Set<string>;
  trainerDone: Record<string, number>;
  done: boolean;
  complete: boolean;
}

/** Статусы заданий для набора учеников: ключ «assignmentId:userId». */
export async function statuses(assignments: AssignmentLike[], userIds: string[]) {
  const out = new Map<string, Status>();
  if (!assignments.length || !userIds.length) return out;
  const parsed = new Map(assignments.map((a) => [a.id, parseTasks(a.problemIds)]));
  const allProblems = [...new Set([...parsed.values()].flatMap((p) => p.problems))];
  const anyTrainers = [...parsed.values()].some((p) => p.trainers.length);
  const since = new Date(Math.min(...assignments.map((a) => a.createdAt.getTime())));
  const attempts = await prisma.practiceAttempt.findMany({
    where: {
      userId: { in: userIds },
      correct: true,
      OR: [...(allProblems.length ? [{ problemId: { in: allProblems } }] : []), ...(anyTrainers ? [{ problemId: { startsWith: 'g:' }, createdAt: { gte: since } }] : [])],
    },
    select: { userId: true, problemId: true, createdAt: true },
  });
  for (const a of assignments) {
    const tasks = parsed.get(a.id)!;
    for (const uid of userIds) {
      const mine = attempts.filter((x) => x.userId === uid);
      const solvedProblems = new Set(mine.filter((x) => tasks.problems.includes(x.problemId)).map((x) => x.problemId));
      const trainerDone: Record<string, number> = {};
      for (const t of tasks.trainers) {
        // считаем только задачи, решённые после того, как задание выдано
        trainerDone[t.id] = Math.min(t.count, mine.filter((x) => x.problemId.startsWith(`g:${t.id}:`) && x.createdAt >= a.createdAt).length);
      }
      const done = a.marks?.find((m) => m.userId === uid)?.done ?? false;
      const complete = tasks.problems.every((p) => solvedProblems.has(p)) && tasks.trainers.every((t) => (trainerDone[t.id] ?? 0) >= t.count) && (!a.note || done);
      out.set(`${a.id}:${uid}`, { solvedProblems, trainerDone, done, complete });
    }
  }
  return out;
}
