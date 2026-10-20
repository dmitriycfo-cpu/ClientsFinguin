import { describe, expect, it } from "vitest";
import { calendarBucket, collectCalendarTasks } from "./calendar-items";
import type { Checkpoint, RegularTask, Task } from "./types";

const today = "2026-10-10";

const point = (code: string, patch: Partial<Checkpoint> = {}): Checkpoint => ({
  code, title: "Точка " + code, aside: "", gate: false, noteTitle: "", note: "", done: false, ...patch,
});

const parent: Task = {
  id: "parent", parentId: null, title: "Внедрение ДДС", assignee: "Иван Петров",
  status: "В работе", startDate: "2026-10-01", endDate: "2026-10-20", comments: [],
};
const sprint: Task = {
  ...parent, id: "sprint", parentId: "parent", title: "Настройка разнесения", assignee: "Дмитрий Волков",
  startDate: "2026-10-05", endDate: "2026-10-13", template: { code: "ДДС", subCode: "ДДС-2", week: 2 },
  groups: [{ title: "", result: "", items: [
    point("ДДС-2.1", { date: "2026-10-08", done: true, assignee: "Бухгалтерия" }),
    point("ДДС-2.2", { date: "2026-10-09" }),
    point("ДДС-2.3"),
  ] }],
};
const lastSprint: Task = { ...parent, id: "last", parentId: "parent", title: "Отчёт", endDate: "2026-10-20" };

const weekly: RegularTask = {
  id: "weekly", parentId: null, title: "Платёжный календарь", assignee: "Финансовый менеджер",
  frequency: "weekly", anchorDate: "2026-10-02", description: "",
  records: { "2026-10-02": { actualDate: "2026-10-02", note: "" }, "2026-10-09": { actualDate: "2026-10-12", note: "" } },
};

function collect(tasks: Task[], regularTasks: RegularTask[] = [], from = "2026-10-01", to = "2026-10-31") {
  return collectCalendarTasks({ tasks, regularTasks }, from, to, today);
}

describe("задачи в календаре", () => {
  it("ставит задачу Ганта на день срока и помечает просрочку", () => {
    const items = collect([parent, { ...sprint, endDate: "2026-10-08", groups: undefined }]);
    const gantt = items.find((item) => item.key === "gantt:sprint")!;
    expect(gantt.date).toBe("2026-10-08");
    expect(gantt.status).toBe("Просрочено");
    expect(gantt.context).toBe("Внедрение ДДС · спринт ДДС-2");
  });

  it("не дублирует срок надзадачи, если он совпадает со сроком спринта", () => {
    const keys = collect([parent, lastSprint]).map((item) => item.key);
    expect(keys).toEqual(["gantt:last"]);
  });

  it("берёт срок и ответственного контрольной точки, а без них — спринта", () => {
    const points = collect([sprint]).filter((item) => item.source === "checkpoint");
    expect(points.map((item) => [item.code, item.date, item.assignee, item.status])).toEqual([
      ["ДДС-2.1", "2026-10-08", "Бухгалтерия", "Выполнено"],
      ["ДДС-2.2", "2026-10-09", "Дмитрий Волков", "Просрочено"],
      ["ДДС-2.3", "2026-10-13", "Дмитрий Волков", "Не выполнено"],
    ]);
  });

  it("раскладывает регулярную задачу по плановым датам со статусами", () => {
    const items = collect([], [weekly]).map((item) => [item.date, item.status]);
    expect(items).toEqual([
      ["2026-10-02", "Выполнено"],
      ["2026-10-09", "С опозданием"],
      ["2026-10-16", "Запланировано"],
      ["2026-10-23", "Запланировано"],
      ["2026-10-30", "Запланировано"],
    ]);
  });

  it("берёт регулярные даты на стыке месяцев, как в сетке календаря", () => {
    const dates = collect([], [weekly], "2026-09-28", "2026-11-08").map((item) => item.date);
    expect(dates[0]).toBe("2026-10-02");
    expect(dates[dates.length - 1]).toBe("2026-11-06");
  });

  it("не выходит за границы промежутка", () => {
    expect(collect([sprint], [weekly], "2026-10-09", "2026-10-09").map((item) => item.key)).toEqual([
      "checkpoint:sprint:ДДС-2.2",
      "regular:weekly:2026-10-09",
    ]);
  });
});

describe("цвет отметки дня", () => {
  it("делит статусы на план, выполнено и просрочено", () => {
    expect(calendarBucket("Просрочено")).toBe("overdue");
    expect(calendarBucket("Завершено")).toBe("done");
    expect(calendarBucket("С опозданием")).toBe("done");
    expect(calendarBucket("На проверке")).toBe("plan");
    expect(calendarBucket("Не выполнено")).toBe("plan");
  });
});
