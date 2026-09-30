import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, publicUser } from '../lib/auth.js';
import { verifyTelegramInitData, verifyVkLaunchParams } from '../lib/miniapp.js';
import type { Role } from '../lib/enums.js';
import { consumeCode, issueCode } from '../lib/codes.js';
import { LETTERS, sendMail } from '../lib/mail.js';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Имя слишком короткое').max(80),
  email: z.email('Некорректный email').transform((v) => v.toLowerCase()),
  password: z.string().min(8, 'Пароль — минимум 8 символов').max(128),
  phone: z.string().trim().max(32).optional(),
});

const emailField = z.email('Некорректный email').transform((v) => v.toLowerCase());
const codeField = z.string().trim().regex(/^\d{6}$/, 'Код — 6 цифр');

const loginSchema = z.object({
  email: z.email('Некорректный email').transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  const sign = (id: string, role: string) => app.jwt.sign({ sub: id, role: role as Role }, { expiresIn: '30d' });

  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return reply.code(409).send({ error: 'Аккаунт с таким email уже есть' });

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      include: { teacher: true },
    });
    const code = await issueCode(body.email, 'VERIFY');
    if (code) await sendMail(body.email, LETTERS.verify(user.name, code)).catch((err) => app.log.error(err, 'письмо с кодом не ушло'));
    return { token: sign(user.id, user.role), user: publicUser(user) };
  });

  // Повторно отправить код подтверждения на почту аккаунта
  app.post('/auth/email/send', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!user.email) return reply.code(400).send({ error: 'У аккаунта нет почты' });
    if (user.emailVerified) return { ok: true, verified: true };
    const code = await issueCode(user.email, 'VERIFY');
    if (!code) return reply.code(429).send({ error: 'Код уже отправлен. Новый можно запросить через минуту.' });
    await sendMail(user.email, LETTERS.verify(user.name, code));
    return { ok: true };
  });

  app.post('/auth/email/verify', { preHandler: authenticate }, async (req, reply) => {
    const { code } = z.object({ code: codeField }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (!user.email) return reply.code(400).send({ error: 'У аккаунта нет почты' });
    if (!user.emailVerified) {
      const error = await consumeCode(user.email, 'VERIFY', code);
      if (error) return reply.code(400).send({ error });
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true }, include: { teacher: true } });
    return { user: publicUser(updated) };
  });

  // Забыли пароль: код на почту. Ответ одинаковый, есть аккаунт или нет, чтобы не раскрывать адреса.
  app.post('/auth/reset/request', async (req, reply) => {
    const { email } = z.object({ email: emailField }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const code = await issueCode(email, 'RESET');
      if (!code) return reply.code(429).send({ error: 'Код уже отправлен. Новый можно запросить через минуту.' });
      await sendMail(email, LETTERS.reset(user.name, code));
    }
    return { ok: true };
  });

  app.post('/auth/reset/confirm', async (req, reply) => {
    const body = z
      .object({ email: emailField, code: codeField, password: z.string().min(8, 'Пароль — минимум 8 символов').max(128) })
      .parse(req.body);
    const error = await consumeCode(body.email, 'RESET', body.code);
    if (error) return reply.code(400).send({ error });
    const user = await prisma.user.update({
      where: { email: body.email },
      // код пришёл на эту почту, значит она заодно подтверждена
      data: { passwordHash: await bcrypt.hash(body.password, 10), emailVerified: true },
      include: { teacher: true },
    });
    return { token: sign(user.id, user.role), user: publicUser(user) };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { teacher: true } });
    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }
    return { token: sign(user.id, user.role), user: publicUser(user) };
  });

  // Вход из Telegram Mini App: initData подписан ботом
  app.post('/auth/telegram', async (req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return reply.code(501).send({ error: 'Вход через Telegram ещё не настроен' });
    const { initData } = z.object({ initData: z.string().min(1) }).parse(req.body);
    const tg = verifyTelegramInitData(initData, token);
    if (!tg) return reply.code(401).send({ error: 'Подпись Telegram не прошла проверку' });

    const telegramId = String(tg.id);
    let user = await prisma.user.findUnique({ where: { telegramId }, include: { teacher: true } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || 'Ученик',
          avatarUrl: tg.photo_url,
        },
        include: { teacher: true },
      });
    }
    return { token: sign(user.id, user.role), user: publicUser(user) };
  });

  // Вход из VK Mini App: параметры запуска подписаны секретом приложения
  app.post('/auth/vk', async (req, reply) => {
    const secret = process.env.VK_APP_SECRET;
    if (!secret) return reply.code(501).send({ error: 'Вход через VK ещё не настроен' });
    const body = z.object({ search: z.string().min(1), name: z.string().optional(), avatarUrl: z.string().optional() }).parse(req.body);
    const vk = verifyVkLaunchParams(body.search, secret);
    if (!vk) return reply.code(401).send({ error: 'Подпись VK не прошла проверку' });

    let user = await prisma.user.findUnique({ where: { vkId: vk.id }, include: { teacher: true } });
    if (!user) {
      user = await prisma.user.create({
        data: { vkId: vk.id, name: body.name || 'Ученик', avatarUrl: body.avatarUrl },
        include: { teacher: true },
      });
    }
    return { token: sign(user.id, user.role), user: publicUser(user) };
  });

  // Привязать Telegram к существующему аккаунту
  app.post('/auth/link/telegram', { preHandler: authenticate }, async (req, reply) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return reply.code(501).send({ error: 'Telegram ещё не настроен' });
    const { initData } = z.object({ initData: z.string().min(1) }).parse(req.body);
    const tg = verifyTelegramInitData(initData, token);
    if (!tg) return reply.code(401).send({ error: 'Подпись Telegram не прошла проверку' });
    const taken = await prisma.user.findUnique({ where: { telegramId: String(tg.id) } });
    if (taken && taken.id !== req.user.sub) return reply.code(409).send({ error: 'Этот Telegram уже привязан к другому аккаунту' });
    const user = await prisma.user.update({
      where: { id: req.user.sub },
      data: { telegramId: String(tg.id) },
      include: { teacher: true },
    });
    return { user: publicUser(user) };
  });

  app.get('/auth/me', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, include: { teacher: true } });
    if (!user) return reply.code(401).send({ error: 'Аккаунт не найден' });
    return { user: publicUser(user) };
  });

  app.patch('/auth/me', { preHandler: authenticate }, async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        phone: z.string().trim().max(32).optional(),
        avatarUrl: z.string().max(500).optional(),
      })
      .parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user.sub }, data: body, include: { teacher: true } });
    return { user: publicUser(user) };
  });

  app.post('/auth/password', { preHandler: authenticate }, async (req, reply) => {
    const body = z.object({ current: z.string().optional(), next: z.string().min(8).max(128) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.sub } });
    if (user.passwordHash && !(await bcrypt.compare(body.current ?? '', user.passwordHash))) {
      return reply.code(400).send({ error: 'Текущий пароль неверный' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.next, 10) } });
    return { ok: true };
  });
}
