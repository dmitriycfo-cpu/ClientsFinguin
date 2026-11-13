import type { CheckpointGroup, Task } from "./types";

export type DropPlace = "before" | "after";

// Порядок на диаграмме — это порядок в массиве задач. Надзадачи меняются местами
// с надзадачами (спринты едут следом сами), спринты — только внутри своей надзадачи.
export function canDropTask(tasks: Task[], dragId: string, targetId: string) {
  if (dragId === targetId) return false;
  const drag = tasks.find((task) => task.id === dragId);
  const target = tasks.find((task) => task.id === targetId);
  return Boolean(drag && target && drag.parentId === target.parentId);
}

function moveInList<T>(list: T[], from: number, to: number, place: DropPlace) {
  const result = list.filter((_, index) => index !== from);
  const at = result.indexOf(list[to]) + (place === "after" ? 1 : 0);
  result.splice(at, 0, list[from]);
  return result;
}

export function moveTask(tasks: Task[], dragId: string, targetId: string, place: DropPlace) {
  if (!canDropTask(tasks, dragId, targetId)) return tasks;
  return moveInList(tasks, tasks.findIndex((task) => task.id === dragId), tasks.findIndex((task) => task.id === targetId), place);
}

// Точка переезжает только внутри своей группы: группы типовых спринтов — разделы шаблона.
export function moveCheckpoint(groups: CheckpointGroup[], dragCode: string, targetCode: string, place: DropPlace) {
  if (dragCode === targetCode) return groups;
  const index = groups.findIndex((group) => group.items.some((item) => item.code === dragCode));
  const items = groups[index]?.items ?? [];
  const to = items.findIndex((item) => item.code === targetCode);
  if (to < 0) return groups;
  const moved = moveInList(items, items.findIndex((item) => item.code === dragCode), to, place);
  return groups.map((group, groupIndex) => groupIndex === index ? { ...group, items: moved } : group);
}
