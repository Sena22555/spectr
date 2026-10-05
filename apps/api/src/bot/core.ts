import type { FastifyBaseLogger } from 'fastify';
import type { Booking, BotPlayer, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { track } from '../lib/track.js';
import { fmtDate, fmtTime, fmtWhen, schoolDay, schoolHour, schoolWeekday } from '../lib/time.js';
import { progressFor, schoolFor } from '../lib/progress.js';
import { parseTasks, statuses } from '../lib/homework.js';
import { childIdsOf, childSummary, parentIdsOf } from '../lib/family.js';
import { UNITS as EN_UNITS } from '../english/content.js';
import { PRACTICE, answerText, checkAnswer, dailyProblem, findProblem, texToPlain } from '../practice/content.js';
import { ALL_COLORS, COLORS, COLOR_TEST } from './quiz.js';
import { GENERATORS, checkGen, findGenerator, genAnswerText, genProblemId, makeProblem, parseGenId } from '../practice/generators.js';
import { randomInt } from 'node:crypto';
import type { Adapter, Btn, Inbound, Platform, Screen } from './types.js';

// Ядро ботов «Спектра»: одна логика для Telegram и MAX.
// Навигация по кнопкам редактирует один и тот же «экран», новые сообщения приходят только как уведомления.

const DAILY_QUESTIONS = 3;
const adapters = new Map<Platform, Adapter>();
let log: FastifyBaseLogger;

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const cb = (text: string, data: string): Btn => ({ text, data });
const MENU: Btn[] = [cb('↩️ Меню', 'menu')];

export function registerAdapter(a: Adapter, logger: FastifyBaseLogger) {
  adapters.set(a.platform, a);
  log = logger;
}
export const getAdapter = (p: Platform) => adapters.get(p);
export const anyBot = () => adapters.size > 0;

// ─── состояние диалогов в памяти ───

type Flow =
  | { kind: 'book'; courseId?: string; courseTitle?: string; format?: 'INDIVIDUAL' | 'GROUP'; prompt?: string }
  | { kind: 'ask' }
  | { kind: 'daily'; problemId: string }
  | { kind: 'admin_reply'; ticketId: string }
  | { kind: 'teacher_link'; lessonId: string }
  | { kind: 'train'; problemId: string; wrong: number };

const flows = new Map<string, Flow>();
const quizPending = new Map<string, { color: number; qi: number }>();
const testScores = new Map<string, Record<string, number>>();

// ─── игроки и аккаунты ───

async function upsertPlayer(m: Inbound) {
  return prisma.botPlayer.upsert({
    where: { chatId: m.chatId },
    update: { firstName: m.who.firstName, lastName: m.who.lastName ?? null, username: m.who.username ?? null, lastSeen: new Date() },
    create: { chatId: m.chatId, platform: m.platform, firstName: m.who.firstName, lastName: m.who.lastName ?? null, username: m.who.username ?? null },
  });
}

const rawId = (chatId: string) => chatId.replace(/^max:/, '');
const platformOf = (chatId: string): Platform => (chatId.startsWith('max:') ? 'max' : 'telegram');

async function linkedUser(chatId: string) {
  const where = platformOf(chatId) === 'max' ? { maxId: rawId(chatId) } : { telegramId: chatId };
  return prisma.user.findUnique({ where, include: { teacher: true } });
}

/** Аккаунт для игрока: если его нет — создаём, как это делает вход из мини-приложения. */
async function ensureUser(m: Inbound) {
  const existing = await linkedUser(m.chatId);
  if (existing) return existing;
  const name = [m.who.firstName, m.who.lastName].filter(Boolean).join(' ') || 'Ученик';
  return prisma.user.create({
    data: platformOf(m.chatId) === 'max' ? { name, maxId: rawId(m.chatId) } : { name, telegramId: m.chatId },
    include: { teacher: true },
  });
}

/** Куда писать человеку: его чаты в ботах. */
function chatsOfUser(u: Pick<User, 'telegramId' | 'maxId'>) {
  return [u.telegramId && adapters.has('telegram') ? u.telegramId : null, u.maxId && adapters.has('max') ? `max:${u.maxId}` : null].filter(Boolean) as string[];
}

async function adminChats() {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', OR: [{ telegramId: { not: null } }, { maxId: { not: null } }] } });
  return admins.flatMap(chatsOfUser);
}

// ─── вывод ───

/** Показать экран: нажатие кнопки — редактируем это сообщение, иначе — шлём новый экран и убираем старый. */
async function show(m: Inbound, player: BotPlayer, screen: Screen) {
  const a = adapters.get(m.platform)!;
  if (m.kind === 'callback' && m.messageId) {
    const ok = await a.edit(m.chatId, m.messageId, screen, m.callbackId);
    if (ok) {
      if (player.screenId && player.screenId !== m.messageId) void a.remove(m.chatId, player.screenId);
      if (player.screenId !== m.messageId) await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { screenId: m.messageId } });
      return;
    }
  }
  if (m.kind !== 'callback' && m.messageId) void a.remove(m.chatId, m.messageId);
  if (player.screenId) void a.remove(m.chatId, player.screenId);
  const id = await a.send(m.chatId, screen);
  await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { screenId: id } });
}

/** Уведомление новым сообщением (напоминания, ответы, заявки). */
async function sendTo(chatId: string, screen: Screen) {
  const a = adapters.get(platformOf(chatId));
  if (!a) return false;
  try {
    return Boolean(await a.send(chatId, screen));
  } catch (err) {
    log?.warn({ err }, 'бот: не удалось отправить уведомление');
    return false;
  }
}

/** Публичное: написать в чат «tg:<id>» или «max:<id>». */
export async function botSendTo(chat: string, text: string, rows: Btn[][] = []) {
  const chatId = chat.startsWith('tg:') ? chat.slice(3) : chat;
  return sendTo(chatId, { text, rows: rows.length ? rows : [[cb('Открыть меню', 'menu')]] });
}

/** Публичное: уведомить пользователя во всех его мессенджерах. */
export async function notifyUser(userId: string, text: string, button?: { app?: string; url?: string; label: string }) {
  if (!anyBot()) return false;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return false;
  const rows: Btn[][] = [];
  if (button?.app) rows.push([{ text: button.label, app: button.app }]);
  else if (button?.url) rows.push([{ text: button.label, url: button.url }]);
  rows.push([cb('Меню бота', 'menu')]);
  let ok = false;
  for (const chat of chatsOfUser(u)) ok = (await sendTo(chat, { text, rows })) || ok;
  return ok;
}

export async function notifyAdmins(text: string, rows: Btn[][]) {
  for (const chat of await adminChats()) await sendTo(chat, { text, rows });
}

// ─── главное меню ───

async function homeScreen(player: BotPlayer, fresh: boolean): Promise<Screen> {
  const user = await linkedUser(player.chatId);
  if (user?.role === 'PARENT') return parentHome(user, fresh);
  const name = esc(user?.name.split(' ')[0] ?? player.firstName);
  const lines: string[] = [];
  if (fresh) {
    lines.push(
      `Привет, ${name}! Это <b>«Спектр»</b> — онлайн-школа занятий с репетитором 🌈`,
      '',
      '🧩 каждый день — задача с разбором',
      '🏋️ тренажёр по классам 5–11 и ОГЭ/ЕГЭ — задачи не кончаются',
      '🌈 «Радуга знаний»: собери семь цветов',
      '🇬🇧 английский: уроки по 5 минут, слова с озвучкой',
      '🏆 Турнир недели с сертификатом каждому участнику',
      '📚 шпаргалки с формулами по физике, математике и информатике',
      '📅 расписание и ссылка на урок за 15 минут',
      '✍️ запись на занятие за минуту',
      '',
      '<i>Нажимайте кнопки — этот экран будет меняться на месте.</i>',
    );
  } else {
    lines.push(`🌈 <b>Спектр</b> · ${name}`);
  }

  const isStudent = user?.role === 'STUDENT';
  let homework = 0;
  if (user) {
    const filter = user.teacher
      ? { teacherId: user.teacher.id }
      : { OR: [{ studentId: user.id }, { group: { members: { some: { userId: user.id } } } }] };
    const next = await prisma.lesson.findFirst({
      where: { status: 'SCHEDULED', startsAt: { gte: new Date(Date.now() - 30 * 60_000) }, ...filter },
      include: { group: true, teacher: { include: { user: true } } },
      orderBy: { startsAt: 'asc' },
    });
    if (!fresh) lines.push('');
    if (next) lines.push(`📅 Следующий урок: <b>${fmtWhen(next.startsAt)}</b>\n    ${esc(next.title)}`);
    if (isStudent) {
      homework = await pendingHomework(user.id);
      if (homework) lines.push(`📝 Домашка: <b>${homework}</b> ${homework === 1 ? 'задание ждёт' : 'задания ждут'}`);
    }
  } else if (!fresh) lines.push('');

  if (!fresh) {
    const today = schoolDay();
    lines.push(
      player.dailyDay === today
        ? player.dailyStreak
          ? `🧩 Задача дня решена ✅ · серия 🔥${player.dailyStreak}`
          : '🧩 Задача дня разобрана · завтра новая'
        : `🧩 Задача дня ждёт${player.dailyStreak ? ` · серия 🔥${player.dailyStreak}` : ''}`,
    );
    lines.push(`🌈 ${rainbowBar(player.colors)}${player.rainbows ? ` · радуг: ${player.rainbows}` : ''}`);
  }

  const rows: Btn[][] = [];
  rows.push([{ text: '🚀 Открыть Спектр', app: '/' }]);
  rows.push([cb('🧩 Задача дня', 'daily'), cb('🏋️ Тренажёр', 'tr')]);
  rows.push([cb('🌈 Радуга', 'quiz'), cb('🇬🇧 English', 'ew'), { text: '🏆 Турнир', app: '/tournament' }]);
  if (user && (isStudent || user.role === 'ADMIN')) {
    rows.push([cb('📅 Расписание', 'lessons'), cb(homework ? `📝 Домашка · ${homework}` : '📝 Домашка', 'hw')]);
  } else {
    rows.push([cb('📚 Шпаргалки', 'f'), cb('📅 Расписание', 'lessons')]);
  }
  rows.push([cb('✍️ Записаться', 'book'), cb('💬 Написать в школу', 'ask')]);
  const extra: Btn[] = user && (isStudent || user.role === 'ADMIN') ? [cb('📚 Шпаргалки', 'f'), cb('🎁 Друзья', 'invite'), cb('⚙️', 'settings')] : [cb('🎨 Какой ты цвет?', 'test'), cb('🎁 Друзья', 'invite'), cb('⚙️', 'settings')];
  if (user?.teacher) extra.unshift(cb('👩‍🏫 Мои уроки', 't'));
  if (user?.role === 'ADMIN') extra.unshift(cb('🛠 Админка', 'adm'));
  rows.push(extra);
  return { text: lines.join('\n'), rows };
}

async function pendingHomework(userId: string) {
  const memberships = await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
  const list = await prisma.assignment.findMany({
    where: { OR: [{ studentId: userId }, { group: { id: { in: memberships.map((m) => m.groupId) } } }] },
    include: { marks: { where: { userId } } },
    take: 30,
    orderBy: { createdAt: 'desc' },
  });
  const st = await statuses(list, [userId]);
  return list.filter((a) => !st.get(`${a.id}:${userId}`)?.complete).length;
}

function rainbowBar(colors: number) {
  return COLORS.map((c, i) => (colors & (1 << i) ? c.emoji : '⚪️')).join('');
}

// ─── задача дня ───

async function dailyScreen(player: BotPlayer, opts: { hint?: boolean; result?: { correct: boolean; answer?: string } } = {}): Promise<Screen> {
  const today = schoolDay();
  const { subject, topic, problem } = dailyProblem(today);
  const head = `🧩 <b>Задача дня</b> · ${fmtDate(new Date())}\n${subject.emoji} ${subject.title} → ${esc(topic.title)}${'⭐'.repeat(problem.level)}`;
  const theory: Btn = { text: '📖 Теория и похожие задачи', app: `/practice/${subject.slug}/${topic.slug}` };
  const solvedToday = player.dailyDay === today;

  if (opts.result || solvedToday) {
    // серия 0 при решённом дне означает «сдался»
    const correct = opts.result ? opts.result.correct : player.dailyStreak > 0;
    const solution = problem.solution.map((s) => `• ${esc(texToPlain(s))}`).join('\n');
    const status = correct
      ? `✅ <b>Верно!</b> Ответ: ${esc(answerText(problem))}\n🔥 Серия: ${player.dailyStreak} ${player.dailyStreak === 1 ? 'день' : 'дн.'} · решено всего: ${player.dailySolved}`
      : `🟡 <b>Ничего страшного!</b> Правильный ответ: <b>${esc(answerText(problem))}</b> — разбор ниже.`;
    return {
      text: `${head}\n\n${esc(problem.text)}\n\n${status}\n\n<b>Решение</b>\n${solution}\n\n<i>Новая задача — завтра. А пока можно потренироваться в практикуме.</i>`,
      rows: [[theory], [cb('✍️ Разобрать тему с репетитором', 'book')], MENU],
    };
  }

  const rows: Btn[][] = [];
  if (problem.kind === 'choice') {
    problem.options!.forEach((o, i) => rows.push([cb(o, `da:${problem.id}:${i}`)]));
  }
  rows.push([cb('💡 Подсказка', 'dh'), cb('🙈 Сдаюсь', 'dg')]);
  rows.push([theory]);
  rows.push(MENU);
  const ask = problem.kind === 'choice' ? 'Выберите ответ кнопкой 👇' : `✍️ <b>Напишите ответ сообщением</b>${problem.unit ? ` (в ${esc(problem.unit)})` : ''}`;
  return {
    text: `${head}\n\n${esc(problem.text)}\n\n${opts.hint ? `💡 <i>${esc(problem.hint)}</i>\n\n` : ''}${ask}${player.dailyStreak ? `\n\n🔥 Серия: ${player.dailyStreak}` : ''}`,
    rows,
  };
}

async function answerDaily(m: Inbound, player: BotPlayer, raw: string, giveUp = false) {
  const today = schoolDay();
  const { problem, subject, topic } = dailyProblem(today);
  if (player.dailyDay === today) return show(m, player, await dailyScreen(player));
  const correct = !giveUp && checkAnswer(problem, raw);
  const user = await linkedUser(m.chatId);
  if (!giveUp) {
    await prisma.practiceAttempt.create({
      data: { problemId: problem.id, topic: `${subject.slug}/${topic.slug}`, playerId: m.chatId, userId: user?.id ?? null, correct, answer: raw.slice(0, 200) },
    });
  }
  void track({ type: 'bot_daily', playerId: m.chatId, userId: user?.id, path: `/practice/${subject.slug}/${topic.slug}`, label: correct ? 'верно' : giveUp ? 'сдался' : 'ошибка' });
  if (!correct && !giveUp) {
    if (m.callbackId) await adapters.get(m.platform)!.toast(m.callbackId, 'Почти! Подсказка уже на экране 🟡');
    flows.set(m.chatId, { kind: 'daily', problemId: problem.id });
    const screen = await dailyScreen(player, { hint: true });
    screen.text = `🟡 <b>Почти!</b> «${esc(raw)}» — чуть-чуть не так. Подсказка ниже, попробуйте ещё раз.\n\n${screen.text}`;
    return show(m, player, screen);
  }
  flows.delete(m.chatId);
  const yesterday = schoolDay(new Date(Date.now() - 86_400_000));
  const streak = correct ? (player.dailyDay === yesterday ? player.dailyStreak + 1 : 1) : 0;
  player = await prisma.botPlayer.update({
    where: { chatId: m.chatId },
    data: { dailyDay: today, dailyStreak: streak, dailySolved: correct ? { increment: 1 } : undefined },
  });
  if (m.callbackId) await adapters.get(m.platform)!.toast(m.callbackId, correct ? 'Верно! 🎉' : 'Смотрите разбор — так и учатся 👇');
  return show(m, player, await dailyScreen(player, { result: { correct } }));
}

// ─── тренажёр по классам ───

const SUBJECT_TITLE: Record<string, string> = { math: '📐 Математика', physics: '🔭 Физика', informatics: '💻 Информатика' };

function gradeScreen(): Screen {
  return {
    text: '🏋️ <b>Тренажёр</b>\n\nЗадачи не кончаются: числа каждый раз новые, ответ проверяется сразу, а если не получилось — покажем решение по шагам.\n\nВ каком вы классе?',
    rows: [[5, 6, 7, 8].map((g) => cb(`${g}`, `tg:${g}`)), [9, 10, 11].map((g) => cb(`${g}`, `tg:${g}`)), MENU],
  };
}

function subjectScreen(grade: number): Screen {
  const subjects = (['math', 'physics', 'informatics'] as const).filter((sub) => GENERATORS.some((g) => g.subject === sub && g.grades[0] <= grade && grade <= g.grades[1]));
  return {
    text: `🏋️ <b>Тренажёр · ${grade} класс</b>\n\nВыберите предмет — задачи будут из разных тем вашего класса.`,
    rows: [...subjects.map((sub) => [cb(SUBJECT_TITLE[sub]!, `ts:${sub}`)]), [cb(`🎓 Сменить класс (${grade})`, 'tr0'), ...MENU]],
  };
}

function problemBody(text: string) {
  if (!text.includes('\n')) return esc(text);
  const [first, ...rest] = text.split('\n');
  return `${esc(first!)}\n<code>${esc(rest.join('\n'))}</code>`;
}

async function trainNext(m: Inbound, player: BotPlayer, subject: string, note = '') {
  const grade = player.grade ?? 7;
  const pool = GENERATORS.filter((g) => g.subject === subject && g.grades[0] <= grade && grade <= g.grades[1]);
  if (!pool.length) return show(m, player, subjectScreen(grade));
  const gen = pool[randomInt(0, pool.length)]!;
  const seed = randomInt(1, 2_000_000_000);
  const { problem } = makeProblem(gen.id, seed)!;
  flows.set(m.chatId, { kind: 'train', problemId: genProblemId(gen.id, seed), wrong: 0 });
  return show(m, player, {
    text: `${note ? `${note}\n\n` : ''}🏋️ <b>${esc(gen.title)}</b> · ${grade} класс\n\n${problemBody(problem.text)}\n\n✍️ <b>Напишите ответ сообщением</b>${problem.unit ? ` (в ${esc(problem.unit)})` : ''}${player.trainSolved ? `\n\n🏅 Решено в тренажёре: ${player.trainSolved}` : ''}`,
    rows: [[cb('💡 Подсказка', 'th'), cb('🙈 Показать решение', 'tv')], [cb('➡️ Другая задача', `ts:${subject}`)], [cb('◀️ Предметы', 'tr'), ...MENU]],
  });
}

async function trainAnswer(m: Inbound, player: BotPlayer, raw: string, reveal = false) {
  const flow = flows.get(m.chatId);
  const parsed = flow?.kind === 'train' ? parseGenId(flow.problemId) : null;
  if (flow?.kind !== 'train' || !parsed) return show(m, player, player.grade ? subjectScreen(player.grade) : gradeScreen());
  const { gen } = parsed;
  const { problem } = makeProblem(gen.id, parsed.seed)!;
  const correct = !reveal && checkGen(problem, raw);
  const user = await linkedUser(m.chatId);
  if (!reveal) {
    await prisma.practiceAttempt.create({ data: { problemId: flow.problemId, topic: `trainer/${gen.id}`, playerId: m.chatId, userId: user?.id ?? null, correct, answer: raw.slice(0, 200) } });
    void track({ type: 'bot_train', playerId: m.chatId, userId: user?.id, label: `${gen.id}:${correct ? 'верно' : 'почти'}` });
  }
  const steps = problem.steps.map((x) => `• ${esc(texToPlain(x))}`).join('\n');
  const nextRows: Btn[][] = [[cb('➡️ Следующая задача', `ts:${gen.subject}`)], ...(gen.theory ? [[{ text: '📖 Теория по теме', app: `/practice/${gen.theory}` } as Btn]] : []), [cb('◀️ Предметы', 'tr'), ...MENU]];
  if (correct) {
    flows.delete(m.chatId);
    player = await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { trainSolved: { increment: 1 } } });
    return show(m, player, { text: `✅ <b>Верно!</b> Ответ: ${esc(genAnswerText(problem))}\n\n${steps}\n\n🏅 Решено в тренажёре: ${player.trainSolved}`, rows: nextRows });
  }
  flow.wrong++;
  if (!reveal && flow.wrong < 2) {
    return show(m, player, {
      text: `🟡 <b>Почти!</b> «${esc(raw)}» — чуть-чуть не так.\n💡 <i>${esc(problem.hint)}</i>\n\n🏋️ <b>${esc(gen.title)}</b>\n\n${problemBody(problem.text)}\n\n✍️ Попробуйте ещё раз — напишите ответ сообщением`,
      rows: [[cb('🙈 Показать решение', 'tv')], [cb('➡️ Другая задача', `ts:${gen.subject}`)], MENU],
    });
  }
  flows.delete(m.chatId);
  return show(m, player, { text: `🟡 <b>Ничего страшного!</b> Правильный ответ: <b>${esc(genAnswerText(problem))}</b>\n\n<b>Решение</b>\n${steps}\n\nСледующая получится 💪`, rows: nextRows });
}

// ─── «Радуга знаний» ───

async function touchDay(player: BotPlayer) {
  const today = schoolDay();
  if (player.lastDay === today) return player;
  const yesterday = schoolDay(new Date(Date.now() - 86_400_000));
  const streak = player.lastDay === yesterday ? player.streak + 1 : 1;
  return prisma.botPlayer.update({
    where: { chatId: player.chatId },
    data: { lastDay: today, todayCount: 0, streak, bestStreak: Math.max(player.bestStreak, streak) },
  });
}

async function quizScreen(m: Inbound, player: BotPlayer): Promise<Screen> {
  player = await touchDay(player);
  if (player.todayCount >= DAILY_QUESTIONS && player.bonus <= 0) {
    return {
      text: `🌈 <b>Радуга знаний</b>\n${rainbowBar(player.colors)}\n\nНа сегодня вопросы закончились — возвращайтесь завтра, чтобы не прервать серию 🔥 ${player.streak}.\n\n🎁 За каждого друга, который придёт по вашей ссылке, — дополнительный вопрос.`,
      rows: [[cb('🎁 Позвать друга', 'invite'), cb('🏆 Зал славы', 'top')], [cb('🎨 Какой ты цвет?', 'test')], MENU],
    };
  }
  let pending = quizPending.get(m.chatId);
  if (!pending) {
    const missing = COLORS.map((_, i) => i).filter((i) => !(player.colors & (1 << i)));
    const color = missing[Math.floor(Math.random() * missing.length)]!;
    pending = { color, qi: Math.floor(Math.random() * COLORS[color]!.questions.length) };
    quizPending.set(m.chatId, pending);
  }
  const c = COLORS[pending.color]!;
  const q = c.questions[pending.qi]!;
  const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  const left = Math.max(0, DAILY_QUESTIONS - player.todayCount) + player.bonus;
  return {
    text: `🌈 <b>Радуга знаний</b>\n${rainbowBar(player.colors)}\n\n${c.emoji} <b>${c.subject}</b> · вопросов сегодня: ${left}\n\n${esc(q.q)}`,
    rows: [...order.map((i) => [cb(q.options[i]!, `qa:${pending!.color}:${pending!.qi}:${i}`)]), [cb('🏆 Зал славы', 'top'), ...MENU]],
  };
}

async function answerQuiz(m: Inbound, player: BotPlayer) {
  const [, colorS, qiS, optS] = (m.data ?? '').split(':');
  const color = Number(colorS);
  const qi = Number(qiS);
  const a = adapters.get(m.platform)!;
  const pending = quizPending.get(m.chatId);
  if (!pending || pending.color !== color || pending.qi !== qi) {
    if (m.callbackId) await a.toast(m.callbackId, 'Этот вопрос уже закрыт');
    return show(m, player, await quizScreen(m, player));
  }
  quizPending.delete(m.chatId);
  player = await touchDay(player);
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
    where: { chatId: m.chatId },
    data: { colors, rainbows, todayCount: { increment: 1 }, bonus: useBonus ? { decrement: 1 } : undefined },
  });
  void track({ type: 'bot_quiz', playerId: m.chatId, label: `${c.subject}:${right ? 'верно' : 'ошибка'}` });
  if (m.callbackId) await a.toast(m.callbackId, right ? `Верно! ${c.emoji}` : 'Почти! 🟡');
  let text = right
    ? `✅ <b>Верно!</b> ${c.emoji} ${c.name} цвет ваш.\n\n💡 ${esc(q.fact)}`
    : `🟡 <b>Почти!</b> Правильный ответ: <b>${esc(q.options[0]!)}</b>\n\n💡 ${esc(q.fact)}`;
  text = completed
    ? `${text}\n\n🌈🌈🌈 <b>Радуга собрана!</b> ${COLORS.map((x) => x.emoji).join('')}\nЭто уже ${rainbows}-я. Вы в зале славы — начинаем новую радугу.`
    : `${text}\n\n${rainbowBar(player.colors)}`;
  const rows: Btn[][] = [[cb('➡️ Следующий вопрос', 'quiz'), cb('🏆 Зал славы', 'top')]];
  if (!right && c.bookable) rows.push([cb(`✍️ Разобрать ${c.subject.toLowerCase()} с репетитором`, 'book')]);
  rows.push(MENU);
  return show(m, player, { text: `🌈 <b>Радуга знаний</b>\n\n${text}`, rows });
}

async function topScreen(player: BotPlayer): Promise<Screen> {
  const top = await prisma.botPlayer.findMany({
    where: { OR: [{ rainbows: { gt: 0 } }, { bestStreak: { gt: 1 } }, { dailySolved: { gt: 0 } }] },
    orderBy: [{ rainbows: 'desc' }, { dailySolved: 'desc' }, { bestStreak: 'desc' }],
    take: 10,
  });
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((p, i) => `${medals[i] ?? `${i + 1}.`} ${esc(p.firstName)} — 🌈 ${p.rainbows} · 🧩 ${p.dailySolved} · 🔥 ${p.bestStreak}`);
  return {
    text:
      `🏆 <b>Зал славы</b>\n🌈 радуги · 🧩 задачи дня · 🔥 лучшая серия\n\n${lines.join('\n') || 'Пока пусто — станьте первым!'}` +
      `\n\nВы: 🌈 ${player.rainbows} · 🧩 ${player.dailySolved} · 🔥 ${player.streak}\n${rainbowBar(player.colors)}`,
    rows: [[cb('🌈 Играть', 'quiz'), cb('🧩 Задача дня', 'daily')], MENU],
  };
}

// ─── «Какой ты цвет?» ───

function testStep(step: number): Screen {
  const s = COLOR_TEST[step]!;
  return {
    text: `🎨 <b>Какой ты цвет спектра?</b> ${step + 1}/${COLOR_TEST.length}\n\n${s.q}`,
    rows: [...s.answers.map((a, i) => [cb(a.text, `ta:${step}:${i}`)]), MENU],
  };
}

async function testAnswer(m: Inbound, player: BotPlayer) {
  const [, stepS, ansS] = (m.data ?? '').split(':');
  const step = Number(stepS);
  const scores = testScores.get(m.chatId);
  const a = adapters.get(m.platform)!;
  if (!scores) {
    testScores.set(m.chatId, {});
    return show(m, player, testStep(0));
  }
  if (m.callbackId) await a.toast(m.callbackId);
  for (const slug of COLOR_TEST[step]?.answers[Number(ansS)]?.slugs ?? []) scores[slug] = (scores[slug] ?? 0) + 1;
  if (step + 1 < COLOR_TEST.length) return show(m, player, testStep(step + 1));
  testScores.delete(m.chatId);
  const best = Object.entries(scores).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'math';
  const course = await prisma.course.findFirst({ where: { slug: best, published: true } });
  const color = COLORS[(course?.hue ?? 0) % COLORS.length]!;
  await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { colorTest: best } });
  void track({ type: 'bot_test', playerId: m.chatId, label: best });
  const practice = PRACTICE.find((p) => p.course === best);
  const rows: Btn[][] = [];
  if (course) rows.push([cb(`✍️ Записаться: ${course.title}`, `bc:${course.id}`)]);
  if (practice) rows.push([{ text: `🧩 Бесплатные задачи: ${practice.title}`, app: `/practice#${practice.slug}` }]);
  rows.push([cb('🔁 Ещё раз', 'test'), cb('🎁 Позвать друга', 'invite')]);
  rows.push(MENU);
  return show(m, player, {
    text: course
      ? `🎨 ${color.emoji} Вы — <b>${color.name}</b>!\n\nВаш предмет: <b>${esc(course.title)}</b>\n${esc(course.summary)}\n\n<i>Отправьте тест друзьям — интересно, какого цвета они.</i>`
      : `🎨 ${color.emoji} Вы — <b>${color.name}</b>! Подберём предмет вместе с администратором.`,
    rows,
  });
}

// ─── шпаргалки ───

function formulasSubjects(): Screen {
  return {
    text: '📚 <b>Шпаргалки</b>\n\nКороткие формулы и правила по темам. Полная теория, разобранные примеры и задачи с проверкой — в практикуме.',
    rows: [...PRACTICE.map((s) => [cb(`${s.emoji} ${s.title}`, `fs:${s.slug}`)]), [{ text: '🧩 Открыть практикум', app: '/practice' }], MENU],
  };
}

function formulasTopics(subjectSlug: string): Screen {
  const s = PRACTICE.find((x) => x.slug === subjectSlug) ?? PRACTICE[0]!;
  return {
    text: `${s.emoji} <b>${s.title}</b> · шпаргалки\n\n${esc(s.blurb)}`,
    rows: [...s.topics.map((t) => [cb(t.title, `ft:${s.slug}:${t.slug}`)]), [cb('◀️ Предметы', 'f'), ...MENU]],
  };
}

function formulasCard(subjectSlug: string, topicSlug: string): Screen {
  const s = PRACTICE.find((x) => x.slug === subjectSlug) ?? PRACTICE[0]!;
  const t = s.topics.find((x) => x.slug === topicSlug) ?? s.topics[0]!;
  const formulas = t.formulas.map((f) => `▫️ <code>${esc(f.plain)}</code>\n    <i>${esc(f.label)}</i>`).join('\n');
  const tips = t.theory.filter((b) => b.kind !== 'p').map((b) => `${b.kind === 'tip' ? '💡' : '⚠️'} ${esc(texToPlain(b.text))}`).join('\n');
  return {
    text: `${s.emoji} <b>${esc(t.title)}</b>\n<i>${esc(t.level)}</i>\n\n${formulas}${tips ? `\n\n${tips}` : ''}`,
    rows: [[{ text: '📖 Теория и задачи с проверкой', app: `/practice/${s.slug}/${t.slug}` }], [cb(`◀️ ${s.title}`, `fs:${s.slug}`), ...MENU]],
  };
}

// ─── занятия и домашка ───

async function lessonsScreen(chatId: string): Promise<Screen> {
  const user = await linkedUser(chatId);
  if (!user) return notLinkedScreen('Чтобы видеть расписание, нужен аккаунт школы.');
  const lessons = await prisma.lesson.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { gte: new Date(Date.now() - 60 * 60_000), lte: new Date(Date.now() + 7 * 86_400_000) },
      OR: user.teacher ? [{ teacherId: user.teacher.id }] : [{ studentId: user.id }, { group: { members: { some: { userId: user.id } } } }],
    },
    include: { group: true, teacher: { include: { user: true } }, student: true },
    orderBy: { startsAt: 'asc' },
    take: 8,
  });
  if (!lessons.length) {
    return { text: '📅 <b>Расписание</b>\n\nНа ближайшую неделю занятий нет.', rows: [[cb('✍️ Записаться на занятие', 'book')], MENU] };
  }
  const now = Date.now();
  const rows: Btn[][] = [];
  const lines = lessons.map((l) => {
    const live = l.startsAt.getTime() <= now && now < l.startsAt.getTime() + l.durationMin * 60_000;
    const soon = l.startsAt.getTime() - now <= 15 * 60_000 && now < l.startsAt.getTime() + l.durationMin * 60_000;
    if (soon && l.link) rows.push([{ text: `🎥 Подключиться: ${fmtTime(l.startsAt)}`, url: l.link }]);
    const who = user.teacher ? (l.group ? l.group.name : (l.student?.name ?? 'индивидуально')) : l.teacher.user.name;
    return `${live ? '🟢 <b>идёт сейчас</b>' : '▫️'} <b>${fmtWhen(l.startsAt)}</b>\n    ${esc(l.title)} · ${esc(who)}`;
  });
  rows.push([{ text: '📅 Всё расписание', app: user.teacher ? '/teach/lessons' : '/app/schedule' }]);
  rows.push(MENU);
  return { text: `📅 <b>Ближайшие занятия</b>\n\n${lines.join('\n\n')}\n\n<i>Ссылка на урок придёт сюда за 15 минут до начала.</i>`, rows };
}

async function homeworkScreen(chatId: string): Promise<Screen> {
  const user = await linkedUser(chatId);
  if (!user) return notLinkedScreen('Домашние задания видны ученикам школы.');
  const memberships = await prisma.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } });
  const list = await prisma.assignment.findMany({
    where: { OR: [{ studentId: user.id }, { groupId: { in: memberships.map((m) => m.groupId) } }] },
    include: { marks: { where: { userId: user.id } }, teacher: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  if (!list.length) return { text: '📝 <b>Домашка</b>\n\nЗаданий пока нет. Можно размяться в практикуме 👇', rows: [[{ text: '🧩 Практикум', app: '/practice' }], MENU] };
  const st = await statuses(list, [user.id]);
  const lines = list.map((a) => {
    const tasks = parseTasks(a.problemIds);
    const status = st.get(`${a.id}:${user.id}`);
    const got = status?.solvedProblems.size ?? 0;
    const trainer = tasks.trainers.map((t) => `${t.title} ${status?.trainerDone[t.id] ?? 0}/${t.count}`).join(', ');
    return `${status?.complete ? '✅' : '▫️'} <b>${esc(a.title)}</b>\n    ${esc(a.teacher.user.name)}${tasks.problems.length ? ` · задач ${got}/${tasks.problems.length}` : ''}${trainer ? ` · 🏋️ ${esc(trainer)}` : ''}${a.dueAt ? ` · до ${fmtWhen(a.dueAt)}` : ''}`;
  });
  return { text: `📝 <b>Домашка</b>\n\n${lines.join('\n\n')}`, rows: [[{ text: '📝 Решать в приложении', app: '/app/homework' }], MENU] };
}

function notLinkedScreen(reason: string): Screen {
  return {
    text: `${reason}\n\nОткройте Спектр кнопкой ниже — аккаунт создастся сам при входе из мессенджера.\nЕсли аккаунт уже есть на сайте, привяжите мессенджер: <i>Кабинет → Профиль → Привязать</i>.`,
    rows: [[{ text: '🚀 Открыть Спектр', app: '/app' }], [cb('✍️ Записаться на занятие', 'book')], MENU],
  };
}

// ─── запись ───

async function bookStart(m: Inbound, player: BotPlayer) {
  flows.set(m.chatId, { kind: 'book' });
  const courses = await prisma.course.findMany({ where: { published: true }, orderBy: { createdAt: 'asc' }, take: 12 });
  const rows = courses.map((c) => [cb(`${COLORS[c.hue % COLORS.length]!.emoji} ${c.title}`, `bc:${c.id}`)]);
  rows.push([cb('🤔 Пока не знаю — подберите', 'bc:none')]);
  rows.push(MENU);
  return show(m, player, { text: '✍️ <b>Запись на занятие</b> · шаг 1 из 3\n\nКакой предмет?', rows });
}

async function bookContact(m: Inbound, player: BotPlayer) {
  const flow = flows.get(m.chatId);
  if (flow?.kind !== 'book') return bookStart(m, player);
  const a = adapters.get(m.platform)!;
  const rows: Btn[][] = [[{ text: '📱 Отправить мой номер', contact: true }]];
  if (m.platform === 'telegram' && m.who.username) rows.push([cb(`💬 Пишите мне в Telegram @${m.who.username}`, 'bu')]);
  if (m.platform === 'max') rows.push([cb('💬 Пишите мне сюда, в MAX', 'bu')]);
  rows.push([cb('✖️ Отмена', 'menu')]);
  const screen: Screen = {
    text: `✍️ <b>Запись на занятие</b> · шаг 3 из 3\n${flow.courseTitle ? `📚 ${esc(flow.courseTitle)}\n` : ''}👥 ${flow.format === 'GROUP' ? 'мини-группа' : 'индивидуально'}\n\nКак с вами связаться? Нажмите кнопку или напишите телефон сообщением.`,
    rows,
  };
  if (m.platform === 'telegram') {
    // в Telegram запрос номера — это клавиатура под полем ввода, её нельзя положить в экран
    await show(m, player, { text: screen.text, rows: rows.slice(1) });
    flow.prompt = (await a.askContact(m.chatId, { text: '👇 Кнопка «Отправить мой номер» — под полем ввода', rows: [] })) ?? undefined;
    return;
  }
  return show(m, player, screen);
}

async function bookFinish(m: Inbound, player: BotPlayer, contact: string) {
  const flow = flows.get(m.chatId);
  if (flow?.kind !== 'book') return;
  flows.delete(m.chatId);
  const a = adapters.get(m.platform)!;
  if (flow.prompt) void a.remove(m.chatId, flow.prompt);
  await a.clearContact(m.chatId);
  const user = await linkedUser(m.chatId);
  const booking = await prisma.booking.create({
    data: {
      name: user?.name ?? [m.who.firstName, m.who.lastName].filter(Boolean).join(' '),
      contact: contact.slice(0, 120),
      courseId: flow.courseId,
      format: flow.format,
      comment: `Заявка из бота ${m.platform === 'max' ? 'MAX' : 'Telegram'}`,
      userId: user?.id,
    },
  });
  void track({ type: 'booking', playerId: m.chatId, userId: user?.id, label: flow.courseTitle ?? 'без предмета' });
  void track({ type: 'bot_book', playerId: m.chatId, userId: user?.id });
  await show(m, player, {
    text: `✅ <b>Заявка отправлена!</b>\n\n${flow.courseTitle ? `📚 ${esc(flow.courseTitle)}\n` : ''}📞 ${esc(contact)}\n\nАдминистратор свяжется с вами и подберёт преподавателя и время. Обычно — в течение дня.\n\nПока ждёте — решите задачу дня 🧩`,
    rows: [[cb('🧩 Задача дня', 'daily'), cb('🌈 Радуга', 'quiz')], MENU],
  });
  await notifyNewBooking(booking, flow.courseTitle);
}

export async function notifyNewBooking(booking: Booking, courseTitle?: string) {
  if (!anyBot()) return;
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
    await notifyAdmins(text, [[cb('✅ Связались', `bs:${booking.id}:CONTACTED`), cb('📅 Записан', `bs:${booking.id}:SCHEDULED`)], [{ text: 'Все заявки', app: '/admin/bookings' }]]);
  } catch (err) {
    log?.warn({ err }, 'бот: не удалось сообщить о заявке');
  }
}

// ─── вопросы в школу (обращения в поддержку) ───

async function askScreen(m: Inbound, player: BotPlayer) {
  flows.set(m.chatId, { kind: 'ask' });
  return show(m, player, {
    text: '💬 <b>Написать в школу</b>\n\nНапишите вопрос одним сообщением — он попадёт администратору. Ответ придёт сюда же, а вся переписка сохранится в кабинете в разделе «Поддержка».',
    rows: [[cb('✖️ Отмена', 'menu')]],
  });
}

async function askSend(m: Inbound, player: BotPlayer, text: string) {
  flows.delete(m.chatId);
  const user = await ensureUser(m);
  const open = await prisma.supportTicket.findFirst({ where: { userId: user.id, status: { not: 'CLOSED' } }, orderBy: { updatedAt: 'desc' } });
  const ticket = open
    ? await prisma.supportTicket.update({ where: { id: open.id }, data: { status: 'OPEN', messages: { create: { body: text, authorId: user.id } } } })
    : await prisma.supportTicket.create({
        data: { subject: text.slice(0, 80), userId: user.id, messages: { create: { body: text, authorId: user.id } } },
      });
  void track({ type: 'bot_ask', playerId: m.chatId, userId: user.id, label: text.slice(0, 100) });
  await show(m, player, {
    text: `📨 <b>Вопрос отправлен</b>\n\n«${esc(text.slice(0, 500))}»\n\nОтвет придёт сюда. Переписка — в кабинете, раздел «Поддержка».`,
    rows: [[{ text: '💬 Открыть переписку', app: `/app/support/${ticket.id}` }], MENU],
  });
  await notifyTicketToAdmins(ticket.id, text, user, m.platform === 'max' ? 'из MAX' : 'из Telegram');
}

async function notifyTicketToAdmins(ticketId: string, text: string, from: { name: string; email: string | null }, platform: string) {
  const chats = await adminChats();
  for (const chat of chats) {
    const a = adapters.get(platformOf(chat));
    if (!a) continue;
    const id = await a
      .send(chat, {
        text: `💬 <b>Вопрос в поддержку</b> · ${platform}\nот ${esc(from.name)}${from.email ? ` · ${esc(from.email)}` : ''}\n\n${esc(text.slice(0, 1500))}\n\n<i>Нажмите «Ответить» или ответьте на это сообщение (reply).</i>`,
        rows: [[cb('✍️ Ответить', `ar:${ticketId}`)], [{ text: 'Открыть в админке', app: '/admin/tickets' }]],
      })
      .catch(() => null);
    if (id && /^\d+$/.test(id)) await prisma.botRelay.create({ data: { adminChatId: chat, adminMessageId: Number(id), ticketId } }).catch(() => {});
  }
}

/** Публичное: обращение создано или дополнено на сайте — сообщить админам. */
export async function notifyTicketFromWeb(ticketId: string, text: string, userId: string) {
  if (!anyBot()) return;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (u) await notifyTicketToAdmins(ticketId, text, u, 'с сайта');
}

/** Публичное: школа ответила в обращении — отправить ответ ученику в мессенджер. */
export async function notifyTicketReply(ticketId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  await notifyUser(ticket.userId, `💬 <b>Ответ школы</b>\n\n${esc(body)}`, { app: `/app/support/${ticketId}`, label: '💬 Открыть переписку' });
}

async function adminReplySend(m: Inbound, player: BotPlayer, ticketId: string, text: string) {
  flows.delete(m.chatId);
  const admin = await linkedUser(m.chatId);
  if (admin?.role !== 'ADMIN') return show(m, player, await homeScreen(player, false));
  await prisma.ticketMessage.create({ data: { ticketId, authorId: admin.id, body: text } });
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'ANSWERED' } });
  await notifyTicketReply(ticketId, text);
  return show(m, player, await ticketCard(ticketId, '✅ Ответ отправлен ученику.'));
}

// ─── админка в боте ───

async function adminHome(): Promise<Screen> {
  const today = new Date(Date.now() - 86_400_000);
  const [newBookings, openTickets, players, playersToday, bookingsToday] = await Promise.all([
    prisma.booking.count({ where: { status: 'NEW' } }),
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.botPlayer.count(),
    prisma.botPlayer.count({ where: { createdAt: { gte: today } } }),
    prisma.booking.count({ where: { createdAt: { gte: today } } }),
  ]);
  return {
    text: `🛠 <b>Админка</b>\n\n🆕 Новых заявок: <b>${newBookings}</b>\n💬 Обращений ждут ответа: <b>${openTickets}</b>\n\nЗа сутки: заявок ${bookingsToday}, новых в ботах ${playersToday}\nВсего в ботах: ${players}`,
    rows: [
      [cb(`🆕 Заявки · ${newBookings}`, 'ab'), cb(`💬 Обращения · ${openTickets}`, 'at')],
      [cb('📊 Статистика', 'as')],
      [{ text: '📈 Аналитика и люди', app: '/admin/analytics' }],
      MENU,
    ],
  };
}

async function adminBookings(): Promise<Screen> {
  const list = await prisma.booking.findMany({ where: { status: { in: ['NEW', 'CONTACTED'] } }, include: { course: true }, orderBy: { createdAt: 'desc' }, take: 8 });
  if (!list.length) return { text: '🆕 <b>Заявки</b>\n\nВсе заявки разобраны 🎉', rows: [[cb('◀️ Админка', 'adm'), ...MENU]] };
  return {
    text: `🆕 <b>Заявки</b> · новые и в работе\n\n${list.map((b) => `${b.status === 'NEW' ? '🆕' : '📞'} ${esc(b.name)} · ${esc(b.course?.title ?? 'без предмета')}`).join('\n')}`,
    rows: [...list.map((b) => [cb(`${b.status === 'NEW' ? '🆕' : '📞'} ${b.name.slice(0, 24)} · ${fmtDate(b.createdAt)}`, `bk:${b.id}`)]), [cb('◀️ Админка', 'adm'), ...MENU]],
  };
}

async function bookingCard(id: string, note?: string): Promise<Screen> {
  const b = await prisma.booking.findUnique({ where: { id }, include: { course: true } });
  if (!b) return { text: 'Заявка не найдена', rows: [[cb('◀️ Заявки', 'ab')]] };
  const STATUS: Record<string, string> = { NEW: '🆕 новая', CONTACTED: '📞 связались', SCHEDULED: '📅 записан', CLOSED: '✖️ закрыта' };
  return {
    text:
      `${note ? `${note}\n\n` : ''}📋 <b>Заявка</b> · ${STATUS[b.status] ?? b.status}\n\n👤 ${esc(b.name)}\n📞 ${esc(b.contact)}\n📚 ${esc(b.course?.title ?? 'предмет не выбран')}` +
      `${b.format ? `\n👥 ${b.format === 'GROUP' ? 'мини-группа' : 'индивидуально'}` : ''}${b.preferredTime ? `\n🕒 ${esc(b.preferredTime)}` : ''}${b.comment ? `\n💬 ${esc(b.comment)}` : ''}\n🗓 ${fmtWhen(b.createdAt)}`,
    rows: [
      [cb('📞 Связались', `bs:${b.id}:CONTACTED`), cb('📅 Записан', `bs:${b.id}:SCHEDULED`)],
      [cb('✖️ Закрыть', `bs:${b.id}:CLOSED`)],
      [cb('◀️ Заявки', 'ab'), ...MENU],
    ],
  };
}

async function adminTickets(): Promise<Screen> {
  const list = await prisma.supportTicket.findMany({ where: { status: 'OPEN' }, include: { user: true }, orderBy: { updatedAt: 'desc' }, take: 8 });
  if (!list.length) return { text: '💬 <b>Обращения</b>\n\nВсе ответы даны 🎉', rows: [[cb('◀️ Админка', 'adm'), ...MENU]] };
  return {
    text: '💬 <b>Обращения</b> · ждут ответа',
    rows: [...list.map((t) => [cb(`${t.user.name.slice(0, 18)}: ${t.subject.slice(0, 26)}`, `tk:${t.id}`)]), [cb('◀️ Админка', 'adm'), ...MENU]],
  };
}

async function ticketCard(id: string, note?: string): Promise<Screen> {
  const t = await prisma.supportTicket.findUnique({ where: { id }, include: { user: true, messages: { include: { author: true }, orderBy: { createdAt: 'desc' }, take: 5 } } });
  if (!t) return { text: 'Обращение не найдено', rows: [[cb('◀️ Обращения', 'at')]] };
  const msgs = t.messages
    .reverse()
    .map((x) => `${x.authorId === t.userId ? '👤' : '🏫'} <b>${esc(x.author.name)}</b> · ${fmtTime(x.createdAt)}\n${esc(x.body.slice(0, 600))}`)
    .join('\n\n');
  return {
    text: `${note ? `${note}\n\n` : ''}💬 <b>${esc(t.subject)}</b>\n${esc(t.user.name)}${t.user.email ? ` · ${esc(t.user.email)}` : ''}\n\n${msgs}`,
    rows: [[cb('✍️ Ответить', `ar:${t.id}`), cb('✅ Закрыть', `tc:${t.id}`)], [cb('◀️ Обращения', 'at'), ...MENU]],
  };
}

async function adminStats(): Promise<Screen> {
  const week = new Date(Date.now() - 7 * 86_400_000);
  const [players, newPlayers, rainbows, daily, bookings, signups, solved, visitors] = await Promise.all([
    prisma.botPlayer.count(),
    prisma.botPlayer.count({ where: { createdAt: { gte: week } } }),
    prisma.botPlayer.aggregate({ _sum: { rainbows: true } }),
    prisma.botPlayer.aggregate({ _sum: { dailySolved: true } }),
    prisma.booking.count({ where: { createdAt: { gte: week } } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.practiceAttempt.count({ where: { createdAt: { gte: week }, correct: true } }),
    prisma.visitor.count({ where: { lastSeen: { gte: week } } }),
  ]);
  return {
    text:
      `📊 <b>За 7 дней</b>\n\n🌐 Посетителей сайта: ${visitors}\n👥 Новых в ботах: ${newPlayers} (всего ${players})\n🆕 Регистраций: ${signups}\n✍️ Заявок: ${bookings}\n🧩 Решено задач: ${solved}\n\n` +
      `За всё время: радуг 🌈 ${rainbows._sum.rainbows ?? 0}, задач дня 🧩 ${daily._sum.dailySolved ?? 0}`,
    rows: [[{ text: '📈 Подробная аналитика', app: '/admin/analytics' }], [cb('◀️ Админка', 'adm'), ...MENU]],
  };
}

// ─── преподаватель в боте ───

async function teacherScreen(chatId: string): Promise<Screen> {
  const user = await linkedUser(chatId);
  if (!user?.teacher) return { text: 'Раздел для преподавателей.', rows: [MENU] };
  const lessons = await prisma.lesson.findMany({
    where: { teacherId: user.teacher.id, status: 'SCHEDULED', startsAt: { gte: new Date(Date.now() - 60 * 60_000), lte: new Date(Date.now() + 2 * 86_400_000) } },
    include: { group: true, student: true },
    orderBy: { startsAt: 'asc' },
    take: 8,
  });
  if (!lessons.length) return { text: '👩‍🏫 <b>Мои уроки</b>\n\nНа ближайшие двое суток уроков нет.', rows: [[{ text: '📅 Кабинет преподавателя', app: '/teach' }], MENU] };
  return {
    text: `👩‍🏫 <b>Мои уроки</b> · ближайшие двое суток\n\nНажмите на урок, чтобы добавить ссылку. ${lessons.filter((l) => !l.link).length ? '⚠️ Есть уроки без ссылки.' : '✅ Ссылки везде на месте.'}`,
    rows: [
      ...lessons.map((l) => [cb(`${l.link ? '🔗' : '⚠️'} ${fmtWhen(l.startsAt)} · ${(l.group?.name ?? l.student?.name ?? '').slice(0, 18)}`, `tl:${l.id}`)]),
      [{ text: '📅 Кабинет преподавателя', app: '/teach' }],
      MENU,
    ],
  };
}

async function teacherLessonCard(lessonId: string, note?: string): Promise<Screen> {
  const l = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { group: true, student: true } });
  if (!l) return { text: 'Урок не найден', rows: [[cb('◀️ Мои уроки', 't')]] };
  return {
    text: `${note ? `${note}\n\n` : ''}📘 <b>${esc(l.title)}</b>\n🗓 ${fmtWhen(l.startsAt)} · ${l.durationMin} мин\n👥 ${esc(l.group?.name ?? l.student?.name ?? '')}\n🔗 ${l.link ? esc(l.link) : 'ссылки пока нет'}`,
    rows: [[cb(l.link ? '🔗 Заменить ссылку' : '🔗 Добавить ссылку', `tL:${l.id}`)], ...(l.link ? [[{ text: '🎥 Открыть урок', url: l.link } as Btn]] : []), [cb('◀️ Мои уроки', 't'), ...MENU]],
  };
}

// ─── настройки, приглашения, привязка ───

function settingsScreen(player: BotPlayer, linked: User | null): Screen {
  return {
    text:
      `⚙️ <b>Настройки</b>\n\n🔔 Напоминания о занятиях: ${player.reminders ? 'включены' : 'выключены'}\n🧩 Вечернее напоминание о задаче дня: ${player.dailyPush ? 'включено' : 'выключено'}\n\n` +
      (linked ? `👤 Аккаунт школы: <b>${esc(linked.name)}</b>${linked.email ? ` · ${esc(linked.email)}` : ''}` : '👤 Аккаунт школы не привязан. Привязать: на сайте <i>Кабинет → Профиль → Привязать</i>.'),
    rows: [
      [cb(player.reminders ? '🔕 Выключить напоминания' : '🔔 Включить напоминания', 'sr')],
      [cb(player.dailyPush ? '🔕 Не напоминать о задаче дня' : '🧩 Напоминать о задаче дня', 'sd')],
      [{ text: '👤 Профиль на сайте', app: '/app/profile' }],
      MENU,
    ],
  };
}

function inviteScreen(m: Inbound, player: BotPlayer): Screen {
  const link = adapters.get(m.platform)!.inviteLink(`r_${rawId(m.chatId)}`);
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Собираю радугу знаний и решаю задачу дня в «Спектре» 🌈 Присоединяйся!')}`;
  return {
    text: `🎁 <b>Позвать друга</b>\n\nЗа каждого друга, который впервые запустит бота по вашей ссылке, — <b>+1 вопрос</b> в «Радуге знаний».\n\nВаша ссылка:\n${link}\n\nУже пришли: ${player.invited}`,
    rows: [...(m.platform === 'telegram' ? [[{ text: '📤 Поделиться', url: share } as Btn]] : []), MENU],
  };
}

const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_m, a: string, b: string, c: string) => `${a}${'•'.repeat(Math.min(6, Math.max(2, b.length)))}${c}`);

/** Шаг 1: показать, к какому аккаунту привязываемся, и спросить подтверждение (защита от подсунутых чужих ссылок). */
async function linkAsk(m: Inbound, player: BotPlayer, code: string) {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return show(m, player, { text: 'Ссылка для привязки устарела. Нажмите «Привязать» в профиле на сайте ещё раз.', rows: [MENU] });
  }
  const target = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!target) return show(m, player, { text: 'Аккаунт не найден.', rows: [MENU] });
  return show(m, player, {
    text: `🔗 <b>Привязать ${m.platform === 'max' ? 'этот MAX' : 'этот Telegram'} к аккаунту школы?</b>

👤 ${esc(target.name)}${target.email ? `
✉️ ${esc(maskEmail(target.email))}` : ''}

Привязывайте, только если это ваш аккаунт: сюда будут приходить его расписание, домашка и сообщения школы.`,
    rows: [[cb('✅ Да, это мой аккаунт', `lk:${code}`)], [cb('✖️ Нет, не мой', 'menu')]],
  });
}

async function linkAccount(m: Inbound, player: BotPlayer, code: string) {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    return show(m, player, { text: 'Ссылка для привязки устарела. Нажмите «Привязать» в профиле на сайте ещё раз.', rows: [MENU] });
  }
  await prisma.telegramLinkCode.delete({ where: { code } });
  const isMax = m.platform === 'max';
  const value = rawId(m.chatId);
  const other = await prisma.user.findFirst({ where: isMax ? { maxId: value } : { telegramId: value } });
  let moved = '';
  if (other && other.id !== row.userId) {
    // Владелец мессенджера и аккаунта на сайте — один человек (он только что вошёл на сайт и нажал ссылку),
    // поэтому переносим мессенджер со старого аккаунта на этот.
    await prisma.user.update({ where: { id: other.id }, data: isMax ? { maxId: null } : { telegramId: null } });
    moved = `\n\nРаньше этот ${isMax ? 'MAX' : 'Telegram'} был привязан к аккаунту «${esc(other.email ?? other.name)}» — теперь он отвязан от него.`;
  }
  const user = await prisma.user.update({ where: { id: row.userId }, data: isMax ? { maxId: value } : { telegramId: value } });
  void track({ type: 'bot_link', playerId: m.chatId, userId: user.id });
  return show(m, player, {
    text:
      `✅ <b>Готово!</b> ${m.platform === 'max' ? 'MAX' : 'Telegram'} привязан к аккаунту <b>${esc(user.name)}</b>.\nЗдесь будут расписание, домашка и напоминания за 15 минут до урока.` +
      (user.role === 'ADMIN' ? '\n\n🔔 Вы администратор: сюда будут приходить новые заявки и вопросы учеников, а в меню появилась «Админка».' : '') +
      moved,
    rows: [[cb('↩️ В меню', 'menu')]],
  });
}

// ─── отчёт для родителей ───

const siteUrl = () =>
  ((process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((x) => x.trim())
    .find((x) => x.startsWith('https://')) ?? '').replace(/\/$/, '');

async function parentReport(token: string): Promise<Screen | null> {
  const link = await prisma.parentLink.findUnique({ where: { token } });
  if (!link || link.revokedAt) return null;
  return weeklyReport(link.userId, token);
}

async function weeklyReport(userId: string, token: string | null): Promise<Screen> {
  const [p, school] = await Promise.all([progressFor({ userId }), schoolFor(userId)]);
  const name = esc((p.name ?? 'Ученик').split(' ')[0]!);
  const diff = p.solvedWeek - p.solvedPrevWeek;
  const lines = [
    `👨‍👩‍👧 <b>Отчёт за неделю: ${name}</b>`,
    '',
    `🧩 Решено задач: <b>${p.solvedWeek}</b>${p.solvedPrevWeek || p.solvedWeek ? (diff > 0 ? ` (на ${diff} больше, чем неделей раньше)` : diff < 0 ? ` (неделей раньше — ${p.solvedPrevWeek})` : '') : ''}`,
    `📅 Дней с занятиями: <b>${p.activeDays7}</b> из 7${p.streak > 1 ? ` · серия 🔥${p.streak}` : ''}`,
  ];
  if (p.bySubject.length) lines.push(`📚 ${p.bySubject.map((x) => `${x.title} — ${x.solved}`).join(', ')}`);
  if (p.english.week) lines.push(`🇬🇧 Английский: уроков за неделю — ${p.english.week}`);
  if (p.mastered.length) lines.push(`✅ Освоено: ${esc(p.mastered.slice(0, 3).map((x) => x.title).join(', '))}`);
  if (p.weak.length) lines.push(`🟡 Стоит подтянуть: ${esc(p.weak.slice(0, 3).map((x) => x.title).join(', '))}`);
  if (school.isStudent) {
    lines.push('', `🎓 Занятий с преподавателем за месяц: <b>${school.lessonsDone30}</b>`);
    if (school.homework.total) lines.push(`📝 Домашка: сдано ${school.homework.complete} из ${school.homework.total}`);
    if (school.nextLesson) lines.push(`⏭ Следующее занятие: ${fmtWhen(school.nextLesson.startsAt)}`);
  }
  if (!p.solvedWeek && !school.isStudent) lines.push('', 'На этой неделе задач пока не было — самое время для задачи дня 🙂');
  const rows: Btn[][] = [];
  if (token) {
    if (siteUrl()) rows.push([{ text: '📊 Подробный отчёт', url: `${siteUrl()}/parents/${token}` }]);
    rows.push([cb('🔕 Отписаться от отчётов', `pu:${token}`)]);
  } else rows.push([cb('🧒 Подробно', `fc:${userId}`)], [{ text: '📊 Кабинет родителя', app: '/family' }]);
  return { text: lines.join('\n'), rows };
}

// ─── родителям: дети, расписание, домашка ───

const firstName = (name: string) => esc(name.split(' ')[0] ?? name);

async function childLines(childId: string) {
  const s = await childSummary(childId);
  if (!s) return null;
  const lines = [`🧒 <b>${firstName(s.child.name)}</b>`];
  const next = s.upcoming.find((l) => l.startsAt.getTime() > Date.now() - 30 * 60_000);
  lines.push(next ? `📅 ${fmtWhen(next.startsAt)} — ${esc(next.title)}` : '📅 Ближайших занятий пока нет');
  const waiting = s.homework.filter((h) => !h.complete && !h.overdue).length;
  const overdue = s.homework.filter((h) => h.overdue).length;
  if (waiting || overdue) lines.push(`📝 Домашка: ${waiting ? `${waiting} в работе` : ''}${waiting && overdue ? ' · ' : ''}${overdue ? `🟡 ${overdue} ждёт сдачи после срока` : ''}`);
  else if (s.homework.length) lines.push('📝 Домашка сдана ✅');
  const p = s.progress;
  lines.push(`🧩 За неделю: ${p.solvedWeek} ${p.solvedWeek % 10 === 1 && p.solvedWeek % 100 !== 11 ? 'задача' : 'задач'}${p.streak > 1 ? ` · серия 🔥${p.streak}` : ''}`);
  return { s, text: lines.join('\n') };
}

async function parentHome(user: User, fresh: boolean): Promise<Screen> {
  const ids = await childIdsOf(user.id);
  const lines = [fresh ? `Здравствуйте, ${firstName(user.name)}! Это кабинет родителя в <b>«Спектре»</b> 🌈\nЗдесь — расписание, домашка и успехи ваших детей.` : `👨‍👩‍👧 <b>Спектр</b> · кабинет родителя`, ''];
  const rows: Btn[][] = [];
  if (!ids.length) {
    lines.push('Пока ни один ребёнок не привязан.', '', 'Попросите ребёнка открыть в «Спектре» <b>Профиль → Родители</b> и продиктовать код из 6 символов, а затем введите его в кабинете 👇');
    rows.push([{ text: '➕ Добавить ребёнка', app: '/family' }]);
  } else {
    for (const id of ids) {
      const c = await childLines(id);
      if (!c) continue;
      lines.push(c.text, '');
      rows.push([cb(`🧒 ${c.s.child.name.split(' ')[0]} — подробно`, `fc:${id}`)]);
    }
    lines.push('<i>Утром пришлём, что у ребёнка сегодня, и напомним об уроке за 15 минут. По воскресеньям — сводка за неделю.</i>');
    rows.push([{ text: '📊 Кабинет родителя', app: '/family' }]);
  }
  rows.push([cb('✍️ Записать на занятие', 'book'), cb('💬 Написать в школу', 'ask')]);
  rows.push([cb('🧩 Задача дня', 'daily'), cb('⚙️', 'settings')]);
  return { text: lines.join('\n').trim(), rows };
}

async function childScreen(parentId: string, childId: string): Promise<Screen> {
  const linked = await prisma.familyLink.findUnique({ where: { parentId_childId: { parentId, childId } } });
  const s = linked ? await childSummary(childId) : null;
  if (!s) return { text: 'Не нашли этого ребёнка в вашем кабинете.', rows: [[cb('◀️ Назад', 'fam')]] };
  const name = firstName(s.child.name);
  const lines = [`🧒 <b>${name}</b> — сводка`, '', '📅 <b>Расписание</b>'];
  const upcoming = s.upcoming.filter((l) => l.startsAt.getTime() > Date.now() - 30 * 60_000).slice(0, 6);
  if (upcoming.length) for (const l of upcoming) lines.push(`• ${fmtWhen(l.startsAt)} — ${esc(l.title)} · ${esc(l.teacher)}`);
  else lines.push('Ближайших занятий пока нет.');
  if (s.homework.length) {
    lines.push('', '📝 <b>Домашка</b>');
    for (const h of s.homework.slice(0, 5)) {
      const state = h.complete ? '✅ сдано' : h.overdue ? '🟡 срок прошёл, ещё не сдано' : h.dueAt ? `⏳ до ${fmtWhen(h.dueAt)}` : '⏳ в работе';
      lines.push(`• «${esc(h.title)}» — ${state}`);
    }
    const comment = s.homework.find((h) => h.comment)?.comment;
    if (comment) lines.push('', `💬 Преподаватель: «${esc(comment.slice(0, 300))}»`);
  }
  const p = s.progress;
  lines.push('', `🧩 <b>Практика за неделю:</b> ${p.solvedWeek} задач, дней с занятиями — ${p.activeDays7} из 7${p.streak > 1 ? ` · серия 🔥${p.streak}` : ''}`);
  if (p.english.week) lines.push(`🇬🇧 Английский: ${p.english.week} ${p.english.week === 1 ? 'урок' : p.english.week < 5 ? 'урока' : 'уроков'} за неделю`);
  lines.push(`⭐ Уровень ${p.xp.level} · ${esc(p.xp.title)} · ${p.xp.total} XP`);
  if (p.mastered.length) lines.push(`✅ Получается: ${esc(p.mastered.slice(0, 3).map((x) => x.title).join(', '))}`);
  if (p.weak.length) lines.push(`🟡 Стоит подтянуть: ${esc(p.weak.slice(0, 3).map((x) => x.title).join(', '))}`);
  return { text: lines.join('\n'), rows: [[{ text: '📊 Подробно в кабинете', app: `/family?child=${childId}` }], [cb('◀️ Все дети', 'fam'), ...MENU]] };
}

/** Публичное: написать родителям ребёнка (сдал домашку, комментарий преподавателя). */
export async function notifyParents(childId: string, text: string, button?: { app?: string; label: string }) {
  if (!anyBot()) return;
  for (const pid of await parentIdsOf(childId)) await notifyUser(pid, text, button ?? { app: '/family', label: '📊 Кабинет родителя' });
}

/** Утренняя сводка родителю: занятия сегодня и домашка со сроком до завтра. */
async function parentMorning() {
  if (schoolHour() !== Number(process.env.BOT_PARENT_HOUR ?? 8)) return;
  const today = schoolDay();
  const links = await prisma.familyLink.findMany();
  for (const link of links) {
    const parent = await prisma.user.findUnique({ where: { id: link.parentId } });
    const chats = parent ? chatsOfUser(parent) : [];
    if (!chats.length) continue;
    const s = await childSummary(link.childId);
    if (!s) continue;
    const lessons = s.upcoming.filter((l) => schoolDay(l.startsAt) === today);
    const due = s.homework.filter((h) => !h.complete && h.dueAt && h.dueAt.getTime() - Date.now() < 36 * 3_600_000 && h.dueAt.getTime() > Date.now());
    if (!lessons.length && !due.length) continue;
    const name = firstName(s.child.name);
    const lines = [`☀️ <b>${name} — сегодня</b>`];
    for (const l of lessons) lines.push(`📅 ${fmtTime(l.startsAt)} — ${esc(l.title)} · ${esc(l.teacher)}`);
    for (const h of due) lines.push(`📝 «${esc(h.title)}» — сдать до ${fmtWhen(h.dueAt!)}`);
    if (lessons.length) lines.push('', 'За 15 минут до урока напомним здесь.');
    for (const chat of chats) {
      const player = await prisma.botPlayer.findUnique({ where: { chatId: chat } });
      if (player && !player.reminders) continue;
      const fresh = await prisma.botReminder.create({ data: { lessonId: `pm:${today}:${link.childId}`, chatId: chat } }).catch(() => null);
      if (!fresh) continue;
      await sendTo(chat, { text: lines.join('\n'), rows: [[cb(`🧒 ${s.child.name.split(' ')[0]} — подробно`, `fc:${link.childId}`)], [cb('Меню бота', 'menu')]] });
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

// ─── английское слово: перевод одним нажатием ───

function englishWord(note = ''): Screen {
  const ui = randomInt(EN_UNITS.length);
  const unit = EN_UNITS[ui]!;
  const wi = randomInt(unit.words.length);
  const w = unit.words[wi]!;
  const others = unit.words.map((_, i) => i).filter((i) => i !== wi);
  const picks = [wi];
  while (picks.length < 4) {
    const k = others.splice(randomInt(others.length), 1)[0]!;
    picks.push(k);
  }
  picks.sort(() => Math.random() - 0.5);
  return {
    text: `${note}🇬🇧 <b>Как переводится слово?</b>\n\n<b>${esc(w[0])}</b> ${w[2] ?? ''}\n\n<i>Раздел «${esc(unit.ru)}», ${unit.level}</i>`,
    rows: [
      picks.slice(0, 2).map((k) => cb(unit.words[k]![1], `ewa:${ui}:${wi}:${k}`)),
      picks.slice(2, 4).map((k) => cb(unit.words[k]![1], `ewa:${ui}:${wi}:${k}`)),
      [{ text: '📚 Уроки английского', app: '/english' }],
      MENU,
    ],
  };
}

function englishAnswer(data: string): { screen: Screen; ok: boolean } {
  const [, u, w, k] = data.split(':').map(Number);
  const unit = EN_UNITS[u!];
  const word = unit?.words[w!];
  if (!unit || !word) return { screen: englishWord(), ok: false };
  const ok = w === k;
  const note = ok ? `✅ <b>Верно!</b> ${esc(word[0])} — ${esc(word[1])}\n\n` : `🟡 <b>Почти!</b> ${esc(word[0])} — это «${esc(word[1])}»\n\n`;
  return { screen: englishWord(note), ok };
}

// «Вызов другу» по ссылке из бота: показываем, кто зовёт, и открываем задачи в мини-приложении
async function challengeScreen(id: string): Promise<Screen> {
  const c = /^[a-z0-9]{10,40}$/.test(id) ? await prisma.challenge.findUnique({ where: { id }, include: { runs: { orderBy: [{ score: 'desc' }, { timeMs: 'asc' }], take: 1 } } }) : null;
  if (!c) return { text: 'Этот вызов не нашёлся — зато можно создать свой в любом тренажёре 🙂', rows: [[{ text: '🏋️ Тренажёры', app: '/practice/trainers' }], MENU] };
  const gen = findGenerator(c.trainerId);
  const best = c.runs[0];
  return {
    text: `⚔️ <b>${esc(c.creatorName)} бросает вам вызов!</b>\n\n5 задач «${esc(gen?.title ?? 'тренажёр')}» — у всех одинаковые.${best ? `\nПланка: <b>${best.score} из 5</b> (${esc(best.name)}).` : ''}\n\nСможете лучше?`,
    rows: [[{ text: '⚔️ Принять вызов', app: `/challenge/${c.id}` }], MENU],
  };
}

async function parentSubscribe(m: Inbound, player: BotPlayer, token: string) {
  const report = await parentReport(token);
  if (!report) return show(m, player, { text: 'Ссылка на отчёт больше не действует. Попросите ребёнка поделиться новой в «Моём прогрессе».', rows: [MENU] });
  await prisma.parentSub.upsert({ where: { token_chatId: { token, chatId: m.chatId } }, create: { token, chatId: m.chatId }, update: {} });
  void track({ type: 'parent_subscribe', playerId: m.chatId });
  return show(m, player, {
    text: `✅ <b>Вы подписаны на отчёт.</b> Каждое воскресенье вечером здесь будет короткая сводка: сколько решено, что получается, что подтянуть.\n\n${report.text}`,
    rows: [...report.rows, MENU],
  });
}

async function weeklyParentReports() {
  if (schoolWeekday() !== 0 || schoolHour() !== Number(process.env.BOT_REPORT_HOUR ?? 19)) return;
  const today = schoolDay();
  // родители с кабинетом получают сводку по каждому ребёнку
  for (const link of await prisma.familyLink.findMany()) {
    const parent = await prisma.user.findUnique({ where: { id: link.parentId } });
    for (const chat of parent ? chatsOfUser(parent) : []) {
      const fresh = await prisma.botReminder.create({ data: { lessonId: `pw:${today}:${link.childId}`, chatId: chat } }).catch(() => null);
      if (!fresh) continue;
      await sendTo(chat, await weeklyReport(link.childId, null));
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  const subs = await prisma.parentSub.findMany({ where: { OR: [{ lastSent: null }, { lastSent: { not: today } }] } });
  for (const sub of subs) {
    await prisma.parentSub.update({ where: { id: sub.id }, data: { lastSent: today } });
    const link = await prisma.parentLink.findUnique({ where: { token: sub.token } });
    const report = await parentReport(sub.token);
    if (!report || !link) {
      await prisma.parentSub.delete({ where: { id: sub.id } }).catch(() => {});
      continue;
    }
    // этот чат уже получил сводку по ребёнку через кабинет родителя
    const dup = await prisma.botReminder.create({ data: { lessonId: `pw:${today}:${link.userId}`, chatId: sub.chatId } }).catch(() => null);
    if (!dup) continue;
    await sendTo(sub.chatId, report);
    await new Promise((r) => setTimeout(r, 60));
  }
}

// ─── входящие ───

export async function handle(m: Inbound) {
  try {
    await route(m);
  } catch (err) {
    log?.error({ err }, 'бот: ошибка обработки');
    if (m.callbackId) await adapters.get(m.platform)?.toast(m.callbackId, 'Что-то пошло не так, попробуйте ещё раз');
  }
}

async function route(m: Inbound) {
  const a = adapters.get(m.platform)!;
  const existed = await prisma.botPlayer.findUnique({ where: { chatId: m.chatId } });
  let player = await upsertPlayer(m);

  if (m.kind === 'start') {
    flows.delete(m.chatId);
    const payload = m.payload ?? '';
    if (!existed) void track({ type: 'bot_start', playerId: m.chatId, label: payload || m.platform });
    if (!existed && payload.startsWith('r_')) {
      const inviterId = m.platform === 'max' ? `max:${payload.slice(2)}` : payload.slice(2);
      const inviter = inviterId !== m.chatId ? await prisma.botPlayer.findUnique({ where: { chatId: inviterId } }) : null;
      if (inviter) {
        await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { invitedBy: inviter.chatId, source: 'invite' } });
        await prisma.botPlayer.update({ where: { chatId: inviter.chatId }, data: { invited: { increment: 1 }, bonus: { increment: 1 } } });
        await sendTo(inviter.chatId, { text: `🎁 ${esc(m.who.firstName)} пришёл(а) по вашей ссылке — +1 вопрос в «Радуге знаний»!`, rows: [[cb('🌈 Играть', 'quiz')]] });
      }
    }
    if (!existed && payload.startsWith('src_')) await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { source: payload.slice(4, 60) } });
    if (payload.startsWith('l_')) return linkAsk(m, player, payload.slice(2));
    if (payload.startsWith('p_')) return parentSubscribe(m, player, payload.slice(2));
    if (payload.startsWith('ch_')) return show(m, player, await challengeScreen(payload.slice(3)));
    if (payload === 'book') return bookStart(m, player);
    if (payload === 'daily') return show(m, player, await dailyScreen(player));
    if (payload === 'quiz') return show(m, player, await quizScreen(m, player));
    if (payload === 'test') {
      testScores.set(m.chatId, {});
      return show(m, player, testStep(0));
    }
    return show(m, player, await homeScreen(player, !existed));
  }

  if (m.kind === 'callback') return onCallback(m, player);

  // текст или контакт
  if (m.replyTo) {
    const relay = /^\d+$/.test(m.replyTo)
      ? await prisma.botRelay.findUnique({ where: { adminChatId_adminMessageId: { adminChatId: m.chatId, adminMessageId: Number(m.replyTo) } } })
      : null;
    if (relay?.ticketId && m.text) return adminReplySend(m, player, relay.ticketId, m.text);
  }

  const text = m.text?.trim() ?? '';
  const command = text.startsWith('/') ? text.split(/[ @]/)[0] : '';
  if (command) {
    flows.delete(m.chatId);
    switch (command) {
      case '/menu':
        return show(m, player, await homeScreen(player, false));
      case '/daily':
        return show(m, player, await dailyScreen(player));
      case '/train':
        return show(m, player, player.grade ? subjectScreen(player.grade) : gradeScreen());
      case '/quiz':
        return show(m, player, await quizScreen(m, player));
      case '/lessons':
        return show(m, player, await lessonsScreen(m.chatId));
      case '/homework':
        return show(m, player, await homeworkScreen(m.chatId));
      case '/formulas':
        return show(m, player, formulasSubjects());
      case '/book':
        return bookStart(m, player);
      case '/ask':
        return askScreen(m, player);
      case '/top':
        return show(m, player, await topScreen(player));
      case '/color':
        testScores.set(m.chatId, {});
        return show(m, player, testStep(0));
      case '/invite':
        return show(m, player, inviteScreen(m, player));
      case '/settings':
        return show(m, player, settingsScreen(player, await linkedUser(m.chatId)));
      case '/stats':
      case '/admin': {
        const u = await linkedUser(m.chatId);
        return show(m, player, u?.role === 'ADMIN' ? await adminHome() : await homeScreen(player, false));
      }
    }
    return show(m, player, await homeScreen(player, false));
  }

  const flow = flows.get(m.chatId);
  if (flow?.kind === 'book' && flow.format) {
    if (m.phone) return bookFinish(m, player, m.phone.startsWith('+') ? m.phone : `+${m.phone}`);
    if (text.length >= 5) return bookFinish(m, player, text);
    if (m.messageId) void a.remove(m.chatId, m.messageId);
    return;
  }
  if (flow?.kind === 'ask' && text) return askSend(m, player, text);
  if (flow?.kind === 'daily' && text) return answerDaily(m, player, text);
  if (flow?.kind === 'train' && text) return trainAnswer(m, player, text);
  if (flow?.kind === 'admin_reply' && text) return adminReplySend(m, player, flow.ticketId, text);
  if (flow?.kind === 'teacher_link' && text) {
    flows.delete(m.chatId);
    const url = text.match(/https?:\/\/\S+/)?.[0];
    if (!url) return show(m, player, await teacherLessonCard(flow.lessonId, '⚠️ Это не похоже на ссылку. Нужна ссылка вида https://…'));
    const user = await linkedUser(m.chatId);
    const lesson = await prisma.lesson.findFirst({ where: { id: flow.lessonId, teacherId: user?.teacher?.id ?? '-' } });
    if (lesson) await prisma.lesson.update({ where: { id: lesson.id }, data: { link: url } });
    return show(m, player, await teacherLessonCard(flow.lessonId, lesson ? '✅ Ссылка сохранена — ученики получат её за 15 минут до урока.' : 'Урок не найден'));
  }

  // число без активного сценария — вероятно, ответ на задачу дня
  const today = schoolDay();
  if (/^[-+]?\d+([.,]\d+)?$/.test(text) && player.dailyDay !== today && dailyProblem(today).problem.kind !== 'choice') return answerDaily(m, player, text);
  player = await prisma.botPlayer.findUniqueOrThrow({ where: { chatId: m.chatId } });
  return show(m, player, await homeScreen(player, false));
}

async function onCallback(m: Inbound, player: BotPlayer) {
  const a = adapters.get(m.platform)!;
  const data = m.data ?? '';
  if (data.startsWith('pu:')) {
    await prisma.parentSub.deleteMany({ where: { token: data.slice(3), chatId: m.chatId } });
    if (m.callbackId) await adapters.get(m.platform)!.toast(m.callbackId, 'Отписали от отчётов');
    return show(m, player, { text: '🔕 Больше не будем присылать отчёты. Подписаться снова можно по ссылке от ребёнка.', rows: [MENU] });
  }
  if (data === 'ew') {
    if (m.callbackId) await a.toast(m.callbackId);
    return show(m, player, englishWord());
  }
  if (data.startsWith('ewa:')) {
    const r = englishAnswer(data);
    if (m.callbackId) await a.toast(m.callbackId, r.ok ? 'Верно! 🎉' : 'Почти! Запомним 👇');
    return show(m, player, r.screen);
  }
  if (data === 'fam' || data.startsWith('fc:')) {
    if (m.callbackId) await a.toast(m.callbackId);
    const user = await linkedUser(m.chatId);
    if (!user) return show(m, player, notLinkedScreen('Сводка о детях доступна в аккаунте родителя.'));
    return show(m, player, data === 'fam' ? await parentHome(user, false) : await childScreen(user.id, data.slice(3)));
  }
  if (data.startsWith('lk:')) {
    if (m.callbackId) await adapters.get(m.platform)!.toast(m.callbackId);
    return linkAccount(m, player, data.slice(3));
  }
  if (data.startsWith('qa:')) return answerQuiz(m, player);
  if (data.startsWith('ta:')) return testAnswer(m, player);
  if (data.startsWith('da:')) {
    const [, pid, opt] = data.split(':');
    if (pid !== dailyProblem(schoolDay()).problem.id) {
      await a.toast(m.callbackId!, 'Это вчерашняя задача — вот сегодняшняя');
      return show(m, player, await dailyScreen(player));
    }
    return answerDaily(m, player, opt ?? '');
  }
  if (m.callbackId) await a.toast(m.callbackId);
  // ушли из записи — убираем подсказку и клавиатуру запроса телефона
  const bookFlow = flows.get(m.chatId);
  if (bookFlow?.kind === 'book' && bookFlow.prompt && !/^b[cfu]/.test(data)) {
    void a.remove(m.chatId, bookFlow.prompt);
    bookFlow.prompt = undefined;
    await a.clearContact(m.chatId);
  }

  // запись
  if (data.startsWith('bc:')) {
    const id = data.slice(3);
    const course = id === 'none' ? null : await prisma.course.findUnique({ where: { id } });
    flows.set(m.chatId, { kind: 'book', courseId: course?.id, courseTitle: course?.title });
    return show(m, player, {
      text: `✍️ <b>Запись на занятие</b> · шаг 2 из 3\n${course ? `📚 ${esc(course.title)}\n` : ''}\nКак удобнее заниматься?`,
      rows: [[cb('👤 Индивидуально', 'bf:I'), cb('👥 Мини-группа до 6', 'bf:G')], [cb('◀️ Назад', 'book'), ...MENU]],
    });
  }
  if (data.startsWith('bf:')) {
    const flow = flows.get(m.chatId);
    if (flow?.kind !== 'book') return bookStart(m, player);
    flow.format = data.slice(3) === 'G' ? 'GROUP' : 'INDIVIDUAL';
    return bookContact(m, player);
  }
  if (data === 'bu') {
    const contact = m.platform === 'telegram' && m.who.username ? `Telegram @${m.who.username}` : `MAX: ${[m.who.firstName, m.who.lastName].filter(Boolean).join(' ')} (написать через бота)`;
    return bookFinish(m, player, contact);
  }

  // тренажёр
  if (data === 'tr0') return show(m, player, gradeScreen());
  if (data === 'tr') return show(m, player, player.grade ? subjectScreen(player.grade) : gradeScreen());
  if (data.startsWith('tg:')) {
    const grade = Number(data.slice(3));
    if (grade >= 5 && grade <= 11) player = await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { grade } });
    return show(m, player, subjectScreen(player.grade ?? 7));
  }
  if (data.startsWith('ts:')) return trainNext(m, player, data.slice(3));
  if (data === 'th') {
    const flow = flows.get(m.chatId);
    const parsed = flow?.kind === 'train' ? parseGenId(flow.problemId) : null;
    if (parsed) {
      const { problem } = makeProblem(parsed.gen.id, parsed.seed)!;
      return show(m, player, {
        text: `💡 <i>${esc(problem.hint)}</i>\n\n🏋️ <b>${esc(parsed.gen.title)}</b>\n\n${problemBody(problem.text)}\n\n✍️ <b>Напишите ответ сообщением</b>`,
        rows: [[cb('🙈 Показать решение', 'tv')], [cb('➡️ Другая задача', `ts:${parsed.gen.subject}`)], MENU],
      });
    }
    return show(m, player, player.grade ? subjectScreen(player.grade) : gradeScreen());
  }
  if (data === 'tv') return trainAnswer(m, player, '', true);

  // шпаргалки
  if (data === 'f') {
    void track({ type: 'bot_formulas', playerId: m.chatId });
    return show(m, player, formulasSubjects());
  }
  if (data.startsWith('fs:')) return show(m, player, formulasTopics(data.slice(3)));
  if (data.startsWith('ft:')) {
    const [, s, t] = data.split(':');
    void track({ type: 'bot_formulas', playerId: m.chatId, path: `/practice/${s}/${t}` });
    return show(m, player, formulasCard(s!, t!));
  }

  // админка
  const isAdmin = async () => (await linkedUser(m.chatId))?.role === 'ADMIN';
  if (['adm', 'ab', 'at', 'as'].includes(data) || /^(bk|bs|tk|ar|tc):/.test(data)) {
    if (!(await isAdmin())) return show(m, player, await homeScreen(player, false));
    if (data === 'adm') return show(m, player, await adminHome());
    if (data === 'ab') return show(m, player, await adminBookings());
    if (data === 'at') return show(m, player, await adminTickets());
    if (data === 'as') return show(m, player, await adminStats());
    if (data.startsWith('bk:')) return show(m, player, await bookingCard(data.slice(3)));
    if (data.startsWith('bs:')) {
      const [, id, status] = data.split(':');
      await prisma.booking.update({ where: { id: id! }, data: { status: status! } });
      return show(m, player, await bookingCard(id!, '✅ Статус обновлён'));
    }
    if (data.startsWith('tk:')) return show(m, player, await ticketCard(data.slice(3)));
    if (data.startsWith('tc:')) {
      await prisma.supportTicket.update({ where: { id: data.slice(3) }, data: { status: 'CLOSED' } });
      return show(m, player, await adminTickets());
    }
    if (data.startsWith('ar:')) {
      flows.set(m.chatId, { kind: 'admin_reply', ticketId: data.slice(3) });
      const card = await ticketCard(data.slice(3));
      return show(m, player, { text: `${card.text}\n\n✍️ <b>Напишите ответ сообщением</b> — он уйдёт ученику и сохранится в обращении.`, rows: [[cb('✖️ Отмена', `tk:${data.slice(3)}`)]] });
    }
  }

  // преподаватель
  if (data === 't') return show(m, player, await teacherScreen(m.chatId));
  if (data.startsWith('tl:')) return show(m, player, await teacherLessonCard(data.slice(3)));
  if (data.startsWith('tL:')) {
    flows.set(m.chatId, { kind: 'teacher_link', lessonId: data.slice(3) });
    const card = await teacherLessonCard(data.slice(3));
    return show(m, player, { text: `${card.text}\n\n🔗 <b>Пришлите ссылку на урок сообщением</b> (Zoom, Телемост, Meet…)`, rows: [[cb('✖️ Отмена', `tl:${data.slice(3)}`)]] });
  }

  switch (data) {
    case 'menu':
      flows.delete(m.chatId);
      return show(m, player, await homeScreen(player, false));
    case 'daily':
      flows.set(m.chatId, { kind: 'daily', problemId: dailyProblem(schoolDay()).problem.id });
      return show(m, player, await dailyScreen(player));
    case 'dh':
      return show(m, player, await dailyScreen(player, { hint: true }));
    case 'dg':
      return answerDaily(m, player, '', true);
    case 'quiz':
      return show(m, player, await quizScreen(m, player));
    case 'top':
      return show(m, player, await topScreen(player));
    case 'test':
      testScores.set(m.chatId, {});
      return show(m, player, testStep(0));
    case 'lessons':
      void track({ type: 'bot_lessons', playerId: m.chatId });
      return show(m, player, await lessonsScreen(m.chatId));
    case 'hw':
      return show(m, player, await homeworkScreen(m.chatId));
    case 'book':
      return bookStart(m, player);
    case 'ask':
      return askScreen(m, player);
    case 'invite':
      return show(m, player, inviteScreen(m, player));
    case 'settings':
      return show(m, player, settingsScreen(player, await linkedUser(m.chatId)));
    case 'sr':
      player = await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { reminders: !player.reminders } });
      return show(m, player, settingsScreen(player, await linkedUser(m.chatId)));
    case 'sd':
    case 'np':
      player = await prisma.botPlayer.update({ where: { chatId: m.chatId }, data: { dailyPush: data === 'np' ? false : !player.dailyPush } });
      return show(m, player, settingsScreen(player, await linkedUser(m.chatId)));
  }
  return show(m, player, await homeScreen(player, false));
}

// ─── фоновые задачи: напоминания о занятиях и о задаче дня ───

async function lessonReminders() {
  const now = Date.now();
  const lessons = await prisma.lesson.findMany({
    where: { status: 'SCHEDULED', startsAt: { gte: new Date(now + 60_000), lte: new Date(now + 16 * 60_000) } },
    include: { group: { include: { members: { include: { user: true } } } }, student: true, teacher: { include: { user: true } } },
  });
  for (const l of lessons) {
    const people = [...(l.group?.members.map((x) => x.user) ?? []), ...(l.student ? [l.student] : []), l.teacher.user];
    for (const p of people) {
      for (const chat of chatsOfUser(p)) {
        const player = await prisma.botPlayer.findUnique({ where: { chatId: chat } });
        if (!player?.reminders) continue;
        const fresh = await prisma.botReminder.create({ data: { lessonId: l.id, chatId: chat } }).catch(() => null);
        if (!fresh) continue;
        const minutes = Math.max(1, Math.round((l.startsAt.getTime() - now) / 60_000));
        const isTeacher = p.id === l.teacher.userId;
        const rows: Btn[][] = [];
        if (l.link) rows.push([{ text: '🎥 Подключиться к уроку', url: l.link }]);
        else if (isTeacher) rows.push([cb('🔗 Добавить ссылку', `tL:${l.id}`)]);
        rows.push([{ text: 'Открыть занятие', app: isTeacher ? '/teach' : '/app/schedule' }]);
        await sendTo(chat, {
          text:
            `⏰ Через ${minutes} мин: <b>${esc(l.title)}</b> в ${fmtTime(l.startsAt)}\n` +
            (isTeacher ? (l.group ? `Группа: ${esc(l.group.name)}` : `Ученик: ${esc(l.student?.name ?? '')}`) : `Преподаватель: ${esc(l.teacher.user.name)}`) +
            (l.link ? '' : isTeacher ? '\n\n⚠️ Ссылка на урок ещё не добавлена.' : '\n\nСсылку преподаватель добавит в кабинет.'),
          rows,
        });
      }
    }
    // родителям учеников: «через 15 минут у Ивана урок»
    const kids = [...(l.group?.members.map((x) => x.user) ?? []), ...(l.student ? [l.student] : [])];
    for (const kid of kids) {
      for (const pid of await parentIdsOf(kid.id)) {
        const parent = await prisma.user.findUnique({ where: { id: pid } });
        for (const chat of parent ? chatsOfUser(parent) : []) {
          const player = await prisma.botPlayer.findUnique({ where: { chatId: chat } });
          if (player && !player.reminders) continue;
          const fresh = await prisma.botReminder.create({ data: { lessonId: `${l.id}:${kid.id}`, chatId: chat } }).catch(() => null);
          if (!fresh) continue;
          const minutes = Math.max(1, Math.round((l.startsAt.getTime() - now) / 60_000));
          await sendTo(chat, {
            text: `⏰ ${firstName(kid.name)}: через ${minutes} мин занятие <b>${esc(l.title)}</b> в ${fmtTime(l.startsAt)}\nПреподаватель: ${esc(l.teacher.user.name)}`,
            rows: [[cb(`🧒 ${kid.name.split(' ')[0]} — подробно`, `fc:${kid.id}`)], [cb('Меню бота', 'menu')]],
          });
        }
      }
    }
  }
}

async function dailyPush() {
  const hour = Number(process.env.BOT_DAILY_HOUR ?? 19);
  if (schoolHour() !== hour) return;
  const today = schoolDay();
  const players = await prisma.botPlayer.findMany({
    where: { dailyPush: true, lastSeen: { gte: new Date(Date.now() - 21 * 86_400_000) }, OR: [{ dailyDay: null }, { dailyDay: { not: today } }] },
  });
  const { subject, topic } = dailyProblem(today);
  for (const p of players) {
    if (p.dailyPushDay === today || !adapters.has(p.platform as Platform)) continue;
    await prisma.botPlayer.update({ where: { chatId: p.chatId }, data: { dailyPushDay: today } });
    const monday = schoolWeekday() === 1;
    await sendTo(p.chatId, {
      text:
        `🧩 <b>Задача дня ждёт</b>\n${subject.emoji} ${subject.title} → ${esc(topic.title)}${p.dailyStreak ? `\n\n🔥 Серия ${p.dailyStreak} — не прерывайте!` : ''}` +
        (monday ? '\n\n🏆 А ещё стартовал новый Турнир недели: 10 задач, 20 минут, сертификат каждому.' : ''),
      rows: [[cb('🧩 Решить', 'daily')], ...(monday ? [[{ text: '🏆 Турнир недели', app: '/tournament' } as Btn]] : []), [cb('🔕 Не напоминать', 'np')]],
    });
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Напоминания о сроке домашки: за сутки и за два часа, если задание ещё не сделано. */
async function homeworkReminders() {
  const now = Date.now();
  const list = await prisma.assignment.findMany({
    where: { dueAt: { gte: new Date(now), lte: new Date(now + 24 * 3_600_000) }, createdAt: { lte: new Date(now - 3_600_000) } },
    include: { marks: true, teacher: { include: { user: true } }, group: { include: { members: true } } },
  });
  for (const a of list) {
    const left = a.dueAt!.getTime() - now;
    const kind = left <= 2 * 3_600_000 ? 'hw2' : 'hw24';
    const userIds = a.studentId ? [a.studentId] : (a.group?.members.map((m) => m.userId) ?? []);
    const st = await statuses([a], userIds);
    for (const uid of userIds) {
      if (st.get(`${a.id}:${uid}`)?.complete) continue;
      const user = await prisma.user.findUnique({ where: { id: uid } });
      if (!user) continue;
      for (const chat of chatsOfUser(user)) {
        const fresh = await prisma.botReminder.create({ data: { lessonId: `${kind}:${a.id}`, chatId: chat } }).catch(() => null);
        if (!fresh) continue;
        await sendTo(chat, {
          text: `📝 <b>${kind === 'hw2' ? 'Скоро сдавать домашку' : 'Завтра сдавать домашку'}</b>\n«${esc(a.title)}» · ${esc(a.teacher.user.name)}\nСрок: ${fmtWhen(a.dueAt!)}\n\nЕщё есть время — всё получится 💪`,
          rows: [[{ text: '📝 Открыть домашку', app: '/app/homework' }], [cb('Меню бота', 'menu')]],
        });
      }
    }
  }
}

let loopsStarted = false;
export function startLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  setInterval(() => lessonReminders().catch((err) => log.error({ err }, 'бот: напоминания')), 60_000);
  setInterval(() => dailyPush().catch((err) => log.error({ err }, 'бот: задача дня')), 10 * 60_000);
  setInterval(() => weeklyParentReports().catch((err) => log.error({ err }, 'бот: отчёты родителям')), 10 * 60_000);
  setInterval(() => homeworkReminders().catch((err) => log.error({ err }, 'бот: напоминания о домашке')), 10 * 60_000);
  setInterval(() => parentMorning().catch((err) => log.error({ err }, 'бот: утро родителям')), 10 * 60_000);
}

export { findProblem };
