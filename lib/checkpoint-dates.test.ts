import { describe, expect, it } from "vitest";
import { checkpointMarks, checkpointState } from "./checkpoint-dates";
import type { Checkpoint, Task } from "./types";

const point = (code: string, patch: Partial<Checkpoint> = {}): Checkpoint => ({
  code, title: "Точка " + code, aside: "", gate: false, noteTitle: "", note: "", done: false, ...patch,
});

const sprint = (items: Checkpoint[]): Task => ({
  id: "sprint", parentId: "parent", title: "Спринт", assignee: "Анна Петрова",
  status: "В работе", startDate: "2026-10-12", endDate: "2026-10-16", comments: [],
  groups: [{ title: "", result: "", items }],
});

describe("состояние контрольной точки", () => {
  const today = "2026-10-14";

  it("без даты — без срока", () => {
    expect(checkpointState(point("Т.1"), today)).toBe("none");
  });

  it("отмеченная точка сделана, даже если срок прошёл", () => {
    expect(checkpointState(point("Т.1", { date: "2026-10-12", done: true }), today)).toBe("done");
  });

  it("неотмеченная точка с прошедшей датой просрочена", () => {
    expect(checkpointState(point("Т.1", { date: "2026-10-13" }), today)).toBe("overdue");
  });

  it("срок сегодня и в будущем", () => {
    expect(checkpointState(point("Т.1", { date: "2026-10-14" }), today)).toBe("today");
    expect(checkpointState(point("Т.1", { date: "2026-10-15" }), today)).toBe("planned");
  });

  it("испорченная дата считается отсутствующей", () => {
    expect(checkpointState(point("Т.1", { date: "2026-13-45x" }), today)).toBe("none");
  });
});

describe("ромбики контрольных точек на диаграмме", () => {
  const today = "2026-10-14";

  it("группирует точки по дням в порядке дат и пропускает точки без даты", () => {
    const marks = checkpointMarks(sprint([
      point("Т.1", { date: "2026-10-15" }),
      point("Т.2", { date: "2026-10-12", done: true }),
      point("Т.3"),
      point("Т.4", { date: "2026-10-15", done: true }),
    ]), today);
    expect(marks.map((mark) => [mark.date, mark.items.map((item) => item.code), mark.state])).toEqual([
      ["2026-10-12", ["Т.2"], "done"],
      ["2026-10-15", ["Т.1", "Т.4"], "planned"],
    ]);
  });

  it("день с просроченной точкой красный, даже если остальные сделаны", () => {
    const marks = checkpointMarks(sprint([
      point("Т.1", { date: "2026-10-13", done: true }),
      point("Т.2", { date: "2026-10-13" }),
    ]), today);
    expect(marks[0].state).toBe("overdue");
  });

  it("у задачи без чек-листа ромбиков нет", () => {
    expect(checkpointMarks({ ...sprint([]), groups: undefined }, today)).toEqual([]);
  });
});
