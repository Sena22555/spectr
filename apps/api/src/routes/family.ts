import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rl } from '../lib/limits.js';
import { authenticate } from '../lib/auth.js';
import { track } from '../lib/track.js';
import { schoolFor } from '../lib/progress.js';
import { childByInvite, childIdsOf, childSummary, issueFamilyCode } from '../lib/family.js';
import { notifyUser } from '../bot/index.js';

/** Привязать ребёнка к родителю. Аккаунт без учёбы в школе становится родительским. */
export async function claimChild(parentId: string, invite: { code?: string; token?: string }) {
  const childId = await childByInvite(invite);
  if (!childId) return { error: 'Код не подошёл. Попросите ребёнка открыть «Профиль → Родители» и продиктовать новый.' } as const;
  if (childId === parentId) return { error: 'Это ваш собственный код 🙂 Его нужно передать родителю.' } as const;
  const parent = await prisma.user.findUniqueOrThrow({ where: { id: parentId } });
  if (parent.role === 'STUDENT') {
    const school = await schoolFor(parentId);
    if (school.isStudent) return { error: 'Это аккаунт ученика. Родителю лучше завести свой — это минута.' } as const;
    await prisma.user.update({ where: { id: parentId }, data: { role: 'PARENT' } });
  } else if (parent.role !== 'PARENT' && parent.role !== 'ADMIN') {
    return { error: 'Родительский кабинет доступен только в аккаунте родителя.' } as const;
  }
  const existed = await prisma.familyLink.findUnique({ where: { parentId_childId: { parentId, childId } } });
  if (!existed) {
    await prisma.familyLink.create({ data: { parentId, childId } });
    void track({ type: 'family_link', userId: parentId, label: childId });
    void notifyUser(childId, `👨‍👩‍👧 ${parent.name} теперь видит ваше расписание и успехи в «Спектре». Отвязать можно в профиле.`).catch(() => {});
  }
  return { childId, roleChanged: parent.role === 'STUDENT' } as const;
}

export async function familyRoutes(app: FastifyInstance) {
  // ── сторона родителя ──
  app.get('/family', { preHandler: authenticate }, async (req) => {
    const ids = await childIdsOf(req.user.sub);
    const children = (await Promise.all(ids.map((id) => childSummary(id)))).filter(Boolean);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    return { children, messengers: { telegram: Boolean(me.telegramId), max: Boolean(me.maxId) } };
  });

  app.post('/family/claim', { preHandler: authenticate, config: rl(10, '10 minutes') }, async (req, reply) => {
    const body = z.object({ code: z.string().max(20).optional(), token: z.string().max(80).optional() }).parse(req.body);
    const r = await claimChild(req.user.sub, body);
    if ('error' in r) return reply.code(400).send({ error: r.error });
    return r;
  });

  app.delete('/family/children/:childId', { preHandler: authenticate }, async (req) => {
    const { childId } = req.params as { childId: string };
    await prisma.familyLink.deleteMany({ where: { parentId: req.user.sub, childId } });
    return { ok: true };
  });

  // ── сторона ребёнка ──
  app.get('/family/parents', { preHandler: authenticate }, async (req) => {
    const links = await prisma.familyLink.findMany({ where: { childId: req.user.sub }, orderBy: { createdAt: 'asc' } });
    const users = await prisma.user.findMany({ where: { id: { in: links.map((l) => l.parentId) } }, select: { id: true, name: true } });
    const code = await prisma.familyCode.findFirst({ where: { userId: req.user.sub, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return {
      parents: links.map((l) => ({ id: l.parentId, name: users.find((u) => u.id === l.parentId)?.name ?? 'Родитель', since: l.createdAt })),
      code: code ? { code: code.code, expiresAt: code.expiresAt } : null,
    };
  });

  app.post('/family/code', { preHandler: authenticate, config: rl(10, '1 hour') }, async (req) => {
    const c = await issueFamilyCode(req.user.sub);
    return { code: c.code, expiresAt: c.expiresAt };
  });

  app.delete('/family/parents/:parentId', { preHandler: authenticate }, async (req) => {
    const { parentId } = req.params as { parentId: string };
    await prisma.familyLink.deleteMany({ where: { parentId, childId: req.user.sub } });
    return { ok: true };
  });
}
