import { addDays, differenceInDays, parseDate, startOfWeek } from "./dates";
import { plural } from "./plural";
import { isTaskCompleted, isWorkTask } from "./roadmap-pulse";
import { endDateAt } from "./task-shifts";
import { taskCheckpoints } from "./typical-tasks";
import type { Checkpoint, Task, TaskShift } from "./types";

export interface WeekReport {
  weekStart: string;
  weekEnd: string;
  nextStart: string;
  isCurrent: boolean;
  done: Array<{ task: Task; items: Checkpoint[]; closed: boolean }>;
  doneCount: number;
  closedCount: number;
  shifts: Array<{ task: Task; shift: TaskShift; index: number; total: number }>;
  stuck: Array<{ task: Task; endDate: string; daysLate: number; openItems: Checkpoint[] }>;
  next: Array<{ task: Task; items: Checkpoint[] }>;
  noMovement: boolean;
}

const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Отчёт за неделю с понедельника weekStart. Для текущей недели состояние берётся на сегодня,
// для прошлых — на воскресенье той недели, со сроками, восстановленными по истории переносов.
export function weekReport(tasks: Task[], weekStart: string, today: string): WeekReport {
  const weekEnd = addDays(weekStart, 6);
  const asOf = weekEnd < today ? weekEnd : today;
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(weekStart, 13);
  const inWeek = (date?: string) => Boolean(date) && date! >= weekStart && date! <= weekEnd;
  const work = tasks.filter((task) => isWorkTask(task, tasks));

  const done = work
    .map((task) => ({
      task,
      items: taskCheckpoints(task).filter((item) => item.done && inWeek(item.doneAt)).sort((a, b) => a.doneAt!.localeCompare(b.doneAt!)),
      closed: task.status === "Завершено" && inWeek(task.completedAt),
    }))
    .filter((group) => group.items.length > 0 || group.closed);

  const shifts = work
    .flatMap((task) => (task.shifts ?? []).map((shift, index) => ({ task, shift, index, total: task.shifts!.length })))
    .filter((entry) => inWeek(entry.shift.date))
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date));

  const stuck = work
    .filter((task) => !isTaskCompleted(task, asOf) && task.startDate <= asOf && endDateAt(task, asOf) < asOf)
    .map((task) => {
      const endDate = endDateAt(task, asOf);
      return { task, endDate, daysLate: differenceInDays(endDate, asOf), openItems: taskCheckpoints(task).filter((item) => !item.done) };
    });

  const next = work
    .filter((task) => !isTaskCompleted(task) && task.startDate <= nextEnd && task.endDate >= nextStart)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((task) => {
      const open = taskCheckpoints(task).filter((item) => !item.done);
      const dated = open.filter((item) => item.date && item.date >= nextStart && item.date <= nextEnd).sort((a, b) => a.date!.localeCompare(b.date!));
      return { task, items: [...dated, ...open.filter((item) => !dated.includes(item))] };
    });

  const doneCount = done.reduce((count, group) => count + group.items.length, 0);
  const closedCount = done.filter((group) => group.closed).length;
  return {
    weekStart, weekEnd, nextStart,
    isCurrent: weekStart === startOfWeek(today),
    done, doneCount, closedCount, shifts, stuck, next,
    noMovement: doneCount === 0 && closedCount === 0 && shifts.length === 0,
  };
}

export function weekBounds(tasks: Task[], today: string) {
  const last = startOfWeek(today);
  const earliest = tasks.map((task) => task.startDate).filter(Boolean).sort()[0];
  const first = earliest ? startOfWeek(earliest) : last;
  return { first: first < last ? first : last, last };
}

export function formatWeekRange(weekStart: string) {
  const start = parseDate(weekStart);
  const end = parseDate(addDays(weekStart, 6));
  return start.getMonth() === end.getMonth()
    ? start.getDate() + "–" + end.getDate() + " " + MONTHS_GENITIVE[end.getMonth()]
    : start.getDate() + " " + MONTHS_GENITIVE[start.getMonth()] + " – " + end.getDate() + " " + MONTHS_GENITIVE[end.getMonth()];
}

export function weekAgeLabel(weekStart: string, today: string) {
  const weeks = Math.round(differenceInDays(weekStart, startOfWeek(today)) / 7);
  return weeks <= 0 ? "текущая неделя" : weeks + " " + plural(weeks, "неделю", "недели", "недель") + " назад";
}
