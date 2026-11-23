import type { Database } from "bun:sqlite";
import type { KnowledgeRepo } from "../../app/ports";
import type { ConceptRef } from "../../core/knowledge/concepts";
import { type Extraction, linkableConcepts, MIN_EXTRACT_WORDS } from "../../core/knowledge/extraction";
import type { ConceptLink } from "../../core/knowledge/related";

export const toBlob = (v: Float32Array) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
/** Copies, so the Float32Array is aligned whatever buffer SQLite handed back. */
export const fromBlob = (b: Uint8Array) => new Float32Array(b.slice().buffer);

const ARTICLE_EXISTS = "EXISTS (SELECT 1 FROM library_article WHERE id = $articleId)";

export function createKnowledgeRepo(db: Database): KnowledgeRepo {
  return {
    pendingEmbeddings(model, limit) {
      return db
        .query<{ id: number; title: string; text: string }, { model: string; limit: number }>(
          `SELECT a.id, a.title, a.text FROM library_article a
           LEFT JOIN knowledge_embedding e ON e.article_id = a.id AND e.model = $model
           WHERE e.article_id IS NULL
           ORDER BY a.sort_at DESC, a.id DESC LIMIT $limit`,
        )
        .all({ model, limit });
    },

    saveEmbeddings(model, rows, now) {
      // The article may have been deleted (feed removed) while we were embedding it.
      const stmt = db.query(
        `INSERT OR REPLACE INTO knowledge_embedding (article_id, model, vector, error, created_at)
         SELECT $articleId, $model, $vector, $error, $now WHERE ${ARTICLE_EXISTS}`,
      );
      db.transaction(() => {
        for (const r of rows) {
          stmt.run({
            articleId: r.articleId,
            model,
            vector: r.vector ? toBlob(r.vector) : null,
            error: r.error,
            now,
          });
        }
      }).immediate();
    },

    embeddingStatus(articleId, model) {
      const row = db
        .query<{ ok: number }, { articleId: number; model: string }>(
          `SELECT vector IS NOT NULL AS ok FROM knowledge_embedding
           WHERE article_id = $articleId AND model = $model`,
        )
        .get({ articleId, model });
      return !row ? "none" : row.ok ? "ok" : "failed";
    },

    vectors(model) {
      return db
        .query<{ id: number; feedId: number; vector: Uint8Array }, { model: string }>(
          `SELECT a.id, a.feed_id AS feedId, e.vector FROM knowledge_embedding e
           JOIN library_article a ON a.id = e.article_id
           WHERE e.model = $model AND e.vector IS NOT NULL`,
        )
        .all({ model })
        .map((r) => ({ ...r, vector: fromBlob(r.vector) }));
    },

    pendingExtractions(model, promptVersion, limit) {
      return db
        .query<{ id: number; title: string; text: string }, Record<string, string | number>>(
          `SELECT a.id, a.title, a.text FROM library_article a
           LEFT JOIN knowledge_extraction x
             ON x.article_id = a.id AND x.model = $model AND x.prompt_version = $promptVersion
           WHERE x.article_id IS NULL AND a.word_count >= $minWords
           ORDER BY a.sort_at DESC, a.id DESC LIMIT $limit`,
        )
        .all({ model, promptVersion, minWords: MIN_EXTRACT_WORDS, limit });
    },

    knownLabels(keys) {
      const rows = db
        .query<{ label: string; conceptId: number }, { keys: string }>(
          `SELECT label, concept_id AS conceptId FROM knowledge_concept_label
           WHERE label IN (SELECT value FROM json_each($keys))`,
        )
        .all({ keys: JSON.stringify(keys) });
      return new Map(rows.map((r) => [r.label, r.conceptId]));
    },

    conceptVectors(model) {
      return db
        .query<{ id: number; vector: Uint8Array }, { model: string }>(
          "SELECT id, vector FROM knowledge_concept WHERE model = $model",
        )
        .all({ model })
        .map((r) => ({ id: r.id, vector: fromBlob(r.vector) }));
    },

    saveExtractions(meta, results, now) {
      // On conflict a failure keeps earlier data and its links; a success replaces data and re-queues linking.
      const stmt = db.query(
        `INSERT INTO knowledge_extraction (article_id, model, prompt_version, data, error, linked_at, created_at)
         SELECT $articleId, $model, $promptVersion, $data, $error, NULL, $now WHERE ${ARTICLE_EXISTS}
         ON CONFLICT (article_id) DO UPDATE SET
           model = excluded.model, prompt_version = excluded.prompt_version, error = excluded.error,
           created_at = excluded.created_at,
           data = coalesce(excluded.data, data),
           linked_at = CASE WHEN excluded.data IS NULL THEN linked_at ELSE NULL END`,
      );
      db.transaction(() => {
        for (const r of results) {
          stmt.run({
            articleId: r.articleId,
            model: meta.model,
            promptVersion: meta.promptVersion,
            data: r.data ? JSON.stringify(r.data) : null,
            error: r.error,
            now,
          });
        }
      }).immediate();
    },

    unlinked(limit) {
      return db
        .query<{ articleId: number; data: string; title: string; text: string }, { limit: number }>(
          `SELECT x.article_id AS articleId, x.data, a.title, a.text
           FROM knowledge_extraction x JOIN library_article a ON a.id = x.article_id
           WHERE x.data IS NOT NULL AND x.linked_at IS NULL ORDER BY x.article_id DESC LIMIT $limit`,
        )
        .all({ limit })
        .map(({ data, ...r }) => {
          const e = JSON.parse(data) as Extraction;
          // Extractions from before points existed have none.
          return { ...r, concepts: linkableConcepts(e), points: e.points ?? [] };
        });
    },

    saveLinks(embeddingModel, articleIds, plan, points, now) {
      const labelId = db.query<{ id: number }, { label: string }>(
        "SELECT concept_id AS id FROM knowledge_concept_label WHERE label = $label",
      );
      const insertConcept = db.query<
        { id: number },
        { label: string; model: string; vector: Uint8Array; now: number }
      >(
        `INSERT INTO knowledge_concept (label, model, vector, created_at)
         VALUES ($label, $model, $vector, $now) RETURNING id`,
      );
      const insertLabel = db.query(
        "INSERT OR IGNORE INTO knowledge_concept_label (label, concept_id) VALUES ($label, $conceptId)",
      );
      const clearLinks = db.query("DELETE FROM knowledge_article_concept WHERE article_id = $articleId");
      const insertLink = db.query(
        `INSERT OR REPLACE INTO knowledge_article_concept (article_id, concept_id, weight)
         SELECT $articleId, $conceptId, $weight WHERE ${ARTICLE_EXISTS}`,
      );
      const markLinked = db.query(
        "UPDATE knowledge_extraction SET linked_at = $now WHERE article_id = $articleId",
      );
      const clearPoints = db.query("DELETE FROM knowledge_point WHERE article_id = $articleId");
      const insertPoint = db.query(
        `INSERT INTO knowledge_point (article_id, kind, subject, statement, evidence, quote, model, vector, created_at)
         SELECT $articleId, $kind, $subject, $statement, $evidence, $quote, $model, $vector, $now WHERE ${ARTICLE_EXISTS}`,
      );

      db.transaction(() => {
        // Another run may have created the same concept since this plan was made: reuse it.
        const created = plan.created.map(
          (c) =>
            labelId.get({ label: c.key })?.id ??
            (insertConcept.get({ label: c.label, model: embeddingModel, vector: toBlob(c.vector), now })
              ?.id as number),
        );
        const idOf = (ref: ConceptRef) => ("id" in ref ? ref.id : (created[ref.created] as number));
        for (const l of plan.labels) insertLabel.run({ label: l.key, conceptId: idOf(l.concept) });
        for (const articleId of articleIds) {
          clearLinks.run({ articleId });
          clearPoints.run({ articleId });
          markLinked.run({ articleId, now });
        }
        for (const { articleId, point, vector } of points) {
          insertPoint.run({ articleId, ...point, model: embeddingModel, vector: toBlob(vector), now });
        }
        for (const l of plan.links) {
          insertLink.run({ articleId: l.articleId, conceptId: idOf(l.concept), weight: l.weight });
        }
      }).immediate();
    },

    conceptLinks(articleIds) {
      const rows = db
        .query<Omit<ConceptLink, "vector"> & { articleId: number; vector: Uint8Array }, { ids: string }>(
          `SELECT ac.article_id AS articleId, c.id, c.label, ac.weight, c.vector,
                  (SELECT count(*) FROM knowledge_article_concept x WHERE x.concept_id = c.id) AS df
           FROM knowledge_article_concept ac JOIN knowledge_concept c ON c.id = ac.concept_id
           WHERE ac.article_id IN (SELECT value FROM json_each($ids))`,
        )
        .all({ ids: JSON.stringify(articleIds) });
      const out = new Map<number, ConceptLink[]>();
      for (const { articleId, vector, ...link } of rows) {
        out.set(articleId, [...(out.get(articleId) ?? []), { ...link, vector: fromBlob(vector) }]);
      }
      return out;
    },

    extractedCount() {
      return (
        db
          .query<{ n: number }, []>("SELECT count(*) AS n FROM knowledge_extraction WHERE data IS NOT NULL")
          .get()?.n ?? 0
      );
    },

    recordRelatedClick({ fromId, toId, rank }, now) {
      return (
        db
          .query(
            `INSERT INTO knowledge_related_click (from_id, to_id, rank, at)
             SELECT $fromId, $toId, $rank, $now
             WHERE EXISTS (SELECT 1 FROM library_article WHERE id = $fromId)
               AND EXISTS (SELECT 1 FROM library_article WHERE id = $toId)`,
          )
          .run({ fromId, toId, rank, now }).changes > 0
      );
    },
  };
}
