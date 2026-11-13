import { describe, expect, it } from "vitest";
import { canDropTask, moveCheckpoint, moveTask } from "./reorder";
import type { Checkpoint, CheckpointGroup, Task } from "./types";

const base = { assignee: "", comments: [] as string[], status: "В работе" as const, startDate: "2026-09-01", endDate: "2026-09-30" };
const task = (id: string, parentId: string | null): Task => ({ ...base, id, parentId, title: id });
const ids = (tasks: Task[]) => tasks.map((item) => item.id);

const tasks = [task("p1", null), task("p1s1", "p1"), task("p1s2", "p1"), task("p2", null), task("p2s1", "p2"), task("p3", null), task("p1s3", "p1")];

describe("canDropTask", () => {
  it("надзадачу можно бросить только на надзадачу", () => {
    expect(canDropTask(tasks, "p1", "p3")).toBe(true);
    expect(canDropTask(tasks, "p1", "p2s1")).toBe(false);
  });
  it("спринт — только на спринт своей надзадачи", () => {
    expect(canDropTask(tasks, "p1s1", "p1s3")).toBe(true);
    expect(canDropTask(tasks, "p1s1", "p2s1")).toBe(false);
    expect(canDropTask(tasks, "p1s1", "p1")).toBe(false);
  });
  it("на себя бросить нельзя", () => {
    expect(canDropTask(tasks, "p1", "p1")).toBe(false);
  });
});

describe("moveTask", () => {
  it("ставит надзадачу перед другой", () => {
    expect(ids(moveTask(tasks, "p3", "p1", "before"))).toEqual(["p3", "p1", "p1s1", "p1s2", "p2", "p2s1", "p1s3"]);
  });
  it("ставит надзадачу после другой", () => {
    expect(ids(moveTask(tasks, "p1", "p2", "after"))).toEqual(["p1s1", "p1s2", "p2", "p1", "p2s1", "p3", "p1s3"]);
  });
  it("переставляет спринты внутри надзадачи", () => {
    expect(ids(moveTask(tasks, "p1s3", "p1s1", "before"))).toEqual(["p1", "p1s3", "p1s1", "p1s2", "p2", "p2s1", "p3"]);
    expect(ids(moveTask(tasks, "p1s1", "p1s2", "after"))).toEqual(["p1", "p1s2", "p1s1", "p2", "p2s1", "p3", "p1s3"]);
  });
  it("недопустимый перенос ничего не меняет", () => {
    expect(moveTask(tasks, "p1s1", "p2s1", "before")).toBe(tasks);
    expect(moveTask(tasks, "p1", "missing", "before")).toBe(tasks);
  });
});

const point = (code: string): Checkpoint => ({ code, title: code, aside: "", gate: false, noteTitle: "", note: "", done: false });
const groups: CheckpointGroup[] = [
  { title: "А", result: "", items: [point("a1"), point("a2"), point("a3")] },
  { title: "Б", result: "", items: [point("b1"), point("b2")] },
];
const codes = (list: CheckpointGroup[]) => list.map((group) => group.items.map((item) => item.code));

describe("moveCheckpoint", () => {
  it("переставляет точку внутри группы", () => {
    expect(codes(moveCheckpoint(groups, "a3", "a1", "before"))).toEqual([["a3", "a1", "a2"], ["b1", "b2"]]);
    expect(codes(moveCheckpoint(groups, "a1", "a2", "after"))).toEqual([["a2", "a1", "a3"], ["b1", "b2"]]);
  });
  it("между группами не переносит", () => {
    expect(moveCheckpoint(groups, "a1", "b1", "before")).toBe(groups);
  });
});
