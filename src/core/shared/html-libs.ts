/*
 * sanitize-html is CommonJS and require()s htmlparser2, which is ESM-only. Bun cannot require()
 * an ESM module while an `import` of it is still loading, which made tests fail depending on
 * module load order. Loading both through require() here, and never importing htmlparser2
 * directly, keeps loading synchronous and deterministic.
 */
const htmlparser2 = require("htmlparser2") as typeof import("htmlparser2");
const sanitizeHtml = require("sanitize-html") as typeof import("sanitize-html");

export const Parser = htmlparser2.Parser;
export { sanitizeHtml };
