import { describe, expect, test } from "bun:test";
import { readingTime, relativeTime } from "./format";

const now = Date.UTC(2026, 10, 16, 12);

describe("relativeTime", () => {
  test("uses the largest sensible unit", () => {
    expect(relativeTime(now - 30_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2d");
  });

  test("shows a date for anything older than a month", () => {
    expect(relativeTime(Date.UTC(2025, 2, 4), now)).toBe("Mar 4, 2025");
  });

  test("treats future times as just now", () => {
    expect(relativeTime(now + 60_000, now)).toBe("just now");
  });
});

describe("readingTime", () => {
  test("rounds up to whole minutes at 230 wpm", () => {
    expect(readingTime(0)).toBe("");
    expect(readingTime(100)).toBe("1 min");
    expect(readingTime(1000)).toBe("5 min");
  });
});
