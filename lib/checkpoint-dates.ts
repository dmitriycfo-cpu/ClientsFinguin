import { isValidDateValue } from "./dates";
import type { Checkpoint, Task } from "./types";
import { taskCheckpoints } from "./typical-tasks";

export type CheckpointState = "done" | "overdue" | "today" | "planned" | "none";

export interface CheckpointMark {
  date: string;
  items: Checkpoint[];
  state: "done" | "overdue" | "planned";
}

// Срок точки годится, только если это настоящая дата «ГГГГ-ММ-ДД»: иначе точку не на что ставить.
export function checkpointDate(item: Checkpoint) {
  return item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && isValidDateValue(item.date) ? item.date : "";
}

// Даты «ГГГГ-ММ-ДД» сравниваются как строки. Отмеченная точка сделана, даже если срок прошёл.
export function checkpointState(item: Checkpoint, today: string): CheckpointState {
  if (item.done) return "done";
  const date = checkpointDate(item);
  if (!date) return "none";
  return date < today ? "overdue" : date === today ? "today" : "planned";
}

// Ромбики на полосе спринта: один на день. Цвет — самое тревожное состояние из точек дня.
export function checkpointMarks(task: Task, today: string): CheckpointMark[] {
  const byDate = new Map<string, Checkpoint[]>();
  for (const item of taskCheckpoints(task)) {
    const date = checkpointDate(item);
    if (date) byDate.set(date, [...(byDate.get(date) ?? []), item]);
  }
  return [...byDate.keys()].sort().map((date) => {
    const items = byDate.get(date)!;
    const state = items.some((item) => checkpointState(item, today) === "overdue") ? "overdue" : items.every((item) => item.done) ? "done" : "planned";
    return { date, items, state };
  });
}
