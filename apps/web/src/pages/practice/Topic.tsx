import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Clock, PartyPopper, TriangleAlert, Lightbulb } from 'lucide-react';
import { Container } from '../../components/Layout';
import { RichText, Tex } from '../../components/Tex';
import { ProblemCard } from '../../components/practice/ProblemCard';
import { Lab } from '../../components/practice/labs';
import { ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { useProgress, useTopic } from '../../lib/practice';
import { isMiniApp } from '../../lib/platform';
import { plural } from '../../lib/format';

export default function PracticeTopic() {
  const { subject = '', topic = '' } = useParams();
  const q = useTopic(subject, topic);
  const progress = useProgress();

  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} onRetry={() => q.refetch()} />
      </Container>
    );

  const { subject: s, topic: t, prev, next } = q.data;
  const solvedSet = progress.data?.solved ?? new Set<string>();
  const solved = t.problems.filter((p) => solvedSet.has(p.id)).length;
  const main = t.problems.filter((p) => !p.self);
  const self = t.problems.filter((p) => p.self);
  const complete = solved === t.problems.length;

  return (
    <Container className={clsx(isMiniApp ? 'pt-4 pb-8' : 'pt-6 pb-10 sm:pt-10')}>
      <nav aria-label="Хлебные крошки" className="t-mono mb-5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Link to="/practice" className="link">
          практикум
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/practice#${s.slug}`} className="link">
          {s.title.toLowerCase()}
        </Link>
      </nav>

      <header className={`hue-${s.hue} flex flex-col gap-4 border-b border-dashed border-hair-soft pb-8`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-mono rounded-full bg-tint px-3 py-1 text-[12px] text-hue">{t.level}</span>
          <span className="t-mono inline-flex items-center gap-1 text-[12px] text-muted">
            <Clock className="size-3.5" /> {t.minutes} минут
          </span>
        </div>
        <h1 className="t-display t-xl max-w-[18ch]">{t.title}</h1>
        <p className="t-sub max-w-[56ch] text-muted">{t.summary}</p>
        <div className="flex max-w-md items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
            <motion.div className="h-full rounded-full bg-ray" initial={{ width: 0 }} animate={{ width: `${(solved / t.problems.length) * 100}%` }} />
          </div>
          <span className="t-mono tnum text-[12px] text-muted">
            {solved}/{t.problems.length} {plural(t.problems.length, 'задача', 'задачи', 'задач')}
          </span>
        </div>
      </header>

      <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-12">
          <section className="flex flex-col gap-4" aria-labelledby="theory">
            <h2 id="theory" className="t-display t-md">
              Коротко о главном
            </h2>
            {t.theory.map((b, i) =>
              b.kind === 'p' ? (
                <p key={i} className="max-w-[64ch] text-[18px] leading-relaxed">
                  <RichText text={b.text} />
                </p>
              ) : (
                <p
                  key={i}
                  className={clsx(
                    'flex max-w-[64ch] gap-3 rounded-[10px] px-4 py-3 text-[16.5px] leading-relaxed',
                    b.kind === 'tip' ? 'bg-butter' : 'border-[1.5px] border-dashed border-terracotta bg-paper',
                  )}
                >
                  {b.kind === 'tip' ? <Lightbulb className="mt-1 size-5 shrink-0" strokeWidth={1.8} /> : <TriangleAlert className="mt-1 size-5 shrink-0 text-ember-text" strokeWidth={1.8} />}
                  <span>
                    <RichText text={b.text} />
                  </span>
                </p>
              ),
            )}
          </section>

          <div className="lg:hidden">
            <Formulas formulas={t.formulas} hue={s.hue} />
          </div>

          {t.widget && <Lab widget={t.widget} />}

          <section className="flex flex-col gap-4" aria-labelledby="example">
            <h2 id="example" className="t-display t-md">
              Разбираем пример
            </h2>
            <div className="ruled rounded-[12px] border-[1.5px] border-ink/15 bg-paper p-5 sm:p-6">
              <p className="mb-4 text-[18px] leading-relaxed font-[550]">
                <RichText text={t.example.text} />
              </p>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {t.example.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[17px] leading-relaxed">
                    <span className={`hue-${s.hue} t-mono grid size-7 shrink-0 place-items-center rounded-full bg-tint text-[12px] text-hue`}>{i + 1}</span>
                    <span className="pt-0.5">
                      <RichText text={step} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="flex flex-col gap-5" aria-labelledby="problems">
            <h2 id="problems" className="t-display t-md">
              Задачи с проверкой
            </h2>
            {main.map((p, i) => (
              <ProblemCard key={p.id} problem={p} index={i + 1} solved={solvedSet.has(p.id)} hue={s.hue} />
            ))}
          </section>

          {self.length > 0 && (
            <section className="flex flex-col gap-5" aria-labelledby="self">
              <div className="flex flex-col gap-2">
                <h2 id="self" className="t-display t-md">
                  Сами, без подсказок
                </h2>
                <p className="text-[16px] text-muted">Задача посложнее: подсказка откроется только после первой попытки.</p>
              </div>
              {self.map((p, i) => (
                <ProblemCard key={p.id} problem={p} index={main.length + i + 1} solved={solvedSet.has(p.id)} hue={s.hue} />
              ))}
            </section>
          )}

          {complete && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`hue-${s.hue} flex flex-col gap-3 rounded-[14px] bg-tint p-6`} role="status">
              <p className="t-heading flex items-center gap-2 text-[26px]">
                <PartyPopper className="size-6" strokeWidth={1.8} /> Тема пройдена!
              </p>
              <p className="text-[17px]">Все задачи решены. {next ? 'Двигаемся дальше?' : 'Загляните в другие предметы практикума.'}</p>
              {next && (
                <ButtonLink to={`/practice/${s.slug}/${next.slug}`} className="w-fit">
                  {next.title} <ArrowRight className="size-4" />
                </ButtonLink>
              )}
            </motion.div>
          )}

          <nav className="grid gap-3 border-t border-dashed border-hair-soft pt-6 sm:grid-cols-2" aria-label="Соседние темы">
            {prev ? (
              <Link to={`/practice/${s.slug}/${prev.slug}`} className="press flex flex-col gap-1 rounded-[10px] border border-ink/15 p-4 no-underline hover:border-ink">
                <span className="t-mono inline-flex items-center gap-1 text-[11px] text-muted">
                  <ArrowLeft className="size-3" /> предыдущая тема
                </span>
                <span className="text-[17px] font-[550]">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/practice/${s.slug}/${next.slug}`} className="press flex flex-col items-end gap-1 rounded-[10px] border border-ink/15 p-4 text-right no-underline hover:border-ink">
                <span className="t-mono inline-flex items-center gap-1 text-[11px] text-muted">
                  следующая тема <ArrowRight className="size-3" />
                </span>
                <span className="text-[17px] font-[550]">{next.title}</span>
              </Link>
            )}
          </nav>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <Formulas formulas={t.formulas} hue={s.hue} />
            <div className="flex flex-col gap-3 rounded-[12px] bg-forest-2 p-5 text-cream">
              <p className="t-mono text-[11px] text-mark">не получается?</p>
              <p className="t-heading text-[20px] leading-snug">Разберём «{t.title}» с репетитором</p>
              <ButtonLink to={`/book?subject=${s.course}&note=${encodeURIComponent(`Хочу разобрать тему «${t.title}»`)}`} variant="banner" className="w-full">
                Записаться
              </ButtonLink>
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-10 lg:hidden">
        <ButtonLink to={`/book?subject=${s.course}&note=${encodeURIComponent(`Хочу разобрать тему «${t.title}»`)}`} className="w-full">
          Разобрать тему с репетитором
        </ButtonLink>
      </div>
    </Container>
  );
}

function Formulas({ formulas, hue }: { formulas: { tex: string; label: string }[]; hue: number }) {
  return (
    <section className={`hue-${hue} flex flex-col gap-1 rounded-[12px] border-[1.5px] border-ink/15 bg-paper p-5`} aria-labelledby="formulas">
      <h2 id="formulas" className="t-mono mb-2 text-[12px] text-hue">
        шпаргалка · формулы
      </h2>
      {formulas.map((f) => (
        <div key={f.tex} className="flex flex-col border-b border-dashed border-hair-soft py-3 last:border-0">
          <Tex tex={f.tex} block className="text-[17px]" />
          <span className="text-[13.5px] text-muted">{f.label}</span>
        </div>
      ))}
    </section>
  );
}
