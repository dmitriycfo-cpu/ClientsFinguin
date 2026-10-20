import { describe, expect, it } from "vitest";
import { appendShift, endDateAt, needsShiftReason, originalEndDate, shiftReasonInfo, validateShift } from "./task-shifts";
import type { Task } from "./types";

const parent: Task = { id: "p", parentId: null, title: "ДДС", assignee: "", status: "В работе", startDate: "2026-09-14", endDate: "2026-10-18", comments: [] };
const sprint: Task = {
  id: "s", parentId: "p", title: "Анализ", assignee: "", status: "В работе", startDate: "2026-09-14", endDate: "2026-10-11", comments: [],
  shifts: [
    { date: "2026-09-21", from: "2026-09-20", to: "2026-09-27", reason: "client", holdCode: "ДДС-2.4", note: "" },
    { date: "2026-10-05", from: "2026-09-27", to: "2026-10-11", reason: "client", holdCode: "ДДС-2.4", note: "Кошельки" },
  ],
};
const tasks = [parent, sprint];

describe("needsShiftReason", () => {
  it("просит причину, когда срок рабочей задачи стал позже", () => {
    expect(needsShiftReason(sprint, { ...sprint, endDate: "2026-10-18" }, tasks)).toBe(true);
  });
  it("не просит при переносе раньше, без изменения срока и для новой задачи", () => {
    expect(needsShiftReason(sprint, { ...sprint, endDate: "2026-10-09" }, tasks)).toBe(false);
    expect(needsShiftReason(sprint, { ...sprint }, tasks)).toBe(false);
    expect(needsShiftReason(null, { ...sprint, endDate: "2026-12-01" }, tasks)).toBe(false);
  });
  it("не просит у надзадачи со спринтами", () => {
    expect(needsShiftReason(parent, { ...parent, endDate: "2026-11-01" }, tasks)).toBe(false);
  });
  it("просит у надзадачи без спринтов", () => {
    const single = { ...parent, id: "single" };
    expect(needsShiftReason(single, { ...single, endDate: "2026-11-01" }, [single])).toBe(true);
  });
});

describe("validateShift", () => {
  it("требует причину", () => expect(validateShift("", "")).toBe("Выберите причину переноса."));
  it("требует комментарий к «Другое»", () => {
    expect(validateShift("other", "  ")).toBe("Для причины «Другое» напишите комментарий.");
    expect(validateShift("other", "Отпуск бухгалтера")).toBe("");
  });
  it("остальные причины без комментария — можно", () => expect(validateShift("fd", "")).toBe(""));
});

describe("appendShift", () => {
  it("дописывает перенос со старым и новым сроком", () => {
    const next = appendShift(sprint, { ...sprint, endDate: "2026-10-18" }, { reason: "fd", holdCode: "", note: "  не успели  " }, "2026-10-10");
    expect(next.endDate).toBe("2026-10-18");
    expect(next.shifts).toHaveLength(3);
    expect(next.shifts?.[2]).toEqual({ date: "2026-10-10", from: "2026-10-11", to: "2026-10-18", reason: "fd", holdCode: "", note: "не успели" });
  });
});

describe("сроки по истории", () => {
  it("исходный срок — до первого переноса", () => {
    expect(originalEndDate(sprint)).toBe("2026-09-20");
    expect(originalEndDate(parent)).toBe("2026-10-18");
  });
  it("срок на дату учитывает только переносы, сделанные к этому дню", () => {
    expect(endDateAt(sprint, "2026-09-20")).toBe("2026-09-20");
    expect(endDateAt(sprint, "2026-09-21")).toBe("2026-09-27");
    expect(endDateAt(sprint, "2026-10-04")).toBe("2026-09-27");
    expect(endDateAt(sprint, "2026-10-10")).toBe("2026-10-11");
  });
  it("после всех переносов отдаёт текущий срок, даже если его потом поправили вручную", () => {
    expect(endDateAt({ ...sprint, endDate: "2026-10-09" }, "2026-10-10")).toBe("2026-10-09");
  });
});

describe("shiftReasonInfo", () => {
  it("знает подписи и цвет", () => {
    expect(shiftReasonInfo("client")).toMatchObject({ label: "Клиент не дал данные", short: "клиент", tone: "amber" });
    expect(shiftReasonInfo("fd").tone).toBe("red");
  });
});
