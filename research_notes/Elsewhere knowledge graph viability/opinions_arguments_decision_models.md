# Representing, Extracting and Relating Opinions, Positions and Arguments in Blogs/Essays (for "Elsewhere")

Research date: 2026-11-16. Note on method: about 17 search/fetch calls. Several foundational references (Toulmin, IBIS, AIF, Dung) were cited from their canonical DOIs/records without being fetched in this session; they are marked "(canonical ref, not fetched)". Benchmark numbers come from the papers or search snippets named, and are not directly comparable across papers (different metrics, prompts, splits).

## 1. Argument mining on long-form, informal text: state of the art and LLM accuracy

### Takeaway
LLMs (including small, fine-tuned open models such as Llama-3-8B) now match or beat earlier state of the art on standard argument-mining benchmarks. But the headline numbers mostly assume the argument components are already segmented (gold spans), and the corpora are short and formulaic (student persuasive essays, RCT abstracts). End-to-end extraction from real blogs, with implicit claims, rhetoric and long context, is still an open problem with no good benchmark.

### Cited Findings
- The main 2025 survey, "Large Language Models in Argument Mining: A Survey" (Li, Schlegel, Sun, Batista-Navarro, Nenadic; arXiv 2506.16383, revised to v6 in Nov 2025, covering literature to Sept 2025), covers claim/evidence detection, relation prediction, stance, quality and summarisation. It names long-context argumentative reasoning, interpretability and annotation bottlenecks as open challenges, and flags circular evaluation when LLMs both annotate and judge. — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6)
- From the same survey:
  - Systems miss claims conveyed through presupposition, metaphor or narrative framing, and benchmarks under-represent these (Sec. 4.1.5).
  - Chain-of-thought prompting improved recall but "roughly doubled the rate of subtle hallucinations" (Li et al. 2024b, ASE corpus).
  - GPT-4 sufficiency scores ran several points higher when GPT-4 was also the evaluator, which shows evaluation circularity.
  — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6)
- Human agreement is itself limited (IAM corpus, Cheng et al. 2022, as reported in the survey): Krippendorff α = .79 for component spans, .63 for stance and .57 for evidence links. This puts a ceiling on how "correct" any extraction can be judged. — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6)
- Cabessa, Hernault & Mushtaq, "Argument Mining with Fine-Tuned Large Language Models" (COLING 2025), fine-tuned Llama-3/3.1, Gemma-2, Mistral, Phi-3 and Qwen-2 (mostly 4-bit 7–9B models) on the PE (402 persuasive essays), AbstRCT and CDCP (731 consumer-debt user comments) datasets. Macro-F1 results:
  - **PE:** the previous SOTA (Liu et al. 2023) was ACC 89.2 / ARI 82.7 / ARC 81.0. Llama-3-8B scored 89.5 / 83.0 / 89.6, and Llama-3.1-8B (4-bit) reached ARC 95.9.
  - **CDCP (informal user comments):** the previous SOTA (Bao et al. 2021) was ACC 82.5 / ARI 67.8. Llama-3.1-8B (4-bit) scored ACC 87.3 / ARI 72.3 / ARC 80.4.
  - **Important caveat:** the input text has the argument components already delimited with `<AC1>…</AC1>` tags, so these are classification-given-gold-spans results, not end-to-end extraction. The authors also needed "hallucination guardrails" to filter malformed outputs, and joint multi-task modelling hurt individual-task performance.
  — [ACL Anthology 2025.coling-main.442](https://aclanthology.org/2025.coling-main.442.pdf)
- An earlier Cabessa et al. (2024) study found that GPT-4 with a few in-context examples was "very competitive" on essay argument-type classification, and a fine-tuned GPT-3.5 reached SOTA. — [arXiv 2406.06699](https://arxiv.org/abs/2406.06699v1)
- On online comments, a fine-tuned Llama 3 reached macro-F1 0.76 on binary argument detection, beating prompted LLMs and RoBERTa (0.61). This points to messy web text being much harder than essays. — [Moonlight review of "LLMs for argument mining … in online comments"](https://www.themoonlight.io/review/llms-for-argument-mining-detection-extraction-and-relationship-classification-of-pre-defined-arguments-in-online-comments)
- ArgBench (Ajjour, Quensel, Lipka, Wachsmuth; arXiv 2604.17366, April 2026) unifies 33 datasets and 46 computational-argumentation tasks across 5 LLM families. Per its search snippet, "even with fine-tuning on the target, certain basic computational argumentation tasks remain a challenge for LLMs" (the abstract page gives no numbers). — [arXiv 2604.17366](https://arxiv.org/abs/2604.17366); [PDF](https://arxiv.org/pdf/2604.17366)
- Relation (support/attack) prediction on debate-platform data is a much easier, high-accuracy setting:
  - KIALO-PRIME: 5,687 Kialo discussion graphs with 1,088,801 support/attack/neutral relations. Relation classifiers reached F1 ≈ .90 within discussions and ≈ .91 across discussions.
  - ADBL2: a fine-tuned Mistral-7B reports 90.59% F1 for relation-based argument mining across domains.
  — [IOS Press FAIA (Kialo-Prime)](https://ebooks.iospress.nl/pdf/doi/10.3233/FAIA241026); [Assisted Debate Builder, arXiv 2405.13015](https://ar5iv.labs.arxiv.org/html/2405.13015)

### Inferences
- For Elsewhere, the realistic pipeline is an LLM-prompted extraction of a few (3–7) **main claims/theses per post**, each with a short paraphrase and a supporting quote span, rather than full Stab-and-Gurevych-style premise/claim graphs. Full graphs are expensive, less reliable on informal prose, and not what users need for "find related positions".
- Pairwise relation classification (support/attack/unrelated) between two already-extracted claims is the most reliable link in the chain (about 0.9 F1 on Kialo-style data). Claim segmentation and implicit-claim recovery from blogs is the weakest link.
- Requiring a verbatim quote span for each extracted claim is a cheap guardrail: claims without a matching span get dropped. This mirrors the "hallucination guardrails" used in the COLING paper.

### Gaps
- I found no benchmark for end-to-end argument mining on blog posts or long-form essays by professional writers (as opposed to student essays) with modern LLMs.
- I did not retrieve ArgBench's per-task numbers, so I cannot say which tasks remain hardest.
- I found no published numbers for zero-shot frontier models (GPT-4o/5, Claude, Gemini) on end-to-end PE extraction.

## 2. Stance detection: target-specific, zero-shot/open-target, and cross-document

### Takeaway
Zero-shot LLM stance detection (favor/against/neutral toward a stated target) is roughly on par with fine-tuned BERT-era systems: about 63–72 F1 on VAST, and fine-tuning adds several more points. Accuracy is good enough to rank candidates, but not to assert an author's position without showing evidence. Implicit stance and cross-target generalisation remain the named hard problems.

### Cited Findings
- Benchmarks:
  - SemEval-2016 (tweets, 6 targets).
  - P-Stance: 21,574 political tweets about Trump, Biden and Sanders.
  - VAST: many targets, with a zero-shot split.
  — [ChatGPT CoT stance paper, arXiv 2304.03087](https://arxiv.org/pdf/2304.03087)
- On VAST zero-shot targets:
  - Zero-shot Llama 3.1 scored 63.03 and Mistral 67.09.
  - Fine-tuning raised Llama 3.1 to 72.81.
  - "LLMs perform better when fine-tuned … than zero- and few-shot settings."
  — [arXiv 2405.11637](https://arxiv.org/pdf/2405.11637)
- Zero-shot GPT-3.5 reached 71.2 overall on VAST, beating the BERT-based models compared, including Stanceformer. Llama-2-7b-chat zero-shot managed only 39.0, so smaller and older open models are much weaker. — [Stanceformer, arXiv 2410.07083](https://arxiv.org/pdf/2410.07083)
- Zero-shot FlanT5-XXL prompting "can match or outperform state-of-the-art methods, including fine-tuned models" on SemEval-2016 and P-Stance. — [ar5iv 2309.13734 / related](https://ar5iv.labs.arxiv.org/html/2309.13734) (search-snippet attribution; the original paper is not fully verified)
- Survey: Pangtey et al., "Large Language Models Meet Stance Detection" (arXiv 2505.08464, May 2025, revised Jan 2026).
  - Taxonomy of target relationships: in-target, cross-target and multi-target.
  - Compares more than 30 benchmark datasets.
  - Names implicit stance expression, cultural bias and compute cost as the key challenges.
  - It did not surface an explicit "open-target" category in what I retrieved.
  — [arXiv 2505.08464](https://arxiv.org/abs/2505.08464)
- An interpretable zero-shot approach (IRIS, arXiv 2511.03635) evaluates on VAST and EZ-STANCE and tests generalisation to P-Stance. — [arXiv 2511.03635](https://arxiv.org/pdf/2511.03635)

### Inferences
- **Open-target design for Elsewhere:**
  1. An LLM extracts (issue/target, stance, claim text) from each post. The target is free text such as "strict visual hierarchy in UI design".
  2. Targets are normalised by embedding and clustering them into canonical "issues".
  3. Stance is re-scored pairwise against the canonical issue phrasing.
  This turns cross-document stance comparison into a series of target-specific stance checks, which is the setting where LLM numbers are known.
- Long, nuanced essays often take conditional or mixed positions ("hierarchy matters, but not in the way Gestalt theorists claim"). A ternary favor/against/neutral scheme is too coarse. The model should allow "mixed/qualified" plus a one-line paraphrase of the qualification.
- Benchmark numbers are almost all on tweets. Blog-length stance should be easier in signal but harder in nuance. That is an unmeasured trade-off.

### Gaps
- I found no benchmark for stance detection on long-form blog posts or essays with LLMs.
- I found no head-to-head 2025–2026 frontier-model results on VAST or P-Stance in the retrieved sources.

## 3. Claim clustering, claim matching, perspective discovery and contrasting-view retrieval

### Takeaway
There is a mature line of research for exactly the "similar/contrasting" operations Elsewhere wants: Key Point Analysis (cluster many arguments into salient points with prevalence), Perspectrum (diverse perspectives on a claim), and counter-argument retrieval ("same aspects, opposite stance"). The classic counter-argument retrieval baseline gets about 60% top-1 accuracy among about 8 candidates, and modern LLM pipelines (Touché 2025 RAD) generate stance-directed queries.

### Cited Findings
- **Key Point Analysis (IBM).** KPA condenses many comments into a short list of key points, each with a prevalence count of matched comments. IBM reports more than 6 million comments analysed with Debater's KPA. — [IBM Research blog](https://research.ibm.com/blog/kpa-for-opinion-text)
- **ArgKP-2021 shared task.**
  - Data: about 27,520 argument/key-point pairs over 31 controversial topics; 22 models from 17 teams; two subtasks (key point matching and key point generation).
  - Top matching systems with pre-trained LMs: Team Enigma reached post-evaluation mAP 0.921 strict / 0.982 relaxed, and the 4th-place system reached 0.8956 / 0.9632.
  — [Overview, arXiv 2110.10577](https://arxiv.org/pdf/2110.10577); [Dataset, arXiv 2110.12370](https://arxiv.org/pdf/2110.12370); [Enigma, ACL Anthology](https://preview.aclanthology.org/setup/2021.argmining-1.21); [Phan et al.](https://preview.aclanthology.org/moar-dois/2021.argmining-1.17)
- The 2025 AM survey warns that LLM-generated key points can be hallucinated or overly generic. It also reports that annotator-refined key-point clusters (SurveyKP, Eden et al. 2023) were purer than crowd-only ones at about half the labour. — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6)
- **Project Debater.**
  - Slonim et al., "An autonomous debating system," Nature 591:379–384 (March 2021). It describes a four-module architecture and was evaluated against expert human debaters.
  - Many capabilities were released as APIs (EMNLP 2021 demo "Project Debater APIs"), free for academic use on request.
  — [Nature DOI](https://doi.org/10.1038/s41586-021-03215-w); [arXiv 2110.01029](https://arxiv.org/pdf/2110.01029.pdf)
- **Perspectrum** (Chen et al., NAACL 2019) defines "substantiated perspective discovery": finding a diverse set of well-supported perspectives for a claim. The data has 1k claims, about 10k perspective sentences and 8k evidence paragraphs. A 2026 successor, PERSPECTRA (ICLR 2026), notes that Perspectrum's scalability was limited by human validation, and builds a scalable pluralist benchmark from arguments. — [ACL N19-1053](https://aclanthology.org/N19-1053/); [PERSPECTRA, arXiv 2602.08716](https://arxiv.org/pdf/2602.08716v1)
- **Counter-argument retrieval** (Wachsmuth, Syed & Stein, ACL 2018).
  - Hypothesis: "the best counterargument [invokes] the same aspects as the argument while having the opposite stance".
  - Data: idebate.org pairs.
  - Results: about 60% top-1 accuracy among an average of 7.6 opposing candidates, and about one-third when ranking against all 2,801 test candidates.
  — [ACL Anthology P18-1023](https://aclanthology.org/P18-1023/)
- **Touché 2025 Retrieval-Augmented Debating (CLEF).** One participant pipeline has the LLM generate up to three queries, each specifying the target idea and whether it intends to support or refute it, then retrieves via Elasticsearch. — [CEUR Vol-4038 paper 390](https://ceur-ws.org/Vol-4038/paper_390.pdf)
- PerSphere (2024) is a benchmark for multi-faceted perspective retrieval and summarisation. — [Moonlight review of PerSphere](https://www.themoonlight.io/review/persphere-a-comprehensive-framework-for-multi-faceted-perspective-retrieval-and-summarization); [arXiv 2412.12588](https://web3.arxiv.org/pdf/2412.12588)

### Inferences
- Wachsmuth's "same aspects + opposite stance" is a ready-made, citable operational definition of **contrasting**. Its inverse, "same aspects + same stance", gives **similar**.
- KPA-style clustering of extracted claims across the user's whole feed gives the canonical "issue/position nodes" the graph needs. Prevalence counts give a "how common is this position" signal for free.
- An LLM "stance-directed query generation" step (Touché RAD style) is a simple way to look for contrasting sources outside the user's existing feeds, for example via web search.

### Gaps
- I did not retrieve official Touché 2025 RAD leaderboard numbers.
- I found no LLM-era results on ArgKP-2021 in the retrieved sources.

## 4. Argument and deliberation representation models: which suits a position-mapping reader?

### Takeaway
For a reader that maps authors' positions across documents, a lightweight IBIS-like schema (Issue → Position → Argument pro/con) is the best fit, essentially the Kialo/bipolar-argumentation tree. Use AIF only as an interchange format. Toulmin is too fine-grained to extract reliably from blogs, and Dung-style formal semantics are overkill unless you want to compute "which positions survive attack". Polis and Community Notes are not argument models: they are opinion-clustering and bridging algorithms over agree/disagree votes. They are useful if Elsewhere ever has reader votes, but they do not extract positions from text.

### Cited Findings
- **Kialo.** Discussions are bipolar argument trees: a root thesis, with child claims labelled pro (support) or con (attack). Large corpora exist (KIALO-PRIME: 5,687 graphs, about 1.09M relations), and support/attack classifiers reach about 0.90 F1. — [IOS Press FAIA (Kialo-Prime)](https://ebooks.iospress.nl/pdf/doi/10.3233/FAIA241026); [ADBL2, arXiv 2405.13015](https://ar5iv.labs.arxiv.org/html/2405.13015); [Gorur et al., "Can LLMs perform relation-based argument mining?", COLING 2025](https://aclanthology.org/2025.coling-main.569.pdf)
- **Polis.**
  - Small, Bjorkegren, Erkkilä, Shaw & Megill (2021), RECERCA 26(2).
  - An open-source system where participants submit short statements and vote agree/disagree/pass.
  - It reduces dimensions of the vote matrix (PCA) and clusters participants into opinion groups, and its model of the opinion landscape decides the order in which comments are shown.
  - The detail on clustering at K=2–5 chosen by silhouette comes from secondary notes and is unverified.
  — [RECERCA](https://www.e-revistes.uji.es/index.php/recerca/article/view/5516); [PDF mirror](https://Www.Gwern.net/doc/sociology/2021-small.pdf)
- **Community Notes (Birdwatch) bridging algorithm.**
  - Matrix factorisation over rater × note ratings. It learns rater "viewpoint" factors jointly with note intercepts, so notes are surfaced only when rated helpful across viewpoints.
  - Known weaknesses: an ICML 2026 paper reports that up to 10.7% of lower-quality notes could be pushed above threshold with fewer than 10 coordinated ratings, and a 2026 paper argues that a single polarity axis is insufficient ("two fault lines").
  — [Birdwatch paper, arXiv 2210.15723](https://arxiv.org/abs/2210.15723); [Rescuing Counterspeech (bridging), arXiv 2410.12699](https://arxiv.org/pdf/2410.12699); [Gaming Consensus, ICML 2026](https://icml.cc/virtual/2026/poster/64544); [Two Fault Lines, arXiv 2609.21496](https://arxiv.org/pdf/2609.21496)
- **IBIS** (Kunz & Rittel 1970, "Issues as Elements of Information Systems"). Its nodes are Issues (questions), Positions (answers) and Arguments (pro/con on positions), and it was later implemented in gIBIS and Compendium. — (canonical ref, not fetched: Kunz & Rittel 1970, Working Paper No. 131, Institute of Urban and Regional Development, UC Berkeley; no URL verified this session)
- **AIF** (Argument Interchange Format; Chesñevar et al. 2006, Knowledge Engineering Review). A graph ontology with I-nodes (information/claims) and S-nodes (inference RA, conflict CA, preference PA). It is used by the AIFdb/ARG-tech (Dundee) tooling. — (canonical ref, not fetched: [DOI 10.1017/S0269888906001044](https://doi.org/10.1017/S0269888906001044)); a Dundee AM tooling paper appears in [Dundee discovery, FAIA 388](https://discovery.dundee.ac.uk/ws/files/145044735/FAIA-388-FAIA240324.pdf)
- **Dung's abstract argumentation** (AIJ 1995). Arguments are nodes with only an attack relation, and semantics (grounded, preferred, stable) determine acceptable sets. Bipolar argumentation frameworks (Cayrol & Lagasquie-Schiex 2005) add a support relation. — (canonical ref, not fetched: [DOI 10.1016/0004-3702(94)00041-X](https://doi.org/10.1016/0004-3702(94)00041-X))
- **Toulmin model** (1958). Claim, data/grounds, warrant, backing, qualifier and rebuttal. Warrants are usually implicit, which matches the "implicit claims" failure mode noted in the 2025 AM survey. — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6) for the implicit-claim difficulty; Toulmin itself is a canonical ref, not fetched.

### Inferences
- **Recommended schema** for Elsewhere (IBIS + bipolar):
  - `Issue` (a canonicalised question, e.g., "Should UI hierarchy be strictly enforced?")
  - `Position` (an author's stance on that issue, with stance polarity and qualifier)
  - `Claim` (a supporting/attacking reason, with a quote span)
  - edges: `supports` / `attacks` / `same_issue` / `related_issue`
  - every Position is linked to `Author` and `Post`

  Kialo's success shows that non-experts understand this shape. It maps directly onto the "similar/contrasting/tangential" UI.
- Store it as a property graph or plain SQLite tables. Export to AIF JSON only if interoperability with ARG-tech tools is wanted.
- Polis/Community-Notes-style matrix factorisation could later be applied to the *reader's* own agree/disagree reactions to positions, to discover the reader's "opinion axes". That is an optional, later feature.

### Gaps
- I found no study comparing these representation models for consumer reading or recommendation use.
- The IBIS/AIF/Dung/Toulmin details were not freshly fetched this session.

## 5. "Can we use decision models like 'Jev'?": identifying Jev

### Takeaway
The most likely match, with moderately high confidence, is **Jev, a "decision model" by TypeSafe**, released in early access on 15 September 2026. Instead of prose, it returns typed, probability-scored judgments (yes/no "noul", choice, score) about supplied state. It is not an argumentation or deliberation theory. It is an inference API that could serve as a cheap, fast classifier inside Elsewhere's pipeline, for example "does post A's position contradict post B's?" (choice: agree/contradict/unrelated/unknown). It is closed and hosted, which matters for an open-source project, and I found no independent accuracy or calibration benchmarks.

### Cited Findings
- **API (AI/ML API docs).**
  - TypeSafe's Jev is a "System One" decision model that "returns typed answers (yes/no, choice, score, box) with calibrated probabilities."
  - Endpoint: `/v1/decisions`, with a `state` (string/object/array) and `questions`.
  - Question types:
    - `noul`: probability that a yes/no proposition is true.
    - `choice`: one key from `criteria`, with probabilities that sum to 1.
    - `score`: an ordered 2–10 level scale.
    - `box`: experimental image bounding box.
  - Context: 262,144 tokens.
  - Versions: `typesafe/jev` floats to Jev 1.14, and `jev-1.14` / `jev-1.13` can be pinned.
  - The docs call confidence "calibrated" but give no benchmark figures.
  — [AI/ML API docs](https://docs.aimlapi.com/api-references/decision-models/typesafe/jev)
- **Independent review (wavect.io, dated 11 Nov 2026).**
  - Jev is TypeSafe's first public decision model, in early access since 15 Sep 2026, with v1.14.0 released 14 Oct 2026.
  - Questions are evaluated independently and in parallel against the same state.
  - Latency and cost claims (70–500 ms; USD 0.042 per 1M input tokens) are vendor-sourced.
  - TypeSafe's evaluation harness uses model-generated reference labels and "is not an independent audit".
  - Listed limitations: literal readings, sensitivity to option order, non-determinism, prompt injection via untrusted text in state, and the need for "unknown"/human-review routes. In the review's words, "Typed is not correct" and "Confidence is not authorization."
  - The review mentions founder Diogo Almeida as an RLHF/InstructGPT co-inventor (claim from the review, not independently verified here).
  — [wavect.io review](https://wavect.io/blog/jev-ai-decision-model-review/)
- **Other listings.** It also appears in Vercel AI Gateway, Eden AI and Mixpeek, and in third-party articles on "Choice, Score & Truth judgment interfaces". These look like aggregator or SEO-style content and were not fetched. — [Vercel AI Gateway](https://vercel.com/ai-gateway/models/jev.md); [Eden AI](https://www.edenai.co/docs/v3/llms/decisions); [Mixpeek](https://mixpeek.com/docs/processing/jev.md); [gitconnected article](https://levelup.gitconnected.com/where-jev-fits-in-high-stakes-decision-systems-dc9ae549a26b)
- **Pricing conflict.** The wavect review quotes USD 0.042 per 1M input tokens (vendor figure). The AI/ML API docs show a credit-based example (406 input + 73 output tokens = 45 credits, about $0.0000225). These are not reconcilable from the sources. — [wavect](https://wavect.io/blog/jev-ai-decision-model-review/); [AI/ML API](https://docs.aimlapi.com/api-references/decision-models/typesafe/jev)
- I found no argumentation, decision-theory or deliberation framework in the academic literature named "Jev" or "JEV". The search for "Jev decision making model framework" returned only the TypeSafe product. — [search results above; e.g., besthub.dev article](https://www.besthub.dev/articles/jev-decision-model-extracting-structured-judgments-from-llms-for-code-driven-routing-044d92bc4bf4)

### Inferences
- If the user meant TypeSafe Jev, it fits well as the **pairwise relation judge**: given two extracted positions, ask `choice: {same_position, opposing_position, related_issue, unrelated, unknown}` plus a `score` for relatedness. Cheap, fast, typed probabilities suit ranking many candidate pairs.
- Caveats for using it in Elsewhere:
  - It is closed and hosted, which is awkward for an open-source, self-hostable reader. Keep it as one pluggable backend behind an interface; a local LLM with constrained JSON output can play the same role.
  - The review's warnings apply directly: randomise option order, include "unknown", and benchmark on Elsewhere's own labelled pairs.
- If the user meant something else, the closest well-known decision/argument models are IBIS, Toulmin, Kialo pro/con trees, bipolar/Dung frameworks, Polis and Community Notes bridging (Section 4), and decision matrices / multi-criteria decision analysis (not researched here). Jevons (the Jevons paradox) is an economics concept, not a decision model; I found no evidence the user meant it.

### Gaps
- I found no primary TypeSafe website or paper; the evidence is API-aggregator docs plus one review.
- I found no independent accuracy or calibration benchmark for Jev.
- I could not confirm that the user means TypeSafe Jev. It should be confirmed with them.

## 6. Operationalising "similar / contrasting / tangential"

### Takeaway
There is a principled, research-backed operationalisation:
- **Similar** = same issue + same stance.
- **Contrasting** = same issue (same aspects) + opposite stance, following Wachsmuth et al. 2018.
- **Tangential** = a different but related issue, via issue/concept-graph adjacency, or the same aspects under a different issue.

Each step decomposes into tasks with known LLM accuracy (issue clustering, stance, pairwise relation), which makes the feature feasible, provided the uncertainty is surfaced to the user.

### Cited Findings
- "Same aspects, opposite stance" as the definition of the best counterargument, with about 60% top-1 accuracy among about 8 opposing candidates using only word/embedding similarity (pre-LLM). — [ACL P18-1023](https://aclanthology.org/P18-1023/)
- Ternary support/attack/neither relation prediction between argument pairs is an established LLM task (Gorur et al., COLING 2025), and fine-tuned 7B models reach about 0.90 F1 on Kialo-style data. — [COLING 2025.coling-main.569](https://aclanthology.org/2025.coling-main.569.pdf); [ADBL2](https://ar5iv.labs.arxiv.org/html/2405.13015)
- KPA gives a tested way to cluster many arguments into canonical points (mAP above 0.9 for matching). — [arXiv 2110.10577](https://arxiv.org/pdf/2110.10577)
- Perspective discovery (Perspectrum, PERSPECTRA) and multi-faceted perspective retrieval (PerSphere) address "diverse viewpoints on a claim". — [N19-1053](https://aclanthology.org/N19-1053/); [arXiv 2602.08716](https://arxiv.org/pdf/2602.08716v1); [arXiv 2412.12588](https://web3.arxiv.org/pdf/2412.12588)
- The stance survey's in-target / cross-target / multi-target distinction corresponds to similar/contrasting (in-target) versus tangential (cross-target). — [arXiv 2505.08464](https://arxiv.org/abs/2505.08464)

### Inferences
- **Proposed pipeline** (feasible for a small OSS team):
  1. Per post, an LLM extracts ≤7 positions as {issue phrase, stance (pro/con/mixed), one-sentence paraphrase, verbatim quote}, and the quote is verified by string match.
  2. Embed the issue phrases and cluster them incrementally into canonical Issues (KPA-like), and let an LLM name each cluster.
  3. Candidate generation: run a nearest-neighbour search on the issue embedding.
  4. Classify each candidate pair with an LLM, or a Jev-like judge, into same_position / opposing / related_issue / unrelated / unknown.
  5. Tangential: issues linked via a concept/topic graph (co-occurrence, shared entities) or classified "related_issue", plus a novelty bonus.
  6. Optional: for contrasting views outside the corpus, generate stance-directed web-search queries (Touché RAD style).
- Evaluate on a small hand-labelled set (for example 200 position pairs from real feeds), measuring per-class precision. Contrasting precision matters most, because a false "this author disagrees" is the most damaging error.

### Gaps
- I found no deployed consumer reader or recommender that implements similar/contrasting/tangential over extracted positions, and no benchmark for "tangential".

## 7. Risks: sycophancy, hallucination, misattribution of positions, and evaluation

### Takeaway
The main risk is **misrepresentation**: LLMs over-generalise claims, flatten disagreement toward the majority view, and drift toward an intended perspective. Chain-of-thought can increase subtle hallucinations, and LLM-as-judge evaluation is circular. Mitigations are quote grounding, abstention ("unknown/mixed"), separating extraction from judgment, and a small human-labelled evaluation set.

### Cited Findings
- GPT-3.5 opinion summaries scored highly with humans, yet showed over-generalised claims and misrepresented viewpoints that standard metrics missed. The authors propose dedicated metrics for these failures. — [ar5iv 2211.15914](https://ar5iv.labs.arxiv.org/html/2211.15914)
- LLM summarisers "implicitly smooth disagreement and over-represent majority opinions". ACCSYNTH separates belief aggregation from generation and evaluates Polarity & Stance Fidelity and Contrast Preservation. — [arXiv 2601.04889](https://arxiv.org/html/2601.04889v1)
- PoliSum (2024) found that models struggle with faithfulness to the intended perspective when summarising opinionated political documents. — [arXiv 2411.04093](https://arxiv.org/html/2411.04093v1)
- For perspective summarisation, reranking-based approaches gave the best coverage and faithfulness, and preference tuning on reranked outputs helped further. — [arXiv 2506.15925](https://www.arxiv.org/pdf/2506.15925)
- LFOSum checks opinion faithfulness by extracting aspect-sentiment-opinion triplets from both source and output and comparing them. — [arXiv 2410.13037](https://arxiv.org/pdf/2410.13037)
- A multi-agent debate with initial stances for faithfulness evaluation finds more errors than other LLM-based judges. — [arXiv 2502.08514](https://arxiv.org/pdf/2502.08514)
- Chain-of-thought roughly doubled subtle hallucinations in one AM study. GPT-4 judging GPT-4 inflated scores, and an LLM judge (ConQRet) penalised rhetorical questions more than humans do. — [arXiv 2506.16383](https://arxiv.org/html/2506.16383v6)
- TypeSafe Jev review: "Typed is not correct", output is non-deterministic, and untrusted text in the state can influence decisions (prompt injection). This is directly relevant because blog content is untrusted input. — [wavect.io](https://wavect.io/blog/jev-ai-decision-model-review/)

### Inferences
- **Product rules:**
  - Never show an attributed position without its verbatim quote and a link.
  - Label positions as "Elsewhere's reading", not "the author believes".
  - Allow "mixed/unclear" and user correction (thumbs up/down on the attribution), and feed corrections into the eval set.
- Sycophancy risk: if the assistant knows the user "likes" a position, it may bias similar/contrasting judgments toward what pleases the user. Run relation classification without user-preference context in the prompt.
- Evaluation: a human-labelled gold set for extraction faithfulness and pair relations; measure contrasting-precision and attribution error rate; avoid using the same model as extractor and judge.

### Gaps
- I found no study measuring LLM misattribution rates specifically for blog authors' positions.
- I did not find direct sycophancy studies on stance or relation classification; this risk is inferred from general LLM-judge findings.
