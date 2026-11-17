import { describe, expect, test } from "bun:test";
import { parseModePreference, resolveMode } from "./color-mode";

describe("parseModePreference", () => {
  test("defaults to following the system", () => {
    expect(parseModePreference(null)).toBe("system");
    expect(parseModePreference("sepia")).toBe("system");
  });

  test("reads a saved preference", () => {
    expect(parseModePreference("light")).toBe("light");
    expect(parseModePreference("dark")).toBe("dark");
    expect(parseModePreference("system")).toBe("system");
  });
});

describe("resolveMode", () => {
  test("follows the system when set to system", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });

  test("an explicit choice wins", () => {
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });
});
