import { z } from "zod";
import type { ClaimedJob } from "../../adapters/sqlite/jobs";
import { refreshFeed } from "../../app/feeds";
import { embedPending, enqueueKnowledgeWork, extractPending } from "../../app/knowledge";
import { ingestFeedEntries } from "../../app/library";
import { nextJobAttempt } from "../../core/jobs/retry";
import type { JobKind } from "../../core/jobs/types";
import type { Deps } from "../deps";

const feedPayload = z.object({ feedId: z.number().int().positive() });

/** An expected failure (e.g. the AI provider is down), returned rather than thrown. */
type JobFailure = { error: string; retryable: boolean };
type Handler = (deps: Deps, payload: unknown) => Promise<JobFailure | undefined> | JobFailure | undefined;

/** One handler per job kind. Handlers throw only on bugs; expected failures are returned. */
const handlers: Record<JobKind, Handler> = {
  "feed.poll": async (deps, payload) => {
    const { feedId } = feedPayload.parse(payload);
    const result = await refreshFeed(deps)(feedId);
    if (result.ok) deps.logger.info("feed.polled", { feedId, ...result.value });
    else deps.logger.info("feed.poll_skipped", { feedId, reason: result.error.type });
    return undefined;
  },
  "library.ingest": (deps, payload) => {
    const { feedId } = feedPayload.parse(payload);
    const count = ingestFeedEntries(deps)(feedId);
    if (count) deps.logger.info("articles.ingested", { feedId, count });
    return undefined;
  },
  // AI failures back the job off; work finished before the failure is already saved.
  "knowledge.embed": async (deps) => {
    const result = await embedPending(deps)();
    if (!result.ok)
      return { error: `${result.error.type}: ${result.error.detail}`, retryable: result.error.retryable };
    if (result.value.embedded || result.value.failed) deps.logger.info("knowledge.embedded", result.value);
    return undefined;
  },
  "knowledge.extract": async (deps) => {
    const result = await extractPending(deps)();
    if (!result.ok)
      return { error: `${result.error.type}: ${result.error.detail}`, retryable: result.error.retryable };
    if (Object.values(result.value).some(Boolean)) deps.logger.info("knowledge.extracted", result.value);
    return undefined;
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

  const reschedule = (job: ClaimedJob, failure: JobFailure) => {
    const next = nextJobAttempt({
      attempts: job.attempts,
      retryable: failure.retryable,
      now: deps.system.now(),
      jitter: deps.system.random(),
    });
    if (next.retry) deps.jobs.retry(job.id, next.runAt, failure.error);
    else deps.jobs.fail(job.id, failure.error);
    return next.retry;
  };

  const run = async (job: ClaimedJob) => {
    try {
      const failure = await handlers[job.kind](deps, job.payload);
      if (!failure) return deps.jobs.complete(job.id);
      const willRetry = reschedule(job, failure);
      deps.logger.warn("job.unsuccessful", {
        id: job.id,
        kind: job.kind,
        attempts: job.attempts,
        willRetry,
        ...failure,
      });
    } catch (e) {
      // A bug: log the stack. Bad payloads (Zod) never get better, so don't retry those.
      const error = e instanceof Error ? (e.stack ?? e.message) : String(e);
      const willRetry = reschedule(job, { error, retryable: !(e instanceof z.ZodError) });
      deps.logger.error("job.failed", {
        id: job.id,
        kind: job.kind,
        attempts: job.attempts,
        willRetry,
        error,
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

/** Every minute (and once at startup): polls for due feeds, and knowledge runs for waiting articles. */
export function startScheduler(deps: Deps) {
  const enqueue = () => {
    try {
      const count = deps.feeds.enqueueDuePolls(deps.system.now());
      if (count) deps.logger.info("feeds.due", { count });
      enqueueKnowledgeWork(deps)();
    } catch (e) {
      deps.logger.error("scheduler.failed", { error: e instanceof Error ? e.stack : String(e) });
    }
  };
  enqueue();
  return Bun.cron("* * * * *", enqueue);
}
