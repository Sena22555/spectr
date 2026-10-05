import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { Headphones, Mic, Phone, PhoneOff, Send, Trash2, X } from 'lucide-react';
import { apiHeaders } from '../../lib/api';
import { Markdown } from './Markdown';
import { COACH_FACE, useCoachData } from '../../lib/coach';
import { GAME_META, savedEnLevel, type GameKey } from '../../lib/games';
import { canRecognize, canRecord, listenSpeech, resetStream, speakStream, stopVoice, streamIdle, unlockAudio } from '../../lib/voice';

// Чат-помощник игры: Лина (английский), Матвей (математика), Фотон (физика), Байт (информатика).
// Работает на нашей нейросети. Три способа: написать, сказать в микрофон или «Разговор» — как звонок:
// помощник слушает, сам понимает, что ты договорил, отвечает голосом и снова слушает.

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGEST: Record<GameKey, string[]> = {
  lingo: ['Объясни Present Perfect по-простому', 'Чем отличается a и the?', 'Как сказать «я опоздал» по-английски?', 'Что мне подтянуть?'],
  math: ['Объясни, как складывать дроби', 'Как решать квадратные уравнения?', 'Дай мне задачку на проценты', 'Что мне подтянуть?'],
  physics: ['Что такое импульс простыми словами?', 'Как запомнить закон Ома?', 'Почему небо голубое?', 'Что мне подтянуть?'],
  code: ['Как перевести число в двоичную систему?', 'Что делает range в Python?', 'Объясни логическое И и ИЛИ', 'Что мне подтянуть?'],
};
const NAME_TO: Record<string, string> = { Лина: 'Лину', Матвей: 'Матвея', Фотон: 'Фотона', Байт: 'Байта' };

const storeKey = (game: GameKey, talk: boolean) => `spectr.chat.${game}${talk ? '.talk' : ''}`;
function load(game: GameKey, talk: boolean): Msg[] {
  try {
    return (JSON.parse(localStorage.getItem(storeKey(game, talk)) ?? '[]') as Msg[]).filter((m) => m.content?.trim());
  } catch {
    return [];
  }
}

/** Кнопка «Спросить …» в углу экрана и само окно чата. */
export function ChatLauncher({ game, where }: { game: GameKey; where?: string }) {
  const coach = useCoachData(game);
  const [open, setOpen] = useState(false);
  const name = coach.data?.name ?? { lingo: 'Лина', math: 'Матвей', physics: 'Фотон', code: 'Байт' }[game];
  if (coach.data && !coach.data.llm) return null;
  return (
    <>
      <motion.button
        type="button"
        onClick={() => {
          unlockAudio();
          setOpen(true);
        }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={clsx(`hue-${GAME_META[game].hue}`, 'press fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-ink py-2 pr-5 pl-2 text-[15px] font-[650] text-paper shadow-sticker hover:bg-mark hover:text-forest sm:right-6 sm:bottom-6')}
        aria-label={`Спросить: ${name}`}
      >
        <span className="grid size-10 place-items-center rounded-full bg-tint text-[22px]">{COACH_FACE[game]}</span>
        Спросить {NAME_TO[name] ?? name}
      </motion.button>
      <AnimatePresence>{open && <ChatPanel game={game} name={name} where={where} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/** Один запрос к помощнику: текст приходит потоком, в голосовом режиме каждое предложение сразу звучит. */
async function askHelper(args: { game: GameKey; history: Msg[]; talk: boolean; voice: boolean; where?: string; signal: AbortSignal; onText(t: string): void; speak: boolean }) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({
      game: args.game,
      messages: args.history
        .filter((m) => m.content.trim())
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })),
      where: args.where,
      mode: args.talk ? 'talk' : 'help',
      voice: args.voice,
      level: savedEnLevel() ?? undefined,
    }),
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(d?.error ?? 'Помощник сейчас не отвечает. Попробуй чуть позже.');
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let answer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i).replace(/^data:\s*/, '');
      buf = buf.slice(i + 2);
      let d: { t?: string; s?: { t: string; v: string; sig: string }; error?: string };
      try {
        d = JSON.parse(chunk);
      } catch {
        continue;
      }
      if (d.error) throw new Error(d.error);
      if (d.t) {
        answer += d.t;
        args.onText(answer);
      }
      if (d.s && args.speak) speakStream(d.s);
    }
  }
  return answer;
}

type CallState = 'listening' | 'thinking' | 'speaking' | 'paused';

function ChatPanel({ game, name, where, onClose }: { game: GameKey; name: string; where?: string; onClose(): void }) {
  const [talk, setTalk] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => load(game, false));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  const voiceRef = useRef(false);
  voiceRef.current = voice;
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [call, setCall] = useState<CallState | null>(null);
  // номер текущего разговора: перебили или положили трубку — старый цикл сам остановится
  const callId = useRef(0);
  const stopMic = useRef<(() => void) | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  const mic = canRecord() || canRecognize();

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(game, talk), JSON.stringify(msgs.filter((m) => m.content.trim()).slice(-20)));
    } catch {
      /* ignore */
    }
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, game, talk]);
  useEffect(
    () => () => {
      callId.current++;
      abort.current?.abort();
      stopMic.current?.();
      resetStream();
    },
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const switchMode = (t: boolean) => {
    endCall();
    abort.current?.abort();
    stopVoice();
    setTalk(t);
    setMsgs(load(game, t));
    setError(null);
  };

  /** Отправить реплику; возвращает ответ (для режима разговора). */
  const send = useCallback(
    async (content: string, opts: { speak?: boolean; voiceMode?: boolean } = {}) => {
      const q = content.trim();
      if (!q) return '';
      unlockAudio();
      setError(null);
      setText('');
      resetStream();
      const history = [...msgsRef.current, { role: 'user' as const, content: q }];
      setMsgs([...history, { role: 'assistant', content: '' }]);
      setBusy(true);
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const answer = await askHelper({
          game,
          history,
          talk,
          voice: Boolean(opts.voiceMode),
          where,
          signal: ctrl.signal,
          speak: opts.speak ?? voiceRef.current,
          onText: (a) => setMsgs([...history, { role: 'assistant', content: a }]),
        });
        return answer;
      } catch (e) {
        if (!ctrl.signal.aborted) setError((e as Error).message);
        // оборванный ответ: оставляем то, что успело прийти, пустой — убираем
        setMsgs((list) => list.filter((m) => m.content.trim()));
        return '';
      } finally {
        setBusy(false);
      }
    },
    [game, talk, where],
  );

  // кнопка микрофона: одна реплика голосом — ответ голосом
  const speakIn = async () => {
    unlockAudio();
    if (listening) return stopMic.current?.();
    setError(null);
    setListening(true);
    voiceRef.current = true;
    setVoice(true);
    const r = listenSpeech(talk ? 'en' : 'ru', { onLevel: setLevel, onText: setText });
    stopMic.current = r.stop;
    try {
      const said = await r.promise;
      setListening(false);
      if (said) void send(said, { speak: true, voiceMode: true });
      else setError('Не расслышал — нажми на микрофон и скажи ещё раз');
    } catch (e) {
      setListening(false);
      setError((e as Error).message);
    }
  };

  // «Разговор»: слушаем → отвечаем голосом → снова слушаем, пока не положишь трубку
  const endCall = () => {
    callId.current++;
    stopMic.current?.();
    abort.current?.abort();
    resetStream();
    setCall(null);
    setLevel(0);
  };
  const startCall = async () => {
    unlockAudio();
    setError(null);
    const id = ++callId.current;
    const live = () => callId.current === id;
    let silent = 0;
    while (live()) {
      setCall('listening');
      const r = listenSpeech(talk ? 'en' : 'ru', { onLevel: setLevel, onText: setText });
      stopMic.current = r.stop;
      let said = '';
      try {
        said = await r.promise;
      } catch (e) {
        setError((e as Error).message);
        break;
      }
      setLevel(0);
      if (!live()) return;
      if (!said.trim()) {
        silent++;
        // дважды тишина — ставим разговор на паузу, чтобы не слушать комнату бесконечно
        if (silent >= 2) {
          setCall('paused');
          return;
        }
        continue;
      }
      silent = 0;
      setCall('thinking');
      const answer = await send(said, { speak: true, voiceMode: true });
      if (!live()) return;
      if (!answer) break;
      setCall('speaking');
      await streamIdle();
    }
    if (live()) setCall('paused');
  };
  // перебить: пока помощник говорит или думает — сразу слушаем снова
  const interrupt = () => {
    if (call === 'speaking' || call === 'thinking') {
      callId.current++;
      abort.current?.abort();
      resetStream();
      setTimeout(() => void startCall(), 150);
    } else if (call === 'listening') stopMic.current?.();
    else if (call === 'paused') void startCall();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-end bg-forest/30 sm:items-stretch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={`Чат: ${name}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className={clsx(`hue-${GAME_META[game].hue}`, 'relative flex h-[88dvh] w-full flex-col overflow-hidden rounded-t-[18px] bg-paper shadow-sticker sm:h-full sm:max-w-[440px] sm:rounded-none sm:rounded-l-[18px]')}
      >
        <header className="flex items-center gap-3 border-b border-dashed border-hair-soft bg-tint px-4 py-3">
          <span className="grid size-11 place-items-center rounded-full bg-paper text-[24px] shadow-sticker">{COACH_FACE[game]}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="t-heading text-[18px] leading-tight">{name}</b>
            <span className="t-mono text-[11px] text-hue">{busy ? 'печатает…' : talk ? 'разговорная практика · English' : `помощник · ${GAME_META[game].subject.toLowerCase()}`}</span>
          </div>
          {mic && (
            <button
              type="button"
              onClick={() => void startCall()}
              className="press inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-[650] text-paper hover:bg-mark hover:text-forest"
              title="Поговорить голосом, как по телефону"
            >
              <Phone className="size-4" /> Разговор
            </button>
          )}
          <button type="button" onClick={() => setMsgs([])} className="press grid size-9 place-items-center rounded-full text-muted hover:bg-ink/[0.06]" aria-label="Очистить чат" title="Очистить чат">
            <Trash2 className="size-4" />
          </button>
          <button type="button" onClick={onClose} className="press grid size-9 place-items-center rounded-full hover:bg-ink/[0.06]" aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </header>

        {game === 'lingo' && (
          <div className="flex gap-1 border-b border-dashed border-hair-soft px-3 py-2" role="tablist">
            {[
              [false, 'Спросить по-русски'],
              [true, 'Поболтать по-английски'],
            ].map(([t, label]) => (
              <button key={String(t)} type="button" role="tab" aria-selected={talk === t} onClick={() => switchMode(t as boolean)} className={clsx('press flex-1 rounded-full px-3 py-1.5 text-[13.5px] font-[600]', talk === t ? 'bg-ink text-paper' : 'hover:bg-ink/[0.06]')}>
                {label as string}
              </button>
            ))}
          </div>
        )}

        <div ref={list} className="graph-paper flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          {!msgs.length && (
            <div className="flex flex-col gap-3">
              <p className="rounded-[14px] rounded-tl-[4px] bg-paper px-4 py-3 text-[15.5px] shadow-sticker">
                {talk
                  ? 'Hi! I’m Lina 👋 Let’s chat in English. Пиши, говори в микрофон или нажми «Разговор» — поболтаем голосом, я мягко поправлю ошибки. What did you do today?'
                  : `Йоу! Я ${name}. Спрашивай что непонятно — объясню по-человечески. Можно голосом: нажми «Разговор» сверху и просто говори.`}
              </p>
              {!talk && (
                <div className="flex flex-wrap gap-2">
                  {SUGGEST[game].map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="press rounded-full border border-ink/20 bg-paper px-3 py-1.5 text-[13.5px] hover:bg-mark">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {msgs.map((m, i) => (
            <p
              key={i}
              className={clsx(
                'max-w-[88%] px-4 py-2.5 text-[15.5px] leading-relaxed shadow-sticker',
                m.role === 'user' && 'whitespace-pre-wrap',
                m.role === 'user' ? 'self-end rounded-[14px] rounded-tr-[4px] bg-ink text-paper' : 'self-start rounded-[14px] rounded-tl-[4px] bg-paper',
              )}
            >
              {m.content ? (
                m.role === 'assistant' ? (
                  <Markdown text={m.content} />
                ) : (
                  m.content
                )
              ) : (
                <Dots />
              )}
            </p>
          ))}
          {error && <p className="self-center rounded-[8px] bg-butter px-3 py-2 text-[14px]">{error}</p>}
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-dashed border-hair-soft px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setVoice((v) => !v);
            }}
            className={clsx('press grid size-11 shrink-0 place-items-center rounded-full', voice ? 'bg-mark text-forest' : 'text-muted hover:bg-ink/[0.06]')}
            aria-pressed={voice}
            aria-label={voice ? 'Ответы голосом: вкл' : 'Ответы голосом: выкл'}
            title="Отвечать голосом"
          >
            <Headphones className="size-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(text);
              }
            }}
            rows={1}
            maxLength={800}
            placeholder={listening ? 'Слушаю…' : talk ? 'Write in English…' : 'Спроси что угодно по теме…'}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[12px] border-[1.5px] border-ink/20 bg-paper px-3 py-2.5 text-[15.5px] focus-visible:border-ink focus-visible:outline-none"
          />
          {mic && (
            <button
              type="button"
              onClick={() => void speakIn()}
              className={clsx('press grid size-11 shrink-0 place-items-center rounded-full transition-shadow', listening ? 'bg-[var(--ray-0)] text-paper' : 'bg-bone hover:bg-mark')}
              style={listening ? { boxShadow: `0 0 0 ${4 + level * 14}px color-mix(in oklab, var(--ray-0) 30%, transparent)` } : undefined}
              aria-label={listening ? 'Остановить' : 'Сказать голосом'}
            >
              <Mic className="size-5" />
            </button>
          )}
          <button type="submit" disabled={busy || !text.trim()} className="press grid size-11 shrink-0 place-items-center rounded-full bg-ink text-paper hover:bg-mark hover:text-forest disabled:opacity-40" aria-label="Отправить">
            <Send className="size-5" />
          </button>
        </form>
        <p className="px-4 pb-2 text-center text-[11.5px] text-muted">Это нейросеть «Спектра»: она может ошибаться. Не пиши личные данные.</p>

        {/* «Разговор»: экран звонка поверх чата */}
        <AnimatePresence>
          {call && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex flex-col items-center justify-between bg-forest px-6 pt-10 pb-[max(28px,env(safe-area-inset-bottom))] text-cream">
              <div className="flex flex-col items-center gap-1 text-center">
                <b className="t-display text-[28px]">{name}</b>
                <span className="t-mono text-[12px] text-mark">{talk ? 'speaking English' : 'разговор голосом'}</span>
              </div>
              <button type="button" onClick={interrupt} className="relative grid size-56 place-items-center" aria-label={call === 'listening' ? 'Я договорил' : call === 'paused' ? 'Продолжить разговор' : 'Перебить и сказать своё'}>
                {[0, 1, 2].map((k) => (
                  <motion.span
                    key={k}
                    className="absolute inset-0 rounded-full border-2 border-mark"
                    animate={
                      call === 'speaking'
                        ? { scale: [1, 1.25 + k * 0.12], opacity: [0.6, 0] }
                        : call === 'listening'
                          ? { scale: 1 + level * (0.35 + k * 0.15), opacity: 0.25 + level * 0.5 }
                          : call === 'thinking'
                            ? { rotate: 360, opacity: 0.35 }
                            : { scale: 1, opacity: 0.2 }
                    }
                    transition={call === 'speaking' ? { repeat: Infinity, duration: 1.4, delay: k * 0.35 } : call === 'thinking' ? { repeat: Infinity, duration: 2.4, ease: 'linear' } : { duration: 0.12 }}
                    style={call === 'thinking' ? { borderStyle: 'dashed' } : undefined}
                  />
                ))}
                <span className="grid size-40 place-items-center rounded-full bg-tint text-[72px] shadow-sticker">{COACH_FACE[game]}</span>
              </button>
              <div className="flex w-full flex-col items-center gap-5">
                <p className="min-h-[3.5em] max-w-sm text-center text-[16px] text-cream/90">
                  {call === 'listening' ? text || 'Говори — я слушаю…' : call === 'thinking' ? 'Думаю…' : call === 'speaking' ? 'Отвечаю. Нажми на меня, чтобы перебить' : 'Пауза. Нажми на меня, чтобы продолжить'}
                </p>
                {error && <p className="rounded-[8px] bg-butter px-3 py-2 text-[14px] text-forest">{error}</p>}
                <button type="button" onClick={endCall} className="press grid size-16 place-items-center rounded-full bg-[var(--ray-0)] text-paper shadow-sticker" aria-label="Закончить разговор">
                  <PhoneOff className="size-7" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((k) => (
        <motion.span key={k} className="size-2 rounded-full bg-ink/40" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: k * 0.2 }} />
      ))}
    </span>
  );
}
