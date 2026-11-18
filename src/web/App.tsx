import { useQueryClient } from "@tanstack/react-query";
import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleList } from "./components/ArticleList";
import { Reader } from "./components/Reader";
import { Sidebar } from "./components/Sidebar";
import type { ArticleDetail } from "./lib/api";
import { useArticleList, useUpdateArticle, useViewState } from "./lib/hooks";
import { neighborId } from "./lib/nav";

export function App() {
  const [view, navigate] = useViewState();
  const list = useArticleList(view);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const update = useUpdateArticle();
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [feedsOpen, setFeedsOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // Keyboard shortcuts, as in most feed readers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select")) {
        if (e.key === "Escape") target.blur();
        return;
      }
      // The open article may not be in the list (e.g. opened from "Read next").
      const current =
        items.find((a) => a.id === view.articleId) ??
        qc.getQueryData<ArticleDetail>(["article", view.articleId]);
      const ids = items.map((a) => a.id);
      switch (e.key) {
        case "j":
        case "k": {
          const next = neighborId(ids, view.articleId, e.key === "j" ? 1 : -1);
          if (next !== null) navigate({ articleId: next }, { replace: true });
          if (e.key === "j" && next === ids.at(-1) && list.hasNextPage) list.fetchNextPage();
          break;
        }
        case "s":
          if (current) update.mutate({ id: current.id, change: { starred: !current.starred } });
          break;
        case "m":
          if (current) update.mutate({ id: current.id, change: { read: !current.isRead } });
          break;
        case "o":
        case "v":
          if (current?.url) window.open(current.url, "_blank", "noopener,noreferrer");
          break;
        case "/":
          e.preventDefault();
          document.getElementById("search")?.focus();
          break;
        case "Escape":
          if (feedsOpen) setFeedsOpen(false);
          else navigate({ articleId: null });
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, view.articleId, navigate, update.mutate, list.hasNextPage, list.fetchNextPage, qc, feedsOpen]);

  return (
    <div className="app" data-reading={view.articleId !== null}>
      <nav className="rail-nav" aria-label="Main">
        <button
          type="button"
          className="rail-button"
          aria-expanded={feedsOpen}
          aria-controls="feeds-drawer"
          onClick={() => setFeedsOpen((open) => !open)}
        >
          <FeedsIcon />
          <span>Feeds</span>
        </button>
      </nav>
      {feedsOpen && (
        <div className="drawer-backdrop" aria-hidden="true" onClick={() => setFeedsOpen(false)} />
      )}
      <div id="feeds-drawer" className="drawer" data-open={feedsOpen} inert={!feedsOpen}>
        <Sidebar
          view={view}
          onNavigate={(patch) => {
            navigate(patch);
            setFeedsOpen(false);
          }}
          notify={notify}
        />
      </div>
      <ArticleList view={view} list={list} items={items} onNavigate={navigate} notify={notify} />
      <Reader
        articleId={view.articleId}
        onClose={() => navigate({ articleId: null })}
        onOpen={(id) => navigate({ articleId: id })}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/** A feed icon: a dot and two arcs. */
function FeedsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="5.5" cy="18.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 11a9 9 0 0 1 9 9" strokeLinecap="round" />
      <path d="M4 4a16 16 0 0 1 16 16" strokeLinecap="round" />
    </svg>
  );
}

/** Last line of defence for rendering bugs. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Something broke.</h1>
        <pre>{this.state.error.message}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
