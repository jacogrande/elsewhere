import { embedJob, extractJob } from "../core/jobs/types";
import { MATCH_THRESHOLD, normalizeLabel, planConcepts, unseenLabels } from "../core/knowledge/concepts";
import {
  EXTRACTION_SYSTEM,
  type Extraction,
  extractionInput,
  extractionSchema,
  PROMPT_VERSION,
} from "../core/knowledge/extraction";
import { nearest, RELATED, rankRelated, type SharedConcept } from "../core/knowledge/related";
import { embeddingText } from "../core/knowledge/vector";
import { err, ok, type Result } from "../core/shared/result";
import type { ArticleNotFound } from "./library";
import type {
  Ai,
  AiError,
  ArticleListItem,
  ArticleRepo,
  ArticleText,
  JobQueue,
  KnowledgeRepo,
  System,
} from "./ports";

type Deps = { knowledge: KnowledgeRepo; system: System; ai: Ai | null };

const EMBED_BATCH = 32;
/** Extraction calls run in parallel, this many at a time. */
const EXTRACT_BATCH = 8;
const LINK_BATCH = 64;
/**
 * A run stops starting new batches after this long, so even with one slow batch it ends well
 * inside the worker's 5-minute lease. The scheduler enqueues the next run a minute later.
 */
const RUN_BUDGET_MS = 90_000;

/**
 * When every input in a batch is "rejected", the inputs aren't the problem: it's almost always the
 * configuration (a mistyped model id, an unsupported parameter). Back off instead of recording every
 * article as failed.
 */
const systemic = (e: AiError): AiError => ({
  type: "unavailable",
  retryable: true,
  detail: `every input was refused, so this is likely a configuration problem: ${e.type}: ${e.detail}`,
});

/** Enqueues embedding and extraction runs when articles are waiting for them. Called every minute. */
export const enqueueKnowledgeWork = (deps: Deps & { jobs: JobQueue }) => (): number => {
  if (!deps.ai) return 0;
  const now = deps.system.now();
  let enqueued = 0;
  if (deps.knowledge.pendingEmbeddings(deps.ai.embedder.model, 1).length) {
    deps.jobs.enqueue(embedJob(), now);
    enqueued++;
  }
  if (
    deps.knowledge.pendingExtractions(deps.ai.llm.model, PROMPT_VERSION, 1).length ||
    deps.knowledge.unlinked(1).length
  ) {
    deps.jobs.enqueue(extractJob(), now);
    enqueued++;
  }
  return enqueued;
};

/** Embeds articles that have no vector yet. A text the provider rejects is recorded and skipped. */
export const embedPending =
  (deps: Deps) => async (): Promise<Result<{ embedded: number; failed: number }, AiError>> => {
    const done = { embedded: 0, failed: 0 };
    if (!deps.ai) return ok(done);
    const { embedder } = deps.ai;
    type Row = { articleId: number; vector: Float32Array | null; error: string | null };
    const save = (rows: Row[]) => {
      deps.knowledge.saveEmbeddings(embedder.model, rows, deps.system.now());
      for (const r of rows) r.vector ? done.embedded++ : done.failed++;
    };

    const deadline = deps.system.now() + RUN_BUDGET_MS;
    while (deps.system.now() < deadline) {
      const batch = deps.knowledge.pendingEmbeddings(embedder.model, EMBED_BATCH);
      if (batch.length === 0) break;
      const result = await embedder.embed(batch.map(embeddingText));
      if (result.ok) {
        save(batch.map((a, j) => ({ articleId: a.id, vector: result.value[j] ?? null, error: null })));
      } else if (result.error.retryable) {
        return err(result.error);
      } else {
        // One bad text fails the whole batch: retry one at a time to find it.
        const rows: Row[] = [];
        for (const a of batch) {
          if (deps.system.now() >= deadline) break;
          const one = await embedder.embed([embeddingText(a)]);
          if (!one.ok && one.error.retryable) return err(one.error);
          rows.push(
            one.ok
              ? { articleId: a.id, vector: one.value[0] ?? null, error: null }
              : { articleId: a.id, vector: null, error: `${one.error.type}: ${one.error.detail}` },
          );
        }
        if (batch.length > 1 && rows.length === batch.length && rows.every((r) => !r.vector)) {
          return err(systemic(result.error));
        }
        save(rows);
      }
      if (batch.length < EMBED_BATCH) break;
    }
    return ok(done);
  };

/**
 * Links stored extractions to shared concepts. Separate from extraction, so if embedding the labels
 * fails, the paid extraction is already saved and only this cheap step is retried.
 */
const linkPending =
  (deps: Deps & { ai: Ai }) =>
  async (deadline: number): Promise<Result<number, AiError>> => {
    const { embedder } = deps.ai;
    let newConcepts = 0;
    while (deps.system.now() < deadline) {
      const extractions = deps.knowledge.unlinked(LINK_BATCH);
      if (extractions.length === 0) break;
      const keys = [...new Set(extractions.flatMap((e) => e.concepts.map((c) => normalizeLabel(c.label))))];
      const known = deps.knowledge.knownLabels(keys);
      const unseen = unseenLabels(extractions, new Set(known.keys()));
      const vectors = unseen.length ? await embedder.embed(unseen.map((u) => u.label)) : ok([]);
      if (!vectors.ok) return vectors;
      const plan = planConcepts({
        extractions,
        known,
        unseen: unseen.map((u, j) => ({ ...u, vector: vectors.value[j] as Float32Array })),
        existing: deps.knowledge.conceptVectors(embedder.model),
        threshold: MATCH_THRESHOLD,
      });
      deps.knowledge.saveLinks(
        embedder.model,
        extractions.map((e) => e.articleId),
        plan,
        deps.system.now(),
      );
      newConcepts += plan.created.length;
      if (extractions.length < LINK_BATCH) break;
    }
    return ok(newConcepts);
  };

/** Extracts concepts (and the rest of the schema) from articles, then links them to shared concepts. */
export const extractPending =
  (deps: Deps) =>
  async (): Promise<Result<{ extracted: number; failed: number; newConcepts: number }, AiError>> => {
    const done = { extracted: 0, failed: 0, newConcepts: 0 };
    if (!deps.ai) return ok(done);
    const { llm } = deps.ai;
    const link = linkPending({ ...deps, ai: deps.ai });
    const deadline = deps.system.now() + RUN_BUDGET_MS;

    // Finish linking anything a previous run extracted but couldn't link.
    const leftover = await link(deadline);
    if (!leftover.ok) return leftover;
    done.newConcepts += leftover.value;

    while (deps.system.now() < deadline) {
      const batch = deps.knowledge.pendingExtractions(llm.model, PROMPT_VERSION, EXTRACT_BATCH);
      if (batch.length === 0) break;
      const replies = await Promise.all(
        batch.map((a) =>
          llm.generate({ system: EXTRACTION_SYSTEM, input: extractionInput(a), schema: extractionSchema }),
        ),
      );
      const results: { articleId: number; data: Extraction | null; error: string | null }[] = [];
      let stop: AiError | null = null;
      replies.forEach((r, j) => {
        const articleId = (batch[j] as ArticleText).id;
        if (r.ok) results.push({ articleId, data: r.value, error: null });
        else if (r.error.retryable) stop ??= r.error;
        else results.push({ articleId, data: null, error: `${r.error.type}: ${r.error.detail}` });
      });
      const first = replies[0];
      if (
        batch.length > 1 &&
        first &&
        !first.ok &&
        results.length === batch.length &&
        results.every((r) => !r.data)
      ) {
        return err(systemic(first.error));
      }

      deps.knowledge.saveExtractions(
        { model: llm.model, promptVersion: PROMPT_VERSION },
        results,
        deps.system.now(),
      );
      for (const r of results) r.data ? done.extracted++ : done.failed++;
      const linked = await link(Number.POSITIVE_INFINITY); // always link what was just paid for
      if (!linked.ok) return linked;
      done.newConcepts += linked.value;
      if (stop) return err(stop);
      if (batch.length < EXTRACT_BATCH) break;
    }
    return ok(done);
  };

export type RelatedItem = ArticleListItem & { kind: "conceptual" | "semantic"; shared: SharedConcept[] };
/** `off`: no AI configured. `pending`: this article isn't embedded yet (a failed embedding is `ready`, empty). */
export type RelatedReading =
  | { status: "off" }
  | { status: "pending" }
  | { status: "ready"; items: RelatedItem[] };

export const relatedArticles =
  (deps: Pick<Deps, "knowledge" | "ai"> & { articles: ArticleRepo }) =>
  (id: number): Result<RelatedReading, ArticleNotFound> => {
    if (deps.articles.byIds([id]).length === 0) return err({ type: "article_not_found" });
    if (!deps.ai) return ok({ status: "off" });

    // Check status first: the client polls while pending, and loading every vector isn't free.
    const status = deps.knowledge.embeddingStatus(id, deps.ai.embedder.model);
    if (status === "none") return ok({ status: "pending" });
    const all = status === "ok" ? deps.knowledge.vectors(deps.ai.embedder.model) : [];
    const target = all.find((a) => a.id === id);
    if (!target) return ok({ status: "ready", items: [] });

    const near = nearest(target, all, RELATED.k, RELATED.perFeed);
    const links = deps.knowledge.conceptLinks([id, ...near.map((c) => c.id)]);
    const ranked = rankRelated({
      n: RELATED.n,
      similarN: RELATED.similarN,
      lambda: RELATED.lambda,
      conceptBoost: RELATED.conceptBoost,
      minSimilarity: RELATED.minSimilarity,
      maxSimilarity: RELATED.maxSimilarity,
      closeConcept: RELATED.closeConcept,
      target: { concepts: links.get(id) ?? [] },
      candidates: near.map((c) => ({ ...c, concepts: links.get(c.id) ?? [] })),
      totalArticles: deps.knowledge.extractedCount(),
    });
    const byId = new Map(deps.articles.byIds(ranked.map((r) => r.id)).map((a) => [a.id, a]));
    const items = ranked.flatMap((r) => {
      const article = byId.get(r.id);
      return article ? [{ ...article, kind: r.kind, shared: r.shared }] : [];
    });
    return ok({ status: "ready", items });
  };

export const recordRelatedClick =
  (deps: Pick<Deps, "knowledge" | "system">) =>
  (click: { fromId: number; toId: number; rank: number }): Result<null, ArticleNotFound> =>
    deps.knowledge.recordRelatedClick(click, deps.system.now())
      ? ok(null)
      : err({ type: "article_not_found" });
