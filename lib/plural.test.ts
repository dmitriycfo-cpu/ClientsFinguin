import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  const sprints = (count: number) => plural(count, "спринт", "спринта", "спринтов");

  it("выбирает форму по правилам русского счёта", () => {
    expect(sprints(1)).toBe("спринт");
    expect(sprints(2)).toBe("спринта");
    expect(sprints(5)).toBe("спринтов");
    expect(sprints(11)).toBe("спринтов");
    expect(sprints(21)).toBe("спринт");
    expect(sprints(22)).toBe("спринта");
    expect(sprints(25)).toBe("спринтов");
  });

  it("считает ноль и подростковые числа многими", () => {
    expect(sprints(0)).toBe("спринтов");
    expect(sprints(12)).toBe("спринтов");
    expect(sprints(14)).toBe("спринтов");
    expect(sprints(112)).toBe("спринтов");
  });
});
