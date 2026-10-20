"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDayShortMonth } from "@/lib/dates";
import { closingDateError } from "@/lib/roadmap-pulse";
import type { MonthClosing } from "@/lib/roadmap-pulse";

const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Окно под плиткой «Закрытие месяца»: показывает расчёт по регулярным задачам и даёт
// отметить месяц закрытым вручную. Закрывается кликом мимо окна (кроме самой плитки — она
// переключает окно сама) и клавишей Escape.
export default function MonthClosingPopover({ monthKey, closing, manualDate, today, onSave, onClear, onOpenRegular, onClose }: {
  monthKey: string;
  closing: MonthClosing;
  manualDate?: string;
  today: string;
  onSave: (date: string) => void;
  onClear: () => void;
  onOpenRegular: () => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(manualDate || today);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointer(event: PointerEvent) {
      const target = event.target as Element;
      if (ref.current?.contains(target) || target.closest("[data-closing-tile]")) return;
      onClose();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const monthName = MONTHS_GENITIVE[Number(monthKey.slice(5, 7)) - 1];
  const done = closing.state === "ok" ? closing.total : closing.state === "none" ? 0 : closing.done;
  const total = closing.state === "none" ? 0 : closing.total;
  const tone = closing.state === "ok" ? "flag-teal" : closing.state === "late" ? "flag-red" : closing.state === "pending" ? "flag-amber" : "flag-grey";

  function save() {
    const problem = closingDateError(date, monthKey, today);
    if (problem) return setError(problem);
    onSave(date);
  }

  return (
    <div className="closing-pop" role="dialog" aria-label={"Закрытие " + monthName} ref={ref}>
      <div className="closing-pop-head"><b>Закрытие {monthName}</b><button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={16} /></button></div>
      <div className="closing-pop-row"><span>По регулярным задачам</span><span className={"flag " + tone}>{closing.state === "none" ? "не заведены" : "выполнено " + done + " из " + total}</span></div>
      {closing.state === "late" && <p className="closing-pop-muted">Просрочено: {closing.late.map((item) => item.title + " (срок " + formatDayShortMonth(item.plannedDate) + ")").join("; ")}</p>}
      {manualDate && <div className="closing-pop-manual"><Check size={14} />Закрыт вручную {formatDayShortMonth(manualDate)}</div>}
      <label className="field">{manualDate ? "Дата закрытия" : "Отметить закрытым вручную"}<input type="date" value={date} min={monthKey + "-01"} max={today} onChange={(event) => { setDate(event.target.value); setError(""); }} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="closing-pop-foot">
        {manualDate && <button type="button" className="secondary" onClick={onClear}>Снять отметку</button>}
        <button type="button" className="primary" onClick={save}>{manualDate ? "Сохранить дату" : "Отметить закрытым"}</button>
      </div>
      <button type="button" className="closing-pop-link" onClick={onOpenRegular}>Открыть регулярные задачи →</button>
    </div>
  );
}
