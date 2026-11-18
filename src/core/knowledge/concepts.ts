import type { Salience } from "./extraction";
import { dot } from "./vector";

/**
 * Concept matching. Labels the LLM extracts are matched to the shared concept list: first by
 * exact normalized label, then by embedding similarity. Label embeddings can't tell a synonym from a
 * neighbour ("TypeScript" vs "JavaScript" scores higher than "LLMs" vs "large language models"), so
 * the threshold is deliberately strict and the prompt asks for canonical names instead.
 */
export const MATCH_THRESHOLD = 0.86;

export const SALIENCE_WEIGHT: Record<Salience, number> = { main: 1, supporting: 0.6, mention: 0.3 };

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'“”‘’.,;:!?()[\]]+|[\s"'“”‘’.,;:!?()[\]]+$/g, "");
}

export type ArticleConcepts = { articleId: number; concepts: { label: string; salience: Salience }[] };

/** Labels not in `known`, each once, in first-seen order, keeping the first spelling for display. */
export function unseenLabels(extractions: ArticleConcepts[], known: ReadonlySet<string>) {
  const out = new Map<string, { key: string; label: string }>();
  for (const e of extractions) {
    for (const c of e.concepts) {
      const key = normalizeLabel(c.label);
      if (key && !known.has(key) && !out.has(key)) out.set(key, { key, label: c.label.trim() });
    }
  }
  return [...out.values()];
}

/** An existing concept, or one created by this plan (index into `created`). */
export type ConceptRef = { id: number } | { created: number };

export type ConceptPlan = {
  /** `key` is the normalized label, so the writer can reuse a concept another run just created. */
  created: { key: string; label: string; vector: Float32Array }[];
  /** New label variants and the concept each belongs to. */
  labels: { key: string; concept: ConceptRef }[];
  links: { articleId: number; concept: ConceptRef; weight: number }[];
};

export function planConcepts(input: {
  extractions: ArticleConcepts[];
  known: ReadonlyMap<string, number>;
  /** Every label `unseenLabels` returned, with its embedding. */
  unseen: { key: string; label: string; vector: Float32Array }[];
  existing: { id: number; vector: Float32Array }[];
  threshold: number;
}): ConceptPlan {
  const created: ConceptPlan["created"] = [];
  const labels: ConceptPlan["labels"] = [];
  const refs = new Map<string, ConceptRef>();
  for (const [key, id] of input.known) refs.set(key, { id });

  const pool: { ref: ConceptRef; vector: Float32Array }[] = input.existing.map((c) => ({
    ref: { id: c.id },
    vector: c.vector,
  }));
  for (const u of input.unseen) {
    let best: ConceptRef | null = null;
    let bestScore = input.threshold;
    for (const c of pool) {
      const s = dot(u.vector, c.vector);
      if (s >= bestScore) {
        best = c.ref;
        bestScore = s;
      }
    }
    if (!best) {
      best = { created: created.length };
      created.push({ key: u.key, label: u.label, vector: u.vector });
      pool.push({ ref: best, vector: u.vector });
    }
    refs.set(u.key, best);
    labels.push({ key: u.key, concept: best });
  }

  const links: ConceptPlan["links"] = [];
  for (const e of input.extractions) {
    const byConcept = new Map<string, { concept: ConceptRef; weight: number }>();
    for (const c of e.concepts) {
      const concept = refs.get(normalizeLabel(c.label));
      if (!concept) continue;
      const id = "id" in concept ? `id:${concept.id}` : `new:${concept.created}`;
      const weight = SALIENCE_WEIGHT[c.salience];
      if ((byConcept.get(id)?.weight ?? 0) < weight) byConcept.set(id, { concept, weight });
    }
    for (const l of byConcept.values()) links.push({ articleId: e.articleId, ...l });
  }
  return { created, labels, links };
}
