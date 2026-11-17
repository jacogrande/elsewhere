import { fallbackFeedUrls, findFeedLinks, looksLikeHtml } from "../core/feeds/discover";
import { describeFetchFailure, type FetchOutcome } from "../core/feeds/fetch-outcome";
import { buildOpml, type InvalidOpml, parseOpmlFeeds } from "../core/feeds/opml";
import { parseFeedDocument } from "../core/feeds/parse";
import { type FeedHealth, planRefresh } from "../core/feeds/refresh";
import { WEEK } from "../core/feeds/schedule";
import { ingestJob } from "../core/jobs/types";
import { err, ok, type Result } from "../core/shared/result";
import { type InvalidUrl, normalizeFeedUrl } from "../core/shared/url";
import type { FeedFetcher, FeedRepo, System } from "./ports";

type Deps = { feeds: FeedRepo; fetcher: FeedFetcher; system: System };

export type SubscribeError =
  | InvalidUrl
  | { type: "already_subscribed"; feedId: number }
  | { type: "no_feed_found" }
  | { type: "fetch_failed"; detail: string };

const MAX_CANDIDATES = 6;

/**
 * Subscribes to a feed URL, or to the feed advertised by a web page.
 * The response that proves a URL is a feed is also its first refresh, so we never fetch it twice.
 */
export const subscribe =
  (deps: Deps) =>
  async (input: string): Promise<Result<{ feedId: number }, SubscribeError>> => {
    const normalized = normalizeFeedUrl(input);
    if (!normalized.ok) return normalized;
    const url = normalized.value;

    const existing = deps.feeds.findIdByUrl(url);
    if (existing !== null) return err({ type: "already_subscribed", feedId: existing });

    const first = await deps.fetcher.fetch(url);
    if (first.kind !== "ok") return err({ type: "fetch_failed", detail: describe(first) });

    if (parseFeedDocument(first.body, first.finalUrl).ok) return ok({ feedId: create(deps, url, first) });
    if (!looksLikeHtml(first.body)) return err({ type: "no_feed_found" });

    const advertised = findFeedLinks(first.body, first.finalUrl);
    const candidates = (advertised.length ? advertised : fallbackFeedUrls(first.finalUrl)).slice(
      0,
      MAX_CANDIDATES,
    );

    for (const candidate of candidates) {
      const known = deps.feeds.findIdByUrl(candidate);
      if (known !== null) return err({ type: "already_subscribed", feedId: known });
      const outcome = await deps.fetcher.fetch(candidate);
      if (outcome.kind === "ok" && parseFeedDocument(outcome.body, outcome.finalUrl).ok) {
        return ok({ feedId: create(deps, candidate, outcome) });
      }
    }
    return err({ type: "no_feed_found" });
  };

function create(deps: Deps, url: string, outcome: Extract<FetchOutcome, { kind: "ok" }>): number {
  const now = deps.system.now();
  const plan = planRefresh({
    state: { url, etag: null, lastModified: null, errorCount: 0, parseErrorCount: 0 },
    outcome,
    knownKeys: new Set(),
    recentEntryTimes: [],
    now,
    jitter: deps.system.random(),
  });
  const feedUrl = plan.state.url;
  return deps.feeds.create(
    { url: feedUrl, title: plan.feedTitle ?? new URL(feedUrl).hostname, siteUrl: plan.siteUrl, now },
    { plan },
    (feedId) => (plan.newEntries.length ? [ingestJob(feedId)] : []),
  );
}

const describe = (outcome: Exclude<FetchOutcome, { kind: "ok" }>) =>
  outcome.kind === "not_modified" ? "Unexpected 304 Not Modified" : describeFetchFailure(outcome);

export type FeedNotFound = { type: "feed_not_found" };

/** Fetches a feed and stores whatever it means: new entries, new validators, health and next poll time. */
export const refreshFeed =
  (deps: Deps) =>
  async (feedId: number): Promise<Result<{ newEntries: number; health: FeedHealth }, FeedNotFound>> => {
    const context = deps.feeds.refreshContext(feedId, deps.system.now() - WEEK);
    if (!context) return err({ type: "feed_not_found" });

    const outcome = await deps.fetcher.fetch(context.state.url, {
      etag: context.state.etag,
      lastModified: context.state.lastModified,
    });

    const plan = planRefresh({
      ...context,
      outcome,
      now: deps.system.now(),
      jitter: deps.system.random(),
    });
    const stored = deps.feeds.applyRefresh(feedId, plan, plan.newEntries.length ? [ingestJob(feedId)] : []);
    if (!stored) return err({ type: "feed_not_found" });
    return ok({ newEntries: plan.newEntries.length, health: plan.state.health });
  };

/** Seconds between first polls of imported feeds, so an import never becomes a burst of requests. */
const IMPORT_SPACING_MS = 5_000;

/** Adds every new feed in an OPML document. Feeds are not fetched now; their first polls are spread out. */
export const importOpml =
  (deps: Pick<Deps, "feeds" | "system">) =>
  (xml: string): Result<{ added: number; skipped: number }, InvalidOpml> => {
    const parsed = parseOpmlFeeds(xml);
    if (!parsed.ok) return parsed;

    const now = deps.system.now();
    let added = 0;
    let skipped = 0;
    for (const feed of parsed.value) {
      const url = normalizeFeedUrl(feed.url);
      if (!url.ok || deps.feeds.findIdByUrl(url.value) !== null) {
        skipped++;
        continue;
      }
      deps.feeds.create(
        { url: url.value, title: feed.title, siteUrl: feed.siteUrl, now },
        { nextCheckAt: now + added * IMPORT_SPACING_MS },
        () => [],
      );
      added++;
    }
    return ok({ added, skipped });
  };

export const exportOpml = (deps: Pick<Deps, "feeds" | "system">) => (): string =>
  buildOpml(deps.feeds.listForExport(), deps.system.now());
