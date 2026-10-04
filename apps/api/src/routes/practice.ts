import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { PRACTICE, answerText, checkAnswer, dailyProblem, findProblem, findTopic, publicProblem } from '../practice/content.js';
import { schoolDay } from '../lib/time.js';

// Бесплатный практикум: темы, теория, задачи с проверкой на сервере, прогресс гостя и ученика.

export async function practiceRoutes(app: FastifyInstance) {
  app.get('/practice', async () => ({
    subjects: PRACTICE.map((s) => ({
      slug: s.slug,
      title: s.title,
      hue: s.hue,
      emoji: s.emoji,
      blurb: s.blurb,
      course: s.course,
      topics: s.topics.map((t) => ({ slug: t.slug, title: t.title, level: t.level, minutes: t.minutes, summary: t.summary, widget: t.widget ?? null, problems: t.problems.length, ids: t.problems.map((p) => p.id) })),
    })),
    daily: dailyPublic(),
  }));

  app.get('/practice/:subject/:topic', async (req, reply) => {
    const { subject, topic } = req.params as { subject: string; topic: string };
    const found = findTopic(subject, topic);
    if (!found) return reply.code(404).send({ error: 'Тема не найдена' });
    const { subject: s, topic: t } = found;
    const i = s.topics.indexOf(t);
    return {
      subject: { slug: s.slug, title: s.title, hue: s.hue, emoji: s.emoji, course: s.course },
      topic: { ...t, problems: t.problems.map(publicProblem) },
      prev: s.topics[i - 1] ? { slug: s.topics[i - 1]!.slug, title: s.topics[i - 1]!.title } : null,
      next: s.topics[i + 1] ? { slug: s.topics[i + 1]!.slug, title: s.topics[i + 1]!.title } : null,
    };
  });

  // Проверка ответа. reveal=true — показать решение без ответа («сдаюсь»).
  app.post('/practice/check', async (req, reply) => {
    const body = z.object({ problemId: z.string().max(40), answer: z.string().max(200).default(''), reveal: z.boolean().optional() }).parse(req.body);
    const found = findProblem(body.problemId);
    if (!found) return reply.code(404).send({ error: 'Задача не найдена' });
    const { problem, topic, subject } = found;
    const correct = body.reveal ? false : checkAnswer(problem, body.answer);
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    if (!body.reveal) {
      await prisma.practiceAttempt.create({
        data: { problemId: problem.id, topic: `${subject.slug}/${topic.slug}`, visitorId, userId, correct, answer: body.answer.slice(0, 200) },
      });
      void track({ type: correct ? 'practice_solve' : 'practice_try', visitorId, userId, path: `/practice/${subject.slug}/${topic.slug}`, label: problem.id });
    }
    // решение показываем после верного ответа, после второй ошибки или по просьбе
    const tries = await prisma.practiceAttempt.count({ where: { problemId: problem.id, ...(userId ? { userId } : { visitorId: visitorId ?? '-' }) } });
    const show = correct || body.reveal || tries >= 2;
    return {
      correct,
      answer: show ? answerText(problem) : null,
      solution: show ? problem.solution : null,
      tries,
    };
  });

  // Какие задачи уже решены этим гостем или учеником
  app.get('/practice/progress', async (req) => {
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    if (!visitorId && !userId) return { solved: [], tried: [] };
    const attempts = await prisma.practiceAttempt.findMany({
      where: { OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] },
      select: { problemId: true, correct: true },
    });
    const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.problemId));
    const tried = new Set(attempts.filter((a) => !a.correct && !solved.has(a.problemId)).map((a) => a.problemId));
    return { solved: [...solved], tried: [...tried] };
  });

  // Диагностика по предмету: по одной задаче базового уровня из каждой темы
  app.get('/practice/diagnostic/:subject', async (req, reply) => {
    const { subject } = req.params as { subject: string };
    const s = PRACTICE.find((x) => x.slug === subject);
    if (!s) return reply.code(404).send({ error: 'Предмет не найден' });
    void track({ type: 'diagnostic_start', visitorId: visitorIdOf(req), userId: await optionalUser(req), label: subject });
    return {
      subject: { slug: s.slug, title: s.title, hue: s.hue, course: s.course },
      problems: s.topics.flatMap((t) => {
        const pick = t.problems.filter((p) => p.level === 2 && !p.self)[0] ?? t.problems[0]!;
        return [{ ...publicProblem(pick), topic: { slug: t.slug, title: t.title } }];
      }),
    };
  });

  app.post('/practice/diagnostic/:subject/done', async (req) => {
    const { subject } = req.params as { subject: string };
    const { score, total } = z.object({ score: z.number().int().min(0), total: z.number().int().min(1) }).parse(req.body);
    void track({ type: 'diagnostic_done', visitorId: visitorIdOf(req), userId: await optionalUser(req), label: `${subject}:${score}/${total}` });
    return { ok: true };
  });
}

function dailyPublic() {
  const { subject, topic, problem } = dailyProblem(schoolDay());
  return { subject: { slug: subject.slug, title: subject.title, hue: subject.hue }, topic: { slug: topic.slug, title: topic.title }, problem: publicProblem(problem) };
}
