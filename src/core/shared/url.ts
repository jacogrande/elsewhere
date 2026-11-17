import { err, ok, type Result } from "./result";

export type InvalidUrl = { type: "invalid_url" };

const HTTP_SCHEMES = new Set(["http:", "https:"]);

/** Normalizes a user- or feed-supplied URL. Conservative: query strings are kept because feeds depend on them. */
export function normalizeFeedUrl(input: string): Result<string, InvalidUrl> {
  const trimmed = input.trim();
  if (!trimmed) return err({ type: "invalid_url" });
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return err({ type: "invalid_url" });
  }
  if (!HTTP_SCHEMES.has(url.protocol) || !url.hostname) return err({ type: "invalid_url" });
  url.hash = "";
  return ok(url.toString());
}

/** Resolves `href` against `base`. Returns null for empty, unparseable or non-http(s) results. */
export function resolveUrl(href: string | null | undefined, base: string | null): string | null {
  const value = href?.trim();
  if (!value || !base) return null;
  try {
    const url = new URL(value, base);
    return HTTP_SCHEMES.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
