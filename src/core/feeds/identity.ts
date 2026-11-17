import type { ParsedItem } from "./parse";

export type KeyedItem = ParsedItem & { key: string };

/**
 * Gives every item a stable identity key within its feed (after Miniflux's hash chain):
 * guid → guid+url when the guid repeats → guid+position → url → title+content.
 * Some feeds ship the same guid for every item, so repeats are checked per document.
 */
export function assignEntryKeys(items: readonly ParsedItem[]): KeyedItem[] {
  const guidCounts = new Map<string, number>();
  for (const item of items) {
    const guid = item.guid?.trim();
    if (guid) guidCounts.set(guid, (guidCounts.get(guid) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const keyed: KeyedItem[] = [];
  items.forEach((item, index) => {
    const key = keyFor(item, index, guidCounts);
    if (seen.has(key)) return;
    seen.add(key);
    keyed.push({ ...item, key });
  });
  return keyed;
}

function keyFor(item: ParsedItem, index: number, guidCounts: Map<string, number>): string {
  const guid = item.guid?.trim();
  if (guid) {
    if (guidCounts.get(guid) === 1) return `guid:${guid}`;
    return item.url ? `guid+url:${guid}|${item.url}` : `guid+pos:${guid}|${index}`;
  }
  if (item.url) return `url:${item.url}`;
  return `content:${item.title ?? ""}|${item.contentHtml ?? ""}`;
}
