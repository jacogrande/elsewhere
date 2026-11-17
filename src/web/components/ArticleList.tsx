import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type ArticleItem, api } from "../lib/api";
import { relativeTime } from "../lib/format";
import type { useArticleList } from "../lib/hooks";
import type { ViewState } from "../lib/view-state";

type Props = {
  view: ViewState;
  list: ReturnType<typeof useArticleList>;
  items: ArticleItem[];
  onNavigate: (patch: Partial<ViewState>, options?: { replace?: boolean }) => void;
  notify: (message: string) => void;
};

export function ArticleList({ view, list, items, onNavigate, notify }: Props) {
  const qc = useQueryClient();
  const feeds = useQuery({ queryKey: ["feeds"], queryFn: api.feeds });
  const feed = feeds.data?.feeds.find((f) => f.id === view.feedId);
  const heading = feed?.title ?? { unread: "Unread", starred: "Starred", all: "All articles" }[view.filter];
  const maxId = list.data?.pages[0]?.maxId ?? 0;

  const markAll = useMutation({
    mutationFn: () => api.markAllRead(view.feedId, maxId),
    onSuccess: ({ marked }) => {
      notify(marked ? `Marked ${marked} as read` : "Nothing to mark");
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["feeds"] });
    },
    onError: (e) => notify(e.message),
  });

  // Infinite scroll: load the next page when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Keep the selected article in view during keyboard navigation.
  useEffect(() => {
    if (view.articleId)
      document.getElementById(`article-${view.articleId}`)?.scrollIntoView({ block: "nearest" });
  }, [view.articleId]);

  return (
    <section className="list" aria-label="Articles">
      <header className="list-header">
        <div className="list-title-row">
          <h2>{heading}</h2>
          <div className="list-actions">
            {feed && (
              <select
                value={view.filter}
                onChange={(e) =>
                  onNavigate({ filter: e.target.value as ViewState["filter"], articleId: null })
                }
                aria-label="Show"
              >
                <option value="unread">Unread</option>
                <option value="all">All</option>
                <option value="starred">Starred</option>
              </select>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Mark all as read"
              disabled={!maxId || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              ✓
            </button>
          </div>
        </div>
        <SearchBox value={view.q} onChange={(q) => onNavigate({ q, articleId: null }, { replace: true })} />
      </header>

      <div className="list-body">
        {list.isPending && <p className="muted pad">Loading…</p>}
        {list.isError && (
          <p className="error pad">
            {list.error.message}{" "}
            <button type="button" className="link" onClick={() => list.refetch()}>
              Retry
            </button>
          </p>
        )}
        {list.isSuccess && items.length === 0 && (
          <p className="muted pad">
            {view.q ? "No matches." : view.filter === "unread" ? "All caught up." : "Nothing here yet."}
          </p>
        )}
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                id={`article-${a.id}`}
                className="item"
                data-unread={!a.isRead}
                aria-current={view.articleId === a.id}
                onClick={() => onNavigate({ articleId: a.id })}
              >
                <span className="item-meta">
                  {!view.feedId && <span className="item-feed">{a.feedTitle}</span>}
                  <span>{relativeTime(a.publishedAt ?? a.sortAt, Date.now())}</span>
                  {a.starred && (
                    <span className="star" role="img" aria-label="Starred">
                      ★
                    </span>
                  )}
                </span>
                <span className="item-title">{a.title}</span>
                {a.excerpt && <span className="item-excerpt">{a.excerpt}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div ref={sentinel} />
        {list.isFetchingNextPage && <p className="muted small pad">Loading more…</p>}
      </div>
    </section>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 250);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <input
      id="search"
      type="search"
      className="search"
      placeholder="Search  ( / )"
      value={text}
      onChange={(e) => setText(e.target.value)}
      aria-label="Search articles"
    />
  );
}
