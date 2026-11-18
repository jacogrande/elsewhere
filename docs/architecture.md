# Elsewhere Architecture

> How Elsewhere is built: a Bun + Hono server, a React SPA, and a functional core wrapped in an imperative shell, organized by domain.

Status: draft v1 · 2026-11-16
Related: [vision.md](./vision.md) · [viability research](../reports/Elsewhere%20knowledge%20graph%20viability.md)

---

## 1. Principles

These rules apply everywhere. When in doubt, re-read them.

1. **Functional core, imperative shell.** Domain logic is pure functions over plain data. Every side effect (I/O, time, randomness, network, the database, LLMs) lives in a thin shell that gathers inputs, calls the core, and carries out what the core decided.
2. **Test first for pure code.** For every pure function: write the unit test, watch it fail, then write the function. Pure code should reach near-total coverage because its tests are cheap.
3. **Ports and adapters.** The application talks to the outside world only through small TypeScript interfaces (ports). Concrete technology (SQLite, Ollama, Exa, HTTP) lives in adapters that implement those ports. Swapping an adapter never touches the core.
4. **Domain-driven, by bounded context.** Code is grouped by what it means (feeds, knowledge, perspectives), not by technical layer alone. Each context owns its model and its tables.
5. **Errors are values.** Expected failures are returned as typed `Result`s, never thrown. Exceptions mean a bug and go to a top-level handler.
6. **Works without AI.** Every AI feature (embeddings, concepts, related reading) is an enhancement on top of a working zero-AI baseline (feeds, reading, search). A missing or failing model degrades features; it never breaks the app.
7. **Pragmatic over pure.** No DI container, no event bus library, no class hierarchies, no generic repository. Plain functions, plain objects, plain SQL where it's clearer. Add abstraction when a second real use appears, not before.

---

## 2. System overview

```
┌──────────────────────────── one Bun process ────────────────────────────┐
│                                                                          │
│   React SPA (bundled by Bun HTML import)                                 │
│        │  typed Hono RPC client                                          │
│        ▼                                                                 │
│   ┌─────────── imperative shell ───────────┐                             │
│   │  Hono HTTP routes      Job worker loop │  ← drivers (inbound)        │
│   │          │                    │        │                             │
│   │          ▼                    ▼        │                             │
│   │        Application use cases           │  load → decide → apply      │
│   │          │          ▲                  │                             │
│   └──────────┼──────────┼──────────────────┘                             │
│              │ calls    │ pure data                                      │
│              ▼          │                                                │
│   ┌──────── functional core (pure) ────────┐                             │
│   │ feeds · library · knowledge ·          │                             │
│   │ perspectives · discovery · shared      │                             │
│   └────────────────────────────────────────┘                             │
│                                                                          │
│   Ports ──► Adapters (outbound):                                         │
│     SQLite (bun:sqlite + FTS5 + sqlite-vec) · HTTP feed fetcher ·        │
│     Readability extractor · Embedder (Ollama / OpenAI-compatible) ·      │
│     LanguageModel (OpenAI-compatible) · RelationJudge · SearchProvider   │
│     (Exa / Marginalia / SearXNG) · Clock · Logger                        │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                              elsewhere.db (single SQLite file)
```

A single process serves the SPA and the API and runs the background job worker. **For now Elsewhere runs locally only:** `bun run dev`, open `http://localhost:3000`, data in `./data/elsewhere.db`. There is no deployment story yet, on purpose (see §13). The worker can be split into its own process later with no code changes, because it already talks to the rest of the system only through the database job queue.

---

## 3. Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Bun** | Fast, built-in test runner, bundler, SQLite and HTML imports. One tool instead of five. |
| HTTP | **Hono** | Small, Web-standard `Request`/`Response`, first-class Bun support, typed RPC client. |
| Frontend | **React SPA**, bundled by Bun's HTML imports | No separate Vite server. Fall back to Vite only if we need its plugin ecosystem. |
| Routing (web) | None yet: one screen, view state in the URL query string | Add TanStack Router (code-based; there's no Bun plugin for file-based) when a second screen appears. |
| Server state (web) | TanStack Query | Caching, retries, loading and error states for free. |
| API types | Hono RPC (`hc<AppType>`) | Frontend gets the server's types without codegen. |
| Validation | Zod | At every boundary: HTTP input, config, feed data, LLM output. |
| Database | SQLite via `bun:sqlite`, FTS5, `sqlite-vec` | One file, zero ops, fast enough for a personal corpus (100k vectors ≈ 70 ms brute force). |
| Migrations / schema | Plain `.sql` files + a ~40-line migrator run at startup | Drizzle 1.0 is still an RC with breaking changes. Revisit later. |
| Feed parsing | feedsmith (RSS, Atom, JSON Feed, OPML) | Pure: string in, data out. |
| HTML sanitizing | sanitize-html with a Miniflux-style allowlist | Works in Bun. Don't pair DOMPurify with linkedom/happy-dom. |
| Scheduling | `Bun.cron` | Built in. |
| Lint / format | Biome | One fast tool. |
| Boundaries | dependency-cruiser (optional) | Can enforce the import rules in §4. Add it when the codebase grows; follow the rules by convention until then. |
| Tests | `bun test`, happy-dom + Testing Library for the few component tests | Built in. |

**macOS note:** Apple's system SQLite can't load extensions. On macOS, call `Database.setCustomSQLite()` with a Homebrew SQLite before opening the DB so `sqlite-vec` loads. Linux and Docker work as is.

---

## 4. Directory layout and dependency rules

Single package, no workspaces. Boundaries are enforced by tooling, not by package walls.

```
src/
  core/                      # FUNCTIONAL CORE — pure, synchronous, no I/O
    shared/                  #   Result, ids, branded types, text utils
    feeds/                   #   Feed, Entry, parsing, dedupe, poll scheduling
    library/                 #   Article, read state, tags, timeline ordering
    knowledge/               #   Concept, Entity, clustering decisions, related edges
    perspectives/            #   Issue, Position, Claim, Relation, quote verification
    discovery/               #   SourceCandidate, scoring, diversity re-ranking
  app/                       # USE CASES + PORTS — orchestrate, no technology
    <context>/
      ports.ts               #   interfaces this context needs from the world
      <use-case>.ts          #   load → decide (core) → apply
  adapters/                  # IMPLEMENTATIONS of ports — all real I/O lives here
    sqlite/
    feed-http/
    readability/
    embedder-ollama/
    embedder-openai/
    llm-openai/
    judge-llm/
    search-exa/
    search-marginalia/
    memory/                  #   in-memory fakes used by use-case tests
    system/                  #   Clock, Logger, IdGenerator
  server/                    # INBOUND SHELL
    main.ts                  #   composition root: build adapters, wire use cases, start
    config.ts                #   env + settings, Zod-validated, fail fast
    http/                    #   Hono routes per context, error → HTTP mapping
    jobs/                    #   worker loop, job handlers
  web/                       # REACT SPA
    index.html
    routes/
    features/<context>/      #   components + pure view-model functions
    lib/api.ts               #   hc<AppType> client
```

**Import rules (by convention for now, tool-enforced later):**

| Module | May import |
|---|---|
| `core/**` | `core/**`, pure third-party libs (zod, an XML parser). **Never** `app`, `adapters`, `server`, `web`, `bun:*`, `node:fs`, `fetch`. |
| `app/**` | `core/**`, its own `ports.ts`. Never `adapters`. |
| `adapters/**` | `core/**` (types), `app/**/ports.ts`. Never other adapters, never `server`. |
| `server/**` | anything except `web`. `main.ts` is the only file that knows every adapter. |
| `web/**` | `core/**` (pure helpers and types), the `AppType` type from `server`. Never `adapters` or `app`. |
| `core/<a>` → `core/<b>` | Allowed only through `<b>/index.ts`. Contexts don't reach into each other's internals. |

"Pure" here means: same input, same output, no side effects. No `Date.now()`, no `Math.random()`, no `crypto.randomUUID()` in core. Time and ids are passed in.

---

## 5. Bounded contexts

Five contexts plus a shared kernel. Each owns its types, its pure logic, its ports, and its tables. Contexts communicate by **enqueuing jobs** (§8) or by reading each other's public query functions, never by writing each other's tables.

### 5.1 Feeds (ingestion)

Fetching and understanding RSS, Atom and JSON Feed.

- **Model:** `Feed` (url, title, site url, etag, last-modified, health, poll interval), `FeedEntry` (guid, url, title, author, published, content).
- **Pure:** parse feed XML/JSON → entries; normalize URLs; dedupe entries against known guids; compute next poll time from posting frequency and HTTP caching headers; classify fetch failures (retryable vs permanent); find feed URLs in HTML (`<link rel="alternate">`) and blogroll OPML.
- **Ports:** `FeedFetcher` (conditional GET, robots.txt aware), `FeedRepo`.
- **Emits:** `entry.ingested` jobs for Library.

### 5.2 Library (reading)

What the user has and has read. The timeline lives here.

- **Model:** `Article` (canonical url, text, word count, source feed, published, read/saved state), `Tag`.
- **Pure:** article from entry; text cleanup; reading-time; timeline ordering; "resurface" ranking for old evergreen posts (heuristic: inbound links + LLM timelessness score when present).
- **Ports:** `ArticleRepo`, `FullTextExtractor` (optional; feed text is the default), `SearchIndex` (FTS5 + vectors, hybrid).
- **Emits:** `article.enrich` jobs for Knowledge and Perspectives.

### 5.3 Knowledge (topics and concepts)

The cheap, always-on half of the graph.

- **Model:** `Concept` (stable id, label, aliases, optional Wikidata QID), `ArticleConcept`, `RelatedEdge` (article↔article, kind, weight, provenance).
- **Pure:** noun-phrase candidate extraction; concept normalization and alias merging; co-occurrence weighting; choosing kNN "related" edges from similarity scores; mapping fresh clusters onto existing stable concept ids (so ids don't drift); deciding which clusters need an LLM label.
- **Ports:** `Embedder`, `LanguageModel`, `KnowledgeRepo` (see §18 for what's built).
- **Rule:** one LLM extraction **per article, once**, stored with its prompt version and reused by every feature. Nothing calls an LLM at read time; comparing articles is set arithmetic over stored concepts.

### 5.4 Perspectives (positions)

The risky, high-value half. Off by default until it passes our own evaluation set.

- **Model:** `Issue` (canonical question), `Position` (article, author, issue, stance `pro | con | mixed`, paraphrase, verbatim quote), `Claim`, `PositionRelation` (`similar | contrasting | tangential | unrelated | unknown`, confidence, judge id).
- **Pure:** **quote verification** (a position whose quote isn't in the article is dropped); stance-pair → relation rules; candidate pair selection from issue similarity; aggregation that reports source diversity, not raw article counts; confidence thresholds for what the UI may show.
- **Ports:** `LanguageModel` (extraction), `RelationJudge` (pair classification; LLM adapter by default, Jev or others pluggable), `PerspectiveRepo`.
- **Rules:** never show a position without its quote and link; the judge prompt never contains the user's own preferences; the judge model differs from the extraction model where possible.

### 5.5 Discovery (sources)

Finding writers the user doesn't follow yet.

- **Model:** `SourceCandidate` (url, feed url, how found, evidence, score, status `suggested | dismissed | subscribed`), `SourceEdge` (blogroll, outbound link, co-citation, embedding similarity).
- **Pure:** scoring candidates; excluding existing subscriptions; diversity re-ranking (bridge sources between clusters); building search queries from interests; OPML parsing.
- **Ports:** `SearchProvider` (Exa, Marginalia, SearXNG), `SeedList` (bundled Kagi Small Web list), `PageFetcher`, `LanguageModel` (optional query expansion).

### 5.6 Shared kernel

Small and stable: `Result`, branded ids (`FeedId`, `ArticleId`, …), `Url` normalization, text normalization, `Instant` (a number passed in, never read from a clock in core). Nothing domain-specific goes here.

---

## 6. The core / shell pattern

Every use case has the same three steps:

1. **Load** (shell): read what the decision needs through ports.
2. **Decide** (core): a pure function turns inputs into a plan, which is plain data describing what should happen.
3. **Apply** (shell): carry out the plan through ports, ideally in one transaction.

Example: refreshing a feed.

```ts
// src/core/feeds/refresh.ts — pure
export type RefreshInput = {
  feed: Feed;
  fetched: FetchOutcome;        // already-performed fetch, as data
  knownGuids: ReadonlySet<string>;
  now: Instant;
};

export type RefreshPlan = {
  newEntries: FeedEntry[];
  feedUpdate: Partial<Feed>;     // etag, health, nextPollAt, ...
  jobs: JobRequest[];            // e.g. one entry.ingested per new entry
};

export function planRefresh(input: RefreshInput): Result<RefreshPlan, RefreshError> {
  // parse, dedupe, compute next poll, classify failure — no I/O
}
```

```ts
// src/app/feeds/refresh-feed.ts — shell orchestration
export const refreshFeed = (deps: {
  feeds: FeedRepo;
  fetcher: FeedFetcher;
  jobs: JobQueue;
  clock: Clock;
}) => async (feedId: FeedId): Promise<Result<RefreshSummary, RefreshFeedError>> => {
  const feed = await deps.feeds.get(feedId);
  if (!feed.ok) return feed;

  const fetched = await deps.fetcher.fetch(feed.value.url, feed.value.cache);
  const knownGuids = await deps.feeds.knownGuids(feedId);
  if (!knownGuids.ok) return knownGuids;

  const plan = planRefresh({ feed: feed.value, fetched, knownGuids: knownGuids.value, now: deps.clock.now() });
  if (!plan.ok) return plan;

  return deps.feeds.applyRefresh(feedId, plan.value);  // entries + feed update + jobs, one transaction
};
```

Note that a fetch *failure* is passed into the core as data (`FetchOutcome`), because deciding what a 410 or a timeout means for the feed's health is domain logic and should be tested as such.

Use cases are curried factories: `useCase(deps)(input)`. `server/main.ts` builds deps once and wires them. That is the entire "dependency injection" system.

---

## 7. Error handling

### 7.1 The `Result` type

A tiny local type. No library.

```ts
// src/core/shared/result.ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Use plain `if (!r.ok) return r;` early returns. Add helpers (`map`, `all`) only if a pattern repeats many times.

### 7.2 Error kinds

Errors are discriminated unions with a `type` tag, defined next to the code that produces them.

| Kind | Example | Where defined | Handling |
|---|---|---|---|
| **Domain** | `quote_not_found`, `feed_gone`, `already_subscribed` | `core/<context>` | Returned as `Result`. Mapped to 4xx or a user-visible state. |
| **Infrastructure** | `{ type: 'unavailable', retryable: true }`, `timeout`, `rate_limited`, `invalid_response` | `app/<context>/ports.ts` | Adapters convert every thrown error into one of these. Jobs retry the retryable ones. |
| **Validation** | Bad HTTP body, malformed config, LLM JSON that fails its schema | Zod at the boundary | 400 for HTTP; fail-fast at startup for config; treated as `invalid_response` for LLMs. |
| **Bug** | `undefined is not a function`, broken invariant | — | **Thrown.** Caught by Hono `onError` / the job worker, logged with stack, 500 / job marked failed. Never swallowed. |

### 7.3 Rules

- **Repositories may throw.** SQLite is local and synchronous; a database failure means a bug or a broken disk, not an expected outcome, so it surfaces as a bug (500 / failed job). Network adapters never throw.
- **Adapters never leak exceptions.** Every adapter method wraps its I/O in `try/catch` and returns a port-level error. This is the one place `try/catch` is common.
- **Every outbound call has a timeout** (`AbortSignal.timeout(ms)`), including fetches, LLM calls, and embeddings.
- **Validate everything that crosses a boundary:** HTTP input (`@hono/zod-validator`), config at startup, parsed feed data, and every LLM response (schema + quote verification). Untrusted text from feeds is data, never instructions; LLM prompts delimit it clearly.
- **One HTTP mapping function.** `server/http/errors.ts` maps error `type` → status + RFC 9457 problem JSON. Routes don't invent status codes ad hoc.
- **Degrade, don't break.** If the LLM or embedder is unavailable, enrichment jobs back off and the UI shows the article without those features. Feed health (`ok | degraded | failing | gone`) is stored and shown to the user.
- **Frontend:** TanStack Query handles retries for idempotent GETs; each route has an error boundary; failed mutations show a toast with the problem `title`.

---

## 8. Background jobs

Feed polling, full-text extraction, embedding, clustering, position extraction and discovery all run as jobs.

- **Queue:** a `jobs` table in the same SQLite DB (`id, kind, payload, status, attempts, run_at, last_error, dedupe_key`). No Redis, no external queue.
- **Transactional enqueue:** use cases enqueue jobs in the same transaction as their writes, so state and follow-up work never disagree (an outbox, without the extra machinery). This is also how contexts talk to each other.
- **Worker:** a loop in the same process claims due jobs (`UPDATE … RETURNING`), runs the handler with a concurrency limit per job kind (e.g. 4 fetches, 1 LLM), and records the outcome.
- **Retries:** retryable errors → exponential backoff with jitter, capped attempts (default 5), then `failed` with `last_error` visible in an admin view. Permanent errors fail immediately.
- **Idempotency:** every handler is safe to run twice. `dedupe_key` prevents duplicate enqueues (e.g. `embed:article:123`).
- **Scheduling:** recurring work (poll due feeds, nightly re-cluster, weekly discovery) is a tiny scheduler that enqueues jobs; the scheduling *decision* is a pure function of feed state and `now`.

---

## 9. Data

One SQLite file, WAL mode, foreign keys on. Each context owns its tables; table names are prefixed by context to make ownership obvious.

| Context | Tables |
|---|---|
| feeds | `feeds_feed`, `feeds_entry` |
| library | `library_article`, `library_article_fts` (FTS5), `library_tag`, `library_article_tag` |
| knowledge | `knowledge_embedding`, `knowledge_extraction`, `knowledge_concept`, `knowledge_concept_label`, `knowledge_article_concept`, `knowledge_related_click` (later: `knowledge_chunk` for passage search, sqlite-vec at scale) |
| perspectives | `persp_issue`, `persp_position`, `persp_claim`, `persp_relation` |
| discovery | `disc_candidate`, `disc_source_edge` |
| system | `jobs`, `settings` |

- **The graph is just tables.** Nodes are rows; edges are rows with `(src, dst, kind, weight, provenance)`. Traversals of one or two hops are SQL joins. Whole-graph algorithms (community detection, PageRank) load edges into memory in a job. No graph database.
- **Embeddings record their model.** Every vector row stores `model` and `dim`, so changing the embedding model is a re-embed job, not a migration crisis.
- **Single user, local (v1).** The server binds to `127.0.0.1` and has no login. Auth and multi-user come back only if Elsewhere is ever hosted.
- **Export is a feature.** OPML for subscriptions and JSON for everything else, from day one. The research found shutdowns with no export window; we won't be one.

---

## 10. AI integration

All AI goes through ports, so the core never knows which model or vendor is in use.

```ts
// app/knowledge/ports.ts
export interface Embedder {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[], signal?: AbortSignal): Promise<Result<Float32Array[], AiError>>;
}

// app/shared/ports.ts
export interface LanguageModel {
  generate<T>(req: {
    system: string;
    input: string;            // untrusted text, delimited
    schema: z.ZodType<T>;     // response must parse, or it's an error
    signal?: AbortSignal;
  }): Promise<Result<T, AiError>>;
}

// app/perspectives/ports.ts
export interface RelationJudge {
  readonly id: string;        // recorded on every relation for auditing
  judge(a: PositionView, b: PositionView): Promise<Result<RelationVerdict, AiError>>;
}
```

- **One OpenAI-compatible adapter** (base URL, key, model) covers Ollama, llama.cpp, vLLM, OpenRouter and the major vendors. That is the "bring your own key or local model" story, configured in settings.
- **Default embedder:** `mongodb/voyage-4` via OpenRouter (`OPENROUTER_API_KEY`, override with `EMBEDDING_MODEL`), embedding whole articles (title + text, up to ~4k tokens) at 1024 dims. Chosen by `eval/embeddings` (see `RESULTS.md`): tied for best on related reading; `qwen/qwen3-embedding-8b` is the close, cheaper alternative. No local fallback for now: without a key, embedding features are simply off.
- **Jev or any hosted judge** is just another `RelationJudge` adapter. Nothing depends on it.
- **Prompts are data,** kept in `app/<context>/prompts.ts` and versioned. The prompt version is stored with every LLM-derived row so results can be re-run when prompts improve.
- **Evaluation harness:** `bun run eval:perspectives` runs extraction and judging against a hand-labeled set in `eval/` and reports precision per relation, especially for `contrasting`. Perspectives features stay behind a setting until this passes a threshold we set.

---

## 11. HTTP API and SPA

### Server entry

```ts
// src/server/main.ts (sketch)
import index from "../web/index.html";

const deps = buildDeps(config);          // adapters, wired once
const api = buildApi(deps);              // Hono app mounted at /api

Bun.serve({
  port: config.port,
  routes: {
    "/api/*": api.fetch,
    "/*": index,                         // SPA; client-side routing handles the rest
  },
  development: config.dev && { hmr: true, console: true },
});

startWorker(deps);
```

### Routes

- One Hono sub-app per context (`/api/feeds`, `/api/library`, `/api/knowledge`, `/api/perspectives`, `/api/discovery`).
- A route does exactly three things: validate input (Zod), call one use case, map the `Result` to a response. No logic in routes.
- `export type AppType = typeof api` gives the SPA a typed client via `hc<AppType>("/")`.
- No auth while local-only; the server listens on `127.0.0.1`.

### SPA

- Organized by feature, mirroring the contexts: `web/features/feeds`, `web/features/topics`, …
- **Components stay thin.** Anything that computes (sorting, grouping, formatting stance distributions, building graph neighborhoods for display) is a pure function in a sibling `*.ts` file with its own test-first unit tests. Components just render.
- Primary views follow the research: **topic pages** with similar / contrasting / tangential rails and a small local graph (1–2 hops), the classic **timeline**, a **discovery** inbox, and **search**. No global graph view in v1.

---

## 12. Testing strategy

| Layer | What | How | Test first? |
|---|---|---|---|
| **Core (pure)** | Parsing, dedupe, scheduling, scoring, quote verification, relation rules, view-models | `bun test`, plain inputs and outputs, no mocks | **Yes, always** |
| **Use cases** | Orchestration and error paths | `bun test` against real in-memory SQLite (`testDatabase()`) plus fakes for network ports | Encouraged |
| **Adapters** | Real I/O works | SQLite in `:memory:`; recorded HTTP fixtures; LLM adapters against a stub server | After |
| **Contract tests** | Fakes behave like real adapters | Not needed yet: repositories are only ever tested for real, and the only fakes are network ports | — |
| **HTTP** | Validation and error mapping | `app.request()` against the Hono app with memory deps | After |
| **Eval** | AI quality | `eval/` harness, precision per relation | N/A |
| **E2E** | A couple of smoke flows (subscribe → read → topic page) | agent-browser script | Sparingly |

### The test-first loop for pure functions

1. Write `foo.test.ts` with the cases you care about, including edge cases and error results.
2. Run `bun test foo` and watch it fail.
3. Write the smallest `foo.ts` that passes.
4. Refactor with the tests green.

Example: quote verification, the most important guardrail in Perspectives.

```ts
// src/core/perspectives/verify-quote.test.ts — written FIRST
import { describe, expect, test } from "bun:test";
import { verifyQuote } from "./verify-quote";

describe("verifyQuote", () => {
  const article = "Hierarchy matters.  But “strict” hierarchy\nkills exploration.";

  test("accepts an exact quote", () => {
    expect(verifyQuote(article, "Hierarchy matters. But")).toEqual({ ok: true, value: { start: 0 } });
  });

  test("ignores whitespace and smart-quote differences", () => {
    expect(verifyQuote(article, 'But "strict" hierarchy kills exploration.').ok).toBe(true);
  });

  test("rejects a paraphrase", () => {
    expect(verifyQuote(article, "Strict hierarchy hurts exploration.")).toEqual({
      ok: false,
      error: { type: "quote_not_found" },
    });
  });

  test("rejects quotes too short to be meaningful", () => {
    expect(verifyQuote(article, "But")).toEqual({ ok: false, error: { type: "quote_too_short" } });
  });
});
```

```ts
// src/core/perspectives/verify-quote.ts — written SECOND
import { err, ok, type Result } from "../shared/result";

export type QuoteError = { type: "quote_not_found" } | { type: "quote_too_short" };

const MIN_WORDS = 3;

const normalize = (s: string) =>
  s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

export function verifyQuote(article: string, quote: string): Result<{ start: number }, QuoteError> {
  const q = normalize(quote);
  if (q.split(" ").length < MIN_WORDS) return err({ type: "quote_too_short" });
  const start = normalize(article).indexOf(q);
  return start === -1 ? err({ type: "quote_not_found" }) : ok({ start });
}
```

(`start` is an offset into the normalized text; good enough for "does it exist" and for highlighting after the same normalization.)

---

## 13. Running locally

Elsewhere runs on your machine only. No Docker, no CI, no hosting, no backups tooling, no auth.

```sh
bun install
bun run dev      # bun --watch src/server/main.ts → http://localhost:3000
bun test         # all tests
bun run check    # tsc --noEmit + biome check
```

- **Dev loop:** `bun --watch` restarts the process on change (use it rather than `--hot`, which would start a second job worker). Bun's HTML import gives the SPA hot reload.
- **Data:** `./data/elsewhere.db`, created and migrated on startup. Gitignored. To reset, delete the file. To keep a copy, copy the file while the app is stopped.
- **Config:** optional `.env` (Bun loads it automatically): `PORT`, `DATABASE_PATH`. Zod-validated; bad values fail startup with a readable message. Everything else lives in the `settings` table.
- **Seed data:** `bun run seed` imports a small OPML of real feeds for development.
- **Logging:** plain console lines; one per job and per request with duration and outcome.
- **Outbound etiquette** (still matters locally, since we're hitting real sites): honest `User-Agent` (`Elsewhere/<version>`), conditional GETs (ETag / Last-Modified), at most one request per host at a time, poll at most hourly, honor `Retry-After`, no burst of fetches on startup.

Deployment (compiled binary, Docker, hosting, backups, auth, SSRF hardening for user-supplied URLs on a shared server) is deferred until there's a reason to host it. The phase-1 research report has notes for when that day comes.

---

## 14. Decisions (and what we deliberately don't do)

| Decision | Rationale |
|---|---|
| Own feed fetcher behind a port, not Miniflux | Keeps the stack Bun-only. A Miniflux/FreshRSS adapter can implement `FeedFetcher` later if fetching becomes a maintenance burden. |
| SQLite only, no graph DB | A personal graph fits in tables. Kuzu's 2025 archival shows the risk of niche graph engines. |
| No GraphRAG | Independent benchmarks show plain hybrid RAG wins on lookups at a fraction of the tokens. The graph is for navigation. |
| Concepts from one stored LLM extraction per article | Linear in articles, runs offline, reusable by every feature; per-pair LLM calls grow with reading and can't be reused. |
| Separate stance step | Embeddings can't distinguish agreement from disagreement. |
| `Result` values over exceptions | Failure paths become visible in types and tests. |
| Jobs table over a message broker | One process, one file, transactional enqueue. |
| Local only, single user, no auth | Fastest path to a working reader. Hosting is a later decision. |

**Not doing (until there's a real need):** deployment of any kind (Docker, binaries, CI, hosting, backups); auth; microservices; a DI container; an event bus library; CQRS/event sourcing; generic `Repository<T>` base classes; class-based entities with methods; a global graph visualization; a hosted free tier that pays for AI calls; multi-user.

---

## 15. Build order

Aligned with the research's recommended sequence. Each step ships something usable.

1. **Skeleton (local):** Bun + Hono + SPA serving, config, SQLite + migrations, jobs table and worker, `Result`, error mapping, OPML import/export.
2. **Feeds + Library:** subscribe, poll, timeline, read state, FTS search.
3. **Knowledge:** embeddings, related articles, concepts, topic pages, hybrid search.
4. **Discovery:** seed list, blogroll crawl, search providers, suggestions inbox.
5. **Resurfacing:** evergreen ranking in the timeline and topic pages.
6. **Perspectives (behind a flag):** eval set first, then extraction, quote verification, issue clustering, judging, topic-page rails. Turn on by default only after it meets the precision bar.

---

## 16. Open questions

- ~~Which XML feed parser to use in core.~~ feedsmith, behind `core/feeds/parse.ts`. Still worth running against a larger corpus of real feeds.
- Whether in-process embeddings (Transformers.js on Bun) are reliable enough to be the default instead of requiring Ollama.
- The precision threshold for enabling Perspectives by default.
- Confirm what "Jev" refers to; it only affects which `RelationJudge` adapters we ship.

---

## 17. Phase 1 as built

Phase 1 follows this document with these pragmatic simplifications. Revisit them when the codebase grows.

- **One ports file, one use-case file per context.** `src/app/ports.ts` holds every port; `src/app/feeds.ts` and `src/app/library.ts` hold the use cases. Split them when Knowledge and Discovery arrive.
- **Two contexts so far.** Feeds (fetching, parsing, polling) and Library (articles, read/starred, search). Feeds hands new entries to Library with a `library.ingest` job per feed, which converts every not-yet-ingested entry, so it is idempotent and self-healing.
- **Polling rules** live in `core/feeds/refresh.ts` and `core/feeds/schedule.ts`: 1h minimum, 24h maximum, scaled by posts per week, raised by TTL / Cache-Control / Expires / Retry-After, 10% jitter, exponential error backoff, paused after 3 consecutive parse errors, stopped on 410. A permanent (301/308) redirect updates the stored URL immediately.
- **The fetcher** follows redirects manually (max 5), caps bodies at 15 MB and requests at 20 s, sends validators, decodes legacy charsets, flags Cloudflare challenges, and serializes requests per host.
- **Mark all read** is bounded by the highest article id the client saw (`maxId` on every list page), so articles that arrive in the meantime stay unread.
- **`core/shared/html-libs.ts`** loads htmlparser2 and sanitize-html through `require()`. sanitize-html (CommonJS) requires htmlparser2 (ESM-only), and Bun fails that when an `import` of htmlparser2 is still loading. Never import htmlparser2 directly.
- **Plain CSS**, no Tailwind or component library.
- **Deferred:** folders, entry tombstones and retention, WebSub, SSRF protection (local-only, and you add the URLs), full-text scraping, Google Reader / Fever APIs.

---

## 18. Knowledge and the related rail, as built

The first slice of the Knowledge context: every article is embedded and has its concepts extracted, and the reader shows a "Read next" rail of related articles from *other* feeds, each with the ideas it shares with the current one.

**Pipeline (background jobs, all optional).** Without `OPENROUTER_API_KEY` none of this runs and the reader works as before.

1. **Embed** (`knowledge.embed`): title + text, capped at ~4k tokens, embedded with voyage-4 into one unit vector per article (`knowledge_embedding`). If the provider rejects a batch, its texts are retried one at a time and only the ones that fail alone are recorded as failed.
2. **Extract** (`knowledge.extract`): one LLM call per article (default `anthropic/claude-haiku-5.5`, about $0.0005 each) returns concepts with salience, entities, claims with quotes, and open questions. The raw JSON is stored in `knowledge_extraction` with its model and `PROMPT_VERSION`; bumping the version re-extracts, and a failed re-extraction keeps the earlier data. Only concepts are used today; claim quotes are unverified and must pass quote verification (§5.4) before anything shows them. The schema is lenient per item: a malformed entity or claim is dropped, and only "no usable concept" fails an article. Stubs under 80 words are skipped.
3. **Link concepts** (same job, separate step; `linked_at`): each label is normalized and looked up in `knowledge_concept_label`; unseen labels are embedded and merged into an existing concept at cosine ≥ 0.86, else they become a new concept. Because linking is its own step, a failure here never discards a paid extraction. Label embeddings can't separate synonyms from neighbours ("TypeScript"/"JavaScript" 0.75 vs "LLMs"/"large language models" 0.67), so the threshold is strict and the prompt asks for canonical full names. Missed merges are the accepted failure mode; wrong merges are worse. If an overlapping run created the same concept first, the writer reuses it.

**Scheduling and failures.** The minute scheduler enqueues an embed run and an extract run whenever work is waiting (dedupe keys `embed` and `extract`), which covers new articles and backfill with no other triggers. Each run stops starting batches after 90 s, inside the job lease. AI failures are returned to the worker, not thrown: retryable ones (rate limits, outages, auth, billing) back the job off; finished batches are kept. If *every* input in a batch is refused, that's treated as a configuration problem (say, a mistyped model id) and backed off, rather than recording every article as failed. A job that keeps failing keeps only its latest failed row.

**Ranking** (`core/knowledge/related.ts`, pure): k-NN (30, at most 2 per feed) over all vectors excluding the article's own feed → keep similarity in [0.45, 0.97) (below is noise, calibrated by eye for voyage-4; above is the same post syndicated) → relevance = similarity + 0.15 × IDF-weighted concept overlap → MMR (λ 0.7) with one pick per feed → top 5, each with up to 3 shared concepts, rarest first. The scan is brute force over every vector, synchronous on the server: about 100 ms to load and 30 ms to score at 20k articles. Cache vectors in memory or move to sqlite-vec before the library gets that big.

**API and UI.** `GET /api/articles/:id/related` → `{status: "off" | "pending" | "ready", items}`; an article whose embedding failed is `ready` with no items. The rail polls while pending, for up to ~3 minutes. It sits beside the article when the reader is at least 880 px wide and below it otherwise. `POST /api/articles/:id/related-clicks` logs which picks get opened (stars and reads already carry timestamps), for tuning later.

**Known limits.** Changing `EMBEDDING_MODEL` re-embeds articles, but existing concepts only match new labels by exact text until re-extracted. An article that fails with a *retryable* error every time (rare) is retried on every run. The 0.45 floor and the boost weight were set by eye on a small corpus; revisit with an eval once the library grows.
