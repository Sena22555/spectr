/**
 * Один фронтенд — три оболочки: сайт, Telegram Mini App, VK Mini App.
 * Здесь определяем, где мы запущены, и подстраиваем тему, кнопку «Назад» и вход.
 */
import bridge from '@vkontakte/vk-bridge';
import { api } from './api';
import type { User } from './types';

export type Platform = 'web' | 'telegram' | 'vk';

interface TelegramWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  disableVerticalSwipes?(): void;
  onEvent(event: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void; notificationOccurred(t: 'success' | 'error' | 'warning'): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const VK_KEY = 'spectr.vk-launch';
const TG_KEY = 'spectr.tg';

function safeSession(get: () => string | null) {
  try {
    return get();
  } catch {
    return null;
  }
}

function detect(): Platform {
  if (/tgWebApp/.test(window.location.hash) || safeSession(() => sessionStorage.getItem(TG_KEY))) return 'telegram';
  const q = new URLSearchParams(window.location.search);
  if (q.has('vk_app_id') && q.has('sign')) return 'vk';
  if (safeSession(() => sessionStorage.getItem(VK_KEY))) return 'vk';
  return 'web';
}

export const platform: Platform = detect();
export const isMiniApp = platform !== 'web';

let tg: TelegramWebApp | undefined;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script failed'));
    document.head.appendChild(s);
  });
}

// ——— Тема ———
// Оформление только светлое: тёмная тема Telegram и ВКонтакте не подхватывается.
const PAPER = '#fbf8f0';

export function applyTheme() {
  document.documentElement.dataset.theme = 'light';
  if (tg) {
    try {
      tg.setHeaderColor(PAPER);
      tg.setBackgroundColor(PAPER);
    } catch {
      /* старые клиенты */
    }
  }
  if (platform === 'vk') {
    bridge.send('VKWebAppSetViewSettings', { status_bar_style: 'dark', action_bar_color: PAPER }).catch(() => undefined);
  }
}

// ——— Инициализация ———
export async function initPlatform() {
  if (platform === 'telegram') {
    try {
      sessionStorage.setItem(TG_KEY, '1');
    } catch {
      /* ignore */
    }
    try {
      await loadScript('https://telegram.org/js/telegram-web-app.js');
      tg = window.Telegram?.WebApp;
      // Вне Telegram SDK тоже грузится, но initData пустой — тогда не доверяем его теме
      if (tg && !tg.initData) tg = undefined;
      if (tg) {
        tg.ready();
        tg.expand();
        tg.disableVerticalSwipes?.();
      }
    } catch {
      /* SDK не загрузился — работаем как сайт */
    }
  }

  if (platform === 'vk') {
    const search = window.location.search;
    if (search.includes('vk_app_id')) {
      try {
        sessionStorage.setItem(VK_KEY, search);
      } catch {
        /* ignore */
      }
    }
    await bridge.send('VKWebAppInit').catch(() => undefined);
  }

  applyTheme();
}

// ——— Кнопка «Назад» в Telegram ———
let backHandler: (() => void) | null = null;
export function setTelegramBack(visible: boolean, onBack: () => void) {
  if (!tg) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = onBack;
  tg.BackButton.onClick(onBack);
  if (visible) tg.BackButton.show();
  else tg.BackButton.hide();
}

export function haptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  const h = tg?.HapticFeedback;
  if (h) {
    if (kind === 'tap') h.impactOccurred('light');
    else h.notificationOccurred(kind);
    return;
  }
  if (platform === 'vk') {
    const req =
      kind === 'tap'
        ? bridge.send('VKWebAppTapticImpactOccurred', { style: 'light' })
        : bridge.send('VKWebAppTapticNotificationOccurred', { type: kind });
    req.catch(() => undefined);
  }
}

// ——— Вход из мини-приложения ———
export async function miniAppLogin(): Promise<{ token: string; user: User } | null> {
  try {
    if (platform === 'telegram' && tg?.initData) {
      return await api('/auth/telegram', { method: 'POST', json: { initData: tg.initData } });
    }
    if (platform === 'vk') {
      const search = safeSession(() => sessionStorage.getItem(VK_KEY)) ?? window.location.search;
      const info = await bridge.send('VKWebAppGetUserInfo').catch(() => null);
      return await api('/auth/vk', {
        method: 'POST',
        json: {
          search,
          name: info ? `${info.first_name} ${info.last_name}`.trim() : undefined,
          avatarUrl: info?.photo_200,
        },
      });
    }
  } catch {
    /* бэкенд не настроен (нет токена бота/секрета) — покажем обычный вход */
  }
  return null;
}

export const platformLabel: Record<Platform, string> = {
  web: 'Сайт',
  telegram: 'Telegram',
  vk: 'ВКонтакте',
};
