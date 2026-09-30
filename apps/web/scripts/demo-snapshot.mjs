// Снимок демо-данных для статической демо-версии (npm run build:demo).
// Нужен запущенный API с демо-данными: npm run setup && npm run dev -w @spectr/api
import { writeFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const DAY = 86_400_000;
const wide = `from=${new Date(Date.now() - 60 * DAY).toISOString()}&to=${new Date(Date.now() + 120 * DAY).toISOString()}`;

async function call(path, token, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return undefined;
  return res.json();
}

async function grab(token, paths) {
  const out = {};
  for (const p of paths) {
    const data = await call(p, token);
    if (data !== undefined) out[p.split('?')[0]] = data;
  }
  return out;
}

const ME = ['/auth/me', `/me/schedule?${wide}`, '/me/overview', '/me/groups', '/me/bookings', '/me/enrollments', '/me/reschedules', '/me/tickets'];
const TEACH = ['/teacher/overview', `/teacher/lessons?${wide}`, '/teacher/groups', '/teacher/students', '/teacher/reschedules'];
const ADMIN = [
  '/admin/overview', '/admin/users', '/admin/teachers', '/admin/courses', '/admin/enrollments', '/admin/groups',
  `/admin/lessons?${wide}`, '/admin/bookings', '/admin/reschedules', '/admin/tickets',
];

async function login(email, password) {
  return (await call('/auth/login', null, { method: 'POST', body: JSON.stringify({ email, password }) })).token;
}

async function role(token) {
  const data = await grab(token, [...ME, ...TEACH, ...ADMIN]);
  for (const t of data['/me/tickets']?.tickets ?? []) {
    const d = await call(`/me/tickets/${t.id}`, token);
    if (d) data[`/me/tickets/${t.id}`] = d;
  }
  return data;
}

const pub = await grab(null, ['/courses', '/teachers', '/groups', '/stats']);
for (const t of pub['/teachers'].teachers) pub[`/teachers/${t.slug}`] = await call(`/teachers/${t.slug}`);
for (const c of pub['/courses'].courses) pub[`/courses/${c.slug}`] = await call(`/courses/${c.slug}`);
for (const g of pub['/groups'].groups) pub[`/groups/${g.slug}`] = await call(`/groups/${g.slug}`);

const fresh = await call('/auth/register', null, {
  method: 'POST',
  body: JSON.stringify({ name: 'Новый ученик', email: `demo-${Date.now()}@spectr.school`, password: 'spectr-demo-1' }),
});

const snapshot = {
  takenAt: new Date().toISOString(),
  public: pub,
  roles: {
    student: await role(await login('student@spectr.school', 'spectr-student')),
    teacher: await role(await login('anna@spectr.school', 'spectr-teacher')),
    admin: await role(await login('admin@spectr.school', 'spectr-admin')),
    fresh: await role(fresh.token),
  },
};
const file = new URL('../src/demo/snapshot.json', import.meta.url);
writeFileSync(file, JSON.stringify(snapshot));
console.log('Снимок демо-данных:', file.pathname, Math.round(JSON.stringify(snapshot).length / 1024), 'КБ');
