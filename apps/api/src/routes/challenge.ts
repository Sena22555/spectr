import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rl } from '../lib/limits.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { cleanName, isRude } from '../lib/names.js';
import { getBotUsername, getMaxUsername } from '../bot/index.js';
import { checkGen, findGenerator, genAnswerText, genProblemId, makeProblem, rngFrom } from '../practice/generators.js';

// «Вызов другу»: 5 задач одного тренажёра с общим зерном. Создатель решает первым и пересылает ссылку,
// друзья решают те же задачи, результаты — в общей таблице вызова.

const COUNT = 5;

function problemsOf(trainerId: string, seed: number) {
  const r = rngFrom(seed);
  return Array.from({ length: COUNT }, () => {
    const s = 1 + Math.floor(r() * 2_000_000_000);
    const { problem } = makeProblem(trainerId, s)!;
    return { id: genProblemId(trainerId, s), seed: s, problem };
  });
}

export async function challengeRoutes(app: FastifyInstance) {
  app.post('/challenge', { config: rl(20, '10 minutes') }, async (req, reply) => {
    const body = z.object({ trainerId: z.string(), name: z.string().max(60) }).parse(req.body);
    const gen = findGenerator(body.trainerId);
    if (!gen) return reply.code(404).send({ error: 'Тренажёр не найден' });
    const name = cleanName(body.name);
    if (name.length < 2) return reply.code(400).send({ error: 'Как вас подписать? Имя или ник — от 2 букв' });
    if (isRude(name)) return reply.code(400).send({ error: 'Давайте выберем другое имя 🙂' });
    const c = await prisma.challenge.create({ data: { trainerId: gen.id, seed: randomInt(1, 2_000_000_000), creatorName: name } });
    void track({ type: 'challenge_create', visitorId: visitorIdOf(req), userId: await optionalUser(req), label: gen.id });
    return { id: c.id };
  });

  app.get('/challenge/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.challenge.findUnique({ where: { id }, include: { runs: { orderBy: [{ score: 'desc' }, { timeMs: 'asc' }], take: 30 } } });
    if (!c) return reply.code(404).send({ error: 'Вызов не найден' });
    const gen = findGenerator(c.trainerId)!;
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    const mine = c.runs.find((r) => (userId && r.userId === userId) || (visitorId && r.visitorId === visitorId));
    return {
      id: c.id,
      creator: c.creatorName,
      trainer: { id: gen.id, title: gen.title, skill: gen.skill, grades: gen.grades },
      problems: problemsOf(c.trainerId, c.seed).map((p) => ({ id: p.id, text: p.problem.text, unit: p.problem.unit ?? null, kind: p.problem.kind ?? 'number' })),
      runs: c.runs.map((r) => ({ id: r.id, name: r.name, score: r.score, timeMs: r.timeMs })),
      mine: mine ? { id: mine.id } : null,
      count: COUNT,
      // ссылки через бота: друг попадает в бота и открывает вызов в мини-приложении
      links: { telegram: getBotUsername() ? `https://t.me/${getBotUsername()}?start=ch_${c.id}` : null, max: getMaxUsername() ? `https://max.ru/${getMaxUsername()}?start=ch_${c.id}` : null },
    };
  });

  app.post('/challenge/:id/run', { config: rl(20, '10 minutes') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().max(60), answers: z.record(z.string(), z.string().max(100)), timeMs: z.number().int().min(0).max(3_600_000) }).parse(req.body);
    const c = await prisma.challenge.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Вызов не найден' });
    const name = cleanName(body.name);
    if (name.length < 2) return reply.code(400).send({ error: 'Как вас подписать? Имя или ник — от 2 букв' });
    if (isRude(name)) return reply.code(400).send({ error: 'Давайте выберем другое имя 🙂' });
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    const existing = await prisma.challengeRun.findFirst({ where: { challengeId: id, OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] } });
    if (existing) return reply.code(409).send({ error: 'Вы уже принимали этот вызов — можно создать свой!' });
    const items = problemsOf(c.trainerId, c.seed);
    const results = items.map((p) => {
      const given = body.answers[p.id] ?? '';
      return { id: p.id, text: p.problem.text, given, answer: genAnswerText(p.problem), correct: given.trim() !== '' && checkGen(p.problem, given), steps: p.problem.steps };
    });
    const score = results.filter((r) => r.correct).length;
    // в зачёт попадают и сами решения: они идут в прогресс ученика
    await prisma.practiceAttempt.createMany({
      data: results.filter((r) => r.given.trim()).map((r) => ({ problemId: r.id, topic: `trainer/${c.trainerId}`, visitorId, userId, correct: r.correct, answer: r.given.slice(0, 200) })),
    });
    const run = await prisma.challengeRun.create({ data: { challengeId: id, name, score, timeMs: body.timeMs, visitorId, userId } });
    void track({ type: 'challenge_run', visitorId, userId, label: `${c.trainerId}:${score}/${COUNT}` });
    return { run: { id: run.id, score, timeMs: run.timeMs }, results };
  });
}
