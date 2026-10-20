"use client";

import { CalendarDays, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { normalizePerson } from "@/components/person-select";
import { checkpointDate, checkpointState } from "@/lib/checkpoint-dates";
import { addClientRequest, changeClientRequest, isWaitingClient, removeClientRequest, requestDateError, setCheckpointDone } from "@/lib/checkpoint-tracking";
import { addDays, differenceInDays, formatDayMonth, formatDayShortMonth, isValidDateValue, parseDate, weekdayName } from "@/lib/dates";
import { plural } from "@/lib/plural";
import type { Checkpoint, CheckpointGroup } from "@/lib/types";

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

function shortCode(code: string) {
  // «ДДС-1.5» → «1.5»: код спринта уже есть в заголовке карточки
  const dash = code.indexOf("-");
  return dash >= 0 ? code.slice(dash + 1) : code;
}

const WEEKDAY_SHORT: Record<string, string> = { "понедельник": "пн", "вторник": "вт", "среда": "ср", "четверг": "чт", "пятница": "пт", "суббота": "сб", "воскресенье": "вс" };
const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function shortWeekday(value: string) {
  return WEEKDAY_SHORT[weekdayName(value)];
}

export function formatCheckpointDate(value: string) {
  const date = parseDate(value);
  return weekdayName(value) + ", " + date.getDate() + " " + MONTHS_GENITIVE[date.getMonth()];
}

function surname(person: string) {
  const parts = person.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Дни недели спринта для выбора срока в один клик. Длинный период обрезается до двух недель.
function sprintDays(startDate: string, endDate: string) {
  if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) return [];
  const count = Math.min(14, differenceInDays(startDate, endDate));
  return count < 0 ? [] : Array.from({ length: count + 1 }, (_, index) => addDays(startDate, index));
}

type Schedule = { date: string; assignee: string };

function SchedulePanel({
  value,
  onChange,
  days,
  today,
  people,
  onAddPerson,
  onDone,
}: {
  value: Schedule;
  onChange: (patch: Partial<Schedule>) => void;
  days: string[];
  today: string;
  people: string[];
  onAddPerson: (person: string) => void;
  onDone?: () => void;
}) {
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState("");
  const outside = Boolean(value.date) && !days.includes(value.date);

  function addPerson() {
    const person = normalizePerson(newPerson);
    if (person) {
      const existing = people.find((item) => item.toLocaleLowerCase("ru") === person.toLocaleLowerCase("ru"));
      if (!existing) onAddPerson(person);
      onChange({ assignee: existing ?? person });
    }
    setNewPerson("");
    setAddingPerson(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape закрывает только панель, а не всю карточку задачи. Корень React в App Router —
    // сам document, где слушает и ModalShell, поэтому нужна именно stopImmediatePropagation.
    if (event.key !== "Escape") return;
    event.nativeEvent.stopImmediatePropagation();
    if (addingPerson) setAddingPerson(false);
    else onDone?.();
  }

  return (
    <div className="cp-panel" onKeyDown={handleKeyDown}>
      <div className="cp-row">
        <span className="cp-row-label">Срок</span>
        <div className="cp-row-body">
          {days.map((date) => {
            const weekday = shortWeekday(date);
            return (
              <button type="button" key={date} className={"cp-day" + (value.date === date ? " is-on" : "") + (date === today ? " is-today" : "") + (weekday === "сб" || weekday === "вс" ? " is-weekend" : "")} title={formatCheckpointDate(date)} aria-pressed={value.date === date} onClick={() => onChange({ date: value.date === date ? "" : date })}>
                <small>{weekday}</small><b>{parseDate(date).getDate()}</b>
              </button>
            );
          })}
          <label className={"cp-other" + (outside ? " is-on" : "")}>{outside ? "Дата" : "Другая"}<input type="date" value={outside ? value.date : ""} aria-label="Другая дата" onChange={(event) => { if (event.target.value) onChange({ date: event.target.value }); }} /></label>
          {value.date && <button type="button" className="cp-link" onClick={() => onChange({ date: "" })}>Без срока</button>}
        </div>
      </div>
      <div className="cp-row">
        <span className="cp-row-label">Ответственный</span>
        <div className="cp-row-body">
          {people.map((person) => (
            <button type="button" key={person} className={"cp-person" + (value.assignee === person ? " is-on" : "")} aria-pressed={value.assignee === person} onClick={() => onChange({ assignee: value.assignee === person ? "" : person })}>{person}</button>
          ))}
          {addingPerson
            ? <input className="cp-person-input" autoFocus value={newPerson} placeholder="Имя и фамилия, Enter" aria-label="Новый человек" onChange={(event) => setNewPerson(event.target.value)} onBlur={addPerson} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPerson(); } }} />
            : <button type="button" className="cp-person cp-person-new" onClick={() => setAddingPerson(true)}>+ Добавить</button>}
        </div>
      </div>
      {onDone && (
        <div className="cp-panel-foot"><span>Изменения сохранятся вместе с карточкой</span><button type="button" className="secondary" onClick={onDone}>Готово</button></div>
      )}
    </div>
  );
}

function ScheduleChip({ item, today, open, onClick }: { item: Checkpoint; today: string; open: boolean; onClick: () => void }) {
  const date = checkpointDate(item);
  const state = checkpointState(item, today);
  const tone = !date ? " cp-chip-empty" : state === "overdue" ? " cp-chip-overdue" : state === "today" ? " cp-chip-today" : state === "done" ? " cp-chip-done" : "";
  const who = item.assignee ? surname(item.assignee) : "";
  return (
    <button type="button" className={"cp-chip" + tone + (open ? " is-open" : "")} aria-expanded={open} title={date ? "Срок: " + formatCheckpointDate(date) + (state === "overdue" ? " — просрочено" : "") + (item.assignee ? " · " + item.assignee : "") : "Назначить срок"} onClick={onClick}>
      {date ? <><CalendarDays size={12} />{state === "today" ? "сегодня" : shortWeekday(date) + " " + formatDayMonth(date)}</> : "+ срок"}
      {who && <span className="cp-who">{date ? "· " : ""}{who}</span>}
    </button>
  );
}

// Журнал запросов клиенту: даты кликабельны — их можно исправить или удалить ошибочный запрос;
// новый запрос можно отметить задним числом.
function ClientRequests({ item, today, onChange }: { item: Checkpoint; today: string; onChange: (next: Checkpoint) => void }) {
  const requests = item.requests ?? [];
  const [newDate, setNewDate] = useState(today);
  const [editing, setEditing] = useState<{ from: string; value: string } | null>(null);
  const [error, setError] = useState("");
  const last = requests[requests.length - 1];
  const ago = last ? differenceInDays(last, today) : 0;

  function add() {
    const problem = requestDateError(item, newDate, today);
    if (problem) return setError(problem);
    onChange(addClientRequest(item, newDate));
    setNewDate(today);
    setError("");
  }

  function saveEdit() {
    if (!editing) return;
    const problem = requestDateError(item, editing.value, today, editing.from);
    if (problem) return setError(problem);
    onChange(changeClientRequest(item, editing.from, editing.value));
    setEditing(null);
    setError("");
  }

  function remove() {
    if (!editing) return;
    onChange(removeClientRequest(item, editing.from));
    setEditing(null);
    setError("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape отменяет правку даты, а не закрывает всю карточку задачи (см. SchedulePanel).
    if (event.key !== "Escape" || !editing) return;
    event.nativeEvent.stopImmediatePropagation();
    setEditing(null);
    setError("");
  }

  return (
    <div className="cp-requests" onKeyDown={handleKeyDown}>
      {requests.length > 0 && (
        <div className="cp-requests-list">Запрошено:{requests.map((date) => editing?.from === date ? (
          <span className="cp-request-edit" key={date}>
            <input type="date" value={editing.value} max={today} aria-label="Дата запроса" onChange={(event) => setEditing({ from: date, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveEdit(); } }} />
            <button type="button" className="secondary" onClick={saveEdit}>Сохранить</button>
            <button type="button" className="cp-link cp-link-danger" onClick={remove}>Удалить</button>
            <button type="button" className="cp-link" onClick={() => { setEditing(null); setError(""); }}>Отмена</button>
          </span>
        ) : (
          <button type="button" className="cp-request-date" key={date} title="Изменить или удалить" onClick={() => { setEditing({ from: date, value: date }); setError(""); }}>{formatDayMonth(date)}</button>
        ))}</div>
      )}
      <div className="cp-requests-foot">
        <span>{last ? (ago === 0 ? "Последний запрос сегодня" : "Последний запрос " + ago + " " + plural(ago, "день", "дня", "дней") + " назад") : ""}</span>
        <span className="cp-request-add">
          <label htmlFor={"request-" + item.code}>Дата запроса</label>
          <input id={"request-" + item.code} type="date" value={newDate} max={today} onChange={(event) => setNewDate(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
          <button type="button" className="secondary" onClick={add}>Добавить запрос</button>
        </span>
      </div>
      {error && <p className="cp-requests-error">{error}</p>}
    </div>
  );
}

export default function CheckpointsEditor({
  groups,
  nextCode,
  onChange,
  startDate,
  endDate,
  today,
  defaultAssignee,
  people,
  onAddPerson,
  highlightDate,
}: {
  groups: CheckpointGroup[];
  nextCode: () => string;
  onChange: (groups: CheckpointGroup[]) => void;
  startDate: string;
  endDate: string;
  today: string;
  defaultAssignee: string;
  people: string[];
  onAddPerson: (person: string) => void;
  highlightDate?: string;          // день ромбика, по которому открыли карточку с диаграммы Ганта
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [flashDate, setFlashDate] = useState(highlightDate ?? "");
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftSchedule, setDraftSchedule] = useState<Schedule>({ date: "", assignee: "" });
  // Панели запросов у точек, где ждём клиента, при открытии карточки раскрыты.
  const [requestPanels, setRequestPanels] = useState<Set<string>>(() => new Set(groups.flatMap((group) => group.items).filter(isWaitingClient).map((item) => item.code)));

  function toggleRequests(code: string) {
    setRequestPanels((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  const items = groups.flatMap((group) => group.items);
  const done = items.filter((item) => item.done).length;
  const allDone = items.length > 0 && done === items.length;
  const days = sprintDays(startDate, endDate);

  useEffect(() => {
    if (!flashDate) return;
    sectionRef.current?.querySelector(".cp-flash")?.scrollIntoView({ block: "center" });
    const timer = window.setTimeout(() => setFlashDate(""), 1400);
    return () => window.clearTimeout(timer);
  }, [flashDate]);

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
    setPanel(null);
    setDraftTitle(item.title);
    setDraftNote(item.note);
    setDraftSchedule({ date: item.date ?? "", assignee: item.assignee ?? "" });
    setOpenNotes((current) => { const next = new Set(current); next.delete(item.code); return next; });
  }

  function finishEdit(item: Checkpoint) {
    const title = draftTitle.trim();
    const note = draftNote.trim();
    if (!title) patchItem(item.code, null);
    else patchItem(item.code, { title, note, noteTitle: note ? (item.noteTitle || title) : "", date: draftSchedule.date, assignee: draftSchedule.assignee });
    setEditing(null);
  }

  function cancelEdit(item: Checkpoint) {
    // Отмена правки только что добавленной пустой точки убирает её.
    if (!item.title) patchItem(item.code, null);
    setEditing(null);
  }

  function addItem() {
    const item: Checkpoint = { code: nextCode(), title: "", aside: "", gate: false, noteTitle: "", note: "", done: false, date: "", assignee: defaultAssignee };
    const last = groups.length - 1;
    onChange(last < 0 ? [{ title: "", result: "", items: [item] }] : groups.map((group, index) => index === last ? { ...group, items: [...group.items, item] } : group));
    setEditing(item.code);
    setPanel(null);
    setDraftTitle("");
    setDraftNote("");
    setDraftSchedule({ date: "", assignee: defaultAssignee });
  }

  return (
    <div className="check-section" ref={sectionRef}>
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
                <SchedulePanel value={draftSchedule} onChange={(patch) => setDraftSchedule({ ...draftSchedule, ...patch })} days={days} today={today} people={people} onAddPerson={onAddPerson} />
                <div className="check-edit-actions">
                  <button type="button" className="delete-button" onClick={() => { patchItem(item.code, null); setEditing(null); }}>Удалить</button>
                  <button type="button" className="secondary" onClick={() => cancelEdit(item)}>Отмена</button>
                  <button type="button" className="primary" onClick={() => finishEdit(item)}>Готово</button>
                </div>
              </div>
            </div>
          ) : (
            <div className={"check-item" + (item.done ? " check-item-done" : "") + (flashDate && checkpointDate(item) === flashDate ? " cp-flash" : "")} key={item.code}>
              <input type="checkbox" id={"checkpoint-" + item.code} checked={item.done} onChange={() => patchItem(item.code, setCheckpointDone(item, !item.done, today))} />
              <span className="check-code">{shortCode(item.code)}</span>
              <label htmlFor={"checkpoint-" + item.code} className={item.gate ? "check-gate" : ""}>{item.title}{item.aside && <span className="check-aside"> ({item.aside})</span>}</label>
              <span className="check-tools">
                {item.done && item.doneAt
                  ? <span className="cp-done-at">сделано {formatDayShortMonth(item.doneAt)}</span>
                  : <ScheduleChip item={item} today={today} open={panel === item.code} onClick={() => setPanel(panel === item.code ? null : item.code)} />}
                {!item.done && (isWaitingClient(item)
                  ? <button type="button" className="cp-request is-waiting" aria-expanded={requestPanels.has(item.code)} onClick={() => toggleRequests(item.code)}>ждём клиента · {item.requests!.length} {plural(item.requests!.length, "запрос", "запроса", "запросов")}</button>
                  : <button type="button" className="cp-request" aria-expanded={requestPanels.has(item.code)} onClick={() => toggleRequests(item.code)}>+ запрос клиенту</button>)}
                {item.note && <button type="button" className={"info-button" + (openNotes.has(item.code) ? " info-open" : "")} title={item.noteTitle || "Пояснение"} aria-expanded={openNotes.has(item.code)} onClick={() => toggleNote(item.code)}>i</button>}
                <button type="button" title="Изменить" aria-label={"Изменить точку " + item.code} onClick={() => startEdit(item)}><Pencil size={13} /></button>
              </span>
              {item.note && openNotes.has(item.code) && <div className="check-note"><b>{item.noteTitle || "Пояснение"}</b>{item.note}</div>}
              {!item.done && requestPanels.has(item.code) && <ClientRequests item={item} today={today} onChange={(next) => patchItem(item.code, next)} />}
              {panel === item.code && (
                <SchedulePanel value={{ date: item.date ?? "", assignee: item.assignee ?? "" }} onChange={(patch) => patchItem(item.code, patch)} days={days} today={today} people={people} onAddPerson={onAddPerson} onDone={() => setPanel(null)} />
              )}
            </div>
          ))}
        </div>
      ))}
      <button type="button" className="add-check" onClick={addItem}><Plus size={14} />Добавить контрольную точку</button>
    </div>
  );
}
