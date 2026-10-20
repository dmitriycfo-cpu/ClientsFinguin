import { describe, expect, it } from "vitest";
import { addClientRequest, changeClientRequest, isWaitingClient, removeClientRequest, requestDateError, setCheckpointDone, withCompletion } from "./checkpoint-tracking";
import { formatDayShortMonth } from "./dates";
import type { Checkpoint, Task } from "./types";

const point: Checkpoint = { code: "Т.1", title: "Получить ведомость", aside: "", gate: false, noteTitle: "", note: "", done: false };
const task: Task = { id: "t", parentId: null, title: "Спринт", assignee: "", status: "В работе", startDate: "2026-10-05", endDate: "2026-10-11", comments: [] };

describe("setCheckpointDone", () => {
  it("записывает день отметки", () => {
    expect(setCheckpointDone(point, true, "2026-10-10")).toMatchObject({ done: true, doneAt: "2026-10-10" });
  });
  it("не переписывает день у уже отмеченной точки", () => {
    expect(setCheckpointDone({ ...point, done: true, doneAt: "2026-10-01" }, true, "2026-10-10").doneAt).toBe("2026-10-01");
  });
  it("стирает день при снятии отметки", () => {
    const result = setCheckpointDone({ ...point, done: true, doneAt: "2026-10-01" }, false, "2026-10-10");
    expect(result.done).toBe(false);
    expect(result.doneAt).toBeUndefined();
  });
});

describe("запросы клиенту", () => {
  const asked: Checkpoint = { ...point, requests: ["2026-09-22", "2026-10-06"] };

  it("добавляет запрос с любой датой один раз и держит порядок", () => {
    const once = addClientRequest(asked, "2026-09-29");
    expect(once.requests).toEqual(["2026-09-22", "2026-09-29", "2026-10-06"]);
    expect(addClientRequest(once, "2026-09-29").requests).toEqual(["2026-09-22", "2026-09-29", "2026-10-06"]);
  });
  it("меняет дату запроса и пересортировывает", () => {
    expect(changeClientRequest(asked, "2026-10-06", "2026-09-15").requests).toEqual(["2026-09-15", "2026-09-22"]);
  });
  it("удаляет ошибочный запрос", () => {
    expect(removeClientRequest(asked, "2026-09-22").requests).toEqual(["2026-10-06"]);
    expect(isWaitingClient(removeClientRequest(removeClientRequest(asked, "2026-09-22"), "2026-10-06"))).toBe(false);
  });
  it("проверяет дату запроса", () => {
    expect(requestDateError(asked, "", "2026-10-10")).toBe("Укажите дату запроса.");
    expect(requestDateError(asked, "2026-10-11", "2026-10-10")).toBe("Дата запроса не может быть позже сегодняшнего дня.");
    expect(requestDateError(asked, "2026-09-22", "2026-10-10")).toBe("Запрос на эту дату уже есть.");
    expect(requestDateError(asked, "2026-09-22", "2026-10-10", "2026-09-22")).toBe("");
    expect(requestDateError(asked, "2026-10-10", "2026-10-10")).toBe("");
  });
  it("ждём клиента — только у незакрытой точки с запросами", () => {
    expect(isWaitingClient(point)).toBe(false);
    expect(isWaitingClient({ ...point, requests: ["2026-10-06"] })).toBe(true);
    expect(isWaitingClient({ ...point, requests: ["2026-10-06"], done: true })).toBe(false);
  });
});

describe("withCompletion", () => {
  it("ставит день при переходе в «Завершено»", () => {
    expect(withCompletion(task, { ...task, status: "Завершено" }, "2026-10-10").completedAt).toBe("2026-10-10");
  });
  it("сохраняет прежний день, если задача уже была завершена", () => {
    const done = { ...task, status: "Завершено" as const, completedAt: "2026-10-02" };
    expect(withCompletion(done, { ...done, title: "Новое имя" }, "2026-10-10").completedAt).toBe("2026-10-02");
  });
  it("не придумывает день для задачи, завершённой до появления поля", () => {
    const legacy = { ...task, status: "Завершено" as const };
    expect(withCompletion(legacy, { ...legacy }, "2026-10-10").completedAt).toBeUndefined();
  });
  it("стирает день, если задачу вернули в работу", () => {
    const done = { ...task, status: "Завершено" as const, completedAt: "2026-10-02" };
    expect(withCompletion(done, { ...done, status: "В работе" }, "2026-10-10").completedAt).toBeUndefined();
  });
  it("новая задача сразу в «Завершено» получает сегодняшний день", () => {
    expect(withCompletion(null, { ...task, status: "Завершено" }, "2026-10-10").completedAt).toBe("2026-10-10");
  });
});

describe("formatDayShortMonth", () => {
  it("пишет день и три буквы месяца", () => {
    expect(formatDayShortMonth("2026-10-05")).toBe("5 окт");
    expect(formatDayShortMonth("2026-05-31")).toBe("31 мая");
    expect(formatDayShortMonth("")).toBe("—");
  });
});
