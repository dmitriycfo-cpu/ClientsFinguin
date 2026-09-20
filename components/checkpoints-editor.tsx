"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
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
                  <button type="button" className="delete-button" onClick={() => { patchItem(item.code, null); setEditing(null); }}>Удалить</button>
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
