import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { findProblem, publicProblem } from '../practice/content.js';
import { notifyUser } from '../bot/index.js';
import { fmtWhen } from '../lib/time.js';

// Домашние задания: задачи практикума с автопроверкой и/или своё задание преподавателя.

const ids = (s: string) => s.split(',').filter(Boolean);

function problemsOf(problemIds: string) {
  return ids(problemIds).flatMap((pid) => {
    const f = findProblem(pid);
    return f ? [{ ...publicProblem(f.problem), topic: { subject: f.subject.slug, slug: f.topic.slug, title: f.topic.title } }] : [];
  });
}

/** Ученики, которым адресовано задание. */
async function targetsOf(a: { groupId: string | null; studentId: string | null }) {
  if (a.studentId) {
    const u = await prisma.user.findUnique({ where: { id: a.studentId }, select: { id: true, name: true, avatarUrl: true } });
    return u ? [u] : [];
  }
  if (a.groupId) {
    const members = await prisma.groupMember.findMany({ where: { groupId: a.groupId }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } });
    return members.map((m) => m.user);
  }
  return [];
}

async function solvedBy(userIds: string[], problemIds: string[]) {
  if (!userIds.length || !problemIds.length) return new Map<string, Set<string>>();
  const attempts = await prisma.practiceAttempt.findMany({
    where: { userId: { in: userIds }, problemId: { in: problemIds }, correct: true },
    select: { userId: true, problemId: true },
  });
  const map = new Map<string, Set<string>>();
  for (const a of attempts) map.set(a.userId!, (map.get(a.userId!) ?? new Set()).add(a.problemId));
  return map;
}

export async function homeworkRoutes(app: FastifyInstance) {
  // ——— преподаватель ———
  await app.register(async (t) => {
    t.addHook('preHandler', requireRole('TEACHER', 'ADMIN'));

    const myTeacher = async (userId: string) => prisma.teacher.findUnique({ where: { userId } });

    t.get('/teacher/assignments', async (req, reply) => {
      const teacher = await myTeacher(req.user.sub);
      if (!teacher) return reply.code(403).send({ error: 'У аккаунта нет профиля преподавателя' });
      const list = await prisma.assignment.findMany({
        where: { teacherId: teacher.id },
        include: { group: { select: { id: true, name: true, hue: true } }, student: { select: { id: true, name: true } }, marks: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const result = [];
      for (const a of list) {
        const targets = await targetsOf(a);
        const pids = ids(a.problemIds);
        const solved = await solvedBy(
          targets.map((x) => x.id),
          pids,
        );
        result.push({
          ...a,
          problems: problemsOf(a.problemIds),
          students: targets.map((s) => {
            const mark = a.marks.find((m) => m.userId === s.id);
            return { ...s, solved: solved.get(s.id)?.size ?? 0, done: mark?.done ?? false, answer: mark?.answer ?? '', comment: mark?.comment ?? '' };
          }),
        });
      }
      return { assignments: result };
    });

    t.post('/teacher/assignments', async (req, reply) => {
      const teacher = await myTeacher(req.user.sub);
      if (!teacher) return reply.code(403).send({ error: 'У аккаунта нет профиля преподавателя' });
      const body = z
        .object({
          title: z.string().trim().min(2, 'Назовите задание').max(140),
          note: z.string().trim().max(4000).default(''),
          problemIds: z.array(z.string()).max(30).default([]),
          dueAt: z.coerce.date().optional().nullable(),
          groupId: z.string().optional().nullable(),
          studentId: z.string().optional().nullable(),
        })
        .parse(req.body);
      if (!body.groupId && !body.studentId) return reply.code(400).send({ error: 'Выберите группу или ученика' });
      if (!body.note && !body.problemIds.length) return reply.code(400).send({ error: 'Добавьте задачи из практикума или опишите задание' });
      if (body.groupId && req.user.role !== 'ADMIN') {
        const g = await prisma.group.findFirst({ where: { id: body.groupId, teacherId: teacher.id } });
        if (!g) return reply.code(403).send({ error: 'Это не ваша группа' });
      }
      const valid = body.problemIds.filter((p) => findProblem(p));
      const assignment = await prisma.assignment.create({
        data: {
          title: body.title,
          note: body.note,
          problemIds: valid.join(','),
          dueAt: body.dueAt ?? null,
          teacherId: teacher.id,
          groupId: body.groupId || null,
          studentId: body.groupId ? null : body.studentId || null,
        },
      });
      // ученикам — уведомление в мессенджер
      const teacherUser = await prisma.user.findUnique({ where: { id: teacher.userId }, select: { name: true } });
      for (const s of await targetsOf(assignment)) {
        void notifyUser(
          s.id,
          `📝 <b>Новое домашнее задание</b>\n${assignment.title}\n\nОт: ${teacherUser?.name ?? 'преподаватель'}` +
            (valid.length ? `\nЗадач с автопроверкой: ${valid.length}` : '') +
            (assignment.dueAt ? `\nСдать до: ${fmtWhen(assignment.dueAt)}` : ''),
          { app: '/app/homework', label: '📝 Открыть домашку' },
        );
      }
      return { assignment };
    });

    t.delete('/teacher/assignments/:id', async (req, reply) => {
      const teacher = await myTeacher(req.user.sub);
      const { id } = req.params as { id: string };
      const a = await prisma.assignment.findFirst({ where: { id, ...(req.user.role === 'ADMIN' ? {} : { teacherId: teacher?.id ?? '-' }) } });
      if (!a) return reply.code(404).send({ error: 'Задание не найдено' });
      await prisma.assignment.delete({ where: { id } });
      return { ok: true };
    });

    // Комментарий преподавателя к ответу ученика
    t.patch('/teacher/assignments/:id/marks/:userId', async (req, reply) => {
      const teacher = await myTeacher(req.user.sub);
      const { id, userId } = req.params as { id: string; userId: string };
      const { comment } = z.object({ comment: z.string().max(2000) }).parse(req.body);
      const a = await prisma.assignment.findFirst({ where: { id, ...(req.user.role === 'ADMIN' ? {} : { teacherId: teacher?.id ?? '-' }) } });
      if (!a) return reply.code(404).send({ error: 'Задание не найдено' });
      const mark = await prisma.assignmentMark.upsert({
        where: { assignmentId_userId: { assignmentId: id, userId } },
        create: { assignmentId: id, userId, comment },
        update: { comment },
      });
      if (comment) void notifyUser(userId, `💬 <b>Комментарий к домашке</b> «${a.title}»\n\n${comment.replace(/[<>&]/g, '')}`, { app: '/app/homework', label: '📝 Открыть домашку' });
      return { mark };
    });

    // Каталог задач практикума для выбора в задание
    t.get('/teacher/practice-problems', async () => {
      const { PRACTICE } = await import('../practice/content.js');
      return {
        subjects: PRACTICE.map((s) => ({
          slug: s.slug,
          title: s.title,
          hue: s.hue,
          topics: s.topics.map((tp) => ({ slug: tp.slug, title: tp.title, problems: tp.problems.map((p) => ({ id: p.id, text: p.text, level: p.level })) })),
        })),
      };
    });
  });

  // ——— ученик ———
  await app.register(async (s) => {
    s.addHook('preHandler', authenticate);

    s.get('/me/assignments', async (req) => {
      const userId = req.user.sub;
      const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
      const list = await prisma.assignment.findMany({
        where: { OR: [{ studentId: userId }, { groupId: { in: memberships.map((m) => m.groupId) } }] },
        include: { teacher: { select: { hue: true, user: { select: { name: true } } } }, group: { select: { name: true } }, marks: { where: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: 60,
      });
      const solved = (await solvedBy([userId], list.flatMap((a) => ids(a.problemIds)))).get(userId) ?? new Set<string>();
      return {
        assignments: list.map((a) => {
          const problems = problemsOf(a.problemIds);
          const mark = a.marks[0];
          const solvedHere = problems.filter((p) => solved.has(p.id)).length;
          return {
            id: a.id,
            title: a.title,
            note: a.note,
            dueAt: a.dueAt,
            createdAt: a.createdAt,
            teacher: a.teacher,
            group: a.group,
            problems: problems.map((p) => ({ ...p, solved: solved.has(p.id) })),
            solved: solvedHere,
            done: mark?.done ?? false,
            answer: mark?.answer ?? '',
            comment: mark?.comment ?? '',
            complete: (problems.length === 0 || solvedHere === problems.length) && (!a.note || (mark?.done ?? false)),
          };
        }),
      };
    });

    s.post('/me/assignments/:id/mark', async (req, reply) => {
      const userId = req.user.sub;
      const { id } = req.params as { id: string };
      const body = z.object({ done: z.boolean().optional(), answer: z.string().max(4000).optional() }).parse(req.body);
      const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
      const a = await prisma.assignment.findFirst({ where: { id, OR: [{ studentId: userId }, { groupId: { in: memberships.map((m) => m.groupId) } }] }, include: { teacher: true } });
      if (!a) return reply.code(404).send({ error: 'Задание не найдено' });
      const mark = await prisma.assignmentMark.upsert({
        where: { assignmentId_userId: { assignmentId: id, userId } },
        create: { assignmentId: id, userId, done: body.done ?? false, answer: body.answer ?? '' },
        update: { ...(body.done !== undefined ? { done: body.done } : {}), ...(body.answer !== undefined ? { answer: body.answer } : {}) },
      });
      if (body.done) {
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        void notifyUser(a.teacher.userId, `✅ ${me?.name ?? 'Ученик'} сдал домашку «${a.title}»`, { app: '/teach/homework', label: 'Посмотреть' });
      }
      return { mark };
    });
  });
}
