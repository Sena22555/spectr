/**
 * Демо-данные «Спектра». Фото преподавателей и групп пока не заданы —
 * интерфейс показывает монограммы; настоящие фото загружаются через админку.
 *
 * Аккаунты:
 *   admin@spectr.school    / spectr-admin     — администратор
 *   anna@spectr.school     / spectr-teacher   — преподаватель (и остальные преподаватели *@spectr.school)
 *   student@spectr.school  / spectr-student   — ученик
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MSK_OFFSET_H = 3;
function mskDate(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour - MSK_OFFSET_H, minute, 0, 0);
  return d;
}
/** Ближайшие даты для дней недели (1 = пн … 7 = вс) на N недель вперёд и 1 назад */
function weekly(days: number[], hour: number, minute: number, weeks = 4) {
  const out: Date[] = [];
  for (let off = -7; off < weeks * 7; off++) {
    const d = mskDate(off, hour, minute);
    const mskDay = new Date(d.getTime() + MSK_OFFSET_H * 3600_000).getUTCDay() || 7;
    if (days.includes(mskDay)) out.push(d);
  }
  return out;
}

async function main() {
  await prisma.$transaction([
    prisma.ticketMessage.deleteMany(),
    prisma.supportTicket.deleteMany(),
    prisma.rescheduleRequest.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.groupPhoto.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.group.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.course.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const [adminHash, teacherHash, studentHash] = await Promise.all([
    bcrypt.hash('spectr-admin', 10),
    bcrypt.hash('spectr-teacher', 10),
    bcrypt.hash('spectr-student', 10),
  ]);

  const admin = await prisma.user.create({
    data: { email: 'admin@spectr.school', name: 'Администратор', role: 'ADMIN', passwordHash: adminHash, emailVerified: true },
  });

  const teacherSeed = [
    { email: 'anna@spectr.school', name: 'Анна Лебедева', slug: 'anna-lebedeva', subject: 'Математика', hue: 1, experience: 9,
      headline: 'Школьная математика и ОГЭ/ЕГЭ — через понимание, а не шаблоны',
      bio: 'Объясняю математику через устройство задачи. Девять лет занимаюсь с учениками 5–11 классов: закрываю пробелы, готовлю к ОГЭ и ЕГЭ. На уроках много разбора ошибок — на них держится результат.' },
    { email: 'vera@spectr.school', name: 'Вера Соколова', slug: 'vera-sokolova', subject: 'Физика', hue: 5, experience: 12,
      headline: 'Физика, которую можно потрогать: опыт на каждом занятии',
      bio: 'Кандидат физико-математических наук. Показываю законы на простых домашних опытах, потом переводим их на язык формул и экзаменационных задач.' },
    { email: 'pavel@spectr.school', name: 'Павел Ершов', slug: 'pavel-ershov', subject: 'Высшая математика', hue: 6, experience: 8,
      headline: 'Матанализ, линейная алгебра и дифуры для первых курсов',
      bio: 'Преподаю в вузе и занимаюсь со студентами индивидуально. Помогаю разобраться в теории и спокойно закрыть сессию.' },
    { email: 'daniil@spectr.school', name: 'Даниил Ким', slug: 'daniil-kim', subject: 'Общая физика', hue: 4, experience: 5,
      headline: 'Общая физика для студентов: механика, электричество, лабораторные',
      bio: 'Аспирант-физик. Разбираю задачи из вузовских задачников, помогаю с лабораторными и подготовкой к экзамену.' },
    { email: 'ilya@spectr.school', name: 'Илья Громов', slug: 'ilya-gromov', subject: 'Информатика', hue: 3, experience: 6,
      headline: 'Python и ЕГЭ по информатике — от первой программы до 90+',
      bio: 'Разработчик и преподаватель. Учу писать код, который работает и читается. Готовлю к ЕГЭ по информатике и первым вузовским курсам программирования.' },
    { email: 'mark@spectr.school', name: 'Марк Орлов', slug: 'mark-orlov', subject: 'Английский язык', hue: 2, experience: 7,
      headline: 'Разговорный английский для школьников и студентов',
      bio: 'Семь лет преподаю английский. Ставлю речь с первого занятия: говорим больше, чем пишем. Помогаю с академическим английским в вузе.' },
  ];

  const teachers = [];
  for (const t of teacherSeed) {
    const user = await prisma.user.create({
      data: { email: t.email, name: t.name, role: 'TEACHER', passwordHash: teacherHash, emailVerified: true },
    });
    teachers.push(
      await prisma.teacher.create({
        data: { userId: user.id, slug: t.slug, subject: t.subject, headline: t.headline, bio: t.bio, experience: t.experience, hue: t.hue },
      }),
    );
  }
  const [anna, vera, pavel, daniil, ilya, mark] = teachers;

  // Направления занятий. Школа не продаёт курсы — это предметы, по которым можно записаться к репетитору.
  const courseSeed = [
    { slug: 'math', audience: 'SCHOOL', title: 'Математика', teacher: anna, hue: 1, level: '5–11 класс', format: 'Индивидуально или мини-группа', durationWeeks: 0,
      summary: 'Школьная программа, пробелы и подготовка к ОГЭ/ЕГЭ — базовый и профильный уровень.',
      description: 'Начинаем с диагностики: находим, где именно «плывёт» понимание. Дальше — занятия по плану, домашние задания с проверкой и регулярные пробники перед экзаменом.' },
    { slug: 'physics', audience: 'SCHOOL', title: 'Физика', teacher: vera, hue: 5, level: '7–11 класс', format: 'Индивидуально или мини-группа', durationWeeks: 0,
      summary: 'Механика, электричество, оптика — через опыт и понятные задачи.',
      description: 'Разбираем каждую тему кодификатора, решаем задачи второй части и учимся оформлять решения так, как ждут эксперты.' },
    { slug: 'higher-math', audience: 'STUDENTS', title: 'Высшая математика', teacher: pavel, hue: 6, level: '1–2 курс вуза', format: 'Индивидуально', durationWeeks: 0,
      summary: 'Матанализ, линейная алгебра, дифференциальные уравнения.',
      description: 'Помогаем разобраться в теории, решить домашние и контрольные и подготовиться к коллоквиуму и экзамену.' },
    { slug: 'uni-physics', audience: 'STUDENTS', title: 'Общая физика', teacher: daniil, hue: 4, level: '1–2 курс вуза', format: 'Индивидуально', durationWeeks: 0,
      summary: 'Вузовский курс общей физики, задачники и лабораторные.',
      description: 'Механика, молекулярка, электричество и магнетизм. Разбор задач, помощь с лабораторными и подготовка к сессии.' },
    { slug: 'informatics', audience: 'ALL', title: 'Информатика', teacher: ilya, hue: 3, level: '8–11 класс, 1 курс', format: 'Индивидуально или группа', durationWeeks: 0,
      summary: 'Python, алгоритмы и ЕГЭ по информатике.',
      description: 'Переменные, циклы, функции, работа с файлами. Для ЕГЭ — все типы заданий, включая программирование.' },
    { slug: 'english', audience: 'ALL', title: 'Английский язык', teacher: mark, hue: 2, level: 'Школьники и студенты', format: 'Индивидуально или разговорный клуб', durationWeeks: 0,
      summary: 'Разговорная практика, школьная программа и академический английский.',
      description: 'Каждое занятие — новая тема и лексика. Преподаватель ведёт диалог, поправляет ошибки и даёт обратную связь.' },
  ];

  const courses: Record<string, { id: string }> = {};
  for (const c of courseSeed) {
    const { teacher, ...rest } = c;
    courses[c.slug] = await prisma.course.create({ data: { ...rest, teacherId: teacher.id } });
  }

  const groupSeed = [
    { slug: 'oge-math-autumn', name: 'ОГЭ · Математика', course: 'math', teacher: anna, hue: 1, schedule: 'Вт, Чт · 17:00', days: [2, 4], hour: 17, capacity: 6,
      description: 'Мини-группа девятиклассников. Цель — уверенная «пятёрка» на ОГЭ.' },
    { slug: 'ege-physics', name: 'ЕГЭ · Физика', course: 'physics', teacher: vera, hue: 5, schedule: 'Ср, Сб · 18:00', days: [3, 6], hour: 18, capacity: 6,
      description: 'Группа, в которой каждую неделю ставим домашний эксперимент и решаем вторую часть.' },
    { slug: 'calculus-1', name: 'Матанализ · 1 курс', course: 'higher-math', teacher: pavel, hue: 6, schedule: 'Пн · 19:30', days: [1], hour: 19, minute: 30, capacity: 5,
      description: 'Пределы, производные, интегралы — к коллоквиуму без паники.' },
    { slug: 'python-juniors', name: 'Python · Juniors', course: 'informatics', teacher: ilya, hue: 3, schedule: 'Вт, Сб · 16:00', days: [2, 6], hour: 16, capacity: 8,
      description: 'Пишем первые программы и собираем телеграм-бота к концу семестра.' },
    { slug: 'speaking-club', name: 'Speaking Club', course: 'english', teacher: mark, hue: 2, schedule: 'Пн, Пт · 18:30', days: [1, 5], hour: 18, minute: 30, capacity: 8,
      description: 'Живые обсуждения и мини-презентации на английском.' },
  ];

  const studentNames = [
    'Алиса Петрова', 'Тимур Ахмедов', 'София Новикова', 'Лев Смирнов', 'Ева Кузнецова', 'Матвей Попов', 'Полина Васильева',
    'Артём Зайцев', 'Мирон Павлов', 'Варвара Семёнова', 'Кирилл Голубев', 'Ника Виноградова',
  ];
  const demoStudent = await prisma.user.create({
    data: { email: 'student@spectr.school', name: 'Александра Белова', passwordHash: studentHash, phone: '+7 900 000-00-00', emailVerified: true },
  });
  const students = [demoStudent];
  for (const [i, name] of studentNames.entries()) {
    students.push(await prisma.user.create({ data: { email: `student${i + 1}@spectr.school`, name, passwordHash: studentHash } }));
  }

  const groups = [];
  for (const [gi, g] of groupSeed.entries()) {
    const group = await prisma.group.create({
      data: {
        slug: g.slug, name: g.name, description: g.description, hue: g.hue, schedule: g.schedule, capacity: g.capacity,
        courseId: courses[g.course].id, teacherId: g.teacher.id,
      },
    });
    groups.push(group);
    // по 4–6 учеников на группу; демо-ученица в двух группах
    const members = students.slice(1).filter((_, i) => (i + gi) % 3 !== 0).slice(0, 4 + (gi % 3));
    if (gi === 0 || gi === 1) members.unshift(demoStudent);
    for (const m of members) await prisma.groupMember.create({ data: { groupId: group.id, userId: m.id } });

    for (const [li, startsAt] of weekly(g.days, g.hour, g.minute ?? 0).entries()) {
      const past = startsAt.getTime() < Date.now();
      await prisma.lesson.create({
        data: {
          title: `${g.name}: занятие ${li + 1}`,
          startsAt,
          durationMin: 90,
          teacherId: g.teacher.id,
          groupId: group.id,
          status: past ? 'DONE' : 'SCHEDULED',
          link: li % 4 === 3 ? null : `https://telemost.yandex.ru/j/spectr-${g.slug}`,
        },
      });
    }
  }

  // Индивидуальные занятия демо-ученицы по физике
  const individual = [];
  for (const startsAt of weekly([6], 11, 0, 3)) {
    individual.push(
      await prisma.lesson.create({
        data: {
          title: 'Физика: индивидуальное занятие',
          startsAt,
          durationMin: 60,
          teacherId: vera.id,
          studentId: demoStudent.id,
          status: startsAt.getTime() < Date.now() ? 'DONE' : 'SCHEDULED',
          link: 'https://telemost.yandex.ru/j/spectr-physics-1on1',
        },
      }),
    );
  }

  const nextIndividual = individual.find((l) => l.startsAt.getTime() > Date.now());
  if (nextIndividual) {
    await prisma.rescheduleRequest.create({
      data: {
        lessonId: nextIndividual.id,
        userId: demoStudent.id,
        reason: 'В субботу школьная олимпиада, можно перенести на воскресенье?',
        proposedAt: new Date(nextIndividual.startsAt.getTime() + 24 * 3600_000),
      },
    });
  }

  const ticket = await prisma.supportTicket.create({
    data: { subject: 'Не приходит ссылка на занятие', userId: demoStudent.id, status: 'ANSWERED' },
  });
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorId: demoStudent.id, body: 'Здравствуйте! Во вторник не увидела ссылку на урок математики в расписании.' },
  });
  await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorId: admin.id, body: 'Добрый день! Ссылка уже добавлена, она появляется в карточке занятия за 15 минут до начала.' },
  });

  await prisma.booking.createMany({
    data: [
      { name: 'Мария', contact: '@maria_k', courseId: courses['informatics'].id, preferredTime: 'Будни после 17:00', comment: 'Сыну 13 лет, хочет начать программировать' },
      { name: 'Игорь Степанов', contact: '+7 912 345-67-89', courseId: courses['higher-math'].id, teacherSlug: 'pavel-ershov', preferredTime: 'Выходные', comment: 'Первый курс, горит коллоквиум по матанализу' },
    ],
  });

  
  console.log(`Готово: ${teachers.length} преподавателей, ${groups.length} групп, ${students.length} учеников.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
