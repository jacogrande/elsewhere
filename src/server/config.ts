import { z } from "zod";
import { err, ok, type Result } from "../core/shared/result";

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PATH: z.string().min(1).default("./data/elsewhere.db"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = {
  port: number;
  host: string;
  databasePath: string;
  dev: boolean;
};

export function loadConfig(env: Record<string, string | undefined>): Result<Config, string> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    return err(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
  }
  const c = parsed.data;
  return ok({ port: c.PORT, host: c.HOST, databasePath: c.DATABASE_PATH, dev: c.NODE_ENV !== "production" });
}
