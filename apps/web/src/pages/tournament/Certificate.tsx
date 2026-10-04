import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Printer, Send } from 'lucide-react';
import { Container } from '../../components/Layout';
import { LogoMark } from '../../components/Logo';
import { Button, ButtonLink, ErrorNote, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { usePageTitle } from '../../lib/title';

interface Cert {
  name: string;
  league: string;
  week: string;
  score: number;
  tasks: number;
  place: number;
  players: number;
  date: string;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Сертификат участника или грамота победителя «Турнира недели». Печатается на A4 альбомной. */
export default function Certificate() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['certificate', id], queryFn: () => api<Cert>(`/tournament/certificate/${id}`) });
  usePageTitle(q.data ? `${q.data.place <= 3 ? 'Грамота' : 'Сертификат'}: ${q.data.name}` : 'Сертификат');
  if (q.isPending)
    return (
      <Container className="py-10">
        <Loading />
      </Container>
    );
  if (q.error)
    return (
      <Container className="py-10">
        <ErrorNote error={q.error} />
      </Container>
    );
  const c = q.data;
  const winner = c.place <= 3;
  const share = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(`${winner ? 'Грамота победителя' : 'Сертификат'} Турнира недели «Спектра»: ${c.score} из ${c.tasks}!`)}`;
  return (
    <Container className="flex max-w-[1000px] flex-col items-center gap-6 py-8 print:p-0">
      <style>{`@media print { @page { size: A4 landscape; margin: 0; } header, footer, nav, .no-print { display: none !important; } body { background: #fbf8f0; } }`}</style>
      <article className="relative aspect-[1.414] w-full overflow-hidden rounded-[16px] border-[1.5px] border-ink/20 bg-paper shadow-sticker print:rounded-none print:border-0 print:shadow-none" aria-label="Сертификат">
        <div className="spectrum-bar absolute inset-x-0 top-0 h-3" aria-hidden="true" />
        <div className="spectrum-bar absolute inset-x-0 bottom-0 h-3" aria-hidden="true" />
        <div className="graph-paper absolute inset-3 rounded-[10px] opacity-60" aria-hidden="true" />
        <div className="relative flex h-full flex-col items-center justify-center gap-[2.2%] px-[8%] text-center">
          <div className="flex items-center gap-3">
            <LogoMark className="h-[clamp(28px,5vw,52px)] w-auto" title="" />
            <span className="t-display text-[clamp(20px,3vw,34px)]">Спектр</span>
          </div>
          <p className="t-mono text-[clamp(10px,1.3vw,14px)] tracking-[0.18em] text-muted">ТУРНИР НЕДЕЛИ · {c.week.replace('-W', ' · НЕДЕЛЯ ')}</p>
          <h1 className="t-display text-[clamp(30px,6.4vw,72px)] leading-none">{winner ? 'Грамота победителя' : 'Сертификат участника'}</h1>
          <p className="text-[clamp(13px,1.8vw,20px)] text-muted">вручается</p>
          <p className="t-display text-[clamp(30px,6vw,68px)] leading-none">
            <mark>{c.name}</mark>
          </p>
          <p className="max-w-[60ch] text-[clamp(13px,1.8vw,20px)]">
            {winner ? `за ${['первое', 'второе', 'третье'][c.place - 1]} место` : 'за участие'} в Турнире недели онлайн-школы «Спектр», лига «{c.league}»: решено{' '}
            <b>
              {c.score} из {c.tasks}
            </b>{' '}
            задач{c.players > 1 ? `, место ${c.place} из ${c.players}` : ''}.
          </p>
          <p className="t-mono pt-[1.5%] text-[clamp(10px,1.2vw,13px)] text-muted">{dateFmt.format(new Date(c.date))} · {window.location.host}</p>
        </div>
        {winner && (
          <div className="absolute top-[9%] right-[6%] grid size-[clamp(56px,11vw,120px)] rotate-12 place-items-center rounded-full bg-mark text-[clamp(28px,5vw,58px)] shadow-sticker" aria-hidden="true">
            {['🥇', '🥈', '🥉'][c.place - 1]}
          </div>
        )}
      </article>
      <div className="no-print flex flex-wrap justify-center gap-3">
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Распечатать или сохранить PDF
        </Button>
        <a href={share} target="_blank" rel="noreferrer" className="press inline-flex min-h-12 items-center gap-2 rounded-ctl border-[1.5px] border-ink px-5 text-[15px] font-[600] no-underline hover:bg-mark">
          <Send className="size-4" /> Отправить родителям
        </a>
        <ButtonLink to="/tournament" variant="ghost">
          К турниру
        </ButtonLink>
      </div>
    </Container>
  );
}
