import { describe, expect, it } from "vitest";
import { checkpointProgress, nextCheckpointCode } from "./typical-tasks";
import type { Task } from "./types";

const parent: Task = {
  id: "parent", parentId: null, title: "Новая задача", assignee: "",
  status: "В работе", startDate: "2026-09-22", endDate: "2026-09-29", comments: [],
};
const child: Task = {
  ...parent, id: "child", parentId: parent.id,
  groups: [{ title: "", result: "", items: [
    { code: "Т.1", title: "Собрать данные", aside: "", gate: false, noteTitle: "", note: "", done: true },
    { code: "Т.3", title: "Проверить данные", aside: "", gate: false, noteTitle: "", note: "", done: false },
  ] }],
};

describe("чек-листы задач без шаблона", () => {
  it("показывает прогресс обычной подзадачи", () => {
    expect(checkpointProgress(child, [parent, child])).toEqual({ done: 1, total: 2 });
  });

  it("суммирует обычные и типовые подзадачи, исключая чужие", () => {
    const sprint: Task = { ...child, id: "sprint", template: { code: "ДДС", subCode: "ДДС-1" } };
    const unrelated: Task = { ...child, id: "unrelated", parentId: "other" };
    const tasks = [parent, child, sprint, unrelated];
    expect(checkpointProgress(parent, tasks)).toEqual({ done: 2, total: 4 });
    expect(checkpointProgress({ ...parent, template: { code: "ДДС" } }, tasks)).toEqual({ done: 2, total: 4 });
  });

  it("не показывает счётчик у обычной задачи без пунктов", () => {
    expect(checkpointProgress(parent, [parent])).toBeNull();
    expect(checkpointProgress({ ...child, groups: [] }, [])).toBeNull();
  });

  it("сохраняет прогресс при превращении подзадачи в надзадачу", () => {
    expect(checkpointProgress({ ...child, parentId: null }, [])).toEqual({ done: 1, total: 2 });
  });

  it("не повторяет коды после удаления пункта из середины", () => {
    expect(nextCheckpointCode(child)).toBe("Т.4");
    expect(nextCheckpointCode({ ...child, groups: [] })).toBe("Т.1");
  });
});
