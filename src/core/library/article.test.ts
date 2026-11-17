import { describe, expect, test } from "bun:test";
import { articleFromEntry, excerpt, htmlToText, sanitizeArticleHtml } from "./article";

describe("sanitizeArticleHtml", () => {
  const base = "https://ex.com/posts/1";

  test("removes scripts, event handlers and javascript: links", () => {
    const out = sanitizeArticleHtml(
      `<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><iframe src="https://evil"></iframe>`,
      base,
    );
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("iframe");
    expect(out).toContain("<p>Hi</p>");
  });

  test("keeps images and resolves relative URLs", () => {
    const out = sanitizeArticleHtml(`<img src="/img/a.png" alt="A"><a href="../other">o</a>`, base);
    expect(out).toContain(`src="https://ex.com/img/a.png"`);
    expect(out).toContain(`href="https://ex.com/other"`);
  });

  test("opens links in a new tab without leaking the opener", () => {
    const out = sanitizeArticleHtml(`<a href="https://x.com">x</a>`, base);
    expect(out).toContain(`target="_blank"`);
    expect(out).toContain(`rel="noopener noreferrer"`);
  });

  test("drops 1x1 tracking pixels", () => {
    expect(sanitizeArticleHtml(`<p>a</p><img src="https://t.co/p.gif" width="1" height="1">`, base)).toBe(
      "<p>a</p>",
    );
  });

  test("keeps code blocks and tables", () => {
    const html = `<pre><code>const x = 1;</code></pre><table><tr><td colspan="2">c</td></tr></table>`;
    const out = sanitizeArticleHtml(html, base);
    expect(out).toContain("<pre><code>const x = 1;</code></pre>");
    expect(out).toContain(`<td colspan="2">c</td>`);
  });

  test("strips style attributes", () => {
    expect(sanitizeArticleHtml(`<p style="color:red">x</p>`, base)).toBe("<p>x</p>");
  });
});

describe("htmlToText", () => {
  test("extracts text, separating block elements and collapsing whitespace", () => {
    expect(htmlToText("<h1>Title</h1><p>One   <b>two</b></p><p>Three&amp;four</p>")).toBe(
      "Title One two Three&four",
    );
  });

  test("ignores script and style contents", () => {
    expect(htmlToText("<style>p{}</style><p>x</p><script>y()</script>")).toBe("x");
  });
});

describe("excerpt", () => {
  test("returns short text unchanged", () => {
    expect(excerpt("short text", 50)).toBe("short text");
  });

  test("cuts at a word boundary and adds an ellipsis", () => {
    expect(excerpt("one two three four five", 12)).toBe("one two…");
  });
});

describe("articleFromEntry", () => {
  const entry = {
    id: 7,
    feedId: 3,
    url: "https://ex.com/p",
    title: "Hello",
    author: "Jo",
    publishedAt: Date.UTC(2026, 10, 1),
    contentHtml: "<p>Some words here</p><script>x</script>",
    firstSeenAt: Date.UTC(2026, 10, 2),
  };

  test("builds a sanitized article with text, excerpt and word count", () => {
    const a = articleFromEntry(entry);
    expect(a).toMatchObject({
      entryId: 7,
      feedId: 3,
      url: "https://ex.com/p",
      title: "Hello",
      author: "Jo",
      text: "Some words here",
      excerpt: "Some words here",
      wordCount: 3,
      publishedAt: Date.UTC(2026, 10, 1),
      sortAt: Date.UTC(2026, 10, 1),
    });
    expect(a.html).toBe("<p>Some words here</p>");
  });

  test("sorts future-dated posts at first-seen time", () => {
    const a = articleFromEntry({ ...entry, publishedAt: Date.UTC(2030, 0, 1) });
    expect(a.sortAt).toBe(entry.firstSeenAt);
  });

  test("falls back to first-seen time and a title from the text", () => {
    const a = articleFromEntry({ ...entry, title: null, publishedAt: null });
    expect(a.sortAt).toBe(entry.firstSeenAt);
    expect(a.title).toBe("Some words here");
  });

  test("uses 'Untitled' when there is no title or text", () => {
    expect(articleFromEntry({ ...entry, title: "  ", contentHtml: null }).title).toBe("Untitled");
  });
});
