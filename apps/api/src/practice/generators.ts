// Тренажёры «Спектра»: генераторы задач. Каждая задача собирается из случайных чисел по зерну,
// поэтому их бесконечно много, а проверка на сервере пересобирает ту же задачу и сравнивает ответ.
// Ответы вычисляются программой — ошибиться в ключе нельзя.
// Условия — обычным текстом (их показывают и боты), разбор может содержать TeX в $…$.

export type Rng = () => number;

export interface GenProblem {
  text: string;
  answer: number | string;
  /** как показать правильный ответ, если число некрасивое (дробь) */
  display?: string;
  kind?: 'number' | 'text';
  unit?: string;
  tol?: number;
  hint: string;
  steps: string[];
}

export interface ExamTag {
  exam: 'ОГЭ' | 'ЕГЭ';
  subject: string;
  task: number;
}

export interface Generator {
  id: string;
  title: string;
  subject: 'math' | 'physics' | 'informatics';
  grades: [number, number];
  /** короткое описание навыка */
  skill: string;
  exams?: ExamTag[];
  /** тема практикума с теорией: subject/slug */
  theory?: string;
  make(r: Rng): GenProblem;
}

// ─── помощники ───

export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T>(r: Rng, list: readonly T[]) => list[int(r, 0, list.length - 1)]!;
const nz = (r: Rng, a: number, b: number) => {
  let x = 0;
  while (x === 0) x = int(r, a, b);
  return x;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
const round = (x: number, d = 10) => Number(x.toFixed(d));
/** число по-русски: десятичная запятая */
const n = (x: number) => String(round(x)).replace('.', ',');
/** число в TeX с запятой */
const t = (x: number) => String(round(x)).replace('.', '{,}');
const par = (x: number) => (x < 0 ? `(−${Math.abs(x)})` : `${x}`);
/** дробь a/b в несократимом виде */
function frac(a: number, b: number) {
  const g = gcd(a, b) || 1;
  let p = a / g;
  let q = b / g;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  return { p, q, text: q === 1 ? `${p}` : `${p}/${q}`, tex: q === 1 ? `${p}` : `\\frac{${p}}{${q}}`, value: p / q };
}
/** коэффициент перед x: 1 → «», −1 → «−», иначе число с длинным минусом */
const coef = (a: number) => (a === 1 ? '' : a === -1 ? '−' : String(a).replace('-', '−'));
/** многочлен: [[коэф, 'x²'], [коэф, 'x'], [коэф, '']] → «x² − 6x + 5» */
function poly(terms: [number, string][]) {
  let out = '';
  for (const [c, v] of terms) {
    if (c === 0) continue;
    const abs = Math.abs(c);
    const body = v ? `${abs === 1 ? '' : abs}${v}` : `${abs}`;
    out += out ? ` ${c < 0 ? '−' : '+'} ${body}` : `${c < 0 ? '−' : ''}${body}`;
  }
  return out || '0';
}
const sup = (k: number) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]!);

// ─── математика ───

const MATH: Generator[] = [
  {
    id: 'mental-mult',
    title: 'Устный счёт: умножение',
    subject: 'math',
    grades: [5, 5],
    skill: 'Умножение двузначного числа на однозначное в уме',
    make(r) {
      const a = int(r, 12, 98);
      const b = int(r, 3, 9);
      const tens = Math.floor(a / 10) * 10;
      return {
        text: `Вычислите: ${a} · ${b}`,
        answer: a * b,
        hint: `Разложите ${a} на десятки и единицы: ${tens} + ${a - tens}.`,
        steps: [`$${a} \\cdot ${b} = ${tens} \\cdot ${b} + ${a - tens} \\cdot ${b} = ${tens * b} + ${(a - tens) * b} = ${a * b}$`],
      };
    },
  },
  {
    id: 'order-ops',
    title: 'Порядок действий',
    subject: 'math',
    grades: [5, 6],
    skill: 'Сначала умножение и деление, потом сложение и вычитание',
    make(r) {
      const b = int(r, 2, 9);
      const c = int(r, 2, 9);
      const e = int(r, 2, 6);
      const d = e * int(r, 2, 9);
      const a = int(r, 10, 60);
      const res = a + b * c - d / e;
      return {
        text: `Вычислите: ${a} + ${b} · ${c} − ${d} : ${e}`,
        answer: res,
        hint: 'Сначала умножение и деление слева направо, потом сложение и вычитание.',
        steps: [`$${b} \\cdot ${c} = ${b * c}$, $${d} : ${e} = ${d / e}$`, `$${a} + ${b * c} - ${d / e} = ${res}$`],
      };
    },
  },
  {
    id: 'frac-same',
    title: 'Дроби с одинаковыми знаменателями',
    subject: 'math',
    grades: [5, 5],
    skill: 'Складываем числители, знаменатель оставляем',
    theory: 'math/fractions',
    make(r) {
      const q = int(r, 5, 15);
      const a = int(r, 1, q - 2);
      const b = int(r, 1, q - a - 1);
      const f = frac(a + b, q);
      return {
        text: `Вычислите: ${a}/${q} + ${b}/${q}. Ответ можно записать дробью, например 3/7.`,
        answer: f.value,
        display: f.text,
        tol: 0.005,
        hint: 'Знаменатели одинаковые — складываем только числители.',
        steps: [`$\\frac{${a}}{${q}} + \\frac{${b}}{${q}} = \\frac{${a + b}}{${q}}${f.q !== q ? ` = ${f.tex}` : ''}$`],
      };
    },
  },
  {
    id: 'frac-add',
    title: 'Сложение и вычитание дробей',
    subject: 'math',
    grades: [5, 6],
    skill: 'Приводим дроби к общему знаменателю',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 6 }],
    theory: 'math/fractions',
    make(r) {
      const q1 = pick(r, [2, 3, 4, 5, 6, 8, 10]);
      let q2 = pick(r, [2, 3, 4, 5, 6, 8, 10]);
      while (q2 === q1) q2 = pick(r, [2, 3, 4, 5, 6, 8, 10]);
      const a = int(r, 1, q1 - 1);
      const b = int(r, 1, q2 - 1);
      const minus = r() < 0.4 && a / q1 > b / q2;
      const L = lcm(q1, q2);
      const top = (a * L) / q1 + (minus ? -1 : 1) * ((b * L) / q2);
      const f = frac(top, L);
      return {
        text: `Вычислите: ${a}/${q1} ${minus ? '−' : '+'} ${b}/${q2}. Ответ — обыкновенной дробью (например, 5/12) или десятичной, округлённой до сотых.`,
        answer: f.value,
        display: f.text,
        tol: 0.005,
        hint: `Общий знаменатель — ${L}.`,
        steps: [
          `Общий знаменатель $${L}$: $\\frac{${a}}{${q1}} = \\frac{${(a * L) / q1}}{${L}}$, $\\frac{${b}}{${q2}} = \\frac{${(b * L) / q2}}{${L}}$`,
          `$\\frac{${(a * L) / q1} ${minus ? '-' : '+'} ${(b * L) / q2}}{${L}} = \\frac{${top}}{${L}}${f.q !== L ? ` = ${f.tex}` : ''}$`,
        ],
      };
    },
  },
  {
    id: 'frac-mul',
    title: 'Умножение и деление дробей',
    subject: 'math',
    grades: [6, 6],
    skill: 'Числитель на числитель, знаменатель на знаменатель; деление — умножение на перевёрнутую',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 6 }],
    theory: 'math/fractions',
    make(r) {
      const a = int(r, 1, 7);
      const b = int(r, a + 1, 9);
      const c = int(r, 1, 7);
      const d = int(r, c + 1, 9);
      const div = r() < 0.5;
      const f = div ? frac(a * d, b * c) : frac(a * c, b * d);
      return {
        text: `Вычислите: ${a}/${b} ${div ? ':' : '·'} ${c}/${d}. Ответ — дробью, например 5/12.`,
        answer: f.value,
        display: f.text,
        tol: 0.005,
        hint: div ? 'Деление на дробь — это умножение на перевёрнутую дробь.' : 'Перемножьте числители и знаменатели, потом сократите.',
        steps: div
          ? [`$\\frac{${a}}{${b}} : \\frac{${c}}{${d}} = \\frac{${a}}{${b}} \\cdot \\frac{${d}}{${c}} = \\frac{${a * d}}{${b * c}} = ${f.tex}$`]
          : [`$\\frac{${a}}{${b}} \\cdot \\frac{${c}}{${d}} = \\frac{${a * c}}{${b * d}} = ${f.tex}$`],
      };
    },
  },
  {
    id: 'decimals',
    title: 'Десятичные дроби',
    subject: 'math',
    grades: [5, 6],
    skill: 'Действия с десятичными дробями',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 6 }],
    make(r) {
      const a = int(r, 11, 99) / 10;
      const b = int(r, 2, 9) / 10;
      const c = int(r, 2, 9);
      const res = round(a + b * c);
      return {
        text: `Вычислите: ${n(a)} + ${n(b)} · ${c}`,
        answer: res,
        hint: 'Сначала умножение, потом сложение.',
        steps: [`$${t(b)} \\cdot ${c} = ${t(round(b * c))}$`, `$${t(a)} + ${t(round(b * c))} = ${t(res)}$`],
      };
    },
  },
  {
    id: 'gcd-lcm',
    title: 'НОД и НОК',
    subject: 'math',
    grades: [6, 6],
    skill: 'Наибольший общий делитель и наименьшее общее кратное',
    make(r) {
      const g = pick(r, [2, 3, 4, 5, 6, 7, 8, 9, 12]);
      let x = int(r, 2, 9);
      let y = int(r, 2, 9);
      while (gcd(x, y) !== 1 || x === y) {
        x = int(r, 2, 9);
        y = int(r, 2, 9);
      }
      const a = g * x;
      const b = g * y;
      const askGcd = r() < 0.5;
      return {
        text: `Найдите ${askGcd ? 'наибольший общий делитель' : 'наименьшее общее кратное'} чисел ${a} и ${b}.`,
        answer: askGcd ? g : lcm(a, b),
        hint: askGcd ? 'Разложите оба числа на множители и возьмите общие.' : 'НОК(a, b) = a · b / НОД(a, b).',
        steps: askGcd
          ? [`$${a} = ${g} \\cdot ${x}$, $${b} = ${g} \\cdot ${y}$, а $${x}$ и $${y}$ взаимно просты, значит НОД $= ${g}$`]
          : [`НОД$(${a}, ${b}) = ${g}$`, `НОК $= \\frac{${a} \\cdot ${b}}{${g}} = ${lcm(a, b)}$`],
      };
    },
  },
  {
    id: 'negatives',
    title: 'Положительные и отрицательные числа',
    subject: 'math',
    grades: [6, 6],
    skill: 'Правила знаков',
    make(r) {
      const a = nz(r, -12, 12);
      const b = nz(r, -9, 9);
      const c = nz(r, -20, 20);
      const res = a * b + c;
      return {
        text: `Вычислите: ${par(a)} · ${par(b)} ${c < 0 ? '−' : '+'} ${Math.abs(c)}`,
        answer: res,
        hint: 'Минус на минус даёт плюс, минус на плюс — минус.',
        steps: [`$${par(a)} \\cdot ${par(b)} = ${a * b}$`, `$${a * b} ${c < 0 ? '-' : '+'} ${Math.abs(c)} = ${res}$`],
      };
    },
  },
  {
    id: 'percent-of',
    title: 'Процент от числа',
    subject: 'math',
    grades: [5, 9],
    skill: 'p% от числа — умножить на p/100',
    theory: 'math/percent',
    make(r) {
      const p = pick(r, [5, 10, 15, 20, 25, 30, 40, 50, 60, 75]);
      const base = pick(r, [20, 40, 60, 80, 120, 160, 200, 240, 300, 400, 480, 600, 800]);
      const res = (base * p) / 100;
      return {
        text: `Найдите ${p}% от числа ${base}.`,
        answer: res,
        hint: `${p}% — это ${n(p / 100)} от числа.`,
        steps: [`$${base} \\cdot ${t(p / 100)} = ${t(res)}$`],
      };
    },
  },
  {
    id: 'percent-change',
    title: 'Скидки и наценки',
    subject: 'math',
    grades: [6, 9],
    skill: 'Увеличение и уменьшение на процент',
    theory: 'math/percent',
    make(r) {
      const price = pick(r, [400, 500, 600, 800, 900, 1200, 1500, 2000, 2500, 3000]);
      const p = pick(r, [10, 15, 20, 25, 30, 40]);
      const up = r() < 0.5;
      const res = round(price * (1 + (up ? p : -p) / 100));
      return {
        text: up ? `Цена товара ${price} ₽ выросла на ${p}%. Сколько рублей стоит товар теперь?` : `Товар стоил ${price} ₽, его продают со скидкой ${p}%. Сколько рублей нужно заплатить?`,
        answer: res,
        unit: '₽',
        hint: up ? `Умножьте на ${n(1 + p / 100)}.` : `Скидка ${p}% — платим ${100 - p}% цены.`,
        steps: [`$${price} \\cdot ${t(1 + (up ? p : -p) / 100)} = ${t(res)}$ ₽`],
      };
    },
  },
  {
    id: 'proportion',
    title: 'Пропорции',
    subject: 'math',
    grades: [6, 6],
    skill: 'Основное свойство пропорции: произведение крайних равно произведению средних',
    make(r) {
      const x = int(r, 2, 15);
      const k = int(r, 2, 6);
      const a = int(r, 2, 9);
      const b = a * k;
      const c = x * k;
      return {
        text: `Найдите x из пропорции: x : ${a} = ${c} : ${b}`,
        answer: x,
        hint: 'Произведение крайних членов равно произведению средних.',
        steps: [`$x \\cdot ${b} = ${a} \\cdot ${c}$`, `$x = \\frac{${a * c}}{${b}} = ${x}$`],
      };
    },
  },
  {
    id: 'linear-eq',
    title: 'Линейные уравнения',
    subject: 'math',
    grades: [6, 7],
    skill: 'Переносим слагаемые и делим на коэффициент',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 9 }],
    make(r) {
      const x = nz(r, -9, 12);
      const a = nz(r, -7, 9);
      const b = int(r, -20, 20);
      const c = a * x + b;
      return {
        text: `Решите уравнение: ${poly([[a, 'x'], [b, '']])} = ${String(c).replace('-', '−')}`,
        answer: x,
        hint: `Перенесите ${b} в правую часть, затем разделите на ${a}.`,
        steps: [`$${a}x = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$`, `$x = \\frac{${c - b}}{${a}} = ${x}$`],
      };
    },
  },
  {
    id: 'linear-eq-2',
    title: 'Уравнения с x в обеих частях',
    subject: 'math',
    grades: [7, 9],
    skill: 'Собираем x в одной части, числа — в другой',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 9 }],
    make(r) {
      const x = nz(r, -8, 10);
      let a = int(r, 2, 9);
      let c = int(r, 1, 8);
      if (a === c) a = c + 2;
      const b = int(r, -15, 15);
      const d = a * x + b - c * x;
      return {
        text: `Решите уравнение: ${poly([[a, 'x'], [b, '']])} = ${poly([[c, 'x'], [d, '']])}`,
        answer: x,
        hint: 'Перенесите слагаемые с x влево, числа — вправо.',
        steps: [`$${a}x - ${c}x = ${d} ${b < 0 ? '+' : '-'} ${Math.abs(b)}$`, `$${a - c}x = ${d - b}$`, `$x = ${x}$`],
      };
    },
  },
  {
    id: 'powers',
    title: 'Степени',
    subject: 'math',
    grades: [7, 9],
    skill: 'Свойства степеней с одинаковым основанием',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 8 }],
    make(r) {
      const a = pick(r, [2, 3, 5, 10]);
      const m = int(r, 3, 8);
      const k = int(r, 2, 6);
      const p = pick(r, a === 2 ? [1, 2, 3, 4, 5] : [1, 2, 3]);
      const d = m + k - p;
      const res = a ** p;
      return {
        text: `Найдите значение выражения: ${a}${sup(m)} · ${a}${sup(k)} : ${a}${sup(d)}`,
        answer: res,
        hint: 'При умножении показатели складываются, при делении — вычитаются.',
        steps: [`$${a}^{${m}} \\cdot ${a}^{${k}} : ${a}^{${d}} = ${a}^{${m} + ${k} - ${d}} = ${a}^{${p}} = ${res}$`],
      };
    },
  },
  {
    id: 'roots',
    title: 'Квадратные корни',
    subject: 'math',
    grades: [8, 9],
    skill: 'Произведение корней — корень из произведения',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 8 }],
    make(r) {
      const k = int(r, 2, 12);
      const a = pick(r, [2, 3, 5, 6, 7]);
      const b = k * k * a;
      return {
        text: `Найдите значение выражения: √${b} · √${a}`,
        answer: k * a,
        hint: '√a · √b = √(a · b).',
        steps: [`$\\sqrt{${b}} \\cdot \\sqrt{${a}} = \\sqrt{${b * a}} = ${k * a}$`],
      };
    },
  },
  {
    id: 'inequality',
    title: 'Линейные неравенства',
    subject: 'math',
    grades: [8, 9],
    skill: 'При делении на отрицательное число знак меняется',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 13 }],
    make(r) {
      const a = nz(r, -6, 6);
      const x0 = int(r, -8, 8);
      const b = int(r, -12, 12);
      const c = a * x0 + b;
      // a·x + b > c  →  x > x0 при a > 0, x < x0 при a < 0
      const greater = a > 0;
      const ans = greater ? x0 + 1 : x0 - 1;
      return {
        text: `Найдите ${greater ? 'наименьшее' : 'наибольшее'} целое решение неравенства: ${poly([[a, 'x'], [b, '']])} > ${String(c).replace('-', '−')}`,
        answer: ans,
        hint: a < 0 ? 'Делите на отрицательное число — знак неравенства переворачивается.' : 'Перенесите число вправо и разделите на коэффициент.',
        steps: [`$${a}x > ${c - b}$`, `$x ${greater ? '>' : '<'} ${x0}$`, `${greater ? 'Наименьшее' : 'Наибольшее'} целое: $${ans}$`],
      };
    },
  },
  {
    id: 'quadratic',
    title: 'Квадратные уравнения',
    subject: 'math',
    grades: [8, 11],
    skill: 'Дискриминант и теорема Виета',
    exams: [
      { exam: 'ОГЭ', subject: 'математика', task: 9 },
      { exam: 'ЕГЭ', subject: 'профильная математика', task: 6 },
    ],
    theory: 'math/quadratic',
    make(r) {
      let x1 = int(r, -9, 9);
      let x2 = int(r, -9, 9);
      if (x1 === x2) x2 = x1 + int(r, 1, 5);
      if (x1 > x2) [x1, x2] = [x2, x1];
      const p = -(x1 + x2);
      const q = x1 * x2;
      const big = r() < 0.5;
      const eq = `${poly([[1, 'x²'], [p, 'x'], [q, '']])} = 0`;
      return {
        text: `Решите уравнение ${eq}. В ответе укажите ${big ? 'больший' : 'меньший'} корень.`,
        answer: big ? x2 : x1,
        hint: `По теореме Виета: сумма корней ${-p}, произведение ${q}.`,
        steps: [`$D = ${p * p} - 4 \\cdot ${q < 0 ? `(${q})` : q} = ${p * p - 4 * q}$`, `$x = \\frac{${-p} \\pm ${Math.sqrt(p * p - 4 * q)}}{2}$, корни $${x1}$ и $${x2}$`],
      };
    },
  },
  {
    id: 'system',
    title: 'Системы уравнений',
    subject: 'math',
    grades: [7, 9],
    skill: 'Сложение уравнений системы',
    make(r) {
      const x = int(r, -6, 9);
      const y = int(r, -6, 9);
      const askX = r() < 0.5;
      return {
        text: `Решите систему: x + y = ${x + y}, x − y = ${x - y}. В ответе укажите ${askX ? 'x' : 'y'}.`,
        answer: askX ? x : y,
        hint: 'Сложите уравнения — y сократится.',
        steps: [`Сложим: $2x = ${2 * x}$, $x = ${x}$`, `$y = ${x + y} - ${par(x)} = ${y}$`],
      };
    },
  },
  {
    id: 'progression-a',
    title: 'Арифметическая прогрессия',
    subject: 'math',
    grades: [9, 9],
    skill: 'n-й член и сумма',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 14 }],
    theory: 'math/progressions',
    make(r) {
      const a1 = int(r, -10, 15);
      const d = nz(r, -5, 7);
      const k = int(r, 6, 20);
      const sum = r() < 0.4;
      const ak = a1 + (k - 1) * d;
      return {
        text: sum ? `Арифметическая прогрессия: a₁ = ${a1}, d = ${d}. Найдите сумму первых ${k} членов.` : `Арифметическая прогрессия: a₁ = ${a1}, d = ${d}. Найдите a${String(k).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]!)}.`,
        answer: sum ? ((a1 + ak) * k) / 2 : ak,
        hint: sum ? 'Sₙ = (a₁ + aₙ) · n / 2 — сначала найдите aₙ.' : 'aₙ = a₁ + (n − 1) · d.',
        steps: sum
          ? [`$a_{${k}} = ${a1} + ${k - 1} \\cdot ${par(d)} = ${ak}$`, `$S_{${k}} = \\frac{(${a1} + ${par(ak)}) \\cdot ${k}}{2} = ${((a1 + ak) * k) / 2}$`]
          : [`$a_{${k}} = ${a1} + ${k - 1} \\cdot ${par(d)} = ${ak}$`],
      };
    },
  },
  {
    id: 'progression-g',
    title: 'Геометрическая прогрессия',
    subject: 'math',
    grades: [9, 9],
    skill: 'bₙ = b₁ · qⁿ⁻¹',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 14 }],
    theory: 'math/progressions',
    make(r) {
      const b1 = pick(r, [1, 2, 3, 4, 5, -2, -3]);
      const q = pick(r, [2, 3, -2, -3]);
      const k = int(r, 3, 6);
      const res = b1 * q ** (k - 1);
      return {
        text: `Геометрическая прогрессия: b₁ = ${b1}, q = ${q}. Найдите ${k}-й член прогрессии.`,
        answer: res,
        hint: 'bₙ = b₁ · qⁿ⁻¹.',
        steps: [`$b_{${k}} = ${b1} \\cdot ${par(q)}^{${k - 1}} = ${res}$`],
      };
    },
  },
  {
    id: 'probability',
    title: 'Вероятность',
    subject: 'math',
    grades: [7, 11],
    skill: 'Благоприятные исходы делим на все',
    exams: [
      { exam: 'ОГЭ', subject: 'математика', task: 10 },
      { exam: 'ЕГЭ', subject: 'профильная математика', task: 4 },
    ],
    make(r) {
      const total = pick(r, [20, 25, 40, 50]);
      const good = int(r, 1, total - 1);
      const setting = pick(r, [
        ['В сборнике билетов по биологии', 'билетов', 'в', 'билетов про ботанику', 'Школьнику достаётся случайный билет. Найдите вероятность, что в нём будет вопрос про ботанику.'],
        ['В лотерее', 'билетов', 'среди них', 'выигрышных', 'Найдите вероятность того, что случайно купленный билет выигрышный.'],
        ['В коробке', 'ручек', 'из них', 'синих', 'Найдите вероятность того, что наугад вынутая ручка окажется синей.'],
      ] as const);
      const p = good / total;
      return {
        text: `${setting[0]} ${total} ${setting[1]}, ${setting[2]} ${good} ${setting[3]}. ${setting[4]}`,
        answer: round(p, 6),
        hint: 'P = число благоприятных исходов / число всех исходов.',
        steps: [`$P = \\frac{${good}}{${total}} = ${t(p)}$`],
      };
    },
  },
  {
    id: 'formula',
    title: 'Расчёты по формулам',
    subject: 'math',
    grades: [8, 11],
    skill: 'Подставляем числа в формулу и аккуратно считаем',
    exams: [
      { exam: 'ОГЭ', subject: 'математика', task: 12 },
      { exam: 'ЕГЭ', subject: 'профильная математика', task: 9 },
    ],
    make(r) {
      const kind = int(r, 0, 2);
      if (kind === 0) {
        const c = pick(r, [-20, -10, 0, 5, 10, 15, 20, 25, 30, 35, 40]);
        const f = (9 / 5) * c + 32;
        return {
          text: `Перевести температуру из градусов Цельсия в градусы Фаренгейта позволяет формула t_F = 1,8 · t_C + 32. Сколько градусов по Фаренгейту соответствует ${c} °C?`,
          answer: round(f),
          hint: 'Подставьте t_C в формулу.',
          steps: [`$t_F = 1{,}8 \\cdot ${par(c)} + 32 = ${t(f)}$`],
        };
      }
      if (kind === 1) {
        const I = pick(r, [2, 3, 4, 5, 6]);
        const R = pick(r, [3, 4, 5, 8, 10, 12]);
        return {
          text: `Мощность тока вычисляется по формуле P = I²R, где I — сила тока (А), R — сопротивление (Ом). Найдите P, если I = ${I} А, R = ${R} Ом.`,
          answer: I * I * R,
          unit: 'Вт',
          hint: 'Сначала возведите I в квадрат.',
          steps: [`$P = ${I}^2 \\cdot ${R} = ${I * I} \\cdot ${R} = ${I * I * R}$ Вт`],
        };
      }
      const a = pick(r, [2, 3, 4, 5]);
      const tt = pick(r, [2, 3, 4, 5, 6]);
      const v0 = pick(r, [0, 2, 4, 5, 10]);
      const s = v0 * tt + (a * tt * tt) / 2;
      return {
        text: `Путь при равноускоренном движении: s = v₀t + at²/2. Найдите s (в метрах), если v₀ = ${v0} м/с, a = ${a} м/с², t = ${tt} с.`,
        answer: s,
        unit: 'м',
        hint: 'Посчитайте оба слагаемых отдельно.',
        steps: [`$s = ${v0} \\cdot ${tt} + \\frac{${a} \\cdot ${tt}^2}{2} = ${v0 * tt} + ${(a * tt * tt) / 2} = ${t(s)}$ м`],
      };
    },
  },
  {
    id: 'triangle-angles',
    title: 'Углы треугольника',
    subject: 'math',
    grades: [7, 9],
    skill: 'Сумма углов треугольника 180°',
    exams: [{ exam: 'ОГЭ', subject: 'математика', task: 15 }],
    make(r) {
      const a = int(r, 25, 90);
      const b = int(r, 20, 160 - a);
      return {
        text: `Два угла треугольника равны ${a}° и ${b}°. Найдите третий угол.`,
        answer: 180 - a - b,
        unit: '°',
        hint: 'Сумма углов треугольника равна 180°.',
        steps: [`$180^\\circ - ${a}^\\circ - ${b}^\\circ = ${180 - a - b}^\\circ$`],
      };
    },
  },
  {
    id: 'pythagoras',
    title: 'Теорема Пифагора',
    subject: 'math',
    grades: [8, 11],
    skill: 'c² = a² + b²',
    exams: [
      { exam: 'ОГЭ', subject: 'математика', task: 15 },
      { exam: 'ЕГЭ', subject: 'профильная математика', task: 1 },
    ],
    make(r) {
      const [a0, b0, c0] = pick(r, [
        [3, 4, 5],
        [5, 12, 13],
        [8, 15, 17],
        [7, 24, 25],
        [20, 21, 29],
      ] as const);
      const k = int(r, 1, 3);
      const [a, b, c] = [a0 * k, b0 * k, c0 * k];
      const findHyp = r() < 0.5;
      return findHyp
        ? { text: `Катеты прямоугольного треугольника равны ${a} и ${b}. Найдите гипотенузу.`, answer: c, hint: 'c = √(a² + b²).', steps: [`$c = \\sqrt{${a}^2 + ${b}^2} = \\sqrt{${a * a + b * b}} = ${c}$`] }
        : { text: `Гипотенуза прямоугольного треугольника равна ${c}, один из катетов — ${a}. Найдите другой катет.`, answer: b, hint: 'b = √(c² − a²).', steps: [`$b = \\sqrt{${c}^2 - ${a}^2} = \\sqrt{${c * c - a * a}} = ${b}$`] };
    },
  },
  {
    id: 'area-rect',
    title: 'Площадь и периметр',
    subject: 'math',
    grades: [5, 6],
    skill: 'S = a · b, P = 2(a + b)',
    make(r) {
      const a = int(r, 3, 25);
      const b = int(r, 2, 20);
      const area = r() < 0.5;
      return {
        text: area ? `Комната имеет форму прямоугольника ${a} м на ${b} м. Найдите её площадь.` : `Участок — прямоугольник ${a} м на ${b} м. Сколько метров забора нужно, чтобы огородить его по периметру?`,
        answer: area ? a * b : 2 * (a + b),
        unit: area ? 'м²' : 'м',
        hint: area ? 'Площадь прямоугольника — произведение сторон.' : 'Периметр — сумма всех четырёх сторон.',
        steps: [area ? `$S = ${a} \\cdot ${b} = ${a * b}$ м²` : `$P = 2 \\cdot (${a} + ${b}) = ${2 * (a + b)}$ м`],
      };
    },
  },
  {
    id: 'trig-values',
    title: 'Тригонометрия: табличные значения',
    subject: 'math',
    grades: [9, 11],
    skill: 'sin, cos, tg основных углов',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 7 }],
    theory: 'math/trigonometry',
    make(r) {
      const variants = [
        { text: '2 · sin 30° + cos 60°', value: 1.5, steps: ['$2 \\cdot \\frac12 + \\frac12 = 1{,}5$'] },
        { text: '4 · cos 60° − tg 45°', value: 1, steps: ['$4 \\cdot \\frac12 - 1 = 1$'] },
        { text: 'sin²30° + cos²30°', value: 1, steps: ['Основное тождество: $\\sin^2\\alpha + \\cos^2\\alpha = 1$'] },
        { text: '6 · sin 30° · cos 60°', value: 1.5, steps: ['$6 \\cdot \\frac12 \\cdot \\frac12 = 1{,}5$'] },
        { text: '10 · sin 30° − 3 · tg 45°', value: 2, steps: ['$10 \\cdot \\frac12 - 3 \\cdot 1 = 2$'] },
        { text: '8 · cos²45°', value: 4, steps: ['$\\cos 45^\\circ = \\frac{\\sqrt2}{2}$, $\\cos^2 45^\\circ = \\frac12$, $8 \\cdot \\frac12 = 4$'] },
        { text: '12 · sin²60°', value: 9, steps: ['$\\sin^2 60^\\circ = \\frac34$, $12 \\cdot \\frac34 = 9$'] },
      ];
      const v = pick(r, variants);
      return { text: `Найдите значение выражения: ${v.text}`, answer: v.value, hint: 'sin 30° = cos 60° = 1/2, tg 45° = 1, sin 60° = √3/2, cos 45° = √2/2.', steps: v.steps };
    },
  },
  {
    id: 'logs',
    title: 'Логарифмы',
    subject: 'math',
    grades: [10, 11],
    skill: 'logₐb — в какую степень возвести a, чтобы получить b',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 7 }],
    make(r) {
      const a = pick(r, [2, 3, 5]);
      const k = int(r, 2, a === 2 ? 7 : 4);
      const b = a ** k;
      const m = int(r, 2, 5);
      return {
        text: `Найдите значение выражения: ${m} · log${'₀₁₂₃₄₅₆₇₈₉'[a]} ${b}`,
        answer: m * k,
        hint: `${a} в какой степени даёт ${b}?`,
        steps: [`$\\log_{${a}} ${b} = ${k}$, так как $${a}^{${k}} = ${b}$`, `$${m} \\cdot ${k} = ${m * k}$`],
      };
    },
  },
  {
    id: 'exp-eq',
    title: 'Показательные уравнения',
    subject: 'math',
    grades: [10, 11],
    skill: 'Приводим к одному основанию и приравниваем показатели',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 6 }],
    make(r) {
      const a = pick(r, [2, 3, 5]);
      const m = int(r, 2, a === 2 ? 7 : 4);
      const k = int(r, -5, 6);
      const x = m - k;
      return {
        text: `Найдите корень уравнения: ${a}^(${poly([[1, 'x'], [k, '']])}) = ${a ** m}`,
        answer: x,
        hint: `Запишите ${a ** m} как степень числа ${a}.`,
        steps: [`$${a ** m} = ${a}^{${m}}$`, `$x ${k < 0 ? '-' : '+'} ${Math.abs(k)} = ${m}$, $x = ${x}$`],
      };
    },
  },
  {
    id: 'log-eq',
    title: 'Логарифмические уравнения',
    subject: 'math',
    grades: [10, 11],
    skill: 'logₐ(f) = m ⇔ f = aᵐ',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 6 }],
    make(r) {
      const a = pick(r, [2, 3, 5]);
      const m = int(r, 1, a === 2 ? 6 : 3);
      const k = int(r, -6, 8);
      const x = a ** m - k;
      return {
        text: `Найдите корень уравнения: log${'₀₁₂₃₄₅₆₇₈₉'[a]}(${poly([[1, 'x'], [k, '']])}) = ${m}`,
        answer: x,
        hint: `По определению логарифма: ${poly([[1, "x"], [k, ""]])} = ${a}^${m}.`,
        steps: [`$x ${k < 0 ? '-' : '+'} ${Math.abs(k)} = ${a}^{${m}} = ${a ** m}$`, `$x = ${x}$`],
      };
    },
  },
  {
    id: 'derivative',
    title: 'Производная',
    subject: 'math',
    grades: [10, 11],
    skill: 'Производная степенной функции',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 8 }],
    make(r) {
      const a = nz(r, -4, 5);
      const p = pick(r, [2, 3]);
      const b = int(r, -8, 8);
      const c = int(r, -10, 10);
      const x0 = int(r, -3, 3);
      const res = a * p * x0 ** (p - 1) + b;
      return {
        text: `Найдите значение производной функции f(x) = ${poly([[a, p === 2 ? 'x²' : 'x³'], [b, 'x'], [c, '']])} в точке x₀ = ${String(x0).replace('-', '−')}.`,
        answer: res,
        hint: `(xⁿ)′ = n·xⁿ⁻¹, производная числа — 0.`,
        steps: [`$f'(x) = ${a * p}x${p === 3 ? '^2' : ''} ${b < 0 ? '-' : '+'} ${Math.abs(b)}$`, `$f'(${x0}) = ${a * p} \\cdot ${par(x0)}${p === 3 ? '^2' : ''} ${b < 0 ? '-' : '+'} ${Math.abs(b)} = ${res}$`],
      };
    },
  },
  {
    id: 'parabola-min',
    title: 'Наименьшее значение квадратичной функции',
    subject: 'math',
    grades: [9, 11],
    skill: 'Вершина параболы: x₀ = −b / 2a',
    exams: [{ exam: 'ЕГЭ', subject: 'профильная математика', task: 12 }],
    make(r) {
      const x0 = int(r, -6, 6);
      const y0 = int(r, -15, 15);
      // y = x² − 2·x0·x + (x0² + y0)
      const b = -2 * x0;
      const c = x0 * x0 + y0;
      const askPoint = r() < 0.5;
      return {
        text: `Найдите ${askPoint ? 'точку минимума' : 'наименьшее значение'} функции y = ${poly([[1, 'x²'], [b, 'x'], [c, '']])}`,
        answer: askPoint ? x0 : y0,
        hint: 'У параболы с ветвями вверх минимум — в вершине: x₀ = −b / (2a).',
        steps: [`$x_0 = -\\frac{${b}}{2} = ${x0}$`, `$y(${x0}) = ${x0 * x0} ${b * x0 < 0 ? '-' : '+'} ${Math.abs(b * x0)} ${c < 0 ? '-' : '+'} ${Math.abs(c)} = ${y0}$`],
      };
    },
  },
];

// ─── физика ───

const PHYS: Generator[] = [
  {
    id: 'speed-units',
    title: 'Перевод скорости',
    subject: 'physics',
    grades: [7, 9],
    skill: 'км/ч ↔ м/с: делим или умножаем на 3,6',
    theory: 'physics/kinematics',
    make(r) {
      const ms = pick(r, [5, 10, 15, 20, 25, 30]);
      const toMs = r() < 0.5;
      return toMs
        ? { text: `Переведите ${n(ms * 3.6)} км/ч в метры в секунду.`, answer: ms, unit: 'м/с', hint: 'Разделите на 3,6.', steps: [`$${t(ms * 3.6)} : 3{,}6 = ${ms}$ м/с`] }
        : { text: `Переведите ${ms} м/с в километры в час.`, answer: round(ms * 3.6), unit: 'км/ч', hint: 'Умножьте на 3,6.', steps: [`$${ms} \\cdot 3{,}6 = ${t(ms * 3.6)}$ км/ч`] };
    },
  },
  {
    id: 'svt',
    title: 'Скорость, время, путь',
    subject: 'physics',
    grades: [5, 7],
    skill: 's = v · t',
    theory: 'physics/kinematics',
    make(r) {
      const v = pick(r, [4, 5, 12, 15, 40, 60, 80, 90]);
      const tt = int(r, 2, 6);
      const kind = int(r, 0, 2);
      if (kind === 0) return { text: `Велосипедист едет со скоростью ${v} км/ч. Какой путь он проедет за ${tt} ч?`, answer: v * tt, unit: 'км', hint: 's = v · t.', steps: [`$s = ${v} \\cdot ${tt} = ${v * tt}$ км`] };
      if (kind === 1) return { text: `Поезд прошёл ${v * tt} км за ${tt} ч. С какой скоростью он ехал?`, answer: v, unit: 'км/ч', hint: 'v = s / t.', steps: [`$v = \\frac{${v * tt}}{${tt}} = ${v}$ км/ч`] };
      return { text: `За сколько часов автобус проедет ${v * tt} км со скоростью ${v} км/ч?`, answer: tt, unit: 'ч', hint: 't = s / v.', steps: [`$t = \\frac{${v * tt}}{${v}} = ${tt}$ ч`] };
    },
  },
  {
    id: 'density',
    title: 'Плотность',
    subject: 'physics',
    grades: [7, 9],
    skill: 'ρ = m / V',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    theory: 'physics/density-pressure',
    make(r) {
      const [name, rho] = pick(r, [
        ['алюминия', 2700],
        ['железа', 7800],
        ['меди', 8900],
        ['воды', 1000],
        ['льда', 900],
      ] as const);
      const V = pick(r, [0.002, 0.005, 0.01, 0.02, 0.05, 0.1]);
      const m = round(rho * V);
      return {
        text: `Плотность ${name} ${rho} кг/м³. Какова масса тела объёмом ${n(V)} м³?`,
        answer: m,
        unit: 'кг',
        hint: 'm = ρ · V.',
        steps: [`$m = ${rho} \\cdot ${t(V)} = ${t(m)}$ кг`],
      };
    },
  },
  {
    id: 'pressure',
    title: 'Давление',
    subject: 'physics',
    grades: [7, 9],
    skill: 'p = F / S и давление жидкости p = ρgh',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    theory: 'physics/density-pressure',
    make(r) {
      if (r() < 0.5) {
        const F = pick(r, [200, 400, 500, 600, 800, 1000, 1200]);
        const S = pick(r, [0.02, 0.04, 0.05, 0.1, 0.2]);
        return { text: `Какое давление оказывает на пол ящик весом ${F} Н, если площадь его дна ${n(S)} м²?`, answer: round(F / S), unit: 'Па', hint: 'p = F / S.', steps: [`$p = \\frac{${F}}{${t(S)}} = ${t(F / S)}$ Па`] };
      }
      const h = pick(r, [2, 3, 5, 10, 20]);
      return { text: `Каково давление воды на глубине ${h} м? Плотность воды 1000 кг/м³, g = 10 м/с². Давление атмосферы не учитывайте.`, answer: 1000 * 10 * h, unit: 'Па', hint: 'p = ρ · g · h.', steps: [`$p = 1000 \\cdot 10 \\cdot ${h} = ${10000 * h}$ Па`] };
    },
  },
  {
    id: 'work-power',
    title: 'Работа и мощность',
    subject: 'physics',
    grades: [7, 9],
    skill: 'A = F · s, N = A / t',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      const F = pick(r, [50, 100, 150, 200, 300]);
      const s = pick(r, [2, 3, 4, 5, 10]);
      const tt = pick(r, [2, 4, 5, 10]);
      const askPower = r() < 0.5;
      const A = F * s;
      return askPower
        ? { text: `Человек поднял груз, приложив силу ${F} Н на пути ${s} м, за ${tt} с. Какую мощность он развил?`, answer: round(A / tt), unit: 'Вт', hint: 'Сначала работа A = F·s, потом N = A/t.', steps: [`$A = ${F} \\cdot ${s} = ${A}$ Дж`, `$N = \\frac{${A}}{${tt}} = ${t(A / tt)}$ Вт`] }
        : { text: `Какую работу совершает сила ${F} Н, перемещая тело на ${s} м в направлении силы?`, answer: A, unit: 'Дж', hint: 'A = F · s.', steps: [`$A = ${F} \\cdot ${s} = ${A}$ Дж`] };
    },
  },
  {
    id: 'heat',
    title: 'Количество теплоты',
    subject: 'physics',
    grades: [8, 9],
    skill: 'Q = c · m · Δt',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      const [name, c] = pick(r, [
        ['воды', 4200],
        ['алюминия', 920],
        ['меди', 400],
        ['железа', 460],
      ] as const);
      const m = pick(r, [0.5, 1, 2, 3, 5]);
      const dt = pick(r, [10, 20, 25, 40, 50]);
      const Q = c * m * dt;
      return {
        text: `Сколько теплоты (в кДж) нужно, чтобы нагреть ${n(m)} кг ${name} на ${dt} °C? Удельная теплоёмкость ${name} ${c} Дж/(кг·°C).`,
        answer: round(Q / 1000),
        unit: 'кДж',
        hint: 'Q = c·m·Δt, затем переведите джоули в килоджоули.',
        steps: [`$Q = ${c} \\cdot ${t(m)} \\cdot ${dt} = ${Q}$ Дж $= ${t(Q / 1000)}$ кДж`],
      };
    },
  },
  {
    id: 'ohm',
    title: 'Закон Ома',
    subject: 'physics',
    grades: [8, 9],
    skill: 'I = U / R',
    theory: 'physics/ohm',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      const R = pick(r, [2, 4, 5, 8, 10, 12, 20]);
      const I = pick(r, [0.5, 1, 1.5, 2, 3]);
      const U = round(I * R);
      const kind = int(r, 0, 2);
      if (kind === 0) return { text: `Напряжение на резисторе ${n(U)} В, сопротивление ${R} Ом. Найдите силу тока.`, answer: I, unit: 'А', hint: 'I = U / R.', steps: [`$I = \\frac{${t(U)}}{${R}} = ${t(I)}$ А`] };
      if (kind === 1) return { text: `Через резистор ${R} Ом течёт ток ${n(I)} А. Найдите напряжение на нём.`, answer: U, unit: 'В', hint: 'U = I · R.', steps: [`$U = ${t(I)} \\cdot ${R} = ${t(U)}$ В`] };
      return { text: `При напряжении ${n(U)} В через проводник течёт ток ${n(I)} А. Найдите сопротивление проводника.`, answer: R, unit: 'Ом', hint: 'R = U / I.', steps: [`$R = \\frac{${t(U)}}{${t(I)}} = ${R}$ Ом`] };
    },
  },
  {
    id: 'resistors',
    title: 'Соединение резисторов',
    subject: 'physics',
    grades: [8, 9],
    skill: 'Последовательно складываем, параллельно — по обратным величинам',
    theory: 'physics/ohm',
    make(r) {
      if (r() < 0.5) {
        const a = int(r, 2, 30);
        const b = int(r, 2, 30);
        return { text: `Резисторы ${a} Ом и ${b} Ом соединены последовательно. Найдите общее сопротивление.`, answer: a + b, unit: 'Ом', hint: 'R = R₁ + R₂.', steps: [`$R = ${a} + ${b} = ${a + b}$ Ом`] };
      }
      const [a, b] = pick(r, [
        [6, 3],
        [12, 6],
        [10, 10],
        [20, 5],
        [4, 12],
        [30, 15],
        [8, 8],
      ] as const);
      const R = (a * b) / (a + b);
      return { text: `Резисторы ${a} Ом и ${b} Ом соединены параллельно. Найдите общее сопротивление.`, answer: round(R), unit: 'Ом', hint: 'Для двух резисторов: R = R₁R₂ / (R₁ + R₂).', steps: [`$R = \\frac{${a} \\cdot ${b}}{${a} + ${b}} = ${t(R)}$ Ом`] };
    },
  },
  {
    id: 'electric-energy',
    title: 'Мощность и расход электроэнергии',
    subject: 'physics',
    grades: [8, 9],
    skill: 'P = U · I, A = P · t',
    theory: 'physics/ohm',
    make(r) {
      const P = pick(r, [100, 500, 1000, 1500, 2000]);
      const hours = pick(r, [0.5, 1, 2, 3, 4]);
      const price = pick(r, [5, 6, 8]);
      const kwh = round((P / 1000) * hours);
      return {
        text: `Прибор мощностью ${P} Вт работал ${n(hours)} ч. Сколько рублей стоит израсходованная энергия при тарифе ${price} ₽ за 1 кВт·ч?`,
        answer: round(kwh * price),
        unit: '₽',
        hint: 'Переведите ватты в киловатты и умножьте на время — получите кВт·ч.',
        steps: [`$A = ${t(P / 1000)}\\ \\text{кВт} \\cdot ${t(hours)}\\ \\text{ч} = ${t(kwh)}$ кВт·ч`, `$${t(kwh)} \\cdot ${price} = ${t(kwh * price)}$ ₽`],
      };
    },
  },
  {
    id: 'newton2',
    title: 'Второй закон Ньютона',
    subject: 'physics',
    grades: [9, 10],
    skill: 'F = m · a',
    theory: 'physics/newton',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      const m = pick(r, [2, 4, 5, 10, 50, 1000]);
      const a = pick(r, [0.5, 1, 2, 3, 4]);
      const askF = r() < 0.5;
      return askF
        ? { text: `Какая сила сообщает телу массой ${m} кг ускорение ${n(a)} м/с²?`, answer: round(m * a), unit: 'Н', hint: 'F = m·a.', steps: [`$F = ${m} \\cdot ${t(a)} = ${t(m * a)}$ Н`] }
        : { text: `На тело массой ${m} кг действует сила ${n(m * a)} Н. С каким ускорением движется тело?`, answer: a, unit: 'м/с²', hint: 'a = F / m.', steps: [`$a = \\frac{${t(m * a)}}{${m}} = ${t(a)}$ м/с²`] };
    },
  },
  {
    id: 'kinematics',
    title: 'Равноускоренное движение',
    subject: 'physics',
    grades: [9, 10],
    skill: 'v = v₀ + at',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    theory: 'physics/kinematics',
    make(r) {
      const v0 = pick(r, [0, 2, 4, 5, 10]);
      const a = pick(r, [1, 2, 3, 4, 5]);
      const tt = int(r, 2, 8);
      return { text: `Тело движется с начальной скоростью ${v0} м/с и ускорением ${a} м/с². Какой будет скорость через ${tt} с?`, answer: v0 + a * tt, unit: 'м/с', hint: 'v = v₀ + a·t.', steps: [`$v = ${v0} + ${a} \\cdot ${tt} = ${v0 + a * tt}$ м/с`] };
    },
  },
  {
    id: 'momentum',
    title: 'Импульс',
    subject: 'physics',
    grades: [9, 10],
    skill: 'p = m · v и закон сохранения импульса',
    theory: 'physics/energy',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      if (r() < 0.5) {
        const m = pick(r, [2, 3, 5, 10, 60]);
        const v = pick(r, [2, 3, 4, 5, 10]);
        return { text: `Найдите импульс тела массой ${m} кг, движущегося со скоростью ${v} м/с.`, answer: m * v, unit: 'кг·м/с', hint: 'p = m·v.', steps: [`$p = ${m} \\cdot ${v} = ${m * v}$ кг·м/с`] };
      }
      const m1 = pick(r, [1, 2, 3, 4]);
      const m2 = pick(r, [1, 2, 3, 4]);
      const v = pick(r, [2, 4, 6, 8, 12]);
      const exact = (m1 * v) / (m1 + m2);
      const whole = Math.abs(exact * 100 - Math.round(exact * 100)) < 1e-9;
      const u = round(exact, 2);
      return { text: `Тележка массой ${m1} кг едет со скоростью ${v} м/с и сцепляется с неподвижной тележкой массой ${m2} кг. Найдите их общую скорость.${whole ? '' : ' Ответ округлите до сотых.'}`, answer: u, unit: 'м/с', tol: 0.006, hint: 'Импульс до = импульс после: m₁v = (m₁ + m₂)u.', steps: [`$u = \\frac{${m1} \\cdot ${v}}{${m1} + ${m2}} = ${t(u)}$ м/с`] };
    },
  },
  {
    id: 'energy',
    title: 'Кинетическая и потенциальная энергия',
    subject: 'physics',
    grades: [9, 10],
    skill: 'Eк = mv²/2, Eп = mgh',
    theory: 'physics/energy',
    exams: [{ exam: 'ОГЭ', subject: 'физика', task: 0 }],
    make(r) {
      const m = pick(r, [0.5, 1, 2, 4, 5]);
      if (r() < 0.5) {
        const v = pick(r, [2, 3, 4, 6, 10]);
        return { text: `Найдите кинетическую энергию тела массой ${n(m)} кг при скорости ${v} м/с.`, answer: round((m * v * v) / 2), unit: 'Дж', hint: 'Eк = m·v²/2.', steps: [`$E_k = \\frac{${t(m)} \\cdot ${v}^2}{2} = ${t((m * v * v) / 2)}$ Дж`] };
      }
      const h = pick(r, [2, 3, 5, 10, 20]);
      return { text: `Найдите потенциальную энергию тела массой ${n(m)} кг на высоте ${h} м (g = 10 м/с²).`, answer: round(m * 10 * h), unit: 'Дж', hint: 'Eп = m·g·h.', steps: [`$E_p = ${t(m)} \\cdot 10 \\cdot ${h} = ${t(m * 10 * h)}$ Дж`] };
    },
  },
  {
    id: 'lens',
    title: 'Оптическая сила линзы',
    subject: 'physics',
    grades: [8, 11],
    skill: 'D = 1 / F, F — в метрах',
    theory: 'physics/refraction',
    make(r) {
      const F = pick(r, [0.1, 0.2, 0.25, 0.5, 1, 2]);
      return { text: `Фокусное расстояние собирающей линзы ${n(F * 100)} см. Найдите её оптическую силу в диоптриях.`, answer: round(1 / F), unit: 'дптр', hint: 'Переведите сантиметры в метры: D = 1/F.', steps: [`$F = ${t(F)}$ м, $D = \\frac{1}{${t(F)}} = ${t(1 / F)}$ дптр`] };
    },
  },
];

// ─── информатика ───

const ALPHA = ['A', 'B', 'C', 'D', 'E', 'F'];
const INF: Generator[] = [
  {
    id: 'bin-to-dec',
    title: 'Из двоичной в десятичную',
    subject: 'informatics',
    grades: [7, 11],
    skill: 'Складываем веса разрядов, где стоят единицы',
    exams: [
      { exam: 'ОГЭ', subject: 'информатика', task: 10 },
      { exam: 'ЕГЭ', subject: 'информатика', task: 14 },
    ],
    theory: 'informatics/numeral-systems',
    make(r) {
      const x = int(r, 9, 255);
      const bin = x.toString(2);
      const parts = [...bin].map((d, i) => (d === '1' ? 2 ** (bin.length - 1 - i) : 0)).filter(Boolean);
      return { text: `Переведите двоичное число ${bin} в десятичную систему.`, answer: x, hint: 'Веса разрядов справа налево: 1, 2, 4, 8, 16…', steps: [`$${parts.join(' + ')} = ${x}$`] };
    },
  },
  {
    id: 'dec-to-bin',
    title: 'Из десятичной в двоичную',
    subject: 'informatics',
    grades: [7, 11],
    skill: 'Раскладываем число по степеням двойки',
    exams: [{ exam: 'ОГЭ', subject: 'информатика', task: 10 }],
    theory: 'informatics/numeral-systems',
    make(r) {
      const x = int(r, 5, 200);
      const bin = x.toString(2);
      const parts = [...bin].map((d, i) => (d === '1' ? 2 ** (bin.length - 1 - i) : 0)).filter(Boolean);
      return { text: `Переведите число ${x} в двоичную систему счисления.`, answer: bin, kind: 'text', hint: 'Найдите наибольшую степень двойки, не больше числа, и повторяйте с остатком.', steps: [`$${x} = ${parts.join(' + ')}$`, `Ставим единицы в эти разряды: $${bin}_2$`] };
    },
  },
  {
    id: 'count-ones',
    title: 'Единицы в двоичной записи',
    subject: 'informatics',
    grades: [8, 11],
    skill: 'Число единиц — сколько степеней двойки в сумме',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 14 }],
    theory: 'informatics/numeral-systems',
    make(r) {
      const k = int(r, 4, 10);
      const variant = int(r, 0, 1);
      if (variant === 0) {
        // 2^k − 1: k единиц
        return { text: `Сколько единиц в двоичной записи числа ${2 ** k - 1}?`, answer: k, hint: `${2 ** k - 1} = ${2 ** k} − 1 = 2${sup(k)} − 1.`, steps: [`$2^{${k}} - 1 = \\underbrace{11\\dots1_2}_{${k}}$ — ${k} единиц`] };
      }
      const x = int(r, 20, 500);
      const ones = [...x.toString(2)].filter((d) => d === '1').length;
      return { text: `Сколько единиц в двоичной записи числа ${x}?`, answer: ones, hint: 'Переведите число в двоичную систему и посчитайте единицы.', steps: [`$${x} = ${x.toString(2)}_2$ — единиц: ${ones}`] };
    },
  },
  {
    id: 'hex',
    title: 'Шестнадцатеричная система',
    subject: 'informatics',
    grades: [8, 11],
    skill: 'A = 10, …, F = 15; разряд весит 16',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 14 }],
    theory: 'informatics/numeral-systems',
    make(r) {
      const x = int(r, 26, 255);
      const hex = x.toString(16).toUpperCase();
      const [h, l] = hex.length === 2 ? [hex[0]!, hex[1]!] : ['0', hex[0]!];
      return { text: `Переведите шестнадцатеричное число ${hex} в десятичную систему.`, answer: x, hint: 'Старший разряд умножаем на 16.', steps: [`$${parseInt(h, 16)} \\cdot 16 + ${parseInt(l, 16)} = ${x}$`] };
    },
  },
  {
    id: 'text-volume',
    title: 'Информационный объём текста',
    subject: 'informatics',
    grades: [7, 9],
    skill: 'Объём = число символов × бит на символ',
    exams: [{ exam: 'ОГЭ', subject: 'информатика', task: 1 }],
    theory: 'informatics/coding',
    make(r) {
      const bits = pick(r, [8, 16]);
      const chars = pick(r, [32, 48, 64, 128, 256, 512]);
      const bytes = (chars * bits) / 8;
      return {
        text: `В кодировке, где каждый символ занимает ${bits} бит, записан текст из ${chars} символов (включая пробелы). Каков его объём в байтах?`,
        answer: bytes,
        unit: 'байт',
        hint: '1 байт = 8 бит.',
        steps: [`$${chars} \\cdot ${bits} = ${chars * bits}$ бит $= ${bytes}$ байт`],
      };
    },
  },
  {
    id: 'image-volume',
    title: 'Объём растрового изображения',
    subject: 'informatics',
    grades: [7, 11],
    skill: 'Пиксели × бит на пиксель; цветов N = 2ⁱ',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 7 }],
    theory: 'informatics/coding',
    make(r) {
      const w = pick(r, [64, 128, 256, 512, 1024]);
      const h = pick(r, [64, 128, 256, 512]);
      const colors = pick(r, [2, 4, 16, 256, 65536]);
      const i = Math.log2(colors);
      const kb = (w * h * i) / 8 / 1024;
      return {
        text: `Изображение размером ${w}×${h} пикселей использует палитру из ${colors} цветов. Сколько Кбайт занимает изображение без сжатия?`,
        answer: round(kb),
        unit: 'Кбайт',
        hint: `${colors} цветов — это ${i} бит на пиксель.`,
        steps: [`$i = \\log_2 ${colors} = ${i}$ бит`, `$${w} \\cdot ${h} \\cdot ${i} = ${w * h * i}$ бит $= ${(w * h * i) / 8}$ байт $= ${t(kb)}$ Кбайт`],
      };
    },
  },
  {
    id: 'passwords',
    title: 'Объём паролей',
    subject: 'informatics',
    grades: [9, 11],
    skill: 'Бит на символ — минимальное i, что 2ⁱ ≥ N; пароль — целое число байт',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 11 }],
    theory: 'informatics/coding',
    make(r) {
      const alphabet = pick(r, [10, 12, 20, 26, 30, 33, 52, 62]);
      const len = int(r, 8, 20);
      const users = pick(r, [10, 20, 30, 50, 100]);
      const i = Math.ceil(Math.log2(alphabet));
      const perUser = Math.ceil((len * i) / 8);
      return {
        text: `Пароль состоит из ${len} символов алфавита из ${alphabet} различных символов. Каждый символ кодируется одинаковым минимально возможным числом бит, а пароль — минимально возможным целым числом байт. Сколько байт нужно, чтобы сохранить пароли ${users} пользователей?`,
        answer: perUser * users,
        unit: 'байт',
        hint: 'Найдите бит на символ, потом округлите объём пароля вверх до целых байтов.',
        steps: [`$2^{${i - 1}} < ${alphabet} \\le 2^{${i}}$, значит $${i}$ бит на символ`, `$${len} \\cdot ${i} = ${len * i}$ бит $\\to ${perUser}$ байт на пароль`, `$${perUser} \\cdot ${users} = ${perUser * users}$ байт`],
      };
    },
  },
  {
    id: 'words',
    title: 'Комбинаторика: слова из букв',
    subject: 'informatics',
    grades: [8, 11],
    skill: 'k вариантов на каждую из L позиций — kᴸ слов',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 8 }],
    make(r) {
      const k = int(r, 2, 5);
      const L = int(r, 3, 5);
      const letters = ALPHA.slice(0, k).join(', ');
      if (r() < 0.5) return { text: `Сколько различных слов длины ${L} можно составить из букв ${letters}? Буквы можно повторять.`, answer: k ** L, hint: 'На каждую позицию — любая из букв.', steps: [`$${k}^{${L}} = ${k ** L}$`] };
      const total = k ** L;
      const withoutA = (k - 1) ** L;
      return {
        text: `Сколько слов длины ${L} из букв ${letters} содержат хотя бы одну букву A? Буквы можно повторять.`,
        answer: total - withoutA,
        hint: 'Из всех слов вычтите слова совсем без A.',
        steps: [`Всего: $${k}^{${L}} = ${total}$`, `Без A: $${k - 1}^{${L}} = ${withoutA}$`, `$${total} - ${withoutA} = ${total - withoutA}$`],
      };
    },
  },
  {
    id: 'logic-value',
    title: 'Значение логического выражения',
    subject: 'informatics',
    grades: [8, 9],
    skill: 'И, ИЛИ, НЕ — по порядку',
    exams: [{ exam: 'ОГЭ', subject: 'информатика', task: 3 }],
    theory: 'informatics/logic',
    make(r) {
      const x = int(r, 1, 20);
      const a = int(r, 1, 20);
      const op = r() < 0.5 ? 'И' : 'ИЛИ';
      const p = x > a;
      const q = x % 2 === 0;
      const value = op === 'И' ? p && !q : p || !q;
      return {
        text: `Каково значение выражения НЕ (x ≤ ${a}) ${op} НЕ (x чётное) при x = ${x}? Ответ: 1 — истинно, 0 — ложно.`,
        answer: value ? 1 : 0,
        hint: 'НЕ (x ≤ a) — это то же, что x > a.',
        steps: [`$x > ${a}$ — ${p ? 'истина' : 'ложь'}; $x$ нечётное — ${!q ? 'истина' : 'ложь'}`, `${op === 'И' ? 'Оба должны быть истинны' : 'Достаточно одного истинного'}: ответ ${value ? 1 : 0}`],
      };
    },
  },
  {
    id: 'truth-count',
    title: 'Сколько наборов делают выражение истинным',
    subject: 'informatics',
    grades: [9, 11],
    skill: 'Перебор наборов значений переменных',
    exams: [{ exam: 'ЕГЭ', subject: 'информатика', task: 2 }],
    theory: 'informatics/logic',
    make(r) {
      const forms: { text: string; f: (x: boolean, y: boolean, z: boolean) => boolean }[] = [
        { text: '(x ∨ y) ∧ ¬z', f: (x, y, z) => (x || y) && !z },
        { text: 'x ∧ (y ∨ z)', f: (x, y, z) => x && (y || z) },
        { text: '(x → y) ∧ z', f: (x, y, z) => (!x || y) && z },
        { text: '¬x ∨ (y ∧ z)', f: (x, y, z) => !x || (y && z) },
        { text: '(x ≡ y) ∨ z', f: (x, y, z) => x === y || z },
        { text: '(x ∨ ¬y) ∧ (y ∨ z)', f: (x, y, z) => (x || !y) && (y || z) },
      ];
      const form = pick(r, forms);
      let count = 0;
      const rows: string[] = [];
      for (const x of [false, true]) for (const y of [false, true]) for (const z of [false, true]) if (form.f(x, y, z)) {
        count++;
        rows.push(`${+x}${+y}${+z}`);
      }
      return {
        text: `Для скольких наборов значений переменных (x, y, z) выражение ${form.text} истинно? (→ — импликация, ≡ — эквивалентность)`,
        answer: count,
        hint: 'Переберите все 8 наборов от 000 до 111.',
        steps: [`Истинно на наборах (xyz): ${rows.join(', ') || 'нет таких'} — всего ${count}`],
      };
    },
  },
  {
    id: 'python-loop',
    title: 'Python: что выведет цикл',
    subject: 'informatics',
    grades: [8, 11],
    skill: 'range(a, b) — от a до b − 1',
    theory: 'informatics/python-basics',
    make(r) {
      const a = int(r, 1, 5);
      const b = a + int(r, 3, 7);
      const step = pick(r, [1, 1, 2]);
      const mode = r() < 0.5 ? 'sum' : 'count';
      const values: number[] = [];
      for (let i = a; i < b; i += step) values.push(i);
      const code = mode === 'sum' ? `s = 0\nfor i in range(${a}, ${b}${step === 1 ? '' : `, ${step}`}):\n    s += i\nprint(s)` : `k = 0\nfor i in range(${a}, ${b}${step === 1 ? '' : `, ${step}`}):\n    if i % 2 == 0:\n        k += 1\nprint(k)`;
      const ans = mode === 'sum' ? values.reduce((x, y) => x + y, 0) : values.filter((v) => v % 2 === 0).length;
      return {
        text: `Что выведет программа?\n${code}`,
        answer: ans,
        hint: `Выпишите значения i: правая граница ${b} не входит.`,
        steps: [`$i$ = ${values.join(', ')}`, mode === 'sum' ? `Сумма: ${values.join(' + ')} = ${ans}` : `Чётных среди них: ${ans}`],
      };
    },
  },
];

export const GENERATORS: Generator[] = [...MATH, ...PHYS, ...INF];
const BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));
export const findGenerator = (id: string) => BY_ID.get(id);

/** id задачи тренажёра: g:<генератор>:<зерно> */
export const genProblemId = (genId: string, seed: number) => `g:${genId}:${seed}`;

export function parseGenId(id: string) {
  const m = /^g:([a-z0-9-]+):(\d{1,10})$/.exec(id);
  if (!m) return null;
  const gen = findGenerator(m[1]!);
  return gen ? { gen, seed: Number(m[2]) } : null;
}

/** длинный минус перед отрицательными числами в условии */
const prettyMinus = (s: string) => s.replace(/(^|[\s(=:,])-(\d)/g, '$1−$2');

export function makeProblem(genId: string, seed: number) {
  const gen = findGenerator(genId);
  if (!gen) return null;
  const p = gen.make(rngFrom(seed));
  return { gen, problem: { ...p, text: gen.subject === 'informatics' && p.text.includes('\n') ? p.text : prettyMinus(p.text), hint: prettyMinus(p.hint) } };
}

export function genAnswerText(p: GenProblem) {
  if (p.display) return p.display;
  if (typeof p.answer === 'string') return p.answer;
  return `${String(round(p.answer, 6)).replace('.', ',').replace('-', '−')}${p.unit ? ` ${p.unit}` : ''}`;
}

/** Проверка ответа тренажёра: числа — с допуском и дробями вида 3/4, строки — без пробелов и ведущих нулей. */
export function checkGen(p: GenProblem, raw: string) {
  if (typeof p.answer === 'string') {
    const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
    return norm(raw) === norm(p.answer);
  }
  const s = raw.trim().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(',', '.').replace(/[^0-9.\-+/eE]/g, '');
  let value: number;
  if (/^-?\d+(\.\d+)?\/-?\d+(\.\d+)?$/.test(s)) {
    const [a, b] = s.split('/').map(Number);
    value = b ? a! / b! : NaN;
  } else value = s === '' ? NaN : Number(s);
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - p.answer) <= (p.tol ?? 1e-6);
}
