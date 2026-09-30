import crypto from 'node:crypto';

/**
 * Проверка initData из Telegram Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyTelegramInitData(initData: string, botToken: string, maxAgeSec = 60 * 60 * 24) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!safeEqual(calculated, hash)) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  const user = JSON.parse(userRaw) as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  };
  return user;
}

/**
 * Проверка параметров запуска VK Mini App.
 * https://dev.vk.com/ru/mini-apps/development/launch-params-sign
 */
export function verifyVkLaunchParams(search: string, appSecret: string) {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const sign = query.get('sign');
  if (!sign) return null;

  const vkParams = [...query.entries()]
    .filter(([k]) => k.startsWith('vk_'))
    .sort(([a], [b]) => a.localeCompare(b));
  const checkString = vkParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

  const calculated = crypto
    .createHmac('sha256', appSecret)
    .update(checkString)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (!safeEqual(calculated, sign)) return null;
  const userId = query.get('vk_user_id');
  return userId ? { id: userId } : null;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
