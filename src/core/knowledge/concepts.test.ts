import { describe, expect, test } from "bun:test";
import { normalizeLabel, planConcepts, unseenLabels } from "./concepts";
import { normalize } from "./vector";

const v = (...xs: number[]) => normalize(Float32Array.from(xs));

describe("normalizeLabel", () => {
  test("lowercases, trims and collapses whitespace", () => {
    expect(normalizeLabel("  Load   Shedding ")).toBe("load shedding");
  });

  test("strips surrounding quotes and punctuation but keeps inner hyphens", () => {
    expect(normalizeLabel('"Local-first software."')).toBe("local-first software");
  });
});

describe("unseenLabels", () => {
  test("returns each new label once, keeping the first spelling for display", () => {
    const out = unseenLabels(
      [
        { articleId: 1, concepts: [{ label: "Load shedding", salience: "main" }] },
        {
          articleId: 2,
          concepts: [
            { label: "load  shedding", salience: "mention" },
            { label: "Backpressure", salience: "main" },
            { label: "Queueing theory", salience: "main" },
          ],
        },
      ],
      new Set(["queueing theory"]),
    );
    expect(out).toEqual([
      { key: "load shedding", label: "Load shedding" },
      { key: "backpressure", label: "Backpressure" },
    ]);
  });
});

describe("planConcepts", () => {
  const existing = [
    { id: 10, vector: v(1, 0, 0) },
    { id: 11, vector: v(0, 1, 0) },
  ];

  test("reuses known labels without matching", () => {
    const plan = planConcepts({
      extractions: [{ articleId: 1, concepts: [{ label: "Queueing theory", salience: "main" }] }],
      known: new Map([["queueing theory", 10]]),
      unseen: [],
      existing,
      threshold: 0.86,
    });
    expect(plan).toEqual({
      created: [],
      labels: [],
      links: [{ articleId: 1, concept: { id: 10 }, weight: 1 }],
    });
  });

  test("maps a near-identical new label onto an existing concept and remembers the variant", () => {
    const plan = planConcepts({
      extractions: [{ articleId: 1, concepts: [{ label: "Queue theory", salience: "supporting" }] }],
      known: new Map(),
      unseen: [{ key: "queue theory", label: "Queue theory", vector: v(0.99, 0.05, 0) }],
      existing,
      threshold: 0.86,
    });
    expect(plan.created).toEqual([]);
    expect(plan.labels).toEqual([{ key: "queue theory", concept: { id: 10 } }]);
    expect(plan.links).toEqual([{ articleId: 1, concept: { id: 10 }, weight: 0.6 }]);
  });

  test("creates a concept for a label below the threshold", () => {
    const plan = planConcepts({
      extractions: [{ articleId: 1, concepts: [{ label: "Load shedding", salience: "main" }] }],
      known: new Map(),
      unseen: [{ key: "load shedding", label: "Load shedding", vector: v(0.6, 0.6, 0.5) }],
      existing,
      threshold: 0.86,
    });
    expect(plan.created).toEqual([
      { key: "load shedding", label: "Load shedding", vector: v(0.6, 0.6, 0.5) },
    ]);
    expect(plan.labels).toEqual([{ key: "load shedding", concept: { created: 0 } }]);
    expect(plan.links).toEqual([{ articleId: 1, concept: { created: 0 }, weight: 1 }]);
  });

  test("matches later new labels against concepts created earlier in the same batch", () => {
    const plan = planConcepts({
      extractions: [
        { articleId: 1, concepts: [{ label: "CRDTs", salience: "main" }] },
        { articleId: 2, concepts: [{ label: "CRDT", salience: "main" }] },
      ],
      known: new Map(),
      unseen: [
        { key: "crdts", label: "CRDTs", vector: v(0, 0, 1) },
        { key: "crdt", label: "CRDT", vector: v(0.05, 0, 1) },
      ],
      existing,
      threshold: 0.86,
    });
    expect(plan.created).toHaveLength(1);
    expect(plan.labels.map((l) => l.concept)).toEqual([{ created: 0 }, { created: 0 }]);
    expect(plan.links.map((l) => l.concept)).toEqual([{ created: 0 }, { created: 0 }]);
  });

  test("links an article to a concept once, at its highest weight", () => {
    const plan = planConcepts({
      extractions: [
        {
          articleId: 1,
          concepts: [
            { label: "Queueing theory", salience: "mention" },
            { label: "queue theory", salience: "main" },
          ],
        },
      ],
      known: new Map([
        ["queueing theory", 10],
        ["queue theory", 10],
      ]),
      unseen: [],
      existing,
      threshold: 0.86,
    });
    expect(plan.links).toEqual([{ articleId: 1, concept: { id: 10 }, weight: 1 }]);
  });
});
