/**
 * Builds the eval corpus with the app's own code: subscribe (one fetch per feed), then ingest.
 * Usage: bun eval/embeddings/build-corpus.ts <db path>
 */
import { join } from "node:path";
import { createHttpFetcher } from "../../src/adapters/http/feed-fetcher";
import { createArticleRepo } from "../../src/adapters/sqlite/article-repo";
import { loadMigrations, MIGRATIONS_DIR, migrate, openDatabase } from "../../src/adapters/sqlite/db";
import { createFeedRepo } from "../../src/adapters/sqlite/feed-repo";
import { realSystem } from "../../src/adapters/system/system";
import { subscribe } from "../../src/app/feeds";
import { ingestFeedEntries } from "../../src/app/library";
import { USER_AGENT } from "../../src/server/deps";

const dbPath = process.argv[2];
if (!dbPath) throw new Error("usage: build-corpus.ts <db path>");
const db = openDatabase(dbPath);
migrate(db, loadMigrations(MIGRATIONS_DIR));
const feeds = createFeedRepo(db);
const articles = createArticleRepo(db);
const fetcher = createHttpFetcher({ userAgent: USER_AGENT });

const urls = (await Bun.file(join(import.meta.dir, "feeds.txt")).text())
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

await Promise.all(
  urls.map(async (url) => {
    const result = await subscribe({ feeds, fetcher, system: realSystem })(url);
    if (result.ok) {
      const n = ingestFeedEntries({ articles, system: realSystem })(result.value.feedId);
      console.log(`ok   ${n.toString().padStart(3)}  ${url}`);
    } else {
      console.log(
        `fail ${result.error.type.padEnd(18)} ${url} ${"detail" in result.error ? result.error.detail : ""}`,
      );
    }
  }),
);
db.close();
