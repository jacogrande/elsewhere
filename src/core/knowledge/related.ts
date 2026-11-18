import { dot } from "./vector";

/**
 * The related-reading rail: embedding neighbours from other feeds, nudged by shared concepts,
 * re-ranked for variety (MMR) with one pick per feed. Shared concepts are also the "why" shown.
 */
export const RELATED = {
  k: 30,
  /** At most this many of the k candidates per feed, so a prolific feed can't crowd out the rest. */
  perFeed: 2,
  n: 5,
  lambda: 0.7,
  conceptBoost: 0.15,
  /**
   * Below this, neighbours are noise. Calibrated by eye for voyage-4 on our feeds: real connections
   * score ~0.55–0.7, unrelated posts ~0.33–0.47. Model-specific: recheck when changing models.
   */
  minSimilarity: 0.45,
  /** Above this it's the same post (syndicated, or a feed listed twice), not a related one. */
  maxSimilarity: 0.97,
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
export type ConceptLink = { id: number; label: string; weight: number; df: number };
export type Scored = Embedded & { similarity: number; concepts: ConceptLink[] };
export type Related = { id: number; score: number; shared: { id: number; label: string }[] };

export function rankRelated(input: {
  target: { concepts: ConceptLink[] };
  candidates: Scored[];
  totalArticles: number;
  minSimilarity: number;
  maxSimilarity: number;
  n: number;
  lambda: number;
  conceptBoost: number;
}): Related[] {
  // Rare concepts say more about a connection than common ones.
  const idf = (c: ConceptLink) => Math.log(1 + input.totalArticles / Math.max(1, c.df));
  const targetWeight = new Map(input.target.concepts.map((c) => [c.id, c.weight]));
  const targetMass = input.target.concepts.reduce((s, c) => s + idf(c) * c.weight, 0);

  const pool = input.candidates
    .filter((c) => c.similarity >= input.minSimilarity && c.similarity < input.maxSimilarity)
    .map((c) => {
      const shared = c.concepts
        .filter((x) => targetWeight.has(x.id))
        .map((x) => ({
          id: x.id,
          label: x.label,
          strength: idf(x) * Math.min(x.weight, targetWeight.get(x.id) ?? 0),
        }))
        .sort((a, b) => b.strength - a.strength);
      const overlap = targetMass ? shared.reduce((s, x) => s + x.strength, 0) / targetMass : 0;
      return { c, relevance: c.similarity + input.conceptBoost * overlap, shared };
    });

  const picked: typeof pool = [];
  const feeds = new Set<number>();
  while (picked.length < input.n) {
    let best: (typeof pool)[number] | null = null;
    let bestScore = -Infinity;
    for (const p of pool) {
      if (feeds.has(p.c.feedId) || picked.includes(p)) continue;
      const redundancy = picked.reduce((m, q) => Math.max(m, dot(p.c.vector, q.c.vector)), 0);
      const score = input.lambda * p.relevance - (1 - input.lambda) * redundancy;
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (!best) break;
    picked.push(best);
    feeds.add(best.c.feedId);
  }
  return picked.map((p) => ({
    id: p.c.id,
    score: p.relevance,
    shared: p.shared.slice(0, 3).map(({ id, label }) => ({ id, label })),
  }));
}
