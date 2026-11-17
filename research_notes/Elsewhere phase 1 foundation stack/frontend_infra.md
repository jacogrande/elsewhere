# Elsewhere phase 1: frontend stack and deployment infrastructure

Scope: the React SPA, its build setup, and the infrastructure to develop, test, ship and self-host phase 1 (the skeleton) of Elsewhere. Researched 2026-11-16. Package versions came from the npm registry (`npm view <pkg> version`) on that date. The `time.modified` field is the last change to the package's registry document, not necessarily its release date.

**Current versions (npm registry, 2026-11-16)** — [npm registry](https://www.npmjs.com/)
| Package | Latest |
|---|---|
| Bun | 1.4.4 (GitHub release 2026-10-22) — [GitHub API oven-sh/bun releases/latest](https://github.com/oven-sh/bun/releases) |
| react / react-dom | 19.3.1 |
| @tanstack/react-router | 1.170.46 |
| @tanstack/router-cli | 1.168.0 |
| @tanstack/router-plugin | 1.169.0 |
| @tanstack/react-query | 5.107.1 |
| @tanstack/react-virtual | 3.14.26 |
| hono | 4.13.19 |
| tailwindcss | 4.3.5 |
| bun-plugin-tailwind | 0.1.2 (registry doc last modified 2025-10-09, so no release in about 13 months) |
| @tailwindcss/typography | 0.5.20 |
| vite / @vitejs/plugin-react | 8.3.8 / 6.3.0 |
| @hono/vite-dev-server | 0.26.1 |
| babel-plugin-react-compiler | 1.0.0 |
| react-router | 8.5.1 |
| happy-dom | 21.0.4 |
| @testing-library/react / @testing-library/jest-dom | 16.3.3 / 7.0.1 |
| shadcn (CLI) | 4.23.0 |
| @base-ui/react / radix-ui | 1.9.0 / 1.8.1 |
| react-hotkeys-hook / tinykeys | 5.4.0 / 4.0.1 |
| @biomejs/biome | 2.6.8 |
| drizzle-orm | 0.45.4 |
| dompurify | 3.4.18 |
| oven-sh/setup-bun | v2.2.0 (2026-03-14) — [GitHub releases](https://github.com/oven-sh/setup-bun/releases) |
| Litestream | v0.5.18 (03 Nov 2026) — [GitHub releases](https://github.com/benbjohnson/litestream/releases) |

---

## Bun HTML imports / fullstack dev server vs Vite

### Takeaway
Bun's fullstack server (HTML imports in `Bun.serve` routes) can handle phase 1: HMR with React Fast Refresh, CSS bundling, Tailwind through `bun-plugin-tailwind`, AOT production builds, and embedding the SPA in a `--compile` binary. Bun's own docs still call it a work in progress, though. The weak points are plugins (the Tailwind plugin is v0.1.2 and hasn't been updated in about a year, and plugins are not supported in the CLI), no official TanStack Router plugin, no React Compiler path, and limited code splitting. Keep Bun as the default as architecture.md says, and keep Vite as the fallback. Switching later is cheap, because the Hono API doesn't depend on the bundler.

### Cited Findings
- **HMR:** Bun turns hot reloading on when `development` is true. `development: { hmr: true, console: true }` also echoes browser console logs to the terminal. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- If no module accepts an update (via `import.meta.hot.accept()`, React Fast Refresh, or a plugin), the page does a full reload and logs which files were invalidated. — [Bun hot reloading docs](https://bun.com/docs/bundler/hot-reloading)
- A third-party mirror of Bun's docs says Fast Refresh is automatic for .jsx and .tsx files. I couldn't confirm this against the official page. — [mintlify mirror](https://www.mintlify.com/zhcndoc/bun/bundler/hmr)
- **Production builds:** The recommended route (Bun v1.2.17+) is an ahead-of-time build, `bun build --target=bun --production --outdir=dist ./src/index.ts`. HTML imports become a manifest that `Bun.serve()` uses. The alternative, `development: false`, bundles lazily on the first request, caches in memory, sets `Cache-Control`/`ETag`, and minifies. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- **CSS:** Bun processes `<link>` tags and CSS imports, concatenates CSS, rewrites asset URLs to content hashes, and inlines small assets as `data:` URLs. It combines all `<script>` tags into one bundle and all `<link>` tags into one. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- **Tailwind v4:** `bun add tailwindcss bun-plugin-tailwind`, then register it in `bunfig.toml` under `[serve.static] plugins = ["bun-plugin-tailwind"]`. Reference it with `<link rel="stylesheet" href="tailwindcss" />` or `@import "tailwindcss";`. The docs say plugins "work with the `Bun.build()` JS API but not yet with the CLI". — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- `bun-plugin-tailwind` is at 0.1.2, and its registry entry was last modified 2025-10-09. — [npm](https://www.npmjs.com/package/bun-plugin-tailwind)
- **Env vars:** Set `[serve.static] env = "PUBLIC_*"` (recommended), `"inline"`, or `"disable"` (default). Bun only replaces literal `process.env.FOO`. It doesn't replace `import.meta.env` or indirect access. An unset variable can throw `ReferenceError: process is not defined` in the browser. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- **Stated limits:** No auto-discovery of API routes, no built-in SSR, and "Features and APIs may change". The fullstack server is labelled a work in progress. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- **History:** HTML imports arrived in Bun 1.2. Bun 1.3 (Oct 2025) added hot reloading and built-in routing to `Bun.serve`. — [Bun v1.3 blog](https://bun.com/blog/bun-v1.3); [heise](https://heise.de/-10759717)
- **Recent releases:** v1.4.4 (2026-10-22) redesigned the dev server error overlay and added `bun:sqlite` user-defined functions and update hooks. v1.4.3 (2026-10-10) cut bundler memory use and sped up `--compile --bytecode` startup. v1.4.1 made `--compile --bytecode` work when cross-compiling. v1.3.10 added `--compile --target=browser` for standalone HTML. No 2026 release note specifically covered HTML imports or HMR. — [Bun blog index](https://bun.com/blog)
- **Code splitting:** `--compile` doesn't support code splitting, because the output is one file. — [third-party summary of Bun bundler docs](https://tessl.io/registry/pleaseai/bun/1.4.0/files/skills/use-bun/references/bundler.md) (I didn't verify this on bun.com, but it matches `--compile` not supporting `--outdir` per [Bun executables docs](https://bun.com/docs/compiler/executables))
- **Vite integration:** `@hono/vite-dev-server` (0.26.1) runs any fetch-based Hono app inside Vite's dev server and has a Bun adapter (`@hono/vite-dev-server/bun`). — [honojs/vite-plugins dev-server](https://github.com/honojs/vite-plugins/blob/main/packages/dev-server); [npm](https://npmjs.com/package/@hono/vite-dev-server)
- The usual production pattern: Vite builds to `dist/`, and Bun/Hono serves the API plus static files on one port, using `serveStatic` from `hono/bun` and falling back to `index.html` for SPA routes. In dev, Vite's `server.proxy` forwards `/api` to the Bun process (e.g. Vite :3000 → Bun :3001). — [bun-dev-server skill page (community)](https://skills.cat/skills/daleseo/bun-skills/bun-dev-server)
- Vite 8 is current (8.3.8). `@vitejs/plugin-react` v6 replaced its internal Babel with oxc. — [npm](https://www.npmjs.com/package/vite); [recca0120 blog](https://recca0120.github.io/en/2026/04/14/react-compiler-vite-v6/)

### Inferences
- **Recommendation:** Start with Bun HTML imports, as architecture.md says. For phase 1 (a dozen routes, one CSS file) its gaps don't matter: code splitting isn't needed in an embedded binary, and Tailwind works through the plugin.
- Write the production and compile build as a small `scripts/build.ts` that calls `Bun.build({ ..., plugins: [tailwind] })`, not as a bare `bun build` CLI call, because the docs say plugins aren't supported in the CLI yet. Check early (week 1) that Tailwind classes are present in the `--compile` output.
- Read client env through a `PUBLIC_*` prefix and literal `process.env.PUBLIC_X`, or better, avoid build-time env altogether: the SPA can fetch runtime config from `/api/config`. That fits one binary serving many self-hosters.
- **Fallback trigger:** Switch to Vite 8 + `@vitejs/plugin-react` + `@tanstack/router-plugin/vite` if any of these happen: Tailwind or HMR misbehaves, you want TanStack Router's automatic code splitting, or you want the React Compiler. Use Vite only for the SPA (Vite dev on :5173 proxying `/api` to Bun on :3000). In production, Vite emits `dist/`, and Bun/Hono serves it with `serveStatic`. For the compile binary, embed it with `--asset ./dist` (see the Docker/compile section). The Hono API code doesn't change either way.

### Gaps
- I couldn't find open oven-sh/bun GitHub issues on HTML-import HMR or Tailwind-plugin bugs from 2026, so maturity is judged from docs and release notes only.
- The official docs page didn't confirm whether Bun's fullstack dev server splits chunks for dynamic `import()` in non-compile builds.
- I didn't verify whether `bun-plugin-tailwind` 0.1.2 is fully compatible with Tailwind 4.3.x.

---

## React version and React Compiler

### Takeaway
Use React 19.3.x. React Compiler 1.0 is stable but ships as a Babel plugin, and Bun's bundler has no Babel step, so skip the compiler in phase 1 (or adopt it only with a Vite fallback).

### Cited Findings
- The latest `react` and `react-dom` on npm are 19.3.1. — [npm react](https://www.npmjs.com/package/react)
- React 19.2 shipped on 2025-10-01. — [react.dev blog](https://www.react.dev/blog/2025/10/01/react-19-2)
- React Compiler v1.0 became stable in October 2025. It is implemented as a Babel plugin (`babel-plugin-react-compiler`, install with an exact version), must run first in the Babel chain, and the React team is working with oxc on support. `eslint-plugin-react-compiler` was merged into `eslint-plugin-react-hooks`. — [React Compiler v1.0 blog](https://de.react.dev/blog/2025/10/07/react-compiler-1)
- The `babel-plugin-react-compiler` npm version is 1.0.0. — [npm](https://www.npmjs.com/package/babel-plugin-react-compiler)
- With Vite 8 / `@vitejs/plugin-react` v6 (oxc-based), the compiler is wired in through `@rolldown/plugin-babel` and a compiler preset. — [recca0120 blog](https://recca0120.github.io/en/2026/04/14/react-compiler-vite-v6/)

### Inferences
- A reading app's hot paths are a virtualized list and an article view, and neither needs the compiler. Skipping it saves a Babel dependency and keeps the Bun-only build.
- The project uses Biome rather than ESLint, so `eslint-plugin-react-hooks` lint rules won't be available. Biome has its own hooks rules, but I didn't verify how they compare.

### Gaps
- I found no documented way to run React Compiler inside Bun's bundler (a Bun plugin wrapping Babel would be custom work).

---

## Routing: TanStack Router with Bun; React Router alternative

### Takeaway
TanStack Router's official bundler plugin supports Vite, Rspack/Rsbuild, Webpack and esbuild, but not Bun. With Bun, use file-based routing generated by the official `@tanstack/router-cli` (`tsr watch` next to `bun --hot`), or skip generation and use code-based routing. Code-based routing is the simplest choice for phase 1's handful of routes.

### Cited Findings
- `@tanstack/router-plugin` supports Vite, Webpack and Rspack/Rsbuild, and esbuild through unplugin. Bun isn't listed. — [TanStack file-based routing docs](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing); [router-plugin skill](https://skills.sh/tanstack/router/router-plugin)
- With esbuild, automatic code splitting isn't available (`autoCodeSplitting: true` throws), but route generation works. — [TanStack esbuild install guide](https://tanstack.com/router/latest/docs/framework/react/installation/with-esbuild)
- The official `@tanstack/router-cli` (1.168.0) provides `tsr generate` and `tsr watch`. `tsr watch` regenerates the route tree as files change, and can run alongside any dev server from package.json scripts. — [TanStack Router CLI install guide](https://tanstack.com/router/latest/docs/installation/with-router-cli)
- A community Bun plugin, `@zomme/bun-plugin-tsr` (v0.2.1), generates routes inside Bun. It has very few downloads (about 327). — [pkgstats](https://www.pkgstats.com/pkg:@zomme/bun-plugin-tsr)
- `@tanstack/react-router` is at 1.170.46, still on the v1 major. — [npm](https://www.npmjs.com/package/@tanstack/react-router)
- `react-router` is now at 8.5.1 (a v8 major exists). — [npm](https://www.npmjs.com/package/react-router)

### Inferences
- **Recommendation:** TanStack Router, code-based (`createRootRoute`/`createRoute`/`createRouter`). Phase 1 has about 6 routes (timeline, feed, article, search, settings, login), so the generated tree adds little. Type-safe search params (e.g. `?feed=…&unread=1`) are the main reason to choose TanStack over React Router, and they work the same in code-based mode.
- If you later move to file-based routing, run `tsr watch` as a second process in `bun run dev` and commit `routeTree.gen.ts`. Avoid the community Bun plugin.
- React Router v8 in SPA/declarative mode is a fine alternative, but its typed search params are weaker. Its version number has also moved fast (v7 to v8), so I didn't verify v8's SPA-mode API.

### Gaps
- I didn't check React Router v8 changes or SPA-mode docs in this pass.

---

## TanStack Query v5 with the Hono RPC client

### Takeaway
Use `@tanstack/react-query` 5.107 with a thin hand-written layer: `queryOptions` factories that call `hc<AppType>` methods, unwrap `res.ok`, and get types from `InferResponseType`. Use `useInfiniteQuery` with a cursor for the timeline. No wrapper library is needed.

### Cited Findings
- Hono's official "stacks" guide shows `hc`, `InferResponseType` and `InferRequestType` from `hono/client`, combined with a React Query `QueryClient`. — [hono.dev stacks](https://hono.dev/concepts/stacks)
- Response types can be narrowed by status, e.g. `InferResponseType<typeof client.users.$get, 200>` and `..., 404>`. — [Hono RPC skill guide](https://www.skills.lc/bobmatnyc/claude-mpm-skills/bobmatnyc-claude-mpm-skills-toolchains-javascript-frameworks-hono-rpc-skill-md); [tRPC Discord thread](https://discord-questions.trpc.io/m/1325603500779900958)
- Wrapper libraries exist (`hono-rpc-query`, `@softnetics/hono-react-query`) that generate `queryOptions`/`mutationOptions` from the client. — [hono-rpc-query](https://awesome.ecosyste.ms/projects/github.com%2Fk3dom%2Fhono-rpc-query); [softnetics/hono-react-query](https://github.com/softnetics/hono-react-query)

### Inferences
- Pattern: `const api = hc<AppType>("/")`, then `export const timelineQuery = (f) => infiniteQueryOptions({ queryKey: ["timeline", f], queryFn: async ({ pageParam }) => { const r = await api.api.library.timeline.$get({ query: { ...f, cursor: pageParam } }); if (!r.ok) throw await problem(r); return r.json(); }, initialPageParam: undefined, getNextPageParam: (p) => p.nextCursor })`. Throwing the RFC 9457 problem in `queryFn` matches architecture.md §7.3 (toasts use the problem `title`).
- Gotcha: Hono RPC types only flow if routes are chained (`app.get(...).post(...)`) and the sub-apps are mounted with `.route()`. `AppType` must be exported from the chained value. A large `AppType` can slow the TypeScript language server. This is general Hono guidance; I didn't re-verify it in this pass.
- Avoid wrapper libraries: they are young and add a dependency to save a few lines.

### Gaps
- I didn't find an official Hono doc showing `useInfiniteQuery` specifically.

---

## Styling and UI: Tailwind v4 + shadcn/ui vs CSS modules; article typography

### Takeaway
Tailwind v4 (CSS-first config, no `tailwind.config.js`) plus `@tailwindcss/typography` for article bodies is the simplest reading-app setup. Copy in a few shadcn/ui components (dialog, dropdown, toast, input) for accessible primitives. New shadcn projects now default to Base UI, and Radix is still supported. Either works; pick one and don't mix them.

### Cited Findings
- `tailwindcss` 4.3.5 and `@tailwindcss/typography` 0.5.20 are current. — [npm tailwindcss](https://www.npmjs.com/package/tailwindcss); [npm typography](https://www.npmjs.com/package/@tailwindcss/typography)
- shadcn/ui officially supports Tailwind v4 and React 19. — [shadcn Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4)
- New shadcn/ui projects default to Base UI instead of Radix, and Radix remains fully supported (`shadcn init -b radix` keeps Radix). This comes from third-party release summaries, not official docs. — [OpenReplay blog](https://blog.openreplay.com/shadcn-ui-radix-base-ui-switch/); [releases.sh shadcn](https://releases.sh/shadcn/releases)
- Some shadcn-adjacent libraries (AI Elements) depend on Radix APIs and have type errors with Base UI. — [shadcn skill page](https://skills.cat/skills/enderpuentes/ai-agent-skills/shadcn-ui)
- Some CLI runs still generate v3-style configs, so check the generated files. — [same third-party pages as above](https://skills.cat/skills/enderpuentes/ai-agent-skills/shadcn-ui)
- Current versions: `shadcn` CLI 4.23.0, `@base-ui/react` 1.9.0, `radix-ui` 1.8.1. — [npm](https://www.npmjs.com/package/shadcn)

### Inferences
- shadcn copies component source into the repo, so the only runtime dependencies are the primitive library plus `clsx`/`tailwind-merge`/`class-variance-authority`. That's acceptable. CSS modules would mean hand-building accessible dialogs and menus, which is more work.
- The shadcn CLI assumes a Vite/Next project layout. With Bun HTML imports, run `shadcn init` and expect to fix the CSS entry path and `components.json` aliases by hand.
- Article body: `<article className="prose prose-neutral dark:prose-invert max-w-[70ch]">`, with Tailwind v4 loading the plugin via `@plugin "@tailwindcss/typography";` in CSS (standard v4 syntax, not re-verified here).

### Gaps
- I didn't confirm from official shadcn docs whether Base UI is the default; the evidence is secondary.

---

## Rendering sanitized article HTML safely

### Takeaway
Sanitize on the server at ingest time (store sanitized HTML), render with `dangerouslySetInnerHTML` inside a `prose` container, and back it up with a strict CSP from Hono. Don't use iframes for article bodies in phase 1.

### Cited Findings
- `dompurify` 3.4.18 is current and actively maintained (registry updated 2026-11-14). — [npm dompurify](https://www.npmjs.com/package/dompurify)

### Inferences
- Server-side sanitization in Bun needs a DOM. DOMPurify needs a window (jsdom/happy-dom), or use a DOM-free sanitizer such as `sanitize-html`. This belongs in the feeds adapter. The sanitizer itself is the backend researcher's call.
- Belt and braces: Hono's `secureHeaders` middleware with a CSP of `default-src 'self'; img-src * data:; media-src *; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'; base-uri 'none'`. Also rewrite links to `target="_blank" rel="noopener noreferrer"`, and set `referrerpolicy="no-referrer"` and `loading="lazy"` on images. Images are cross-origin; an image proxy is a later concern.
- A sandboxed `<iframe srcdoc>` gives stronger isolation but breaks typography inheritance, auto-height, and keyboard focus for j/k. Not worth it when HTML is already sanitized and CSP blocks inline script.

### Gaps
- I didn't fetch primary sources (Hono `secureHeaders` docs, MDN CSP) in this pass. The CSP above is a proposal, not a sourced recommendation.

---

## Long lists: virtualization and infinite scroll

### Takeaway
Use `@tanstack/react-virtual` 3.x `useVirtualizer` with `useInfiniteQuery` and a keyset cursor (`published_at, id`). Measure rows dynamically (`measureElement`) because titles and snippets vary in height. Fetch the next page when the last virtual item comes into range.

### Cited Findings
- `@tanstack/react-virtual` 3.14.26 is current and actively maintained (registry updated 2026-11-03). — [npm](https://www.npmjs.com/package/@tanstack/react-virtual)
- `@tanstack/react-query` 5.107.1 is current. — [npm](https://www.npmjs.com/package/@tanstack/react-query)

### Inferences
- Pattern, from the TanStack Virtual infinite-scroll example (I recall it from training; the URL I tried returned 404): `count = hasNextPage ? rows.length + 1 : rows.length`. In an effect, if the last virtual item's index is at or past `rows.length - 1` and the query isn't already fetching, call `fetchNextPage()`.
- For j/k, call `virtualizer.scrollToIndex(i, { align: "auto" })` so the selected entry stays visible even when it isn't rendered.
- A list of 1–3k simple rows renders fine without virtualization. Virtualize from day one anyway, because unread counts in RSS readers grow without bound.

### Gaps
- The TanStack Virtual infinite-scroll example page at the URL I tried returned 404. I didn't re-verify the current example code.

---

## Keyboard shortcuts (j/k)

### Takeaway
Use `tinykeys` (tiny, framework-agnostic) wrapped in a 10-line `useHotkeys` hook, or `react-hotkeys-hook` if you want scopes and an input-focus guard built in. Both are maintained.

### Cited Findings
- `react-hotkeys-hook` 5.4.0 (registry updated 2026-11-09) and `tinykeys` 4.0.1 (updated 2026-09-25) are current. — [npm react-hotkeys-hook](https://www.npmjs.com/package/react-hotkeys-hook); [npm tinykeys](https://www.npmjs.com/package/tinykeys)

### Inferences
- Keep the shortcut map (j/k/o/m/s/r, `g u` sequences) as pure data, with the "what does j do given the current selection" logic as a pure function, per architecture.md's thin-components rule. The hook only dispatches. Ignore keys while focus is in inputs or textareas, or inside `[contenteditable]`.

### Gaps
- I didn't do a feature comparison (sequence support, scopes, bundle size) from primary docs.

---

## Component testing in Bun (happy-dom + Testing Library)

### Takeaway
It works and is officially documented: `bunfig.toml` `[test] environment = "happy-dom"` (or a GlobalRegistrator preload), plus `@testing-library/react` 16 and `@testing-library/jest-dom` 7. The gotchas are shared window state between files, the need to call `cleanup()` yourself, and using `mock` rather than `jest.fn`.

### Cited Findings
- Setup: `bun add -d happy-dom @testing-library/react @testing-library/jest-dom`, then in `bunfig.toml` `[test] environment = "happy-dom"`. Alternatively, preload `@happy-dom/global-registrator` with `GlobalRegistrator.register()`. Add `/// <reference lib="dom" />` to DOM tests. — [Bun DOM testing docs](https://bun.com/docs/test/dom)
- Caveats: files with the same environment share one window by default (`--isolate`/`--parallel` give each file its own). The docs suggest an `afterEach` that calls RTL `cleanup()`. Only happy-dom, jsdom and `node` environments are supported. With `--isolate`, jsdom arrays fail `instanceof Array`. — [Bun DOM testing docs](https://bun.com/docs/test/dom)
- Versions: happy-dom 21.0.4, @testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1. — [npm](https://www.npmjs.com/package/happy-dom)

### Inferences
- Use a per-file environment so pure core tests don't pay for a DOM. Set the environment in DOM test files only (the docs show a comment directive), or name them `*.dom.test.tsx` and give them their own preload.
- Use `mock()` from `bun:test` rather than `jest.fn()`. Check the jest-dom TypeScript matcher types early, because the docs don't cover them.

### Gaps
- I didn't verify how jest-dom 7's typings integrate with `bun:test`'s `expect`.

---

## Docker images and `bun build --compile` binaries

### Takeaway
Ship a compiled binary (`--compile --minify --sourcemap --bytecode`, with the SPA embedded through the HTML import and migrations embedded through `--asset` or file imports) on a tiny base image (distroless/cc or debian-slim). Cross-compile linux x64 and arm64 (glibc and musl) from one CI runner. `sqlite-vec` and other loadable extensions are native `.so` files, so they cannot live inside the binary and must ship next to it (phase 3 concern).

### Cited Findings
- **Targets:** `bun-linux-x64`, `bun-linux-arm64` (glibc), `bun-linux-x64-musl`, `bun-linux-arm64-musl`, `bun-windows-x64`, `bun-windows-arm64`, `bun-darwin-x64`, `bun-darwin-arm64`. Example: `bun build --compile --target=bun-linux-x64 ./index.ts --outfile myapp`. — [Bun executables docs](https://bun.com/docs/compiler/executables)
- A `-baseline` variant exists for CPUs older than about 2013. — [Flavio Copes](https://flaviocopes.com/javascript-single-executable.md) (secondary)
- **Fullstack executables (v1.2.17+):** importing an HTML file in server code makes Bun bundle and embed the frontend. `bun build --compile ./server.ts --outfile myapp`. The HTML import becomes a manifest that `Bun.serve` serves from the binary. — [Bun executables docs](https://bun.com/docs/compiler/executables)
- **Embedding files:** `import f from "./x" with { type: "file" }` returns a path readable by `Bun.file()`. `Bun.embeddedFiles` lists embedded blobs. Directories are embedded with `--asset ./dir` (or `compile.assets`). Embedded files are read-only (`EROFS` on write). A relative path to a file that isn't embedded loads from disk at runtime. — [Bun executables docs](https://bun.com/docs/compiler/executables)
- **Flags:** `--minify`, `--sourcemap` (embedded, zstd-compressed), `--bytecode`. `.env` and `bunfig.toml` autoload is on by default in compiled binaries (turn off with `--no-compile-autoload-dotenv` / `--no-compile-autoload-bunfig`). Workers must be listed as entrypoints. — [Bun executables docs](https://bun.com/docs/compiler/executables)
- `--compile --bytecode` works when cross-compiling (v1.4.1), and compiled executables are smaller and start faster. — [Bun blog index](https://bun.com/blog)
- `bun compile` is short for `bun build --compile --aot`, an experimental ahead-of-time mode that embeds machine code. Behavior differs from `bun run` in places. — [Bun compiler docs](https://bun.com/docs/compiler)
- **Docker:** official `oven/bun` variants are debian, slim, alpine and distroless. Canary tags on amd64 are about 43 MB compressed (distroless) and about 66 MB (slim). — [Docker Hub oven/bun](https://hub.docker.com/r/oven/bun); [tags](https://hub.docker.com/r/oven/bun/tags)
- Third-party image-size claims conflict widely (e.g. slim 285 MB / distroless 193 MB / alpine 186 MB in one benchmark, versus about 40 MB for a compiled binary on distroless in another). — [DEV: four ways to deploy a Bun server](https://dev.to/keonik/four-ways-to-deploy-a-bun-server-571d); [bun-docker skill](https://playbooks.com/skills/secondsky/claude-skills/bun-docker)
- Alpine uses musl, so check that dependencies work there. Distroless has no shell. — [OpenReplay (zh)](https://blog.openreplay.com/zh/bun-应用-docker化/); [Docker hardened images](https://hub.docker.com/hardened-images/catalog/dhi/bun/guides)
- Bun v1.3.6 updated bundled SQLite to 3.51.2. v1.4.4 added `bun:sqlite` UDFs and update hooks. — [Bun blog index](https://bun.com/blog)

### Inferences
- **Dockerfile:** stage 1 `oven/bun:1.4` runs `bun install --frozen-lockfile && bun run build:compile`. Stage 2 is `gcr.io/distroless/cc-debian12` (the glibc binary needs libc/libstdc++), copying the binary, `USER nonroot`, `VOLUME /data`, `ENV DATABASE_PATH=/data/elsewhere.db`, `HEALTHCHECK` using the binary itself (`elsewhere healthcheck`, Miniflux-style, because distroless has no curl). Expect roughly 60–110 MB uncompressed, mostly the Bun runtime. Unverified estimate.
- **Migrations:** Drizzle's migrator reads a folder at runtime. Embed it with `--asset ./drizzle` and read it via `Bun.embeddedFiles`, or import the SQL files with `with { type: "text" }` into a migrations array. Either way, a test should run migrations from the compiled binary in CI.
- **Tailwind in the compile step:** use the `Bun.build({ compile: …, plugins: [tailwind] })` JS API, since the CLI doesn't take plugins.
- **SQLite extensions:** `sqlite-vec` (phase 3) is a native shared library per OS/arch. It must ship beside the binary (or be written from an embedded blob to a temp dir and then loaded), and must match glibc vs musl. On macOS the system SQLite can't load extensions (architecture.md already notes this).
- Avoid the alpine/musl image unless a size difference is measured. Musl plus native extensions is a common pain point.

### Gaps
- I couldn't confirm the exact stable `oven/bun:1.4.x` image sizes per variant. Only canary sizes were visible.
- I didn't verify whether `--bytecode` works with HTML-import fullstack builds.

---

## SQLite in production for self-hosters

### Takeaway
One file on a local Docker volume with WAL is fine, because one process owns it. Never put it on NFS/SMB/CIFS (common on NAS setups). Built-in backups: a scheduled `VACUUM INTO` snapshot (already in architecture.md), with `sqlite3_rsync` as the ad-hoc copy tool. Document Litestream (v0.5.18, actively maintained) as an optional sidecar for continuous S3 replication.

### Cited Findings
- "All processes using a database must be on the same host computer; WAL does not work over a network filesystem", because WAL needs shared memory (an mmapped `-shm` file in the DB's directory). — [SQLite WAL docs](https://www.sqlite.org/wal.html)
- "The WAL file is part of the persistent state of the database and should be kept with the database if the database is copied or moved. If a database file is separated from its WAL file… transactions… might be lost, or the database file might become corrupted." — [SQLite WAL docs](https://www.sqlite.org/wal.html)
- Automatic checkpoint happens at 1000 WAL pages or when the last connection closes. — [SQLite WAL docs](https://www.sqlite.org/wal.html)
- `sqlite3_rsync ORIGIN REPLICA` makes a consistent copy while both sides are in use (writers on the origin are allowed). It works over SSH, and the replica is read-only during the sync. The WAL-mode and page-size requirements were removed in SQLite 3.50.0 (2025-05-29). — [sqlite3_rsync docs](https://www.sqlite.org/rsync.html)
- Litestream latest is v0.5.18 (03 Nov 2026), after v0.5.17 (31 Aug), v0.5.16 (05 Aug) and v0.5.15 (21 Jul). v0.5.18 added an experimental read-only VFS extension (pip/npm/gem) and S3 improvements (Neon object storage detection, opt-in PutObject checksums, throttling backoff). v0.5.17 removed a WAL-reset corruption exposure. — [Litestream releases](https://github.com/benbjohnson/litestream/releases)
- Litestream 0.5 (Oct 2025) changed the storage format (LTX). Early 0.5.x patches fixed restore issues. — [Simon Willison](https://simonwillison.net/2025/Oct/3/litestream); [Fly community v0.5.1](https://community.fly.io/t/litestream-v0-5-1-released/26176)
- LiteFS's latest release is v0.5.14 from 2025-04-22, so no release in more than 18 months. — [GitHub superfly/litefs](https://github.com/superfly/litefs/releases)

### Inferences
- Ship an `elsewhere backup <path>` subcommand and an optional daily in-app job that runs `VACUUM INTO '/data/backups/elsewhere-YYYYMMDD.db'` and keeps N copies. That needs no extra binary, and the result is a single consistent file.
- Never tell users to `cp` the live DB without its `-wal`. The README should say "stop the container or use `elsewhere backup`".
- Add a startup check that warns if `DATABASE_PATH` is on a network filesystem. Detecting this is fiddly (e.g. statfs magic numbers), so at minimum document it for Unraid/TrueNAS users who map volumes onto SMB/NFS shares.
- Treat Litestream as docs-only (a compose example with a `litestream` sidecar), not a dependency. Avoid LiteFS given its release cadence.

### Gaps
- I didn't verify Docker Desktop (macOS/Windows) bind-mount behavior with WAL. VirtioFS/gRPC-FUSE file locking has historically been a risk, so recommend named volumes over bind mounts on Desktop.

---

## Hosting options for self-hosters and a public demo

### Takeaway
Self-hosters expect a Docker image on GHCR/Docker Hub with multi-arch tags, a docker-compose example, and a healthcheck, as Miniflux provides, plus a static binary. For a public demo, a single Fly.io machine with a volume (plus a nightly reset) is the cheapest fit. A small VPS with Caddy is the documented "bare" path.

### Cited Findings
- Miniflux publishes images to Docker Hub, GHCR and Quay. It builds for amd64, arm64, arm/v7 and arm/v6, uses `latest`/pinned/`nightly` tags and recommends pinning versions. Its compose example includes a `HEALTHCHECK` running `/usr/bin/miniflux -healthcheck auto`, and its repo has extra compose examples using Traefik and Caddy. Miniflux needs PostgreSQL. — [Miniflux Docker docs](https://miniflux.app/docs/docker.html)
- Miniflux also offers precompiled binaries, Debian/RPM packages, Alpine/Arch/FreeBSD/Nix community packages, and Cloudron. — [Miniflux installation docs](https://miniflux.app/docs/installation.html)
- Fly volumes: one volume per Machine, in one region on one server, on local NVMe. There are daily block snapshots (5-day default retention, configurable 1–60 days), but Fly says snapshots shouldn't be your primary backup. No automatic replication; Fly says "Always provision at least two volumes per app". Default size is 1 GB, max 500 GB. Volumes can be extended but not shrunk. — [Fly volumes overview](https://docs.fly.io/volumes/overview)

### Inferences
- Elsewhere's single-binary SQLite story is simpler than Miniflux's (no Postgres container). Lean into that: a one-service compose file with one named volume.
- Publish to GHCR (free with GitHub Actions) and optionally Docker Hub. Start with amd64 + arm64 (Raspberry Pi 4/5, Apple Silicon home servers, ARM VPS). Bun doesn't target arm/v7.
- Caddy as reverse proxy: a two-line Caddyfile (`reader.example.com { reverse_proxy elsewhere:3000 }`) gives automatic HTTPS. Behind a proxy, the app must trust `X-Forwarded-*` only when configured.
- Fly is a natural fit for the demo: one machine, one volume (Fly's two-volume advice is for HA, which a demo doesn't need), an in-app nightly reset job, and a read-only or ephemeral account.
- PaaS options with volumes (Railway, Render disks, Coolify on your own VPS) all work with "one container + one volume". Each needs a one-page doc, not code.
- App stores (Unraid Community Apps, TrueNAS apps, Umbrel, CasaOS, YunoHost) need a stable image name, a documented volume path, PUID/PGID or a non-root UID, and a healthcheck. These are community-submitted later; design the image so it's easy to package.

### Gaps
- I didn't fetch Fly pricing, Railway/Render volume docs, Caddy docs, Coolify docs, or FreshRSS install docs in this pass. I found no survey data on what Miniflux/FreshRSS users actually run on, beyond what the projects ship (Docker + reverse proxy + packages).

---

## CI/CD with GitHub Actions

### Takeaway
One workflow: `oven-sh/setup-bun@v2`, then `bun install --frozen-lockfile`, `tsc --noEmit`, `biome ci`, `depcruise`, `bun test`, and a compile smoke test. On a tag, cross-compile release binaries from one Linux runner (no matrix needed) and build a multi-arch image with buildx to GHCR.

### Cited Findings
- `oven-sh/setup-bun` latest is v2.2.0 (2026-03-14). — [GitHub releases](https://github.com/oven-sh/setup-bun/releases)
- Bun cross-compiles to all Linux/macOS/Windows targets from one host, including `--bytecode` since v1.4.1. — [Bun executables docs](https://bun.com/docs/compiler/executables); [Bun blog index](https://bun.com/blog)
- Biome is at 2.6.8. — [npm](https://www.npmjs.com/package/@biomejs/biome)

### Inferences
- **Release job:** loop over `bun-linux-x64`, `bun-linux-arm64`, `bun-linux-x64-musl`, `bun-darwin-arm64`, `bun-darwin-x64`, `bun-windows-x64`, then upload with `gh release create` or `softprops/action-gh-release`. Add `sha256sum` checksums.
- **Docker job:** `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action` (GHCR with `GITHUB_TOKEN`), `docker/metadata-action` (semver tags), `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`. To avoid slow QEMU emulation, cross-compile both binaries in the amd64 builder stage and `COPY` the right one using `TARGETARCH` in the final stage.
- Unsigned macOS binaries get Gatekeeper warnings. Document `xattr -d com.apple.quarantine` or skip macOS binaries in phase 1.

### Gaps
- I didn't verify current docker/* action major versions or setup-bun inputs (e.g. `bun-version-file`).

---

## Observability minimum

### Takeaway
For phase 1: a `/healthz` (liveness) and `/readyz` (DB reachable, migrations applied) endpoint, a binary `healthcheck` subcommand for Docker, JSON-lines logs to stdout (already in architecture.md), and a job/feed-health admin view. Sentry/OpenTelemetry should be opt-in env-configured extras later, not phase 1 dependencies.

### Cited Findings
- Miniflux sets the precedent of a binary health check (`miniflux -healthcheck auto`) used as the Docker `HEALTHCHECK`. — [Miniflux Docker docs](https://miniflux.app/docs/docker.html)

### Inferences
- Distroless images have no curl, so the health check must be built into the binary (a `healthcheck` subcommand that fetches `http://127.0.0.1:$PORT/healthz`).
- Log `version`, `commit`, `db path`, `SQLite version` and `journal_mode` at startup. That speeds up self-hoster bug reports.
- The admin "failed jobs" view from architecture.md §8 is the most useful form of observability for a single user.

### Gaps
- I didn't research current Sentry Bun SDK or OpenTelemetry-on-Bun status.

---

## Dev environment

### Takeaway
`bun --hot src/server/main.ts` runs the API, the SPA with HMR, and the worker in one process. Add `tsr watch` only if you adopt file-based routing. A `bun run seed` script imports a bundled OPML of stable public feeds. No local HTTPS is needed.

### Cited Findings
- `Bun.serve({ development: { hmr: true, console: true } })` gives browser HMR and browser console logs in the terminal. — [Bun fullstack docs](https://bun.com/docs/bundler/fullstack)
- `tsr watch` can run alongside the dev server from package.json scripts. — [TanStack Router CLI docs](https://tanstack.com/router/latest/docs/installation/with-router-cli)

### Inferences
- `bun --hot` reloads server modules in place without restarting the process, so the worker loop and `setInterval` scheduler must be idempotent on reload. Guard them with a `globalThis.__elsewhereWorker` singleton, or use `bun --watch` (full restart) for the server and rely on browser HMR for the SPA. `--watch` is the simpler choice and avoids duplicate workers.
- Seed with an OPML fixture (e.g. 10–20 high-volume feeds) plus recorded HTTP fixtures for offline tests, matching architecture.md §12's recorded-fixture approach.
- Point `DATABASE_PATH` at `./.data/dev.db` (gitignored). Add `bun run db:reset` to delete it and re-run migrations and the seed.

### Gaps
- I didn't verify Bun's documentation on `--hot` semantics for long-lived timers and intervals in this pass.
