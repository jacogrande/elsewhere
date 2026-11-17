import type { Context } from "hono";
import type { FeedNotFound, SubscribeError } from "../../app/feeds";
import type { ArticleNotFound } from "../../app/library";
import type { InvalidOpml } from "../../core/feeds/opml";
import type { InvalidCursor } from "../../core/library/query";

export type AppError = SubscribeError | FeedNotFound | ArticleNotFound | InvalidOpml | InvalidCursor;

/** RFC 9457 problem details. */
export type Problem = { type: string; title: string; status: number; detail?: string };

const TABLE: Record<AppError["type"], { status: 400 | 404 | 409 | 422 | 502; title: string }> = {
  invalid_url: { status: 400, title: "That doesn't look like a web address" },
  invalid_opml: { status: 400, title: "That file isn't valid OPML" },
  invalid_cursor: { status: 400, title: "Invalid page cursor" },
  already_subscribed: { status: 409, title: "You're already subscribed to this feed" },
  no_feed_found: { status: 422, title: "No feed found at that address" },
  fetch_failed: { status: 502, title: "Couldn't fetch that address" },
  feed_not_found: { status: 404, title: "Feed not found" },
  article_not_found: { status: 404, title: "Article not found" },
};

/** The one place domain errors become HTTP responses. */
export function problem(c: Context, error: AppError) {
  const { status, title } = TABLE[error.type];
  const body: Problem = { type: error.type, title, status };
  if (error.type === "fetch_failed") body.detail = error.detail;
  return c.json(body, status, { "content-type": "application/problem+json" });
}
