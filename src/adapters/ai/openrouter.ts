import type { z } from "zod";
import type { AiError, Embedder, LanguageModel } from "../../app/ports";
import { normalize } from "../../core/knowledge/vector";
import { err, ok, type Result } from "../../core/shared/result";

export type OpenRouterOptions = {
  baseUrl: string;
  apiKey: string;
  embeddingModel: string;
  extractionModel: string;
  /** Injected in tests. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
};

/**
 * Maps a provider status to an AiError. Only problems with the input itself are permanent
 * ("rejected"); auth, billing and rate limits are retryable so they never mark articles as failed.
 */
function fromStatus(status: number, detail: string): AiError {
  if (status === 429) return { type: "rate_limited", retryable: true, detail };
  if (status === 400 || status === 413 || status === 422)
    return { type: "rejected", retryable: false, detail };
  return { type: "unavailable", retryable: true, detail: `HTTP ${status}: ${detail}` };
}

/** One OpenAI-compatible client for OpenRouter (or any compatible base URL): an embedder and an LLM. */
export function createOpenRouter(options: OpenRouterOptions): { embedder: Embedder; llm: LanguageModel } {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 60_000;

  async function post(path: string, body: unknown): Promise<Result<unknown, AiError>> {
    let res: Response;
    let text: string;
    try {
      res = await doFetch(`${options.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Elsewhere",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      return err({ type: timedOut ? "timeout" : "unavailable", retryable: true, detail: String(e) });
    }
    let json: { error?: { code?: number; message?: string } } & Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      return err(fromStatus(res.ok ? 502 : res.status, text.slice(0, 300)));
    }
    if (!res.ok) return err(fromStatus(res.status, json.error?.message ?? text.slice(0, 300)));
    // OpenRouter sometimes reports upstream failures inside a 200.
    if (json.error) return err(fromStatus(json.error.code ?? 502, json.error.message ?? "upstream error"));
    return ok(json);
  }

  const invalid = (detail: string): Result<never, AiError> =>
    err({ type: "invalid_response", retryable: false, detail });

  const embedder: Embedder = {
    model: options.embeddingModel,
    async embed(texts) {
      const res = await post("/embeddings", { model: options.embeddingModel, input: texts });
      if (!res.ok) return res;
      const data = (res.value as { data?: { index: number; embedding: number[] }[] }).data;
      if (!Array.isArray(data) || data.length !== texts.length)
        return invalid(`expected ${texts.length} vectors`);
      const out: (Float32Array | undefined)[] = new Array(texts.length);
      for (const d of data) {
        if (!Number.isInteger(d.index) || d.index < 0 || d.index >= texts.length || out[d.index]) {
          return invalid("vector indexes don't match inputs");
        }
        out[d.index] = normalize(Float32Array.from(d.embedding));
      }
      return ok(out as Float32Array[]);
    },
  };

  const llm: LanguageModel = {
    model: options.extractionModel,
    async generate<T>(req: { system: string; input: string; schema: z.ZodType<T> }) {
      const res = await post("/chat/completions", {
        model: options.extractionModel,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.input },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      });
      if (!res.ok) return res;
      const content = (res.value as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message
        ?.content;
      // Models sometimes wrap JSON in prose or code fences: take the outermost object.
      const match = content?.match(/\{[\s\S]*\}/);
      if (!match) return invalid("no JSON object in reply");
      let value: unknown;
      try {
        value = JSON.parse(match[0]);
      } catch {
        return invalid("reply is not valid JSON");
      }
      const parsed = req.schema.safeParse(value);
      if (!parsed.success)
        return invalid(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return ok(parsed.data);
    },
  };

  return { embedder, llm };
}
