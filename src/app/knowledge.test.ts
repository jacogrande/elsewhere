import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { createArticleRepo } from "../adapters/sqlite/article-repo";
import { testDatabase } from "../adapters/sqlite/db";
import { createJobStore } from "../adapters/sqlite/jobs";
import { createKnowledgeRepo } from "../adapters/sqlite/knowledge-repo";
import { fakeSystem } from "../adapters/system/system";
import { type Extraction, PROMPT_VERSION } from "../core/knowledge/extraction";
import type { ConceptLink } from "../core/knowledge/related";
import { normalize } from "../core/knowledge/vector";
import { err, ok } from "../core/shared/result";
import {
  embedPending,
  enqueueKnowledgeWork,
  extractPending,
  recordRelatedClick,
  relatedArticles,
} from "./knowledge";
import type { Ai, AiError, Embedder, LanguageModel } from "./ports";

// Fake AI ----------------------------------------------------------------------------------
// The embedder counts topic words, so texts about the same topic are close. Labels it hasn't been
// told about get a vector of their own (a fresh dimension), so they never match anything.

const TOPICS = ["queue", "local", "design", "memory"];
const DIMS = 32;
let fresh = TOPICS.length;
const labelVectors = new Map<string, number[]>();

function fakeVector(text: string): Float32Array {
  const lower = text.toLowerCase();
  const preset = labelVectors.get(lower);
  const v = new Float32Array(DIMS);
  if (preset) v.set(preset);
  else {
    for (const [i, t] of TOPICS.entries()) v[i] = lower.split(t).length - 1;
    if (v.every((x) => x === 0)) {
      if (fresh >= DIMS) throw new Error("fake embedder ran out of fresh dimensions");
      v[fresh++] = 1;
    }
  }
  return normalize(v);
}

function fakeEmbedder(fail?: (texts: string[]) => AiError | null): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: "fake-embed",
    calls,
    async embed(texts) {
      calls.push(texts);
      const e = fail?.(texts);
      return e ? err(e) : ok(texts.map(fakeVector));
    },
  };
}

/** Replies with the concepts listed for the article's title, or an error. */
function fakeLlm(
  byTitle: Record<string, Extraction["concepts"] | AiError>,
): LanguageModel & { calls: number } {
  return {
    model: "fake-llm",
    calls: 0,
    async generate<T>(req: { input: string }) {
      this.calls++;
      const title = req.input.match(/<title>(.*)<\/title>/)?.[1] ?? "";
      const r = byTitle[title] ?? [];
      if ("type" in r) return err(r);
      return ok({ concepts: r, entities: [], claims: [], questions: [] } as T);
    },
  };
}

// Fixtures ---------------------------------------------------------------------------------

let db: Database;
let system: ReturnType<typeof fakeSystem>;
const words = (topic: string) => `${topic} `.repeat(100);

/** Inserts feeds and articles directly; returns article ids by title. */
function seed(articles: { feed: number; title: string; text: string }[]) {
  const ids: Record<string, number> = {};
  for (const feed of new Set(articles.map((a) => a.feed))) {
    db.query("INSERT INTO feeds_feed (id, url, title, created_at) VALUES (?, ?, ?, 0)").run(
      feed,
      `https://f${feed}.test/feed`,
      `Feed ${feed}`,
    );
  }
  articles.forEach((a, i) => {
    const entry = db
      .query<{ id: number }, [number, string]>(
        "INSERT INTO feeds_entry (feed_id, key, first_seen_at) VALUES (?, ?, 0) RETURNING id",
      )
      .get(a.feed, `k${i}`) as { id: number };
    ids[a.title] = (
      db
        .query<{ id: number }, [number, number, string, string, number, number]>(
          `INSERT INTO library_article (entry_id, feed_id, title, html, text, excerpt, word_count, sort_at, created_at)
           VALUES (?, ?, ?, '', ?, '', ?, ?, 0) RETURNING id`,
        )
        .get(entry.id, a.feed, a.title, a.text, a.text.split(" ").length, i) as { id: number }
    ).id;
  });
  return ids;
}

const deps = (ai: Ai | null) => ({
  knowledge: createKnowledgeRepo(db),
  articles: createArticleRepo(db),
  jobs: createJobStore(db),
  system,
  ai,
});

beforeEach(() => {
  db = testDatabase();
  system = fakeSystem();
  labelVectors.clear();
  fresh = TOPICS.length;
});

// Tests ------------------------------------------------------------------------------------

describe("embedPending", () => {
  test("embeds every article once", async () => {
    seed([
      { feed: 1, title: "A", text: words("queue") },
      { feed: 2, title: "B", text: words("local") },
    ]);
    const embedder = fakeEmbedder();
    const d = deps({ embedder, llm: fakeLlm({}) });
    expect(await embedPending(d)()).toEqual(ok({ embedded: 2, failed: 0 }));
    expect(await embedPending(d)()).toEqual(ok({ embedded: 0, failed: 0 }));
    expect(d.knowledge.vectors("fake-embed")).toHaveLength(2);
  });

  test("when the provider rejects a batch, finds the bad text and records it as failed", async () => {
    seed([
      { feed: 1, title: "Good", text: words("queue") },
      { feed: 1, title: "Poison", text: words("local") },
    ]);
    const embedder = fakeEmbedder((texts) =>
      texts.some((t) => t.startsWith("Poison"))
        ? { type: "rejected", retryable: false, detail: "nope" }
        : null,
    );
    const d = deps({ embedder, llm: fakeLlm({}) });
    expect(await embedPending(d)()).toEqual(ok({ embedded: 1, failed: 1 }));
    expect(d.knowledge.pendingEmbeddings("fake-embed", 10)).toEqual([]);
  });

  test("when every text is refused it's a configuration problem: back off, record nothing", async () => {
    seed([
      { feed: 1, title: "A", text: words("queue") },
      { feed: 1, title: "B", text: words("local") },
    ]);
    const embedder = fakeEmbedder(() => ({ type: "rejected", retryable: false, detail: "unknown model" }));
    const d = deps({ embedder, llm: fakeLlm({}) });
    expect(await embedPending(d)()).toMatchObject({
      ok: false,
      error: { type: "unavailable", retryable: true },
    });
    expect(d.knowledge.pendingEmbeddings("fake-embed", 10)).toHaveLength(2);
  });

  test("stops starting batches once the run's time budget is spent", async () => {
    seed(Array.from({ length: 40 }, (_, i) => ({ feed: 1, title: `A${i}`, text: words("queue") })));
    const slow = fakeEmbedder(() => {
      system.advance(100_000);
      return null;
    });
    const d = deps({ embedder: slow, llm: fakeLlm({}) });
    expect(await embedPending(d)()).toEqual(ok({ embedded: 32, failed: 0 }));
    expect(await embedPending(d)()).toEqual(ok({ embedded: 8, failed: 0 }));
  });

  test("stops on a retryable failure and leaves the articles pending", async () => {
    seed([{ feed: 1, title: "A", text: words("queue") }]);
    const embedder = fakeEmbedder(() => ({ type: "rate_limited", retryable: true, detail: "slow" }));
    const d = deps({ embedder, llm: fakeLlm({}) });
    expect(await embedPending(d)()).toMatchObject({ ok: false, error: { type: "rate_limited" } });
    expect(d.knowledge.pendingEmbeddings("fake-embed", 10)).toHaveLength(1);
  });
});

describe("extractPending", () => {
  test("links articles to shared concepts, merging label variants", async () => {
    const ids = seed([
      { feed: 1, title: "A", text: words("queue") },
      { feed: 2, title: "B", text: words("queue") },
    ]);
    labelVectors.set("queueing theory", [1, 0, 0, 0]);
    labelVectors.set("queue theory", [0.98, 0.05, 0, 0]);
    const llm = fakeLlm({
      A: [
        { label: "Queueing theory", salience: "main" },
        { label: "Load shedding", salience: "mention" },
      ],
      B: [{ label: "Queue theory", salience: "supporting" }],
    });
    const d = deps({ embedder: fakeEmbedder(), llm });
    expect(await extractPending(d)()).toEqual(ok({ extracted: 2, failed: 0, newConcepts: 2 }));

    const links = d.knowledge.conceptLinks([ids.A as number, ids.B as number]);
    const strip = (cs: ConceptLink[] = []) => cs.map(({ vector: _, ...c }) => c);
    const a = strip(links.get(ids.A as number));
    const b = strip(links.get(ids.B as number));
    // Newest first: B is extracted first, so its spelling becomes the concept's label.
    expect(b).toEqual([{ id: 1, label: "Queue theory", weight: 0.6, df: 2 }]);
    expect(a).toContainEqual({ id: 1, label: "Queue theory", weight: 1, df: 2 });
    expect(a).toContainEqual({ id: 2, label: "Load shedding", weight: 0.3, df: 1 });
    expect(d.knowledge.knownLabels(["queueing theory"]).get("queueing theory")).toBe(1);
  });

  test("an article the model can't handle is recorded and not retried", async () => {
    seed([{ feed: 1, title: "A", text: words("queue") }]);
    const llm = fakeLlm({ A: { type: "invalid_response", retryable: false, detail: "bad json" } });
    const d = deps({ embedder: fakeEmbedder(), llm });
    expect(await extractPending(d)()).toEqual(ok({ extracted: 0, failed: 1, newConcepts: 0 }));
    expect(d.knowledge.pendingExtractions("fake-llm", PROMPT_VERSION, 10)).toEqual([]);
  });

  test("a retryable failure keeps the rest of the batch and leaves that article pending", async () => {
    const ids = seed([
      { feed: 1, title: "A", text: words("queue") },
      { feed: 1, title: "B", text: words("local") },
    ]);
    const llm = fakeLlm({
      A: [{ label: "Queueing theory", salience: "main" }],
      B: { type: "unavailable", retryable: true, detail: "503" },
    });
    const d = deps({ embedder: fakeEmbedder(), llm });
    expect(await extractPending(d)()).toMatchObject({ ok: false, error: { type: "unavailable" } });
    expect(d.knowledge.pendingExtractions("fake-llm", PROMPT_VERSION, 10).map((a) => a.id)).toEqual([
      ids.B as number,
    ]);
  });

  test("when every reply is refused it's a configuration problem: back off, record nothing", async () => {
    seed([
      { feed: 1, title: "A", text: words("queue") },
      { feed: 1, title: "B", text: words("local") },
    ]);
    const refused: AiError = { type: "rejected", retryable: false, detail: "unknown model" };
    const d = deps({ embedder: fakeEmbedder(), llm: fakeLlm({ A: refused, B: refused }) });
    expect(await extractPending(d)()).toMatchObject({
      ok: false,
      error: { type: "unavailable", retryable: true },
    });
    expect(d.knowledge.pendingExtractions("fake-llm", PROMPT_VERSION, 10)).toHaveLength(2);
  });

  test("if linking fails, the extraction is kept and later linked without calling the LLM again", async () => {
    const ids = seed([{ feed: 1, title: "A", text: words("queue") }]);
    const llm = fakeLlm({ A: [{ label: "Load shedding", salience: "main" }] });
    let down = true;
    const embedder = fakeEmbedder(() =>
      down ? { type: "unavailable", retryable: true, detail: "503" } : null,
    );
    const d = deps({ embedder, llm });

    expect(await extractPending(d)()).toMatchObject({ ok: false, error: { type: "unavailable" } });
    expect(d.knowledge.pendingExtractions("fake-llm", PROMPT_VERSION, 10)).toEqual([]);
    expect(d.knowledge.unlinked(10)).toHaveLength(1);
    expect(db.query("SELECT kind FROM jobs WHERE kind = 'knowledge.extract'").all()).toEqual([]);
    enqueueKnowledgeWork(d)();
    expect(db.query("SELECT kind FROM jobs WHERE kind = 'knowledge.extract'").all()).toHaveLength(1);

    down = false;
    expect(await extractPending(d)()).toEqual(ok({ extracted: 0, failed: 0, newConcepts: 1 }));
    expect(llm.calls).toBe(1);
    expect(d.knowledge.conceptLinks([ids.A as number]).get(ids.A as number)?.[0]?.label).toBe(
      "Load shedding",
    );
  });

  test("broad topics are linked too, at a lower weight", async () => {
    const ids = seed([{ feed: 1, title: "A", text: words("queue") }]);
    const d = deps({ embedder: fakeEmbedder(), llm: fakeLlm({}) });
    d.knowledge.saveExtractions(
      { model: "fake-llm", promptVersion: PROMPT_VERSION },
      [
        {
          articleId: ids.A as number,
          data: {
            concepts: [{ label: "Load shedding", salience: "main" }],
            topics: ["reliability"],
            entities: [],
            claims: [],
            questions: [],
          },
          error: null,
        },
      ],
      0,
    );
    await extractPending(d)();
    const links = d.knowledge.conceptLinks([ids.A as number]).get(ids.A as number) ?? [];
    expect(links.map((l) => [l.label, l.weight])).toEqual([
      ["Load shedding", 1],
      ["reliability", 0.5],
    ]);
  });

  test("a failed re-extraction keeps the earlier data and links", async () => {
    const ids = seed([{ feed: 1, title: "A", text: words("queue") }]);
    const d = deps({
      embedder: fakeEmbedder(),
      llm: fakeLlm({ A: [{ label: "Load shedding", salience: "main" }] }),
    });
    await extractPending(d)();
    d.knowledge.saveExtractions(
      { model: "fake-llm", promptVersion: 2 },
      [{ articleId: ids.A as number, data: null, error: "rejected" }],
      0,
    );
    expect(d.knowledge.extractedCount()).toBe(1);
    expect(d.knowledge.unlinked(10)).toEqual([]);
    expect(d.knowledge.conceptLinks([ids.A as number]).get(ids.A as number)).toHaveLength(1);
  });

  test("a concept created by an overlapping run is reused, not duplicated", () => {
    const ids = seed([
      { feed: 1, title: "A", text: "a" },
      { feed: 2, title: "B", text: "b" },
    ]);
    const k = createKnowledgeRepo(db);
    const plan = (articleId: number) => ({
      created: [{ key: "backpressure", label: "Backpressure", vector: fakeVector("x") }],
      labels: [{ key: "backpressure", concept: { created: 0 } }],
      links: [{ articleId, concept: { created: 0 }, weight: 1 }],
    });
    k.saveLinks("fake-embed", [ids.A as number], plan(ids.A as number), 0);
    k.saveLinks("fake-embed", [ids.B as number], plan(ids.B as number), 0);
    expect(db.query("SELECT count(*) AS n FROM knowledge_concept").get()).toEqual({ n: 1 });
    expect(k.conceptLinks([ids.B as number]).get(ids.B as number)?.[0]).toMatchObject({ id: 1, df: 2 });
  });

  test("skips stubs too short to extract from", async () => {
    seed([{ feed: 1, title: "Link post", text: "see this" }]);
    const llm = fakeLlm({});
    expect(await extractPending(deps({ embedder: fakeEmbedder(), llm }))()).toEqual(
      ok({ extracted: 0, failed: 0, newConcepts: 0 }),
    );
    expect(llm.calls).toBe(0);
  });
});

describe("relatedArticles", () => {
  const corpus = () =>
    seed([
      { feed: 1, title: "Queues", text: words("queue") },
      { feed: 1, title: "Queues again", text: words("queue") },
      // Similar, not identical: an identical copy would be dropped as a duplicate.
      { feed: 2, title: "Queues elsewhere", text: words("queue") + "local ".repeat(30) },
      { feed: 3, title: "Local-first", text: words("local") },
    ]);
  const ai = () => ({
    embedder: fakeEmbedder(),
    llm: fakeLlm({
      Queues: [{ label: "Backpressure", salience: "main" }],
      "Queues elsewhere": [{ label: "Backpressure", salience: "main" }],
    }),
  });

  test("is off without AI", () => {
    expect(relatedArticles(deps(null))(corpus().Queues as number)).toEqual(ok({ status: "off" }));
  });

  test("is pending until the article is embedded", () => {
    expect(relatedArticles(deps(ai()))(corpus().Queues as number)).toEqual(ok({ status: "pending" }));
  });

  test("ranks related articles from other feeds, with shared concepts, above the similarity floor", async () => {
    const id = corpus().Queues as number;
    const d = deps(ai());
    await embedPending(d)();
    await extractPending(d)();
    const r = relatedArticles(d)(id);
    if (!r.ok || r.value.status !== "ready") throw new Error("expected ready");
    // Same feed is excluded; "Local-first" is unrelated (similarity 0) and falls under the floor.
    expect(r.value.items.map((i) => i.title)).toEqual(["Queues elsewhere"]);
    expect(r.value.items[0]?.shared.map((c) => c.label)).toEqual(["Backpressure"]);
    expect(r.value.items[0]).toMatchObject({ feedTitle: "Feed 2", isRead: false });
  });

  test("an article whose embedding failed is ready with nothing, not pending forever", () => {
    const id = corpus().Queues as number;
    const d = deps(ai());
    d.knowledge.saveEmbeddings("fake-embed", [{ articleId: id, vector: null, error: "rejected" }], 0);
    expect(relatedArticles(d)(id)).toEqual(ok({ status: "ready", items: [] }));
  });

  test("an unknown article is not found", () => {
    expect(relatedArticles(deps(null))(999)).toEqual(err({ type: "article_not_found" }));
  });
});

describe("enqueueKnowledgeWork", () => {
  test("enqueues each run once while work is waiting, and nothing without AI", async () => {
    seed([{ feed: 1, title: "A", text: words("queue") }]);
    expect(enqueueKnowledgeWork(deps(null))()).toBe(0);
    const d = deps({ embedder: fakeEmbedder(), llm: fakeLlm({}) });
    expect(enqueueKnowledgeWork(d)()).toBe(2);
    enqueueKnowledgeWork(d)();
    const kinds = db.query<{ kind: string }, []>("SELECT kind FROM jobs ORDER BY kind").all();
    expect(kinds.map((k) => k.kind)).toEqual(["knowledge.embed", "knowledge.extract"]);

    db.run("DELETE FROM jobs");
    await embedPending(d)();
    await extractPending(d)();
    expect(enqueueKnowledgeWork(d)()).toBe(0);
  });
});

describe("recordRelatedClick", () => {
  test("records a click between existing articles", () => {
    const ids = seed([
      { feed: 1, title: "A", text: "a" },
      { feed: 2, title: "B", text: "b" },
    ]);
    const d = deps(null);
    expect(recordRelatedClick(d)({ fromId: ids.A as number, toId: ids.B as number, rank: 0 })).toEqual(
      ok(null),
    );
    expect(recordRelatedClick(d)({ fromId: ids.A as number, toId: 999, rank: 0 })).toEqual(
      err({ type: "article_not_found" }),
    );
  });
});
