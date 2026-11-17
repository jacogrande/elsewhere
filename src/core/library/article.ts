import type sanitize from "sanitize-html";
import { Parser, sanitizeHtml } from "../shared/html-libs";
import { resolveUrl } from "../shared/url";

/** An entry as the library receives it from the feeds context. */
export type EntryForArticle = {
  id: number;
  feedId: number;
  url: string | null;
  title: string | null;
  author: string | null;
  publishedAt: number | null;
  contentHtml: string | null;
  firstSeenAt: number;
};

export type NewArticle = {
  entryId: number;
  feedId: number;
  url: string | null;
  title: string;
  author: string | null;
  html: string;
  text: string;
  excerpt: string;
  wordCount: number;
  publishedAt: number | null;
  /** Timeline position: published time, but never later than when we first saw it. */
  sortAt: number;
};

const EXCERPT_LENGTH = 280;

export function articleFromEntry(entry: EntryForArticle): NewArticle {
  const base = entry.url;
  const html = entry.contentHtml ? sanitizeArticleHtml(entry.contentHtml, base) : "";
  const text = htmlToText(html);
  const title = entry.title?.trim() || excerpt(text, 80) || "Untitled";
  return {
    entryId: entry.id,
    feedId: entry.feedId,
    url: entry.url,
    title,
    author: entry.author,
    html,
    text,
    excerpt: excerpt(text, EXCERPT_LENGTH),
    wordCount: text ? text.split(" ").length : 0,
    publishedAt: entry.publishedAt,
    sortAt: Math.min(entry.publishedAt ?? entry.firstSeenAt, entry.firstSeenAt),
  };
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "ins",
  "sub",
  "sup",
  "small",
  "mark",
  "blockquote",
  "q",
  "cite",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "colgroup",
  "col",
  "figure",
  "figcaption",
  "img",
  "picture",
  "source",
  "video",
  "audio",
  "details",
  "summary",
  "abbr",
  "time",
  "span",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
];

/** Allowlist sanitizer for untrusted feed HTML (modelled on Miniflux's). Relative URLs are resolved. */
export function sanitizeArticleHtml(html: string, baseUrl: string | null): string {
  const resolve = (attr: string) => (tagName: string, attribs: sanitize.Attributes) => {
    const value = attribs[attr];
    const next = { ...attribs };
    if (value !== undefined) {
      const url = resolveUrl(value, baseUrl ?? "https://invalid.invalid/");
      if (url && !url.startsWith("https://invalid.invalid/")) next[attr] = url;
      else delete next[attr];
    }
    return { tagName, attribs: next };
  };

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      source: ["src", "type", "media"],
      video: ["src", "poster", "controls", "width", "height"],
      audio: ["src", "controls"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      abbr: ["title"],
      time: ["datetime"],
      ol: ["start", "reversed"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const { attribs: resolved } = resolve("href")(tagName, attribs);
        return { tagName, attribs: { ...resolved, target: "_blank", rel: "noopener noreferrer" } };
      },
      img: resolve("src"),
      source: resolve("src"),
      video: resolve("src"),
      audio: resolve("src"),
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      (!frame.attribs.src || (frame.attribs.width === "1" && frame.attribs.height === "1")),
  });
}

const BLOCK_TAGS = new Set([
  "p",
  "br",
  "div",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "tr",
  "td",
  "th",
  "section",
  "article",
  "header",
  "footer",
  "figure",
  "figcaption",
  "dt",
  "dd",
  "hr",
]);
const SKIP_TAGS = new Set(["script", "style", "noscript"]);

/** Plain text from HTML, with block elements separated and whitespace collapsed. */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  let skipping = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP_TAGS.has(name)) skipping++;
        else if (BLOCK_TAGS.has(name)) parts.push(" ");
      },
      onclosetag(name) {
        if (SKIP_TAGS.has(name)) skipping--;
        else if (BLOCK_TAGS.has(name)) parts.push(" ");
      },
      ontext(text) {
        if (skipping === 0) parts.push(text);
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Shortens text to at most `max` characters at a word boundary. */
export function excerpt(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
