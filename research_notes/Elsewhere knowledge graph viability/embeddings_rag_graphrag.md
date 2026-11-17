# Retrieval & Representation Stack for Elsewhere (Embeddings, Vector Search, RAG, GraphRAG)

Research date: 2026-11-16. Budget-limited pass (~16 tool calls). Many figures come from secondary aggregators; those are flagged. Anything not verified against a primary source is listed under Gaps rather than asserted.

## 1. Embedding models for long-form articles (open vs. API; MTEB; dims; context; cost; CPU; chunking; Matryoshka)

### Takeaway
Open models now match or beat cheap API models on MTEB: Qwen3-Embedding (0.6B/4B/8B, 32K context, flexible dims) leads open-weights multilingual MTEB, and EmbeddingGemma (~308M, 768-d with Matryoshka down to 128) is the best "runs anywhere / CPU" option. API embeddings are cheap enough (about $0.02/M tokens at the low end) that a bring-your-own-key option costs users pennies. For long articles, chunking (ideally with late chunking) beats single whole-document vectors for retrieval, but a document-level vector is still useful for "related articles" graph edges.

### Cited Findings
- Qwen3-Embedding comes in 0.6B, 4B and 8B sizes, built on dense Qwen3 base models; the 8B scores **70.58 on MTEB Multilingual** per the Qwen3 Embedding paper; the paper also describes flexible-dimension output — [Qwen3 Embedding paper, arXiv 2506.05176](https://arxiv.org/html/2506.05176v3)
- Qwen3-Embedding-0.6B scores about **64.33 on MTEB Multilingual** (another source reports 64.34); the family supports a **32K-token** context — [Regolo comparison](https://regolo.ai/embeddinggemma-2-vs-qwen3-embedding-benchmarks.md); [SurrealDB embedding comparison](https://surrealdb.com/blog/embedding-models-comparison)
- EmbeddingGemma (original, ~308M params) scores **61.15 on MTEB Multilingual**, outputs **768-d vectors with Matryoshka truncation to 512/256/128** — [Regolo comparison](https://regolo.ai/embeddinggemma-2-vs-qwen3-embedding-benchmarks.md). Context length is reported inconsistently: 2,048 tokens in one source and 8,192 in another (possibly different versions). **Conflict, unresolved.**
- A secondary source describes an "EmbeddingGemma 2" (744M total, 271M text-only) scoring 61.36 MTEB Multilingual, 68.46 MTEB English v2 (vs. Qwen3-0.6B 70.47), and 78.68 MTEB Code (vs. Qwen3-0.6B 75.42). **Not verified against Google primary docs; treat as unconfirmed** — [FourWeekMBA](https://fourweekmba.com/ai-google-paper-embeddinggemma-2-trails-qwen-on-text-not-code/); [Regolo](https://regolo.ai/embeddinggemma-2-vs-qwen3-embedding-benchmarks.md)
- Memory practicality: Ollama allocates the full 32K context for Qwen3-Embedding-0.6B, using **~5.8 GB GPU memory**, vs. **~542 MB** for the EmbeddingGemma text model — [Regolo comparison](https://regolo.ai/embeddinggemma-2-vs-qwen3-embedding-benchmarks.md). (Implication: cap `num_ctx` when serving Qwen3-Embedding locally.)
- API pricing (aggregator-sourced; verify on vendor pages): OpenAI **text-embedding-3-small ~$0.02/M tokens**, **text-embedding-3-large $0.13/M**; **voyage-3.5 $0.06/M, voyage-3.5-lite $0.02/M**, Voyage free tier cited as **200M tokens**; **gemini-embedding-001 $0.15/M** (half on batch), with a newer "Gemini Embedding 2" text at $0.20/M and a reported 001 shutdown date; **Cohere embed-v4 ~$0.10–0.12/M** (sources disagree), and one source says **Cohere Embed 5 shipped 30 Sep 2026**, superseding v4 — [Activepieces OpenAI pricing 2026](https://www.activepieces.com/blog/openai-embeddings-api-pricing-in-2026-dated-and-checked.md); [perkstack voyage-3.5](https://perkstack.co/blog/cheapest-voyage-3-5-api); [perkstack gemini-embedding-001](https://perkstack.co/blog/cheapest-gemini-embedding-001-api); [pecollective spec comparison, Apr 2026](https://pecollective-com.pages.dev/tools/text-embedding-models-compared/); [rework.com 2026 comparison](https://resources.rework.com/tools/ai-data-infra/best-embedding-models-2026)
- Late chunking (Jina): embed the whole document with a long-context model, then pool token embeddings per chunk. On BEIR with jina-embeddings-v2-small-en and ~256-token chunks, it beat naive chunking on every tested dataset; reported average relative nDCG@10 gains **2.70%–3.63%** (summary of paper; not verified against tables) — [Jina blog](https://jina.ai/news/late-chunking-in-long-context-embedding-models/); [arXiv 2409.04701](https://arxiv.org/html/2409.04701v1); [alphaXiv overview](https://alphaxiv.org/overview/2409.04701v3)
- SciFact nDCG@10: traditional chunking **64.20%**, late chunking **66.10%**, no chunking (whole doc) **63.89%** — i.e. whole-doc embedding was the worst of the three — [jina-ai/late-chunking README](https://github.com/jina-ai/late-chunking)
- On short-document datasets (e.g., Quora) late and naive chunking tie, since little splitting happens — [EmergentMind summary](https://api.emergentmind.com/papers/2409.04701)

### Inferences
- Default recommendation for a free self-hosted app: ship **EmbeddingGemma (or Qwen3-Embedding-0.6B with capped context)** locally via Ollama/llama.cpp/ONNX, store **256-d Matryoshka-truncated** vectors, and offer BYO-key API embeddings as an option. At ~$0.02/M tokens, embedding 10k articles of ~2k tokens (20M tokens) via API costs about $0.40 (arithmetic from cited price).
- Store two granularities: chunk vectors (256–512 tokens, late chunking if the model supports it) for assistant RAG, and a document-level vector (mean of chunks or title+summary embedding) for the "related writing" graph.
- Locking the vector schema to one model is a migration risk; record model name + dim per vector so users can re-embed.

### Gaps
- Did not retrieve the live MTEB leaderboard; current (late-2026) top entries, retrieval-only subscores, and figures for nomic-embed-text v1.5/v2, bge-m3, gte-multilingual, jina-embeddings-v3/v4, voyage-3-large, and gemini-embedding were not verified. Check https://huggingface.co/spaces/mteb/leaderboard.
- No measured CPU throughput (docs/sec) numbers for embedding models were found.
- No primary-source evidence gathered on Matryoshka retrieval-quality loss at 256/128 dims (check each model card).

## 2. Do embeddings capture stance/opinion or only topic?

### Takeaway
Standard semantic-similarity embeddings are largely **topic-dominated and stance-blind**: "X is good" and "X is not good" land close together. This is a known, published failure. Agreement/disagreement needs a separate signal (stance-tuned embedding, NLI cross-encoder, or LLM classification), which matters a lot for an "explore opposing views" feature.

### Cited Findings
- EMNLP 2024 paper "*I love pineapple on pizza* != *I hate pineapple on pizza*: Stance-Aware Sentence Transformers for Opinion Mining" argues standard sentence transformers conflate topic similarity with stance similarity, and adds stance-aware training on top of topic-aware models — [ACL Anthology 2024.emnlp-main.1171](https://aclanthology.org/2024.emnlp-main.1171.pdf)
- The same paper notes models place "The weather is good" and "The weather is NOT good" close together, and cites Vahtola et al. (2022) showing sentence embeddings fail on negated antonyms — [ACL Anthology 2024.emnlp-main.1171](https://aclanthology.org/2024.emnlp-main.1171.pdf)
- Its fix uses contrastive/triplet training that pulls agreeing pairs together and pushes opposing pairs apart while checking STS-B performance doesn't drop — [deep-paper summary](https://deep-paper.org/en/paper/file-3179)
- BaIT (arXiv 2206.07535) combines similarity embeddings and NLI-trained embeddings for agree/disagree/discuss classification; NLI embedding space puts a headline closer to "agree" than "disagree" sentences, suggesting NLI-trained representations carry stance signal plain similarity models lack — [BaIT, arXiv 2206.07535](https://arxiv.org/pdf/2206.07535)
- Cross-topic stance detection work still uses bi-encoders (SBERT) as baselines, comparing modelling choices for few-shot stance — [arXiv 2404.03987](https://arxiv.org/html/2404.03987)

### Inferences
- Do not use cosine similarity to infer "this article disagrees with that one." Use embeddings to find **same-topic** candidates, then run a stance step: an NLI cross-encoder (cheap, local) or an LLM prompt ("does B support, oppose, or not address A's main claim?").
- Instruction-tuned embedders (Qwen3-Embedding, which supports task instructions per its paper) can be steered toward a task, but no evidence was found that an instruction alone makes them stance-sensitive. Treat as an experiment, not a design assumption.

### Gaps
- No direct 2025–2026 benchmark found measuring stance sensitivity of modern instruction-tuned LLM embedders (Qwen3-Embedding, gemini-embedding, etc.).
- Did not find quantitative results for the EMNLP 2024 stance-aware model (full tables not read).

## 3. Vector storage for a self-hosted app (sqlite-vec, pgvector, LanceDB, Qdrant, Chroma, DuckDB VSS)

### Takeaway
For a personal corpus (10k–100k articles; maybe 0.1–1M chunks), **brute-force search in SQLite is sufficient**: ~50–70 ms for 100k×384-d on a laptop. Above ~1M chunk vectors exact scan gets slow (hundreds of ms), and an ANN index (LanceDB, Qdrant, pgvector HNSW) or quantization becomes worthwhile.

### Cited Findings
- sqlite-vec is a brute-force (exact) search extension using virtual tables (vectors live in separate tables). Benchmark: **100k vectors × 384-d float32 on Apple M1 Pro: insert 1,179 ms, full-scan query 67.8 ms** — [Marco Bambini, "State of Vector Search in SQLite"](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite) (author is founder of competing sqlite-vector; potential bias)
- sqlite-vector (SQLite AI) on the same setup: full scan 56.7 ms; with 8-bit quantization **17.4 ms**, quantized + preloaded **3.97 ms**, recall@20 = 1.0, ~37 MB memory; supports FLOAT32/16, BF16, INT8, UINT8; ordinary tables; **free for open-source projects** (licensing condition to check) — [same source](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite)
- libSQL (Turso) vector uses a DiskANN index; the author's index build "ran for hours without finishing" in their test — [same source](https://marcobambini.substack.com/p/the-state-of-vector-search-in-sqlite)
- At larger scale: sqlite-vec exact scan measured **2.5 QPS at 1M×512-d (395 ms/query), 10 QPS at 1M×128-d**; the author calls it fine below ~50k vectors and "not an ANN competitor at scale" — [Go forum benchmark, Jul 2026](https://forum.golangbridge.org/t/benchmarking-a-pure-go-vector-index-against-hnswlib-and-sqlite-vec-every-number-i-got-wrong-first/42173). Another anecdotal report says ~50 ms at 1M×768 (no hardware given) — **conflicting; hardware-dependent** — [dev.to](https://dev.to/hypernexus/sqlite-vector-search-the-dependency-free-ai-memory-stack-that-outperforms-pinecone-5d27)
- Reor (local AI notes app) chunks and embeds notes into an **embedded LanceDB** store for related-note links and RAG — [Reor README](https://cdn.jsdelivr.net/gh/reorproject/reor@main/README.md)

### Inferences
- Storage math (arithmetic): 100k chunks × 768 float32 = ~307 MB; truncated to 256-d = ~102 MB; int8 = ~26 MB. Matryoshka truncation + int8 makes even 1M chunks (~256 MB at 256-d int8) feasible on a laptop.
- Exact-scan latency scales with dims × count, so 256-d Matryoshka vectors give roughly a 3× speedup over 768-d for brute force.
- Recommended path: SQLite (app data + FTS5 + sqlite-vec) as the single-file default; Postgres + pgvector as the "server deployment" option. Both keep the app one database.

### Gaps
- No numbers gathered for pgvector (HNSW build time/latency), LanceDB, Qdrant, Chroma, or DuckDB VSS at 10k–1M scale; maintenance status of sqlite-vec in late 2026 (whether ANN/IVF landed) not verified. Check each project's GitHub and docs.

## 4. RAG patterns: hybrid search, reranking, query rewriting

### Takeaway
Reranking gives small but consistent gains in the GraphRAG-Bench data (about +1–2 points accuracy over plain RAG). Hybrid BM25 + vector retrieval is the standard pattern in local knowledge tools. Little primary evidence on query rewriting was gathered in this pass.

### Cited Findings
- GraphRAG-Bench (GPT-4o-mini): vanilla RAG → RAG + rerank, Novel dataset accuracy: fact retrieval **58.76 → 60.92**, complex reasoning **41.35 → 42.93**, summarization **50.08 → 51.30**; Medical: fact **63.72 → 64.73**, reasoning **57.61 → 58.64**, summarization **63.72 → 65.75** — [GraphRAG-Bench, arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- Reranked RAG had the best fact-retrieval evidence recall (**83.21** on Novel) — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- Sonar, an Obsidian plugin, uses hybrid BM25 + vector retrieval with an external llama.cpp runtime — [Obsidian forum announcement](https://forum.obsidian.md/t/ann-sonar-offline-semantic-search-and-agentic-ai-chat-for-obsidian-powered-by-llama-cpp/110765)
- Qwen3 releases rerankers alongside its embedders (0.6B/4B/8B) — [Qwen3 Embedding paper](https://arxiv.org/html/2506.05176v3)

### Inferences
- For Elsewhere: SQLite FTS5 (BM25) + vector kNN fused with reciprocal rank fusion, then an optional small local reranker (e.g., Qwen3-Reranker-0.6B) on the top ~30. This is cheap and needs no graph.

### Gaps
- Did not retrieve primary evidence for hybrid-search gains (e.g., BEIR hybrid studies, Anthropic "Contextual Retrieval" failure-rate reductions) or query rewriting (HyDE etc.). These should be sourced before quoting numbers.

## 5. GraphRAG family: costs and evaluations vs. naive RAG

### Takeaway
Independent benchmarks show **GraphRAG does not reliably beat well-tuned vanilla RAG**: it loses on simple fact lookup, and wins mainly on multi-hop reasoning and corpus-wide summarization ("what themes run through my reading?"). Costs vary enormously: MS GraphRAG global search uses ~330k prompt tokens/query vs. ~900 for RAG. **HippoRAG 2** and **LazyGraphRAG** have the best quality/cost profiles; full MS GraphRAG is a poor fit for a free self-hosted app.

### Cited Findings
- GraphRAG-Bench ("When to use Graphs in RAG", ICLR 2026) found GraphRAG often underperforms vanilla RAG on real tasks; graph retrieval helps for complex reasoning and summarization, and plain RAG suffices for simple lookups — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3); [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10007992)
- GraphRAG-Bench accuracy, Novel dataset (fact / reasoning / summarize): RAG+rerank 60.92 / 42.93 / 51.30; **HippoRAG2 60.14 / 53.38 / 64.10**; MS-GraphRAG 49.29 / 50.93 / 64.40; LightRAG 58.62 / 49.07 / 48.85; Fast-GraphRAG 56.95 / 48.55 / 56.41; RAPTOR 49.25 / 38.59 / 47.10; LazyGraphRAG 51.65 / 49.22 / 58.29; HippoRAG 52.93 / 38.52 / 48.70 — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- Medical dataset: RAG+rerank 64.73 / 58.64 / 65.75; HippoRAG2 66.28 / 61.98 / 63.08; **MS-GraphRAG only 38.63 / 47.04 / 41.87**; LightRAG 63.32 / 61.32 / 63.14; LazyGraphRAG 60.25 / 47.82 / 57.28 — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- Average prompt tokens per query (Novel): vanilla RAG **879**, HippoRAG2 **1,008**, RAPTOR 3,441, Fast-GraphRAG 4,204, HippoRAG 7,208, MS-GraphRAG local **38,707**, LightRAG **100,832**, MS-GraphRAG global **331,375** — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v3)
- A prior study cited in GraphRAG-Bench: graph retrieval raised HotpotQA multi-hop accuracy by **4.5%** but increased latency **~2.3×** — [arXiv 2506.05690](https://arxiv.org/html/2506.05690v2)
- "RAG vs. GraphRAG: A Systematic Evaluation" (Han et al., arXiv 2502.11371; v3 Mar 2026): neither dominates; RAG better on single-hop/detail questions, GraphRAG better on multi-hop; for summarization RAG keeps detail, GraphRAG gives more multi-faceted output; proposes routing (Selection) and Integration hybrids — [arXiv 2502.11371](https://arxiv.org/html/2502.11371v2)
- LazyGraphRAG (Microsoft Research): indexing cost **identical to vector RAG and 0.1% of full GraphRAG**; at **4% of GraphRAG global-search query cost** it outperforms competing methods on local and global queries; comparable global-query quality to GraphRAG Global Search at **>700× lower query cost**; no up-front summarization; one "relevance test budget" knob; evaluated on 5,590 AP news articles — [Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag/) (vendor self-evaluation; independent GraphRAG-Bench results above are less favorable)
- HippoRAG 2 README: uses "significantly fewer resources for offline indexing" than GraphRAG, RAPTOR and LightRAG, stays cost/latency efficient online (no numbers given); supports OpenAI, any OpenAI-compatible endpoint (local vLLM), local Transformers; embedders include text-embedding-3-small, NV-Embed-v2, GritLM-7B — [HippoRAG README](https://raw.githubusercontent.com/OSU-NLP-Group/HippoRAG/main/README.md)
- Unverified secondary claims: HippoRAG (v1) indexing ~9M input tokens vs. ~115M for GraphRAG on the same corpus — [memoryplugin wiki](https://www.memoryplugin.com/wiki/knowledge-graphs.html); average F1 across 5 QA sets RAPTOR 65.6, GraphRAG 65.2, HippoRAG 63.8, HippoRAG2 78.2 — [wikidocs Korean guide](https://wikidocs.net/352217). **Not verified against arXiv 2502.14802; treat cautiously.**
- Dollar claims such as "$33,000 GraphRAG index" or "$1,544 per M tokens vs $1.45" appear only in Medium/dev.to posts — **unverified** — [Medium](https://medium.com/graph-praxis/the-graphrag-cost-cliff-how-33-000-became-33-in-eighteen-months-be1b0fbe37e4); [dev.to](https://dev.to/saurabh_naik_b213f3bbeafe/graphrag-vs-vector-rag-when-the-knowledge-graph-pays-for-itself-3386)

### Inferences
- An RSS reader's corpus is loosely structured news/essays — closest to GraphRAG-Bench's "Novel" or LazyGraphRAG's AP-news setting. Most assistant questions ("what did I read about X?") are lookups where hybrid RAG wins.
- Graph value for Elsewhere is mostly **exploration UI** (entity/topic links, clusters) and **corpus-level synthesis**, not QA accuracy. A cheap graph (embedding kNN edges + lightweight entity extraction, HippoRAG-2-style passage–entity graph with personalized PageRank) gives most of the benefit. LLM-written community summaries (MS GraphRAG) are too expensive for local hardware.
- Incremental updates matter for a feed reader: LazyGraphRAG-style (defer LLM work to query time) and HippoRAG-style (per-passage extraction, append) suit streaming ingestion better than MS GraphRAG's global community re-summarization.

### Gaps
- No verified indexing-cost numbers (tokens, $ or hours) for LightRAG, RAPTOR, KAG, nano-graphrag. KAG and nano-graphrag were not researched in this pass.
- Did not confirm HippoRAG 2 paper (arXiv 2502.14802) tables directly.

## 6. Graph databases for a lightweight knowledge graph (Neo4j, Kuzu, FalkorDB, SQLite, Postgres + AGE)

### Takeaway
**Kuzu is dead upstream**: archived 10 Oct 2025 at v0.11.3 and reportedly acquired by Apple. Do not build on it (community forks RyuGraph and LadybugDB exist). For a personal-scale graph, plain relational edge tables in SQLite/Postgres (with recursive CTEs or in-memory traversal via a graph library) avoid a second database entirely.

### Cited Findings
- Kuzu GitHub repo archived **10 Oct 2025**; v0.11.3 was the final release; repo note said "Kuzu is working on something new" — [The Register](https://www.theregister.com/2025/10/14/kuzudb_abandoned/); [OneUptime, Aug 2026](https://oneuptime.com/blog/post/2026-08-12-kuzu-archived-pin-0-11-3-fork-or-migrate/markdown)
- PyPI marks the `kuzu` project archived and no longer receiving updates — [PyPI kuzu](https://pypi.org/project/kuzu/)
- Apple acquired Kuzu, Inc. (reported Feb 2026, dated to around Oct 2025) — [MacDailyNews](https://macdailynews.com/2026/02/12/apple-acquires-graph-database-maker-kuzu)
- Forks: RyuGraph (Predictable Labs) and LadybugDB continue development — [RyuGraph blog](https://blog.ryugraph.io/posts/introducing-predictable-labs-and-ryugraph); [RyuGraph GitHub](https://github.com/predictable-labs/ryugraph)
- FalkorDB and ArcadeDB publish Kuzu migration guides, positioning themselves as maintained alternatives (vendor content) — [FalkorDB](https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/); [ArcadeDB](https://arcadedb.com/blog/from-kuzudb-to-arcadedb-migration-guide/)

### Inferences
- Embedded-graph-DB options are now thin and risky; a 10k–1M-node graph fits easily in relational tables (nodes, edges with type/weight) and can be loaded into memory for PageRank/community detection.

### Gaps
- Current licensing/status of Neo4j Community, FalkorDB (license terms), and Postgres Apache AGE activity was not verified in this pass.

## 7. Existing personal knowledge tools: architecture lessons

### Takeaway
Successful local tools use **embedded, file-based or single-file stores, local embedding models, and swappable API providers**. None reviewed here ran a heavy graph database.

### Cited Findings
- Reor: notes chunked and embedded into local **LanceDB**; uses Ollama/llama.cpp (node-llama-cpp) for LLMs and **Transformers.js** for embeddings; works over a plain markdown directory — [Reor README](https://cdn.jsdelivr.net/gh/reorproject/reor@main/README.md); [KDnuggets](https://www.kdnuggets.com/building-a-personal-knowledge-management-tool-with-reor)
- Obsidian Smart Connections: default local embedding model via Transformers.js (WASM/ONNX); embeds per block; stores vectors as files in a `.smart-env` folder rather than a vector DB; cosine similarity over cached embeddings; can switch to OpenAI/Cohere embeddings — [Smart Connections README](https://cdn.jsdelivr.net/gh/brianpetro/obsidian-smart-connections@main/README.md); [starlog analysis](https://starlog.pages.dev/articles/data-knowledge/brianpetro-obsidian-smart-connections) (third-party; code excerpts may be illustrative)
- One unverified Japanese review claims Smart Connections moved from GPLv3 to source-available in 2026 — [promptquorum](https://www.promptquorum.com/ja/power-local-llm/smart-connections-review)

### Inferences
- Pattern to copy: index on ingest in the background, keep embeddings in the app's own store, default to a small local embedder, and let users plug in an API key.

### Gaps
- Khoj (self-hosted; reportedly Postgres + pgvector), Mem, and Readwise Ghostreader architectures were not found in this pass. Reor's maintenance status in 2026 was not confirmed.

## 8. Local LLM feasibility for summarization/tagging/extraction; BYO-key

### Takeaway
On CPU-only consumer hardware, 4B-class Q4 models generate roughly **9–25 tok/s**, enough for background tagging/short summaries of a daily feed (a 150-token summary takes ~6–15 s plus prompt processing), but too slow for GraphRAG-scale entity extraction over a large backlog. GPU/Apple Silicon or a BYO API key is needed for heavy extraction.

### Cited Findings
- Stock llama.cpp CPU-only: **Qwen 3.5 4B Q4_K_M ~9.8 tok/s; Gemma 4 E4B ~8.6 tok/s** — [deemwar llama-cpu-benchmarks](https://deemwar-products.github.io/llama-cpu-benchmarks/article-engines)
- Estimated (not measured) CPU generation: i5-12400 + DDR4-3200 — Qwen 3.5 4B Q4_K_M ~15 tok/s, Gemma 4 E2B Q4 ~26 tok/s; i7-13700K ~23 tok/s for the 4B — [insiderllm CPU-only guide](https://insiderllm.com/guides/cpu-only-llms-what-actually-works/)
- CPU token generation is limited by **memory bandwidth**, not core count; 15–30 tok/s feels responsive — [insiderllm](https://insiderllm.com/guides/cpu-only-llms-what-actually-works/)
- HippoRAG 2 supports any OpenAI-compatible endpoint, i.e. the same code path can target Ollama/vLLM locally or a hosted API (BYO-key pattern) — [HippoRAG README](https://raw.githubusercontent.com/OSU-NLP-Group/HippoRAG/main/README.md)

### Inferences
- Rough throughput (arithmetic): at ~10 tok/s, 100 new articles/day × ~150 output tokens = ~25 min CPU/day for generation alone (prefill of ~2k-token articles adds significant time on CPU). Feasible as an overnight/background job; a backlog of 10k articles is not feasible on CPU (~40+ hours).
- Design: a single OpenAI-compatible client config (base_url + key + model) covers Ollama, llama.cpp server, vLLM, OpenRouter and vendor APIs, so BYO-key and fully local share one code path.
- Prefer embedding-only features (related articles, clustering, kNN graph) as the zero-LLM baseline; make LLM features (summaries, entity extraction, stance) optional enhancements.

### Gaps
- No verified quality comparisons (summarization/extraction accuracy) of small local models vs. API models; no prefill (prompt-processing) tok/s numbers for long articles on CPU; Gemma 3 4B / Qwen3 4B specific CPU numbers not found (sources cover newer Qwen 3.5 / Gemma 4 versions, which are themselves secondary-reported).
