import { beforeEach, describe, expect, test } from "bun:test";
import { testDatabase } from "../../adapters/sqlite/db";
import { fakeSystem, silentLogger } from "../../adapters/system/system";
import type { FeedFetcher } from "../../app/ports";
import { buildDeps, type Deps } from "../deps";
import { buildApi } from "./api";

const FEED = `<rss version="2.0"><channel><title>Ex</title><link>https://ex.com/</link>
  <item><guid>1</guid><title>Hello</title><description>&lt;p&gt;World&lt;/p&gt;</description></item>
</channel></rss>`;

const fetcher: FeedFetcher = {
  async fetch(url) {
    if (url !== "https://ex.com/feed")
      return { kind: "http_error", status: 404, retryAfter: null, challenge: false };
    return {
      kind: "ok",
      body: FEED,
      finalUrl: url,
      permanentRedirectTo: null,
      etag: null,
      lastModified: null,
      cacheControl: null,
      expires: null,
    };
  },
};

let deps: Deps;
let app: ReturnType<typeof buildApi>;
const json = (body: unknown) => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  deps = buildDeps(testDatabase(), { fetcher, system: fakeSystem(), logger: silentLogger });
  app = buildApi(deps);
});

describe("API", () => {
  test("subscribe → ingest → list → read", async () => {
    const created = await app.request("/api/feeds", {
      method: "POST",
      ...json({ url: "https://ex.com/feed" }),
    });
    expect(created.status).toBe(201);
    const { feedId } = (await created.json()) as { feedId: number };

    // Run the ingest job the subscription queued.
    const [job] = deps.jobs.claim(deps.system.now(), 10, 1000);
    expect(job?.kind).toBe("library.ingest");
    const { ingestFeedEntries } = await import("../../app/library");
    ingestFeedEntries(deps)(feedId);

    const list = await app.request(`/api/articles?filter=unread&feedId=${feedId}`);
    const page = (await list.json()) as { items: { id: number; title: string }[] };
    expect(page.items.map((a) => a.title)).toEqual(["Hello"]);

    const id = page.items[0]?.id;
    const read = await app.request(`/api/articles/${id}`, { method: "PATCH", ...json({ read: true }) });
    expect(((await read.json()) as { isRead: boolean }).isRead).toBe(true);

    const feeds = (await (await app.request("/api/feeds")).json()) as { feeds: { unreadCount: number }[] };
    expect(feeds.feeds[0]?.unreadCount).toBe(0);
  });

  test("answers domain errors with problem JSON", async () => {
    const res = await app.request("/api/feeds", {
      method: "POST",
      ...json({ url: "https://nope.com/feed" }),
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toEqual({
      type: "fetch_failed",
      title: "Couldn't fetch that address",
      status: 502,
      detail: "HTTP 404",
    });
  });

  test("answers invalid input with 400", async () => {
    const res = await app.request("/api/feeds", { method: "POST", ...json({ nope: 1 }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { type: string }).type).toBe("invalid_request");
    expect((await app.request("/api/articles?filter=weird")).status).toBe(400);
    expect((await app.request("/api/articles/abc")).status).toBe(400);
  });

  test("404s unknown things", async () => {
    expect((await app.request("/api/articles/42")).status).toBe(404);
    expect((await app.request("/api/feeds/42", { method: "DELETE" })).status).toBe(404);
    expect((await app.request("/api/nope")).status).toBe(404);
  });

  test("OPML import and export", async () => {
    const opml = `<?xml version="1.0"?><opml version="2.0"><body><outline text="A" xmlUrl="https://a.com/f"/></body></opml>`;
    const imported = await app.request("/api/opml", { method: "POST", body: opml });
    expect(await imported.json()).toEqual({ added: 1, skipped: 0 });
    const exported = await app.request("/api/opml");
    expect(exported.headers.get("content-disposition")).toContain("elsewhere.opml");
    expect(await exported.text()).toContain('xmlUrl="https://a.com/f"');
  });
});
