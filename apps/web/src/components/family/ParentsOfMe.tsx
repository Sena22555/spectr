import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { fmtFull } from '../../lib/format';
import { Button, SectionTitle } from '../ui';

interface Data {
  parents: { id: string; name: string; since: string }[];
  code: { code: string; expiresAt: string } | null;
}

/** В профиле ученика: код для родителя и кто уже видит расписание и успехи. */
export function ParentsOfMe() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['family-parents'], queryFn: () => api<Data>('/family/parents') });
  const issue = useMutation({ mutationFn: () => api('/family/code', { method: 'POST', json: {} }), onSuccess: () => qc.invalidateQueries({ queryKey: ['family-parents'] }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/family/parents/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['family-parents'] }) });
  const [copied, setCopied] = useState(false);
  const code = q.data?.code;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Родители</SectionTitle>
      <p className="max-w-[60ch] text-[15.5px] text-muted">
        Родитель заводит свой аккаунт в «Спектре», вводит ваш код — и видит расписание, домашку и успехи в практикуме. Сообщения и пароль он не видит.
      </p>
      {code ? (
        <div className="hue-4 flex flex-wrap items-center gap-4 rounded-[14px] bg-tint px-5 py-4">
          <span className="t-display tnum text-[34px] tracking-[0.2em]" aria-label={`Код ${code.code.split('').join(' ')}`}>
            {code.code}
          </span>
          <button
            type="button"
            className="link inline-flex items-center gap-1 text-[14px]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/register?as=parent&code=${code.code}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                /* ignore */
              }
            }}
          >
            <Copy className="size-4" /> {copied ? 'Ссылка скопирована' : 'Скопировать ссылку для родителя'}
          </button>
          <span className="t-mono w-full text-[12px] text-hue">действует до {fmtFull(code.expiresAt)}</span>
        </div>
      ) : (
        <Button variant="secondary" className="w-fit" loading={issue.isPending} onClick={() => issue.mutate()}>
          <KeyRound className="size-4" /> Получить код для родителя
        </Button>
      )}
      {q.data && q.data.parents.length > 0 && (
        <ul className="m-0 list-none p-0">
          {q.data.parents.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 border-b border-hair-soft py-3">
              <span className="text-[16.5px]">
                {p.name} <span className="t-caption text-muted">· видит с {fmtFull(p.since)}</span>
              </span>
              <button type="button" className="link inline-flex items-center gap-1 text-[14px] text-muted" onClick={() => remove.mutate(p.id)} aria-label={`Отвязать: ${p.name}`}>
                <X className="size-4" /> Отвязать
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
