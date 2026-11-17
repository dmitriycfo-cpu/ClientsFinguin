import { describe, expect, it } from "vitest";
import { isPostponeExpired, isPostponed, validatePostpone, withPostpone } from "./postpone";
import type { Task } from "./types";

const TODAY = "2026-11-17";
const base: Task = { id: "t", parentId: null, title: "Финмодель", assignee: "", status: "В работе", startDate: "2026-11-01", endDate: "2026-11-14", comments: [] };

describe("validatePostpone", () => {
  it("требует причину", () => {
    expect(validatePostpone("  ", "2026-12-01", TODAY)).toMatch(/почему/);
  });
  it("требует дату и не пускает прошлое", () => {
    expect(validatePostpone("Ждём данные", "", TODAY)).toMatch(/дату/);
    expect(validatePostpone("Ждём данные", "2026-11-10", TODAY)).toMatch(/прошлом/);
  });
  it("пропускает заполненное", () => {
    expect(validatePostpone("Ждём данные", "2026-12-01", TODAY)).toBe("");
  });
});

describe("withPostpone", () => {
  it("при откладывании запоминает день и пишет комментарий", () => {
    const saved = withPostpone(base, { ...base, status: "Отложено", postponeReason: " Собственник не дал кошельки ", postponeUntil: "2026-12-01" }, TODAY);
    expect(saved.postponedAt).toBe(TODAY);
    expect(saved.postponeReason).toBe("Собственник не дал кошельки");
    expect(saved.comments.at(-1)).toBe("Отложено 17 ноя до 1 дек: Собственник не дал кошельки");
  });
  it("повторное сохранение без изменений не дублирует комментарий", () => {
    const once = withPostpone(base, { ...base, status: "Отложено", postponeReason: "Ждём", postponeUntil: "2026-12-01" }, TODAY);
    const twice = withPostpone(once, { ...once }, "2026-11-20");
    expect(twice.comments).toHaveLength(1);
    expect(twice.postponedAt).toBe(TODAY);
  });
  it("при возврате в работу убирает поля, комментарий остаётся", () => {
    const postponed = withPostpone(base, { ...base, status: "Отложено", postponeReason: "Ждём", postponeUntil: "2026-12-01" }, TODAY);
    const back = withPostpone(postponed, { ...postponed, status: "В работе" }, "2026-12-01");
    expect(back.postponeReason).toBeUndefined();
    expect(back.postponeUntil).toBeUndefined();
    expect(back.comments).toHaveLength(1);
  });
});

describe("isPostponed / isPostponeExpired", () => {
  const parent: Task = { ...base, id: "p", status: "Отложено", postponeUntil: "2026-11-15" };
  const sprint: Task = { ...base, id: "s", parentId: "p", status: "В работе" };
  it("спринт отложенной надзадачи тоже отложен", () => {
    expect(isPostponed(sprint, [parent, sprint])).toBe(true);
    expect(isPostponed({ ...sprint, parentId: null }, [parent])).toBe(false);
  });
  it("срок откладывания прошёл", () => {
    expect(isPostponeExpired(parent, TODAY)).toBe(true);
    expect(isPostponeExpired({ ...parent, postponeUntil: "2026-12-01" }, TODAY)).toBe(false);
  });
});
