/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Ссылка на мини-приложение Telegram, например https://t.me/spectr_school_bot/app */
  readonly VITE_TELEGRAM_APP_URL?: string;
  /** Ссылка на мини-приложение VK, например https://vk.com/app1234567 */
  readonly VITE_VK_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
