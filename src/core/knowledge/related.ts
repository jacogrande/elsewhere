import { dot } from "./vector";

/**
 * The related-reading rail, in two groups of embedding neighbours from other feeds:
 * - conceptual: they share a concept or topic with the article (the same one, or a close one),
 *   which is shown as the "why", and the more they share the higher they rank;
 * - semantic: close in meaning but with no extracted idea in common, shown as such.
 * Each group is re-ranked for variety (MMR, which also avoids near-copies of earlier picks) with
 * one pick per feed.
 */
export const RELATED = {
  k: 30,
  /** At most this many of the k candidates per feed, so a prolific feed can't crowd out the rest. */
  perFeed: 2,
  /** Conceptual picks, at most. */
  n: 5,
  /** Semantic-only picks, at most, after the conceptual ones. */
  similarN: 3,
  lambda: 0.7,
  conceptBoost: 0.15,
  /**
   * Below this, neighbours are noise. Calibrated by eye for voyage-4 on our feeds: real connections
   * score ~0.55–0.7, unrelated posts ~0.33–0.47. Model-specific: recheck when changing models.
   */
  minSimilarity: 0.45,
  /** Above this it's the same post (syndicated, or a feed listed twice), not a related one. */
  maxSimilarity: 0.97,
  /**
   * Two different concepts this close count as a connection ("vanilla JavaScript" ~ "JavaScript
   * frameworks"). Below ~0.7 the pairs stop making sense, so this stays well above it.
   */
  closeConcept: 0.8,
};

export type Embedded = { id: number; feedId: number; vector: Float32Array };

/** The k articles most similar to `target` from other feeds, at most `perFeed` from any one feed. */
export function nearest(
  target: Embedded,
  all: Embedded[],
  k: number,
  perFeed: number,
): (Embedded & { similarity: number })[] {
  const ranked = all
    .filter((a) => a.feedId !== target.feedId)
    .map((a) => ({ ...a, similarity: dot(target.vector, a.vector) }))
    .sort((a, b) => b.similarity - a.similarity);
  const taken = new Map<number, number>();
  const out: typeof ranked = [];
  for (const a of ranked) {
    if (out.length === k) break;
    const n = taken.get(a.feedId) ?? 0;
    if (n >= perFeed) continue;
    taken.set(a.feedId, n + 1);
    out.push(a);
  }
  return out;
}

/** An article's link to a concept; `df` is how many articles carry the concept. */
export type ConceptLink = { id: number; label: string; weight: number; df: number; vector: Float32Array };
export type Scored = Embedded & { similarity: number; concepts: ConceptLink[] };
/** `close` is the article's own concept this one is close to, or null when it's the same concept. */
export type SharedConcept = { id: number; label: string; close: string | null };
/** `conceptual` picks share at least one idea (in `shared`); `semantic` ones share none. */
export type Related = { id: number; score: number; kind: "conceptual" | "semantic"; shared: SharedConcept[] };

export function rankRelated(input: {
  target: { concepts: ConceptLink[] };
  candidates: Scored[];
  totalArticles: number;
  minSimilarity: number;
  maxSimilarity: number;
  closeConcept: number;
  n: number;
  similarN: number;
  lambda: number;
  conceptBoost: number;
}): Related[] {
  // Rare concepts say more about a connection than common ones.
  const idf = (c: ConceptLink) => Math.log(1 + input.totalArticles / Math.max(1, c.df));
  const targets = input.target.concepts;
  const targetMass = targets.reduce((s, c) => s + idf(c) * c.weight, 0);

  /** The target concept `x` matches: the same one, else the closest at or above the threshold. */
  const match = (x: ConceptLink): { t: ConceptLink; sim: number } | null => {
    const same = targets.find((t) => t.id === x.id);
    if (same) return { t: same, sim: 1 };
    let best: { t: ConceptLink; sim: number } | null = null;
    for (const t of targets) {
      if (t.vector.length !== x.vector.length) continue; // embedded with a different model
      const sim = dot(t.vector, x.vector);
      if (sim >= input.closeConcept && sim > (best?.sim ?? 0)) best = { t, sim };
    }
    return best;
  };

  const pool = input.candidates
    .filter((c) => c.similarity >= input.minSimilarity && c.similarity < input.maxSimilarity)
    .map((c) => {
      const shared = c.concepts
        .flatMap((x) => {
          const m = match(x);
          if (!m) return [];
          const strength = idf(x) * Math.min(x.weight, m.t.weight) * m.sim;
          return [{ id: x.id, label: x.label, close: m.t.id === x.id ? null : m.t.label, strength }];
        })
        .sort((a, b) => b.strength - a.strength);
      const overlap = targetMass ? shared.reduce((s, x) => s + x.strength, 0) / targetMass : 0;
      return { c, relevance: c.similarity + input.conceptBoost * overlap, shared };
    });

  type Candidate = (typeof pool)[number];
  const picked: Candidate[] = [];
  /** MMR over `from`, one per feed, avoiding near-copies of everything picked so far (both groups). */
  const pick = (from: Candidate[], n: number) => {
    const out: Candidate[] = [];
    const feeds = new Set<number>();
    while (out.length < n) {
      let best: Candidate | null = null;
      let bestScore = -Infinity;
      for (const p of from) {
        if (feeds.has(p.c.feedId) || picked.includes(p)) continue;
        const redundancy = picked.reduce((m, q) => Math.max(m, dot(p.c.vector, q.c.vector)), 0);
        const score = input.lambda * p.relevance - (1 - input.lambda) * redundancy;
        if (score > bestScore) {
          best = p;
          bestScore = score;
        }
      }
      if (!best) break;
      out.push(best);
      picked.push(best);
      feeds.add(best.c.feedId);
    }
    return out;
  };

  const conceptual = pick(
    pool.filter((p) => p.shared.length > 0),
    input.n,
  );
  const semantic = pick(
    pool.filter((p) => p.shared.length === 0),
    input.similarN,
  );
  return [
    ...conceptual.map((p) => ({
      id: p.c.id,
      score: p.relevance,
      kind: "conceptual" as const,
      shared: labelsFor(p.shared),
    })),
    ...semantic.map((p) => ({ id: p.c.id, score: p.relevance, kind: "semantic" as const, shared: [] })),
  ];
}

/** Up to 3 ideas to show: exact matches before close ones, strongest first, each idea named once. */
function labelsFor(shared: (SharedConcept & { strength: number })[]): SharedConcept[] {
  const ordered = [...shared].sort(
    (a, b) => Number(a.close !== null) - Number(b.close !== null) || b.strength - a.strength,
  );
  const named = new Set<string>();
  const out: SharedConcept[] = [];
  for (const { id, label, close } of ordered) {
    if (named.has(label) || (close !== null && named.has(close))) continue;
    named.add(label);
    if (close !== null) named.add(close);
    out.push({ id, label, close });
    if (out.length === 3) break;
  }
  return out;
}
