"use client";

import {
  CalendarDays,
  ChartGantt,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
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
import ControlBoard from "@/components/control-board";
import AccountingPolicy from "@/components/accounting-policy";
import CheckpointsEditor, { formatCheckpointDate, ProgressRing } from "@/components/checkpoints-editor";
import ModalShell from "@/components/modal-shell";
import PersonSelect, { normalizePerson } from "@/components/person-select";
import type { PersonPickerProps } from "@/components/person-select";
import { ShiftHistory, ShiftReasonFields } from "@/components/shift-reason";
import TemplateDialog from "@/components/template-dialog";
import WeekReportView from "@/components/week-report";
import { addDays, differenceInDays, formatDayMonth, formatDayShortMonth, parseDate, startOfWeek, toISO } from "@/lib/dates";
import { formatWeekRange, weekAgeLabel, weekBounds } from "@/lib/week-report";
import { closingMonthKey, isWorkTask, monthClosing, parentSummary, sprintHealth } from "@/lib/roadmap-pulse";
import MonthClosingPopover from "@/components/month-closing-popover";
import { plural } from "@/lib/plural";
import { appendShift, needsShiftReason, originalEndDate, shiftReasonInfo, validateShift } from "@/lib/task-shifts";
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
  ShiftReason,
  Task,
  TaskStatus,
} from "@/lib/types";
import { calendarBucket, collectCalendarTasks } from "@/lib/calendar-items";
import type { CalendarTask, CalendarTaskSource } from "@/lib/calendar-items";
import { getPlannedDates, occurrenceStatus, regularMonthStatus } from "@/lib/regular-schedule";
import type { RegularStatus } from "@/lib/regular-schedule";
import { checkpointDate, checkpointMarks, checkpointState } from "@/lib/checkpoint-dates";
import { isWaitingClient, setCheckpointDone, withCompletion } from "@/lib/checkpoint-tracking";
import type { CheckpointMark } from "@/lib/checkpoint-dates";
import { checkpointProgress, nextCheckpointCode, taskCheckpoints } from "@/lib/typical-tasks";
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
  | { kind: "task"; item: Task | null; focusDate?: string }
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

// Спринты типовой задачи — только спринты с кодом из шаблона, по порядку недель.
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

type CalendarSource = "meeting" | CalendarTaskSource;
const CALENDAR_SOURCES: Array<{ key: CalendarSource; label: string }> = [
  { key: "meeting", label: "Встречи" },
  { key: "gantt", label: "Дорожная карта" },
  { key: "regular", label: "Регулярные" },
  { key: "checkpoint", label: "Контрольные точки" },
];
const CALENDAR_SOURCE_ORDER: Record<CalendarTaskSource, number> = { gantt: 0, regular: 1, checkpoint: 2 };
const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
// Хвост просрочек на сегодняшнем дне: дальше трёх месяцев назад не заглядываем,
// иначе давно забытые отметки регулярных задач заполнили бы весь список.
const OVERDUE_TAIL_DAYS = 90;

type MeetingOccurrence = { meeting: Meeting; isPlan: boolean; isFact: boolean; time: string };

function calendarStatusClass(status: string) {
  if (status === "Просрочено") return "status status-danger";
  if (status === "Завершено" || status === "Выполнено") return "status status-success";
  if (status === "С опозданием" || status === "На проверке") return "status status-warning";
  if (status === "В работе") return "status status-info";
  return "status status-neutral";
}

function personInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function pluralOverdue(count: number) {
  return count + " " + (count % 10 === 1 && count % 100 !== 11 ? "просрочена" : "просрочено");
}

function formatWeekdayDate(value: string) {
  return WEEKDAYS_FULL[parseDate(value).getDay()] + ", " + formatShortDate(value);
}

function formatAgendaDate(value: string) {
  const date = parseDate(value);
  return date.getDate() + " " + MONTHS_GENITIVE[date.getMonth()].slice(0, 3) + ", " + WEEKDAYS_SHORT[date.getDay()];
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
  today,
  focusDate,
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
  today: string;
  focusDate?: string;
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
  const [shift, setShift] = useState<{ reason: ShiftReason | ""; holdCode: string; note: string }>({ reason: "", holdCode: "", note: "" });
  const askReason = needsShiftReason(item, draft, tasks);
  const openCheckpoints = taskCheckpoints(draft).filter((checkpoint) => !checkpoint.done);

  const isTemplateSprint = Boolean(item?.template?.subCode);
  const [labelsText, setLabelsText] = useState(() => (item?.labels ?? []).join(", "));
  const isTemplateParent = Boolean(item?.template) && !isTemplateSprint;
  const hasChecklist = taskType === "subtask" || (draft.groups?.length ?? 0) > 0;
  const sprints = isTemplateParent && item ? templateSprints(tasks, item.id) : [];
  const checklistItems = (draft.groups ?? []).flatMap((group) => group.items);
  const checklistAllDone = checklistItems.length > 0 && checklistItems.every((checkpoint) => checkpoint.done);
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
    if (taskType === "subtask" && !draft.parentId) return setError("Выберите надзадачу для этого спринта.");
    if (!draft.startDate || !draft.endDate || parseDate(draft.startDate) > parseDate(draft.endDate)) {
      return setError("Проверьте даты начала и окончания.");
    }
    const labels = [...new Set(labelsText.split(",").map((label) => label.trim()).filter(Boolean))];
    let saved: Task = { ...draft, labels, parentId: item?.template ? draft.parentId : taskType === "parent" ? null : draft.parentId, title: draft.title.trim(), assignee: draft.assignee.trim() };
    if (askReason && item) {
      const shiftError = validateShift(shift.reason, shift.note);
      if (shiftError) return setError(shiftError);
      saved = appendShift(item, saved, { reason: shift.reason as ShiftReason, holdCode: openCheckpoints.some((checkpoint) => checkpoint.code === shift.holdCode) ? shift.holdCode : "", note: shift.note }, today);
    }
    onSave(saved);
  }

  return (
    <ModalShell title={dialogTitle} subtitle={dialogSubtitle} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <label className="field field-wide">{isTemplateSprint ? "Название спринта" : "Название задачи"}<input autoFocus={!item?.template} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Например, Подготовить форму ДДС" /></label>
          {!item?.template && <label className="field field-wide">Метки<input value={labelsText} onChange={(event) => setLabelsText(event.target.value)} placeholder="Например, ДДС, Отчётность" aria-describedby="task-labels-hint" /><span className="field-note" id="task-labels-hint">Несколько меток разделяйте запятой. Чтобы убрать метку, удалите её из поля.</span></label>}
          <div className="form-grid">
            {!item?.template && <label className="field">Тип задачи<select value={taskType} onChange={(event) => {
              const value = event.target.value as "parent" | "subtask";
              setTaskType(value);
              if (value === "parent") setDraft({ ...draft, parentId: null });
            }}><option value="subtask" disabled={parents.length === 0 || hasChildren}>Спринт</option><option value="parent">Надзадача</option></select><ChevronDown size={15} /></label>}
            <div className="field"><span>Ответственный</span><PersonSelect value={draft.assignee} onChange={(assignee) => setDraft({ ...draft, assignee })} people={people} onAddPerson={onAddPerson} onDeletePerson={onDeletePerson} /></div>
            {!item?.template && taskType === "subtask" && <label className="field field-wide">К какой надзадаче прикрепить<select value={draft.parentId || ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })}><option value="">Выберите надзадачу</option>{parents.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select><ChevronDown size={15} /></label>}
            {item?.template && <label className="field">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>}
            <label className="field">Дата начала<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label>
            <label className="field">Дедлайн<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
            {!item?.template && <label className="field field-wide">Статус<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={15} /></label>}
          </div>
          {askReason && item && <ShiftReasonFields from={item.endDate} to={draft.endDate} {...shift} openCheckpoints={openCheckpoints} onChange={(patch) => { setShift({ ...shift, ...patch }); setError(""); }} />}
          {item && <ShiftHistory task={item} />}
          {hasChecklist && (
            <>
              <CheckpointsEditor groups={draft.groups ?? []} nextCode={() => nextCheckpointCode(draft)} onChange={(groups) => setDraft({ ...draft, groups })} startDate={draft.startDate} endDate={draft.endDate} today={today} defaultAssignee={draft.assignee} people={people} onAddPerson={onAddPerson} highlightDate={focusDate} />
              {checklistAllDone && draft.status !== "Завершено" && (
                <div className="all-done">✓ Все контрольные точки отмечены — {taskType === "subtask" ? "спринт" : "задачу"} можно закрывать.<button type="button" onClick={() => setDraft({ ...draft, status: "Завершено" })}>Отметить завершённым</button></div>
              )}
            </>
          )}
          {isTemplateParent && (
            <>
              <div className="check-head sprint-head"><strong>Спринты</strong><span className="check-count">Сроки спринтов меняются в их карточках</span></div>
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
          <div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button type="submit" className="primary">{askReason ? "Перенести срок" : "Сохранить"}</button></div>
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

type PageKey = "roadmap" | "policy" | "control";
const PAGES: Array<{ key: PageKey; title: string }> = [
  { key: "roadmap", title: "Дорожная карта" },
  { key: "policy", title: "Учетная политика" },
  { key: "control", title: "Руководителю" },
];

export default function Dashboard({ initialData, initialStorage, serverToday, templates }: { initialData: DashboardData; initialStorage: "postgres" | "local" | null; serverToday: string; templates: TypicalTaskTemplate[] }) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activePage, setActivePage] = useState<PageKey>("roadmap");
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialStorage ? "saved" : "loading");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [storageMode, setStorageMode] = useState<"postgres" | "local">(initialStorage ?? "local");
  const [modal, setModal] = useState<ModalState>(null);
  const [checkpointTip, setCheckpointTip] = useState<{ task: Task; mark: CheckpointMark; rect: DOMRect } | null>(null);
  // Выбор охвата для встречи из серии: удалить/поправить одну, хвост или всю серию.
  // Карточка встречи на это время закрывается, а её черновик ждёт здесь.
  const [seriesPrompt, setSeriesPrompt] = useState<{ mode: "delete" | "edit"; meeting: Meeting; draft: Meeting | null } | null>(null);
  const [ganttFilter, setGanttFilter] = useState<"Все" | "В работе" | "Просрочено" | "Неделя">("Все");
  // Пока неделю не листали, показываем текущую — она сама сдвигается со сменой суток.
  const [pickedWeek, setPickedWeek] = useState<string | null>(null);
  const [baselineDate, setBaselineDate] = useState("");
  const [baselineMenuOpen, setBaselineMenuOpen] = useState(false);
  // Надзадачи со спринтами при открытии свёрнуты: сводка в строке показывает, где проблема.
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(() => new Set(
    initialData.tasks.filter((task) => !task.parentId && initialData.tasks.some((child) => child.parentId === task.id)).map((task) => task.id),
  ));
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
  const [calendarSources, setCalendarSources] = useState<Set<CalendarSource>>(() => new Set(CALENDAR_SOURCES.map((source) => source.key)));
  const [calendarPerson, setCalendarPerson] = useState("");
  // Пока пользователь не пролистнул календарь руками, он следует за текущим месяцем.
  // После первого ручного перехода выбор живёт здесь и больше никуда не съезжает.
  const [pickedCalendarMonth, setPickedCalendarMonth] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  const taskTableRef = useRef<HTMLDivElement | null>(null);
  const [taskRowHeights, setTaskRowHeights] = useState<Record<string, number>>({});
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
  const weekStart = pickedWeek ?? startOfWeek(todayKey);
  const weekRange = useMemo(() => weekBounds(data.tasks, todayKey), [data.tasks, todayKey]);
  const today = useMemo(() => parseDate(todayKey), [todayKey]);
  const calendarMonth = useMemo(() => pickedCalendarMonth ?? startOfMonth(today), [pickedCalendarMonth, today]);

  // Обычно данные уже пришли с сервера вместе со страницей. Запрос из браузера нужен
  // только когда сервер не смог их прочитать — он и покажет ошибку в индикаторе.
  useEffect(() => {
    if (initialStorage) return;
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
  }, [initialStorage]);

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
  const filteredTasks = useMemo(() => {
    const matches = (task: Task) => {
      if (ganttFilter === "В работе") return task.status === "В работе" || task.status === "На проверке";
      if (ganttFilter === "Просрочено") return isTaskOverdue(task, today);
      return true;
    };
    return ordered.filter((task) => matches(task) || (!task.parentId && ordered.some((child) => child.parentId === task.id && matches(child))));
  }, [ordered, ganttFilter, today]);
  // Под фильтрами спринты показываются и у свёрнутых надзадач — иначе фильтр «Просрочено» был бы пустым.
  const visibleTasks = useMemo(() => filteredTasks.filter((task) => !task.parentId || ganttFilter !== "Все" || !collapsedTaskIds.has(task.parentId)), [filteredTasks, collapsedTaskIds, ganttFilter]);
  const parentIds = useMemo(() => data.tasks.filter((task) => !task.parentId && data.tasks.some((child) => child.parentId === task.id)).map((task) => task.id), [data.tasks]);
  const anyCollapsed = parentIds.some((id) => collapsedTaskIds.has(id));

  // Таблица и шкала прокручиваются отдельно. Измеряем строки после переноса текста,
  // чтобы полосы сроков оставались напротив задач при изменении ширины и фильтров.
  useEffect(() => {
    if (activePage !== "roadmap") return;
    const rows = taskTableRef.current?.querySelectorAll<HTMLElement>("[data-task-id]");
    if (!rows?.length) return;
    const observer = new ResizeObserver(() => {
      const heights: Record<string, number> = {};
      rows.forEach((row) => { heights[row.dataset.taskId!] = row.getBoundingClientRect().height; });
      setTaskRowHeights((previous) => Object.keys(previous).length === rows.length
        && Object.entries(heights).every(([id, height]) => previous[id] === height) ? previous : heights);
    });
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [visibleTasks, activePage]);

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
  const health = useMemo(() => sprintHealth(data.tasks, todayKey), [data.tasks, todayKey]);
  const closing = useMemo(() => monthClosing(data.regularTasks, todayKey), [data.regularTasks, todayKey]);
  // «Выполнено 2 из 3 · просрочено: Закрыть ОПиУ (срок 5 окт) — нет зарплатной ведомости»
  const closingNote = closing.state === "none"
    ? "Добавьте регулярную задачу закрытия месяца"
    : closing.state === "ok"
      ? "Выполнено " + closing.total + " из " + closing.total
      : "Выполнено " + closing.done + " из " + closing.total + " · " + (closing.state === "late"
        ? "просрочено: " + closing.late.map((item) => item.title + " (срок " + formatDayShortMonth(item.plannedDate) + ") — " + (item.note ? item.note[0].toLowerCase() + item.note.slice(1) : "причина не указана")).join("; ")
        : "следующий срок " + formatDayShortMonth(closing.nextDate));
  const closingKey = closingMonthKey(todayKey);
  const closingMonth = Number(closingKey.slice(5, 7)) - 1;
  const manualClosedAt = data.monthClosings?.[closingKey];
  const [closingOpen, setClosingOpen] = useState(false);
  const closeClosing = useCallback(() => setClosingOpen(false), []);
  const roadmapRef = useRef<HTMLElement | null>(null);
  const meetingsRef = useRef<HTMLElement | null>(null);
  const regularRef = useRef<HTMLElement | null>(null);

  const ganttRange = useMemo(() => {
    const baselineDatesInPlay = baseline ? Object.values(baseline).flatMap((base) => [parseDate(base.startDate), parseDate(base.endDate)]) : [];
    // Срок точки может выходить за неделю спринта — шкала растягивается и под него.
    const checkpointDates = data.tasks.filter((task) => task.parentId).flatMap((task) => taskCheckpoints(task).map(checkpointDate).filter(Boolean).map(parseDate));
    const dates = [today, ...data.tasks.flatMap((task) => [parseDate(task.startDate), parseDate(task.endDate)]), ...checkpointDates, ...baselineDatesInPlay].filter((date) => !Number.isNaN(date.getTime()));
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

  // Сетка календаря — шесть недель, начиная с понедельника той недели, где первое число месяца.
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
    const start = new Date(first);
    start.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [calendarMonth]);

  const isCalendarTaskVisible = useCallback((item: CalendarTask) => (
    calendarSources.has(item.source) && (!calendarPerson || item.assignee === calendarPerson)
  ), [calendarSources, calendarPerson]);

  // Задачи всех источников на видимые шесть недель, разложенные по дням.
  const calendarTasksByDate = useMemo(() => {
    const items = collectCalendarTasks({ tasks: data.tasks, regularTasks: data.regularTasks }, toISO(calendarDays[0]), toISO(calendarDays[calendarDays.length - 1]), todayKey)
      .filter(isCalendarTaskVisible)
      .sort((a, b) => CALENDAR_SOURCE_ORDER[a.source] - CALENDAR_SOURCE_ORDER[b.source]);
    const byDate = new Map<string, CalendarTask[]>();
    for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return byDate;
  }, [data.tasks, data.regularTasks, calendarDays, todayKey, isCalendarTaskVisible]);

  // Встречи дня: по плановой дате, а проведённые — ещё и по фактической. Отменённые остаются
  // в списке, но ячейку не закрашивают. У встреч нет ответственного, поэтому при выборе
  // человека они скрываются.
  const meetingsOnDay = useCallback((iso: string): MeetingOccurrence[] => {
    if (!calendarSources.has("meeting") || calendarPerson) return [];
    return data.meetings
      .filter((meeting) => meeting.plannedDate === iso || (meeting.status === "completed" && meeting.actualDate === iso))
      .map((meeting) => {
        const isFact = meeting.status === "completed" && meeting.actualDate === iso;
        return { meeting, isFact, isPlan: meeting.plannedDate === iso, time: isFact && meeting.actualTime ? meeting.actualTime : meeting.plannedTime };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [data.meetings, calendarSources, calendarPerson]);

  const calendarCells = useMemo(() => calendarDays.map((date) => {
    const iso = toISO(date);
    const meetings = meetingsOnDay(iso).filter((item) => item.meeting.status !== "cancelled");
    const tasks = calendarTasksByDate.get(iso) ?? [];
    // Точки под числом: сначала просроченные, потом в плане, потом выполненные.
    const order = { overdue: 0, plan: 1, done: 2 };
    const buckets = tasks.map((item) => calendarBucket(item.status)).sort((a, b) => order[a] - order[b]);
    return {
      date,
      iso,
      hasPlan: meetings.some((item) => item.isPlan),
      hasFact: meetings.some((item) => item.isFact),
      meetingCount: meetings.length,
      buckets,
      overdueCount: buckets.filter((bucket) => bucket === "overdue").length,
      inMonth: date.getMonth() === calendarMonth.getMonth(),
    };
  }), [calendarDays, meetingsOnDay, calendarTasksByDate, calendarMonth]);

  // Правая колонка: выбранный день или весь месяц по датам. На сегодняшнем дне
  // ниже идёт хвост — всё, что просрочено раньше.
  const calendarAgenda = useMemo(() => {
    if (selectedDate) {
      const overdueTail = selectedDate === todayKey
        ? collectCalendarTasks({ tasks: data.tasks, regularTasks: data.regularTasks }, addDays(todayKey, -OVERDUE_TAIL_DAYS), addDays(todayKey, -1), todayKey)
          .filter((item) => item.status === "Просрочено" && isCalendarTaskVisible(item))
          .sort((a, b) => a.date.localeCompare(b.date))
        : [];
      return { days: [{ iso: selectedDate, meetings: meetingsOnDay(selectedDate), tasks: calendarTasksByDate.get(selectedDate) ?? [] }], overdueTail };
    }
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 12).getDate();
    const days = Array.from({ length: daysInMonth }, (_, index) => toISO(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1, 12)))
      .map((iso) => ({ iso, meetings: meetingsOnDay(iso), tasks: calendarTasksByDate.get(iso) ?? [] }))
      .filter((day) => day.meetings.length > 0 || day.tasks.length > 0);
    return { days, overdueTail: [] as CalendarTask[] };
  }, [selectedDate, todayKey, data.tasks, data.regularTasks, isCalendarTaskVisible, meetingsOnDay, calendarTasksByDate, calendarMonth]);

  const calendarPeople = useMemo(() => mergePeople(data.people, [
    ...data.tasks.flatMap((task) => [task.assignee, ...taskCheckpoints(task).map((item) => item.assignee ?? "")]),
    ...data.regularTasks.map((task) => task.assignee),
  ]), [data.people, data.tasks, data.regularTasks]);

  // Серии, в которых осталось больше одной встречи: только их помечаем в списке.
  const activeSeriesIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meeting of data.meetings) {
      if (meeting.seriesId) counts.set(meeting.seriesId, (counts.get(meeting.seriesId) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([seriesId]) => seriesId));
  }, [data.meetings]);

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

  function saveManualClosing(date: string) {
    commit((current) => ({ ...current, monthClosings: { ...(current.monthClosings ?? {}), [closingKey]: date } }));
    setClosingOpen(false);
    showToast(MONTHS[closingMonth] + " отмечен закрытым " + formatDayShortMonth(date));
  }

  function clearManualClosing() {
    commit((current) => {
      const monthClosings = { ...(current.monthClosings ?? {}) };
      delete monthClosings[closingKey];
      return { ...current, monthClosings };
    });
    setClosingOpen(false);
    showToast("Отметка снята — закрытие считается по регулярным задачам");
  }

  function saveTask(task: Task) {
    commit((current) => {
      const original = current.tasks.find((item) => item.id === task.id) ?? null;
      const saved = withCompletion(original, task, todayKey);
      return {
        ...current,
        people: mergePeople(current.people, [saved.assignee]),
        tasks: original ? current.tasks.map((item) => item.id === saved.id ? saved : item) : [...current.tasks, saved],
      };
    });
    setModal(null);
  }

  function deleteTask(id: string) {
    if (!window.confirm("Удалить задачу и её спринты?")) return;
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

    showToast("Добавлено: " + (parent.template?.code ?? "") + " · " + childCount + " " + pluralSprints(childCount) + ", " + formatDayMonth(parent.startDate) + " — " + formatDayMonth(parent.endDate));
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

  function toggleCalendarSource(source: CalendarSource) {
    setCalendarSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source); else next.add(source);
      return next;
    });
  }

  function openCalendarTask(item: CalendarTask) {
    if (item.source === "regular") {
      const task = data.regularTasks.find((entry) => entry.id === item.taskId);
      if (task) setModal({ kind: "regular-period", task, monthStart: toISO(startOfMonth(parseDate(item.date))) });
      return;
    }
    // Контрольная точка открывает карточку своего спринта — там весь чек-лист.
    const task = data.tasks.find((entry) => entry.id === item.taskId);
    if (task) setModal({ kind: "task", item: task, focusDate: item.source === "checkpoint" ? item.date : undefined });
  }

  function toggleCalendarCheckpoint(taskId: string, code: string) {
    commit((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id !== taskId ? task : {
        ...task,
        groups: (task.groups ?? []).map((group) => ({ ...group, items: group.items.map((item) => item.code === code ? setCheckpointDone(item, !item.done, todayKey) : item) })),
      }),
    }));
  }

  function renderAgendaSummary(meetingCount: number, tasks: CalendarTask[]) {
    const overdue = tasks.filter((item) => item.status === "Просрочено").length;
    const done = tasks.filter((item) => calendarBucket(item.status) === "done").length;
    if (meetingCount === 0 && tasks.length === 0) return <span>Ничего не запланировано</span>;
    return (
      <>
        {meetingCount > 0 && <span>{meetingCount} {pluralMeetings(meetingCount)}</span>}
        {tasks.length > 0 && <span>{tasks.length} {pluralTasks(tasks.length)}</span>}
        {overdue > 0 && <span className="agenda-warn">{pluralOverdue(overdue)}</span>}
        {done > 0 && <span>{done} выполнено</span>}
      </>
    );
  }

  function renderMeetingOccurrence({ meeting, isPlan, isFact, time }: MeetingOccurrence) {
    const statusLabel = meeting.status === "completed" ? "Проведена" : meeting.status === "cancelled" ? "Отменена" : "Запланирована";
    const statusClass = meeting.status === "completed" ? "status status-success" : meeting.status === "cancelled" ? "status status-danger" : "status status-neutral";
    return (
      <button type="button" className="agenda-item" key={"meeting:" + meeting.id} onClick={() => setModal({ kind: "meeting", item: meeting })}>
        <span className={"agenda-lead agenda-lead-time " + (isFact ? "meeting-fact" : "meeting-plan")}>{time || "—"}</span>
        <span className="agenda-copy">
          <small><b>Встреча</b>{isPlan && " · план"}{isFact && " · факт"}{isFact && !isPlan && meeting.plannedDate && " (план был " + formatShortDate(meeting.plannedDate) + ")"}</small>
          <b>{meeting.title}</b>
          {meeting.seriesId && activeSeriesIds.has(meeting.seriesId) && <span className="agenda-badges"><i className="occurrence-series"><Repeat2 size={9} />{meeting.seriesFrequency ? frequencyLabel(meeting.seriesFrequency) : "Серия"}</i></span>}
        </span>
        <span className="agenda-right"><em className={statusClass}>{statusLabel}</em>{meeting.comments.length > 0 && <span className="comment-count"><MessageSquareText size={12} />{meeting.comments.length}</span>}</span>
      </button>
    );
  }

  function renderCalendarTask(item: CalendarTask, showDate = false) {
    const datePrefix = showDate && <><b>{formatShortDate(item.date)}</b> · </>;
    const meta = item.source === "checkpoint"
      ? <><b>{item.code}</b> · {item.context}</>
      : item.source === "gantt"
        ? <><b>Срок</b>{item.context && " · " + item.context}</>
        : <><b>{item.frequency ? frequencyLabel(item.frequency) : "Регулярная задача"}</b>{item.actualDate && item.actualDate !== item.date && " · выполнено " + formatShortDate(item.actualDate)}</>;
    const titleClass = item.source === "checkpoint" ? [item.gate ? "is-gate" : "", item.done ? "is-done" : ""].filter(Boolean).join(" ") : "";
    // Строка — не кнопка: внутри у контрольной точки своя кнопка-галочка.
    return (
      <div role="button" tabIndex={0} className="agenda-item" key={item.key} onClick={() => openCalendarTask(item)} onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openCalendarTask(item);
        }
      }}>
        {item.source === "checkpoint"
          ? <button type="button" className={"agenda-check" + (item.done ? " is-done" : "") + (item.status === "Просрочено" ? " is-late" : "")} aria-pressed={item.done} aria-label={(item.done ? "Снять отметку с точки " : "Отметить выполненной точку ") + item.code} onClick={(event) => { event.stopPropagation(); toggleCalendarCheckpoint(item.taskId, item.code ?? ""); }}><Check size={11} strokeWidth={3.2} /></button>
          : <span className={"agenda-lead " + (item.source === "gantt" ? "agenda-lead-gantt" : "agenda-lead-regular")}>{item.source === "gantt" ? <ChartGantt size={15} /> : <Repeat2 size={15} />}</span>}
        <span className="agenda-copy">
          <small>{datePrefix}{meta}</small>
          <b className={titleClass || undefined}>{item.title}</b>
          {item.assignee ? <span className="agenda-who"><i>{personInitials(item.assignee)}</i>{item.assignee}</span> : <span className="agenda-who is-empty">Ответственный не назначен</span>}
        </span>
        <span className="agenda-right"><em className={calendarStatusClass(item.status)}>{item.status}</em></span>
      </div>
    );
  }

  function renderAgendaBody() {
    if (selectedDate) {
      const day = calendarAgenda.days[0];
      const groups = [
        { key: "meetings", title: "Встречи", rows: day.meetings.map(renderMeetingOccurrence) },
        { key: "gantt", title: "Дорожная карта", rows: day.tasks.filter((item) => item.source === "gantt").map((item) => renderCalendarTask(item)) },
        { key: "regular", title: "Регулярные задачи", rows: day.tasks.filter((item) => item.source === "regular").map((item) => renderCalendarTask(item)) },
        { key: "checkpoint", title: "Контрольные точки", rows: day.tasks.filter((item) => item.source === "checkpoint").map((item) => renderCalendarTask(item)) },
      ].filter((group) => group.rows.length > 0);
      if (groups.length === 0 && calendarAgenda.overdueTail.length === 0) {
        return <div className="empty-agenda"><CalendarDays size={22} /><b>На эту дату ничего нет</b><span>Нажмите на выбранный день ещё раз, чтобы увидеть весь месяц.</span></div>;
      }
      return (
        <>
          {groups.map((group) => <div key={group.key}><div className="agenda-group">{group.title}<small>{group.rows.length}</small></div>{group.rows}</div>)}
          {calendarAgenda.overdueTail.length > 0 && <div><div className="agenda-group agenda-overdue">Просрочено ранее<small>{calendarAgenda.overdueTail.length}</small></div>{calendarAgenda.overdueTail.map((item) => renderCalendarTask(item, true))}</div>}
        </>
      );
    }
    if (calendarAgenda.days.length === 0) {
      return <div className="empty-agenda"><CalendarDays size={22} /><b>В этом месяце ничего не запланировано</b><span>Выберите другой месяц или запланируйте встречу.</span></div>;
    }
    return calendarAgenda.days.map((day) => (
      <div key={day.iso}>
        <div className={"agenda-date" + (day.iso === todayKey ? " is-today" : "")}>{formatAgendaDate(day.iso)}{day.iso === todayKey && <small>сегодня</small>}</div>
        {day.meetings.map(renderMeetingOccurrence)}
        {day.tasks.map((item) => renderCalendarTask(item))}
      </div>
    ));
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
  // Середина дня на шкале — туда ставится ромбик контрольной точки.
  const ganttDayCenter = (date: string) => (Math.round((parseDate(date).getTime() - ganttRange.start.getTime()) / 86400000) + 0.5) / ganttRange.totalDays * 100;
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
            <h1>{PAGES.find((page) => page.key === activePage)?.title}</h1>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
          {pageMenuOpen ? (
            <div className="page-switcher-menu" role="menu" aria-label="Разделы проекта">
              {PAGES.map((page) => (
                <button
                  key={page.key}
                  type="button"
                  role="menuitem"
                  className={activePage === page.key ? "active" : ""}
                  onClick={() => { setActivePage(page.key); setPageMenuOpen(false); }}
                >
                  {page.title}
                  {activePage === page.key ? <Check size={16} aria-hidden="true" /> : null}
                </button>
              ))}
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

      <div className="pulse-wrap">
      <section className="pulse" aria-label="Состояние клиента">
        <button type="button" className={"tile " + (hasTwoMonthPlan ? "ok" : "bad")} onClick={() => { setGanttFilter("Все"); roadmapRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
          <span className="tile-icon">{hasTwoMonthPlan ? <Check size={18} /> : <CircleAlert size={18} />}</span>
          <small>План работ на 2 месяца</small>
          <strong>{hasTwoMonthPlan ? "Сформирован" : missingPlanMonths.length === 2 ? "Нет плана на 2 месяца" : "Нет плана на " + MONTHS[missingPlanMonths[0].monthStart.getMonth()].toLowerCase()}</strong>
          <span className="month-pills">{planningCoverage.map((month) => <span key={toISO(month.monthStart)} className={month.hasPlan ? "yes" : "no"}>{MONTHS[month.monthStart.getMonth()]} · {month.hasPlan ? month.count + " " + pluralSprints(month.count) : "пусто"}</span>)}</span>
        </button>
        <button type="button" className={"tile " + (health.overdue ? "bad" : health.shifted ? "warn" : "ok")} onClick={() => { setGanttFilter(health.overdue ? "Просрочено" : "Все"); roadmapRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
          <span className="tile-icon"><ChartGantt size={18} /></span>
          <small>Недельные спринты</small>
          <strong>{health.overdue ? health.overdue + " " + plural(health.overdue, "просрочен", "просрочено", "просрочено") + " из " + health.current : "Все " + health.current + " в срок"}</strong>
          <span className="tile-note">{health.shifted ? health.shifted + " " + plural(health.shifted, "перенесён", "перенесены", "перенесены") + " с причиной" : "Переносов нет"}</span>
        </button>
        <button type="button" data-closing-tile aria-expanded={closingOpen} className={"tile " + (manualClosedAt || closing.state === "ok" || closing.state === "pending" ? "ok" : closing.state === "late" ? "bad" : "warn")} onClick={() => setClosingOpen((open) => !open)}>
          <span className="tile-icon"><Repeat2 size={18} /></span>
          <small>Закрытие месяца</small>
          <strong>{manualClosedAt ? MONTHS[closingMonth] + " закрыт" : closing.state === "none" ? "Не заведено" : MONTHS[closingMonth] + (closing.state === "late" ? " не закрыт" : closing.state === "ok" ? " закрыт" : " закрывается")}</strong>
          <span className="tile-note">{manualClosedAt ? "Закрыт вручную " + formatDayShortMonth(manualClosedAt) : closingNote}</span>
        </button>
        <button type="button" className={"tile " + (nextMeeting ? "ok" : "bad")} onClick={() => { if (nextMeeting) focusMeetingDate(nextMeeting.plannedDate); meetingsRef.current?.scrollIntoView({ behavior: "smooth" }); }}>
          <span className="tile-icon"><CalendarDays size={18} /></span>
          <small>Следующая встреча</small>
          <strong>{nextMeeting ? formatDayShortMonth(nextMeeting.plannedDate) + ", " + nextMeeting.plannedTime : "Не запланирована"}</strong>
          <span className="tile-note">{nextMeeting?.title || "Добавьте встречу"}</span>
        </button>
      </section>
        {closingOpen && (
          <MonthClosingPopover
            key={closingKey + (manualClosedAt ?? "")}
            monthKey={closingKey}
            closing={closing}
            manualDate={manualClosedAt}
            today={todayKey}
            onSave={saveManualClosing}
            onClear={clearManualClosing}
            onOpenRegular={() => { setClosingOpen(false); regularRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            onClose={closeClosing}
          />
        )}
      </div>

      <section className="card roadmap-card" ref={roadmapRef}>
        <div className="section-head">
          <div className="section-title-wrap"><h2>Дорожная карта</h2><nav>{(["Все", "В работе", "Просрочено", "Неделя"] as const).map((filter) => <button key={filter} className={ganttFilter === filter ? "active" : ""} onClick={() => setGanttFilter(filter)}>{filter}</button>)}</nav></div>
          <div className="roadmap-actions">
            {ganttFilter === "Неделя" ? (
              <div className="wk-switch">
                <button type="button" className="icon-button" aria-label="Предыдущая неделя" disabled={weekStart <= weekRange.first} onClick={() => setPickedWeek(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
                <strong>{formatWeekRange(weekStart)}<small>{weekAgeLabel(weekStart, todayKey)}</small></strong>
                <button type="button" className="icon-button" aria-label="Следующая неделя" disabled={weekStart >= weekRange.last} onClick={() => setPickedWeek(addDays(weekStart, 7) >= weekRange.last ? null : addDays(weekStart, 7))}><ChevronRight size={16} /></button>
              </div>
            ) : (<>
            {parentIds.length > 0 && ganttFilter === "Все" && <button type="button" className="secondary" onClick={() => setCollapsedTaskIds(anyCollapsed ? new Set() : new Set(parentIds))}>{anyCollapsed ? "Развернуть всё" : "Свернуть всё"}</button>}
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
            </>)}
          </div>
        </div>
        {ganttFilter === "Неделя"
          ? <WeekReportView tasks={data.tasks} today={todayKey} weekStart={weekStart} onOpenTask={(task) => setModal({ kind: "task", item: task })} />
          : <div className="gantt-grid">
          <div className="task-table" ref={taskTableRef}>
            <div className="task-table-head"><span>Задача</span><span>Ответственный</span><span>Статус</span><span>Срок</span></div>
            {visibleTasks.map((task) => {
              const childCount = data.tasks.filter((child) => child.parentId === task.id).length;
              const isCollapsed = collapsedTaskIds.has(task.id);
              const progress = checkpointProgress(task, data.tasks);
              const summary = !task.parentId && childCount > 0 ? parentSummary(task, data.tasks, todayKey) : null;
              const shifts = isWorkTask(task, data.tasks) ? task.shifts ?? [] : [];
              const lastShift = shifts[shifts.length - 1];
              const waiting = isWorkTask(task, data.tasks) && taskCheckpoints(task).some(isWaitingClient);
              const overdueNow = isWorkTask(task, data.tasks) && task.status !== "Завершено" && task.endDate < todayKey;
              return (
                <div className={"task-table-row " + (task.parentId ? "task-child" : "task-parent") + (freshTaskIds.has(task.id) ? " fresh" : "")} key={task.id} data-task-id={task.id} role="button" tabIndex={0} onClick={() => setModal({ kind: "task", item: task })} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setModal({ kind: "task", item: task });
                }}>
                  <span className="task-title-cell">
                    {!task.parentId && childCount > 0 && <button type="button" className="task-toggle" aria-label={isCollapsed ? "Развернуть спринты" : "Свернуть спринты"} aria-expanded={!isCollapsed} onClick={(event) => { event.stopPropagation(); toggleParent(task.id); }}>{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</button>}
                    {!task.parentId && childCount === 0 && <span className="toggle-spacer" />}
                    {task.parentId && <i />}
                    <span className="task-title-content">
                      {(task.template || Boolean(task.labels?.length) || childCount > 0 || (progress && progress.total > 0) || task.comments.length > 0 || lastShift || overdueNow || waiting) && <span className="task-title-meta">
                        {task.template && <span className={"code-chip" + (task.parentId ? "" : " code-chip-parent")}>{task.template.subCode || task.template.code}</span>}
                        {task.labels?.map((label) => <span className={"code-chip task-label" + (task.parentId ? "" : " code-chip-parent")} key={label}>{label}</span>)}
                        {!task.parentId && childCount > 0 && <small className="child-count" title={childCount + " " + pluralSprints(childCount)}>{childCount}</small>}
                        {progress && progress.total > 0 && <small className={"progress-chip" + (progress.done === progress.total ? " progress-done" : "")} title={"Контрольные точки: " + progress.done + " из " + progress.total}><ProgressRing done={progress.done} total={progress.total} />{progress.done}/{progress.total}</small>}
                        {summary && <>
                          {summary.overdue > 0 && <span className="flag flag-red">{summary.overdue} {plural(summary.overdue, "спринт просрочен", "спринта просрочено", "спринтов просрочено")}</span>}
                          {summary.shifted > 0 && <span className="flag flag-amber">{summary.shifted} {plural(summary.shifted, "перенесён", "перенесено", "перенесено")}</span>}
                          {summary.waiting > 0 && <span className="flag flag-amber">ждём клиента: {summary.waiting}</span>}
                          {summary.overdue + summary.shifted + summary.waiting === 0 && <span className="flag flag-teal">без отклонений</span>}
                          <span className="flag-muted">{summary.closed} из {summary.total} закрыто</span>
                        </>}
                        {lastShift && <span className={"flag flag-" + shiftReasonInfo(lastShift.reason).tone}>перенос ×{shifts.length} · {shiftReasonInfo(lastShift.reason).short}</span>}
                        {overdueNow && <span className="flag flag-red">новый срок не назначен</span>}
                        {waiting && <span className="flag flag-amber">ждём клиента</span>}
                        {task.comments.length > 0 && <small><MessageSquareText size={12} />{task.comments.length}</small>}
                      </span>}
                      <b>{task.title}</b>
                    </span>
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
                  // Без выбранного базового плана штрихуем путь от исходного срока до текущего.
                  const ownFrom = originalEndDate(task);
                  const ownShift = !baseline && (task.shifts?.length ?? 0) > 0 && ownFrom < task.endDate ? { from: addDays(ownFrom, 1), to: task.endDate } : null;
                  const shiftTitle = shift && baselineKey
                    ? "Базовый план на " + formatShortDate(baselineKey) + ": " + formatShortDate(shift.base.startDate) + " — " + formatShortDate(shift.base.endDate)
                      + (shift.days === 0 ? "" : ", дедлайн " + (shift.days > 0 ? "+" : "−") + Math.abs(shift.days) + " " + pluralDays(Math.abs(shift.days)))
                    : undefined;
                  const progress = checkpointProgress(task, data.tasks);
                  // Ромбики точек ставятся только на спринтах. Ромбик дедлайна на конце полосы
                  // тогда убирается: при масштабе ~10 px на день он наезжает на точку пятницы.
                  const marks = task.parentId ? checkpointMarks(task, todayKey) : [];
                  return (
                    <div className="gantt-row" key={task.id} style={{ height: taskRowHeights[task.id] ?? 46 }}>
                      <button aria-label={"Редактировать " + task.title} onClick={() => setModal({ kind: "task", item: task })} className={"gantt-bar gantt-" + (isTaskOverdue(task, today) ? "overdue" : task.status === "Завершено" ? "done" : task.status === "Не начато" ? "planned" : "active") + (task.parentId ? "" : " gantt-parent")} style={ganttBarStyle(task.startDate, task.endDate)} title={task.title + " · " + formatShortDate(task.startDate) + " — " + formatShortDate(task.endDate) + (progress && progress.total > 0 ? " · точки " + progress.done + "/" + progress.total : "")}><span>{task.title}</span>{marks.length === 0 && <i />}</button>
                      {shift?.segments.map((segment) => <i key={segment.id} className={"gantt-delta" + (segment.inside ? "" : " gantt-delta-outside") + (task.parentId ? "" : " gantt-delta-parent")} style={ganttBarStyle(segment.from, segment.to)} title={shiftTitle} />)}
                      {ownShift && <i className={"gantt-delta" + (task.parentId ? "" : " gantt-delta-parent")} style={ganttBarStyle(ownShift.from, ownShift.to)} title={"Исходный срок " + formatShortDate(ownFrom) + " · переносов: " + task.shifts!.length} />}
                      {marks.map((mark) => (
                        <button type="button" key={mark.date} className="cp-hit" style={{ left: ganttDayCenter(mark.date) + "%" }} aria-label={"Контрольные точки на " + formatCheckpointDate(mark.date)}
                          onClick={() => { setCheckpointTip(null); setModal({ kind: "task", item: task, focusDate: mark.date }); }}
                          onMouseEnter={(event) => setCheckpointTip({ task, mark, rect: event.currentTarget.getBoundingClientRect() })}
                          onFocus={(event) => setCheckpointTip({ task, mark, rect: event.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setCheckpointTip(null)} onBlur={() => setCheckpointTip(null)}>
                          <i className={"cp-mark cp-mark-" + mark.state} />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>}
      </section>
      {checkpointTip && (
        <div className="cp-tip" role="tooltip" style={{ left: Math.min(Math.max(checkpointTip.rect.left + checkpointTip.rect.width / 2, 158), window.innerWidth - 158), top: checkpointTip.rect.bottom + 6 }}>
          <h5>{formatCheckpointDate(checkpointTip.mark.date)}{checkpointTip.task.template?.subCode ? " · " + checkpointTip.task.template.subCode : ""}</h5>
          {checkpointTip.mark.items.map((item) => {
            const state = checkpointState(item, todayKey);
            return <p key={item.code}><i className={state} /><span>{item.title}<br /><small>{item.assignee ? item.assignee + " · " : ""}{state === "done" ? "сделано" : state === "overdue" ? "просрочено" : state === "today" ? "сегодня" : "запланировано"}</small></span></p>;
          })}
        </div>
      )}

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

        <section className="card meetings-card" ref={meetingsRef}>
          <div className="compact-head"><h2>Календарь встреч и задач</h2><button className="primary" onClick={() => setModal({ kind: "meeting", item: null })}><Plus size={17} />Запланировать</button></div>
          <div className="calendar-filters">
            <div className="calendar-chips">
              {CALENDAR_SOURCES.map((source) => (
                <button type="button" className="calendar-chip" key={source.key} aria-pressed={calendarSources.has(source.key)} onClick={() => toggleCalendarSource(source.key)}><i><Check size={9} strokeWidth={4} /></i>{source.label}</button>
              ))}
            </div>
            <label className="calendar-person"><select value={calendarPerson} onChange={(event) => setCalendarPerson(event.target.value)} aria-label="Ответственный"><option value="">Все ответственные</option>{calendarPeople.map((person) => <option value={person} key={person}>{person}</option>)}</select><ChevronDown size={13} /></label>
          </div>
          <div className="calendar-layout">
            <div className="calendar">
              <div className="calendar-nav"><button onClick={() => moveCalendarMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={18} /></button><strong>{MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</strong><button onClick={() => moveCalendarMonth(1)} aria-label="Следующий месяц"><ChevronRight size={18} /></button></div>
              <div className="weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid">
                {calendarCells.map((cell) => {
                  const fillClass = cell.hasPlan && cell.hasFact ? "day-plan-fact" : cell.hasFact ? "day-fact" : cell.hasPlan ? "day-plan" : "";
                  const tip = [
                    cell.meetingCount > 0 ? cell.meetingCount + " " + pluralMeetings(cell.meetingCount) : "",
                    cell.buckets.length > 0 ? cell.buckets.length + " " + pluralTasks(cell.buckets.length) + (cell.overdueCount > 0 ? ", " + pluralOverdue(cell.overdueCount) : "") : "",
                  ].filter(Boolean).join(" · ") || "Ничего не запланировано";
                  return <button key={cell.iso} className={"calendar-day " + fillClass + (cell.inMonth ? "" : " outside") + (selectedDate === cell.iso ? " selected" : "") + (cell.iso === todayKey ? " is-today" : "")} onClick={() => {
                    setSelectedDate((current) => current === cell.iso ? null : cell.iso);
                    if (!cell.inMonth) setPickedCalendarMonth(startOfMonth(cell.date));
                  }} aria-pressed={selectedDate === cell.iso} title={tip} aria-label={formatShortDate(cell.iso) + ": " + tip}>
                    <span>{cell.date.getDate()}</span>
                    <span className="day-dots" aria-hidden="true">{cell.buckets.slice(0, 3).map((bucket, index) => <i className={"dot-" + bucket} key={index} />)}{cell.buckets.length > 3 && <b>+</b>}</span>
                    {cell.meetingCount > 1 && <em>{cell.meetingCount}</em>}
                  </button>;
                })}
              </div>
              <div className="calendar-legend">
                <div><b>Встречи</b><span><i className="legend-square legend-plan" />План</span><span><i className="legend-square legend-fact" />Факт</span></div>
                <div><b>Задачи</b><span><i className="legend-dot dot-plan" />В плане</span><span><i className="legend-dot dot-done" />Выполнено</span><span><i className="legend-dot dot-overdue" />Просрочено</span></div>
              </div>
            </div>
            <div className="agenda">
              <div className="agenda-head">
                <strong>{selectedDate ? formatWeekdayDate(selectedDate) + (selectedDate === todayKey ? " · сегодня" : "") : "Весь месяц · " + MONTHS[calendarMonth.getMonth()].toLowerCase() + " " + calendarMonth.getFullYear()}</strong>
                <div className="agenda-summary">{renderAgendaSummary(calendarAgenda.days.reduce((sum, day) => sum + day.meetings.length, 0), calendarAgenda.days.flatMap((day) => day.tasks))}</div>
              </div>
              <div className="agenda-body">{renderAgendaBody()}</div>
            </div>
          </div>
        </section>
      </div>

      <section className="card regular-card" ref={regularRef}>
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
      </> : activePage === "policy"
        ? <AccountingPolicy reports={data.reports} people={data.people} onChange={(reports) => commit((current) => ({ ...current, reports }))} />
        : <ControlBoard today={todayKey} />}

      {modal?.kind === "task" && <TaskDialog key={modal.item?.id ?? "new"} item={modal.item} tasks={data.tasks} people={data.people} today={todayKey} focusDate={modal.focusDate} onAddPerson={addPerson} onDeletePerson={deletePerson} onClose={() => setModal(null)} onSave={saveTask} onDelete={deleteTask} onOpenTask={(task) => setModal({ kind: "task", item: task })} />}
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
