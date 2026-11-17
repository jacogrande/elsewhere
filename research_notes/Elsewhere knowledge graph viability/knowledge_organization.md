# Automatically Organizing Knowledge from a Corpus of Articles (for Elsewhere)

## Topic modeling and clustering: LDA vs. embedding-based vs. LLM-based; coherence, interpretability, streaming

### Takeaway
LLM-based topic generation (TopicGPT) beats LDA and BERTopic at matching human-assigned categories and gives readable labels. But it needs a strong model for the topic *generation* step, and it costs tens to hundreds of dollars per corpus with GPT-4-class APIs. Automated coherence metrics are unreliable proxies for human interpretability, so "BERTopic scores higher coherence" claims should be discounted. For a streaming corpus, BERTopic supports incremental use (`partial_fit`, `merge_models`), but topic IDs drift between runs.

### Cited Findings
- **Foundational interpretability result.** Chang et al. ("Reading Tea Leaves," NIPS 2009) introduced the word-intrusion and topic-intrusion human tasks. They found that models with better held-out perplexity often have *less* interpretable topics. — [Chang et al. 2009 PDF](https://home.cs.colorado.edu/~jbg/docs/nips2009-rtl.pdf)
- **Coherence metrics are unreliable.** Hoyle et al. (NeurIPS 2021) report a "validation gap": automated coherence was developed for classical models and has never been validated with humans for neural models. Automated evaluations declare a winning model when the corresponding human evaluations do not. They also find a "standardization gap" in benchmark practice. — [arXiv 2107.02173](https://arxiv.org/abs/2107.02173)
- **BERTopic paper.** Grootendorst (2022) evaluates BERTopic (embeddings, then UMAP, then HDBSCAN, then class-based TF-IDF) on 20 Newsgroups, BBC News, and Trump tweets using OCTIS, with NPMI coherence and topic diversity. BERTopic's coherence is competitive on well-preprocessed data, and its diversity is competitive but consistently below CTM. — [arXiv 2203.05794](https://arxiv.org/pdf/2203.05794)
- **TopicGPT (Pham et al., NAACL 2024): alignment with human ground truth (Table 1, harmonic purity / ARI / NMI).**
  - On the Wiki dataset (default k=31), TopicGPT scored 0.73 / 0.58 / 0.71. LDA scored 0.59 / 0.44 / 0.65, BERTopic 0.54 / 0.24 / 0.50 and SeededLDA 0.61 / 0.47 / 0.65.
  - On Bills (k=79), TopicGPT scored 0.57 / 0.42 / 0.52. LDA scored 0.39 / 0.21 / 0.47 and BERTopic 0.42 / 0.10 / 0.40.
  - BERTopic was the weakest baseline on ARI in every setting.
  - Source: [TopicGPT, ar5iv 2311.01449](https://ar5iv.labs.arxiv.org/html/2311.01449)
- **TopicGPT: human-judged misaligned topics.**
  - On Wiki: LDA 62.4%, TopicGPT unrefined 39.8%, TopicGPT refined 30.3%.
  - On Bills: LDA 80.2%, TopicGPT unrefined 70.1%, TopicGPT refined 31.9%.
  - Running the pipeline twice gives purity 0.95 and ARI 0.92, so it is fairly stable from run to run.
  - Source: [TopicGPT](https://ar5iv.labs.arxiv.org/html/2311.01449)
- **TopicGPT: costs and small-model feasibility.**
  - Total API cost was $88 for Bills and $155 for Wiki, using GPT-4 for generation and GPT-3.5-turbo for assignment.
  - Mistral-7B-Instruct for *assignment* lost about 6 points of purity versus GPT-3.5, but still beat the baselines.
  - For topic *generation*, Mistral-7B and GPT-3.5 produced 1,418 and 151 topics respectively, most of them overly specific. The authors recommend GPT-4-class models for generation.
  - The authors also note that Wiki may be in pretraining data, so these results may be a best case.
  - Source: [TopicGPT](https://ar5iv.labs.arxiv.org/html/2311.01449)
- **Other LLM topic-modeling evaluations.**
  - Mu et al. propose metrics for LLM-generated topics, such as coverage and factuality, compared against LDA and BERTopic. — [arXiv 2403.16248](https://arxiv.org/html/2403.16248v2)
  - Doi et al. give a comprehensive evaluation of LLMs for topic modeling. — [arXiv 2406.00697](https://arxiv.org/html/2406.00697v2)
  - A 2025 paper proposes a purpose-oriented framework with nine LLM-based metrics. — [arXiv 2509.07142](https://arxiv.org/abs/2509.07142)
- **Streaming with BERTopic.**
  - `partial_fit` supports online learning with incremental clustering and dimensionality reduction, but you cannot mix it with `fit`. — [BERTopic online docs (mirror)](https://huggingface.co/kisejin/TopicModelingRepo/blob/main/BERTopic/docs/getting_started/online/online.md)
  - Topic IDs and representations can shift between successive `partial_fit` runs. — [GitHub issue #946](https://github.com/MaartenGr/BERTopic/issues/946)
  - `merge_models` (v0.16+) lets you train a base model and repeatedly merge small models trained on new chunks, while keeping HDBSCAN/UMAP, which are not incremental. A `min_similarity` threshold controls whether a new topic is added. — [merge docs (mirror)](https://huggingface.co/kisejin/TopicModelingRepo/blob/main/BERTopic/docs/getting_started/merge/merge.md); [v0.16 post](https://newsletter.maartengrootendorst.com/p/bertopic-what-is-so-special-about)
- **Recent streaming and dynamic research.**
  - COBWEBTM: an incremental hierarchical topic model for streaming text (Findings of ACL 2026). — [ACL Anthology](https://aclanthology.org/2026.findings-acl.1753.pdf)
  - DTECT: a dynamic topic explorer with LLM labeling. — [arXiv 2507.07910](https://arxiv.org/pdf/2507.07910v2)
  - L-DNTM: an LLM-guided dynamic neural topic model (Findings of EACL 2026). — [ACL Anthology](https://preview.aclanthology.org/ingest-eacl/2026.findings-eacl.187.pdf)
  - Mini-batch online clustering of streaming text. — [arXiv 2502.09667](https://pdf.arxiv.org/pdf/2502.09667)

### Inferences
- A practical hybrid for Elsewhere:
  1. Use local embeddings plus clustering (BERTopic-style) for the cheap, incremental grouping.
  2. Use an LLM only to *label* clusters, and occasionally to consolidate them.
  
  This avoids paying a strong model per document and sidesteps the finding that small models are bad at topic generation but acceptable at assignment.
- Because topic IDs drift, the persistent user-facing structure should be stable label nodes or concepts that clusters map onto. Raw cluster IDs should not be what users see.
- A personal corpus is small: hundreds to low thousands of articles per user. That is smaller than typical topic-model benchmarks, which makes LDA-style statistics weaker and embeddings or LLMs comparatively stronger. This is an inference; I found no study on personal-scale corpora.

### Gaps
- I did not find Top2Vec numbers from a primary source that I could verify.
- I found no head-to-head benchmark of open-weight LLMs released in 2025–2026 (for example Llama 3.x, Qwen, Gemma) for topic *generation*.
- I found no evaluation of topic models on personal-scale reading histories (about 1k documents).

## Taxonomy/ontology approaches: controlled vocabularies, entity linking, Wikidata as a backbone, folksonomy vs. taxonomy

### Takeaway
Entity linking to Wikidata is mature and feasible locally:
- ReFinED reaches about 73% F1 end-to-end in an independent fair evaluation and covers far more entities than Wikipedia-based linkers.
- Lightweight offline linkers exist (spacy-entity-linker, about 70% accuracy, max-prior only).

Wikidata gives free canonical IDs, aliases, and a class hierarchy for deduplication. However, accuracy collapses on niche or domain text. Folksonomy research shows user tagging converges to stable distributions, which supports letting user tags coexist with automatic labels.

### Cited Findings
- **ReFinED (Ayoola et al., NAACL 2022).**
  - It does end-to-end entity linking to Wikidata in one forward pass, with about 15 times more candidate entities than Wikipedia-based linkers.
  - It is about 6 times faster than the BLINK bi-encoder, which scores about 9 F1 points lower.
  - It is about 60 times faster than the BLINK cross-encoder, and comes within 3 F1 points of it.
  - Source: [arXiv 2207.04108](https://arxiv.org/pdf/2207.04108)
- **Independent fair evaluation (Bast, Hertel & Prange 2023).** ReFinED had the best overall F1 at 73.3%, versus REL at 67.7%. GENRE and REL were the closest competitors. ReFinED is stronger at disambiguation than at mention recognition, while REL has very high recognition F1. — [arXiv 2305.14937](https://arxiv.org/pdf/2305.14937)
- **Domain shift failure.** On operations-and-maintenance text, BLINK and ReFinED scored F1 of about 0.1. ReFinED's AIDA model found only 8 entities. — [arXiv 2507.22935](https://arxiv.org/pdf/2507.22935)
- **spacy-entity-linker.**
  - It links to Wikidata offline using a preprocessed local SQLite knowledge base, a download of about 1.3 GB (older versions about 500 MB).
  - Disambiguation is max-prior only, with no use of context.
  - The author reports about 70% accuracy on Wikipedia link texts.
  - The author labels it "experimental, not for production."
  - Source: [GitHub egerber/spaCy-entity-linker](https://github.com/egerber/spaCy-entity-linker); [PyPI](https://pypi.org/project/spacy-entity-linker)
- **Folksonomy research.** Golder & Huberman (2006) studied Del.icio.us. They found regularities in user activity, tag frequencies, and kinds of tags, plus "a remarkable stability in the relative proportions of tags within a given URL," which they model as arising from imitation and shared knowledge. — [Golder & Huberman, J. Inf. Sci. 32(2)](https://collablab.northwestern.edu/CollabolabDistro/nucmc/GolderAndHuberman-usage%20patterns%20collab%20tagging.pdf)

### Inferences
- Wikidata QIDs are a good *backbone for named entities* (people, organizations, products, places, well-known concepts). They give Elsewhere free deduplication: "GPT-4" and "OpenAI's GPT-4" map to one QID. They also give a ready-made "subclass of / instance of" hierarchy for grouping.
- Wikidata covers abstract or emerging *topics* in blog posts poorly. Examples: "local-first software" or a newly coined term. Those need free-form, LLM-generated concept nodes alongside the QID-linked ones.
- A layered design is suggested by the evidence: Wikidata-linked entities, plus emergent cluster/LLM topics, plus optional user tags (the folksonomy layer).

### Gaps
- I did not retrieve evaluations of LLM-based entity linking to Wikidata.
- I did not retrieve the size or format of the REL and ReFinED models for local deployment.
- I did not retrieve studies of SKOS, Library of Congress Subject Headings (LCSH), or DBpedia categories used for automatic article classification.
- I found no source on Pinboard tagging, on Wikipedia category graph quality, or on cycles and noise in the Wikidata class hierarchy.
- No study evaluated Wikidata specifically as the backbone of a *personal* knowledge graph.

## Automatic knowledge-graph construction from text: OpenIE, LLM triple extraction, entity resolution, precision/recall

### Takeaway
LLM extraction plus an explicit entity/relation resolution step works far better than OpenIE or raw GraphRAG extraction, and is cheap with flash-tier models. KGGen reports:
- 66% of facts recoverable from the graph on its MINE benchmark, versus 48% for GraphRAG and 30% for OpenIE.
- About $0.84 to process 1M characters.

Zero-shot LLM relation extraction against a fixed schema is still weak; GPT-4 scored about 31 micro-F1 on DuIE2.0. Deduplication remains the central unsolved quality problem.

### Cited Findings
- **KGGen MINE-1 design.** The benchmark is 100 articles of about 592 words with 15 facts each. An LLM judge decides whether each fact is inferable from the retrieved subgraph. On 60 validation pairs the judge showed 90.2% agreement with humans (r=0.80). — [KGGen arXiv 2502.09956v2](https://arxiv.org/html/2502.09956v2)
- **KGGen MINE-1 results.**
  - Overall: KGGen 66.07%, GraphRAG 47.80%, OpenIE 29.84%.
  - KGGen by model: Claude Sonnet 3.5 73%, GPT-4o 66%, Gemini 2.0 Flash 44%.
  - Source: [KGGen](https://arxiv.org/html/2502.09956v2)
- **KGGen triple validity.** In 100 random triples per system, KGGen had 98/100 valid, OpenIE 55/100, and GraphRAG 0/100 (as judged by the paper's own criteria). — [KGGen](https://arxiv.org/html/2502.09956v2)
- **KGGen caveats.**
  - On MINE-2 (WikiQA-based RAG, 20,400 questions), KGGen and GraphRAG "perform comparably."
  - The v2 abstract is more modest than v1's claim of an "18% improvement."
  - The paper is internally inconsistent in places, for example two different GraphRAG timing figures.
  - Source: [KGGen v2](https://arxiv.org/html/2502.09956v2); [v1](https://arxiv.org/html/2502.09956v1)
- **KGGen entity resolution method.**
  1. Embed items with S-BERT and cluster them with k-means into clusters of 128.
  2. For each item, retrieve its top 16 neighbors using fused BM25 and embeddings.
  3. An LLM picks duplicates and a canonical alias.
  4. Repeat until each cluster is empty.

  On 1M characters this reduced entities from 4,602 to 3,573 (22.4% fewer) and edges by 23%. GraphRAG had 966 relation types for 981 edges, meaning almost no relation reuse. Limitations listed: over- or under-merging, domain knowledge gaps, and tests only up to about 5M tokens. — [KGGen](https://arxiv.org/html/2502.09956v2)
- **Zero-shot relation extraction.** Zhu et al. (2023) found zero-shot GPT-4 reached micro-F1 31.03 on DuIE2.0, versus 10.3 for ChatGPT. Both were well below fine-tuned supervised models. The authors conclude LLMs are "better inference assistants than few-shot information extractors." Caveat: experiments were run through the ChatGPT Plus UI. — [arXiv 2305.13168](https://arxiv.org/pdf/2305.13168); [summary](https://medium.com/@jack16900/llms-for-knowledge-graph-construction-and-reasoning-41cc5308f8c8)
- **Surveys.** A 2025 survey frames LLM-based KG construction as ontology engineering, then extraction, then fusion. Fusion (alignment, disambiguation, deduplication) is costly at scale, and semantic drift and schema evolution remain open problems. — [arXiv 2510.20345](https://arxiv.org/html/2510.20345v1)
- **GraphRAG's pipeline.** An LLM extracts and describes entities and relationships, summarizes every observation of each, then builds hierarchical communities. This index-time LLM work is what makes it expensive. — [Microsoft Research LazyGraphRAG blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag/)

### Inferences
- For Elsewhere, schema-free extraction plus KGGen-style resolution plus Wikidata linking where possible is the evidence-backed path. Fixed-schema relation extraction is not.
- Unconstrained LLM extraction produces relation-label explosion (GraphRAG's 966 types for 981 edges). It needs canonicalization, or a small fixed set of relations such as "mentions," "argues," and "related-to."
- MINE measures fact retention on short, clean, LLM-generated articles. Real blog posts are longer and messier, so the 66% is likely an upper bound. This is an inference.

### Gaps
- I found no independent replication of KGGen's MINE numbers.
- I found no direct precision/recall measurement of hallucinated triples in LLM KG extraction.
- I did not retrieve iText2KG evaluations.

## Concept-level vs. document-level graphs: what granularity is useful for exploration

### Takeaway
The evidence base is thin. The strongest signal comes from Microsoft's LazyGraphRAG:
- A cheap *concept co-occurrence graph* (noun phrases, no LLM at index time) with hierarchical communities matched full GraphRAG on global-question answering.
- Its indexing cost was 0.1% of GraphRAG's.

This suggests a concept graph over documents can be built cheaply. Claim-level graphs are expensive and mostly evaluated for QA, not for human exploration.

### Cited Findings
- **LazyGraphRAG indexing.** Indexing uses NLP noun-phrase extraction for concepts and their co-occurrences, then graph statistics and hierarchical communities. Indexing cost is "identical to vector RAG and 0.1% of the costs of full GraphRAG." — [Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag/)
- **LazyGraphRAG results.** It was tested on 5,590 AP news articles with 100 synthetic queries (50 local, 50 global), judged by LLM pairwise comparison.
  - It matched GraphRAG Global Search quality at "more than 700 times lower query cost."
  - At 4% of GraphRAG's query cost, it outperformed all competing methods.
  - Source: [Microsoft Research blog](https://www.microsoft.com/en-us/research/blog/lazygraphrag/)
- **KGGen MINE-2.** Here the graph's value is measured as retrieval support for QA, not human browsing. — [KGGen](https://arxiv.org/html/2502.09956v2)

### Inferences
- For a reader UI, a two-level design seems best:
  - Concept nodes (Wikidata entities plus emergent topics) link to the documents that discuss them. This is a bipartite or co-occurrence graph.
  - Claim- or triple-level detail is generated lazily, on demand, for a selected concept.
  
  This mirrors LazyGraphRAG's "defer LLM work to query time" economics.

### Gaps
- I found no user study comparing document-level and concept-level graphs for exploratory reading or browsing.
- Every graph quality evaluation I found is QA-oriented, with LLM judges. None measures human navigation.

## Hierarchical/emergent organization: taxonomy induction, RAPTOR-like trees, LLM cluster labeling

### Takeaway
Two LLM techniques are validated for building hierarchy:
- Recursive clustering plus summarization (RAPTOR): +20 points absolute on QuALITY with GPT-4.
- LLM-generated, iteratively refined taxonomies distilled into cheap classifiers (TnT-LLM).

Both fit a pattern of "embed, cluster, LLM labels and summarizes, cheap model assigns."

### Cited Findings
- **RAPTOR (Sarthi et al., ICLR 2024).**
  - It embeds chunks, reduces them with UMAP, then soft-clusters with GMM, choosing the cluster count by BIC.
  - It summarizes each cluster with gpt-3.5-turbo and recurses to build a tree.
  - A "collapsed tree" retrieval generally beats tree traversal.
  - With GPT-4 it improved the best QuALITY score by 20 points absolute.
  - Source: [ICLR 2024 poster](https://iclr.cc/virtual/2024/poster/19034); [abstract mirror](https://aitopics.org/doc/arxivorg:CEFF279A); method details from a secondary summary: [themoonlight review](https://www.themoonlight.io/review/raptor-recursive-abstractive-processing-for-tree-organized-retrieval)
- **TnT-LLM (Wan et al., Microsoft, KDD 2024).**
  - Phase 1: zero-shot, multi-stage LLM reasoning generates and iteratively refines a label taxonomy.
  - Phase 2: LLM labels train lightweight classifiers for assigning labels at scale.
  - Applied to Bing Copilot intent and domain labeling. It reports more accurate and relevant taxonomies than baselines, using human, automatic, and LLM evaluation.
  - Source: [Microsoft Research](https://www.microsoft.com/en-us/research/publication/tnt-llm-text-mining-at-scale-with-large-language-models/)
- **TopicGPT's hierarchy.** TopicGPT's refinement step, which merges near-duplicate topics and removes rare ones, cut the misaligned-topic rate on Bills from 70.1% to 31.9%. Automatic consolidation passes are high-value. — [TopicGPT](https://ar5iv.labs.arxiv.org/html/2311.01449)
- **Incremental hierarchical topic model.** COBWEBTM handles streaming text without batch retraining. — [ACL 2026 Findings](https://aclanthology.org/2026.findings-acl.1753.pdf)

### Inferences
- Elsewhere can build a navigable topic tree per user with these steps:
  1. Embed each article on ingest (local).
  2. Periodically re-cluster recursively (UMAP+GMM or HDBSCAN).
  3. Have an LLM name and describe each node, and merge near-duplicates (the TopicGPT refinement step).
  4. Assign new articles with embeddings or a small classifier between re-clusterings (the TnT-LLM distillation idea).

### Gaps
- I did not retrieve TnT-LLM's numeric accuracy figures.
- I found no evaluation of RAPTOR trees as a *browsing* structure, only as retrieval.
- I did not cover classic taxonomy-induction benchmarks such as TaxoGen or SemEval taxonomy tasks.

## Practical costs: per-article LLM extraction cost and local-model feasibility

### Takeaway
LLM extraction per article is now cheap with flash-tier APIs: KGGen spent about $0.84 per 1M characters, roughly $0.004 per typical article. Full GraphRAG-style indexing is orders of magnitude more expensive, and the dollar figures that circulate for it are poorly sourced. Small local models are viable for embeddings, entity linking, and topic *assignment*. They are weaker for open-ended topic *generation* and lose quality in extraction.

### Cited Findings
- **KGGen cost on a 1M-character corpus.**
  - Extraction: 2.22M tokens, $0.46, 273 s.
  - Resolution: 3.15M tokens, $0.38, 279 s.
  - Total: 5.37M tokens, $0.84, 551 s, using Gemini 2.0 Flash via DSPy.
  - GraphRAG extraction on the same text took about 2,079 s.
  - Note that resolution costs as much as extraction.
  - Source: [KGGen](https://arxiv.org/html/2502.09956v2)
- **Model choice matters a lot.** The same KGGen pipeline scored 44% on MINE with Gemini 2.0 Flash and 73% with Claude Sonnet 3.5. — [KGGen](https://arxiv.org/html/2502.09956v2)
- **GraphRAG versus vector RAG cost.**
  - Microsoft says LazyGraphRAG indexing costs 0.1% of full GraphRAG. — [Microsoft Research](https://www.microsoft.com/en-us/research/blog/lazygraphrag/)
  - Secondary posts claim about $1,544 per million tokens for GraphRAG versus about $1.45 for vector RAG, and "$33,000 vs $33" for a 5 GB corpus. I could not verify these against primary sources. — [DEV Community](https://dev.to/saurabh_naik_b213f3bbeafe/graphrag-vs-vector-rag-when-the-knowledge-graph-pays-for-itself-3386); [Medium](https://medium.com/graph-praxis/the-graphrag-cost-cliff-how-33-000-became-33-in-eighteen-months-be1b0fbe37e4)
- **TopicGPT corpus cost.** $88–$155 per dataset run with GPT-4 plus GPT-3.5. Mistral-7B is viable for assignment (about 6 points of purity lost) but not for generation. — [TopicGPT](https://ar5iv.labs.arxiv.org/html/2311.01449)
- **SciPhi Triplex.**
  - A 3.8B-parameter Phi-3 fine-tune for KG triple extraction that runs locally (Ollama, llama.cpp, vLLM).
  - SciPhi claims a 98% cost reduction and that it beats few-shot GPT-4 at 1/60th the cost. These claims are vendor-only and not independently verified.
  - License is CC-BY-NC-SA-4.0 (non-commercial).
  - Sources: [featherless listing](https://featherless.ai/models/SciPhi/Triplex); [SciPhi write-up](https://owencolegrove.substack.com/p/triplex-a-sota-llm-for-knowledge)
- **Local entity linking.** spacy-entity-linker runs fully offline with a Wikidata SQLite file of about 1.3 GB. — [GitHub](https://github.com/egerber/spaCy-entity-linker)
- **Other cost reduction.** TERAG (2025) reports 89–97% fewer output tokens than other graph-RAG methods. — [arXiv 2509.18667](https://arxiv.org/html/2509.18667v1)

### Inferences
- **Per-article cost (my arithmetic, not a measured figure).** A 5,000-character article is 1/200 of 1M characters, so at KGGen's rate it costs about $0.0042 per article including resolution. A heavy reader at 50 articles/day would spend about $0.20/day, or about $6/month, on flash-tier APIs. This is fine for "bring your own key" but is not free.
- **Fully free self-hosted tier.** Combine:
  - local sentence embeddings (e.g., MiniLM, as used by KGGen's retrieval),
  - noun-phrase / co-occurrence concepts (the LazyGraphRAG approach),
  - an offline Wikidata linker,
  - optional small local LLM labeling of clusters (a few calls per cluster rather than per article).
- Note the license constraint on Triplex for any commercial fork. Elsewhere being open source and possibly CC-NC-incompatible should be checked.

### Gaps
- I found no rigorous, independent benchmark of 3–8B open models, such as Qwen or Llama 3.x, on KG extraction quality versus GPT-4o or Claude.
- I found no tokens/second or hardware requirements for running extraction locally on consumer machines.
- I found no production engineering write-ups from small teams building knowledge graphs over RSS or blog corpora.
