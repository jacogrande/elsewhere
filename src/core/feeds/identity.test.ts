import { describe, expect, test } from "bun:test";
import { assignEntryKeys } from "./identity";
import type { ParsedItem } from "./parse";

const item = (over: Partial<ParsedItem>): ParsedItem => ({
  guid: null,
  url: null,
  title: null,
  author: null,
  publishedAt: null,
  contentHtml: null,
  ...over,
});

describe("assignEntryKeys", () => {
  test("uses the guid when it is unique in the document", () => {
    const keyed = assignEntryKeys([item({ guid: "a" }), item({ guid: "b" })]);
    expect(keyed.map((k) => k.key)).toEqual(["guid:a", "guid:b"]);
  });

  test("combines a repeated guid with the url", () => {
    const keyed = assignEntryKeys([
      item({ guid: "same", url: "https://x/1" }),
      item({ guid: "same", url: "https://x/2" }),
    ]);
    expect(keyed.map((k) => k.key)).toEqual(["guid+url:same|https://x/1", "guid+url:same|https://x/2"]);
  });

  test("falls back to guid and position when a repeated guid has no url", () => {
    const keyed = assignEntryKeys([item({ guid: "same" }), item({ guid: "same" })]);
    expect(keyed.map((k) => k.key)).toEqual(["guid+pos:same|0", "guid+pos:same|1"]);
  });

  test("uses the url when there is no guid", () => {
    expect(assignEntryKeys([item({ url: "https://x/1" })])[0]?.key).toBe("url:https://x/1");
  });

  test("uses title and content as a last resort", () => {
    expect(assignEntryKeys([item({ title: "T", contentHtml: "<p>c</p>" })])[0]?.key).toBe(
      "content:T|<p>c</p>",
    );
  });

  test("drops exact duplicates within one document, keeping the first", () => {
    const keyed = assignEntryKeys([
      item({ url: "https://x/1", title: "first" }),
      item({ url: "https://x/1", title: "second" }),
    ]);
    expect(keyed).toHaveLength(1);
    expect(keyed[0]?.title).toBe("first");
  });

  test("ignores blank guids", () => {
    expect(assignEntryKeys([item({ guid: "  ", url: "https://x/1" })])[0]?.key).toBe("url:https://x/1");
  });
});
