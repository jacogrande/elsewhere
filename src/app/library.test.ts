import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createArticleRepo } from "../adapters/sqlite/article-repo";
import { testDatabase } from "../adapters/sqlite/db";
import { createFeedRepo } from "../adapters/sqlite/feed-repo";
import { fakeSystem } from "../adapters/system/system";
import { planRefresh } from "../core/feeds/refresh";
import { getArticle, ingestFeedEntries, listArticles, markAllRead, updateArticle } from "./library";
import type { ArticleRepo } from "./ports";

let db: Database;
let articles: ArticleRepo;
let system: ReturnType<typeof fakeSystem>;
let feedId: number;

const DAY = 86_400_000;

/** Seeds one feed whose entries are published one day apart, newest last. */
function seed(titles: string[]) {
  const feeds = createFeedRepo(db);
  const items = titles
    .map(
      (t, i) =>
        `<item><guid>${t}</guid><title>${t}</title><pubDate>${new Date(system.now() - (titles.length - i) * DAY).toUTCString()}</pubDate><description>about ${t} things</description></item>`,
    )
    .join("");
  const body = `<rss version="2.0"><channel><title>Ex</title>${items}</channel></rss>`;
  const plan = planRefresh({
    state: { url: "https://ex.com/f", etag: null, lastModified: null, errorCount: 0, parseErrorCount: 0 },
    outcome: {
      kind: "ok",
      body,
      finalUrl: "https://ex.com/f",
      permanentRedirectTo: null,
      etag: null,
      lastModified: null,
      cacheControl: null,
      expires: null,
    },
    knownKeys: new Set(),
    recentEntryTimes: [],
    now: system.now(),
    jitter: 0,
  });
  feedId = feeds.create(
    { url: "https://ex.com/f", title: "Ex", siteUrl: null, now: system.now() },
    { plan },
    () => [],
  );
  ingestFeedEntries({ articles, system })(feedId);
}

beforeEach(() => {
  db = testDatabase();
  articles = createArticleRepo(db);
  system = fakeSystem();
});

describe("listArticles", () => {
  test("pages newest first with a cursor", () => {
    seed(["one", "two", "three", "four", "five"]);
    const list = listArticles({ articles });
    const first = list({ feedId: null, filter: "all", search: null, cursor: null, limit: 2 });
    if (!first.ok) throw new Error("expected ok");
    expect(first.value.items.map((a) => a.title)).toEqual(["five", "four"]);
    expect(first.value.nextCursor).not.toBeNull();

    const second = list({
      feedId: null,
      filter: "all",
      search: null,
      cursor: first.value.nextCursor,
      limit: 2,
    });
    if (!second.ok) throw new Error("expected ok");
    expect(second.value.items.map((a) => a.title)).toEqual(["three", "two"]);

    const third = list({
      feedId: null,
      filter: "all",
      search: null,
      cursor: second.value.nextCursor,
      limit: 2,
    });
    if (!third.ok) throw new Error("expected ok");
    expect(third.value.items.map((a) => a.title)).toEqual(["one"]);
    expect(third.value.nextCursor).toBeNull();
  });

  test("filters unread and starred, and searches full text", () => {
    seed(["alpha", "beta", "gamma"]);
    const [gamma, beta] = articles.list({
      feedId: null,
      filter: "all",
      ftsQuery: null,
      cursor: null,
      limit: 10,
    });
    updateArticle({ articles, system })(gamma?.id ?? 0, { read: true });
    updateArticle({ articles, system })(beta?.id ?? 0, { starred: true });

    const titles = (filter: "all" | "unread" | "starred", search: string | null = null) => {
      const r = listArticles({ articles })({ feedId, filter, search, cursor: null, limit: 10 });
      return r.ok ? r.value.items.map((a) => a.title) : r.error;
    };
    expect(titles("unread")).toEqual(["beta", "alpha"]);
    expect(titles("starred")).toEqual(["beta"]);
    expect(titles("all", "gam")).toEqual(["gamma"]);
    expect(titles("all", `"); DROP TABLE x; --`)).toEqual([]);
  });

  test("rejects bad cursors", () => {
    expect(
      listArticles({ articles })({ feedId: null, filter: "all", search: null, cursor: "!!", limit: 10 }),
    ).toEqual({
      ok: false,
      error: { type: "invalid_cursor" },
    });
  });
});

describe("article state", () => {
  test("read and starred are independent", () => {
    seed(["x"]);
    const id =
      articles.list({ feedId: null, filter: "all", ftsQuery: null, cursor: null, limit: 1 })[0]?.id ?? 0;
    updateArticle({ articles, system })(id, { read: true, starred: true });
    const result = getArticle({ articles })(id);
    expect(result.ok && { read: result.value.isRead, starred: result.value.starred }).toEqual({
      read: true,
      starred: true,
    });
    expect(updateArticle({ articles, system })(999, { read: true })).toEqual({
      ok: false,
      error: { type: "article_not_found" },
    });
  });

  test("mark all read only touches articles up to the given id", () => {
    seed(["a", "b", "c"]);
    const ids = articles
      .list({ feedId: null, filter: "all", ftsQuery: null, cursor: null, limit: 10 })
      .map((a) => a.id)
      .sort((x, y) => x - y);
    expect(markAllRead({ articles, system })({ feedId: null, upToId: ids[1] ?? 0 })).toBe(2);
    const unread = articles.list({ feedId: null, filter: "unread", ftsQuery: null, cursor: null, limit: 10 });
    expect(unread.map((a) => a.id)).toEqual(ids.slice(2));
  });
});
