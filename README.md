# Elsewhere

An open-source RSS reader built for discovery. Phase 1 is the foundation: a plain, fast, local feed reader.
See [docs/vision.md](docs/vision.md) and [docs/architecture.md](docs/architecture.md).

## Run it

Requires [Bun](https://bun.com) 1.4+.

```sh
bun install
bun run seed     # optional: add a handful of real feeds
bun run dev      # http://localhost:3000
```

Data lives in `./data/elsewhere.db`. Delete it to start over. Optional `.env`: `PORT`, `HOST`, `DATABASE_PATH`.

```sh
bun test         # all tests
bun run check    # type check + lint
bun run format   # auto-format
```

## What it does

- Subscribe by feed URL or site URL (finds the feed via `<link rel="alternate">`, then common paths)
- RSS, Atom, RDF and JSON Feed
- Background polling: at most hourly, scaled to how often a feed posts, honouring ETag/Last-Modified,
  Cache-Control and Retry-After, one request per host at a time
- Unread / starred / all, per feed or across feeds; mark all read
- Full-text search (SQLite FTS5)
- OPML import and export
- Feed health (failing, paused after repeated parse errors, gone on 410) with manual refresh
- Keyboard: `j`/`k` next/previous, `s` star, `m` read/unread, `o` open original, `/` search, `Esc` close

## Layout

```
src/core/      pure functions: parsing, identity, scheduling, sanitizing, queries (test-first)
src/app/       use cases and ports
src/adapters/  SQLite, HTTP fetcher, clock/logger
src/server/    Hono API, job worker, scheduler, entry point
src/web/       React SPA
migrations/    plain SQL, applied at startup
```
