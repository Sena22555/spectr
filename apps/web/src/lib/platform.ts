/**
 * Один фронтенд — три оболочки: сайт, Telegram Mini App, VK Mini App.
 * Здесь определяем, где мы запущены, и подстраиваем тему, кнопку «Назад» и вход.
 */
import bridge from '@vkontakte/vk-bridge';
import { api } from './api';
import type { User } from './types';

export type Platform = 'web' | 'telegram' | 'vk' | 'max';

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
  openTelegramLink?(url: string): void;
}

interface MaxWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  platform?: string;
  ready?(): void;
  close?(): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick?(cb: () => void): void };
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred?(t: string): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
    WebApp?: MaxWebApp;
  }
}

const VK_KEY = 'spectr.vk-launch';
const TG_KEY = 'spectr.tg';
const MAX_KEY = 'spectr.max';

function safeSession(get: () => string | null) {
  try {
    return get();
  } catch {
    return null;
  }
}

function detect(): Platform {
  if (/tgWebApp/.test(window.location.hash) || safeSession(() => sessionStorage.getItem(TG_KEY))) return 'telegram';
  // MAX передаёт параметры запуска во фрагменте URL (WebAppData=…)
  if (/(^|[#&])WebAppData=/.test(window.location.hash) || safeSession(() => sessionStorage.getItem(MAX_KEY))) return 'max';
  const q = new URLSearchParams(window.location.search);
  if (q.has('vk_app_id') && q.has('sign')) return 'vk';
  if (safeSession(() => sessionStorage.getItem(VK_KEY))) return 'vk';
  return 'web';
}

export const platform: Platform = detect();
export const isMiniApp = platform !== 'web';

let tg: TelegramWebApp | undefined;
let mx: MaxWebApp | undefined;

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

  if (platform === 'max') {
    try {
      sessionStorage.setItem(MAX_KEY, '1');
    } catch {
      /* ignore */
    }
    try {
      await loadScript('https://st.max.ru/js/max-web-app.js');
      mx = window.WebApp?.initData ? window.WebApp : undefined;
      mx?.ready?.();
    } catch {
      /* мост не загрузился — работаем как сайт */
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
  if (mx?.BackButton) {
    if (backHandler) mx.BackButton.offClick?.(backHandler);
    backHandler = onBack;
    mx.BackButton.onClick(onBack);
    if (visible) mx.BackButton.show();
    else mx.BackButton.hide();
    return;
  }
  if (!tg) return;
  if (backHandler) tg.BackButton.offClick(backHandler);
  backHandler = onBack;
  tg.BackButton.onClick(onBack);
  if (visible) tg.BackButton.show();
  else tg.BackButton.hide();
}

export function haptic(kind: 'tap' | 'success' | 'error' = 'tap') {
  if (mx?.HapticFeedback) {
    try {
      if (kind === 'tap') mx.HapticFeedback.impactOccurred('light');
      else mx.HapticFeedback.notificationOccurred?.(kind);
    } catch {
      /* старые клиенты */
    }
    return;
  }
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
    if (platform === 'max' && mx?.initData) {
      return await api('/auth/max', { method: 'POST', json: { initData: mx.initData } });
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
  max: 'MAX',
};

/**
 * Страница, на которую просили открыть мини-приложение (диплинк ?startapp=…).
 * Бот кодирует путь: «/» → «__», «#» → «___», например practice__physics__refraction.
 */
export function startPath(): string | null {
  let param: string | null | undefined = null;
  if (platform === 'max') param = mx?.initDataUnsafe?.start_param;
  if (platform === 'telegram') {
    const raw = (tg as unknown as { initDataUnsafe?: { start_param?: string } } | undefined)?.initDataUnsafe?.start_param;
    param = raw;
  }
  if (!param || param === 'home') return null;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(param)) return null;
  return `/${param.replace(/___/g, '#').replace(/__/g, '/')}`;
}

/**
 * Поделиться ссылкой: в Telegram — окно выбора чата, на телефоне — системное меню «Поделиться»,
 * иначе ссылка копируется. Возвращает 'copied', если пришлось копировать.
 */
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (platform === 'telegram' && tg?.openTelegramLink) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
    return 'shared';
  }
  if (navigator.share) {
    try {
      await navigator.share({ url, text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
