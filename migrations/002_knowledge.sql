-- Knowledge context: article embeddings, LLM extractions and the shared concept list --------

-- One vector per article for the current embedding model. A row with a NULL vector records a
-- permanent failure (e.g. the provider rejected the text) so the article isn't retried forever.
CREATE TABLE knowledge_embedding (
  article_id  INTEGER PRIMARY KEY REFERENCES library_article(id) ON DELETE CASCADE,
  model       TEXT    NOT NULL,
  vector      BLOB,              -- Float32, unit length
  error       TEXT,
  created_at  INTEGER NOT NULL
);

-- The raw structured extraction per article: the source of truth that the concept links are
-- derived from. A new prompt version or model means re-extracting, not migrating. Linking is a
-- separate step (linked_at), so a failure there never throws away a paid LLM call.
CREATE TABLE knowledge_extraction (
  article_id     INTEGER PRIMARY KEY REFERENCES library_article(id) ON DELETE CASCADE,
  model          TEXT    NOT NULL,
  prompt_version INTEGER NOT NULL,
  data           TEXT,             -- JSON, see core/knowledge/extraction.ts; NULL if never succeeded
  error          TEXT,             -- the latest failure, if any
  linked_at      INTEGER,          -- when concept links were derived from `data`; NULL = pending
  created_at     INTEGER NOT NULL
);
CREATE INDEX knowledge_extraction_unlinked ON knowledge_extraction (article_id) WHERE data IS NOT NULL AND linked_at IS NULL;

-- Shared concepts. `vector` embeds the label with `model`, for matching new labels.
CREATE TABLE knowledge_concept (
  id          INTEGER PRIMARY KEY,
  label       TEXT    NOT NULL,
  model       TEXT    NOT NULL,
  vector      BLOB    NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Every normalized label ever seen, mapped to its concept: the canonical label and its variants.
CREATE TABLE knowledge_concept_label (
  label       TEXT    PRIMARY KEY,
  concept_id  INTEGER NOT NULL REFERENCES knowledge_concept(id) ON DELETE CASCADE
);

CREATE TABLE knowledge_article_concept (
  article_id  INTEGER NOT NULL REFERENCES library_article(id) ON DELETE CASCADE,
  concept_id  INTEGER NOT NULL REFERENCES knowledge_concept(id) ON DELETE CASCADE,
  weight      REAL    NOT NULL,     -- 1 main topic … 0.3 passing mention
  PRIMARY KEY (article_id, concept_id)
);
CREATE INDEX knowledge_article_concept_concept ON knowledge_article_concept (concept_id);

-- Which related picks were opened, for tuning the rail later. Stars and reads live on the article.
CREATE TABLE knowledge_related_click (
  id          INTEGER PRIMARY KEY,
  from_id     INTEGER NOT NULL REFERENCES library_article(id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES library_article(id) ON DELETE CASCADE,
  rank        INTEGER NOT NULL,
  at          INTEGER NOT NULL
);
