-- Feeds context ------------------------------------------------------------

CREATE TABLE feeds_feed (
  id          INTEGER PRIMARY KEY,
  url         TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  site_url    TEXT,
  created_at  INTEGER NOT NULL
);

-- Volatile fetch state lives apart from the feed row (Yarr's split).
CREATE TABLE feeds_feed_state (
  feed_id           INTEGER PRIMARY KEY REFERENCES feeds_feed(id) ON DELETE CASCADE,
  etag              TEXT,
  last_modified     TEXT,
  health            TEXT    NOT NULL DEFAULT 'ok' CHECK (health IN ('ok', 'failing', 'paused', 'gone')),
  error_count       INTEGER NOT NULL DEFAULT 0,
  parse_error_count INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  last_fetched_at   INTEGER,
  next_check_at     INTEGER
);
CREATE INDEX feeds_feed_state_due ON feeds_feed_state (next_check_at);

CREATE TABLE feeds_entry (
  id            INTEGER PRIMARY KEY,
  feed_id       INTEGER NOT NULL REFERENCES feeds_feed(id) ON DELETE CASCADE,
  key           TEXT    NOT NULL,  -- identity within the feed, see core/feeds/identity.ts
  guid          TEXT,
  url           TEXT,
  title         TEXT,
  author        TEXT,
  published_at  INTEGER,
  content_html  TEXT,
  first_seen_at INTEGER NOT NULL,
  UNIQUE (feed_id, key)
);
CREATE INDEX feeds_entry_recent ON feeds_entry (feed_id, first_seen_at);

-- Library context ----------------------------------------------------------

CREATE TABLE library_article (
  id            INTEGER PRIMARY KEY,
  entry_id      INTEGER NOT NULL UNIQUE REFERENCES feeds_entry(id) ON DELETE CASCADE,
  feed_id       INTEGER NOT NULL REFERENCES feeds_feed(id) ON DELETE CASCADE,
  url           TEXT,
  title         TEXT    NOT NULL,
  author        TEXT,
  html          TEXT    NOT NULL,  -- sanitized
  text          TEXT    NOT NULL,  -- plain text, for search
  excerpt       TEXT    NOT NULL,
  word_count    INTEGER NOT NULL,
  published_at  INTEGER,
  sort_at       INTEGER NOT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,
  read_at       INTEGER,
  starred       INTEGER NOT NULL DEFAULT 0,  -- separate from read: an article can be both
  starred_at    INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX library_article_timeline ON library_article (sort_at DESC, id DESC);
CREATE INDEX library_article_feed     ON library_article (feed_id, sort_at DESC, id DESC);
CREATE INDEX library_article_unread   ON library_article (is_read, sort_at DESC, id DESC);
CREATE INDEX library_article_starred  ON library_article (starred, sort_at DESC, id DESC);

-- External-content FTS: the text is stored once, in library_article.
CREATE VIRTUAL TABLE library_article_fts USING fts5 (
  title, text,
  content = 'library_article', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER library_article_fts_ai AFTER INSERT ON library_article BEGIN
  INSERT INTO library_article_fts (rowid, title, text) VALUES (new.id, new.title, new.text);
END;
CREATE TRIGGER library_article_fts_ad AFTER DELETE ON library_article BEGIN
  INSERT INTO library_article_fts (library_article_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
END;
-- Only title/text changes touch the index; marking read does not.
CREATE TRIGGER library_article_fts_au AFTER UPDATE OF title, text ON library_article BEGIN
  INSERT INTO library_article_fts (library_article_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
  INSERT INTO library_article_fts (rowid, title, text) VALUES (new.id, new.title, new.text);
END;

-- System -------------------------------------------------------------------

CREATE TABLE jobs (
  id           INTEGER PRIMARY KEY,
  kind         TEXT    NOT NULL,
  payload      TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  run_at       INTEGER NOT NULL,
  locked_until INTEGER,
  last_error   TEXT,
  dedupe_key   TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX jobs_due ON jobs (status, run_at);
-- At most one pending job per dedupe key. Finished jobs are deleted; failed ones are kept for inspection.
CREATE UNIQUE INDEX jobs_dedupe ON jobs (dedupe_key) WHERE status IN ('queued', 'running');

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
