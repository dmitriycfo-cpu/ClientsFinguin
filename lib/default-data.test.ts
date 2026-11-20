import { describe, expect, it } from "vitest";
import { DEFAULT_DATA, initialData } from "./default-data";

describe("initialData", () => {
  it("подставляет название клиента", () => {
    expect(initialData("Ромашка").clientName).toBe("Ромашка");
  });

  it("без названия оставляет заглушку", () => {
    expect(initialData(undefined).clientName).toBe(DEFAULT_DATA.clientName);
    expect(initialData("   ").clientName).toBe(DEFAULT_DATA.clientName);
  });

  it("обрезает до 160 символов и не меняет DEFAULT_DATA", () => {
    expect(initialData("я".repeat(200)).clientName).toHaveLength(160);
    initialData("Ромашка").tasks.pop();
    expect(DEFAULT_DATA.clientName).toBe("Название клиента");
    expect(initialData(undefined).tasks).toHaveLength(DEFAULT_DATA.tasks.length);
  });
});
