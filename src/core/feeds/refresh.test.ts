import { describe, expect, test } from "bun:test";
import type { FetchOutcome } from "./fetch-outcome";
import { type FeedStateSnapshot, planRefresh } from "./refresh";
import { DAY, HOUR } from "./schedule";

const now = Date.UTC(2026, 10, 16, 12);

const state: FeedStateSnapshot = {
  url: "https://ex.com/feed.xml",
  etag: '"old"',
  lastModified: null,
  errorCount: 0,
  parseErrorCount: 0,
};

const rss = (items: string) =>
  `<rss version="2.0"><channel><title>Ex</title><link>https://ex.com/</link>${items}</channel></rss>`;

const okOutcome = (
  body: string,
  over: Partial<Extract<FetchOutcome, { kind: "ok" }>> = {},
): FetchOutcome => ({
  kind: "ok",
  body,
  finalUrl: "https://ex.com/feed.xml",
  permanentRedirectTo: null,
  etag: '"new"',
  lastModified: "Mon, 16 Nov 2026 10:00:00 GMT",
  cacheControl: null,
  expires: null,
  ...over,
});

const base = { state, knownKeys: new Set<string>(), recentEntryTimes: [], now, jitter: 0 };

describe("planRefresh", () => {
  test("returns only entries not seen before, stamped with first-seen time", () => {
    const body = rss(
      `<item><guid>a</guid><title>A</title></item><item><guid>b</guid><title>B</title></item>`,
    );
    const plan = planRefresh({ ...base, outcome: okOutcome(body), knownKeys: new Set(["guid:a"]) });
    expect(plan.newEntries.map((e) => e.key)).toEqual(["guid:b"]);
    expect(plan.newEntries[0]?.firstSeenAt).toBe(now);
    expect(plan.feedTitle).toBe("Ex");
    expect(plan.siteUrl).toBe("https://ex.com/");
  });

  test("on success, stores validators and resets errors", () => {
    const plan = planRefresh({
      ...base,
      state: { ...state, errorCount: 3, parseErrorCount: 2 },
      outcome: okOutcome(rss("")),
    });
    expect(plan.state).toMatchObject({
      etag: '"new"',
      lastModified: "Mon, 16 Nov 2026 10:00:00 GMT",
      health: "ok",
      errorCount: 0,
      parseErrorCount: 0,
      lastError: null,
      lastFetchedAt: now,
      nextCheckAt: now + DAY,
    });
  });

  test("schedules from recent entries plus the new ones", () => {
    const items = Array.from({ length: 7 }, (_, i) => `<item><guid>n${i}</guid></item>`).join("");
    const recent = Array.from({ length: 7 }, () => now - HOUR);
    const plan = planRefresh({ ...base, outcome: okOutcome(rss(items)), recentEntryTimes: recent });
    expect(plan.state.nextCheckAt).toBe(now + 12 * HOUR);
  });

  test("uses published dates of new entries for scheduling when available", () => {
    const old = new Date(now - 30 * DAY).toUTCString();
    const items = `<item><guid>x</guid><pubDate>${old}</pubDate></item>`;
    const plan = planRefresh({ ...base, outcome: okOutcome(rss(items)) });
    expect(plan.state.nextCheckAt).toBe(now + DAY);
  });

  test("updates the feed URL only on a permanent redirect", () => {
    const moved = planRefresh({
      ...base,
      outcome: okOutcome(rss(""), { permanentRedirectTo: "https://new.ex.com/feed" }),
    });
    expect(moved.state.url).toBe("https://new.ex.com/feed");
    const same = planRefresh({ ...base, outcome: okOutcome(rss("")) });
    expect(same.state.url).toBe("https://ex.com/feed.xml");
  });

  test("not modified keeps old validators unless new ones are sent", () => {
    const plan = planRefresh({
      ...base,
      outcome: {
        kind: "not_modified",
        etag: null,
        lastModified: null,
        cacheControl: "max-age=7200",
        expires: null,
      },
    });
    expect(plan.newEntries).toEqual([]);
    expect(plan.state.etag).toBe('"old"');
    expect(plan.state.health).toBe("ok");
    expect(plan.state.nextCheckAt).toBe(now + DAY);
  });

  test("a body that is not a feed counts as a parse error, pausing after three", () => {
    const first = planRefresh({ ...base, outcome: okOutcome("<html></html>") });
    expect(first.state).toMatchObject({ health: "failing", errorCount: 1, parseErrorCount: 1 });
    expect(first.state.nextCheckAt).toBe(now + HOUR);
    expect(first.state.lastError).toContain("not a feed");

    const third = planRefresh({
      ...base,
      state: { ...state, errorCount: 2, parseErrorCount: 2 },
      outcome: okOutcome("<html></html>"),
    });
    expect(third.state).toMatchObject({ health: "paused", parseErrorCount: 3, nextCheckAt: null });
  });

  test("410 Gone stops polling", () => {
    const plan = planRefresh({
      ...base,
      outcome: { kind: "http_error", status: 410, retryAfter: null, challenge: false },
    });
    expect(plan.state).toMatchObject({ health: "gone", nextCheckAt: null });
  });

  test("429 honours Retry-After", () => {
    const plan = planRefresh({
      ...base,
      outcome: { kind: "http_error", status: 429, retryAfter: "7200", challenge: false },
    });
    expect(plan.state).toMatchObject({ health: "failing", errorCount: 1, nextCheckAt: now + 2 * HOUR });
  });

  test("429 without Retry-After falls back to normal error backoff", () => {
    const plan = planRefresh({
      ...base,
      outcome: { kind: "http_error", status: 429, retryAfter: null, challenge: false },
    });
    expect(plan.state.nextCheckAt).toBe(now + HOUR);
  });

  test("network errors back off exponentially and keep validators", () => {
    const plan = planRefresh({
      ...base,
      state: { ...state, errorCount: 2 },
      outcome: { kind: "network_error", message: "ECONNREFUSED" },
    });
    expect(plan.state).toMatchObject({ health: "failing", errorCount: 3, etag: '"old"' });
    expect(plan.state.nextCheckAt).toBe(now + 4 * HOUR);
    expect(plan.state.lastError).toContain("ECONNREFUSED");
  });

  test("bot challenges get a specific message", () => {
    const plan = planRefresh({
      ...base,
      outcome: { kind: "http_error", status: 403, retryAfter: null, challenge: true },
    });
    expect(plan.state.lastError).toContain("bot challenge");
  });
});
