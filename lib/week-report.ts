import { isArchived } from "./archive";
import { addDays, differenceInDays, parseDate, startOfWeek } from "./dates";
import { plural } from "./plural";
import { isTaskCompleted, isWorkTask } from "./roadmap-pulse";
import { isPostponed } from "./postpone";
import { endDateAt } from "./task-shifts";
import { checkpointDate } from "./checkpoint-dates";
import { getPlannedDates, occurrenceStatus, type RegularStatus } from "./regular-schedule";
import { taskCheckpoints } from "./typical-tasks";
import type { Checkpoint, RegularRecord, RegularTask, Task, TaskShift } from "./types";

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
  postponed: Array<{ task: Task; isNew: boolean }>;
  noMovement: boolean;
}

const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Отчёт за неделю с понедельника weekStart. Для текущей недели состояние берётся на сегодня,
// для прошлых — на воскресенье той недели, со сроками, восстановленными по истории переносов.
// Архивные задачи остаются в сделанном и переносах, но не в просрочках и планах.
export function weekReport(tasks: Task[], weekStart: string, today: string): WeekReport {
  const weekEnd = addDays(weekStart, 6);
  const asOf = weekEnd < today ? weekEnd : today;
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(weekStart, 13);
  const inWeek = (date?: string) => Boolean(date) && date! >= weekStart && date! <= weekEnd;
  const work = tasks.filter((task) => isWorkTask(task, tasks));
  const notArchived = work.filter((task) => !isArchived(task, tasks));
  const live = notArchived.filter((task) => !isPostponed(task, tasks));

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

  const stuck = live
    .filter((task) => !isTaskCompleted(task, asOf) && task.startDate <= asOf && endDateAt(task, asOf) < asOf)
    .map((task) => {
      const endDate = endDateAt(task, asOf);
      return { task, endDate, daysLate: differenceInDays(endDate, asOf), openItems: taskCheckpoints(task).filter((item) => !item.done) };
    });

  // План привязан к датам следующей недели. Спринт, который на ней идёт, — с открытыми пунктами
  // без даты и с датой не позже конца недели (просроченные тоже). Из остальных спринтов — только
  // пункты с плановой датой на следующей неделе. Пункты на более поздние недели ждут своей недели.
  const next = live
    .filter((task) => !isTaskCompleted(task))
    .map((task) => {
      const running = task.startDate <= nextEnd && task.endDate >= nextStart;
      const open = taskCheckpoints(task).filter((item) => !item.done);
      const dated = open
        .filter((item) => checkpointDate(item) && checkpointDate(item) <= nextEnd && (running || checkpointDate(item) >= nextStart))
        .sort((a, b) => checkpointDate(a).localeCompare(checkpointDate(b)));
      const undated = running ? open.filter((item) => !checkpointDate(item)) : [];
      const sortKey = [running ? (task.startDate > nextStart ? task.startDate : nextStart) : "", dated[0] ? checkpointDate(dated[0]) : ""]
        .filter(Boolean).sort()[0] ?? task.startDate;
      return { task, items: [...dated, ...undated], running, sortKey };
    })
    .filter((entry) => entry.running || entry.items.length > 0)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ task, items }) => ({ task, items }));

  // Отложенные — сами задачи со статусом «Отложено» (спринты отложенной надзадачи не дублируем).
  const postponed = tasks
    .filter((task) => task.status === "Отложено" && !isArchived(task, tasks))
    .map((task) => ({ task, isNew: inWeek(task.postponedAt) }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || (a.task.postponeUntil ?? "").localeCompare(b.task.postponeUntil ?? ""));

  const doneCount = done.reduce((count, group) => count + group.items.length, 0);
  const closedCount = done.filter((group) => group.closed).length;
  return {
    weekStart, weekEnd, nextStart,
    isCurrent: weekStart === startOfWeek(today),
    done, doneCount, closedCount, shifts, stuck, next, postponed,
    noMovement: doneCount === 0 && closedCount === 0 && shifts.length === 0 && !postponed.some((entry) => entry.isNew),
  };
}

export interface RegularOccurrence {
  task: RegularTask;
  parent?: RegularTask;
  date: string;
  record?: RegularRecord;
  status: WeekRegularStatus;
}

// «Не сделано» — отметка стоит, но после конца недели: на той неделе повтор не выполнен.
export type WeekRegularStatus = RegularStatus | "Не сделано";

export interface RegularWeek {
  week: RegularOccurrence[];
  next: RegularOccurrence[];
  doneCount: number;
  // Не сделано в срок: просрочено или выполнено позже плана.
  missedCount: number;
}

function regularOccurrences(regularTasks: RegularTask[], from: string, to: string, today: string): RegularOccurrence[] {
  const months = new Set([from, to].map((date) => date.slice(0, 8) + "01"));
  const todayDate = parseDate(today);
  return regularTasks
    .flatMap((task) => [...months].flatMap((month) => getPlannedDates(task, month)).filter((date) => date >= from && date <= to).map((date) => ({
      task,
      parent: task.parentId ? regularTasks.find((item) => item.id === task.parentId) : undefined,
      date,
      record: task.records[date],
      status: (task.records[date]?.actualDate ?? "") > to ? "Не сделано" as const : occurrenceStatus(date, task.records[date], todayDate),
    })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Повторы регулярных задач на неделе и на следующей. Отметка хранит фактическую дату, поэтому
// статус считается на конец недели: сделанное после неё на этой неделе не засчитывается.
export function regularWeek(regularTasks: RegularTask[], weekStart: string, today: string): RegularWeek {
  const week = regularOccurrences(regularTasks, weekStart, addDays(weekStart, 6), today);
  const next = regularOccurrences(regularTasks, addDays(weekStart, 7), addDays(weekStart, 13), today);
  return {
    week,
    next,
    doneCount: week.filter((item) => item.status === "Выполнено" || item.status === "С опозданием").length,
    missedCount: week.filter((item) => item.status === "Просрочено" || item.status === "С опозданием" || item.status === "Не сделано").length,
  };
}

// Галочка на вкладке «Неделя»: ставит фактическую дату «сегодня» или снимает её; примечание не трогаем.
export function toggleRegularOccurrence(task: RegularTask, date: string, today: string): RegularTask {
  const record = task.records[date] ?? { actualDate: "", note: "" };
  return { ...task, records: { ...task.records, [date]: { ...record, actualDate: record.actualDate ? "" : today } } };
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
