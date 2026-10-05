import { randomInt } from 'node:crypto';
import { prisma } from './prisma.js';
import { progressFor } from './progress.js';
import { parseTasks, statuses } from './homework.js';

// Семья: родитель (роль PARENT) связан с одним или несколькими детьми.
// Ребёнок даёт родителю короткий код или ссылку на отчёт; родитель видит расписание, домашку и прогресс.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I
const CODE_TTL = 3 * 86_400_000;

export async function issueFamilyCode(userId: string) {
  const live = await prisma.familyCode.findFirst({ where: { userId, expiresAt: { gt: new Date(Date.now() + 86_400_000) } }, orderBy: { createdAt: 'desc' } });
  if (live) return live;
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    const created = await prisma.familyCode.create({ data: { code, userId, expiresAt: new Date(Date.now() + CODE_TTL) } }).catch(() => null);
    if (created) return created;
  }
  throw new Error('не удалось выдать код');
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').slice(0, 6);

/** Кого привязать по коду или по токену ссылки на отчёт. */
export async function childByInvite(invite: { code?: string; token?: string }) {
  if (invite.code) {
    const c = await prisma.familyCode.findUnique({ where: { code: normalizeCode(invite.code) } });
    return c && c.expiresAt > new Date() ? c.userId : null;
  }
  if (invite.token && /^[A-Za-z0-9_-]{16,64}$/.test(invite.token)) {
    const l = await prisma.parentLink.findUnique({ where: { token: invite.token } });
    return l && !l.revokedAt ? l.userId : null;
  }
  return null;
}

export async function childIdsOf(parentId: string) {
  return (await prisma.familyLink.findMany({ where: { parentId }, orderBy: { createdAt: 'asc' } })).map((l) => l.childId);
}

export async function parentIdsOf(childId: string) {
  return (await prisma.familyLink.findMany({ where: { childId } })).map((l) => l.parentId);
}

/** Всё о ребёнке для кабинета родителя: расписание, домашка, отзывы преподавателей, прогресс. */
export async function childSummary(childId: string) {
  const child = await prisma.user.findUnique({ where: { id: childId }, select: { id: true, name: true, avatarUrl: true } });
  if (!child) return null;
  const memberships = await prisma.groupMember.findMany({ where: { userId: childId }, include: { group: { select: { id: true, name: true, hue: true } } } });
  const groupIds = memberships.map((m) => m.groupId);
  const lessonFilter = { OR: [{ studentId: childId }, { groupId: { in: groupIds } }] };
  const now = Date.now();
  const monthAgo = new Date(now - 30 * 86_400_000);
  const [upcoming, past, assignments, progress] = await Promise.all([
    prisma.lesson.findMany({
      where: { ...lessonFilter, status: 'SCHEDULED', startsAt: { gte: new Date(now - 60 * 60_000), lte: new Date(now + 14 * 86_400_000) } },
      orderBy: { startsAt: 'asc' },
      take: 12,
      include: { teacher: { include: { user: { select: { name: true } } } }, group: { select: { name: true, hue: true } } },
    }),
    prisma.lesson.findMany({
      where: { ...lessonFilter, startsAt: { gte: monthAgo, lt: new Date(now) }, status: { in: ['DONE', 'CANCELLED'] } },
      orderBy: { startsAt: 'desc' },
      take: 8,
      include: { teacher: { include: { user: { select: { name: true } } } } },
    }),
    prisma.assignment.findMany({
      where: { OR: [{ studentId: childId }, { groupId: { in: groupIds } }], createdAt: { gte: new Date(now - 45 * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { marks: { where: { userId: childId } }, teacher: { include: { user: { select: { name: true } } } } },
    }),
    progressFor({ userId: childId }),
  ]);
  const st = await statuses(assignments, [childId]);
  const homework = assignments.map((a) => {
    const s = st.get(`${a.id}:${childId}`);
    const tasks = parseTasks(a.problemIds);
    const mark = a.marks[0];
    return {
      id: a.id,
      title: a.title,
      teacher: a.teacher.user.name,
      dueAt: a.dueAt,
      createdAt: a.createdAt,
      tasks: tasks.problems.length + tasks.trainers.length,
      complete: Boolean(s?.complete),
      started: Boolean(s && (s.solvedProblems.size > 0 || s.done || Object.values(s.trainerDone).some((n) => n > 0))),
      overdue: Boolean(a.dueAt && a.dueAt.getTime() < now && !s?.complete),
      comment: mark?.comment || null,
    };
  });
  return {
    child: { id: child.id, name: child.name, avatarUrl: child.avatarUrl },
    groups: memberships.map((m) => m.group),
    upcoming: upcoming.map((l) => ({ id: l.id, title: l.title, startsAt: l.startsAt, durationMin: l.durationMin, teacher: l.teacher.user.name, group: l.group?.name ?? null, hue: l.group?.hue ?? l.teacher.hue })),
    past: past.map((l) => ({ id: l.id, title: l.title, startsAt: l.startsAt, status: l.status, teacher: l.teacher.user.name })),
    homework,
    progress: { ...progress, name: null },
  };
}
