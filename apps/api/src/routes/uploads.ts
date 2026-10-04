import type { FastifyInstance } from 'fastify';
import { rl } from '../lib/limits.js';
import { createWriteStream } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { authenticate } from '../lib/auth.js';

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
]);

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// Загрузка изображений (аватары, фото групп, обложки). Прототип — локальный диск;
// для продакшена заменить на S3-совместимое хранилище.
export async function uploadRoutes(app: FastifyInstance) {
  app.post('/uploads', { preHandler: authenticate, config: rl(30, '1 hour') }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Файл не передан' });
    const ext = ALLOWED.get(file.mimetype);
    if (!ext) return reply.code(415).send({ error: 'Поддерживаются JPG, PNG, WebP и AVIF' });
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const full = path.join(UPLOAD_DIR, name);
    await pipeline(file.file, createWriteStream(full));
    if (file.file.truncated) {
      await unlink(full).catch(() => {});
      return reply.code(413).send({ error: 'Файл больше 8 МБ' });
    }
    // тип файла из браузера можно подделать — проверяем настоящую сигнатуру картинки
    if (!(await looksLikeImage(full, file.mimetype))) {
      await unlink(full).catch(() => {});
      return reply.code(415).send({ error: 'Файл не похож на картинку' });
    }
    return { url: `/uploads/${name}` };
  });
}

async function looksLikeImage(file: string, mime: string) {
  const fh = await open(file, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(16), 0, 16, 0);
    const hex = buffer.toString('hex');
    const ascii = buffer.toString('latin1');
    if (mime === 'image/jpeg') return hex.startsWith('ffd8ff');
    if (mime === 'image/png') return hex.startsWith('89504e470d0a1a0a');
    if (mime === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
    if (mime === 'image/avif') return ascii.slice(4, 8) === 'ftyp' && /avi[fs]/.test(ascii.slice(8, 12));
    return false;
  } finally {
    await fh.close();
  }
}
