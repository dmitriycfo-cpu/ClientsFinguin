import type { ShiftReason, Task, TaskShift } from "./types";

export interface ShiftReasonInfo {
  value: ShiftReason;
  label: string;
  short: string;                 // для чипа в строке диаграммы: «перенос ×3 · клиент»
  tone: "amber" | "red" | "grey";
}

export interface ShiftInput {
  reason: ShiftReason;
  holdCode: string;
  note: string;
}

export const SHIFT_REASONS: ShiftReasonInfo[] = [
  { value: "client", label: "Клиент не дал данные", short: "клиент", tone: "amber" },
  { value: "fd", label: "Не успели", short: "не успели", tone: "red" },
  { value: "priority", label: "Сменился приоритет", short: "приоритет", tone: "grey" },
  { value: "blocker", label: "Технический блокер", short: "блокер", tone: "grey" },
  { value: "other", label: "Другое", short: "другое", tone: "grey" },
];

export function shiftReasonInfo(reason: ShiftReason) {
  return SHIFT_REASONS.find((item) => item.value === reason) ?? SHIFT_REASONS[SHIFT_REASONS.length - 1];
}

// Причину спрашиваем, когда у существующей рабочей задачи срок окончания стал позже.
// Сроки надзадачи со спринтами следуют за спринтами — у неё не спрашиваем.
export function needsShiftReason(original: Task | null, next: Task, tasks: Task[]) {
  if (!original) return false;
  if (tasks.some((task) => task.parentId === original.id)) return false;
  return next.endDate > original.endDate;
}

export function validateShift(reason: ShiftReason | "", note: string) {
  if (!reason) return "Выберите причину переноса.";
  if (reason === "other" && !note.trim()) return "Для причины «Другое» напишите комментарий.";
  return "";
}

export function appendShift(original: Task, next: Task, input: ShiftInput, today: string): Task {
  const shift: TaskShift = { date: today, from: original.endDate, to: next.endDate, reason: input.reason, holdCode: input.holdCode, note: input.note.trim() };
  return { ...next, shifts: [...(original.shifts ?? []), shift] };
}

export function originalEndDate(task: Task) {
  return task.shifts?.length ? task.shifts[0].from : task.endDate;
}

// Срок задачи на прошедший день: применяем переносы, сделанные не позже него.
// Когда все переносы уже применены, отдаём текущий срок — его могли поправить и без причины.
export function endDateAt(task: Task, date: string) {
  const shifts = task.shifts ?? [];
  if (shifts.length === 0 || shifts.every((shift) => shift.date <= date)) return task.endDate;
  let end = shifts[0].from;
  for (const shift of shifts) if (shift.date <= date) end = shift.to;
  return end;
}
