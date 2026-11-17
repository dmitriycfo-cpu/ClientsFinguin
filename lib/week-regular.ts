import { addDays, parseDate, toISO } from "./dates";
import { getPlannedDates } from "./regular-schedule";
import type { RegularRecord, RegularTask } from "./types";

export type WeekRegularStatus = "Выполнено" | "С опозданием" | "Не выполнено" | "Запланировано";

export interface WeekRegularItem {
  task: RegularTask;
  parentTitle: string;
  plannedDate: string;
  record: RegularRecord | undefined;
  status: WeekRegularStatus;
  done: boolean;
}

function monthStartOf(value: string) {
  const date = parseDate(value);
  return toISO(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

// Статус одного выполнения в отчёте недели: факт есть — выполнено (вовремя или с опозданием),
// факта нет и плановая дата прошла — не выполнено, иначе — запланировано.
export function weekRegularStatus(plannedDate: string, record: RegularRecord | undefined, today: string): WeekRegularStatus {
  if (record?.actualDate) return record.actualDate <= plannedDate ? "Выполнено" : "С опозданием";
  return plannedDate < today ? "Не выполнено" : "Запланировано";
}

// Регулярные задачи, плановая дата которых попадает в неделю с понедельника weekStart.
// Неделя может захватывать два месяца, поэтому даты собираем по обоим.
export function weekRegular(regularTasks: RegularTask[], weekStart: string, today: string): WeekRegularItem[] {
  const weekEnd = addDays(weekStart, 6);
  const months = [...new Set([monthStartOf(weekStart), monthStartOf(weekEnd)])];
  const items: WeekRegularItem[] = [];
  for (const task of regularTasks) {
    const dates = [...new Set(months.flatMap((month) => getPlannedDates(task, month)))].filter((date) => date >= weekStart && date <= weekEnd);
    const parentTitle = task.parentId ? regularTasks.find((item) => item.id === task.parentId)?.title ?? "" : "";
    for (const plannedDate of dates) {
      const record = task.records[plannedDate];
      const status = weekRegularStatus(plannedDate, record, today);
      items.push({ task, parentTitle, plannedDate, record, status, done: status === "Выполнено" || status === "С опозданием" });
    }
  }
  return items.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.task.title.localeCompare(b.task.title, "ru"));
}

export function weekRegularSummary(items: WeekRegularItem[]) {
  return {
    total: items.length,
    done: items.filter((item) => item.done).length,
    missed: items.filter((item) => item.status === "Не выполнено").length,
  };
}

// Быстрая отметка из вкладки «Неделя»: выполнено — фактическая дата сегодня (если отмечают
// заранее — плановая не нужна, ставим сегодня), снятие отметки — факт очищается, примечание остаётся.
export function toggleRegularDone(task: RegularTask, plannedDate: string, today: string): RegularTask {
  const current = task.records[plannedDate] ?? { actualDate: "", note: "" };
  const actualDate = current.actualDate ? "" : today;
  return { ...task, records: { ...task.records, [plannedDate]: { ...current, actualDate } } };
}
