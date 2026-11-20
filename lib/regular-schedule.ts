import { parseDate, toISO } from "./dates";
import type { RegularRecord, RegularTask } from "./types";

export interface RegularOccurrence {
  scheduled: string;    // дата по расписанию — ключ исключения
  date: string | null;  // плановая дата с учётом переноса; null — повтор убран
}

// Повторы месяца с учётом переносов и удалений. Перенос возможен только внутри месяца,
// поэтому повтор всегда остаётся в том месяце, куда его поставило расписание.
export function getOccurrences(task: RegularTask, monthStartValue: string): RegularOccurrence[] {
  return getScheduledDates(task, monthStartValue)
    .map((scheduled) => {
      const override = task.overrides?.[scheduled];
      return { scheduled, date: override === undefined ? scheduled : override || null };
    })
    .sort((a, b) => (a.date ?? a.scheduled).localeCompare(b.date ?? b.scheduled));
}

// Плановые даты месяца без убранных повторов.
export function getPlannedDates(task: RegularTask, monthStartValue: string) {
  return getOccurrences(task, monthStartValue).flatMap((occurrence) => occurrence.date ? [occurrence.date] : []);
}

function monthStartOf(date: string) {
  return date.slice(0, 8) + "01";
}

function currentDate(task: RegularTask, scheduled: string) {
  const override = task.overrides?.[scheduled];
  return override === undefined ? scheduled : override;
}

// Переписывает исключение повтора и переносит факт с примечанием на новую дату.
function setOccurrenceDate(task: RegularTask, scheduled: string, nextKey: string, override: string | undefined): RegularTask {
  const previousKey = currentDate(task, scheduled) || scheduled;
  const records = { ...task.records };
  if (previousKey !== nextKey && records[previousKey]) {
    records[nextKey] = records[previousKey];
    delete records[previousKey];
  }
  const overrides = { ...task.overrides };
  if (override === undefined) delete overrides[scheduled];
  else overrides[scheduled] = override;
  return { ...task, records, overrides };
}

// Перенос одного повтора на другой день того же месяца. Занятый другим повтором день
// или другой месяц не принимаются — задача возвращается без изменений.
export function moveOccurrence(task: RegularTask, scheduled: string, date: string): RegularTask {
  const monthStart = monthStartOf(scheduled);
  if (!date || monthStartOf(date) !== monthStart) return task;
  const taken = getOccurrences(task, monthStart).some((occurrence) => occurrence.scheduled !== scheduled && occurrence.date === date);
  if (taken) return task;
  return setOccurrenceDate(task, scheduled, date, date === scheduled ? undefined : date);
}

// Повтор убирается из плана; факт и примечание остаются на дате расписания до возврата.
export function removeOccurrence(task: RegularTask, scheduled: string): RegularTask {
  return setOccurrenceDate(task, scheduled, scheduled, "");
}

export function restoreOccurrence(task: RegularTask, scheduled: string): RegularTask {
  const restored = setOccurrenceDate(task, scheduled, scheduled, undefined);
  const taken = getOccurrences(task, monthStartOf(scheduled)).some((occurrence) => occurrence.scheduled !== scheduled && occurrence.date === scheduled);
  return taken ? task : restored;
}

// Даты по расписанию внутри одного месяца (monthStartValue — первое число), без исключений.
function getScheduledDates(task: RegularTask, monthStartValue: string) {
  const anchor = parseDate(task.anchorDate);
  const monthStart = parseDate(monthStartValue);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(monthStart.getTime())) return [];
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);
  if (anchor > monthEnd) return [];

  if (task.frequency === "weekly") {
    const cursor = new Date(anchor);
    if (cursor < monthStart) {
      const days = Math.ceil((monthStart.getTime() - cursor.getTime()) / 86400000);
      cursor.setDate(cursor.getDate() + Math.ceil(days / 7) * 7);
    }
    const dates: string[] = [];
    while (cursor <= monthEnd) {
      dates.push(toISO(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  const anchorMonth = anchor.getFullYear() * 12 + anchor.getMonth();
  const targetMonth = monthStart.getFullYear() * 12 + monthStart.getMonth();
  const monthDifference = targetMonth - anchorMonth;
  if (monthDifference < 0 || (task.frequency === "quarterly" && monthDifference % 3 !== 0)) return [];
  const plannedDay = Math.min(anchor.getDate(), monthEnd.getDate());
  return [toISO(new Date(monthStart.getFullYear(), monthStart.getMonth(), plannedDay, 12))];
}

export type RegularStatus = "Выполнено" | "С опозданием" | "Просрочено" | "Запланировано" | "Частично";

export function occurrenceStatus(plannedDate: string, record: RegularRecord | undefined, today: Date): RegularStatus {
  if (record?.actualDate) return record.actualDate <= plannedDate ? "Выполнено" : "С опозданием";
  return parseDate(plannedDate) < today ? "Просрочено" : "Запланировано";
}

export function regularMonthStatus(task: RegularTask, monthStart: string, today: Date): RegularStatus | null {
  const plannedDates = getPlannedDates(task, monthStart);
  if (plannedDates.length === 0) return null;
  const statuses = plannedDates.map((date) => occurrenceStatus(date, task.records[date], today));
  if (statuses.includes("Просрочено")) return "Просрочено";
  if (statuses.every((status) => status === "Выполнено")) return "Выполнено";
  if (statuses.every((status) => status === "Выполнено" || status === "С опозданием")) return "С опозданием";
  if (statuses.some((status) => status === "Выполнено" || status === "С опозданием")) return "Частично";
  return "Запланировано";
}

export function regularStatusClass(status: RegularStatus) {
  if (status === "Выполнено") return "regular-status regular-status-done";
  if (status === "Просрочено") return "regular-status regular-status-overdue";
  if (status === "С опозданием") return "regular-status regular-status-late";
  if (status === "Частично") return "regular-status regular-status-partial";
  return "regular-status regular-status-planned";
}
