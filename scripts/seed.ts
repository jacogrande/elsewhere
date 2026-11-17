/**
 * Imports a few real feeds for development. They are polled by the running app,
 * spread a few seconds apart, the same way an OPML import from the UI works.
 */
import { join } from "node:path";
import { loadMigrations, MIGRATIONS_DIR, migrate, openDatabase } from "../src/adapters/sqlite/db";
import { createFeedRepo } from "../src/adapters/sqlite/feed-repo";
import { realSystem } from "../src/adapters/system/system";
import { importOpml } from "../src/app/feeds";
import { loadConfig } from "../src/server/config";

const config = loadConfig(Bun.env);
if (!config.ok) throw new Error(config.error);

const db = openDatabase(config.value.databasePath);
migrate(db, loadMigrations(MIGRATIONS_DIR));
const xml = await Bun.file(join(import.meta.dir, "seed.opml")).text();
const result = importOpml({ feeds: createFeedRepo(db), system: realSystem })(xml);
db.close();

if (!result.ok) throw new Error(result.error.type);
console.log(
  `Added ${result.value.added} feeds, skipped ${result.value.skipped}. Start the app with: bun run dev`,
);
