import { loadMigrations, MIGRATIONS_DIR, migrate, openDatabase } from "../adapters/sqlite/db";
import index from "../web/index.html";
import { loadConfig } from "./config";
import { buildDeps } from "./deps";
import { buildApi } from "./http/api";
import { startScheduler, startWorker } from "./jobs/worker";

const config = loadConfig(Bun.env);
if (!config.ok) {
  console.error(`Invalid configuration:\n${config.error}`);
  process.exit(1);
}
const { port, host, databasePath, dev } = config.value;

const db = openDatabase(databasePath);
const applied = migrate(db, loadMigrations(MIGRATIONS_DIR));

const deps = buildDeps(db);
const api = buildApi(deps);
if (applied.length) deps.logger.info("db.migrated", { applied });

process.on("unhandledRejection", (reason) => {
  deps.logger.error("unhandled_rejection", {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
});

const server = Bun.serve({
  hostname: host,
  port,
  routes: {
    "/api/*": (req) => api.fetch(req),
    "/*": index,
  },
  development: dev ? { hmr: true, console: true } : false,
});

const worker = startWorker(deps);
const scheduler = startScheduler(deps);

deps.logger.info("server.started", { url: server.url.toString(), database: databasePath });

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  deps.logger.info("server.stopping");
  scheduler.stop();
  await server.stop();
  await worker.stop();
  db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
