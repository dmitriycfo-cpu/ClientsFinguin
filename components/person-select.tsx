"use client";

import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export function normalizePerson(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export type PersonPickerProps = {
  people: string[];
  onAddPerson: (person: string) => void;
  onDeletePerson: (person: string) => void;
};

export default function PersonSelect({
  value,
  onChange,
  people,
  onAddPerson,
  onDeletePerson,
}: PersonPickerProps & { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizePerson(query);
  const filteredPeople = people.filter((person) => !normalizedQuery || person.toLocaleLowerCase("ru").includes(normalizedQuery.toLocaleLowerCase("ru")));
  const hasExactMatch = people.some((person) => person.toLocaleLowerCase("ru") === normalizedQuery.toLocaleLowerCase("ru"));

  function choose(person: string) {
    const normalized = normalizePerson(person);
    if (!normalized) return;
    onChange(normalized);
    onAddPerson(normalized);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="person-picker" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input
        value={value}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && normalizePerson(value)) {
            event.preventDefault();
            choose(value);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Выберите или введите имя"
        autoComplete="off"
      />
      <ChevronDown className="person-picker-chevron" size={15} />
      {open && (
        <div className="person-dropdown">
          {normalizedQuery && !hasExactMatch && (
            <button type="button" className="person-add-option" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(normalizedQuery)}>
              <Plus size={14} />Добавить «{normalizedQuery}»
            </button>
          )}
          {filteredPeople.map((person) => (
            <div className="person-option" key={person}>
              <button type="button" className="person-option-select" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(person)}>
                <span>{person}</span>{person === value && <Check size={14} />}
              </button>
              <button type="button" className="person-option-delete" title="Удалить из справочника" aria-label={"Удалить " + person + " из справочника"} onMouseDown={(event) => event.preventDefault()} onClick={() => onDeletePerson(person)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {filteredPeople.length === 0 && !normalizedQuery && <div className="person-empty">Справочник пока пуст</div>}
        </div>
      )}
    </div>
  );
}
