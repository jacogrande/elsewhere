import { describe, expect, test } from "bun:test";
import { verifiedPoints, verifyQuote } from "./points";

describe("verifyQuote", () => {
  const article =
    "Hierarchy matters.  But “strict” hierarchy\nkills exploration — sometimes. The rest is detail.";

  test("accepts an exact quote", () => {
    expect(verifyQuote(article, "Hierarchy matters.  But “strict” hierarchy")).toBe(true);
  });

  test("ignores case, whitespace, smart quotes and dash differences", () => {
    expect(verifyQuote(article, 'but "strict" hierarchy kills exploration - sometimes')).toBe(true);
  });

  test("accepts an elided quote when every part appears, in order", () => {
    expect(verifyQuote(article, "Hierarchy matters. … kills exploration")).toBe(true);
    expect(verifyQuote(article, "kills exploration ... Hierarchy matters.")).toBe(false);
  });

  test("rejects a paraphrase", () => {
    expect(verifyQuote(article, "Strict hierarchy hurts exploration.")).toBe(false);
  });

  test("rejects quotes too short to show anything", () => {
    expect(verifyQuote(article, "The rest")).toBe(false);
  });
});

describe("verifiedPoints", () => {
  const text =
    "We measured p99 latency at 40 ms after adding a bound. Unbounded queues are a loan against latency.";
  const point = (quote: string) => ({
    kind: "finding" as const,
    subject: "bounded queue latency",
    statement: "Bounding the queue brought p99 latency to 40 ms.",
    evidence: "measurement" as const,
    quote,
  });

  test("keeps points whose quote is in the article and drops the rest", () => {
    const out = verifiedPoints(
      [point("We measured p99 latency at 40 ms"), point("p99 latency dropped to 40ms")],
      "Queues",
      text,
    );
    expect(out.map((p) => p.quote)).toEqual(["We measured p99 latency at 40 ms"]);
  });

  test("a quote may come from the title", () => {
    expect(
      verifiedPoints([point("Your queue is a promise")], "Your queue is a promise you can't keep", text),
    ).toHaveLength(1);
  });
});
