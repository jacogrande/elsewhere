import { describe, expect, test } from "bun:test";
import { parseExpires, parseMaxAge, parseRetryAfter } from "./http-hints";

const now = Date.UTC(2026, 10, 16, 12, 0, 0);

describe("parseRetryAfter", () => {
  test("reads delay-seconds", () => {
    expect(parseRetryAfter("120", now)).toBe(120);
  });

  test("reads an HTTP date relative to now", () => {
    expect(parseRetryAfter("Mon, 16 Nov 2026 12:10:00 GMT", now)).toBe(600);
  });

  test("never returns a negative delay", () => {
    expect(parseRetryAfter("Mon, 16 Nov 2026 11:00:00 GMT", now)).toBe(0);
  });

  test("returns null for missing or invalid values", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
    expect(parseRetryAfter("-5", now)).toBeNull();
  });
});

describe("parseMaxAge", () => {
  test("reads max-age among other directives", () => {
    expect(parseMaxAge("public, max-age=3600, must-revalidate")).toBe(3600);
  });

  test("returns null when absent or malformed", () => {
    expect(parseMaxAge(null)).toBeNull();
    expect(parseMaxAge("no-cache")).toBeNull();
    expect(parseMaxAge("max-age=abc")).toBeNull();
  });
});

describe("parseExpires", () => {
  test("returns seconds until the date", () => {
    expect(parseExpires("Mon, 16 Nov 2026 13:00:00 GMT", now)).toBe(3600);
  });

  test("returns null for past, missing or invalid dates", () => {
    expect(parseExpires("Mon, 16 Nov 2026 11:00:00 GMT", now)).toBeNull();
    expect(parseExpires(null, now)).toBeNull();
    expect(parseExpires("0", now)).toBeNull();
  });
});
