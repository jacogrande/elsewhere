/**
 * The result of fetching a feed URL, as plain data. The fetcher adapter never throws;
 * every way a fetch can end is one of these, and the core decides what each means.
 */
export type FetchOutcome =
  | {
      kind: "ok";
      body: string;
      finalUrl: string;
      /** Set when every redirect hop was permanent (301/308): the feed has moved. */
      permanentRedirectTo: string | null;
      etag: string | null;
      lastModified: string | null;
      cacheControl: string | null;
      expires: string | null;
    }
  | {
      kind: "not_modified";
      etag: string | null;
      lastModified: string | null;
      cacheControl: string | null;
      expires: string | null;
    }
  | { kind: "http_error"; status: number; retryAfter: string | null; challenge: boolean }
  | { kind: "network_error"; message: string }
  | { kind: "timeout" }
  | { kind: "too_large" }
  | { kind: "too_many_redirects" };

export type FetchFailure = Exclude<FetchOutcome, { kind: "ok" | "not_modified" }>;

export function describeFetchFailure(outcome: FetchFailure): string {
  switch (outcome.kind) {
    case "http_error":
      if (outcome.challenge) return `HTTP ${outcome.status}: the site answered with a bot challenge`;
      return `HTTP ${outcome.status}`;
    case "network_error":
      return `Network error: ${outcome.message}`;
    case "timeout":
      return "The server took too long to respond";
    case "too_large":
      return "The response was too large";
    case "too_many_redirects":
      return "Too many redirects";
  }
}
