import { cookies } from "next/headers";
import { CONTROL_COOKIE, CONTROL_COOKIE_MAX_AGE, checkPassword, controlPassword, controlToken } from "@/lib/control-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (!checkPassword(payload.password)) {
    return Response.json({ error: "Неверный пароль" }, { status: 401 });
  }
  const store = await cookies();
  store.set(CONTROL_COOKIE, controlToken(controlPassword()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONTROL_COOKIE_MAX_AGE,
  });
  return Response.json({ ok: true });
}
