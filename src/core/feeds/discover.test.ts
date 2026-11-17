import { describe, expect, test } from "bun:test";
import { fallbackFeedUrls, findFeedLinks, looksLikeHtml } from "./discover";

describe("findFeedLinks", () => {
  test("finds RSS, Atom and JSON feed links and resolves them", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/s.css">
      <link rel="alternate" type="application/rss+xml" href="/rss.xml" title="RSS">
      <link rel="alternate" type="application/atom+xml" href="https://ex.com/atom.xml">
      <link rel="alternate" type="application/feed+json" href="feed.json">
      <link rel="alternate" type="text/html" hreflang="fr" href="/fr/">
    </head></html>`;
    expect(findFeedLinks(html, "https://ex.com/blog/")).toEqual([
      "https://ex.com/rss.xml",
      "https://ex.com/atom.xml",
      "https://ex.com/blog/feed.json",
    ]);
  });

  test("handles rel with several tokens and odd casing", () => {
    const html = `<LINK REL="Alternate Feed" TYPE="Application/RSS+XML" HREF="/f">`;
    expect(findFeedLinks(html, "https://ex.com/")).toEqual(["https://ex.com/f"]);
  });

  test("deduplicates", () => {
    const html = `<link rel="alternate" type="application/rss+xml" href="/f"><link rel="alternate" type="application/rss+xml" href="https://ex.com/f">`;
    expect(findFeedLinks(html, "https://ex.com/")).toEqual(["https://ex.com/f"]);
  });

  test("returns nothing for pages without feeds", () => {
    expect(findFeedLinks("<html><body>hi</body></html>", "https://ex.com/")).toEqual([]);
  });
});

describe("fallbackFeedUrls", () => {
  test("lists common feed paths at the site root", () => {
    const urls = fallbackFeedUrls("https://ex.com/some/page");
    expect(urls[0]).toBe("https://ex.com/feed");
    expect(urls).toContain("https://ex.com/rss.xml");
    expect(urls).toContain("https://ex.com/atom.xml");
    expect(urls.every((u) => u.startsWith("https://ex.com/"))).toBe(true);
  });
});

describe("looksLikeHtml", () => {
  test("detects HTML documents", () => {
    expect(looksLikeHtml("  <!DOCTYPE html><html>")).toBe(true);
    expect(looksLikeHtml("<html lang=en>")).toBe(true);
    expect(looksLikeHtml(`<?xml version="1.0"?><rss>`)).toBe(false);
  });
});
