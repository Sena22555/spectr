import { useEffect } from 'react';

const BASE = 'Спектр';

/** Заголовок вкладки: «Страница — Спектр». */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} — ${BASE}`;
  }, [title]);
}

const STATIC: [RegExp, string][] = [
  [/^\/$/, 'Спектр — онлайн-школа'],
  [/^\/practice$/, 'Практикум: бесплатные задачи и теория — Спектр'],
  [/^\/practice\/trainers$/, 'Сборник задач 5–11 класс, ОГЭ и ЕГЭ — Спектр'],
  [/^\/practice\/progress$/, 'Мой прогресс — Спектр'],
  [/^\/teachers$/, 'Преподаватели — Спектр'],
  [/^\/subjects$/, 'Предметы — Спектр'],
  [/^\/groups$/, 'Мини-группы — Спектр'],
  [/^\/book$/, 'Запись на занятие — Спектр'],
  [/^\/login$/, 'Вход — Спектр'],
  [/^\/register$/, 'Регистрация — Спектр'],
  [/^\/app/, 'Кабинет — Спектр'],
  [/^\/teach/, 'Кабинет преподавателя — Спектр'],
  [/^\/admin/, 'Админка — Спектр'],
];

/** Заголовок по адресу для страниц без своего; страницы с данными уточняют его через usePageTitle. */
export function titleFor(path: string) {
  return STATIC.find(([re]) => re.test(path))?.[1] ?? null;
}
