import type { FastifyInstance } from 'fastify';
import { rl } from '../lib/limits.js';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../lib/auth.js';
import { SOURCE_LABEL, linkVisitor, optionalUser, sourceOf, track, visitorIdOf } from '../lib/track.js';
import { schoolDay } from '../lib/time.js';
import { botSendTo } from '../bot/index.js';
import { findTopic } from '../practice/content.js';

// Сбор событий с сайта (публично) и аналитика для администратора.

const DAY = 86_400_000;
const SESSION_GAP = 30 * 60_000;
const INTEREST = /^\/(subjects|teachers|groups|practice|book)/;

export async function analyticsRoutes(app: FastifyInstance) {
  // ——— сбор ———
  app.post('/track', { config: rl(120, '1 minute') }, async (req) => {
    const visitorId = visitorIdOf(req);
    if (!visitorId) return { ok: false };
    const body = z
      .object({
        type: z.enum(['view', 'book_open', 'cta', 'share', 'miniapp_open']).default('view'),
        path: z.string().max(300).optional(),
        label: z.string().max(200).optional(),
        referrer: z.string().max(500).optional(),
        utmSource: z.string().max(100).optional(),
        utmMedium: z.string().max(100).optional(),
        utmCampaign: z.string().max(150).optional(),
        platform: z.enum(['web', 'telegram', 'vk', 'max']).default('web'),
        device: z.enum(['mobile', 'desktop']).optional(),
      })
      .parse(req.body);
    const userId = await optionalUser(req);
    const now = new Date();
    const existing = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!existing) {
      await prisma.visitor.create({
        data: {
          id: visitorId,
          platform: body.platform,
          source: sourceOf({ platform: body.platform, referrer: body.referrer, utmSource: body.utmSource, utmMedium: body.utmMedium, host: req.headers.host }),
          referrer: body.referrer || null,
          utmSource: body.utmSource,
          utmMedium: body.utmMedium,
          utmCampaign: body.utmCampaign,
          landing: body.path,
          device: body.device,
          userId,
          views: body.type === 'view' ? 1 : 0,
        },
      });
      await track({ type: 'visit', visitorId, userId, path: body.path, label: body.platform });
    } else {
      const newSession = now.getTime() - existing.lastSeen.getTime() > SESSION_GAP;
      await prisma.visitor.update({
        where: { id: visitorId },
        data: {
          lastSeen: now,
          visits: newSession ? { increment: 1 } : undefined,
          views: body.type === 'view' ? { increment: 1 } : undefined,
          platform: body.platform !== 'web' ? body.platform : undefined,
          userId: !existing.userId && userId ? userId : undefined,
        },
      });
      if (newSession) await track({ type: 'visit', visitorId, userId, path: body.path, label: body.platform });
    }
    await track({ type: body.type, visitorId, userId, path: body.path, label: body.label });
    return { ok: true };
  });

  // ——— аналитика ———
  await app.register(async (admin) => {
    admin.addHook('preHandler', requireRole('ADMIN'));

    admin.get('/admin/analytics', async (req) => {
      const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
      const since = new Date(Date.now() - days * DAY);
      const prevSince = new Date(since.getTime() - days * DAY);

      const [events, visitors, users, bookings, players, members, studentLessons, attempts, prevViews, prevBookings, prevUsers] = await Promise.all([
        prisma.event.findMany({ where: { createdAt: { gte: since } }, select: { type: true, visitorId: true, userId: true, playerId: true, path: true, label: true, createdAt: true } }),
        prisma.visitor.findMany({ where: { lastSeen: { gte: since } } }),
        prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { id: true, createdAt: true, telegramId: true, maxId: true, vkId: true, email: true } }),
        prisma.booking.findMany({ where: { createdAt: { gte: since } }, select: { id: true, status: true, createdAt: true, comment: true, userId: true } }),
        prisma.botPlayer.findMany({ select: { chatId: true, platform: true, createdAt: true, lastSeen: true, source: true, rainbows: true, dailySolved: true } }),
        prisma.groupMember.findMany({ select: { userId: true, joinedAt: true } }),
        prisma.lesson.findMany({ where: { studentId: { not: null } }, select: { studentId: true, createdAt: true } }),
        prisma.practiceAttempt.findMany({ where: { createdAt: { gte: since } }, select: { correct: true, topic: true, visitorId: true, userId: true, playerId: true, createdAt: true } }),
        prisma.event.findMany({ where: { createdAt: { gte: prevSince, lt: since }, type: 'view' }, select: { visitorId: true } }),
        prisma.booking.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
        prisma.user.count({ where: { createdAt: { gte: prevSince, lt: since } } }),
      ]);

      const students = new Set<string>([...members.map((m) => m.userId), ...studentLessons.map((l) => l.studentId!)]);
      const firstStudentAt = new Map<string, number>();
      for (const m of members) firstStudentAt.set(m.userId, Math.min(firstStudentAt.get(m.userId) ?? Infinity, m.joinedAt.getTime()));
      for (const l of studentLessons) firstStudentAt.set(l.studentId!, Math.min(firstStudentAt.get(l.studentId!) ?? Infinity, l.createdAt.getTime()));
      const newStudents = [...firstStudentAt.values()].filter((t) => t >= since.getTime()).length;

      const views = events.filter((e) => e.type === 'view');
      const activeVisitors = new Set(views.map((e) => e.visitorId).filter(Boolean) as string[]);
      const newVisitors = visitors.filter((v) => v.firstSeen >= since);
      const playersInRange = players.filter((p) => p.lastSeen >= since);
      const newPlayers = players.filter((p) => p.createdAt >= since);

      // воронка сайта
      const interested = new Set(views.filter((e) => e.path && INTEREST.test(e.path)).map((e) => e.visitorId!));
      for (const a of attempts) if (a.visitorId) interested.add(a.visitorId);
      const bookOpen = new Set(events.filter((e) => e.type === 'book_open').map((e) => e.visitorId!).filter(Boolean));
      const booked = new Set(events.filter((e) => e.type === 'booking' && e.visitorId).map((e) => e.visitorId!));
      const visitorUser = new Map(visitors.map((v) => [v.id, v.userId]));
      const becameStudents = [...activeVisitors].filter((v) => {
        const u = visitorUser.get(v);
        return u && students.has(u);
      }).length;

      // по дням
      const dayKeys: string[] = [];
      for (let t = since.getTime(); t <= Date.now() + 1; t += DAY) dayKeys.push(schoolDay(new Date(t)));
      const daily = new Map(dayKeys.map((d) => [d, { day: d, visitors: new Set<string>(), bookings: 0, signups: 0, botStarts: 0, solved: 0 }]));
      for (const e of views) daily.get(schoolDay(e.createdAt))?.visitors.add(e.visitorId ?? '');
      for (const b of bookings) {
        const d = daily.get(schoolDay(b.createdAt));
        if (d) d.bookings++;
      }
      for (const u of users) {
        const d = daily.get(schoolDay(u.createdAt));
        if (d) d.signups++;
      }
      for (const p of newPlayers) {
        const d = daily.get(schoolDay(p.createdAt));
        if (d) d.botStarts++;
      }
      for (const a of attempts) {
        if (!a.correct) continue;
        const d = daily.get(schoolDay(a.createdAt));
        if (d) d.solved++;
      }

      // источники: новые посетители и сколько из них оставили заявку
      const sources = new Map<string, { visitors: number; bookings: number; students: number }>();
      const bump = (key: string, field: 'visitors' | 'bookings' | 'students') => {
        const row = sources.get(key) ?? { visitors: 0, bookings: 0, students: 0 };
        row[field]++;
        sources.set(key, row);
      };
      for (const v of newVisitors) {
        bump(v.source, 'visitors');
        if (booked.has(v.id)) bump(v.source, 'bookings');
        if (v.userId && students.has(v.userId)) bump(v.source, 'students');
      }
      for (const p of newPlayers) bump(p.platform === 'max' ? 'bot_max' : 'bot_telegram', 'visitors');
      for (const b of bookings) if (b.comment?.startsWith('Заявка из бота') || b.comment?.startsWith('Заявка из Telegram')) bump(b.comment.includes('MAX') ? 'bot_max' : 'bot_telegram', 'bookings');

      // популярные страницы
      const pages = new Map<string, number>();
      for (const e of views) {
        const p = normalizePath(e.path ?? '/');
        pages.set(p, (pages.get(p) ?? 0) + 1);
      }

      // практикум
      const topicStats = new Map<string, { tries: number; solved: number; people: Set<string> }>();
      for (const a of attempts) {
        const row = topicStats.get(a.topic) ?? { tries: 0, solved: 0, people: new Set<string>() };
        row.tries++;
        if (a.correct) row.solved++;
        row.people.add(a.userId ?? a.visitorId ?? a.playerId ?? '?');
        topicStats.set(a.topic, row);
      }

      const platforms = countBy(visitors, (v) => v.platform);
      const devices = countBy(visitors.filter((v) => v.device), (v) => v.device!);

      return {
        days,
        kpi: {
          visitors: activeVisitors.size,
          visitorsPrev: new Set(prevViews.map((e) => e.visitorId)).size,
          newVisitors: newVisitors.length,
          botUsers: playersInRange.length,
          newBotUsers: newPlayers.length,
          signups: users.length,
          signupsPrev: prevUsers,
          bookings: bookings.length,
          bookingsPrev: prevBookings,
          newStudents,
          practiceSolved: attempts.filter((a) => a.correct).length,
          practicePeople: new Set(attempts.map((a) => a.userId ?? a.visitorId ?? a.playerId)).size,
        },
        funnel: [
          { key: 'visitors', label: 'Зашли на сайт или в мини-приложение', value: activeVisitors.size },
          { key: 'interested', label: 'Смотрели предметы, преподавателей или практикум', value: [...interested].filter((v) => activeVisitors.has(v)).length },
          { key: 'book_open', label: 'Открыли запись', value: bookOpen.size },
          { key: 'booked', label: 'Оставили заявку', value: booked.size },
          { key: 'students', label: 'Учатся в школе', value: becameStudents },
        ],
        botFunnel: [
          { key: 'started', label: 'Запустили бота', value: newPlayers.length },
          { key: 'active', label: 'Были активны за период', value: playersInRange.length },
          { key: 'played', label: 'Решали задачи и играли', value: playersInRange.filter((p) => p.dailySolved > 0 || p.rainbows > 0).length },
          { key: 'booked', label: 'Записались через бота', value: bookings.filter((b) => b.comment?.startsWith('Заявка из')).length },
        ],
        bookingsByStatus: countBy(bookings, (b) => b.status),
        daily: [...daily.values()].map((d) => ({ day: d.day, visitors: d.visitors.size, bookings: d.bookings, signups: d.signups, botStarts: d.botStarts, solved: d.solved })),
        sources: [...sources.entries()]
          .map(([key, v]) => ({ key, label: SOURCE_LABEL[key] ?? key, ...v }))
          .sort((a, b) => b.visitors - a.visitors),
        pages: [...pages.entries()]
          .map(([path, n]) => ({ path, label: pageLabel(path), views: n }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 12),
        practice: [...topicStats.entries()]
          .map(([topic, v]) => {
            const [s, t] = topic.split('/');
            const found = findTopic(s ?? '', t ?? '');
            return { topic, title: found ? `${found.subject.title}: ${found.topic.title}` : topic, tries: v.tries, solved: v.solved, people: v.people.size };
          })
          .sort((a, b) => b.people - a.people)
          .slice(0, 12),
        platforms,
        devices,
      };
    });

    // ——— люди: все, кто приходил, с сегментами «посмотрел, но не записался» и т. п. ———
    admin.get('/admin/people', async (req) => {
      const q = z.object({ segment: z.string().default('all'), q: z.string().optional() }).parse(req.query);
      const people = await buildPeople();
      const needle = q.q?.trim().toLowerCase();
      const filtered = people.filter((p) => (!needle || `${p.name} ${p.contact ?? ''}`.toLowerCase().includes(needle)) && inSegment(p, q.segment));
      const counts = Object.fromEntries(SEGMENTS.map((seg) => [seg, people.filter((p) => inSegment(p, seg)).length]));
      return { people: filtered.slice(0, 400), counts };
    });

    admin.get('/admin/people/:kind/:id', async (req, reply) => {
      const { kind, id } = req.params as { kind: string; id: string };
      const card = await personCard(kind, id);
      if (!card) return reply.code(404).send({ error: 'Человек не найден' });
      return card;
    });

    // Написать человеку в мессенджер от имени школы
    admin.post('/admin/people/:kind/:id/message', { config: rl(60, '1 hour') }, async (req, reply) => {
      const { kind, id } = req.params as { kind: string; id: string };
      const { text } = z.object({ text: z.string().trim().min(1).max(3500) }).parse(req.body);
      const chats = await chatsOf(kind, id);
      if (!chats.length) return reply.code(400).send({ error: 'У человека нет мессенджера, где бот может ему написать' });
      let sent = 0;
      for (const chat of chats) if (await botSendTo(chat, `💬 <b>Сообщение от школы «Спектр»</b>\n\n${escapeHtml(text)}`)) sent++;
      if (!sent) return reply.code(502).send({ error: 'Мессенджер не принял сообщение. Возможно, человек остановил бота.' });
      await track({ type: 'admin_message', userId: kind === 'user' ? id : null, playerId: kind === 'player' ? id : null, label: text.slice(0, 120) });
      return { ok: true, sent };
    });

    // Рассылка по сегменту через ботов
    admin.post('/admin/broadcast', { config: rl(10, '1 hour') }, async (req, reply) => {
      const body = z.object({ segment: z.enum(['warm', 'booked', 'practice', 'bot', 'students', 'all']), text: z.string().trim().min(1).max(3500), dry: z.boolean().optional() }).parse(req.body);
      const people = (await buildPeople()).filter((p) => p.kind !== 'visitor' && p.chats.length);
      const target = people.filter((p) => inSegment(p, body.segment));
      if (body.dry) return { recipients: target.length };
      if (!target.length) return reply.code(400).send({ error: 'В этом сегменте нет людей с подключённым мессенджером' });
      let sent = 0;
      for (const p of target) {
        for (const chat of p.chats) if (await botSendTo(chat, `📣 <b>«Спектр»</b>\n\n${escapeHtml(body.text)}`)) sent++;
        await new Promise((r) => setTimeout(r, 60));
      }
      await track({ type: 'broadcast', label: `${body.segment}:${sent}` });
      return { recipients: target.length, sent };
    });
  });
}

// ─── вспомогательное ───

const SEGMENTS = ['all', 'warm', 'booked', 'students', 'practice', 'bot', 'anon'] as const;

/** Сегменты воронки. Сотрудники (админы и преподаватели) попадают только во «Все». */
function inSegment(p: Person, segment: string) {
  const staff = p.role === 'ADMIN' || p.role === 'TEACHER';
  switch (segment) {
    case 'warm':
      return !staff && !p.isStudent && p.bookings === 0 && p.kind !== 'visitor' && (p.views >= 2 || p.solved > 0 || p.botActions > 2);
    case 'booked':
      return !staff && p.bookings > 0 && !p.isStudent;
    case 'students':
      return p.isStudent;
    case 'practice':
      return !staff && p.solved > 0 && !p.isStudent;
    case 'bot':
      return p.kind === 'player';
    case 'anon':
      return p.kind === 'visitor';
    default:
      return p.kind !== 'visitor' || p.views >= 2;
  }
}

function countBy<T>(list: T[], key: (x: T) => string) {
  const m: Record<string, number> = {};
  for (const x of list) m[key(x)] = (m[key(x)] ?? 0) + 1;
  return m;
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function normalizePath(p: string) {
  const path = p.split('?')[0]!.replace(/\/+$/, '') || '/';
  if (/^\/(app|teach|admin)\//.test(path)) return path.replace(/\/[a-z0-9]{20,}$/, '/:id');
  return path;
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/$/, 'Главная'],
  [/^\/practice$/, 'Практикум'],
  [/^\/practice\/diagnostic/, 'Диагностика'],
  [/^\/practice\//, 'Тема практикума'],
  [/^\/subjects$/, 'Предметы'],
  [/^\/subjects\//, 'Страница предмета'],
  [/^\/teachers$/, 'Преподаватели'],
  [/^\/teachers\//, 'Профиль преподавателя'],
  [/^\/groups/, 'Группы'],
  [/^\/book/, 'Запись'],
  [/^\/register/, 'Регистрация'],
  [/^\/login/, 'Вход'],
  [/^\/app/, 'Кабинет ученика'],
  [/^\/teach/, 'Кабинет преподавателя'],
  [/^\/admin/, 'Админка'],
];
const pageLabel = (p: string) => PAGE_NAMES.find(([re]) => re.test(p))?.[1] ?? p;

export interface Person {
  kind: 'user' | 'player' | 'visitor';
  id: string;
  name: string;
  contact: string | null;
  role: string | null;
  channels: string[];
  chats: string[];
  source: string;
  sourceLabel: string;
  firstSeen: string;
  lastSeen: string;
  views: number;
  solved: number;
  botActions: number;
  bookings: number;
  lastBookingStatus: string | null;
  isStudent: boolean;
  stage: string;
  interests: string[];
}

const SUBJECT_FROM_PATH: [RegExp, string][] = [
  [/physics|fizik|refraction|kinematics|newton|energy|ohm/, 'Физика'],
  [/math|matem|percent|quadratic|progress|trigon/, 'Математика'],
  [/informatics|inform|python|logic|coding|numeral/, 'Информатика'],
  [/english|angl/, 'Английский'],
];

function interestsFrom(paths: (string | null)[]) {
  const s = new Set<string>();
  for (const p of paths) {
    if (!p) continue;
    for (const [re, name] of SUBJECT_FROM_PATH) if (re.test(p)) s.add(name);
  }
  return [...s];
}

/** Все люди школы одним списком: аккаунты, игроки ботов без аккаунта и анонимные посетители. */
async function buildPeople(): Promise<Person[]> {
  const since = new Date(Date.now() - 180 * DAY);
  const [users, players, visitors, events, attempts, bookings, members, lessonStudents] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true, phone: true, role: true, telegramId: true, maxId: true, vkId: true, createdAt: true } }),
    prisma.botPlayer.findMany(),
    prisma.visitor.findMany({ where: { lastSeen: { gte: since } } }),
    prisma.event.findMany({ where: { createdAt: { gte: since } }, select: { type: true, visitorId: true, userId: true, playerId: true, path: true, createdAt: true } }),
    prisma.practiceAttempt.findMany({ where: { correct: true }, select: { userId: true, visitorId: true, playerId: true } }),
    prisma.booking.findMany({ select: { userId: true, contact: true, status: true, createdAt: true, comment: true } }),
    prisma.groupMember.findMany({ select: { userId: true } }),
    prisma.lesson.findMany({ where: { studentId: { not: null } }, distinct: ['studentId'], select: { studentId: true } }),
  ]);
  const students = new Set([...members.map((m) => m.userId), ...lessonStudents.map((l) => l.studentId!)]);
  const visitorsByUser = new Map<string, typeof visitors>();
  for (const v of visitors) if (v.userId) visitorsByUser.set(v.userId, [...(visitorsByUser.get(v.userId) ?? []), v]);
  const userByTg = new Map(users.filter((u) => u.telegramId).map((u) => [u.telegramId!, u.id]));
  const userByMax = new Map(users.filter((u) => u.maxId).map((u) => [u.maxId!, u.id]));
  const ownerOfPlayer = (p: { chatId: string; platform: string }) => (p.platform === 'max' ? userByMax.get(p.chatId.replace(/^max:/, '')) : userByTg.get(p.chatId));

  const evByVisitor = new Map<string, typeof events>();
  const evByUser = new Map<string, typeof events>();
  const evByPlayer = new Map<string, typeof events>();
  for (const e of events) {
    if (e.visitorId) evByVisitor.set(e.visitorId, [...(evByVisitor.get(e.visitorId) ?? []), e]);
    if (e.userId) evByUser.set(e.userId, [...(evByUser.get(e.userId) ?? []), e]);
    if (e.playerId) evByPlayer.set(e.playerId, [...(evByPlayer.get(e.playerId) ?? []), e]);
  }
  const solvedBy = (pred: (a: (typeof attempts)[number]) => boolean) => attempts.filter(pred).length;
  const people: Person[] = [];

  const stageOf = (isStudent: boolean, bookingsN: number, solved: number, views: number) =>
    isStudent ? 'Учится' : bookingsN ? 'Оставил заявку' : solved ? 'Решает задачи' : views > 1 ? 'Присматривается' : 'Зашёл один раз';

  for (const u of users) {
    const vs = visitorsByUser.get(u.id) ?? [];
    const myPlayers = players.filter((p) => ownerOfPlayer(p) === u.id);
    const evs = [...(evByUser.get(u.id) ?? []), ...vs.flatMap((v) => evByVisitor.get(v.id) ?? []), ...myPlayers.flatMap((p) => evByPlayer.get(p.chatId) ?? [])];
    const views = vs.reduce((n, v) => n + v.views, 0);
    const myBookings = bookings.filter((b) => b.userId === u.id);
    const solved = solvedBy((a) => a.userId === u.id || vs.some((v) => v.id === a.visitorId));
    const times = [u.createdAt.getTime(), ...vs.map((v) => v.lastSeen.getTime()), ...myPlayers.map((p) => p.lastSeen.getTime()), ...evs.map((e) => e.createdAt.getTime())];
    const first = vs.sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime())[0];
    const source = first?.source ?? (myPlayers[0] ? (myPlayers[0].platform === 'max' ? 'bot_max' : 'bot_telegram') : u.telegramId ? 'telegram' : u.vkId ? 'vk' : 'direct');
    const isStudent = students.has(u.id);
    people.push({
      kind: 'user',
      id: u.id,
      name: u.name,
      contact: u.email ?? u.phone ?? null,
      role: u.role,
      channels: [u.email && 'почта', u.telegramId && 'Telegram', u.maxId && 'MAX', u.vkId && 'ВК'].filter(Boolean) as string[],
      chats: [u.telegramId && `tg:${u.telegramId}`, u.maxId && `max:${u.maxId}`].filter(Boolean) as string[],
      source,
      sourceLabel: SOURCE_LABEL[source] ?? source,
      firstSeen: new Date(Math.min(u.createdAt.getTime(), first?.firstSeen.getTime() ?? Infinity)).toISOString(),
      lastSeen: new Date(Math.max(...times)).toISOString(),
      views,
      solved,
      botActions: myPlayers.length ? evs.filter((e) => e.type.startsWith('bot_')).length : 0,
      bookings: myBookings.length,
      lastBookingStatus: myBookings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.status ?? null,
      isStudent,
      stage: u.role !== 'STUDENT' ? (u.role === 'ADMIN' ? 'Администратор' : u.role === 'PARENT' ? 'Родитель' : 'Преподаватель') : stageOf(isStudent, myBookings.length, solved, views),
      interests: interestsFrom(evs.map((e) => e.path)),
    });
  }

  for (const p of players) {
    if (ownerOfPlayer(p)) continue;
    const evs = evByPlayer.get(p.chatId) ?? [];
    const myBookings = bookings.filter((b) => b.contact.includes(p.username ? `@${p.username}` : '\u0000'));
    const bookedInBot = evs.filter((e) => e.type === 'booking').length;
    // задача дня тоже пишется в попытки, поэтому берём большее, а не сумму
    const solved = Math.max(solvedBy((a) => a.playerId === p.chatId), p.dailySolved);
    people.push({
      kind: 'player',
      id: p.chatId,
      name: [p.firstName, p.lastName].filter(Boolean).join(' '),
      contact: p.username ? `@${p.username}` : null,
      role: null,
      channels: [p.platform === 'max' ? 'MAX' : 'Telegram'],
      chats: [p.platform === 'max' ? p.chatId : `tg:${p.chatId}`],
      source: p.platform === 'max' ? 'bot_max' : 'bot_telegram',
      sourceLabel: SOURCE_LABEL[p.platform === 'max' ? 'bot_max' : 'bot_telegram']!,
      firstSeen: p.createdAt.toISOString(),
      lastSeen: p.lastSeen.toISOString(),
      views: 0,
      solved,
      botActions: evs.length,
      bookings: Math.max(myBookings.length, bookedInBot),
      lastBookingStatus: myBookings[0]?.status ?? null,
      isStudent: false,
      stage: stageOf(false, Math.max(myBookings.length, bookedInBot), solved, evs.length),
      interests: interestsFrom(evs.map((e) => e.path)),
    });
  }

  for (const v of visitors) {
    if (v.userId) continue;
    const evs = evByVisitor.get(v.id) ?? [];
    const solved = solvedBy((a) => a.visitorId === v.id);
    const booked = evs.some((e) => e.type === 'booking');
    people.push({
      kind: 'visitor',
      id: v.id,
      name: `Гость · ${v.platform === 'web' ? (v.device === 'mobile' ? 'телефон' : 'компьютер') : v.platform}`,
      contact: null,
      role: null,
      channels: [],
      chats: [],
      source: v.source,
      sourceLabel: SOURCE_LABEL[v.source] ?? v.source,
      firstSeen: v.firstSeen.toISOString(),
      lastSeen: v.lastSeen.toISOString(),
      views: v.views,
      solved,
      botActions: 0,
      bookings: booked ? 1 : 0,
      lastBookingStatus: null,
      isStudent: false,
      stage: stageOf(false, booked ? 1 : 0, solved, v.views),
      interests: interestsFrom(evs.map((e) => e.path)),
    });
  }

  return people.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

async function chatsOf(kind: string, id: string) {
  if (kind === 'player') {
    const p = await prisma.botPlayer.findUnique({ where: { chatId: id } });
    return p ? [p.platform === 'max' ? p.chatId : `tg:${p.chatId}`] : [];
  }
  if (kind === 'user') {
    const u = await prisma.user.findUnique({ where: { id } });
    return u ? ([u.telegramId && `tg:${u.telegramId}`, u.maxId && `max:${u.maxId}`].filter(Boolean) as string[]) : [];
  }
  return [];
}

const EVENT_TEXT: Record<string, string> = {
  visit: 'Зашёл',
  view: 'Открыл страницу',
  book_open: 'Открыл форму записи',
  booking: 'Оставил заявку',
  register: 'Зарегистрировался',
  login: 'Вошёл в кабинет',
  practice_solve: 'Решил задачу',
  practice_try: 'Попробовал задачу',
  diagnostic_start: 'Начал диагностику',
  diagnostic_done: 'Прошёл диагностику',
  bot_start: 'Запустил бота',
  bot_daily: 'Задача дня в боте',
  bot_quiz: 'Играл в «Радугу знаний»',
  bot_test: 'Прошёл тест «Какой ты цвет?»',
  bot_ask: 'Написал в школу из бота',
  bot_book: 'Записался через бота',
  bot_formulas: 'Смотрел шпаргалки',
  bot_lessons: 'Смотрел расписание в боте',
  admin_message: 'Школа написала сообщение',
  miniapp_open: 'Открыл мини-приложение',
  cta: 'Нажал кнопку',
};

async function personCard(kind: string, id: string) {
  const people = await buildPeople();
  const person = people.find((p) => p.kind === kind && p.id === id);
  if (!person) return null;

  let visitorIds: string[] = [];
  let userId: string | null = null;
  let playerIds: string[] = [];
  let details: Record<string, unknown> = {};

  if (kind === 'user') {
    userId = id;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { group: { select: { name: true, slug: true } } } },
        bookings: { include: { course: { select: { title: true } } }, orderBy: { createdAt: 'desc' } },
        tickets: { select: { id: true, subject: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!user) return null;
    visitorIds = (await prisma.visitor.findMany({ where: { userId: id }, select: { id: true } })).map((v) => v.id);
    playerIds = [user.telegramId, user.maxId && `max:${user.maxId}`].filter(Boolean) as string[];
    const lessons = await prisma.lesson.findMany({
      where: { OR: [{ studentId: id }, { group: { members: { some: { userId: id } } } }] },
      include: { teacher: { select: { user: { select: { name: true } } } } },
      orderBy: { startsAt: 'desc' },
      take: 30,
    });
    details = {
      email: user.email,
      phone: user.phone,
      role: user.role,
      groups: user.memberships.map((m) => m.group),
      bookings: user.bookings,
      tickets: user.tickets,
      lessons: lessons.map((l) => ({ id: l.id, title: l.title, startsAt: l.startsAt, status: l.status, teacher: l.teacher.user.name })),
    };
  } else if (kind === 'player') {
    playerIds = [id];
    const p = await prisma.botPlayer.findUnique({ where: { chatId: id } });
    details = { platform: p?.platform, username: p?.username, rainbows: p?.rainbows, streak: p?.streak, dailyStreak: p?.dailyStreak, dailySolved: p?.dailySolved, invited: p?.invited, colorTest: p?.colorTest };
  } else {
    visitorIds = [id];
  }
  const visitors = visitorIds.length ? await prisma.visitor.findMany({ where: { id: { in: visitorIds } } }) : [];

  const events = await prisma.event.findMany({
    where: {
      OR: [
        ...(visitorIds.length ? [{ visitorId: { in: visitorIds } }] : []),
        ...(userId ? [{ userId }] : []),
        ...(playerIds.length ? [{ playerId: { in: playerIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });

  // склеиваем подряд идущие одинаковые события, чтобы лента читалась
  const timeline: { at: string; type: string; text: string; detail: string | null; count: number }[] = [];
  for (const e of events) {
    const text = EVENT_TEXT[e.type] ?? e.type;
    const detail = e.type === 'view' ? pageLabel(normalizePath(e.path ?? '/')) + (e.path && e.path !== '/' ? ` · ${e.path}` : '') : (e.label ?? e.path ?? null);
    const last = timeline[timeline.length - 1];
    if (last && last.type === e.type && last.detail === detail && new Date(last.at).getTime() - e.createdAt.getTime() < 3_600_000) {
      last.count++;
      continue;
    }
    timeline.push({ at: e.createdAt.toISOString(), type: e.type, text, detail, count: 1 });
  }

  return {
    person,
    details,
    visitors: visitors.map((v) => ({ id: v.id, platform: v.platform, device: v.device, source: SOURCE_LABEL[v.source] ?? v.source, referrer: v.referrer, utm: [v.utmSource, v.utmMedium, v.utmCampaign].filter(Boolean).join(' / ') || null, landing: v.landing, visits: v.visits, views: v.views, firstSeen: v.firstSeen, lastSeen: v.lastSeen })),
    timeline: timeline.slice(0, 150),
    canMessage: person.chats.length > 0,
  };
}
