import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Trophy } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ButtonLink } from '../ui';

interface League {
  week: string;
  sunday: string;
  top: { place: number; name: string; xp: number; me: boolean }[];
  me: { place: number; xp: number; players: number } | null;
  signedIn: boolean;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

/** «Лига недели»: таблица по опыту с понедельника. Обнуляется каждую неделю — догнать можно всегда. */
export function LeagueBoard({ limit = 10, className }: { limit?: number; className?: string }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['league', user?.id ?? 'guest'], queryFn: () => api<League>('/progress/league'), staleTime: 60_000 });
  if (!q.data) return null;
  const { top, me } = q.data;
  const shown = top.slice(0, limit);
  const meOutside = me && me.place > limit;
  return (
    <section className={clsx('hue-2 flex flex-col gap-4 rounded-[14px] border-[1.5px] border-ink/12 bg-paper p-5 sm:p-6', className)} aria-labelledby="league">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="league" className="t-heading inline-flex items-center gap-2 text-[22px]">
          <Trophy className="size-5 text-[var(--ray-2)]" /> Лига недели
        </h2>
        <span className="t-mono text-[12px] text-muted">опыт с понедельника · итоги {dayFmt.format(new Date(`${q.data.sunday}T12:00:00`))}</span>
      </div>
      {shown.length ? (
        <ol className="m-0 flex list-none flex-col p-0">
          {shown.map((r) => (
            <li key={r.place} className={clsx('grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-dashed border-hair-soft py-2.5 last:border-0', r.me && 'rounded-[8px] border-transparent bg-butter px-2')}>
              <span className="t-heading tnum text-[18px]">{r.place <= 3 ? ['🥇', '🥈', '🥉'][r.place - 1] : r.place}</span>
              <span className={clsx('[overflow-wrap:anywhere]', r.place <= 3 && 'font-[650]')}>
                {r.name}
                {r.me && <span className="t-mono ml-2 text-[11px] text-muted">это вы</span>}
              </span>
              <span className="t-mono tnum text-[13px]">{r.xp} XP</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[15.5px] text-muted">На этой неделе пока никого — решите пару задач и займите первое место!</p>
      )}
      {meOutside && (
        <p className="rounded-[8px] bg-butter px-3 py-2 text-[15px]">
          Вы на {me.place}-м месте из {me.players} · {me.xp} XP. До десятки — пара тренировок!
        </p>
      )}
      {!q.data.signedIn && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-bone px-4 py-3">
          <p className="mr-auto text-[15px]">В таблицу попадают ученики с аккаунтом — так опыт не потеряется.</p>
          <ButtonLink to="/register" variant="secondary" className="min-h-10">
            Войти в лигу
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
