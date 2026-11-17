import type { Database } from "bun:sqlite";
import { createHttpFetcher } from "../adapters/http/feed-fetcher";
import { createArticleRepo } from "../adapters/sqlite/article-repo";
import { createFeedRepo } from "../adapters/sqlite/feed-repo";
import { createJobStore } from "../adapters/sqlite/jobs";
import { consoleLogger, realSystem } from "../adapters/system/system";
import type { FeedFetcher, Logger, System } from "../app/ports";

export const USER_AGENT = "Elsewhere/0.1.0 (personal RSS reader)";

/** Every adapter, built once. The composition root (main.ts) and tests are the only places that call this. */
export function buildDeps(
  db: Database,
  overrides: { fetcher?: FeedFetcher; system?: System; logger?: Logger } = {},
) {
  return {
    feeds: createFeedRepo(db),
    articles: createArticleRepo(db),
    jobs: createJobStore(db),
    fetcher: overrides.fetcher ?? createHttpFetcher({ userAgent: USER_AGENT }),
    system: overrides.system ?? realSystem,
    logger: overrides.logger ?? consoleLogger(),
  };
}

export type Deps = ReturnType<typeof buildDeps>;
