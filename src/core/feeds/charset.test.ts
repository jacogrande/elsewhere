import { describe, expect, test } from "bun:test";
import { decodeBody, detectCharset } from "./charset";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("detectCharset", () => {
  test("a UTF-8 BOM wins over everything", () => {
    const body = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes(`<?xml version="1.0" encoding="iso-8859-1"?>`)]);
    expect(detectCharset(body, "text/xml; charset=windows-1252")).toBe("utf-8");
  });

  test("the XML declaration wins over the HTTP header", () => {
    expect(
      detectCharset(bytes(`<?xml version="1.0" encoding="ISO-8859-1"?><rss/>`), "text/xml; charset=utf-8"),
    ).toBe("iso-8859-1");
  });

  test("falls back to the Content-Type charset, then UTF-8", () => {
    expect(detectCharset(bytes("<rss/>"), 'application/rss+xml; charset="Windows-1252"')).toBe(
      "windows-1252",
    );
    expect(detectCharset(bytes("<rss/>"), "application/rss+xml")).toBe("utf-8");
    expect(detectCharset(bytes("<rss/>"), null)).toBe("utf-8");
  });
});

describe("decodeBody", () => {
  test("decodes windows-1252 bytes", () => {
    const body = new Uint8Array([
      ...bytes(`<?xml version="1.0" encoding="windows-1252"?><t>caf`),
      0xe9,
      ...bytes("</t>"),
    ]);
    expect(decodeBody(body, null)).toContain("café");
  });

  test("strips the BOM", () => {
    expect(decodeBody(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("<rss/>")]), null)).toBe("<rss/>");
  });

  test("treats unknown labels as UTF-8 instead of throwing", () => {
    expect(decodeBody(bytes("<rss/>"), "text/xml; charset=klingon")).toBe("<rss/>");
  });
});
