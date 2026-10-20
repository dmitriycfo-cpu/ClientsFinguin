import { isWaitingClient } from "./checkpoint-tracking";
import { isValidDateValue, parseDate, toISO } from "./dates";
import { getPlannedDates, occurrenceStatus } from "./regular-schedule";
import { taskCheckpoints } from "./typical-tasks";
import type { RegularTask, Task } from "./types";

// Рабочая задача — спринт или задача без спринтов. Надзадача со спринтами только группирует их.
export function isWorkTask(task: Task, tasks: Task[]) {
  return Boolean(task.parentId) || !tasks.some((child) => child.parentId === task.id);
}

// Завершена ли задача к дню at. Без at — сейчас. Задачи, завершённые до появления
// completedAt, считаются завершёнными всегда.
export function isTaskCompleted(task: Task, at?: string) {
  if (task.status !== "Завершено") return false;
  return !at || !task.completedAt || task.completedAt <= at;
}

export function isTaskLate(task: Task, today: string) {
  return !isTaskCompleted(task) && (task.status === "Просрочено" || task.endDate < today);
}

export function sprintHealth(tasks: Task[], today: string) {
  const current = tasks.filter((task) => isWorkTask(task, tasks) && !isTaskCompleted(task) && task.startDate <= today);
  const overdue = current.filter((task) => isTaskLate(task, today));
  const shifted = current.filter((task) => !isTaskLate(task, today) && (task.shifts?.length ?? 0) > 0);
  return { current: current.length, overdue: overdue.length, shifted: shifted.length };
}

export function parentSummary(parent: Task, tasks: Task[], today: string) {
  const sprints = tasks.filter((task) => task.parentId === parent.id);
  const open = sprints.filter((task) => !isTaskCompleted(task));
  return {
    total: sprints.length,
    closed: sprints.length - open.length,
    overdue: open.filter((task) => isTaskLate(task, today)).length,
    shifted: open.filter((task) => !isTaskLate(task, today) && (task.shifts?.length ?? 0) > 0).length,
    waiting: open.reduce((count, task) => count + taskCheckpoints(task).filter(isWaitingClient).length, 0),
  };
}

export type MonthClosing =
  | { state: "none" }
  | { state: "late"; month: number; done: number; total: number; late: Array<{ title: string; plannedDate: string; note: string }> }
  | { state: "pending"; month: number; done: number; total: number; nextDate: string }
  | { state: "ok"; month: number; total: number };

// Какой месяц закрывает плановая дата: первая половина месяца закрывает прошлый
// (5 октября — сентябрь), вторая — текущий (28 сентября — сентябрь).
export function closedMonthOf(plannedDate: string) {
  const date = parseDate(plannedDate);
  return date.getDate() <= 15 ? (date.getMonth() + 11) % 12 : date.getMonth();
}

// Прошлый месяц закрыт, только когда выполнены все ежемесячные регулярные задачи
// (надзадачи и подэтапы), чьи даты его закрывают.
export function monthClosing(regularTasks: RegularTask[], today: string): MonthClosing {
  const monthly = regularTasks.filter((task) => task.frequency === "monthly");
  const now = parseDate(today);
  const target = (now.getMonth() + 11) % 12;
  const months = [
    toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)),
    toISO(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
  ];
  const items = monthly
    .flatMap((task) => months.flatMap((month) => getPlannedDates(task, month)
      .filter((date) => closedMonthOf(date) === target)
      .map((date) => ({ task, date, status: occurrenceStatus(date, task.records[date], now) }))))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (items.length === 0) return { state: "none" };

  const total = items.length;
  const done = items.filter((item) => item.status === "Выполнено" || item.status === "С опозданием").length;
  const late = items.filter((item) => item.status === "Просрочено");
  if (late.length > 0) {
    return { state: "late", month: target, done, total, late: late.map((item) => ({ title: item.task.title, plannedDate: item.date, note: item.task.records[item.date]?.note.trim() ?? "" })) };
  }
  if (done < total) {
    return { state: "pending", month: target, done, total, nextDate: items.find((item) => item.status === "Запланировано")!.date };
  }
  return { state: "ok", month: target, total };
}

// Ключ закрываемого месяца — прошлого относительно сегодня, «ГГГГ-ММ».
export function closingMonthKey(today: string) {
  const now = parseDate(today);
  return toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)).slice(0, 7);
}

export function closingDateError(date: string, monthKey: string, today: string) {
  if (!date || !isValidDateValue(date)) return "Укажите дату закрытия.";
  if (date > today) return "Дата закрытия не может быть позже сегодняшнего дня.";
  if (date < monthKey + "-01") return "Месяц не может быть закрыт раньше, чем начался.";
  return "";
}
