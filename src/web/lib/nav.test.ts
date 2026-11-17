import { describe, expect, test } from "bun:test";
import { neighborId } from "./nav";

describe("neighborId", () => {
  const ids = [10, 20, 30];

  test("moves to the next and previous item", () => {
    expect(neighborId(ids, 20, 1)).toBe(30);
    expect(neighborId(ids, 20, -1)).toBe(10);
  });

  test("stays put at the ends", () => {
    expect(neighborId(ids, 30, 1)).toBe(30);
    expect(neighborId(ids, 10, -1)).toBe(10);
  });

  test("starts at the first item when nothing is selected or the selection is gone", () => {
    expect(neighborId(ids, null, 1)).toBe(10);
    expect(neighborId(ids, 99, 1)).toBe(10);
  });

  test("returns null for an empty list", () => {
    expect(neighborId([], null, 1)).toBeNull();
  });
});
