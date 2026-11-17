import { describeFetchFailure, type FetchOutcome } from "./fetch-outcome";
import { parseExpires, parseMaxAge, parseRetryAfter } from "./http-hints";
import { assignEntryKeys, type KeyedItem } from "./identity";
import { parseFeedDocument } from "./parse";
import { errorBackoff, nextPollDelay } from "./schedule";

export type FeedHealth = "ok" | "failing" | "paused" | "gone";

/** The parts of a feed's stored state that a refresh decision needs. */
export type FeedStateSnapshot = {
  url: string;
  etag: string | null;
  lastModified: string | null;
  errorCount: number;
  parseErrorCount: number;
};

export type NewEntry = KeyedItem & { firstSeenAt: number };

export type RefreshPlan = {
  state: FeedStateSnapshot & {
    health: FeedHealth;
    lastError: string | null;
    lastFetchedAt: number;
    /** null means: don't poll automatically any more. */
    nextCheckAt: number | null;
  };
  newEntries: NewEntry[];
  /** Feed metadata from the document, when it parsed. */
  feedTitle: string | null;
  siteUrl: string | null;
};

export type RefreshInput = {
  state: FeedStateSnapshot;
  outcome: FetchOutcome;
  /** Identity keys of entries already stored for this feed. */
  knownKeys: ReadonlySet<string>;
  /** Times (published, else first-seen) of entries stored in the last week, for scheduling. */
  recentEntryTimes: readonly number[];
  now: number;
  /** Random number in [0, 1) supplied by the shell. */
  jitter: number;
};

/** Pauses automatic polling after this many consecutive unparseable responses. */
export const MAX_PARSE_ERRORS = 3;
/** Minimum wait after 429/503 without Retry-After (FreshRSS uses 1500s). */
const RATE_LIMIT_FLOOR_SECONDS = 1500;

/** Decides everything that follows from one fetch of a feed. Pure. */
export function planRefresh(input: RefreshInput): RefreshPlan {
  const { state, outcome, now, jitter } = input;
  const failed = (
    message: string,
    extra: Partial<RefreshPlan["state"]> & { retryAfterSeconds?: number | null } = {},
  ) => {
    const errorCount = state.errorCount + 1;
    const { retryAfterSeconds = null, ...rest } = extra;
    return {
      state: {
        ...state,
        errorCount,
        health: "failing" as FeedHealth,
        lastError: message,
        lastFetchedAt: now,
        nextCheckAt: now + errorBackoff({ errorCount, retryAfterSeconds, jitter }),
        ...rest,
      },
      newEntries: [],
      feedTitle: null,
      siteUrl: null,
    };
  };

  switch (outcome.kind) {
    case "not_modified":
      return {
        state: {
          ...state,
          etag: outcome.etag ?? state.etag,
          lastModified: outcome.lastModified ?? state.lastModified,
          errorCount: 0,
          parseErrorCount: 0,
          health: "ok",
          lastError: null,
          lastFetchedAt: now,
          nextCheckAt:
            now +
            nextPollDelay({
              now,
              recentEntryTimes: input.recentEntryTimes,
              hintSeconds: [parseMaxAge(outcome.cacheControl), parseExpires(outcome.expires, now)],
              jitter,
            }),
        },
        newEntries: [],
        feedTitle: null,
        siteUrl: null,
      };

    case "ok": {
      const parsed = parseFeedDocument(outcome.body, outcome.finalUrl);
      if (!parsed.ok) {
        const parseErrorCount = state.parseErrorCount + 1;
        const message =
          parsed.error.type === "not_a_feed"
            ? "The response is not a feed"
            : `The feed could not be parsed: ${parsed.error.message}`;
        return failed(
          message,
          parseErrorCount >= MAX_PARSE_ERRORS
            ? { parseErrorCount, health: "paused", nextCheckAt: null }
            : { parseErrorCount },
        );
      }

      const newEntries = assignEntryKeys(parsed.value.items)
        .filter((item) => !input.knownKeys.has(item.key))
        .map((item) => ({ ...item, firstSeenAt: now }));
      const newTimes = newEntries.map((e) => e.publishedAt ?? e.firstSeenAt);
      const ttlSeconds = parsed.value.ttlMinutes === null ? null : parsed.value.ttlMinutes * 60;

      return {
        state: {
          url: outcome.permanentRedirectTo ?? state.url,
          etag: outcome.etag,
          lastModified: outcome.lastModified,
          errorCount: 0,
          parseErrorCount: 0,
          health: "ok",
          lastError: null,
          lastFetchedAt: now,
          nextCheckAt:
            now +
            nextPollDelay({
              now,
              recentEntryTimes: [...input.recentEntryTimes, ...newTimes],
              hintSeconds: [
                ttlSeconds,
                parseMaxAge(outcome.cacheControl),
                parseExpires(outcome.expires, now),
              ],
              jitter,
            }),
        },
        newEntries,
        feedTitle: parsed.value.title,
        siteUrl: parsed.value.siteUrl,
      };
    }

    case "http_error": {
      if (outcome.status === 410) {
        return failed("The feed is gone (HTTP 410)", { health: "gone", nextCheckAt: null });
      }
      const retryAfterSeconds = parseRetryAfter(outcome.retryAfter, now);
      const plan = failed(describeFetchFailure(outcome), { retryAfterSeconds });
      const rateLimited = outcome.status === 429 || outcome.status === 503;
      if (rateLimited && retryAfterSeconds === null && plan.state.nextCheckAt !== null) {
        plan.state.nextCheckAt = Math.max(plan.state.nextCheckAt, now + RATE_LIMIT_FLOOR_SECONDS * 1000);
      }
      return plan;
    }

    default:
      return failed(describeFetchFailure(outcome));
  }
}
