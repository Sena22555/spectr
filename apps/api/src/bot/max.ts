import type { FastifyBaseLogger } from 'fastify';
import { handle, registerAdapter } from './core.js';
import type { Adapter, Btn, Inbound, Screen } from './types.js';

// MAX (мессенджер VK): Bot API platform-api2.max.ru, токен в заголовке Authorization.
// Документация: https://dev.max.ru/docs-api

interface MaxUser {
  user_id: number;
  first_name: string;
  last_name?: string;
  name?: string;
  username?: string | null;
}
interface MaxMessage {
  sender?: MaxUser | null;
  recipient: { chat_id: number | null; chat_type: string; user_id: number | null };
  body: { mid: string; text: string | null; attachments?: { type: string; payload?: { vcf_info?: string } }[] | null };
  link?: { type: string; message: { mid: string } } | null;
}
interface MaxUpdate {
  update_type: string;
  chat_id?: number;
  user?: MaxUser;
  payload?: string | null;
  message?: MaxMessage | null;
  callback?: { callback_id: string; payload?: string; user: MaxUser };
}

/** В MAX диплинк в мини-приложение передаёт только [A-Za-z0-9_-], поэтому «/» кодируем как «__». */
export const encodeStartApp = (path: string) => path.replace(/^\//, '').replace(/#/g, '___').replace(/\//g, '__') || 'home';

export function startMax(token: string, log: FastifyBaseLogger) {
  const base = process.env.MAX_API_URL || 'https://platform-api2.max.ru';

  async function call<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, query: Record<string, string | number | undefined> = {}, body?: unknown, timeoutMs = 15_000): Promise<T> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: { Authorization: token, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;
    if (!res.ok) throw new Error(`MAX ${method} ${path}: ${res.status} ${data?.message ?? ''}`);
    return data as T;
  }

  const button = (b: Btn) => {
    if ('data' in b) return { type: 'callback', text: b.text, payload: b.data };
    if ('url' in b) return { type: 'link', text: b.text, url: b.url };
    if ('app' in b) return { type: 'link', text: b.text, url: `https://max.ru/${adapter.username}?startapp=${encodeStartApp(b.app)}` };
    return { type: 'request_contact', text: b.text };
  };
  const body = (s: Screen) => ({
    text: s.text,
    format: 'html',
    attachments: s.rows.length ? [{ type: 'inline_keyboard', payload: { buttons: s.rows.map((r) => r.map(button)) } }] : [],
  });
  const userOf = (chatId: string) => chatId.replace(/^max:/, '');

  const adapter: Adapter = {
    platform: 'max',
    username: null,
    async send(chatId, screen) {
      const res = await call<{ message?: { body?: { mid?: string } } }>('POST', '/messages', { user_id: userOf(chatId) }, body(screen));
      return res.message?.body?.mid ?? null;
    },
    async edit(_chatId, messageId, screen, callbackId) {
      try {
        // ответ на нажатие кнопки с новым сообщением заменяет его на месте
        if (callbackId) await call('POST', '/answers', { callback_id: callbackId }, { message: body(screen) });
        else await call('PUT', '/messages', { message_id: messageId }, body(screen));
        return true;
      } catch {
        return false;
      }
    },
    async remove(_chatId, messageId) {
      await call('DELETE', '/messages', { message_id: messageId }).catch(() => {});
    },
    async toast(callbackId, text) {
      if (!text) return;
      await call('POST', '/answers', { callback_id: callbackId }, { notification: text }).catch(() => {});
    },
    async askContact(chatId, screen) {
      return adapter.send(chatId, screen);
    },
    async clearContact() {},
    inviteLink(payload) {
      return `https://max.ru/${adapter.username}?start=${payload}`;
    },
  };

  const who = (u: MaxUser) => ({ id: String(u.user_id), firstName: u.first_name || u.name || 'Гость', lastName: u.last_name, username: u.username ?? undefined });

  const toInbound = (u: MaxUpdate): Inbound | null => {
    if (u.update_type === 'bot_started' && u.user) {
      return { platform: 'max', chatId: `max:${u.user.user_id}`, who: who(u.user), kind: 'start', payload: u.payload ?? '' };
    }
    if (u.update_type === 'message_callback' && u.callback) {
      return {
        platform: 'max',
        chatId: `max:${u.callback.user.user_id}`,
        who: who(u.callback.user),
        kind: 'callback',
        data: u.callback.payload,
        callbackId: u.callback.callback_id,
        messageId: u.message?.body.mid,
      };
    }
    if (u.update_type === 'message_created' && u.message?.sender && u.message.recipient.chat_type === 'dialog') {
      const msg = u.message;
      const sender = msg.sender!;
      if ((sender as MaxUser & { is_bot?: boolean }).is_bot) return null;
      const common = {
        platform: 'max' as const,
        chatId: `max:${sender.user_id}`,
        who: who(sender),
        messageId: msg.body.mid,
        replyTo: msg.link?.type === 'reply' ? msg.link.message.mid : undefined,
      };
      const contact = msg.body.attachments?.find((a) => a.type === 'contact');
      if (contact) {
        const phone = contact.payload?.vcf_info?.match(/TEL[^:]*:([+\d\s()-]+)/)?.[1]?.replace(/[^\d+]/g, '');
        if (phone) return { ...common, kind: 'contact', phone };
      }
      const text = msg.body.text ?? '';
      if (text.startsWith('/start')) return { ...common, kind: 'start', payload: text.split(' ')[1] ?? '' };
      return { ...common, kind: 'text', text };
    }
    return null;
  };

  async function setup() {
    const me = await call<{ username?: string; name?: string }>('GET', '/me');
    adapter.username = me.username ?? null;
    const commands = {
      commands: [
        { name: 'menu', description: 'Главное меню' },
        { name: 'daily', description: 'Задача дня' },
        { name: 'quiz', description: 'Радуга знаний' },
        { name: 'formulas', description: 'Шпаргалки' },
        { name: 'lessons', description: 'Мои занятия' },
        { name: 'book', description: 'Записаться на занятие' },
        { name: 'ask', description: 'Написать в школу' },
      ],
    };
    await call('PATCH', '/me/commands', {}, commands)
      .catch(() => call('PATCH', '/me', {}, commands))
      .catch((err) => log.warn({ err }, 'бот MAX: не удалось задать команды'));
    registerAdapter(adapter, log);
    log.info(`бот MAX @${adapter.username} запущен`);
  }

  void (async () => {
    for (;;) {
      try {
        await setup();
        break;
      } catch (err) {
        log.error({ err }, 'бот MAX: не удалось запуститься, повтор через минуту');
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }
    let marker: number | undefined;
    let failures = 0;
    for (;;) {
      try {
        const res = await call<{ updates: MaxUpdate[]; marker?: number }>('GET', '/updates', { marker, timeout: 25, types: 'message_created,message_callback,bot_started' }, undefined, 35_000);
        failures = 0;
        marker = res.marker ?? marker;
        for (const u of res.updates ?? []) {
          const m = toInbound(u);
          if (m) await handle(m);
        }
      } catch (err) {
        if (++failures >= 3) log.warn({ err }, 'бот MAX: updates не отвечает');
        await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * failures)));
      }
    }
  })();

  return adapter;
}
