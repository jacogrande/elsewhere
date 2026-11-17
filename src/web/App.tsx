import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleList } from "./components/ArticleList";
import { Reader } from "./components/Reader";
import { Sidebar } from "./components/Sidebar";
import { useArticleList, useUpdateArticle, useViewState } from "./lib/hooks";
import { neighborId } from "./lib/nav";

export function App() {
  const [view, navigate] = useViewState();
  const list = useArticleList(view);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const update = useUpdateArticle();
  const [toast, setToast] = useState<string | null>(null);
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
      const current = items.find((a) => a.id === view.articleId);
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
          navigate({ articleId: null });
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, view.articleId, navigate, update.mutate, list.hasNextPage, list.fetchNextPage]);

  return (
    <div className="app" data-reading={view.articleId !== null}>
      <Sidebar view={view} onNavigate={navigate} notify={notify} />
      <ArticleList view={view} list={list} items={items} onNavigate={navigate} notify={notify} />
      <Reader articleId={view.articleId} onClose={() => navigate({ articleId: null })} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
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
