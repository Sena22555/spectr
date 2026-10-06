import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rl } from '../lib/limits.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { EN_VOICE, localLlmEnabled, chatOnce, chatStream, checkSpeechSig, llmBusy, llmEnabled, signSpeech, speakable, speech, sttEnabled, transcribe, ttsEnabled, type ChatMsg } from '../lib/ai.js';
import { COACH_NAMES, COACH_VOICE, coachLines, coachTexts, type CoachId } from '../games/coach.js';
import { knowledge } from '../games/knowledge.js';
import { progressFor } from '../lib/progress.js';
import { englishTexts } from '../english/content.js';

// Чат-помощники «Игр Спектра» и озвучка английского.

const PERSONAS = {
  lingo: { name: 'Лина', subject: 'английскому языку' },
  math: { name: 'Матвей', subject: 'математике' },
  physics: { name: 'Фотон', subject: 'физике' },
  code: { name: 'Байт', subject: 'информатике' },
} as const;
type Persona = keyof typeof PERSONAS;

/** Постоянная часть подсказки (кешируется моделью): характер, правила и проверенная шпаргалка предмета. */
function systemPrompt(game: Persona) {
  const p = PERSONAS[game];
  return [
    `Ты — ${p.name}, помощник по ${p.subject} в онлайн-школе «Спектр» для школьников 5–11 класса.`,
    'Говори дружески и по-молодёжному, на «ты», можно немного сленга («го», «изи», «норм», «лайфхак»). Без мата и насмешек.',
    'Пиши только по-русски (английские примеры — латиницей), никогда не используй китайские символы. Простыми словами.',
    'Отвечай структурно и коротко (до 120 слов): 1) суть одной фразой; 2) правило или шаги — список из 2–4 пунктов; 3) пример; 4) в конце один короткий вопрос, чтобы ученик проверил себя. Важное выделяй **жирным**.',
    game === 'lingo' ? 'Английские примеры пиши по-английски с переводом в скобках.' : 'Формулы пиши обычным текстом (x² + 2x = 0, v = s / t), без LaTeX.',
    'Опирайся на шпаргалку ниже — это проверенные факты. Не выдумывай. Если не уверен — честно скажи и посоветуй спросить преподавателя «Спектра».',
    game === 'lingo'
      ? 'Охотно переводи слова и фразы, объясняй грамматику, придумывай примеры и мини-упражнения.'
      : 'Если нужно посчитать — считай по шагам, проверь результат и только потом называй ответ. Пример: 1/3 + 1/4 = 4/12 + 3/12 = 7/12.',
    'Если ученик ошибся — скажи «почти» и покажи, где ошибка. Домашку целиком не решай: подскажи ход и попроси сделать последний шаг.',
    `Не спрашивай личные данные. Если вопрос не про учёбу — мягко верни к ${p.subject}.`,
    `Шпаргалка:\n${knowledge(game)}`,
  ].join('\n');
}

const TALK_LEVELS = ['Starter', 'A1', 'A2', 'B1'];

/**
 * «English + русский»: разговор идёт по-английски, а поправки и ответы на вопросы — по-русски,
 * чтобы новичок понимал, в чём ошибка. Начало подсказки общее для всех уровней (кеш модели).
 */
function mixPromptFor(level: string) {
  const easy = level === 'Starter' || level === 'A1';
  return [
    'You are Lina, a friendly 19-year-old girl from Brighton (England). You chat with a Russian teenager to help them practise English. The chat itself is in English, explanations are in Russian.',
    'Rules:',
    '1. If the student\'s English message has a mistake, start with one line: ✏️ and the corrected sentence. Then one short line in Russian starting with 💡 that explains only what you changed.',
    '2. Then continue the chat in English: 1–2 short sentences, react to what they said and share something about yourself.',
    '3. If the student writes in Russian, asks how to say something or asks about a word or grammar, first answer in Russian (up to 4 short sentences, English examples with translation), then continue the chat in English with a simple question.',
    '4. Sometimes, not always, end with one question. Never repeat a question. At most one emoji, never write "P.S." You talk with kids: nothing about alcohol, no rude words, no personal data.',
    '',
    'Examples:',
    'Student: yesterday I go to cinema',
    'Lina: ✏️ Yesterday I went to the cinema.',
    '💡 Вчера — это прошлое, поэтому go меняется на went.',
    'Nice! I love scary movies, but I always watch them with the lights on. What did you see?',
    '',
    'Student: как сказать «мне скучно»?',
    'Lina: «Мне скучно» — I\'m bored. Не путай с I\'m boring — это «я скучный» 😄',
    'So, are you bored right now? What do you usually do when you\'re bored?',
    '',
    'Student: I like pizza',
    'Lina: Same here! Pepperoni is my favourite, although I always burn my mouth because I can\'t wait.',
    '',
    easy ? 'This student is a beginner: use very simple English and short sentences.' : 'Use simple, natural everyday English.',
  ].join('\n');
}

const HELP_CLOUD_NOTE =
  'Главное про стиль: ты не учебник, а старший друг в мессенджере. Строго до 120 слов, без заголовков и без «#». Суть одной фразой → 2–4 пункта списком → короткий пример → один вопрос для самопроверки.';
const TALK_CLOUD_NOTE =
  "Before replying, check the student's last message for grammar or word mistakes. Point out only real mistakes, never invent one. If there is any mistake (wrong tense, missing article, word order, wrong verb form), the first line MUST be ✏️ and the corrected sentence. Then 1–2 short, natural sentences. Never more than 3 sentences in total. Write like texting a friend: short lines, and put a blank line between separate thoughts — each part becomes its own message bubble.";
const MIX_CLOUD_NOTE =
  "Before replying, check the student's last message for mistakes. If there is any mistake, the first line MUST be ✏️ and the corrected sentence, the second line 💡 and a short explanation in Russian. The 💡 line explains only the words you actually changed in the ✏️ line — nothing else. Questions in Russian get a short answer in Russian. The chat itself stays in English, 1–2 short sentences. Write like texting a friend: short lines, and put a blank line between separate thoughts — each part becomes its own message bubble.";

/** Последние реплики, но начало окна двигается шагами — так у модели остаётся в кеше одинаковое начало разговора. */
export function stableWindow<T>(list: T[], max: number, step: number) {
  if (list.length <= max) return list;
  return list.slice(Math.ceil((list.length - max) / step) * step);
}
/**
 * Лина в разговорной практике — живая собеседница, а не анкета. Маленькая модель лучше учится на примерах,
 * чем на запретах, поэтому правила короткие, а манера задана образцами диалога.
 */
function talkPromptFor(level: string) {
  const easy = level === 'Starter' || level === 'A1';
  // уровень — последней строкой: всё, что выше, одинаково для всех учеников и лежит в кеше модели готовым
  return [
    'You are Lina, a friendly 19-year-old girl from Brighton (England). You chat in English with a Russian teenager to help them practise. Talk like a real friend in a messenger.',
    'Rules:',
    '1. If the student\'s message has a grammar mistake, start your reply with one line: ✏️ and the corrected sentence. If there is no mistake, skip this line.',
    '2. Then reply naturally in 1–2 short sentences: react to what they said and share something about yourself or your opinion.',
    '3. Sometimes, not always, end with one question about what they said. Never repeat a question.',
    '4. Correct grammar, at most one emoji, never write "P.S." You talk with kids: nothing about alcohol, no rude words, no personal data.',
    '',
    'Examples:',
    'Student: yesterday I go to cinema',
    'Lina: ✏️ Yesterday I went to the cinema.',
    'Nice! I love scary movies, but I always watch them with the lights on. What did you see?',
    '',
    'Student: I like pizza',
    'Lina: Same here! Pepperoni is my favourite, although I always burn my mouth because I can\'t wait 😅',
    '',
    'Student: my brother is play computer all day',
    'Lina: ✏️ My brother plays computer games all day.',
    'Haha, that sounds like a lot of brothers! Which game is he obsessed with?',
    '',
    easy ? 'This student is a beginner: use very simple English and short sentences.' : 'Use simple, natural everyday English.',
  ].join('\n');
}

/**
 * Прогрев: модель заранее читает постоянные подсказки всех помощников, и они остаются в её кеше (у каждого свой слот).
 * Тогда первый ответ начинается за секунду-две, а не через полминуты.
 */
export async function warmChats(log: (m: string) => void) {
  if (!localLlmEnabled()) return;
  const prompts = [...(['lingo', 'math', 'physics', 'code'] as Persona[]).map((g) => systemPrompt(g)), talkPromptFor('A1'), talkPromptFor('B1'), mixPromptFor('A1')];
  let ok = 0;
  for (const content of prompts) {
    try {
      await chatOnce([{ role: 'system', content }, { role: 'user', content: 'Привет' }], 1, AbortSignal.timeout(120_000), true);
      ok++;
    } catch {
      /* занят — прогреем в следующий раз */
    }
  }
  log(`чат: прогрето подсказок — ${ok} из ${prompts.length}`);
}

export async function aiRoutes(app: FastifyInstance) {
  // голос для английских слов и фраз — только для текстов курса, чтобы сервис не озвучивал что попало
  // озвучка: тексты курса — английским голосом, фразы комментаторов — их голосами,
  // всё остальное — только с подписью сервера (ответы нейросети), чтобы сервис не озвучивал что попало
  app.get('/tts', { config: rl(300, '1 minute') }, async (req, reply) => {
    const q = z.object({ t: z.string().min(1).max(400), v: z.string().max(40).optional(), slow: z.string().optional(), sig: z.string().max(64).optional() }).parse(req.query);
    if (!ttsEnabled()) return reply.code(503).send({ error: 'Озвучка выключена' });
    const text = q.t.trim();
    const voice = !q.v || q.v === 'en' ? EN_VOICE : q.v;
    const allowed = (voice === EN_VOICE && englishTexts().has(text)) || coachTexts().get(voice)?.has(text) || (q.sig && checkSpeechSig(voice, text, q.sig));
    if (!allowed) return reply.code(404).send({ error: 'Нет такой фразы' });
    try {
      const mp3 = await speech(text, q.slow === '1', voice);
      return reply.header('content-type', 'audio/mpeg').header('cache-control', 'public, max-age=31536000, immutable').send(mp3);
    } catch (err) {
      req.log.warn({ err }, 'озвучка не удалась');
      return reply.code(503).send({ error: 'Озвучка временно недоступна' });
    }
  });

  // фразы комментатора для игры: браузер выбирает подходящую и сразу проигрывает
  app.get('/ai/coach/:game', async (req, reply) => {
    const { game } = req.params as { game: string };
    if (!(game in COACH_NAMES)) return reply.code(404).send({ error: 'Нет такой игры' });
    const id = game as CoachId;
    return { name: COACH_NAMES[id], voice: COACH_VOICE[id], lines: coachLines(id), tts: ttsEnabled(), llm: llmEnabled() };
  });

  // личный разбор ошибки: 1–2 живые фразы от комментатора + подпись для озвучки
  app.post('/ai/hint', { config: rl(20, '5 minutes') }, async (req, reply) => {
    const body = z.object({ game: z.enum(['lingo', 'math', 'physics', 'code']), task: z.string().max(600), given: z.string().max(120), correct: z.string().max(200) }).parse(req.body);
    if (!llmEnabled()) return reply.code(503).send({ error: 'off' });
    const name = COACH_NAMES[body.game];
    const messages: ChatMsg[] = [
      {
        role: 'system',
        content: `Ты — ${name}, весёлый наставник школьника в учебной игре. Ученик ошибся. Скажи вслух 1–2 коротких предложения (до 30 слов): по-дружески, на «ты», можно сленг («бро», «смотри», «изи»), без мата и насмешек. Подскажи, где именно ошибка и как думать, но не повторяй условие целиком. Без формул в LaTeX, без списков, без эмодзи.`,
      },
      { role: 'user', content: `Задание: ${body.task}\nОтвет ученика: ${body.given || '(пусто)'}\nПравильный ответ: ${body.correct}` },
    ];
    try {
      const text = speakable(await chatOnce(messages, 90)).slice(0, 300);
      if (!text) return reply.code(503).send({ error: 'empty' });
      const voice = COACH_VOICE[body.game];
      void track({ type: 'ai_hint', userId: await optionalUser(req), visitorId: visitorIdOf(req), label: body.game });
      return { text, voice, sig: signSpeech(voice, text) };
    } catch {
      return reply.code(503).send({ error: 'busy' });
    }
  });

  app.get('/ai/status', async () => ({ chat: llmEnabled(), tts: ttsEnabled(), stt: sttEnabled() }));

  // распознавание речи для голосового общения и «Скажи вслух»: запись из браузера → текст
  app.post('/ai/stt', { config: rl(40, '5 minutes') }, async (req, reply) => {
    if (!sttEnabled()) return reply.code(503).send({ error: 'Распознавание речи выключено' });
    // auto — английский с русским: ученик может заговорить на любом из двух языков
    const q = (req.query as { lang?: string }).lang;
    const lang = q === 'en' || q === 'auto' ? q : 'ru';
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Нет записи' });
    const audio = await file.toBuffer();
    if (audio.length < 1000) return { text: '' };
    if (audio.length > 3 * 1024 * 1024) return reply.code(413).send({ error: 'Слишком длинная запись' });
    try {
      return { text: (await transcribe(audio, lang)).slice(0, 600) };
    } catch (err) {
      req.log.warn({ err }, 'распознавание не удалось');
      return reply.code(503).send({ error: 'Не расслышал — попробуй ещё раз' });
    }
  });

  app.post('/ai/chat', { config: rl(14, '5 minutes') }, async (req, reply) => {
    const body = z
      .object({
        game: z.enum(['lingo', 'math', 'physics', 'code']),
        // история из браузера может содержать оборванный пустой ответ — не отказываем, а чистим
        messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(1).max(30),
        where: z.string().max(120).optional(),
        // talk — только английский, mix — английский с объяснениями по-русски
        mode: z.enum(['help', 'talk', 'mix']).default('help'),
        voice: z.boolean().default(false),
        level: z.string().max(10).optional(),
      })
      .parse(req.body);
    if (!llmEnabled()) return reply.code(503).send({ error: 'Помощник сейчас отдыхает. Загляни чуть позже!' });
    // окно модели — 3 тыс. токенов на разговор: берём недавнюю историю и обрезаем длинные реплики;
    // в разговорной практике реплики короткие — помним больше, чтобы Лина не повторялась.
    // Окно разговора сдвигается блоками по 8 реплик: начало истории не меняется каждый ход, и модель не перечитывает её заново
    const isTalk = body.game === 'lingo' && body.mode !== 'help';
    const recent = body.messages.filter((m) => m.content.trim());
    body.messages = (isTalk ? stableWindow(recent, 24, 8) : recent.slice(-6)).map((m) => ({ ...m, content: m.content.slice(0, isTalk ? 400 : m.role === 'user' ? 800 : 700) }));
    if (!body.messages.length || body.messages[body.messages.length - 1]!.role !== 'user') return reply.code(400).send({ error: 'Напиши вопрос — я отвечу' });
    if (llmBusy()) return reply.code(429).send({ error: 'Помощник сейчас отвечает другим ребятам — попробуй через минутку 🙂' });
    const userId = await optionalUser(req);
    const visitorId = visitorIdOf(req);

    // немного о самом ученике — чтобы советы были про него
    const notes: string[] = [];
    try {
      const p = await progressFor({ userId, visitorId });
      if (p.solvedWeek) notes.push(`за неделю решил ${p.solvedWeek} задач.`);
      if (p.weak.length) notes.push(`Сложно даются: ${p.weak.slice(0, 3).map((w) => w.title).join(', ')}.`);
      if (p.mastered.length) notes.push(`Хорошо получается: ${p.mastered.slice(0, 3).map((w) => w.title).join(', ')}.`);
      notes.push(`Уровень в «Спектре»: ${p.xp.level}.`);
    } catch {
      /* без заметок тоже можно */
    }
    // разговорная практика английского: Лина говорит по-английски на уровне ученика и мягко поправляет
    const talk = isTalk;
    const mix = talk && body.mode === 'mix';
    const level = TALK_LEVELS.includes(body.level ?? '') ? body.level! : 'A1';
    const talkPrompt = mix ? mixPromptFor(level) : talkPromptFor(level);
    // переменная часть — отдельным сообщением после постоянной, чтобы кеш модели не сбрасывался
    const about = [notes.length ? `Об ученике: ${notes.join(' ')}` : '', body.where ? `Ученик сейчас в разделе: ${body.where}.` : ''].filter(Boolean).join('\n');
    const messages: ChatMsg[] = talk
      ? [{ role: 'system', content: talkPrompt }, ...body.messages]
      : [{ role: 'system', content: systemPrompt(body.game) }, ...(about ? [{ role: 'system' as const, content: about }] : []), ...body.messages.slice(-8)];
    // голосовой разговор: коротко, как в живой беседе, без формул и списков
    if (body.voice && !talk)
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: 'Это голосовой разговор: отвечай разговорно и коротко — 2–4 предложения, без списков. Если нужно посчитать — проговори шаги словами и проверь ответ.',
      });
    void track({ type: 'ai_chat', userId, visitorId, label: body.game });

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const abort = new AbortController();
    req.raw.on('close', () => abort.abort());
    let full = '';
    // голосовой режим: каждое законченное предложение сразу подписываем — браузер начнёт говорить, не дожидаясь конца ответа
    let sentence = '';
    let spoken = 0;
    const voiceOf = (t: string) => ((t.match(/[a-z]/gi) ?? []).length > (t.match(/[а-яё]/gi) ?? []).length ? EN_VOICE : COACH_VOICE[body.game]);
    const emit = (raw: string) => {
      if (/^\s*p\.?\s?s\b/i.test(raw)) return;
      const t = speakable(raw.replace(/\\[()[\]]/g, '').replace(/✏️|💡/g, ''));
      if (t.length < 2 || spoken >= 14) return;
      spoken++;
      const v = voiceOf(t);
      res.write(`data: ${JSON.stringify({ s: { t, v, sig: signSpeech(v, t) } })}\n\n`);
    };
    try {
      await chatStream(
        talk ? (mix ? 160 : 90) : body.voice ? 200 : 300,
        messages,
        (t) => {
          full += t;
          sentence += t;
          res.write(`data: ${JSON.stringify({ t })}\n\n`);
          // режем по концу предложения, только когда после знака уже пришёл пробел (иначе «3.5» порвётся)
          for (;;) {
            const m = /[.!?…]+(?=\s)|\n/.exec(sentence);
            if (!m) break;
            const cut = m.index + m[0].length;
            emit(sentence.slice(0, cut));
            sentence = sentence.slice(cut);
          }
        },
        abort.signal,
        // облачная модель умнее, но любит длинные «статьи» и пропускает поправки — напоминаем главное
        talk
          ? { temperature: 0.7, presence: 0.4, cloudNote: mix ? MIX_CLOUD_NOTE : TALK_CLOUD_NOTE }
          : { cloudNote: body.voice ? undefined : HELP_CLOUD_NOTE },
      );
      if (sentence.trim()) emit(sentence);
      // для голосового режима — подписанные фразы: английские читает английский голос, русские — голос помощника
      const say = speakable(full)
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 1)
        .slice(0, 12)
        .map((t) => {
          const latin = (t.match(/[a-z]/gi) ?? []).length;
          const cyr = (t.match(/[а-яё]/gi) ?? []).length;
          const v = latin > cyr ? EN_VOICE : COACH_VOICE[body.game];
          return { t, v, sig: signSpeech(v, t) };
        });
      res.write(`data: ${JSON.stringify({ done: true, say })}\n\n`);
    } catch (err) {
      if (!abort.signal.aborted) {
        req.log.warn({ err }, 'чат не ответил');
        res.write(`data: ${JSON.stringify({ error: 'Что-то я задумался и потерял мысль 😅 Спроси ещё раз?' })}\n\n`);
      }
    } finally {
      res.end();
    }
  });
}
