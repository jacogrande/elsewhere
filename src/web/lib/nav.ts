/** The id next to `current` in `ids` (j/k navigation). Starts at the top when nothing valid is selected. */
export function neighborId(ids: readonly number[], current: number | null, direction: 1 | -1): number | null {
  if (ids.length === 0) return null;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index === -1) return ids[0] ?? null;
  const next = Math.min(ids.length - 1, Math.max(0, index + direction));
  return ids[next] ?? null;
}
