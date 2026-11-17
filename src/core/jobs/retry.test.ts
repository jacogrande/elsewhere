import { describe, expect, test } from "bun:test";
import { MAX_ATTEMPTS, nextJobAttempt } from "./retry";

describe("nextJobAttempt", () => {
  const now = 1_000_000;

  test("retries retryable failures with exponential backoff from 30s", () => {
    expect(nextJobAttempt({ attempts: 1, retryable: true, now, jitter: 0 })).toEqual({
      retry: true,
      runAt: now + 30_000,
    });
    expect(nextJobAttempt({ attempts: 3, retryable: true, now, jitter: 0 })).toEqual({
      retry: true,
      runAt: now + 120_000,
    });
  });

  test("gives up after the maximum attempts", () => {
    expect(nextJobAttempt({ attempts: MAX_ATTEMPTS, retryable: true, now, jitter: 0 })).toEqual({
      retry: false,
    });
  });

  test("never retries permanent failures", () => {
    expect(nextJobAttempt({ attempts: 1, retryable: false, now, jitter: 0 })).toEqual({ retry: false });
  });

  test("adds up to 20% jitter", () => {
    expect(nextJobAttempt({ attempts: 1, retryable: true, now, jitter: 0.5 })).toEqual({
      retry: true,
      runAt: now + 33_000,
    });
  });
});
