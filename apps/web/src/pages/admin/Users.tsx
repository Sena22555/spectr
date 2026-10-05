import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDay, STATUS_LABEL } from '../../lib/format';
import { Avatar, ErrorNote, Loading, PageHeader } from '../../components/ui';
import { FilterChip } from '../Teachers';
import type { Role, User } from '../../lib/types';

const ROLES: Role[] = ['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'];

export default function AdminUsers() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const users = useQuery({
    queryKey: ['admin', 'users', role, q],
    queryFn: () => api<{ users: User[] }>(`/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}) })}`).then((r) => r.users),
  });
  const m = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api(`/admin/users/${id}`, { method: 'PATCH', json: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Люди и роли"
        lead="Назначьте человеку роль «Преподаватель» — у него появится своя панель: занятия, ученики, ссылки на уроки. Профиль преподавателя затем заполните в разделе «Преподаватели»."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Поиск по имени или email</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" strokeWidth={1.7} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Имя или email"
            className="h-11 w-full rounded-ctl border border-ink bg-paper pr-3 pl-9 text-[16px] placeholder:text-muted"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto">
          <FilterChip active={!role} onClick={() => setRole('')}>
            Все
          </FilterChip>
          {ROLES.map((r) => (
            <FilterChip key={r} active={role === r} onClick={() => setRole(r)}>
              {STATUS_LABEL[r]}
            </FilterChip>
          ))}
        </div>
      </div>
      {users.isPending && <Loading />}
      {users.error && <ErrorNote error={users.error} />}
      <ul className="m-0 list-none p-0">
        {users.data?.map((u) => (
          <li key={u.id} className="grid gap-3 border-b border-hair-soft py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={u.name} url={u.avatarUrl} />
              <div className="min-w-0">
                <p className="text-[17px] font-[450] [overflow-wrap:anywhere]">{u.name}</p>
                <p className="t-caption text-muted [overflow-wrap:anywhere]">{u.email ?? (u.telegramLinked ? 'через Telegram' : u.vkLinked ? 'через VK' : '—')}</p>
              </div>
            </div>
            <p className="t-caption text-muted">с {fmtDay(u.createdAt)}</p>
            <div className="inline-flex rounded-ctl border border-ink/40 p-0.5" role="radiogroup" aria-label={`Роль: ${u.name}`}>
              {ROLES.map((r) => (
                <button
                  key={r}
                  role="radio"
                  aria-checked={u.role === r}
                  disabled={u.id === me?.id && r !== 'ADMIN'}
                  onClick={() => u.role !== r && m.mutate({ id: u.id, role: r })}
                  className={`press h-9 rounded-full px-3 text-[14px] disabled:opacity-40 ${u.role === r ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}
                >
                  {STATUS_LABEL[r]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {m.error && <p className="t-caption text-ember-text">{(m.error as Error).message}</p>}
    </div>
  );
}
