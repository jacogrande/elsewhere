import { z } from "zod";
import type { ClaimedJob } from "../../adapters/sqlite/jobs";
import { refreshFeed } from "../../app/feeds";
import { ingestFeedEntries } from "../../app/library";
import { nextJobAttempt } from "../../core/jobs/retry";
import type { JobKind } from "../../core/jobs/types";
import type { Deps } from "../deps";

const feedPayload = z.object({ feedId: z.number().int().positive() });

/** One handler per job kind. Handlers throw only on bugs; expected outcomes are recorded by the use cases. */
const handlers: Record<JobKind, (deps: Deps, payload: unknown) => Promise<void> | void> = {
  "feed.poll": async (deps, payload) => {
    const { feedId } = feedPayload.parse(payload);
    const result = await refreshFeed(deps)(feedId);
    if (result.ok) deps.logger.info("feed.polled", { feedId, ...result.value });
    else deps.logger.info("feed.poll_skipped", { feedId, reason: result.error.type });
  },
  "library.ingest": (deps, payload) => {
    const { feedId } = feedPayload.parse(payload);
    const count = ingestFeedEntries(deps)(feedId);
    if (count) deps.logger.info("articles.ingested", { feedId, count });
  },
};

export type WorkerOptions = { concurrency?: number; tickMs?: number; leaseMs?: number };

/** Claims due jobs from the jobs table and runs them, up to `concurrency` at a time. */
export function startWorker(deps: Deps, options: WorkerOptions = {}) {
  const concurrency = options.concurrency ?? 4;
  const tickMs = options.tickMs ?? 1000;
  const leaseMs = options.leaseMs ?? 5 * 60_000;
  const active = new Set<Promise<void>>();
  let running = true;

  const run = async (job: ClaimedJob) => {
    try {
      await handlers[job.kind](deps, job.payload);
      deps.jobs.complete(job.id);
    } catch (e) {
      const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
      const next = nextJobAttempt({
        attempts: job.attempts,
        retryable: !(e instanceof z.ZodError),
        now: deps.system.now(),
        jitter: deps.system.random(),
      });
      if (next.retry) deps.jobs.retry(job.id, next.runAt, message);
      else deps.jobs.fail(job.id, message);
      deps.logger.error("job.failed", {
        id: job.id,
        kind: job.kind,
        attempts: job.attempts,
        willRetry: next.retry,
        message,
      });
    }
  };

  const tick = () => {
    const now = deps.system.now();
    deps.jobs.recoverExpired(now);
    const free = concurrency - active.size;
    if (free <= 0) return;
    for (const job of deps.jobs.claim(now, free, leaseMs)) {
      const p = run(job).finally(() => active.delete(p));
      active.add(p);
    }
  };

  const loop = (async () => {
    while (running) {
      try {
        tick();
      } catch (e) {
        deps.logger.error("worker.tick_failed", { error: e instanceof Error ? e.stack : String(e) });
      }
      await Bun.sleep(tickMs);
    }
  })();

  return {
    /** Stops claiming new jobs and waits for running ones to finish. */
    async stop() {
      running = false;
      await loop;
      await Promise.allSettled([...active]);
    },
  };
}

/** Enqueues polls for due feeds every minute (and once at startup). */
export function startScheduler(deps: Deps) {
  const enqueue = () => {
    try {
      const count = deps.feeds.enqueueDuePolls(deps.system.now());
      if (count) deps.logger.info("feeds.due", { count });
    } catch (e) {
      deps.logger.error("scheduler.failed", { error: e instanceof Error ? e.stack : String(e) });
    }
  };
  enqueue();
  return Bun.cron("* * * * *", enqueue);
}
