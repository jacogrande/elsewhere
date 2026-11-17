import { Parser } from "../shared/html-libs";
import { resolveUrl } from "../shared/url";

const FEED_TYPES = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/rdf+xml",
  "application/xml",
  "text/xml",
]);

/** Feed URLs advertised by `<link rel="alternate" type="...">` in an HTML page, resolved and deduplicated. */
export function findFeedLinks(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name !== "link") return;
      const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
      const type = (attrs.type ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
      if (!rel.includes("alternate") || !FEED_TYPES.has(type)) return;
      const url = resolveUrl(attrs.href, pageUrl);
      if (url && !found.includes(url)) found.push(url);
    },
  });
  parser.write(html);
  parser.end();
  return found;
}

const FALLBACK_PATHS = ["/feed", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/rss"];

/** Common feed locations to probe when a page advertises none (after Miniflux's finder). */
export function fallbackFeedUrls(pageUrl: string): string[] {
  return FALLBACK_PATHS.map((path) => resolveUrl(path, pageUrl)).filter((u): u is string => u !== null);
}

export function looksLikeHtml(body: string): boolean {
  return /^\s*(<!doctype html|<html[\s>])/i.test(body);
}
