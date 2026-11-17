/** Shared pieces of the embedding eval: corpus selection, vector math, caching, OpenRouter calls. */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Doc = { id: number; feedId: number; feed: string; title: string; text: string; words: number };

export const MIN_WORDS = 150;
export const PER_FEED_CAP = 40;
/** ~4k tokens: fits every candidate model's context window. */
export const MAX_CHARS = 16_000;
export const HALF_MIN_WORDS = 800;
export const HALF_MAX_CHARS = 6_000;

export function loadDocs(dbPath: string): Doc[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .query<Doc & { rank: number }, []>(
      `SELECT * FROM (
         SELECT a.id, a.feed_id AS feedId, f.title AS feed, a.title, a.text, a.word_count AS words,
                row_number() OVER (PARTITION BY a.feed_id ORDER BY a.sort_at DESC, a.id DESC) AS rank
         FROM library_article a JOIN feeds_feed f ON f.id = a.feed_id
         WHERE a.word_count >= ${MIN_WORDS}
       ) WHERE rank <= ${PER_FEED_CAP} ORDER BY id`,
    )
    .all();
  db.close();
  return rows.map(({ rank: _, ...d }) => d);
}

export const docText = (d: Doc) => `${d.title}\n\n${d.text}`.slice(0, MAX_CHARS);

/** First and second half of long articles, for the "find my other half" task. */
export function halves(docs: Doc[]) {
  return docs
    .filter((d) => d.words >= HALF_MIN_WORDS)
    .map((d) => {
      const words = d.text.split(" ");
      const mid = Math.floor(words.length / 2);
      return {
        id: d.id,
        a: words.slice(0, mid).join(" ").slice(0, HALF_MAX_CHARS),
        // Take the *start* of the second half so the two never touch the same text.
        b: words.slice(mid).join(" ").slice(0, HALF_MAX_CHARS),
      };
    });
}

// Seeded PRNG so query selection and candidate order are reproducible.
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}

// Vector cache: <dir>/<slug>.json with base64 Float32 vectors keyed by "doc:<id>" / "a:<id>" / "b:<id>".
export type VectorFile = {
  model: string;
  dims: number;
  costUsd: number;
  ms: number;
  truncated: number;
  vectors: Record<string, string>;
};
export const slug = (model: string) => model.replace(/[^a-z0-9.-]+/gi, "_");
export const vecPath = (dir: string, model: string) => join(dir, `${slug(model)}.json`);
export const encodeVec = (v: Float32Array) =>
  Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
export const decodeVec = (s: string) => {
  const b = Buffer.from(s, "base64");
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
export async function readVectors(dir: string, model: string): Promise<VectorFile | null> {
  const p = vecPath(dir, model);
  return existsSync(p) ? ((await Bun.file(p).json()) as VectorFile) : null;
}
export async function writeVectors(dir: string, file: VectorFile) {
  mkdirSync(dir, { recursive: true });
  await Bun.write(vecPath(dir, file.model), JSON.stringify(file));
}

// OpenRouter --------------------------------------------------------------------

const KEY = Bun.env.OPENROUTER_API_KEY;
const BASE = "https://openrouter.ai/api/v1";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  if (!KEY) throw new Error("OPENROUTER_API_KEY is not set (.env)");
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Elsewhere eval",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt >= 5) throw e;
      await Bun.sleep(2 ** attempt * 1000);
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text) as { error?: { message?: string; code?: number } };
      // OpenRouter sometimes reports upstream errors in a 200 body.
      if (json.error) {
        if (attempt >= 5) throw new HttpError(json.error.code ?? 500, text);
        await Bun.sleep(2 ** attempt * 1000);
        continue;
      }
      return json;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await Bun.sleep(2 ** attempt * 1000 + Math.random() * 500);
      continue;
    }
    throw new HttpError(res.status, text);
  }
}

export async function embedRemote(model: string, inputs: string[]) {
  const json = (await post("/embeddings", { model, input: inputs }, 120_000)) as {
    data: { index: number; embedding: number[] }[];
    usage?: { cost?: number };
  };
  const out: Float32Array[] = [];
  for (const d of json.data) out[d.index] = normalize(Float32Array.from(d.embedding));
  if (out.length !== inputs.length || out.some((v) => !v))
    throw new Error(`${model}: expected ${inputs.length} vectors`);
  return { vectors: out, cost: json.usage?.cost ?? 0 };
}

export async function chatJson(model: string, system: string, user: string) {
  const json = (await post(
    "/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    300_000,
  )) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const content = json.choices[0]?.message.content ?? "";
  const match = content.match(/\{[\s\S]*\}/);
  return { value: JSON.parse(match ? match[0] : content) as unknown, cost: json.usage?.cost ?? 0 };
}
