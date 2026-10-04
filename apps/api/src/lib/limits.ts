// Лимиты частоты запросов для отдельных маршрутов (по IP клиента за прокси)
export const rl = (max: number, timeWindow: string) => ({ rateLimit: { max, timeWindow } });
