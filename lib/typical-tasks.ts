import { addDays } from "./dates";
import type { CheckpointGroup, Task } from "./types";

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
  // Строка заголовка «# КОД.» каждого шаблона — на неё ссылаются проверки после разбора.
  const headingLines: number[] = [];
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
      headingLines.push(lineNumber);
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
    if (line.startsWith("**Длительность:**")) throw new TypicalTasksFormatError(lineNumber, "длительность должна быть числом недель");
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
  templates.forEach((item, index) => {
    const headingLine = headingLines[index];
    if (item.subtasks.length === 0) throw new TypicalTasksFormatError(headingLine, "у задачи " + item.code + " нет подзадач");
    if (item.weeks !== item.subtasks.length) throw new TypicalTasksFormatError(headingLine, "у задачи " + item.code + " " + item.weeks + " недель, а подзадач " + item.subtasks.length + ": подзадача занимает ровно одну неделю");
  });
  return templates;
}

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
