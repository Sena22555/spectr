import { prisma } from './prisma.js';

// Справка о школе для общего помощника: преподаватели, направления и группы прямо из базы.
// Обновляется раз в 10 минут — правки в админке попадают к помощнику без перезапуска.

let cache: { text: string; until: number } | null = null;

const years = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'год' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года' : 'лет'}`;

export async function schoolInfo() {
  if (cache && cache.until > Date.now()) return cache.text;
  const [teachers, courses, groups] = await Promise.all([
    prisma.teacher.findMany({
      where: { published: true },
      select: { slug: true, subject: true, headline: true, experience: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
    prisma.course.findMany({
      where: { published: true },
      select: { slug: true, title: true, summary: true, level: true, format: true, audience: true, teacher: { select: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
    prisma.group.findMany({
      select: { slug: true, name: true, schedule: true, capacity: true, teacher: { select: { user: { select: { name: true } } } }, course: { select: { title: true } }, _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
  ]);
  const audience: Record<string, string> = { SCHOOL: 'школьникам', STUDENTS: 'студентам', ALL: 'всем' };
  const text = [
    'Преподаватели:',
    ...teachers.map((t) => `— ${t.user.name}: ${t.subject}. ${t.headline}${t.experience ? `, стаж ${years(t.experience)}` : ''}. Страница: /teachers/${t.slug}`),
    'Направления (slug — в скобках):',
    ...courses.map((c) => `— ${c.title} (${c.slug}): ${c.summary} Уровень: ${c.level}, формат: ${c.format.toLowerCase()}, ${audience[c.audience] ?? 'всем'}${c.teacher ? `, ведёт ${c.teacher.user.name}` : ''}. Страница: /subjects/${c.slug}`),
    'Группы:',
    ...groups.map(
      (g) =>
        `— ${g.name}${g.course ? ` (${g.course.title})` : ''}${g.teacher ? `, ведёт ${g.teacher.user.name}` : ''}${g.schedule ? `, расписание: ${g.schedule}` : ''}, свободно мест: ${Math.max(0, g.capacity - g._count.members)} из ${g.capacity}. Страница: /groups/${g.slug}`,
    ),
  ].join('\n');
  cache = { text, until: Date.now() + 10 * 60_000 };
  return text;
}
