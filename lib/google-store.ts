import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { DatabaseNotConfiguredError, resolveDatabaseUrl } from "./store";

// Хранит один OAuth-токен Google Календаря на клиента — так же, как store.ts
// хранит единственную строку данных дашборда: у ссылки нет пользователей,
// поэтому подключение общее для всех, кто открывает страницу.
export interface GoogleConnection {
  accessToken: string;
  refreshToken: string;
  expiry: number;
  email: string;
}

const isVercel = process.env.VERCEL === "1";
const localConnectionPath = path.join(process.cwd(), "work", "google-connection.json");

async function ensureGoogleTable() {
  const source = resolveDatabaseUrl();
  if (!source) return null;

  const sql = neon(source.url);
  await sql`CREATE TABLE IF NOT EXISTS google_calendar_connection (
    id INTEGER PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expiry BIGINT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  return sql;
}

export async function getGoogleConnection(): Promise<GoogleConnection | null> {
  const sql = await ensureGoogleTable();
  if (sql) {
    const rows = await sql`SELECT access_token, refresh_token, expiry, email FROM google_calendar_connection WHERE id = 1`;
    if (rows.length === 0) return null;
    const row = rows[0] as { access_token: string; refresh_token: string; expiry: string | number; email: string };
    return { accessToken: row.access_token, refreshToken: row.refresh_token, expiry: Number(row.expiry), email: row.email };
  }

  // Без базы данных на Vercel подключение всё равно нигде не сохранить — тихо считаем,
  // что Google не подключён, а не роняем всю страницу дашборда.
  if (isVercel) return null;

  try {
    return JSON.parse(await fs.readFile(localConnectionPath, "utf8")) as GoogleConnection;
  } catch {
    return null;
  }
}

export async function saveGoogleConnection(connection: GoogleConnection): Promise<void> {
  const sql = await ensureGoogleTable();
  if (sql) {
    await sql`INSERT INTO google_calendar_connection (id, access_token, refresh_token, expiry, email, updated_at)
      VALUES (1, ${connection.accessToken}, ${connection.refreshToken}, ${connection.expiry}, ${connection.email}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expiry = EXCLUDED.expiry,
        email = EXCLUDED.email,
        updated_at = NOW()`;
    return;
  }

  if (isVercel) throw new DatabaseNotConfiguredError();

  await fs.mkdir(path.dirname(localConnectionPath), { recursive: true });
  await fs.writeFile(localConnectionPath, JSON.stringify(connection, null, 2), "utf8");
}

export async function clearGoogleConnection(): Promise<void> {
  const sql = await ensureGoogleTable();
  if (sql) {
    await sql`DELETE FROM google_calendar_connection WHERE id = 1`;
    return;
  }

  if (isVercel) return;
  await fs.rm(localConnectionPath, { force: true });
}
