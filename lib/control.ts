import { addDays, startOfWeek } from "./dates";

export type ControlItemId = "meet" | "plan" | "week" | "client" | "regular" | "reports";
export type ControlMark = "ok" | "bad";
export type ControlQuestionId = "done" | "shifts" | "plan";

// Отметки руководителя за одну неделю. Заметка к пункту живёт отдельно от отметки:
// если ✗ сняли и вернули, записанное «что делаем» не теряется.
export interface ControlWeek {
  marks: Partial<Record<ControlItemId, ControlMark>>;
  notes: Partial<Record<ControlItemId, string>>;
  answers: Partial<Record<ControlQuestionId, string>>;
}

// Понедельник недели «ГГГГ-ММ-ДД» → отметки за эту неделю.
export interface ControlData {
  weeks: Record<string, ControlWeek>;
}

export interface ControlItem {
  id: ControlItemId;
  title: string;
  where: string;
  points: string[];
  extraTitle?: string;
  extra?: string[];
}

export const CONTROL_WEEKS = 8;

export const CONTROL_ITEMS: ControlItem[] = [
  {
    id: "meet",
    title: "Встречи с клиентом",
    where: "Календарь встреч, MyMeet",
    points: [
      "Встречи недели прошли по графику клиента и отмечены в календаре как проведённые.",
      "Записи встреч загружены в MyMeet.",
      "Следующая встреча назначена: плитка «Следующая встреча» зелёная.",
    ],
  },
  {
    id: "plan",
    title: "План спринтов на 2 месяца",
    where: "Плитка «План работ на 2 месяца», дорожная карта",
    points: ["Спринты есть на текущий и следующий месяц: плитка зелёная."],
    extraTitle: "Правильный спринт",
    extra: [
      "Результат недели, который можно проверить, а не список дел.",
      "Длится неделю, максимум две.",
      "В этапе 1–2 спринта, а не 7 мелких подзадач.",
      "Мелкие действия — пункты чек-листа спринта, а не отдельные строки.",
      "У пунктов даты внутри недели, а не всё на пятницу.",
    ],
  },
  {
    id: "week",
    title: "Итоги недели",
    where: "Вкладка «Неделя» в дорожной карте",
    points: [
      "Закрыты пункты или спринты: нет плашки «Неделя без движения».",
      "У каждого переноса указаны причина и пункт, который держит.",
      "Раздел «Срок прошёл, новый срок не назначен» пуст.",
      "Спринты с двумя переносами и больше разобраны: понятно, что делаем дальше.",
      "Колонка «План на следующую неделю» заполнена.",
    ],
  },
  {
    id: "client",
    title: "Работа с клиентом",
    where: "Чек-листы спринтов",
    points: [
      "Если клиент не даёт данные, в пункте отмечены даты запросов.",
      "Без данных работа идёт дальше: результат показан с погрешностью.",
      "Договорённости с клиентом записаны в дорожной карте.",
    ],
  },
  {
    id: "regular",
    title: "Регулярные задачи",
    where: "Блок «Регулярные задачи», плитка «Закрытие месяца»",
    points: [
      "Регулярные задачи клиента заведены, в том числе закрытие месяца.",
      "Задачи недели отмечены выполненными.",
      "У просроченных задач указана причина.",
      "Прошлый месяц закрыт: плитка «Закрытие месяца» зелёная.",
    ],
  },
  {
    id: "reports",
    title: "Отчётность и решения",
    where: "Отчёты клиента, блок «Управленческие решения»",
    points: [
      "Отчётность за прошлый месяц открывается и актуальна.",
      "Остатки денег сверены с банком, расхождения объяснены.",
      "Цифры правдоподобны: не пропали статьи (аренда, реклама), нет отрицательных остатков.",
      "За последний месяц клиенту предложено хотя бы одно решение.",
    ],
  },
];

export const CONTROL_QUESTIONS: Array<{ id: ControlQuestionId; label: string }> = [
  { id: "done", label: "Что сделано за прошлую неделю?" },
  { id: "shifts", label: "Какие были переносы и почему?" },
  { id: "plan", label: "Что запланировано на эту неделю?" },
];

export const CONTROL_MEETING_RULES = [
  "Финдир показывает ответы в дорожной карте, а не рассказывает.",
  "Если карта отвечает на вопрос, его не обсуждаем и поле оставляем пустым.",
  "Время встречи уходит на пункты с ✗ и на вопрос «что делать».",
];

export function emptyWeek(): ControlWeek {
  return { marks: {}, notes: {}, answers: {} };
}

// Последние count полных недель и текущая справа, старые слева.
// Предпоследняя — прошлая полная неделя: её и проверяют; текущую можно отмечать по ходу.
export function controlWeeks(today: string, count = CONTROL_WEEKS): string[] {
  const current = startOfWeek(today);
  return Array.from({ length: count + 1 }, (_, index) => addDays(current, -7 * (count - index)));
}

// Клик по клетке: пусто → ✓ → ✗ → пусто.
export function nextMark(mark: ControlMark | undefined): ControlMark | undefined {
  if (!mark) return "ok";
  return mark === "ok" ? "bad" : undefined;
}

export function setMark(week: ControlWeek, id: ControlItemId, mark: ControlMark | undefined): ControlWeek {
  const marks = { ...week.marks };
  if (mark) marks[id] = mark;
  else delete marks[id];
  return { ...week, marks };
}

export function weekScore(week: ControlWeek | undefined) {
  const marks = Object.values(week?.marks ?? {});
  const ok = marks.filter((mark) => mark === "ok").length;
  const bad = marks.filter((mark) => mark === "bad").length;
  return { ok, bad, checked: ok + bad };
}

export function badWeeks(data: ControlData, id: ControlItemId, weeks: string[]) {
  return weeks.filter((weekStart) => data.weeks[weekStart]?.marks[id] === "bad").length;
}

const ITEM_IDS = new Set<string>(CONTROL_ITEMS.map((item) => item.id));
const QUESTION_IDS = new Set<string>(CONTROL_QUESTIONS.map((question) => question.id));
export const MAX_TEXT = 2000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickTexts(value: unknown, allowed: Set<string>) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => allowed.has(entry[0]) && typeof entry[1] === "string")
      .map(([key, text]) => [key, text.slice(0, MAX_TEXT)])
  );
}

export function isControlWeekKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value) && startOfWeek(value) === value;
}

// Неделя из запроса или из хранилища: берём только известные пункты, вопросы и отметки.
export function sanitizeControlWeek(value: unknown): ControlWeek | null {
  if (!isRecord(value)) return null;
  const marks = isRecord(value.marks)
    ? Object.fromEntries(Object.entries(value.marks).filter(([key, mark]) => ITEM_IDS.has(key) && (mark === "ok" || mark === "bad")))
    : {};
  return {
    marks: marks as ControlWeek["marks"],
    notes: pickTexts(value.notes, ITEM_IDS) as ControlWeek["notes"],
    answers: pickTexts(value.answers, QUESTION_IDS) as ControlWeek["answers"],
  };
}

export function normalizeControlData(value: unknown): ControlData {
  const weeks = isRecord(value) && isRecord(value.weeks) ? value.weeks : {};
  return {
    weeks: Object.fromEntries(
      Object.entries(weeks).flatMap(([key, week]) => {
        const clean = sanitizeControlWeek(week);
        return isControlWeekKey(key) && clean ? [[key, clean] as const] : [];
      })
    ),
  };
}
