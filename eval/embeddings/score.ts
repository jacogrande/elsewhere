/**
 * Scores cached embeddings on two tasks. Loads one model's vectors at a time to keep memory low.
 *
 *  1. Halves: match the first half of each long article to its own second half (objective).
 *  2. Related: for sampled articles, each model's top-5 neighbours from *other* feeds are pooled,
 *     shuffled, anonymised and rated 0–3 by LLM judges. Judgments are cached, so re-runs are free.
 *
 * Usage: bun eval/embeddings/score.ts <corpus.db> <vectors dir> <out dir>
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chatJson, type Doc, decodeVec, dot, halves, loadDocs, rng, shuffle, type VectorFile } from "./lib";

const [dbPath, vecDir, outDir] = process.argv.slice(2);
if (!dbPath || !vecDir || !outDir) throw new Error("usage: score.ts <corpus.db> <vectors dir> <out dir>");

const JUDGES = ["anthropic/claude-sonnet-5.5", "google/gemini-3.5-flash"];
const QUERIES = 40;
const PER_FEED = 2;
const K = 5;

const docs = loadDocs(dbPath);
const byId = new Map(docs.map((d) => [d.id, d]));
const pairs = halves(docs);

// Query sample: at most PER_FEED per feed, from articles long enough to judge.
const queries: Doc[] = [];
const perFeed = new Map<number, number>();
for (const d of shuffle(
  docs.filter((d) => d.words >= 300),
  rng(42),
)) {
  if ((perFeed.get(d.feedId) ?? 0) >= PER_FEED) continue;
  perFeed.set(d.feedId, (perFeed.get(d.feedId) ?? 0) + 1);
  queries.push(d);
  if (queries.length === QUERIES) break;
}

type ModelResult = {
  model: string;
  dims: number;
  costUsd: number;
  halvesR1: number;
  halvesMrr: number;
  related: Map<number, number[]>; // query id -> top-K doc ids from other feeds
};

function evaluate(file: VectorFile): ModelResult {
  const vec = (key: string) => {
    const s = file.vectors[key];
    if (!s) throw new Error(`${file.model}: missing ${key}`);
    return decodeVec(s);
  };

  // 1. Halves
  const bs = pairs.map((p) => ({ id: p.id, v: vec(`b:${p.id}`) }));
  let hits = 0;
  let rr = 0;
  for (const p of pairs) {
    const a = vec(`a:${p.id}`);
    const own = dot(a, bs.find((b) => b.id === p.id)?.v as Float32Array);
    const rank = 1 + bs.filter((b) => b.id !== p.id && dot(a, b.v) > own).length;
    if (rank === 1) hits++;
    rr += 1 / rank;
  }

  // 2. Related: nearest docs from other feeds
  const docVecs = docs.map((d) => ({ d, v: vec(`doc:${d.id}`) }));
  const related = new Map<number, number[]>();
  for (const q of queries) {
    const qv = vec(`doc:${q.id}`);
    const top = docVecs
      .filter((x) => x.d.feedId !== q.feedId)
      .map((x) => ({ id: x.d.id, s: dot(qv, x.v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, K)
      .map((x) => x.id);
    related.set(q.id, top);
  }

  return {
    model: file.model,
    dims: file.dims,
    costUsd: file.costUsd,
    halvesR1: hits / pairs.length,
    halvesMrr: rr / pairs.length,
    related,
  };
}

// Evaluate models one at a time.
const results: ModelResult[] = [];
for (const f of readdirSync(vecDir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const file = (await Bun.file(join(vecDir, f)).json()) as VectorFile;
  results.push(evaluate(file));
  console.log(`scored ${file.model}`);
}

// Judge pooled candidates ---------------------------------------------------------

const cachePath = join(outDir, "judgments.json");
const cache: Record<string, number> = existsSync(cachePath) ? await Bun.file(cachePath).json() : {};
const excerpt = (d: Doc, chars: number) =>
  `${d.title} (${d.feed})\n${d.text.slice(0, chars)}${d.text.length > chars ? "…" : ""}`;

const SYSTEM = `You evaluate "related reading" suggestions for an RSS reader.
A reader just finished the QUERY article. For each numbered CANDIDATE, rate how good it would be as a
"you might also like this" suggestion shown under the QUERY:
3 = closely related: same specific topic, question or argument
2 = related: clearly overlapping theme; a reader of the QUERY would likely find it relevant
1 = loosely related: same broad field only
0 = unrelated
Judge on substance, not on writing style or author. Reply with JSON only: {"ratings": {"1": n, "2": n, ...}}`;

let judgeCost = 0;
for (const judge of JUDGES) {
  for (const [qi, q] of queries.entries()) {
    const pooled = [...new Set(results.flatMap((r) => r.related.get(q.id) ?? []))];
    const todo = pooled.filter((id) => cache[`${judge}|${q.id}|${id}`] === undefined);
    if (todo.length === 0) continue;
    const order = shuffle(todo, rng(q.id));
    const user = `QUERY:\n${excerpt(q, 2500)}\n\n${order
      .map((id, i) => `CANDIDATE ${i + 1}:\n${excerpt(byId.get(id) as Doc, 900)}`)
      .join("\n\n")}`;
    const { value, cost } = await chatJson(judge, SYSTEM, user);
    judgeCost += cost;
    const ratings = (value as { ratings?: Record<string, unknown> }).ratings ?? {};
    order.forEach((id, i) => {
      const r = Number(ratings[String(i + 1)]);
      if (Number.isInteger(r) && r >= 0 && r <= 3) cache[`${judge}|${q.id}|${id}`] = r;
    });
    await Bun.write(cachePath, JSON.stringify(cache));
    console.log(`judged ${judge} ${qi + 1}/${queries.length} (${order.length} candidates)`);
  }
}

// Report ----------------------------------------------------------------------------

const rating = (judge: string, q: number, id: number) => cache[`${judge}|${q}|${id}`];
/** Mean relevance of a model's top-K for one query, averaged over judges. */
function perQuery(r: ModelResult, q: Doc): number {
  const scores: number[] = [];
  for (const judge of JUDGES) {
    for (const id of r.related.get(q.id) ?? []) {
      const s = rating(judge, q.id, id);
      if (s !== undefined) scores.push(s);
    }
  }
  return scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
}
function judgeMean(r: ModelResult, judge: string): number {
  const s = queries.flatMap((q) => (r.related.get(q.id) ?? []).map((id) => rating(judge, q.id, id) ?? 0));
  return s.reduce((a, b) => a + b, 0) / s.length;
}
function bootstrapCi(values: number[]): [number, number] {
  const random = rng(7);
  const means: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let s = 0;
    for (let j = 0; j < values.length; j++) s += values[Math.floor(random() * values.length)] as number;
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[50] as number, means[1949] as number];
}

const rows = results
  .map((r) => {
    const pq = queries.map((q) => perQuery(r, q));
    const mean = pq.reduce((a, b) => a + b, 0) / pq.length;
    return { r, pq, mean, ci: bootstrapCi(pq), byJudge: JUDGES.map((j) => judgeMean(r, j)) };
  })
  .sort((a, b) => b.mean - a.mean);

// Judge agreement: exact and within-1 over all pairs both rated.
let both = 0;
let exact = 0;
let within1 = 0;
for (const key of Object.keys(cache).filter((k) => k.startsWith(`${JUDGES[0]}|`))) {
  const other = cache[key.replace(JUDGES[0] as string, JUDGES[1] as string)];
  if (other === undefined) continue;
  both++;
  const a = cache[key] as number;
  if (a === other) exact++;
  if (Math.abs(a - other) <= 1) within1++;
}

const best = rows[0];
const lines = [
  `Docs: ${docs.length} · half pairs: ${pairs.length} · related queries: ${queries.length} (top ${K}, other feeds only)`,
  `Judges: ${JUDGES.join(", ")} · agreement on ${both} pairs: exact ${((exact / both) * 100).toFixed(0)}%, within 1 point ${((within1 / both) * 100).toFixed(0)}%`,
  `Judge cost this run: $${judgeCost.toFixed(3)}`,
  "",
  "| Model | Related (0–3) | 95% CI | " +
    JUDGES.map((j) => j.split("/")[1]).join(" | ") +
    " | Halves R@1 | Halves MRR | Dims | Embed cost |",
  "|---|---|---|" + JUDGES.map(() => "---|").join("") + "---|---|---|---|",
  ...rows.map(
    (x) =>
      `| ${x.r.model} | **${x.mean.toFixed(2)}** | ${x.ci[0].toFixed(2)}–${x.ci[1].toFixed(2)} | ${x.byJudge
        .map((v) => v.toFixed(2))
        .join(
          " | ",
        )} | ${(x.r.halvesR1 * 100).toFixed(1)}% | ${x.r.halvesMrr.toFixed(3)} | ${x.r.dims} | $${x.r.costUsd.toFixed(3)} |`,
  ),
  "",
  `Paired comparison against the top model (${best?.r.model}): share of queries where it scores higher / lower`,
  ...rows.slice(1).map((x) => {
    const diffs = x.pq.map((v, i) => (best?.pq[i] as number) - v);
    const [lo, hi] = bootstrapCi(diffs);
    return `- ${x.r.model}: mean gap ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2)} (95% CI ${lo.toFixed(2)} to ${hi.toFixed(2)})`;
  }),
];
await Bun.write(join(outDir, "results.md"), lines.join("\n"));
console.log(`\n${lines.join("\n")}`);
