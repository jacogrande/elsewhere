import { generateOpml, parseOpml } from "feedsmith";
import { err, ok, type Result } from "../shared/result";

export type OpmlFeed = { url: string; title: string; siteUrl: string | null };
export type InvalidOpml = { type: "invalid_opml" };

type Outline = { text?: string; title?: string; xmlUrl?: string; htmlUrl?: string; outlines?: Outline[] };

export function parseOpmlFeeds(xml: string): Result<OpmlFeed[], InvalidOpml> {
  if (!xml.trim()) return err({ type: "invalid_opml" });
  let doc: { body?: { outlines?: Outline[] } };
  try {
    doc = parseOpml(xml) as typeof doc;
  } catch {
    return err({ type: "invalid_opml" });
  }
  if (!doc.body) return err({ type: "invalid_opml" });

  const feeds: OpmlFeed[] = [];
  const walk = (outlines: Outline[] | undefined) => {
    for (const o of outlines ?? []) {
      const url = o.xmlUrl?.trim();
      if (url)
        feeds.push({
          url,
          title: o.title?.trim() || o.text?.trim() || url,
          siteUrl: o.htmlUrl?.trim() || null,
        });
      walk(o.outlines);
    }
  };
  walk(doc.body.outlines);
  return ok(feeds);
}

export function buildOpml(feeds: readonly OpmlFeed[], now: number): string {
  return generateOpml({
    head: { title: "Elsewhere subscriptions", dateCreated: new Date(now) },
    body: {
      outlines: feeds.map((f) => ({
        text: f.title,
        title: f.title,
        type: "rss",
        xmlUrl: f.url,
        ...(f.siteUrl ? { htmlUrl: f.siteUrl } : {}),
      })),
    },
  });
}
