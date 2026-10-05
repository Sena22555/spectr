import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { rl } from '../lib/limits.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { GAMES, LEVELS, findGame, findLevel, levelId } from '../games/content.js';
import { makeLevel } from '../games/levels.js';
import { UNITS as EN_UNITS, LESSONS as EN_LESSONS } from '../english/content.js';

// «Игры Спектра». Главы открыты все (старшеклассник начнёт с профильной), уровни в главе — по порядку.

const who = async (req: Parameters<typeof visitorIdOf>[0]) => {
  const userId = await optionalUser(req);
  const visitorId = visitorIdOf(req);
  return { userId, visitorId, or: [...(userId ? [{ userId }] : []), ...(visitorId ? [{ visitorId }] : [])] };
};

export async function gamesRoutes(app: FastifyInstance) {
  // витрина: четыре игры и сколько стикеров собрано в каждой
  app.get('/games', async (req) => {
    const { or } = await who(req);
    const [results, english] = or.length
      ? await Promise.all([prisma.gameResult.findMany({ where: { OR: or }, select: { game: true, levelId: true } }), prisma.englishResult.findMany({ where: { OR: or }, select: { lessonId: true } })])
      : [[], []];
    const done = (game: string) => new Set(results.filter((r) => r.game === game).map((r) => r.levelId)).size;
    return {
      games: [
        { id: 'lingo', name: 'СпектрLingo', subject: 'Английский', tagline: 'Слова с озвучкой, фразы, грамматика — от «Hello!» до ЕГЭ', hue: 5, icon: '🇬🇧', chapters: EN_UNITS.length, stickers: new Set(english.map((e) => e.lessonId)).size, total: EN_UNITS.length * EN_LESSONS.length },
        ...GAMES.map((g) => ({ id: g.id, name: g.name, subject: { math: 'Математика', physics: 'Физика', informatics: 'Информатика' }[g.subject], tagline: g.tagline, hue: g.hue, icon: g.icon, chapters: g.chapters.length, stickers: done(g.id), total: g.chapters.length * LEVELS.length })),
      ],
    };
  });

  app.get('/games/:game', async (req, reply) => {
    const game = findGame((req.params as { game: string }).game);
    if (!game) return reply.code(404).send({ error: 'Игра не найдена' });
    const { or } = await who(req);
    const results = or.length ? await prisma.gameResult.findMany({ where: { game: game.id, OR: or }, select: { levelId: true, mistakes: true } }) : [];
    const done = new Map<string, boolean>();
    for (const r of results) done.set(r.levelId, Boolean(done.get(r.levelId)) || r.mistakes === 0);
    let next: string | null = null;
    const chapters = game.chapters.map((c, i) => {
      const lessons = LEVELS.map((l) => {
        const id = levelId(c.id, l.n);
        return { id, n: l.n, title: l.title, icon: l.icon, done: done.has(id), perfect: done.get(id) ?? false, open: l.n === 1 || done.has(levelId(c.id, l.n - 1)) };
      });
      if (!next && lessons.some((l) => l.done)) next = lessons.find((l) => !l.done)?.id ?? null;
      return { id: c.id, title: c.title, ru: c.sub, level: `глава ${i + 1}`, grades: c.grades, icon: c.icon, hue: (game.hue + i) % 7, grammar: c.cheat[0]!, words: c.pairs.length, lessons };
    });
    if (!next) next = chapters.flatMap((c) => c.lessons).find((l) => !l.done)?.id ?? null;
    return { game: { id: game.id, name: game.name, tagline: game.tagline, hue: game.hue, icon: game.icon }, units: chapters, next, stats: { lessons: done.size, words: 0, total: game.chapters.length * LEVELS.length } };
  });

  app.get('/games/:game/level/:id', async (req, reply) => {
    const { game: gid, id } = req.params as { game: string; id: string };
    const game = findGame(gid);
    const level = game ? makeLevel(game, id) : null;
    if (!level) return reply.code(404).send({ error: 'Уровень не найден' });
    void track({ type: 'game_start', visitorId: visitorIdOf(req), userId: await optionalUser(req), label: `${gid}:${id}` });
    return level;
  });

  app.post('/games/result', { config: rl(40, '10 minutes') }, async (req, reply) => {
    const body = z
      .object({ game: z.string().max(20), levelId: z.string().max(40), total: z.number().int().min(1).max(40), mistakes: z.number().int().min(0).max(80), blitz: z.boolean().default(false) })
      .parse(req.body);
    const game = findGame(body.game);
    if (!game || !findLevel(game, body.levelId)) return reply.code(404).send({ error: 'Уровень не найден' });
    const { userId, visitorId, or } = await who(req);
    if (!or.length) return reply.code(400).send({ error: 'Обновите страницу и попробуйте ещё раз' });
    // 10 за уровень, +5 без ошибок, +5 за блиц; повтор — 5, чтобы не «фармили» один уровень
    const before = await prisma.gameResult.count({ where: { game: game.id, levelId: body.levelId, OR: or } });
    const xp = before ? 5 : 10 + (body.mistakes === 0 ? 5 : 0) + (body.blitz ? 5 : 0);
    await prisma.gameResult.create({ data: { game: game.id, levelId: body.levelId, userId, visitorId, total: body.total, mistakes: body.mistakes, xp } });
    void track({ type: 'game_done', visitorId, userId, label: `${game.id}:${body.levelId}:${body.mistakes}` });
    return { xp, first: !before };
  });
}
