"use client";

import { Info, LoaderCircle, MessageSquare } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTROL_ITEMS,
  CONTROL_MEETING_RULES,
  CONTROL_QUESTIONS,
  MAX_TEXT,
  badWeeks,
  controlWeeks,
  emptyWeek,
  nextMark,
  setMark,
  weekScore,
} from "@/lib/control";
import type { ControlData, ControlItem, ControlMark, ControlWeek } from "@/lib/control";
import { formatDayShortMonth } from "@/lib/dates";
import { formatWeekRange } from "@/lib/week-report";

type Phase = "loading" | "locked" | "ready" | "error";

const JSON_HEADERS = { "Content-Type": "application/json" };

// null — нужен пароль.
async function fetchControl(signal?: AbortSignal): Promise<ControlData | null> {
  const response = await fetch("/api/control", { cache: "no-store", signal });
  if (response.status === 401) return null;
  const payload = (await response.json().catch(() => ({}))) as { data?: ControlData };
  if (!response.ok || !payload.data) throw new Error("Не удалось загрузить отметки");
  return payload.data;
}

// Подсказка ⓘ: наведение или фокус показывают, нажатие закрепляет; Escape и клик мимо закрывают.
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const open = hover || pinned;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHover(false);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ctl-tip-wrap" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="ctl-info"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <Info size={14} />
      </button>
      {open && <div className="ctl-tip" role="tooltip">{children}</div>}
    </div>
  );
}

function ItemTip({ item }: { item: ControlItem }) {
  return (
    <>
      <p>Где смотреть: {item.where}</p>
      <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
      {item.extra && (
        <>
          <p className="ctl-tip-h">{item.extraTitle}</p>
          <ul>{item.extra.map((point) => <li key={point}>{point}</li>)}</ul>
        </>
      )}
    </>
  );
}

function markLabel(mark: ControlMark | undefined) {
  if (mark === "ok") return "в порядке";
  if (mark === "bad") return "есть проблема";
  return "не проверено";
}

export default function ControlBoard({ today }: { today: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<ControlData>({ weeks: {} });
  const [loginError, setLoginError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Неотправленные правки по неделям, неделя с запросом «в пути» и признак живого компонента.
  const dirty = useRef(new Map<string, ControlWeek>());
  const sending = useRef(new Set<string>());
  const alive = useRef(true);
  const panelRef = useRef<HTMLElement>(null);

  const weeks = useMemo(() => controlWeeks(today), [today]);
  const thisWeek = weeks[weeks.length - 1];
  const due = weeks[weeks.length - 2];
  const current = selected && weeks.includes(selected) ? selected : due;

  useEffect(() => {
    const controller = new AbortController();
    fetchControl(controller.signal)
      .then((loaded) => {
        if (!loaded) {
          setPhase("locked");
          return;
        }
        setData(loaded);
        setPhase("ready");
      })
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setPhase("error");
      });
    return () => controller.abort();
  }, []);

  // Одна неделя — один запрос за раз: правки, пришедшие во время отправки, уходят следом (только последние).
  const flush = useCallback(async (weekStart: string) => {
    if (sending.current.has(weekStart)) return;
    sending.current.add(weekStart);
    try {
      // Пока есть свежая правка без ожидающего таймера, отправляем её следом.
      while (dirty.current.has(weekStart) && (!timers.current.has(weekStart) || !alive.current)) {
        const week = dirty.current.get(weekStart);
        dirty.current.delete(weekStart);
        try {
          const response = await fetch("/api/control", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({ weekStart, week }),
            keepalive: !alive.current,
          });
          if (response.status === 401) {
            if (alive.current) setPhase("locked");
          } else if (!response.ok) {
            throw new Error();
          } else if (alive.current) {
            setSaveError("");
          }
        } catch {
          if (alive.current) setSaveError("Не удалось сохранить отметки. Проверьте подключение и повторите.");
        }
      }
    } finally {
      sending.current.delete(weekStart);
    }
  }, []);

  // При уходе со страницы отправляем неотправленные правки сразу, не дожидаясь паузы.
  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    const unsent = dirty.current;
    return () => {
      alive.current = false;
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
      [...unsent.keys()].forEach((weekStart) => void flush(weekStart));
    };
  }, [flush]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const response = await fetch("/api/control/login", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ password }) });
      if (response.status === 401) throw new Error("Неверный пароль");
      if (!response.ok) throw new Error("Не удалось войти");
      const loaded = await fetchControl();
      if (!loaded) throw new Error("Не удалось войти");
      setData(loaded);
      setPassword("");
      setPhase("ready");
    } catch (reason) {
      setLoginError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  function saveWeek(weekStart: string, week: ControlWeek) {
    const pending = timers.current;
    clearTimeout(pending.get(weekStart));
    dirty.current.set(weekStart, week);
    pending.set(weekStart, setTimeout(() => {
      pending.delete(weekStart);
      void flush(weekStart);
    }, 450));
  }

  function updateWeek(weekStart: string, change: (week: ControlWeek) => ControlWeek) {
    const next = change(data.weeks[weekStart] ?? emptyWeek());
    setData((state) => ({ weeks: { ...state.weeks, [weekStart]: next } }));
    saveWeek(weekStart, next);
  }

  if (phase === "loading") {
    return <div className="ctl-state"><LoaderCircle size={16} className="spin" />Загрузка</div>;
  }
  if (phase === "error") {
    return <div className="ctl-state ctl-error">Не удалось загрузить отметки</div>;
  }
  if (phase === "locked") {
    return (
      <form className="ctl-card ctl-lock" onSubmit={login}>
        <h2>Руководителю</h2>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Пароль"
          aria-label="Пароль"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy || !password}>Войти</button>
        {loginError && <p className="ctl-error">{loginError}</p>}
      </form>
    );
  }

  const week = data.weeks[current] ?? emptyWeek();
  const badItems = CONTROL_ITEMS.filter((item) => week.marks[item.id] === "bad");
  const colClass = (weekStart: string) => "ctl-col" + (weekStart === current ? " is-selected" : "");
  const weekTag = (weekStart: string) => weekStart === thisWeek ? "идёт" : weekStart === due ? "к проверке" : "";

  return (
    <div className="ctl">
      <section className="ctl-card">
        <div className="ctl-head">
          <h2>Чек-лист по неделям</h2>
          {saveError && <span className="ctl-error">{saveError}</span>}
        </div>
        <table className="ctl-grid">
          <thead>
            <tr>
              <th className="ctl-name" />
              {weeks.map((weekStart) => {
                const [day, month] = formatDayShortMonth(weekStart).split(" ");
                return (
                  <th key={weekStart} className={colClass(weekStart)}>
                    <button
                      type="button"
                      className={"ctl-week" + (weekStart === due ? " is-due" : "")}
                      title={formatWeekRange(weekStart)}
                      aria-pressed={weekStart === current}
                      onClick={() => setSelected(weekStart)}
                    >
                      <b>{day}</b>
                      <small>{weekTag(weekStart) || month}</small>
                    </button>
                  </th>
                );
              })}
              <th className="ctl-total">✗ за {weeks.length} нед.</th>
            </tr>
          </thead>
          <tbody>
            {CONTROL_ITEMS.map((item) => {
              const bad = badWeeks(data, item.id, weeks);
              return (
                <tr key={item.id}>
                  <th scope="row" className="ctl-name">
                    <span className="ctl-row-title">
                      {item.title}
                      <InfoTip label={"Что проверить: " + item.title}><ItemTip item={item} /></InfoTip>
                    </span>
                  </th>
                  {weeks.map((weekStart) => {
                    const mark = data.weeks[weekStart]?.marks[item.id];
                    const note = mark === "bad" ? data.weeks[weekStart]?.notes[item.id]?.trim() : "";
                    return (
                      <td key={weekStart} className={colClass(weekStart)}>
                        <button
                          type="button"
                          className={"ctl-cell" + (mark ? " is-" + mark : "") + (note ? " has-note" : "")}
                          title={note || undefined}
                          aria-label={item.title + ", " + formatWeekRange(weekStart) + ": " + markLabel(mark)}
                          onClick={() => {
                            setSelected(weekStart);
                            updateWeek(weekStart, (value) => setMark(value, item.id, nextMark(mark)));
                          }}
                        >
                          {mark === "ok" ? "✓" : mark === "bad" ? "✗" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="ctl-total">{bad ? <b>{bad}</b> : "—"}</td>
                </tr>
              );
            })}
            <tr className="ctl-sep">
              <th scope="row" className="ctl-name ctl-muted">Итог недели</th>
              {weeks.map((weekStart) => {
                const score = weekScore(data.weeks[weekStart]);
                const tone = !score.checked ? "" : score.bad ? " is-bad" : " is-ok";
                return (
                  <td key={weekStart} className={colClass(weekStart)}>
                    <span className={"ctl-score" + tone}>{score.checked ? score.ok + "/" + CONTROL_ITEMS.length : "—"}</span>
                  </td>
                );
              })}
              <td className="ctl-total" />
            </tr>
            <tr>
              <th scope="row" className="ctl-name ctl-muted">Комментарии</th>
              {weeks.map((weekStart) => {
                const filledCount = CONTROL_QUESTIONS.filter((question) => data.weeks[weekStart]?.answers[question.id]?.trim()).length;
                const filled = filledCount > 0;
                return (
                  <td key={weekStart} className={colClass(weekStart)}>
                    <button
                      type="button"
                      className={"ctl-comment" + (filled ? " is-filled" : "")}
                      aria-label={"Комментарии за " + formatWeekRange(weekStart) + (filledCount ? ", заполнено " + filledCount : "")}
                      onClick={() => {
                        setSelected(weekStart);
                        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                    >
                      <MessageSquare size={15} />
                    </button>
                  </td>
                );
              })}
              <td className="ctl-total" />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="ctl-card ctl-panel" ref={panelRef}>
        <div className="ctl-panel-head">
          <h2>Неделя {formatWeekRange(current)}</h2>
          <span>{weekTag(current) || (weeks.length - 1 - weeks.indexOf(current)) + " нед. назад"}</span>
        </div>
        <div className="ctl-cols">
          <div className="ctl-block">
            <div className="ctl-block-title">Что делаем по ✗</div>
            {badItems.length === 0 && <p className="ctl-empty">Пунктов с ✗ нет.</p>}
            {badItems.map((item) => (
              <label key={item.id} className="ctl-field">
                <span className="is-bad">✗ {item.title}</span>
                <textarea
                  rows={2}
                  maxLength={MAX_TEXT}
                  value={week.notes[item.id] ?? ""}
                  placeholder="Что не так и что делаем"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateWeek(current, (state) => ({ ...state, notes: { ...state.notes, [item.id]: value } }));
                  }}
                />
              </label>
            ))}
          </div>
          <div className="ctl-block">
            <div className="ctl-block-title">
              Вопросы к финдиру
              <InfoTip label="Как проводить встречу">
                <ul>{CONTROL_MEETING_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
              </InfoTip>
            </div>
            {CONTROL_QUESTIONS.map((question) => (
              <label key={question.id} className="ctl-field">
                <span>{question.label}</span>
                <textarea
                  rows={2}
                  maxLength={MAX_TEXT}
                  value={week.answers[question.id] ?? ""}
                  placeholder="Если карта не отвечает — запишите ответ"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateWeek(current, (state) => ({ ...state, answers: { ...state.answers, [question.id]: value } }));
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
