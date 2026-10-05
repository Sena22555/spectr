import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { rl } from '../lib/limits.js';
import { prisma } from '../lib/prisma.js';
import { schoolDay } from '../lib/time.js';
import { schoolWeek } from './tournament.js';
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

  // коротко для игровых элементов: опыт, уровень, цель дня, серия
  app.get('/progress/game', async (req) => {
    const p = await progressFor({ userId: await optionalUser(req), visitorId: visitorIdOf(req) });
    return { xp: p.xp, streak: p.streak, bestStreak: p.bestStreak };
  });

  // «Лига недели»: опыт с понедельника у учеников с аккаунтом (имя и первая буква фамилии)
  app.get('/progress/league', async (req) => {
    const userId = await optionalUser(req);
    const week = schoolWeek();
    const since = new Date(Date.parse(`${week.monday}T00:00:00Z`) - 86_400_000);
    const [attempts, english, games] = await Promise.all([
      prisma.practiceAttempt.findMany({ where: { userId: { not: null }, createdAt: { gte: since } }, select: { userId: true, problemId: true, correct: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.englishResult.findMany({ where: { userId: { not: null }, createdAt: { gte: since } }, select: { userId: true, xp: true, createdAt: true } }),
      prisma.gameResult.findMany({ where: { userId: { not: null }, createdAt: { gte: since } }, select: { userId: true, xp: true, createdAt: true } }),
    ]);
    const xp = new Map<string, number>();
    const state = new Map<string, 'tried' | 'done'>();
    for (const a of attempts) {
      if (schoolDay(a.createdAt) < week.monday) continue;
      const key = `${a.userId}:${a.problemId}`;
      const st = state.get(key);
      if (st === 'done') continue;
      if (!a.correct) {
        state.set(key, 'tried');
        continue;
      }
      state.set(key, 'done');
      xp.set(a.userId!, (xp.get(a.userId!) ?? 0) + (st === undefined ? 15 : 10));
    }
    for (const e of [...english, ...games]) if (schoolDay(e.createdAt) >= week.monday) xp.set(e.userId!, (xp.get(e.userId!) ?? 0) + e.xp);
    const ranked = [...xp.entries()].sort((a, b) => b[1] - a[1]);
    const users = await prisma.user.findMany({ where: { id: { in: ranked.map(([id]) => id) } }, select: { id: true, name: true, role: true } });
    const nameOf = (id: string) => {
      const u = users.find((x) => x.id === id);
      const [first, last] = (u?.name ?? 'Ученик').split(' ');
      return `${first}${last ? ` ${last[0]}.` : ''}`;
    };
    // в лиге — только ученики (преподаватели и родители не соревнуются с детьми)
    const players = ranked.filter(([id]) => users.find((u) => u.id === id)?.role === 'STUDENT');
    const top = players.slice(0, 20).map(([id, v], i) => ({ place: i + 1, name: nameOf(id), xp: v, me: id === userId }));
    const myIndex = userId ? players.findIndex(([id]) => id === userId) : -1;
    return { week: week.key, sunday: week.sunday, top, me: myIndex >= 0 ? { place: myIndex + 1, xp: players[myIndex]![1], players: players.length } : null, signedIn: Boolean(userId) };
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
