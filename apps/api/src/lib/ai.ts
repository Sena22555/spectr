import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Нейросети на том же сервере (deploy/install-ai.sh):
// озвучка — Piper (TTS_URL), чат — Qwen2.5-1.5B в llama.cpp (LLM_URL). Обе слушают только 127.0.0.1.

const TTS_URL = () => process.env.TTS_URL ?? '';
const LLM_URL = () => process.env.LLM_URL ?? '';
const CACHE = () => process.env.TTS_CACHE ?? join(process.cwd(), 'tts-cache');

export const ttsEnabled = () => Boolean(TTS_URL());
export const llmEnabled = () => Boolean(LLM_URL());

// озвучку делаем по одной фразе за раз: у сервера два ядра, сайт не должен тормозить
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
function queued<T>(job: () => Promise<T>): Promise<T> {
  pending++;
  const run = chain.then(job, job).finally(() => pending--);
  chain = run.catch(() => undefined);
  return run;
}

function toMp3(wav: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', '-f', 'mp3', 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => out.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}`))));
    ff.stdin.end(wav);
  });
}

export const EN_VOICE = 'en_GB-jenny_dioco-medium';
const cacheKey = (voice: string, slow: boolean, text: string) => createHash('sha1').update(`${voice}|${slow ? 's' : 'n'}|${text}`).digest('hex');

/** Подпись фразы: сервер разрешает озвучить только то, что сам и сгенерировал. */
export function signSpeech(voice: string, text: string) {
  return createHmac('sha256', process.env.JWT_SECRET ?? 'dev').update(`${voice}|${text}`).digest('hex').slice(0, 32);
}
export function checkSpeechSig(voice: string, text: string, sig: string) {
  const want = Buffer.from(signSpeech(voice, text));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Текст для озвучки: без эмодзи, разметки и лишних символов. */
export function speakable(text: string) {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[*_#`>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Математика вслух: символы — словами, чтобы голос читал «x в квадрате», а не «икс два». */
export function sayMath(text: string) {
  return speakable(text)
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 делить на $2')
    .replace(/\\[a-z]+/gi, ' ')
    .replace(/[{}]/g, '')
    .replace(/м\/с²/g, ' метров в секунду в квадрате')
    .replace(/м\/с/g, ' метров в секунду')
    .replace(/км\/ч/g, ' километров в час')
    .replace(/кг\/м³/g, ' килограмм на кубический метр')
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 делить на $2')
    .replace(/\s\/\s/g, ' делить на ')
    .replace(/→|⇒/g, ', значит ')
    .replace(/±/g, ' плюс-минус ')
    .replace(/²/g, ' в квадрате')
    .replace(/³/g, ' в кубе')
    .replace(/√/g, ' корень из ')
    .replace(/[·×]/g, ' умножить на ')
    .replace(/\s[−-]\s/g, ' минус ')
    .replace(/(^|[\s(])[−-](?=[\dA-Za-zА-Яа-я])/g, '$1минус ')
    .replace(/\+/g, ' плюс ')
    .replace(/=/g, ' равно ')
    .replace(/≤/g, ' меньше или равно ')
    .replace(/≥/g, ' больше или равно ')
    .replace(/</g, ' меньше ')
    .replace(/>/g, ' больше ')
    .replace(/%/g, ' процентов')
    .replace(/°/g, ' градусов')
    .replace(/:/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Озвучка фразы в mp3 (с кешем на диске). slow — медленнее, для «улитки». */
export async function speech(text: string, slow: boolean, voice: string = EN_VOICE): Promise<Buffer> {
  const key = cacheKey(voice, slow, text);
  const dir = CACHE();
  const file = join(dir, `${key}.mp3`);
  if (existsSync(file)) return readFile(file);
  // очередь переполнена — лучше промолчать, чем заставлять ждать: браузер просто не проиграет звук
  if (pending >= 12) throw new Error('tts busy');
  return queued(async () => {
    if (existsSync(file)) return readFile(file);
    const res = await fetch(`${TTS_URL()}/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice, length_scale: slow ? 1.45 : voice === EN_VOICE ? 1.05 : 0.95, noise_scale: 0.6, noise_w_scale: 0.8 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const mp3 = await toMp3(Buffer.from(await res.arrayBuffer()));
    mkdirSync(dir, { recursive: true });
    await writeFile(`${file}.tmp`, mp3);
    await rename(`${file}.tmp`, file);
    return mp3;
  });
}

export const speechCached = (text: string, slow: boolean, voice: string = EN_VOICE) => existsSync(join(CACHE(), `${cacheKey(voice, slow, text)}.mp3`));

/** Фоновая подготовка озвучки: все фразы курса и комментаторов заранее, по одной, чтобы потом звучало мгновенно. */
export async function warmSpeech(items: { text: string; voice: string }[], log: (msg: string) => void) {
  let made = 0;
  for (const it of items) {
    if (speechCached(it.text, false, it.voice)) continue;
    // живые запросы важнее прогрева
    while (pending > 0) await new Promise((r) => setTimeout(r, 500));
    try {
      await speech(it.text, false, it.voice);
      made++;
    } catch {
      return log(`озвучка: прогрев остановлен после ${made} фраз`);
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  if (made) log(`озвучка: подготовлено ${made} фраз`);
}

/** Короткий ответ модели целиком (для разбора ошибки голосом). */
export async function chatOnce(messages: ChatMsg[], maxTokens: number, signal?: AbortSignal) {
  if (active >= 2) throw new Error('busy');
  active++;
  try {
    const res = await fetch(`${LLM_URL()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.8, top_p: 0.9, repeat_penalty: 1.1 }),
      signal: signal ?? AbortSignal.timeout(40_000),
    });
    if (!res.ok) throw new Error(`llm ${res.status}`);
    const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (d.choices?.[0]?.message?.content ?? '').trim();
  } finally {
    active--;
  }
}

// ——— чат ———
let active = 0;

export const llmBusy = () => active >= 3;

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Потоковый ответ модели: вызывает onToken для каждого кусочка текста. */
export async function chatStream(messages: ChatMsg[], onToken: (t: string) => void, signal: AbortSignal) {
  active++;
  try {
    const res = await fetch(`${LLM_URL()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, stream: true, max_tokens: 380, temperature: 0.6, top_p: 0.9, repeat_penalty: 1.1 }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
    });
    if (!res.ok || !res.body) throw new Error(`llm ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const t = JSON.parse(data).choices?.[0]?.delta?.content;
          if (t) onToken(t);
        } catch {
          /* неполная строка */
        }
      }
    }
  } finally {
    active--;
  }
}
