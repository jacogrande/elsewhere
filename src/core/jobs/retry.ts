export const MAX_ATTEMPTS = 5;
const BASE_DELAY = 30_000;

/** Decides whether a failed job runs again, and when. `attempts` counts the attempt that just failed. */
export function nextJobAttempt(input: {
  attempts: number;
  retryable: boolean;
  now: number;
  jitter: number;
}): { retry: true; runAt: number } | { retry: false } {
  if (!input.retryable || input.attempts >= MAX_ATTEMPTS) return { retry: false };
  const delay = BASE_DELAY * 2 ** (input.attempts - 1) * (1 + 0.2 * input.jitter);
  return { retry: true, runAt: input.now + delay };
}
