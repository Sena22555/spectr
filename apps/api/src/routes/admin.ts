import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { publicUser, requireRole } from '../lib/auth.js';
import { BOOKING_STATUS, COURSE_SOURCE, ENROLLMENT_STATUS, LESSON_STATUS, ROLES, TICKET_STATUS } from '../lib/enums.js';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[а-яё]/g, (ch) => TRANSLIT[ch] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || `id-${Date.now()}`;

const TRANSLIT: Record<string, string> = Object.fromEntries(
  'а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:h ц:c ч:ch ш:sh щ:sch ъ: ы:y ь: э:e ю:yu я:ya'
    .split(' ')
    .map((p) => p.split(':') as [string, string]),
);

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  let slug = slugify(base);
  let i = 2;
  while (await exists(slug)) slug = `${slugify(base)}-${i++}`;
  return slug;
}

const optionalUrl = z.string().max(500).optional().or(z.literal(''));

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('ADMIN'));

  app.get('/admin/overview', async () => {
    const [users, teachers, students, groups, courses, newBookings, pendingRequests, openTickets, upcoming] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.group.count(),
      prisma.course.count(),
      prisma.booking.count({ where: { status: 'NEW' } }),
      prisma.rescheduleRequest.count({ where: { status: 'PENDING' } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.lesson.count({ where: { status: 'SCHEDULED', startsAt: { gte: new Date() } } }),
    ]);
    return { users, teachers, students, groups, courses, newBookings, pendingRequests, openTickets, upcoming };
  });

  // ——— Пользователи и роли ———
  app.get('/admin/users', async (req) => {
    const { q, role } = z.object({ q: z.string().optional(), role: z.enum(ROLES).optional() }).parse(req.query);
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q.toLowerCase() } }] } : {}),
      },
      include: { teacher: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { users: users.map(publicUser) };
  });

  // Выдача ролей. При назначении TEACHER создаётся профиль преподавателя («полуадминка»).
  app.patch('/admin/users/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ role: z.enum(ROLES).optional(), name: z.string().min(2).max(80).optional() }).parse(req.body);
    if (id === req.user.sub && body.role && body.role !== 'ADMIN') {
      return reply.code(400).send({ error: 'Нельзя снять роль администратора с самого себя' });
    }
    const user = await prisma.user.update({ where: { id }, data: body, include: { teacher: true } });
    if (body.role === 'TEACHER' && !user.teacher) {
      await prisma.teacher.create({
        data: {
          userId: user.id,
          slug: await uniqueSlug(user.name, async (s) => Boolean(await prisma.teacher.findUnique({ where: { slug: s } }))),
          subject: 'Предмет не указан',
          headline: 'Преподаватель «Спектра»',
          bio: '',
          hue: Math.floor(Math.random() * 7),
          published: false,
        },
      });
    }
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
    return { user: publicUser(fresh) };
  });

  // ——— Преподаватели ———
  app.get('/admin/teachers', async () => {
    const teachers = await prisma.teacher.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { groups: true, lessons: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { teachers };
  });

  app.patch('/admin/teachers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        subject: z.string().max(80).optional(),
        headline: z.string().max(160).optional(),
        bio: z.string().max(4000).optional(),
        experience: z.coerce.number().int().min(0).max(60).optional(),
        photoUrl: optionalUrl,
        hue: z.coerce.number().int().min(0).max(6).optional(),
        published: z.boolean().optional(),
      })
      .parse(req.body);
    const teacher = await prisma.teacher.update({ where: { id }, data: body });
    return { teacher };
  });

  // ——— Курсы ———
  const courseBody = z.object({
    title: z.string().trim().min(2).max(140),
    summary: z.string().trim().min(2).max(300),
    description: z.string().trim().max(6000).default(''),
    source: z.enum(COURSE_SOURCE).default('SCHOOL'),
    audience: z.enum(['SCHOOL', 'STUDENTS', 'ALL']).optional(),
    university: z.string().max(140).optional(),
    level: z.string().max(60).optional(),
    format: z.string().max(60).optional(),
    durationWeeks: z.coerce.number().int().min(1).max(104).optional(),
    priceFrom: z.coerce.number().int().min(0).optional(),
    hue: z.coerce.number().int().min(0).max(6).optional(),
    teacherId: z.string().nullable().optional(),
    published: z.boolean().optional(),
  });

  app.get('/admin/courses', async () => {
    const courses = await prisma.course.findMany({
      include: { teacher: { select: { id: true, user: { select: { name: true } } } }, _count: { select: { groups: true, enrollments: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { courses };
  });

  app.post('/admin/courses', async (req) => {
    const body = courseBody.parse(req.body);
    const slug = await uniqueSlug(body.title, async (s) => Boolean(await prisma.course.findUnique({ where: { slug: s } })));
    const course = await prisma.course.create({ data: { ...body, slug } });
    return { course };
  });

  app.patch('/admin/courses/:id', async (req) => {
    const { id } = req.params as { id: string };
    const course = await prisma.course.update({ where: { id }, data: courseBody.partial().parse(req.body) });
    return { course };
  });

  app.delete('/admin/courses/:id', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.course.delete({ where: { id } });
    return { ok: true };
  });

  app.get('/admin/enrollments', async () => {
    const enrollments = await prisma.enrollment.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, course: { select: { title: true, source: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { enrollments };
  });

  app.patch('/admin/enrollments/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(ENROLLMENT_STATUS) }).parse(req.body);
    const enrollment = await prisma.enrollment.update({ where: { id }, data: { status } });
    return { enrollment };
  });

  // ——— Группы ———
  const groupBody = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(3000).default(''),
    schedule: z.string().max(200).optional(),
    capacity: z.coerce.number().int().min(1).max(200).optional(),
    hue: z.coerce.number().int().min(0).max(6).optional(),
    coverUrl: optionalUrl,
    courseId: z.string().nullable().optional(),
    teacherId: z.string().nullable().optional(),
  });

  app.get('/admin/groups', async () => {
    const groups = await prisma.group.findMany({
      include: {
        teacher: { select: { id: true, user: { select: { name: true } } } },
        course: { select: { id: true, title: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { photos: true, lessons: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { groups };
  });

  app.post('/admin/groups', async (req) => {
    const body = groupBody.parse(req.body);
    const slug = await uniqueSlug(body.name, async (s) => Boolean(await prisma.group.findUnique({ where: { slug: s } })));
    const group = await prisma.group.create({ data: { ...body, slug } });
    return { group };
  });

  app.patch('/admin/groups/:id', async (req) => {
    const { id } = req.params as { id: string };
    const group = await prisma.group.update({ where: { id }, data: groupBody.partial().parse(req.body) });
    return { group };
  });

  app.delete('/admin/groups/:id', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.group.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/admin/groups/:id/members', async (req) => {
    const { id } = req.params as { id: string };
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    const member = await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: id, userId } },
      create: { groupId: id, userId },
      update: {},
    });
    return { member };
  });

  app.delete('/admin/groups/:id/members/:userId', async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    await prisma.groupMember.deleteMany({ where: { groupId: id, userId } });
    return { ok: true };
  });

  // ——— Занятия ———
  app.get('/admin/lessons', async (req) => {
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(req.query);
    const lessons = await prisma.lesson.findMany({
      where: {
        startsAt: {
          gte: q.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
          lte: q.to ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
        },
      },
      include: {
        teacher: { select: { id: true, hue: true, user: { select: { name: true } } } },
        group: { select: { id: true, name: true, hue: true } },
        student: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    return { lessons };
  });

  const lessonBody = z.object({
    title: z.string().trim().min(2).max(140),
    startsAt: z.coerce.date(),
    durationMin: z.coerce.number().int().min(15).max(240).default(60),
    teacherId: z.string(),
    groupId: z.string().nullable().optional(),
    studentId: z.string().nullable().optional(),
    link: optionalUrl,
    status: z.enum(LESSON_STATUS).optional(),
  });

  app.post('/admin/lessons', async (req, reply) => {
    const body = lessonBody.parse(req.body);
    if (!body.groupId && !body.studentId) return reply.code(400).send({ error: 'Выберите группу или ученика' });
    const lesson = await prisma.lesson.create({ data: { ...body, link: body.link || null } });
    return { lesson };
  });

  app.patch('/admin/lessons/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = lessonBody.partial().parse(req.body);
    const lesson = await prisma.lesson.update({ where: { id }, data: { ...body, link: body.link === '' ? null : body.link } });
    return { lesson };
  });

  app.delete('/admin/lessons/:id', async (req) => {
    const { id } = req.params as { id: string };
    await prisma.lesson.delete({ where: { id } });
    return { ok: true };
  });

  // ——— Заявки на запись ———
  app.get('/admin/bookings', async () => {
    const bookings = await prisma.booking.findMany({
      include: { course: { select: { title: true } }, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { bookings };
  });

  app.patch('/admin/bookings/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(BOOKING_STATUS) }).parse(req.body);
    const booking = await prisma.booking.update({ where: { id }, data: { status } });
    return { booking };
  });

  // ——— Переносы (админ видит все) ———
  app.get('/admin/reschedules', async () => {
    const requests = await prisma.rescheduleRequest.findMany({
      include: {
        user: { select: { id: true, name: true } },
        lesson: { include: { teacher: { select: { user: { select: { name: true } } } }, group: { select: { name: true } } } },
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    });
    return { requests };
  });

  app.patch('/admin/reschedules/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ status: z.enum(['APPROVED', 'DECLINED']), reply: z.string().max(1000).optional(), newStartsAt: z.coerce.date().optional() })
      .parse(req.body);
    const request = await prisma.rescheduleRequest.findUniqueOrThrow({ where: { id } });
    const startsAt = body.newStartsAt ?? request.proposedAt ?? undefined;
    const [updated] = await prisma.$transaction([
      prisma.rescheduleRequest.update({ where: { id }, data: { status: body.status, reply: body.reply } }),
      ...(body.status === 'APPROVED' && startsAt ? [prisma.lesson.update({ where: { id: request.lessonId }, data: { startsAt } })] : []),
    ]);
    return { request: updated };
  });

  // ——— Поддержка ———
  app.get('/admin/tickets', async (req) => {
    const { status } = z.object({ status: z.enum(TICKET_STATUS).optional() }).parse(req.query);
    const tickets = await prisma.supportTicket.findMany({
      where: status ? { status } : {},
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { tickets };
  });

  app.post('/admin/tickets/:id/messages', async (req) => {
    const { id } = req.params as { id: string };
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const message = await prisma.ticketMessage.create({ data: { ticketId: id, authorId: req.user.sub, body } });
    await prisma.supportTicket.update({ where: { id }, data: { status: 'ANSWERED' } });
    return { message };
  });

  app.patch('/admin/tickets/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(TICKET_STATUS) }).parse(req.body);
    const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });
    return { ticket };
  });
}
