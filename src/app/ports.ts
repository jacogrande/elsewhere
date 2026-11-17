import type { FetchOutcome } from "../core/feeds/fetch-outcome";
import type { OpmlFeed } from "../core/feeds/opml";
import type { FeedHealth, FeedStateSnapshot, RefreshPlan } from "../core/feeds/refresh";
import type { JobRequest } from "../core/jobs/types";
import type { EntryForArticle, NewArticle } from "../core/library/article";
import type { Cursor } from "../core/library/query";

/*
 * Ports: everything the use cases need from the outside world.
 *
 * Repositories are synchronous because SQLite is local and synchronous. A database failure is
 * not an expected outcome here (it means a bug or a broken disk), so repositories may throw and
 * the top-level handlers treat that as a bug. Network ports never throw: they return data.
 */

export interface System {
  now(): number;
  /** Uniform random number in [0, 1), for jitter. */
  random(): number;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

// Feeds ---------------------------------------------------------------------

export interface FeedFetcher {
  /** Never rejects; every failure is a FetchOutcome. */
  fetch(
    url: string,
    validators?: { etag: string | null; lastModified: string | null },
  ): Promise<FetchOutcome>;
}

export type FeedSummary = {
  id: number;
  url: string;
  title: string;
  siteUrl: string | null;
  health: FeedHealth;
  lastError: string | null;
  lastFetchedAt: number | null;
  nextCheckAt: number | null;
  unreadCount: number;
};

export type RefreshContext = {
  state: FeedStateSnapshot;
  knownKeys: Set<string>;
  recentEntryTimes: number[];
};

export interface FeedRepo {
  findIdByUrl(url: string): number | null;
  list(): FeedSummary[];
  listForExport(): OpmlFeed[];
  refreshContext(feedId: number, recentSince: number): RefreshContext | null;
  /** Creates a feed with its state, any entries from an initial fetch, and jobs, atomically. */
  create(
    feed: { url: string; title: string; siteUrl: string | null; now: number },
    initial: { plan: RefreshPlan } | { nextCheckAt: number },
    /** Jobs to enqueue in the same transaction, given the new feed's id. */
    jobs: (feedId: number) => JobRequest[],
  ): number;
  /** Stores the outcome of a refresh and enqueues jobs, atomically. False if the feed no longer exists. */
  applyRefresh(feedId: number, plan: RefreshPlan, jobs: JobRequest[]): boolean;
  remove(feedId: number): boolean;
  /** Enqueues a poll job for every feed that is due. Returns how many were enqueued. */
  enqueueDuePolls(now: number): number;
}

// Library -------------------------------------------------------------------

export type ArticleFilter = "all" | "unread" | "starred";

export type ArticleListQuery = {
  feedId: number | null;
  filter: ArticleFilter;
  ftsQuery: string | null;
  cursor: Cursor | null;
  limit: number;
};

export type ArticleListItem = {
  id: number;
  feedId: number;
  feedTitle: string;
  url: string | null;
  title: string;
  author: string | null;
  excerpt: string;
  publishedAt: number | null;
  sortAt: number;
  isRead: boolean;
  starred: boolean;
  wordCount: number;
};

export type ArticleDetail = ArticleListItem & { html: string; siteUrl: string | null };

export interface ArticleRepo {
  /** Entries of a feed that have no article yet (read-only view of the feeds context). */
  pendingEntries(feedId: number, limit: number): EntryForArticle[];
  insertMany(articles: NewArticle[], now: number): number;
  list(query: ArticleListQuery): ArticleListItem[];
  get(id: number): ArticleDetail | null;
  /** Highest article id right now; the upper bound for "mark all read". */
  maxId(): number;
  setRead(id: number, read: boolean, now: number): boolean;
  setStarred(id: number, starred: boolean, now: number): boolean;
  /** Marks unread articles read, but only those with id ≤ upToId, so new arrivals stay unread. */
  markAllRead(scope: { feedId: number | null; upToId: number }, now: number): number;
}

// Jobs ------------------------------------------------------------------------

export interface JobQueue {
  enqueue(job: JobRequest, now: number): void;
}
