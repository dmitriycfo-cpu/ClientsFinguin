"use client";

import { Check, CircleAlert, PauseCircle, Repeat } from "lucide-react";
import { useState } from "react";
import { formatDayShortMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { shiftReasonInfo } from "@/lib/task-shifts";
import { taskCheckpoints } from "@/lib/typical-tasks";
import { isPostponeExpired } from "@/lib/postpone";
import type { RegularTask, Task } from "@/lib/types";
import { weekRegular, weekRegularSummary, type WeekRegularItem } from "@/lib/week-regular";
import { formatWeekRange, weekReport } from "@/lib/week-report";

function TaskTitle({ task, tasks }: { task: Task; tasks: Task[] }) {
  // Код из шаблона, если он есть; у обычных спринтов — название надзадачи.
  const parent = task.parentId ? tasks.find((item) => item.id === task.parentId) : undefined;
  const code = task.template?.subCode || task.template?.code || parent?.title;
  return <>{code && <span className="code-chip">{code}</span>}{task.title}</>;
}

function regularTone(item: WeekRegularItem) {
  if (item.status === "Выполнено") return "flag flag-teal";
  if (item.status === "С опозданием") return "flag flag-amber";
  if (item.status === "Не выполнено") return "flag flag-red";
  return "flag flag-grey";
}

// Резюме недели: пара строк своими словами. Сохраняется, когда поле теряет фокус.
function WeekNote({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <label className="wk-note">
      <span>Резюме недели <small>что происходило, почему что-то сдвинулось, о чём договорились с клиентом</small></span>
      <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => { if (text.trim() !== value.trim()) onSave(text.trim()); }} placeholder="Например: собственник в командировке, кошельки получим к 20-му; закрыли октябрь, сверили ДЗ с бухгалтером" />
    </label>
  );
}

function RegularList({ items, today, onToggle, onOpen }: { items: WeekRegularItem[]; today: string; onToggle: (item: WeekRegularItem) => void; onOpen: (item: WeekRegularItem) => void }) {
  if (items.length === 0) return <div className="wk-empty">На эту неделю регулярных задач нет</div>;
  return (
    <div className="wk-reg">
      {items.map((item) => {
        const early = item.plannedDate > today && !item.done;
        return (
          <div className={"wk-reg-row" + (item.status === "Не выполнено" ? " is-missed" : "")} key={item.task.id + item.plannedDate}>
            <button type="button" className={"wk-tick wk-tick-btn" + (item.done ? " is-done" : item.status === "Не выполнено" ? " is-late" : "")} aria-pressed={item.done} aria-label={(item.done ? "Снять отметку: " : "Отметить выполненной: ") + item.task.title} disabled={early} title={early ? "Отметить можно с плановой даты" : item.done ? "Снять отметку" : "Отметить выполненной сегодня"} onClick={() => onToggle(item)}>{item.done && <Check size={10} strokeWidth={3.4} />}</button>
            <button type="button" className="wk-reg-title" onClick={() => onOpen(item)}>
              <span className="wk-reg-name">{item.parentTitle && <span className="code-chip">{item.parentTitle}</span>}<b>{item.task.title}</b></span>
              {item.record?.note && <small>{item.record.note}</small>}
              {item.status === "Не выполнено" && !item.record?.note && <small className="wk-reg-hint">Не выполнено — откройте и напишите причину</small>}
            </button>
            <time>{formatDayShortMonth(item.plannedDate)}{item.record?.actualDate && item.record.actualDate !== item.plannedDate ? " → " + formatDayShortMonth(item.record.actualDate) : ""}</time>
            <span className={regularTone(item)}>{item.status}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function WeekReportView({ tasks, regularTasks, weekNote, today, weekStart, onOpenTask, onToggleRegular, onOpenRegular, onSaveNote }: {
  tasks: Task[];
  regularTasks: RegularTask[];
  weekNote: string;
  today: string;
  weekStart: string;
  onOpenTask: (task: Task) => void;
  onToggleRegular: (task: RegularTask, plannedDate: string) => void;
  onOpenRegular: (task: RegularTask, plannedDate: string) => void;
  onSaveNote: (value: string) => void;
}) {
  const [tab, setTab] = useState<"sprints" | "regular">("sprints");
  const report = weekReport(tasks, weekStart, today);
  const regular = weekRegular(regularTasks, weekStart, today);
  const regularSum = weekRegularSummary(regular);
  const noMovement = report.noMovement && regularSum.done === 0;
  return (
    <div className="wk">
      <div className="wk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "sprints"} className={tab === "sprints" ? "active" : ""} onClick={() => setTab("sprints")}>Спринты</button>
        <button type="button" role="tab" aria-selected={tab === "regular"} className={tab === "regular" ? "active" : ""} onClick={() => setTab("regular")}><Repeat size={13} />Регулярные задачи<span className={"nav-count" + (regularSum.missed > 0 ? " is-bad" : "")}>{regularSum.done}/{regularSum.total}</span></button>
      </div>
      <WeekNote key={weekStart} value={weekNote} onSave={onSaveNote} />
      {tab === "regular" ? <>
        <div className="wk-summary">
          <span>Выполнено: <b>{regularSum.done} из {regularSum.total}</b></span>
          <span>Не выполнено: <b>{regularSum.missed}</b></span>
        </div>
        <RegularList items={regular} today={today} onToggle={(item) => onToggleRegular(item.task, item.plannedDate)} onOpen={(item) => onOpenRegular(item.task, item.plannedDate)} />
      </> : <>
      <div className="wk-summary">
        <span>Закрыто пунктов: <b>{report.doneCount}</b></span>
        <span>Закрыто спринтов: <b>{report.closedCount}</b></span>
        <span>Переносов: <b>{report.shifts.length}</b></span>
        <span>Срок прошёл без нового срока: <b>{report.stuck.length}</b></span>
        <button type="button" className="wk-summary-link" onClick={() => setTab("regular")}>Регулярные: <b>{regularSum.done} из {regularSum.total}</b></button>
        {report.postponed.length > 0 && <span>Отложено: <b>{report.postponed.length}</b></span>}
      </div>
      {noMovement && <div className="wk-stall"><CircleAlert size={18} /><div><b>Неделя без движения</b><span>За {formatWeekRange(weekStart)} не закрыт ни один пункт, не выполнена ни одна регулярная задача и не перенесён ни один срок.</span></div></div>}
      <div className="wk-cols">
        <section className="wk-col">
          <div className="wk-col-head"><h3>Сделано за неделю</h3><small>{report.doneCount} {plural(report.doneCount, "пункт", "пункта", "пунктов")}</small></div>
          {report.done.length === 0 && <div className="wk-empty">Ничего не закрыто</div>}
          {report.done.map((group) => (
            <div className="wk-group" key={group.task.id}>
              <button type="button" className="wk-group-title" onClick={() => onOpenTask(group.task)}><TaskTitle task={group.task} tasks={tasks} />{group.closed && <span className="flag flag-teal">спринт закрыт</span>}</button>
              {group.items.map((item) => <div className="wk-item" key={item.code}><span className="wk-tick is-done"><Check size={10} strokeWidth={3.4} /></span><code>{item.code}</code><span>{item.title}</span><time>{formatDayShortMonth(item.doneAt!)}</time></div>)}
            </div>
          ))}
        </section>

        <section className="wk-col">
          <div className="wk-col-head"><h3>Переносы и причины</h3><small>{report.shifts.length} {plural(report.shifts.length, "перенос", "переноса", "переносов")}</small></div>
          {report.shifts.length === 0 && <div className="wk-empty">Переносов не было</div>}
          {report.shifts.map(({ task, shift, index, total }) => {
            const hold = taskCheckpoints(task).find((item) => item.code === shift.holdCode);
            const info = shiftReasonInfo(shift.reason);
            return (
              <div className="wk-shift" key={task.id + shift.date + index}>
                <button type="button" className="wk-shift-top" onClick={() => onOpenTask(task)}><TaskTitle task={task} tasks={tasks} /></button>
                <div className="shift-dates"><s>{formatDayShortMonth(shift.from)}</s> → <b>{formatDayShortMonth(shift.to)}</b><span className={"flag flag-" + info.tone}>{info.label}</span>{total > 1 && <span className="flag-muted">перенос {index + 1} из {total}</span>}</div>
                {hold && <div className="wk-shift-hold">Держит: <b>{hold.code}</b> {hold.title}{(hold.requests?.length ?? 0) > 0 && <> · <span className="flag flag-amber">запрошено {hold.requests!.length} {plural(hold.requests!.length, "раз", "раза", "раз")}</span></>}</div>}
                {shift.note && <div className="wk-shift-note">{shift.note}</div>}
              </div>
            );
          })}
          {report.stuck.length > 0 && <>
            <div className="wk-subhead">Срок прошёл, новый срок не назначен</div>
            {report.stuck.map(({ task, endDate, daysLate, openItems }) => (
              <div className="wk-shift" key={"stuck-" + task.id}>
                <div className="wk-shift-top"><TaskTitle task={task} tasks={tasks} /></div>
                <div className="shift-dates">Срок был {formatDayShortMonth(endDate)} · <span className="flag flag-red">просрочено на {daysLate} {plural(daysLate, "день", "дня", "дней")}</span></div>
                {openItems.length > 0 && <div className="wk-shift-hold">Не закрыто: {openItems.map((item, i) => <span key={item.code}>{i > 0 && ", "}<b>{item.code}</b> {item.title}</span>)}</div>}
                {report.isCurrent && <button type="button" className="wk-link" onClick={() => onOpenTask(task)}>Назначить новый срок и причину →</button>}
              </div>
            ))}
          </>}
          {report.postponed.length > 0 && <>
            <div className="wk-subhead wk-subhead-paused">Отложено</div>
            {report.postponed.map(({ task, isNew }) => (
              <div className="wk-shift" key={"paused-" + task.id}>
                <button type="button" className="wk-shift-top" onClick={() => onOpenTask(task)}><PauseCircle size={13} /><TaskTitle task={task} tasks={tasks} /></button>
                <div className="shift-dates">{task.postponeUntil ? <>до <b>{formatDayShortMonth(task.postponeUntil)}</b></> : "без даты"}{isNew && <span className="flag flag-grey">отложено на этой неделе</span>}{isPostponeExpired(task, today) && <span className="flag flag-red">пора вернуться</span>}</div>
                {task.postponeReason && <div className="wk-shift-note">{task.postponeReason}</div>}
              </div>
            ))}
          </>}
        </section>

        <section className="wk-col">
          <div className="wk-col-head"><h3>План на следующую неделю</h3><small>{formatWeekRange(report.nextStart)}</small></div>
          {report.next.length === 0 && <div className="wk-empty">На следующую неделю спринтов нет</div>}
          {report.next.map(({ task, items }) => (
            <div className="wk-group" key={task.id}>
              <button type="button" className="wk-group-title" onClick={() => onOpenTask(task)}><TaskTitle task={task} tasks={tasks} /><span className="flag-muted">до {formatDayShortMonth(task.endDate)}</span></button>
              {items.map((item) => {
                const late = Boolean(item.date) && item.date! < today;
                return <div className="wk-item" key={item.code}><span className={"wk-tick" + (late ? " is-late" : "")} /><code>{item.code}</code><span>{item.title}</span><time>{item.date ? (late ? "был " : "") + formatDayShortMonth(item.date) : "без даты"}</time></div>;
              })}
            </div>
          ))}
        </section>
      </div>
      </>}
    </div>
  );
}
