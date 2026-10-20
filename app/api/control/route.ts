import { cookies } from "next/headers";
import { isControlWeekKey, sanitizeControlWeek } from "@/lib/control";
import { CONTROL_COOKIE, isControlToken } from "@/lib/control-auth";
import { getControlData, saveControlWeek } from "@/lib/control-store";
import { DatabaseNotConfiguredError } from "@/lib/store";

export const dynamic = "force-dynamic";

async function isAuthorized() {
  const store = await cookies();
  return isControlToken(store.get(CONTROL_COOKIE)?.value);
}

function locked() {
  return Response.json({ error: "Нужен пароль" }, { status: 401 });
}

export async function GET() {
  if (!(await isAuthorized())) return locked();
  try {
    return Response.json({ data: await getControlData() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("Failed to load control data", error);
    return Response.json({ error: "Не удалось загрузить отметки" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!(await isAuthorized())) return locked();
  try {
    if (Number(request.headers.get("content-length") || 0) > 100_000) {
      return Response.json({ error: "Слишком большой объём данных" }, { status: 413 });
    }
    const payload = (await request.json().catch(() => ({}))) as { weekStart?: unknown; week?: unknown };
    const week = sanitizeControlWeek(payload.week);
    if (!isControlWeekKey(payload.weekStart) || !week) {
      return Response.json({ error: "Некорректный формат данных" }, { status: 400 });
    }
    await saveControlWeek(payload.weekStart, week);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("Failed to save control data", error);
    return Response.json({ error: "Не удалось сохранить отметки" }, { status: 500 });
  }
}
