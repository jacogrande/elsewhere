import { describe, expect, test } from "bun:test";
import { nearest, rankRelated, type Scored } from "./related";
import { normalize } from "./vector";

const v = (...xs: number[]) => normalize(Float32Array.from(xs));

describe("nearest", () => {
  const target = { id: 1, feedId: 1, vector: v(1, 0) };

  test("returns the k most similar articles from other feeds, best first", () => {
    const out = nearest(
      target,
      [
        target,
        { id: 2, feedId: 1, vector: v(1, 0) }, // same feed: excluded
        { id: 3, feedId: 2, vector: v(1, 1) },
        { id: 4, feedId: 3, vector: v(1, 0.1) },
        { id: 5, feedId: 4, vector: v(0, 1) },
      ],
      2,
      5,
    );
    expect(out.map((c) => c.id)).toEqual([4, 3]);
    expect(out[0]?.similarity).toBeCloseTo(0.995, 3);
  });

  test("takes at most perFeed from one feed, so others still make the cut", () => {
    const prolific = Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, feedId: 2, vector: v(1, 0.01 * i) }));
    const out = nearest(target, [...prolific, { id: 3, feedId: 3, vector: v(1, 1) }], 3, 2);
    expect(out.map((c) => c.id)).toEqual([10, 11, 3]);
  });
});

describe("rankRelated", () => {
  const concept = (id: number, weight = 1, df = 2) => ({ id, label: `c${id}`, weight, df });
  const cand = (
    id: number,
    feedId: number,
    similarity: number,
    vector: Float32Array,
    concepts = [concept(9)],
  ) => ({ id, feedId, similarity, vector, concepts }) satisfies Scored;
  const opts = {
    totalArticles: 100,
    n: 3,
    lambda: 0.7,
    conceptBoost: 0.15,
    minSimilarity: 0.3,
    maxSimilarity: 0.97,
  };

  test("keeps similarity order when candidates are diverse and share nothing", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [concept(1)] },
      candidates: [cand(2, 2, 0.8, v(1, 0, 0)), cand(3, 3, 0.7, v(0, 1, 0)), cand(4, 4, 0.6, v(0, 0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2, 3, 4]);
    expect(out.every((r) => r.shared.length === 0)).toBe(true);
  });

  test("names the shared concepts, rarest and weightiest first", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [concept(1, 1, 50), concept(2, 1, 3), concept(3, 0.3, 3)] },
      candidates: [cand(2, 2, 0.5, v(1, 0), [concept(1, 1, 50), concept(2, 0.6, 3), concept(3, 1, 3)])],
    });
    expect(out[0]?.shared.map((c) => c.id)).toEqual([2, 1, 3]);
  });

  test("shared concepts lift a slightly less similar article above an unconnected one", () => {
    const out = rankRelated({
      ...opts,
      n: 2,
      target: { concepts: [concept(1)] },
      candidates: [cand(2, 2, 0.6, v(1, 0)), cand(3, 3, 0.55, v(0, 1), [concept(1)])],
    });
    expect(out.map((r) => r.id)).toEqual([3, 2]);
  });

  test("diversity: skips a near-duplicate of a pick in favour of something different", () => {
    const out = rankRelated({
      ...opts,
      n: 2,
      target: { concepts: [] },
      candidates: [cand(2, 2, 0.8, v(1, 0)), cand(3, 3, 0.79, v(1, 0.01)), cand(4, 4, 0.6, v(0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2, 4]);
  });

  test("leaves out articles below the similarity floor, even with shared concepts", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [concept(1)] },
      candidates: [cand(2, 2, 0.6, v(1, 0)), cand(3, 3, 0.29, v(0, 1), [concept(1)])],
    });
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  test("leaves out near-identical copies of the same post", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [] },
      candidates: [cand(2, 2, 0.99, v(1, 0)), cand(3, 3, 0.6, v(0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  test("takes at most one article per feed", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [] },
      candidates: [cand(2, 2, 0.8, v(1, 0)), cand(3, 2, 0.79, v(0, 1)), cand(4, 4, 0.5, v(1, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2, 4]);
  });
});
