// Часовой пояс школы. «Спектр» работает в Иркутске, поэтому по умолчанию — Asia/Irkutsk.
export const SCHOOL_TZ = process.env.SCHOOL_TZ || 'Asia/Irkutsk';

/** Дата по часам школы в виде YYYY-MM-DD. */
export const schoolDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ }).format(d);

/** Час по часам школы (0–23). */
export const schoolHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: SCHOOL_TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));

export const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: SCHOOL_TZ, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);

export const fmtTime = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: SCHOOL_TZ, hour: '2-digit', minute: '2-digit' }).format(d);

export const fmtDate = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: SCHOOL_TZ, day: 'numeric', month: 'long' }).format(d);
