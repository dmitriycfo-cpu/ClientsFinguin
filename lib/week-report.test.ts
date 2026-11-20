import { describe, expect, it } from "vitest";
import { formatWeekRange, regularWeek, toggleRegularOccurrence, weekAgeLabel, weekBounds, weekReport } from "./week-report";
import type { Checkpoint, RegularTask, Task } from "./types";

const TODAY = "2026-10-10";
const cp = (code: string, extra: Partial<Checkpoint> = {}): Checkpoint => ({ code, title: code, aside: "", gate: false, noteTitle: "", note: "", done: false, ...extra });
const base = { assignee: "", comments: [] as string[] };

const parent: Task = { ...base, id: "p", parentId: null, title: "ДДС", status: "В работе", startDate: "2026-09-07", endDate: "2026-10-18" };
const s0: Task = { ...base, id: "s0", parentId: "p", title: "Настройка", status: "Завершено", completedAt: "2026-09-11", startDate: "2026-09-07", endDate: "2026-09-13",
  groups: [{ title: "", result: "", items: [cp("S0.1", { done: true, doneAt: "2026-09-10" })] }] };
const s1: Task = { ...base, id: "s1", parentId: "p", title: "Анализ", status: "В работе", startDate: "2026-09-14", endDate: "2026-10-11",
  shifts: [
    { date: "2026-09-21", from: "2026-09-20", to: "2026-09-27", reason: "client", holdCode: "S1.2", note: "" },
    { date: "2026-10-05", from: "2026-09-27", to: "2026-10-11", reason: "client", holdCode: "S1.2", note: "Кошельки" },
  ],
  groups: [{ title: "", result: "", items: [cp("S1.1", { done: true, doneAt: "2026-10-07" }), cp("S1.2", { requests: ["2026-09-15"] })] }] };
const s2: Task = { ...base, id: "s2", parentId: "p", title: "Источники", status: "В работе", startDate: "2026-09-21", endDate: "2026-10-04",
  shifts: [{ date: "2026-09-28", from: "2026-09-27", to: "2026-10-04", reason: "fd", holdCode: "", note: "" }],
  groups: [{ title: "", result: "", items: [cp("S2.1", { done: true, doneAt: "2026-09-30" }), cp("S2.2")] }] };
const s3: Task = { ...base, id: "s3", parentId: "p", title: "Регламент", status: "Не начато", startDate: "2026-10-12", endDate: "2026-10-18",
  groups: [{ title: "", result: "", items: [cp("S3.1", { date: "2026-10-16" }), cp("S3.2", { date: "2026-10-14" }), cp("S3.3")] }] };
const tasks = [parent, s0, s1, s2, s3];

describe("weekReport — текущая неделя", () => {
  const report = weekReport(tasks, "2026-10-05", TODAY);

  it("собирает сделанное по дням отметки", () => {
    expect(report.done.map((group) => [group.task.id, group.items.map((item) => item.code), group.closed])).toEqual([["s1", ["S1.1"], false]]);
    expect(report.doneCount).toBe(1);
    expect(report.closedCount).toBe(0);
  });
  it("показывает переносы недели с номером", () => {
    expect(report.shifts.map((entry) => [entry.task.id, entry.index, entry.total])).toEqual([["s1", 1, 2]]);
  });
  it("находит задачи с истёкшим сроком без нового", () => {
    expect(report.stuck.map((entry) => [entry.task.id, entry.endDate, entry.daysLate, entry.openItems.map((item) => item.code)])).toEqual([["s2", "2026-10-04", 6, ["S2.2"]]]);
  });
  it("план следующей недели: сначала точки со сроком на ней, по дате", () => {
    expect(report.next.map((entry) => [entry.task.id, entry.items.map((item) => item.code)])).toEqual([["s3", ["S3.2", "S3.1", "S3.3"]]]);
  });
  it("план следующей недели привязан к датам: пункты на поздние недели не выводятся, просроченные — выводятся", () => {
    const busy: Task = { ...s3, groups: [{ title: "", result: "", items: [
      cp("S3.1", { date: "2026-10-16" }), cp("S3.3"), cp("S3.4", { date: "2026-10-21" }), cp("S3.5", { date: "2026-10-08" }), cp("S3.6", { date: "2026-10-13", done: true, doneAt: TODAY }),
    ] }] };
    const next = weekReport([parent, s0, s1, s2, busy], "2026-10-05", TODAY).next;
    expect(next.map((entry) => [entry.task.id, entry.items.map((item) => item.code)])).toEqual([["s3", ["S3.5", "S3.1", "S3.3"]]]);
  });
  it("пункт с датой на следующей неделе попадает в план, даже если спринт идёт позже", () => {
    const later: Task = { ...base, id: "s5", parentId: "p", title: "Отчёт", status: "Не начато", startDate: "2026-10-19", endDate: "2026-10-30",
      groups: [{ title: "", result: "", items: [cp("S5.1"), cp("S5.2", { date: "2026-10-15" }), cp("S5.3", { date: "2026-10-26" })] }] };
    const next = weekReport([...tasks, later], "2026-10-05", TODAY).next;
    expect(next.map((entry) => [entry.task.id, entry.items.map((item) => item.code)])).toEqual([["s3", ["S3.2", "S3.1", "S3.3"]], ["s5", ["S5.2"]]]);
  });
  it("надзадача со спринтами в отчёт не попадает", () => {
    const ids = [...report.done, ...report.shifts, ...report.stuck, ...report.next].map((entry) => entry.task.id);
    expect(ids).not.toContain("p");
    expect(report.isCurrent).toBe(true);
    expect(report.noMovement).toBe(false);
  });
});

describe("weekReport — прошлые недели", () => {
  it("считает закрытый спринт", () => {
    const report = weekReport(tasks, "2026-09-07", TODAY);
    expect(report.closedCount).toBe(1);
    expect(report.doneCount).toBe(1);
  });
  it("неделя без закрытий и переносов — без движения", () => {
    const report = weekReport(tasks, "2026-09-14", TODAY);
    expect(report.noMovement).toBe(true);
    expect(report.stuck).toEqual([]);
  });
  it("срок на конец прошлой недели восстанавливается по истории переносов", () => {
    const report = weekReport(tasks, "2026-09-28", TODAY);
    expect(report.stuck.map((entry) => [entry.task.id, entry.endDate, entry.daysLate])).toEqual([["s1", "2026-09-27", 7]]);
    expect(report.isCurrent).toBe(false);
  });
});

describe("weekReport — архив", () => {
  // Надзадачу убрали в архив: прошлое остаётся в отчёте, просрочки и планы — нет.
  const archived = [{ ...parent, archivedAt: TODAY }, s0, s1, s2, s3];

  it("сделанное и переносы остаются", () => {
    const report = weekReport(archived, "2026-10-05", TODAY);
    expect(report.done.map((group) => group.task.id)).toEqual(["s1"]);
    expect(report.shifts.map((entry) => entry.task.id)).toEqual(["s1"]);
  });
  it("просрочки и план следующей недели — без архивных", () => {
    const report = weekReport(archived, "2026-10-05", TODAY);
    expect(report.stuck).toEqual([]);
    expect(report.next).toEqual([]);
  });
});

describe("подписи и границы", () => {
  it("границы листания — от недели первой задачи до текущей", () => {
    expect(weekBounds(tasks, TODAY)).toEqual({ first: "2026-09-07", last: "2026-10-05" });
  });
  it("подписывает диапазон недели", () => {
    expect(formatWeekRange("2026-10-05")).toBe("5–11 октября");
    expect(formatWeekRange("2026-09-28")).toBe("28 сентября – 4 октября");
  });
  it("подписывает давность недели", () => {
    expect(weekAgeLabel("2026-10-05", TODAY)).toBe("текущая неделя");
    expect(weekAgeLabel("2026-09-28", TODAY)).toBe("1 неделю назад");
    expect(weekAgeLabel("2026-09-21", TODAY)).toBe("2 недели назад");
    expect(weekAgeLabel("2026-08-31", TODAY)).toBe("5 недель назад");
  });
});

describe("weekReport — отложенные задачи", () => {
  const paused: Task = { ...s2, status: "Отложено", postponeReason: "Ждём кошельки", postponeUntil: "2026-11-01", postponedAt: "2026-10-07" };
  const report = weekReport([parent, s0, s1, paused, s3], "2026-10-05", TODAY);
  it("не попадают в просрочку и в план, но видны отдельным списком", () => {
    expect(report.stuck.map((entry) => entry.task.id)).not.toContain("s2");
    expect(report.next.map((entry) => entry.task.id)).not.toContain("s2");
    expect(report.postponed.map((entry) => [entry.task.id, entry.isNew])).toEqual([["s2", true]]);
  });
  it("откладывание на неделе — это движение", () => {
    const quiet = weekReport([{ ...paused, postponedAt: "2026-10-07" }], "2026-10-05", TODAY);
    expect(quiet.noMovement).toBe(false);
  });
});

describe("regularWeek — регулярные задачи", () => {
  const reg = (id: string, extra: Partial<RegularTask>): RegularTask => ({ id, parentId: null, title: id, assignee: "", frequency: "monthly", anchorDate: "2026-07-01", description: "", records: {}, ...extra });
  const r1 = reg("r1", { frequency: "weekly", anchorDate: "2026-09-07", records: { "2026-10-05": { actualDate: "2026-10-06", note: "" } } });
  const r2 = reg("r2", { parentId: "r1", anchorDate: "2026-08-09" });
  const r3 = reg("r3", { anchorDate: "2026-07-11" });
  const r4 = reg("r4", { frequency: "quarterly", anchorDate: "2026-07-14" });
  const week = regularWeek([r1, r2, r3, r4], "2026-10-05", TODAY);

  it("повторы недели по дате со статусами и надзадачей", () => {
    expect(week.week.map((item) => [item.task.id, item.date, item.status, item.parent?.id])).toEqual([
      ["r1", "2026-10-05", "С опозданием", undefined],
      ["r2", "2026-10-09", "Просрочено", "r1"],
      ["r3", "2026-10-11", "Запланировано", undefined],
    ]);
  });
  it("счётчики: выполнено из всего и не сделано в срок", () => {
    expect([week.doneCount, week.week.length, week.missedCount]).toEqual([1, 3, 2]);
  });
  it("план следующей недели", () => {
    expect(week.next.map((item) => [item.task.id, item.date])).toEqual([["r1", "2026-10-12"], ["r4", "2026-10-14"]]);
  });
  it("отметка после конца недели: на этой неделе не выполнено, а «не сделано»", () => {
    const later = regularWeek([r1, { ...r3, records: { "2026-10-11": { actualDate: "2026-10-13", note: "" } } }], "2026-10-05", "2026-10-14");
    expect(later.week.map((item) => [item.task.id, item.status])).toEqual([["r1", "С опозданием"], ["r3", "Не сделано"]]);
    expect([later.doneCount, later.missedCount]).toEqual([1, 2]);
  });
  it("галочка ставит сегодняшнюю дату и снимает её, примечание остаётся", () => {
    const marked = toggleRegularOccurrence({ ...r3, records: { "2026-10-11": { actualDate: "", note: "звонили" } } }, "2026-10-11", TODAY);
    expect(marked.records["2026-10-11"]).toEqual({ actualDate: TODAY, note: "звонили" });
    expect(toggleRegularOccurrence(marked, "2026-10-11", TODAY).records["2026-10-11"]).toEqual({ actualDate: "", note: "звонили" });
  });
});
