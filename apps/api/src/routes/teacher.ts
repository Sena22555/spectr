import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { LESSON_STATUS } from '../lib/enums.js';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function currentTeacher(req: FastifyRequest) {
  const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.sub } });
  if (!teacher) throw new HttpError(403, 'У аккаунта нет профиля преподавателя');
  return teacher;
}

const lessonInclude = {
  group: { select: { id: true, slug: true, name: true, hue: true, _count: { select: { members: true } } } },
  student: { select: { id: true, name: true, avatarUrl: true } },
  reschedules: { where: { status: 'PENDING' }, select: { id: true } },
} as const;

export async function teacherRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('TEACHER', 'ADMIN'));
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
    throw err;
  });

  app.get('/teacher/overview', async (req) => {
    const t = await currentTeacher(req);
    const now = new Date();
    const weekAhead = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const [today, week, groups, pending, missingLinks] = await Promise.all([
      prisma.lesson.findMany({
        where: { teacherId: t.id, status: 'SCHEDULED', startsAt: { gte: new Date(now.setHours(0, 0, 0, 0)), lte: new Date(new Date().setHours(23, 59, 59, 999)) } },
        include: lessonInclude,
        orderBy: { startsAt: 'asc' },
      }),
      prisma.lesson.count({ where: { teacherId: t.id, status: 'SCHEDULED', startsAt: { gte: new Date(), lte: weekAhead } } }),
      prisma.group.count({ where: { teacherId: t.id } }),
      prisma.rescheduleRequest.count({ where: { status: 'PENDING', lesson: { teacherId: t.id } } }),
      prisma.lesson.count({ where: { teacherId: t.id, status: 'SCHEDULED', startsAt: { gte: new Date() }, OR: [{ link: null }, { link: '' }] } }),
    ]);
    return { teacher: t, today, week, groups, pending, missingLinks };
  });

  app.get('/teacher/lessons', async (req) => {
    const t = await currentTeacher(req);
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
    const lessons = await prisma.lesson.findMany({
      where: {
        teacherId: t.id,
        startsAt: {
          gte: q.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
          lte: q.to ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
        },
      },
      include: lessonInclude,
      orderBy: { startsAt: 'asc' },
    });
    return { lessons };
  });

  app.post('/teacher/lessons', async (req, reply) => {
    const t = await currentTeacher(req);
    const body = z
      .object({
        title: z.string().trim().min(2).max(140),
        startsAt: z.coerce.date(),
        durationMin: z.coerce.number().int().min(15).max(240).default(60),
        groupId: z.string().optional(),
        studentId: z.string().optional(),
        link: z.url('Нужна ссылка вида https://…').optional().or(z.literal('')),
      })
      .parse(req.body);
    if (!body.groupId && !body.studentId) return reply.code(400).send({ error: 'Выберите группу или ученика' });
    if (body.groupId) {
      const g = await prisma.group.findFirst({ where: { id: body.groupId, teacherId: t.id } });
      if (!g) return reply.code(403).send({ error: 'Это не ваша группа' });
    }
    const lesson = await prisma.lesson.create({ data: { ...body, link: body.link || null, teacherId: t.id } });
    return { lesson };
  });

  app.patch('/teacher/lessons/:id', async (req, reply) => {
    const t = await currentTeacher(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        title: z.string().trim().min(2).max(140).optional(),
        link: z.url('Нужна ссылка вида https://…').optional().or(z.literal('')),
        notes: z.string().max(4000).optional(),
        status: z.enum(LESSON_STATUS).optional(),
        startsAt: z.coerce.date().optional(),
      })
      .parse(req.body);
    const lesson = await prisma.lesson.findFirst({ where: { id, teacherId: t.id } });
    if (!lesson) return reply.code(404).send({ error: 'Занятие не найдено' });
    const updated = await prisma.lesson.update({
      where: { id },
      data: { ...body, link: body.link === '' ? null : body.link },
      include: lessonInclude,
    });
    return { lesson: updated };
  });

  app.get('/teacher/groups', async (req) => {
    const t = await currentTeacher(req);
    const groups = await prisma.group.findMany({
      where: { teacherId: t.id },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } } } },
        photos: { orderBy: { createdAt: 'desc' } },
        course: { select: { title: true } },
      },
    });
    return { groups };
  });

  app.get('/teacher/students', async (req) => {
    const t = await currentTeacher(req);
    const [members, individual] = await Promise.all([
      prisma.groupMember.findMany({
        where: { group: { teacherId: t.id } },
        include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } }, group: { select: { name: true, hue: true } } },
      }),
      prisma.lesson.findMany({
        where: { teacherId: t.id, studentId: { not: null } },
        distinct: ['studentId'],
        include: { student: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } } },
      }),
    ]);
    const map = new Map<string, { user: NonNullable<(typeof individual)[number]['student']>; groups: { name: string; hue: number }[]; individual: boolean }>();
    for (const m of members) {
      const entry = map.get(m.user.id) ?? { user: m.user, groups: [], individual: false };
      entry.groups.push(m.group);
      map.set(m.user.id, entry);
    }
    for (const l of individual) {
      if (!l.student) continue;
      const entry = map.get(l.student.id) ?? { user: l.student, groups: [], individual: false };
      entry.individual = true;
      map.set(l.student.id, entry);
    }
    return { students: [...map.values()] };
  });

  app.get('/teacher/reschedules', async (req) => {
    const t = await currentTeacher(req);
    const requests = await prisma.rescheduleRequest.findMany({
      where: { lesson: { teacherId: t.id } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        lesson: { include: { group: { select: { name: true, hue: true } } } },
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    });
    return { requests };
  });

  app.patch('/teacher/reschedules/:id', async (req, reply) => {
    const t = await currentTeacher(req);
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.enum(['APPROVED', 'DECLINED']),
        reply: z.string().max(1000).optional(),
        newStartsAt: z.coerce.date().optional(),
      })
      .parse(req.body);
    const request = await prisma.rescheduleRequest.findFirst({ where: { id, lesson: { teacherId: t.id } } });
    if (!request) return reply.code(404).send({ error: 'Заявка не найдена' });
    const startsAt = body.newStartsAt ?? request.proposedAt ?? undefined;
    const [updated] = await prisma.$transaction([
      prisma.rescheduleRequest.update({ where: { id }, data: { status: body.status, reply: body.reply } }),
      ...(body.status === 'APPROVED' && startsAt
        ? [prisma.lesson.update({ where: { id: request.lessonId }, data: { startsAt } })]
        : []),
    ]);
    return { request: updated };
  });

  app.post('/teacher/groups/:id/photos', async (req, reply) => {
    const t = await currentTeacher(req);
    const { id } = req.params as { id: string };
    const body = z.object({ url: z.string().min(1).max(500), caption: z.string().max(200).optional() }).parse(req.body);
    const group = await prisma.group.findFirst({ where: { id, ...(req.user.role === 'ADMIN' ? {} : { teacherId: t.id }) } });
    if (!group) return reply.code(404).send({ error: 'Группа не найдена' });
    const photo = await prisma.groupPhoto.create({ data: { groupId: id, ...body } });
    return { photo };
  });

  app.delete('/teacher/photos/:id', async (req, reply) => {
    const t = await currentTeacher(req);
    const { id } = req.params as { id: string };
    const photo = await prisma.groupPhoto.findFirst({ where: { id, group: { teacherId: t.id } } });
    if (!photo) return reply.code(404).send({ error: 'Фото не найдено' });
    await prisma.groupPhoto.delete({ where: { id } });
    return { ok: true };
  });

  app.patch('/teacher/profile', async (req) => {
    const t = await currentTeacher(req);
    const body = z
      .object({
        subject: z.string().trim().min(2).max(80).optional(),
        headline: z.string().trim().min(2).max(160).optional(),
        bio: z.string().trim().max(4000).optional(),
        photoUrl: z.string().max(500).optional(),
      })
      .parse(req.body);
    const teacher = await prisma.teacher.update({ where: { id: t.id }, data: body });
    return { teacher };
  });
}
