"use client";

import { Check, CircleAlert } from "lucide-react";
import { formatDayShortMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { shiftReasonInfo } from "@/lib/task-shifts";
import { taskCheckpoints } from "@/lib/typical-tasks";
import type { Task } from "@/lib/types";
import { formatWeekRange, weekReport } from "@/lib/week-report";

function TaskTitle({ task, tasks }: { task: Task; tasks: Task[] }) {
  // Код из шаблона, если он есть; у обычных спринтов — название надзадачи.
  const parent = task.parentId ? tasks.find((item) => item.id === task.parentId) : undefined;
  const code = task.template?.subCode || task.template?.code || parent?.title;
  return <>{code && <span className="code-chip">{code}</span>}{task.title}</>;
}

export default function WeekReportView({ tasks, today, weekStart, onOpenTask }: { tasks: Task[]; today: string; weekStart: string; onOpenTask: (task: Task) => void }) {
  const report = weekReport(tasks, weekStart, today);
  return (
    <div className="wk">
      <div className="wk-summary">
        <span>Закрыто пунктов: <b>{report.doneCount}</b></span>
        <span>Закрыто спринтов: <b>{report.closedCount}</b></span>
        <span>Переносов: <b>{report.shifts.length}</b></span>
        <span>Срок прошёл без нового срока: <b>{report.stuck.length}</b></span>
      </div>
      {report.noMovement && <div className="wk-stall"><CircleAlert size={18} /><div><b>Неделя без движения</b><span>За {formatWeekRange(weekStart)} не закрыт ни один пункт и не перенесён ни один срок.</span></div></div>}
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
    </div>
  );
}
