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
  /** A concept on its own axis, unless a vector is given. */
  const concept = (id: number, weight = 1, df = 2, vector: Float32Array = axis(id)) => ({
    id,
    label: `c${id}`,
    weight,
    df,
    vector,
  });
  function axis(i: number): Float32Array {
    const a = new Float32Array(16);
    a[i % 16] = 1;
    return a;
  }
  const cand = (
    id: number,
    feedId: number,
    similarity: number,
    vector: Float32Array,
    concepts = [concept(1)],
  ) => ({ id, feedId, similarity, vector, concepts }) satisfies Scored;
  const opts = {
    totalArticles: 100,
    n: 3,
    lambda: 0.7,
    conceptBoost: 0.15,
    minSimilarity: 0.3,
    maxSimilarity: 0.97,
    closeConcept: 0.8,
    similarN: 0,
  };
  const target = { concepts: [concept(1)] };

  test("conceptual picks come first; neighbours sharing no idea follow as semantic picks", () => {
    const out = rankRelated({
      ...opts,
      similarN: 2,
      target,
      candidates: [
        cand(2, 2, 0.8, v(1, 0), [concept(7)]),
        cand(3, 3, 0.6, v(0, 1)),
        cand(4, 4, 0.7, v(1, 1), [concept(8)]),
      ],
    });
    expect(out.map((r) => [r.id, r.kind])).toEqual([
      [3, "conceptual"],
      [2, "semantic"],
      [4, "semantic"],
    ]);
    expect(out[1]?.shared).toEqual([]);
  });

  test("each group takes one pick per feed, but a feed can appear in both", () => {
    const out = rankRelated({
      ...opts,
      similarN: 2,
      target,
      candidates: [
        cand(2, 2, 0.6, v(1, 0)),
        cand(3, 2, 0.8, v(0, 1), [concept(7)]),
        cand(4, 2, 0.7, v(1, 1), [concept(8)]),
      ],
    });
    expect(out.map((r) => [r.id, r.kind])).toEqual([
      [2, "conceptual"],
      [3, "semantic"],
    ]);
  });

  test("no semantic picks when similarN is 0", () => {
    const out = rankRelated({ ...opts, target, candidates: [cand(2, 2, 0.8, v(1, 0), [concept(7)])] });
    expect(out).toEqual([]);
  });

  test("names the shared concepts, rarest and weightiest first", () => {
    const out = rankRelated({
      ...opts,
      target: { concepts: [concept(1, 1, 50), concept(2, 1, 3), concept(3, 0.3, 3)] },
      candidates: [cand(2, 2, 0.5, v(1, 0), [concept(1, 1, 50), concept(2, 0.6, 3), concept(3, 1, 3)])],
    });
    expect(out[0]?.shared.map((c) => c.id)).toEqual([2, 1, 3]);
    expect(out[0]?.shared[0]).toEqual({ id: 2, label: "c2", close: null });
  });

  test("a close concept (≥ closeConcept) counts as a connection and names what it's close to", () => {
    const near = normalize(Float32Array.from([0.3, 0.95, ...new Array(14).fill(0)]));
    const far = normalize(Float32Array.from([0.8, 0.6, ...new Array(14).fill(0)]));
    const out = rankRelated({
      ...opts,
      target,
      candidates: [
        cand(2, 2, 0.6, v(1, 0), [concept(5, 1, 2, near)]),
        cand(3, 3, 0.6, v(0, 1), [concept(6, 1, 2, far)]),
      ],
    });
    expect(out.map((r) => r.id)).toEqual([2]);
    expect(out[0]?.shared).toEqual([{ id: 5, label: "c5", close: "c1" }]);
  });

  test("labels show the same concept before a close one, and each idea once", () => {
    const nearOne = normalize(Float32Array.from([0, 0.95, 0.3, ...new Array(13).fill(0)]));
    const out = rankRelated({
      ...opts,
      target: { concepts: [concept(1, 1, 2), concept(2, 1, 2)] },
      // Concept 5 is close to target concept 1, which the candidate also has outright.
      candidates: [
        cand(2, 2, 0.6, v(1, 0), [concept(5, 1, 2, nearOne), concept(1, 0.3, 2), concept(2, 0.3, 2)]),
      ],
    });
    expect(out[0]?.shared).toEqual([
      { id: 1, label: "c1", close: null },
      { id: 2, label: "c2", close: null },
    ]);
  });

  test("a rarer shared concept lifts a slightly less similar article", () => {
    const out = rankRelated({
      ...opts,
      n: 2,
      target: { concepts: [concept(1, 1, 90), concept(2, 1, 2)] },
      candidates: [
        cand(2, 2, 0.6, v(1, 0), [concept(1, 1, 90)]),
        cand(3, 3, 0.58, v(0, 1), [concept(2, 1, 2)]),
      ],
    });
    expect(out.map((r) => r.id)).toEqual([3, 2]);
  });

  test("diversity: skips a near-duplicate of a pick in favour of something different", () => {
    const out = rankRelated({
      ...opts,
      n: 2,
      target,
      candidates: [cand(2, 2, 0.8, v(1, 0)), cand(3, 3, 0.79, v(1, 0.01)), cand(4, 4, 0.6, v(0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2, 4]);
  });

  test("leaves out articles below the similarity floor, even with shared concepts", () => {
    const out = rankRelated({
      ...opts,
      target,
      candidates: [cand(2, 2, 0.6, v(1, 0)), cand(3, 3, 0.29, v(0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  test("leaves out near-identical copies of the same post", () => {
    const out = rankRelated({
      ...opts,
      target,
      candidates: [cand(2, 2, 0.99, v(1, 0)), cand(3, 3, 0.6, v(0, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  test("takes at most one article per feed", () => {
    const out = rankRelated({
      ...opts,
      target,
      candidates: [cand(2, 2, 0.8, v(1, 0)), cand(3, 2, 0.79, v(0, 1)), cand(4, 4, 0.5, v(1, 1))],
    });
    expect(out.map((r) => r.id)).toEqual([2, 4]);
  });
});
