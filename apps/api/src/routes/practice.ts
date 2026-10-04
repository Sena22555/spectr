import type { FastifyInstance } from 'fastify';
import { rl } from '../lib/limits.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { PRACTICE, answerText, checkAnswer, dailyProblem, findProblem, findTopic, publicProblem } from '../practice/content.js';
import { schoolDay } from '../lib/time.js';
import { GENERATORS, checkGen, findGenerator, genAnswerText, genProblemId, makeProblem, parseGenId } from '../practice/generators.js';
import { randomInt } from 'node:crypto';

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
  app.post('/practice/check', { config: rl(60, '1 minute') }, async (req, reply) => {
    const body = z.object({ problemId: z.string().max(40), answer: z.string().max(200).default(''), reveal: z.boolean().optional() }).parse(req.body);
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    // задача тренажёра: пересобираем по зерну и проверяем
    const gid = parseGenId(body.problemId);
    if (gid) {
      const made = makeProblem(gid.gen.id, gid.seed)!;
      const correct = body.reveal ? false : checkGen(made.problem, body.answer);
      if (!body.reveal) {
        await prisma.practiceAttempt.create({ data: { problemId: body.problemId, topic: `trainer/${gid.gen.id}`, visitorId, userId, correct, answer: body.answer.slice(0, 200) } });
        void track({ type: correct ? 'practice_solve' : 'practice_try', visitorId, userId, path: `/practice/train/${gid.gen.id}`, label: gid.gen.id });
      }
      const tries = await prisma.practiceAttempt.count({ where: { problemId: body.problemId, ...(userId ? { userId } : { visitorId: visitorId ?? '-' }) } });
      const show = correct || body.reveal || tries >= 2;
      return { correct, answer: show ? genAnswerText(made.problem) : null, solution: show ? made.problem.steps : null, tries };
    }
    const found = findProblem(body.problemId);
    if (!found) return reply.code(404).send({ error: 'Задача не найдена' });
    const { problem, topic, subject } = found;
    const correct = body.reveal ? false : checkAnswer(problem, body.answer);
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

  // ——— тренажёры: бесконечные задачи по классам и номерам ОГЭ/ЕГЭ ———
  app.get('/practice/trainers', async () => ({
    trainers: GENERATORS.map((g) => ({ id: g.id, title: g.title, subject: g.subject, grades: g.grades, skill: g.skill, exams: g.exams ?? [], theory: g.theory ?? null })),
  }));

  app.get('/practice/trainers/:id/next', async (req, reply) => {
    const { id } = req.params as { id: string };
    const gen = findGenerator(id);
    if (!gen) return reply.code(404).send({ error: 'Тренажёр не найден' });
    const seed = randomInt(1, 2_000_000_000);
    const { problem } = makeProblem(id, seed)!;
    return {
      trainer: { id: gen.id, title: gen.title, subject: gen.subject, grades: gen.grades, skill: gen.skill, exams: gen.exams ?? [], theory: gen.theory ?? null },
      problem: { id: genProblemId(id, seed), text: problem.text, kind: problem.kind ?? 'number', unit: problem.unit ?? null, options: null, level: 0, self: false, hint: problem.hint },
    };
  });

  // Какие задачи уже решены этим гостем или учеником
  app.get('/practice/progress', async (req) => {
    const visitorId = visitorIdOf(req);
    const userId = await optionalUser(req);
    if (!visitorId && !userId) return { solved: [], tried: [], trainers: {} };
    const attempts = await prisma.practiceAttempt.findMany({
      where: { OR: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] },
      select: { problemId: true, correct: true },
    });
    const solved = new Set(attempts.filter((a) => a.correct && !a.problemId.startsWith('g:')).map((a) => a.problemId));
    const tried = new Set(attempts.filter((a) => !a.correct && !solved.has(a.problemId) && !a.problemId.startsWith('g:')).map((a) => a.problemId));
    // по тренажёрам — счётчики: сколько задач решено верно и сколько всего попыток
    const trainers: Record<string, { solved: number; tries: number }> = {};
    for (const a of attempts) {
      if (!a.problemId.startsWith('g:')) continue;
      const id = a.problemId.split(':')[1]!;
      const row = (trainers[id] ??= { solved: 0, tries: 0 });
      row.tries++;
      if (a.correct) row.solved++;
    }
    return { solved: [...solved], tried: [...tried], trainers };
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
        // диагностика начинается с простых задач: по одной «разминке» из каждой темы
        const pick = t.problems.find((p) => p.level === 1 && !p.self) ?? t.problems.find((p) => !p.self) ?? t.problems[0]!;
        return [{ ...publicProblem(pick), topic: { slug: t.slug, title: t.title } }];
      }),
    };
  });

  app.post('/practice/diagnostic/:subject/done', { config: rl(20, '1 minute') }, async (req) => {
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
