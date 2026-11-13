import { describe, expect, it } from "vitest";
import { activeTasks, archiveCount, archiveGroups, archiveTask, isArchived, removeTask, restoreTask } from "./archive";
import type { Task } from "./types";

const base = { assignee: "", comments: [] as string[], status: "В работе" as const, startDate: "2026-09-01", endDate: "2026-09-30" };
const task = (id: string, parentId: string | null, extra: Partial<Task> = {}): Task => ({ ...base, id, parentId, title: id, ...extra });

describe("isArchived и activeTasks", () => {
  const tasks = [
    task("p1", null, { archivedAt: "2026-10-20" }), task("p1s1", "p1"), task("p1s2", "p1"),
    task("p2", null), task("p2s1", "p2", { archivedAt: "2026-10-25" }), task("p2s2", "p2"),
  ];

  it("спринт в архиве, если его убрали туда сам или вместе с надзадачей", () => {
    expect(tasks.filter((item) => isArchived(item, tasks)).map((item) => item.id)).toEqual(["p1", "p1s1", "p1s2", "p2s1"]);
  });
  it("активные — всё остальное", () => {
    expect(activeTasks(tasks).map((item) => item.id)).toEqual(["p2", "p2s2"]);
  });
  it("счётчик архива — только то, что убирали явно", () => {
    expect(archiveCount(tasks)).toBe(2);
  });
});

describe("archiveGroups", () => {
  it("надзадача из архива идёт со всеми спринтами, свежие — сверху", () => {
    const tasks = [
      task("p1", null, { archivedAt: "2026-10-20" }), task("p1s1", "p1", { archivedAt: "2026-10-10" }), task("p1s2", "p1"),
      task("p2", null), task("p2s1", "p2", { archivedAt: "2026-10-25" }), task("p2s2", "p2"),
      task("p3", null), task("p3s1", "p3"),
    ];
    expect(archiveGroups(tasks).map((group) => [group.parent?.id, group.archived, group.archivedAt, group.sprints.map((item) => item.id)])).toEqual([
      ["p2", false, "2026-10-25", ["p2s1"]],
      ["p1", true, "2026-10-20", ["p1s1", "p1s2"]],
    ]);
  });
  it("спринт без надзадачи попадает в группу без родителя", () => {
    const tasks = [task("lost", "gone", { archivedAt: "2026-10-01" })];
    expect(archiveGroups(tasks).map((group) => [group.parent, group.sprints.map((item) => item.id)])).toEqual([[null, ["lost"]]]);
  });
});

describe("archiveTask, restoreTask, removeTask", () => {
  const tasks = [task("p", null), task("s1", "p"), task("s2", "p", { archivedAt: "2026-10-01" })];

  it("в архив уходит только сама задача, спринты прячутся вслед за ней", () => {
    const next = archiveTask(tasks, "p", "2026-10-31");
    expect(next.map((item) => item.archivedAt)).toEqual(["2026-10-31", undefined, "2026-10-01"]);
    expect(activeTasks(next)).toEqual([]);
  });
  it("возврат надзадачи не трогает спринты, убранные в архив отдельно", () => {
    const next = restoreTask(archiveTask(tasks, "p", "2026-10-31"), "p");
    expect(activeTasks(next).map((item) => item.id)).toEqual(["p", "s1"]);
    expect("archivedAt" in next[0]).toBe(false);
  });
  it("удаление надзадачи удаляет и её спринты", () => {
    expect(removeTask(tasks, "p")).toEqual([]);
    expect(removeTask(tasks, "s2").map((item) => item.id)).toEqual(["p", "s1"]);
  });
});
