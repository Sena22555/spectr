import type { FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';

// Сбор аналитики: события с сайта, из мини-приложений и ботов.
// Посетителя браузер узнаёт по своему id (localStorage) и присылает его в заголовке x-visitor.

const VISITOR_RE = /^[a-zA-Z0-9-]{8,64}$/;

export function visitorIdOf(req: FastifyRequest) {
  const raw = req.headers['x-visitor'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && VISITOR_RE.test(id) ? id : null;
}

/** Пользователь из токена, если он есть и валиден (без ошибки, если нет). */
export async function optionalUser(req: FastifyRequest) {
  if (!req.headers.authorization) return null;
  try {
    await req.jwtVerify();
    return req.user.sub;
  } catch {
    return null;
  }
}

/** Записать событие. Ошибки аналитики никогда не ломают основной сценарий. */
export async function track(e: { type: string; visitorId?: string | null; userId?: string | null; playerId?: string | null; path?: string | null; label?: string | null }) {
  try {
    await prisma.event.create({
      data: {
        type: e.type,
        visitorId: e.visitorId ?? null,
        userId: e.userId ?? null,
        playerId: e.playerId ?? null,
        path: e.path?.slice(0, 300) ?? null,
        label: e.label?.slice(0, 300) ?? null,
      },
    });
  } catch {
    /* аналитика не обязательна */
  }
}

/** Привязать посетителя к аккаунту после входа или регистрации. */
export async function linkVisitor(visitorId: string | null, userId: string) {
  if (!visitorId) return;
  await prisma.visitor.updateMany({ where: { id: visitorId, userId: null }, data: { userId } }).catch(() => {});
}

const SEARCH = /(google|yandex|ya\.ru|bing|duckduckgo|mail\.ru|rambler)\./;
const SOCIAL = /(vk\.com|vk\.ru|ok\.ru|instagram|facebook|youtube|dzen|tiktok|pinterest)/;

/** Откуда пришёл посетитель: по utm, площадке и referrer. */
export function sourceOf(input: { platform: string; referrer?: string | null; utmSource?: string | null; utmMedium?: string | null; host?: string }) {
  if (input.platform === 'telegram') return 'telegram';
  if (input.platform === 'vk') return 'vk';
  if (input.platform === 'max') return 'max';
  const utm = input.utmSource?.toLowerCase();
  if (utm) {
    if (/tg|telegram/.test(utm)) return 'telegram';
    if (/vk/.test(utm)) return 'vk';
    if (/max/.test(utm)) return 'max';
    if (/cpc|ads|direct|target/.test(`${utm} ${input.utmMedium ?? ''}`)) return 'ads';
    return 'referral';
  }
  const ref = input.referrer?.toLowerCase() ?? '';
  if (!ref) return 'direct';
  try {
    const host = new URL(ref).host;
    if (input.host && host === input.host) return 'direct';
    if (SEARCH.test(host)) return 'search';
    if (/t\.me|telegram/.test(host)) return 'telegram';
    if (/max\.ru/.test(host)) return 'max';
    if (SOCIAL.test(host)) return 'social';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export const SOURCE_LABEL: Record<string, string> = {
  direct: 'Прямые заходы',
  search: 'Поиск',
  social: 'Соцсети',
  telegram: 'Telegram',
  vk: 'ВКонтакте',
  max: 'MAX',
  referral: 'Ссылки и партнёры',
  ads: 'Реклама',
  bot_telegram: 'Бот в Telegram',
  bot_max: 'Бот в MAX',
};

/** Хранить события больше 400 дней незачем — чистим раз в сутки. */
export function startEventPruning() {
  const prune = () => prisma.event.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 400 * 86_400_000) } } }).catch(() => {});
  setTimeout(prune, 60_000);
  setInterval(prune, 86_400_000);
}
