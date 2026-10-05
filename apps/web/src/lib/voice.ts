// Голоса «Спектра»: озвучка с нашего сервера (нейросеть Piper), запасной вариант — голос браузера.
// Плеер один на всё приложение: новая фраза останавливает предыдущую.

export const EN = 'en';
export const ttsUrl = (text: string, voice = EN, opts: { slow?: boolean; sig?: string } = {}) =>
  `/api/tts?t=${encodeURIComponent(text)}${voice !== EN ? `&v=${encodeURIComponent(voice)}` : ''}${opts.slow ? '&slow=1' : ''}${opts.sig ? `&sig=${opts.sig}` : ''}`;

// один плеер на всё приложение: на iPhone звук разрешён только элементу, который уже играл по нажатию
let player: HTMLAudioElement | null = null;
let queueToken = 0;
/** Короткая тишина (WAV), чтобы «разбудить» плеер по нажатию. */
function silence() {
  const n = 800;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Вызвать в обработчике нажатия: после этого браузер разрешит проигрывать ответы помощника. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  player ??= new Audio();
  if (player.dataset.unlocked) return;
  player.dataset.unlocked = '1';
  player.src = silence();
  void player.play().catch(() => {
    delete player!.dataset.unlocked;
  });
}

let pendingResolve: ((ok: boolean) => void) | null = null;

export function stopVoice() {
  queueToken++;
  player?.pause();
  pendingResolve?.(false);
  pendingResolve = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/** Проиграть mp3; промис завершается, когда фраза закончилась (или не получилось). */
export function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    player ??= new Audio();
    const a = player;
    a.pause();
    // предыдущая фраза оборвана — её промис тоже завершаем
    pendingResolve?.(false);
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (pendingResolve === done) pendingResolve = null;
      resolve(ok);
    };
    pendingResolve = done;
    a.onended = () => done(true);
    a.onerror = () => done(false);
    a.src = url;
    a.play().catch(() => done(false));
  });
}

/** Несколько фраз подряд (ответ помощника голосом). Новый вызов отменяет предыдущую очередь. */
export async function playQueue(items: { t: string; v: string; sig?: string }[]) {
  stopVoice();
  const token = queueToken;
  // первую фразу запрашиваем сразу, следующую — заранее, пока звучит текущая
  const urls = items.map((x) => ttsUrl(x.t, x.v, { sig: x.sig }));
  urls.slice(1, 2).forEach((u) => void fetch(u).catch(() => undefined));
  for (let i = 0; i < urls.length; i++) {
    if (token !== queueToken) return;
    if (urls[i + 1]) void fetch(urls[i + 1]!).catch(() => undefined);
    await playUrl(urls[i]!);
  }
}

// потоковая речь: фразы приходят по одной, играем по очереди без пауз
let streamChain: Promise<unknown> = Promise.resolve();
let streamToken = 0;
export function speakStream(item: { t: string; v: string; sig?: string }) {
  const token = streamToken;
  const url = ttsUrl(item.t, item.v, { sig: item.sig });
  void fetch(url).catch(() => undefined);
  streamChain = streamChain.then(() => (token === streamToken ? playUrl(url) : undefined));
}
/** Промис: всё, что поставлено в потоковую речь, договорено. */
export const streamIdle = () => streamChain.then(() => undefined);
export function resetStream() {
  streamToken++;
  streamChain = Promise.resolve();
  stopVoice();
}

/** Заранее подгрузить фразы (кеш браузера). */
export function preload(urls: string[]) {
  for (const u of urls) void fetch(u).catch(() => undefined);
}

// ——— распознавание речи (микрофон) ———
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const Ctor = (): RecognitionCtor | null =>
  typeof window === 'undefined' ? null : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition ?? null);

export const canRecognize = () => Boolean(Ctor());

/** Слушать микрофон: onText — промежуточный текст, промис — итоговая фраза (или пусто). */
export function recognize(lang: 'en-US' | 'en-GB' | 'ru-RU', onText?: (t: string) => void) {
  const C = Ctor();
  let rec: Recognition | null = null;
  const promise = new Promise<string>((resolve, reject) => {
    if (!C) return reject(new Error('Браузер не умеет распознавать речь'));
    rec = new C();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let text = '';
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0]!.transcript)
        .join(' ')
        .trim();
      onText?.(text);
    };
    rec.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve(text) : reject(new Error(e.error === 'not-allowed' ? micHelp('NotAllowedError') : 'Не расслышал')));
    rec.onend = () => resolve(text);
    stopVoice();
    rec.start();
  });
  return { promise, stop: () => rec?.stop() };
}

// ——— запись голоса и распознавание на нашем сервере (Whisper): работает в любом браузере и в России ———
let sttAvailable: boolean | null = null;
async function serverStt() {
  if (sttAvailable !== null) return sttAvailable;
  try {
    const r = (await (await fetch('/api/ai/status')).json()) as { stt?: boolean };
    sttAvailable = Boolean(r.stt);
  } catch {
    sttAvailable = false;
  }
  return sttAvailable;
}
export const canRecord = () => typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

/**
 * Слушать человека: запись микрофона, сама останавливается после паузы в речи (или по stop()).
 * Распознаёт наш сервер; если он недоступен — распознавание браузера.
 * onLevel — громкость 0..1 для анимации, onText — промежуточный текст (только у браузерного распознавания).
 */
export function listenSpeech(lang: 'ru' | 'en', opts: { onLevel?: (v: number) => void; onText?: (t: string) => void } = {}) {
  let stopFn: () => void = () => undefined;
  const promise = (async () => {
    stopVoice();
    if (!(await serverStt()) || !canRecord()) {
      const r = recognize(lang === 'en' ? 'en-US' : 'ru-RU', opts.onText);
      stopFn = r.stop;
      return r.promise;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      throw new Error(micHelp((e as Error).name));
    }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // автостоп: человек начал говорить и замолчал на 1,3 с; максимум 20 с
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = AC ? new AC() : null;
    let raf = 0;
    if (ctx) {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      let spoke = false;
      let quietSince = performance.now();
      const started = performance.now();
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        opts.onLevel?.(Math.min(1, rms * 6));
        const now = performance.now();
        if (rms > 0.04) {
          spoke = true;
          quietSince = now;
        }
        if ((spoke && now - quietSince > 1300) || now - started > 20_000 || (!spoke && now - started > 8000)) {
          if (rec.state === 'recording') rec.stop();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    });
    stopFn = () => rec.state === 'recording' && rec.stop();
    rec.start(250);
    const blob = await done;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    opts.onLevel?.(0);
    if (blob.size < 2000) return '';
    const form = new FormData();
    form.append('file', blob, `speech.${(blob.type.split('/')[1] ?? 'webm').split(';')[0]}`);
    const res = await fetch(`/api/ai/stt?lang=${lang}`, { method: 'POST', body: form, headers: { 'x-visitor': localStorage.getItem('spectr.vid') ?? '' } });
    const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) throw new Error(d.error ?? 'Не расслышал — попробуй ещё раз');
    return d.text ?? '';
  })();
  return { promise, stop: () => stopFn() };
}

/** Понятная подсказка, почему микрофон не включился и что нажать. */
export function micHelp(errorName: string) {
  const inApp = /Telegram|VK|MAX/i.test(navigator.userAgent) || Boolean((window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData);
  if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') return 'Микрофон не найден. Подключи наушники с микрофоном или зайди с телефона.';
  if (inApp) return 'Внутри мессенджера микрофон может быть закрыт. Открой сайт в обычном браузере (Chrome, Safari, Яндекс) — там разговор работает.';
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError')
    return 'Браузер не дал микрофон. Нажми на значок замка 🔒 слева от адреса сайта → «Микрофон» → «Разрешить», затем обнови страницу.';
  return 'Не получилось включить микрофон. Обнови страницу и попробуй ещё раз.';
}

// ——— режимы «не могу слушать / говорить» и комментатор ———
const flag = (key: string) => {
  try {
    const until = Number(localStorage.getItem(key));
    return until > Date.now();
  } catch {
    return false;
  }
};
const setFlag = (key: string, minutes: number) => {
  try {
    localStorage.setItem(key, String(Date.now() + minutes * 60_000));
  } catch {
    /* ignore */
  }
};
/** «Не могу слушать» — на час задания на слух показываются текстом. */
export const noListen = () => flag('spectr.noListen');
export const setNoListen = () => setFlag('spectr.noListen', 60);
/** «Не могу говорить» — на час задания «скажи вслух» пропускаются. */
export const noSpeak = () => flag('spectr.noSpeak');
export const setNoSpeak = () => setFlag('spectr.noSpeak', 60);

export function coachOn() {
  try {
    return localStorage.getItem('spectr.coach') !== 'off';
  } catch {
    return true;
  }
}
export function setCoachOn(on: boolean) {
  try {
    localStorage.setItem('spectr.coach', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
