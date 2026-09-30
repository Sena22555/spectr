import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, ImageIcon, UsersRound } from 'lucide-react';
import { Monogram, Tag } from './ui';
import { pad2 } from './Print';
import { plural } from '../lib/format';
import type { GroupCard as Group, Subject, TeacherCard as Teacher } from '../lib/types';

/** Портрет без рамки-карточки: сверху линейка краски предмета, ниже фото и подпись, как в газетной полосе. */
export function TeacherCard({ t, className }: { t: Teacher; className?: string }) {
  return (
    <Link
      to={`/teachers/${t.slug}`}
      className={clsx(`hue-${t.hue}`, 'lift group flex flex-col border-t-[4px] border-ray pt-3 no-underline', className)}
    >
      <div className="relative aspect-square w-full overflow-hidden border border-hair">
        <Monogram name={t.user.name} hue={t.hue} photoUrl={t.photoUrl} size="fill" className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-1 flex-col gap-2.5 pt-4">
        <Tag hue={t.hue} className="w-fit">
          {t.subject}
        </Tag>
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-heading lift-title text-[26px]">{t.user.name}</h3>
          <ArrowUpRight className="mt-1.5 size-5 shrink-0 text-hue transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.8} />
        </div>
        <p className="text-[16px] leading-snug text-ink/85">{t.headline}</p>
        <p className="t-mono mt-auto border-t border-dotted border-hair pt-3 text-[11px] text-hue">
          Стаж {t.experience} {plural(t.experience, 'год', 'года', 'лет')}
        </p>
      </div>
    </Link>
  );
}

export function GroupCard({ g }: { g: Group }) {
  const cover = g.coverUrl ?? g.photos[0]?.url;
  const photos = g._count.photos ?? g.photos.length;
  return (
    <Link to={`/groups/${g.slug}`} className={clsx(`hue-${g.hue}`, 'lift group flex h-full flex-col border-t-[4px] border-ray pt-3 no-underline')}>
      {cover ? (
        <img src={cover} alt="" className="aspect-[4/3] w-full border border-hair object-cover" loading="lazy" />
      ) : (
        <div className="relative flex aspect-[4/3] w-full items-end overflow-hidden border border-hair bg-tint p-4">
          <span className="halftone pointer-events-none absolute -top-8 -right-8 size-40 rounded-full text-ray opacity-60" aria-hidden="true" />
          <p className={clsx('t-display relative leading-[0.9] text-hue tnum', g.schedule.length > 16 ? 'text-[30px]' : 'text-[clamp(34px,4vw,46px)]')}>{g.schedule}</p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 pt-4">
        <h3 className="t-heading lift-title text-[26px]">{g.name}</h3>
        {cover && <p className="tnum text-[16px] text-hue">{g.schedule}</p>}
        {g.teacher && <p className="text-[16px] text-ink/80">{g.teacher.user.name}</p>}
        <div className="t-mono mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-dotted border-hair pt-3 text-[11px] text-hue">
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="size-4" strokeWidth={1.7} />
            {g._count.members} из {g.capacity}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon className="size-4" strokeWidth={1.7} />
            {photos ? `${photos} ${plural(photos, 'фото', 'фото', 'фото')}` : 'Фото скоро'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Строка оглавления: номер краски, название, пунктирный выводок, уровень. */
export function SubjectRow({ s, index }: { s: Subject; index?: number }) {
  return (
    <Link
      to={`/subjects/${s.slug}`}
      className={clsx(`hue-${s.hue}`, 'group grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-dotted border-hair py-4 no-underline')}
    >
      <span className="t-mono self-start pt-2 text-[12px] text-hue">
        <span className="mr-1.5 inline-block size-2 bg-ray align-baseline" aria-hidden="true" />
        {pad2(index ?? s.hue + 1)}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline gap-3">
          <span className="t-heading text-[26px] group-hover:underline group-hover:decoration-2 group-hover:underline-offset-4">{s.title}</span>
          <span className="mb-1.5 hidden min-w-4 flex-1 border-b border-dotted border-hair-soft sm:block" aria-hidden="true" />
          <span className="t-mono hidden text-[11px] whitespace-nowrap text-hue sm:block">{s.level}</span>
        </span>
        <span className="text-[16px] text-ink/75">{s.summary}</span>
        <span className="t-mono text-[11px] text-hue sm:hidden">{s.level}</span>
      </span>
    </Link>
  );
}
