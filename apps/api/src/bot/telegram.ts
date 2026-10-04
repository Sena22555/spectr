import type { FastifyBaseLogger } from 'fastify';
import { handle, registerAdapter } from './core.js';
import type { Adapter, Btn, Inbound, Screen } from './types.js';

// Telegram: клиент Bot API без библиотек, адаптер экранов и long polling.

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  reply_to_message?: { message_id: number };
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}

class TelegramError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export function startTelegram(token: string, webAppUrl: string, log: FastifyBaseLogger) {
  const base = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';

  async function call<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
    const res = await fetch(`${base}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as { ok: boolean; result: T; description?: string; error_code?: number } | null;
    if (!data?.ok) throw new TelegramError(data?.error_code ?? res.status, data?.description ?? `Telegram ${method}: ${res.status}`);
    return data.result;
  }

  const button = (b: Btn) => {
    if ('data' in b) return { text: b.text, callback_data: b.data };
    if ('url' in b) return { text: b.text, url: b.url };
    if ('app' in b) return webAppUrl ? { text: b.text, web_app: { url: `${webAppUrl}${b.app}` } } : { text: b.text, callback_data: 'menu' };
    return { text: b.text, callback_data: 'menu' };
  };
  const markup = (s: Screen) => ({ inline_keyboard: s.rows.map((r) => r.filter((b) => !('contact' in b)).map(button)).filter((r) => r.length) });

  const adapter: Adapter = {
    platform: 'telegram',
    username: null,
    async send(chatId, screen) {
      const msg = await call<TgMessage>('sendMessage', { chat_id: chatId, text: screen.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup(screen) });
      return String(msg.message_id);
    },
    async edit(chatId, messageId, screen) {
      try {
        await call('editMessageText', { chat_id: chatId, message_id: Number(messageId), text: screen.text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup(screen) });
        return true;
      } catch (err) {
        return /not modified/.test((err as Error).message);
      }
    },
    async remove(chatId, messageId) {
      await call('deleteMessage', { chat_id: chatId, message_id: Number(messageId) }).catch(() => {});
    },
    async toast(callbackId, text, alert = false) {
      await call('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: alert }).catch(() => {});
    },
    async askContact(chatId, screen) {
      const msg = await call<TgMessage>('sendMessage', {
        chat_id: chatId,
        text: screen.text,
        parse_mode: 'HTML',
        reply_markup: { keyboard: [[{ text: '📱 Отправить мой номер', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
      }).catch(() => null);
      return msg ? String(msg.message_id) : null;
    },
    async clearContact(chatId) {
      // убрать клавиатуру можно только сообщением — отправляем служебное и сразу удаляем
      const msg = await call<TgMessage>('sendMessage', { chat_id: chatId, text: '…', reply_markup: { remove_keyboard: true }, disable_notification: true }).catch(() => null);
      if (msg) await call('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
    },
    inviteLink(payload) {
      return `https://t.me/${adapter.username}?start=${payload}`;
    },
  };

  async function setup() {
    const me = await call<{ username: string }>('getMe');
    adapter.username = me.username;
    await call('deleteWebhook', {});
    await call('setMyCommands', {
      commands: [
        { command: 'menu', description: 'Главное меню' },
        { command: 'daily', description: 'Задача дня' },
        { command: 'quiz', description: 'Радуга знаний' },
        { command: 'formulas', description: 'Шпаргалки с формулами' },
        { command: 'lessons', description: 'Мои занятия' },
        { command: 'homework', description: 'Домашние задания' },
        { command: 'book', description: 'Записаться на занятие' },
        { command: 'ask', description: 'Написать в школу' },
        { command: 'settings', description: 'Настройки и напоминания' },
      ],
    });
    if (webAppUrl) await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Спектр', web_app: { url: webAppUrl } } });
    await call('setMyShortDescription', { short_description: 'Онлайн-школа «Спектр»: задача дня, шпаргалки, расписание и запись на занятия 🌈' }).catch(() => {});
    await call('setMyDescription', {
      description:
        'Онлайн-школа занятий с репетитором «Спектр».\n\n🧩 Задача дня с разбором\n🌈 «Радуга знаний»\n📚 Шпаргалки с формулами\n📅 Расписание и ссылка на урок за 15 минут\n✍️ Запись на занятие за минуту',
    }).catch(() => {});
    registerAdapter(adapter, log);
    log.info(`бот Telegram @${adapter.username} запущен, мини-приложение: ${webAppUrl || 'не задано'}`);
  }

  const toInbound = (u: TgUpdate): Inbound | null => {
    if (u.callback_query) {
      const q = u.callback_query;
      if (q.message && q.message.chat.type !== 'private') return null;
      return {
        platform: 'telegram',
        chatId: String(q.from.id),
        who: { id: String(q.from.id), firstName: q.from.first_name, lastName: q.from.last_name, username: q.from.username },
        kind: 'callback',
        data: q.data,
        messageId: q.message ? String(q.message.message_id) : undefined,
        callbackId: q.id,
      };
    }
    const msg = u.message;
    if (!msg?.from || msg.chat.type !== 'private') return null;
    const who = { id: String(msg.from.id), firstName: msg.from.first_name, lastName: msg.from.last_name, username: msg.from.username };
    const common = { platform: 'telegram' as const, chatId: String(msg.chat.id), who, messageId: String(msg.message_id), replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined };
    if (msg.contact) return { ...common, kind: 'contact', phone: msg.contact.phone_number };
    const text = msg.text ?? '';
    if (text.startsWith('/start')) return { ...common, kind: 'start', payload: text.split(' ')[1] ?? '' };
    return { ...common, kind: 'text', text };
  };

  void (async () => {
    for (;;) {
      try {
        await setup();
        break;
      } catch (err) {
        log.error({ err }, 'бот Telegram: не удалось запуститься, повтор через минуту');
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
    let offset = 0;
    let failures = 0;
    for (;;) {
      try {
        const updates = await call<TgUpdate[]>('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, 35_000);
        failures = 0;
        for (const u of updates) {
          offset = u.update_id + 1;
          const m = toInbound(u);
          if (m) await handle(m);
        }
      } catch (err) {
        // связь с api.telegram.org из России иногда рвётся — это нормально, просто повторяем
        if (++failures >= 3) log.warn({ err }, 'бот Telegram: getUpdates не отвечает');
        await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * failures)));
      }
    }
  })();

  return adapter;
}
