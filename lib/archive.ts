import type { Task } from "./types";

// Задача в архиве, если её убрали туда саму или вместе с надзадачей.
export function isArchived(task: Task, tasks: Task[]) {
  if (task.archivedAt) return true;
  return Boolean(task.parentId && tasks.find((item) => item.id === task.parentId)?.archivedAt);
}

export function activeTasks(tasks: Task[]) {
  return tasks.filter((task) => !isArchived(task, tasks));
}

// Сколько раз что-то убирали в архив: спринты архивной надзадачи отдельно не считаются.
export function archiveCount(tasks: Task[]) {
  return tasks.filter((task) => task.archivedAt).length;
}

export interface ArchiveGroup {
  parent: Task | null;  // null — спринты, чья надзадача уже удалена
  archived: boolean;    // надзадача сама в архиве; иначе в группе только её архивные спринты
  archivedAt: string;   // самая свежая отправка в архив внутри группы
  sprints: Task[];
}

// Архив по надзадачам. Архивная надзадача показывается со всеми спринтами, активная —
// только со спринтами, которые убрали в архив по одному.
export function archiveGroups(tasks: Task[]): ArchiveGroup[] {
  const groups: ArchiveGroup[] = [];
  for (const parent of tasks.filter((task) => !task.parentId)) {
    const children = tasks.filter((task) => task.parentId === parent.id);
    const sprints = parent.archivedAt ? children : children.filter((task) => task.archivedAt);
    if (!parent.archivedAt && sprints.length === 0) continue;
    const latest = parent.archivedAt ?? sprints.map((task) => task.archivedAt!).sort().at(-1)!;
    groups.push({ parent, archived: Boolean(parent.archivedAt), archivedAt: latest, sprints });
  }
  const orphans = tasks.filter((task) => task.parentId && task.archivedAt && !tasks.some((parent) => parent.id === task.parentId));
  if (orphans.length > 0) groups.push({ parent: null, archived: false, archivedAt: orphans.map((task) => task.archivedAt!).sort().at(-1)!, sprints: orphans });
  return groups.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export function archiveTask(tasks: Task[], id: string, today: string) {
  return tasks.map((task) => (task.id === id ? { ...task, archivedAt: today } : task));
}

export function restoreTask(tasks: Task[], id: string) {
  return tasks.map((task) => {
    if (task.id !== id) return task;
    const { archivedAt: _archivedAt, ...rest } = task;
    return rest;
  });
}

// Надзадача удаляется вместе со всеми спринтами, в том числе архивными.
export function removeTask(tasks: Task[], id: string) {
  return tasks.filter((task) => task.id !== id && task.parentId !== id);
}
