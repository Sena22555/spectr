// Общие типы ботов: ядро описывает «экран» (текст + кнопки), а адаптер Telegram или MAX его рисует.

export type Platform = 'telegram' | 'max';

export type Btn =
  | { text: string; data: string }
  | { text: string; url: string }
  /** открыть мини-приложение на нужной странице */
  | { text: string; app: string }
  /** попросить номер телефона */
  | { text: string; contact: true };

export interface Screen {
  /** HTML: <b>, <i>, <a>, <code> */
  text: string;
  rows: Btn[][];
}

export interface Who {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
}

export interface Inbound {
  platform: Platform;
  /** ключ игрока: id в Telegram или «max:<id>» */
  chatId: string;
  who: Who;
  kind: 'start' | 'text' | 'callback' | 'contact';
  text?: string;
  data?: string;
  payload?: string;
  phone?: string;
  /** сообщение с нажатой кнопкой или входящее сообщение пользователя */
  messageId?: string;
  callbackId?: string;
  /** на какое сообщение бота ответили (reply) */
  replyTo?: string;
}

export interface Adapter {
  platform: Platform;
  username: string | null;
  send(chatId: string, screen: Screen): Promise<string | null>;
  edit(chatId: string, messageId: string, screen: Screen, callbackId?: string): Promise<boolean>;
  remove(chatId: string, messageId: string): Promise<void>;
  toast(callbackId: string, text?: string, alert?: boolean): Promise<void>;
  /** экран с запросом телефона (в Telegram — отдельная клавиатура под полем ввода) */
  askContact(chatId: string, screen: Screen): Promise<string | null>;
  /** убрать клавиатуру запроса телефона, если она есть */
  clearContact(chatId: string): Promise<void>;
  /** ссылка «поделиться ботом» для приглашений */
  inviteLink(payload: string): string;
}
