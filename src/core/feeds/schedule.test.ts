import { describe, expect, test } from "bun:test";
import { DAY, errorBackoff, HOUR, nextPollDelay, WEEK } from "./schedule";

const now = Date.UTC(2026, 10, 16);

describe("nextPollDelay", () => {
  test("waits the maximum when nothing was posted in the last week", () => {
    expect(nextPollDelay({ now, recentEntryTimes: [], hintSeconds: [], jitter: 0 })).toBe(DAY);
  });

  test("spreads polls across the week based on posting frequency", () => {
    const times = Array.from({ length: 14 }, (_, i) => now - i * HOUR);
    expect(nextPollDelay({ now, recentEntryTimes: times, hintSeconds: [], jitter: 0 })).toBe(WEEK / 14);
  });

  test("never polls more often than hourly", () => {
    const times = Array.from({ length: 500 }, () => now - HOUR);
    expect(nextPollDelay({ now, recentEntryTimes: times, hintSeconds: [], jitter: 0 })).toBe(HOUR);
  });

  test("ignores entries older than a week", () => {
    expect(nextPollDelay({ now, recentEntryTimes: [now - WEEK - 1], hintSeconds: [], jitter: 0 })).toBe(DAY);
  });

  test("respects a longer server hint, but not beyond a day", () => {
    const busy = Array.from({ length: 500 }, () => now - HOUR);
    expect(nextPollDelay({ now, recentEntryTimes: busy, hintSeconds: [3 * 3600], jitter: 0 })).toBe(3 * HOUR);
    expect(nextPollDelay({ now, recentEntryTimes: busy, hintSeconds: [9 * 86400], jitter: 0 })).toBe(DAY);
  });

  test("ignores null hints", () => {
    const busy = Array.from({ length: 500 }, () => now - HOUR);
    expect(nextPollDelay({ now, recentEntryTimes: busy, hintSeconds: [null], jitter: 0 })).toBe(HOUR);
  });

  test("adds up to 10% jitter", () => {
    expect(nextPollDelay({ now, recentEntryTimes: [], hintSeconds: [], jitter: 0.5 })).toBe(DAY * 1.05);
  });
});

describe("errorBackoff", () => {
  test("doubles from one hour per consecutive error", () => {
    expect(errorBackoff({ errorCount: 1, retryAfterSeconds: null, jitter: 0 })).toBe(HOUR);
    expect(errorBackoff({ errorCount: 2, retryAfterSeconds: null, jitter: 0 })).toBe(2 * HOUR);
    expect(errorBackoff({ errorCount: 4, retryAfterSeconds: null, jitter: 0 })).toBe(8 * HOUR);
  });

  test("caps at one day", () => {
    expect(errorBackoff({ errorCount: 20, retryAfterSeconds: null, jitter: 0 })).toBe(DAY);
  });

  test("uses Retry-After when given, clamped between one minute and two days", () => {
    expect(errorBackoff({ errorCount: 1, retryAfterSeconds: 7200, jitter: 0 })).toBe(2 * HOUR);
    expect(errorBackoff({ errorCount: 1, retryAfterSeconds: 1, jitter: 0 })).toBe(60_000);
    expect(errorBackoff({ errorCount: 1, retryAfterSeconds: 9e9, jitter: 0 })).toBe(2 * DAY);
  });
});
