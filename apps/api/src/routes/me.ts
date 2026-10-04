import type { FastifyInstance } from 'fastify';
import { rl } from '../lib/limits.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { notifyTicketFromWeb } from '../bot/index.js';

const lessonInclude = {
  teacher: { select: { slug: true, subject: true, hue: true, photoUrl: true, user: { select: { name: true } } } },
  group: { select: { slug: true, name: true, hue: true } },
  reschedules: { select: { id: true, status: true, proposedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' as const } },
} as const;

async function myLessonFilter(userId: string) {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  return { OR: [{ studentId: userId }, { groupId: { in: memberships.map((m) => m.groupId) } }] };
}

export async function meRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/me/schedule', async (req) => {
    const q = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(req.query);
    const from = q.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const to = q.to ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 60);
    const lessons = await prisma.lesson.findMany({
      where: { AND: [await myLessonFilter(req.user.sub), { startsAt: { gte: from, lte: to } }] },
      include: lessonInclude,
      orderBy: { startsAt: 'asc' },
    });
    return { lessons };
  });

  app.get('/me/overview', async (req) => {
    const userId = req.user.sub;
    const filter = await myLessonFilter(userId);
    const [next, upcomingCount, doneCount, groups, openTickets, pendingRequests] = await Promise.all([
      prisma.lesson.findFirst({
        where: { AND: [filter, { startsAt: { gte: new Date(Date.now() - 1000 * 60 * 60) } }, { status: 'SCHEDULED' }] },
        include: lessonInclude,
        orderBy: { startsAt: 'asc' },
      }),
      prisma.lesson.count({ where: { AND: [filter, { startsAt: { gte: new Date() } }, { status: 'SCHEDULED' }] } }),
      prisma.lesson.count({ where: { AND: [filter, { status: 'DONE' }] } }),
      prisma.groupMember.count({ where: { userId } }),
      prisma.supportTicket.count({ where: { userId, status: { not: 'CLOSED' } } }),
      prisma.rescheduleRequest.count({ where: { userId, status: 'PENDING' } }),
    ]);
    return { next, upcomingCount, doneCount, groups, openTickets, pendingRequests };
  });

  app.get('/me/groups', async (req) => {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.user.sub } } },
      include: {
        teacher: { select: { slug: true, subject: true, hue: true, photoUrl: true, user: { select: { name: true } } } },
        photos: { take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { members: true, photos: true } },
      },
    });
    return { groups };
  });

  app.get('/me/bookings', async (req) => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user.sub },
      include: { course: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { bookings };
  });

  app.get('/me/enrollments', async (req) => {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.sub },
      include: { course: { select: { title: true, slug: true, hue: true, source: true, university: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { enrollments };
  });

  app.post('/me/enrollments', async (req, reply) => {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.body);
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: 'Курс не найден' });
    const enrollment = await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: req.user.sub, courseId } },
      create: { userId: req.user.sub, courseId },
      update: {},
    });
    return { enrollment };
  });

  // Заявки на перенос
  app.get('/me/reschedules', async (req) => {
    const requests = await prisma.rescheduleRequest.findMany({
      where: { userId: req.user.sub },
      include: { lesson: { include: lessonInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return { requests };
  });

  app.post('/me/reschedules', { config: rl(10, '10 minutes') }, async (req, reply) => {
    const body = z
      .object({
        lessonId: z.string(),
        reason: z.string().trim().min(3, 'Опишите причину').max(1000),
        proposedAt: z.coerce.date().optional(),
      })
      .parse(req.body);
    const lesson = await prisma.lesson.findFirst({
      where: { AND: [{ id: body.lessonId }, await myLessonFilter(req.user.sub)] },
    });
    if (!lesson) return reply.code(404).send({ error: 'Занятие не найдено' });
    if (lesson.status !== 'SCHEDULED') return reply.code(400).send({ error: 'Это занятие уже нельзя перенести' });
    const pending = await prisma.rescheduleRequest.findFirst({
      where: { lessonId: lesson.id, userId: req.user.sub, status: 'PENDING' },
    });
    if (pending) return reply.code(409).send({ error: 'Заявка на перенос этого занятия уже на рассмотрении' });
    const request = await prisma.rescheduleRequest.create({
      data: { lessonId: lesson.id, userId: req.user.sub, reason: body.reason, proposedAt: body.proposedAt },
    });
    return { request };
  });

  // Поддержка
  app.get('/me/tickets', async (req) => {
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: req.user.sub },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 }, _count: { select: { messages: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return { tickets };
  });

  app.post('/me/tickets', { config: rl(10, '10 minutes') }, async (req) => {
    const body = z
      .object({ subject: z.string().trim().min(3, 'Тема слишком короткая').max(140), body: z.string().trim().min(1).max(4000) })
      .parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        subject: body.subject,
        userId: req.user.sub,
        messages: { create: { body: body.body, authorId: req.user.sub } },
      },
    });
    void notifyTicketFromWeb(ticket.id, `${body.subject}\n\n${body.body}`, req.user.sub);
    return { ticket };
  });

  app.get('/me/tickets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: req.user.sub },
      include: {
        messages: {
          include: { author: { select: { id: true, name: true, role: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) return reply.code(404).send({ error: 'Обращение не найдено' });
    return { ticket };
  });

  app.post('/me/tickets/:id/messages', { config: rl(30, '10 minutes') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const ticket = await prisma.supportTicket.findFirst({ where: { id, userId: req.user.sub } });
    if (!ticket) return reply.code(404).send({ error: 'Обращение не найдено' });
    const message = await prisma.ticketMessage.create({ data: { ticketId: id, authorId: req.user.sub, body } });
    await prisma.supportTicket.update({ where: { id }, data: { status: 'OPEN' } });
    void notifyTicketFromWeb(id, body, req.user.sub);
    return { message };
  });
}
