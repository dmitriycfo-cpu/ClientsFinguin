import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { normalizeControlData } from "./control";
import type { ControlData, ControlWeek } from "./control";
import { DatabaseNotConfiguredError, resolveDatabaseUrl } from "./store";

// Отметки руководителя лежат отдельно от дорожной карты: автосохранение финдира
// отправляет свои данные целиком и иначе затирало бы отметки старой копией.
const localControlPath = path.join(process.cwd(), "work", "control-data.json");

const isVercel = process.env.VERCEL === "1";

async function controlTable() {
  const source = resolveDatabaseUrl();
  if (!source) return null;

  const sql = neon(source.url);
  await sql`CREATE TABLE IF NOT EXISTS control_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO control_state (id, data)
    VALUES (1, '{"weeks":{}}'::jsonb)
    ON CONFLICT (id) DO NOTHING`;
  return sql;
}

async function readLocal(): Promise<ControlData> {
  try {
    return normalizeControlData(JSON.parse(await fs.readFile(localControlPath, "utf8")));
  } catch {
    return { weeks: {} };
  }
}

export async function getControlData(): Promise<ControlData> {
  const sql = await controlTable();
  if (sql) {
    const rows = await sql`SELECT data FROM control_state WHERE id = 1`;
    return normalizeControlData(rows[0]?.data);
  }
  if (isVercel) throw new DatabaseNotConfiguredError();
  return readLocal();
}

// Сохраняется одна неделя: правки разных недель с двух компьютеров не затирают друг друга.
export async function saveControlWeek(weekStart: string, week: ControlWeek): Promise<void> {
  const sql = await controlTable();
  if (sql) {
    await sql`UPDATE control_state
      SET data = jsonb_set(data, ARRAY['weeks', ${weekStart}::text], ${JSON.stringify(week)}::jsonb, true),
          updated_at = NOW()
      WHERE id = 1`;
    return;
  }
  if (isVercel) throw new DatabaseNotConfiguredError();

  const data = await readLocal();
  data.weeks[weekStart] = week;
  await fs.mkdir(path.dirname(localControlPath), { recursive: true });
  const temporaryPath = localControlPath + ".tmp";
  await fs.writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporaryPath, localControlPath);
}
