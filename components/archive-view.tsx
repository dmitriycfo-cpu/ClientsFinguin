"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import { archiveGroups } from "@/lib/archive";
import { formatDayMonth, formatDayShortMonth } from "@/lib/dates";
import type { Task } from "@/lib/types";

function TaskTitle({ task }: { task: Task }) {
  const code = task.template?.subCode || task.template?.code;
  return <>{code && <span className={"code-chip" + (task.parentId ? "" : " code-chip-parent")}>{code}</span>}<b>{task.title}</b></>;
}

function Actions({ task, onRestore, onDelete }: { task: Task; onRestore: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="arc-actions">
      <button type="button" className="secondary small" onClick={() => onRestore(task.id)}><ArchiveRestore size={14} />Вернуть</button>
      <button type="button" className="delete-button arc-delete" aria-label={"Удалить навсегда: " + task.title} title="Удалить навсегда" onClick={() => onDelete(task.id)}><Trash2 size={14} /></button>
    </div>
  );
}

export default function ArchiveView({ tasks, onOpenTask, onRestore, onDelete }: {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const groups = archiveGroups(tasks);
  if (groups.length === 0) {
    return <div className="arc"><div className="wk-empty">В архиве пусто. Надзадачу или спринт можно убрать сюда кнопкой «В архив» в их карточке.</div></div>;
  }
  return (
    <div className="arc">
      <p className="arc-hint">Архивные задачи не видны на диаграмме, в календаре и в индикаторах, но остаются в истории вкладки «Неделя». Вернуть можно в любой момент.</p>
      {groups.map((group) => (
        <section className="arc-group" key={group.parent?.id ?? "orphans"}>
          <div className={"arc-row arc-parent" + (group.archived ? "" : " arc-parent-live")}>
            {group.parent
              ? <button type="button" className="arc-title" onClick={() => onOpenTask(group.parent!)}><TaskTitle task={group.parent} />{!group.archived && <span className="flag flag-grey">надзадача в работе</span>}</button>
              : <span className="arc-title"><b>Спринты без надзадачи</b></span>}
            {group.parent && <span className="arc-meta">{formatDayMonth(group.parent.startDate)} — {formatDayMonth(group.parent.endDate)}{group.parent.assignee && " · " + group.parent.assignee}</span>}
            {group.archived && group.parent && <><time>в архиве с {formatDayShortMonth(group.archivedAt)}</time><Actions task={group.parent} onRestore={onRestore} onDelete={onDelete} /></>}
          </div>
          {group.sprints.map((sprint) => (
            <div className="arc-row arc-sprint" key={sprint.id}>
              <button type="button" className="arc-title" onClick={() => onOpenTask(sprint)}><TaskTitle task={sprint} /></button>
              <span className="arc-meta">{formatDayMonth(sprint.startDate)} — {formatDayMonth(sprint.endDate)} · {sprint.status}{sprint.assignee && " · " + sprint.assignee}</span>
              {group.archived
                ? sprint.archivedAt ? <time>в архиве отдельно с {formatDayShortMonth(sprint.archivedAt)}</time> : <span />
                : <><time>в архиве с {formatDayShortMonth(sprint.archivedAt!)}</time><Actions task={sprint} onRestore={onRestore} onDelete={onDelete} /></>}
              {group.archived && <span />}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
