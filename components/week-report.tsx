"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, PauseCircle, Repeat2 } from "lucide-react";
import { formatDayShortMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { regularStatusClass } from "@/lib/regular-schedule";
import { shiftReasonInfo } from "@/lib/task-shifts";
import { taskCheckpoints } from "@/lib/typical-tasks";
import { isPostponeExpired } from "@/lib/postpone";
import type { Checkpoint, RegularTask, Task } from "@/lib/types";
import { formatWeekRange, regularWeek, weekReport, type RegularOccurrence } from "@/lib/week-report";

type WeekBlock = "sprints" | "regular";

interface WeekReportProps {
  tasks: Task[];
  regularTasks: RegularTask[];
  today: string;
  weekStart: string;
  note: string;
  onNoteChange: (weekStart: string, text: string) => void;
  onOpenTask: (task: Task) => void;
  onOpenRegular: (task: RegularTask, date: string) => void;
  onToggleRegular: (task: RegularTask, date: string) => void;
}

function TaskTitle({ task, tasks }: { task: Task; tasks: Task[] }) {
  // Код из шаблона, если он есть; у обычных спринтов — название надзадачи.
  const parent = task.parentId ? tasks.find((item) => item.id === task.parentId) : undefined;
  const code = task.template?.subCode || task.template?.code || parent?.title;
  return <>{code && <span className="code-chip">{code}</span>}{task.title}</>;
}

export default function WeekReportView(props: WeekReportProps) {
  const { regularTasks, today, weekStart } = props;
  const [block, setBlock] = useState<WeekBlock>("sprints");
  const regular = regularWeek(regularTasks, weekStart, today);

  return (
    <div className="wk">
      <div className="wk-tabs" role="tablist" aria-label="Блоки недели">
        <button type="button" role="tab" aria-selected={block === "sprints"} className={block === "sprints" ? "active" : ""} onClick={() => setBlock("sprints")}>Спринты</button>
        <button type="button" role="tab" aria-selected={block === "regular"} className={block === "regular" ? "active" : ""} onClick={() => setBlock("regular")}>
          <Repeat2 size={14} />Регулярные задачи<span className="wk-tab-count">{regular.doneCount}/{regular.week.length}</span>
        </button>
      </div>

      <WeekNote key={weekStart} weekStart={weekStart} initial={props.note} onSave={props.onNoteChange} />

      {block === "sprints" && <SprintsBlock {...props} />}
      {block === "regular" && <RegularBlock weekStart={weekStart} week={regular} onOpen={props.onOpenRegular} onToggle={props.onToggleRegular} />}
    </div>
  );
}

// Резюме хранится по понедельнику недели. Пишем с задержкой, чтобы не сохранять каждую букву,
// и сразу — при уходе из поля или со страницы недели.
function WeekNote({ weekStart, initial, onSave }: { weekStart: string; initial: string; onSave: (weekStart: string, text: string) => void }) {
  const [text, setText] = useState(initial);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useRef(onSave);
  useEffect(() => { save.current = onSave; }, [onSave]);

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) save.current(weekStart, pending.current);
    pending.current = null;
  }
  // Ушли на другую неделю или вкладку — дописываем то, что не успело сохраниться.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flush, []);

  return (
    <label className="wk-note">
      <span><b>Резюме недели</b><small>что происходило, почему что-то сдвинулось, о чём договорились с клиентом</small></span>
      <textarea
        rows={2}
        value={text}
        placeholder="Например: собственник в командировке, кошельки получим к 20-му; закрыли октябрь, сверили ДЗ с бухгалтером"
        onChange={(event) => {
          setText(event.target.value);
          pending.current = event.target.value;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 600);
        }}
        onBlur={flush}
      />
    </label>
  );
}

function SprintsBlock({ tasks, today, weekStart, onOpenTask }: WeekReportProps) {
  const report = weekReport(tasks, weekStart, today);
  return (
    <>
      <div className="wk-summary">
        <span>Закрыто пунктов: <b>{report.doneCount}</b></span>
        <span>Закрыто спринтов: <b>{report.closedCount}</b></span>
        <span>Переносов: <b>{report.shifts.length}</b></span>
        <span>Срок прошёл без нового срока: <b>{report.stuck.length}</b></span>
        {report.postponed.length > 0 && <span>Отложено: <b>{report.postponed.length}</b></span>}
      </div>
      {report.noMovement && <div className="wk-stall"><CircleAlert size={18} /><div><b>Неделя без движения</b><span>За {formatWeekRange(weekStart)} не закрыт ни один пункт и не перенесён ни один срок.</span></div></div>}
      <div className="wk-cols">
        <section className="wk-col">
          <div className="wk-col-head"><h3>Сделано за неделю</h3><small>{report.doneCount} {plural(report.doneCount, "пункт", "пункта", "пунктов")}</small></div>
          {report.done.length === 0 && <div className="wk-empty">Ничего не закрыто</div>}
          {report.done.map((group) => (
            <div className="wk-group" key={group.task.id}>
              <button type="button" className="wk-group-title" onClick={() => onOpenTask(group.task)}><TaskTitle task={group.task} tasks={tasks} />{group.closed && <span className="flag flag-teal">спринт закрыт</span>}</button>
              {group.items.map((item) => <DoneItem key={item.code} item={item} />)}
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
              {items.map((item) => <OpenItem key={item.code} item={item} today={today} />)}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function DoneItem({ item }: { item: Checkpoint }) {
  return <div className="wk-item"><span className="wk-tick is-done"><Check size={10} strokeWidth={3.4} /></span><code>{item.code}</code><span>{item.title}</span><time>{formatDayShortMonth(item.doneAt!)}</time></div>;
}

function OpenItem({ item, today }: { item: Checkpoint; today: string }) {
  const date = item.date;
  const late = Boolean(date) && date! < today;
  return <div className="wk-item"><span className={"wk-tick" + (late ? " is-late" : "")} /><code>{item.code}</code><span>{item.title}</span><time className={late ? "is-late" : ""}>{date ? (late ? "был " : "") + formatDayShortMonth(date) : "без даты"}</time></div>;
}

function RegularBlock({ weekStart, week, onOpen, onToggle }: { weekStart: string; week: ReturnType<typeof regularWeek>; onOpen: (task: RegularTask, date: string) => void; onToggle: (task: RegularTask, date: string) => void }) {
  return (
    <>
      <div className="wk-summary">
        <span>Выполнено: <b>{week.doneCount} из {week.week.length}</b></span>
        <span>Не сделано в срок: <b>{week.missedCount}</b></span>
      </div>
      <section className="wk-col">
        <div className="wk-col-head"><h3>На этой неделе</h3><small>{formatWeekRange(weekStart)}</small></div>
        {week.week.length === 0 && <div className="wk-empty">На этой неделе регулярных задач нет</div>}
        {week.week.map((item) => <RegularRow key={item.task.id + item.date} item={item} onOpen={onOpen} onToggle={onToggle} />)}
      </section>
      <section className="wk-col">
        <div className="wk-col-head"><h3>План на следующую неделю</h3><small>{week.next.length} {plural(week.next.length, "задача", "задачи", "задач")}</small></div>
        {week.next.length === 0 && <div className="wk-empty">На следующую неделю регулярных задач нет</div>}
        {week.next.map((item) => <RegularRow key={item.task.id + item.date} item={item} onOpen={onOpen} onToggle={onToggle} />)}
      </section>
    </>
  );
}

function RegularRow({ item, onOpen, onToggle }: { item: RegularOccurrence; onOpen: (task: RegularTask, date: string) => void; onToggle: (task: RegularTask, date: string) => void }) {
  const done = Boolean(item.record?.actualDate);
  const later = item.status === "Не сделано";
  const showActual = done && (later || item.status === "С опозданием");
  return (
    <div className="wk-reg">
      <button type="button" className={"wk-tick wk-check" + (later ? " is-later" : done ? " is-done" : "")} aria-pressed={done} aria-label={done ? "Снять отметку" : "Отметить выполненной"} title={later ? "Сделано после этой недели" : undefined} onClick={() => onToggle(item.task, item.date)}>
        {done && <Check size={10} strokeWidth={3.4} />}
      </button>
      <button type="button" className="wk-reg-title" onClick={() => onOpen(item.task, item.date)}>
        {item.parent && <span className="code-chip">{item.parent.title}</span>}<b>{item.task.title}</b>
        {item.task.assignee && <small>{item.task.assignee}</small>}
      </button>
      <time>{formatDayShortMonth(item.date)}{showActual && <small>сделано {formatDayShortMonth(item.record!.actualDate)}</small>}</time>
      <em className={item.status === "Не сделано" ? "regular-status regular-status-overdue" : regularStatusClass(item.status)}>{item.status}</em>
    </div>
  );
}
