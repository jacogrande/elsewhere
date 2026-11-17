import { err, ok, type Result } from "../shared/result";

/** Position in the timeline: newest first by sortAt, then id. */
export type Cursor = { sortAt: number; id: number };
export type InvalidCursor = { type: "invalid_cursor" };

export function encodeCursor(c: Cursor): string {
  return btoa(`${c.sortAt}:${c.id}`).replace(/=+$/, "");
}

export function decodeCursor(value: string): Result<Cursor, InvalidCursor> {
  let raw: string;
  try {
    raw = atob(value);
  } catch {
    return err({ type: "invalid_cursor" });
  }
  const match = raw.match(/^(-?\d+):(\d+)$/);
  if (!match) return err({ type: "invalid_cursor" });
  return ok({ sortAt: Number(match[1]), id: Number(match[2]) });
}

/**
 * Turns free text into a safe FTS5 query: each word quoted (so FTS operators are treated as words),
 * and the last word prefix-matched so search-as-you-type works.
 */
export function toFtsQuery(input: string): string | null {
  const words = input.match(/[\p{L}\p{N}]+/gu);
  if (!words?.length) return null;
  return words.map((w, i) => (i === words.length - 1 ? `"${w}"*` : `"${w}"`)).join(" ");
}
