import { createHmac, timingSafeEqual } from "node:crypto";

export const CONTROL_COOKIE = "finguin_control";
export const CONTROL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const DEFAULT_PASSWORD = "admin";

// Общий пароль вкладки «Руководителю». Без переменной окружения — admin.
export function controlPassword(env: Record<string, string | undefined> = process.env) {
  return env.CONTROL_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

// В cookie лежит не пароль, а его подпись: смена пароля сразу разлогинивает всех.
export function controlToken(password: string) {
  return createHmac("sha256", password).update("finguin-control-v1").digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function checkPassword(input: unknown, password = controlPassword()) {
  return typeof input === "string" && input.length > 0 && safeEqual(input, password);
}

export function isControlToken(value: string | undefined, password = controlPassword()) {
  return typeof value === "string" && safeEqual(value, controlToken(password));
}
