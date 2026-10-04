import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

// Демо-аккаунты из начальных данных со стандартными паролями из README — открытая дверь в админку.
// Находим их, чтобы предупредить администратора и дать закрыть доступ одной кнопкой.
const DEFAULT_PASSWORDS = ['spectr-admin', 'spectr-teacher', 'spectr-student'];
let cache: { at: number; list: { id: string; email: string; role: string }[] } | null = null;

export async function demoAccounts(force = false) {
  if (!force && cache && Date.now() - cache.at < 10 * 60_000) return cache.list;
  const candidates = await prisma.user.findMany({
    where: { email: { endsWith: '@spectr.school' }, passwordHash: { not: null } },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  const list: { id: string; email: string; role: string }[] = [];
  for (const u of candidates) {
    for (const pw of DEFAULT_PASSWORDS) {
      if (await bcrypt.compare(pw, u.passwordHash!)) {
        list.push({ id: u.id, email: u.email!, role: u.role });
        break;
      }
    }
  }
  cache = { at: Date.now(), list };
  return list;
}

/** Закрыть вход в демо-аккаунты: пароль снимается, выданные токены отзываются. */
export async function lockDemoAccounts() {
  const list = await demoAccounts(true);
  if (list.length) {
    await prisma.user.updateMany({ where: { id: { in: list.map((u) => u.id) } }, data: { passwordHash: null, tokensValidAfter: new Date() } });
  }
  cache = null;
  return list.length;
}
