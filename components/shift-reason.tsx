"use client";

import { ChevronDown } from "lucide-react";
import { isWaitingClient } from "@/lib/checkpoint-tracking";
import { differenceInDays, formatDayShortMonth } from "@/lib/dates";
import { plural } from "@/lib/plural";
import { SHIFT_REASONS, shiftReasonInfo } from "@/lib/task-shifts";
import type { Checkpoint, ShiftReason, Task } from "@/lib/types";

type ShiftDraft = { reason: ShiftReason | ""; holdCode: string; note: string };

export function ShiftReasonFields({ from, to, reason, holdCode, note, openCheckpoints, onChange }: ShiftDraft & {
  from: string;
  to: string;
  openCheckpoints: Checkpoint[];
  onChange: (patch: Partial<ShiftDraft>) => void;
}) {
  const days = differenceInDays(from, to);
  return (
    <div className="shift-reason">
      <div className="shift-reason-title">Почему переносим срок?<span>{formatDayShortMonth(from)} → {formatDayShortMonth(to)} · +{days} {plural(days, "день", "дня", "дней")}</span></div>
      <div className="shift-chips" role="radiogroup" aria-label="Причина переноса">
        {SHIFT_REASONS.map((item) => (
          <button type="button" role="radio" aria-checked={reason === item.value} key={item.value} className={reason === item.value ? "is-on" : ""} onClick={() => {
            // Для «клиент не дал данные» подставляем точку, по которой уже ждём клиента.
            const waiting = item.value === "client" && !holdCode ? openCheckpoints.find(isWaitingClient) : undefined;
            onChange(waiting ? { reason: item.value, holdCode: waiting.code } : { reason: item.value });
          }}>{item.label}</button>
        ))}
      </div>
      <label className="field">Какой пункт держит<select value={holdCode} onChange={(event) => onChange({ holdCode: event.target.value })}><option value="">Не выбран</option>{openCheckpoints.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.title}</option>)}</select><ChevronDown size={15} /></label>
      <label className="field">Комментарий{reason === "other" ? " (обязательно)" : ""}<textarea rows={2} value={note} onChange={(event) => onChange({ note: event.target.value })} placeholder="Что именно случилось и что делаем дальше" /></label>
    </div>
  );
}

export function ShiftHistory({ task }: { task: Task }) {
  const shifts = task.shifts ?? [];
  if (shifts.length === 0) return null;
  const points = (task.groups ?? []).flatMap((group) => group.items);
  return (
    <div className="shift-history">
      <div className="shift-history-head"><span>История переносов</span><span>{shifts.length} {plural(shifts.length, "перенос", "переноса", "переносов")} · исходный срок {formatDayShortMonth(shifts[0].from)}</span></div>
      {[...shifts].reverse().map((shift, index) => {
        const hold = points.find((item) => item.code === shift.holdCode);
        const info = shiftReasonInfo(shift.reason);
        return (
          <div className="shift-history-row" key={shift.date + "-" + index}>
            <time>{formatDayShortMonth(shift.date)}</time>
            <div>
              <div className="shift-dates"><s>{formatDayShortMonth(shift.from)}</s> → <b>{formatDayShortMonth(shift.to)}</b><span className={"flag flag-" + info.tone}>{info.label}</span></div>
              {hold && <p>Держит: <b>{hold.code}</b> {hold.title}</p>}
              {shift.note && <p>{shift.note}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
