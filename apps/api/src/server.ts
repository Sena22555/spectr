import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { meRoutes } from './routes/me.js';
import { teacherRoutes } from './routes/teacher.js';
import { adminRoutes } from './routes/admin.js';
import { uploadRoutes, UPLOAD_DIR } from './routes/uploads.js';
import { startBot } from './bot/index.js';
import { practiceRoutes } from './routes/practice.js';
import { analyticsRoutes } from './routes/analytics.js';
import { homeworkRoutes } from './routes/homework.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim());
await app.register(cors, { origin: origins, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

mkdirSync(UPLOAD_DIR, { recursive: true });
await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/', decorateReply: false });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.code(400).send({ error: first?.message ?? 'Проверьте поля формы', issues: err.issues });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return reply.code(404).send({ error: 'Запись не найдена' });
    if (err.code === 'P2002') return reply.code(409).send({ error: 'Такая запись уже существует' });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.code(status).send({ error: status >= 500 ? 'Что-то пошло не так. Попробуйте ещё раз.' : (err as Error).message });
});

app.get('/health', async () => ({ ok: true }));

await app.register(
  async (api) => {
    await api.register(authRoutes);
    await api.register(publicRoutes);
    await api.register(meRoutes);
    await api.register(teacherRoutes);
    await api.register(adminRoutes);
    await api.register(uploadRoutes);
    await api.register(practiceRoutes);
    await api.register(analyticsRoutes);
    await api.register(homeworkRoutes);
  },
  { prefix: '/api' },
);

// В продакшене API раздаёт собранный фронтенд (один домен для сайта и мини-приложений)
const webDist = path.resolve(process.cwd(), '../web/dist');
if (process.env.SERVE_WEB === '1' && existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'Не найдено' });
    // файла сборки нет (сайт обновился) — честный 404, а не index.html, иначе браузер получит HTML вместо скрипта
    if (req.url.startsWith('/assets/')) return reply.code(404).send('Not found');
    // index.html не кешируем, чтобы после обновления сайта сразу подхватывалась новая сборка
    reply.header('cache-control', 'no-cache');
    return reply.sendFile('index.html', webDist);
  });
}

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
startBot(app.log);
