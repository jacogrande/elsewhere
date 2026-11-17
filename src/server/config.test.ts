import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  test("defaults embeddings to voyage-4 on OpenRouter, disabled without a key", () => {
    const c = loadConfig({});
    if (!c.ok) throw new Error(c.error);
    expect(c.value.embeddings).toEqual({
      model: "mongodb/voyage-4",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: null,
    });
  });

  test("reads the OpenRouter key and allows overriding the model", () => {
    const c = loadConfig({ OPENROUTER_API_KEY: "sk-test", EMBEDDING_MODEL: "qwen/qwen3-embedding-8b" });
    if (!c.ok) throw new Error(c.error);
    expect(c.value.embeddings).toMatchObject({ model: "qwen/qwen3-embedding-8b", apiKey: "sk-test" });
  });

  test("treats a blank key as missing", () => {
    const c = loadConfig({ OPENROUTER_API_KEY: "  " });
    expect(c.ok && c.value.embeddings.apiKey).toBeNull();
  });

  test("rejects invalid values with a readable message", () => {
    const c = loadConfig({ PORT: "nope" });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain("PORT");
  });
});
