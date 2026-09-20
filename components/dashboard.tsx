"use client";

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  History,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import AccountingPolicy from "@/components/accounting-policy";
import CheckpointsEditor, { ProgressRing } from "@/components/checkpoints-editor";
import ModalShell from "@/components/modal-shell";
import PersonSelect, { normalizePerson } from "@/components/person-select";
import type { PersonPickerProps } from "@/components/person-select";
import TemplateDialog from "@/components/template-dialog";
import { addDays, differenceInDays, formatDayMonth, parseDate, toISO } from "@/lib/dates";
import { plural } from "@/lib/plural";
import {
  frequencyTitle,
  getScopeCounts,
  getSeriesOccurrences,
  isSeriesMeeting,
  selectSeriesScope,
} from "@/lib/meeting-series";
import type { MeetingSeriesScope } from "@/lib/meeting-series";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  DashboardData,
  Idea,
  IdeaStatus,
  Meeting,
  MeetingDuration,
  Priority,
  RegularFrequency,
  RegularRecord,
  RegularTask,
  Task,
  TaskStatus,
} from "@/lib/types";
import { checkpointProgress, nextCheckpointCode } from "@/lib/typical-tasks";
import type { TypicalTaskTemplate } from "@/lib/typical-tasks";

const TASK_STATUSES: TaskStatus[] = ["Не начато", "В работе", "На проверке", "Завершено", "Просрочено"];
const IDEA_STATUSES: IdeaStatus[] = ["Новая", "На обсуждении", "Одобрена", "В реализации", "Реализована", "Отклонена"];
const PRIORITIES: Priority[] = ["Высокий", "Средний", "Низкий"];
const REGULAR_FREQUENCIES: Array<{ value: RegularFrequency; label: string }> = [
  { value: "weekly", label: "Каждую неделю" },
  { value: "monthly", label: "Каждый месяц" },
  { value: "quarterly", label: "Каждый квартал" },
];
type MeetingRepeat = "none" | RegularFrequency;
const MEETING_REPEATS: Array<{ value: MeetingRepeat; label: string }> = [
  { value: "none", label: "Не повторяется" },
  { value: "weekly", label: "Каждую неделю" },
  { value: "monthly", label: "Каждый месяц" },
  { value: "quarterly", label: "Каждый квартал" },
];
// Дату «сегодня» нельзя считать на уровне модуля: страницу Next.js рендерит статически,
// и значение застыло бы на времени сборки, а гидратация уже готовую разметку не пересчитывает.
// Поэтому дату берём вызовом функции — в браузере она всегда отдаёт текущий день.
// Полдень, а не полночь, — как и в parseDate: так переход на летнее время не сдвигает день.
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

// Смена суток приходит из внешнего источника — системных часов, — поэтому текущий день
// читаем через useSyncExternalStore. Он единственный корректно разводит два снимка:
// серверный уходит в статическую разметку, а сразу после гидратации React перерисовывает
// компонент с браузерным. Опрос раз в минуту нужен, чтобы вкладка пережила полночь.
function subscribeToDayChange(onDayChange: () => void) {
  const timer = setInterval(onDayChange, 60_000);
  return () => clearInterval(timer);
}

// Снимок — строка "ГГГГ-ММ-ДД", а не Date: React сравнивает снимки по значению,
// и новый объект Date на каждом вызове вызывал бы бесконечный перерендер.
function getTodayKey() {
  return toISO(startOfToday());
}
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

type SaveStatus = "loading" | "saved" | "saving" | "error";
type ModalState =
  | { kind: "task"; item: Task | null }
  | { kind: "idea"; item: Idea | null }
  | { kind: "meeting"; item: Meeting | null }
  | { kind: "regular-task"; item: RegularTask | null }
  | { kind: "regular-period"; task: RegularTask; monthStart: string }
  | { kind: "template" }
  | null;

function formatShortDate(value: string) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.getDate() + " " + MONTHS_GENITIVE[date.getMonth()];
}

function getMeetingRepeatDates(startValue: string, repeat: MeetingRepeat) {
  const start = parseDate(startValue);
  if (Number.isNaN(start.getTime())) return [];
  if (repeat === "none") return [startValue];

  const end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), 12);
  const dates: string[] = [];
  if (repeat === "weekly") {
    const cursor = new Date(start);
    while (cursor <= end && dates.length < 120) {
      dates.push(toISO(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  const monthStep = repeat === "quarterly" ? 3 : 1;
  const anchorDay = start.getDate();
  for (let monthOffset = 0; dates.length < 120; monthOffset += monthStep) {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + monthOffset, 1, 12);
    const day = Math.min(anchorDay, new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12).getDate());
    const occurrence = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12);
    if (occurrence > end) break;
    dates.push(toISO(occurrence));
  }
  return dates;
}

function pluralMeetings(count: number) {
  return plural(count, "встреча", "встречи", "встреч");
}

function pluralDays(count: number) {
  return plural(count, "день", "дня", "дней");
}

function pluralTasks(count: number) {
  return plural(count, "задача", "задачи", "задач");
}

function pluralSprints(count: number) {
  return plural(count, "спринт", "спринта", "спринтов");
}

function pluralSubtasks(count: number) {
  return plural(count, "подзадача", "подзадачи", "подзадач");
}

// Спринты типовой задачи — только подзадачи с кодом спринта, по порядку недель.
function templateSprints(tasks: Task[], parentId: string | null) {
  return tasks
    .filter((task) => task.parentId === parentId && task.template?.subCode)
    .sort((a, b) => (a.template?.week ?? 0) - (b.template?.week ?? 0));
}

function isTaskOverdue(task: Task, today: Date) {
  return task.status !== "Завершено" && (task.status === "Просрочено" || parseDate(task.endDate) < today);
}

function taskOverlapsMonth(task: Task, monthStart: Date) {
  const taskStart = parseDate(task.startDate);
  const taskEnd = parseDate(task.endDate);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);
  return !Number.isNaN(taskStart.getTime()) && !Number.isNaN(taskEnd.getTime()) && taskStart <= monthEnd && taskEnd >= monthStart;
}

function taskStatusClass(status: TaskStatus) {
  if (status === "Завершено") return "status status-success";
  if (status === "Просрочено") return "status status-danger";
  if (status === "На проверке") return "status status-warning";
  if (status === "Не начато") return "status status-neutral";
  return "status status-info";
}

function ideaStatusClass(status: IdeaStatus) {
  if (status === "Реализована") return "status status-success";
  if (status === "Отклонена") return "status status-danger";
  if (status === "В реализации") return "status status-info";
  if (status === "Одобрена") return "status status-success-soft";
  if (status === "На обсуждении") return "status status-warning";
  return "status status-neutral";
}

function priorityClass(priority: Priority) {
  if (priority === "Высокий") return "priority priority-high";
  if (priority === "Средний") return "priority priority-medium";
  return "priority priority-low";
}

function orderedTasks(tasks: Task[]) {
  const parents = tasks.filter((task) => !task.parentId);
  const result: Task[] = [];
  parents.forEach((parent) => {
    result.push(parent);
    result.push(...tasks.filter((task) => task.parentId === parent.id));
  });
  result.push(...tasks.filter((task) => task.parentId && !tasks.some((parent) => parent.id === task.parentId)));
  return result;
}

function frequencyLabel(frequency: RegularFrequency) {
  return REGULAR_FREQUENCIES.find((item) => item.value === frequency)?.label || frequency;
}

function orderedRegularTasks(tasks: RegularTask[]) {
  const parents = tasks.filter((task) => !task.parentId);
  const result: RegularTask[] = [];
  parents.forEach((parent) => {
    result.push(parent);
    result.push(...tasks.filter((task) => task.parentId === parent.id));
  });
  result.push(...tasks.filter((task) => task.parentId && !tasks.some((parent) => parent.id === task.parentId)));
  return result;
}

function getPlannedDates(task: RegularTask, monthStartValue: string) {
  const anchor = parseDate(task.anchorDate);
  const monthStart = parseDate(monthStartValue);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(monthStart.getTime())) return [];
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12);
  if (anchor > monthEnd) return [];

  if (task.frequency === "weekly") {
    const cursor = new Date(anchor);
    if (cursor < monthStart) {
      const days = Math.ceil((monthStart.getTime() - cursor.getTime()) / 86400000);
      cursor.setDate(cursor.getDate() + Math.ceil(days / 7) * 7);
    }
    const dates: string[] = [];
    while (cursor <= monthEnd) {
      dates.push(toISO(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  const anchorMonth = anchor.getFullYear() * 12 + anchor.getMonth();
  const targetMonth = monthStart.getFullYear() * 12 + monthStart.getMonth();
  const monthDifference = targetMonth - anchorMonth;
  if (monthDifference < 0 || (task.frequency === "quarterly" && monthDifference % 3 !== 0)) return [];
  const plannedDay = Math.min(anchor.getDate(), monthEnd.getDate());
  return [toISO(new Date(monthStart.getFullYear(), monthStart.getMonth(), plannedDay, 12))];
}

type RegularStatus = "Выполнено" | "С опозданием" | "Просрочено" | "Запланировано" | "Частично";

function occurrenceStatus(plannedDate: string, record: RegularRecord | undefined, today: Date): RegularStatus {
  if (record?.actualDate) return record.actualDate <= plannedDate ? "Выполнено" : "С опозданием";
  return parseDate(plannedDate) < today ? "Просрочено" : "Запланировано";
}

function regularMonthStatus(task: RegularTask, monthStart: string, today: Date): RegularStatus | null {
  const plannedDates = getPlannedDates(task, monthStart);
  if (plannedDates.length === 0) return null;
  const statuses = plannedDates.map((date) => occurrenceStatus(date, task.records[date], today));
  if (statuses.includes("Просрочено")) return "Просрочено";
  if (statuses.every((status) => status === "Выполнено")) return "Выполнено";
  if (statuses.every((status) => status === "Выполнено" || status === "С опозданием")) return "С опозданием";
  if (statuses.some((status) => status === "Выполнено" || status === "С опозданием")) return "Частично";
  return "Запланировано";
}

function regularStatusClass(status: RegularStatus) {
  if (status === "Выполнено") return "regular-status regular-status-done";
  if (status === "Просрочено") return "regular-status regular-status-overdue";
  if (status === "С опозданием") return "regular-status regular-status-late";
  if (status === "Частично") return "regular-status regular-status-partial";
  return "regular-status regular-status-planned";
}

function splitPeople(value: string) {
  return value.split(",").map(normalizePerson).filter(Boolean);
}

function mergePeople(people: string[], additions: string[]) {
  const result = [...people];
  const known = new Set(people.map((person) => person.toLocaleLowerCase("ru")));
  additions.forEach((item) => {
    const person = normalizePerson(item);
    const key = person.toLocaleLowerCase("ru");
    if (!person || known.has(key)) return;
    known.add(key);
    result.push(person);
  });
  return result;
}

function PeopleSelect({
  value,
  onChange,
  people,
  onAddPerson,
  onDeletePerson,
}: PersonPickerProps & { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = splitPeople(value);
  const normalizedQuery = normalizePerson(query);
  const filteredPeople = people.filter((person) => !normalizedQuery || person.toLocaleLowerCase("ru").includes(normalizedQuery.toLocaleLowerCase("ru")));
  const hasExactMatch = people.some((person) => person.toLocaleLowerCase("ru") === normalizedQuery.toLocaleLowerCase("ru"));

  function updateSelected(next: string[]) {
    onChange(mergePeople([], next).join(", "));
  }

  function toggle(person: string) {
    const normalized = normalizePerson(person);
    if (!normalized) return;
    const selectedKey = normalized.toLocaleLowerCase("ru");
    const isSelected = selected.some((item) => item.toLocaleLowerCase("ru") === selectedKey);
    updateSelected(isSelected ? selected.filter((item) => item.toLocaleLowerCase("ru") !== selectedKey) : [...selected, normalized]);
    onAddPerson(normalized);
    setQuery("");
  }

  return (
    <div className="person-picker people-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="people-input-shell" onClick={(event) => (event.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
        {selected.map((person) => (
          <span className="people-chip" key={person}>{person}<button type="button" aria-label={"Убрать " + person + " из участников"} onClick={(event) => { event.stopPropagation(); updateSelected(selected.filter((item) => item !== person)); }}><X size={12} /></button></span>
        ))}
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && normalizedQuery) {
              event.preventDefault();
              toggle(normalizedQuery);
            }
            if (event.key === "Backspace" && !query && selected.length) updateSelected(selected.slice(0, -1));
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={selected.length ? "Добавить ещё" : "Выберите или введите участника"}
          autoComplete="off"
        />
      </div>
      <ChevronDown className="person-picker-chevron" size={15} />
      {open && (
        <div className="person-dropdown">
          {normalizedQuery && !hasExactMatch && (
            <button type="button" className="person-add-option" onMouseDown={(event) => event.preventDefault()} onClick={() => toggle(normalizedQuery)}>
              <Plus size={14} />Добавить «{normalizedQuery}»
            </button>
          )}
          {filteredPeople.map((person) => {
            const isSelected = selected.some((item) => item.toLocaleLowerCase("ru") === person.toLocaleLowerCase("ru"));
            return (
              <div className="person-option" key={person}>
                <button type="button" className="person-option-select" onMouseDown={(event) => event.preventDefault()} onClick={() => toggle(person)}>
                  <span>{person}</span>{isSelected && <Check size={14} />}
                </button>
                <button type="button" className="person-option-delete" title="Удалить из справочника" aria-label={"Удалить " + person + " из справочника"} onMouseDown={(event) => event.preventDefault()} onClick={() => onDeletePerson(person)}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          {filteredPeople.length === 0 && !normalizedQuery && <div className="person-empty">Справочник пока пуст</div>}
        </div>
      )}
    </div>
  );
}

function CommentsEditor({
  comments,
  onChange,
}: {
  comments: string[];
  onChange: (comments: string[]) => void;
}) {
  const [comment, setComment] = useState("");

  function addComment() {
    const value = comment.trim();
    if (!value) return;
    onChange([...comments, value]);
    setComment("");
  }

  return (
    <div className="comments-editor">
      <label>Комментарии</label>
      {comments.length > 0 && (
        <div className="comment-list">
          {comments.map((item, index) => (
            <div className="comment-item" key={index}>
              <MessageSquareText size={14} />
              <span>{item}</span>
              <button type="button" aria-label="Удалить комментарий" onClick={() => onChange(comments.filter((_, i) => i !== index))}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="comment-entry">
        <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Добавить комментарий..." onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addComment();
          }
        }} />
        <button type="button" className="secondary small-button" onClick={addComment}>Добавить</button>
      </div>
    </div>
  );
}

function TaskDialog({
  item,
  tasks,
  people,
  onAddPerson,
  onDeletePerson,
  onClose,
  onSave,
  onDelete,
  onOpenTask,
}: {
  item: Task | null;
  tasks: Task[];
  people: string[];
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
  onOpenTask: (task: Task) => void;
}) {
  const parents = tasks.filter((task) => !task.parentId && task.id !== item?.id);
  const hasChildren = item ? tasks.some((task) => task.parentId === item.id) : false;
  const [taskType, setTaskType] = useState<"parent" | "subtask">(() => {
    if (item) return item.parentId ? "subtask" : "parent";
    return parents.length > 0 ? "subtask" : "parent";
  });
  const [draft, setDraft] = useState<Task>(() => item ? { ...item, comments: [...item.comments] } : {
    id: crypto.randomUUID(),
    parentId: null,
    title: "",
    assignee: "",
    status: "Не начато",
    startDate: toISO(startOfToday()),
    endDate: addDays(toISO(startOfToday()), 7),
    comments: [],
  });
  const [error, setError] = useState("");

  const isTemplateSprint = Boolean(item?.template?.subCode);
  const isTemplateParent = Boolean(item?.template) && !isTemplateSprint;
  const sprints = isTemplateParent && item ? templateSprints(tasks, item.id) : [];
  const sprintItems = isTemplateSprint ? (draft.groups ?? []).flatMap((group) => group.items) : [];
  const sprintAllDone = sprintItems.length > 0 && sprintItems.every((checkpoint) => checkpoint.done);
  const parentProgress = isTemplateParent && item ? checkpointProgress(item, tasks) ?? { done: 0, total: 0 } : { done: 0, total: 0 };

  const dialogTitle = item?.template
    ? (item.template.subCode || item.template.code) + ". " + draft.title
    : item ? "Редактировать задачу" : "Новая задача";
  const dialogSubtitle = isTemplateSprint && item
    ? "Типовая задача " + item.template!.code + " · спринт " + item.template!.week + " из " + templateSprints(tasks, item.parentId).length + " · неделя " + formatDayMonth(draft.startDate) + " — " + formatDayMonth(draft.endDate)
    : isTemplateParent
      ? "Типовая задача · " + sprints.length + " " + pluralSprints(sprints.length) + " · " + formatDayMonth(draft.startDate) + " — " + formatDayMonth(draft.endDate) + " · контрольных точек " + parentProgress.done + " из " + parentProgress.total
      : "Сроки сразу появятся на диаграмме Ганта";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError("Укажите название задачи.");
    if (taskType === "subtask" && !draft.parentId) return setError("Выберите надзадачу для этой подзадачи.");
    if (!draft.startDate || !draft.endDate || parseDate(draft.startDate) > parseDate(draft.endDate)) {
      return setError("Проверьте даты начала и окончания.");
    }
    onSave({ ...draft, parentId: item?.template ? draft.parentId : taskType === "parent" ? null : draft.parentId, title: draft.title.trim(), assignee: draft.assignee.trim() });
  }

  return (
    <ModalShell title={dialogTitle} subtitle={dialogSubtitle} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field field-wide">{isTemplateSprint ? "Название подзадачи" : "Название задачи"}<input autoFocus={!item?.template} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, Подготовить форму ДДС" /></label>
          <div className="form-grid">
            {!item?.template && <label className="field">Тип задачи<select value={taskType} onChange={(event) => {
              const value = event.target.value as "parent" | "subtask";
              setTaskType(value);
              if (value === "parent") setDraft({ ...draft, parentId: null });
            }}><option value="subtask" disabled={parents.length === 0 || hasChildren}>Подзадача</option><option value="parent">Надзадача</option></select><ChevronDown size={15} /></label>}
            <div className="field"><span>Ответственный</span><PersonSelect value={draft.assignee} onChange={(assignee) => setDraft({ ...draft, assignee })} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
            {!item?.template && taskType === "subtask" && <label className="field field-wide">К какой надзадаче прикрепить<select value={draft.parentId || ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })}><option value="">Выберите надзадачу</option>{parents.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select><ChevronDown size={15} /></label>}
            {item?.template && <label className="field">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>}
            <label className="field">Дата начала<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
            <label className="field">Дедлайн<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
            {!item?.template && <label className="field field-wide">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>}
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
                      <span className="sprint-dates">{formatDayMonth(sprint.startDate)} — {formatDayMonth(sprint.endDate)}</span>
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
        <footer className="modal-actions">
          {item ? <button type="button" className="delete-button" onClick={() => onDelete(item.id)}><Trash2 size={16} />Удалить</button> : <span />}
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить</button></div>
        </footer>
      </form>
    </ModalShell>
  );
}

function IdeaDialog({
  item,
  people,
  onAddPerson,
  onDeletePerson,
  onClose,
  onSave,
  onDelete,
}: {
  item: Idea | null;
  people: string[];
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
  onClose: () => void;
  onSave: (idea: Idea) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Idea>(() => item ? { ...item, comments: [...item.comments] } : {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    status: "Новая",
    priority: "Средний",
    owner: "",
    effect: "",
    deadline: "",
    comments: [],
  });
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError("Укажите название решения.");
    onSave({ ...draft, title: draft.title.trim(), owner: draft.owner.trim() });
  }

  return (
    <ModalShell title={item ? "Редактировать решение" : "Новая идея"} subtitle="Зафиксируйте гипотезу и ожидаемый эффект" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field field-wide">Название<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Кратко сформулируйте решение" /></label>
          <label className="field field-wide">Описание<textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Проблема, основание или контекст" /></label>
          <div className="form-grid">
            <label className="field">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as IdeaStatus })}>{IDEA_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>
            <label className="field">Приоритет<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><ChevronDown size={15} /></label>
            <div className="field"><span>Ответственный</span><PersonSelect value={draft.owner} onChange={(owner) => setDraft({ ...draft, owner })} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
            <label className="field">Срок<input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label>
            <label className="field field-wide">Ожидаемый эффект<input value={draft.effect} onChange={(event) => setDraft({ ...draft, effect: event.target.value })} placeholder="Например, +500 тыс. ₽ / мес." /></label>
          </div>
          <CommentsEditor comments={draft.comments} onChange={(comments) => setDraft({ ...draft, comments })} />
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="modal-actions">
          {item ? <button type="button" className="delete-button" onClick={() => onDelete(item.id)}><Trash2 size={16} />Удалить</button> : <span />}
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить</button></div>
        </footer>
      </form>
    </ModalShell>
  );
}

function MeetingDialog({
  item,
  defaultDate,
  people,
  seriesCount,
  onAddPerson,
  onDeletePerson,
  onClose,
  onSave,
  onDelete,
}: {
  item: Meeting | null;
  defaultDate: string;
  people: string[];
  seriesCount: number;
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
  onClose: () => void;
  onSave: (meeting: Meeting, repeat: MeetingRepeat) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Meeting>(() => item ? { ...item, comments: [...item.comments] } : {
    id: crypto.randomUUID(),
    title: "",
    plannedDate: defaultDate || toISO(startOfToday()),
    plannedTime: "10:00",
    participants: "",
    agenda: "",
    status: "planned",
    actualDate: "",
    actualTime: "",
    duration: "",
    outcome: "",
    comments: [],
  });
  const [repeat, setRepeat] = useState<MeetingRepeat>("none");
  const [error, setError] = useState("");

  function markCompleted() {
    setDraft({
      ...draft,
      status: "completed",
      actualDate: draft.actualDate || draft.plannedDate,
      actualTime: draft.actualTime || draft.plannedTime,
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError("Укажите тему встречи.");
    if (!draft.plannedDate) return setError("Укажите плановую дату.");
    if (repeat !== "none" && draft.status !== "planned") return setError("Повторение можно настроить только для запланированной встречи.");
    if (draft.status === "completed" && !draft.actualDate) return setError("Укажите фактическую дату.");
    if (draft.status === "completed" && !draft.duration) return setError("Выберите длительность встречи.");
    onSave({ ...draft, title: draft.title.trim(), participants: splitPeople(draft.participants).join(", ") }, repeat);
  }

  return (
    <ModalShell title={item ? "Встреча" : "Запланировать встречу"} subtitle="Плановая и фактическая даты отображаются в календаре" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {item?.seriesId && seriesCount > 1 && (
            <p className="series-banner">
              <Repeat2 size={14} />
              <span>Встреча из серии «{item.seriesFrequency ? frequencyTitle(item.seriesFrequency) : "повторяется"}» — всего {seriesCount} {pluralMeetings(seriesCount)}. При сохранении и удалении можно выбрать, затронуть только эту встречу, её и последующие или всю серию.</span>
            </p>
          )}
          <label className="field field-wide">Тема встречи<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, Статус-встреча по проекту" /></label>
          <div className="form-grid">
            <label className="field">Плановая дата<input type="date" value={draft.plannedDate} onChange={(event) => setDraft({ ...draft, plannedDate: event.target.value })} /></label>
            <label className="field">Плановое время<input type="time" value={draft.plannedTime} onChange={(event) => setDraft({ ...draft, plannedTime: event.target.value })} /></label>
            {!item && <label className="field field-wide recurrence-field">Повторение<select value={repeat} onChange={(event) => setRepeat(event.target.value as MeetingRepeat)}>{MEETING_REPEATS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} />{repeat !== "none" && <small className="field-note">Будет создано {getMeetingRepeatDates(draft.plannedDate, repeat).length} отдельных встреч на 12 месяцев вперёд.</small>}</label>}
            <div className="field field-wide"><span>Участники</span><PeopleSelect value={draft.participants} onChange={(participants) => setDraft({ ...draft, participants })} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
          </div>
          <label className="field field-wide">Повестка<textarea rows={2} value={draft.agenda} onChange={(event) => setDraft({ ...draft, agenda: event.target.value })} placeholder="Что нужно обсудить и решить" /></label>
          <div className="meeting-status-line">
            <label className="field">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Meeting["status"] })}><option value="planned">Запланирована</option><option value="completed">Проведена</option><option value="cancelled">Отменена</option></select><ChevronDown size={15} /></label>
            {draft.status !== "completed" && <button type="button" className="complete-button" onClick={markCompleted}><Check size={16} />Отметить проведённой</button>}
          </div>
          {draft.status === "completed" && (
            <div className="fact-panel">
              <div className="form-grid fact-grid">
                <label className="field">Фактическая дата<input type="date" value={draft.actualDate} onChange={(event) => setDraft({ ...draft, actualDate: event.target.value })} /></label>
                <label className="field">Фактическое время<input type="time" value={draft.actualTime} onChange={(event) => setDraft({ ...draft, actualTime: event.target.value })} /></label>
                <label className="field">Длительность<select value={draft.duration || ""} onChange={(event) => setDraft({ ...draft, duration: event.target.value as MeetingDuration | "" })}><option value="">Выберите</option><option>Меньше получаса</option><option>Час</option><option>2 часа</option></select><ChevronDown size={15} /></label>
              </div>
              <label className="field field-wide">Итоги встречи<textarea rows={3} value={draft.outcome} onChange={(event) => setDraft({ ...draft, outcome: event.target.value })} placeholder="Решения и следующие шаги" /></label>
            </div>
          )}
          <CommentsEditor comments={draft.comments} onChange={(comments) => setDraft({ ...draft, comments })} />
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="modal-actions">
          {item ? <button type="button" className="delete-button" onClick={() => onDelete(item.id)}><Trash2 size={16} />Удалить</button> : <span />}
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить</button></div>
        </footer>
      </form>
    </ModalShell>
  );
}

const SCOPE_OPTIONS: Array<{ value: MeetingSeriesScope; label: string; hint: string }> = [
  { value: "single", label: "Только эту встречу", hint: "Остальные встречи серии останутся как есть." },
  { value: "following", label: "Эту и все последующие", hint: "Эта встреча и все более поздние в серии." },
  { value: "all", label: "Все встречи серии", hint: "Вся серия целиком, включая уже прошедшие встречи." },
];

function MeetingScopeDialog({
  mode,
  meeting,
  counts,
  onCancel,
  onConfirm,
}: {
  mode: "delete" | "edit";
  meeting: Meeting;
  counts: Record<MeetingSeriesScope, number>;
  onCancel: () => void;
  onConfirm: (scope: MeetingSeriesScope) => void;
}) {
  // Удаление чаще всего нужно «наперёд» — регулярная встреча отвалилась и больше не собирается;
  // правка же по умолчанию касается только выбранной встречи.
  const [scope, setScope] = useState<MeetingSeriesScope>(mode === "delete" ? "following" : "single");
  const frequency = meeting.seriesFrequency ? frequencyTitle(meeting.seriesFrequency) : "повторяется";

  return (
    <ModalShell
      title={mode === "delete" ? "Удалить повторяющуюся встречу" : "Изменить повторяющуюся встречу"}
      subtitle={"«" + meeting.title + "» · " + frequency + " · " + counts.all + " " + pluralMeetings(counts.all) + " в серии"}
      onClose={onCancel}
    >
      <div className="modal-body">
        <div className="scope-options">
          {SCOPE_OPTIONS.map((option) => (
            <label key={option.value} className={"scope-option" + (scope === option.value ? " is-active" : "")}>
              <input type="radio" name="meeting-scope" checked={scope === option.value} onChange={() => setScope(option.value)} />
              <span className="scope-copy"><b>{option.label}</b><small>{option.hint}</small></span>
              <em>{counts[option.value]} {pluralMeetings(counts[option.value])}</em>
            </label>
          ))}
        </div>
        <p className="field-note scope-note">
          {mode === "delete"
            ? "Удаление отменить нельзя: вместе со встречами пропадут их итоги и комментарии."
            : "По серии обновляются тема, время, участники и повестка. Перенос даты сдвигает выбранные встречи на столько же дней; статусы, итоги и комментарии остаются у каждой встречи своими."}
        </p>
      </div>
      <footer className="modal-actions">
        <span />
        <div>
          <button type="button" className="secondary" onClick={onCancel}>Отмена</button>
          <button type="button" className={mode === "delete" ? "primary danger-button" : "primary"} onClick={() => onConfirm(scope)}>
            {mode === "delete" ? "Удалить" : "Сохранить"}
          </button>
        </div>
      </footer>
    </ModalShell>
  );
}

function RegularTaskDialog({
  item,
  tasks,
  people,
  onAddPerson,
  onDeletePerson,
  onClose,
  onSave,
  onDelete,
}: {
  item: RegularTask | null;
  tasks: RegularTask[];
  people: string[];
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
  onClose: () => void;
  onSave: (task: RegularTask) => void;
  onDelete: (id: string) => void;
}) {
  const parents = tasks.filter((task) => !task.parentId && task.id !== item?.id);
  const hasChildren = item ? tasks.some((task) => task.parentId === item.id) : false;
  const [taskType, setTaskType] = useState<"parent" | "subtask">(() => {
    if (item) return item.parentId ? "subtask" : "parent";
    return parents.length > 0 ? "subtask" : "parent";
  });
  const [draft, setDraft] = useState<RegularTask>(() => item ? {
    ...item,
    records: structuredClone(item.records),
  } : {
    id: crypto.randomUUID(),
    parentId: null,
    title: "",
    assignee: "",
    frequency: "monthly",
    anchorDate: toISO(startOfToday()),
    description: "",
    records: {},
  });
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError("Укажите название регулярной задачи.");
    if (!draft.assignee.trim()) return setError("Укажите ответственного.");
    if (!draft.anchorDate) return setError("Укажите дату первого выполнения.");
    if (taskType === "subtask" && !draft.parentId) return setError("Выберите регулярную задачу, к которой относится подэтап.");
    onSave({
      ...draft,
      parentId: taskType === "parent" ? null : draft.parentId,
      title: draft.title.trim(),
      assignee: draft.assignee.trim(),
      description: draft.description.trim(),
    });
  }

  return (
    <ModalShell title={item ? "Регулярная задача" : "Создать регулярную задачу"} subtitle="Периодичность формирует нормативные даты автоматически" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field field-wide">Название<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, Закрыть управленческий месяц" /></label>
          <div className="form-grid">
            <label className="field">Тип<select value={taskType} onChange={(event) => {
              const value = event.target.value as "parent" | "subtask";
              setTaskType(value);
              if (value === "parent") setDraft({ ...draft, parentId: null });
            }}><option value="subtask" disabled={parents.length === 0 || hasChildren}>Подэтап</option><option value="parent">Регулярная задача</option></select><ChevronDown size={15} /></label>
            <div className="field"><span>Ответственный *</span><PersonSelect value={draft.assignee} onChange={(assignee) => setDraft({ ...draft, assignee })} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
            {taskType === "subtask" && <label className="field field-wide">К какой задаче прикрепить<select value={draft.parentId || ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })}><option value="">Выберите регулярную задачу</option>{parents.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><ChevronDown size={15} /></label>}
            <label className="field">Периодичность<select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as RegularFrequency })}>{REGULAR_FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</select><ChevronDown size={15} /></label>
            <label className="field">Дата первого выполнения<input type="date" value={draft.anchorDate} onChange={(event) => setDraft({ ...draft, anchorDate: event.target.value })} /></label>
          </div>
          <label className="field field-wide">Регламент или описание<textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Что именно нужно сделать и проверить" /></label>
          {error && <p className="form-error">{error}</p>}
        </div>
        <footer className="modal-actions">
          {item ? <button type="button" className="delete-button" onClick={() => onDelete(item.id)}><Trash2 size={16} />Удалить</button> : <span />}
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить</button></div>
        </footer>
      </form>
    </ModalShell>
  );
}

function RegularPeriodDialog({
  task,
  monthStart,
  onClose,
  onSave,
}: {
  task: RegularTask;
  monthStart: string;
  onClose: () => void;
  onSave: (task: RegularTask) => void;
}) {
  const plannedDates = getPlannedDates(task, monthStart);
  const [records, setRecords] = useState<Record<string, RegularRecord>>(() => structuredClone(task.records));
  const monthDate = parseDate(monthStart);
  // Карточка открывается только по клику, то есть заведомо после гидратации,
  // поэтому дату здесь можно взять напрямую — расхождения с разметкой сервера не будет.
  const today = startOfToday();

  function updateRecord(plannedDate: string, field: keyof RegularRecord, value: string) {
    setRecords((current) => ({
      ...current,
      [plannedDate]: { ...(current[plannedDate] || { actualDate: "", note: "" }), [field]: value },
    }));
  }

  return (
    <ModalShell title={task.title} subtitle={MONTHS[monthDate.getMonth()] + " " + monthDate.getFullYear() + " · план-факт выполнения"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...task, records }); }}>
        <div className="modal-body regular-period-body">
          {task.description && <p className="regular-description">{task.description}</p>}
          {plannedDates.map((plannedDate) => {
            const record = records[plannedDate] || { actualDate: "", note: "" };
            const status = occurrenceStatus(plannedDate, record, today);
            return (
              <section className="regular-occurrence" key={plannedDate}>
                <div className="regular-occurrence-head"><div><small>Нормативная дата</small><strong>{formatShortDate(plannedDate)}</strong></div><em className={regularStatusClass(status)}>{status}</em></div>
                <label className="field">Фактическая дата<input type="date" value={record.actualDate} onChange={(event) => updateRecord(plannedDate, "actualDate", event.target.value)} /></label>
                <label className="field">Примечание<textarea rows={2} value={record.note} onChange={(event) => updateRecord(plannedDate, "note", event.target.value)} placeholder={status === "Просрочено" ? "Укажите, почему задача не выполнена" : "Детали выполнения или причина отклонения"} /></label>
              </section>
            );
          })}
        </div>
        <footer className="modal-actions"><span /><div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">Сохранить факт</button></div></footer>
      </form>
    </ModalShell>
  );
}

export default function Dashboard({ initialData, serverToday, templates }: { initialData: DashboardData; serverToday: string; templates: TypicalTaskTemplate[] }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activePage, setActivePage] = useState<"roadmap" | "policy">("roadmap");
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [storageMode, setStorageMode] = useState<"postgres" | "local">("local");
  const [modal, setModal] = useState<ModalState>(null);
  // Выбор охвата для встречи из серии: удалить/поправить одну, хвост или всю серию.
  // Карточка встречи на это время закрывается, а её черновик ждёт здесь.
  const [seriesPrompt, setSeriesPrompt] = useState<{ mode: "delete" | "edit"; meeting: Meeting; draft: Meeting | null } | null>(null);
  const [ganttFilter, setGanttFilter] = useState<"Все" | "В работе" | "Просрочено">("Все");
  const [baselineDate, setBaselineDate] = useState("");
  const [baselineMenuOpen, setBaselineMenuOpen] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set());
  const [collapsedRegularIds, setCollapsedRegularIds] = useState<Set<string>>(() => new Set(
    initialData.regularTasks
      .filter((task) => !task.parentId && initialData.regularTasks.some((child) => child.parentId === task.id))
      .map((task) => task.id),
  ));
  const [ideaSearch, setIdeaSearch] = useState("");
  const [ideaStatus, setIdeaStatus] = useState("Все статусы");
  const [ideaPriority, setIdeaPriority] = useState("Все приоритеты");
  const [editingClient, setEditingClient] = useState(false);
  const [clientDraft, setClientDraft] = useState(initialData.clientName);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Пока пользователь не пролистнул календарь руками, он следует за текущим месяцем.
  // После первого ручного перехода выбор живёт здесь и больше никуда не съезжает.
  const [pickedCalendarMonth, setPickedCalendarMonth] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  // Тост — обобщённое короткое уведомление внизу экрана; пока используется только после
  // добавления типовой задачи, но не завязано на неё напрямую.
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Свежедобавленные строки таблицы подсвечиваются на несколько секунд, затем класс снимается.
  const [freshTaskIds, setFreshTaskIds] = useState<Set<string>>(() => new Set());
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Гант и его ширина пересчитываются от data.tasks, поэтому дату для прокрутки после
  // добавления типовой задачи откладываем сюда (в ref, а не в state — установка её значения
  // не должна сама по себе быть сайд-эффектом рендера) и прокручиваем в эффекте — уже по новому диапазону.
  const pendingScrollDateRef = useRef<string | null>(null);

  // Серверный снимок — дата, вшитая в статическую разметку. Совпадение с HTML снимает
  // расхождение при гидратации, а сразу после неё React возьмёт браузерный снимок.
  const getServerToday = useCallback(() => serverToday, [serverToday]);
  const todayKey = useSyncExternalStore(subscribeToDayChange, getTodayKey, getServerToday);
  const today = useMemo(() => parseDate(todayKey), [todayKey]);
  const calendarMonth = useMemo(() => pickedCalendarMonth ?? startOfMonth(today), [pickedCalendarMonth, today]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/data", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as { data: DashboardData; storage: "postgres" | "local" } & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить данные");
        return payload as { data: DashboardData; storage: "postgres" | "local" };
      })
      .then((payload) => {
        setData(payload.data);
        setClientDraft(payload.data.clientName);
        setStorageMode(payload.storage);
        setSaveStatus("saved");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") {
          setSaveErrorMessage(error.message);
          setSaveStatus("error");
        }
      });
    return () => controller.abort();
  }, []);

  const persist = useCallback(async (nextData: DashboardData) => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Историю базовых планов ведёт сервер, обратно её не отправляем — иначе она
        // росла бы в каждом запросе и упиралась в лимит размера тела.
        body: JSON.stringify({ data: { ...nextData, baselines: {} } }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось сохранить изменения");
      setSaveStatus("saved");
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить изменения");
      setSaveStatus("error");
    }
  }, []);

  const commit = useCallback((updater: DashboardData | ((current: DashboardData) => DashboardData)) => {
    setData((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 450);
      return next;
    });
  }, [persist]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (freshTimer.current) clearTimeout(freshTimer.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  const ordered = useMemo(() => orderedTasks(data.tasks), [data.tasks]);
  const filteredTasks = useMemo(() => ordered.filter((task) => {
    if (ganttFilter === "В работе") return task.status === "В работе" || task.status === "На проверке";
    if (ganttFilter === "Просрочено") return isTaskOverdue(task, today);
    return true;
  }), [ordered, ganttFilter, today]);
  const visibleTasks = useMemo(() => filteredTasks.filter((task) => !task.parentId || !collapsedTaskIds.has(task.parentId)), [filteredTasks, collapsedTaskIds]);

  const baselineDates = useMemo(() => Object.keys(data.baselines || {}).sort(), [data.baselines]);
  // Показываем ближайший снимок на выбранную дату или раньше — так дату можно назвать любую,
  // а не выбирать из списка сохранённых.
  const baselineKey = useMemo(() => {
    if (!baselineDate) return null;
    const reached = baselineDates.filter((date) => date <= baselineDate);
    return reached.length > 0 ? reached[reached.length - 1] : null;
  }, [baselineDate, baselineDates]);
  const baseline = baselineKey ? data.baselines[baselineKey] : null;

  // Штриховкой помечается промежуток между базовыми и текущими сроками: если срок вырос,
  // он лежит поверх полоски, если сократился — выходит за её край. Совпали сроки — сегментов нет,
  // и строка выглядит ровно так же, как без базового плана.
  const baselineShiftOf = useCallback((task: Task) => {
    const base = baseline?.[task.id];
    if (!base || !base.startDate || !base.endDate) return null;
    if (base.startDate === task.startDate && base.endDate === task.endDate) return null;

    const segments: Array<{ id: string; from: string; to: string; inside: boolean }> = [];
    if (base.startDate !== task.startDate) {
      const grewEarlier = task.startDate < base.startDate;
      const [from, to] = grewEarlier ? [task.startDate, base.startDate] : [base.startDate, task.startDate];
      segments.push({ id: "start", from, to: addDays(to, -1), inside: grewEarlier });
    }
    if (base.endDate !== task.endDate) {
      const grewLater = task.endDate > base.endDate;
      const [from, to] = grewLater ? [base.endDate, task.endDate] : [task.endDate, base.endDate];
      segments.push({ id: "end", from: addDays(from, 1), to, inside: grewLater });
    }

    const days = Math.round((parseDate(task.endDate).getTime() - parseDate(base.endDate).getTime()) / 86400000);
    return { base, days, segments };
  }, [baseline]);

  const shiftedCount = useMemo(() => (baseline ? data.tasks.filter((task) => baselineShiftOf(task)).length : 0), [baseline, data.tasks, baselineShiftOf]);

  const openTasks = data.tasks.filter((task) => task.status !== "Завершено");
  const overdueCount = openTasks.filter((task) => isTaskOverdue(task, today)).length;
  const nearestTask = [...openTasks].filter((task) => parseDate(task.endDate) >= today).sort((a, b) => parseDate(a.endDate).getTime() - parseDate(b.endDate).getTime())[0];
  const nextMeeting = [...data.meetings].filter((meeting) => meeting.status === "planned" && parseDate(meeting.plannedDate) >= today).sort((a, b) => (a.plannedDate + a.plannedTime).localeCompare(b.plannedDate + b.plannedTime))[0];

  const planningCoverage = useMemo(() => {
    const workTasks = data.tasks.filter((task) => task.parentId || !data.tasks.some((child) => child.parentId === task.id));
    return [0, 1].map((monthOffset) => {
      const monthStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1, 12);
      const count = workTasks.filter((task) => taskOverlapsMonth(task, monthStart)).length;
      return { monthStart, count, hasPlan: count > 0 };
    });
  }, [data.tasks, today]);
  const missingPlanMonths = planningCoverage.filter((month) => !month.hasPlan);
  const hasTwoMonthPlan = missingPlanMonths.length === 0;
  const planningMessage = hasTwoMonthPlan
    ? "План работ сформирован на текущий и следующий месяц"
    : missingPlanMonths.length === 2
      ? "Нет плана работ на текущий и следующий месяц"
      : "Нет плана работ на " + MONTHS_GENITIVE[missingPlanMonths[0].monthStart.getMonth()];

  const ganttRange = useMemo(() => {
    const baselineDatesInPlay = baseline ? Object.values(baseline).flatMap((base) => [parseDate(base.startDate), parseDate(base.endDate)]) : [];
    const dates = [today, ...data.tasks.flatMap((task) => [parseDate(task.startDate), parseDate(task.endDate)]), ...baselineDatesInPlay].filter((date) => !Number.isNaN(date.getTime()));
    const minDate = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : today;
    const maxDate = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(2026, 8, 30, 12);
    const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0, 12);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const months: Array<{ key: string; label: string; days: number }> = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
      months.push({
        key: cursor.getFullYear() + "-" + cursor.getMonth(),
        label: MONTHS[cursor.getMonth()] + " " + cursor.getFullYear(),
        days: monthEnd.getDate(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { start, end, totalDays, months };
  }, [data.tasks, baseline, today]);

  const ideaRows = useMemo(() => {
    const search = ideaSearch.trim().toLowerCase();
    return data.ideas.filter((idea) => {
      const matchesSearch = !search || (idea.title + " " + idea.description + " " + idea.owner).toLowerCase().includes(search);
      const matchesStatus = ideaStatus === "Все статусы" || idea.status === ideaStatus;
      const matchesPriority = ideaPriority === "Все приоритеты" || idea.priority === ideaPriority;
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [data.ideas, ideaSearch, ideaStatus, ideaPriority]);

  const calendarCells = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
    const mondayIndex = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayIndex);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = toISO(date);
      const meetingsOnDate = data.meetings.filter((meeting) => (meeting.status !== "cancelled" && meeting.plannedDate === iso) || (meeting.status === "completed" && meeting.actualDate === iso));
      const hasPlan = meetingsOnDate.some((meeting) => meeting.status !== "cancelled" && meeting.plannedDate === iso);
      const hasFact = meetingsOnDate.some((meeting) => meeting.status === "completed" && meeting.actualDate === iso);
      return { date, iso, hasPlan, hasFact, count: new Set(meetingsOnDate.map((meeting) => meeting.id)).size, inMonth: date.getMonth() === calendarMonth.getMonth() };
    });
  }, [calendarMonth, data.meetings]);

  // Серии, в которых осталось больше одной встречи: только их помечаем в списке.
  const activeSeriesIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meeting of data.meetings) {
      if (meeting.seriesId) counts.set(meeting.seriesId, (counts.get(meeting.seriesId) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([seriesId]) => seriesId));
  }, [data.meetings]);

  const displayedMeetings = useMemo(() => {
    const isInCalendarMonth = (value: string) => {
      const date = parseDate(value);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === calendarMonth.getFullYear() && date.getMonth() === calendarMonth.getMonth();
    };
    const meetings = data.meetings.filter((meeting) => {
      if (selectedDate) return meeting.plannedDate === selectedDate || (meeting.status === "completed" && meeting.actualDate === selectedDate);
      return isInCalendarMonth(meeting.plannedDate) || (meeting.status === "completed" && isInCalendarMonth(meeting.actualDate));
    });
    return meetings.sort((a, b) => {
      const firstFact = a.status === "completed" && (selectedDate ? a.actualDate === selectedDate : isInCalendarMonth(a.actualDate));
      const secondFact = b.status === "completed" && (selectedDate ? b.actualDate === selectedDate : isInCalendarMonth(b.actualDate));
      const firstKey = (selectedDate || (firstFact ? a.actualDate : a.plannedDate)) + (firstFact && a.actualTime ? a.actualTime : a.plannedTime);
      const secondKey = (selectedDate || (secondFact ? b.actualDate : b.plannedDate)) + (secondFact && b.actualTime ? b.actualTime : b.plannedTime);
      return firstKey.localeCompare(secondKey);
    });
  }, [data.meetings, selectedDate, calendarMonth]);

  const regularMonths = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1, 12);
    return { date, iso: toISO(date), label: MONTHS[date.getMonth()] + " " + date.getFullYear() };
  }), [today]);
  const regularRows = useMemo(() => orderedRegularTasks(data.regularTasks).filter((task) => !task.parentId || !collapsedRegularIds.has(task.parentId)), [data.regularTasks, collapsedRegularIds]);

  function addPerson(person: string) {
    const normalized = normalizePerson(person);
    if (!normalized || data.people.some((item) => item.toLocaleLowerCase("ru") === normalized.toLocaleLowerCase("ru"))) return;
    commit((current) => ({ ...current, people: mergePeople(current.people, [normalized]) }));
  }

  function deletePerson(person: string) {
    const key = person.toLocaleLowerCase("ru");
    commit((current) => ({ ...current, people: current.people.filter((item) => item.toLocaleLowerCase("ru") !== key) }));
  }

  function saveTask(task: Task) {
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, [task.assignee]),
      tasks: current.tasks.some((item) => item.id === task.id) ? current.tasks.map((item) => item.id === task.id ? task : item) : [...current.tasks, task],
    }));
    setModal(null);
  }

  function deleteTask(id: string) {
    if (!window.confirm("Удалить задачу и её подзадачи?")) return;
    commit((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id && task.parentId !== id) }));
    setModal(null);
  }

  function addTemplateTasks(newTasks: Task[]) {
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, [newTasks[0].assignee]),
      tasks: [...current.tasks, ...newTasks],
    }));
    setModal(null);
    // Под фильтром «В работе» или «Просрочено» новые строки не прошли бы отбор,
    // поэтому показываем всю дорожную карту — задача должна быть видна сразу.
    setGanttFilter("Все");
    // Гант ещё не знает про новые задачи — реальную прокрутку делаем в эффекте,
    // когда ganttRange и ширина таймлайна пересчитаются от обновлённого data.tasks.
    pendingScrollDateRef.current = newTasks[0].startDate;

    const parent = newTasks[0];
    const childCount = newTasks.length - 1;
    setFreshTaskIds(new Set(newTasks.map((task) => task.id)));
    if (freshTimer.current) clearTimeout(freshTimer.current);
    freshTimer.current = setTimeout(() => setFreshTaskIds(new Set()), 3500);

    showToast("Добавлено: " + (parent.template?.code ?? "") + " · " + childCount + " " + pluralSubtasks(childCount) + ", " + formatDayMonth(parent.startDate) + " — " + formatDayMonth(parent.endDate));
  }

  function saveIdea(idea: Idea) {
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, [idea.owner]),
      ideas: current.ideas.some((item) => item.id === idea.id) ? current.ideas.map((item) => item.id === idea.id ? idea : item) : [...current.ideas, idea],
    }));
    setModal(null);
  }

  function deleteIdea(id: string) {
    if (!window.confirm("Удалить управленческое решение?")) return;
    commit((current) => ({ ...current, ideas: current.ideas.filter((idea) => idea.id !== id) }));
    setModal(null);
  }

  function focusMeetingDate(plannedDate: string) {
    setSelectedDate(plannedDate);
    setPickedCalendarMonth(startOfMonth(parseDate(plannedDate)));
  }

  // Поля, одинаковые для всей серии: если правка их не трогает (например, встречу просто
  // отметили проведённой), спрашивать про охват незачем.
  function hasSeriesWideChanges(original: Meeting, draft: Meeting) {
    return original.title !== draft.title
      || original.plannedDate !== draft.plannedDate
      || original.plannedTime !== draft.plannedTime
      || original.participants !== draft.participants
      || original.agenda !== draft.agenda;
  }

  function saveMeeting(meeting: Meeting, repeat: MeetingRepeat) {
    const original = data.meetings.find((item) => item.id === meeting.id);
    if (original) {
      if (isSeriesMeeting(data.meetings, original) && hasSeriesWideChanges(original, meeting)) {
        setSeriesPrompt({ mode: "edit", meeting: original, draft: meeting });
        setModal(null);
        return;
      }
      applyMeetingEdit(meeting, original, "single");
      return;
    }

    const repeatDates = getMeetingRepeatDates(meeting.plannedDate, repeat);
    // Все повторы остаются самостоятельными встречами, но получают общий seriesId,
    // чтобы их потом можно было удалить или поправить пачкой.
    const seriesId = repeat === "none" ? undefined : crypto.randomUUID();
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, splitPeople(meeting.participants)),
      meetings: repeat === "none"
        ? [...current.meetings, meeting]
        : [...current.meetings, ...repeatDates.map((plannedDate, index) => ({
            ...meeting,
            id: index === 0 ? meeting.id : crypto.randomUUID(),
            seriesId,
            seriesFrequency: repeat,
            plannedDate,
            status: "planned" as const,
            actualDate: "",
            actualTime: "",
            duration: "" as const,
            outcome: "",
          }))],
    }));
    focusMeetingDate(meeting.plannedDate);
    setModal(null);
  }

  function applyMeetingEdit(draft: Meeting, original: Meeting, scope: MeetingSeriesScope) {
    commit((current) => {
      const affected = new Set(selectSeriesScope(current.meetings, original, scope).map((item) => item.id));
      const dayShift = differenceInDays(original.plannedDate, draft.plannedDate);
      return {
        ...current,
        people: mergePeople(current.people, splitPeople(draft.participants)),
        meetings: current.meetings.map((item) => {
          if (item.id === draft.id) return draft;
          if (!affected.has(item.id)) return item;
          // По серии расходятся только общие поля: статус, факт и комментарии у каждой встречи свои.
          return {
            ...item,
            title: draft.title,
            plannedTime: draft.plannedTime,
            participants: draft.participants,
            agenda: draft.agenda,
            plannedDate: dayShift === 0 ? item.plannedDate : addDays(item.plannedDate, dayShift),
          };
        }),
      };
    });
    focusMeetingDate(draft.plannedDate);
    setSeriesPrompt(null);
    setModal(null);
  }

  function deleteMeeting(id: string) {
    const meeting = data.meetings.find((item) => item.id === id);
    if (!meeting) return;
    if (isSeriesMeeting(data.meetings, meeting)) {
      setSeriesPrompt({ mode: "delete", meeting, draft: null });
      setModal(null);
      return;
    }
    if (!window.confirm("Удалить встречу?")) return;
    commit((current) => ({ ...current, meetings: current.meetings.filter((item) => item.id !== id) }));
    setModal(null);
  }

  function applyMeetingDeletion(meeting: Meeting, scope: MeetingSeriesScope) {
    commit((current) => {
      const removed = new Set(selectSeriesScope(current.meetings, meeting, scope).map((item) => item.id));
      return { ...current, meetings: current.meetings.filter((item) => !removed.has(item.id)) };
    });
    setSeriesPrompt(null);
    setModal(null);
  }

  function saveRegularTask(task: RegularTask) {
    commit((current) => ({
      ...current,
      people: mergePeople(current.people, [task.assignee]),
      regularTasks: current.regularTasks.some((item) => item.id === task.id)
        ? current.regularTasks.map((item) => item.id === task.id ? task : item)
        : [...current.regularTasks, task],
    }));
    setModal(null);
  }

  function deleteRegularTask(id: string) {
    if (!window.confirm("Удалить регулярную задачу и её подэтапы?")) return;
    commit((current) => ({ ...current, regularTasks: current.regularTasks.filter((task) => task.id !== id && task.parentId !== id) }));
    setModal(null);
  }

  function saveClientName() {
    const value = clientDraft.trim() || "Название клиента";
    commit((current) => ({ ...current, clientName: value }));
    setClientDraft(value);
    setEditingClient(false);
  }

  function toggleParent(id: string) {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRegularParent(id: string) {
    setCollapsedRegularIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveCalendarMonth(offset: number) {
    setPickedCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1, 12));
    setSelectedDate(null);
  }

  function ganttBarStyle(startDate: string, endDate: string): CSSProperties {
    const startOffset = Math.max(0, Math.round((parseDate(startDate).getTime() - ganttRange.start.getTime()) / 86400000));
    const duration = Math.max(1, Math.round((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / 86400000) + 1);
    return {
      left: (startOffset / ganttRange.totalDays * 100) + "%",
      width: (Math.min(duration, ganttRange.totalDays - startOffset) / ganttRange.totalDays * 100) + "%",
    };
  }

  const todayPercent = (Math.round((today.getTime() - ganttRange.start.getTime()) / 86400000) / ganttRange.totalDays) * 100;
  const ganttTimelineWidth = Math.max(760, ganttRange.months.length * 300);
  const weekLineCount = Math.ceil(ganttRange.totalDays / 7) + 1;
  const calendarDefaultDate = selectedDate || toISO(new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() === today.getMonth() ? today.getDate() : 1,
    12
  ));

  function scrollGanttToDate(value: string) {
    const scroller = ganttScrollRef.current;
    if (!scroller) return;
    const monthStart = startOfMonth(parseDate(value));
    const daysFromRangeStart = Math.max(0, Math.round((monthStart.getTime() - ganttRange.start.getTime()) / 86400000));
    const monthPosition = daysFromRangeStart / ganttRange.totalDays * ganttTimelineWidth;
    scroller.scrollTo({ left: Math.max(0, monthPosition - 16), behavior: "smooth" });
  }

  // Прокрутка после добавления типовой задачи: ganttRange и ganttTimelineWidth к этому моменту
  // уже посчитаны заново от обновлённого data.tasks, а DOM таймлайна перерисован. Флаг лежит
  // в ref, а не в state, — эффект не переиспускает рендер, а только двигает существующий DOM.
  useEffect(() => {
    if (!pendingScrollDateRef.current) return;
    scrollGanttToDate(pendingScrollDateRef.current);
    pendingScrollDateRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttRange, ganttTimelineWidth]);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div
          className="page-switcher"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPageMenuOpen(false);
          }}
        >
          <button
            className="page-switcher-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={pageMenuOpen}
            onClick={() => setPageMenuOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPageMenuOpen(false);
            }}
          >
            <h1>{activePage === "roadmap" ? "Дорожная карта" : "Учетная политика"}</h1>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
          {pageMenuOpen ? (
            <div className="page-switcher-menu" role="menu" aria-label="Разделы проекта">
              <button
                type="button"
                role="menuitem"
                className={activePage === "roadmap" ? "active" : ""}
                onClick={() => { setActivePage("roadmap"); setPageMenuOpen(false); }}
              >
                Дорожная карта
                {activePage === "roadmap" ? <Check size={16} aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                role="menuitem"
                className={activePage === "policy" ? "active" : ""}
                onClick={() => { setActivePage("policy"); setPageMenuOpen(false); }}
              >
                Учетная политика
                {activePage === "policy" ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            </div>
          ) : null}
        </div>
        <span className="divider" />
        {editingClient ? (
          <form className="client-edit" onSubmit={(event) => { event.preventDefault(); saveClientName(); }}>
            <input autoFocus value={clientDraft} onChange={(event) => setClientDraft(event.target.value)} onBlur={saveClientName} />
          </form>
        ) : (
          <button className="client-name" onClick={() => setEditingClient(true)}>{data.clientName}<Pencil size={14} /></button>
        )}
        <div
          className={"save-indicator save-" + saveStatus}
          title={saveStatus === "error" ? saveErrorMessage : storageMode === "postgres" ? "Данные сохраняются в PostgreSQL" : "Локальный режим разработки"}
        >
          {saveStatus === "saving" || saveStatus === "loading" ? <LoaderCircle size={14} className="spin" /> : saveStatus === "error" ? <CircleAlert size={14} /> : <Check size={14} />}
          {saveStatus === "loading" ? "Загрузка" : saveStatus === "saving" ? "Сохранение" : saveStatus === "error" ? "Ошибка сохранения" : "Сохранено"}
        </div>
        <a className="company-link" href="https://finguin.agency/" target="_blank" rel="noreferrer">
          <span>Финансовые директора Finguin</span>
          <Image className="company-logo" src="/finguin-mark.png" alt="Логотип Finguin" width={592} height={592} />
        </a>
      </header>

      {activePage === "roadmap" ? <>

      <section className={"planning-banner " + (hasTwoMonthPlan ? "planning-ready" : "planning-missing")} aria-live="polite">
        <span className="planning-icon">{hasTwoMonthPlan ? <Check size={18} /> : <CircleAlert size={18} />}</span>
        <div className="planning-copy"><small>Планирование на 2 месяца</small><strong>{planningMessage}</strong></div>
        <div className="planning-months">
          {planningCoverage.map((month, index) => <span className={month.hasPlan ? "month-planned" : "month-unplanned"} key={toISO(month.monthStart)}><i>{month.hasPlan ? <Check size={12} /> : <CircleAlert size={12} />}</i><b>{index === 0 ? "Текущий · " : "Следующий · "}{MONTHS[month.monthStart.getMonth()]}</b><small>{month.hasPlan ? month.count + " " + pluralTasks(month.count) : "плана нет"}</small></span>)}
        </div>
      </section>

      <section className="metrics" aria-label="Сводка">
        <article className="metric"><span className="metric-icon metric-blue"><CalendarDays size={26} /></span><div><small>Ближайший дедлайн</small><strong>{nearestTask ? formatShortDate(nearestTask.endDate) : "Нет задач"}</strong></div><span className="metric-note">{nearestTask?.title || "Добавьте задачу"}</span></article>
        <article className="metric"><span className="metric-icon metric-red"><CircleAlert size={26} /></span><div><small>Просрочено</small><strong className="danger">{overdueCount} {pluralTasks(overdueCount)}</strong></div><span className="metric-note">Требуют внимания</span></article>
        <article className="metric"><span className="metric-icon metric-teal"><Clock3 size={26} /></span><div><small>Следующая встреча</small><strong>{nextMeeting ? formatShortDate(nextMeeting.plannedDate) + ", " + nextMeeting.plannedTime : "Не запланирована"}</strong></div><span className="metric-note">{nextMeeting?.title || "Добавьте встречу"}</span></article>
      </section>

      <section className="card roadmap-card">
        <div className="section-head">
          <div className="section-title-wrap"><h2>Дорожная карта</h2><nav>{(["Все", "В работе", "Просрочено"] as const).map((filter) => <button key={filter} className={ganttFilter === filter ? "active" : ""} onClick={() => setGanttFilter(filter)}>{filter}</button>)}</nav></div>
          <div className="roadmap-actions">
            <div className="baseline-control" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBaselineMenuOpen(false);
            }}>
              <button
                type="button"
                className={"secondary baseline-button" + (baselineKey ? " baseline-on" : "")}
                aria-haspopup="dialog"
                aria-expanded={baselineMenuOpen}
                onClick={() => setBaselineMenuOpen((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setBaselineMenuOpen(false);
                }}
              >
                <History size={16} />{baselineKey ? "База: " + formatShortDate(baselineKey) : "Базовый план"}
              </button>
              {baselineMenuOpen ? (
                <div className="baseline-menu" role="dialog" aria-label="Базовый план">
                  <p>Показать, как дорожная карта выглядела на дату:</p>
                  <input
                    type="date"
                    value={baselineDate}
                    min={baselineDates[0]}
                    max={toISO(today)}
                    onChange={(event) => setBaselineDate(event.target.value)}
                  />
                  <small className="baseline-hint">
                    {!baselineDate
                      ? "Снимки сроков сохраняются автоматически, раз в день. Доступны с " + formatShortDate(baselineDates[0]) + "."
                      : !baselineKey
                        ? "На эту дату снимков ещё нет. Самый ранний — " + formatShortDate(baselineDates[0]) + "."
                        : "Снимок от " + formatShortDate(baselineKey) + " · сдвинуто " + shiftedCount + " " + pluralTasks(shiftedCount)}
                  </small>
                  {baselineKey ? <button type="button" className="baseline-reset" onClick={() => { setBaselineDate(""); setBaselineMenuOpen(false); }}><X size={13} />Сбросить сравнение</button> : null}
                </div>
              ) : null}
            </div>
            <button className="secondary today-button" onClick={() => scrollGanttToDate(toISO(today))}><CalendarDays size={16} />Сегодня</button>
            <button className="secondary template-button" onClick={() => setModal({ kind: "template" })}><ClipboardCheck size={16} />Типовая задача</button>
            <button className="primary" onClick={() => setModal({ kind: "task", item: null })}><Plus size={17} />Новая задача</button>
          </div>
        </div>
        <div className="gantt-grid">
          <div className="task-table">
            <div className="task-table-head"><span>Задача</span><span>Ответственный</span><span>Статус</span><span>Срок</span></div>
            {visibleTasks.map((task) => {
              const childCount = data.tasks.filter((child) => child.parentId === task.id).length;
              const isCollapsed = collapsedTaskIds.has(task.id);
              const progress = checkpointProgress(task, data.tasks);
              return (
                <div className={"task-table-row " + (task.parentId ? "task-child" : "task-parent") + (freshTaskIds.has(task.id) ? " fresh" : "")} key={task.id} role="button" tabIndex={0} onClick={() => setModal({ kind: "task", item: task })} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setModal({ kind: "task", item: task });
                }}>
                  <span className="task-title-cell">
                    {!task.parentId && childCount > 0 && <button type="button" className="task-toggle" aria-label={isCollapsed ? "Развернуть подзадачи" : "Свернуть подзадачи"} aria-expanded={!isCollapsed} onClick={(event) => { event.stopPropagation(); toggleParent(task.id); }}>{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
                    {!task.parentId && childCount === 0 && <span className="toggle-spacer" />}
                    {task.parentId && <i />}
                    {task.template && <span className={"code-chip" + (task.parentId ? "" : " code-chip-parent")}>{task.template.subCode || task.template.code}</span>}
                    <b>{task.title}</b>
                    {!task.parentId && childCount > 0 && <small className="child-count">{childCount}</small>}
                    {progress && progress.total > 0 && <small className={"progress-chip" + (progress.done === progress.total ? " progress-done" : "")} title={"Контрольные точки: " + progress.done + " из " + progress.total}><ProgressRing done={progress.done} total={progress.total} />{progress.done}/{progress.total}</small>}
                    {task.comments.length > 0 && <small><MessageSquareText size={12} />{task.comments.length}</small>}
                  </span>
                  <span className="assignee-cell">{task.assignee || "—"}</span>
                  <span><em className={taskStatusClass(isTaskOverdue(task, today) ? "Просрочено" : task.status)}>{isTaskOverdue(task, today) ? "Просрочено" : task.status}</em></span>
                  <span className="deadline-cell">{formatShortDate(task.endDate)}<MoreHorizontal size={15} /></span>
                </div>
              );
            })}
            {visibleTasks.length === 0 && <div className="empty-row">Нет задач по выбранному фильтру</div>}
          </div>
          <div className="gantt-chart-scroll" ref={ganttScrollRef} aria-label="Прокручиваемая временная шкала">
            <div className="gantt-chart" style={{ width: ganttTimelineWidth }}>
              <div className="gantt-months">{ganttRange.months.map((month) => <span key={month.key} style={{ width: (month.days / ganttRange.totalDays * 100) + "%" }}>{month.label}</span>)}</div>
              <div className="gantt-lines">{Array.from({ length: weekLineCount }, (_, index) => <i key={index} style={{ left: (index * 7 / ganttRange.totalDays * 100) + "%" }} />)}</div>
              {todayPercent >= 0 && todayPercent <= 100 && <div className="today-line" style={{ left: todayPercent + "%" }}><span>Сегодня</span></div>}
              <div className="gantt-bars">
                {visibleTasks.map((task) => {
                  const shift = baselineShiftOf(task);
                  const shiftTitle = shift && baselineKey
                    ? "Базовый план на " + formatShortDate(baselineKey) + ": " + formatShortDate(shift.base.startDate) + " — " + formatShortDate(shift.base.endDate)
                      + (shift.days === 0 ? "" : ", дедлайн " + (shift.days > 0 ? "+" : "−") + Math.abs(shift.days) + " " + pluralDays(Math.abs(shift.days)))
                    : undefined;
                  const progress = checkpointProgress(task, data.tasks);
                  return (
                    <div className="gantt-row" key={task.id}>
                      <button aria-label={"Редактировать " + task.title} onClick={() => setModal({ kind: "task", item: task })} className={"gantt-bar gantt-" + (isTaskOverdue(task, today) ? "overdue" : task.status === "Завершено" ? "done" : task.status === "Не начато" ? "planned" : "active") + (task.parentId ? "" : " gantt-parent")} style={ganttBarStyle(task.startDate, task.endDate)} title={task.title + " · " + formatShortDate(task.startDate) + " — " + formatShortDate(task.endDate) + (progress && progress.total > 0 ? " · точки " + progress.done + "/" + progress.total : "")}><span>{task.title}</span><i /></button>
                      {shift?.segments.map((segment) => <i key={segment.id} className={"gantt-delta" + (segment.inside ? "" : " gantt-delta-outside") + (task.parentId ? "" : " gantt-delta-parent")} style={ganttBarStyle(segment.from, segment.to)} title={shiftTitle} />)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="lower-grid">
        <section className="card decisions-card">
          <div className="compact-head"><h2>Управленческие решения</h2><button className="primary" onClick={() => setModal({ kind: "idea", item: null })}><Plus size={17} />Добавить идею</button></div>
          <div className="filters">
            <label className="search-field"><Search size={16} /><input value={ideaSearch} onChange={(event) => setIdeaSearch(event.target.value)} placeholder="Поиск по идеям и решениям..." /></label>
            <label className="select-field"><select value={ideaStatus} onChange={(event) => setIdeaStatus(event.target.value)}><option>Все статусы</option>{IDEA_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={14} /></label>
            <label className="select-field"><select value={ideaPriority} onChange={(event) => setIdeaPriority(event.target.value)}><option>Все приоритеты</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><ChevronDown size={14} /></label>
          </div>
          <div className="idea-table">
            <div className="idea-head"><span>Идея / решение</span><span>Статус</span><span>Приоритет</span><span>Ответственный</span><span>Ожидаемый эффект</span><span /></div>
            {ideaRows.map((idea) => (
              <button className="idea-row" key={idea.id} onClick={() => setModal({ kind: "idea", item: idea })}>
                <span className="idea-title"><i><Lightbulb size={17} /></i><b>{idea.title}</b>{idea.comments.length > 0 && <small><MessageSquareText size={12} />{idea.comments.length}</small>}</span>
                <span><em className={ideaStatusClass(idea.status)}>{idea.status}</em></span>
                <span><em className={priorityClass(idea.priority)}>{idea.priority}</em></span>
                <span>{idea.owner || "—"}</span>
                <strong className="effect">{idea.effect || "—"}</strong>
                <MoreHorizontal size={16} />
              </button>
            ))}
            {ideaRows.length === 0 && <div className="empty-row">Ничего не найдено</div>}
          </div>
        </section>

        <section className="card meetings-card">
          <div className="compact-head"><h2>Календарь встреч</h2><button className="primary" onClick={() => setModal({ kind: "meeting", item: null })}><Plus size={17} />Запланировать</button></div>
          <div className="calendar-layout">
            <div className="calendar">
              <div className="calendar-nav"><button onClick={() => moveCalendarMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button><strong>{MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</strong><button onClick={() => moveCalendarMonth(1)} aria-label="Следующий месяц"><ChevronRight size={18} /></button></div>
              <div className="weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid">
                {calendarCells.map((cell) => {
                  const fillClass = cell.hasPlan && cell.hasFact ? "day-plan-fact" : cell.hasFact ? "day-fact" : cell.hasPlan ? "day-plan" : "";
                  return <button key={cell.iso} className={"calendar-day " + fillClass + (cell.inMonth ? "" : " outside") + (selectedDate === cell.iso ? " selected" : "")} onClick={() => {
                    setSelectedDate((current) => current === cell.iso ? null : cell.iso);
                    if (!cell.inMonth) setPickedCalendarMonth(startOfMonth(cell.date));
                  }} aria-pressed={selectedDate === cell.iso} aria-label={cell.count ? cell.count + " встреч на " + formatShortDate(cell.iso) : "Нет встреч на " + formatShortDate(cell.iso)}><span>{cell.date.getDate()}</span>{cell.count > 1 && <em>{cell.count}</em>}</button>;
                })}
              </div>
              <div className="calendar-legend"><span><i className="legend-plan" />План</span><span><i className="legend-fact" />Факт</span><span><i className="legend-both" />План + факт</span></div>
            </div>
            <div className="meeting-list">
              <div className="meeting-list-head"><span>{selectedDate ? "Встречи на выбранную дату" : "Все встречи месяца"}</span><small>{selectedDate ? formatShortDate(selectedDate) : MONTHS[calendarMonth.getMonth()] + " " + calendarMonth.getFullYear()}</small></div>
              {displayedMeetings.map((meeting) => {
                const isPlanOccurrence = selectedDate ? meeting.plannedDate === selectedDate : parseDate(meeting.plannedDate).getFullYear() === calendarMonth.getFullYear() && parseDate(meeting.plannedDate).getMonth() === calendarMonth.getMonth();
                const isFactOccurrence = meeting.status === "completed" && (selectedDate ? meeting.actualDate === selectedDate : parseDate(meeting.actualDate).getFullYear() === calendarMonth.getFullYear() && parseDate(meeting.actualDate).getMonth() === calendarMonth.getMonth());
                const occurrenceTime = isFactOccurrence && meeting.actualTime ? meeting.actualTime : meeting.plannedTime;
                const occurrenceDate = selectedDate || (isFactOccurrence ? meeting.actualDate : meeting.plannedDate);
                const statusLabel = meeting.status === "completed" ? "Проведена" : meeting.status === "cancelled" ? "Отменена" : "Запланирована";
                return (
                <button className="meeting-item" key={meeting.id} onClick={() => setModal({ kind: "meeting", item: meeting })}>
                  <time className={isFactOccurrence ? "meeting-fact" : "meeting-plan"}><b>{parseDate(occurrenceDate).getDate()}</b><span>{MONTHS_GENITIVE[parseDate(occurrenceDate).getMonth()].slice(0, 3)}</span></time>
                  <span className="meeting-copy"><small>{occurrenceTime}</small><b>{meeting.title}</b><span className="occurrence-badges">{isPlanOccurrence && <i className="occurrence-plan">План</i>}{isFactOccurrence && <i className="occurrence-fact">Факт</i>}{meeting.seriesId && activeSeriesIds.has(meeting.seriesId) && <i className="occurrence-series"><Repeat2 size={9} />{meeting.seriesFrequency ? frequencyLabel(meeting.seriesFrequency) : "Серия"}</i>}<em>{statusLabel}</em></span></span>
                  {meeting.comments.length > 0 && <span className="comment-count"><MessageSquareText size={13} />{meeting.comments.length}</span>}
                  <MoreHorizontal size={15} />
                </button>
                );
              })}
              {displayedMeetings.length === 0 && <div className="empty-meetings"><CalendarDays size={22} /><b>{selectedDate ? "На эту дату встреч нет" : "В этом месяце встреч нет"}</b><span>{selectedDate ? "Нажмите на выбранный день ещё раз, чтобы увидеть все встречи месяца." : "Выберите другой месяц или запланируйте новую встречу."}</span></div>}
            </div>
          </div>
        </section>
      </div>

      <section className="card regular-card">
        <div className="compact-head regular-head">
          <div><h2>Регулярные задачи</h2><p>Поддержание отчётности после внедрения</p></div>
          <button className="primary" onClick={() => setModal({ kind: "regular-task", item: null })}><Plus size={17} />Создать регулярную задачу</button>
        </div>
        <div className="regular-grid">
          <div className="regular-fixed">
            <div className="regular-fixed-head"><span>Регулярная задача</span><span>Периодичность</span><span>Ответственный</span></div>
            {regularRows.map((task) => {
              const childCount = data.regularTasks.filter((child) => child.parentId === task.id).length;
              const isCollapsed = collapsedRegularIds.has(task.id);
              return (
                <div className={"regular-fixed-row " + (task.parentId ? "regular-child" : "regular-parent")} key={task.id}>
                  <button className="regular-task-name" onClick={() => setModal({ kind: "regular-task", item: task })}>
                    {!task.parentId && childCount > 0 && <span className="regular-toggle" role="button" aria-label={isCollapsed ? "Развернуть подэтапы" : "Свернуть подэтапы"} onClick={(event) => { event.stopPropagation(); toggleRegularParent(task.id); }}>{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>}
                    {!task.parentId && childCount === 0 && <span className="toggle-spacer" />}
                    {task.parentId && <i />}
                    <span><b>{task.title}</b>{task.description && <small>{task.description}</small>}</span>
                    {!task.parentId && childCount > 0 && <em>{childCount}</em>}
                  </button>
                  <span className="regular-frequency"><Repeat2 size={13} />{frequencyLabel(task.frequency)}</span>
                  <span className="regular-assignee">{task.assignee}</span>
                </div>
              );
            })}
          </div>
          <div className="regular-month-scroll" aria-label="Прокручиваемые месяцы регулярных задач">
            <div className="regular-month-track" style={{ width: regularMonths.length * 232 }}>
              <div className="regular-month-head">{regularMonths.map((month) => <span key={month.iso}>{month.label}</span>)}</div>
              {regularRows.map((task) => (
                <div className={"regular-month-row " + (task.parentId ? "regular-child" : "regular-parent")} key={task.id}>
                  {regularMonths.map((month) => {
                    const plannedDates = getPlannedDates(task, month.iso);
                    const actualDates = plannedDates.map((date) => task.records[date]?.actualDate).filter(Boolean);
                    const status = regularMonthStatus(task, month.iso, today);
                    const hasNote = plannedDates.some((date) => Boolean(task.records[date]?.note));
                    return (
                      <button className={"regular-month-cell " + (status ? "has-occurrence" : "is-empty")} disabled={!status} key={month.iso} onClick={() => setModal({ kind: "regular-period", task, monthStart: month.iso })}>
                        {status ? <>
                          <span className="regular-dates"><small>План</small><b>{plannedDates.map(formatShortDate).join(", ")}</b></span>
                          <span className="regular-dates"><small>Факт</small><b>{actualDates.length ? actualDates.map(formatShortDate).join(", ") : "—"}</b></span>
                          <span className="regular-cell-footer"><em className={regularStatusClass(status)}>{status}</em>{hasNote && <i title="Есть примечание"><MessageSquareText size={13} /></i>}</span>
                        </> : <span className="regular-no-plan">Нет выполнения</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      </> : <AccountingPolicy reports={data.reports} people={data.people} onChange={(reports) => commit((current) => ({ ...current, reports }))} />}

      {modal?.kind === "task" && <TaskDialog key={modal.item?.id ?? "new"} item={modal.item} tasks={data.tasks} people={data.people} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} onOpenTask={(task) => setModal({ kind: "task", item: task })} />}
      {modal?.kind === "template" && <TemplateDialog templates={templates} tasks={data.tasks} people={data.people} today={todayKey} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onAdd={addTemplateTasks} />}
      {modal?.kind === "idea" && <IdeaDialog item={modal.item} people={data.people} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveIdea} onDelete={deleteIdea} />}
      {modal?.kind === "meeting" && <MeetingDialog item={modal.item} defaultDate={calendarDefaultDate} people={data.people} seriesCount={modal.item ? getSeriesOccurrences(data.meetings, modal.item).length : 1} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveMeeting} onDelete={deleteMeeting} />}
      {seriesPrompt && (
        <MeetingScopeDialog
          mode={seriesPrompt.mode}
          meeting={seriesPrompt.meeting}
          counts={getScopeCounts(data.meetings, seriesPrompt.meeting)}
          onCancel={() => {
            // Возвращаем карточку встречи вместе с несохранёнными правками.
            setModal({ kind: "meeting", item: seriesPrompt.draft ?? seriesPrompt.meeting });
            setSeriesPrompt(null);
          }}
          onConfirm={(scope) => {
            if (seriesPrompt.mode === "delete") applyMeetingDeletion(seriesPrompt.meeting, scope);
            else if (seriesPrompt.draft) applyMeetingEdit(seriesPrompt.draft, seriesPrompt.meeting, scope);
          }}
        />
      )}
      {modal?.kind === "regular-task" && <RegularTaskDialog item={modal.item} tasks={data.regularTasks} people={data.people} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveRegularTask} onDelete={deleteRegularTask} />}
      {modal?.kind === "regular-period" && <RegularPeriodDialog task={modal.task} monthStart={modal.monthStart} onClose={() => setModal(null)} onSave={saveRegularTask} />}
      <div className={"toast" + (toast ? " show" : "")} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
