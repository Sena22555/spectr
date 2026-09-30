import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
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
  app.post('/uploads', { preHandler: authenticate }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Файл не передан' });
    const ext = ALLOWED.get(file.mimetype);
    if (!ext) return reply.code(415).send({ error: 'Поддерживаются JPG, PNG, WebP и AVIF' });
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    await pipeline(file.file, createWriteStream(path.join(UPLOAD_DIR, name)));
    if (file.file.truncated) return reply.code(413).send({ error: 'Файл больше 8 МБ' });
    return { url: `/uploads/${name}` };
  });
}
