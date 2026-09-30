import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { api, uploadImage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL } from '../../lib/format';
import { haptic, platform, platformLabel } from '../../lib/platform';
import { ThemeSwitch } from '../../components/Layout';
import { Badge, Button, Input, Monogram, PageHeader, SectionTitle } from '../../components/ui';

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone ?? '');
    }
  }, [user]);

  const save = useMutation({
    mutationFn: (data: { name?: string; phone?: string; avatarUrl?: string }) => api('/auth/me', { method: 'PATCH', json: data }),
    onSuccess: () => {
      haptic('success');
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });
  const avatar = useMutation({
    mutationFn: async (file: File) => {
      const { url } = await uploadImage(file);
      return api('/auth/me', { method: 'PATCH', json: { avatarUrl: url } });
    },
    onSuccess: () => refresh(),
  });

  const [pw, setPw] = useState({ current: '', next: '' });
  const password = useMutation({
    mutationFn: () => api('/auth/password', { method: 'POST', json: pw }),
    onSuccess: () => {
      setPw({ current: '', next: '' });
      haptic('success');
    },
  });

  if (!user) return null;

  return (
    <div className="flex max-w-3xl flex-col gap-12">
      <PageHeader title="Профиль" />

      <section className="flex flex-wrap items-center gap-6">
        <button className="press group relative overflow-hidden rounded-full" onClick={() => fileRef.current?.click()} aria-label="Сменить фото">
          <Monogram name={user.name} hue={5} photoUrl={user.avatarUrl} size="lg" className="rounded-full" />
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-7" strokeWidth={1.6} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && avatar.mutate(e.target.files[0])}
        />
        <div className="flex flex-col gap-2">
          <p className="t-heading text-[30px]">{user.name}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="ink">{STATUS_LABEL[user.role]}</Badge>
            {user.email && <Badge>{user.email}</Badge>}
          </div>
          {avatar.isPending && <p className="t-caption text-muted">Загружаем фото…</p>}
          {avatar.error && <p className="t-caption text-ember-text">{(avatar.error as Error).message}</p>}
        </div>
      </section>

      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name, phone });
        }}
      >
        <SectionTitle className="sm:col-span-2">Данные</SectionTitle>
        <Input label="Имя и фамилия" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        <Input label="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex items-center gap-4 sm:col-span-2">
          <Button type="submit" loading={save.isPending}>
            Сохранить
          </Button>
          {saved && (
            <span className="t-caption text-muted" role="status">
              Сохранено
            </span>
          )}
          {save.error && <span className="t-caption text-ember-text">{(save.error as Error).message}</span>}
        </div>
      </form>

      <section className="flex flex-col gap-4">
        <SectionTitle>Где открывается кабинет</SectionTitle>
        <ul className="m-0 list-none p-0">
          {[
            { label: 'Сайт', on: Boolean(user.email), note: user.email ? `вход по почте ${user.email}` : 'почта не указана' },
            { label: 'Telegram', on: user.telegramLinked, note: user.telegramLinked ? 'привязан' : 'откройте школу в Telegram, чтобы привязать' },
            { label: 'ВКонтакте', on: user.vkLinked, note: user.vkLinked ? 'привязан' : 'откройте школу во ВКонтакте, чтобы привязать' },
          ].map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-4 border-b border-hair-soft py-3">
              <span className="text-[17px]">{r.label}</span>
              <span className="t-caption text-right text-muted">{r.note}</span>
            </li>
          ))}
        </ul>
        <p className="t-caption text-muted">Сейчас вы в: {platformLabel[platform]}</p>
      </section>

      {user.email && (
        <form
          className="grid gap-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            password.mutate();
          }}
        >
          <SectionTitle className="sm:col-span-2">Пароль</SectionTitle>
          <Input label="Текущий пароль" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <Input label="Новый пароль" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} minLength={8} required autoComplete="new-password" hint="Минимум 8 символов" />
          <div className="flex items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="secondary" loading={password.isPending}>
              Сменить пароль
            </Button>
            {password.isSuccess && <span className="t-caption text-muted">Пароль обновлён</span>}
            {password.error && <span className="t-caption text-ember-text">{(password.error as Error).message}</span>}
          </div>
        </form>
      )}

      <section className="flex flex-col gap-4">
        <SectionTitle>Оформление</SectionTitle>
        <ThemeSwitch />
      </section>

      <div className="border-t border-charcoal pt-6">
        <Button variant="ghost" onClick={logout}>
          Выйти из аккаунта
        </Button>
      </div>
    </div>
  );
}
