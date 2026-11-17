# Feeds context: libraries and protocol practice for fetching, parsing and sanitizing RSS/Atom/JSON Feed (Bun + TypeScript, November 2026)

Method note: npm registry data was pulled live on 2026-11-16 (version, publish date, weekly downloads, dependencies). GitHub stats came from the GitHub API that day. Several claims come from **local tests run on Bun 1.4.2 on 2026-11-16** in a scratch project, marked "[local test]". The test script fed the same inputs to each library: RSS 2.0 with content:encoded/dc/media, Atom with a relative link, RSS 1.0 RDF, JSON Feed 1.1, a malformed RSS file (unescaped `&`, stray `<br>`, `&nbsp;`), a truncated feed, a billion-laughs DOCTYPE, an XXE external entity, and a 229 KB / 100-item benchmark feed. These results come from one machine on small synthetic inputs. They are evidence, not a corpus evaluation.

## Feed parsers: which library for the pure core?

### Takeaway
**feedsmith** is the best fit for `core/feeds`. It parses a string synchronously with no I/O and covers RSS 0.9x/1.0(RDF)/2.0, Atom 0.3/1.0, JSON Feed 1.0/1.1 and OPML in one MIT package with full TS types. It recovered the most from malformed input in local tests, is the fastest in its published benchmark, and is actively maintained (v3.0.1, Sept 2026). **@rowanmanning/feed-parser** is the runner-up: lenient, tiny, and it resolves relative URLs, but it has no JSON Feed support and garbled a malformed item. rss-parser is stale (last release April 2023). @extractus/feed-extractor is strict about well-formedness and lost data in tests.

### Cited Findings
**Maintenance and adoption (npm registry and GitHub API, 2026-11-16):**
- feedsmith 3.0.1, published 2026-09-25. MIT. About 182k downloads/week. Dependencies are `fast-xml-parser` (pinned `~5.11.1`) and `entities`. GitHub: 637 stars, 48 open issues, last push 2026-11-16. — [npm](https://www.npmjs.com/package/feedsmith); [GitHub](https://github.com/macieklamberski/feedsmith)
- rss-parser 3.13.0, published **2023-04-11** (no release in over 3.5 years). MIT. About 1.25M downloads/week, the highest by inertia. Dependencies are `xml2js` and `entities`. GitHub: 84 open issues. — [npm](https://www.npmjs.com/package/rss-parser); [GitHub](https://github.com/rbren/rss-parser)
- @extractus/feed-extractor 8.0.4, published 2026-11-15. MIT. About 22k downloads/week. Depends on `fast-xml-parser`. GitHub: 0 open issues. — [npm](https://www.npmjs.com/package/@extractus/feed-extractor); [GitHub](https://github.com/extractus/feed-extractor)
- @rowanmanning/feed-parser 2.1.5, published 2026-09-09. MIT. About 28k downloads/week. Dependencies are `fast-xml-parser` and `html-entities`. GitHub: 16 open issues. — [npm](https://www.npmjs.com/package/@rowanmanning/feed-parser); [GitHub](https://github.com/rowanmanning/feed-parser)
- feedparser (node) 2.6.1, published 2026-11-02. MIT. About 27k downloads/week. It is a stream-based SAX parser (`sax`, `readable-stream`, several lodash packages, `addressparser`). — [npm](https://www.npmjs.com/package/feedparser); [GitHub](https://github.com/danmactough/node-feedparser)
- feedme 2.0.5, published 2026-11-09. About 2k downloads/week. Built on `sax` and `clarinet` (stream based). — [npm](https://www.npmjs.com/package/feedme)
- fast-xml-parser 5.12.1, published 2026-11-13. MIT. About 113M downloads/week. 30 open issues. — [npm](https://www.npmjs.com/package/fast-xml-parser); [GitHub](https://github.com/NaturalIntelligence/fast-xml-parser)
- Unpacked install sizes [local test, `du` of node_modules]: feedsmith 3.3 MB (it ships many namespace/generator modules and is tree-shakable), @rowanmanning/feed-parser 204 KB, @extractus/feed-extractor 444 KB, rss-parser 2.0 MB, fast-xml-parser 1.4 MB. — [feedsmith README: "tree-shakable", CJS+ESM](https://github.com/macieklamberski/feedsmith)

**Features:**
- feedsmith parses RSS 0.9x/2.0, Atom 0.3/1.0, RDF 0.9/1.0, JSON Feed 1.0/1.1 and OPML 1.0/2.0, and generates all of these except RDF. It lists 34 namespaces, including Dublin Core, iTunes, Podcast Index, Media RSS and Atom Threading. Prefixes are normalized, so a non-standard prefix still maps to `dc.creator`. `parseFeed(content)` auto-detects the format and returns `{ format, feed }`. Unrecognized input throws. The README claims it "tries to extract valid data from malformed or incomplete feeds" and reports over 4,000 tests and 99% coverage. It does not mention Bun. — [feedsmith README](https://github.com/macieklamberski/feedsmith)
- @rowanmanning/feed-parser takes an XML string and does no fetching. It supports RSS 0.9/1.0/2.0 and Atom 0.3/1.0, but **not JSON Feed**. Namespaces are Dublin Core and iTunes. It aims to "be as lenient as possible" and throws `INVALID_FEED` only when nothing can be extracted. It is tested against about 40 real-world feeds from the Sample Feeds project and requires Node ≥ 20. — [rowanmanning/feed-parser README](https://github.com/rowanmanning/feed-parser)
- The feedsmith benchmark used hyperfine with real-world feed corpora (RSS/Atom: 10 files of 5–50 MB plus 100 files of 100 KB–5 MB; OPML: 100 files) and a Bun-installed runner. feedsmith was fastest in every JS category. On 100 RSS files: feedsmith 281 ms, @rowanmanning/feed-parser 6.25x slower. On 10 large RSS files, rowanmanning was 17.4x slower. In OPML, feedsmith beat `opml` by 1.81x and `opml-to-json` by 2.31x. Cross-language on RSS, feedsmith also beat SimplePie, gofeed, Feedjira and Python feedparser. The benchmark is self-published by the feedsmith author, who notes that features differ so "a direct comparison isn't always fair". — [feedsmith benchmarks](https://feedsmith.dev/benchmarks)

**Local tests (Bun 1.4.2) [local test]:**
- All four libraries (feedsmith, rowanmanning, extractus, rss-parser) installed and ran under Bun with no problems.
- **RSS 2.0 with namespaces:** all four returned title, link and guid. feedsmith returned `content.encoded`, `dc.creators` and the guid with its `isPermaLink` flag. rowanmanning returned `content` and `authors` from dc:creator. extractus returned only `description` (no content:encoded with default options). rss-parser returned `content:encoded`.
- **Atom with a relative `<link href="/rel/a">`:** rowanmanning **resolved it to an absolute URL** (`https://ex.com/rel/a`). feedsmith and rss-parser returned the raw `/rel/a`, so the caller must resolve it. extractus returned an **empty link**. feedsmith v3 returns Atom text constructs as objects (`{value, type:"html"}`) and leaves entities in `type="html"` titles encoded (`A &lt;b&gt;`), so the consumer must decode them.
- **RSS 1.0 (RDF):** all parsed it. extractus generated a junk id (`"tpj8dj-NaN"`).
- **JSON Feed:** feedsmith auto-detected it from the same `parseFeed` call. extractus needs a separate `extractFromJson`. rowanmanning and rss-parser threw.
- **Malformed RSS** (unescaped `&`, bare `<br>`, `&nbsp;`): feedsmith recovered **both items** with correct titles and links. rss-parser recovered both but truncated a title. rowanmanning returned only one item and garbled it (the link text was merged into the title). extractus threw "not well-formed".
- **Truncated document:** all four threw. None recovers partial items from a cut-off file.
- **Speed** on a 229 KB, 100-item feed (mean of 50): rowanmanning 2.1 ms, feedsmith 2.4 ms, rss-parser 5.7 ms, extractus 8.7 ms. Small inputs are lazy-parse friendly to rowanmanning. The feedsmith benchmark on large corpora shows the opposite ranking.
- feedsmith, rowanmanning and extractus are synchronous `string → object` functions. rss-parser's `parseString` is async (callback-based xml2js underneath), which is awkward but still I/O-free.

**Newer and other options:** the feedsmith benchmark also lists @ulisesgascon/rss-feed-parser, @gaphub/feed and podcast-feed-parser as JS parsers. @ulisesgascon/rss-feed-parser was the closest rival on RSS (1.17–1.62x slower). — [feedsmith benchmarks](https://feedsmith.dev/benchmarks)

### Inferences
- feedsmith matches the architecture's rule that `core/**` may import only pure third-party libraries (zod, an XML parser). It is synchronous, has no network code, and depends only on fast-xml-parser and entities. One library also covers JSON Feed and OPML, so the core does not need separate OPML or JSON parsers.
- Normalization stays our job with feedsmith: resolving relative URLs against `xml:base`, the feed URL or the channel link, decoding Atom `type="html"` titles, picking content (content:encoded, then Atom content, then description), and choosing dates. These are small pure functions that fit the test-first rule. Write a thin `toFeedEntry()` mapper with Zod validation of the mapped output.
- A DIY parser on fast-xml-parser buys little. feedsmith is already a thin, tested layer over it.
- Avoid rss-parser (stale; xml2js). Avoid extractus for the core: it is strict on malformed XML, dropped a relative Atom link, and its main API (`extract(url)`) bundles fetching.
- The architecture's open question ("evaluate against a corpus of real-world feeds") still stands. A 50–100 feed fixture set (including the Sample Feeds project corpus that rowanmanning uses) recorded as files would make the choice evidence-based and become the parser's regression suite.

### Gaps
- I found no independent (non-author) benchmark or corpus-level tolerance comparison. The tolerance results above use a handful of synthetic cases.
- Open-issue content (for example, known feedsmith edge-case bugs) was not reviewed. Only counts were.
- feedparser (node) and feedme were not tested locally because they are stream APIs.

## OPML parsing and generation

### Takeaway
Use **feedsmith's `parseOpml` / `generateOpml`** (OPML 1.0/2.0). The standalone OPML packages are tiny, old or carry heavy dependencies.

### Cited Findings
- feedsmith parses and generates OPML 1.0 and 2.0. — [feedsmith README](https://github.com/macieklamberski/feedsmith)
- In the feedsmith OPML benchmark (100 files of 100–500 KB), feedsmith was fastest. `opml` was 1.81x slower and `opml-to-json` 2.31x slower. node-opml-parser and opmlparser were also compared. — [feedsmith benchmarks](https://feedsmith.dev/benchmarks)
- `opml` (Dave Winer) 0.5.8 has about 688 downloads/week and depends on the long-deprecated `request` plus `xml2js` and `daveutils`. `node-opml-parser` was last published 2016, `opml-generator` 2015 and `opml-to-json` 2021. — npm registry: [opml](https://www.npmjs.com/package/opml), [node-opml-parser](https://www.npmjs.com/package/node-opml-parser), [opml-generator](https://www.npmjs.com/package/opml-generator), [opml-to-json](https://www.npmjs.com/package/opml-to-json)

### Inferences
- OPML import should flatten nested `<outline>` folders into categories and treat `xmlUrl` as the feed URL. It should tolerate `type="rss"` being missing, and must normalize and dedupe URLs before subscribing. All of this is pure core logic. The architecture puts blogroll OPML parsing in both Feeds and Discovery, so expose one parser from `core/feeds/index.ts`.

### Gaps
- I did not test feedsmith's OPML tolerance on malformed real exports (Feedly, Inoreader, NetNewsWire).

## Feed autodiscovery from HTML

### Takeaway
Parse `<link rel="alternate" type="application/rss+xml|atom+xml|feed+json|json">` with **htmlparser2** inside the pure core, resolving `href` against the page URL (and `<base href>`). Then fall back to probing a short list of well-known paths in the shell, **with redirects disabled**, as Miniflux does. Bun's built-in HTMLRewriter works but is async and Response-based, so it belongs in an adapter, not the core.

### Cited Findings
- JSON Feed: "apps must prefer `application/feed+json`, but should fall back to accepting `application/json`". Discovery uses the same `<link rel="alternate">` mechanism as RSS and Atom. — [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)
- Miniflux's fallback probe list is `atom.xml`, `feed.atom`, `feed.xml`, `feed/`, `index.rss`, `index.xml`, `rss.xml`, `rss/` and `rss/feed.xml`. It tries each at the site root and at the current subdirectory. Each probe disables redirects, because "some websites redirect unknown URLs to the home page". — [Miniflux finder.go](https://github.com/miniflux/v2/blob/main/internal/reader/subscription/finder.go)
- htmlparser2 12.0.0 (2026-03-20, MIT, about 140M downloads/week) is a synchronous, dependency-light parser. — [npm](https://www.npmjs.com/package/htmlparser2)
- linkedom 0.18.15 (2026-11-01, ISC) is built on htmlparser2. GitHub shows 68 open issues. — [npm](https://www.npmjs.com/package/linkedom); [GitHub](https://github.com/WebReflection/linkedom)
- In a Bun HTMLRewriter test, the selector `link[rel~="alternate" i]` matched a mixed-case `rel="Alternate"`. Resolving with `new URL(href, pageUrl)` produced correct absolute URLs. It also matched a `hreflang` alternate with no `type`, so the code must filter on `type`. [local test, Bun 1.4.2]

### Inferences
- Discovery split: a pure `findFeedLinks(html, pageUrl): FeedLink[]` in core (htmlparser2), and a shell use case that fetches the page, calls it, then probes the known paths if none are found. Probing should validate the content (it parses as a feed), not just a 200 status.
- Skip cheerio. It is a heavier wrapper over the same parsers and adds nothing for reading `<link>` tags.

### Gaps
- I did not verify the RSS Board autodiscovery spec text or YouTube/Substack/Medium-specific URL conventions.

## HTML sanitization of article content

### Takeaway
Two viable options. (a) **sanitize-html** (htmlparser2-based, no DOM, about 0.09 ms per call in local tests, MIT, actively published) with an explicit allowlist modeled on Miniflux's. (b) **DOMPurify with jsdom** (the only DOM that DOMPurify's maintainers recommend server-side; about 1 ms per call and a heavy dependency). **Do not use DOMPurify with linkedom**: in Bun it silently returned the input unchanged, scripts included. Do not use it with happy-dom, which the maintainers call unsafe. Do the URL rewriting and tracker stripping in the same pass.

### Cited Findings
- DOMPurify README on server use: jsdom is "the tool of choice and we strongly recommend to use the latest version". happy-dom tools "are not considered safe at this point… Combining DOMPurify with happy-dom is currently not recommended and will likely lead to XSS." linkedom is not mentioned. — [DOMPurify README](https://github.com/cure53/DOMPurify)
- DOMPurify warns that `afterSanitize*` hooks are "not re-checked". Attacker-influenced values belong in the `uponSanitize*` hooks. By default it permits HTML, SVG and MathML. — [DOMPurify README](https://github.com/cure53/DOMPurify)
- DOMPurify 3.4.18 (2026-11-14) is dual-licensed MPL-2.0 OR Apache-2.0, has about 100M downloads/week and 1 open issue. isomorphic-dompurify 4.7.0 bundles jsdom. — [npm dompurify](https://www.npmjs.com/package/dompurify); [npm isomorphic-dompurify](https://www.npmjs.com/package/isomorphic-dompurify)
- sanitize-html 2.18.2 (2026-11-11, MIT, about 18M downloads/week) depends on htmlparser2, postcss and parse-srcset. Its standalone GitHub repo is **archived**. The npm `repository` now points at the apostrophecms/apostrophe monorepo, where it is still released. — [npm](https://www.npmjs.com/package/sanitize-html); [archived repo](https://github.com/apostrophecms/sanitize-html)
- Local results on one hostile payload [local test, Bun 1.4.2]:
  - **DOMPurify + jsdom 31**: removed `onclick`, `javascript:` hrefs, `<script>`, `<iframe>`, the `<noscript>` mXSS payload, `<math>` and the SVG onload. It kept `<form><input>` and a 1x1 tracking `<img>` (not its job). About 0.98 ms per call.
  - **DOMPurify + linkedom**: `isSupported` was `undefined` and **the output was identical to the hostile input**.
  - **sanitize-html defaults**: safe output, about 0.089 ms per call, but the default allowlist **dropped every `<img>`**. You must configure `allowedTags`/`allowedAttributes`/`allowedSchemes`.
- **What Miniflux does** (Go, its own allowlist sanitizer):
  - an explicit tag→attributes allowlist (img gets alt, title, src, srcset, sizes, width, height; iframe gets width, height, frameborder, src, allowfullscreen)
  - drops `script`, `style` and `noscript` with their content
  - drops elements with `hidden`
  - removes **pixel trackers**: `img` whose width and height are both "0" or "1"
  - blocks resource URLs containing share/tracker substrings (feeds.feedburner.com, stats.wordpress.com, share intents for X, Facebook, LinkedIn and Pinterest)
  - resolves `src`/`href`/`poster`/`cite` and every `srcset` candidate to absolute URLs against the base URL, and strips tracking query parameters
  - allows only some `data:image/*` URIs
  - limits iframes to a domain allowlist (YouTube/youtube-nocookie, Vimeo, Bandcamp, SoundCloud, Dailymotion, Spotify, Twitch and others) and adds `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` and `loading="lazy"`
  - adds `rel="noopener noreferrer"` and `referrerpolicy="no-referrer"` to links, and `loading="lazy"` to images

  — [Miniflux sanitizer.go](https://github.com/miniflux/v2/blob/main/internal/reader/sanitizer/sanitizer.go)
- **What FreshRSS does:** it uses SimplePie's sanitizer, configured to rename `id`/`class` attributes, disallow the `javascript` and `data` URI schemes on navigational and framing attributes (`data:` is still allowed for images), use an explicit allowed-attributes list, add `sandbox="allow-scripts allow-same-origin"` and an `allow` list to iframes, and add `preload="none"` to audio. — [FreshRSS SimplePieCustom.php](https://github.com/FreshRSS/FreshRSS/blob/edge/app/Models/SimplePieCustom.php)

### Inferences
- For the "pure core, no DOM" rule, sanitize-html fits best. It is a synchronous `string → string` function on htmlparser2 with `transformTags` and `exclusiveFilter` hooks, so Miniflux's pixel-tracker rule, absolute-URL rewriting, `rel`/`referrerpolicy` injection and the iframe allowlist can all be written in one place and unit-tested. Copying Miniflux's allowlist gives a known-good, battle-tested baseline.
- If DOMPurify is chosen, isolate it in an adapter (jsdom is heavy and slow to start) and pin jsdom. Never pair it with linkedom or happy-dom. The architecture already uses happy-dom for component tests, so make sure the sanitizer path never picks up a happy-dom global.
- Defense in depth: sanitize when storing (so the DB holds safe HTML) and serve the SPA with a strict CSP (`script-src 'self'`, no inline scripts, `img-src` as needed). Rendering through `dangerouslySetInnerHTML` is then low risk.
- Proxying remote images to hide reader IPs is a later option (Miniflux offers a media proxy). Phase 1 can use `referrerpolicy="no-referrer"` and `loading="lazy"`.

### Gaps
- I did not run a full mXSS test suite (for example DOMPurify's own tests) against a configured sanitize-html. The single payload above is not proof of safety.
- I did not check whether DOMPurify + linkedom fails the same way in Node (the result above is Bun-only).

## HTTP fetching etiquette and protocol

### Takeaway
Implement:
- conditional GET that stores and **echoes validators verbatim** (send both If-None-Match and If-Modified-Since)
- a minimum poll interval of about 1 hour by default, stretched by `max(entry-frequency interval, RSS <ttl>, Cache-Control max-age, Expires, Retry-After)` as Miniflux does
- 429 handling that honors Retry-After (seconds or HTTP-date)
- 410 treated as permanent (mark the feed `gone`)
- stored URL updated only on 301/308 (not 302/303/307)
- `Accept-Encoding: br, gzip` (Bun decompresses automatically)
- an honest User-Agent
- a timeout of about 20 s and a capped body size
- a per-host concurrency of 1
- **no unconditional burst of requests on add or startup**

WebSub is not worth phase 1 for a self-hosted, often-NATed, single-user instance.

### Cited Findings
**Conditional requests (RFC 9110):**
- §13.1.3: "When used for cache updates, a cache will typically use the value of the cached message's Last-Modified header field to generate the field value of If-Modified-Since. This behavior is most interoperable for cases where clocks are poorly synchronized or when the server has chosen to only honor exact timestamp matches." — [RFC 9110 §13.1.3](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.3)
- "A recipient MUST ignore If-Modified-Since if the request contains an If-None-Match header field… the two are only combined for the sake of interoperating with older intermediaries." Sending both is therefore safe and correct. — [RFC 9110 §13.1.3](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.3)

**Redirects and 410 (RFC 9110):**
- 301 (§15.4.2) and 308 (§15.4.9): "any future references to this resource ought to use one of the enclosed URIs… a user agent with link-editing capability can permanently replace references to the target URI". 302 (§15.4.3) and 307 (§15.4.8) are temporary. — [RFC 9110 §15.4](https://www.rfc-editor.org/rfc/rfc9110#section-15.4)
- 410 Gone means access "is no longer available… and that this condition is likely to be permanent… the server owners desire that remote links to that resource be removed". — [RFC 9110 §15.5.11](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.11)

**What Miniflux does:**
- **Validators:** it sends `If-None-Match` and `If-Modified-Since` from stored values. It ignores ETag and Last-Modified when the response has `Expires: 0`. It treats a feed as modified if the status is not 304 and the ETag (or, failing that, Last-Modified) differs from the stored value.
- **Retry-After:** it parses both integer seconds and RFC 1123 HTTP-date forms.
- **Cache headers:** it parses `Cache-Control: max-age` and `Expires`.
- **Encoding and size:** it sends `Accept-Encoding: br,gzip`. The default client timeout is 20 s. Bodies are capped with `http.MaxBytesReader(maxBodySize)`.
- **Errors:** it reports 429, 410, Cloudflare challenge 403s and timeouts as distinct errors.

— [Miniflux response_handler.go](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/response_handler.go); [request_builder.go](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/request_builder.go)
- **Miniflux scheduling:** its "entry frequency" scheduler sets interval = 7 days / (weekly entry count × factor), clamped between a configured min and max (max if there are no entries). It then takes `max(interval, refreshDelay)`, where refreshDelay = `max(RSS TTL, Cache-Control max-age, Expires)` on success, or the Retry-After delay on 429. Finally it caps at the max interval. — [Miniflux model/feed.go](https://github.com/miniflux/v2/blob/main/internal/model/feed.go); [handler.go](https://github.com/miniflux/v2/blob/main/internal/reader/handler/handler.go)
- A Miniflux commit (July 2024) fixed "Bug 1" from Rachel Kroll's June 2024 feed-reader score post, changing how ETag and Last-Modified are used together. I saw only the search snippet, not the commit itself. — [search result referencing the Miniflux fetcher and rachelbythebay.com/w/2024/06/11/fsr/](https://git.causa-arcana.com/forks/miniflux/src/branch/changes/internal/reader/fetcher)

**Rachel Kroll (rachelbythebay):**
- Her feed policy: readers that send conditional requests may poll **at most once per hour**. Programs that regularly send unconditional requests are no longer supported. Polls that come too often get **429 Too Many Requests**. — [rachelbythebay feed info page, via search summary](https://rachelbythebay.com/w/feed/) (I could not fetch the page directly; see Gaps.)
- Behaviors she called out, as quoted on Hacker News: "A fair number of people are sending conditional requests, but are doing it every 5 or 10 minutes", and one reader "hits every 2 minutes without fail", which is "the one feed user-agent I've had to block outright". Commenters add that some readers omit `Accept-Encoding: gzip`, and suggest respecting Cache-Control and backing off on 429. — [HN discussion of "So many feed readers, so many bizarre behaviors"](https://news.ycombinator.com/item?id=40498024)
- Her June 2024 update sorts readers into groups. "Group B: They tend to do spammy unconditional requests at startup, and usually at a needlessly fast rate, too" (NewsBlur was placed here). — [NewsBlur forum thread quoting her post](https://forum.newsblur.com/t/rachel-by-the-bay-feed-challenge-and-excessive-timeouts-probably-not-respecting-retry-after/10710)
- A NetNewsWire bug: adding a feed made 2–3 GETs in quick succession, and the second one got a 429 from her server. This is a real-world failure from add-time request bursts. — [NetNewsWire #4531](https://github.com/Ranchero-Software/NetNewsWire/issues/4531)
- A FreshRSS user saw `429` with `Retry-After: 3600` after a burst of test requests, then the site dropped TCP connections from that IPv4 address. — [DanielH2018/server #7985](https://github.com/DanielH2018/server/issues/7985)
- Her score service and posts: [feed reader score project](https://rachelbythebay.com/fs/), [2022 "A sysadmin's rant about feed readers and crawlers"](https://rachelbythebay.com/w/2022/03/07/get/), [2023 "Feeds, updates, 200s, 304s, and now 429s"](https://rachelbythebay.com/w/2023/01/18/http/), [2024-05-27 "So many feed readers, so many bizarre behaviors"](https://rachelbythebay.com/w/2024/05/27/feed/), [2024-05-30 "The feed reader score service is now online"](https://rachelbythebay.com/w/2024/05/30/fs/). These links are listed as sources by [SparkleMuffin's polling docs](https://virtualtam.github.io/sparklemuffin/developer-guide/concepts/feed-polling-caching.html).
- SparkleMuffin also stores a content hash of the feed body, because servers may change validators without changing content, or send none at all. When the hash matches, it skips DB work. — [SparkleMuffin docs](https://virtualtam.github.io/sparklemuffin/developer-guide/concepts/feed-polling-caching.html)

**Bun fetch:**
- `decompress` defaults to true, supporting gzip, deflate, br and zstd.
- Timeouts use `signal: AbortSignal.timeout(ms)`.
- Bun caches DNS for up to 30 s.
- The docs give an "address pinning" pattern: resolve with `node:dns/promises` `lookup`, check the address, connect to the IP with a `Host` header and `tls.serverName`, and set `redirect: "manual"` and `proxy: false`. Bun reads `HTTP(S)_PROXY` env vars unless `proxy: false` is set.
- The docs do not document a max-response-size option.

— [Bun fetch docs](https://bun.com/docs/runtime/networking/fetch)

**WebSub:**
- Subscribers must discover `rel=hub` and `rel=self` (Link headers first, then `<link>` in the feed or HTML). They POST to the hub with `hub.callback`, and the hub verifies by **GETting the callback** with `hub.challenge`, so the callback must be publicly reachable. Leases expire and must be renewed. `hub.secret` HMAC signatures (`X-Hub-Signature`, sha1/256/384/512) must be verified, and invalid messages ignored. — [W3C WebSub](https://www.w3.org/TR/websub/)
- One reader operator estimated that about 6% of feeds advertise WebSub, mostly WordPress.com. This is anecdotal. The WordPress WebSub plugin has 100K+ installs. — [search summary of forum/plugin pages](https://wordpress.org/plugins/pubsubhubbub/)
- JSON Feed has a `hubs` array, and `feed_url` is the `hub.topic`. — [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)

### Inferences
- **Pure core (`classifyFetch` / `planRefresh`):** map a `FetchOutcome` to a health change and the next poll time.
  - 200: parse.
  - 304: touch the validators (and the hash).
  - 301/308: update the stored URL, ideally only after a few consecutive permanent redirects to the same target, to survive misconfigurations.
  - 302/303/307: keep the original URL.
  - 410: `gone`, stop polling.
  - 404: `failing`, with backoff.
  - 429/503 with Retry-After: next poll at least that far out.
  - Timeouts or 5xx: retryable with exponential backoff.
- **Next poll:** `clamp(max(frequencyInterval, ttl, maxAge, expires, retryAfter), 1h, 24h)` by default, with jitter. Ignore `<skipHours>`/`<skipDays>`, or honor them as a further delay. They are rarely used, and I found no source requiring them.
- **Adding a feed:** use a single GET whose response feeds both discovery and the first parse. Do not re-fetch right after subscribing. Do not fire an unconditional refresh of every feed at process start. Spread the first polls with jitter.
- **Redirects:** use `redirect: "manual"` in the adapter so it can (a) see 301 vs 302 per hop, (b) re-run the SSRF check on every hop, and (c) cap hops at about 5.
- **Body cap:** enforce it by reading `response.body` as a stream and aborting past N MB (Miniflux has a configurable limit), and also check `Content-Length` first.
- **User-Agent:** the architecture's `Elsewhere/<version> (+project url)` matches common practice. Including the subscriber count ("1 subscriber") is a common convention for aggregators, though I did not find a source for it here.
- **WebSub:** defer. A single-user self-hosted instance behind NAT usually has no public callback URL. Adoption is around 6% of feeds, and hourly polling with conditional GET is cheap. Store `hub`/`self` links when parsing so it can be added later.

### Gaps
- **Rachel Kroll's posts and score page could not be fetched.** rachelbythebay.com refused connections from this environment over both IPv6 and IPv4 (consistent with her reported IP blocking), and archive.org was blocked for the fetch tool. Her exact test criteria come only from secondary sources: HN quotes, the NewsBlur forum, NetNewsWire and FreshRSS issues, and a search summary of her feed page. Not verified first-hand:
  - "echo Last-Modified exactly" (supported by RFC 9110 instead)
  - a startup-burst rule
  - her exact scoring rubric
- I did not confirm whether Miniflux rewrites the stored feed URL on a 301 during refresh. The inspected code uses `EffectiveURL()` for parsing and duplicate detection, and sets `FeedURL` from it only at creation.
- RFC 9111 heuristic freshness was not reviewed in detail.

## Entry identity and dedupe

### Takeaway
Use a **stable per-feed key**: `feedId +` GUID/Atom id/JSON Feed id when present; otherwise the normalized link; otherwise a hash of title and content. Handle duplicate GUIDs within one document as Miniflux does. Normalize URLs with **normalize-url** (v10, zero dependencies) in the core, plus a tracking-parameter strip list.

### Cited Findings
- **Miniflux entry hash:**
  - SHA-256 of the GUID.
  - If the same GUID repeats within the feed: GUID + "|" + URL, or GUID + "|" + occurrence index.
  - With no GUID: SHA-256 of the entry URL.
  - With no GUID and no URL: SHA-256 of title + content.

  — [Miniflux rss/adapter.go](https://github.com/miniflux/v2/blob/main/internal/reader/rss/adapter.go)
- JSON Feed `id` "is unique for that item for that feed over time. If an item is ever updated, the id should be unchanged. New items should never use a previously-used id". Numeric ids should be coerced to strings. — [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)
- normalize-url 10.0.0 (2026-10-14, MIT, zero dependencies, about 60M downloads/week). [npm](https://www.npmjs.com/package/normalize-url) In a local test, it lowercased the host, dropped `:443`, resolved `../`, removed `utm_*` with `removeQueryParameters`, sorted the query parameters, and kept the `#fragment` by default. [local test]
- feedsmith exposes the RSS guid's `isPermaLink` flag. [local test]

### Inferences
- Keep the raw id for dedupe and a normalized URL for cross-feed dedupe and article canonicalization (Library context).
- Dedupe within a feed on the id key only. GUIDs change when sites migrate (http→https, new domain). To limit floods after a CMS migration, a pure guard can treat an entry as "seen" when its normalized URL **or** id matches an existing entry. It can also flag a refresh where more than N entries are new at once, instead of marking them all unread.
- Do not strip the fragment for identity (some feeds use `#` anchors for distinct entries). Do strip it for article canonicalization.

### Gaps
- No library-level study of how often real feeds change GUIDs was found.

## Character encoding

### Takeaway
Parsers take strings, so decoding is the shell's job: read bytes, pick the charset (BOM, then the XML declaration's `encoding=`, then the HTTP `charset`), and decode with `TextDecoder`. **Bun 1.4.2's TextDecoder supports the legacy WHATWG encodings** (windows-1252, iso-8859-x, koi8-r, shift_jis, euc-jp, gbk/gb18030, big5, euc-kr, windows-1251, utf-16le). No iconv-lite is needed.

### Cited Findings
- In Bun 1.4.2, `new TextDecoder(label)` succeeded for windows-1252, iso-8859-1 (mapped to windows-1252 per WHATWG), iso-8859-2, koi8-r, shift_jis, euc-jp, gbk, gb18030, big5, euc-kr, windows-1251 and utf-16le, and decoded bytes accordingly. [local test, Bun 1.4.2]
- The WHATWG Encoding Standard defines these legacy decoders. TextEncoder only outputs UTF-8. — [W3C Encoding overview](https://www.w3.org/International/docs/encoding/)
- Bun's type definitions list labels such as `windows-1252` and `shift_jis`. — [Bun Encoding reference](https://bun.com/reference/globals/bun/Encoding)
- The feedsmith README says nothing about encoding. Its API takes an already-decoded string. — [feedsmith README](https://github.com/macieklamberski/feedsmith)

### Inferences
- **Precedence:** XML spec practice (and Miniflux, as I understand it; not verified here) gives the BOM priority, then the XML declaration. The HTTP charset is often wrong for feeds (`text/xml` without a charset defaults to us-ascii under old RFC 3023 rules), so prefer the in-document declaration when present.
- **Pure core:** `detectCharset(bytes: Uint8Array, contentType?: string): string` is pure. `new TextDecoder()` is a pure, deterministic Web API, so decoding could live in core. Strip the XML declaration's encoding attribute afterwards, or leave it, since fast-xml-parser ignores it.
- Use `fatal: false`, so bad bytes become U+FFFD instead of throwing.

### Gaps
- I did not verify how Miniflux or FreshRSS order BOM, XML declaration and HTTP charset.
- I did not test UTF-16 feeds end to end through feedsmith.

## Security: XXE, entity expansion, SSRF, size limits

### Takeaway
The fast-xml-parser-based parsers **reject external entities and do not expand nested or oversized DOCTYPE entities**, so XXE and billion-laughs risk is low. Keep fast-xml-parser ≥ 5.12 for its expansion caps. **SSRF is the real risk.** Bun's `fetch` has no agent hook, so the adapter must resolve DNS itself, reject non-public addresses (all A/AAAA records, NAT64 and IPv4-mapped included), pin the connection to the checked IP, and repeat the check on every redirect hop.

### Cited Findings
- **XXE:** an external entity (`SYSTEM "file:///etc/hostname"`) made @rowanmanning/feed-parser and extractus throw "External entities are not supported". feedsmith threw "Invalid feed format" and rss-parser threw "Invalid character entity". None read the file. [local test]
- **Billion laughs (10 levels):** all four left `&lol9;` unexpanded and finished in about 1 ms. Direct fast-xml-parser 5.12.1 also left the nested `&lol3;` unexpanded while expanding a simple entity. [local test]
- **Oversized entities:** fast-xml-parser 5.12.1 threw `Entity "a" size (100000) exceeds maximum allowed size (10000)` for a 100 KB entity. For a 9 KB entity referenced 20,000 times, it threw `Expanded content length limit exceeded: 107964 > 100000`. Its option defaults are `maxEntitySize: 10000` and `maxEntityCount: 1000`, with `maxTotalExpansions: Infinity` in OptionsBuilder. rowanmanning (fast-xml-parser ^5.10.1, resolved to 5.12.1) threw the same expansion error. feedsmith bundles its own fast-xml-parser 5.11.2 and produced no expansion (60 KB output from 69 KB input), so it does not expand DOCTYPE entities. [local test; fast-xml-parser source](https://github.com/NaturalIntelligence/fast-xml-parser)
- **Miniflux SSRF guard:** `IsNonPublicIP` treats IPs as non-public if they are private, loopback, link-local unicast/multicast, multicast or unspecified. It unwraps NAT64 well-known-prefix and IPv4-mapped addresses before checking. — [Miniflux urllib/url.go](https://github.com/miniflux/v2/blob/main/internal/urllib/url.go)
- Bun documents an address-pinning pattern (resolve, check, connect to the IP with `Host` and `tls.serverName`, `redirect: "manual"`, `proxy: false`). It warns that proxy rules apply to the IP in the URL and that redirects must be followed manually. — [Bun fetch docs](https://bun.com/docs/runtime/networking/fetch)
- ipaddr.js 2.5.0 (2026-08-04, MIT, zero dependencies) provides `range()` classification (private, loopback, linkLocal, uniqueLocal, reserved, ipv4Mapped, and so on). request-filtering-agent 3.2.1 depends on it, but it hooks Node `http.Agent`, which Bun's `fetch` does not use. — [npm ipaddr.js](https://www.npmjs.com/package/ipaddr.js); [npm request-filtering-agent](https://www.npmjs.com/package/request-filtering-agent)
- Miniflux caps response bodies with `http.MaxBytesReader` (configurable `HTTPClientMaxBodySize`). — [Miniflux response_handler.go](https://github.com/miniflux/v2/blob/main/internal/reader/fetcher/response_handler.go)

### Inferences
- **The SSRF check goes in the `feed-http` adapter**, with a pure `isPublicAddress(ip)` in `core/shared` (ipaddr.js is pure) so it can be tested first. Checking only the hostname string is insufficient because of DNS rebinding and redirects. Pin the IP per hop.
- Self-hosters sometimes want to subscribe to LAN feeds. Add an explicit `ALLOW_PRIVATE_NETWORKS` setting (Miniflux has an equivalent fetcher option, by its config naming; not verified here), off by default.
- **Limits to enforce in the adapter:**
  - feed body: 10–20 MB cap, aborting the stream
  - discovery HTML: about 2 MB
  - redirect hops: 5
  - total timeout: 20 s via `AbortSignal.timeout`
  - decompression bombs: count *decompressed* bytes, since Bun decompresses transparently
- **Content safety:** sanitize HTML before storage (see above). Treat titles as text, never HTML, in the UI.

### Gaps
- I did not test whether feedsmith disables DOCTYPE processing explicitly or simply fails to expand. Its handling of internal entities in legitimate feeds (rare, but some use `&nbsp;` via DOCTYPE) is unverified.
- I did not confirm whether Bun 1.4.2 `fetch` supports connecting to an IP literal with a custom `tls.serverName` for SNI in all cases. The docs example implies it does.
