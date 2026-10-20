import { describe, expect, it } from "vitest";
import { checkPassword, controlPassword, controlToken, isControlToken } from "./control-auth";

describe("пароль вкладки «Руководителю»", () => {
  it("по умолчанию admin, переменная окружения его заменяет", () => {
    expect(controlPassword({})).toBe("admin");
    expect(controlPassword({ CONTROL_PASSWORD: "   " })).toBe("admin");
    expect(controlPassword({ CONTROL_PASSWORD: " secret " })).toBe("secret");
  });

  it("сверяет пароль точно", () => {
    expect(checkPassword("admin", "admin")).toBe(true);
    expect(checkPassword("Admin", "admin")).toBe(false);
    expect(checkPassword("", "admin")).toBe(false);
    expect(checkPassword(123, "admin")).toBe(false);
    expect(checkPassword(undefined, "admin")).toBe(false);
  });

  it("cookie входа перестаёт действовать после смены пароля", () => {
    const token = controlToken("admin");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(isControlToken(token, "admin")).toBe(true);
    expect(isControlToken(token, "secret")).toBe(false);
    expect(isControlToken("admin", "admin")).toBe(false);
    expect(isControlToken(undefined, "admin")).toBe(false);
  });
});
