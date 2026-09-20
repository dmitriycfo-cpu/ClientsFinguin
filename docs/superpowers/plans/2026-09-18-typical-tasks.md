# Типовые задачи в дорожной карте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Типовая задача» в дорожной карте: выбор шаблона из `docs/typical-tasks.md`, дата старта и ответственный, автоматическое разворачивание надзадачи, недельных спринтов и редактируемых контрольных точек с пояснениями.

**Architecture:** Шаблоны разбираются из markdown на сервере (`lib/typical-tasks.ts`) при сборке страницы и передаются клиенту пропом. Типовая задача — это обычные `Task` с необязательными полями `template` и `groups`, поэтому Гант, фильтры, базовый план и хранилище не меняются. Контрольные точки копируются в задачу при создании и дальше принадлежат клиенту. Новые диалоги живут в отдельных файлах, `ModalShell` и `PersonSelect` выносятся из `dashboard.tsx`, чтобы их можно было переиспользовать.

**Tech Stack:** Next.js 16 (App Router, статическая страница), React 19, TypeScript strict, lucide-react, vitest (добавляется в этом плане), pnpm.

**Spec:** `docs/superpowers/specs/2026-09-18-typical-tasks-design.md`. Утверждённый макет: https://claude.ai/artifact/8HWtLxKPjK7XLQaYpNJDcw — при любых сомнениях в разметке или поведении сверяться с ним.

## Global Constraints

- Весь текст интерфейса и сообщений об ошибках — по-русски, с буквой «ё». Сообщения коммитов — по-русски, в повелительном наклонении, как в истории репозитория («Считать дату «сегодня» в браузере, а не на сборке»).
- В интерфейсе для финансового директора не должно быть упоминаний файлов, путей и того, откуда берутся шаблоны. Экраны компактные, без поясняющих текстов.
- Перед любой правкой Next.js-кода читать `node_modules/next/dist/docs/` (см. `AGENTS.md`): версия 16.3.1 отличается от известных по обучению.
- Даты в приложении — строки `ГГГГ-ММ-ДД`, разбираются только через `parseDate`/`toISO` из `lib/dates.ts`.
- Пакетный менеджер — `pnpm`. Проверка перед коммитом: `pnpm test`, `pnpm lint`, `pnpm build`.
- Файл `docs/typical-tasks.md` — источник шаблонов, его содержимое не менять (кроме случая, когда парсер находит реальную ошибку формата — тогда исправить минимально и сказать об этом).
- `dashboard.tsx` уже 1747 строк: новый код диалогов и редактора точек — в отдельных файлах `components/`.
- Каждый коммит заканчивать строкой `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Структура файлов

| Файл | Ответственность |
|------|-----------------|
| `lib/types.ts` (изменить) | Типы `Checkpoint`, `CheckpointGroup`, поля `template`/`groups` у `Task` |
| `lib/dates.ts` (изменить) | `startOfWeek`, `nextMonday`, `weekdayName` |
| `lib/typical-tasks.ts` (создать) | Парсер markdown, расчёт расписания, разворачивание в задачи, прогресс, следующий код точки |
| `lib/typical-tasks.test.ts`, `lib/dates.test.ts` (создать) | Юнит-тесты (vitest) |
| `app/page.tsx` (изменить) | Чтение `docs/typical-tasks.md` при сборке, проп `templates` |
| `components/modal-shell.tsx` (создать) | `ModalShell`, вынесен из дашборда без изменений |
| `components/person-select.tsx` (создать) | `PersonSelect`, `normalizePerson`, вынесены из дашборда без изменений |
| `components/template-dialog.tsx` (создать) | Диалог «Типовая задача» в два шага |
| `components/checkpoints-editor.tsx` (создать) | Чек-лист контрольных точек с правкой, `ProgressRing` |
| `components/dashboard.tsx` (изменить) | Кнопка, состояние модалки, добавление задач, чипы и прогресс в таблице, режимы `TaskDialog` для типовых задач |
| `app/globals.css` (изменить) | Стили из макета |
| `README.md` (изменить) | Раздел «Типовые задачи» |

---

### Task 1: Тест-раннер, типы и помощники дат

**Files:**
- Modify: `package.json`
- Modify: `lib/types.ts`
- Modify: `lib/dates.ts`
- Test: `lib/dates.test.ts`

**Interfaces:**
- Produces: `Checkpoint`, `CheckpointGroup`, `Task.template?`, `Task.groups?` в `lib/types.ts`; `startOfWeek(value: string): string`, `nextMonday(value: string): string`, `weekdayName(value: string): string` в `lib/dates.ts`; скрипт `pnpm test`.

- [x] **Step 1: Установить vitest и добавить скрипт**

```bash
pnpm add -D vitest
```

В `package.json` в `scripts` добавить строку `"test": "vitest run"` (после `"lint"`). Vitest читает `.ts` без настройки; тесты используют относительные импорты, а не алиас `@/`.

- [x] **Step 2: Написать падающий тест на помощники дат**

Создать `lib/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextMonday, startOfWeek, weekdayName } from "./dates";

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

describe("weekdayName", () => {
  it("называет день недели по-русски", () => {
    expect(weekdayName("2026-09-18")).toBe("пятница");
    expect(weekdayName("2026-09-21")).toBe("понедельник");
  });
});
```

- [x] **Step 3: Убедиться, что тест падает**

Run: `pnpm test lib/dates.test.ts`
Expected: FAIL — `nextMonday`, `startOfWeek`, `weekdayName` не экспортируются.

- [x] **Step 4: Добавить помощники в `lib/dates.ts`**

Дописать в конец файла:

```ts
const WEEKDAY_NAMES = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

// Понедельник недели, в которую попадает дата.
export function startOfWeek(value: string) {
  const date = parseDate(value);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return toISO(date);
}

// Ближайший понедельник: сама дата, если это понедельник, иначе следующий.
export function nextMonday(value: string) {
  const date = parseDate(value);
  date.setDate(date.getDate() + (8 - date.getDay()) % 7);
  return toISO(date);
}

export function weekdayName(value: string) {
  return WEEKDAY_NAMES[parseDate(value).getDay()];
}
```

- [x] **Step 5: Добавить типы в `lib/types.ts`**

После `export interface BaselineTask { ... }` и перед `Baselines` вставить:

```ts
// Контрольная точка типовой задачи. Копируется из шаблона при создании и дальше
// принадлежит клиенту: текст, пояснение и состав точек можно менять.
export interface Checkpoint {
  code: string;        // «ДДС-1.5», стабильный ключ
  title: string;
  aside: string;       // ремарка в скобках, например «параллельно с интеграцией»
  gate: boolean;       // контрольные ворота — без них спринт не считается закрытым
  noteTitle: string;   // заголовок пояснения; пустой, если пояснения нет
  note: string;        // текст пояснения
  done: boolean;
}

export interface CheckpointGroup {
  title: string;       // «ФМ-1а. Сбор данных…» или пустая строка
  result: string;      // «Проверочный результат», может быть пустым
  items: Checkpoint[];
}

export interface TaskTemplateRef {
  code: string;        // код шаблона, «ДДС»
  subCode?: string;    // код спринта, «ДДС-1» — только у подзадач
  week?: number;       // номер спринта — только у подзадач
}
```

В `interface Task` после `comments: string[];` добавить:

```ts
  // Заполнены только у задач, созданных из типовой задачи.
  template?: TaskTemplateRef;
  groups?: CheckpointGroup[];
```

- [x] **Step 6: Прогнать тесты, линтер и сборку**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: тесты PASS, линтер и сборка без ошибок.

- [x] **Step 7: Коммит**

```bash
git add package.json pnpm-lock.yaml lib/types.ts lib/dates.ts lib/dates.test.ts
git commit -m "Добавить типы контрольных точек, помощники недель и vitest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Парсер справочника типовых задач

**Files:**
- Create: `lib/typical-tasks.ts`
- Test: `lib/typical-tasks.test.ts`

**Interfaces:**
- Consumes: `CheckpointGroup` из Task 1 (структурно совпадает с `TemplateGroup`, но без `done`).
- Produces:

```ts
export interface TemplateCheckpoint { code: string; title: string; aside: string; gate: boolean; noteTitle: string; note: string; }
export interface TemplateGroup { title: string; result: string; items: TemplateCheckpoint[]; }
export interface TemplateSubtask { code: string; title: string; groups: TemplateGroup[]; }
export interface TypicalTaskTemplate { code: string; title: string; weeks: number; premise: string; subtasks: TemplateSubtask[]; }
export class TypicalTasksFormatError extends Error { line: number }
export function parseTypicalTasks(markdown: string): TypicalTaskTemplate[];
```

- [x] **Step 1: Написать падающие тесты по реальному файлу**

Создать `lib/typical-tasks.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTypicalTasks, TypicalTasksFormatError } from "./typical-tasks";

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
    expect(first.groups[0].items).toHaveLength(10);
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

  it("число недель не совпадает с числом подзадач", () => {
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт\n\n## ТЕСТ-2. Второй спринт\n\n- [ ] `ТЕСТ-2.1` Пункт\n")).toThrow(/недел/);
  });

  it("игнорирует шаблон в блоке кода и вводную часть", () => {
    expect(parseTypicalTasks("# Заголовок\n\n| Код | Название |\n|---|---|\n\n```\n# КОД. Название\n- [ ] `КОД-1.1` Пункт\n```\n")).toEqual([]);
  });
});
```

- [x] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test lib/typical-tasks.test.ts`
Expected: FAIL — модуль `./typical-tasks` не найден.

- [x] **Step 3: Написать парсер**

Создать `lib/typical-tasks.ts`:

```ts
export interface TemplateCheckpoint {
  code: string;
  title: string;
  aside: string;
  gate: boolean;
  noteTitle: string;
  note: string;
}

export interface TemplateGroup {
  title: string;
  result: string;
  items: TemplateCheckpoint[];
}

export interface TemplateSubtask {
  code: string;
  title: string;
  groups: TemplateGroup[];
}

export interface TypicalTaskTemplate {
  code: string;
  title: string;
  weeks: number;
  premise: string;
  subtasks: TemplateSubtask[];
}

export class TypicalTasksFormatError extends Error {
  line: number;

  constructor(line: number, message: string) {
    super("typical-tasks.md, строка " + line + ": " + message);
    this.name = "TypicalTasksFormatError";
    this.line = line;
  }
}

// Формат описан в самом docs/typical-tasks.md (раздел «Соглашения»).
const TEMPLATE_HEADING = /^# (\S+)\. (.+)$/;
const SUBTASK_HEADING = /^## (\S+)\. (.+)$/;
const GROUP_HEADING = /^### (.+)$/;
const NOTES_HEADING = /^## Заметки к задаче (\S+)$/;
const DURATION = /^\*\*Длительность:\*\* (\d+)/;
const RESULT = /^\*\*Проверочный результат:\*\* (.+)$/;
const META = /^\*\*([^*:]+):\*\* (.+)$/;
const ITEM = /^- \[[ xX]\] `([^`]+)` (.+)$/;
const NOTE_HEADING = /^\*\*`([^`]+)` (.+)\*\*$/;
const NOTE_MARKER = /\s*`\(i\)`\s*$/;
const ASIDE = /\s*\*\(([^)]+)\)\*\s*$/;
const GATE = /^\*\*(.+)\*\*$/;

type Continuation =
  | { kind: "item"; item: TemplateCheckpoint }
  | { kind: "premise" }
  | { kind: "note"; code: string }
  | null;

export function parseTypicalTasks(markdown: string): TypicalTaskTemplate[] {
  const lines = markdown.split(/\r?\n/);
  const templates: TypicalTaskTemplate[] = [];
  const itemLines = new Map<string, number>();
  const pending: Array<{ item: TemplateCheckpoint; line: number }> = [];
  const notes = new Map<string, { title: string; text: string[]; line: number }>();

  let template: TypicalTaskTemplate | null = null;
  let subtask: TemplateSubtask | null = null;
  let group: TemplateGroup | null = null;
  let inNotes = false;
  let inFence = false;
  let continuation: Continuation = null;

  const currentGroup = (lineNumber: number) => {
    if (!subtask) throw new TypicalTasksFormatError(lineNumber, "пункт вне подзадачи");
    if (!group) {
      group = { title: "", result: "", items: [] };
      subtask.groups.push(group);
    }
    return group;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.startsWith("```")) { inFence = !inFence; return; }
    if (inFence) return;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "---") { continuation = null; return; }

    let match = TEMPLATE_HEADING.exec(line);
    if (match) {
      template = { code: match[1], title: match[2].trim(), weeks: 0, premise: "", subtasks: [] };
      templates.push(template);
      subtask = null; group = null; inNotes = false; continuation = null;
      return;
    }
    if (line.startsWith("# ")) { template = null; subtask = null; group = null; inNotes = false; continuation = null; return; }
    if (!template) return;

    match = NOTES_HEADING.exec(line);
    if (match) {
      if (match[1] !== template.code) throw new TypicalTasksFormatError(lineNumber, "заметки к задаче " + match[1] + " внутри задачи " + template.code);
      inNotes = true; subtask = null; group = null; continuation = null;
      return;
    }
    if (inNotes) {
      match = NOTE_HEADING.exec(line);
      if (match) {
        if (notes.has(match[1])) throw new TypicalTasksFormatError(lineNumber, "повторная заметка к пункту " + match[1]);
        notes.set(match[1], { title: match[2].trim(), text: [], line: lineNumber });
        continuation = { kind: "note", code: match[1] };
        return;
      }
      if (continuation?.kind === "note") { notes.get(continuation.code)!.text.push(trimmed); return; }
      throw new TypicalTasksFormatError(lineNumber, "в разделе заметок ожидался заголовок вида **`КОД-1.2` Заголовок**");
    }

    match = SUBTASK_HEADING.exec(line);
    if (match) {
      subtask = { code: match[1], title: match[2].trim(), groups: [] };
      template.subtasks.push(subtask);
      group = null; continuation = null;
      return;
    }
    match = GROUP_HEADING.exec(line);
    if (match) {
      if (!subtask) throw new TypicalTasksFormatError(lineNumber, "группа пунктов вне подзадачи");
      group = { title: match[1].trim(), result: "", items: [] };
      subtask.groups.push(group);
      continuation = null;
      return;
    }
    match = DURATION.exec(line);
    if (match) { template.weeks = Number(match[1]); continuation = null; return; }
    match = RESULT.exec(line);
    if (match) { currentGroup(lineNumber).result = match[1].trim(); continuation = null; return; }
    match = ITEM.exec(line);
    if (match) {
      if (itemLines.has(match[1])) throw new TypicalTasksFormatError(lineNumber, "повторный код пункта " + match[1]);
      const item: TemplateCheckpoint = { code: match[1], title: match[2].trim(), aside: "", gate: false, noteTitle: "", note: "" };
      currentGroup(lineNumber).items.push(item);
      itemLines.set(item.code, lineNumber);
      pending.push({ item, line: lineNumber });
      continuation = { kind: "item", item };
      return;
    }
    match = META.exec(line);
    if (match) {
      // Внутри подзадачи строки вроде «**Спринт:** неделя 1» интерфейсу не нужны.
      if (subtask) { continuation = null; return; }
      const text = match[1].trim() + ": " + match[2].trim();
      template.premise = template.premise ? template.premise + "\n" + text : text;
      continuation = { kind: "premise" };
      return;
    }
    if (line.startsWith("- ")) throw new TypicalTasksFormatError(lineNumber, "пункт без кода: ожидалось «- [ ] `КОД-1.2` Текст»");
    if (continuation?.kind === "item") { continuation.item.title += " " + trimmed; return; }
    if (continuation?.kind === "premise") { template.premise += " " + trimmed; return; }
    // Прочий описательный текст в интерфейс не попадает.
  });

  for (const { item, line } of pending) {
    let title = item.title;
    const hasNoteMarker = NOTE_MARKER.test(title);
    title = title.replace(NOTE_MARKER, "");
    const aside = ASIDE.exec(title);
    if (aside) { item.aside = aside[1].trim(); title = title.replace(ASIDE, ""); }
    const gate = GATE.exec(title.trim());
    if (gate) { item.gate = true; title = gate[1]; }
    item.title = title.trim();

    const note = notes.get(item.code);
    if (hasNoteMarker && !note) throw new TypicalTasksFormatError(line, "пункт " + item.code + " помечен (i), но заметки к нему нет");
    if (note && !hasNoteMarker) throw new TypicalTasksFormatError(note.line, "заметка к пункту " + item.code + ", который не помечен (i)");
    if (note) { item.noteTitle = note.title; item.note = note.text.join(" "); }
  }
  for (const [code, note] of notes) {
    if (!itemLines.has(code)) throw new TypicalTasksFormatError(note.line, "заметка к несуществующему пункту " + code);
  }
  for (const item of templates) {
    if (item.subtasks.length === 0) throw new TypicalTasksFormatError(1, "у задачи " + item.code + " нет подзадач");
    if (item.weeks !== item.subtasks.length) throw new TypicalTasksFormatError(1, "у задачи " + item.code + " " + item.weeks + " недель, а подзадач " + item.subtasks.length + ": подзадача занимает ровно одну неделю");
  }
  return templates;
}
```

- [x] **Step 4: Убедиться, что тесты проходят**

Run: `pnpm test lib/typical-tasks.test.ts`
Expected: PASS. Если тест на реальный файл падает из-за расхождения с ожидаемыми числами — сначала пересчитать вручную по `docs/typical-tasks.md`, а не подгонять парсер.

- [x] **Step 5: Коммит**

```bash
git add lib/typical-tasks.ts lib/typical-tasks.test.ts
git commit -m "Разбирать справочник типовых задач из markdown

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Расписание, разворачивание в задачи и прогресс

**Files:**
- Modify: `lib/typical-tasks.ts`
- Test: `lib/typical-tasks.test.ts`

**Interfaces:**
- Consumes: `addDays` из `lib/dates.ts`; `Task`, `CheckpointGroup` из `lib/types.ts`.
- Produces:

```ts
export interface SprintSchedule { code: string; title: string; week: number; startDate: string; endDate: string; checkpoints: number; }
export function scheduleTemplate(template: TypicalTaskTemplate, startDate: string): SprintSchedule[];
export function expandTemplate(template: TypicalTaskTemplate, startDate: string, assignee: string, makeId?: () => string): Task[];
export function checkpointProgress(task: Task, tasks: Task[]): { done: number; total: number } | null;
export function nextCheckpointCode(task: Task): string;
export function countCheckpoints(template: TypicalTaskTemplate): number;
```

- [x] **Step 1: Дописать падающие тесты**

В конец `lib/typical-tasks.test.ts` добавить (импорт расширить: `import { checkpointProgress, countCheckpoints, expandTemplate, nextCheckpointCode, parseTypicalTasks, scheduleTemplate, TypicalTasksFormatError } from "./typical-tasks";` и `import type { Task } from "./types";`):

```ts
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
    expect(children[0]).toMatchObject({ parentId: "id-1", title: "Настройка сервиса и разнесение прошлого периода", startDate: "2026-09-21", endDate: "2026-09-27", template: { code: "ДДС", subCode: "ДДС-1", week: 1 } });
    expect(children[0].groups![0].items[4]).toMatchObject({ code: "ДДС-1.5", done: false, noteTitle: "Проверка остатков денежных средств на расчётных счетах" });
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
    expect(countCheckpoints(byCode("ФМ"))).toBe(32);
  });
});
```

- [x] **Step 2: Убедиться, что тесты падают**

Run: `pnpm test lib/typical-tasks.test.ts`
Expected: FAIL — функции не экспортируются.

- [x] **Step 3: Реализовать функции**

В начало `lib/typical-tasks.ts` добавить импорты:

```ts
import { addDays } from "./dates";
import type { CheckpointGroup, Task } from "./types";
```

В конец файла дописать:

```ts
export interface SprintSchedule {
  code: string;
  title: string;
  week: number;
  startDate: string;
  endDate: string;
  checkpoints: number;
}

export function countCheckpoints(template: TypicalTaskTemplate) {
  return template.subtasks.reduce((sum, subtask) => sum + subtask.groups.reduce((inner, group) => inner + group.items.length, 0), 0);
}

// Подзадача k занимает ровно одну неделю, начиная с startDate + 7·(k−1). Праздники не учитываются.
export function scheduleTemplate(template: TypicalTaskTemplate, startDate: string): SprintSchedule[] {
  return template.subtasks.map((subtask, index) => ({
    code: subtask.code,
    title: subtask.title,
    week: index + 1,
    startDate: addDays(startDate, 7 * index),
    endDate: addDays(startDate, 7 * index + 6),
    checkpoints: subtask.groups.reduce((sum, group) => sum + group.items.length, 0),
  }));
}

function copyGroups(subtask: TemplateSubtask): CheckpointGroup[] {
  return subtask.groups.map((group) => ({
    title: group.title,
    result: group.result,
    items: group.items.map((item) => ({ ...item, done: false })),
  }));
}

// Надзадача и подзадачи-спринты. Точки копируются: дальше они принадлежат клиенту.
export function expandTemplate(
  template: TypicalTaskTemplate,
  startDate: string,
  assignee: string,
  makeId: () => string = () => crypto.randomUUID()
): Task[] {
  const parentId = makeId();
  const schedule = scheduleTemplate(template, startDate);
  const children: Task[] = template.subtasks.map((subtask, index) => ({
    id: makeId(),
    parentId,
    title: subtask.title,
    assignee,
    status: "Не начато",
    startDate: schedule[index].startDate,
    endDate: schedule[index].endDate,
    comments: [],
    template: { code: template.code, subCode: subtask.code, week: index + 1 },
    groups: copyGroups(subtask),
  }));
  const parent: Task = {
    id: parentId,
    parentId: null,
    title: template.title,
    assignee,
    status: "Не начато",
    startDate,
    endDate: schedule[schedule.length - 1].endDate,
    comments: [],
    template: { code: template.code },
  };
  return [parent, ...children];
}

export function taskCheckpoints(task: Task) {
  return (task.groups ?? []).flatMap((group) => group.items);
}

// null — у обычных задач, чтобы таблица не рисовала пустой счётчик.
export function checkpointProgress(task: Task, tasks: Task[]): { done: number; total: number } | null {
  if (!task.template) return null;
  if (task.template.subCode) {
    const items = taskCheckpoints(task);
    return { done: items.filter((item) => item.done).length, total: items.length };
  }
  return tasks
    .filter((child) => child.parentId === task.id)
    .reduce((sum, child) => {
      const progress = checkpointProgress(child, tasks);
      return progress ? { done: sum.done + progress.done, total: sum.total + progress.total } : sum;
    }, { done: 0, total: 0 });
}

// Новая точка получает следующий номер после максимального, чтобы коды не повторялись
// даже после удаления пунктов из середины.
export function nextCheckpointCode(task: Task) {
  const prefix = task.template?.subCode ?? task.template?.code ?? "Т";
  const numbers = taskCheckpoints(task).map((item) => Number(item.code.split(".").pop()) || 0);
  return prefix + "." + (Math.max(0, ...numbers) + 1);
}
```

- [x] **Step 4: Убедиться, что тесты проходят**

Run: `pnpm test`
Expected: PASS.

- [x] **Step 5: Коммит**

```bash
git add lib/typical-tasks.ts lib/typical-tasks.test.ts
git commit -m "Разворачивать типовую задачу в спринты и считать прогресс по точкам

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Загрузка шаблонов на странице

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/dashboard.tsx:971` (сигнатура `Dashboard`)

**Interfaces:**
- Consumes: `parseTypicalTasks` из Task 2.
- Produces: проп `templates: TypicalTaskTemplate[]` у `Dashboard`.

- [x] **Step 1: Проверить по документации Next, что серверный компонент может быть async и читать файлы при сборке**

Прочитать `node_modules/next/dist/docs/01-app/01-getting-started/` (файл про server components / fetching data) и убедиться, что `export default async function Page()` допустим. Страница остаётся статической: `fs.readFile` выполняется при сборке, поэтому трассировка файлов (`outputFileTracingIncludes`) не нужна — документация `output.md` прямо говорит, что полностью статические страницы ею не затрагиваются.

- [x] **Step 2: Читать и разбирать файл в `app/page.tsx`**

Заменить содержимое файла:

```tsx
import { promises as fs } from "node:fs";
import path from "node:path";
import Dashboard from "@/components/dashboard";
import { toISO } from "@/lib/dates";
import { DEFAULT_DATA } from "@/lib/default-data";
import { parseTypicalTasks } from "@/lib/typical-tasks";

// Справочник типовых задач лежит в репозитории и читается при сборке страницы.
// Ошибка формата валит сборку — так кривой шаблон не доедет до клиентов.
async function loadTemplates() {
  const markdown = await fs.readFile(path.join(process.cwd(), "docs", "typical-tasks.md"), "utf8");
  return parseTypicalTasks(markdown);
}

export default async function Page() {
  const templates = await loadTemplates();
  // Дата, с которой отрендерена статическая разметка. Клиент получает её как серверный
  // снимок, чтобы гидратация прошла без расхождений, а сразу после неё React заменит её
  // настоящей датой браузера. Без этого пропса клиент считал бы серверный снимок сам и
  // получал бы не то, что вшито в HTML.
  return <Dashboard initialData={DEFAULT_DATA} serverToday={toISO(new Date())} templates={templates} />;
}
```

- [x] **Step 3: Принять проп в `Dashboard`**

В `components/dashboard.tsx` добавить импорт `import type { TypicalTaskTemplate } from "@/lib/typical-tasks";` и заменить сигнатуру:

```tsx
export default function Dashboard({ initialData, serverToday, templates }: { initialData: DashboardData; serverToday: string; templates: TypicalTaskTemplate[] }) {
```

Чтобы линтер не ругался на неиспользуемый проп до Task 6, временно ничего не делать — ESLint по умолчанию не ругается на неиспользуемые деструктурированные пропсы в Next-конфиге; если ругается, оставить строку `void templates;` с комментарием `// используется в диалоге типовой задачи (Task 6)` и убрать её в Task 6.

- [x] **Step 4: Линтер и сборка**

Run: `pnpm lint && pnpm build`
Expected: без ошибок; в выводе сборки страница `/` помечена как статическая (символ `○`).

- [x] **Step 5: Коммит**

```bash
git add app/page.tsx components/dashboard.tsx
git commit -m "Читать справочник типовых задач при сборке страницы

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Вынести `ModalShell` и `PersonSelect` в отдельные файлы

Чистый рефакторинг без изменения поведения — нужен, чтобы новые диалоги в отдельных файлах могли переиспользовать обёртку и выбор людей.

**Files:**
- Create: `components/modal-shell.tsx`
- Create: `components/person-select.tsx`
- Modify: `components/dashboard.tsx:280-378, 505-541`

**Interfaces:**
- Produces: `export default function ModalShell({ title, subtitle, children, onClose })`; `export default function PersonSelect({ value, onChange, people, onAddPerson, onDeletePerson })`; `export function normalizePerson(value: string): string`; `export type PersonPickerProps`.

- [x] **Step 1: Создать `components/modal-shell.tsx`**

Перенести функцию `ModalShell` из `dashboard.tsx` (строки 505–541) дословно:

```tsx
"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export default function ModalShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div><h3>{title}</h3><p>{subtitle}</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}
```

- [x] **Step 2: Создать `components/person-select.tsx`**

Перенести `normalizePerson`, `PersonPickerProps` и `PersonSelect` (строки 280–378) дословно, добавив экспорт и импорты:

```tsx
"use client";

import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export function normalizePerson(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export type PersonPickerProps = {
  people: string[];
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
};

export default function PersonSelect({ ...как в dashboard.tsx, тело без изменений... }
```

(Тело `PersonSelect` скопировать целиком из `dashboard.tsx`, оно не меняется.)

- [x] **Step 3: Удалить перенесённое из `dashboard.tsx` и импортировать**

В `dashboard.tsx` удалить `normalizePerson`, `PersonPickerProps`, `PersonSelect`, `ModalShell`. Добавить импорты:

```tsx
import ModalShell from "@/components/modal-shell";
import PersonSelect, { normalizePerson } from "@/components/person-select";
import type { PersonPickerProps } from "@/components/person-select";
```

`splitPeople`, `mergePeople`, `PeopleSelect` остаются в `dashboard.tsx` и используют импортированный `normalizePerson`. Если после удаления какие-то иконки lucide в `dashboard.tsx` перестали использоваться (`Check`), убрать их из импорта — линтер подскажет.

- [x] **Step 4: Линтер и сборка**

Run: `pnpm lint && pnpm build`
Expected: без ошибок и предупреждений о неиспользуемых импортах.

- [x] **Step 5: Ручная проверка**

Run: `pnpm dev`, открыть http://localhost:3000, нажать «Новая задача»: окно открывается, Esc закрывает, выбор ответственного работает (выпадающий список, добавление нового имени).

- [x] **Step 6: Коммит**

```bash
git add components/modal-shell.tsx components/person-select.tsx components/dashboard.tsx
git commit -m "Вынести обёртку диалога и выбор ответственного в отдельные файлы

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Диалог «Типовая задача» и добавление в карту

**Files:**
- Create: `components/template-dialog.tsx`
- Modify: `components/dashboard.tsx` (тип `ModalState` ~строка 96, `roadmap-actions` ~1552, `scrollGanttToToday` ~1421, рендер диалогов ~1724, функции рядом с `saveTask` ~1222)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ModalShell`, `PersonSelect`, `PersonPickerProps` (Task 5); `scheduleTemplate`, `expandTemplate`, `countCheckpoints`, `TypicalTaskTemplate` (Tasks 2–3); `nextMonday`, `startOfWeek`, `weekdayName`, `isValidDateValue`, `parseDate` (`lib/dates.ts`).
- Produces: `TemplateDialog` с пропсами `{ templates, tasks, people, today, onAddPerson, onDeletePerson, onClose, onAdd: (tasks: Task[]) => void }`; в дашборде `ModalState` получает вариант `{ kind: "template" }`, функция `addTemplateTasks(newTasks: Task[])`, `scrollGanttToDate(value: string)`.

- [x] **Step 1: Написать `components/template-dialog.tsx`**

```tsx
"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import ModalShell from "@/components/modal-shell";
import PersonSelect from "@/components/person-select";
import type { PersonPickerProps } from "@/components/person-select";
import { isValidDateValue, nextMonday, parseDate, startOfWeek, weekdayName } from "@/lib/dates";
import { countCheckpoints, expandTemplate, scheduleTemplate } from "@/lib/typical-tasks";
import type { TypicalTaskTemplate } from "@/lib/typical-tasks";
import type { Task } from "@/lib/types";

function formatDayMonth(value: string) {
  const date = parseDate(value);
  return String(date.getDate()).padStart(2, "0") + "." + String(date.getMonth() + 1).padStart(2, "0");
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function TemplateDialog({
  templates,
  tasks,
  people,
  today,
  onAddPerson,
  onDeletePerson,
  onClose,
  onAdd,
}: PersonPickerProps & {
  templates: TypicalTaskTemplate[];
  tasks: Task[];
  today: string;
  onClose: () => void;
  onAdd: (tasks: Task[]) => void;
}) {
  const [picked, setPicked] = useState<TypicalTaskTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState(() => nextMonday(today));
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");

  // Шаг 1: компактный список. Реестр может вырасти до 15–20 задач, поэтому поиск и никаких пояснений.
  if (!picked) {
    const needle = query.trim().toLocaleLowerCase("ru");
    const visible = templates.filter((template) => !needle || template.code.toLocaleLowerCase("ru").includes(needle) || template.title.toLocaleLowerCase("ru").includes(needle));
    return (
      <ModalShell title="Типовая задача" subtitle="Шаг 1 из 2 · выберите задачу" onClose={onClose}>
        <div className="modal-body">
          <label className="tpl-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по коду или названию" /></label>
          <div className="tpl-list">
            {visible.map((template) => {
              const existing = tasks.find((task) => !task.parentId && task.template?.code === template.code);
              const checkpoints = countCheckpoints(template);
              return (
                <button type="button" className="tpl-row" key={template.code} onClick={() => setPicked(template)}>
                  <span className="code-chip code-chip-parent">{template.code}</span>
                  <b>{template.title}</b>
                  {existing ? <span className="tpl-exists">уже в карте с {formatDayMonth(existing.startDate)}</span> : <span />}
                  <span className="tpl-meta">{template.weeks} нед. · {checkpoints} {plural(checkpoints, "точка", "точки", "точек")}</span>
                </button>
              );
            })}
            {visible.length === 0 && <div className="tpl-empty">Ничего не найдено</div>}
          </div>
        </div>
        <footer className="modal-actions">
          <span className="field-note">{templates.length} {plural(templates.length, "типовая задача", "типовые задачи", "типовых задач")}</span>
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button></div>
        </footer>
      </ModalShell>
    );
  }

  // Шаг 2: дата, ответственный, предпросмотр расписания.
  const validDate = isValidDateValue(startDate);
  const schedule = validDate ? scheduleTemplate(picked, startDate) : [];
  const endDate = schedule.length > 0 ? schedule[schedule.length - 1].endDate : "";
  const isMonday = validDate && parseDate(startDate).getDay() === 1;
  const monday = validDate ? startOfWeek(startDate) : "";

  function submit() {
    if (!validDate) return setError("Укажите дату начала.");
    onAdd(expandTemplate(picked!, startDate, assignee.trim()));
  }

  return (
    <ModalShell title={picked.code + ". " + picked.title} subtitle="Шаг 2 из 2 · дата старта и ответственный, дальше сроки считаются по нормативу" onClose={onClose}>
      <div className="modal-body">
        <div className="form-grid">
          <label className="field">Дата начала
            <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setError(""); }} />
            {validDate && (isMonday
              ? <span className="field-note">Понедельник — спринты лягут ровно по неделям.</span>
              : <span className="field-note field-note-warn">Выбран {weekdayName(startDate)}. Спринты будут считаться с этого дня. <button type="button" onClick={() => setStartDate(monday)}>Сдвинуть на понедельник {formatDayMonth(monday)}</button></span>)}
          </label>
          <div className="field"><span>Ответственный</span><PersonSelect value={assignee} onChange={setAssignee} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
        </div>
        {picked.premise && <p className="field-note tpl-premise">{picked.premise}</p>}
        <div className="tpl-preview">
          <div className="tpl-preview-head"><span>Что появится в дорожной карте</span><span>надзадача + {schedule.length} {plural(schedule.length, "подзадача", "подзадачи", "подзадач")}</span></div>
          {schedule.map((sprint) => (
            <div className="tpl-preview-row" key={sprint.code}>
              <span className="tpl-week">Неделя {sprint.week}</span>
              <span className="tpl-dates">{formatDayMonth(sprint.startDate)} — {formatDayMonth(sprint.endDate)}</span>
              <span className="tpl-name"><span className="code-chip">{sprint.code}</span><b>{sprint.title}</b></span>
              <span className="tpl-count">{sprint.checkpoints} {plural(sprint.checkpoints, "точка", "точки", "точек")}</span>
            </div>
          ))}
          {validDate && <div className="tpl-preview-total"><span>Старт <b>{formatDayMonth(startDate)}</b></span><span>Дедлайн <b>{formatDayMonth(endDate)}</b>, {weekdayName(endDate)}</span><span>Контрольных точек <b>{countCheckpoints(picked)}</b></span></div>}
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
      <footer className="modal-actions">
        <button type="button" className="modal-back" onClick={() => setPicked(null)}><ArrowLeft size={16} />Другой шаблон</button>
        <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="button" className="primary" onClick={submit}>Добавить в карту</button></div>
      </footer>
    </ModalShell>
  );
}
```

- [x] **Step 2: Подключить диалог в `dashboard.tsx`**

1. Импорты: `import TemplateDialog from "@/components/template-dialog";` и иконку `ClipboardCheck` в импорт из `lucide-react`.
2. В `ModalState` добавить вариант `| { kind: "template" }`.
3. Рядом с `saveTask` добавить:

```tsx
  function addTemplateTasks(newTasks: Task[]) {
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, [newTasks[0].assignee]),
      tasks: [...current.tasks, ...newTasks],
    }));
    setModal(null);
    scrollGanttToDate(newTasks[0].startDate);
  }
```

4. Заменить `scrollGanttToToday` на общую функцию и оставить кнопку «Сегодня» работающей:

```tsx
  function scrollGanttToDate(value: string) {
    const scroller = ganttScrollRef.current;
    if (!scroller) return;
    const monthStart = startOfMonth(parseDate(value));
    const daysFromRangeStart = Math.max(0, Math.round((monthStart.getTime() - ganttRange.start.getTime()) / 86400000));
    const monthPosition = daysFromRangeStart / ganttRange.totalDays * ganttTimelineWidth;
    scroller.scrollTo({ left: Math.max(0, monthPosition - 16), behavior: "smooth" });
  }
```

и в кнопке «Сегодня» — `onClick={() => scrollGanttToDate(toISO(today))}`.

5. В `roadmap-actions` перед кнопкой «Новая задача»:

```tsx
            <button className="secondary template-button" onClick={() => setModal({ kind: "template" })}><ClipboardCheck size={16} />Типовая задача</button>
```

6. Рядом с рендером `TaskDialog` (строка ~1724):

```tsx
      {modal?.kind === "template" && <TemplateDialog templates={templates} tasks={data.tasks} people={data.people} today={todayKey} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onAdd={addTemplateTasks} />}
```

7. Убрать `void templates;`, если добавляли в Task 4.

- [x] **Step 3: Стили в `app/globals.css`**

Добавить после блока `.baseline-reset { ... }`:

```css
.template-button { color: var(--navy); border-color: #b9cae3; background: #f8fbff; }
.template-button:hover { background: #edf4fd; }

/* Чипы кодов типовых задач и прогресс по контрольным точкам */
.code-chip { flex: 0 0 auto; padding: 2px 6px; border-radius: 4px; background: var(--blue-soft); color: var(--navy-2); font-size: 10px; font-weight: 700; letter-spacing: .2px; font-variant-numeric: tabular-nums; }
.code-chip-parent { background: var(--navy); color: #fff; }
.progress-chip { display: inline-flex; align-items: center; gap: 5px; color: #627087; font-variant-numeric: tabular-nums; }
.progress-chip.progress-done { color: #087a59; }

/* Диалог «Типовая задача» */
.tpl-search { position: relative; display: block; margin: 0 0 10px; }
.tpl-search input { width: 100%; height: 37px; padding: 0 10px 0 34px; border: 1px solid #d6dde7; border-radius: 7px; font-size: 13px; }
.tpl-search input:focus { border-color: #85aadd; box-shadow: 0 0 0 3px rgba(42, 120, 223, .1); }
.tpl-search svg { position: absolute; left: 11px; top: 11px; color: #8a94a4; pointer-events: none; }
.tpl-list { margin: 0 0 8px; max-height: 52vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; }
.tpl-row { width: 100%; min-height: 40px; padding: 7px 12px; display: grid; grid-template-columns: 52px 1fr auto auto; gap: 12px; align-items: center; border: 0; border-bottom: 1px solid var(--soft-line); background: #fff; text-align: left; font-size: 13px; }
.tpl-row:last-child { border-bottom: 0; }
.tpl-row:hover { background: #f8fbff; }
.tpl-row b { font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-row .code-chip { justify-self: start; }
.tpl-meta { color: #7b8798; font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tpl-exists { color: #a75e08; font-size: 11px; white-space: nowrap; }
.tpl-empty { padding: 18px; color: #8993a3; font-size: 12px; text-align: center; }
.tpl-premise { margin: -4px 0 12px; }
.field-note button { border: 0; padding: 0; background: none; color: var(--blue); font-size: 10px; font-weight: 650; }
.field-note-warn { color: #a75e08; }
.tpl-preview { margin: 4px 0 14px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.tpl-preview-head { padding: 9px 14px; display: flex; align-items: center; justify-content: space-between; background: #f8fafc; border-bottom: 1px solid var(--soft-line); color: #4e5b70; font-size: 11px; font-weight: 650; }
.tpl-preview-head span:last-child { font-weight: 500; color: #7b8798; }
.tpl-preview-row { padding: 10px 14px; display: grid; grid-template-columns: 62px 112px 1fr auto; gap: 12px; align-items: center; border-bottom: 1px solid var(--soft-line); font-size: 12px; }
.tpl-preview-row:last-of-type { border-bottom: 0; }
.tpl-week { color: #8a94a4; font-size: 11px; font-weight: 600; }
.tpl-dates { color: #354258; font-variant-numeric: tabular-nums; }
.tpl-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tpl-name b { font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl-count { color: #627087; font-size: 11px; white-space: nowrap; }
.tpl-preview-total { padding: 10px 14px; display: flex; gap: 18px; background: #fbfcfe; color: #405066; font-size: 12px; border-top: 1px solid var(--soft-line); }
.tpl-preview-total b { color: var(--navy); }
.modal-back { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 0; background: none; color: #5b6880; font-size: 13px; font-weight: 600; }
.modal-back:hover { color: var(--navy); }
```

В медиазапросе для узких экранов (в конце файла, где `.roadmap-actions > .secondary, .roadmap-actions > .primary { width: calc(50% - 5px); }`) добавить `.tpl-preview-row, .tpl-row { grid-template-columns: 1fr; gap: 2px; }`.

- [x] **Step 4: Линтер, сборка, ручная проверка**

Run: `pnpm lint && pnpm build && pnpm dev`

В браузере:
1. Кнопка «Типовая задача» видна между «Сегодня» и «Новая задача».
2. Шаг 1: список из двух строк (ДДС, ФМ) с «3 нед. · 16 точек» и «2 нед. · 32 точки»; поиск «фм» оставляет одну строку.
3. Шаг 2: дата по умолчанию — ближайший понедельник; при выборе четверга появляется предупреждение и кнопка сдвига; предпросмотр показывает 3 строки и итог.
4. «Добавить в карту»: в таблице появляются 4 строки (пока без чипов — это Task 7), Гант прокручивается к месяцу старта, индикатор сохранения показывает «сохранено». После перезагрузки страницы задачи на месте.

- [x] **Step 5: Коммит**

```bash
git add components/template-dialog.tsx components/dashboard.tsx app/globals.css
git commit -m "Добавлять типовую задачу в дорожную карту по шаблону

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Чипы кодов и прогресс в таблице и на Ганте

**Files:**
- Create: `components/checkpoints-editor.tsx` (пока только `ProgressRing`; редактор — в Task 8)
- Modify: `components/dashboard.tsx` (строки таблицы ~1558–1577, полоски Ганта ~1594–1596)

**Interfaces:**
- Consumes: `checkpointProgress` (Task 3).
- Produces: `export function ProgressRing({ done, total }: { done: number; total: number })` в `components/checkpoints-editor.tsx`.

- [x] **Step 1: Создать `components/checkpoints-editor.tsx` с `ProgressRing`**

```tsx
"use client";

// Кольцевой индикатор «сделано из всего» — используется в таблице задач и в сводке спринтов.
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="#e0e6ee" strokeWidth="2.4" />
      <circle cx="7" cy="7" r={radius} fill="none" stroke={fraction >= 1 ? "var(--teal)" : "var(--blue)"} strokeWidth="2.4" strokeDasharray={(circumference * fraction).toFixed(2) + " " + circumference.toFixed(2)} strokeLinecap="round" transform="rotate(-90 7 7)" />
    </svg>
  );
}
```

- [x] **Step 2: Чипы и прогресс в строке таблицы**

В `dashboard.tsx` импортировать `import { ProgressRing } from "@/components/checkpoints-editor";` и `import { checkpointProgress } from "@/lib/typical-tasks";`.

Внутри `visibleTasks.map((task) => { ... })` в таблице вычислить `const progress = checkpointProgress(task, data.tasks);` и изменить `task-title-cell`:

```tsx
                  <span className="task-title-cell">
                    {!task.parentId && childCount > 0 && <button ...без изменений... />}
                    {!task.parentId && childCount === 0 && <span className="toggle-spacer" />}
                    {task.parentId && <i />}
                    {task.template && <span className={"code-chip" + (task.parentId ? "" : " code-chip-parent")}>{task.template.subCode || task.template.code}</span>}
                    <b>{task.title}</b>
                    {!task.parentId && childCount > 0 && <small className="child-count">{childCount}</small>}
                    {progress && progress.total > 0 && <small className={"progress-chip" + (progress.done === progress.total ? " progress-done" : "")} title={"Контрольные точки: " + progress.done + " из " + progress.total}><ProgressRing done={progress.done} total={progress.total} />{progress.done}/{progress.total}</small>}
                    {task.comments.length > 0 && <small><MessageSquareText size={12} />{task.comments.length}</small>}
                  </span>
```

- [x] **Step 3: Подсказка на полоске Ганта**

В `visibleTasks.map` внутри `gantt-bars` вычислить `const progress = checkpointProgress(task, data.tasks);` и добавить полоске атрибут:

```tsx
title={task.title + " · " + formatShortDate(task.startDate) + " — " + formatShortDate(task.endDate) + (progress && progress.total > 0 ? " · точки " + progress.done + "/" + progress.total : "")}
```

- [x] **Step 4: Линтер, сборка, ручная проверка**

Run: `pnpm lint && pnpm build && pnpm dev`

В браузере: у добавленной в Task 6 задачи ДДС — тёмный чип «ДДС» на надзадаче и светлые «ДДС-1…3» на подзадачах, прогресс «0/9», «0/5», «0/2» и «0/16» у надзадачи; при наведении на полоску Ганта видна подсказка с датами и точками. Обычные задачи выглядят как раньше.

- [x] **Step 5: Коммит**

```bash
git add components/checkpoints-editor.tsx components/dashboard.tsx
git commit -m "Показывать коды и прогресс типовых задач в таблице

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Редактор контрольных точек

**Files:**
- Modify: `components/checkpoints-editor.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `Checkpoint`, `CheckpointGroup` (Task 1).
- Produces: `export default function CheckpointsEditor({ groups, nextCode, onChange }: { groups: CheckpointGroup[]; nextCode: () => string; onChange: (groups: CheckpointGroup[]) => void })`. Компонент не хранит данные — только состояние правки; все изменения уходят наверх через `onChange` новыми массивами.

- [x] **Step 1: Дописать компонент**

В `components/checkpoints-editor.tsx` добавить импорты и компонент:

```tsx
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import type { Checkpoint, CheckpointGroup } from "@/lib/types";

function shortCode(code: string) {
  // «ДДС-1.5» → «1.5»: код спринта уже есть в заголовке карточки
  const dash = code.indexOf("-");
  return dash >= 0 ? code.slice(dash + 1) : code;
}

export default function CheckpointsEditor({
  groups,
  nextCode,
  onChange,
}: {
  groups: CheckpointGroup[];
  nextCode: () => string;
  onChange: (groups: CheckpointGroup[]) => void;
}) {
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");

  const items = groups.flatMap((group) => group.items);
  const done = items.filter((item) => item.done).length;
  const allDone = items.length > 0 && done === items.length;

  function patchItem(code: string, patch: Partial<Checkpoint> | null) {
    onChange(groups.map((group) => ({
      ...group,
      items: patch ? group.items.map((item) => item.code === code ? { ...item, ...patch } : item) : group.items.filter((item) => item.code !== code),
    })));
  }

  function toggleNote(code: string) {
    setOpenNotes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function startEdit(item: Checkpoint) {
    setEditing(item.code);
    setDraftTitle(item.title);
    setDraftNote(item.note);
    setOpenNotes((current) => { const next = new Set(current); next.delete(item.code); return next; });
  }

  function finishEdit(item: Checkpoint) {
    const title = draftTitle.trim();
    const note = draftNote.trim();
    if (!title) patchItem(item.code, null);
    else patchItem(item.code, { title, note, noteTitle: note ? (item.noteTitle || title) : "" });
    setEditing(null);
  }

  function cancelEdit(item: Checkpoint) {
    // Отмена правки только что добавленной пустой точки убирает её.
    if (!item.title) patchItem(item.code, null);
    setEditing(null);
  }

  function addItem() {
    const item: Checkpoint = { code: nextCode(), title: "", aside: "", gate: false, noteTitle: "", note: "", done: false };
    const last = groups.length - 1;
    onChange(last < 0 ? [{ title: "", result: "", items: [item] }] : groups.map((group, index) => index === last ? { ...group, items: [...group.items, item] } : group));
    setEditing(item.code);
    setDraftTitle("");
    setDraftNote("");
  }

  return (
    <div className="check-section">
      <div className="check-head">
        <strong>Контрольные точки</strong>
        <span className={"check-count" + (allDone ? " check-count-done" : "")}>{done} из {items.length}</span>
        <span className="check-bar"><i className={allDone ? "check-bar-done" : ""} style={{ width: (items.length > 0 ? done / items.length * 100 : 0) + "%" }} /></span>
      </div>
      {groups.map((group, groupIndex) => (
        <div className="check-group" key={group.title || groupIndex}>
          {group.title && <h4>{group.title}</h4>}
          {group.result && <p className="check-result"><b>Проверочный результат:</b> {group.result}</p>}
          {group.items.map((item) => editing === item.code ? (
            <div className="check-item" key={item.code}>
              <input type="checkbox" checked={item.done} disabled readOnly />
              <span className="check-code">{shortCode(item.code)}</span>
              <div className="check-edit">
                <label>Контрольная точка<input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Что должно быть сделано" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); finishEdit(item); } }} /></label>
                <label>Пояснение для ФД (необязательно)<textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} placeholder="Зачем нужен пункт, что считается выполненным, какие ошибки предотвращает" /></label>
                <div className="check-edit-actions">
                  <button type="button" className="delete-button" onClick={() => patchItem(item.code, null)}>Удалить</button>
                  <button type="button" className="secondary" onClick={() => cancelEdit(item)}>Отмена</button>
                  <button type="button" className="primary" onClick={() => finishEdit(item)}>Готово</button>
                </div>
              </div>
            </div>
          ) : (
            <div className={"check-item" + (item.done ? " check-item-done" : "")} key={item.code}>
              <input type="checkbox" id={"checkpoint-" + item.code} checked={item.done} onChange={() => patchItem(item.code, { done: !item.done })} />
              <span className="check-code">{shortCode(item.code)}</span>
              <label htmlFor={"checkpoint-" + item.code} className={item.gate ? "check-gate" : ""}>{item.title}{item.aside && <span className="check-aside"> ({item.aside})</span>}</label>
              <span className="check-tools">
                {item.note && <button type="button" className={"info-button" + (openNotes.has(item.code) ? " info-open" : "")} title={item.noteTitle || "Пояснение"} aria-expanded={openNotes.has(item.code)} onClick={() => toggleNote(item.code)}>i</button>}
                <button type="button" title="Изменить" aria-label={"Изменить точку " + item.code} onClick={() => startEdit(item)}><Pencil size={13} /></button>
              </span>
              {item.note && openNotes.has(item.code) && <div className="check-note"><b>{item.noteTitle || "Пояснение"}</b>{item.note}</div>}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="add-check" onClick={addItem}><Plus size={14} />Добавить контрольную точку</button>
    </div>
  );
}
```

- [x] **Step 2: Стили**

Добавить в `app/globals.css` после стилей `.modal-back`:

```css
/* Чек-лист контрольных точек в карточке спринта */
.check-section { margin: 4px 0 14px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.check-head { padding: 11px 14px; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; background: #f8fafc; border-bottom: 1px solid var(--soft-line); }
.check-head strong { font-size: 12px; color: #172239; }
.check-count { font-size: 12px; color: #627087; font-variant-numeric: tabular-nums; }
.check-count-done { color: #087a59; font-weight: 650; }
.check-bar { grid-column: 1 / -1; display: block; height: 5px; border-radius: 3px; background: #e6ebf2; overflow: hidden; }
.check-bar i { display: block; height: 100%; border-radius: 3px; background: var(--blue); transition: width .25s ease; }
.check-bar i.check-bar-done { background: var(--teal); }
.check-group { padding: 10px 14px 4px; border-bottom: 1px solid var(--soft-line); }
.check-group h4 { margin: 0 0 2px; font-size: 12px; color: #172239; }
.check-result { margin: 0 0 6px; color: #627087; font-size: 11px; }
.check-result b { font-weight: 650; color: #4e5b70; }
.check-item { display: grid; grid-template-columns: 18px 44px 1fr auto; gap: 4px 10px; align-items: start; padding: 7px 0; border-top: 1px solid #f2f4f8; }
.check-group .check-item:first-of-type { border-top: 0; }
.check-item input[type="checkbox"] { margin: 2px 0 0; width: 15px; height: 15px; accent-color: var(--teal); cursor: pointer; }
.check-code { padding-top: 2px; color: #8a94a4; font-size: 10px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.check-item > label { font-size: 12px; line-height: 1.45; color: #1f2a40; cursor: pointer; }
.check-item > label.check-gate { font-weight: 700; }
.check-aside { color: #8a94a4; font-style: italic; }
.check-item-done > label { color: #7b8798; text-decoration: line-through; text-decoration-color: #c4ccd8; }
.check-item-done > label.check-gate { text-decoration: none; color: #087a59; }
.check-tools { display: inline-flex; gap: 2px; }
.check-tools button { width: 22px; height: 22px; border: 0; border-radius: 5px; display: grid; place-items: center; background: transparent; color: #9aa4b4; }
.check-tools button:hover { background: #eaf1fb; color: var(--navy); }
.info-button { border: 1px solid #c9d6e8 !important; border-radius: 50% !important; background: #fff !important; color: var(--navy-2) !important; font-size: 11px; font-weight: 700; font-family: Georgia, serif; font-style: italic; }
.info-button:hover, .info-button.info-open { background: var(--blue-soft) !important; border-color: #9db8dd !important; }
.check-note { grid-column: 2 / -1; margin: 2px 0 4px; padding: 9px 12px; border-left: 3px solid #9db8dd; border-radius: 0 8px 8px 0; background: #f3f7fc; color: #33425a; font-size: 12px; line-height: 1.5; }
.check-note b { display: block; margin-bottom: 2px; color: var(--navy); }
.check-edit { grid-column: 3 / -1; display: grid; gap: 8px; margin: 2px 0 6px; padding: 10px 12px; border: 1px solid #c9d6e8; border-radius: 8px; background: #fbfcfe; }
.check-edit label { display: grid; gap: 4px; color: #4e5b70; font-size: 10px; font-weight: 650; }
.check-edit input, .check-edit textarea { width: 100%; padding: 7px 9px; border: 1px solid #d6dde7; border-radius: 7px; background: #fff; font-size: 12px; font-weight: 400; font-family: inherit; }
.check-edit textarea { resize: vertical; min-height: 58px; line-height: 1.45; }
.check-edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
.check-edit-actions button { min-height: 30px; padding: 0 10px; font-size: 12px; }
.add-check { width: 100%; padding: 9px 14px; display: flex; align-items: center; gap: 6px; border: 0; border-top: 1px dashed #d6dde7; background: #fbfcfe; color: var(--navy-2); font-size: 12px; font-weight: 650; text-align: left; }
.add-check:hover { background: #f3f7fc; }
.all-done { margin: 0 0 14px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; border-radius: 8px; background: var(--teal-soft); color: #087a59; font-size: 12px; }
.all-done button { margin-left: auto; border: 1px solid #9fd8c2; border-radius: 6px; padding: 5px 10px; background: #fff; color: #087a59; font-size: 12px; font-weight: 650; }

/* Сводка спринтов в карточке надзадачи */
.sprint-list { margin: 0 0 14px; border: 1px solid var(--line); border-radius: 0 0 10px 10px; overflow: hidden; }
.sprint-head { border-radius: 10px 10px 0 0; border: 1px solid var(--line); border-bottom: 0; }
.sprint-row { width: 100%; padding: 10px 14px; display: grid; grid-template-columns: 52px 1fr 130px 90px; gap: 12px; align-items: center; border: 0; border-bottom: 1px solid var(--soft-line); background: #fff; text-align: left; font-size: 12px; }
.sprint-row:last-child { border-bottom: 0; }
.sprint-row:hover { background: #f8fbff; }
.sprint-row b { font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sprint-dates { color: #627087; font-variant-numeric: tabular-nums; }
.sprint-progress { display: flex; align-items: center; gap: 8px; color: #627087; font-size: 11px; font-variant-numeric: tabular-nums; }
.sprint-progress .check-bar { flex: 1; grid-column: auto; }
```

В медиазапросе для узких экранов добавить `.sprint-row { grid-template-columns: 1fr; }`.

`!important` у `.info-button` нужен, потому что `.check-tools button` задаёт более общие правила той же специфичности позже по порядку; если при вёрстке удобнее — вместо `!important` поднять специфичность селектором `.check-tools .info-button`.

- [x] **Step 3: Линтер и сборка**

Run: `pnpm lint && pnpm build`
Expected: без ошибок. Компонент пока нигде не используется — это нормально, подключение в Task 9.

- [x] **Step 4: Коммит**

```bash
git add components/checkpoints-editor.tsx app/globals.css
git commit -m "Добавить редактор контрольных точек с пояснениями

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Карточки спринта и надзадачи в `TaskDialog`

**Files:**
- Modify: `components/dashboard.tsx` — функция `TaskDialog` (~строки 543–617 до рефакторинга; после Task 5 номера сместились) и её рендер (~1724)

**Interfaces:**
- Consumes: `CheckpointsEditor`, `ProgressRing` (Tasks 7–8); `checkpointProgress`, `nextCheckpointCode` (Task 3).
- Produces: `TaskDialog` получает проп `onOpenTask: (task: Task) => void`.

- [x] **Step 1: Расширить пропсы и режимы**

В сигнатуру `TaskDialog` добавить `onOpenTask: (task: Task) => void;` и вычислить режимы сразу после `hasChildren`:

```tsx
  const isTemplateSprint = Boolean(item?.template?.subCode);
  const isTemplateParent = Boolean(item?.template) && !isTemplateSprint;
  const sprints = isTemplateParent && item ? tasks.filter((task) => task.parentId === item.id) : [];
  const sprintItems = isTemplateSprint ? (draft.groups ?? []).flatMap((group) => group.items) : [];
  const sprintAllDone = sprintItems.length > 0 && sprintItems.every((checkpoint) => checkpoint.done);
```

(`draft` объявлен выше через `useState`, поэтому эти строки идут после него.)

Заголовок и подзаголовок `ModalShell`:

```tsx
  const dialogTitle = item?.template
    ? (item.template.subCode || item.template.code) + ". " + draft.title
    : item ? "Редактировать задачу" : "Новая задача";
  const dialogSubtitle = isTemplateSprint && item
    ? "Типовая задача " + item.template!.code + " · спринт " + item.template!.week + " из " + tasks.filter((task) => task.parentId === item.parentId && task.template?.subCode).length + " · неделя " + formatShortDate(draft.startDate) + " — " + formatShortDate(draft.endDate)
    : isTemplateParent
      ? "Типовая задача · " + sprints.length + " " + pluralSprints(sprints.length) + " · " + formatShortDate(draft.startDate) + " — " + formatShortDate(draft.endDate)
      : "Сроки сразу появятся на диаграмме Ганта";
```

Добавить рядом с `pluralTasks` помощник:

```tsx
function pluralSprints(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "спринт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "спринта";
  return "спринтов";
}
```

- [x] **Step 2: Перестроить форму**

Заменить JSX внутри `<form onSubmit={submit}>` так:

```tsx
        <div className="modal-body">
          <label className="field field-wide">{isTemplateSprint ? "Название подзадачи" : "Название задачи"}<input autoFocus={!item} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, Подготовить форму ДДС" /></label>
          <div className="form-grid">
            {!item?.template && <label className="field">Тип задачи<select ...без изменений...></select><ChevronDown size={15} /></label>}
            <div className="field"><span>Ответственный</span><PersonSelect ...без изменений... /></div>
            {!item?.template && taskType === "subtask" && <label className="field field-wide">К какой надзадаче прикрепить ...без изменений...</label>}
            {item?.template && <label className="field field-wide">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>}
            <label className="field">Дата начала ...без изменений...</label>
            <label className="field">Дедлайн ...без изменений...</label>
            {!item?.template && <label className="field field-wide">Статус ...без изменений...</label>}
          </div>
          {isTemplateSprint && (
            <>
              <CheckpointsEditor groups={draft.groups ?? []} nextCode={() => nextCheckpointCode(draft)} onChange={(groups) => setDraft({ ...draft, groups })} />
              {sprintAllDone && draft.status !== "Завершено" && (
                <div className="all-done">✓ Все контрольные точки отмечены — спринт можно закрывать.<button type="button" onClick={() => setDraft({ ...draft, status: "Завершено" })}>Отметить завершённым</button></div>
              )}
            </>
          )}
          {isTemplateParent && (
            <>
              <div className="check-head sprint-head"><strong>Спринты</strong><span className="check-count">Сроки подзадач меняются в их карточках</span></div>
              <div className="sprint-list">
                {sprints.map((sprint) => {
                  const progress = checkpointProgress(sprint, tasks) ?? { done: 0, total: 0 };
                  return (
                    <button type="button" className="sprint-row" key={sprint.id} onClick={() => onOpenTask(sprint)}>
                      <span className="code-chip">{sprint.template?.subCode}</span>
                      <b>{sprint.title}</b>
                      <span className="sprint-dates">{formatShortDate(sprint.startDate)} — {formatShortDate(sprint.endDate)}</span>
                      <span className="sprint-progress"><span className="check-bar"><i className={progress.total > 0 && progress.done === progress.total ? "check-bar-done" : ""} style={{ width: (progress.total > 0 ? progress.done / progress.total * 100 : 0) + "%" }} /></span>{progress.done}/{progress.total}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <CommentsEditor comments={draft.comments} onChange={(comments) => setDraft({ ...draft, comments })} />
          {error && <p className="form-error">{error}</p>}
        </div>
```

Порядок полей у типовых задач: ответственный, статус, даты — как в макете. Для обычных задач порядок остаётся прежним (тип, ответственный, надзадача, даты, статус). У типовых задач `taskType`/`parentId` не редактируются: в `submit` для них передавать `parentId: draft.parentId` без изменений:

```tsx
    onSave({ ...draft, parentId: item?.template ? draft.parentId : taskType === "parent" ? null : draft.parentId, title: draft.title.trim(), assignee: draft.assignee.trim() });
```

Импорты в начале файла: `import CheckpointsEditor, { ProgressRing } from "@/components/checkpoints-editor";` (заменяет импорт из Task 7) и `import { checkpointProgress, nextCheckpointCode } from "@/lib/typical-tasks";` (расширяет импорт из Task 7).

- [x] **Step 3: Передать `onOpenTask` при рендере**

```tsx
      {modal?.kind === "task" && <TaskDialog item={modal.item} tasks={data.tasks} people={data.people} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} onOpenTask={(task) => setModal({ kind: "task", item: task })} />}
```

Переход из карточки надзадачи в карточку спринта без сохранения надзадачи — сознательно: правки надзадачи, если они были, теряются, как при закрытии окна. Это соответствует макету.

- [x] **Step 4: Линтер, сборка, ручная проверка по макету**

Run: `pnpm lint && pnpm build && pnpm dev`

1. Открыть подзадачу ДДС-1: заголовок «ДДС-1. Настройка сервиса…», подзаголовок со спринтом и неделей, поле названия, чек-лист 0 из 9 с кодами «1.1…1.9», у 1.5/1.6/1.9 кнопка «i», по клику раскрывается пояснение с заголовком.
2. Отметить 1.1 — счётчик «1 из 9», полоса прогресса заполнилась; «Сохранить» — в таблице «1/9», у надзадачи «1/16»; после перезагрузки отметка на месте.
3. Карандаш у 1.2: изменить текст и добавить пояснение, «Готово», «Сохранить» — появилась кнопка «i» с новым текстом.
4. «Добавить контрольную точку»: открылась правка с кодом «1.10»; «Отмена» — точка исчезла; повторить, ввести текст, «Готово» — точка в списке, счётчик «1 из 10».
5. Удалить точку через «Удалить» в режиме правки, сохранить — счётчик уменьшился.
6. Отметить все точки в ДДС-3 — появилась зелёная плашка; «Отметить завершённым» — статус «Завершено» в селекте; сохранить — полоска на Ганте зелёная.
7. Открыть надзадачу ДДС: поля, список из 3 спринтов с прогрессом; клик по спринту открывает его карточку.
8. У обычной задачи («Сбор исходных данных») форма выглядит как раньше: тип задачи, надзадача, статус внизу.
9. Удалить надзадачу ДДС — вместе с подзадачами.

- [x] **Step 5: Коммит**

```bash
git add components/dashboard.tsx
git commit -m "Открывать чек-лист спринта и сводку спринтов в карточке задачи

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: README и финальная проверка

**Files:**
- Modify: `README.md`

- [x] **Step 1: Раздел в README**

После списка «Возможности» добавить пункт `- типовые задачи: шаблон из справочника разворачивается в надзадачу, недельные спринты и чек-лист контрольных точек с пояснениями;`. Перед разделом «Локальный запуск» добавить:

```markdown
## Типовые задачи

Кнопка «Типовая задача» над диаграммой открывает реестр шаблонов. После выбора шаблона, даты старта и ответственного приложение создаёт надзадачу и по одной подзадаче на каждую неделю норматива; в каждой подзадаче — чек-лист контрольных точек с пояснениями для финансового директора. Точки можно отмечать, править, добавлять и удалять — они принадлежат клиенту, а не шаблону.

Справочник шаблонов — файл `docs/typical-tasks.md`, формат описан в его начале. Файл читается при сборке; ошибка формата (пункт без кода, пояснение к несуществующему пункту, число недель не равно числу подзадач) останавливает сборку с указанием строки. Правка шаблона влияет только на задачи, создаваемые после неё.
```

В раздел «Проверка перед публикацией» добавить `pnpm test` первой строкой.

- [x] **Step 2: Полная проверка**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: все тесты PASS, линтер и сборка чистые.

- [x] **Step 3: Сквозной сценарий**

`pnpm dev`, затем: добавить ФМ со стартом в четверг → нажать «Сдвинуть на понедельник» → добавить → открыть ФМ-1 → раскрыть пояснение у 1.4 → отметить 1.1–1.10 → сохранить → в таблице «10/22» → перезагрузить страницу → отметки сохранены → удалить надзадачу ФМ → строки исчезли.

- [x] **Step 4: Коммит**

```bash
git add README.md
git commit -m "Описать типовые задачи в README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Самопроверка плана по спецификации

- Кнопка и двухшаговый диалог, компактный список с поиском и пометкой «уже в карте» — Task 6.
- Понедельник по умолчанию, подсказка и сдвиг — Task 1 (помощники) и Task 6.
- Предпросмотр расписания и итог — Task 3 (`scheduleTemplate`) и Task 6.
- Чипы кодов, прогресс в таблице, подсказка на Ганте — Task 7.
- Карточка спринта: название, поля, чек-лист с группами, «i», правка, добавление, удаление, плашка «можно закрывать» — Tasks 8–9.
- Карточка надзадачи со сводкой спринтов — Task 9.
- Модель данных, копирование точек, независимость от шаблона — Tasks 1, 3.
- Парсер по соглашениям файла, ошибки с номером строки — Task 2.
- Чтение при сборке — Task 4.
- Хранилище: `normalizeDashboardData` в `lib/store.ts` копирует задачи как есть (`...value`, `tasks`), `isDashboardData` в `app/api/data/route.ts` не проверяет поля задач — изменений не требуется, проверено чтением кода.
- README — Task 10.
