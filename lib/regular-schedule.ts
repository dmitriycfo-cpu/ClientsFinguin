import { parseDate, toISO } from "./dates";
import type { RegularRecord, RegularTask } from "./types";

// Плановые даты регулярной задачи внутри одного месяца (monthStartValue — первое число).
export function getPlannedDates(task: RegularTask, monthStartValue: string) {
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
