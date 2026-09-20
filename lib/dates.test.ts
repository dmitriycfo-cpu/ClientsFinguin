import { describe, expect, it } from "vitest";
import { formatDayMonth, nextMonday, startOfWeek, weekdayName } from "./dates";

describe("startOfWeek", () => {
  it("возвращает понедельник той же недели", () => {
    expect(startOfWeek("2026-09-18")).toBe("2026-09-14"); // пятница → понедельник
    expect(startOfWeek("2026-09-20")).toBe("2026-09-14"); // воскресенье → тот же понедельник
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14"); // понедельник остаётся
  });
});

describe("nextMonday", () => {
  it("возвращает ближайший понедельник, включая сегодняшний", () => {
    expect(nextMonday("2026-09-18")).toBe("2026-09-21");
    expect(nextMonday("2026-09-21")).toBe("2026-09-21");
    expect(nextMonday("2026-09-22")).toBe("2026-09-28");
  });
});

describe("formatDayMonth", () => {
  it("печатает день и месяц с ведущими нулями", () => {
    expect(formatDayMonth("2026-09-05")).toBe("05.09");
    expect(formatDayMonth("2026-10-11")).toBe("11.10");
  });

  it("показывает прочерк вместо неразобранной даты", () => {
    expect(formatDayMonth("")).toBe("—");
    expect(formatDayMonth("не дата")).toBe("—");
  });
});

describe("weekdayName", () => {
  it("называет день недели по-русски", () => {
    expect(weekdayName("2026-09-18")).toBe("пятница");
    expect(weekdayName("2026-09-21")).toBe("понедельник");
  });
});
