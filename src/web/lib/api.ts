import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "../../server/http/api";
import type { Problem } from "../../server/http/errors";
import type { Filter } from "./view-state";

const client = hc<AppType>("/");

export type FeedSummary = InferResponseType<typeof client.api.feeds.$get, 200>["feeds"][number];
export type ArticlePage = InferResponseType<typeof client.api.articles.$get, 200>;
export type ArticleItem = ArticlePage["items"][number];
export type ArticleDetail = InferResponseType<(typeof client.api.articles)[":id"]["$get"], 200>;

/** A failed API call, carrying the server's problem details. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ? `${problem.title}: ${problem.detail}` : problem.title);
  }
}

/** The part of a response `call` needs; satisfied by both fetch's Response and Hono's ClientResponse. */
type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

async function call<T>(request: Promise<JsonResponse>): Promise<T> {
  let res: JsonResponse;
  try {
    res = await request;
  } catch {
    throw new ApiError({ type: "network", title: "Can't reach the Elsewhere server", status: 0 });
  }
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  const problem = (await res.json().catch(() => null)) as Problem | null;
  throw new ApiError(
    problem && typeof problem.title === "string"
      ? problem
      : { type: "http", title: `Request failed (${res.status})`, status: res.status },
  );
}

export const api = {
  feeds: () => call<{ feeds: FeedSummary[] }>(client.api.feeds.$get()),
  subscribe: (url: string) => call<{ feedId: number }>(client.api.feeds.$post({ json: { url } })),
  unsubscribe: (id: number) => call<void>(client.api.feeds[":id"].$delete({ param: { id: String(id) } })),
  refreshFeed: (id: number) =>
    call<{ newEntries: number; health: string }>(
      client.api.feeds[":id"].refresh.$post({ param: { id: String(id) } }),
    ),

  articles: (q: { feedId: number | null; filter: Filter; q: string; cursor?: string }) =>
    call<ArticlePage>(
      client.api.articles.$get({
        query: {
          filter: q.filter,
          ...(q.feedId ? { feedId: String(q.feedId) } : {}),
          ...(q.q ? { q: q.q } : {}),
          ...(q.cursor ? { cursor: q.cursor } : {}),
        },
      }),
    ),
  article: (id: number) =>
    call<ArticleDetail>(client.api.articles[":id"].$get({ param: { id: String(id) } })),
  updateArticle: (id: number, change: { read?: boolean; starred?: boolean }) =>
    call<ArticleDetail>(client.api.articles[":id"].$patch({ param: { id: String(id) }, json: change })),
  markAllRead: (feedId: number | null, upToId: number) =>
    call<{ marked: number }>(client.api.articles["mark-read"].$post({ json: { feedId, upToId } })),

  importOpml: (xml: string) =>
    call<{ added: number; skipped: number }>(fetch("/api/opml", { method: "POST", body: xml })),
};
