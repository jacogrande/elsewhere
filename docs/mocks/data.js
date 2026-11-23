/*
 * Shared mock universe for the Elsewhere strategy mocks. Every writer, blog, article and quote here is fictional.
 * Load with <script src="data.js"></script>; exposes window.ELSEWHERE.
 * "Today" in the mocks is Tuesday 17 November 2026.
 */
(() => {
  const TODAY = "2026-11-17";

  // Writers and their blogs. `subscribed`: in the reader's feed list. `cluster`: rough home territory.
  const writers = [
    { id: "mara", name: "Mara Okafor", blog: "Slow Systems", cluster: "systems", subscribed: true, bio: "Distributed systems engineer writing about failure, queues and boring reliability." },
    { id: "tobias", name: "Tobias Lind", blog: "Offline First", cluster: "local-first", subscribed: true, bio: "Builds sync engines. Thinks the cloud should be a peer, not a parent." },
    { id: "ines", name: "Inès Varga", blog: "The Margin", cluster: "design", subscribed: true, bio: "Interface designer. Essays on density, hierarchy and calm software." },
    { id: "devi", name: "Devi Raman", blog: "Second Order", cluster: "economics", subscribed: true, bio: "Economist turned product person. Incentives, markets and attention." },
    { id: "jun", name: "Jun Takeda", blog: "Small Tools", cluster: "local-first", subscribed: true, bio: "Writes single-file apps and argues for software that fits in your head." },
    { id: "hollis", name: "Hollis Grant", blog: "Field Notes on Learning", cluster: "learning", subscribed: true, bio: "Former teacher. Memory, practice and how people actually get good." },
    { id: "ade", name: "Adebayo Cole", blog: "Latency Budget", cluster: "systems", subscribed: true, bio: "Performance engineer. Tail latency is a product decision." },
    { id: "rosa", name: "Rosa Lindqvist", blog: "Common Ground", cluster: "economics", subscribed: true, bio: "Writes about commons, cooperatives and who owns the internet." },
    { id: "priya", name: "Priya Shah", blog: "Dense Matter", cluster: "design", subscribed: false, bio: "Data-visualisation designer who thinks most dashboards should be tables." },
    { id: "elliot", name: "Elliot Park", blog: "Queue Theory for Humans", cluster: "systems", subscribed: false, bio: "Operations researcher explaining queues with coffee shops and hospitals." },
    { id: "nadia", name: "Nadia Brooks", blog: "Attention Economy Watch", cluster: "economics", subscribed: false, bio: "Tech critic. Engagement metrics, dark patterns, and what we could measure instead." },
    { id: "felix", name: "Felix Moreau", blog: "Spaced", cluster: "learning", subscribed: false, bio: "Builds flashcard tools. Writes about retrieval practice outside school." },
    { id: "kaito", name: "Kaito Mori", blog: "CRDT Diaries", cluster: "local-first", subscribed: false, bio: "Researcher working on merge semantics for rich text." },
    { id: "lena", name: "Lena Fischer", blog: "Bridges", cluster: "design", subscribed: false, bio: "Writes where interface design meets learning science. Bridges design and learning." },
  ];

  // Concept nodes. `known`: 0–1, how well the reader knows it (from finished + starred reading, decayed).
  const concepts = [
    { id: "queues", label: "Queueing theory", cluster: "systems", known: 0.85 },
    { id: "littles-law", label: "Little's law", cluster: "systems", known: 0.25 },
    { id: "backpressure", label: "Backpressure", cluster: "systems", known: 0.6 },
    { id: "tail-latency", label: "Tail latency", cluster: "systems", known: 0.7 },
    { id: "retries", label: "Retries & idempotency", cluster: "systems", known: 0.8 },
    { id: "load-shedding", label: "Load shedding", cluster: "systems", known: 0.15 },
    { id: "local-first", label: "Local-first software", cluster: "local-first", known: 0.9 },
    { id: "crdts", label: "CRDTs", cluster: "local-first", known: 0.55 },
    { id: "sync", label: "Sync engines", cluster: "local-first", known: 0.65 },
    { id: "rich-text-merge", label: "Rich-text merging", cluster: "local-first", known: 0.05 },
    { id: "single-file", label: "Single-file apps", cluster: "local-first", known: 0.5 },
    { id: "density", label: "Information density", cluster: "design", known: 0.75 },
    { id: "hierarchy", label: "Visual hierarchy", cluster: "design", known: 0.7 },
    { id: "calm-tech", label: "Calm technology", cluster: "design", known: 0.45 },
    { id: "tables", label: "Tables over charts", cluster: "design", known: 0.1 },
    { id: "incentives", label: "Incentive design", cluster: "economics", known: 0.4 },
    { id: "attention", label: "Attention economy", cluster: "economics", known: 0.55 },
    { id: "commons", label: "Digital commons", cluster: "economics", known: 0.2 },
    { id: "goodhart", label: "Goodhart's law", cluster: "economics", known: 0.35 },
    { id: "retrieval", label: "Retrieval practice", cluster: "learning", known: 0.3 },
    { id: "spacing", label: "Spaced repetition", cluster: "learning", known: 0.4 },
    { id: "desirable-difficulty", label: "Desirable difficulty", cluster: "learning", known: 0.05 },
    { id: "curiosity", label: "Curiosity & information gaps", cluster: "learning", known: 0.2 },
  ];

  const clusters = [
    { id: "systems", label: "Systems & reliability" },
    { id: "local-first", label: "Local-first & small software" },
    { id: "design", label: "Interface design" },
    { id: "economics", label: "Incentives & the internet" },
    { id: "learning", label: "Learning & memory" },
  ];

  // Articles. state: "unread" | "finished" | "starred" | "skipped". minutes: reading time.
  // stance: optional { issue, side, quote } — a fictional quote-backed position.
  // links: ids of other articles this one links to. questions: open questions it raises.
  const articles = [
    { id: "a1", writer: "mara", title: "Your queue is a promise you can't keep", date: "2026-11-16", minutes: 11, concepts: ["queues", "backpressure", "load-shedding"], state: "unread",
      summary: "Unbounded queues hide overload until it's a crisis. Bound them, and decide up front what you'll drop.",
      stance: { issue: "unbounded-queues", side: "against", quote: "An unbounded queue is not a buffer. It's a loan against your latency, and the interest compounds." },
      links: ["a10", "a2"], questions: ["What's the right default bound when you have no traffic data?"] },
    { id: "a2", writer: "ade", title: "p99 is a product decision", date: "2026-11-14", minutes: 9, concepts: ["tail-latency", "queues"], state: "finished",
      summary: "Tail latency is where users actually live. Choosing a percentile target is choosing which users to disappoint.",
      links: ["a1"], questions: ["Should latency budgets be set by product managers rather than engineers?"] },
    { id: "a3", writer: "elliot", title: "Little's law, explained with a coffee shop", date: "2026-10-30", minutes: 8, concepts: ["littles-law", "queues"], state: "unread",
      summary: "L = λW. Three numbers, one counter, and why the line gets long all at once.", links: [], questions: [] },
    { id: "a4", writer: "elliot", title: "Why hospitals run at 85%", date: "2026-09-12", minutes: 14, concepts: ["queues", "littles-law", "load-shedding"], state: "unread",
      summary: "Utilisation above ~85% makes waits explode. Hospitals learned it the hard way; servers forget it every quarter.",
      stance: { issue: "unbounded-queues", side: "for-slack", quote: "Slack isn't waste. Slack is the only thing standing between a busy afternoon and a four-hour wait." },
      links: ["a3"], questions: ["Is there an equivalent of 'surge capacity' for software teams, not just servers?"] },
    { id: "a5", writer: "mara", title: "Retries are a distributed denial of service you wrote yourself", date: "2026-08-03", minutes: 10, concepts: ["retries", "backpressure"], state: "starred",
      summary: "Retry storms turn a blip into an outage. Budgets, jitter and circuit breakers, in that order.", links: ["a2"], questions: [] },
    { id: "a6", writer: "ade", title: "Shed load early, shed it honestly", date: "2026-10-21", minutes: 7, concepts: ["load-shedding", "backpressure", "tail-latency"], state: "unread",
      summary: "Reject at the door with a clear error rather than time out in the kitchen.",
      stance: { issue: "unbounded-queues", side: "against", quote: "A fast no is a kindness. A slow yes that becomes a timeout is a lie." },
      links: ["a1", "a4"], questions: ["How do you shed load fairly between paying and free users?"] },

    { id: "a10", writer: "tobias", title: "The cloud should be a peer, not a parent", date: "2026-11-15", minutes: 13, concepts: ["local-first", "sync", "crdts"], state: "unread",
      summary: "If your app stops working when the server does, the server owns your users' work. Local-first flips that.",
      stance: { issue: "server-authority", side: "local", quote: "Every spinner in your app is a confession that the server, not the user, owns the document." },
      links: ["a11", "a13"], questions: ["Who resolves conflicts when two peers disagree and neither is the authority?"] },
    { id: "a11", writer: "kaito", title: "Merging rich text is harder than you think", date: "2026-11-02", minutes: 18, concepts: ["crdts", "rich-text-merge"], state: "unread",
      summary: "Bold over a deleted range, overlapping links, split paragraphs: a tour of the cases that break naive CRDTs.",
      links: ["a10"], questions: ["Is there a merge semantics for formatting that users find intuitive?"] },
    { id: "a12", writer: "jun", title: "An app is a file", date: "2026-10-18", minutes: 6, concepts: ["single-file", "local-first"], state: "starred",
      summary: "One HTML file, no build, no server. What you lose is smaller than you think.", links: ["a10"], questions: [] },
    { id: "a13", writer: "tobias", title: "Sync engines are databases in denial", date: "2026-09-28", minutes: 12, concepts: ["sync", "crdts", "retries"], state: "finished",
      summary: "Every sync engine eventually reinvents a write-ahead log, idempotent operations and backpressure.",
      links: ["a5"], questions: ["Should sync engines expose their log to applications?"] },
    { id: "a14", writer: "jun", title: "In defence of the server", date: "2026-11-10", minutes: 9, concepts: ["local-first", "sync"], state: "unread",
      summary: "Local-first is lovely until you need permissions, search across users or a single source of truth for money.",
      stance: { issue: "server-authority", side: "server", quote: "Some facts have to live in one place. Your bank balance is not a CRDT." },
      links: ["a10"], questions: ["Which kinds of data genuinely need a single authority?"] },

    { id: "a20", writer: "ines", title: "Density is a form of respect", date: "2026-11-12", minutes: 10, concepts: ["density", "hierarchy"], state: "finished",
      summary: "Experts want more on screen, not less. Whitespace-as-default treats every user like a first-time visitor.",
      stance: { issue: "density", side: "dense", quote: "Every click you add to protect a novice is a tax you charge the expert forever." },
      links: ["a21", "a22"], questions: ["How do you design for density without overwhelming newcomers?"] },
    { id: "a21", writer: "priya", title: "Most dashboards should be tables", date: "2026-10-27", minutes: 8, concepts: ["tables", "density"], state: "unread",
      summary: "A chart answers one question. A sorted table answers twenty, and people already know how to read it.",
      links: ["a20"], questions: ["When does a chart genuinely beat a table?"] },
    { id: "a22", writer: "ines", title: "Against the hierarchy of everything", date: "2026-07-19", minutes: 9, concepts: ["hierarchy", "calm-tech"], state: "starred",
      summary: "When everything is ranked by visual weight, nothing is calm. Flat can be a feature.",
      stance: { issue: "hierarchy", side: "flatter", quote: "Strict hierarchy is a shout. Most interfaces should speak at a normal volume." },
      links: [], questions: ["Can a flat interface still guide attention?"] },
    { id: "a23", writer: "lena", title: "What flashcard apps get wrong about interfaces", date: "2026-11-08", minutes: 11, concepts: ["spacing", "calm-tech", "desirable-difficulty", "hierarchy"], state: "unread",
      summary: "Making recall smooth makes it useless. Good learning interfaces add the right friction in the right place.",
      stance: { issue: "hierarchy", side: "stricter", quote: "A learner needs one obvious next thing. Hierarchy is how you give it to them." },
      links: ["a30", "a22"], questions: ["Where should a learning interface deliberately add friction?"] },
    { id: "a24", writer: "ines", title: "Calm software doesn't notify", date: "2026-09-05", minutes: 7, concepts: ["calm-tech", "attention"], state: "finished",
      summary: "If your app needs a badge to be opened, it isn't useful enough yet.", links: ["a42"], questions: [] },
    { id: "a25", writer: "priya", title: "Sparse is not simple", date: "2026-08-22", minutes: 9, concepts: ["density", "hierarchy"], state: "unread",
      summary: "Removing information doesn't remove complexity; it moves it into the user's head.",
      stance: { issue: "density", side: "dense", quote: "Every hidden detail is a question the user now has to ask out loud." },
      links: ["a20"], questions: [] },
    { id: "a26", writer: "jun", title: "Whitespace is load-bearing", date: "2026-11-05", minutes: 6, concepts: ["density", "calm-tech"], state: "unread",
      summary: "A rebuttal: density is great for experts at desks, and miserable on a phone at a bus stop.",
      stance: { issue: "density", side: "sparse", quote: "Respect for the expert shouldn't become contempt for the tired." },
      links: ["a20"], questions: ["Should density adapt to context rather than to the user?"] },

    { id: "a30", writer: "hollis", title: "Forgetting is the point", date: "2026-11-13", minutes: 12, concepts: ["spacing", "retrieval", "desirable-difficulty"], state: "unread",
      summary: "Memories strengthen when you retrieve them just as they're slipping. Ease is the enemy of learning.",
      links: ["a31"], questions: ["How long should you wait before reviewing something you've just learned?"] },
    { id: "a31", writer: "felix", title: "Retrieval practice for adults who hate flashcards", date: "2026-10-09", minutes: 10, concepts: ["retrieval", "spacing"], state: "unread",
      summary: "Writing a three-line summary from memory beats rereading, and you don't need an app.",
      links: ["a30"], questions: ["Does summarising from memory work as well as answering questions?"] },
    { id: "a32", writer: "hollis", title: "Curiosity is a gap, not a mood", date: "2026-09-30", minutes: 9, concepts: ["curiosity", "retrieval"], state: "starred",
      summary: "We get curious when we know enough to notice what we don't. Teach the edges, not the centre.",
      links: [], questions: ["Can a reading tool deliberately create productive information gaps?"] },
    { id: "a33", writer: "hollis", title: "The difficulty sweet spot", date: "2026-08-14", minutes: 8, concepts: ["desirable-difficulty", "curiosity"], state: "finished",
      summary: "Too easy and you coast; too hard and you quit. About 85% success is where learning is fastest.",
      links: ["a4"], questions: [] },

    { id: "a40", writer: "devi", title: "Goodhart ate your engagement metric", date: "2026-11-11", minutes: 10, concepts: ["goodhart", "attention", "incentives"], state: "unread",
      summary: "Time-in-app was a fine signal until it became the target. Then it measured compulsion.",
      stance: { issue: "engagement-metrics", side: "against", quote: "The moment you pay a team to raise a number, the number stops telling you the truth." },
      links: ["a41", "a42"], questions: ["What would a reading app measure instead of time spent?"] },
    { id: "a41", writer: "nadia", title: "Infinite scroll was a choice", date: "2026-10-24", minutes: 12, concepts: ["attention", "incentives"], state: "unread",
      summary: "A short history of the feed that never ends, and the internal debates that lost.",
      stance: { issue: "engagement-metrics", side: "against", quote: "Nobody ever finished the internet. That was the design goal." },
      links: ["a40"], questions: ["Would people pay for a feed that ends?"] },
    { id: "a42", writer: "devi", title: "In praise of the metric", date: "2026-09-18", minutes: 8, concepts: ["incentives", "goodhart"], state: "finished",
      summary: "Metrics get blamed for bad goals. Measured honestly and rotated often, engagement tells you real things.",
      stance: { issue: "engagement-metrics", side: "for", quote: "A metric you're afraid of is still better than a vibe you can't check." },
      links: [], questions: [] },
    { id: "a43", writer: "rosa", title: "Who owns the feed?", date: "2026-11-09", minutes: 14, concepts: ["commons", "attention", "incentives"], state: "unread",
      summary: "RSS is a commons that survived because nobody could monetise it. What would it take to grow it?",
      links: ["a41", "a12"], questions: ["Can a commons fund the people who maintain it?"] },
    { id: "a44", writer: "rosa", title: "Cooperatives for software", date: "2026-07-02", minutes: 11, concepts: ["commons", "incentives"], state: "starred",
      summary: "Platform co-ops in practice: what worked, what didn't, and why governance is the product.",
      links: [], questions: [] },
    { id: "a45", writer: "nadia", title: "What we could measure instead", date: "2026-08-29", minutes: 9, concepts: ["attention", "goodhart", "curiosity"], state: "unread",
      summary: "Finished articles, return visits a week later, and 'did you learn something?' as metrics that resist gaming.",
      links: ["a40", "a32"], questions: [] },
  ];

  // The reader's history: events used by learning-based mocks (bandit, map, Return to…).
  const history = [
    { article: "a44", event: "starred", date: "2026-07-03" },
    { article: "a22", event: "starred", date: "2026-07-20" },
    { article: "a5", event: "starred", date: "2026-08-04" },
    { article: "a33", event: "finished", date: "2026-08-15" },
    { article: "a24", event: "finished", date: "2026-09-06" },
    { article: "a42", event: "finished", date: "2026-09-19" },
    { article: "a13", event: "finished", date: "2026-09-29" },
    { article: "a32", event: "starred", date: "2026-10-01" },
    { article: "a12", event: "starred", date: "2026-10-19" },
    { article: "a20", event: "finished", date: "2026-11-12" },
    { article: "a2", event: "finished", date: "2026-11-14" },
  ];

  // Candidate sources ("arms") with prior outcomes for the reader: shown → finished/starred vs skipped.
  const strategies = [
    { id: "neighbours", label: "Embedding neighbours", reach: "near", shown: 120, wins: 46 },
    { id: "same-author", label: "Same author", reach: "near", shown: 60, wins: 27 },
    { id: "concept-bridge", label: "Concept bridges", reach: "middle", shown: 48, wins: 21 },
    { id: "co-citation", label: "Links & co-citation", reach: "middle", shown: 22, wins: 11 },
    { id: "ppr", label: "Personalised PageRank", reach: "middle", shown: 35, wins: 15 },
    { id: "contrast", label: "Stance contrast", reach: "far", shown: 18, wins: 9 },
    { id: "frontier", label: "Frontier picks", reach: "far", shown: 30, wins: 17 },
    { id: "wildcard", label: "Wildcards", reach: "far", shown: 25, wins: 5 },
    { id: "archive", label: "Archive resurfacing", reach: "anywhere", shown: 20, wins: 9 },
  ];

  // Issues for debate cards / stance contrast.
  const issues = [
    { id: "unbounded-queues", question: "Should queues be bounded by default?", sides: { against: "Bound them", "for-slack": "Keep slack instead" } },
    { id: "server-authority", question: "Should the server be the source of truth?", sides: { local: "No: the device is", server: "Yes, for some data" } },
    { id: "density", question: "Should interfaces be denser?", sides: { dense: "Denser", sparse: "Sparser" } },
    { id: "hierarchy", question: "Should interfaces have strict visual hierarchy?", sides: { flatter: "Flatter", stricter: "Stricter" } },
    { id: "engagement-metrics", question: "Are engagement metrics worth optimising?", sides: { against: "No", for: "Yes, carefully" } },
  ];

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const W = byId(writers);
  const C = byId(concepts);
  const A = byId(articles);

  /** Share of an article's concepts the reader already knows (known ≥ 0.5). */
  const familiarity = (a) => a.concepts.filter((c) => (C[c]?.known ?? 0) >= 0.5).length / a.concepts.length;
  /** Frontier score: peaks when an article is about half familiar (Berlyne's inverted U), 0–1. */
  const frontier = (a) => {
    const f = familiarity(a);
    return 4 * f * (1 - f);
  };
  /** The concepts an article would teach the reader (known < 0.5). */
  const newConcepts = (a) => a.concepts.filter((c) => (C[c]?.known ?? 0) < 0.5);
  const daysAgo = (date) => Math.round((Date.parse(TODAY) - Date.parse(date)) / 86_400_000);

  window.ELSEWHERE = {
    TODAY, writers, concepts, clusters, articles, history, strategies, issues,
    writer: (id) => W[id], concept: (id) => C[id], article: (id) => A[id],
    familiarity, frontier, newConcepts, daysAgo,
  };
})();
