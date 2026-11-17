import { formatDayShortMonth, isValidDateValue } from "./dates";
import type { Task } from "./types";

// «Отложено» — задачу сейчас не делаем, но и не закрываем: ждём клиента, сменился приоритет.
// Такая задача не считается ни «в работе», ни просроченной; у неё обязательны причина
// и примерная дата, до которой она отложена.
export const POSTPONED = "Отложено" as const;
// «В плане» — задача из плана на ближайшие месяцы, к которой ещё не приступили.
export const PLANNED = "В плане" as const;

// Задача отложена сама или вместе с надзадачей.
export function isPostponed(task: Task, tasks: Task[]) {
  if (task.status === POSTPONED) return true;
  return Boolean(task.parentId && tasks.find((item) => item.id === task.parentId)?.status === POSTPONED);
}

export function validatePostpone(reason: string, until: string, today: string) {
  if (!reason.trim()) return "Напишите, почему задача отложена.";
  if (!until || !isValidDateValue(until)) return "Укажите примерную дату, до которой задача отложена.";
  if (until < today) return "Дата, до которой задача отложена, не может быть в прошлом.";
  return "";
}

// Пора вернуться к задаче: дата, до которой её отложили, уже прошла.
export function isPostponeExpired(task: Task, today: string) {
  return task.status === POSTPONED && Boolean(task.postponeUntil) && task.postponeUntil! < today;
}

// Сохраняем задачу с учётом статуса «Отложено»: при откладывании запоминаем день и пишем
// комментарий с причиной (он остаётся в истории и после возврата в работу); при выходе
// из статуса убираем поля откладывания, чтобы они не висели у живой задачи.
export function withPostpone(original: Task | null, next: Task, today: string): Task {
  if (next.status !== POSTPONED) {
    const { postponeReason: _reason, postponeUntil: _until, postponedAt: _at, ...rest } = next;
    return rest;
  }
  const reason = (next.postponeReason ?? "").trim();
  const until = next.postponeUntil ?? "";
  const changed = original?.status !== POSTPONED || original.postponeReason !== reason || original.postponeUntil !== until;
  if (!changed) return { ...next, postponeReason: reason };
  const comment = "Отложено " + formatDayShortMonth(today) + " до " + formatDayShortMonth(until) + ": " + reason;
  return { ...next, postponeReason: reason, postponeUntil: until, postponedAt: today, comments: [...next.comments, comment] };
}
