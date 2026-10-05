import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowRight, EarOff, Lightbulb, Mic, MicOff, PencilLine, RotateCcw, Snail, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { RichText } from '../../components/Tex';
import { Burst } from '../../components/game/Burst';
import { LevelUp, XpMeter } from '../../components/game/XpMeter';
import { Beam, BlitzTimer, GameMark, Memory, Stamp, type BeamCell } from '../../components/games/parts';
import { canSpeak, checkTyped, normalize, speak } from '../../lib/english';
import { canRecognize, canRecord, listenSpeech, noListen, noSpeak, setNoListen, setNoSpeak, unlockAudio } from '../../lib/voice';
import { COACH_FACE, useCoach } from '../../lib/coach';
import { ChatLauncher } from '../../components/games/Chat';
import { checkSolve, isGame, loadLevel, nextLevelId, saveResult, type AnyStep, type GameKey, type PlayLevel } from '../../lib/games';
import { levelOf, sfx, useGame, useRefreshGame } from '../../lib/game';
import { haptic } from '../../lib/platform';
import { usePageTitle } from '../../lib/title';

type Answer = number | string | number[] | boolean | null;
type Verdict = { ok: boolean; typo?: boolean; correct: string; explain: string[]; timeout?: boolean };

const KIND: Record<AnyStep['type'], string> = {
  new: 'словарик',
  rule: 'шпаргалка',
  cheat: 'шпаргалка',
  pick: 'выбор',
  listen: 'на слух',
  build: 'собери фразу',
  type: 'перевод',
  fill: 'пропуск',
  match: 'найди пару',
  memory: 'найди пару',
  solve: 'задача',
  choose: 'выбор',
  truefalse: 'верно или нет',
  order: 'по порядку',
  spot: 'найди ошибку',
  say: 'скажи вслух',
};
const PRAISE = ['Так держать!', 'Отлично!', 'Точно!', 'В яблочко!', 'Блестяще!', 'Чисто!'];
const ungraded = (s: AnyStep) => s.type === 'new' || s.type === 'rule' || s.type === 'cheat';
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Экран игры: карточки по одной на тетрадном листе, луч копит цвета, учитель ставит печать. */
export default function Play() {
  const { game = '', id = '' } = useParams();
  const [round, setRound] = useState(0);
  const valid = isGame(game);
  const q = useQuery({ queryKey: ['play', game, id, round], queryFn: () => loadLevel(game as GameKey, id), staleTime: Infinity, gcTime: 0, enabled: valid });
  usePageTitle(q.data ? `${q.data.chapter.title}: ${q.data.level.title}` : 'Игры Спектра');
  if (!valid) return <Navigate to="/games" replace />;
  if (q.isPending)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loading label="Раскладываем карточки…" />
      </div>
    );
  if (q.error)
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <ErrorNote error={q.error} />
        <ButtonLink to={`/games/${game}`} variant="secondary" className="w-fit">
          К тетради
        </ButtonLink>
      </div>
    );
  // без микрофона (или «не могу говорить») задания «скажи вслух» убираем
  // и задания на слух — если ученик сказал «не могу слушать»
  const speakOk = (canRecord() || canRecognize()) && !noSpeak();
  const listenOk = !noListen();
  const lv = speakOk && listenOk ? q.data : { ...q.data, steps: q.data.steps.filter((x) => (speakOk || x.type !== 'say') && (listenOk || x.type !== 'listen')) };
  return <Session key={`${id}-${round}`} level={lv} onAgain={() => setRound((r) => r + 1)} />;
}

function Session({ level, onAgain }: { level: PlayLevel; onAgain(): void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const game = useGame();
  const refreshGame = useRefreshGame();
  const [queue, setQueue] = useState(() => level.steps.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [marks, setMarks] = useState<BeamCell[]>([]);
  const retried = useRef(new Set<number>());
  const [mistakes, setMistakes] = useState(0);
  const [answer, setAnswer] = useState<Answer>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const [fire, setFire] = useState(0);
  const [blitzOk, setBlitzOk] = useState(false);
  const [started] = useState(() => Date.now());
  const [result, setResult] = useState<{ xp: number; ms: number } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const idx = queue[pos]!;
  const step = level.steps[idx]!;
  const hue = level.chapter.hue;
  const graded = level.steps.filter((s) => !ungraded(s)).length;
  const isBlitz = (step.type === 'solve' || step.type === 'choose') && Boolean(step.blitz);
  const coach = useCoach(level.game);
  const streak = useRef(0);
  const misses = useRef(0);
  const [quiet, setQuiet] = useState(noListen);
  const greeted = useRef(false);
  // первое касание «будит» звук (на iPhone без этого голос не заиграет)
  useEffect(() => {
    const wake = () => unlockAudio();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);
  useEffect(() => {
    if (!coach.ready || greeted.current) return;
    greeted.current = true;
    const t = setTimeout(() => void coach.say('start'), 500);
    return () => clearTimeout(t);
  }, [coach.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // «не могу слушать» нажали посреди уровня — оставшиеся задания на слух пропускаем
  useEffect(() => {
    if (quiet && step.type === 'listen' && !verdict) next();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useMutation({
    mutationFn: () => saveResult(level.game, level.id, graded, mistakes, blitzOk),
    onSuccess: (r) => {
      const before = game.data?.xp.total ?? 0;
      setResult({ xp: r.xp, ms: Date.now() - started });
      sfx('finish');
      setTimeout(() => void coach.say(mistakes === 0 ? 'perfect' : mistakes / Math.max(1, graded) > 0.4 ? 'finishTough' : 'finish'), 700);
      if (game.data && levelOf(before + r.xp).level > levelOf(before).level) setTimeout(() => setLevelUp(levelOf(before + r.xp).level), 1200);
      void refreshGame();
      void qc.invalidateQueries({ queryKey: ['game-map'] });
      void qc.invalidateQueries({ queryKey: ['games-hub'] });
    },
  });

  const settle = useCallback(
    (ok: boolean, correct: string, opts: { typo?: boolean; say?: string | null; explain?: string[]; timeout?: boolean; ask?: { task: string; given: string }; tip?: { t: string; v: string; sig: string } } = {}) => {
      setVerdict({ ok, correct, typo: opts.typo, explain: opts.explain ?? [], timeout: opts.timeout });
      // английский образец звучит, только если комментатор молчит: иначе голоса наложатся
      if (opts.say && (!coach.on || !coach.ready)) setTimeout(() => speak(opts.say!), 200);
      if (ok) {
        haptic('success');
        sfx('correct');
        setFire((n) => n + 1);
        if (isBlitz) setBlitzOk(true);
        streak.current++;
        misses.current = 0;
        const hard = isBlitz || (level.game !== 'lingo' && level.level.n === 3) || step.type === 'type' || step.type === 'spot';
        const ev = [3, 5, 8, 12].includes(streak.current) ? 'streak' : hard ? 'okHard' : 'ok';
        const said = coach.say(ev);
        if (opts.say && coach.on) void said.then(() => speak(opts.say!));
      } else {
        haptic('tap');
        sfx('almost');
        streak.current = 0;
        misses.current++;
        const said = coach.say(opts.timeout ? 'timeout' : misses.current > 1 ? 'almostAgain' : 'almost');
        // разбор — проверенная подсказка из задачи (нейросеть в объяснениях задач может ошибиться)
        if (opts.tip) void coach.tip(opts.tip, said);
        setMistakes((m) => m + 1);
        // карточка вернётся в конце, один раз
        if (!retried.current.has(idx)) {
          retried.current.add(idx);
          setQueue((q) => [...q, idx]);
        }
      }
    },
    [idx, isBlitz, coach, level, step.type],
  );

  const next = useCallback(() => {
    setMarks((m) => {
      const out = [...m];
      out[pos] = verdict ? (verdict.ok ? 'ok' : 'almost') : 'ok';
      return out;
    });
    if (pos + 1 >= queue.length) {
      finish.mutate();
      return;
    }
    setPos((p) => p + 1);
    setAnswer(null);
    setVerdict(null);
    setFlipped(false);
    setHint(false);
    coach.reset();
  }, [pos, queue.length, finish, verdict, coach]);

  const canCheck = useMemo(() => {
    switch (step.type) {
      case 'new':
        return flipped;
      case 'rule':
      case 'cheat':
        return true;
      case 'match':
      case 'memory':
      case 'truefalse':
      case 'say':
        return false;
      case 'build':
        return Array.isArray(answer) && answer.length > 0;
      case 'order':
        return Array.isArray(answer) && answer.length === step.items.length;
      case 'type':
      case 'solve':
        return typeof answer === 'string' && answer.trim().length > 0;
      default:
        return typeof answer === 'number';
    }
  }, [step, answer, flipped]);

  const check = useCallback(() => {
    if (step.type === 'new' || step.type === 'rule' || step.type === 'cheat') return canCheck ? next() : undefined;
    if (!canCheck) return;
    switch (step.type) {
      case 'pick':
        return settle(answer === step.answer, step.options[step.answer]!.text, { say: step.say ?? step.options[step.answer]!.text });
      case 'listen':
        return settle(answer === step.answer, step.options[step.answer]!, { say: step.say });
      case 'fill': {
        const full = step.sentence.replace('___', step.options[step.answer]!);
        return settle(answer === step.answer, full, { say: full.replace(/\s*\([A-Z]+\)$/, ''), ask: { task: `Вставить пропуск: ${step.sentence} (${step.ru})`, given: step.options[answer as number] ?? '' } });
      }
      case 'build': {
        const given = (answer as number[]).map((i) => step.tiles[i]).join(' ');
        const right = step.answer.join(' ');
        return settle(given.toLowerCase() === right.toLowerCase(), right, { say: right, ask: { task: `Собрать по-английски: «${step.ru}»`, given } });
      }
      case 'type': {
        const v = checkTyped(answer as string, step.answers);
        return settle(v !== 'almost', step.answers[0]!, { typo: v === 'typo', say: step.answers[0], ask: { task: `Перевести на английский: «${step.ru}»`, given: answer as string } });
      }
      case 'spot': {
        const fixed = step.words.map((w, i) => (i === step.wrong ? w.replace(/^[^\s.,!?]+/, step.fix) : w)).join(' ');
        return settle(answer === step.wrong, fixed, { say: fixed, ask: { task: `Найти ошибку в предложении: ${step.words.join(' ')}`, given: `ученик нажал на слово «${step.words[answer as number]}»` } });
      }
      case 'solve':
        return settle(checkSolve(step, answer as string), step.display, { explain: step.explain, tip: step.hintSay });
      case 'choose':
        return settle(answer === step.answer, step.display, { explain: step.explain, tip: step.hintSay });
      case 'order': {
        const ok = (answer as number[]).every((v, i) => v === step.order[i]);
        return settle(ok, step.order.map((i) => step.items[i]).join(' < '));
      }
    }
  }, [step, answer, canCheck, settle, next]);

  const timeUp = useCallback(() => {
    if (verdict || !(step.type === 'solve' || step.type === 'choose')) return;
    settle(false, step.display, { explain: step.explain, timeout: true, tip: step.hintSay });
  }, [verdict, step, settle]);

  // Enter — проверить / дальше; цифры — выбрать вариант
  useEffect(() => {
    if (result) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Enter' && (!typing || !e.shiftKey)) {
        e.preventDefault();
        if (verdict) next();
        else check();
        return;
      }
      if (typing || verdict) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && (step.type === 'pick' || step.type === 'listen' || step.type === 'fill' || step.type === 'choose') && n <= step.options.length) setAnswer(n - 1);
      if (e.key === ' ' && step.type === 'new') {
        e.preventDefault();
        setFlipped(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verdict, next, check, step, result]);

  if (result)
    return <Finish level={level} result={result} mistakes={mistakes} graded={graded} blitz={blitzOk} onAgain={onAgain} levelUp={levelUp} onCloseLevel={() => setLevelUp(null)} xp={game.data?.xp} />;

  const cells: BeamCell[] = queue.map((_, i) => (i < pos ? (marks[i] ?? 'ok') : i === pos ? (verdict ? (verdict.ok ? 'ok' : 'almost') : 'now') : 'todo'));
  const locked = Boolean(verdict);
  const collected = cells.filter((c) => c === 'ok').length;

  return (
    <div className={`hue-${hue} relative flex min-h-dvh flex-col bg-paper`}>
      <span className="graph-paper pointer-events-none fixed inset-0 opacity-70" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-[760px] items-center gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <button
          type="button"
          onClick={() => {
            if (pos === 0 || window.confirm('Выйти? Этот уровень придётся начать заново.')) navigate(`/games/${level.game}`);
          }}
          className="press grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
          aria-label="Выйти из уровня"
        >
          <X className="size-6" />
        </button>
        <Beam cells={cells} full={false} />
        <span className="t-mono tnum shrink-0 text-[12px] text-muted" aria-label={`Собрано цветов: ${collected}`}>
          {collected}/{queue.length}
        </span>
      </div>

      <main className="relative mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-5 px-4 pt-6 pb-36 sm:px-6 sm:pt-9">
        <p className="t-mono flex items-center gap-2 text-[12px] text-muted">
          <GameMark game={level.game} className="text-[15px]" /> · {level.chapter.icon} {level.chapter.title} · {level.level.title}
        </p>
        <AnimatePresence mode="wait">
          <motion.article
            key={pos}
            initial={{ opacity: 0, y: 18, rotate: 1.5 }}
            animate={{ opacity: 1, y: 0, rotate: -0.4 }}
            exit={{ opacity: 0, y: -14, rotate: -2 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="tape relative flex flex-col gap-5 rounded-[6px] border-[1.5px] border-ink/12 bg-paper py-7 pr-5 pl-8 shadow-sticker sm:py-9 sm:pr-9 sm:pl-14"
          >
            {/* поля тетради */}
            <span className="absolute inset-y-0 left-4 w-px bg-[var(--ray-0)] opacity-40 sm:left-8" aria-hidden="true" />
            <Burst fire={fire} className="left-1/2 top-1/3" />
            <Stamp kind={verdict ? (verdict.ok ? 'ok' : 'almost') : null} />
            <div className="flex flex-wrap items-center gap-2 pr-24">
              <span className="t-mono rounded-full bg-tint px-2.5 py-1 text-[11.5px] text-hue">
                карточка {pos + 1} · {KIND[step.type]}
              </span>
              {pos >= level.steps.length && <span className="t-mono text-[11.5px] text-[var(--ink-2)]">повтор</span>}
              {isBlitz && (step.type === 'solve' || step.type === 'choose') && <BlitzTimer seconds={step.blitz!} running={!verdict} onEnd={timeUp} />}
            </div>
            <StepView
              step={step}
              answer={answer}
              setAnswer={setAnswer}
              locked={locked}
              flipped={flipped}
              setFlipped={setFlipped}
              hint={hint}
              setHint={setHint}
              settle={settle}
              quiet={quiet}
              onQuiet={() => {
                setNoListen();
                setQuiet(true);
              }}
              onNoMic={() => {
                setNoSpeak();
                next();
              }}
            />
          </motion.article>
        </AnimatePresence>

        <AnimatePresence>
          {verdict && (
            <motion.aside
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx('flex flex-col gap-2 border-l-[3px] border-dashed py-1 pl-4', verdict.ok ? 'border-[var(--ray-3)]' : 'border-[var(--ray-2)]')}
              role="status"
            >
              <p className="t-mono inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                <PencilLine className="size-3.5" /> на полях
              </p>
              <p className={clsx('t-heading text-[20px]', verdict.ok ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]')}>
                {verdict.timeout ? 'Время вышло — ничего страшного' : verdict.ok ? (verdict.typo ? 'Засчитано, проверьте написание' : PRAISE[(pos + fire) % PRAISE.length]) : 'Почти! Разберём'}
              </p>
              {verdict.correct && (!verdict.ok || verdict.typo) && (
                <p className="text-[16.5px]">
                  {verdict.typo ? 'Правильно: ' : 'Ответ: '}
                  <b>{verdict.correct}</b>
                </p>
              )}
              {!verdict.ok && verdict.explain.length > 0 && (
                <div className="flex flex-col gap-1 text-[15.5px] text-ink/85">
                  {verdict.explain.map((s, i) => (
                    <p key={i}>
                      <RichText text={s} />
                    </p>
                  ))}
                </div>
              )}
              {!verdict.ok && <p className="text-[13.5px] text-muted">Эта карточка вернётся в конце — тогда точно получится.</p>}
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      <CoachBubble face={COACH_FACE[level.game]} name={coach.name} bubble={coach.bubble} on={coach.on} toggle={coach.toggle} />

      {/* кнопка действия — снизу, но без цветной «шторки»: вердикт уже стоит печатью на карточке */}
      {(verdict || canCheck || !['match', 'memory', 'truefalse', 'say'].includes(step.type)) && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-paper via-paper/95 to-transparent pt-8" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4 px-4 sm:px-6">
            <span className="hidden text-[13.5px] text-muted sm:block">{verdict ? 'Enter — следующая карточка' : step.type === 'new' ? 'Пробел — перевернуть' : step.type === 'rule' || step.type === 'cheat' ? 'Enter — дальше' : 'Enter — проверить'}</span>
            <button
              type="button"
              onClick={verdict ? next : check}
              disabled={!verdict && !canCheck}
              className="press print-shadow inline-flex h-14 w-full items-center justify-center gap-2 rounded-[10px] bg-ink px-8 text-[17px] font-[700] text-paper hover:bg-mark hover:text-forest disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/40 disabled:shadow-none sm:w-auto sm:min-w-[240px]"
            >
              {finish.isPending ? 'Сохраняем…' : verdict ? (
                <>
                  Следующая карточка <ArrowRight className="size-5" />
                </>
              ) : step.type === 'new' ? (
                flipped ? 'Запомнил(а)' : 'Сначала переверните'
              ) : step.type === 'rule' || step.type === 'cheat' ? (
                'Понятно, к делу'
              ) : (
                'Проверить'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Speaker({ text, big, autoPlay }: { text: string; big?: boolean; autoPlay?: boolean }) {
  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(() => speak(text), 250);
    return () => clearTimeout(t);
  }, [text, autoPlay]);
  if (!canSpeak()) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          speak(text);
        }}
        className={clsx('press grid place-items-center rounded-full bg-ink text-mark hover:bg-mark hover:text-forest', big ? 'size-20' : 'size-10')}
        aria-label="Послушать"
      >
        <Volume2 className={big ? 'size-9' : 'size-5'} />
      </button>
      {big && (
        <button type="button" onClick={() => speak(text, true)} className="press grid size-12 place-items-center rounded-full border-[1.5px] border-ink/20 bg-paper hover:bg-mark" aria-label="Послушать медленно">
          <Snail className="size-5" />
        </button>
      )}
    </span>
  );
}

const Q = ({ children }: { children: React.ReactNode }) => <h1 className="t-display text-[clamp(22px,4.2vw,30px)] leading-tight">{children}</h1>;

function Choice({ i, chosen, locked, right, onClick, children }: { i: number; chosen: boolean; locked: boolean; right: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={locked}
      onClick={onClick}
      aria-pressed={chosen}
      className={clsx(
        'press flex min-h-13 items-center gap-3 rounded-[8px] border-[1.5px] px-4 py-3 text-left text-[17px] transition-colors disabled:cursor-default',
        locked && right ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && chosen ? 'border-[var(--ray-2)] bg-butter' : chosen ? 'border-ink bg-mark' : 'border-ink/20 bg-paper/80 hover:border-ink/50 hover:bg-bone',
      )}
    >
      <span className="t-mono grid size-6 shrink-0 place-items-center rounded-full border border-ink/25 text-[11px] text-muted">{'абвг'[i]}</span>
      {children}
    </button>
  );
}

function ProblemText({ text }: { text: string }) {
  return text.includes('\n') ? (
    <div className="flex flex-col gap-2">
      <p className="text-[18.5px] leading-relaxed">{text.split('\n')[0]}</p>
      <pre className="m-0 overflow-x-auto rounded-[8px] bg-forest px-4 py-3 font-mono text-[14.5px] leading-relaxed text-cream">{text.split('\n').slice(1).join('\n')}</pre>
    </div>
  ) : (
    <p className="text-[clamp(18px,3.4vw,21px)] leading-relaxed">
      <RichText text={text} />
    </p>
  );
}

function StepView({
  step,
  answer,
  setAnswer,
  locked,
  flipped,
  setFlipped,
  hint,
  setHint,
  settle,
  quiet,
  onQuiet,
  onNoMic,
}: {
  step: AnyStep;
  answer: Answer;
  setAnswer(a: Answer): void;
  locked: boolean;
  flipped: boolean;
  setFlipped(v: boolean): void;
  hint: boolean;
  setHint(v: boolean): void;
  settle(ok: boolean, correct: string, opts?: { say?: string | null; explain?: string[]; typo?: boolean; ask?: { task: string; given: string }; tip?: { t: string; v: string; sig: string } }): void;
  quiet: boolean;
  onQuiet(): void;
  onNoMic(): void;
}) {
  switch (step.type) {
    case 'new':
      // карточка-словарик: английская сторона, по нажатию — перевод
      return (
        <>
          <Q>Новое слово — переверните карточку</Q>
          <button type="button" onClick={() => setFlipped(!flipped)} className="relative mx-auto h-56 w-full max-w-sm [perspective:900px]" aria-label={flipped ? `${step.en} — ${step.ru}` : `${step.en}: нажмите, чтобы увидеть перевод`}>
            <motion.span className="absolute inset-0 [transform-style:preserve-3d]" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-[14px] bg-tint shadow-sticker [backface-visibility:hidden]">
                <span className="text-[64px] leading-none" aria-hidden="true">
                  {step.emoji ?? '✦'}
                </span>
                <span className="flex items-center gap-3">
                  <span className="t-display text-[38px] leading-none">{step.en}</span>
                  <Speaker text={step.en} autoPlay />
                </span>
                <span className="t-mono text-[11.5px] text-hue">нажмите — перевернуть</span>
              </span>
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-ink text-paper shadow-sticker [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <span className="t-mono text-[11.5px] text-mark">{step.en}</span>
                <span className="t-display text-[36px] leading-tight">{step.ru}</span>
              </span>
            </motion.span>
          </button>
        </>
      );

    case 'rule':
    case 'cheat': {
      const title = step.title;
      const lines = step.type === 'rule' ? step.rule : step.lines;
      return (
        <>
          <Q>
            Шпаргалка: <span className="text-hue">{title}</span>
          </Q>
          <ul className="m-0 flex -rotate-[0.6deg] list-none flex-col gap-3 rounded-[4px] bg-butter p-5 shadow-sticker sm:p-6">
            {lines.map((r) => (
              <li key={r} className="flex gap-3 text-[17px] leading-relaxed">
                <Lightbulb className="mt-1 size-4 shrink-0 text-[var(--ink-2)]" />
                <span>
                  <RichText text={r} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[14.5px] text-muted">Дальше — карточки на это. Шпаргалку можно открыть снова, если пройти уровень ещё раз.</p>
        </>
      );
    }

    case 'pick': {
      const pictures = step.options.every((o) => o.emoji);
      const enAsk = step.prompt === 'Выберите перевод';
      return (
        <>
          <Q>{enAsk ? 'Как это по-русски?' : `Где «${step.ask}»?`}</Q>
          {enAsk && (
            <p className="flex items-center gap-3">
              <span className="t-display text-[34px]">{step.ask}</span>
              {step.say && <Speaker text={step.say} autoPlay />}
            </p>
          )}
          <div className={clsx('grid gap-2.5', pictures ? 'grid-cols-2' : '')}>
            {step.options.map((o, i) =>
              pictures ? (
                <button
                  key={o.text}
                  type="button"
                  disabled={locked}
                  onClick={() => setAnswer(i)}
                  aria-pressed={answer === i}
                  className={clsx(
                    'press flex flex-col items-center gap-1.5 rounded-[8px] border-[1.5px] px-3 py-4 transition-colors disabled:cursor-default',
                    locked && i === step.answer ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && answer === i ? 'border-[var(--ray-2)] bg-butter' : answer === i ? 'border-ink bg-mark' : 'border-ink/20 bg-paper/80 hover:bg-bone',
                  )}
                >
                  <span className="text-[50px] leading-none" aria-hidden="true">
                    {o.emoji}
                  </span>
                  <span className="text-[17px] font-[600]">{o.text}</span>
                </button>
              ) : (
                <Choice key={o.text} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
                  {o.text}
                </Choice>
              ),
            )}
          </div>
        </>
      );
    }

    case 'listen': {
      const speech = canSpeak();
      return (
        <>
          <Q>{speech ? 'Послушайте и выберите, что прозвучало' : 'Выберите то же самое'}</Q>
          {speech ? (
            <div className="flex justify-center py-1">
              <Speaker text={step.say} big autoPlay />
            </div>
          ) : (
            <p className="t-display text-[28px]">{step.say}</p>
          )}
          <div className="grid gap-2.5">
            {step.options.map((o, i) => (
              <Choice key={o} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
                {o}
              </Choice>
            ))}
          </div>
          {!locked && !quiet && (
            <button type="button" onClick={onQuiet} className="link inline-flex w-fit items-center gap-1.5 text-[14px] text-muted">
              <EarOff className="size-4" /> Не могу слушать сейчас
            </button>
          )}
        </>
      );
    }

    case 'spot':
      return (
        <>
          <Q>Найдите ошибку — нажмите на неверное слово</Q>
          <p className="flex flex-wrap gap-x-1.5 gap-y-2 text-[clamp(20px,4vw,25px)] leading-relaxed">
            {step.words.map((w, i) => (
              <button
                key={i}
                type="button"
                disabled={locked}
                onClick={() => setAnswer(i)}
                className={clsx(
                  'press rounded-[6px] border-b-[3px] px-1.5 transition-colors',
                  locked && i === step.wrong ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && answer === i ? 'border-[var(--ray-2)] bg-butter' : answer === i ? 'border-ink bg-mark' : 'border-transparent hover:border-ink/30 hover:bg-bone',
                )}
              >
                {w}
              </button>
            ))}
          </p>
          <p className="text-[15.5px] text-muted italic">
            {step.ru}
            {step.hint ? ` (${step.hint})` : ''}
          </p>
          {locked && (
            <p className="text-[16px]">
              Нужно: <b>{step.fix}</b>
            </p>
          )}
        </>
      );

    case 'say':
      return <SayAloud key={step.text} text={step.text} ru={step.ru} locked={locked} settle={settle} onNoMic={onNoMic} />;

    case 'fill': {
      const [before, after] = step.sentence.split('___');
      const picked = typeof answer === 'number' ? step.options[answer] : null;
      return (
        <>
          <Q>Что пропущено?</Q>
          <p className="text-[clamp(20px,4vw,25px)] leading-relaxed">
            {before}
            <span className={clsx('mx-1 inline-block min-w-[92px] border-b-[3px] px-2 text-center font-[650]', picked ? 'border-ink bg-mark' : 'border-dashed border-ink/40')}>{picked ?? ' '}</span>
            {after}
          </p>
          <p className="text-[15.5px] text-muted italic">{step.ru}</p>
          <div className="flex flex-wrap gap-2.5">
            {step.options.map((o, i) => (
              <Choice key={o} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
                {o}
              </Choice>
            ))}
          </div>
        </>
      );
    }

    case 'build': {
      const chosen = Array.isArray(answer) ? (answer as number[]) : [];
      return (
        <>
          <Q>Соберите по-английски</Q>
          <p className="text-[20px] italic">«{step.ru}»</p>
          <div className="ruled flex min-h-[96px] flex-wrap content-start gap-2 py-1.5" aria-label="Ваша фраза">
            {chosen.map((ti) => (
              <motion.button layout key={ti} type="button" disabled={locked} onClick={() => setAnswer(chosen.filter((x) => x !== ti))} className="press h-9 rounded-[6px] bg-mark px-3 text-[17.5px] font-[550]">
                {step.tiles[ti]}
              </motion.button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {step.tiles.map((t, ti) =>
              chosen.includes(ti) ? (
                <span key={ti} className="h-9 rounded-[6px] border-[1.5px] border-dashed border-ink/15 px-3 text-[17.5px] text-transparent select-none" aria-hidden="true">
                  {t}
                </span>
              ) : (
                <motion.button
                  layout
                  key={ti}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    sfx('tap');
                    setAnswer([...chosen, ti]);
                  }}
                  className="press h-9 rounded-[6px] border-[1.5px] border-ink/25 bg-paper px-3 text-[17.5px] hover:bg-bone"
                >
                  {t}
                </motion.button>
              ),
            )}
          </div>
        </>
      );
    }

    case 'type':
    case 'solve': {
      const isType = step.type === 'type';
      return (
        <>
          {isType ? (
            <>
              <Q>Переведите на английский</Q>
              <p className="text-[20px] italic">«{step.ru}»</p>
            </>
          ) : (
            <ProblemText text={step.text} />
          )}
          <label className="relative flex max-w-md flex-col gap-1.5">
            <span className="sr-only">Ваш ответ</span>
            <input
              value={typeof answer === 'string' ? answer : ''}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={locked}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              lang={isType ? 'en' : undefined}
              inputMode={!isType && typeof step.answer === 'number' ? 'decimal' : 'text'}
              placeholder={isType ? 'Пишите здесь…' : 'Ответ'}
              className="h-13 w-full border-0 border-b-[2px] border-ink/40 bg-transparent px-1 pr-20 text-[21px] focus-visible:border-ink focus-visible:outline-none"
            />
            {!isType && step.unit && <span className="t-mono pointer-events-none absolute top-3.5 right-1 text-[12px] text-muted">{step.unit}</span>}
            <span className="text-[13px] text-muted">{isType ? 'Заглавные буквы, точка и сокращения (I’m, don’t) не важны.' : 'Дробь можно записать как 3/4, десятичную — через запятую.'}</span>
          </label>
          {!isType && !locked && (
            <div>
              {hint ? (
                <p className="rounded-[4px] bg-butter px-4 py-2.5 text-[15.5px]">
                  <RichText text={step.hint} />
                </p>
              ) : (
                <button type="button" className="link inline-flex items-center gap-1.5 text-[14.5px]" onClick={() => setHint(true)}>
                  <Lightbulb className="size-4" /> Подсказка на полях
                </button>
              )}
            </div>
          )}
        </>
      );
    }

    case 'choose':
      return (
        <>
          <ProblemText text={step.text} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {step.options.map((o, i) => (
              <Choice key={o} i={i} chosen={answer === i} locked={locked} right={i === step.answer} onClick={() => setAnswer(i)}>
                {o}
              </Choice>
            ))}
          </div>
        </>
      );

    case 'truefalse':
      return (
        <>
          <ProblemText text={step.text} />
          <p className="flex flex-wrap items-baseline gap-2 border-y-[1.5px] border-dashed border-ink/20 py-3 text-[19px]">
            <span className="t-mono text-[12px] text-muted">одноклассник ответил:</span> <b className="t-display text-[24px]">{step.claim}</b>
          </p>
          <p className="text-[16px]">Он прав?</p>
          <div className="grid grid-cols-2 gap-3">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={locked}
                onClick={() => {
                  setAnswer(v);
                  settle(v === step.truth, step.truth ? `одноклассник прав, ${step.display}` : `одноклассник ошибся, верно — ${step.display}`, { explain: step.explain, tip: step.hintSay });
                }}
                className={clsx(
                  'press h-16 rounded-[8px] border-[1.5px] text-[19px] font-[700] transition-colors disabled:cursor-default',
                  locked && v === step.truth ? 'border-[var(--ray-3)] bg-[var(--tint-raw-3)]' : locked && answer === v ? 'border-[var(--ray-2)] bg-butter' : 'border-ink/25 bg-paper hover:bg-mark',
                )}
              >
                {v ? '👍 Прав' : '🤔 Ошибся'}
              </button>
            ))}
          </div>
        </>
      );

    case 'order': {
      const chosen = Array.isArray(answer) ? (answer as number[]) : [];
      return (
        <>
          <Q>От меньшего к большему</Q>
          <p className="text-[15px] text-muted">{step.prompt}</p>
          <div className="grid grid-cols-4 gap-2" aria-label="Ваш порядок">
            {step.items.map((_, slot) => {
              const it = chosen[slot];
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={locked || it === undefined}
                  onClick={() => setAnswer(chosen.slice(0, slot))}
                  className={clsx('relative grid h-16 place-items-center rounded-[8px] border-[1.5px] px-1 text-[16px] font-[650]', it === undefined ? 'border-dashed border-ink/25 text-ink/30' : 'border-ink bg-mark')}
                >
                  <span className="t-mono absolute top-1 left-1.5 text-[10px] text-muted">{slot + 1}</span>
                  {it === undefined ? '?' : step.items[it]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {step.items.map((t, i) =>
              chosen.includes(i) ? null : (
                <button
                  key={i}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    sfx('tap');
                    setAnswer([...chosen, i]);
                  }}
                  className="press h-12 rounded-[8px] border-[1.5px] border-ink/25 bg-paper px-4 text-[17px] hover:bg-bone"
                >
                  {t}
                </button>
              ),
            )}
            {chosen.length > 0 && !locked && (
              <button type="button" className="link inline-flex items-center gap-1 text-[14px] text-muted" onClick={() => setAnswer(chosen.slice(0, -1))}>
                <Undo2 className="size-4" /> назад
              </button>
            )}
          </div>
        </>
      );
    }

    case 'match':
    case 'memory':
      return (
        <>
          <Q>Найдите пары — открывайте по две карточки</Q>
          <Memory pairs={step.pairs} speakLeft={step.type === 'match'} onDone={() => settle(true, '')} onMiss={() => sfx('almost')} />
        </>
      );
  }
}

/** «Скажи вслух»: браузер слушает микрофон, сверяем слова с образцом. Три попытки, без штрафа за капризный микрофон. */
function SayAloud({ text, ru, locked, settle, onNoMic }: { text: string; ru: string; locked: boolean; settle: Parameters<typeof StepView>[0]['settle']; onNoMic(): void }) {
  const [heard, setHeard] = useState('');
  const [state, setState] = useState<'idle' | 'listening' | 'retry'>('idle');
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const target = normalize(text).split(' ');
  const score = (said: string) => {
    const got = new Set(normalize(said).split(' '));
    return target.filter((w) => got.has(w)).length / target.length;
  };
  const listen = async () => {
    setError(null);
    setHeard('');
    setState('listening');
    const r = listenSpeech('en', { onText: setHeard, onLevel: setLevel });
    stopRef.current = r.stop;
    try {
      const said = await r.promise;
      setHeard(said);
      const n = tries + 1;
      setTries(n);
      if (said && score(said) >= 0.7) settle(true, text, {});
      else if (n >= 3) settle(true, text, { typo: true });
      else setState('retry');
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };
  return (
    <>
      <Q>Скажите вслух по-английски</Q>
      <p className="flex flex-wrap items-center gap-3">
        <span className="t-display text-[clamp(24px,4.6vw,32px)] leading-tight">{text}</span>
        <Speaker text={text} />
      </p>
      {ru && <p className="text-[15.5px] text-muted italic">{ru}</p>}
      {!locked && (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => (state === 'listening' ? stopRef.current?.() : void listen())}
            className={clsx('press grid size-24 place-items-center rounded-full text-paper shadow-sticker transition-shadow', state === 'listening' ? 'bg-[var(--ray-0)]' : 'bg-ink hover:bg-mark hover:text-forest')}
            style={state === 'listening' ? { boxShadow: `0 0 0 ${6 + level * 22}px color-mix(in oklab, var(--ray-0) 25%, transparent)` } : undefined}
            aria-label={state === 'listening' ? 'Остановить запись' : 'Нажмите и говорите'}
          >
            <Mic className="size-10" />
          </button>
          <p className="min-h-6 text-center text-[16px]">{state === 'listening' ? heard || 'Говорите… я сам пойму, когда вы закончите' : state === 'retry' ? `Услышал: «${heard || '…'}». Почти — ещё разок!` : 'Нажмите на микрофон и скажите фразу'}</p>
          {error && <p className="rounded-[4px] bg-butter px-3 py-1.5 text-[14px]">{error}</p>}
          <button type="button" onClick={onNoMic} className="link inline-flex items-center gap-1.5 text-[14px] text-muted">
            <MicOff className="size-4" /> Не могу говорить сейчас
          </button>
        </div>
      )}
    </>
  );
}

function CoachBubble({ face, name, bubble, on, toggle }: { face: string; name: string | null; bubble: { text: string; key: number; thinking?: boolean } | null; on: boolean; toggle(): void }) {
  if (!name) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-30 mx-auto flex w-full max-w-[760px] items-end gap-2 px-4 sm:bottom-[100px] sm:px-6">
      <button
        type="button"
        onClick={toggle}
        className={clsx('press pointer-events-auto relative grid size-12 shrink-0 place-items-center rounded-full text-[24px] shadow-sticker', on ? 'bg-mark' : 'bg-bone grayscale')}
        aria-label={on ? `Выключить голос: ${name}` : `Включить голос: ${name}`}
        title={on ? 'Комментатор говорит — нажмите, чтобы выключить' : 'Комментатор молчит — нажмите, чтобы включить'}
      >
        {face}
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-ink text-paper">{on ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}</span>
      </button>
      <AnimatePresence>
        {bubble && (bubble.text || bubble.thinking) && (
          <motion.p
            key={bubble.key}
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto max-w-[min(520px,80vw)] rounded-[14px] rounded-bl-[4px] border-[1.5px] border-ink/12 bg-paper px-4 py-2.5 text-[15.5px] leading-snug shadow-sticker"
            role="status"
          >
            <span className="t-mono mr-1.5 text-[11px] text-muted">{name}:</span>
            {bubble.text}
            {bubble.thinking && <span className="ml-1 inline-flex gap-0.5 align-middle">{[0, 1, 2].map((i) => <motion.span key={i} className="size-1.5 rounded-full bg-ink/40" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }} />)}</span>}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Finish({
  level,
  result,
  mistakes,
  graded,
  blitz,
  onAgain,
  levelUp,
  onCloseLevel,
  xp,
}: {
  level: PlayLevel;
  result: { xp: number; ms: number };
  mistakes: number;
  graded: number;
  blitz: boolean;
  onAgain(): void;
  levelUp: number | null;
  onCloseLevel(): void;
  xp: Parameters<typeof XpMeter>[0]['xp'];
}) {
  const accuracy = Math.round((Math.max(0, graded - mistakes) / graded) * 100);
  const next = nextLevelId(level.id, level.levels);
  const [fire] = useState(1);
  return (
    <div className={`hue-${level.chapter.hue} relative flex min-h-dvh flex-col items-center justify-center gap-7 bg-paper px-4 py-10 text-center`}>
      <span className="graph-paper pointer-events-none fixed inset-0 opacity-70" aria-hidden="true" />
      <LevelUp level={levelUp} onClose={onCloseLevel} />
      <p className="t-mono relative text-[12px] text-muted">
        <GameMark game={level.game} className="text-[15px]" /> · {level.chapter.title} · {level.level.title}
      </p>
      <div className="relative">
        <Burst fire={fire} count={48} spread={300} className="left-1/2 top-1/2" />
        <motion.div
          initial={{ scale: 1.9, rotate: -25, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.15 }}
          className="tape relative grid size-40 place-items-center rounded-[22px] bg-tint shadow-sticker"
        >
          <span className="text-[76px] leading-none">{level.chapter.icon}</span>
          <span className="t-heading absolute -right-3 -bottom-3 grid size-12 place-items-center rounded-full bg-ink text-[20px] text-mark">{mistakes === 0 ? '★' : level.level.n}</span>
        </motion.div>
      </div>
      <div className="relative flex flex-col gap-2">
        <h1 className="t-display text-[clamp(30px,6vw,46px)] leading-none">{mistakes === 0 ? 'Золотой стикер!' : 'Стикер в альбом!'}</h1>
        <p className="text-[16px] text-muted">{mistakes === 0 ? 'Без единой ошибки — луч собрал все цвета.' : 'Ошибки разобрали на полях — в следующий раз будет легче.'}</p>
      </div>
      <div className="relative flex flex-wrap justify-center gap-2.5">
        {[
          ['опыт', `+${result.xp}`, 'bg-mark'],
          ['точность', `${accuracy}%`, 'bg-[var(--tint-raw-3)]'],
          ['время', mmss(result.ms), 'bg-[var(--tint-raw-5)]'],
          ...(blitz ? [['блиц', '+5', 'bg-[var(--tint-raw-0)]']] : []),
        ].map(([label, value, bg], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 14, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: i % 2 ? 2 : -2 }} transition={{ delay: 0.45 + i * 0.12 }} className={clsx('flex min-w-[96px] flex-col gap-0.5 rounded-[6px] px-4 py-3 shadow-sticker', bg)}>
            <span className="t-mono text-[11px] text-ink/70">{label}</span>
            <span className="t-heading tnum text-[24px]">{value}</span>
          </motion.div>
        ))}
      </div>
      {level.game === 'lingo' && accuracy < 55 && level.chapter.level && level.chapter.level !== 'Starter' && (
        <div className="relative flex w-full max-w-md flex-col gap-2 rounded-[8px] bg-butter p-4 text-left shadow-sticker">
          <p className="t-heading text-[18px]">Уровень {level.chapter.level} пока тяжеловат?</p>
          <p className="text-[15px]">Это нормально — без базы дальше сложно. Пройди пару разделов уровнем ниже, а потом возвращайся: пойдёт заметно легче.</p>
          <Link to={`/games/lingo?level=${{ A1: 'Starter', A2: 'A1', B1: 'A2' }[level.chapter.level] ?? 'Starter'}`} className="link w-fit text-[15px] font-[650]">
            Перейти на {{ A1: 'Starter', A2: 'A1', B1: 'A2' }[level.chapter.level] ?? 'Starter'} →
          </Link>
        </div>
      )}
      <XpMeter xp={xp} className="relative w-full max-w-md" />
      <ChatLauncher game={level.game} where={`${level.chapter.title}, ${level.level.title}`} />
      <div className="relative flex w-full max-w-md flex-col gap-3">
        {next ? (
          <Link to={`/games/${level.game}/play/${next}`} className="press print-shadow grid h-14 place-items-center rounded-[10px] bg-ink text-[17px] font-[700] text-paper no-underline hover:bg-mark hover:text-forest">
            Следующий уровень →
          </Link>
        ) : (
          <Link to={`/games/${level.game}`} className="press print-shadow grid h-14 place-items-center rounded-[10px] bg-ink text-[17px] font-[700] text-paper no-underline hover:bg-mark hover:text-forest">
            Глава пройдена — к тетради
          </Link>
        )}
        <div className="flex justify-center gap-5">
          <button type="button" onClick={onAgain} className="link inline-flex items-center gap-1.5 text-[15px]">
            <RotateCcw className="size-4" /> Ещё раз
          </button>
          <Link to={`/games/${level.game}`} className="link text-[15px]">
            К тетради
          </Link>
        </div>
      </div>
    </div>
  );
}
