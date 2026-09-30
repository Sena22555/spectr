import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import type { Role } from './enums.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Нужно войти в аккаунт' });
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
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
    emailVerified: u.emailVerified,
    teacherId: u.teacher?.id ?? null,
    teacherSlug: u.teacher?.slug ?? null,
    createdAt: u.createdAt,
  };
}
