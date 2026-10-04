import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, HeartHandshake, Send } from 'lucide-react';
import { Container } from '../../components/Layout';
import { ProgressView } from '../../components/practice/ProgressView';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useMyProgress, type ParentLinkInfo } from '../../lib/progress';
import { isMiniApp } from '../../lib/platform';

/** «Мой прогресс»: для ученика и гостя, плюс ссылка-отчёт для родителей. */
export default function ProgressPage() {
  const q = useMyProgress();
  return (
    <Container className={clsx('flex max-w-[1000px] flex-col gap-10', isMiniApp ? 'pt-5 pb-8' : 'pt-8 pb-10 sm:pt-12')}>
      <header className="flex flex-col gap-3">
        <p className="t-mono text-[12px] text-muted">
          <Link to="/practice" className="link">
            практикум
          </Link>{' '}
          / мой прогресс
        </p>
        <h1 className="t-display t-lg">Мой прогресс</h1>
        <p className="t-sub max-w-[56ch] text-muted">Сколько решено, какие темы уже получаются и какие достижения открыты. Поделитесь ссылкой с родителями — они увидят успехи без звонков и расспросов.</p>
      </header>
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          {q.data.progress.solvedTotal === 0 && (
            <div className="flex flex-col items-start gap-3 rounded-[14px] bg-butter p-6">
              <p className="t-heading text-[24px]">Пока здесь пусто — самое время начать</p>
              <p className="text-[16px]">Решите задачу дня или откройте тренажёр — прогресс и первые достижения появятся сразу.</p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink to="/practice">Задача дня</ButtonLink>
                <ButtonLink to="/practice/trainers" variant="secondary">
                  Тренажёры
                </ButtonLink>
              </div>
            </div>
          )}
          <ProgressView p={q.data.progress} />
          <ParentShare signedIn={q.data.signedIn} link={q.data.parentLink} />
        </>
      )}
    </Container>
  );
}

function ParentShare({ signedIn, link }: { signedIn: boolean; link: ParentLinkInfo | null }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const create = useMutation({ mutationFn: () => api<ParentLinkInfo>('/progress/parent-link', { method: 'POST', json: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['my-progress'] }) });
  const revoke = useMutation({ mutationFn: () => api('/progress/parent-link', { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['my-progress'] }) });
  const info = link ?? create.data ?? null;
  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Скопируйте ссылку', info.url);
    }
  };
  const share = info ? `https://t.me/share/url?url=${encodeURIComponent(info.url)}&text=${encodeURIComponent('Мои успехи в «Спектре» — отчёт обновляется сам')}` : '';

  return (
    <section className="flex flex-col gap-4 rounded-[14px] bg-forest-2 p-6 text-cream sm:p-8" aria-labelledby="parents">
      <p className="t-mono inline-flex items-center gap-2 text-[12px] text-mark">
        <HeartHandshake className="size-4" /> для родителей
      </p>
      <h2 id="parents" className="t-display text-[clamp(26px,3vw,36px)]">
        Покажите родителям, как идут дела
      </h2>
      <p className="max-w-[60ch] text-[16.5px] text-cream/85">
        Родитель откроет ссылку и увидит, сколько решено, что получается и что стоит подтянуть, — без паролей. А если подпишется на бота, по воскресеньям будет получать короткий отчёт. Контакты и переписка в отчёт не попадают.
      </p>
      {!signedIn ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[15px] text-cream/80">Чтобы прогресс не потерялся и его можно было показать родителям, войдите или зарегистрируйтесь — уже решённое сохранится.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/register?next=/practice/progress" variant="banner">
              Зарегистрироваться
            </ButtonLink>
            <ButtonLink to="/login?next=/practice/progress" variant="ghost" className="text-cream">
              Войти
            </ButtonLink>
          </div>
        </div>
      ) : info ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-cream/10 p-2 pl-4">
            <span className="min-w-0 flex-1 truncate font-mono text-[14px]">{info.url}</span>
            <Button variant="banner" className="min-h-10 px-4" onClick={copy}>
              <Copy className="size-4" /> {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={share} target="_blank" rel="noreferrer" className="press inline-flex min-h-11 items-center gap-2 rounded-ctl border-[1.5px] border-cream px-4 text-[15px] font-[600] text-cream no-underline hover:bg-mark hover:text-forest">
              <Send className="size-4" /> Отправить в Telegram
            </a>
            <button type="button" className="link text-[14px] text-cream/70" onClick={() => revoke.mutate()}>
              Отозвать ссылку
            </button>
          </div>
        </div>
      ) : (
        <Button variant="banner" className="w-fit" loading={create.isPending} onClick={() => create.mutate()}>
          Получить ссылку для родителей
        </Button>
      )}
    </section>
  );
}
