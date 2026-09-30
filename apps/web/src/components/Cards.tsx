import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowUpRight, ImageIcon, UsersRound } from 'lucide-react';
import { Monogram, Tag } from './ui';
import { plural } from '../lib/format';
import type { GroupCard as Group, Subject, TeacherCard as Teacher } from '../lib/types';

export function TeacherCard({ t, className }: { t: Teacher; className?: string }) {
  return (
    <Link
      to={`/teachers/${t.slug}`}
      className={clsx(`hue-${t.hue}`, 'lift group flex flex-col overflow-hidden rounded-[16px] bg-tint no-underline', className)}
    >
      <div className="aspect-[4/3] w-full overflow-hidden">
        <Monogram name={t.user.name} hue={t.hue} photoUrl={t.photoUrl} size="fill" className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="t-heading text-[28px]">{t.user.name}</h3>
          <ArrowUpRight className="mt-1 size-5 shrink-0 text-hue transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.7} />
        </div>
        <Tag hue={t.hue} className="w-fit bg-paper/60">
          {t.subject}
        </Tag>
        <p className="text-[16px] leading-snug text-ink/85">{t.headline}</p>
        <p className="t-caption mt-auto pt-2 text-hue">
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
    <Link to={`/groups/${g.slug}`} className={clsx(`hue-${g.hue}`, 'lift group flex h-full flex-col overflow-hidden rounded-[16px] bg-tint no-underline')}>
      {cover ? (
        <img src={cover} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex min-h-44 items-end p-5 sm:min-h-52 sm:p-6">
          <p className={clsx('t-display leading-[0.88] text-hue tnum', g.schedule.length > 16 ? 'text-[32px]' : 'text-[clamp(36px,4.4vw,48px)]')}>{g.schedule}</p>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 border-t border-[color-mix(in_oklab,var(--i)_35%,transparent)] p-5 sm:p-6">
        <h3 className="t-heading text-[26px]">{g.name}</h3>
        {cover && <p className="tnum text-[16px] text-hue">{g.schedule}</p>}
        {g.teacher && <p className="text-[16px] text-ink/80">{g.teacher.user.name}</p>}
        <div className="t-caption mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-hue">
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

export function SubjectRow({ s }: { s: Subject }) {
  return (
    <Link
      to={`/subjects/${s.slug}`}
      className={clsx(`hue-${s.hue}`, 'group grid grid-cols-[14px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-b border-hair-soft py-4 no-underline sm:grid-cols-[14px_minmax(0,1fr)_auto]')}
    >
      <span className="size-3 translate-y-[-2px] rounded-[4px] bg-hue" aria-hidden="true" />
      <span className="flex flex-col gap-1">
        <span className="t-heading text-[26px] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{s.title}</span>
        <span className="text-[16px] text-ink/75">{s.summary}</span>
      </span>
      <span className="t-caption col-start-2 text-hue sm:col-start-auto sm:text-right">{s.level}</span>
    </Link>
  );
}
