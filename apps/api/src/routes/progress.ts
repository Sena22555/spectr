import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { rl } from '../lib/limits.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { progressFor, schoolFor } from '../lib/progress.js';
import { getBotUsername, getMaxUsername } from '../bot/index.js';

// «Мой прогресс» и отчёт для родителей по ссылке.

const siteUrl = () =>
  ((process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .find((s) => s.startsWith('https://')) ?? (process.env.WEB_ORIGIN ?? '').split(',')[0]?.trim() ?? '').replace(/\/$/, '');

async function activeLink(userId: string) {
  return prisma.parentLink.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
}

function linkPayload(token: string) {
  const tg = getBotUsername();
  const mx = getMaxUsername();
  return {
    token,
    url: `${siteUrl()}/parents/${token}`,
    telegram: tg ? `https://t.me/${tg}?start=p_${token}` : null,
    max: mx ? `https://max.ru/${mx}?start=p_${token}` : null,
  };
}

export async function progressRoutes(app: FastifyInstance) {
  // прогресс текущего ученика или гостя (по id посетителя)
  app.get('/progress/me', async (req) => {
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);
    const progress = await progressFor({ userId, visitorId });
    const link = userId ? await activeLink(userId) : null;
    return { progress, parentLink: link ? linkPayload(link.token) : null, signedIn: Boolean(userId) };
  });

  app.post('/progress/parent-link', { preHandler: authenticate, config: rl(10, '1 hour') }, async (req) => {
    const existing = await activeLink(req.user.sub);
    if (existing) return linkPayload(existing.token);
    // 18 случайных байт — ссылку невозможно подобрать
    const token = randomBytes(18).toString('base64url');
    await prisma.parentLink.create({ data: { token, userId: req.user.sub } });
    void track({ type: 'parent_link', userId: req.user.sub });
    return linkPayload(token);
  });

  // отозвать ссылку (например, переслали не тому): старая перестаёт открываться, подписки в ботах тоже
  app.delete('/progress/parent-link', { preHandler: authenticate }, async (req) => {
    const links = await prisma.parentLink.findMany({ where: { userId: req.user.sub, revokedAt: null } });
    await prisma.parentLink.updateMany({ where: { userId: req.user.sub, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.parentSub.deleteMany({ where: { token: { in: links.map((l) => l.token) } } });
    return { ok: true };
  });

  // отчёт для родителя: только имя и успехи, без контактов
  app.get('/progress/parent/:token', { config: rl(60, '1 minute') }, async (req, reply) => {
    const { token } = req.params as { token: string };
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return reply.code(404).send({ error: 'Ссылка не найдена' });
    const link = await prisma.parentLink.findUnique({ where: { token } });
    if (!link || link.revokedAt) return reply.code(404).send({ error: 'Ссылка больше не действует. Попросите ребёнка поделиться новой.' });
    const [progress, school] = await Promise.all([progressFor({ userId: link.userId }), schoolFor(link.userId)]);
    void track({ type: 'parent_view', userId: link.userId, visitorId: visitorIdOf(req) });
    return {
      child: (progress.name ?? 'Ученик').split(' ')[0],
      progress: { ...progress, name: null },
      school,
      subscribe: linkPayload(token),
    };
  });
}
