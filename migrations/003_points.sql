-- Points: the specific things an article says (argument, finding, fact, explanation, advice),
-- derived from knowledge_extraction.data during linking. Only points whose quote was found in the
-- article are stored. `vector` embeds "subject: statement" for matching points across articles.
CREATE TABLE knowledge_point (
  id          INTEGER PRIMARY KEY,
  article_id  INTEGER NOT NULL REFERENCES library_article(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  subject     TEXT    NOT NULL,
  statement   TEXT    NOT NULL,
  evidence    TEXT    NOT NULL,
  quote       TEXT    NOT NULL,
  model       TEXT    NOT NULL,
  vector      BLOB    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX knowledge_point_article ON knowledge_point (article_id);
