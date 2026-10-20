import { parseDate, toISO } from "./dates";
import { checkpointDate } from "./checkpoint-dates";
import { getPlannedDates, occurrenceStatus } from "./regular-schedule";
import type { DashboardData, RegularFrequency } from "./types";

export type CalendarTaskSource = "gantt" | "regular" | "checkpoint";

// Задача в календаре: одна отметка на один день. Источник задаёт, как она открывается.
export interface CalendarTask {
  key: string;
  source: CalendarTaskSource;
  date: string;
  title: string;
  assignee: string;
  status: string;
  // Задача Ганта или спринт, к которому относится контрольная точка; регулярная задача.
  taskId: string;
  // Надзадача — для задачи Ганта; спринт — для контрольной точки.
  context: string;
  frequency?: RegularFrequency;
  actualDate?: string;
  code?: string;
  gate?: boolean;
  done?: boolean;
}

export type CalendarBucket = "plan" | "done" | "overdue";

export function calendarBucket(status: string): CalendarBucket {
  if (status === "Просрочено") return "overdue";
  if (status === "Завершено" || status === "Выполнено" || status === "С опозданием") return "done";
  return "plan";
}

function monthStartsBetween(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  const result: string[] = [];
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return result;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  while (cursor <= end) {
    result.push(toISO(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

// Все задачи с датой в промежутке [from, to]: сроки задач Ганта, плановые даты регулярных
// задач и сроки контрольных точек. Статусы считаются на день today.
export function collectCalendarTasks(
  data: Pick<DashboardData, "tasks" | "regularTasks">,
  from: string,
  to: string,
  todayKey: string,
): CalendarTask[] {
  const today = parseDate(todayKey);
  const inRange = (date: string) => Boolean(date) && date >= from && date <= to;
  const result: CalendarTask[] = [];

  for (const task of data.tasks) {
    const parent = task.parentId ? data.tasks.find((item) => item.id === task.parentId) : undefined;
    // Срок надзадачи обычно совпадает со сроком последнего спринта — второй раз его не ставим.
    const children = data.tasks.filter((item) => item.parentId === task.id);
    const repeatsChild = children.some((child) => child.endDate === task.endDate);
    if (inRange(task.endDate) && !repeatsChild) {
      const overdue = task.status !== "Завершено" && (task.status === "Просрочено" || task.endDate < todayKey);
      result.push({
        key: "gantt:" + task.id,
        source: "gantt",
        date: task.endDate,
        title: task.title,
        assignee: task.assignee,
        status: overdue ? "Просрочено" : task.status,
        taskId: task.id,
        context: parent ? parent.title + (task.template?.subCode ? " · спринт " + task.template.subCode : "") : "",
      });
    }

    for (const item of (task.groups ?? []).flatMap((group) => group.items)) {
      const date = checkpointDate(item) || task.endDate;
      if (!inRange(date)) continue;
      result.push({
        key: "checkpoint:" + task.id + ":" + item.code,
        source: "checkpoint",
        date,
        title: item.title,
        assignee: item.assignee || task.assignee,
        status: item.done ? "Выполнено" : date < todayKey ? "Просрочено" : "Не выполнено",
        taskId: task.id,
        context: (task.template?.subCode ? task.template.subCode + " · " : "") + task.title,
        code: item.code,
        gate: item.gate,
        done: item.done,
      });
    }
  }

  const months = monthStartsBetween(from, to);
  for (const task of data.regularTasks) {
    for (const month of months) {
      for (const date of getPlannedDates(task, month)) {
        if (!inRange(date)) continue;
        const record = task.records[date];
        result.push({
          key: "regular:" + task.id + ":" + date,
          source: "regular",
          date,
          title: task.title,
          assignee: task.assignee,
          status: occurrenceStatus(date, record, today),
          taskId: task.id,
          context: "",
          frequency: task.frequency,
          actualDate: record?.actualDate || "",
        });
      }
    }
  }

  return result;
}
