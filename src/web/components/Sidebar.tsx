import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { api, type FeedSummary } from "../lib/api";
import { type ModePreference, useColorMode } from "../lib/color-mode";
import { refetchSoon } from "../lib/hooks";
import type { Filter, ViewState } from "../lib/view-state";

type Props = {
  view: ViewState;
  onNavigate: (patch: Partial<ViewState>) => void;
  notify: (message: string) => void;
};

const VIEWS: { filter: Filter; label: string }[] = [
  { filter: "unread", label: "Unread" },
  { filter: "starred", label: "Starred" },
  { filter: "all", label: "All articles" },
];

export function Sidebar({ view, onNavigate, notify }: Props) {
  const qc = useQueryClient();
  const feeds = useQuery({ queryKey: ["feeds"], queryFn: api.feeds, refetchInterval: 60_000 });
  const totalUnread = feeds.data?.feeds.reduce((n, f) => n + f.unreadCount, 0) ?? 0;

  const refresh = useMutation({
    mutationFn: api.refreshFeed,
    onSuccess: (r) => {
      notify(r.newEntries ? `${r.newEntries} new` : r.health === "ok" ? "No new articles" : "Refresh failed");
      refetchSoon(qc);
    },
    onError: (e) => notify(e.message),
  });

  const unsubscribe = useMutation({
    mutationFn: api.unsubscribe,
    onSuccess: (_, id) => {
      if (view.feedId === id) onNavigate({ feedId: null, articleId: null });
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["articles"] });
    },
    onError: (e) => notify(e.message),
  });

  return (
    <aside className="sidebar">
      <div className="brand">Elsewhere</div>
      <AddFeed onAdded={(feedId) => onNavigate({ feedId, filter: "all", articleId: null, q: "" })} />

      <nav className="nav">
        {VIEWS.map((v) => (
          <button
            type="button"
            key={v.filter}
            className="nav-item"
            aria-current={view.feedId === null && view.filter === v.filter}
            onClick={() => onNavigate({ feedId: null, filter: v.filter, articleId: null })}
          >
            <span>{v.label}</span>
            {v.filter === "unread" && totalUnread > 0 && <span className="count">{totalUnread}</span>}
          </button>
        ))}
      </nav>

      <div className="section-label">Feeds</div>
      <div className="feeds">
        {feeds.isPending && <p className="muted small pad">Loading…</p>}
        {feeds.isError && (
          <p className="error small pad">
            {feeds.error.message}{" "}
            <button type="button" className="link" onClick={() => feeds.refetch()}>
              Retry
            </button>
          </p>
        )}
        {feeds.data?.feeds.length === 0 && <p className="muted small pad">No feeds yet. Add one above.</p>}
        {feeds.data?.feeds.map((feed) => (
          <FeedRow
            key={feed.id}
            feed={feed}
            active={view.feedId === feed.id}
            onSelect={() => onNavigate({ feedId: feed.id, articleId: null })}
            onRefresh={() => refresh.mutate(feed.id)}
            onRemove={() => {
              if (confirm(`Unsubscribe from “${feed.title}”? Its articles will be deleted.`))
                unsubscribe.mutate(feed.id);
            }}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <ModePicker />
        <OpmlControls notify={notify} />
      </div>
    </aside>
  );
}

function FeedRow(props: {
  feed: FeedSummary;
  active: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const { feed } = props;
  const problem = feed.health !== "ok";
  const status =
    feed.health === "gone"
      ? "This feed no longer exists. Polling stopped."
      : feed.health === "paused"
        ? `Polling paused: ${feed.lastError}. Refresh to try again.`
        : (feed.lastError ?? "");
  return (
    <div className="feed-row" aria-current={props.active}>
      <button type="button" className="feed-name" onClick={props.onSelect} title={feed.url}>
        {problem && (
          <span className={`health health-${feed.health}`} role="img" title={status} aria-label={status} />
        )}
        <span className="feed-title">{feed.title}</span>
        {feed.unreadCount > 0 && <span className="count">{feed.unreadCount}</span>}
      </button>
      <span className="feed-actions">
        <button type="button" className="icon-btn" title="Refresh now" onClick={props.onRefresh}>
          ↻
        </button>
        <button type="button" className="icon-btn" title="Unsubscribe" onClick={props.onRemove}>
          ×
        </button>
      </span>
    </div>
  );
}

function AddFeed({ onAdded }: { onAdded: (feedId: number) => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: api.subscribe,
    onSuccess: ({ feedId }) => {
      setUrl("");
      qc.invalidateQueries({ queryKey: ["feeds"] });
      refetchSoon(qc);
      onAdded(feedId);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) add.mutate(url.trim());
  };
  return (
    <form className="add-feed" onSubmit={submit}>
      <input
        type="text"
        inputMode="url"
        placeholder="Add a site or feed URL"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          if (add.isError) add.reset();
        }}
        disabled={add.isPending}
        aria-label="Site or feed URL"
      />
      <button type="submit" disabled={add.isPending || !url.trim()}>
        {add.isPending ? "…" : "Add"}
      </button>
      {add.isError && <p className="error small">{add.error.message}</p>}
    </form>
  );
}

function OpmlControls({ notify }: { notify: (message: string) => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const importOpml = useMutation({
    mutationFn: api.importOpml,
    onSuccess: ({ added, skipped }) => {
      notify(
        `Imported ${added} feed${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}. They'll fetch over the next few minutes.`,
      );
      qc.invalidateQueries({ queryKey: ["feeds"] });
    },
    onError: (e) => notify(e.message),
  });
  return (
    <div className="opml">
      <input
        ref={input}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) importOpml.mutate(await file.text());
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="link"
        onClick={() => input.current?.click()}
        disabled={importOpml.isPending}
      >
        Import OPML
      </button>
      <a className="link" href="/api/opml" download>
        Export OPML
      </a>
    </div>
  );
}

const MODES: { value: ModePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function ModePicker() {
  const { preference, choose } = useColorMode();
  return (
    <fieldset className="mode-options" aria-label="Colour mode">
      {MODES.map((m) => (
        <button
          type="button"
          key={m.value}
          aria-pressed={preference === m.value}
          onClick={() => choose(m.value)}
        >
          {m.label}
        </button>
      ))}
    </fieldset>
  );
}
