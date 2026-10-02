// Минимальный клиент Telegram Bot API: без библиотек, через fetch.

export type Keyboard = { inline_keyboard: InlineButton[][] } | { keyboard: { text: string; request_contact?: boolean }[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean } | { remove_keyboard: true };
export type InlineButton = { text: string } & ({ callback_data: string } | { url: string } | { web_app: { url: string } });

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  contact?: { phone_number: string; user_id?: number };
  reply_to_message?: TgMessage;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; message?: TgMessage; data?: string };
}

export class TelegramError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export function telegram(token: string) {
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

  return {
    call,
    send: (chatId: string | number, text: string, keyboard?: Keyboard, extra: Record<string, unknown> = {}) =>
      call<TgMessage>('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard, ...extra }),
    edit: (chatId: string | number, messageId: number, text: string, keyboard?: { inline_keyboard: InlineButton[][] }) =>
      call('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard }).catch(
        (err: TelegramError) => {
          // «message is not modified» — не ошибка
          if (!/not modified/.test(err.message)) throw err;
        },
      ),
    answer: (callbackId: string, text?: string, alert = false) => call('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: alert }).catch(() => {}),
  };
}

export type Telegram = ReturnType<typeof telegram>;

export const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
