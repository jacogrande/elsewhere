import type { Database } from "bun:sqlite";
import type { JobQueue } from "../../app/ports";
import type { JobKind, JobRequest } from "../../core/jobs/types";

export type ClaimedJob = { id: number; kind: JobKind; payload: unknown; attempts: number };

/**
 * Inserts a job unless one with the same dedupe key is already pending. Use inside other transactions too.
 * Re-enqueuing a key replaces its old failed row, so a job that keeps failing keeps only its latest failure.
 */
export function insertJob(db: Database, job: JobRequest, now: number): void {
  db.query("DELETE FROM jobs WHERE dedupe_key = $dedupeKey AND status = 'failed'").run({
    dedupeKey: job.dedupeKey,
  });
  db.query(
    `INSERT OR IGNORE INTO jobs (kind, payload, run_at, dedupe_key, created_at)
     VALUES ($kind, $payload, $runAt, $dedupeKey, $now)`,
  ).run({
    kind: job.kind,
    payload: JSON.stringify(job.payload),
    runAt: job.runAt ?? now,
    dedupeKey: job.dedupeKey,
    now,
  });
}

export function createJobStore(db: Database) {
  const queue: JobQueue = { enqueue: (job, now) => insertJob(db, job, now) };

  return {
    ...queue,

    /** Claims up to `limit` due jobs, leasing them until `now + leaseMs`. */
    claim(now: number, limit: number, leaseMs: number): ClaimedJob[] {
      const rows = db
        .query<{ id: number; kind: JobKind; payload: string; attempts: number }, Record<string, number>>(
          `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = $lockedUntil
           WHERE id IN (
             SELECT id FROM jobs WHERE status = 'queued' AND run_at <= $now ORDER BY run_at, id LIMIT $limit
           )
           RETURNING id, kind, payload, attempts`,
        )
        .all({ now, limit, lockedUntil: now + leaseMs });
      return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
    },

    complete(id: number): void {
      db.query("DELETE FROM jobs WHERE id = $id").run({ id });
    },

    retry(id: number, runAt: number, error: string): void {
      db.query(
        "UPDATE jobs SET status = 'queued', run_at = $runAt, locked_until = NULL, last_error = $error WHERE id = $id",
      ).run({ id, runAt, error });
    },

    fail(id: number, error: string): void {
      db.query(
        "UPDATE jobs SET status = 'failed', locked_until = NULL, last_error = $error WHERE id = $id",
      ).run({
        id,
        error,
      });
    },

    /** Puts jobs whose lease expired (e.g. the process died mid-job) back in the queue. */
    recoverExpired(now: number): number {
      return db
        .query(
          "UPDATE jobs SET status = 'queued', locked_until = NULL WHERE status = 'running' AND locked_until < $now",
        )
        .run({ now }).changes;
    },
  };
}

export type JobStore = ReturnType<typeof createJobStore>;
