// Даты в приложении хранятся строками "ГГГГ-ММ-ДД" и разбираются в полдень:
// так перевод часов и часовые пояса не сдвигают день на единицу.
export function parseDate(value: string) {
  if (!value) return new Date(NaN);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function isValidDateValue(value: string) {
  return !Number.isNaN(parseDate(value).getTime());
}

// Короткий формат «ДД.ММ» — для карточек типовых задач и тостов.
// Очищенная или испорченная дата показывается прочерком, а не «NaN.NaN».
export function formatDayMonth(value: string) {
  if (!isValidDateValue(value)) return "—";
  const date = parseDate(value);
  return String(date.getDate()).padStart(2, "0") + "." + String(date.getMonth() + 1).padStart(2, "0");
}

export function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return toISO(date);
}

export function differenceInDays(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function lastDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
}

export function isLastDayOfMonth(date: Date) {
  return date.getDate() === lastDayOfMonth(date);
}

export function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

const WEEKDAY_NAMES = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

// Понедельник недели, в которую попадает дата.
export function startOfWeek(value: string) {
  const date = parseDate(value);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return toISO(date);
}

// Ближайший понедельник: сама дата, если это понедельник, иначе следующий.
export function nextMonday(value: string) {
  const date = parseDate(value);
  date.setDate(date.getDate() + (8 - date.getDay()) % 7);
  return toISO(date);
}

export function weekdayName(value: string) {
  return WEEKDAY_NAMES[parseDate(value).getDay()];
}
