# Elsewhere phase 1 server stack (Bun + Hono + SQLite), verified November 2026

Versions below come from the npm registry and GitHub releases API, queried 2026-11-16 ([npm registry](https://registry.npmjs.org/), [Bun releases](https://github.com/oven-sh/bun/releases)).

| Package | npm `latest` | Prerelease | Last publish of latest | Notes |
|---|---|---|---|---|
| bun (runtime) | 1.4.4 | — | 2026-10-22 | 1.4.0 released 2026-08-20 |
| @types/bun | 1.4.4 | — | 2026-10-23 | |
| hono | 4.13.19 | 5.0.0-rc.1 (`next`) | 2026-11-16 | v5 RC since 2026-10-08 |
| @hono/zod-validator | 0.9.1 | — | 2026-08-31 | peer `zod ^3.25 \|\| ^4`, `hono >=4.11.2` |
| zod | 4.6.7 | — | 2026-10-12 | |
| drizzle-orm | 0.45.4 | 1.0.0-rc.5 (`rc`) | 2026-10-08 | 1.0 is not GA |
| drizzle-kit | 0.31.11 | 1.0.0 rc / beta | 2026-09-21 | |
| kysely | 0.29.9 | 0.30.0-beta.2 | 2026-11-12 | |
| @biomejs/biome | 2.6.8 | — | 2026-11-15 | v2 line |
| dependency-cruiser | 18.8.0 | — | 2026-11-16 | engines node `^22\|\|^24\|\|>=26` |
| typescript | 7.0.2 | 7.1.0-beta | 2026-07-08 | TS 7 (native) is `latest` |
| pino | 10.4.0 | — | 2026-10-02 | |
| @logtape/logtape | 2.4.2 | — | 2026-10-18 | zero deps |
| consola | 3.4.2 | — | 2025-03-18 | |
| croner | 11.0.1 | — | 2026-11-14 | zero deps |
| p-limit | 7.3.3 | — | 2026-09-18 | |
| p-queue | 10.0.0 | — | 2026-10-12 | |
| liteque | 0.10.0 | — | 2026-10-10 | peer better-sqlite3 |
| plainjob | 0.0.14 | — | 2024-10-13 | stale |
| bunqueue | 2.9.22 | — | 2026-11-13 | engines bun >=1.4.0 |
| sidequest | 1.17.0 | — | 2026-10-19 | engines node >=22.6 |
| better-auth | 1.7.25 | 1.8.0-beta.10 | 2026-11-14 | |
| lucia | 3.2.2 | — | 2024-10-20 | **deprecated on npm** |
| @t3-oss/env-core | 0.13.11 | — | 2026-03-22 | |
| msw | 3.0.6 | — | 2026-11-15 | |
| neverthrow | 8.2.0 | — | 2025-02-21 | no release in ~21 months |
| better-result | 3.0.1 | — | 2026-08-11 | |
| effect | 4.1.4 | — | 2026-11-11 | Effect 4 is GA |

## Bun runtime: version, stability, notable changes

### Takeaway
Bun 1.4.x (1.4.4, 2026-10-22) is current and stable; 1.4 adds things directly useful to Elsewhere (in-process `Bun.cron`, `bun test --parallel/--isolate`, fake timers, static `dir` routes) and has a short list of behavior changes, none of which block the planned architecture. Pin `bun >= 1.4` in `package.json` engines / Dockerfile.

### Cited Findings
- Latest releases: bun-v1.4.4 (2026-10-22), 1.4.3 (2026-10-10), 1.4.2 (2026-09-05), 1.4.0 (2026-08-20); previous line ended at 1.3.14 (2026-05-13) — [GitHub releases API](https://github.com/oven-sh/bun/releases)
- Bun 1.4 `bun test` adds `--parallel[=N]` (coverage and JUnit merged across workers), `--isolate` (fresh global per file), `--shard=M/N`, `--timings`, `--changed` (only tests affected by the diff; works with `--watch`), `{ retry: n }` / `{ repeats: n }`, and `jest.useFakeTimers()` controlling timers and `Date` with `jest.setSystemTime()` + `advanceTimersByTime()` — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- Bun 1.4 `Bun.serve` routes can serve a directory with `{ dir: "./public" }` (sendfile, ETag, 304, Range); HTTP server memory use falls 13–48% under load; request/response stream backpressure is automatic; HTTP/3 is experimental ("Don't ship `http3: true` to production yet") — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- Behavior changes in 1.4: HTML routes no longer serve sourcemaps in production unless `sourcemap` is set under `[serve.static]`; `trustedDependencies` auto-trusts only npm registry packages; `bun update` also updates transitive deps; `bun.lock` adds SHA-512 hashes for GitHub/tarball deps; `--bytecode` now works with ESM; `Bun.cron` uses local time by default (new `{ tz }`) — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- Windows: startup 15.5 ms vs 39.0 ms in 1.3; `Bun.cron` works on Windows; binaries up to 17% smaller — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- `fetch()` gains a `compress` option and experimental `protocol: "http2" | "http3"` — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)

### Inferences
- Bun 1.4 `--isolate` plus fake timers make the `Clock` port partly redundant for tests, but keep the port anyway: core purity requires `now` passed in, and fake timers are a shell-test convenience only.
- Windows is a reasonable secondary target for the compiled binary now, but Docker/Linux should remain primary.

### Gaps
- I only read the first ~100k characters of the 1.4 blog post; a full breaking-changes list for 1.4.1–1.4.4 was not reviewed.
- No independent stability survey (crash/regression rate) found; stability judgement rests on the regular patch cadence.

## HTTP: Hono on Bun (version, SPA + /api in one server, RPC, validation, errors, middleware)

### Takeaway
Use Hono 4.13.x now (not the 5.0 RC). Mount it in `Bun.serve({ routes: { "/api/*": api.fetch, "/*": index } })` as architecture.md sketches; this is the documented Bun fullstack pattern. Hono RPC is fine at Elsewhere's scale if each context is a chained sub-app and the SPA uses per-context clients or a precompiled `hcWithType` client. `@hono/zod-validator` 0.9.1 officially supports Zod 4.

### Cited Findings
- hono `latest` = 4.13.19 (published 2026-11-16); `next` = 5.0.0-rc.1 (2026-10-10), rc.0 on 2026-10-08 with empty GitHub release notes — [npm registry](https://registry.npmjs.org/hono), [GitHub releases](https://github.com/honojs/hono/releases)
- The official MIGRATION.md on `main` still tops out at v4.3→v4.4; no v5 migration guide was published there as of today — [honojs/hono MIGRATION.md](https://github.com/honojs/hono/blob/main/docs/MIGRATION.md)
- Aggregator report (not primary): v4 deprecates `hono/<adapter>` imports in favor of packages like `@hono/bun` and adds `hono/mount`, with old APIs removed in v5 — [Releasebot (third-party)](https://releasebot.io/updates/hono)
- Bun fullstack pattern: import an HTML file and assign it to a path in `routes`; HTML imports bundle the SPA; `development: true` enables HMR; ahead-of-time `bun build --target=bun` produces a manifest served without runtime bundling (Bun ≥1.2.17); `routes` needs Bun ≥1.2.3 — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- RPC performance: "When using RPC, the more routes you have, the slower your IDE will become." Recommended fixes: compile the client including the server app and export `hcWithType`; split clients per sub-app (`hc<typeof authorsApp>('/authors')`); optionally pass explicit route type args — [Hono RPC guide](https://hono.dev/docs/guides/rpc)
- RPC requirements: chain handlers so types are inferred; `"strict": true` in both client and server tsconfig; pass explicit status to `c.json(data, 200)` to get status-discriminated types; don't use `c.notFound()` in client-facing routes (return `c.json(..., 404)`); `.then()` chains lose types (use async/await); mismatched Hono versions between client and server cause "Type instantiation is excessively deep"; `app.onError()` and global middleware responses aren't inferred unless `ApplyGlobalResponse` is used — [Hono RPC guide](https://hono.dev/docs/guides/rpc)
- `@hono/zod-validator` 0.9.1 peers: `zod: "^3.25.0 || ^4.0.0"`, `hono: ">=4.11.2"` — [npm](https://registry.npmjs.org/@hono/zod-validator/latest)
- Hono CSRF middleware checks `Origin` and `Sec-Fetch-Site` (passes if either succeeds), only on unsafe methods with form-compatible content types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`); default allows only same origin / `same-origin`; reverse proxies stripping these headers break it — [Hono CSRF docs](https://hono.dev/docs/middleware/builtin/csrf)

### Inferences
- Stay on 4.13.x for phase 1; v5 is an RC with no published migration guide. Use the non-deprecated import paths now (e.g. avoid `hono/bun` adapter imports if a `@hono/bun` replacement exists) so the v5 move is cheap.
- Because Bun's `routes` handle the SPA, Hono's `serveStatic` is not needed at all; Hono only sees `/api/*`. Use `new Hono().basePath("/api")` so routes match when `api.fetch` gets the full URL.
- Elsewhere's API surface in phase 1 (feeds, library, auth, settings, jobs admin: maybe 30–60 routes) is well within the comfortable RPC range if each context is its own chained sub-app and `web/lib/api.ts` creates one `hc` client per context.
- Error handling: map `Result` errors in routes via the single `server/http/errors.ts`, and use `app.onError` only for thrown bugs (and `HTTPException` from middleware like auth/validator). Use `zValidator(target, schema, hook)` with a hook that returns RFC 9457 problem JSON so validation failures go through the same mapper.
- Built-in Hono middleware covers the rest without extra deps: `secureHeaders`, `cors` (not needed when SPA is same-origin; leave it off), `logger`/custom one-line JSON logger, `bodyLimit`, `timeout`, `csrf`. There is no built-in rate limiter in core; for single-user, a tiny in-memory login-attempt limiter is enough (only the login route needs it).

### Gaps
- Could not find primary-source v5 breaking-change notes; the v5 RC GitHub releases have empty bodies.
- Did not verify the exact current name/path of `hcWithType` export tooling or whether TypeScript 7 (native, now npm `latest`) changes Hono RPC inference performance. This is worth a quick spike: TS 7 should speed `tsc`, but verify `hc` types compile identically.
- Did not verify `secureHeaders`/`bodyLimit`/`timeout` option details on current docs pages (they're long-standing Hono built-ins).

## Database: bun:sqlite (WAL, busy_timeout, concurrency, transactions, statements)

### Takeaway
bun:sqlite is synchronous and fast; run WAL + `synchronous=NORMAL` + `foreign_keys=ON` + a `busy_timeout`, use one connection for the whole process (HTTP and worker share it), and keep transactions synchronous. Long queries block the event loop, so keep jobs' DB work short and do network I/O outside transactions.

### Cited Findings
- Docs recommend `db.run("PRAGMA journal_mode = WAL;")`; `PRAGMA synchronous = NORMAL` for faster commits ("power loss can lose the last commits but cannot corrupt the database"); on macOS `-wal`/`-shm` files persist after close unless persistent WAL is disabled — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- `db.query()` returns a cached Statement (cache size `Database.MAX_QUERY_CACHE_SIZE`, default 20; SQL >64 KB not cached); `db.prepare()` returns an uncached statement for dynamic one-off SQL — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- `db.transaction(fn)`: commits when `fn` returns, rolls back on throw; **the function must be synchronous — work after an `await` runs outside the transaction**; nested calls become savepoints; `.deferred()`, `.immediate()`, `.exclusive()` variants — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- `strict: true` makes missing bound parameters throw (default binds NULL); `safeIntegers` default false (numbers >53 bits rounded) — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- Caveats: API is synchronous so long queries block the thread; reusing the same `Database` inside a `db.function()`/aggregate/update hook throws "connection is busy"; a Statement has one cursor; update hooks miss `WITHOUT ROWID`, `INSERT OR REPLACE` removals and other connections' changes — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- `Database.setCustomSQLite(path)` is needed on macOS for extensions; on other OSes SQLite is statically linked and the call is a no-op returning `false`; workers may repeat the call with the same path only — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- `RETURNING` needs SQLite ≥3.35 — [DEV Community](https://dev.to/arthurpro/you-probably-dont-need-redis-put-the-job-queue-in-your-sqlite-file-624)

### Inferences
- Recommended open sequence: `new Database(path, { create: true, strict: true })` then `PRAGMA journal_mode=WAL; synchronous=NORMAL; foreign_keys=ON; busy_timeout=5000;` (busy_timeout is standard SQLite, not specific to Bun). Use `.immediate()` transactions for writes (including the job claim) so a second connection (e.g. a CLI backup, or a future split worker) gets SQLITE_BUSY at BEGIN and waits on busy_timeout instead of failing mid-transaction on lock upgrade.
- Same-process worker: with one synchronous connection, there is no SQLite-level contention between HTTP and worker at all; JS single-threadedness serializes access. This is the simplest and safest phase-1 setup. A separate worker process later works because WAL allows concurrent readers and one writer, plus busy_timeout.
- The "transaction must be sync" rule fits the architecture's load → decide → apply pattern exactly: fetch over network first (async), then apply the plan in one synchronous transaction. Repository adapter methods that write should be sync inside, even if the port signature is `Promise<Result<…>>`.
- Backups: `VACUUM INTO` (already in architecture.md) works from the same connection.

### Gaps
- Bun docs do not discuss `busy_timeout` or using bun:sqlite across Bun Workers; no primary source found for Bun-specific multi-process contention behavior.
- Did not verify the SQLite version bundled in Bun 1.4.4 (needed for FTS5/RETURNING — almost certainly ≥3.35, but unconfirmed here).

## Migrations / schema: Drizzle vs Kysely vs raw SQL

### Takeaway
Drizzle 1.0 is **not GA**: npm `latest` is 0.45.4 and 1.0 is at `1.0.0-rc.5` (2026-10-21), yet Drizzle's own bun-sqlite page now tells you to install `@rc`. For a project starting now that wants fewest moving parts, the pragmatic options are (a) Drizzle 0.45.x stable now and plan a 1.0 upgrade, or (b) raw SQL + a ~40-line migrator over bun:sqlite (numbered `.sql` files, a `schema_migrations` table, each applied in one transaction). Given the architecture's "plain SQL where clearer" principle and that FTS5/sqlite-vec are raw SQL anyway, option (b) is simpler; Drizzle earns its keep only if typed query building is wanted.

### Cited Findings
- drizzle-orm `latest` 0.45.4 (2026-10-08); dist-tag `rc` = 1.0.0-rc.5; `beta` = 1.0.0-beta.22; dozens of branch dist-tags (e.g. `bun-timestampstring-patch`, `node-sqlite`, `update/migrator-strategy`) indicate active churn — [npm registry](https://registry.npmjs.org/drizzle-orm)
- v1.0.0-rc.5 released 2026-10-21 with **[BREAKING]** changes (postgres-js parsers); rc.4 on 2026-06-27 — so RC has been open 4+ months and is still taking breaking changes — [Drizzle releases](https://github.com/drizzle-team/drizzle-orm/releases)
- drizzle-kit 0.31.11 (2026-09-21): "Warn about silent migration skips on drizzle-kit checks" — [Drizzle releases](https://github.com/drizzle-team/drizzle-orm/releases)
- Drizzle bun-sqlite docs: install `drizzle-orm@rc` and `drizzle-kit@rc`; `drizzle({ client: new Database('sqlite.db') })`; sync APIs `.all()`, `.get()`, `.values()`, `.run()` for sync drivers like bun:sqlite; page does not cover migrations — [Drizzle bun-sqlite docs](https://orm.drizzle.team/docs/connect-bun-sqlite)
- Kysely `latest` 0.29.9 (2026-11-12), 0.30 in beta — [npm registry](https://registry.npmjs.org/kysely)
- better-auth peers `drizzle-orm: "^0.45.2 || >=1.0.0-rc.1 <2.0.0"`, showing the ecosystem is straddling 0.45 and 1.0-rc — [npm](https://registry.npmjs.org/better-auth/latest)

### Inferences
- If Drizzle is kept: use `drizzle-orm/bun-sqlite` with the app's own `Database` instance (so PRAGMAs are set once), generate SQL migrations with `drizzle-kit generate`, commit them, and run them at startup with the bun-sqlite migrator before `Bun.serve`. Hand-edit generated migrations to add FTS5 virtual tables/triggers (drizzle-kit can't model them). For `bun build --compile`, migrations folder must be embedded or shipped alongside the binary — check this explicitly.
- Kysely adds a query builder without schema ownership; it needs a bun:sqlite dialect (community package) — more deps than either other option, so not recommended.
- Recommendation leaning: raw SQL migrations + typed hand-written queries in `adapters/sqlite` is the fewest-deps option and matches principle 7; it also sidesteps the Drizzle 0.45 → 1.0 migration. Embedding migrations as TS string modules (or `import sql from "./001.sql" with { type: "text" }`) keeps them inside the compiled binary.

### Gaps
- Did not verify the current path/API of Drizzle's bun-sqlite migrator (`drizzle-orm/bun-sqlite/migrator`) under 1.0-rc, nor whether 1.0 changed the migrations folder format (the `update/migrator-strategy` tag hints at changes).
- No announced Drizzle 1.0 GA date found.
- Kysely bun:sqlite dialect maintenance status not checked.

## Jobs and scheduling on SQLite in Bun

### Takeaway
Build the jobs table yourself as architecture.md describes. None of the libraries fit: liteque needs better-sqlite3 + Drizzle, sidequest targets Node ≥22.6 and ships a dashboard, plainjob is abandoned (last publish Oct 2024), and bunqueue is a large Bun-only system with an MCP peer dep. For scheduling, use Bun's built-in in-process `Bun.cron` (no dependency) or a `setInterval` tick; croner only if you need a cron parser outside Bun.

### Cited Findings
- liteque 0.10.0: "A sqlite-based job queue for Node.js"; peer `better-sqlite3 ^13`; deps `drizzle-orm ^0.45.4`, `zod ^4`, `async-mutex`; runner options `concurrency`, `pollIntervalMs`, `timeoutSecs`, `validator` — [npm](https://registry.npmjs.org/liteque/latest), [liteque README](https://github.com/karakeep-app/liteque)
- plainjob 0.0.14, last published 2024-10-13, "A queue based on SQLite capable of processing 15k jobs/s" — [npm](https://registry.npmjs.org/plainjob)
- bunqueue 2.9.22: "High-performance job queue for Bun and AI agents. Memory or one-file SQLite, optional PostgreSQL… cron, retries, DLQ, and MCP"; engines `bun >=1.4.0`; peer `@modelcontextprotocol/sdk` — [npm](https://registry.npmjs.org/bunqueue/latest)
- bunqueue docs warn that expired leases let another worker reclaim a job, so slow workers can double-process — [bunqueue production guide](https://bunqueue.dev/guide/production/), [stalls](https://bunqueue.dev/guide/worker/stalls/)
- sidequest 1.17.0: "Redis-free background job processor for Node.js… PostgreSQL, MySQL, SQLite, or MongoDB, with a built-in dashboard"; engines node >=22.6.0 — [npm](https://registry.npmjs.org/sidequest/latest)
- Claim pattern: single `UPDATE … WHERE id IN (SELECT … LIMIT n) RETURNING` avoids select/update races; SQLite's serialized writes mean only one worker gets a given claim — [pkg.go.dev gqs](https://pkg.go.dev/github.com/romanqed/gqs/sql), [ferro-queue claim](https://docs.rs/ferro-queue/0.2.49/ferro_queue/fn.claim.html)
- Stale-lease fix: per-claim token/version checked on every final write — [blog.master.dev](https://blog.master.dev/?p=10923)
- `Bun.cron(schedule, handler, { tz? })` runs a callback in-process and returns a `CronJob`; next fire time is computed only after the handler's promise settles so "invocations never stack"; `job.stop()`, `unref()`, `ref()`; `CronJob` is Disposable; `Bun.cron.parse(expr)` returns next `Date`; OS-level form `Bun.cron(path, schedule, title)` registers with crontab/launchd/Task Scheduler — [Bun cron docs](https://bun.com/docs/runtime/cron), [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- croner 11.0.1, zero deps, "All environments" — [npm](https://registry.npmjs.org/croner/latest)
- Miniflux scheduling: `POLLING_FREQUENCY` default 60 min (scheduler tick), `BATCH_SIZE` default 100 feeds per tick, `WORKER_POOL_SIZE` default 16; `POLLING_SCHEDULER` `round_robin` (default) or `entry_frequency` (interval from average entries over past week, min 5 min, max 1440 min, `FACTOR` 1); round-robin max interval also used to cap huge `Cache-Control`/`Expires`; `POLLING_PARSING_ERROR_LIMIT` default 3 then polling stops until manual refresh; `POLLING_LIMIT_PER_HOST` default 0 (disabled) caps concurrent requests per hostname — [Miniflux configuration](https://miniflux.app/docs/configuration.html)

### Inferences
- Concrete design (fits architecture §8): `jobs(id, kind, payload JSON, status, attempts, run_at, locked_until, lock_token, last_error, dedupe_key UNIQUE WHERE status IN ('queued','running'), created_at)`. Claim in an immediate transaction: `UPDATE jobs SET status='running', locked_until=:now+:lease, lock_token=:tok, attempts=attempts+1 WHERE id IN (SELECT id FROM jobs WHERE kind=:kind AND status='queued' AND run_at<=:now ORDER BY run_at LIMIT :n) RETURNING *`. On startup (and each tick) requeue `running` rows whose `locked_until < now` (crash recovery). Complete/fail with `WHERE id=? AND lock_token=?`.
- With one process and one connection, lease expiry matters only for crash recovery; per-kind concurrency is just a counter of in-flight handlers per kind, claiming `limit - inFlight` each tick.
- Scheduler: one `Bun.cron("* * * * *", tick)` (or `setInterval(tick, 30_000)`) that calls a pure `dueFeeds(feeds, now)` and enqueues `feed.poll` jobs with `dedupe_key = poll:<feedId>`. Miniflux's `entry_frequency` (min 5 min / max 24 h, honoring Cache-Control) is a good default model for the pure `nextPollAt` function. Bun.cron's no-overlap guarantee removes a class of bugs vs setInterval.
- Wake-up latency: poll the jobs table every ~1 s, plus an in-process "nudge" after enqueue so UI-triggered jobs start immediately.

### Gaps
- FreshRSS scheduling (system cron calling `app/actualize_script.php`, typically every 20–60 min) is from memory only; I didn't fetch a primary source.
- Did not test liteque under Bun; Bun historically did not support the better-sqlite3 native addon, but I did not verify its current status.
- `Bun.cron` introduction version not stated on the docs page (appears to be 1.4 per the blog).

## Per-host concurrency limiting for outbound fetches

### Takeaway
Don't add a dependency: a ~20-line keyed semaphore (`Map<host, {active, queue}>`) inside the `feed-http` adapter handles per-host concurrency (Miniflux exposes the same knob). If a library is preferred, p-limit 7.3.3 (one tiny dep) per host is the lightest; p-queue 10 only if you need intervals/priorities.

### Cited Findings
- p-limit 7.3.3, depends only on `yocto-queue`, engines node >=20 — [npm](https://registry.npmjs.org/p-limit/latest)
- p-queue 10.0.0 published 2026-10-12 — [npm](https://registry.npmjs.org/p-queue)
- Miniflux `POLLING_LIMIT_PER_HOST` caps concurrent polling requests to the same hostname (default disabled) — [Miniflux configuration](https://miniflux.app/docs/configuration.html)

### Inferences
- Global limit = per-kind job concurrency (e.g. 4–8 `feed.poll` in flight); per-host limit = 1–2 inside the fetcher; plus a min delay between requests to the same host for politeness. All outbound calls use `AbortSignal.timeout()`.

### Gaps
- Did not check p-limit/p-queue issue trackers for Bun-specific problems (both are pure JS, so none expected).

## Auth for a single-user self-hosted app; CSRF

### Takeaway
Hand-roll it: one password (hashed with `Bun.password`, argon2id) set on first run or from env, a random session id stored hashed in a `sessions` table, sent as an `HttpOnly; Secure; SameSite=Lax` cookie via `hono/cookie`, checked by a small middleware on `/api/*`, plus Hono's built-in `csrf()` middleware and a login rate limit. Lucia is deprecated; better-auth is far too heavy for one user.

### Cited Findings
- lucia 3.2.2 carries the npm deprecation message "This package has been deprecated. Please see https://lucia-auth.com/lucia-v3/migrate." — [npm](https://registry.npmjs.org/lucia)
- better-auth 1.7.25 depends on zod, jose, kysely, nanostores, better-call, @noble/hashes, @noble/ciphers, telemetry and five adapter packages; peers include drizzle-orm `^0.45.2 || >=1.0.0-rc.1` — [npm](https://registry.npmjs.org/better-auth/latest)
- Hono `csrf()` validates `Origin` / `Sec-Fetch-Site` on unsafe methods with form-compatible content types; default same-origin only — [Hono CSRF docs](https://hono.dev/docs/middleware/builtin/csrf)

### Inferences
- Because the SPA is served same-origin and the API accepts only `application/json`, cross-site form posts can't reach handlers (the zod JSON validator rejects form content types, and browsers can't send cross-site `application/json` without a CORS preflight, which is not enabled). `SameSite=Lax` + `csrf()` + "JSON only" is defense in depth; no CSRF token is needed.
- Support `Authorization: Bearer <AUTH_TOKEN>` as an alternative path for scripts/API clients (architecture.md mentions `AUTH_TOKEN`); compare with `crypto.timingSafeEqual`.
- Session ids: 32 random bytes (`crypto.getRandomValues`), store SHA-256 of the id, sliding expiry (e.g. 30 days). Rate-limit `/api/auth/login` in memory (e.g. 5 attempts/min/IP).

### Gaps
- Did not fetch the `Bun.password` docs page this session; the argon2id default and `Bun.password.hash/verify` API are from prior knowledge and should be confirmed.
- Did not verify whether Hono now ships a built-in session helper (it has `hono/cookie` with signed cookies; sessions historically required third-party middleware).

## Logging

### Takeaway
Use a plain JSON-lines `Logger` adapter over `console`/`process.stdout` (zero deps), as architecture.md already plans. If a library is wanted later, LogTape (zero deps, explicitly supports Bun) is the better fit than pino, whose transports rely on worker threads and need bundler workarounds for `bun build --compile`.

### Cited Findings
- pino 10.4.0 (2026-10-02) — [npm](https://registry.npmjs.org/pino)
- pino transports run in worker threads via thread-stream; `bun-plugin-pino` exists because transports "need to be bundled separately or they won't get resolved at runtime and you'll get errors like `unable to determine transport target`", emitting extra files like `thread-stream-worker.js` and `pino-worker.js` — [bun-plugin-pino README](https://unpkg.com/bun-plugin-pino@1.4.0/README.md)
- Same root cause broke pino in Next.js 16 Turbopack builds ("Cannot find module './transport-stream'") — [vercel/next.js#86099](https://github.com/vercel/next.js/issues/86099)
- LogTape 2.4.2: "Unobtrusive logging library with zero dependencies—library-first design for Deno/Node.js/Bun/browsers/edge" — [npm](https://registry.npmjs.org/@logtape/logtape/latest)
- consola 3.4.2, last published 2025-03-18 — [npm](https://registry.npmjs.org/consola)

### Inferences
- pino *without* transports (writing JSON to stdout) works fine on Bun; the pain is only transports + compiled binaries. Since Docker/systemd collect stdout anyway, a hand-written `log(level, msg, fields)` that `JSON.stringify`s one line is enough and keeps the binary simple.

### Gaps
- No Bun-specific pino issue found; compatibility judgment rests on the bundling workaround plugin.

## Config validation

### Takeaway
Plain Zod 4: `const Env = z.object({...}); const env = Env.parse(process.env)` with `z.coerce.number()` for PORT and a pretty-printed error on failure. @t3-oss/env-core adds client/server split features that a server-only config doesn't need.

### Cited Findings
- zod `latest` 4.6.7 (2026-10-12) — [npm](https://registry.npmjs.org/zod)
- @t3-oss/env-core 0.13.11 (2026-03-22), peers zod `^3.24 || ^4`, arktype, valibot — [npm](https://registry.npmjs.org/@t3-oss/env-core/latest)

### Inferences
- Use `z.prettifyError()` (Zod 4) for the readable startup message. Bun auto-loads `.env`, so no dotenv dependency is needed.

### Gaps
- Did not re-verify `z.prettifyError` name on zod.dev this session.

## Testing

### Takeaway
`bun test` covers everything needed: Jest-style mocks, snapshots, coverage, watch, and in 1.4 parallel/isolated runs and fake timers. Test HTTP with `app.request()` (or Hono `testClient`), SQLite adapters against `new Database(":memory:")` with migrations applied, and the feed fetcher against recorded fixtures served by a local `Bun.serve` on port 0. MSW is optional.

### Cited Findings
- Bun 1.4 test features: `--parallel`, `--isolate`, `--shard`, `--timings`, `--changed`, `--watch`, `retry`/`repeats`, `jest.useFakeTimers()`, `jest.setSystemTime()`, merged coverage across workers — [Bun 1.4 blog](https://bun.com/blog/bun-v1.4)
- `bun:sqlite` supports `db.serialize()` / `Database.deserialize()` for in-memory snapshots — [Bun SQLite docs](https://bun.com/docs/runtime/sqlite)
- msw 3.0.6 published 2026-11-15 (MSW 3 is current major) — [npm](https://registry.npmjs.org/msw)

### Inferences
- A faster per-test DB: migrate once into `:memory:`, `serialize()` it, then `Database.deserialize(bytes)` per test.
- A local `Bun.serve({ port: 0, routes: {...fixtures} })` gives realistic HTTP (ETag/304, redirects, 410, slow responses) for the `feed-http` adapter with zero deps; MSW only if intercepting `fetch` globally is preferred.

### Gaps
- Did not verify MSW 3's Bun support statement or Hono `testClient` current API.

## Tooling: Biome, dependency-cruiser, TypeScript, Result type

### Takeaway
Biome 2.6.x, dependency-cruiser 18.8, and the Bun-recommended tsconfig all work. Note TypeScript 7.0 (native) is now npm `latest`, and dependency-cruiser declares Node engines (run it via `bunx`, which works, or add Node in CI). Keep the hand-rolled `Result`: neverthrow is unmaintained-looking (last release Feb 2025), and Effect 4 is a whole paradigm.

### Cited Findings
- @biomejs/biome 2.6.8 (2026-11-15) — [npm](https://registry.npmjs.org/@biomejs/biome)
- dependency-cruiser 18.8.0 (2026-11-16), engines node `^22||^24||>=26`, bundles `tsconfig-paths-webpack-plugin` and `enhanced-resolve` (tsconfig `paths` resolution) — [npm](https://registry.npmjs.org/dependency-cruiser/latest)
- typescript `latest` 7.0.2 (2026-07-08), 7.1.0-beta out — [npm](https://registry.npmjs.org/typescript)
- Bun's recommended tsconfig: `lib ["ESNext"]`, `target ESNext`, `module Preserve`, `moduleDetection force`, `jsx react-jsx`, `allowJs`, `types ["bun"]`, `moduleResolution bundler`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `noEmit`, `strict`, `skipLibCheck`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`; with TS ≥6.0, `"types": ["bun"]` is required; install `bun add -d @types/bun` — [Bun TypeScript docs](https://bun.com/docs/typescript)
- neverthrow 8.2.0 last published 2025-02-21; better-result 3.0.1 (2026-08-11); effect 4.1.4 (2026-11-11) — [npm](https://registry.npmjs.org/neverthrow), [npm](https://registry.npmjs.org/better-result), [npm](https://registry.npmjs.org/effect)
- Hono RPC needs `strict: true` and the same Hono version on both sides — [Hono RPC guide](https://hono.dev/docs/guides/rpc)

### Inferences
- Add `noUnusedLocals`/`noUnusedParameters: true` (or let Biome's `noUnusedVariables` handle it) and `exactOptionalPropertyTypes: true` for a stricter core. Single package means one tsconfig covers both SPA and server, avoiding the RPC project-references problem entirely.
- dependency-cruiser's `forbidden` rules map 1:1 to architecture §4 (e.g. `from: ^src/core`, `to: ^src/(app|adapters|server|web)|^bun:|^node:fs`). It understands `bun:*` imports as core/unresolvable modules — mark them via `doNotFollow`/a `pathNot` rule or treat as `core` module type; verify in a spike.
- Biome 2 has import-restriction rules (`noRestrictedImports`) that could cover simple cases, but dependency-cruiser is still needed for the "only through `<b>/index.ts`" rule.
- Result: the 3-line local type is the right call; better-result is the only actively maintained lightweight alternative if helpers (`map`, `andThen`, generator-style chaining) become repetitive.

### Gaps
- Did not fetch Biome v2 config docs (`biome.json` schema, `biome migrate`) this session.
- No confirmation whether Hono RPC types, `@types/bun`, and dependency-cruiser's TS parsing all work cleanly with TypeScript 7 (native) — recommend pinning TS 6.x/5.9 only if a spike shows problems.
- Did not verify dependency-cruiser handling of `bun:sqlite` specifiers from a primary source.
