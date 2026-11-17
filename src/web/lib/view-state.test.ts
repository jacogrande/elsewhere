import { describe, expect, test } from "bun:test";
import { parseViewState, serializeViewState } from "./view-state";

describe("parseViewState", () => {
  test("defaults to unread across all feeds", () => {
    expect(parseViewState("")).toEqual({ feedId: null, filter: "unread", q: "", articleId: null });
  });

  test("reads every field", () => {
    expect(parseViewState("?feed=3&filter=starred&q=local+first&article=42")).toEqual({
      feedId: 3,
      filter: "starred",
      q: "local first",
      articleId: 42,
    });
  });

  test("ignores invalid values", () => {
    expect(parseViewState("?feed=abc&filter=weird&article=-1")).toEqual({
      feedId: null,
      filter: "unread",
      q: "",
      articleId: null,
    });
  });
});

describe("serializeViewState", () => {
  test("omits defaults", () => {
    expect(serializeViewState({ feedId: null, filter: "unread", q: "", articleId: null })).toBe("");
  });

  test("round-trips", () => {
    const state = { feedId: 3, filter: "all" as const, q: "a&b", articleId: 9 };
    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });
});
