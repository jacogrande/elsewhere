/**
 * Embeds the eval corpus (whole docs + article halves) with each model and caches the vectors.
 * Usage: bun eval/embeddings/embed.ts <corpus.db> <out dir> [model ...]
 * Models prefixed "local:" run in-process with Transformers.js on CPU.
 */
import {
  type Doc,
  docText,
  embedRemote,
  encodeVec,
  HttpError,
  halves,
  loadDocs,
  normalize,
  readVectors,
  writeVectors,
} from "./lib";

export const REMOTE_MODELS = [
  "openai/text-embedding-3-small",
  "openai/text-embedding-3-large",
  "qwen/qwen3-embedding-8b",
  "qwen/qwen3-embedding-4b",
  "google/gemini-embedding-001",
  "google/gemini-embedding-2",
  "mongodb/voyage-4",
  "mongodb/voyage-4-large",
  "cohere/embed-5-pro",
  "nvidia/nemotron-3.5-embed-8b:free",
  "perplexity/pplx-embed-v1-4b",
  "baai/bge-m3",
];
export const LOCAL_MODELS = ["local:embeddinggemma-300m", "local:qwen3-embedding-0.6b"];

const [dbPath, outDir, ...requested] = process.argv.slice(2);
if (!dbPath || !outDir) throw new Error("usage: embed.ts <corpus.db> <out dir> [model ...]");
const models = requested.length ? requested : [...REMOTE_MODELS, ...LOCAL_MODELS];

const docs = loadDocs(dbPath);
const hv = halves(docs);
console.log(`${docs.length} docs, ${hv.length} half pairs`);

type Item = { key: string; text: string; title: string };
const items: Item[] = [
  ...docs.map((d: Doc) => ({ key: `doc:${d.id}`, text: docText(d), title: d.title })),
  ...hv.flatMap((h) => [
    { key: `a:${h.id}`, text: h.a, title: "none" },
    { key: `b:${h.id}`, text: h.b, title: "none" },
  ]),
];

const BATCH_CHARS = 120_000;
function batches(list: Item[]): Item[][] {
  const out: Item[][] = [];
  let cur: Item[] = [];
  let chars = 0;
  for (const it of list) {
    if (cur.length && (chars + it.text.length > BATCH_CHARS || cur.length >= 16)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(it);
    chars += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function runRemote(model: string) {
  const started = performance.now();
  const vectors: Record<string, string> = {};
  let cost = 0;
  let truncated = 0;
  const queue = batches(items);
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const r = await embedRemote(
          model,
          b.map((i) => i.text),
        );
        cost += r.cost;
        b.forEach((it, i) => {
          vectors[it.key] = encodeVec(r.vectors[i] as Float32Array);
        });
      } catch (e) {
        if (!(e instanceof HttpError) || e.status !== 400) throw e;
        // Probably an input over this model's token limit: retry one by one, shortening as needed.
        for (const it of b) {
          for (let limit = it.text.length; ; limit = Math.floor(limit / 2)) {
            try {
              const r = await embedRemote(model, [it.text.slice(0, limit)]);
              cost += r.cost;
              vectors[it.key] = encodeVec(r.vectors[0] as Float32Array);
              if (limit < it.text.length) truncated++;
              break;
            } catch (inner) {
              if (!(inner instanceof HttpError) || inner.status !== 400 || limit < 500) throw inner;
            }
          }
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const dims = Buffer.from(Object.values(vectors)[0] ?? "", "base64").byteLength / 4;
  return { model, dims, costUsd: cost, ms: performance.now() - started, truncated, vectors };
}

async function runLocal(model: string) {
  const { AutoModel, AutoTokenizer, env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = Bun.env.HF_HOME ?? env.cacheDir;
  const started = performance.now();
  const vectors: Record<string, string> = {};
  const MAX_TOKENS = 2048;

  if (model === "local:embeddinggemma-300m") {
    const id = "onnx-community/embeddinggemma-300m-ONNX";
    const tokenizer = await AutoTokenizer.from_pretrained(id);
    const m = await AutoModel.from_pretrained(id, { dtype: "q8" });
    for (let i = 0; i < items.length; i += 1) {
      const chunk = items.slice(i, i + 1);
      const inputs = tokenizer(
        chunk.map((it) => `title: ${it.title.replace(/\s+/g, " ")} | text: ${it.text}`),
        { padding: true, truncation: true, max_length: MAX_TOKENS },
      );
      const { sentence_embedding } = await m(inputs);
      const rows = sentence_embedding.tolist() as number[][];
      chunk.forEach((it, j) => {
        vectors[it.key] = encodeVec(normalize(Float32Array.from(rows[j] as number[])));
      });
      if (i % 100 === 0) console.log(`  ${model} ${i}/${items.length}`);
    }
  } else if (model === "local:qwen3-embedding-0.6b") {
    const ext = await pipeline("feature-extraction", "onnx-community/Qwen3-Embedding-0.6B-ONNX", {
      dtype: "q8",
    });
    const tokenizer = ext.tokenizer;
    for (let i = 0; i < items.length; i += 1) {
      const chunk = items.slice(i, i + 1);
      // Truncate to MAX_TOKENS by tokenizing first; documents take no instruction prefix.
      const texts = chunk.map((it) => {
        const ids = tokenizer.encode(it.text).slice(0, MAX_TOKENS - 2);
        return tokenizer.decode(ids, { skip_special_tokens: true });
      });
      const out = await ext(texts, { pooling: "last_token", normalize: true });
      const rows = out.tolist() as number[][];
      chunk.forEach((it, j) => {
        vectors[it.key] = encodeVec(Float32Array.from(rows[j] as number[]));
      });
      if (i % 100 === 0) console.log(`  ${model} ${i}/${items.length}`);
    }
  } else {
    throw new Error(`unknown local model ${model}`);
  }
  const dims = Buffer.from(Object.values(vectors)[0] ?? "", "base64").byteLength / 4;
  return { model, dims, costUsd: 0, ms: performance.now() - started, truncated: 0, vectors };
}

await Promise.all(
  models.map(async (model) => {
    if (await readVectors(outDir, model)) {
      console.log(`cached  ${model}`);
      return;
    }
    try {
      const file = model.startsWith("local:") ? await runLocal(model) : await runRemote(model);
      await writeVectors(outDir, file);
      console.log(
        `done    ${model}  dims=${file.dims}  $${file.costUsd.toFixed(4)}  ${(file.ms / 1000).toFixed(0)}s  truncated=${file.truncated}`,
      );
    } catch (e) {
      console.log(`FAILED  ${model}  ${e instanceof Error ? e.message : String(e)}`);
    }
  }),
);
