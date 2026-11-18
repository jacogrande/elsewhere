import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createOpenRouter } from "./openrouter";

/** A client whose fetch answers with `reply`, recording the requests it saw. */
function client(reply: (url: string) => Response | Promise<Response>) {
  const seen: { url: string; body: unknown }[] = [];
  const ai = createOpenRouter({
    baseUrl: "https://ai.test/v1",
    apiKey: "k",
    embeddingModel: "emb",
    extractionModel: "llm",
    fetch: async (url, init) => {
      seen.push({ url, body: JSON.parse(String(init.body)) });
      return reply(url);
    },
  });
  return { ...ai, seen };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("embedder", () => {
  test("returns unit vectors in input order", async () => {
    const ai = client(() =>
      json({
        data: [
          { index: 1, embedding: [0, 2] },
          { index: 0, embedding: [3, 4] },
        ],
      }),
    );
    const r = await ai.embedder.embed(["a", "b"]);
    if (!r.ok) throw new Error(r.error.detail);
    expect(Array.from(r.value[0] as Float32Array)).toEqual([0.6000000238418579, 0.800000011920929]);
    expect(Array.from(r.value[1] as Float32Array)).toEqual([0, 1]);
    expect(ai.seen[0]).toEqual({
      url: "https://ai.test/v1/embeddings",
      body: { model: "emb", input: ["a", "b"] },
    });
  });

  test("duplicate or out-of-range indexes are invalid", async () => {
    const dup = await client(() =>
      json({
        data: [
          { index: 1, embedding: [1] },
          { index: 1, embedding: [1] },
        ],
      }),
    ).embedder.embed(["a", "b"]);
    expect(dup).toMatchObject({ ok: false, error: { type: "invalid_response" } });
    const out = await client(() => json({ data: [{ index: 3, embedding: [1] }] })).embedder.embed(["a"]);
    expect(out).toMatchObject({ ok: false, error: { type: "invalid_response" } });
  });

  test("a short response is invalid", async () => {
    const r = await client(() => json({ data: [{ index: 0, embedding: [1] }] })).embedder.embed(["a", "b"]);
    expect(r).toMatchObject({ ok: false, error: { type: "invalid_response", retryable: false } });
  });

  test("rate limits and auth problems are retryable; a rejected input is not", async () => {
    const statusOf = async (status: number) =>
      (await client(() => json({ error: { message: "x" } }, status)).embedder.embed(["a"])) as {
        error: { type: string; retryable: boolean };
      };
    expect((await statusOf(429)).error).toMatchObject({ type: "rate_limited", retryable: true });
    expect((await statusOf(401)).error).toMatchObject({ type: "unavailable", retryable: true });
    expect((await statusOf(402)).error).toMatchObject({ type: "unavailable", retryable: true });
    expect((await statusOf(503)).error).toMatchObject({ type: "unavailable", retryable: true });
    expect((await statusOf(400)).error).toMatchObject({ type: "rejected", retryable: false });
  });

  test("an error inside a 200 is still an error", async () => {
    const r = await client(() => json({ error: { code: 429, message: "slow down" } })).embedder.embed(["a"]);
    expect(r).toMatchObject({ ok: false, error: { type: "rate_limited" } });
  });

  test("a network failure is retryable", async () => {
    const r = await client(() => {
      throw new TypeError("connection refused");
    }).embedder.embed(["a"]);
    expect(r).toMatchObject({ ok: false, error: { type: "unavailable", retryable: true } });
  });
});

describe("llm.generate", () => {
  const schema = z.object({ concepts: z.array(z.string()) });
  const reply = (content: string) => () => json({ choices: [{ message: { content } }] });

  test("parses and validates JSON, even inside a code fence", async () => {
    const ai = client(reply('```json\n{"concepts": ["queues"]}\n```'));
    const r = await ai.llm.generate({ system: "s", input: "i", schema });
    expect(r).toEqual({ ok: true, value: { concepts: ["queues"] } });
    expect(ai.seen[0]?.body).toMatchObject({
      model: "llm",
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "i" },
      ],
    });
  });

  test("a reply that fails the schema is an invalid response", async () => {
    const r = await client(reply('{"concepts": "queues"}')).llm.generate({ system: "s", input: "i", schema });
    expect(r).toMatchObject({ ok: false, error: { type: "invalid_response", retryable: false } });
  });

  test("a reply with no JSON is an invalid response", async () => {
    const r = await client(reply("I can't help with that.")).llm.generate({
      system: "s",
      input: "i",
      schema,
    });
    expect(r).toMatchObject({ ok: false, error: { type: "invalid_response" } });
  });
});
