import { describe, expect, it } from "vitest";
import { toggleRegularDone, weekRegular, weekRegularSummary } from "./week-regular";
import type { RegularTask } from "./types";

const TODAY = "2026-11-05";
const reg = (extra: Partial<RegularTask>): RegularTask => ({ id: "r", parentId: null, title: "", assignee: "", frequency: "weekly", anchorDate: "2026-10-05", description: "", records: {}, ...extra });

const weeklyDds = reg({ id: "dds", title: "Сверка ДДС", anchorDate: "2026-10-06", records: { "2026-11-03": { actualDate: "2026-11-03", note: "" } } });
const closing = reg({ id: "close", title: "Закрытие месяца", frequency: "monthly", anchorDate: "2026-09-05" });
const stage = reg({ id: "stage", parentId: "close", title: "Сверка остатков", frequency: "monthly", anchorDate: "2026-09-03", records: { "2026-11-03": { actualDate: "2026-11-04", note: "" } } });
const quarterly = reg({ id: "q", title: "Налоги", frequency: "quarterly", anchorDate: "2026-08-20" });

describe("weekRegular", () => {
  it("берёт плановые даты недели и считает статусы", () => {
    const items = weekRegular([weeklyDds, closing, stage, quarterly], "2026-11-02", TODAY);
    expect(items.map((item) => [item.task.id, item.plannedDate, item.status])).toEqual([
      ["dds", "2026-11-03", "Выполнено"],
      ["stage", "2026-11-03", "С опозданием"],
      ["close", "2026-11-05", "Запланировано"],
    ]);
    expect(items.find((item) => item.task.id === "stage")?.parentTitle).toBe("Закрытие месяца");
  });
  it("прошедшая дата без факта — не выполнено", () => {
    const items = weekRegular([closing], "2026-11-02", "2026-11-09");
    expect(items[0].status).toBe("Не выполнено");
    expect(weekRegularSummary(items)).toEqual({ total: 1, done: 0, missed: 1 });
  });
  it("неделя на стыке месяцев собирает оба месяца", () => {
    const items = weekRegular([reg({ id: "w", title: "Платёжный календарь", anchorDate: "2026-10-01" })], "2026-10-26", TODAY);
    expect(items.map((item) => item.plannedDate)).toEqual(["2026-10-29"]);
    const edge = weekRegular([reg({ id: "e", title: "X", frequency: "monthly", anchorDate: "2026-09-01" })], "2026-10-26", TODAY);
    expect(edge.map((item) => item.plannedDate)).toEqual(["2026-11-01"]);
  });
});

describe("toggleRegularDone", () => {
  it("отмечает сегодняшним днём и снимает отметку, примечание сохраняется", () => {
    const marked = toggleRegularDone(reg({ records: { "2026-11-03": { actualDate: "", note: "Ждали выписку" } } }), "2026-11-03", TODAY);
    expect(marked.records["2026-11-03"]).toEqual({ actualDate: TODAY, note: "Ждали выписку" });
    expect(toggleRegularDone(marked, "2026-11-03", TODAY).records["2026-11-03"]).toEqual({ actualDate: "", note: "Ждали выписку" });
  });
});
