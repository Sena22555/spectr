import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rl } from '../lib/limits.js';
import { optionalUser, track, visitorIdOf } from '../lib/track.js';
import { EN_VOICE, chatOnce, chatStream, checkSpeechSig, llmBusy, llmEnabled, signSpeech, speakable, speech, sttEnabled, transcribe, ttsEnabled, type ChatMsg } from '../lib/ai.js';
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
    'Пиши только по-русски, простыми словами. Объясняй по шагам с коротким примером. 3–7 предложений.',
    game === 'lingo' ? 'Английские примеры пиши по-английски с переводом в скобках.' : 'Формулы пиши обычным текстом (x² + 2x = 0, v = s / t), без LaTeX.',
    'Опирайся на шпаргалку ниже — это проверенные факты. Не выдумывай. Если не уверен — честно скажи и посоветуй спросить преподавателя «Спектра».',
    'Держись школьной программы. Если ученик ошибся — скажи «почти» и покажи, где ошибка. Домашку целиком не решай: подскажи ход и попроси сделать последний шаг.',
    `Не спрашивай личные данные. Если вопрос не про учёбу — мягко верни к ${p.subject}.`,
    `Шпаргалка:\n${knowledge(game)}`,
  ].join('\n');
}

const TALK_LEVELS = ['Starter', 'A1', 'A2', 'B1'];
function talkPromptFor(level: string) {
  return [
    `You are Lina, a friendly English speaking partner for a Russian school student (English level: ${level}).`,
    level === 'Starter' || level === 'A1' ? 'Use very simple English: short sentences, basic words, Present Simple.' : 'Use simple everyday English (A2–B1).',
    'Reply in 1–3 short sentences and always finish with one easy question to keep the conversation going.',
    'If the student makes a grammar or word mistake, start with a gentle correction like: "Better: I went to school." Then continue.',
    'If the student writes in Russian, translate the idea into simple English, and ask them to try saying it in English.',
    'Be warm and fun. No rude words. Do not ask for personal data (address, phone, surname).',
  ].join('\n');
}

/**
 * Прогрев: модель заранее читает постоянные подсказки всех помощников, и они остаются в её кеше (у каждого свой слот).
 * Тогда первый ответ начинается за секунду-две, а не через полминуты.
 */
export async function warmChats(log: (m: string) => void) {
  if (!llmEnabled()) return;
  const prompts = [...(['lingo', 'math', 'physics', 'code'] as Persona[]).map((g) => systemPrompt(g)), talkPromptFor('A1')];
  let ok = 0;
  for (const content of prompts) {
    try {
      await chatOnce([{ role: 'system', content }, { role: 'user', content: 'Привет' }], 1, AbortSignal.timeout(120_000));
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
    const lang = (req.query as { lang?: string }).lang === 'en' ? 'en' : 'ru';
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
        messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(800) })).min(1).max(12),
        where: z.string().max(120).optional(),
        mode: z.enum(['help', 'talk']).default('help'),
        level: z.string().max(10).optional(),
      })
      .parse(req.body);
    if (!llmEnabled()) return reply.code(503).send({ error: 'Помощник сейчас отдыхает. Загляни чуть позже!' });
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
    const talk = body.game === 'lingo' && body.mode === 'talk';
    const level = TALK_LEVELS.includes(body.level ?? '') ? body.level! : 'A1';
    const talkPrompt = talkPromptFor(level);
    // переменная часть — отдельным сообщением после постоянной, чтобы кеш модели не сбрасывался
    const about = [notes.length ? `Об ученике: ${notes.join(' ')}` : '', body.where ? `Ученик сейчас в разделе: ${body.where}.` : ''].filter(Boolean).join('\n');
    const messages: ChatMsg[] = talk
      ? [{ role: 'system', content: talkPrompt }, ...body.messages.slice(-8)]
      : [{ role: 'system', content: systemPrompt(body.game) }, ...(about ? [{ role: 'system' as const, content: about }] : []), ...body.messages.slice(-8)];
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
      const t = speakable(raw.replace(/\\[()[\]]/g, ''));
      if (t.length < 2 || spoken >= 14) return;
      spoken++;
      const v = voiceOf(t);
      res.write(`data: ${JSON.stringify({ s: { t, v, sig: signSpeech(v, t) } })}\n\n`);
    };
    try {
      await chatStream(
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
