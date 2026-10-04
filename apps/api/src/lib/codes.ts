import { createHash, randomInt } from 'node:crypto';
import { prisma } from './prisma.js';

export type CodePurpose = 'VERIFY' | 'RESET';

const TTL_MS = 15 * 60_000;
const RESEND_MS = 60_000;
const MAX_ATTEMPTS = 5;

const hash = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest('hex');

// сколько кодов выдано адресу за сутки: защита от перебора через бесконечные новые коды
const issued = new Map<string, number[]>();

/** Новый шестизначный код. Возвращает null, если прошлый выдан меньше минуты назад или лимит на сутки исчерпан. */
export async function issueCode(email: string, purpose: CodePurpose) {
  const day = Date.now() - 86_400_000;
  const recent = (issued.get(email) ?? []).filter((t) => t > day);
  if (recent.length >= 8) return null;
  const last = await prisma.emailCode.findFirst({ where: { email, purpose }, orderBy: { createdAt: 'desc' } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_MS) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.emailCode.deleteMany({ where: { email, purpose } });
  await prisma.emailCode.create({ data: { email, purpose, codeHash: hash(email, code), expiresAt: new Date(Date.now() + TTL_MS) } });
  issued.set(email, [...recent, Date.now()]);
  return code;
}

/** Проверяет код и гасит его. Текст ошибки показывается пользователю. */
export async function consumeCode(email: string, purpose: CodePurpose, code: string): Promise<string | null> {
  const row = await prisma.emailCode.findFirst({ where: { email, purpose }, orderBy: { createdAt: 'desc' } });
  if (!row || row.expiresAt.getTime() < Date.now()) return 'Код устарел. Запросите новый.';
  if (row.attempts >= MAX_ATTEMPTS) return 'Слишком много попыток. Запросите новый код.';
  if (row.codeHash !== hash(email, code.trim())) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return 'Неверный код';
  }
  await prisma.emailCode.deleteMany({ where: { email, purpose } });
  return null;
}
