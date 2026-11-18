import { z } from "zod";
import { err, ok, type Result } from "../core/shared/result";

/** Chosen by eval/embeddings (see RESULTS.md): tied for best on related reading, small 1024-dim vectors. */
export const DEFAULT_EMBEDDING_MODEL = "mongodb/voyage-4";
/** Cheap and good at structured extraction (~$0.0005 per article). */
export const DEFAULT_EXTRACTION_MODEL = "anthropic/claude-haiku-5.5";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PATH: z.string().min(1).default("./data/elsewhere.db"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OPENROUTER_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default(DEFAULT_EMBEDDING_MODEL),
  EXTRACTION_MODEL: z.string().min(1).default(DEFAULT_EXTRACTION_MODEL),
});

export type Config = {
  port: number;
  host: string;
  databasePath: string;
  dev: boolean;
  /** Knowledge features (embeddings, concepts, related reading) are off when null: no API key. */
  ai: { baseUrl: string; apiKey: string; embeddingModel: string; extractionModel: string } | null;
};

export function loadConfig(env: Record<string, string | undefined>): Result<Config, string> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
  }
  const c = parsed.data;
  const apiKey = c.OPENROUTER_API_KEY?.trim();
  return ok({
    port: c.PORT,
    host: c.HOST,
    databasePath: c.DATABASE_PATH,
    dev: c.NODE_ENV !== "production",
    ai: apiKey
      ? {
          baseUrl: OPENROUTER_BASE_URL,
          apiKey,
          embeddingModel: c.EMBEDDING_MODEL,
          extractionModel: c.EXTRACTION_MODEL,
        }
      : null,
  });
}
