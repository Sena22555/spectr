import type { FastifyInstance } from 'fastify';
import { rl } from '../lib/limits.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getBotUsername, getMaxUsername, notifyNewBooking } from '../bot/index.js';
import { track, visitorIdOf } from '../lib/track.js';

const teacherCard = {
  id: true,
  slug: true,
  subject: true,
  headline: true,
  experience: true,
  photoUrl: true,
  hue: true,
  user: { select: { name: true } },
} as const;

export async function publicRoutes(app: FastifyInstance) {
  // Ссылки на мини-приложения: кнопки «Открыть в Telegram / ВКонтакте» на сайте
  app.get('/config', async () => {
    const bot = getBotUsername();
    return {
      telegramUrl: process.env.TELEGRAM_APP_URL || (bot ? `https://t.me/${bot}` : null),
      vkUrl: process.env.VK_APP_URL || null,
      maxUrl: process.env.MAX_APP_URL || (getMaxUsername() ? `https://max.ru/${getMaxUsername()}` : null),
    };
  });

  app.get('/stats', async () => {
    const [teachers, courses, groups, students] = await Promise.all([
      prisma.teacher.count({ where: { published: true } }),
      prisma.course.count({ where: { published: true } }),
      prisma.group.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
    ]);
    return { teachers, courses, groups, students };
  });

  app.get('/teachers', async () => {
    const teachers = await prisma.teacher.findMany({
      where: { published: true },
      select: { ...teacherCard, _count: { select: { groups: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { teachers };
  });

  app.get('/teachers/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const teacher = await prisma.teacher.findUnique({
      where: { slug },
      select: {
        ...teacherCard,
        bio: true,
        courses: { where: { published: true }, select: { id: true, slug: true, title: true, summary: true, hue: true, format: true, level: true } },
        groups: { select: { id: true, slug: true, name: true, schedule: true, hue: true, capacity: true, _count: { select: { members: true } } } },
      },
    });
    if (!teacher) return reply.code(404).send({ error: 'Преподаватель не найден' });
    return { teacher };
  });

  app.get('/courses', async (req) => {
    const { source } = z.object({ source: z.enum(['SCHOOL', 'UNIVERSITY']).optional() }).parse(req.query);
    const courses = await prisma.course.findMany({
      where: { published: true, ...(source ? { source } : {}) },
      include: { teacher: { select: teacherCard } },
      orderBy: { createdAt: 'asc' },
    });
    return { courses };
  });

  app.get('/courses/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const course = await prisma.course.findUnique({
      where: { slug },
      include: {
        teacher: { select: teacherCard },
        groups: { select: { id: true, slug: true, name: true, schedule: true, hue: true, capacity: true, _count: { select: { members: true } } } },
      },
    });
    if (!course) return reply.code(404).send({ error: 'Курс не найден' });
    return { course };
  });

  app.get('/groups', async () => {
    const groups = await prisma.group.findMany({
      include: {
        teacher: { select: teacherCard },
        course: { select: { slug: true, title: true } },
        photos: { take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { members: true, photos: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { groups };
  });

  app.get('/groups/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const group = await prisma.group.findUnique({
      where: { slug },
      include: {
        teacher: { select: teacherCard },
        course: { select: { slug: true, title: true, summary: true } },
        photos: { orderBy: { createdAt: 'desc' } },
        members: { select: { user: { select: { id: true, name: true, avatarUrl: true } } }, take: 24 },
        _count: { select: { members: true } },
      },
    });
    if (!group) return reply.code(404).send({ error: 'Группа не найдена' });
    return { group };
  });

  // Заявка на пробное занятие / запись. Работает и без аккаунта.
  app.post('/bookings', { config: rl(5, '10 minutes') }, async (req) => {
    let userId: string | undefined;
    try {
      await req.jwtVerify();
      userId = req.user.sub;
    } catch {
      /* гость */
    }
    const body = z
      .object({
        name: z.string().trim().min(2, 'Как к вам обращаться?').max(80),
        contact: z.string().trim().min(3, 'Оставьте телефон, email или ник в Telegram').max(120),
        courseId: z.string().optional(),
        teacherSlug: z.string().optional(),
        preferredTime: z.string().max(120).optional(),
        format: z.enum(['INDIVIDUAL', 'GROUP']).optional(),
        comment: z.string().max(1000).optional(),
      })
      .parse(req.body);
    const booking = await prisma.booking.create({ data: { ...body, userId } });
    void notifyNewBooking(booking);
    void track({ type: 'booking', visitorId: visitorIdOf(req), userId, label: body.courseId ?? body.teacherSlug ?? null });
    return { booking };
  });
}
