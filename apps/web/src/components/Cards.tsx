import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, ImageIcon, UsersRound } from 'lucide-react';
import { Monogram, Tag } from './ui';
import { pad2 } from './Print';
import { plural } from '../lib/format';
import type { GroupCard as Group, Subject, TeacherCard as Teacher } from '../lib/types';

const TILT = ['-rotate-[1.2deg]', 'rotate-[0.9deg]', '-rotate-[0.5deg]', 'rotate-[1.4deg]', '-rotate-[1deg]', 'rotate-[0.6deg]', '-rotate-[1.4deg]'];

/** Карточка-полароид: фото (или набросок) на цветном стикере, подпись от руки, лёгкий наклон. При наведении выпрямляется. */
export function TeacherCard({ t, className }: { t: Teacher; className?: string }) {
  return (
    <Link
      to={`/teachers/${t.slug}`}
      className={clsx(
        `hue-${t.hue}`,
        TILT[t.hue % 7],
        'lift group relative flex flex-col rounded-[10px] border-[1.5px] border-ink/10 bg-paper p-3 no-underline shadow-card hover:rotate-0 hover:-translate-y-1.5',
        className,
      )}
    >
      <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[6px]">
        <Monogram name={t.user.name} hue={t.hue} photoUrl={t.photoUrl} size="fill" className="transition-transform duration-500 ease-out group-hover:scale-[1.04]" />
        <Tag hue={t.hue} className="absolute top-2.5 left-2.5 border border-ink/10 bg-paper/90 text-forest backdrop-blur-sm dark:text-ink">
          {t.subject}
        </Tag>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-1.5 pt-4 pb-1.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-heading lift-title text-[23px]">{t.user.name}</h3>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-hue transition-transform duration-300 group-hover:rotate-45">
            <ArrowUpRight className="size-4" strokeWidth={2} />
          </span>
        </div>
        <p className="text-[15.5px] leading-snug text-ink/80">{t.headline}</p>
        <p className="t-mono mt-auto border-t border-dashed border-hair-soft pt-3 text-[11.5px] text-hue">
          стаж {t.experience} {plural(t.experience, 'год', 'года', 'лет')}
        </p>
      </div>
    </Link>
  );
}

export function GroupCard({ g }: { g: Group }) {
  const cover = g.coverUrl ?? g.photos[0]?.url;
  const photos = g._count.photos ?? g.photos.length;
  return (
    <Link
      to={`/groups/${g.slug}`}
      className={clsx(`hue-${g.hue}`, TILT[(g.hue + 3) % 7], 'lift group sticker relative flex h-full flex-col p-5 no-underline hover:rotate-0 hover:-translate-y-1.5')}
    >
      <span className="tape" aria-hidden="true" />
      {cover ? (
        <img src={cover} alt="" className="mb-4 aspect-[4/3] w-full rounded-[4px] object-cover" loading="lazy" />
      ) : (
        <p className={clsx('t-display tnum mb-6 pt-3 leading-[0.95]', g.schedule.length > 16 ? 'text-[28px]' : 'text-[clamp(32px,3.6vw,42px)]')}>{g.schedule}</p>
      )}
      <div className="mt-auto flex flex-col gap-1.5">
        <h3 className="t-heading lift-title text-[22px]">{g.name}</h3>
        {cover && <p className="tnum text-[15px]">{g.schedule}</p>}
        {g.teacher && <p className="text-[15px] opacity-80">{g.teacher.user.name}</p>}
        <div className="t-mono mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-forest/25 pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="size-4" strokeWidth={1.7} />
            {g._count.members} из {g.capacity}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon className="size-4" strokeWidth={1.7} />
            {photos ? `${photos} ${plural(photos, 'фото', 'фото', 'фото')}` : 'фото скоро'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Строка предмета: цветная точка-номер, название, уровень; при наведении подсвечивается маркером. */
export function SubjectRow({ s, index }: { s: Subject; index?: number }) {
  return (
    <Link
      to={`/subjects/${s.slug}`}
      className={clsx(`hue-${s.hue}`, 'group -mx-3 grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[10px] border-b border-dashed border-hair-soft px-3 py-4 no-underline transition-colors hover:border-transparent hover:bg-tint')}
    >
      <span className="t-mono grid size-10 place-items-center rounded-full bg-tint text-[12px] text-hue transition-colors group-hover:bg-paper">
        {pad2(index ?? s.hue + 1)}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-heading text-[21px]">{s.title}</span>
        <span className="text-[15px] leading-snug text-ink/70">{s.summary}</span>
        <span className="t-mono text-[11px] text-hue sm:hidden">{s.level}</span>
      </span>
      <span className="t-mono hidden items-center gap-3 text-[11.5px] whitespace-nowrap text-hue sm:flex">
        {s.level}
        <ArrowUpRight className="size-4 transition-transform group-hover:rotate-45" strokeWidth={2} />
      </span>
    </Link>
  );
}
