"use client";

import { GripVertical } from "lucide-react";
import { useState } from "react";
import type { DragEvent } from "react";
import type { DropPlace } from "@/lib/reorder";

// Перетаскивание строк за ручку. Тянется сама ручка, а картинкой служит вся строка —
// так клик по строке продолжает открывать карточку. Куда упадёт строка, решает
// половина строки под курсором: верхняя — перед ней, нижняя — после.
export function useDragSort(canDrop: (dragId: string, targetId: string) => boolean, onDrop: (dragId: string, targetId: string, place: DropPlace) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; place: DropPlace } | null>(null);

  function reset() {
    setDragId(null);
    setTarget(null);
  }

  function handle(id: string) {
    return (
      <span
        className="drag-handle"
        draggable
        title="Зажмите и перетащите"
        aria-hidden="true"
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
          const row = event.currentTarget.closest("[data-sort-row]");
          if (row) {
            const rect = row.getBoundingClientRect();
            event.dataTransfer.setDragImage(row, event.clientX - rect.left, event.clientY - rect.top);
          }
          // Перерисовка прямо в dragstart в Chrome может оборвать перетаскивание.
          setTimeout(() => setDragId(id), 0);
        }}
        onDragEnd={reset}
      ><GripVertical size={14} /></span>
    );
  }

  function placeOf(event: DragEvent<HTMLElement>): DropPlace {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  }

  function rowProps(id: string) {
    return {
      "data-sort-row": "",
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!dragId) return;
        if (!canDrop(dragId, id)) {
          if (target) setTarget(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const place = placeOf(event);
        if (target?.id !== id || target.place !== place) setTarget({ id, place });
      },
      onDrop(event: DragEvent<HTMLElement>) {
        if (!dragId || !canDrop(dragId, id)) return;
        event.preventDefault();
        onDrop(dragId, id, placeOf(event));
        reset();
      },
    };
  }

  function rowClass(id: string) {
    if (dragId === id) return " is-dragging";
    if (target?.id === id) return " drop-" + target.place;
    return "";
  }

  return { handle, rowProps, rowClass };
}
