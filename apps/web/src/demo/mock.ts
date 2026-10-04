/**
 * Демо-версия без сервера (npm run build:demo): ответы API берутся из снимка демо-данных
 * (scripts/demo-snapshot.mjs), даты сдвигаются к сегодняшнему дню. Основные действия ученика
 * (обращение в поддержку, перенос, запись, профиль) меняют данные в памяти до перезагрузки.
 */
import raw from './snapshot.json';

type Json = Record<string, unknown>;
type Role = 'student' | 'teacher' | 'admin' | 'fresh';

const ACCOUNTS: Record<string, { password: string; role: Role }> = {
  'student@spectr.school': { password: 'spectr-student', role: 'student' },
  'anna@spectr.school': { password: 'spectr-teacher', role: 'teacher' },
  'admin@spectr.school': { password: 'spectr-admin', role: 'admin' },
};

// сдвигаем даты снимка на целое число дней, будто он сделан сегодня: время уроков не меняется
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
const DAY = 86_400_000;
const shift = Math.round((Date.now() - new Date(raw.takenAt).getTime()) / DAY) * DAY;
function shiftDates<T>(v: T): T {
  if (typeof v === 'string') return (ISO.test(v) ? new Date(new Date(v).getTime() + shift).toISOString() : v) as T;
  if (Array.isArray(v)) return v.map(shiftDates) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shiftDates(x)])) as T;
  return v;
}
const db = shiftDates(raw) as unknown as { public: Record<string, Json>; roles: Record<Role, Record<string, Json>> };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const uid = () => `demo${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function roleOf(token: string | null): Role | null {
  const r = token?.startsWith('demo.') ? (token.slice(5) as Role) : null;
  return r && r in db.roles ? r : null;
}

function inRange(list: { startsAt: string }[], params: URLSearchParams) {
  const from = params.get('from') ? new Date(params.get('from')!).getTime() : -Infinity;
  const to = params.get('to') ? new Date(params.get('to')!).getTime() : Infinity;
  return list.filter((l) => {
    const t = new Date(l.startsAt).getTime();
    return t >= from && t <= to;
  });
}

function user(role: Role) {
  return (db.roles[role]['/auth/me'] as { user: Json }).user;
}

function get(role: Role | null, path: string, params: URLSearchParams): unknown {
  if (path in db.public) return db.public[path];
  if (path === '/config') return { telegramUrl: null, vkUrl: null };
  if (path === '/practice/progress') return { solved: [], tried: [] };
  if (path.startsWith('/practice')) throw new HttpError(400, 'Практикум работает на сайте школы — в демо-версии без сервера он недоступен.');
  if (path === '/me/assignments') return { assignments: [] };
  if (path.startsWith('/admin/analytics') || path.startsWith('/admin/people') || path.startsWith('/teacher/assignments') || path.startsWith('/teacher/practice-problems')) {
    throw new HttpError(400, 'В демо-версии без сервера этот раздел недоступен.');
  }
  if (!role) throw new HttpError(401, 'Войдите, чтобы продолжить');
  const data = db.roles[role][path];
  if (data === undefined) {
    if (path.startsWith('/me/tickets/')) throw new HttpError(404, 'Обращение не найдено');
    if (path.startsWith('/admin') || path.startsWith('/teacher')) throw new HttpError(403, 'Нет доступа');
    throw new HttpError(404, 'Не найдено');
  }
  if (path === '/me/schedule' || path === '/teacher/lessons' || path === '/admin/lessons') {
    return { lessons: inRange((data as { lessons: { startsAt: string }[] }).lessons, params) };
  }
  if (path === '/admin/users') {
    const q = params.get('q')?.toLowerCase();
    const r = params.get('role');
    return {
      users: (data as { users: { name: string; email: string | null; role: string }[] }).users.filter(
        (u) => (!r || u.role === r) && (!q || u.name.toLowerCase().includes(q) || u.email?.includes(q)),
      ),
    };
  }
  if (path === '/admin/tickets') {
    const s = params.get('status');
    return { tickets: (data as { tickets: { status: string }[] }).tickets.filter((t) => !s || t.status === s) };
  }
  return data;
}

function mutate(role: Role | null, method: string, path: string, body: Json): unknown {
  if (method === 'POST' && path === '/auth/login') {
    const acc = ACCOUNTS[String(body.email ?? '').trim().toLowerCase()];
    if (!acc || acc.password !== body.password) throw new HttpError(401, 'Неверный email или пароль. В демо: кнопки демо-аккаунтов под формой.');
    return { token: `demo.${acc.role}`, user: user(acc.role) };
  }
  if (method === 'POST' && path === '/auth/register') {
    Object.assign(user('fresh'), { name: body.name, email: body.email, phone: body.phone ?? null });
    return { token: 'demo.fresh', user: user('fresh') };
  }
  if (method === 'POST' && (path === '/auth/reset/request' || path === '/auth/email/send')) return { ok: true };
  if (method === 'POST' && path.startsWith('/auth/link/')) throw new HttpError(400, 'В демо-версии бот не подключён');
  if (method === 'POST' && path === '/track') return { ok: true };
  if (method === 'POST' && (path.startsWith('/practice') || path.startsWith('/admin/') || path.startsWith('/teacher/assignments') || path.startsWith('/me/assignments'))) {
    throw new HttpError(400, 'В демо-версии без сервера это действие недоступно.');
  }
  if (method === 'POST' && (path === '/auth/reset/confirm' || path === '/auth/email/verify')) {
    throw new HttpError(400, 'В демо-версии письма не отправляются — войдите через демо-аккаунт.');
  }
  if (method === 'POST' && (path === '/auth/telegram' || path === '/auth/vk')) throw new HttpError(400, 'В демо-версии вход через мессенджер отключён');
  if (method === 'POST' && path === '/bookings') {
    const booking = { id: uid(), status: 'NEW', createdAt: now(), course: null, teacher: null, user: null, ...body };
    (db.roles.admin['/admin/bookings'] as { bookings: Json[] }).bookings.unshift(booking);
    return { booking };
  }
  if (!role) throw new HttpError(401, 'Войдите, чтобы продолжить');
  const me = user(role);

  if (method === 'PATCH' && path === '/auth/me') {
    Object.assign(me, body);
    return { user: me };
  }
  if (method === 'POST' && path === '/me/tickets') {
    const first = { id: uid(), body: body.body, createdAt: now(), author: { id: me.id, name: me.name, role: me.role, avatarUrl: me.avatarUrl } };
    const ticket = { id: uid(), subject: body.subject, status: 'OPEN', createdAt: now(), updatedAt: now(), userId: me.id, messages: [first] };
    db.roles[role][`/me/tickets/${ticket.id}`] = { ticket };
    (db.roles[role]['/me/tickets'] as { tickets: Json[] }).tickets.unshift({ ...ticket, _count: { messages: 1 } });
    return { ticket };
  }
  const reply = path.match(/^\/me\/tickets\/([^/]+)\/messages$/);
  if (method === 'POST' && reply) {
    const t = db.roles[role][`/me/tickets/${reply[1]}`] as { ticket: { messages: Json[]; status: string } } | undefined;
    if (!t) throw new HttpError(404, 'Обращение не найдено');
    const message = { id: uid(), body: body.body, createdAt: now(), author: { id: me.id, name: me.name, role: me.role, avatarUrl: me.avatarUrl } };
    t.ticket.messages.push(message);
    t.ticket.status = 'OPEN';
    return { message };
  }
  if (method === 'POST' && path === '/me/reschedules') {
    const lessons = (db.roles[role]['/me/schedule'] as { lessons: (Json & { id: string; reschedules?: Json[] })[] }).lessons;
    const lesson = lessons.find((l) => l.id === body.lessonId);
    if (!lesson) throw new HttpError(404, 'Занятие не найдено');
    const request = { id: uid(), reason: body.reason, proposedAt: body.proposedAt ?? null, status: 'PENDING', reply: null, createdAt: now(), lessonId: lesson.id };
    lesson.reschedules = [...(lesson.reschedules ?? []), { id: request.id, status: 'PENDING' }];
    (db.roles[role]['/me/reschedules'] as { requests: Json[] }).requests.unshift({ ...request, lesson: clone(lesson) });
    return { request };
  }
  if (method === 'POST' && path === '/auth/password') return { ok: true };

  // остальное (админка и «полуадминка») подтверждаем, но в демо не сохраняем
  return { ok: true, ...body, id: uid() };
}

export async function demoApi<T>(path: string, init: RequestInit & { json?: unknown }, token: string | null): Promise<T> {
  await new Promise((r) => setTimeout(r, 160 + Math.random() * 180));
  const url = new URL(path, 'http://demo');
  const method = (init.method ?? 'GET').toUpperCase();
  const role = roleOf(token);
  try {
    const res = method === 'GET' ? get(role, url.pathname, url.searchParams) : mutate(role, method, url.pathname, (init.json ?? {}) as Json);
    return clone(res) as T;
  } catch (e) {
    if (e instanceof HttpError) {
      const { ApiError } = await import('../lib/api');
      throw new ApiError(e.status, e.message);
    }
    throw e;
  }
}

export async function demoUpload(file: File) {
  await new Promise((r) => setTimeout(r, 300));
  return { url: URL.createObjectURL(file) };
}
