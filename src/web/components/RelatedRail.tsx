import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const GROUPS = [
  { kind: "conceptual", title: "Conceptually similar", note: "Shares an idea with this article" },
  { kind: "semantic", title: "Semantically similar", note: "Close in meaning, no shared idea found" },
] as const;

/**
 * "Read next": related articles from other feeds in two groups. Conceptually similar ones name the
 * idea they share (the same concept, or a close one: "vanilla JavaScript ≈ JavaScript frameworks");
 * semantically similar ones are close in meaning but share no extracted idea.
 */
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
        <p className="muted small">Nothing in your other feeds is close to this yet.</p>
      )}
      {data.status === "ready" &&
        GROUPS.map((group) => {
          const items = data.items.filter((i) => i.kind === group.kind);
          if (items.length === 0) return null;
          return (
            <section key={group.kind} className="related-group">
              <h3 className="related-group-title">{group.title}</h3>
              <p className="related-group-note">{group.note}</p>
              <ol>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="related-item"
                      onClick={() => {
                        // Logging is best-effort: never block opening the article on it.
                        api.relatedClick(articleId, item.id, data.items.indexOf(item)).catch(() => {});
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
                          {item.shared
                            .map((c) => (c.close ? `${c.label} ≈ ${c.close}` : c.label))
                            .join(" · ")}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
    </aside>
  );
}
