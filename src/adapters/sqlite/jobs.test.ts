import { describe, expect, test } from "bun:test";
import { pollJob } from "../../core/jobs/types";
import { testDatabase } from "./db";
import { createJobStore } from "./jobs";

describe("job store", () => {
  test("deduplicates pending jobs and claims due ones", () => {
    const jobs = createJobStore(testDatabase());
    jobs.enqueue(pollJob(1), 1000);
    jobs.enqueue(pollJob(1), 1000);
    jobs.enqueue(pollJob(2, 5000), 1000);

    const claimed = jobs.claim(2000, 10, 60_000);
    expect(claimed).toEqual([{ id: 1, kind: "feed.poll", payload: { feedId: 1 }, attempts: 1 }]);
    expect(jobs.claim(2000, 10, 60_000)).toEqual([]);
  });

  test("a finished job frees its dedupe key", () => {
    const jobs = createJobStore(testDatabase());
    jobs.enqueue(pollJob(1), 0);
    const [job] = jobs.claim(0, 1, 1000);
    jobs.complete(job?.id ?? 0);
    jobs.enqueue(pollJob(1), 0);
    expect(jobs.claim(0, 1, 1000)).toHaveLength(1);
  });

  test("re-enqueuing a key replaces its failed row", () => {
    const db = testDatabase();
    const jobs = createJobStore(db);
    for (let i = 0; i < 3; i++) {
      jobs.enqueue(pollJob(1), 0);
      const [job] = jobs.claim(0, 1, 1000);
      jobs.fail(job?.id ?? 0, `boom ${i}`);
    }
    const rows = db.query("SELECT status, last_error AS error FROM jobs").all();
    expect(rows).toEqual([{ status: "failed", error: "boom 2" }]);
  });

  test("retries later and recovers expired leases", () => {
    const jobs = createJobStore(testDatabase());
    jobs.enqueue(pollJob(1), 0);
    const [job] = jobs.claim(0, 1, 1000);
    jobs.retry(job?.id ?? 0, 500, "boom");
    expect(jobs.claim(100, 1, 1000)).toEqual([]);
    expect(jobs.claim(500, 1, 1000)).toHaveLength(1);

    // Lease (until 1500) expires without completion, e.g. the process crashed.
    expect(jobs.recoverExpired(2000)).toBe(1);
    expect(jobs.claim(2000, 1, 1000)[0]?.attempts).toBe(3);
  });
});
