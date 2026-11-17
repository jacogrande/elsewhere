import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../lib/api";
import { readingTime } from "../lib/format";
import { useUpdateArticle } from "../lib/hooks";

export function Reader({ articleId, onClose }: { articleId: number | null; onClose: () => void }) {
  const article = useQuery({
    queryKey: ["article", articleId],
    queryFn: () => api.article(articleId ?? 0),
    enabled: articleId !== null,
  });
  const update = useUpdateArticle();
  const body = useRef<HTMLDivElement>(null);

  // Opening an article marks it read, once. If the user marks it unread again, leave it alone.
  const autoMarked = useRef(new Set<number>());
  const data = article.data;
  useEffect(() => {
    if (!data || data.isRead || autoMarked.current.has(data.id)) return;
    autoMarked.current.add(data.id);
    update.mutate({ id: data.id, change: { read: true } });
  }, [data, update.mutate]);

  useEffect(() => {
    if (articleId !== null) body.current?.scrollTo({ top: 0 });
  }, [articleId]);

  if (articleId === null) {
    return (
      <section className="reader reader-empty">
        <div>
          <p>Pick an article.</p>
          <p className="muted small">
            <kbd>j</kbd>/<kbd>k</kbd> next/previous · <kbd>s</kbd> star · <kbd>m</kbd> read/unread ·{" "}
            <kbd>o</kbd> open original · <kbd>/</kbd> search
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="reader" ref={body} aria-label="Article">
      <button type="button" className="back link" onClick={onClose}>
        ← Back
      </button>
      {article.isPending && <p className="muted pad">Loading…</p>}
      {article.isError && <p className="error pad">{article.error.message}</p>}
      {data && (
        <article>
          <header className="reader-header">
            <p className="reader-meta">
              <span>{data.feedTitle}</span>
              {data.author && <span>{data.author}</span>}
              {data.publishedAt && (
                <time dateTime={new Date(data.publishedAt).toISOString()}>
                  {new Date(data.publishedAt).toLocaleDateString(undefined, { dateStyle: "long" })}
                </time>
              )}
              {data.wordCount > 0 && <span>{readingTime(data.wordCount)}</span>}
            </p>
            <h1>
              {data.url ? (
                <a href={data.url} target="_blank" rel="noopener noreferrer">
                  {data.title}
                </a>
              ) : (
                data.title
              )}
            </h1>
            <div className="reader-actions">
              <button
                type="button"
                onClick={() => update.mutate({ id: data.id, change: { starred: !data.starred } })}
              >
                {data.starred ? "★ Starred" : "☆ Star"}
              </button>
              <button
                type="button"
                onClick={() => update.mutate({ id: data.id, change: { read: !data.isRead } })}
              >
                Mark {data.isRead ? "unread" : "read"}
              </button>
              {data.url && (
                <a className="button" href={data.url} target="_blank" rel="noopener noreferrer">
                  Open original ↗
                </a>
              )}
            </div>
          </header>
          {data.html ? (
            // Sanitized on the server (core/library/article.ts) with an allowlist.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized HTML
            <div className="prose" dangerouslySetInnerHTML={{ __html: data.html }} />
          ) : (
            <p className="muted">This entry has no content in the feed. Open the original to read it.</p>
          )}
        </article>
      )}
    </section>
  );
}
