"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import ModalShell from "@/components/modal-shell";
import PersonSelect from "@/components/person-select";
import type { PersonPickerProps } from "@/components/person-select";
import { formatDayMonth, isValidDateValue, nextMonday, parseDate, startOfWeek, weekdayName } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { countCheckpoints, expandTemplate, scheduleTemplate } from "@/lib/typical-tasks";
import type { TypicalTaskTemplate } from "@/lib/typical-tasks";
import type { Task } from "@/lib/types";

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
