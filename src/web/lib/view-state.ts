export type Filter = "all" | "unread" | "starred";

/** Everything about what's on screen lives in the URL, so reloads and back/forward just work. */
export type ViewState = { feedId: number | null; filter: Filter; q: string; articleId: number | null };

const FILTERS: Filter[] = ["all", "unread", "starred"];
const DEFAULT_FILTER: Filter = "unread";

const positiveInt = (v: string | null) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

export function parseViewState(search: string): ViewState {
  const p = new URLSearchParams(search);
  const filter = p.get("filter") as Filter | null;
  return {
    feedId: positiveInt(p.get("feed")),
    filter: filter && FILTERS.includes(filter) ? filter : DEFAULT_FILTER,
    q: p.get("q") ?? "",
    articleId: positiveInt(p.get("article")),
  };
}

export function serializeViewState(s: ViewState): string {
  const p = new URLSearchParams();
  if (s.feedId !== null) p.set("feed", String(s.feedId));
  if (s.filter !== DEFAULT_FILTER) p.set("filter", s.filter);
  if (s.q) p.set("q", s.q);
  if (s.articleId !== null) p.set("article", String(s.articleId));
  const str = p.toString();
  return str ? `?${str}` : "";
}
