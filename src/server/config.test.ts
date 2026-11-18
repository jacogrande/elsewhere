import { describe, expect, test } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  test("AI features are off without a key", () => {
    const c = loadConfig({});
    if (!c.ok) throw new Error(c.error);
    expect(c.value.ai).toBeNull();
  });

  test("with a key, defaults to voyage-4 and Haiku on OpenRouter", () => {
    const c = loadConfig({ OPENROUTER_API_KEY: "sk-test" });
    if (!c.ok) throw new Error(c.error);
    expect(c.value.ai).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      embeddingModel: "mongodb/voyage-4",
      extractionModel: "anthropic/claude-haiku-5.5",
    });
  });

  test("allows overriding the models", () => {
    const c = loadConfig({
      OPENROUTER_API_KEY: "sk-test",
      EMBEDDING_MODEL: "qwen/qwen3-embedding-8b",
      EXTRACTION_MODEL: "google/gemini-3.5-flash-lite",
    });
    if (!c.ok) throw new Error(c.error);
    expect(c.value.ai).toMatchObject({
      embeddingModel: "qwen/qwen3-embedding-8b",
      extractionModel: "google/gemini-3.5-flash-lite",
    });
  });

  test("treats a blank key as missing", () => {
    const c = loadConfig({ OPENROUTER_API_KEY: "  " });
    expect(c.ok && c.value.ai).toBeNull();
  });

  test("rejects invalid values with a readable message", () => {
    const c = loadConfig({ PORT: "nope" });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain("PORT");
  });
});
