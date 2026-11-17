import { DetectError, parseFeed } from "feedsmith";
import { err, ok, type Result } from "../shared/result";
import { resolveUrl } from "../shared/url";

/** One item from a feed document, normalized across RSS, Atom, RDF and JSON Feed. */
export type ParsedItem = {
  guid: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  publishedAt: number | null;
  contentHtml: string | null;
};

export type ParsedFeed = {
  title: string | null;
  siteUrl: string | null;
  ttlMinutes: number | null;
  items: ParsedItem[];
};

export type FeedParseError = { type: "not_a_feed" } | { type: "malformed_feed"; message: string };

// feedsmith's output types are wide unions across formats; we read them defensively as loose records.
type Loose = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};
const obj = (v: unknown): Loose | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textOf = (v: unknown): string | null => str(v) ?? str(obj(v)?.value);
const textOrName = (v: unknown): string | null => str(v) ?? str(obj(v)?.name);
const date = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function parseFeedDocument(body: string, feedUrl: string): Result<ParsedFeed, FeedParseError> {
  if (!body.trim()) return err({ type: "not_a_feed" });
  let parsed: { format: string; feed: unknown };
  try {
    parsed = parseFeed(body) as { format: string; feed: unknown };
  } catch (e) {
    if (e instanceof DetectError) return err({ type: "not_a_feed" });
    return err({ type: "malformed_feed", message: e instanceof Error ? e.message : String(e) });
  }
  const feed = obj(parsed.feed) ?? {};
  switch (parsed.format) {
    case "atom":
      return ok(fromAtom(feed, feedUrl));
    case "json":
      return ok(fromJson(feed, feedUrl));
    default:
      return ok(fromRss(feed, feedUrl));
  }
}

function fromRss(feed: Loose, feedUrl: string): ParsedFeed {
  const siteUrl = resolveUrl(str(feed.link), feedUrl);
  const base = siteUrl ?? feedUrl;
  const ttl = Number(feed.ttl);
  return {
    title: textOf(feed.title),
    siteUrl,
    ttlMinutes: Number.isFinite(ttl) && ttl > 0 ? ttl : null,
    items: arr(feed.items).map((raw) => {
      const item = obj(raw) ?? {};
      const dc = obj(item.dc);
      return {
        guid: textOf(item.guid),
        url: resolveUrl(str(item.link), base),
        title: textOf(item.title),
        author:
          str(arr(dc?.creators)[0]) ??
          str(dc?.creator) ??
          textOrName(arr(item.authors)[0]) ??
          str(item.author),
        publishedAt: date(item.pubDate) ?? date(dc?.date) ?? date(arr(dc?.dates)[0]),
        contentHtml: str(obj(item.content)?.encoded) ?? str(item.description),
      };
    }),
  };
}

function atomLink(links: unknown, base: string): string | null {
  const list = arr(links)
    .map(obj)
    .filter((l): l is Loose => l !== null);
  const alt = list.find((l) => !l.rel || l.rel === "alternate") ?? null;
  return resolveUrl(str(alt?.href), base);
}

function fromAtom(feed: Loose, feedUrl: string): ParsedFeed {
  const siteUrl = atomLink(feed.links, feedUrl);
  const base = siteUrl ?? feedUrl;
  return {
    title: textOf(feed.title),
    siteUrl,
    ttlMinutes: null,
    items: arr(feed.entries).map((raw) => {
      const e = obj(raw) ?? {};
      return {
        guid: str(e.id),
        url: atomLink(e.links, base),
        title: textOf(e.title),
        author: str(obj(arr(e.authors)[0])?.name),
        publishedAt: date(e.published) ?? date(e.updated),
        contentHtml: textOf(e.content) ?? textOf(e.summary),
      };
    }),
  };
}

function fromJson(feed: Loose, feedUrl: string): ParsedFeed {
  const siteUrl = resolveUrl(str(feed.home_page_url), feedUrl);
  const base = siteUrl ?? feedUrl;
  return {
    title: str(feed.title),
    siteUrl,
    ttlMinutes: null,
    items: arr(feed.items).map((raw) => {
      const i = obj(raw) ?? {};
      const text = str(i.content_text);
      return {
        guid: str(i.id),
        url: resolveUrl(str(i.url), base),
        title: str(i.title),
        author: str(obj(arr(i.authors)[0])?.name) ?? str(obj(i.author)?.name),
        publishedAt: date(i.date_published) ?? date(i.date_modified),
        contentHtml: str(i.content_html) ?? (text ? `<p>${escapeHtml(text)}</p>` : null) ?? str(i.summary),
      };
    }),
  };
}
