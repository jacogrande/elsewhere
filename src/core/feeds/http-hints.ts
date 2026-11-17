/** Seconds to wait from a Retry-After header (delay-seconds or HTTP-date). */
export function parseRetryAfter(value: string | null, now: number): number | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  if (/^-/.test(v)) return null;
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((at - now) / 1000));
}

/** max-age in seconds from a Cache-Control header. */
export function parseMaxAge(cacheControl: string | null): number | null {
  const match = cacheControl?.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i);
  return match?.[1] ? Number(match[1]) : null;
}

/** Seconds until an Expires date, or null when missing, invalid or in the past. */
export function parseExpires(value: string | null, now: number): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  if (Number.isNaN(at) || at <= now) return null;
  return Math.round((at - now) / 1000);
}
