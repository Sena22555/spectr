import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Avatar, Empty, ErrorNote, Loading, PageHeader, Tag } from '../../components/ui';

interface Row {
  user: { id: string; name: string; email: string | null; phone: string | null; avatarUrl: string | null };
  groups: { name: string; hue: number }[];
  individual: boolean;
}

export default function Students() {
  const q = useQuery({ queryKey: ['teacher', 'students'], queryFn: () => api<{ students: Row[] }>('/teacher/students').then((r) => r.students) });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Ученики" lead="Все, кто занимается у вас в группах и индивидуально." />
      {q.isPending && <Loading />}
      {q.error && <ErrorNote error={q.error} />}
      {q.data?.length === 0 && <Empty title="Учеников пока нет">Администратор добавит учеников в ваши группы или поставит индивидуальные занятия.</Empty>}
      {q.data && q.data.length > 0 && (
        <ul className="m-0 list-none p-0">
          {q.data
            .sort((a, b) => a.user.name.localeCompare(b.user.name, 'ru'))
            .map((s) => (
              <li key={s.user.id} className="grid gap-3 border-b border-hair-soft py-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.3fr)] sm:items-center">
                <div className="flex items-center gap-3">
                  <Avatar name={s.user.name} url={s.user.avatarUrl} />
                  <span className="text-[18px] font-[450]">{s.user.name}</span>
                </div>
                <div className="t-caption flex flex-col text-muted">
                  {s.user.phone && <a href={`tel:${s.user.phone}`} className="link w-fit">{s.user.phone}</a>}
                  {s.user.email && <a href={`mailto:${s.user.email}`} className="link w-fit">{s.user.email}</a>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.groups.map((g) => (
                    <Tag key={g.name} hue={g.hue}>
                      {g.name}
                    </Tag>
                  ))}
                  {s.individual && <Tag hue={5}>Индивидуально</Tag>}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
