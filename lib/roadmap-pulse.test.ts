import { describe, expect, it } from "vitest";
import { closedMonthOf, closingDateError, closingMonthKey, isTaskCompleted, isWorkTask, monthClosing, parentSummary, sprintHealth } from "./roadmap-pulse";
import type { Checkpoint, RegularTask, Task } from "./types";

const TODAY = "2026-10-10";
const cp = (code: string, extra: Partial<Checkpoint> = {}): Checkpoint => ({ code, title: code, aside: "", gate: false, noteTitle: "", note: "", done: false, ...extra });
const base = { assignee: "", comments: [] as string[] };

const parent: Task = { ...base, id: "p", parentId: null, title: "ДДС", status: "В работе", startDate: "2026-09-07", endDate: "2026-10-18" };
const closed: Task = { ...base, id: "s0", parentId: "p", title: "Настройка", status: "Завершено", completedAt: "2026-09-11", startDate: "2026-09-07", endDate: "2026-09-13" };
const shifted: Task = { ...base, id: "s1", parentId: "p", title: "Анализ", status: "В работе", startDate: "2026-09-14", endDate: "2026-10-11",
  shifts: [{ date: "2026-10-05", from: "2026-09-20", to: "2026-10-11", reason: "client", holdCode: "S1.2", note: "" }],
  groups: [{ title: "", result: "", items: [cp("S1.1", { done: true, doneAt: "2026-10-07" }), cp("S1.2", { requests: ["2026-09-15"] })] }] };
const late: Task = { ...base, id: "s2", parentId: "p", title: "Источники", status: "В работе", startDate: "2026-09-21", endDate: "2026-10-04" };
const future: Task = { ...base, id: "s3", parentId: "p", title: "Регламент", status: "Не начато", startDate: "2026-10-12", endDate: "2026-10-18" };
const single: Task = { ...base, id: "x", parentId: null, title: "Отдельная задача", status: "В работе", startDate: "2026-10-01", endDate: "2026-10-20" };
const tasks = [parent, closed, shifted, late, future, single];

describe("рабочие задачи", () => {
  it("надзадача со спринтами — не рабочая, спринт и одиночная задача — рабочие", () => {
    expect(isWorkTask(parent, tasks)).toBe(false);
    expect(isWorkTask(shifted, tasks)).toBe(true);
    expect(isWorkTask(single, tasks)).toBe(true);
  });
  it("завершённость считается на дату", () => {
    expect(isTaskCompleted(closed)).toBe(true);
    expect(isTaskCompleted(closed, "2026-09-10")).toBe(false);
    expect(isTaskCompleted({ ...closed, completedAt: undefined }, "2026-01-01")).toBe(true);
    expect(isTaskCompleted(late)).toBe(false);
  });
});

describe("sprintHealth", () => {
  it("считает текущие, просроченные и перенесённые", () => {
    expect(sprintHealth(tasks, TODAY)).toEqual({ current: 3, overdue: 1, shifted: 1 });
  });
  it("статус «Просрочено» считается просрочкой и до срока", () => {
    expect(sprintHealth([{ ...single, status: "Просрочено" }], TODAY)).toEqual({ current: 1, overdue: 1, shifted: 0 });
  });
});

describe("parentSummary", () => {
  it("собирает сводку по спринтам надзадачи", () => {
    expect(parentSummary(parent, tasks, TODAY)).toEqual({ total: 4, closed: 1, overdue: 1, shifted: 1, waiting: 1 });
  });
});

// Сентябрь закрывают три ежемесячные задачи с датами в первой половине октября.
const monthly = (id: string, title: string, anchorDate: string, records: RegularTask["records"] = {}, parentId: string | null = null): RegularTask =>
  ({ id, parentId, title, assignee: "", frequency: "monthly", anchorDate, description: "", records });
const manager = (records?: RegularTask["records"]) => monthly("r1", "Закрыть управленческий месяц", "2026-08-05", records);
const opu = (records?: RegularTask["records"]) => monthly("r2", "Закрыть ОПиУ", "2026-08-03", records, "r1");
const dds = (records?: RegularTask["records"]) => monthly("r3", "Закрыть ДДС", "2026-08-12", records, "r1");
const done = (date: string) => ({ [date]: { actualDate: date, note: "" } });

describe("monthClosing", () => {
  it("какой месяц закрывает дата", () => {
    expect(closedMonthOf("2026-10-05")).toBe(8);
    expect(closedMonthOf("2026-10-20")).toBe(9);
    expect(closedMonthOf("2026-01-05")).toBe(11);
  });
  it("одна просроченная из трёх — месяц не закрыт", () => {
    expect(monthClosing([manager(), opu(done("2026-10-03")), dds()], TODAY)).toEqual({
      state: "late", month: 8, done: 1, total: 3,
      late: [{ title: "Закрыть управленческий месяц", plannedDate: "2026-10-05", note: "" }],
    });
  });
  it("перечисляет все просроченные по порядку сроков, с примечаниями", () => {
    const result = monthClosing([manager(), opu({ "2026-10-03": { actualDate: "", note: "Нет зарплатной ведомости" } }), dds()], TODAY);
    expect(result).toMatchObject({ state: "late", done: 0, total: 3 });
    expect(result.state === "late" && result.late.map((item) => [item.title, item.note])).toEqual([["Закрыть ОПиУ", "Нет зарплатной ведомости"], ["Закрыть управленческий месяц", ""]]);
  });
  it("просроченных нет, но не всё сделано — месяц закрывается", () => {
    const lateButDone = { "2026-10-05": { actualDate: "2026-10-06", note: "" } };
    expect(monthClosing([manager(lateButDone), opu(done("2026-10-03")), dds()], TODAY)).toEqual({ state: "pending", month: 8, done: 2, total: 3, nextDate: "2026-10-12" });
  });
  it("выполнены все — месяц закрыт", () => {
    expect(monthClosing([manager(done("2026-10-05")), opu(done("2026-10-03")), dds({ "2026-10-12": { actualDate: "2026-10-09", note: "" } })], TODAY)).toEqual({ state: "ok", month: 8, total: 3 });
  });
  it("даты прошлого месяца, закрывающие позапрошлый, не учитываются", () => {
    // 3, 5 и 12 сентября закрывают август — на закрытие сентября не влияют.
    expect(monthClosing([manager(done("2026-10-05")), opu(done("2026-10-03")), dds(done("2026-10-12"))], TODAY)).toMatchObject({ state: "ok", total: 3 });
  });
  it("закрытие в конце того же месяца тоже считается", () => {
    const sameMonth = monthly("r4", "Сверить склад", "2026-08-28", done("2026-09-28"));
    expect(monthClosing([sameMonth], TODAY)).toEqual({ state: "ok", month: 8, total: 1 });
  });
  it("без ежемесячных задач — не заведено", () => {
    expect(monthClosing([{ ...manager(), frequency: "weekly" }], TODAY)).toEqual({ state: "none" });
    expect(monthClosing([], TODAY)).toEqual({ state: "none" });
  });
});

describe("ручное закрытие месяца", () => {
  it("закрывается прошлый месяц", () => {
    expect(closingMonthKey("2026-10-10")).toBe("2026-09");
    expect(closingMonthKey("2026-01-05")).toBe("2025-12");
  });
  it("проверяет дату закрытия", () => {
    expect(closingDateError("", "2026-09", TODAY)).toBe("Укажите дату закрытия.");
    expect(closingDateError("2026-10-11", "2026-09", TODAY)).toBe("Дата закрытия не может быть позже сегодняшнего дня.");
    expect(closingDateError("2026-08-31", "2026-09", TODAY)).toBe("Месяц не может быть закрыт раньше, чем начался.");
    expect(closingDateError("2026-09-30", "2026-09", TODAY)).toBe("");
    expect(closingDateError("2026-10-10", "2026-09", TODAY)).toBe("");
  });
});
