const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const full = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export const fmtTime = (d: string | Date) => time.format(new Date(d));
export const fmtDay = (d: string | Date) => dayMonth.format(new Date(d));
export const fmtWeekday = (d: string | Date) => weekday.format(new Date(d));
export const fmtWeekdayShort = (d: string | Date) => weekdayShort.format(new Date(d)).replace('.', '');
export const fmtFull = (d: string | Date) => full.format(new Date(d));

export function dayKey(d: string | Date) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

export function relativeDay(d: string | Date) {
  const x = new Date(d);
  const today = new Date();
  const diff = Math.round((startOfDay(x).getTime() - startOfDay(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const wd = fmtWeekday(x);
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function untilLabel(d: string | Date) {
  const ms = new Date(d).getTime() - Date.now();
  if (ms < 0) return 'идёт сейчас';
  const min = Math.round(ms / 60000);
  if (min < 60) return `через ${min} ${plural(min, 'минуту', 'минуты', 'минут')}`;
  const h = Math.round(min / 60);
  if (h < 24) return `через ${h} ${plural(h, 'час', 'часа', 'часов')}`;
  const days = Math.round(h / 24);
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Значение для <input type="datetime-local"> в локальном времени */
export function toLocalInput(d: Date | string) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Запланировано',
  DONE: 'Прошло',
  CANCELLED: 'Отменено',
  PENDING: 'На рассмотрении',
  APPROVED: 'Одобрено',
  DECLINED: 'Отклонено',
  OPEN: 'Открыто',
  ANSWERED: 'Есть ответ',
  CLOSED: 'Закрыто',
  NEW: 'Новая',
  CONTACTED: 'Связались',
  STUDENT: 'Ученик',
  TEACHER: 'Преподаватель',
  ADMIN: 'Администратор',
  INDIVIDUAL: 'Индивидуально',
  GROUP: 'В группе',
};
