import type { Database } from "bun:sqlite";
import type { FeedRepo, FeedSummary } from "../../app/ports";
import type { OpmlFeed } from "../../core/feeds/opml";
import type { FeedHealth, RefreshPlan } from "../../core/feeds/refresh";
import { pollJob } from "../../core/jobs/types";
import { insertJob } from "./jobs";

export function createFeedRepo(db: Database): FeedRepo {
  const insertEntries = (feedId: number, entries: RefreshPlan["newEntries"]) => {
    const stmt = db.query(
      `INSERT OR IGNORE INTO feeds_entry
         (feed_id, key, guid, url, title, author, published_at, content_html, first_seen_at)
       VALUES ($feedId, $key, $guid, $url, $title, $author, $publishedAt, $contentHtml, $firstSeenAt)`,
    );
    for (const e of entries) {
      stmt.run({
        feedId,
        key: e.key,
        guid: e.guid,
        url: e.url,
        title: e.title,
        author: e.author,
        publishedAt: e.publishedAt,
        contentHtml: e.contentHtml,
        firstSeenAt: e.firstSeenAt,
      });
    }
  };

  const writeState = (feedId: number, s: RefreshPlan["state"]) => {
    db.query(
      `UPDATE feeds_feed_state SET etag = $etag, last_modified = $lastModified, health = $health,
         error_count = $errorCount, parse_error_count = $parseErrorCount, last_error = $lastError,
         last_fetched_at = $lastFetchedAt, next_check_at = $nextCheckAt
       WHERE feed_id = $feedId`,
    ).run({
      feedId,
      etag: s.etag,
      lastModified: s.lastModified,
      health: s.health,
      errorCount: s.errorCount,
      parseErrorCount: s.parseErrorCount,
      lastError: s.lastError,
      lastFetchedAt: s.lastFetchedAt,
      nextCheckAt: s.nextCheckAt,
    });
  };

  return {
    findIdByUrl(url) {
      return (
        db.query<{ id: number }, { url: string }>("SELECT id FROM feeds_feed WHERE url = $url").get({ url })
          ?.id ?? null
      );
    },

    list() {
      return db
        .query<FeedSummary & { health: FeedHealth }, []>(
          `SELECT f.id, f.url, f.title, f.site_url AS siteUrl, s.health, s.last_error AS lastError,
                  s.last_fetched_at AS lastFetchedAt, s.next_check_at AS nextCheckAt,
                  (SELECT count(*) FROM library_article a WHERE a.feed_id = f.id AND a.is_read = 0) AS unreadCount
           FROM feeds_feed f JOIN feeds_feed_state s ON s.feed_id = f.id
           ORDER BY f.title COLLATE NOCASE`,
        )
        .all();
    },

    listForExport() {
      return db
        .query<OpmlFeed, []>(
          "SELECT url, title, site_url AS siteUrl FROM feeds_feed ORDER BY title COLLATE NOCASE",
        )
        .all();
    },

    refreshContext(feedId, recentSince) {
      const state = db
        .query<
          {
            url: string;
            etag: string | null;
            lastModified: string | null;
            errorCount: number;
            parseErrorCount: number;
          },
          { feedId: number }
        >(
          `SELECT f.url, s.etag, s.last_modified AS lastModified, s.error_count AS errorCount,
                  s.parse_error_count AS parseErrorCount
           FROM feeds_feed f JOIN feeds_feed_state s ON s.feed_id = f.id WHERE f.id = $feedId`,
        )
        .get({ feedId });
      if (!state) return null;
      const keys = db
        .query<{ key: string }, { feedId: number }>("SELECT key FROM feeds_entry WHERE feed_id = $feedId")
        .all({ feedId });
      const recent = db
        .query<{ t: number }, { feedId: number; since: number }>(
          `SELECT coalesce(published_at, first_seen_at) AS t FROM feeds_entry
           WHERE feed_id = $feedId AND coalesce(published_at, first_seen_at) >= $since`,
        )
        .all({ feedId, since: recentSince });
      return { state, knownKeys: new Set(keys.map((k) => k.key)), recentEntryTimes: recent.map((r) => r.t) };
    },

    create(feed, initial, jobs) {
      return db
        .transaction(() => {
          const row = db
            .query<{ id: number }, Record<string, string | number | null>>(
              `INSERT INTO feeds_feed (url, title, site_url, created_at) VALUES ($url, $title, $siteUrl, $now) RETURNING id`,
            )
            .get({ url: feed.url, title: feed.title, siteUrl: feed.siteUrl, now: feed.now });
          if (!row) throw new Error("feed insert returned no row");
          db.query("INSERT INTO feeds_feed_state (feed_id) VALUES ($id)").run({ id: row.id });
          if ("plan" in initial) {
            writeState(row.id, initial.plan.state);
            insertEntries(row.id, initial.plan.newEntries);
          } else {
            db.query("UPDATE feeds_feed_state SET next_check_at = $at WHERE feed_id = $id").run({
              id: row.id,
              at: initial.nextCheckAt,
            });
          }
          for (const job of jobs(row.id)) insertJob(db, job, feed.now);
          return row.id;
        })
        .immediate();
    },

    applyRefresh(feedId, plan, jobs) {
      return db
        .transaction(() => {
          // The feed may have been deleted while its fetch was in flight.
          if (!db.query("SELECT 1 FROM feeds_feed WHERE id = $feedId").get({ feedId })) return false;
          // A permanent redirect onto a URL another subscription already uses keeps the old URL.
          db.query("UPDATE OR IGNORE feeds_feed SET url = $url WHERE id = $feedId AND url != $url").run({
            feedId,
            url: plan.state.url,
          });
          writeState(feedId, plan.state);
          insertEntries(feedId, plan.newEntries);
          for (const job of jobs) insertJob(db, job, plan.state.lastFetchedAt);
          return true;
        })
        .immediate();
    },

    remove(feedId) {
      return db.query("DELETE FROM feeds_feed WHERE id = $feedId").run({ feedId }).changes > 0;
    },

    enqueueDuePolls(now) {
      const due = db
        .query<{ feedId: number }, { now: number }>(
          `SELECT feed_id AS feedId FROM feeds_feed_state
           WHERE next_check_at IS NOT NULL AND next_check_at <= $now AND health NOT IN ('gone', 'paused')`,
        )
        .all({ now });
      db.transaction(() => {
        for (const { feedId } of due) insertJob(db, pollJob(feedId), now);
      })();
      return due.length;
    },
  };
}
