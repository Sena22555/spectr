import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import type { Role } from './enums.js';
import { prisma } from './prisma.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role; iat?: number };
  }
}

/**
 * Проверка токена. Роль и действительность берём из базы, а не из токена:
 * снятая роль или «выйти на всех устройствах» срабатывают сразу, а не через 30 дней.
 */
async function verify(req: FastifyRequest) {
  await req.jwtVerify();
  const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { role: true, tokensValidAfter: true } });
  if (!user) throw new Error('user gone');
  // iat в секундах; токен, выданный в ту же секунду, что и отзыв, тоже считаем отозванным
  if (user.tokensValidAfter && (req.user.iat ?? 0) * 1000 < user.tokensValidAfter.getTime() - 999) throw new Error('revoked');
  req.user.role = user.role as Role;
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await verify(req);
  } catch {
    return reply.code(401).send({ error: 'Нужно войти в аккаунт' });
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await verify(req);
    } catch {
      return reply.code(401).send({ error: 'Нужно войти в аккаунт' });
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав' });
    }
  };
}

export function publicUser(u: User & { teacher?: { id: string; slug: string } | null }) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    role: u.role as Role,
    telegramLinked: Boolean(u.telegramId),
    vkLinked: Boolean(u.vkId),
    maxLinked: Boolean(u.maxId),
    emailVerified: u.emailVerified,
    teacherId: u.teacher?.id ?? null,
    teacherSlug: u.teacher?.slug ?? null,
    createdAt: u.createdAt,
  };
}
