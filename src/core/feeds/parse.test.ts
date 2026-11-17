import { describe, expect, test } from "bun:test";
import { parseFeedDocument } from "./parse";

const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Small Blog</title>
  <link>https://small.blog/</link>
  <ttl>120</ttl>
  <item>
    <title>A &amp; B</title>
    <link>/posts/a</link>
    <guid isPermaLink="false">id-1</guid>
    <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
    <description>short</description>
    <content:encoded><![CDATA[<p>Hello <b>world</b></p>]]></content:encoded>
    <dc:creator>Jo</dc:creator>
  </item>
  <item>
    <title>Only a description</title>
    <link>https://small.blog/posts/b</link>
    <description>&lt;p&gt;Body&lt;/p&gt;</description>
    <author>jo@small.blog (Jo)</author>
  </item>
</channel>
</rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Site</title>
  <link href="https://atom.site/" rel="alternate"/>
  <link href="https://atom.site/feed" rel="self"/>
  <entry>
    <id>tag:atom.site,2026:1</id>
    <title type="html">First</title>
    <link rel="alternate" href="/one"/>
    <updated>2026-11-01T00:00:00Z</updated>
    <published>2026-10-01T00:00:00Z</published>
    <author><name>Al</name></author>
    <summary>sum</summary>
    <content type="html">&lt;p&gt;hi&lt;/p&gt;</content>
  </entry>
  <entry>
    <id>tag:atom.site,2026:2</id>
    <title>Second</title>
    <link href="https://atom.site/two"/>
    <updated>2026-11-03T00:00:00Z</updated>
    <summary>just a summary</summary>
  </entry>
</feed>`;

const json = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "Json Feed",
  home_page_url: "https://json.feed",
  items: [
    {
      id: 5,
      url: "https://json.feed/5",
      title: "Five",
      content_html: "<p>c</p>",
      date_published: "2026-11-01T00:00:00Z",
      authors: [{ name: "Z" }],
    },
    { id: "6", content_text: "plain <text> & stuff" },
  ],
});

describe("parseFeedDocument", () => {
  test("parses RSS 2.0, preferring content:encoded and resolving relative links", () => {
    const result = parseFeedDocument(rss, "https://small.blog/feed.xml");
    if (!result.ok) throw new Error("expected ok");
    const feed = result.value;
    expect(feed.title).toBe("Small Blog");
    expect(feed.siteUrl).toBe("https://small.blog/");
    expect(feed.ttlMinutes).toBe(120);
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0]).toEqual({
      guid: "id-1",
      url: "https://small.blog/posts/a",
      title: "A & B",
      author: "Jo",
      publishedAt: Date.UTC(2026, 10, 2, 10),
      contentHtml: "<p>Hello <b>world</b></p>",
    });
    expect(feed.items[1]?.contentHtml).toBe("<p>Body</p>");
    expect(feed.items[1]?.author).toBe("Jo");
    expect(feed.items[1]?.guid).toBeNull();
    expect(feed.items[1]?.publishedAt).toBeNull();
  });

  test("parses Atom, using published over updated and content over summary", () => {
    const result = parseFeedDocument(atom, "https://atom.site/feed");
    if (!result.ok) throw new Error("expected ok");
    const [first, second] = result.value.items;
    expect(result.value.title).toBe("Atom Site");
    expect(result.value.siteUrl).toBe("https://atom.site/");
    expect(first).toEqual({
      guid: "tag:atom.site,2026:1",
      url: "https://atom.site/one",
      title: "First",
      author: "Al",
      publishedAt: Date.UTC(2026, 9, 1),
      contentHtml: "<p>hi</p>",
    });
    expect(second?.publishedAt).toBe(Date.UTC(2026, 10, 3));
    expect(second?.contentHtml).toBe("just a summary");
  });

  test("parses JSON Feed, coercing numeric ids and escaping content_text", () => {
    const result = parseFeedDocument(json, "https://json.feed/feed.json");
    if (!result.ok) throw new Error("expected ok");
    const [first, second] = result.value.items;
    expect(result.value.siteUrl).toBe("https://json.feed/");
    expect(first?.guid).toBe("5");
    expect(first?.author).toBe("Z");
    expect(second?.contentHtml).toBe("<p>plain &lt;text&gt; &amp; stuff</p>");
    expect(second?.url).toBeNull();
  });

  test("falls back to the feed URL as base when the site URL is missing", () => {
    const noLink = `<rss version="2.0"><channel><title>T</title><item><link>p/1</link></item></channel></rss>`;
    const result = parseFeedDocument(noLink, "https://ex.com/blog/rss.xml");
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.siteUrl).toBeNull();
    expect(result.value.items[0]?.url).toBe("https://ex.com/blog/p/1");
  });

  test("reports HTML pages as not a feed", () => {
    expect(parseFeedDocument("<!doctype html><html><body>hi</body></html>", "https://ex.com/")).toEqual({
      ok: false,
      error: { type: "not_a_feed" },
    });
  });

  test("reports empty and garbage input as not a feed", () => {
    expect(parseFeedDocument("", "https://ex.com/").ok).toBe(false);
    expect(parseFeedDocument("{not json", "https://ex.com/").ok).toBe(false);
  });
});
