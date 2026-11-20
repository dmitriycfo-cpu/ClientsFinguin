import { describe, expect, it } from "vitest";
import { getOccurrences, getPlannedDates, moveOccurrence, regularMonthStatus, removeOccurrence, restoreOccurrence } from "./regular-schedule";
import type { RegularTask } from "./types";

const monthly: RegularTask = {
  id: "m", parentId: null, title: "Закрыть месяц", assignee: "ФД",
  frequency: "monthly", anchorDate: "2026-10-03", description: "",
  records: { "2027-01-03": { actualDate: "", note: "Праздники" } },
};
const weekly: RegularTask = { ...monthly, id: "w", frequency: "weekly", anchorDate: "2026-12-31", records: {} };
const quarterly: RegularTask = { ...monthly, id: "q", frequency: "quarterly", anchorDate: "2026-10-03", records: {} };

describe("перенос повтора регулярной задачи", () => {
  it("без исключений даты идут по расписанию", () => {
    expect(getPlannedDates(monthly, "2027-01-01")).toEqual(["2027-01-03"]);
    expect(getOccurrences(monthly, "2027-01-01")).toEqual([{ scheduled: "2027-01-03", date: "2027-01-03" }]);
  });

  it("перенос меняет дату только в своём месяце и забирает факт с примечанием", () => {
    const moved = moveOccurrence(monthly, "2027-01-03", "2027-01-12");
    expect(getPlannedDates(moved, "2027-01-01")).toEqual(["2027-01-12"]);
    expect(getOccurrences(moved, "2027-01-01")).toEqual([{ scheduled: "2027-01-03", date: "2027-01-12" }]);
    expect(getPlannedDates(moved, "2027-02-01")).toEqual(["2027-02-03"]);
    expect(moved.records["2027-01-12"]).toEqual({ actualDate: "", note: "Праздники" });
    expect(moved.records["2027-01-03"]).toBeUndefined();
  });

  it("повторный перенос и возврат на дату расписания", () => {
    const twice = moveOccurrence(moveOccurrence(monthly, "2027-01-03", "2027-01-12"), "2027-01-03", "2027-01-14");
    expect(getPlannedDates(twice, "2027-01-01")).toEqual(["2027-01-14"]);
    expect(twice.records["2027-01-14"]?.note).toBe("Праздники");
    const back = moveOccurrence(twice, "2027-01-03", "2027-01-03");
    expect(back.overrides).toEqual({});
    expect(back.records["2027-01-03"]?.note).toBe("Праздники");
  });

  it("удалённый повтор не попадает в плановые даты и статус месяца, но его можно вернуть", () => {
    const removed = removeOccurrence(moveOccurrence(monthly, "2027-01-03", "2027-01-12"), "2027-01-03");
    expect(getPlannedDates(removed, "2027-01-01")).toEqual([]);
    expect(getOccurrences(removed, "2027-01-01")).toEqual([{ scheduled: "2027-01-03", date: null }]);
    expect(regularMonthStatus(removed, "2027-01-01", new Date(2027, 1, 1))).toBeNull();
    const restored = restoreOccurrence(removed, "2027-01-03");
    expect(getPlannedDates(restored, "2027-01-01")).toEqual(["2027-01-03"]);
    expect(restored.records["2027-01-03"]?.note).toBe("Праздники");
  });

  it("у еженедельной задачи переносится один повтор, даты остаются по порядку", () => {
    expect(getPlannedDates(weekly, "2027-01-01")).toEqual(["2027-01-07", "2027-01-14", "2027-01-21", "2027-01-28"]);
    const moved = moveOccurrence(weekly, "2027-01-07", "2027-01-15");
    expect(getPlannedDates(moved, "2027-01-01")).toEqual(["2027-01-14", "2027-01-15", "2027-01-21", "2027-01-28"]);
    expect(getPlannedDates(removeOccurrence(weekly, "2027-01-14"), "2027-01-01")).toEqual(["2027-01-07", "2027-01-21", "2027-01-28"]);
  });

  it("нельзя перенести на дату другого повтора или в другой месяц", () => {
    expect(moveOccurrence(weekly, "2027-01-07", "2027-01-14")).toBe(weekly);
    expect(moveOccurrence(monthly, "2027-01-03", "2027-02-01")).toBe(monthly);
  });

  it("ежеквартальная задача переносится в своём месяце", () => {
    const moved = moveOccurrence(quarterly, "2027-01-03", "2027-01-11");
    expect(getPlannedDates(moved, "2027-01-01")).toEqual(["2027-01-11"]);
    expect(getPlannedDates(moved, "2027-04-01")).toEqual(["2027-04-03"]);
  });
});
