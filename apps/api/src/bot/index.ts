import type { FastifyBaseLogger } from 'fastify';
import type { Booking, BotPlayer, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { esc, telegram, type InlineButton, type Telegram, type TgMessage, type TgUser, type TgUpdate } from './telegram.js';
import { ALL_COLORS, COLORS, COLOR_TEST } from './quiz.js';

// Telegram-бот школы. Работает в том же процессе, что и API, через long polling.
// Включается, если задан TELEGRAM_BOT_TOKEN (и BOT_POLLING не равен 0).

const DAILY_QUESTIONS = 3;
const TZ = 'Europe/Moscow';

let tg: Telegram | null = null;
let botUsername: string | null = null;
let log: FastifyBaseLogger;
let webAppUrl = '';

export const getBotUsername = () => botUsername;

// ─── состояние диалогов (в памяти: после перезапуска диалог просто начинается заново) ───

type Flow =
  | { kind: 'book'; courseId?: string; courseTitle?: string; format?: 'INDIVIDUAL' | 'GROUP' }
  | { kind: 'ask' };
const flows = new Map<string, Flow>();
const quizPending = new Map<string, { color: number; qi: number }>();
const testScores = new Map<string, Record<string, number>>();

// ─── помощники ───

const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const when = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
const app = (path = '') => ({ web_app: { url: `${webAppUrl}${path}` } });
const cb = (text: string, data: string): InlineButton => ({ text, callback_data: data });
const menuButton = [cb('↩️ В меню', 'menu')];

function rainbowBar(colors: number) {
  return COLORS.map((c, i) => (colors & (1 << i) ? c.emoji : '⚪️')).join('');
}

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function upsertPlayer(from: TgUser) {
  return prisma.botPlayer.upsert({
    where: { chatId: String(from.id) },
    update: { firstName: from.first_name, username: from.username ?? null },
    create: { chatId: String(from.id), firstName: from.first_name, username: from.username ?? null },
  });
}

const linkedUser = (chatId: string) => prisma.user.findUnique({ where: { telegramId: chatId }, include: { teacher: true } });

async function adminChats() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', telegramId: { not: null } }, select: { telegramId: true } });
  return admins.map((a) => a.telegramId!);
}

// ─── меню ───

function mainMenu() {
  const rows: InlineButton[][] = [];
  if (webAppUrl) rows.push([{ text: '🚀 Открыть Спектр', ...app() }]);
  rows.push([cb('📅 Мои занятия', 'lessons'), cb('✍️ Записаться', 'book')]);
  rows.push([cb('🌈 Радуга знаний', 'quiz'), cb('🎨 Какой ты цвет?', 'test')]);
  rows.push([cb('💬 Вопрос школе', 'ask'), cb('🎁 Позвать друга', 'invite')]);
  return { inline_keyboard: rows };
}

async function sendMenu(chatId: string, player: BotPlayer, fresh: boolean) {
  const hello = fresh
    ? `Привет, ${esc(player.firstName)}! Это «Спектр» — онлайн-школа занятий с репетитором 🌈\n\n` +
      'Что умею:\n' +
      '📅 показываю расписание и <b>за 15 минут до урока присылаю ссылку</b>\n' +
      '✍️ записываю на занятие за минуту\n' +
      '🌈 «Радуга знаний»: три вопроса в день, собери все семь цветов\n' +
      '🎨 угадываю по трём вопросам, какой предмет тебе подходит\n' +
      '💬 передаю вопросы школе и приношу ответ'
    : `${rainbowBar(player.colors)}\nЧем займёмся?`;
  await tg!.send(chatId, hello, mainMenu());
}

// ─── занятия ───

async function showLessons(chatId: string) {
  const user = await linkedUser(chatId);
  if (!user) {
    const rows: InlineButton[][] = [];
    if (webAppUrl) rows.push([{ text: '🚀 Открыть Спектр', ...app('/app') }]);
    rows.push(menuButton);
    await tg!.send(
      chatId,
      'Пока не знаю, кто вы в школе 🙂\n\nОткройте Спектр кнопкой ниже — войдёте через Telegram автоматически.\nЕсли аккаунт уже есть на сайте, привяжите Telegram: <i>Кабинет → Профиль → Привязать Telegram</i>.',
      { inline_keyboard: rows },
    );
    return;
  }

  const from = new Date(Date.now() - 60 * 60_000);
  const to = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const lessons = await prisma.lesson.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { gte: from, lte: to },
      OR: user.teacher
        ? [{ teacherId: user.teacher.id }]
        : [{ studentId: user.id }, { group: { members: { some: { userId: user.id } } } }],
    },
    include: { group: true, teacher: { include: { user: true } } },
    orderBy: { startsAt: 'asc' },
    take: 10,
  });

  if (!lessons.length) {
    await tg!.send(chatId, 'На ближайшую неделю занятий нет.\nХотите записаться?', {
      inline_keyboard: [[cb('✍️ Записаться', 'book')], menuButton],
    });
    return;
  }

  const now = Date.now();
  const lines = lessons.map((l) => {
    const end = l.startsAt.getTime() + l.durationMin * 60_000;
    const live = l.startsAt.getTime() <= now && now < end;
    const who = user.teacher ? (l.group ? l.group.name : 'индивидуально') : l.teacher.user.name;
    return `${live ? '🟢 <b>идёт сейчас</b>' : '▫️'} <b>${when(l.startsAt)}</b>\n${esc(l.title)} · ${esc(who)}`;
  });
  const rows: InlineButton[][] = [];
  for (const l of lessons) {
    const soon = l.startsAt.getTime() - now <= 15 * 60_000 && now < l.startsAt.getTime() + l.durationMin * 60_000;
    if (soon && l.link) rows.push([{ text: `🎥 Подключиться: ${time(l.startsAt)}`, url: l.link }]);
  }
  if (webAppUrl) rows.push([{ text: '📅 Всё расписание', ...app(user.teacher ? '/teach' : '/app/schedule') }]);
  rows.push(menuButton);
  await tg!.send(chatId, `Ближайшие занятия:\n\n${lines.join('\n\n')}\n\n<i>Ссылка на урок придёт сюда за 15 минут до начала.</i>`, { inline_keyboard: rows });
}

// ─── запись на занятие ───

async function startBooking(chatId: string) {
  flows.set(chatId, { kind: 'book' });
  const courses = await prisma.course.findMany({ where: { published: true }, orderBy: { createdAt: 'asc' }, take: 12 });
  const rows = courses.map((c) => [cb(`${COLORS[c.hue % COLORS.length]!.emoji} ${c.title}`, `bc:${c.id}`)]);
  rows.push([cb('🤔 Пока не знаю', 'bc:none')]);
  await tg!.send(chatId, '✍️ <b>Запись на занятие</b>\n\nКакой предмет?', { inline_keyboard: rows });
}

async function bookingAskContact(chatId: string, from: TgUser) {
  const rows: { text: string; request_contact?: boolean }[][] = [[{ text: '📱 Отправить мой номер', request_contact: true }]];
  if (from.username) rows.push([{ text: `💬 Пишите мне в Telegram @${from.username}` }]);
  await tg!.send(chatId, 'Как с вами связаться? Нажмите кнопку или напишите телефон или почту сообщением.', {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

async function finishBooking(chatId: string, from: TgUser, contact: string) {
  const flow = flows.get(chatId);
  if (flow?.kind !== 'book') return;
  flows.delete(chatId);
  const user = await linkedUser(chatId);
  const booking = await prisma.booking.create({
    data: {
      name: user?.name ?? [from.first_name, from.last_name].filter(Boolean).join(' '),
      contact: contact.slice(0, 120),
      courseId: flow.courseId,
      format: flow.format,
      comment: 'Заявка из Telegram-бота',
      userId: user?.id,
    },
  });
  await tg!.send(chatId, '✅ Заявка отправлена! Администратор свяжется с вами и подберёт время.', { remove_keyboard: true });
  await tg!.send(chatId, 'Пока ждёте — сыграйте в «Радугу знаний» 🌈', { inline_keyboard: [[cb('🌈 Играть', 'quiz')], menuButton] });
  await notifyNewBooking(booking, flow.courseTitle);
}

/** Сообщить администраторам о новой заявке: из бота и с сайта. */
export async function notifyNewBooking(booking: Booking, courseTitle?: string) {
  if (!tg) return;
  try {
    const title = courseTitle ?? (booking.courseId ? (await prisma.course.findUnique({ where: { id: booking.courseId } }))?.title : undefined);
    const format = booking.format === 'GROUP' ? 'мини-группа' : booking.format === 'INDIVIDUAL' ? 'индивидуально' : null;
    const text =
      '🔔 <b>Новая заявка на занятие</b>\n\n' +
      `👤 ${esc(booking.name)}\n📞 ${esc(booking.contact)}\n` +
      (title ? `📚 ${esc(title)}\n` : '') +
      (format ? `👥 ${format}\n` : '') +
      (booking.preferredTime ? `🕒 ${esc(booking.preferredTime)}\n` : '') +
      (booking.comment ? `💬 ${esc(booking.comment)}\n` : '');
    const keyboard = webAppUrl ? { inline_keyboard: [[{ text: 'Открыть заявки', ...app('/admin/bookings') }]] } : undefined;
    for (const chat of await adminChats()) await tg.send(chat, text, keyboard).catch(() => {});
  } catch (err) {
    log.warn({ err }, 'бот: не удалось сообщить о заявке');
  }
}

// ─── «Радуга знаний» ───

/** Обновить серию дней и счётчик вопросов на сегодня. */
async function touchDay(player: BotPlayer) {
  const today = dayKey();
  if (player.lastDay === today) return player;
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60_000));
  const streak = player.lastDay === yesterday ? player.streak + 1 : 1;
  return prisma.botPlayer.update({
    where: { chatId: player.chatId },
    data: { lastDay: today, todayCount: 0, streak, bestStreak: Math.max(player.bestStreak, streak) },
  });
}

async function askQuestion(chatId: string, player: BotPlayer, messageId?: number) {
  player = await touchDay(player);
  if (player.todayCount >= DAILY_QUESTIONS && player.bonus <= 0) {
    const text =
      `${rainbowBar(player.colors)}\n\nНа сегодня вопросы закончились — возвращайтесь завтра, чтобы не прервать серию 🔥 ${player.streak}.\n\n` +
      '🎁 За каждого друга, который придёт по вашей ссылке, — дополнительный вопрос.';
    await tg!.send(chatId, text, { inline_keyboard: [[cb('🎁 Позвать друга', 'invite'), cb('🏆 Зал славы', 'top')], menuButton] });
    return;
  }
  // неотвеченный вопрос показываем снова, чтобы сложный нельзя было пропустить
  let pending = quizPending.get(chatId);
  if (!pending) {
    const missing = COLORS.map((_, i) => i).filter((i) => !(player.colors & (1 << i)));
    const color = missing[Math.floor(Math.random() * missing.length)]!;
    pending = { color, qi: Math.floor(Math.random() * COLORS[color]!.questions.length) };
  }
  const { color, qi } = pending;
  const c = COLORS[color]!;
  const q = c.questions[qi]!;
  quizPending.set(chatId, pending);
  const order = shuffle(q.options.map((_, i) => i));
  const left = Math.max(0, DAILY_QUESTIONS - player.todayCount) + player.bonus;
  const text = `${rainbowBar(player.colors)}\n\n${c.emoji} <b>${c.subject}</b> · осталось вопросов сегодня: ${left}\n\n${esc(q.q)}`;
  const keyboard = { inline_keyboard: order.map((i) => [cb(q.options[i]!, `qa:${color}:${qi}:${i}`)]) };
  if (messageId) await tg!.edit(chatId, messageId, text, keyboard);
  else await tg!.send(chatId, text, keyboard);
}

async function answerQuestion(chatId: string, from: TgUser, data: string, callbackId: string, message?: TgMessage) {
  const [, colorS, qiS, optS] = data.split(':');
  const color = Number(colorS);
  const qi = Number(qiS);
  const pending = quizPending.get(chatId);
  if (!pending || pending.color !== color || pending.qi !== qi) {
    await tg!.answer(callbackId, 'Этот вопрос уже закрыт. Нажмите «Радуга знаний», чтобы получить новый.');
    return;
  }
  quizPending.delete(chatId);
  let player = await touchDay(await upsertPlayer(from));
  const useBonus = player.todayCount >= DAILY_QUESTIONS;
  const c = COLORS[color]!;
  const q = c.questions[qi]!;
  const right = Number(optS) === 0;

  let colors = player.colors;
  let rainbows = player.rainbows;
  let completed = false;
  if (right) {
    colors |= 1 << color;
    if (colors === ALL_COLORS) {
      completed = true;
      rainbows += 1;
      colors = 0;
    }
  }
  player = await prisma.botPlayer.update({
    where: { chatId },
    data: { colors, rainbows, todayCount: { increment: 1 }, bonus: useBonus ? { decrement: 1 } : undefined },
  });
  await tg!.answer(callbackId, right ? `Верно! ${c.emoji}` : 'Мимо 🙈');

  let text = right
    ? `✅ <b>Верно!</b> ${c.emoji} ${c.name} цвет ваш.\n\n💡 ${esc(q.fact)}`
    : `❌ Правильный ответ: <b>${esc(q.options[0]!)}</b>\n\n💡 ${esc(q.fact)}`;
  if (completed) {
    text +=
      `\n\n🌈🌈🌈 <b>Радуга собрана!</b> ${COLORS.map((x) => x.emoji).join('')}\n` +
      `Это уже ${rainbows}-я. Вы в зале славы — а мы начинаем новую радугу.`;
  } else {
    text += `\n\n${rainbowBar(player.colors)}`;
  }
  const rows: InlineButton[][] = [[cb('➡️ Следующий вопрос', 'quiz'), cb('🏆 Зал славы', 'top')]];
  if (!right && c.bookable) rows.push([cb(`✍️ Разобрать ${c.subject.toLowerCase()} с репетитором`, 'book')]);
  rows.push(menuButton);
  if (message) await tg!.edit(chatId, message.message_id, text, { inline_keyboard: rows });
  else await tg!.send(chatId, text, { inline_keyboard: rows });
}

async function showTop(chatId: string) {
  const top = await prisma.botPlayer.findMany({
    where: { OR: [{ rainbows: { gt: 0 } }, { bestStreak: { gt: 1 } }] },
    orderBy: [{ rainbows: 'desc' }, { bestStreak: 'desc' }, { createdAt: 'asc' }],
    take: 10,
  });
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((p, i) => `${medals[i] ?? `${i + 1}.`} ${esc(p.firstName)} — 🌈 ${p.rainbows} · 🔥 ${p.bestStreak}`);
  const me = await prisma.botPlayer.findUnique({ where: { chatId } });
  await tg!.send(
    chatId,
    `🏆 <b>Зал славы «Радуги знаний»</b>\n🌈 — собранные радуги, 🔥 — лучшая серия дней\n\n${lines.join('\n') || 'Пока пусто — станьте первым!'}` +
      (me ? `\n\nВы: 🌈 ${me.rainbows} · 🔥 ${me.streak} сейчас\n${rainbowBar(me.colors)}` : ''),
    { inline_keyboard: [[cb('🌈 Играть', 'quiz')], menuButton] },
  );
}

// ─── «Какой ты цвет?» ───

async function testStep(chatId: string, step: number, messageId?: number) {
  const s = COLOR_TEST[step]!;
  const text = `🎨 <b>Какой ты цвет спектра?</b> ${step + 1}/${COLOR_TEST.length}\n\n${s.q}`;
  const keyboard = { inline_keyboard: s.answers.map((a, i) => [cb(a.text, `ta:${step}:${i}`)]) };
  if (messageId) await tg!.edit(chatId, messageId, text, keyboard);
  else await tg!.send(chatId, text, keyboard);
}

async function testAnswer(chatId: string, data: string, callbackId: string, message?: TgMessage) {
  const [, stepS, ansS] = data.split(':');
  const step = Number(stepS);
  const scores = testScores.get(chatId);
  if (!scores) {
    await tg!.answer(callbackId, 'Тест устарел, начните заново');
    return;
  }
  await tg!.answer(callbackId);
  for (const slug of COLOR_TEST[step]?.answers[Number(ansS)]?.slugs ?? []) scores[slug] = (scores[slug] ?? 0) + 1;
  if (step + 1 < COLOR_TEST.length) return testStep(chatId, step + 1, message?.message_id);

  testScores.delete(chatId);
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'math';
  const course = await prisma.course.findFirst({ where: { slug: best, published: true } });
  const color = COLORS[(course?.hue ?? 0) % COLORS.length]!;
  await prisma.botPlayer.update({ where: { chatId }, data: { colorTest: best } }).catch(() => {});
  const text = course
    ? `${color.emoji} Вы — <b>${color.name}</b>!\n\nВаш предмет: <b>${esc(course.title)}</b>\n${esc(course.summary)}\n\n<i>Отправьте тест друзьям — интересно, какого цвета они.</i>`
    : `${color.emoji} Вы — <b>${color.name}</b>! Под этот цвет у нас пока нет предмета, но можно подобрать вместе с администратором.`;
  const rows: InlineButton[][] = [];
  if (course) rows.push([cb(`✍️ Записаться: ${course.title}`, `bc:${course.id}`)]);
  if (course && webAppUrl) rows.push([{ text: '📖 Подробнее о предмете', ...app(`/subjects/${course.slug}`) }]);
  rows.push([cb('🔁 Пройти ещё раз', 'test'), cb('🎁 Позвать друга', 'invite')]);
  rows.push(menuButton);
  if (message) await tg!.edit(chatId, message.message_id, text, { inline_keyboard: rows });
  else await tg!.send(chatId, text, { inline_keyboard: rows });
}

// ─── приглашения ───

async function showInvite(chatId: string, player: BotPlayer) {
  const link = `https://t.me/${botUsername}?start=r_${chatId}`;
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Собираю радугу знаний в «Спектре» 🌈 Попробуй: три вопроса в день')}`;
  await tg!.send(
    chatId,
    `🎁 <b>Позвать друга</b>\n\nЗа каждого друга, который впервые запустит бота по вашей ссылке, — <b>+1 вопрос</b> в «Радуге знаний».\n\nВаша ссылка:\n${link}\n\nУже пришли: ${player.invited}`,
    { inline_keyboard: [[{ text: '📤 Поделиться', url: share }], menuButton] },
  );
}

// ─── вопросы школе ───

async function relayQuestion(chatId: string, from: TgUser, msg: TgMessage) {
  flows.delete(chatId);
  const admins = await adminChats();
  if (!admins.length) {
    const rows: InlineButton[][] = webAppUrl ? [[{ text: '💬 Открыть поддержку', ...app('/app/support') }]] : [];
    rows.push(menuButton);
    await tg!.send(chatId, 'Сейчас передать вопрос не получится. Напишите в поддержку в приложении — там отвечают преподаватели и администратор.', { inline_keyboard: rows });
    return;
  }
  const user = await linkedUser(chatId);
  const who = `${esc([from.first_name, from.last_name].filter(Boolean).join(' '))}${from.username ? ` @${from.username}` : ''}${user ? ` · ${esc(user.email ?? '')}` : ''}`;
  for (const admin of admins) {
    const sent = await tg!.send(admin, `💬 <b>Вопрос из бота</b>\nот ${who}\n\n${esc(msg.text ?? '')}\n\n<i>Ответьте на это сообщение (reply) — ответ уйдёт ученику.</i>`).catch(() => null);
    if (sent) await prisma.botRelay.create({ data: { adminChatId: admin, adminMessageId: sent.message_id, userChatId: chatId } });
  }
  await tg!.send(chatId, '📨 Вопрос передан школе. Ответ придёт сюда же.', { inline_keyboard: [menuButton] });
}

async function relayAnswer(chatId: string, msg: TgMessage) {
  const relay = await prisma.botRelay.findUnique({
    where: { adminChatId_adminMessageId: { adminChatId: chatId, adminMessageId: msg.reply_to_message!.message_id } },
  });
  if (!relay) return false;
  await tg!.send(relay.userChatId, `💬 <b>Ответ школы</b>\n\n${esc(msg.text ?? '')}`, { inline_keyboard: [[cb('Задать ещё вопрос', 'ask')]] });
  await tg!.send(chatId, '✅ Ответ отправлен ученику.');
  return true;
}

// ─── привязка аккаунта с сайта ───

async function linkAccount(chatId: string, code: string) {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    await tg!.send(chatId, 'Ссылка для привязки устарела. Нажмите «Привязать Telegram» в профиле на сайте ещё раз.');
    return;
  }
  await prisma.telegramLinkCode.delete({ where: { code } });
  const other = await prisma.user.findUnique({ where: { telegramId: chatId } });
  if (other && other.id !== row.userId) {
    if (other.email || other.passwordHash) {
      await tg!.send(chatId, `Этот Telegram уже привязан к другому аккаунту (${esc(other.email ?? other.name)}). Напишите в поддержку, если нужно перенести.`);
      return;
    }
    // аккаунт, созданный автоматически при входе из мини-приложения: освобождаем Telegram
    await prisma.user.update({ where: { id: other.id }, data: { telegramId: null } });
  }
  const user: User = await prisma.user.update({ where: { id: row.userId }, data: { telegramId: chatId } });
  await tg!.send(
    chatId,
    `✅ Telegram привязан к аккаунту <b>${esc(user.name)}</b>.\nТеперь здесь будет ваше расписание и напоминания за 15 минут до урока.` +
      (user.role === 'ADMIN' ? '\n\n🔔 Вы администратор: сюда будут приходить новые заявки и вопросы учеников.' : ''),
    mainMenu(),
  );
}

// ─── обработка обновлений ───

async function onMessage(msg: TgMessage) {
  if (msg.chat.type !== 'private' || !msg.from) return;
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim() ?? '';

  if (text.startsWith('/start')) {
    const payload = text.split(' ')[1] ?? '';
    const existed = await prisma.botPlayer.findUnique({ where: { chatId } });
    const player = await upsertPlayer(msg.from);
    flows.delete(chatId);
    if (!existed && payload.startsWith('r_') && payload.slice(2) !== chatId) {
      const inviter = await prisma.botPlayer.findUnique({ where: { chatId: payload.slice(2) } });
      if (inviter) {
        await prisma.botPlayer.update({ where: { chatId }, data: { invitedBy: inviter.chatId } });
        await prisma.botPlayer.update({ where: { chatId: inviter.chatId }, data: { invited: { increment: 1 }, bonus: { increment: 1 } } });
        await tg!.send(inviter.chatId, `🎁 ${esc(msg.from.first_name)} пришёл(а) по вашей ссылке — +1 вопрос в «Радуге знаний»!`, { inline_keyboard: [[cb('🌈 Играть', 'quiz')]] }).catch(() => {});
      }
    }
    if (payload.startsWith('l_')) return linkAccount(chatId, payload.slice(2));
    await sendMenu(chatId, player, !existed);
    if (payload === 'book') return startBooking(chatId);
    if (payload === 'quiz') return askQuestion(chatId, player);
    if (payload === 'test') {
      testScores.set(chatId, {});
      return testStep(chatId, 0);
    }
    return;
  }

  if (msg.reply_to_message && (await relayAnswer(chatId, msg))) return;

  const player = await upsertPlayer(msg.from);
  const command = text.split(/[ @]/)[0];
  switch (command) {
    case '/menu':
      return sendMenu(chatId, player, false);
    case '/lessons':
      return showLessons(chatId);
    case '/book':
      return startBooking(chatId);
    case '/quiz':
      return askQuestion(chatId, player);
    case '/top':
      return showTop(chatId);
    case '/color':
      testScores.set(chatId, {});
      return testStep(chatId, 0);
    case '/ask':
      flows.set(chatId, { kind: 'ask' });
      return void tg!.send(chatId, '💬 Напишите вопрос одним сообщением — передам администратору школы.');
    case '/invite':
      return showInvite(chatId, player);
    case '/reminders': {
      const updated = await prisma.botPlayer.update({ where: { chatId }, data: { reminders: !player.reminders } });
      return void tg!.send(chatId, updated.reminders ? '🔔 Напоминания о занятиях включены.' : '🔕 Напоминания о занятиях выключены. Включить снова: /reminders');
    }
    case '/stats':
      return showStats(chatId);
  }

  const flow = flows.get(chatId);
  if (flow?.kind === 'book' && flow.format) {
    if (msg.contact) return finishBooking(chatId, msg.from, msg.contact.phone_number);
    if (text.startsWith('💬 Пишите мне в Telegram')) return finishBooking(chatId, msg.from, `Telegram @${msg.from.username}`);
    if (text.length >= 3) return finishBooking(chatId, msg.from, text);
  }
  if (flow?.kind === 'ask' && text) return relayQuestion(chatId, msg.from, msg);

  await sendMenu(chatId, player, false);
}

async function onCallback(q: NonNullable<TgUpdate['callback_query']>) {
  const chatId = String(q.from.id);
  const data = q.data ?? '';
  const player = await upsertPlayer(q.from);

  if (data.startsWith('qa:')) return answerQuestion(chatId, q.from, data, q.id, q.message);
  if (data.startsWith('ta:')) return testAnswer(chatId, data, q.id, q.message);
  await tg!.answer(q.id);

  if (data.startsWith('bc:')) {
    const id = data.slice(3);
    const course = id === 'none' ? null : await prisma.course.findUnique({ where: { id } });
    flows.set(chatId, { kind: 'book', courseId: course?.id, courseTitle: course?.title });
    await tg!.send(chatId, `${course ? `📚 ${esc(course.title)}\n\n` : ''}Как удобнее заниматься?`, {
      inline_keyboard: [[cb('👤 Индивидуально', 'bf:INDIVIDUAL'), cb('👥 Мини-группа до 6', 'bf:GROUP')]],
    });
    return;
  }
  if (data.startsWith('bf:')) {
    const flow = flows.get(chatId);
    if (flow?.kind !== 'book') return startBooking(chatId);
    flow.format = data.slice(3) === 'GROUP' ? 'GROUP' : 'INDIVIDUAL';
    return bookingAskContact(chatId, q.from);
  }

  switch (data) {
    case 'menu':
      return sendMenu(chatId, player, false);
    case 'lessons':
      return showLessons(chatId);
    case 'book':
      return startBooking(chatId);
    case 'quiz':
      return askQuestion(chatId, player);
    case 'top':
      return showTop(chatId);
    case 'test':
      testScores.set(chatId, {});
      return testStep(chatId, 0);
    case 'ask':
      flows.set(chatId, { kind: 'ask' });
      return void tg!.send(chatId, '💬 Напишите вопрос одним сообщением — передам администратору школы.');
    case 'invite':
      return showInvite(chatId, player);
  }
}

async function showStats(chatId: string) {
  const user = await linkedUser(chatId);
  if (user?.role !== 'ADMIN') return void tg!.send(chatId, 'Эта команда только для администратора.');
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const [players, newPlayers, rainbows, bookings, newBookings] = await Promise.all([
    prisma.botPlayer.count(),
    prisma.botPlayer.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.botPlayer.aggregate({ _sum: { rainbows: true } }),
    prisma.booking.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.booking.count({ where: { status: 'NEW' } }),
  ]);
  await tg!.send(
    chatId,
    `📊 <b>Бот за неделю</b>\n\n👥 Запускали бота: ${players} (новых за 7 дней: ${newPlayers})\n🌈 Собрано радуг: ${rainbows._sum.rainbows ?? 0}\n✍️ Заявок за 7 дней: ${bookings}\n🆕 Необработанных заявок: ${newBookings}`,
  );
}

// ─── напоминания за 15 минут ───

async function sendReminders() {
  const now = Date.now();
  const lessons = await prisma.lesson.findMany({
    where: { status: 'SCHEDULED', startsAt: { gte: new Date(now + 60_000), lte: new Date(now + 16 * 60_000) } },
    include: { group: { include: { members: { include: { user: true } } } }, student: true, teacher: { include: { user: true } } },
  });
  for (const l of lessons) {
    const people = [...(l.group?.members.map((m) => m.user) ?? []), ...(l.student ? [l.student] : []), l.teacher.user];
    for (const p of people) {
      if (!p.telegramId) continue;
      const player = await prisma.botPlayer.findUnique({ where: { chatId: p.telegramId } });
      if (!player?.reminders) continue;
      const fresh = await prisma.botReminder.create({ data: { lessonId: l.id, chatId: p.telegramId } }).catch(() => null);
      if (!fresh) continue;
      const minutes = Math.max(1, Math.round((l.startsAt.getTime() - now) / 60_000));
      const isTeacher = p.id === l.teacher.userId;
      const rows: InlineButton[][] = [];
      if (l.link) rows.push([{ text: '🎥 Подключиться к уроку', url: l.link }]);
      if (webAppUrl) rows.push([{ text: 'Открыть занятие', ...app(isTeacher ? '/teach' : '/app/schedule') }]);
      const text =
        `⏰ Через ${minutes} мин: <b>${esc(l.title)}</b> в ${time(l.startsAt)}\n` +
        (isTeacher ? (l.group ? `Группа: ${esc(l.group.name)}` : `Ученик: ${esc(l.student?.name ?? '')}`) : `Преподаватель: ${esc(l.teacher.user.name)}`) +
        (l.link ? '' : isTeacher ? '\n\n⚠️ Ссылка на урок ещё не добавлена — добавьте её в кабинете.' : '\n\nСсылку преподаватель пришлёт в кабинет.');
      await tg!.send(p.telegramId, text, rows.length ? { inline_keyboard: rows } : undefined).catch(() => {});
    }
  }
}

// ─── запуск ───

async function setup() {
  const me = await tg!.call<{ username: string }>('getMe');
  botUsername = me.username;
  await tg!.call('deleteWebhook', {});
  await tg!.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'lessons', description: 'Мои занятия' },
      { command: 'book', description: 'Записаться на занятие' },
      { command: 'quiz', description: 'Радуга знаний: вопрос дня' },
      { command: 'color', description: 'Какой ты цвет спектра?' },
      { command: 'top', description: 'Зал славы' },
      { command: 'ask', description: 'Вопрос школе' },
      { command: 'invite', description: 'Позвать друга' },
      { command: 'reminders', description: 'Вкл/выкл напоминания о занятиях' },
    ],
  });
  if (webAppUrl) {
    await tg!.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Спектр', web_app: { url: webAppUrl } } });
  }
  await tg!.call('setMyShortDescription', { short_description: 'Онлайн-школа «Спектр»: расписание, запись на занятия и «Радуга знаний» 🌈' }).catch(() => {});
  await tg!.call('setMyDescription', {
    description:
      'Онлайн-школа занятий с репетитором «Спектр».\n\n📅 Расписание и ссылка на урок за 15 минут\n✍️ Запись на занятие за минуту\n🌈 «Радуга знаний» — три вопроса в день\n🎨 Тест «Какой ты цвет спектра?»',
  }).catch(() => {});
  log.info(`бот @${botUsername} запущен, мини-приложение: ${webAppUrl || 'не задано'}`);
}

export function startBot(logger: FastifyBaseLogger) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || process.env.BOT_POLLING === '0') return;
  log = logger;
  tg = telegram(token);
  webAppUrl = (process.env.TELEGRAM_WEBAPP_URL || (process.env.WEB_ORIGIN ?? '').split(',').map((s) => s.trim()).find((s) => s.startsWith('https://')) || '').replace(/\/$/, '');

  void (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        await setup();
        break;
      } catch (err) {
        log.error({ err }, 'бот: не удалось запуститься, повтор через минуту');
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }

    setInterval(() => sendReminders().catch((err) => log.error({ err }, 'бот: напоминания')), 60_000);

    let offset = 0;
    for (;;) {
      try {
        const updates = await tg!.call<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, 35_000);
        for (const u of updates) {
          offset = u.update_id + 1;
          try {
            if (u.message) await onMessage(u.message);
            else if (u.callback_query) await onCallback(u.callback_query);
          } catch (err) {
            log.error({ err }, 'бот: ошибка обработки');
          }
        }
      } catch (err) {
        log.warn({ err }, 'бот: getUpdates не ответил');
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  })();
}
