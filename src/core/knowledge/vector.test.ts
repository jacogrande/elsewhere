import { describe, expect, test } from "bun:test";
import { dot, EMBED_MAX_CHARS, embeddingText, normalize } from "./vector";

describe("normalize", () => {
  test("scales to unit length", () => {
    const v = normalize(Float32Array.from([3, 4]));
    expect(Array.from(v)).toEqual([0.6000000238418579, 0.800000011920929]);
  });

  test("leaves a zero vector as zeros instead of NaN", () => {
    expect(Array.from(normalize(Float32Array.from([0, 0])))).toEqual([0, 0]);
  });
});

describe("dot", () => {
  test("is cosine similarity for unit vectors", () => {
    const a = normalize(Float32Array.from([1, 0]));
    const b = normalize(Float32Array.from([1, 1]));
    expect(dot(a, b)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(dot(a, a)).toBeCloseTo(1, 6);
  });
});

describe("embeddingText", () => {
  test("is the title, a blank line, then the text", () => {
    expect(embeddingText({ title: "Queues", text: "Bound them." })).toBe("Queues\n\nBound them.");
  });

  test("caps very long articles", () => {
    const out = embeddingText({ title: "T", text: "x".repeat(EMBED_MAX_CHARS * 2) });
    expect(out.length).toBe(EMBED_MAX_CHARS);
  });

  test("uses the title alone when there is no text", () => {
    expect(embeddingText({ title: "Only a title", text: "" })).toBe("Only a title");
  });
});
