import type { Point } from "./extraction";

/**
 * Points are the specific things an article says: an argument, a finding, a fact, an explanation,
 * a piece of advice. Each carries a quote, and a point is only kept if its quote is really in the
 * article. That check is what lets the reader trust a point enough to compare it with others.
 */
const MIN_QUOTE_WORDS = 4;

const normalize = (s: string) =>
  s
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** True if `quote` appears in `text`, allowing elisions ("…" or "...") as long as the parts appear in order. */
export function verifyQuote(text: string, quote: string): boolean {
  const parts = normalize(quote)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .filter(Boolean);
  if (parts.join(" ").split(" ").length < MIN_QUOTE_WORDS) return false;
  const haystack = normalize(text);
  let from = 0;
  for (const part of parts) {
    const at = haystack.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}

/** The points whose quote appears in the article's title or text. */
export function verifiedPoints(points: Point[], title: string, text: string): Point[] {
  const source = `${title}\n${text}`;
  return points.filter((p) => verifyQuote(source, p.quote));
}

/** What we embed for a point: its subject, then the statement, so matching is about the narrow thing. */
export const pointText = (p: Point) => `${p.subject}: ${p.statement}`;
