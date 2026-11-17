# Elsewhere: Competitive Landscape, Graph-UX Evidence, and Sustainability Risks

Research date: 2026-11-16. I used 15 searches and fetches, so coverage is uneven. Many product claims come from third-party review sites (several are run by competitors, such as readless.app). Those are labeled where it matters. Items I could not verify this session are listed under Gaps and not stated as fact.

## (a) Who already does parts of this: RSS readers, AI features, licenses, fork candidates

### Takeaway
Commercial readers have converged on AI summaries, prioritization, dedup, and "AI feeds", sold as paid tiers, and Inoreader now offers bring-your-own-API-key. Open-source readers (Folo, FreshRSS, Miniflux, NewsBlur, the TT-RSS fork) give Elsewhere a base to fork or build on. Folo is the closest AI-native open-source competitor. I found no reader that builds a cross-article graph of topics and positions, so that is the open niche.

### Cited Findings
**Commercial / hosted**
- Feedly: Leo AI is reportedly limited to the Pro+ tier. That tier is about $12.99/month or $99/year ($8.25/mo) and includes 25 AI feeds, 75 newsletter slots, RSS Builder, and 2,500 sources. Pro is about $6.99/mo. Third parties disagree on prices ($12–$18/mo for Pro+), and the main source is a competitor's blog — [Readless (competitor)](https://www.readless.app/blog/feedly-pro-pricing-vs-readless-2026); [SocialRails](https://socialrails.com/blog/feedly-pricing)
- Leo is described as prioritizing articles, deduplicating near-identical stories, muting topics, and summarizing. The same competitor says Feedly "doesn't merge across sources" — [Stork.ai](https://www.stork.ai/en/feedly-with-leo-ai); [Readless](https://www.readless.app/blog/feedly-pro-pricing-vs-readless-2026)
- Inoreader, April 2026: "Intelligence" now lets users pick OpenAI, Mistral, or Anthropic, connect their own API keys, and choose models. The default is OpenAI GPT-4o-mini — [Inoreader blog, Apr 2026](https://www.inoreader.com/blog/2026/04/choose-your-ai-platform-for-intelligence-features.html)
- Inoreader features include article summaries, custom prompts, Q&A over articles, and podcast/video transcripts. A Sept 2026 update added "mentions" entity extraction (companies, products, places, people), which works best in EN/FR/DE. AI is on the paid Pro plan, and reports are an add-on — [Inoreader Jan 2026](https://www.inoreader.com/blog/2026/01/get-insights-with-inoreader-intelligence.html); [Inoreader Sept 2026](https://www.inoreader.com/blog/2026/09/introducing-mentions-redesigned-search-and-smarter-monitoring-feeds.html); [Inoreader Q2 2026](https://www.inoreader.com/blog/2026/07/inoreader-q2-highlights-more-control-less-friction.html)
- One third-party review rates Inoreader's AI as "useful but not groundbreaking" — [MakerStack](https://makerstack.co/reviews/inoreader-review/)

**Open source**
- Folo (formerly Follow, by RSSNext) is AGPL-3.0 with a special exception. Icons under `icons/mgc` are copyrighted by MingCute and can't be redistributed. It has AI translation and summaries, is under active development, and is built on RSSHub for source coverage. A third party counts about 146 contributors and calls it self-hostable — [GitHub RSSNext/folo](https://github.com/RSSNext/folo); [DEV.to review](https://dev.to/wonderlab/open-source-project-of-the-day-part-19-folo-ai-powered-next-generation-information-reader-3c02)
- FreshRSS is AGPL-3.0 per its repo. Some blogs wrongly say GPL-3.0 — [GitHub FreshRSS](https://github.com/freshrss/freshrss)
- Miniflux: most sources say Apache-2.0, with commits as of Aug 2026. Two OSSAlt guides say AGPL-3.0, so the sources conflict and the repo should be checked — [OSSAlt FreshRSS vs Miniflux](https://ossalt.com/guides/freshrss-vs-miniflux-2026); [NewsBlur OSS comparison](https://www.newsblur.com/alternative/open-source-rss-reader)
- NewsBlur is MIT-licensed and is the only one in that comparison with a hosted service too — [NewsBlur OSS comparison page](https://www.newsblur.com/alternative/open-source-rss-reader)
- Tiny Tiny RSS: the developer (Andrew Dolgov) announced on Oct 3, 2025 that tt-rss.org infrastructure (git, forum) would shut down on Nov 1, 2025, citing disinterest and burnout. He called the software functionally complete. A new maintainer took over, the domain now redirects to a GitHub fork (github.com/tt-rss/tt-rss), and that maintainer committed to PHP updates and bug fixes — [AlternativeTo](https://alternativeto.net/news/2025/10/tiny-tiny-rss-to-shut-down-as-developer-ends-project-entirely-by-november-1st-2025); [Linuxiac](https://linuxiac.com/tt-rss-shuts-down-but-the-project-lives-on-under-a-new-fork)
- I found no AI extension in the FreshRSS or Miniflux ecosystems in this search. The only FreshRSS extension that came up was Youlag, a video UI under GPL-3.0 — [search summary of ossalt/newsblur pages](https://ossalt.com/guides/how-to-self-host-freshrss-rss-aggregator-2026)

**Read-later shutdown context:** Omnivore shut down on Nov 15, 2024 and deleted user data. Its team joined ElevenLabs, and the code remains on GitHub unmaintained — [MacRumors forum (anecdotal)](https://forums.macrumors.com/threads/omnivore-shutting-down.2441423); [Fabric comparison](https://developers.fabric.so/comparison/fabric-vs-omnivore)

### Inferences
- License matters for the fork decision. Forking Folo or FreshRSS binds Elsewhere to AGPL-3.0, which is fine for a free project and protects against SaaS clones. Miniflux (if Apache-2.0) or NewsBlur (MIT) allow any license. Miniflux's Go codebase and REST API make it an attractive headless ingestion backend. Elsewhere could add the graph and AI layer as a separate client or service, so it wouldn't have to maintain fetching and parsing itself.
- Folo is the main open-source rival on "AI RSS". Its features are per-article (summary and translation), not cross-article synthesis. A graph of topics and positions across a reader's articles appears to be unclaimed among both open-source and commercial readers. Feedly and Inoreader's features (dedup, mentions, AI feeds) are steps in that direction, though, and Inoreader's entity "mentions" is a primitive version of graph nodes.
- Inoreader shipping BYO keys in 2026 shows that a mainstream reader finds the model viable. This supports Elsewhere's BYO-key or local-model approach.

### Gaps
- I did not verify Readwise Reader/Ghostreader, Feedbin, NetNewsWire (license believed MIT, unverified), Reeder, Matter, or the exact status of NewsBlur's intelligence trainer. They were out of budget.
- I did not find a survey of "AI-native" readers launched in 2025–2026 beyond Folo and small apps like Readless. Competitor-run comparison blogs dominate the search results.
- I could not confirm Feedly's prices on feedly.com.

## (b) Do graph-based exploration UIs get used and help? Perspective products and academic analogues

### Takeaway
The evidence leans against a global node-link graph as the main navigation surface. In usage polls most users never open it, and controlled studies show no retrieval advantage over lists. Graphs help when they are local (a few hops from the current item), seeded by the user, laid out on meaningful axes (Litmaps puts time on the x-axis), or embedded inside a familiar faceted or list UI (GRAFS). Perspective products succeed with simple, glanceable summaries per story (Ground News coverage bars and Blindspot, the Consensus Meter), not with graphs. Those summaries draw criticism for being reductive.

### Cited Findings
**PKM graph views (anecdotal)**
- A r/ObsidianMD poll (Dec 2024, 302 votes) asked how often users navigate with the global graph: 178 said Never, 54 Rarely Ever, 44 Rarely, 23 Frequently. That is about 59% never and about 8% frequently — [Reddit mirror](https://reddit.birdcat.cafe/r/ObsidianMD/comments/1hg9qr3/how_often_do_you_use_the_global_graph_in_obsidian)
- Common complaint: large vaults turn the graph into a "hairball". "Local graph is actually useful. Full graph is mostly a poster." Node arrangements also aren't saved when the view closes — [Brian Carey Substack](https://briancarey.substack.com/p/obsidian-meaningless-names-no-directories); [CodeCulture](https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful)
- Defenders say the graph is useful with search filters and tags, and for spotting notes not yet linked to a topic — [Obsidian forum](https://forum.obsidian.md/t/you-all-say-the-graph-is-useless-let-me-show-you-how-to-use-it/116738); [Eleanor Konik](https://www.eleanorkonik.com/its-not-just-a-pretty-gimmick-in-defense-of-obsidians-graph-view)

**HCI evidence**
- A 40-participant study compared node-link diagrams with a text list (titles and snippets) for finding relevant documents. The hypothesis that node-link was faster was not statistically supported, and the authors say this matches prior studies. I could not fetch the full paper (403), so title and venue are unverified — [core.ac.uk PDF](https://core.ac.uk/download/210608686.pdf)
- GRAFS (Guo et al., ACM TiiS 2023) embeds a knowledge subgraph inside a standard faceted-search UI. In a 20-participant study on exploratory literature search, users did better than with a faceted baseline at identifying relations between concepts and building deeper understanding — [arXiv 2302.09448](https://arxiv.org/pdf/2302.09448); [UNC VACLab](https://vaclab.unc.edu/publication/tiis_2023_guo/)
- Visualizing facets (an email-search study with N=11 using timeline navigation) helped discovery — [arXiv 2108.00920](https://arxiv.org/pdf/2108.00920v1.pdf)
- Marchionini (2006, CACM) framed exploratory search as "learning and investigating" rather than lookup. This comes from prior knowledge and was not fetched this session — [CACM doi:10.1145/1121949.1121979](https://doi.org/10.1145/1121949.1121979)

**Literature-graph analogues**
- Connected Papers, ResearchRabbit, and Litmaps share a pattern: start from papers the user picks, recommend by citation, and refine through an interactive visualization — [IntuitionLabs guide](https://intuitionlabs.ai/articles/ai-literature-mapping-tools-guide)
- Connected Papers uses co-citation and bibliographic coupling in a force-directed graph. Reviewers praise it as fast and simple for "a quick snapshot of a research area." Litmaps puts publication year on the x-axis by default and explores up to two degrees forward and back — [Digital Orientalist](https://digitalorientalist.com/2025/03/18/tools-for-literature-mapping/); [IntuitionLabs](https://intuitionlabs.ai/articles/ai-literature-mapping-tools-guide)
- ResearchRabbit is a "powerful, free" tool but "can be overwhelming at first." Once learned, it is strong for unstructured searching — [JCHLA review](https://journals.library.ualberta.ca/jchla/index.php/jchla/article/download/29699/21874?inline=1); [PMC review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10403115/)
- I found no controlled head-to-head user study of these tools, only descriptive reviews — [search result set above]

**Perspective / consensus products**
- Ground News groups coverage of one story from thousands of publishers onto a single page and shows the bias distribution. Its Blindspot feature flags stories covered disproportionately by one side — [Ground News help](https://help.ground.news/en/articles/485057); [MBFC](https://mediabiasfactcheck.com/ground-news/)
- Ground News has app subscriptions (Pro from $0.99/mo, Premium from $3.99/mo per an Aug 2026 review). Critics call its left/right model reductive, and Trustpilot users complain about cancellation friction — [StationX review Aug 2026](https://app.stationx.net/articles/ground-news-review); [Simplify](https://simplify.jobs/c/Ground-News)
- Particle synthesizes one AI story from many articles across the spectrum and excludes "conspiracy theories" and "extreme fringes" — [NewsMachines](https://newsmachines.beehiiv.com/p/particle-news-ai-aggregation)
- The Consensus Meter labels papers yes, possibly, mixed, or no for yes/no questions. Critics say it counts papers rather than weighting them (a case series counts the same as an RCT), may reflect publication bias, and works best on well-studied questions. Independent accuracy validation is thin or disputed — [Aaron Tay 2025 deep dive](https://aarontay.substack.com/p/a-2025-deep-dive-of-consensus-promises); [CASRAI guide](https://casrai.org/guides/consensus-ai-search-engine-guide)
- Elicit's focus is extraction into tables, not consensus. Both tools rely on Semantic Scholar data — [CASRAI comparison](https://casrai.org/compare/elicit-vs-consensus)

### Inferences
- Design implication for Elsewhere: the default "follow ideas" view should be a concept or topic page (wiki-style) with "related ideas" rails, plus a local 1–2-hop graph scoped to the current topic. Do not use a global force-directed graph as home. The global graph can be an optional "map" with persistent layout and a meaningful axis such as time.
- Mapping positions across blogs resembles the Consensus Meter, and inherits its flaws. Counting articles per stance would let prolific bloggers dominate and cause "publication bias". A credible version would show a stance distribution with source diversity, link every claim to its quote, and expose uncertainty. Ground News shows that a simple per-story distribution graphic is the sticky part.
- Seed-based exploration (ResearchRabbit, Connected Papers) maps well to "start from an article or idea, then expand", and could also drive AI source discovery ("feeds that cite or discuss this").

### Gaps
- I did not research Roam, Logseq, Heptabase, InfraNodus, Kialo, AllSides, Perplexity Discover, or NotebookLM because of the budget.
- I found no published usage telemetry for Obsidian, ResearchRabbit, or Connected Papers graph features. The Reddit poll is self-selected and anecdotal.
- I did not get to node-link scalability and clutter literature (for example Ghoniem et al. on matrix vs. node-link readability).

## (c) Market and sustainability risks for a free open-source project with AI costs; legal and ethical issues

### Takeaway
Hosted reading services keep shutting down (Omnivore 2024, Pocket 2025), and even an open-source infrastructure maintainer burned out (TT-RSS 2025). The durable pattern is self-hostable software with data export plus user-paid AI: BYO key, which Inoreader validated in 2026, or local models. That avoids per-user inference costs. On the legal side, news publishers widely block AI crawlers. A reader that fetches full text and embeds it with LLMs risks being treated as an AI crawler, so it should identify itself honestly and default to the content in the feed.

### Cited Findings
- Pocket: Mozilla announced on May 22, 2025 that Pocket would close on July 8, 2025, saying it needed to "be intentional about where we invest our time and resources." Export was available until Oct 8, 2025. A later Mozilla support page says the API was disabled on Nov 12, 2025 as data deletion began, which conflicts on the final date — [9to5Mac](https://9to5mac.com/2025/05/22/mozilla-announces-shutdown-of-pocket/); [Mozilla support](https://support.mozilla.org/en-US/kb/future-of-pocket?lang=sr); [CyberInsider](https://cyberinsider.com/mozilla-to-shut-down-pocket-service-in-july-to-allow-exports-until-october/)
- Omnivore (open source, free) shut down when its team joined ElevenLabs. The hosted service was switched off on Nov 15, 2024 with data deleted, giving users about 2 weeks' notice — [MacRumors forum](https://forums.macrumors.com/threads/omnivore-shutting-down.2441423); [Fabric](https://developers.fabric.so/comparison/fabric-vs-omnivore)
- TT-RSS's sole maintainer quit public infrastructure over disinterest and burnout. The project survived only because a new maintainer forked it — [Linuxiac](https://linuxiac.com/tt-rss-shuts-down-but-the-project-lives-on-under-a-new-fork); [LavX](https://news.lavx.hu/article/tiny-tiny-rss-maintainer-pulls-plug-on-infrastructure-citing-burnout)
- Inoreader BYO key (OpenAI, Mistral, Anthropic) shipped in Apr 2026, with GPT-4o-mini as the cheap default — [Inoreader](https://www.inoreader.com/blog/2026/04/choose-your-ai-platform-for-intelligence-features.html)
- Commercial readers put AI behind paid tiers (Feedly Pro+ about $99/yr, Inoreader Pro) — [Readless](https://www.readless.app/blog/readwise-vs-feedly-vs-inoreader-pricing-2026); [Inoreader](https://www.inoreader.com/blog/2026/01/get-insights-with-inoreader-intelligence.html)
- A HasData analysis found that 56.4% of news publishers block at least one AI crawler in robots.txt, versus 10.3% of top sites overall. 234 of 592 sites disallowing GPTBot still served it a page, and some block at the firewall instead — [PPC Land](https://ppc.land/cloudflare-drops-ai-opt-outs-from-118-sites-robots-txt-hasdata-finds/)
- Cloudflare manages robots.txt for customers, converts AI-bot rules into firewall rules (AI Crawl Control), and blocks AI bots without permission by default. It notes that robots.txt compliance is voluntary — [CJR](https://www.cjr.org/analysis/cloudflare-blocks-ai-bots-from-scraping-web-content-without-permission.php); [Cloudflare blog](https://blog.cloudflare.com/control-content-use-for-ai-training/); [MediaCopilot](https://mediacopilot.ai/cloudflare-ai-crawler-controls/)

### Inferences
- Cost model: a hosted free tier with server-side LLM calls has no funding source and risks becoming another Omnivore. The safer setup is local-first or self-hosted by default, with BYO API key and optional local models (Ollama-class). Embedding and stance extraction can run on cheap small models or locally. Any hosted demo should have hard quotas.
- Bus factor: TT-RSS shows that even "done" software needs PHP and runtime upkeep. Choosing a maintained base (Miniflux or FreshRSS as backend) and keeping the novel graph layer small reduces the maintenance burden.
- Data portability (OPML and graph export) is the lesson from Pocket and Omnivore: users were hurt most by short export windows.
- Legal and ethics: fetching full text for the user to read is different from AI training, but publisher firewalls (Cloudflare AI Crawl Control) may not tell the difference. A server-side "Elsewhere" fetcher that runs LLMs over content could be classified as an AI bot. Recommended: an honest, distinct User-Agent; respect for robots.txt and any AI opt-out signals for full-text fetches and AI processing; feed-provided content by default; per-user local storage and embeddings, not a shared corpus; no redistribution of article text, only links, quotes, and attribution. Small-web authors get linked, not summarized away.

### Gaps
- I did not verify the Artifact (Systrom/Krieger) shutdown details (announced Jan 2024, then acquired by Yahoo). They need a source. Google Reader (2013) is not covered either.
- I found no RSS-specific guidance on whether feed readers count as AI crawlers, or on how Cloudflare classifies feed fetchers. Search returned only general AI-crawler material.
- No per-user LLM cost figures for RSS summarization. I found no published numbers for token volume per reader per month.
- How open-source readers fund themselves (NewsBlur's hosted subscription, FreshRSS and Miniflux donations or OpenCollective) was not verified.
- Copyright and fair-use analysis of storing and embedding articles (for example, US cases in 2025–2026 on AI training) was not researched.
