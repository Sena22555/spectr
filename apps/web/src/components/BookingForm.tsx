import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { Button, Choice, Input, Select, Textarea } from './ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/platform';
import { trackEvent } from '../lib/track';
import type { Subject, TeacherCard } from '../lib/types';

export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: () => api<{ courses: Subject[] }>('/courses').then((r) => r.courses) });
}
export function useTeachers() {
  return useQuery({ queryKey: ['teachers'], queryFn: () => api<{ teachers: TeacherCard[] }>('/teachers').then((r) => r.teachers) });
}

/** Запись на занятие. Работает без аккаунта; если вошли — подставляем имя и контакт. */
export function BookingForm({ subjectSlug, teacherSlug, note, compact = false, narrow = false }: { subjectSlug?: string; teacherSlug?: string; note?: string; compact?: boolean; narrow?: boolean }) {
  const { user } = useAuth();
  const subjects = useSubjects();
  const teachers = useTeachers();
  const [form, setForm] = useState({
    name: '',
    contact: '',
    courseSlug: subjectSlug ?? '',
    teacherSlug: teacherSlug ?? '',
    format: 'INDIVIDUAL' as 'INDIVIDUAL' | 'GROUP',
    preferredTime: '',
    comment: note ?? '',
  });
  const [opened, setOpened] = useState(false);
  const markOpened = () => {
    if (opened) return;
    setOpened(true);
    trackEvent('book_open');
  };

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, contact: f.contact || user.phone || user.email || '' }));
  }, [user]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const subject = subjects.data?.find((s) => s.slug === form.courseSlug);
  const teacherOptions = (teachers.data ?? []).filter((t) => !subject || t.subject === subject.teacher?.subject || t.id === subject.teacher?.id);

  const m = useMutation({
    mutationFn: () =>
      api('/bookings', {
        method: 'POST',
        json: {
          name: form.name,
          contact: form.contact,
          courseId: subject?.id,
          teacherSlug: form.teacherSlug || undefined,
          format: form.format,
          preferredTime: form.preferredTime || undefined,
          comment: form.comment || undefined,
        },
      }),
    onSuccess: () => haptic('success'),
    onError: () => haptic('error'),
  });

  if (m.isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="hue-3 flex flex-col items-start gap-4 rounded-card bg-tint p-6 sm:p-8"
        role="status"
      >
        <span className="grid size-12 place-items-center rounded-full bg-ink text-paper">
          <Check className="size-6" strokeWidth={2} />
        </span>
        <p className="t-heading text-[32px]">Заявка у нас</p>
        <p className="max-w-[48ch] text-[17px]">
          Администратор свяжется с вами по контакту «{form.contact}», подберёт преподавателя и время.
        </p>
        {user ? (
          <Link to="/app" className="link">
            Перейти в кабинет
          </Link>
        ) : (
          <p className="text-[16px] text-ink/80">
            Чтобы видеть расписание и ссылки на занятия,{' '}
            <Link to="/register" className="link">
              создайте аккаунт
            </Link>
            .
          </p>
        )}
      </motion.div>
    );
  }

  return (
    <form
      // narrow — узкая колонка (форма внутри чата): все поля друг под другом
      className={narrow ? 'grid gap-4 [&>*]:col-span-1!' : compact ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : 'grid gap-5 sm:grid-cols-2'}
      onFocusCapture={markOpened}
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <Select label="Предмет" value={form.courseSlug} onChange={(e) => set('courseSlug', e.target.value)} className={compact ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : 'sm:col-span-2'}>
        <option value="">Помогите выбрать</option>
        {subjects.data?.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.title} · {s.level}
          </option>
        ))}
      </Select>
      {!compact && (
        <Select label="Преподаватель" value={form.teacherSlug} onChange={(e) => set('teacherSlug', e.target.value)} className="sm:col-span-2">
          <option value="">Подберите сами</option>
          {teacherOptions.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.user.name} · {t.subject}
            </option>
          ))}
        </Select>
      )}
      <div className={compact ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : 'sm:col-span-2'}>
        <Choice
          label="Формат"
          value={form.format}
          onChange={(v) => set('format', v)}
          options={[
            { value: 'INDIVIDUAL', label: 'Индивидуально', hint: 'один на один' },
            { value: 'GROUP', label: 'Мини-группа', hint: 'до 6 человек' },
          ]}
        />
      </div>
      <Input label="Как к вам обращаться" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} autoComplete="name" />
      <Input
        label="Телефон, email или ник в Telegram"
        value={form.contact}
        onChange={(e) => set('contact', e.target.value)}
        required
        minLength={3}
        autoComplete="tel"
      />
      {!compact && (
        <>
          <Input
            label="Когда удобно заниматься"
            value={form.preferredTime}
            onChange={(e) => set('preferredTime', e.target.value)}
            placeholder="Например: будни после 17:00"
            className="sm:col-span-2"
          />
          <Textarea
            label="Комментарий"
            value={form.comment}
            onChange={(e) => set('comment', e.target.value)}
            placeholder="Класс или курс, цель, что сейчас даётся труднее всего"
            className="sm:col-span-2"
          />
        </>
      )}
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" loading={m.isPending} className="w-full sm:w-auto">
          Записаться на занятие
        </Button>
        <p className="t-caption text-muted">Сначала подберём преподавателя и время, потом поставим занятие в расписание.</p>
      </div>
      {m.error && (
        <p className="t-caption text-ember-text sm:col-span-2" role="alert">
          {(m.error as Error).message}
        </p>
      )}
    </form>
  );
}
