/** Background work. Contexts hand work to each other only by enqueuing these. */
export type JobRequest =
  | { kind: "feed.poll"; payload: { feedId: number }; dedupeKey: string; runAt?: number }
  | { kind: "library.ingest"; payload: { feedId: number }; dedupeKey: string; runAt?: number };

export type JobKind = JobRequest["kind"];

export const pollJob = (feedId: number, runAt?: number): JobRequest => ({
  kind: "feed.poll",
  payload: { feedId },
  dedupeKey: `poll:${feedId}`,
  ...(runAt === undefined ? {} : { runAt }),
});

export const ingestJob = (feedId: number): JobRequest => ({
  kind: "library.ingest",
  payload: { feedId },
  dedupeKey: `ingest:${feedId}`,
});
