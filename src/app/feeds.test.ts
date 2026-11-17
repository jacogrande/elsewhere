import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createArticleRepo } from "../adapters/sqlite/article-repo";
import { testDatabase } from "../adapters/sqlite/db";
import { createFeedRepo } from "../adapters/sqlite/feed-repo";
import { fakeSystem } from "../adapters/system/system";
import type { FetchOutcome } from "../core/feeds/fetch-outcome";
import { DAY } from "../core/feeds/schedule";
import { exportOpml, importOpml, refreshFeed, subscribe } from "./feeds";
import { ingestFeedEntries } from "./library";
import type { FeedFetcher } from "./ports";

const rss = (title: string, items: string[]) =>
  `<rss version="2.0"><channel><title>${title}</title><link>https://ex.com/</link>${items
    .map((g) => `<item><guid>${g}</guid><title>Post ${g}</title><description>Body ${g}</description></item>`)
    .join("")}</channel></rss>`;

const ok = (body: string, finalUrl: string, extra: Partial<FetchOutcome> = {}): FetchOutcome =>
  ({
    kind: "ok",
    body,
    finalUrl,
    permanentRedirectTo: null,
    etag: null,
    lastModified: null,
    cacheControl: null,
    expires: null,
    ...extra,
  }) as FetchOutcome;

/** A fetcher that serves canned outcomes and records what was requested. */
function fakeFetcher(routes: Record<string, FetchOutcome>) {
  const calls: { url: string; etag: string | null }[] = [];
  const fetcher: FeedFetcher = {
    async fetch(url, validators) {
      calls.push({ url, etag: validators?.etag ?? null });
      return routes[url] ?? { kind: "http_error", status: 404, retryAfter: null, challenge: false };
    },
  };
  return { fetcher, calls, routes };
}

let db: Database;
let system: ReturnType<typeof fakeSystem>;
const jobs = () =>
  db.query<{ kind: string; payload: string }, []>("SELECT kind, payload FROM jobs ORDER BY id").all();

beforeEach(() => {
  db = testDatabase();
  system = fakeSystem();
});

describe("subscribe", () => {
  test("subscribes to a feed URL with a single fetch, storing entries and queueing ingestion", async () => {
    const { fetcher, calls } = fakeFetcher({
      "https://ex.com/feed.xml": ok(rss("Ex", ["a", "b"]), "https://ex.com/feed.xml"),
    });
    const feeds = createFeedRepo(db);
    const result = await subscribe({ feeds, fetcher, system })("ex.com/feed.xml");

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const [feed] = feeds.list();
    expect(feed).toMatchObject({
      title: "Ex",
      url: "https://ex.com/feed.xml",
      health: "ok",
      siteUrl: "https://ex.com/",
    });
    expect(feed?.nextCheckAt).toBeGreaterThan(system.now());
    expect(db.query("SELECT count(*) AS n FROM feeds_entry").get()).toEqual({ n: 2 });
    expect(jobs().map((j) => j.kind)).toEqual(["library.ingest"]);
  });

  test("finds the feed advertised by an HTML page", async () => {
    const page = `<!doctype html><html><head><link rel="alternate" type="application/rss+xml" href="/rss"></head></html>`;
    const { fetcher } = fakeFetcher({
      "https://ex.com/": ok(page, "https://ex.com/"),
      "https://ex.com/rss": ok(rss("Ex", ["a"]), "https://ex.com/rss"),
    });
    const feeds = createFeedRepo(db);
    expect((await subscribe({ feeds, fetcher, system })("https://ex.com")).ok).toBe(true);
    expect(feeds.list()[0]?.url).toBe("https://ex.com/rss");
  });

  test("probes common paths when the page advertises no feed", async () => {
    const { fetcher } = fakeFetcher({
      "https://ex.com/": ok("<html><body>no links</body></html>", "https://ex.com/"),
      "https://ex.com/atom.xml": ok(rss("Ex", ["a"]), "https://ex.com/atom.xml"),
    });
    const feeds = createFeedRepo(db);
    expect((await subscribe({ feeds, fetcher, system })("https://ex.com/")).ok).toBe(true);
    expect(feeds.list()[0]?.url).toBe("https://ex.com/atom.xml");
  });

  test("reports pages with no feed", async () => {
    const { fetcher } = fakeFetcher({ "https://ex.com/": ok("<html></html>", "https://ex.com/") });
    const result = await subscribe({ feeds: createFeedRepo(db), fetcher, system })("https://ex.com/");
    expect(result).toEqual({ ok: false, error: { type: "no_feed_found" } });
  });

  test("rejects duplicates and invalid URLs", async () => {
    const { fetcher } = fakeFetcher({
      "https://ex.com/feed.xml": ok(rss("Ex", []), "https://ex.com/feed.xml"),
    });
    const feeds = createFeedRepo(db);
    const first = await subscribe({ feeds, fetcher, system })("https://ex.com/feed.xml");
    if (!first.ok) throw new Error("expected ok");
    expect(await subscribe({ feeds, fetcher, system })("https://ex.com/feed.xml")).toEqual({
      ok: false,
      error: { type: "already_subscribed", feedId: first.value.feedId },
    });
    expect(await subscribe({ feeds, fetcher, system })("ftp://x")).toEqual({
      ok: false,
      error: { type: "invalid_url" },
    });
  });

  test("reports fetch failures with a readable message", async () => {
    const { fetcher } = fakeFetcher({});
    const result = await subscribe({ feeds: createFeedRepo(db), fetcher, system })("https://ex.com/feed.xml");
    expect(result).toEqual({ ok: false, error: { type: "fetch_failed", detail: "HTTP 404" } });
  });
});

describe("refreshFeed", () => {
  test("stores only new entries, sends validators, and queues ingestion", async () => {
    const url = "https://ex.com/feed.xml";
    const { fetcher, calls, routes } = fakeFetcher({ [url]: ok(rss("Ex", ["a"]), url, { etag: '"v1"' }) });
    const feeds = createFeedRepo(db);
    const sub = await subscribe({ feeds, fetcher, system })(url);
    if (!sub.ok) throw new Error("expected ok");
    db.run("DELETE FROM jobs");

    routes[url] = ok(rss("Ex", ["a", "b"]), url, { etag: '"v2"' });
    system.advance(DAY);
    const result = await refreshFeed({ feeds, fetcher, system })(sub.value.feedId);

    expect(result).toEqual({ ok: true, value: { newEntries: 1, health: "ok" } });
    expect(calls.at(-1)).toEqual({ url, etag: '"v1"' });
    expect(db.query("SELECT count(*) AS n FROM feeds_entry").get()).toEqual({ n: 2 });
    expect(jobs().map((j) => j.kind)).toEqual(["library.ingest"]);
  });

  test("records failures on the feed instead of failing", async () => {
    const url = "https://ex.com/feed.xml";
    const { fetcher, routes } = fakeFetcher({ [url]: ok(rss("Ex", []), url) });
    const feeds = createFeedRepo(db);
    const sub = await subscribe({ feeds, fetcher, system })(url);
    if (!sub.ok) throw new Error("expected ok");

    routes[url] = { kind: "network_error", message: "ECONNRESET" };
    expect(await refreshFeed({ feeds, fetcher, system })(sub.value.feedId)).toEqual({
      ok: true,
      value: { newEntries: 0, health: "failing" },
    });
    expect(feeds.list()[0]?.lastError).toBe("Network error: ECONNRESET");
  });

  test("returns feed_not_found for unknown feeds, and when the feed is deleted mid-fetch", async () => {
    const url = "https://ex.com/feed.xml";
    const feeds = createFeedRepo(db);
    const { fetcher } = fakeFetcher({ [url]: ok(rss("Ex", []), url) });
    expect(await refreshFeed({ feeds, fetcher, system })(999)).toEqual({
      ok: false,
      error: { type: "feed_not_found" },
    });

    const sub = await subscribe({ feeds, fetcher, system })(url);
    if (!sub.ok) throw new Error("expected ok");
    const deleting: FeedFetcher = {
      async fetch(u, v) {
        feeds.remove(sub.value.feedId);
        return fetcher.fetch(u, v);
      },
    };
    expect(await refreshFeed({ feeds, fetcher: deleting, system })(sub.value.feedId)).toEqual({
      ok: false,
      error: { type: "feed_not_found" },
    });
  });
});

describe("OPML", () => {
  const opml = `<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="A" xmlUrl="https://a.com/feed"/>
    <outline text="B" xmlUrl="https://b.com/feed"/>
    <outline text="A again" xmlUrl="https://a.com/feed"/>
    <outline text="Bad" xmlUrl="ftp://nope"/>
  </body></opml>`;

  test("imports new feeds without fetching, spreading their first polls", () => {
    const feeds = createFeedRepo(db);
    expect(importOpml({ feeds, system })(opml)).toEqual({ ok: true, value: { added: 2, skipped: 2 } });
    const list = feeds.list();
    expect(list.map((f) => f.title)).toEqual(["A", "B"]);
    const times = list.map((f) => f.nextCheckAt ?? 0);
    expect(times[1]).toBeGreaterThan(times[0] ?? 0);
    expect(jobs()).toEqual([]);
  });

  test("exports what was imported", () => {
    const feeds = createFeedRepo(db);
    importOpml({ feeds, system })(opml);
    const xml = exportOpml({ feeds, system })();
    expect(xml).toContain('xmlUrl="https://a.com/feed"');
    expect(xml).toContain('xmlUrl="https://b.com/feed"');
  });

  test("rejects invalid documents", () => {
    expect(importOpml({ feeds: createFeedRepo(db), system })("nope")).toEqual({
      ok: false,
      error: { type: "invalid_opml" },
    });
  });
});

describe("ingestFeedEntries", () => {
  test("creates one article per entry and is idempotent", async () => {
    const url = "https://ex.com/feed.xml";
    const { fetcher } = fakeFetcher({ [url]: ok(rss("Ex", ["a", "b", "c"]), url) });
    const feeds = createFeedRepo(db);
    const articles = createArticleRepo(db);
    const sub = await subscribe({ feeds, fetcher, system })(url);
    if (!sub.ok) throw new Error("expected ok");

    expect(ingestFeedEntries({ articles, system })(sub.value.feedId)).toBe(3);
    expect(ingestFeedEntries({ articles, system })(sub.value.feedId)).toBe(0);
    expect(feeds.list()[0]?.unreadCount).toBe(3);
  });
});
