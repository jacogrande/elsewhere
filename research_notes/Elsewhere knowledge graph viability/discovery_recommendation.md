# Discovery and Recommendation for Elsewhere: Feed/Writer Discovery Sources and Beyond-Recency Recommendation Research

Scope note: research done 2026-11-16 with about 25 search/fetch calls. Items marked "not verified this session" come from background knowledge and need checking before they go into a final report.

## Q1. Feed discovery data sources: which have APIs and permissive terms?

### Takeaway
The most usable open seeds for a self-hosted tool are the Kagi Small Web list (MIT, about 30–35k feeds, plain-text files on GitHub) and the Marginalia Search API (free non-commercial key, CC-BY-NC-SA terms, AGPL engine). After that come crawlable OPML blogrolls, which can now be found through `rel="blogroll"` links. Curated directories such as ooh.directory (about 2.1–2.4k hand-categorized blogs) and Feedle are good for quality but offer no confirmed open API or data license.

### Cited Findings
**Kagi Small Web**
- The repo kagisearch/smallweb is MIT-licensed. Feeds sit in plain-text files: `smallweb.txt` (blogs), `smallyt.txt` (YouTube), `smallcomic.txt` (webcomics). — [ecosyste.ms listing](https://awesome.ecosyste.ms/projects/github.com%2Fkagisearch%2Fsmallweb); [Kagi blog](https://blog.kagi.com/small-web)
- New feeds are added by GitHub PR. One third-party write-up says a submission must also add at least two other sites in the same commit. — [engineered.at](https://engineered.at/articles/kagi-and-the-small-web) (third-party; rule not confirmed against CONTRIBUTING)
- Size: more than 30,000 sites (TechCrunch, March 2026). A May 2026 post counts 35,705. — [TechCrunch](https://www.techcrunch.com/2026/03/17/kagi-small-web-human-authored-indie-internet-mobile-ios-android-devices/); [ludditus.com](https://ludditus.com/2026/05/10/who-isnt-the-big-bad-web/)
- Do not confuse this with Kagi's separate Kite/Kagi News data (`kite.json`), which is CC BY-NC. Commercial use requires contacting Kagi. — [kite-public](https://github.com/kagisearch/kite-public)

**Marginalia Search**
- Current API: `api2.marginalia-search.com`, `GET /search` with `count` (1–100), `dc` (max results per domain), `page` and custom XML `filter`s. The key goes in an `API-Key` header. The shared `public` key is for experimenting, often hits rate limits, and cannot create filters. A free non-commercial key is available by email. Commercial keys are metered. — [Marginalia API docs](https://about.marginalia-search.com/article/api)
- Non-commercial keys are "Provided under CC-BY-NC-SA 4.0". Commercial keys have no attribution or commercial restriction. The engine source is AGPL. Datasets are published at downloads.marginalia.nu, but no license is stated for them. — [Marginalia API docs](https://about.marginalia-search.com/article/api)
- The source code was opened in 2022. — [marginalia.nu log](https://www.marginalia.nu/log/58-marginalia-open-source/)
- SearXNG includes a Marginalia engine module, so a self-hosted SearXNG can query it. — [SearXNG docs](https://docs.searxng.org/_modules/searx/engines/marginalia.html)

**Blogrolls / OPML / rel=blogroll**
- `<link rel="blogroll" type="text/xml" href="...opml">` is a de facto, informally proposed convention, not a formal standard. A WordPress plugin emits it and points to `/.well-known/recommendations.opml`. — [danq.me](https://danq.me/2024/05/03); [wordpress-blockroll](https://root.packagist.org/packages/pfefferle/wordpress-blockroll)
- Precedents: a 2003 blogroll-autodiscovery proposal (`rel="meta"`, `application/opml+xml`) and an Atom-era proposal for a feed-level blogroll element. — [kalsey.com 2003](https://kalsey.com/2003/06/blogroll_autodiscovery); [intertwingly wiki](https://intertwingly.net/wiki/pie/BlogRoll)
- There is also a proposal to publish feeds and blogrolls through an OPML `.well-known/feeds` file. — [dev.to (Kristof Zerbe)](https://dev.to/kristofzerbe/my-well-known-feeds-and-thoughts-beyond-22kp)
- The **Blogroll Network Map** crawls feeds and the OPML blogrolls they link to, starting from hard-coded seeds and expanding the frontier weekly by hand. It shows "14,251 feeds" (page refreshed 8 Nov 2026) and links a GitHub repo. Its stated purpose is helping readers find new blogs. It prefers blogrolls linked from the RSS feed over the homepage. — [blogroll-network.alexsci.com](https://blogroll-network.alexsci.com/)
- One blogger frames OPML blogrolls as "a federated social network". — [engineered.at](https://engineered.at/articles/rss-blogrolls-are-a-federated-social-network)

**Curated directories / blog search**
- ooh.directory (Phil Gyford, launched Nov 2022) is hand-curated and categorized. It had 851 blogs early on, 2,117 by Jan 2024 per Simon Willison, and a later undated third-party figure of 2,402. — [gyford.com](https://gyford.com/phil/writing/2022/11/23/oohdirectory); [Simon Willison](https://simonwillison.net/2024/Jan/9/oohdirectory); [Feedbagel](https://feedbagel.com/post/oohdirectory-a-curated-collection-of-2402-blogs-for-discovery-beyond-social-medi). The about page returned HTTP 403 to automated fetch, so I could not verify API/terms. That is itself a signal that scraping is unwelcome.
- Feedle is a free Lucene-based search engine over blog and podcast RSS. Every search has its own RSS feed. Its developer says the index is weighted toward larger outlets. — [preslav.me](https://preslav.me/2022/10/27/feedle-a-world-of-rss-feeds); [Boing Boing](https://boingboing.net/2022/11/05/feedle-is-a-search-engine-for-blogs-and-podcasts.html); [AlternativeTo](https://alternativeto.net/software/feedle/about)
- blognerd.app exists as an open-source blog search repo. — [GitHub](https://github.com/alastairrushworth/blognerd.app) (details not checked)

### Inferences
- A realistic bootstrap pipeline: (1) ship Kagi smallweb.txt as an embedded seed corpus, which MIT allows bundling; (2) use the user's own OPML and crawl `rel="blogroll"`/OPML links outward (Blogroll Network Map shows this works at about 14k-feed scale); (3) use Marginalia's API for topic queries over the small web, under a per-user non-commercial key, since CC-BY-NC-SA should be fine for a free OSS project but may block a hosted commercial version.
- Feed-level search results (Feedle-style "search as a feed") map well onto an "interest = saved query" feature.

### Gaps
- Not verified this session: Bear Blog discover feed terms, blogs.hn/HN-derived lists, Substack/Medium/Ghost feed URL patterns (each exposes per-author RSS, e.g. `/feed`), Mastodon/Bluesky link-sharing APIs (both public, firehose available for Bluesky), Common Crawl (open, but needs heavy processing), Wikipedia external links (CC BY-SA dumps), awesome-lists, Webmention.io, Feedbin/Feedly catalog APIs (Feedly has a search API on paid tiers), and Podcast Index-style open feed indices for blogs. None of these were checked against primary sources this session.
- Marginalia dataset license and the numeric API rate limits are unstated.
- ooh.directory terms and API are unknown (403).

## Q2. Building a "source graph": link graphs, co-citation, co-subscription, embeddings

### Takeaway
Blog hyperlink graphs are a proven signal for community structure (Adamic & Glance 2005). The same work shows they tend to cluster into homophilous communities, which helps "find related writers" but hurts serendipity. Blogroll/OPML edges are the cleanest explicit "recommends" edges available today.

### Cited Findings
- Adamic & Glance, "The political blogosphere and the 2004 U.S. election: divided they blog" (LinkKDD 2005) found that liberal and conservative blogs linked mostly within their own communities, with far fewer cross-links. — [ACM DOI](https://www.doi.org/10.1145/1134271.1134277); [PDF mirror](https://pdodds.w3.uvm.edu/teaching/courses/2009-08UVM-300/docs/others/2005/adamic2005a.pdf)
- The authors flagged "independent" blogs as possible bridges between the communities, a question left for future work. — [ictlogy summary](https://ictlogy.net/works/reports/projects.php?idp=1684)
- The resulting Political Blogs dataset is a standard network benchmark. — [TIB dataset](https://service.tib.eu/ldmservice/dataset/political-blogs-dataset)
- Butts' "blogties" analysis of blogroll ties appears in the Journal of Social Structure. — [CMU JoSS PDF](https://www.cmu.edu/joss/content/articles/volume10/Butts/blogties.1.0.pdf) (not read in full)
- The Blogroll Network Map shows an OPML-edge graph is crawlable today (feed → OPML → feeds → OPML). — [blogroll-network.alexsci.com](https://blogroll-network.alexsci.com/)

### Inferences
- Edge types to combine, from strongest explicit signal to weakest: blogroll/OPML membership (an explicit recommendation); outbound in-post links (endorsement or discussion); co-citation (two blogs both linked from the same third blog, the classic scientometric idea); bibliographic coupling (two blogs linking to the same targets); and embedding similarity of archives (content-only, needs no links). Co-citation and coupling can be computed locally from crawled outlinks with no crowd data.
- Adamic & Glance suggests that pure link-proximity expansion will reinforce clusters. To support serendipity, deliberately sample "bridge" nodes (high betweenness, or co-cited across clusters).
- Co-subscription (shared OPMLs) is essentially collaborative filtering. It is only viable if users opt in to sharing OPML, but public blogrolls already act as a proxy.

### Gaps
- Not retrieved: original co-citation (Small 1973) and bibliographic coupling (Kessler 1963) sources, Technorati-era authority studies, and recent work on embedding-based author similarity for blogs. I found no study that measures how well blogroll-graph recommendations satisfy readers.

## Q3. Agentic discovery via web search APIs (Exa, Brave, Tavily, Kagi, SearXNG)

### Takeaway
Per-query costs are low enough for a bring-your-own-key self-hosted tool: roughly $4–8 per 1,000 searches, and Exa and Brave both offer about $5–10/month in free credit. I found no rigorous public evidence on how well these APIs surface small or independent writers specifically.

### Cited Findings
- Exa official pricing: `/search` lite/instant $4 per 1k, auto/fast $7 per 1k; deep $12–15 per 1k; `/contents` $1 per 1k pages per content type; `/answer` $5 per 1k; Agent per-request $0.012–$1.00. Free tier is $10 in credits per month (up to about 2,500 Lite searches) with no card required. No separate "find similar" price is listed. — [Exa pricing](https://exa.ai/docs/reference/pricing)
- Third-party trackers disagree on Exa's price history ($5/1k in 2025 vs $7/1k in 2026). — [usagepricing.com](https://usagepricing.com/blueprint/activity/exa-ai-2026-04-price-change)
- Brave Search API is reported at about $5 per 1k with $5/month free credit and 50 QPS. Tavily is reported at about $8 per 1k pay-as-you-go, $5 per 1k on the $500 Growth plan. Both figures come from third-party comparisons that conflict with each other. — [activepieces](https://www.activepieces.com/blog/brave-search-api-pricing-plans-limits-cost-2026); [ecorpit](https://ecorpit.com/agent-web-search-api-cost-comparison-2026/)
- A comparison argues that fetching page text, not the search call itself, is the main cost driver for agents. — [beri.net](https://www.beri.net/article/tavily-vs-exa-vs-brave-vs-perplexity-search-api-agent-cost-2026)
- SearXNG (self-hostable, AGPL) can federate engines including Marginalia. — [SearXNG docs](https://docs.searxng.org/_modules/searx/engines/marginalia.html)

### Inferences
- Example budget: a weekly discovery run of 50 queries plus 200 page fetches costs about $0.55 on Exa ($0.35 + $0.20), well within the free tier. Cost is not the constraint. Precision is: filtering out SEO, content farms and corporate blogs. The Kagi list and Marginalia, which is biased toward non-commercial text-heavy sites, act as precision filters or priors.
- Exa's "find similar" (URL → semantically similar pages) maps directly to "more writers like this one". Validate the feed by checking that the result domain exposes RSS before suggesting it.

### Gaps
- No independent evaluation found of LLM-agent writer discovery quality, or of Exa find-similar on small-web blogs. Kagi Search API pricing and availability were not checked. Primary pricing pages for Brave and Tavily were not fetched.

## Q4. Mining archives: surfacing evergreen posts

### Takeaway
There is little academic work on evergreen detection. The key paper (Liao et al., ECML PKDD 2019) defines evergreen by long-term traffic, finds such articles are rare (<1% of news), and gets a high ROC AUC but low PR AUC. For a personal reader without traffic data, content and LLM classification is the practical route.

### Cited Findings
- Liao et al., "Characterization and Early Detection of Evergreen News Articles" (ECML PKDD 2019, Washington Post data): evergreen means sustained long-term traffic; fewer than 1% of articles qualify; the early-detection model reaches ROC AUC 0.961 but PR AUC 0.172. — [MLAnthology](https://mlanthology.org/ecmlpkdd/2019/liao2019ecmlpkdd-characterization); [PSU Pure](https://pure.psu.edu/en/publications/characterization-and-early-detection-of-evergreen-news-articles/)
- A Stanford CS229 student project classified evergreen vs ephemeral pages using StumbleUpon/Kaggle data with NB/LR/SVM baselines. — [CS229 PDF](https://cs229.stanford.edu/proj2014/Elaine%20Zhou,%20Lingtong%20Sun,%20Evergreen%20or%20Ephemeral%20-%20Predicting%20Webpage%20Longevity%20Through%20Relevancy%20Features.pdf)
- Industry analysis by Backlinko/BuzzSumo (3.6B articles, not peer-reviewed): list posts and how-tos most often become evergreen, podcasts rarely do, and titles containing a year scored higher. — [Backlinko](https://backlinko.com/evergreen-content-study)

### Inferences
- For Elsewhere: score archive posts by (a) LLM-judged timelessness (absence of dated news hooks, "essay/explainer/how-to" genre); (b) in-graph inbound links to the post from other blogs over time, a local proxy for "long-term traffic"; (c) semantic match to stated interests. Then resurface them via an "from the archives" slot instead of the recency timeline.
- The StumbleUpon/Kaggle "Evergreen Classification" dataset could serve as a cheap benchmark (not verified this session).

### Gaps
- No research found on evergreen detection for personal blogs specifically, or on LLM-based timeless/timely classification accuracy.

## Q5. Recommendation research: single-user content-based vs CF, LLM recommenders, serendipity/diversity, filter bubbles, bandits, user control

### Takeaway
With no crowd, Elsewhere should be content-based plus LLM-assisted: natural-language interests act as a zero-shot profile, and implicit reading signals refine it. Re-rank for diversity and novelty, use a light bandit-style exploration slot, and expose user controls. The evidence says controls raise satisfaction (Harper 2015) and that recommender-induced narrowing is weaker than often assumed (Nguyen 2014; Bakshy 2015).

### Cited Findings
**Beyond-accuracy metrics**
- Kaminskas & Bridge (ACM TiiS vol. 7, 2016/2017) survey definitions, metrics and optimization strategies for diversity, serendipity, novelty and coverage. Their empirical re-ranking study finds rating-based diversity correlates positively with novelty, and novelty improves coverage. — [UCC research portal](https://research.ucc.ie/en/publications/diversity-serendipity-novelty-and-coverage-a-survey-and-empirical/); [researchr](https://researchr.org/publication/KaminskasB17)

**Filter bubble / echo chamber evidence**
- Nguyen et al., WWW 2014 (MovieLens, longitudinal): recommendations and consumption both narrowed over time, but users who *took* recommendations narrowed less than those who did not. — [GroupLens blog](https://grouplens.org/blog/taking-recommendations-improves-consumption-diversity-a-surprise-result-from-exploring-the-filter-bubble-and-movielens/); [DBLP](https://dblp.dagstuhl.de/rec/conf/www/NguyenHHTK14.html)
- Bakshy, Messing & Adamic, Science 2015 (10.1M US Facebook users, Jul 2014–Jan 2015): individual choices limited exposure to cross-cutting content more than News Feed ranking did. All authors were Facebook-affiliated, and critics dispute the framing. — [Facebook Research blog](https://research.facebook.com/blog/2015/5/exposure-to-diverse-information-on-facebook-2/); [Solomon Messing page](https://solomonmg.github.io/publications/bakshy-2015-exposure/); [Cyborgology critique](https://thesocietypages.org/cyborgology/?p=19947)
- Adamic & Glance 2005 found strong link homophily in the blogosphere (see Q2). — [ACM DOI](https://www.doi.org/10.1145/1134271.1134277)

**Exploration vs exploitation**
- Li, Chu, Langford & Schapire, WWW 2010: LinUCB contextual bandit for Yahoo! Front Page news gave a 12.5% click lift over a context-free bandit on 33M+ events. The advantage grew when data was scarcer. The paper also proposes offline replay evaluation. — [arXiv 1003.0146](https://arxiv.org/abs/1003.0146?context=cs); [Princeton record](https://collaborate.princeton.edu/en/publications/a-contextual-bandit-approach-to-personalized-news-article-recomme/)

**LLM recommenders and cold start**
- The cold-start survey (Zhang et al., arXiv 2501.01945, 2025) organizes methods from content features up to LLM world knowledge, in two roles: LLM-as-recommender (prompting/tuning) and LLM-as-knowledge-enhancer. — [alphaxiv](https://alphaxiv.org/abs/2501.01945v2)
- A 2025 review (arXiv 2507.21117) says LLMs enable zero/few-shot reasoning for cold-start and long-tail items, via prompt-driven retrieval, language-native ranking, RAG and conversational recommendation. — [arXiv](https://arxiv.org/html/2507.21117v2)
- A meta-review reports that zero-shot LLM rerankers still trail strong classical recommenders on click/preference data. — [Criteo-hosted PDF](https://www.criteo.com/wp-content/uploads/2021/06/Can_LLMs_Recommend_as_well_as_Modern_RecSys__A_Meta_Review___v2.pdf) (summary-level only)

**User control / transparency**
- Harper et al., RecSys 2015 ("Putting Users in Control of Their Recommendations"): MovieLens users given popularity/recency sliders rated the results much more positively. Preferences varied widely; most wanted more popular items, while a minority wanted more obscure ones. — [GroupLens](https://grouplens.org/blog/putting-users-in-control-of-their-recommendations); [BibBase](https://bibbase.org/network/publication/harper-xu-kaur-condiff-chang-terveen-puttingusersincontroloftheirrecommendations-2015)
- Jannach, Naveed & Jugovac give an overview of user control in recommender systems and its interaction challenges. — [interactivesystems.info](https://interactivesystems.info/publications/user-control-in-recommender-systems-overview-and-interaction-challenges)

### Inferences
- For a single user, CF is unavailable at launch. Content-based ranking (embeddings of posts vs. an interest profile built from the user's description plus reads, saves and dwell) is the default. LLMs fill the cold start by expanding the described interests into queries and candidate sources.
- Since LLM rerankers trail tuned recommenders once behavioral data exists, use the LLM for candidate generation, explanation and evergreen judgment, and a cheap learned or embedding scorer for ranking.
- Harper 2015 suggests that an "obscurity/novelty" slider and a "recency vs archive" slider are directly evidence-backed controls for Elsewhere's audience, which likely skews toward the "more obscure" minority.
- Nguyen 2014 and Bakshy 2015 together suggest the filter-bubble risk mostly comes from user choice. Explicitly reserving exploration slots (bandit-style, or MMR diversity re-ranking per Kaminskas & Bridge) is a cheap counterweight.

### Gaps
- Not retrieved: explicit vs implicit feedback studies in RSS/news readers; research on Bluesky custom feeds and user-chosen algorithms (search returned nothing); serendipity user-study results in news specifically.

## Q6. Related products' discovery features and known effectiveness

### Takeaway
Consumer discovery products have repeatedly failed on business viability more than on technology: Artifact (2024), Pocket (2025), StumbleUpon (2018) and Google Reader (2013). Paid AI-feed features (Feedly Leo) get mixed user reviews. For a free OSS tool, the lesson is to avoid depending on scale economics or a hosted crowd.

### Cited Findings
- **Artifact** (Systrom/Krieger): announced shutdown 12 Jan 2024 because "the market opportunity isn't big enough to warrant continued investment"; Systrom also cited the struggles of news publishers. It became read-only until end of Feb 2024, was acquired by Yahoo in April 2024, and its tech went into Yahoo News. — [Systrom on Medium](https://medium.com/artifact-news/shutting-down-artifact-1e70de46d419); [Wikipedia](https://en.wikipedia.org/wiki/Artifact_(app))
- **Pocket**: Mozilla announced the shutdown on 22 May 2025, citing changed browsing and consumption habits. Service stopped 8 Jul 2025, exports ran until 8 Oct 2025, and Mozilla said discovery would continue via the Firefox New Tab. — [TechCrunch](https://techcrunch.com/2025/05/22/mozilla-is-shutting-down-read-it-later-app-pocket); [CyberInsider](https://cyberinsider.com/mozilla-to-shut-down-pocket-service-in-july-to-allow-exports-until-october/)
- **StumbleUpon**: closed 30 Jun 2018 and migrated to Mix, which per Garrett Camp combines semantic and social signals. — [Digital Trends](https://www.digitaltrends.com/social-media/stumbleupon-shuts-down/); [Notebookcheck](https://www.notebookcheck.net/StumbleUpon-shutting-down-on-June-30-accounts-and-content-moving-to-Mix-com.305380.0.html)
- **Google Reader**: shut down 1 Jul 2013. Its "Recommended items" surfaced posts from various sources, but one user reports it recommended items from feeds already followed, even items already read. — [9to5Google](https://9to5google.com/guides/google-reader); [isidorsfugue.com](https://isidorsfugue.com/2013/03/google-reader-once-knew-me-so-well.html); [lmorchard](https://blog.lmorchard.com/2013/03/14/social-novelty-filterin/index.md)
- **Feedly Leo / AI Feeds**: AI Feeds (feeds defined by an AI query) are reserved for the top paid tier (Pro+, about $12–15/month). One forum user called Leo's recommendations "at best useless, often laughable" (anecdotal). — [youngju.dev comparison](https://www.youngju.dev/blog/culture/2026-05-16-rss-readers-content-syndication-2026-feedly-ai-inoreader-netnewswire-reeder-5-newsblur-freshrss-miniflux-feedbin-readwise-reader-deep-dive.en); [MPU forum](https://talk.macpowerusers.com/t/is-leo-on-feedly-any-good/32088)
- **Inoreader**: secondary sources conflict on its AI features (BYO API key vs built-in assistant). Its own comparison page is promotional. — [stork.ai](https://www.stork.ai/alternatives/inoreader); [Inoreader](https://www.inoreader.com/alternative-to-feedly/)

### Inferences
- The products that died tried to build a business on scale (ads/engagement). A local-first tool whose costs are user-paid LLM/search keys avoids that failure mode, but it also can't use the crowd signals those products relied on.
- Google Reader's "recommends what you already follow" complaint shows why Elsewhere's recommender must explicitly exclude or downweight already-subscribed sources and already-read items in its discovery slot.

### Gaps
- Not verified this session: Readwise Reader's discovery features (Ghostreader is mainly for summarization/Q&A), Particle's approach, any quantitative effectiveness data for Feedly Leo, Inoreader or Google Reader recommendations, and the exact reason Google Reader's recommendations were removed. No product has published discovery-effectiveness metrics that I could find.
