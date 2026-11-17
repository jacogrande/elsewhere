import { describe, expect, test } from "bun:test";
import { buildOpml, parseOpmlFeeds } from "./opml";

describe("parseOpmlFeeds", () => {
  test("flattens nested outlines and keeps only those with a feed URL", () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head><title>x</title></head><body>
      <outline text="Tech">
        <outline type="rss" text="A" title="Alpha" xmlUrl="https://a.com/feed" htmlUrl="https://a.com"/>
      </outline>
      <outline text="B" xmlUrl="https://b.com/rss"/>
      <outline text="Just a folder"/>
    </body></opml>`;
    expect(parseOpmlFeeds(xml)).toEqual({
      ok: true,
      value: [
        { url: "https://a.com/feed", title: "Alpha", siteUrl: "https://a.com" },
        { url: "https://b.com/rss", title: "B", siteUrl: null },
      ],
    });
  });

  test("rejects documents that are not OPML", () => {
    expect(parseOpmlFeeds("<html></html>")).toEqual({ ok: false, error: { type: "invalid_opml" } });
    expect(parseOpmlFeeds("")).toEqual({ ok: false, error: { type: "invalid_opml" } });
  });
});

describe("buildOpml", () => {
  test("round-trips through parseOpmlFeeds", () => {
    const feeds = [
      { url: "https://a.com/feed", title: "A & Co", siteUrl: "https://a.com" },
      { url: "https://b.com/rss", title: "B", siteUrl: null },
    ];
    const xml = buildOpml(feeds, Date.UTC(2026, 10, 16));
    expect(xml).toContain("<opml");
    expect(parseOpmlFeeds(xml)).toEqual({ ok: true, value: feeds });
  });
});
