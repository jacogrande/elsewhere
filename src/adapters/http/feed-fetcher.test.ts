import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHttpFetcher } from "./feed-fetcher";

let server: ReturnType<typeof Bun.serve>;
let base: string;
let concurrent = 0;
let maxConcurrent = 0;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      switch (path) {
        case "/feed":
          if (req.headers.get("if-none-match") === '"v1"') return new Response(null, { status: 304 });
          return new Response("<rss/>", {
            headers: {
              etag: '"v1"',
              "content-type": "application/rss+xml",
              "x-ua": req.headers.get("user-agent") ?? "",
            },
          });
        case "/moved":
          return new Response(null, { status: 301, headers: { location: "/feed" } });
        case "/temp":
          return new Response(null, { status: 302, headers: { location: "/feed" } });
        case "/chain":
          return new Response(null, { status: 301, headers: { location: "/temp" } });
        case "/loop":
          return new Response(null, { status: 301, headers: { location: "/loop" } });
        case "/limited":
          return new Response("slow down", { status: 429, headers: { "retry-after": "120" } });
        case "/challenge":
          return new Response("<html>", { status: 403, headers: { "cf-mitigated": "challenge" } });
        case "/big":
          return new Response("x".repeat(2000));
        case "/latin1":
          return new Response(new Uint8Array([0x3c, 0x74, 0x3e, 0x63, 0x61, 0x66, 0xe9]), {
            headers: { "content-type": "text/xml; charset=iso-8859-1" },
          });
        case "/slow":
          await Bun.sleep(300);
          return new Response("late");
        case "/count":
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await Bun.sleep(30);
          concurrent--;
          return new Response("ok");
        default:
          return new Response("nope", { status: 404 });
      }
    },
  });
  base = `http://localhost:${server.port}`;
});

afterAll(() => server.stop(true));

const fetcher = createHttpFetcher({ userAgent: "Elsewhere/test", maxBytes: 1000, timeoutMs: 150 });

describe("createHttpFetcher", () => {
  test("returns the body and validators, sending an honest User-Agent", async () => {
    const outcome = await fetcher.fetch(`${base}/feed`);
    expect(outcome).toMatchObject({ kind: "ok", body: "<rss/>", etag: '"v1"', permanentRedirectTo: null });
  });

  test("sends validators and reports 304 as not modified", async () => {
    const outcome = await fetcher.fetch(`${base}/feed`, { etag: '"v1"', lastModified: null });
    expect(outcome.kind).toBe("not_modified");
  });

  test("reports where a permanently moved feed went, but not for temporary redirects", async () => {
    expect(await fetcher.fetch(`${base}/moved`)).toMatchObject({
      kind: "ok",
      permanentRedirectTo: `${base}/feed`,
    });
    expect(await fetcher.fetch(`${base}/temp`)).toMatchObject({ kind: "ok", permanentRedirectTo: null });
    expect(await fetcher.fetch(`${base}/chain`)).toMatchObject({ kind: "ok", permanentRedirectTo: null });
  });

  test("stops redirect loops", async () => {
    expect(await fetcher.fetch(`${base}/loop`)).toEqual({ kind: "too_many_redirects" });
  });

  test("passes Retry-After through and flags bot challenges", async () => {
    expect(await fetcher.fetch(`${base}/limited`)).toEqual({
      kind: "http_error",
      status: 429,
      retryAfter: "120",
      challenge: false,
    });
    expect(await fetcher.fetch(`${base}/challenge`)).toMatchObject({ status: 403, challenge: true });
  });

  test("caps the body size", async () => {
    expect(await fetcher.fetch(`${base}/big`)).toEqual({ kind: "too_large" });
  });

  test("decodes legacy charsets", async () => {
    expect(await fetcher.fetch(`${base}/latin1`)).toMatchObject({ kind: "ok", body: "<t>café" });
  });

  test("times out", async () => {
    expect(await fetcher.fetch(`${base}/slow`)).toEqual({ kind: "timeout" });
  });

  test("turns connection failures into network errors", async () => {
    const outcome = await fetcher.fetch("http://127.0.0.1:1/feed");
    expect(outcome.kind).toBe("network_error");
  });

  test("never sends two requests to the same host at once", async () => {
    maxConcurrent = 0;
    await Promise.all([1, 2, 3].map(() => fetcher.fetch(`${base}/count`)));
    expect(maxConcurrent).toBe(1);
  });
});
