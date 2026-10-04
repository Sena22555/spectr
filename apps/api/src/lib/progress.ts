import { prisma } from './prisma.js';
import { schoolDay } from './time.js';
import { ALL_TOPICS, findProblem } from '../practice/content.js';
import { findGenerator } from '../practice/generators.js';
import { statuses } from './homework.js';

// Прогресс ученика: задачи практикума, тренажёры, задача дня из бота, серия дней и достижения.
// Тот же расчёт используется в «Моём прогрессе», в отчёте для родителей и в еженедельном сообщении бота.

const SUBJECT_NAME: Record<string, string> = { math: 'Математика', physics: 'Физика', informatics: 'Информатика' };

export interface Who {
  userId?: string | null;
  visitorId?: string | null;
}

export async function progressFor(who: Who) {
  const visitorIds = new Set<string>();
  const playerIds = new Set<string>();
  if (who.visitorId) visitorIds.add(who.visitorId);
  let user: { id: string; name: string; telegramId: string | null; maxId: string | null } | null = null;
  if (who.userId) {
    user = await prisma.user.findUnique({ where: { id: who.userId }, select: { id: true, name: true, telegramId: true, maxId: true } });
    for (const v of await prisma.visitor.findMany({ where: { userId: who.userId }, select: { id: true } })) visitorIds.add(v.id);
    if (user?.telegramId) playerIds.add(user.telegramId);
    if (user?.maxId) playerIds.add(`max:${user.maxId}`);
  }
  const or = [
    ...(user ? [{ userId: user.id }] : []),
    ...(visitorIds.size ? [{ visitorId: { in: [...visitorIds] } }] : []),
    ...(playerIds.size ? [{ playerId: { in: [...playerIds] } }] : []),
  ];
  const attempts = or.length
    ? await prisma.practiceAttempt.findMany({ where: { OR: or }, select: { problemId: true, correct: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
    : [];

  const now = Date.now();
  const weekAgo = now - 7 * 86_400_000;
  const twoWeeksAgo = now - 14 * 86_400_000;
  const correct = attempts.filter((a) => a.correct);
  const days = new Map<string, number>();
  for (const a of correct) days.set(schoolDay(a.createdAt), (days.get(schoolDay(a.createdAt)) ?? 0) + 1);

  // серия: подряд идущие дни с решёнными задачами, заканчивая сегодня или вчера
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = schoolDay(new Date(now - i * 86_400_000));
    if (days.has(d)) streak++;
    else if (i > 0 || streak > 0) break;
  }
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...days.keys()].sort()) {
    const expected = prev ? schoolDay(new Date(new Date(`${prev}T12:00:00Z`).getTime() + 86_400_000)) : null;
    run = prev && d === expected ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = schoolDay(new Date(now - (13 - i) * 86_400_000));
    return { day: d, solved: days.get(d) ?? 0 };
  });

  // по предметам, темам и тренажёрам
  const bySubject: Record<string, { solved: number; tries: number }> = {};
  const skills = new Map<string, { kind: 'topic' | 'trainer'; key: string; title: string; subject: string; solved: number; tries: number; total?: number; link: string }>();
  const solvedStatic = new Set<string>();
  for (const a of attempts) {
    let subject = '';
    let key = '';
    let title = '';
    let link = '';
    let kind: 'topic' | 'trainer' = 'topic';
    let total: number | undefined;
    if (a.problemId.startsWith('g:')) {
      const gen = findGenerator(a.problemId.split(':')[1]!);
      if (!gen) continue;
      subject = gen.subject;
      key = `g:${gen.id}`;
      title = gen.title;
      link = `/practice/train/${gen.id}`;
      kind = 'trainer';
    } else {
      const f = findProblem(a.problemId);
      if (!f) continue;
      subject = f.subject.slug;
      key = `t:${f.subject.slug}/${f.topic.slug}`;
      title = f.topic.title;
      link = `/practice/${f.subject.slug}/${f.topic.slug}`;
      total = f.topic.problems.length;
      if (a.correct) solvedStatic.add(a.problemId);
    }
    const s = (bySubject[subject] ??= { solved: 0, tries: 0 });
    s.tries++;
    if (a.correct) s.solved++;
    const row = skills.get(key) ?? { kind, key, title, subject, solved: 0, tries: 0, total, link };
    row.tries++;
    if (a.correct) row.solved++;
    skills.set(key, row);
  }
  // для тем считаем уникальные решённые задачи
  for (const row of skills.values()) {
    if (row.kind !== 'topic') continue;
    const [subject, slug] = row.key.slice(2).split('/');
    const topic = ALL_TOPICS.find((x) => x.subject.slug === subject && x.topic.slug === slug);
    row.solved = topic ? topic.topic.problems.filter((p) => solvedStatic.has(p.id)).length : row.solved;
  }
  const skillList = [...skills.values()];
  const mastered = skillList.filter((s) => (s.kind === 'topic' ? s.total && s.solved >= s.total : s.solved >= 10 && s.solved / s.tries >= 0.8));
  const weak = skillList.filter((s) => !mastered.includes(s) && s.tries >= 3 && s.solved / s.tries < 0.6);

  const solvedTotal = correct.length;
  const solvedWeek = correct.filter((a) => a.createdAt.getTime() >= weekAgo).length;
  const solvedPrevWeek = correct.filter((a) => a.createdAt.getTime() >= twoWeeksAgo && a.createdAt.getTime() < weekAgo).length;
  const accuracy = attempts.length ? Math.round((correct.length / attempts.length) * 100) : 0;
  const activeDays7 = last14.slice(7).filter((d) => d.solved > 0).length;
  const diagnostics = or.length ? await prisma.event.count({ where: { type: 'diagnostic_done', OR: or.filter((x) => !('playerId' in x)) } }) : 0;

  const achievements = [
    { id: 'first', title: 'Первая задача', text: 'Решить первую задачу', icon: '🌱', earned: solvedTotal >= 1 },
    { id: 'ten', title: 'Десятка', text: 'Решить 10 задач', icon: '🔟', earned: solvedTotal >= 10 },
    { id: 'fifty', title: 'Полсотни', text: 'Решить 50 задач', icon: '🎯', earned: solvedTotal >= 50 },
    { id: 'hundred', title: 'Сотня', text: 'Решить 100 задач', icon: '💯', earned: solvedTotal >= 100 },
    { id: 'streak3', title: 'Три дня подряд', text: 'Решать задачи 3 дня подряд', icon: '🔥', earned: bestStreak >= 3 },
    { id: 'streak7', title: 'Неделя без пропусков', text: 'Решать задачи 7 дней подряд', icon: '🏆', earned: bestStreak >= 7 },
    { id: 'subjects', title: 'Три стихии', text: 'Решить задачи по математике, физике и информатике', icon: '🌈', earned: ['math', 'physics', 'informatics'].every((s) => (bySubject[s]?.solved ?? 0) > 0) },
    { id: 'topic', title: 'Тема закрыта', text: 'Решить все задачи одной темы', icon: '📘', earned: mastered.some((m) => m.kind === 'topic') },
    { id: 'skill', title: 'Уверенный навык', text: '10 задач тренажёра с точностью от 80%', icon: '💪', earned: mastered.some((m) => m.kind === 'trainer') },
    { id: 'diag', title: 'Разведка', text: 'Пройти проверку уровня', icon: '🧭', earned: diagnostics > 0 },
  ];

  return {
    name: user?.name ?? null,
    solvedTotal,
    solvedWeek,
    solvedPrevWeek,
    accuracy,
    streak,
    bestStreak,
    activeDays7,
    last14,
    bySubject: Object.entries(bySubject).map(([key, v]) => ({ key, title: SUBJECT_NAME[key] ?? key, ...v })).sort((a, b) => b.solved - a.solved),
    mastered: mastered.map(({ title, link, subject }) => ({ title, link, subject })),
    weak: weak.map(({ title, link, subject }) => ({ title, link, subject })),
    recent: skillList
      .sort((a, b) => b.tries - a.tries)
      .slice(0, 8)
      .map(({ title, link, subject, solved, tries, kind, total }) => ({ title, link, subject, solved, tries, kind, total: total ?? null })),
    achievements,
  };
}

/** Учёба в школе: занятия и домашка — для отчёта родителю. */
export async function schoolFor(userId: string) {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  const lessonFilter = { OR: [{ studentId: userId }, { groupId: { in: memberships.map((m) => m.groupId) } }] };
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const [done, next, assignments] = await Promise.all([
    prisma.lesson.count({ where: { ...lessonFilter, status: 'DONE', startsAt: { gte: monthAgo } } }),
    prisma.lesson.findFirst({ where: { ...lessonFilter, status: 'SCHEDULED', startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' }, include: { teacher: { include: { user: true } } } }),
    prisma.assignment.findMany({
      where: { OR: [{ studentId: userId }, { groupId: { in: memberships.map((m) => m.groupId) } }], createdAt: { gte: monthAgo } },
      include: { marks: { where: { userId } } },
    }),
  ]);
  const st = await statuses(assignments, [userId]);
  const complete = assignments.filter((a) => st.get(`${a.id}:${userId}`)?.complete).length;
  const comments = assignments.map((a) => a.marks[0]?.comment).filter(Boolean).slice(-2) as string[];
  return {
    lessonsDone30: done,
    nextLesson: next ? { title: next.title, startsAt: next.startsAt, teacher: next.teacher.user.name } : null,
    homework: { total: assignments.length, complete },
    teacherComments: comments,
    isStudent: done > 0 || Boolean(next) || memberships.length > 0,
  };
}
