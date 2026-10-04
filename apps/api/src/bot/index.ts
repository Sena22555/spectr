import type { FastifyBaseLogger } from 'fastify';
import { getAdapter, startLoops } from './core.js';
import { startTelegram } from './telegram.js';
import { startMax } from './max.js';

// Боты «Спектра»: Telegram и MAX работают на одном ядре (core.ts) внутри процесса API.
// Telegram включается при TELEGRAM_BOT_TOKEN, MAX — при MAX_BOT_TOKEN. BOT_POLLING=0 выключает оба.

export { botSendTo, notifyNewBooking, notifyTicketFromWeb, notifyTicketReply, notifyUser } from './core.js';

export const getBotUsername = () => getAdapter('telegram')?.username ?? null;
export const getMaxUsername = () => getAdapter('max')?.username ?? null;

export function startBot(log: FastifyBaseLogger) {
  if (process.env.BOT_POLLING === '0') return;
  const webAppUrl = (
    process.env.TELEGRAM_WEBAPP_URL ||
    (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('https://')) ||
    ''
  ).replace(/\/$/, '');
  let any = false;
  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegram(process.env.TELEGRAM_BOT_TOKEN, webAppUrl, log);
    any = true;
  }
  if (process.env.MAX_BOT_TOKEN) {
    startMax(process.env.MAX_BOT_TOKEN, log);
    any = true;
  }
  if (any) startLoops();
}
