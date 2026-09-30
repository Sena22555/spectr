# Спектр — онлайн-школа

Прототип онлайн-школы занятий с репетитором. Это сайт, который одновременно работает как мини-приложение в **Telegram** и во **ВКонтакте**.

- **Ученик**: запись на занятие (можно без аккаунта), личный кабинет с расписанием, ближайшим уроком и ссылкой на него, заявка на перенос, поддержка, профиль, группы с фотографиями.
- **Преподаватель** («полуадминка»): занятия на сегодня и на неделю, ссылки на уроки, ученики, решения по переносам, фото групп.
- **Администратор**: сводка, заявки на запись, расписание школы, группы и их состав, люди и роли, профили преподавателей, предметы, переносы, поддержка.

Задел на будущее: курсы от университета (`Course.source = UNIVERSITY`), подтверждение почты (`User.emailVerified`).

## Стек

| Часть | Технологии |
|---|---|
| `apps/web` | React 19, Vite 8, TypeScript, Tailwind CSS v4, TanStack Query, Motion, VK Bridge, Telegram WebApp SDK |
| `apps/api` | Node 22, Fastify 5, Prisma 6 (SQLite в прототипе → Postgres в продакшене), JWT, Zod |

## Быстрый старт

Нужен Node.js **22.18+**.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # и поменяйте JWT_SECRET
npm run setup                            # создать БД и залить демо-данные
npm run dev                              # API :4000 + сайт :5173
```

Откройте http://localhost:5173.

### Демо-аккаунты

| Роль | Email | Пароль |
|---|---|---|
| Ученица | `student@spectr.school` | `spectr-student` |
| Преподаватель | `anna@spectr.school` (и `vera@`, `pavel@`, `daniil@`, `ilya@`, `mark@`) | `spectr-teacher` |
| Администратор | `admin@spectr.school` | `spectr-admin` |

Имена, предметы и тексты в демо-данных вымышлены и меняются в админке. Фото преподавателей и групп пока не загружены, вместо них показываются цветные монограммы.

## Роли и права

- Новый пользователь после регистрации получает роль **ученик**.
- Администратор в разделе «Люди и роли» может назначить роль **преподаватель**. Профиль преподавателя создаётся автоматически и скрыт с сайта, пока вы не заполните его в разделе «Преподаватели» и не включите «Показывать на сайте».
- Преподаватель видит только свои группы, занятия и учеников. Администратор видит всё.

## Мини-приложения

Фронтенд сам определяет, где открыт (`apps/web/src/lib/platform.ts`), подхватывает тему пользователя (светлую или тёмную), показывает нижние вкладки, кнопку «Назад» Telegram и тактильный отклик. Вход происходит автоматически по подписанным данным платформы. Подпись проверяется на бэкенде (`apps/api/src/lib/miniapp.ts`).

Для разработки нужен публичный HTTPS-адрес. Например, `npx cloudflared tunnel --url http://localhost:5173`.

**Telegram**
1. В @BotFather: `/newbot`, затем `/newapp` (или Bot Settings → Configure Mini App). Укажите HTTPS-адрес сайта.
2. Токен бота запишите в `apps/api/.env` → `TELEGRAM_BOT_TOKEN`.
3. Ссылку вида `https://t.me/<бот>/<app>` запишите в `apps/web/.env` → `VITE_TELEGRAM_APP_URL` (её использует кнопка на главной).

**ВКонтакте**
1. На vk.com/apps?act=manage создайте мини-приложение и укажите HTTPS-адрес.
2. «Защищённый ключ» приложения запишите в `apps/api/.env` → `VK_APP_SECRET`.
3. Ссылку `https://vk.com/app<ID>` запишите в `apps/web/.env` → `VITE_VK_APP_URL`.

Пока токен или ключ не заданы, в мини-приложении показывается обычный вход по почте.

## Продакшен

```bash
npm run build
npm start          # API раздаёт собранный сайт с того же домена (SERVE_WEB=1)
```

Для Postgres в `apps/api/prisma/schema.prisma` поменяйте `provider = "postgresql"`, задайте `DATABASE_URL` и выполните `npm run db:push -w @spectr/api`. Загруженные фото сейчас лежат в `apps/api/uploads`. Для продакшена их стоит перенести в S3-совместимое хранилище (`apps/api/src/routes/uploads.ts`).

## Дизайн

- `DESIGN.md` — дизайн-система «Скетчбук»: кремовая бумага, тёмно-зелёные чернила, жёлтый маркер, стикеры и рисунки от руки (референс владельца — SayBriefly). Шрифты с кириллицей: Geologica (заголовки), Inter (текст), IBM Plex Mono (рубрики). Прежние варианты — в `docs/design/` и в истории git («Печатный лист»).
- `PRODUCT.md` — продуктовые факты: для кого школа, что делает и чего не выдумывать.
- `CLAUDE.md` — правила для Claude, включая раздел Frontend references.
- `.claude/skills/impeccable` — навыки [Impeccable](https://impeccable.style) (polish, distill, audit и др.). Бинарник детектора в git не хранится. На своей машине выполните `npx impeccable install -y --providers=claude --scope=project`, затем `npm run design:detect`.

## Демо-версия без сервера

Статическая сборка, которую можно выложить на любой хостинг и отправить ссылкой: API подменён снимком демо-данных, страницы открываются по `#`-ссылкам, внизу слева кнопка «демо» для входа под любой ролью. Изменения живут до перезагрузки.

```bash
npm run demo:snapshot -w @spectr/web   # при запущенном API: обновить src/demo/snapshot.json
npm run build:demo -w @spectr/web      # сборка в apps/web/dist-demo
```

## Структура

```
apps/
  api/
    prisma/schema.prisma   модели: User, Teacher, Course, Group, Lesson, Booking, RescheduleRequest, SupportTicket…
    prisma/seed.ts         демо-данные
    src/routes/            auth, public, me (ученик), teacher, admin, uploads
  web/
    src/components/        Logo и призма, UI-кит, карточки, формы
    src/pages/             сайт, app/ (ученик), teach/ (преподаватель), admin/
    src/lib/               api, auth, platform (Telegram/VK), format
```

## Что дальше

- Письмо с подтверждением email (в модели есть `emailVerified`, место в коде помечено `TODO` в `routes/auth.ts`).
- Уведомления через Telegram-бота: напоминание перед уроком, ответ на перенос.
- Курсы от университета: форма заявки на `Course.source = UNIVERSITY` (модель `Enrollment` уже есть).
- Настоящие фотографии преподавателей и групп.
