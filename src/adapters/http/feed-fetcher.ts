import type { FeedFetcher } from "../../app/ports";
import { decodeBody } from "../../core/feeds/charset";
import type { FetchOutcome } from "../../core/feeds/fetch-outcome";

export type FetcherOptions = {
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetch?: typeof globalThis.fetch;
};

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.7, */*;q=0.5";

class TooLarge extends Error {}

/**
 * HTTP adapter for FeedFetcher. Never throws: every failure becomes a FetchOutcome.
 * Requests to the same host are serialized, so we never hit one site with parallel requests.
 */
export function createHttpFetcher(options: FetcherOptions): FeedFetcher {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const doFetch = options.fetch ?? globalThis.fetch;
  const hostQueues = new Map<string, Promise<unknown>>();

  const perHost = <T>(url: string, task: () => Promise<T>): Promise<T> => {
    const host = new URL(url).host;
    const previous = hostQueues.get(host) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    hostQueues.set(host, settled);
    settled.then(() => {
      if (hostQueues.get(host) === settled) hostQueues.delete(host);
    });
    return run;
  };

  async function fetchOnce(
    url: string,
    validators: { etag: string | null; lastModified: string | null } | undefined,
  ): Promise<FetchOutcome> {
    const signal = AbortSignal.timeout(timeoutMs);
    let current = url;
    let allPermanent = true;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const headers: Record<string, string> = { "User-Agent": options.userAgent, Accept: ACCEPT };
      // Only send validators to the URL they came from.
      if (hop === 0 && validators?.etag) headers["If-None-Match"] = validators.etag;
      if (hop === 0 && validators?.lastModified) headers["If-Modified-Since"] = validators.lastModified;

      const res = await doFetch(current, { headers, redirect: "manual", signal });

      if (res.status >= 300 && res.status < 400 && res.status !== 304) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return { kind: "http_error", status: res.status, retryAfter: null, challenge: false };
        if (res.status !== 301 && res.status !== 308) allPermanent = false;
        current = new URL(location, current).toString();
        continue;
      }

      const common = {
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        cacheControl: res.headers.get("cache-control"),
        expires: res.headers.get("expires"),
      };

      if (res.status === 304) return { kind: "not_modified", ...common };

      if (!res.ok) {
        const challenge = res.status === 403 && res.headers.get("cf-mitigated") === "challenge";
        await res.body?.cancel();
        return {
          kind: "http_error",
          status: res.status,
          retryAfter: res.headers.get("retry-after"),
          challenge,
        };
      }

      const bytes = await readCapped(res, maxBytes);
      return {
        kind: "ok",
        body: decodeBody(bytes, res.headers.get("content-type")),
        finalUrl: current,
        permanentRedirectTo: hop > 0 && allPermanent ? current : null,
        ...common,
      };
    }
    return { kind: "too_many_redirects" };
  }

  return {
    fetch(url, validators) {
      return perHost(url, async () => {
        try {
          return await fetchOnce(url, validators);
        } catch (e) {
          if (e instanceof TooLarge) return { kind: "too_large" };
          if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
            return { kind: "timeout" };
          }
          return { kind: "network_error", message: e instanceof Error ? e.message : String(e) };
        }
      });
    },
  };
}

/** Reads the (already decompressed) body, aborting once it exceeds maxBytes. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new TooLarge();
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
