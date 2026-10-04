import { api } from './api';
import { platform } from './platform';

// Аналитика: просмотры страниц и ключевые действия. Ошибки не мешают работе сайта.

let firstView = true;
const utm = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    return { utmSource: q.get('utm_source') ?? undefined, utmMedium: q.get('utm_medium') ?? undefined, utmCampaign: q.get('utm_campaign') ?? undefined };
  } catch {
    return {};
  }
})();

export function trackEvent(type: 'view' | 'book_open' | 'cta' | 'share' | 'miniapp_open', path?: string, label?: string) {
  if (__DEMO__) return;
  const json: Record<string, unknown> = {
    type,
    path: path ?? window.location.pathname,
    label,
    platform,
    device: window.matchMedia?.('(max-width: 767px)').matches ? 'mobile' : 'desktop',
  };
  if (firstView) {
    firstView = false;
    Object.assign(json, utm, { referrer: document.referrer || undefined });
  }
  api('/track', { method: 'POST', json }).catch(() => undefined);
}

export const trackView = (path: string) => trackEvent('view', path);
