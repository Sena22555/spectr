// Голоса «Спектра»: озвучка с нашего сервера (нейросеть Piper), запасной вариант — голос браузера.
// Плеер один на всё приложение: новая фраза останавливает предыдущую.

export const EN = 'en';
export const ttsUrl = (text: string, voice = EN, opts: { slow?: boolean; sig?: string } = {}) =>
  `/api/tts?t=${encodeURIComponent(text)}${voice !== EN ? `&v=${encodeURIComponent(voice)}` : ''}${opts.slow ? '&slow=1' : ''}${opts.sig ? `&sig=${opts.sig}` : ''}`;

let current: HTMLAudioElement | null = null;
let queueToken = 0;

export function stopVoice() {
  queueToken++;
  if (current) {
    current.pause();
    current = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/** Проиграть mp3; промис завершается, когда фраза закончилась (или не получилось). */
export function playUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (current) current.pause();
    const a = new Audio(url);
    current = a;
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    a.play().catch(() => resolve(false));
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
    rec.onerror = (e) => (e.error === 'no-speech' || e.error === 'aborted' ? resolve(text) : reject(new Error(e.error === 'not-allowed' ? 'Нет доступа к микрофону' : 'Не расслышал')));
    rec.onend = () => resolve(text);
    stopVoice();
    rec.start();
  });
  return { promise, stop: () => rec?.stop() };
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
