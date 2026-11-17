import { Database } from "bun:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Migration = { name: string; sql: string };

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA busy_timeout = 5000");
  return db;
}

export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/** Applies migrations that haven't run yet, each in its own transaction. Returns the names applied. */
export function migrate(db: Database, migrations: Migration[]): string[] {
  db.run("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const applied = new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM schema_migrations")
      .all()
      .map((r) => r.name),
  );
  const ran: string[] = [];
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    db.transaction(() => {
      db.run(m.sql);
      db.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($name, $at)").run({
        name: m.name,
        at: Date.now(),
      });
    })();
    ran.push(m.name);
  }
  return ran;
}

export const MIGRATIONS_DIR = join(import.meta.dir, "../../../migrations");

/** A fresh, migrated in-memory database. For tests. */
export function testDatabase(): Database {
  const db = openDatabase(":memory:");
  migrate(db, loadMigrations(MIGRATIONS_DIR));
  return db;
}
