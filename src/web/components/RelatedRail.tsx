import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/** "Read next": related articles from other feeds, each with the ideas it shares with this one. */
export function RelatedRail({ articleId, onOpen }: { articleId: number; onOpen: (id: number) => void }) {
  const related = useQuery({
    queryKey: ["related", articleId],
    queryFn: () => api.related(articleId),
    // A new article is usually embedded within a minute or two; stop asking after ~3 minutes.
    refetchInterval: (q) =>
      q.state.data?.status === "pending" && q.state.dataUpdateCount < 36 ? 5000 : false,
  });
  const data = related.data;
  if (related.isError) {
    return (
      <aside className="related" aria-label="Read next">
        <h2 className="related-title">Read next</h2>
        <p className="muted small">Couldn't load related reading.</p>
      </aside>
    );
  }
  if (!data || data.status === "off") return null;

  return (
    <aside className="related" aria-label="Read next">
      <h2 className="related-title">Read next</h2>
      {data.status === "pending" && <p className="muted small">Finding related reading…</p>}
      {data.status === "ready" && data.items.length === 0 && (
        <p className="muted small">Nothing related from your other feeds yet.</p>
      )}
      {data.status === "ready" && data.items.length > 0 && (
        <ol>
          {data.items.map((item, rank) => (
            <li key={item.id}>
              <button
                type="button"
                className="related-item"
                onClick={() => {
                  // Logging is best-effort: never block opening the article on it.
                  api.relatedClick(articleId, item.id, rank).catch(() => {});
                  onOpen(item.id);
                }}
              >
                <span className="related-meta">
                  {item.feedTitle}
                  {item.author && item.author !== item.feedTitle ? ` · ${item.author}` : ""}
                </span>
                <span className="related-headline">{item.title}</span>
                {item.shared.length > 0 && (
                  <span className="related-why">
                    <span className="related-why-label">Shared idea</span>{" "}
                    {item.shared.map((c) => c.label).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
