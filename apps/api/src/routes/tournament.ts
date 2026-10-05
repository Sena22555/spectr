import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rl } from '../lib/limits.js';
import { requireRole } from '../lib/auth.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { schoolDay } from '../lib/time.js';
import { GENERATORS, checkGen, genAnswerText, genProblemId, makeProblem, rngFrom } from '../practice/generators.js';
import { cleanName, isRude } from '../lib/names.js';

// «Турнир недели»: 10 задач для своей лиги, 20 минут, одна попытка. Таблица лидеров и сертификат каждому.
// Задачи одинаковые для всей лиги на неделе — их собирают генераторы по зерну «неделя + лига».

export const LEAGUES = [
  { key: 'junior', title: '5–6 класс', grades: [5, 6] as [number, number] },
  { key: 'middle', title: '7–8 класс', grades: [7, 8] as [number, number] },
  { key: 'oge', title: '9 класс · ОГЭ', grades: [9, 9] as [number, number] },
  { key: 'ege', title: '10–11 класс · ЕГЭ', grades: [10, 11] as [number, number] },
] as const;
type League = (typeof LEAGUES)[number]['key'];

const TASKS = 10;
const LIMIT_MS = 20 * 60_000;

/** ISO-неделя по часам школы: «2026-W41» и даты понедельника и воскресенья. */
export function schoolWeek(d = new Date()) {
  const day = new Date(`${schoolDay(d)}T00:00:00Z`);
  const wd = (day.getUTCDay() + 6) % 7; // 0 — понедельник
  const monday = new Date(day.getTime() - wd * 86_400_000);
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return { key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monday: monday.toISOString().slice(0, 10), sunday: sunday.toISOString().slice(0, 10) };
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Задачи лиги на неделю: больше математики, плюс физика и информатика, без повторов генераторов подряд. */
export function tournamentProblems(week: string, league: League) {
  const meta = LEAGUES.find((l) => l.key === league)!;
  const fits = (g: (typeof GENERATORS)[number]) => g.grades[0] <= meta.grades[1] && meta.grades[0] <= g.grades[1];
  const pool = GENERATORS.filter(fits).sort((a, b) => a.id.localeCompare(b.id));
  const r = rngFrom(hash(`${week}:${league}`));
  const bySubject = (s: string) => pool.filter((g) => g.subject === s);
  const plan = [...Array(6).fill('math'), ...Array(2).fill('physics'), ...Array(2).fill('informatics')] as string[];
  const used = new Set<string>();
  const out: { id: string; genId: string; seed: number }[] = [];
  for (const subject of plan) {
    let list = bySubject(subject).filter((g) => !used.has(g.id));
    if (!list.length) list = pool.filter((g) => !used.has(g.id));
    if (!list.length) list = pool;
    const gen = list[Math.floor(r() * list.length)]!;
    used.add(gen.id);
    const seed = 1 + Math.floor(r() * 2_000_000_000);
    out.push({ id: genProblemId(gen.id, seed), genId: gen.id, seed });
  }
  return out.slice(0, TASKS);
}

async function myEntry(week: string, league: string, userId: string | null, visitorId: string | null) {
  if (!userId && !visitorId) return null;
  return prisma.tournamentEntry.findFirst({
    where: { week, league, OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] },
  });
}

function publicProblems(week: string, league: League) {
  return tournamentProblems(week, league).map(({ id, genId, seed }) => {
    const { gen, problem } = makeProblem(genId, seed)!;
    return { id, title: gen.title, subject: gen.subject, text: problem.text, unit: problem.unit ?? null, kind: problem.kind ?? 'number' };
  });
}

async function placeOf(entry: { id: string; week: string; league: string; score: number; timeMs: number }) {
  const better = await prisma.tournamentEntry.count({
    where: {
      week: entry.week,
      league: entry.league,
      hidden: false,
      finishedAt: { not: null },
      OR: [{ score: { gt: entry.score } }, { score: entry.score, timeMs: { lt: entry.timeMs } }],
    },
  });
  return better + 1;
}

export async function tournamentRoutes(app: FastifyInstance) {
  app.get('/tournament', async (req) => {
    const week = schoolWeek();
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);
    const mine = userId || visitorId ? await prisma.tournamentEntry.findMany({ where: { week: week.key, OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] } }) : [];
    const counts = await prisma.tournamentEntry.groupBy({ by: ['league'], where: { week: week.key, finishedAt: { not: null } }, _count: true });
    return {
      week,
      tasks: TASKS,
      minutes: LIMIT_MS / 60_000,
      leagues: LEAGUES.map((l) => ({ ...l, players: counts.find((c) => c.league === l.key)?._count ?? 0 })),
      mine: mine.map((e) => ({ id: e.id, league: e.league, finished: Boolean(e.finishedAt), score: e.score })),
    };
  });

  app.get('/tournament/:league/leaderboard', async (req, reply) => {
    const { league } = req.params as { league: string };
    if (!LEAGUES.some((l) => l.key === league)) return reply.code(404).send({ error: 'Лига не найдена' });
    const week = schoolWeek().key;
    const top = await prisma.tournamentEntry.findMany({
      where: { week, league, hidden: false, finishedAt: { not: null } },
      orderBy: [{ score: 'desc' }, { timeMs: 'asc' }],
      take: 20,
      select: { id: true, name: true, score: true, timeMs: true },
    });
    return { week, top };
  });

  // начать: создаёт участие (одно на неделю и лигу) и отдаёт задачи
  app.post('/tournament/:league/start', { config: rl(20, '10 minutes') }, async (req, reply) => {
    const { league } = req.params as { league: League };
    if (!LEAGUES.some((l) => l.key === league)) return reply.code(404).send({ error: 'Лига не найдена' });
    const { name } = z.object({ name: z.string().max(60).default('') }).parse(req.body);
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);
    if (!userId && !visitorId) return reply.code(400).send({ error: 'Обновите страницу и попробуйте ещё раз' });
    const week = schoolWeek().key;
    let entry = await myEntry(week, league, userId, visitorId);
    if (!entry) {
      let display = cleanName(name);
      if (!display && userId) display = (await prisma.user.findUnique({ where: { id: userId } }))?.name.split(' ')[0] ?? '';
      if (display.length < 2) return reply.code(400).send({ error: 'Как вас подписать в таблице? Имя или ник — от 2 букв' });
      if (isRude(display)) return reply.code(400).send({ error: 'Давайте выберем другое имя для таблицы 🙂' });
      entry = await prisma.tournamentEntry.create({ data: { week, league, userId, visitorId, name: display } });
      void track({ type: 'tournament_start', userId, visitorId, label: league });
    }
    const left = Math.max(0, LIMIT_MS - (Date.now() - entry.startedAt.getTime()));
    return { entry: { id: entry.id, name: entry.name, startedAt: entry.startedAt, finished: Boolean(entry.finishedAt), score: entry.score }, leftMs: left, problems: entry.finishedAt ? [] : publicProblems(week, league) };
  });

  // завершить: проверка ответов на сервере, место в таблице, разбор
  app.post('/tournament/:league/finish', { config: rl(20, '10 minutes') }, async (req, reply) => {
    const { league } = req.params as { league: League };
    const { answers } = z.object({ answers: z.record(z.string(), z.string().max(100)) }).parse(req.body);
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);
    const week = schoolWeek().key;
    const entry = await myEntry(week, league, userId, visitorId);
    if (!entry) return reply.code(404).send({ error: 'Сначала начните турнир' });
    const problems = tournamentProblems(week, league);
    const results = problems.map(({ id, genId, seed }) => {
      const { gen, problem } = makeProblem(genId, seed)!;
      const raw = answers[id] ?? '';
      const correct = raw.trim() !== '' && checkGen(problem, raw);
      return { id, title: gen.title, text: problem.text, answer: genAnswerText(problem), given: raw, correct, steps: problem.steps, theory: gen.theory ?? null, trainer: gen.id };
    });
    let finished = entry;
    if (!entry.finishedAt) {
      const score = results.filter((r) => r.correct).length;
      const timeMs = Math.min(LIMIT_MS, Date.now() - entry.startedAt.getTime());
      finished = await prisma.tournamentEntry.update({ where: { id: entry.id }, data: { finishedAt: new Date(), score, timeMs, answers: JSON.stringify(answers).slice(0, 4000) } });
      void track({ type: 'tournament_finish', userId, visitorId, label: `${league}:${score}/${TASKS}` });
    } else {
      // уже завершён: показываем результат по сохранённым ответам
      const saved = (() => {
        try {
          return JSON.parse(entry.answers) as Record<string, string>;
        } catch {
          return {};
        }
      })();
      for (const r of results) {
        r.given = saved[r.id] ?? '';
        const p = makeProblem(r.trainer, Number(r.id.split(':')[2]))!.problem;
        r.correct = r.given.trim() !== '' && checkGen(p, r.given);
      }
    }
    return { entry: { id: finished.id, name: finished.name, score: finished.score, timeMs: finished.timeMs, place: await placeOf(finished) }, results };
  });

  // данные для сертификата (публично по id участия)
  app.get('/tournament/certificate/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = await prisma.tournamentEntry.findUnique({ where: { id } });
    if (!e || !e.finishedAt || e.hidden) return reply.code(404).send({ error: 'Сертификат не найден' });
    const league = LEAGUES.find((l) => l.key === e.league)!;
    const players = await prisma.tournamentEntry.count({ where: { week: e.week, league: e.league, hidden: false, finishedAt: { not: null } } });
    return { name: e.name, league: league.title, week: e.week, score: e.score, tasks: TASKS, place: await placeOf(e), players, date: e.finishedAt };
  });

  // администратор может скрыть запись с неуместным именем
  await app.register(async (admin) => {
    admin.addHook('preHandler', requireRole('ADMIN'));
    admin.post('/admin/tournament/:id/hide', async (req) => {
      const { id } = req.params as { id: string };
      await prisma.tournamentEntry.update({ where: { id }, data: { hidden: true } });
      return { ok: true };
    });
  });
}
