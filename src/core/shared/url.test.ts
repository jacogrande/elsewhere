import { describe, expect, test } from "bun:test";
import { normalizeFeedUrl, resolveUrl } from "./url";

describe("normalizeFeedUrl", () => {
  test("adds https when the scheme is missing", () => {
    expect(normalizeFeedUrl("example.com/feed")).toEqual({ ok: true, value: "https://example.com/feed" });
  });

  test("trims whitespace, lowercases the host, drops default port and fragment", () => {
    expect(normalizeFeedUrl("  HTTP://Example.COM:80/Feed.xml#top ")).toEqual({
      ok: true,
      value: "http://example.com/Feed.xml",
    });
  });

  test("keeps query strings, which some feeds need", () => {
    expect(normalizeFeedUrl("https://example.com/?feed=rss2")).toEqual({
      ok: true,
      value: "https://example.com/?feed=rss2",
    });
  });

  test("rejects empty input", () => {
    expect(normalizeFeedUrl("   ")).toEqual({ ok: false, error: { type: "invalid_url" } });
  });

  test("rejects non-http schemes", () => {
    expect(normalizeFeedUrl("ftp://example.com/feed")).toEqual({ ok: false, error: { type: "invalid_url" } });
    expect(normalizeFeedUrl("javascript:alert(1)")).toEqual({ ok: false, error: { type: "invalid_url" } });
  });

  test("rejects strings that are not URLs", () => {
    expect(normalizeFeedUrl("not a url")).toEqual({ ok: false, error: { type: "invalid_url" } });
  });
});

describe("resolveUrl", () => {
  test("resolves relative paths against a base", () => {
    expect(resolveUrl("/a/b", "https://ex.com/blog/")).toBe("https://ex.com/a/b");
    expect(resolveUrl("post", "https://ex.com/blog/")).toBe("https://ex.com/blog/post");
  });

  test("returns absolute URLs unchanged", () => {
    expect(resolveUrl("https://other.com/x", "https://ex.com/")).toBe("https://other.com/x");
  });

  test("returns null for unusable input", () => {
    expect(resolveUrl("", "https://ex.com/")).toBeNull();
    expect(resolveUrl("javascript:alert(1)", "https://ex.com/")).toBeNull();
    expect(resolveUrl("/x", null)).toBeNull();
  });
});
