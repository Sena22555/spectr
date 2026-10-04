import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
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
import { progressRoutes } from './routes/progress.js';
import { tournamentRoutes } from './routes/tournament.js';
import { startEventPruning } from './lib/track.js';

// За Caddy адрес клиента приходит в X-Forwarded-For: доверяем ему только от локального прокси
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: '127.0.0.1', bodyLimit: 1024 * 1024 });

const production = process.env.SERVE_WEB === '1' || process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (production && jwtSecret.length < 24) {
  // со стандартным секретом любой мог бы подделать токен администратора
  throw new Error('JWT_SECRET не задан или слишком короткий (нужно от 24 символов)');
}

const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim());
await app.register(cors, { origin: origins, credentials: true });
await app.register(jwt, { secret: jwtSecret || 'dev-secret-change-me' });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

// Ограничение частоты запросов: общее и строже — на вход, коды, заявки (см. config.rateLimit в маршрутах)
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  allowList: (req) => !req.url.startsWith('/api'),
  errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: `Слишком много запросов. Попробуйте через ${Math.ceil(ctx.ttl / 1000)} с.` }),
});

// Заголовки безопасности. Встраивание в iframe разрешено только мессенджерам — там живут мини-приложения.
const FRAME_ANCESTORS = "'self' https://web.telegram.org https://*.telegram.org https://vk.com https://*.vk.com https://*.vk.ru https://max.ru https://*.max.ru";
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org https://st.max.ru",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
].join('; ');
app.addHook('onSend', async (req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'strict-origin-when-cross-origin');
  reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (req.headers['x-forwarded-proto'] === 'https') reply.header('strict-transport-security', 'max-age=15552000');
  const type = String(reply.getHeader('content-type') ?? '');
  if (type.startsWith('text/html')) reply.header('content-security-policy', CSP);
});

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
    await api.register(progressRoutes);
    await api.register(tournamentRoutes);
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
// на сервере за Caddy достаточно слушать только локальный адрес: HOST=127.0.0.1
await app.listen({ port, host: process.env.HOST || '0.0.0.0' });
startBot(app.log);
startEventPruning();
