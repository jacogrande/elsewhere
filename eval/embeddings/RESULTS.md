# Embedding eval — 2026-11-16

**Question:** which embedding model should power "related articles" (and later topic pages) in Elsewhere?

**Corpus:** 29 small-web feeds (`feeds.txt`) ingested with the app's own code; 456 articles with ≥150 words, max 40 per feed.
Each article is embedded whole (title + text, up to 16k chars ≈ 4k tokens).

**Tasks**

1. **Related reading (main metric):** 40 sampled articles (≤2 per feed). Each model's top 5 nearest articles from _other feeds_
   are pooled, shuffled and anonymised, then rated 0–3 by two judges (Claude Sonnet 5.5, Gemini 3.5 Flash).
   Score = mean rating of a model's top 5, averaged over judges. CIs are bootstrapped over queries.
2. **Halves (sanity check):** for 323 long articles, match the first half to its own second half among all second halves.

Absolute scores are low because a 456-article corpus often has nothing closely related in another feed; compare models, not absolutes.

## Results

Docs: 456 · half pairs: 323 · related queries: 40 (top 5, other feeds only)
Judges: anthropic/claude-sonnet-5.5, google/gemini-3.5-flash · agreement on 929 pairs: exact 65%, within 1 point 98%
Judge cost this run: $1.999

| Model                         | Related (0–3) | 95% CI    | claude-sonnet-5.5 | gemini-3.5-flash | Halves R@1 | Halves MRR | Dims | Embed cost |
| ----------------------------- | ------------- | --------- | ----------------- | ---------------- | ---------- | ---------- | ---- | ---------- |
| mongodb/voyage-4              | **1.32**      | 1.13–1.50 | 1.21              | 1.43             | 88.2%      | 0.918      | 1024 | $0.094     |
| cohere/embed-5-pro            | **1.32**      | 1.13–1.50 | 1.20              | 1.44             | 84.8%      | 0.892      | 2048 | $0.181     |
| mongodb/voyage-4-large        | **1.30**      | 1.11–1.47 | 1.22              | 1.38             | 87.6%      | 0.917      | 1024 | $0.187     |
| qwen/qwen3-embedding-8b       | **1.25**      | 1.08–1.42 | 1.17              | 1.33             | 83.0%      | 0.884      | 4096 | $0.017     |
| qwen/qwen3-embedding-4b       | **1.22**      | 1.03–1.42 | 1.14              | 1.30             | 82.7%      | 0.871      | 2560 | $0.031     |
| google/gemini-embedding-001   | **1.16**      | 0.96–1.37 | 1.09              | 1.24             | 90.4%      | 0.939      | 3072 | $0.237     |
| openai/text-embedding-3-large | **1.06**      | 0.88–1.26 | 0.95              | 1.17             | 87.3%      | 0.916      | 3072 | $0.201     |
| local:embeddinggemma-300m     | **1.01**      | 0.83–1.19 | 0.91              | 1.11             | 86.7%      | 0.912      | 768  | $0.000     |
| google/gemini-embedding-2     | **0.95**      | 0.82–1.09 | 0.88              | 1.02             | 92.3%      | 0.951      | 3072 | $0.316     |
| perplexity/pplx-embed-v1-4b   | **0.94**      | 0.76–1.11 | 0.81              | 1.06             | 86.7%      | 0.910      | 2560 | $0.047     |
| openai/text-embedding-3-small | **0.94**      | 0.76–1.12 | 0.88              | 0.99             | 83.9%      | 0.887      | 1536 | $0.031     |
| baai/bge-m3                   | **0.90**      | 0.74–1.06 | 0.81              | 0.99             | 79.6%      | 0.862      | 1024 | $0.018     |

Paired comparison against the top model (mongodb/voyage-4): share of queries where it scores higher / lower

- cohere/embed-5-pro: mean gap 0.00 (95% CI -0.07 to 0.07)
- mongodb/voyage-4-large: mean gap 0.02 (95% CI -0.03 to 0.07)
- qwen/qwen3-embedding-8b: mean gap 0.07 (95% CI -0.01 to 0.14)
- qwen/qwen3-embedding-4b: mean gap 0.10 (95% CI -0.02 to 0.21)
- google/gemini-embedding-001: mean gap 0.15 (95% CI 0.04 to 0.27)
- openai/text-embedding-3-large: mean gap 0.25 (95% CI 0.12 to 0.39)
- local:embeddinggemma-300m: mean gap 0.31 (95% CI 0.17 to 0.44)
- google/gemini-embedding-2: mean gap 0.37 (95% CI 0.22 to 0.50)
- perplexity/pplx-embed-v1-4b: mean gap 0.38 (95% CI 0.27 to 0.50)
- openai/text-embedding-3-small: mean gap 0.38 (95% CI 0.26 to 0.50)
- baai/bge-m3: mean gap 0.42 (95% CI 0.31 to 0.52)
