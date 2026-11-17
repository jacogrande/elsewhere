import { articleFromEntry } from "../core/library/article";
import { decodeCursor, encodeCursor, type InvalidCursor, toFtsQuery } from "../core/library/query";
import { err, ok, type Result } from "../core/shared/result";
import type { ArticleDetail, ArticleFilter, ArticleListItem, ArticleRepo, System } from "./ports";

type Deps = { articles: ArticleRepo; system: System };

const BATCH = 200;

/** Turns a feed's new entries into sanitized, searchable articles. Idempotent. */
export const ingestFeedEntries =
  (deps: Deps) =>
  (feedId: number): number => {
    let total = 0;
    for (;;) {
      const entries = deps.articles.pendingEntries(feedId, BATCH);
      if (entries.length === 0) break;
      total += deps.articles.insertMany(entries.map(articleFromEntry), deps.system.now());
      if (entries.length < BATCH) break;
    }
    return total;
  };

export type ListArticlesInput = {
  feedId: number | null;
  filter: ArticleFilter;
  search: string | null;
  cursor: string | null;
  limit: number;
};

/** `maxId` is the highest article id when the page was read; pass it to markAllRead so new arrivals stay unread. */
export type ArticlePage = { items: ArticleListItem[]; nextCursor: string | null; maxId: number };

export const listArticles =
  (deps: Pick<Deps, "articles">) =>
  (input: ListArticlesInput): Result<ArticlePage, InvalidCursor> => {
    let cursor = null;
    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded.ok) return decoded;
      cursor = decoded.value;
    }
    const ftsQuery = input.search ? toFtsQuery(input.search) : null;
    const maxId = deps.articles.maxId();
    if (input.search && !ftsQuery) return ok({ items: [], nextCursor: null, maxId });

    // Fetch one extra row to know whether there is a next page.
    const rows = deps.articles.list({
      feedId: input.feedId,
      filter: input.filter,
      ftsQuery,
      cursor,
      limit: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return ok({ items, nextCursor: rows.length > input.limit && last ? encodeCursor(last) : null, maxId });
  };

export type ArticleNotFound = { type: "article_not_found" };

export const getArticle =
  (deps: Pick<Deps, "articles">) =>
  (id: number): Result<ArticleDetail, ArticleNotFound> => {
    const article = deps.articles.get(id);
    return article ? ok(article) : err({ type: "article_not_found" });
  };

export const updateArticle =
  (deps: Deps) =>
  (id: number, change: { read?: boolean; starred?: boolean }): Result<ArticleDetail, ArticleNotFound> => {
    const now = deps.system.now();
    if (change.read !== undefined && !deps.articles.setRead(id, change.read, now)) {
      return err({ type: "article_not_found" });
    }
    if (change.starred !== undefined && !deps.articles.setStarred(id, change.starred, now)) {
      return err({ type: "article_not_found" });
    }
    return getArticle(deps)(id);
  };

export const markAllRead =
  (deps: Deps) =>
  (scope: { feedId: number | null; upToId: number }): number =>
    deps.articles.markAllRead(scope, deps.system.now());
