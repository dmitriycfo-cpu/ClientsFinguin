import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_DATA, initialData } from "./default-data";
import { linkLegacyMeetingSeries } from "./meeting-series";
import type { Baselines, DashboardData, Task } from "./types";

const localDataPath = path.join(process.cwd(), "work", "dashboard-data.json");

const isVercel = process.env.VERCEL === "1";

// Vercel's Neon/Postgres integrations name variables differently depending on
// how the storage was connected (plain env var, Storage tab with a custom
// prefix, etc). Rather than requiring one exact name, prefer the well-known
// ones and otherwise scan all env vars for a usable Postgres URL.
const KNOWN_DATABASE_URL_NAMES = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_POSTGRES_URL"];
const PLACEHOLDER_URL_PATTERNS = [/example\.com/i, /user:pass/i, /:pass(word)?@/i];

function isUsablePostgresUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^postgres(ql)?:\/\//i.test(value)) return false;
  return !PLACEHOLDER_URL_PATTERNS.some((pattern) => pattern.test(value));
}

export type DatabaseUrlSource = { envName: string; url: string } | null;

export function resolveDatabaseUrl(): DatabaseUrlSource {
  for (const name of KNOWN_DATABASE_URL_NAMES) {
    const value = process.env[name];
    if (isUsablePostgresUrl(value)) return { envName: name, url: value };
  }

  const candidates = Object.entries(process.env).filter(
    (entry): entry is [string, string] => isUsablePostgresUrl(entry[1])
  );
  if (candidates.length === 0) return null;

  const pooled = candidates.find(([name, url]) => /pool/i.test(name) || /-pooler\./i.test(url));
  const [envName, url] = pooled ?? candidates[0];
  return { envName, url };
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "База данных не подключена: не найдена рабочая переменная окружения с адресом Postgres. " +
        "Подключите Neon в Vercel → Storage и сделайте redeploy."
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

// Сколько дневных снимков сроков храним. Снимок — это только пары дат по задачам,
// поэтому полгода истории занимают несколько десятков килобайт.
const BASELINE_HISTORY_LIMIT = 180;

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

function snapshotTaskDates(tasks: Task[]) {
  return Object.fromEntries(
    tasks.map((task) => [task.id, { startDate: task.startDate, endDate: task.endDate }])
  );
}

function normalizeBaselines(value: unknown): Baselines {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Baselines) : {};
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// Сколько снимков разрешено дописать одним сохранением: фиксация базового плана задним числом
// добавляет один, всё остальное — повод отбросить лишнее, а не раздувать историю.
const BASELINE_INCOMING_LIMIT = 10;

// Снимки, присланные клиентом (фиксация базового плана на выбранную дату). Берём только то,
// что похоже на срез сроков; стереть уже накопленную историю таким запросом нельзя.
function sanitizeIncomingBaselines(value: unknown): Baselines {
  const entries = Object.entries(normalizeBaselines(value))
    .filter(([key, snapshot]) => DATE_KEY.test(key) && snapshot && typeof snapshot === "object" && !Array.isArray(snapshot))
    .slice(0, BASELINE_INCOMING_LIMIT)
    .map(([key, snapshot]) => [
      key,
      Object.fromEntries(
        Object.entries(snapshot)
          .filter(([, dates]) => typeof dates?.startDate === "string" && typeof dates?.endDate === "string")
          .map(([taskId, dates]) => [taskId, { startDate: dates.startDate, endDate: dates.endDate }])
      ),
    ] as const)
    .filter(([, snapshot]) => Object.keys(snapshot).length > 0);
  return Object.fromEntries(entries);
}

// Базовый план на сегодня — это состояние сроков до текущей правки, поэтому снимок
// снимается один раз за сутки, при первом же сохранении.
function withDailyBaseline(previous: DashboardData, incoming: unknown): Baselines {
  const history: Baselines = { ...previous.baselines, ...sanitizeIncomingBaselines(incoming) };
  const key = todayKey();

  if (!history[key]) {
    // Дни, в которые сроки не двигали, снимков не создают: «ближайший снимок на дату или раньше»
    // всё равно вернёт последний, где план действительно отличался.
    const snapshot = snapshotTaskDates(previous.tasks);
    const historyKeys = Object.keys(history).sort();
    const latest = historyKeys.length > 0 ? history[historyKeys[historyKeys.length - 1]] : null;
    if (!latest || JSON.stringify(latest) !== JSON.stringify(snapshot)) history[key] = snapshot;
  }

  const keys = Object.keys(history).sort();
  for (const stale of keys.slice(0, Math.max(0, keys.length - BASELINE_HISTORY_LIMIT))) {
    delete history[stale];
  }
  return history;
}

function normalizePerson(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniquePeople(values: string[]) {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, item) => {
    const person = normalizePerson(item);
    const key = person.toLocaleLowerCase("ru");
    if (!person || seen.has(key)) return result;
    seen.add(key);
    result.push(person);
    return result;
  }, []);
}

function derivePeople(value: Partial<DashboardData>) {
  return uniquePeople([
    ...(value.tasks || []).map((task) => task.assignee),
    ...(value.ideas || []).map((idea) => idea.owner),
    ...(value.regularTasks || []).map((task) => task.assignee),
    ...(value.meetings || []).flatMap((meeting) => meeting.participants.split(",")),
  ]);
}

function normalizeDashboardData(value: Partial<DashboardData>): DashboardData {
  const baselines = normalizeBaselines(value.baselines);
  const tasks = Array.isArray(value.tasks) ? value.tasks : structuredClone(DEFAULT_DATA.tasks);
  return {
    ...structuredClone(DEFAULT_DATA),
    ...value,
    tasks,
    // Пока история пуста, отдаём снимок «на сегодня», равный текущему плану: диаграмма
    // тогда просто не показывает отклонений вместо пустого выпадающего списка.
    baselines: Object.keys(baselines).length > 0 ? baselines : { [todayKey()]: snapshotTaskDates(tasks) },
    ideas: Array.isArray(value.ideas) ? value.ideas : structuredClone(DEFAULT_DATA.ideas),
    meetings: Array.isArray(value.meetings)
      ? linkLegacyMeetingSeries(value.meetings.map((meeting) => ({ ...meeting, duration: meeting.duration || "" })))
      : structuredClone(DEFAULT_DATA.meetings),
    regularTasks: Array.isArray(value.regularTasks) ? value.regularTasks : structuredClone(DEFAULT_DATA.regularTasks),
    reports: Array.isArray(value.reports) ? value.reports : structuredClone(DEFAULT_DATA.reports),
    people: Array.isArray(value.people) ? uniquePeople(value.people) : derivePeople(value)
  };
}

async function ensureTable() {
  const source = resolveDatabaseUrl();
  if (!source) return null;

  const sql = neon(source.url);
  await sql`CREATE TABLE IF NOT EXISTS dashboard_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}

export async function getDashboardData(): Promise<DashboardData> {
  const sql = await ensureTable();
  if (sql) {
    const seed = JSON.stringify(initialData());
    await sql`INSERT INTO dashboard_state (id, data)
      VALUES (1, ${seed}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    const rows = await sql`SELECT data FROM dashboard_state WHERE id = 1`;
    return normalizeDashboardData(rows[0].data as Partial<DashboardData>);
  }

  if (isVercel) throw new DatabaseNotConfiguredError();

  try {
    return normalizeDashboardData(JSON.parse(await fs.readFile(localDataPath, "utf8")) as Partial<DashboardData>);
  } catch {
    const seed = initialData();
    await fs.mkdir(path.dirname(localDataPath), { recursive: true });
    await fs.writeFile(localDataPath, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

export async function saveDashboardData(data: DashboardData): Promise<void> {
  // Историю базовых планов ведёт сервер: клиент может дописать снимок на выбранную дату,
  // но не заменить накопленное. Сверх этого раз в сутки снимается автоматический снимок.
  const previous = await getDashboardData();
  const next: DashboardData = { ...data, baselines: withDailyBaseline(previous, data.baselines) };

  const sql = await ensureTable();
  if (sql) {
    const payload = JSON.stringify(next);
    await sql`INSERT INTO dashboard_state (id, data, updated_at)
      VALUES (1, ${payload}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
    return;
  }

  if (isVercel) throw new DatabaseNotConfiguredError();

  await fs.mkdir(path.dirname(localDataPath), { recursive: true });
  const temporaryPath = localDataPath + ".tmp";
  await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(temporaryPath, localDataPath);
}
