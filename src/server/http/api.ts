import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { exportOpml, importOpml, refreshFeed, subscribe } from "../../app/feeds";
import { getArticle, listArticles, markAllRead, updateArticle } from "../../app/library";
import type { Deps } from "../deps";
import { type Problem, problem } from "./errors";

/** zValidator that answers bad input with problem JSON instead of the raw Zod error. */
const validate = <T extends z.ZodType, Target extends "json" | "query" | "param">(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".") || target}: ${i.message}`).join("; ");
      const body: Problem = { type: "invalid_request", title: "Invalid request", status: 400, detail };
      return c.json(body, 400);
    }
  });

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function buildApi(deps: Deps) {
  const feeds = new Hono()
    .get("/", (c) => c.json({ feeds: deps.feeds.list() }, 200))
    .post("/", validate("json", z.object({ url: z.string().min(1).max(2048) })), async (c) => {
      const result = await subscribe(deps)(c.req.valid("json").url);
      if (!result.ok) return problem(c, result.error);
      deps.logger.info("feed.subscribed", { feedId: result.value.feedId });
      return c.json(result.value, 201);
    })
    .delete("/:id", validate("param", idParam), (c) => {
      if (!deps.feeds.remove(c.req.valid("param").id)) return problem(c, { type: "feed_not_found" });
      return c.body(null, 204);
    })
    .post("/:id/refresh", validate("param", idParam), async (c) => {
      const result = await refreshFeed(deps)(c.req.valid("param").id);
      if (!result.ok) return problem(c, result.error);
      return c.json(result.value, 200);
    });

  const opml = new Hono()
    .get("/", (c) =>
      c.body(exportOpml(deps)(), 200, {
        "content-type": "text/x-opml; charset=utf-8",
        "content-disposition": 'attachment; filename="elsewhere.opml"',
      }),
    )
    .post("/", async (c) => {
      const result = importOpml(deps)(await c.req.text());
      if (!result.ok) return problem(c, result.error);
      return c.json(result.value, 200);
    });

  const articles = new Hono()
    .get(
      "/",
      validate(
        "query",
        z.object({
          feedId: z.coerce.number().int().positive().optional(),
          filter: z.enum(["all", "unread", "starred"]).default("all"),
          q: z.string().max(200).optional(),
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(40),
        }),
      ),
      (c) => {
        const q = c.req.valid("query");
        const result = listArticles(deps)({
          feedId: q.feedId ?? null,
          filter: q.filter,
          search: q.q?.trim() || null,
          cursor: q.cursor ?? null,
          limit: q.limit,
        });
        if (!result.ok) return problem(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .get("/:id", validate("param", idParam), (c) => {
      const result = getArticle(deps)(c.req.valid("param").id);
      if (!result.ok) return problem(c, result.error);
      return c.json(result.value, 200);
    })
    .patch(
      "/:id",
      validate("param", idParam),
      validate("json", z.object({ read: z.boolean().optional(), starred: z.boolean().optional() })),
      (c) => {
        const result = updateArticle(deps)(c.req.valid("param").id, c.req.valid("json"));
        if (!result.ok) return problem(c, result.error);
        return c.json(result.value, 200);
      },
    )
    .post(
      "/mark-read",
      validate(
        "json",
        z.object({ feedId: z.number().int().positive().nullable(), upToId: z.number().int().nonnegative() }),
      ),
      (c) => c.json({ marked: markAllRead(deps)(c.req.valid("json")) }, 200),
    );

  const app = new Hono()
    .basePath("/api")
    .get("/health", (c) => c.json({ ok: true }, 200))
    .route("/feeds", feeds)
    .route("/opml", opml)
    .route("/articles", articles);

  app.notFound((c) => c.json({ type: "not_found", title: "Not found", status: 404 } satisfies Problem, 404));
  app.onError((error, c) => {
    // Anything thrown is a bug: log it with its stack, answer with a generic 500.
    deps.logger.error("http.unhandled", { path: c.req.path, error: error.stack ?? String(error) });
    return c.json({ type: "internal", title: "Something went wrong", status: 500 } satisfies Problem, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof buildApi>;
