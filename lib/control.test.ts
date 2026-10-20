import { describe, expect, it } from "vitest";
import {
  CONTROL_ITEMS,
  badWeeks,
  controlWeeks,
  emptyWeek,
  isControlWeekKey,
  nextMark,
  normalizeControlData,
  sanitizeControlWeek,
  setMark,
  weekScore,
} from "./control";
import type { ControlData } from "./control";

describe("пункты чек-листа", () => {
  it("шесть пунктов с уникальными кодами и подсказками", () => {
    expect(CONTROL_ITEMS).toHaveLength(6);
    expect(new Set(CONTROL_ITEMS.map((item) => item.id)).size).toBe(6);
    expect(CONTROL_ITEMS.every((item) => item.where && item.points.length > 0)).toBe(true);
  });
});

describe("controlWeeks", () => {
  it("восемь полных недель и текущая справа", () => {
    expect(controlWeeks("2026-10-10")).toEqual([
      "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31",
      "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05",
    ]);
  });

  it("в понедельник текущая неделя — новая, к проверке — только что закончившаяся", () => {
    expect(controlWeeks("2026-10-12", 2)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
  });
});

describe("отметки", () => {
  it("клик по клетке: пусто → ✓ → ✗ → пусто", () => {
    expect(nextMark(undefined)).toBe("ok");
    expect(nextMark("ok")).toBe("bad");
    expect(nextMark("bad")).toBeUndefined();
  });

  it("снятие отметки убирает ключ, а заметку оставляет", () => {
    const week = { ...emptyWeek(), marks: { plan: "bad" as const }, notes: { plan: "Укрупнить спринты" } };
    const cleared = setMark(week, "plan", undefined);
    expect(cleared.marks).toEqual({});
    expect(cleared.notes).toEqual({ plan: "Укрупнить спринты" });
    expect(setMark(cleared, "plan", "ok").marks).toEqual({ plan: "ok" });
  });

  it("итог недели", () => {
    expect(weekScore(undefined)).toEqual({ ok: 0, bad: 0, checked: 0 });
    expect(weekScore({ ...emptyWeek(), marks: { meet: "ok", plan: "bad", week: "ok" } })).toEqual({ ok: 2, bad: 1, checked: 3 });
  });

  it("✗ считаются только в показанных неделях", () => {
    const data: ControlData = { weeks: {
      "2026-09-21": { ...emptyWeek(), marks: { plan: "bad" } },
      "2026-09-28": { ...emptyWeek(), marks: { plan: "bad", meet: "bad" } },
      "2026-10-05": { ...emptyWeek(), marks: { plan: "bad" } },
      "2026-08-03": { ...emptyWeek(), marks: { plan: "bad" } },
    } };
    expect(badWeeks(data, "plan", controlWeeks("2026-10-10"))).toBe(3);
    expect(badWeeks(data, "client", controlWeeks("2026-10-10"))).toBe(0);
  });
});

describe("проверка входящих данных", () => {
  it("ключ недели — только понедельник", () => {
    expect(isControlWeekKey("2026-09-28")).toBe(true);
    expect(isControlWeekKey("2026-09-29")).toBe(false);
    expect(isControlWeekKey("2026-13-45")).toBe(false);
    expect(isControlWeekKey("неделя")).toBe(false);
    expect(isControlWeekKey(20260928)).toBe(false);
  });

  it("неделя: лишние ключи и значения отбрасываются, длинный текст обрезается", () => {
    expect(sanitizeControlWeek({
      marks: { meet: "ok", plan: "maybe", hack: "bad" },
      notes: { plan: "x", hack: "y", meet: 5 },
      answers: { done: "а".repeat(2100), other: "z" },
    })).toEqual({ marks: { meet: "ok" }, notes: { plan: "x" }, answers: { done: "а".repeat(2000) } });
    expect(sanitizeControlWeek({})).toEqual({ marks: {}, notes: {}, answers: {} });
    expect(sanitizeControlWeek(null)).toBeNull();
    expect(sanitizeControlWeek([])).toBeNull();
  });

  it("данные: недели с плохим ключом отбрасываются, мусор даёт пустые данные", () => {
    expect(normalizeControlData({ weeks: {
      "2026-09-28": { marks: { meet: "ok" } },
      "2026-09-29": { marks: {} },
      bad: 1,
    } })).toEqual({ weeks: { "2026-09-28": { marks: { meet: "ok" }, notes: {}, answers: {} } } });
    expect(normalizeControlData("x")).toEqual({ weeks: {} });
    expect(normalizeControlData(undefined)).toEqual({ weeks: {} });
  });
});
