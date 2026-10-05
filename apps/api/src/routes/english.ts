import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rl } from '../lib/limits.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { LESSONS, UNITS, findLesson, lessonId } from '../english/content.js';
import { makeLesson } from '../english/lessons.js';

// «Английский: путь». Разделы открыты все (старшеклассник может начать с ОГЭ),
// уроки внутри раздела — по порядку. Прогресс хранится и у гостя (по id посетителя), и в аккаунте.

async function resultsOf(userId: string | null, visitorId: string | null) {
  const or = [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])];
  if (!or.length) return [];
  return prisma.englishResult.findMany({ where: { OR: or }, select: { lessonId: true, total: true, correct: true, xp: true, createdAt: true } });
}

export async function englishRoutes(app: FastifyInstance) {
  app.get('/english/course', async (req) => {
    const results = await resultsOf(await optionalUser(req), visitorIdOf(req));
    const done = new Map<string, { perfect: boolean; times: number }>();
    for (const r of results) {
      const d = done.get(r.lessonId) ?? { perfect: false, times: 0 };
      d.times++;
      if (r.correct >= r.total) d.perfect = true;
      done.set(r.lessonId, d);
    }
    let next: string | null = null;
    const units = UNITS.map((u, i) => {
      const lessons = LESSONS.map((l) => {
        const id = lessonId(u.id, l.n);
        const prev = l.n === 1 || done.has(lessonId(u.id, l.n - 1));
        return { id, n: l.n, title: l.title, icon: l.icon, done: done.has(id), perfect: done.get(id)?.perfect ?? false, open: prev };
      });
      const started = lessons.some((l) => l.done);
      if (!next && started) next = lessons.find((l) => !l.done)?.id ?? null;
      return { id: u.id, title: u.title, ru: u.ru, level: u.level, grades: u.grades, icon: u.icon, hue: i % 7, grammar: u.grammar.title, words: u.words.length, lessons };
    });
    // если ничего не начато — первый урок; если раздел закончен — первый урок следующего незаконченного
    if (!next) next = units.flatMap((u) => u.lessons).find((l) => !l.done)?.id ?? null;
    const wordsLearned = results.filter((r) => /-[12]$/.test(r.lessonId)).reduce((s, r) => s.add(r.lessonId), new Set<string>()).size * 6;
    return { units, next, stats: { lessons: done.size, words: wordsLearned, total: UNITS.length * LESSONS.length } };
  });

  app.get('/english/lesson/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const lesson = makeLesson(id);
    if (!lesson) return reply.code(404).send({ error: 'Урок не найден' });
    void track({ type: 'english_start', visitorId: visitorIdOf(req), userId: await optionalUser(req), label: id });
    return lesson;
  });

  app.post('/english/result', { config: rl(40, '10 minutes') }, async (req, reply) => {
    const body = z.object({ lessonId: z.string().max(40), total: z.number().int().min(1).max(60), mistakes: z.number().int().min(0).max(120) }).parse(req.body);
    if (!findLesson(body.lessonId)) return reply.code(404).send({ error: 'Урок не найден' });
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);
    if (!userId && !visitorId) return reply.code(400).send({ error: 'Обновите страницу и попробуйте ещё раз' });
    const correct = Math.max(0, body.total - body.mistakes);
    // 10 за урок, +5 без ошибок; повтор урока — 5 опыта, чтобы не «фармили» один и тот же урок
    const before = await prisma.englishResult.count({ where: { lessonId: body.lessonId, OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] } });
    const xp = before ? 5 : 10 + (body.mistakes === 0 ? 5 : 0);
    await prisma.englishResult.create({ data: { lessonId: body.lessonId, userId, visitorId, correct, total: body.total, xp } });
    void track({ type: 'english_done', visitorId, userId, label: `${body.lessonId}:${body.mistakes}` });
    return { xp, first: !before };
  });
}
