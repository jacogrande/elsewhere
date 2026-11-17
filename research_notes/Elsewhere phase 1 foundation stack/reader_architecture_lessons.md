# Reader architecture lessons from mature open-source RSS readers (for Elsewhere phase 1)

Method note: Miniflux (`miniflux/v2`, HEAD `fb04322`, committed 2026-11-11) and Yarr (`nkanaev/yarr`, HEAD `b75d463`, committed 2026-11-15) were shallow-cloned and read directly. FreshRSS was read from raw files on its `edge` branch (fetched 2026-11-16). Line references are to those snapshots. Other projects (NewsBlur, Feedbin, TT-RSS, CommaFeed) were covered only through web sources, and those findings are thinner.

## Miniflux: schema, polling, dedupe, content handling, HTTP caching, scraper, APIs

### Takeaway
Miniflux is the closest architectural model for Elsewhere's feeds context. It has a small core schema (users/categories/feeds/entries/enclosures/icons) that grew to about 136 additive migrations, a `next_check_at` column driven by a pure-ish scheduling function, a `(feed_id, hash)` unique key with defensive GUID-collision handling, and a new entry-tombstone table so deleted entries don't come back. Full-text scraping is an opt-in, per-feed flag that runs only for new entries.

### Cited Findings
**Schema**
- The initial migration creates `users`, `sessions`, `categories (unique(user_id,title))`, `feeds (feed_url, site_url, checked_at, etag_header, last_modified_header, parsing_error_msg, parsing_error_count, unique(user_id, feed_url))`, `entries (hash, published_at, title, url, author, content, status enum('unread','read','removed'), unique(feed_id, hash))`, `enclosures (url, size, mime_type)`, and `icons (hash unique, mime_type, content bytea)` plus a `feed_icons` join table. Every feed must belong to a category (`category_id int not null`). — [miniflux migrations.go L19-121](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- The schema grew through roughly 136 migration functions. Columns added later to `feeds` include `scraper_rules`, `rewrite_rules`, `crawler`, `user_agent`, `disabled`, `next_check_at`, `ignore_http_cache`, `fetch_via_proxy`, `cookie`, `hide_globally`, `url_rewrite_rules`, `no_media_player`, `disable_http2`, `description`, `proxy_url`, `ignore_entry_updates`, and `language`. Columns added to `entries` include `starred` (a separate bool, not a status value), `comments_url`, `document_vectors tsvector`, `changed_at`, `share_code`, `reading_time`, `created_at`, `tags text[]`, and `language`. — [miniflux migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- Full-text search is a Postgres `tsvector` weighted title 'A' and content 'B', truncated to 1,000,000 chars, with a GIN index. — [migrations.go L280-297](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- Indexes added over time follow the UI's query shapes: `(user_id, status)`, `(feed_id, status, hash)`, `(user_id, status, starred)`, `(feed_id, url) WHERE length(url) < 2000`, `(user_id, status, changed_at)`, `(user_id, status, published_at)`, and `(user_id, status, created_at)`. — [migrations.go L226-842](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- A recent migration added `entry_tombstones (feed_id, hash, deleted_at, primary key (feed_id, hash))`, migrated existing `status='removed'` rows into it, deleted those rows, and retired the `removed` status. Inserts check `SELECT 1 FROM entry_tombstones WHERE feed_id=? AND hash=?` before creating an entry. — [migrations.go ~L1470-1495](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go); [storage/entry.go L120, L292](https://github.com/miniflux/v2/blob/main/internal/storage/entry.go)

**Polling and scheduling**
- Defaults: `POLLING_FREQUENCY=60` (minutes between scheduler ticks), `BATCH_SIZE=100` feeds per tick, `WORKER_POOL_SIZE=16`, `POLLING_SCHEDULER=round_robin`, `SCHEDULER_ROUND_ROBIN_MIN_INTERVAL=60` and `MAX=1440` minutes, `SCHEDULER_ENTRY_FREQUENCY_MIN_INTERVAL=5`, `MAX=1440`, `FACTOR=1`, `POLLING_PARSING_ERROR_LIMIT=3`, `POLLING_LIMIT_PER_HOST=0` (unlimited), `HTTP_CLIENT_TIMEOUT=20` s, `HTTP_CLIENT_MAX_BODY_SIZE=15` MB. — [config/options.go](https://github.com/miniflux/v2/blob/main/internal/config/options.go)
- `ScheduleNextCheck(weeklyCount, refreshDelay)`: in entry-frequency mode the interval is `7d / (weeklyCount × factor)`, clamped to [min, max]. If there were no entries last week, the interval is the max. The result is then raised to `max(interval, refreshDelay)`, where refreshDelay comes from the RSS TTL, `Retry-After`, `Cache-Control` or `Expires`, and finally capped at the scheduler's max. The function sets `NextCheckAt = now + interval`. — [model/feed.go L123-150](https://github.com/miniflux/v2/blob/main/internal/model/feed.go)
- Each tick, the scheduler builds a batch with `WithBatchSize`, `WithErrorLimit` (`parsing_error_count < limit`), `WithoutDisabledFeeds` (`disabled IS false`), `WithNextCheckExpired`, and `WithLimitPerHost`, then pushes it to a worker pool. A separate cleanup goroutine ticks every `CLEANUP_FREQUENCY_HOURS=24`. — [cli/scheduler.go L20-60](https://github.com/miniflux/v2/blob/main/internal/cli/scheduler.go); [storage/batch.go L50-62](https://github.com/miniflux/v2/blob/main/internal/storage/batch.go)
- Feeds are not deleted or flagged after errors. Once `parsing_error_count >= POLLING_PARSING_ERROR_LIMIT` (3), they silently drop out of the automatic batch, and a "reset errors" query (`UPDATE feeds SET parsing_error_count=0`) re-enables them. — [storage/feed.go L126, L477](https://github.com/miniflux/v2/blob/main/internal/storage/feed.go)

**Entry hash and dedupe**
- RSS hash order: if `<guid>` is present, use `SHA256(guid)`. If the same GUID appears again in the same document, use `SHA256(guid|url)` and then `SHA256(guid|n)`, because "some feeds ship the same GUID for every entry. Keep the first occurrence stable (so existing stored entries still match)". With no GUID, use `SHA256(entryURL)`, and as a last resort `SHA256(title+content)`. — [reader/rss/adapter.go L131-153](https://github.com/miniflux/v2/blob/main/internal/reader/rss/adapter.go)
- On refresh, `RefreshFeedEntries` checks `entryExists` per entry. Existing entries are updated only when `updateExistingEntries` is set (the per-feed `ignore_entry_updates` flag turns this off). Otherwise a new row is created. — [storage/entry.go L320-345](https://github.com/miniflux/v2/blob/main/internal/storage/entry.go)

**Content handling**
- The sanitizer uses an allowlist map of tags to attributes (for example `a: href,title,id`). Disallowed tags are unwrapped and their children kept. Iframes are allowed only from a domain allowlist (youtube.com, youtube-nocookie.com, etc., plus a configurable YouTube embed domain). — [reader/sanitizer/sanitizer.go L21-260](https://github.com/miniflux/v2/blob/main/internal/reader/sanitizer/sanitizer.go)
- Per-feed `rewrite_rules`, `url_rewrite_rules`, `scraper_rules`, blocklist/keeplist and entry filter rules are stored as text columns on `feeds`. The rewrite package also has referer overrides. — [model/feed.go L153-177](https://github.com/miniflux/v2/blob/main/internal/model/feed.go); [reader/rewrite/](https://github.com/miniflux/v2/tree/main/internal/reader/rewrite)
- The scraper ("Fetch original content") runs only when `feed.Crawler && (entryIsNew || forceRefresh)`, so it is per-feed opt-in and never re-fetches known entries on every poll. — [reader/processor/processor.go L95-115](https://github.com/miniflux/v2/blob/main/internal/reader/processor/processor.go)

**HTTP behaviour**
- Conditional GET sends the stored ETag and Last-Modified, unless `ignore_http_cache` is set or the user forces a refresh. `IsModified` returns false on 304, then compares ETag if present, otherwise Last-Modified. Last-Modified is updated even when ETag doesn't change. — [reader/handler/handler.go L244-370](https://github.com/miniflux/v2/blob/main/internal/reader/handler/handler.go); [fetcher/response_handler.go L102-116](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/response_handler.go)
- Redirects: the feed is parsed against `EffectiveURL()` (the URL after redirects). At subscribe time `FeedURL` is set to the effective URL. On refresh, Miniflux checks whether another subscribed feed already has that effective URL. — [handler.go L149-181, L276](https://github.com/miniflux/v2/blob/main/internal/reader/handler/handler.go)
- Errors are mapped per status (401, 403, 404, 410, 429, 500, 502, 503, 504, other ≥400), and an empty body with status ≠304 is an error. Miniflux detects Cloudflare challenges with a headers-only check: `403 && cf-mitigated: challenge && Content-Type text/html`. It does not try to solve them. — [fetcher/response_handler.go L185-245](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/response_handler.go)

**Retention**
- Cleanup defaults: `CLEANUP_ARCHIVE_READ_DAYS=60`, `CLEANUP_ARCHIVE_UNREAD_DAYS=180`, `CLEANUP_ARCHIVE_BATCH_SIZE=10000`. `ArchiveEntries` deletes non-starred, non-shared entries of a given status older than N days by `created_at`, oldest first, in batches. It then inserts their `(feed_id, hash)` into `entry_tombstones` so they won't be re-imported. — [config/options.go L126-154](https://github.com/miniflux/v2/blob/main/internal/config/options.go); [storage/entry.go L368-398](https://github.com/miniflux/v2/blob/main/internal/storage/entry.go)

**Client APIs**
- Miniflux ships a native REST API plus a Google Reader-compatible API (`/accounts/ClientLogin`, `/reader/api/0/token`, `edit-tag`, `rename-tag`, `disable-tag`, `tag/list`, `user-info`, `subscription/list|edit|quickadd`, `stream/items/ids`, `stream/items/contents`, `mark-all-as-read`). Its README calls it "a compatibility subset intended for existing Google Reader clients … not a full reimplementation." It is enabled per user with separate credentials, and the password is bcrypt-hashed. — [googlereader/README.md](https://github.com/miniflux/v2/blob/main/internal/googlereader/README.md); [googlereader/handler.go L49-63](https://github.com/miniflux/v2/blob/main/internal/googlereader/handler.go)
- The Fever API lives at `/fever/` and reports API version 3. Its token is `md5("username:password")`, and auth failure returns HTTP 200 with `{"auth":0}`. — [fever/README.md](https://github.com/miniflux/v2/blob/main/internal/fever/README.md)
- Size, non-test Go lines: the googlereader package is about 1,981 lines (handler.go alone 1,312) and the fever package about 772. — counted with `wc -l` on the [miniflux/v2](https://github.com/miniflux/v2) snapshot
- Miniflux's FAQ says "Nothing is stored on the local file system" (twelve-factor, Postgres-only), and migrations should be run by a single process (`RUN_MIGRATIONS=1`). — [miniflux FAQ](https://miniflux.app/faq.html)

### Inferences
- Elsewhere's `planRefresh` and next-poll function map almost one-to-one onto `ScheduleNextCheck`. Use the entry-frequency formula (7 days / weekly count, clamped), then `max(..., server hint)`, then the cap. Pass `now` and `weeklyCount` in so the function stays pure. Round-robin with a 60-minute minimum is the safe default.
- Store `hash` (the dedupe key) separately from the raw `guid`. Unique key `(feed_id, hash)`. Copy Miniflux's guard against repeated GUIDs within one document.
- Keep `starred` as a separate boolean from read state. Miniflux had to add it later, and Yarr's single status enum makes "starred" and "read" mutually exclusive.
- Add a tombstone table, or never hard-delete, from day one. Elsewhere wants long-term archives, but any user "delete" or retention purge must not resurrect entries on the next poll.
- Plan for the per-feed settings list to grow: user agent, cookie, ignore cache, crawler, rewrite rules. A JSON `settings`/`attributes` column on the feed (FreshRSS does this with `attributes TEXT`) avoids dozens of migrations.
- Classify a Cloudflare challenge as its own failure type (`blocked_by_challenge`) instead of a generic 403.

### Gaps
- I didn't read exactly how Miniflux persists a permanent-redirect URL change to `feed_url` on refresh, only that it uses `EffectiveURL()` and checks for duplicates.
- I didn't find when `entry_tombstones` was introduced. The shallow clone hides history, and the file was last touched 2026-11-11.
- I didn't read Miniflux's scraper/readability internals or its user docs on why the crawler is opt-in (miniflux.app/docs was not fetched). The opt-in behaviour comes from code only.

## FreshRSS: SQLite at scale, actualization, GUID handling, user complaints

### Takeaway
FreshRSS stores the same core shape in SQLite (entry unique on `(id_feed, guid)` plus a content `hash`, and `lastSeen`). Its most transferable idea is an adaptive per-feed "unicity criteria": when a feed's GUIDs are invalid or duplicated beyond a tolerance, it automatically switches to link or hash-based identity. Its defaults keep 3 months / max 200 / min 50 articles per feed, and it recommends the Google Reader API over Fever.

### Cited Findings
- SQLite schema: `entry(id BIGINT pk, guid VARCHAR(767), title, author, content, link, date, lastSeen, lastModified, lastUserModified, hash BINARY(16), is_read, is_favorite, id_feed, tags, attributes TEXT, UNIQUE(id_feed, guid))`. There is a parallel `entrytmp` table used as a staging area for new entries, and `feed` has `ttl`, `error`, `lastUpdate`. — [install.sql.sqlite.php](https://github.com/FreshRSS/FreshRSS/blob/edge/app/SQL/install.sql.sqlite.php)
- `decideEntryGuid` supports per-feed `unicityCriteria`: the default id, `link`, or sha1 combinations of link/published/title/content. A legacy `hasBadGuids` flag forces `link`. sha1('') is treated as blank, and there is a fallback chain. — [app/Models/Feed.php L735-790](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Models/Feed.php)
- Auto-degrade: with `invalidGuidsTolerance` (default 0.05), if invalid GUIDs exceed `round(0.05 × count)` the criteria is downgraded automatically, unless the user forced it (`unicityCriteriaForced`). Per the code comment, 5% "was chosen to allow 1 invalid GUID for feeds of 10 articles, which is a frequently observed amount." — [Feed.php ~L790-835](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Models/Feed.php)
- User defaults: `archiving: keep_period P3M, keep_max 200, keep_min 50, keep_favourites true, keep_labels true, keep_unreads false`. `ttl_default 3600` s. `mark_updated_article_unread false`. — [config-user.default.php](https://github.com/FreshRSS/FreshRSS/blob/edge/config-user.default.php)
- System defaults: `nb_parallel_refresh 10`. `cache_duration 800` s, bounded between 60 s and 86,400 s, overriding Cache-Control/Expires. `retry_after_default 1500` s when a 429/503 has no Retry-After, with `retry_after_max 172800` s. HTTP timeout 20 s. `max_feeds 131072`. Feeds of users inactive for `max_inactivity` stop refreshing. — [config.default.php L110-140](https://github.com/FreshRSS/FreshRSS/blob/edge/config.default.php)
- Refresh runs from an external trigger (cron/systemd/Docker `CRON_MIN`, e.g. `13,43` or `*/20`). "The update script won't update any particular feed more often than once every twenty minutes." — [FreshRSS feed updates docs](https://freshrss.github.io/FreshRSS/en/admins/08_FeedUpdates.html)
- Supports PostgreSQL 10+, SQLite, MariaDB 10.6+, MySQL 8.0+. It "even works on Raspberry Pi 1 with response time under a second (tested with 150 feeds, 22k articles)" (the DB used is not stated). — [FreshRSS README](https://github.com/FreshRSS/FreshRSS/blob/edge/README.md)
- keep_max was disabled by default for existing installations in a 2019 change (#2602). Purge settings can be overridden per feed and per category, and purging runs from cron. Users report confusion when "never delete unread" stops purges. — [FreshRSS commit mirror](https://git.hostux.net/chri555/FreshRSS/commits/commit/7819a43197d34ef7a6c5626e9e48d7db075c37c9/app/Models/Context.php) (secondary mirror; forum threads were summarized by search results only)

### Inferences
- Elsewhere should make "entry identity strategy" a per-feed value computed by a pure function, auto-degrading when GUIDs collide within a fetch. This is easy to test-first and fixes the most common duplicate-entry class.
- A `lastSeen`/`last_arrived` column (when the entry was last present in the feed document) is cheap and enables safe pruning (see Yarr) and "feed dropped this item" logic.
- Clamp server cache hints (min 60 s, max 1 day) and default `Retry-After` to about 25 minutes, capped at 2 days. These are good starting constants for the pure scheduler.

### Gaps
- I found no authoritative FreshRSS SQLite benchmark at large scale (100k+ entries), and no categorized analysis of user complaints. Issue-tracker mining was not done in the call budget.

## Other readers: Yarr, NewsBlur, TT-RSS, CommaFeed, Feedbin

### Takeaway
Yarr is the closest analogue: a single Go binary, SQLite (now also Postgres), 4 fetch workers, a global refresh ticker, an FTS5 external-content table kept in sync by triggers, and a retention rule anchored on `last_arrived`. Its main limits are a single status enum and fixed retention. The SaaS readers (Feedbin, NewsBlur) split fetching into a separately scalable service with adaptive per-feed frequency. TT-RSS's upstream shut down in November 2025 and continues as a community fork.

### Cited Findings
- Yarr: "Single binary, no dependencies … Desktop app or Self-hosted … SQLite or Postgres." — [yarr readme](https://github.com/nkanaev/yarr/blob/master/readme.md)
- Yarr schema (Postgres version shown; SQLite is equivalent): `folders(id, title unique, is_expanded)`, `feeds(id, folder_id → on delete set null, title, description, link, feed_link unique, icon blob)`, `items(id, guid, feed_id, title, link, content, date, date_arrived, last_arrived, status int, media_links json, …)` with `unique(feed_id, guid)` and index `(date, id, status)`, `settings(key, val json)`, `feed_states(feed_id pk, last_refreshed, last_error, http_lmod, http_etag)`. — [yarr storage/postgres/migration.go](https://github.com/nkanaev/yarr/blob/master/src/storage/postgres/migration.go)
- Yarr status is a single enum: `UNREAD=0, READ=1, STARRED=2`. — [storage/model/model.go L84-86](https://github.com/nkanaev/yarr/blob/master/src/storage/model/model.go)
- Yarr SQLite migrations use `pragma user_version` and toggle `foreign_keys=off` around table rebuilds, then run `pragma foreign_key_check`. — [storage/sqlite/migration.go L32-83](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/migration.go)
- Yarr migration m14 moved from FTS4 to an FTS5 external-content table: `fts5(title, content, content='items', content_rowid='id', tokenize='unicode61')`, with insert/delete/update triggers that index `strip_html(content)`. m15 narrowed the update trigger to `after update of title, content` so read/star changes don't rewrite the index. — [storage/sqlite/migration.go L388-440](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/migration.go)
- Yarr inserts are sorted by `date::guid` and use `insert … on conflict (feed_id, guid) do update set last_arrived = now`. Existing items' content is not updated. — [storage/sqlite/item.go L40-75](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/item.go)
- Yarr retention: never delete starred items, keep at least the 50 latest per feed, and delete items whose `last_arrived` is more than 90 days older than the newest `last_arrived` in the same feed. Anchoring on per-feed `last_arrived` means items still present in the feed are never pruned and can't be re-inserted as new. — [storage/sqlite/item.go L299-335](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/item.go)
- Yarr worker: `NUM_WORKERS = 4`, a user-configurable global refresh-rate ticker (minutes), and a 24-hour maintenance ticker. Yarr implements the Fever API (`src/server/fever.go`), not Google Reader. — [worker/worker.go L14-110](https://github.com/nkanaev/yarr/blob/master/src/worker/worker.go); [server/fever.go](https://github.com/nkanaev/yarr/blob/master/src/server/fever.go)
- TT-RSS: in October 2025 developer Andrew Dolgov announced that tt-rss.org, its git repos and forum would be dismantled on 2025-11-01. A long-time contributor forked it to github.com/tt-rss/tt-rss on 2025-10-03, with docs recreated in the wiki. — [Linuxiac](https://linuxiac.com/tt-rss-shuts-down-but-the-project-lives-on-under-a-new-fork); [AlternativeTo](https://alternativeto.net/news/2025/10/tiny-tiny-rss-to-shut-down-as-developer-ends-project-entirely-by-november-1st-2025)
- Feedbin runs feed refreshing as Sidekiq jobs in a separate "refresher" service so it can be scaled independently. — [feedbin/refresher listing](https://kandi.openweaver.com/ruby/feedbin/refresher) (secondary source)
- NewsBlur (operator replies on its forum, dated) fetches as often as hourly if a feed averages at least one story a day, even with a single subscriber, and every few hours otherwise. It uses push (PubSubHubbub/WebSub) where available, and "insta-fetch" forces a refresh. — [NewsBlur forum](https://forum.newsblur.com/t/how-often-are-feeds-parsing-updateing/3259)

### Inferences
- Copy Yarr's FTS5 setup directly into `library_article_fts`: external content, `unicode61`, triggers limited to `update of title, content`, and HTML stripped before indexing. Elsewhere already plans FTS5 and this is a proven pattern. Consider `remove_diacritics 2`.
- Copy Yarr's `feed_states` split, which puts volatile fetch state (etag, last error, last refreshed) in a separate table from user-edited feed metadata. It fits the core/shell split and keeps hot writes off the main feed row.
- The TT-RSS shutdown supports Elsewhere's "export is a feature" principle and shows bus-factor risk for single-maintainer readers.

### Gaps
- I did not research CommaFeed. I found no primary source on its design within budget.
- Primary Feedbin and NewsBlur source code (scheduling formulas) was not read. Findings rely on secondary listings and old forum posts.

## Client API compatibility (Google Reader vs Fever)

### Takeaway
If Elsewhere implements one sync API, it should be the Google Reader API. FreshRSS lists about 19 clients using GReader and only 2 (Unread, Fiery Feeds) using Fever, and calls Fever "limited features, less efficient, less safe." It is a few thousand lines of work, though, and not needed for phase 1 unless mobile-app access is a goal.

### Cited Findings
- FreshRSS client table, GReader: Capy Reader, Readrops, FeedMe, FocusReader, Read You, Your News, Fluent Reader Lite, FeedFlow, FriRSS, Fluent Reader, RSS Guard, NewsFlash, Newsboat, Vienna RSS, Readkit, Reeder Classic, lire, NetNewsWire (listed "work in progress"). Fever: Unread, Fiery Feeds. — [FreshRSS README](https://github.com/FreshRSS/FreshRSS/blob/edge/README.md)
- FreshRSS mobile docs: "Google Reader API (best)" vs "Fever API (limited features and less efficient)." — [FreshRSS mobile access docs](https://freshrss.github.io/FreshRSS/en/users/06_Mobile_access.html)
- Miniflux implements both, as a GReader "compatibility subset" of about 13 routes, with about 2k lines of Go for GReader and about 0.8k for Fever (see Miniflux section). Yarr implements only Fever. — [miniflux googlereader README](https://github.com/miniflux/v2/blob/main/internal/googlereader/README.md); [yarr fever.go](https://github.com/nkanaev/yarr/blob/master/src/server/fever.go)
- Fever auth is an MD5 token of `username:password` and failures return HTTP 200 `{auth:0}`, which is weak by modern standards. GReader uses ClientLogin and an Auth token. — [miniflux fever README](https://github.com/miniflux/v2/blob/main/internal/fever/README.md)

### Inferences
- Phase 1 recommendation: don't implement either API. Do design the data model so GReader can be added later without migrations:
  - stable integer entry ids (GReader uses 64-bit item ids)
  - categories/folders as labels
  - separate `starred` flag
  - a `changed_at`/`read_at` timestamp for incremental sync (Miniflux indexes `(status, changed_at)`)
  - API-only credentials separate from the web login
- Fever is cheaper to build (it's a single endpoint), but in the FreshRSS client table GReader clients outnumber Fever clients about 19 to 2.

### Gaps
- I didn't verify current (Nov 2026) client support from each app's own docs (for example, whether NetNewsWire's FreshRSS/GReader sync is still "WIP" or whether Unread has added GReader). The FreshRSS README is the only source.
- I found no survey of self-hoster expectations. The "most self-hosters expect a GReader endpoint" claim is inferred from client counts only.

## Storage growth and retention

### Takeaway
Every mature reader prunes by default (Miniflux: read entries after 60 days, unread after 180; FreshRSS: 3 months / max 200 / min 50 per feed; Yarr: 90 days beyond latest arrival, keep 50, never starred). Elsewhere wants permanent archives, so it is going against the norm. It should store text compactly, keep FTS index growth under control, and use tombstones or an archive flag rather than deletion.

### Cited Findings
- Miniflux: 60 days for read and 180 days for unread, in 10,000-row batches, skipping starred and shared entries, with tombstones for deleted entries. — [config/options.go](https://github.com/miniflux/v2/blob/main/internal/config/options.go); [storage/entry.go](https://github.com/miniflux/v2/blob/main/internal/storage/entry.go)
- FreshRSS: `keep_period P3M`, `keep_max 200`, `keep_min 50`, keeps favourites and labelled entries. — [config-user.default.php](https://github.com/FreshRSS/FreshRSS/blob/edge/config-user.default.php)
- Yarr: keep 50 per feed, 90-day window relative to the feed's latest arrival, never starred. — [item.go](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/item.go)
- One Miniflux user found `document_vectors_idx` at 9.7 GB for about 74 MB of entries. Deleting about 9,400 read entries did not shrink it, so the FTS index can dwarf the data. — [miniflux discussion #2056](https://github.com/orgs/miniflux/discussions/2056)
- An unverified third-party guide estimates about 300 MB for 500 feeds with 30-day retention. — [valebyte guide](https://valebyte.com/en/blog/miniflux-on-vps-installation-configuration-and-maintenance/) (low reliability; vendor content)
- FreshRSS: 150 feeds and 22k articles run under 1 s on a Raspberry Pi 1. — [FreshRSS README](https://github.com/FreshRSS/FreshRSS/blob/edge/README.md)

### Inferences
- Rough sizing, my own arithmetic rather than a source: 200 feeds × about 1 post/day × 10–30 KB sanitized HTML ≈ 0.7–2.2 GB of raw content over 10 years, before FTS and embeddings. That is fine for SQLite, but FTS5 external-content tables (as Yarr does) avoid storing text twice. Periodic `PRAGMA optimize`, FTS `optimize` and incremental vacuum should be part of the maintenance job.
- Separate "keep forever" (archive) from "show in timeline". Retention in Elsewhere should never delete feed content by default. If a purge option exists, it should write tombstones (Miniflux pattern) or prune only `content` while keeping metadata and the hash.
- Anchor any retention on per-feed `last_seen` (Yarr/FreshRSS pattern), not on wall-clock time, so items still in the feed document are never purged and re-imported.

### Gaps
- I found no reliable published figure for DB size per feed per year from any project.

## Feed backfilling (older archive posts)

### Takeaway
RFC 5005 is the standard (complete feeds and `prev-archive` links) but is rarely implemented. WordPress reportedly supports paged feeds. Phase 1 doesn't need backfill, but the data model should allow entries with no "arrival in a live poll", recorded with their provenance.

### Cited Findings
- RFC 5005 (2007, Proposed Standard) defines complete feeds (`fh:complete`, where the reader may discard old entries absent from the feed) and archived feeds that link to older documents via `prev-archive`, with `fh:archive` marking archive documents. — [RFC 5005](https://www.rfc-editor.org/rfc/rfc5005)
- A NewsBlur issue proposes checking for `fh:complete` and then following `prev-archive` links until exhausted. — [NewsBlur issue #1109](https://github-redirect.dependabot.com/samuelclay/NewsBlur/issues/1109)
- A jekyll-feed PR implements RFC 5005 complete feeds for small sites and archived feeds for larger ones, and asserts that WordPress automatically enables feed paging. — [jekyll-feed PR #236](https://github-redirect.dependabot.com/jekyll/jekyll-feed/pull/236)

### Inferences
- Add `source` or `provenance` to entries (`poll | backfill:rfc5005 | backfill:wp-paged | backfill:sitemap | backfill:archive.org | manual`) plus `first_seen_at` distinct from `published_at`. Timeline ordering must not assume `first_seen_at ≈ published_at`, or backfilled posts will flood "new".
- Backfilled entries should be inserted as read (or "archive") by default so they don't bury unread items. This is a pure policy function.

### Gaps
- I didn't verify WordPress's `?paged=N` feed behaviour or sitemap/Internet Archive backfill tooling from primary sources. No reader I checked (Miniflux, Yarr, FreshRSS) has backfill in code.

## MVP feature list (what these projects ship and in what shape)

### Takeaway
Across Miniflux, FreshRSS and Yarr, the shared baseline is:
- subscribe with autodiscovery
- OPML import/export
- one level of folders/categories
- unread/read plus starred
- mark all read (by feed, folder, all)
- full-text search
- per-feed error display with manual refresh
- feed icons
- enclosures/media links
- keyboard shortcuts
- a mobile-friendly web UI

Sync APIs and full-text scraping come later or are opt-in.

### Cited Findings
- Miniflux has dedicated `reader/subscription` (discovery) and `reader/opml` (parser, serializer, handler) packages. Its initial schema already had categories, enclosures and icons, while starred, search and the scraper came in later migrations. — [miniflux internal/reader](https://github.com/miniflux/v2/tree/main/internal/reader); [migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- Yarr's minimal model is folders (one level, with an `is_expanded` UI flag), feeds, items (unread/read/starred), settings, and feed_states with errors. It has FTS search, Fever, and a refresh-rate setting. — [yarr migration.go](https://github.com/nkanaev/yarr/blob/master/src/storage/postgres/migration.go); [yarr routes.go](https://github.com/nkanaev/yarr/blob/master/src/server/routes.go)
- Miniflux's later `feeds` columns (user agent, cookie, proxy, ignore cache, disable HTTP/2, self-signed certs) show which per-feed escape hatches users ended up needing. — [migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)

### Inferences
- Phase 1 list, in order:
  1. subscribe by URL with HTML `<link rel=alternate>` discovery
  2. OPML in/out
  3. folders
  4. unread/read and starred as separate flags
  5. mark-all-read with an "up to entry id / timestamp" bound, so new arrivals aren't marked
  6. FTS5 search
  7. feed health/error display and manual refresh
  8. keyboard navigation (j/k, m, s, o)
  9. responsive layout
- Defer: GReader/Fever, scraper (adapter exists but off), rewrite rules, filters, integrations, multi-user.
- The SQLite `feeds_feed` row should include `user_agent_override`/`settings JSON` now, to avoid Miniflux's long tail of ALTERs.

### Gaps
- I found no source documenting the order in which these projects historically shipped features (v1.0 changelogs were not read). The above is inferred from the schema evolution.

## Common bugs and pitfalls

### Takeaway
The recurring failure modes are all visible in the code as defensive fixes:
- non-unique or unstable GUIDs (Miniflux collision handling, FreshRSS auto-degrading unicity)
- entries resurrected after deletion (Miniflux tombstones, Yarr last_arrived)
- server hints that must be clamped (FreshRSS min/max cache and Retry-After)
- Cloudflare challenges (Miniflux detection)
- oversized responses (Miniflux 15 MB cap)
- FTS index bloat (Miniflux #2056)

### Cited Findings
- Same GUID for every item: Miniflux comments that "some feeds ship the same GUID for every entry" and disambiguates later occurrences by URL or position. — [rss/adapter.go](https://github.com/miniflux/v2/blob/main/internal/reader/rss/adapter.go)
- Invalid or blank GUIDs: FreshRSS treats sha1('') as blank and auto-switches identity criteria above a 5% invalid rate. — [Feed.php](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Models/Feed.php)
- Resurrected entries: Miniflux moved from `status='removed'` rows to an `entry_tombstones` table checked on insert. — [migrations.go](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go)
- Cloudflare: Miniflux reports "blocked by Cloudflare challenge" when it sees 403 + `cf-mitigated: challenge` + HTML. — [response_handler.go](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/response_handler.go)
- Rate limits: FreshRSS defaults `Retry-After` to 1500 s when absent and caps it at 172,800 s. Miniflux folds Retry-After, TTL, Cache-Control and Expires into the next check. — [config.default.php](https://github.com/FreshRSS/FreshRSS/blob/edge/config.default.php); [model/feed.go](https://github.com/miniflux/v2/blob/main/internal/model/feed.go)
- Huge feeds: Miniflux caps the response body at 15 MB and times out at 20 s. FreshRSS also times out at 20 s. — [options.go](https://github.com/miniflux/v2/blob/main/internal/config/options.go); [config.default.php](https://github.com/FreshRSS/FreshRSS/blob/edge/config.default.php)
- Content updates: both readers make "update existing entries" a choice. Miniflux has a per-feed `ignore_entry_updates`; FreshRSS has `mark_updated_article_unread=false` with a TODO for ignore/update/update+unread. Yarr ignores updates. — [migrations.go L1441](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go); [config-user.default.php](https://github.com/FreshRSS/FreshRSS/blob/edge/config-user.default.php); [yarr item.go](https://github.com/nkanaev/yarr/blob/master/src/storage/sqlite/item.go)
- Enclosures/podcasts: Miniflux keeps a separate `enclosures` table, later with a unique index on `(user_id, entry_id, sha256(url))` to stop duplicate enclosures. Yarr stores `media_links` as JSON on the item. — [migrations.go L95-105, L736](https://github.com/miniflux/v2/blob/main/internal/database/migrations.go); [yarr migration.go](https://github.com/nkanaev/yarr/blob/master/src/storage/postgres/migration.go)
- FTS bloat: a 9.7 GB tsvector index for 74 MB of entries. — [miniflux discussion #2056](https://github.com/orgs/miniflux/discussions/2056)

### Inferences
- Test fixtures for the pure parser and dedupe functions should include:
  - identical GUIDs across items
  - blank GUIDs
  - GUIDs that change on every fetch, which a link-based fallback should catch
  - missing or invalid dates, where `published_at` falls back to `first_seen_at`
  - non-UTF-8 encodings declared in the XML prolog vs the HTTP header
  - a 15 MB+ body
  - a 403 Cloudflare challenge
  - 429 with and without Retry-After
  - 301 vs 302, where only a permanent redirect should update the stored URL
- Store a content hash separately from the identity hash (FreshRSS has both `guid` and `hash`) so "entry updated" can be detected cheaply without changing identity.

### Gaps
- Timezone/date-parsing and encoding bugs were not mined from issue trackers. No cited examples were gathered, though the fixtures above are standard practice.
- No issue-tracker statistics (counts of duplicate-entry reports, etc.) were collected.
