import { isValidDateValue } from "./dates";
import type { Checkpoint, Task } from "./types";

// Отметка «сделано» запоминает день: по нему строится отчёт недели.
// Повторная отметка уже сделанной точки день не переписывает.
export function setCheckpointDone(item: Checkpoint, done: boolean, today: string): Checkpoint {
  if (!done) return { ...item, done: false, doneAt: undefined };
  return { ...item, done: true, doneAt: item.done && item.doneAt ? item.doneAt : today };
}

// Запросы клиенту — дни по возрастанию, без повторов. Запрос можно отметить задним числом,
// исправить его день или удалить, если он записан по ошибке.
function withRequests(item: Checkpoint, requests: string[]): Checkpoint {
  return { ...item, requests: [...new Set(requests)].sort() };
}

export function addClientRequest(item: Checkpoint, date: string): Checkpoint {
  return withRequests(item, [...(item.requests ?? []), date]);
}

export function changeClientRequest(item: Checkpoint, from: string, to: string): Checkpoint {
  return withRequests(item, (item.requests ?? []).map((date) => date === from ? to : date));
}

export function removeClientRequest(item: Checkpoint, date: string): Checkpoint {
  return withRequests(item, (item.requests ?? []).filter((value) => value !== date));
}

// replacing — день правимого запроса: совпадение с ним самим повтором не считается.
export function requestDateError(item: Checkpoint, date: string, today: string, replacing?: string) {
  if (!date || !isValidDateValue(date)) return "Укажите дату запроса.";
  if (date > today) return "Дата запроса не может быть позже сегодняшнего дня.";
  if ((item.requests ?? []).some((value) => value === date && value !== replacing)) return "Запрос на эту дату уже есть.";
  return "";
}

export function isWaitingClient(item: Checkpoint) {
  return !item.done && (item.requests?.length ?? 0) > 0;
}

// День завершения ставится при переходе в «Завершено» и стирается при выходе из него.
// У задач, завершённых до появления поля, день не придумываем — иначе они попали бы
// в отчёт текущей недели.
export function withCompletion(original: Task | null, next: Task, today: string): Task {
  if (next.status !== "Завершено") return { ...next, completedAt: undefined };
  if (original?.status === "Завершено") return { ...next, completedAt: original.completedAt };
  return { ...next, completedAt: today };
}
