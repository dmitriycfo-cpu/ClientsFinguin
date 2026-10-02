import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkpointProgress, countCheckpoints, expandTemplate, nextCheckpointCode, parseTypicalTasks, scheduleTemplate, TypicalTasksFormatError } from "./typical-tasks";
import type { Task } from "./types";

const markdown = readFileSync(new URL("../docs/typical-tasks.md", import.meta.url), "utf8");
const templates = parseTypicalTasks(markdown);
const byCode = (code: string) => templates.find((template) => template.code === code)!;

describe("parseTypicalTasks: реальный справочник", () => {
  it("находит обе задачи с длительностью и предпосылкой", () => {
    expect(templates.map((template) => template.code)).toEqual(["ДДС", "ФМ"]);
    expect(byCode("ДДС")).toMatchObject({ title: "Отчёт о движении денежных средств", weeks: 3 });
    expect(byCode("ДДС").premise).toBe("Предпосылка: используется сервис с интеграцией банковских выписок");
    expect(byCode("ФМ").premise.startsWith("Ритм встреч: интервью — одна встреча;")).toBe(true);
    expect(byCode("ФМ").premise.endsWith("точка Б — на следующей неделе.")).toBe(true);
  });

  it("разбирает подзадачи без групп в одну безымянную группу", () => {
    const [first, second, third] = byCode("ДДС").subtasks;
    expect(first).toMatchObject({ code: "ДДС-1", title: "Настройка сервиса и разнесение прошлого периода" });
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0].title).toBe("");
    expect(first.groups[0].items).toHaveLength(9);
    expect(second.groups[0].items).toHaveLength(5);
    expect(third.groups[0].items).toHaveLength(2);
  });

  it("разбирает группы с проверочным результатом", () => {
    const [first, second] = byCode("ФМ").subtasks;
    expect(first.groups.map((group) => group.title)).toEqual([
      "ФМ-1а. Сбор данных для построения финансовой модели",
      "ФМ-1б. Формирование точки А",
    ]);
    expect(first.groups[0].result).toBe("заполненная вкладка «Интервью»");
    expect(first.groups[1].result).toBe("");
    expect(first.groups[0].items).toHaveLength(12);
    expect(first.groups[1].items).toHaveLength(12);
    expect(second.groups[0].items).toHaveLength(5);
    expect(second.groups[1].items).toHaveLength(5);
  });

  it("склеивает многострочные пункты", () => {
    const item = byCode("ФМ").subtasks[0].groups[0].items[1];
    expect(item.code).toBe("ФМ-1.2");
    expect(item.title).toBe("Согласовано, как расходы привязываются к направлениям — где привязка корректна, где нет (переменные и прямые расходы)");
  });

  it("выделяет ремарку, ворота и пояснение", () => {
    const aside = byCode("ДДС").subtasks[0].groups[0].items[3];
    expect(aside).toMatchObject({ code: "ДДС-1.4", title: "Создан справочник статей", aside: "параллельно с интеграцией" });

    const gate = byCode("ФМ").subtasks[0].groups[1].items[11];
    expect(gate).toMatchObject({ code: "ФМ-1.22", title: "Клиент согласился с текущей точкой А", gate: true, noteTitle: "Согласие клиента с точкой А" });
    expect(gate.note.startsWith("Контрольные ворота спринта.")).toBe(true);

    const plain = byCode("ДДС").subtasks[0].groups[0].items[0];
    expect(plain).toMatchObject({ code: "ДДС-1.1", title: "Выбран сервис", aside: "", gate: false, noteTitle: "", note: "" });
  });

  it("привязывает все заметки", () => {
    const withNotes = (code: string) => byCode(code).subtasks.flatMap((subtask) => subtask.groups.flatMap((group) => group.items)).filter((item) => item.note).length;
    expect(withNotes("ДДС")).toBe(7);
    expect(withNotes("ФМ")).toBe(9);
  });
});

describe("parseTypicalTasks: ошибки формата", () => {
  const head = "# ТЕСТ. Тестовая задача\n\n**Длительность:** 1 неделя\n\n## ТЕСТ-1. Спринт\n\n";

  it("пункт с (i) без заметки", () => {
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт `(i)`\n")).toThrow(TypicalTasksFormatError);
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт `(i)`\n")).toThrow(/строка 7/);
  });

  it("заметка к несуществующему пункту", () => {
    const text = head + "- [ ] `ТЕСТ-1.1` Пункт\n\n## Заметки к задаче ТЕСТ\n\n**`ТЕСТ-1.9` Заголовок**\nТекст.\n";
    expect(() => parseTypicalTasks(text)).toThrow(/ТЕСТ-1\.9/);
  });

  it("пункт без кода", () => {
    expect(() => parseTypicalTasks(head + "- [ ] Пункт без кода\n")).toThrow(/без кода/);
  });

  it("длительность не числом недель", () => {
    const text = "# ТЕСТ. Тестовая задача\n\n**Длительность:** три недели\n\n## ТЕСТ-1. Спринт\n\n- [ ] `ТЕСТ-1.1` Пункт\n";
    expect(() => parseTypicalTasks(text)).toThrow(TypicalTasksFormatError);
    expect(() => parseTypicalTasks(text)).toThrow(/строка 3/);
    expect(() => parseTypicalTasks(text)).toThrow(/длительност/);
  });

  it("число недель не совпадает с числом подзадач", () => {
    const text = head + "- [ ] `ТЕСТ-1.1` Пункт\n\n## ТЕСТ-2. Второй спринт\n\n- [ ] `ТЕСТ-2.1` Пункт\n";
    expect(() => parseTypicalTasks(text)).toThrow(/недел/);
    // Ошибка указывает на строку заголовка задачи, а не на первую строку файла.
    expect(() => parseTypicalTasks("\n" + text)).toThrow(/строка 2/);
  });

  it("у задачи нет подзадач", () => {
    const text = "\n# ТЕСТ. Тестовая задача\n\n**Длительность:** 1 неделя\n";
    expect(() => parseTypicalTasks(text)).toThrow(/нет подзадач/);
    expect(() => parseTypicalTasks(text)).toThrow(/строка 2/);
  });

  it("игнорирует шаблон в блоке кода и вводную часть", () => {
    expect(parseTypicalTasks("# Заголовок\n\n| Код | Название |\n|---|---|\n\n```\n# КОД. Название\n- [ ] `КОД-1.1` Пункт\n```\n")).toEqual([]);
  });
});

describe("scheduleTemplate", () => {
  it("кладёт спринты по неделям от даты старта", () => {
    expect(scheduleTemplate(byCode("ДДС"), "2026-09-21")).toEqual([
      { code: "ДДС-1", title: "Настройка сервиса и разнесение прошлого периода", week: 1, startDate: "2026-09-21", endDate: "2026-09-27", checkpoints: 9 },
      { code: "ДДС-2", title: "Анализ данных и презентация инструмента", week: 2, startDate: "2026-09-28", endDate: "2026-10-04", checkpoints: 5 },
      { code: "ДДС-3", title: "Регламентация и видеоинструкция", week: 3, startDate: "2026-10-05", endDate: "2026-10-11", checkpoints: 2 },
    ]);
  });

  it("считает от любого дня недели", () => {
    expect(scheduleTemplate(byCode("ФМ"), "2026-09-24").map((sprint) => [sprint.startDate, sprint.endDate])).toEqual([
      ["2026-09-24", "2026-09-30"],
      ["2026-10-01", "2026-10-07"],
    ]);
  });
});

describe("expandTemplate", () => {
  let counter = 0;
  const makeId = () => "id-" + ++counter;
  const created = expandTemplate(byCode("ДДС"), "2026-09-21", "Иван Петров", makeId);
  const [parent, ...children] = created;

  it("создаёт надзадачу на весь срок", () => {
    expect(parent).toMatchObject({ id: "id-1", parentId: null, title: "Отчёт о движении денежных средств", assignee: "Иван Петров", status: "Не начато", startDate: "2026-09-21", endDate: "2026-10-11", comments: [], template: { code: "ДДС" } });
    expect(parent.groups).toBeUndefined();
  });

  it("создаёт подзадачи с точками, скопированными без отметок", () => {
    expect(children).toHaveLength(3);
    expect(children[0]).toMatchObject({ parentId: "id-1", title: "Настройка сервиса и разнесение прошлого периода", assignee: "Иван Петров", status: "Не начато", startDate: "2026-09-21", endDate: "2026-09-27", template: { code: "ДДС", subCode: "ДДС-1", week: 1 } });
    expect(children[0].groups![0].items[4]).toMatchObject({ code: "ДДС-1.5", done: false, noteTitle: "Проверка остатков денежных средств на расчётных счетах" });
    expect(children[2]).toMatchObject({ parentId: "id-1", assignee: "Иван Петров", status: "Не начато" });
    expect(children[2].template).toEqual({ code: "ДДС", subCode: "ДДС-3", week: 3 });
  });

  it("не делит массивы с шаблоном", () => {
    children[0].groups![0].items[0].done = true;
    expect(byCode("ДДС").subtasks[0].groups[0].items[0]).not.toHaveProperty("done");
  });
});

describe("checkpointProgress и nextCheckpointCode", () => {
  const sprint: Task = {
    id: "s", parentId: "p", title: "Спринт", assignee: "", status: "В работе", startDate: "2026-09-21", endDate: "2026-09-27", comments: [],
    template: { code: "ТЕСТ", subCode: "ТЕСТ-1", week: 1 },
    groups: [
      { title: "", result: "", items: [
        { code: "ТЕСТ-1.1", title: "А", aside: "", gate: false, noteTitle: "", note: "", done: true },
        { code: "ТЕСТ-1.3", title: "Б", aside: "", gate: false, noteTitle: "", note: "", done: false },
      ] },
    ],
  };
  const parent: Task = { id: "p", parentId: null, title: "Задача", assignee: "", status: "В работе", startDate: "2026-09-21", endDate: "2026-09-27", comments: [], template: { code: "ТЕСТ" } };
  const plain: Task = { id: "x", parentId: null, title: "Обычная", assignee: "", status: "В работе", startDate: "2026-09-21", endDate: "2026-09-27", comments: [] };

  it("считает прогресс спринта и суммирует по надзадаче", () => {
    expect(checkpointProgress(sprint, [parent, sprint, plain])).toEqual({ done: 1, total: 2 });
    expect(checkpointProgress(parent, [parent, sprint, plain])).toEqual({ done: 1, total: 2 });
    expect(checkpointProgress(plain, [parent, sprint, plain])).toBeNull();
  });

  it("выдаёт следующий свободный код точки", () => {
    expect(nextCheckpointCode(sprint)).toBe("ТЕСТ-1.4");
    expect(nextCheckpointCode({ ...sprint, groups: [] })).toBe("ТЕСТ-1.1");
  });

  it("считает точки шаблона", () => {
    expect(countCheckpoints(byCode("ДДС"))).toBe(16);
    expect(countCheckpoints(byCode("ФМ"))).toBe(34);
  });
});
