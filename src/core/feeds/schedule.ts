export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/** Never poll a feed more often than this; small-web publishers ask for at most hourly. */
export const MIN_POLL = HOUR;
export const MAX_POLL = DAY;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Delay until the next poll after a successful fetch (after Miniflux's entry-frequency scheduler):
 * spread polls over the week by posting frequency, respect server cache hints, stay within [1h, 24h],
 * then add up to 10% jitter (`jitter` is a number in [0, 1) supplied by the shell).
 */
export function nextPollDelay(input: {
  now: number;
  recentEntryTimes: readonly number[];
  hintSeconds: readonly (number | null)[];
  jitter: number;
}): number {
  const weekly = input.recentEntryTimes.filter((t) => t > input.now - WEEK && t <= input.now).length;
  let delay = weekly === 0 ? MAX_POLL : clamp(WEEK / weekly, MIN_POLL, MAX_POLL);

  const hints = input.hintSeconds
    .filter((h): h is number => h !== null)
    .map((h) => clamp(h * 1000, MINUTE, DAY));
  if (hints.length) delay = Math.max(delay, ...hints);

  return Math.min(delay, MAX_POLL) * (1 + 0.1 * input.jitter);
}

/** Delay after a failed fetch: doubling from 1h (capped at 24h), or Retry-After clamped to [1min, 2 days]. */
export function errorBackoff(input: {
  errorCount: number;
  retryAfterSeconds: number | null;
  jitter: number;
}): number {
  const delay =
    input.retryAfterSeconds !== null
      ? clamp(input.retryAfterSeconds * 1000, MINUTE, 2 * DAY)
      : Math.min(MAX_POLL, MIN_POLL * 2 ** Math.max(0, input.errorCount - 1));
  return delay * (1 + 0.1 * input.jitter);
}
