import type { Database } from "bun:sqlite";
import type { ArticleDetail, ArticleListItem, ArticleRepo } from "../../app/ports";
import type { EntryForArticle } from "../../core/library/article";

type Row = Omit<ArticleListItem, "isRead" | "starred"> & { isRead: number; starred: number };

const LIST_COLUMNS = `a.id, a.feed_id AS feedId, f.title AS feedTitle, a.url, a.title, a.author, a.excerpt,
  a.published_at AS publishedAt, a.sort_at AS sortAt, a.is_read AS isRead, a.starred, a.word_count AS wordCount`;

const toItem = <T extends Row>(r: T) => ({ ...r, isRead: r.isRead === 1, starred: r.starred === 1 });

export function createArticleRepo(db: Database): ArticleRepo {
  return {
    pendingEntries(feedId, limit) {
      return db
        .query<EntryForArticle, { feedId: number; limit: number }>(
          `SELECT e.id, e.feed_id AS feedId, e.url, e.title, e.author, e.published_at AS publishedAt,
                  e.content_html AS contentHtml, e.first_seen_at AS firstSeenAt
           FROM feeds_entry e LEFT JOIN library_article a ON a.entry_id = e.id
           WHERE e.feed_id = $feedId AND a.id IS NULL
           ORDER BY e.id LIMIT $limit`,
        )
        .all({ feedId, limit });
    },

    insertMany(articles, now) {
      const stmt = db.query(
        `INSERT OR IGNORE INTO library_article
           (entry_id, feed_id, url, title, author, html, text, excerpt, word_count, published_at, sort_at, created_at)
         VALUES ($entryId, $feedId, $url, $title, $author, $html, $text, $excerpt, $wordCount, $publishedAt, $sortAt, $now)`,
      );
      return db
        .transaction(() => {
          let inserted = 0;
          // .changes also counts the FTS trigger writes, so count rows ourselves.
          for (const a of articles) if (stmt.run({ ...a, now }).changes > 0) inserted++;
          return inserted;
        })
        .immediate();
    },

    list(q) {
      const where: string[] = [];
      const params: Record<string, string | number> = { limit: q.limit };
      if (q.feedId !== null) {
        where.push("a.feed_id = $feedId");
        params.feedId = q.feedId;
      }
      if (q.filter === "unread") where.push("a.is_read = 0");
      if (q.filter === "starred") where.push("a.starred = 1");
      if (q.ftsQuery) {
        where.push("a.id IN (SELECT rowid FROM library_article_fts WHERE library_article_fts MATCH $fts)");
        params.fts = q.ftsQuery;
      }
      if (q.cursor) {
        where.push("(a.sort_at < $cursorSortAt OR (a.sort_at = $cursorSortAt AND a.id < $cursorId))");
        params.cursorSortAt = q.cursor.sortAt;
        params.cursorId = q.cursor.id;
      }
      const sql = `SELECT ${LIST_COLUMNS} FROM library_article a JOIN feeds_feed f ON f.id = a.feed_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY a.sort_at DESC, a.id DESC LIMIT $limit`;
      return db.query<Row, typeof params>(sql).all(params).map(toItem);
    },

    get(id) {
      const row = db
        .query<Row & { html: string; siteUrl: string | null }, { id: number }>(
          `SELECT ${LIST_COLUMNS}, a.html, f.site_url AS siteUrl
           FROM library_article a JOIN feeds_feed f ON f.id = a.feed_id WHERE a.id = $id`,
        )
        .get({ id });
      return row ? (toItem(row) as ArticleDetail) : null;
    },

    byIds(ids) {
      return db
        .query<Row, { ids: string }>(
          `SELECT ${LIST_COLUMNS} FROM library_article a JOIN feeds_feed f ON f.id = a.feed_id
           WHERE a.id IN (SELECT value FROM json_each($ids))`,
        )
        .all({ ids: JSON.stringify(ids) })
        .map(toItem);
    },

    maxId() {
      return db.query<{ id: number | null }, []>("SELECT max(id) AS id FROM library_article").get()?.id ?? 0;
    },

    setRead(id, read, now) {
      return (
        db
          .query("UPDATE library_article SET is_read = $read, read_at = $readAt WHERE id = $id")
          .run({ id, read: read ? 1 : 0, readAt: read ? now : null }).changes > 0
      );
    },

    setStarred(id, starred, now) {
      return (
        db
          .query("UPDATE library_article SET starred = $starred, starred_at = $at WHERE id = $id")
          .run({ id, starred: starred ? 1 : 0, at: starred ? now : null }).changes > 0
      );
    },

    markAllRead({ feedId, upToId }, now) {
      const params: Record<string, number> = { upToId, now };
      let sql = "UPDATE library_article SET is_read = 1, read_at = $now WHERE is_read = 0 AND id <= $upToId";
      if (feedId !== null) {
        sql += " AND feed_id = $feedId";
        params.feedId = feedId;
      }
      return db.query(sql).run(params).changes;
    },
  };
}
