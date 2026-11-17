import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor, toFtsQuery } from "./query";

describe("cursor", () => {
  test("round-trips", () => {
    const c = { sortAt: 1_763_000_000_000, id: 42 };
    expect(decodeCursor(encodeCursor(c))).toEqual({ ok: true, value: c });
  });

  test("rejects tampered or garbage cursors", () => {
    expect(decodeCursor("nope")).toEqual({ ok: false, error: { type: "invalid_cursor" } });
    expect(decodeCursor(btoa("1:x"))).toEqual({ ok: false, error: { type: "invalid_cursor" } });
    expect(decodeCursor("")).toEqual({ ok: false, error: { type: "invalid_cursor" } });
  });
});

describe("toFtsQuery", () => {
  test("quotes each word and prefix-matches the last", () => {
    expect(toFtsQuery("local first soft")).toBe(`"local" "first" "soft"*`);
  });

  test("neutralises FTS syntax characters", () => {
    expect(toFtsQuery(`foo" OR bar*`)).toBe(`"foo" "OR" "bar"*`);
    expect(toFtsQuery("NEAR(a b)")).toBe(`"NEAR" "a" "b"*`);
  });

  test("keeps non-Latin words", () => {
    expect(toFtsQuery("café 日本")).toBe(`"café" "日本"*`);
  });

  test("returns null when there is nothing to search", () => {
    expect(toFtsQuery("  ")).toBeNull();
    expect(toFtsQuery(`"*()`)).toBeNull();
  });
});
