/** ~4k tokens: enough for most posts, and what eval/embeddings measured. */
export const EMBED_MAX_CHARS = 16_000;

/** What we embed for an article: its title and plain text. */
export function embeddingText(article: { title: string; text: string }): string {
  const full = article.text ? `${article.title}\n\n${article.text}` : article.title;
  return full.slice(0, EMBED_MAX_CHARS);
}

/** Scales to unit length so that `dot` is cosine similarity. */
export function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  return n === 0 ? new Float32Array(v.length) : v.map((x) => x / n);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] as number) * (b[i] as number);
  return s;
}
