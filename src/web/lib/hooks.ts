import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ArticleDetail, type ArticlePage, api } from "./api";
import { parseViewState, serializeViewState, type ViewState } from "./view-state";

/** View state backed by the URL query string. */
export function useViewState() {
  const [state, setState] = useState(() => parseViewState(window.location.search));
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    const onPop = () => setState(parseViewState(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<ViewState>, options: { replace?: boolean } = {}) => {
    const next = { ...current.current, ...patch };
    const url = serializeViewState(next) || window.location.pathname;
    if (options.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    current.current = next;
    setState(next);
  }, []);

  return [state, update] as const;
}

export function useArticleList(view: ViewState) {
  return useInfiniteQuery({
    queryKey: ["articles", view.feedId, view.filter, view.q],
    queryFn: ({ pageParam }) =>
      api.articles({
        feedId: view.feedId,
        filter: view.filter,
        q: view.q,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Writes an updated article into every cache that shows it, and refreshes unread counts. */
function patchCaches(qc: QueryClient, article: ArticleDetail) {
  qc.setQueryData(["article", article.id], article);
  qc.setQueriesData<InfiniteData<ArticlePage>>({ queryKey: ["articles"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === article.id ? { ...item, isRead: article.isRead, starred: article.starred } : item,
            ),
          })),
        }
      : data,
  );
  qc.invalidateQueries({ queryKey: ["feeds"] });
}

export function useUpdateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, change }: { id: number; change: { read?: boolean; starred?: boolean } }) =>
      api.updateArticle(id, change),
    onSuccess: (article) => patchCaches(qc, article),
  });
}

/** New entries are turned into articles by a background job; refetch shortly after work that creates them. */
export function refetchSoon(qc: QueryClient) {
  for (const delay of [800, 2500]) {
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["feeds"] });
    }, delay);
  }
}
