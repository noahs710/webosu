# 02 — research: build tooling & module system

Type: `wayfinder:research`
Blocked by: `09-grilling-perf-budget.md`.

## Question

What replaces the current loader stack — require.js (AMD) + the hand-rolled delayed `jsloader.js` chain + `urlArgs` cache-busting + global `window.*` state — and how?

Evaluate ESM + **Vite**, **esbuild** (lib build), **Rollup**, and a **no-bundler native-ESM** option. For each report: dev ergonomics / HMR, production bundle size, first-load time on the floor device, code-splitting of the heavy `js/lib` blobs (pixi, inflate, zip, underscore), and — critically — whether it adds any per-frame runtime cost or DOM overhead that could touch the game loop.

Output a recommended target plus a concrete migration ordering (what converts first, how AMD `define([...])` maps to ESM `import`, how `require.config` paths/shims map, and how the four-script `<head>` bootstrap in each HTML page changes). Cite primary sources (Vite/esbuild/Rollup docs).


## Resolution

Findings: `research/02-build-tooling.md`. **Recommendation:** Vite (esbuild dev + Rollup prod) in MPA mode, one entry per HTML page. Convert shared shell scripts and the AMD game modules to ESM; delete `jsloader.js` + `require.js` + the `urlArgs` cache-bust (replaced by content-hashed long-cache filenames); code-split the game bundle so shell pages never fetch Pixi; sync the PWA precache list with build output. Zero per-frame runtime cost; the only perf risk is over-bundling, avoided by code-splitting.


## Addendum (scope = full-stack)

The build now has two sides sharing one repo:
- **Frontend:** Vite (esbuild dev + Rollup prod), MPA mode, lit components on shell pages, the game engine as a separate code-split entry (isolation invariant).
- **Backend:** a Fastify app built from ESM/TypeScript, deployable as the single Fly.io process (Dockerfile already `node:22-slim`, mounted volume for `node:sqlite`). `db.js`/`validate.js`/`pp.js` port as plain ESM modules. Delete `jsloader.js`/`require.js`/`urlArgs` as before. The PWA precache (`sw.js`) moves to a build-manifest-driven hashed list, and the server serves the Vite-built static assets with long-cache headers.
