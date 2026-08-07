# Research 02 — Build tooling & module system

Interprets against the provisional perf budget (ticket 09): per-shell-page JS <= ~250KB gzip, game bundle code-split, no per-frame runtime cost.

## Current state (evidence)

- 14 HTML pages, 2–12 `<script>` tags each, loaded synchronously in `<head>`. Shared plain scripts: `accounts.js` (11 pages), `api.js` (8+), `downloader.js`/`settings.js`/`launchgame.js`/`jsloader.js`/`addbeatmaplist.js` (7 each).
- `jsloader.js` is a hand-rolled delayed loader: waits on 4 deps via a global counter (`window.aaaaa`), then injects `require.js`, which AMD-loads the game via `define([...])`. `require.config` sets paths/shims + `urlArgs: "bust=" + Date.now()` (cache-busts **every** load — no long-term caching).
- Globals everywhere: `window.game`, `window.gfx`, `window.playback`, `window.Osu`, `window.liked_sid_set`, `window.WebosuAPI`.

## Options

| Tool | Dev HMR | Prod bundle | Code-split Pixi | Runtime cost on game loop | Fit |
|---|---|---|---|---|---|
| **Vite** (esbuild dev + Rollup prod) | fast | small, hashed, long-cache | yes | none | **Recommended** |
| esbuild (lib/build) | manual | small | yes (manual) | none | good, less dev ergonomics |
| Rollup (CLI) | none | small | yes | none | fine for prod, poor dev |
| no-bundler native ESM | none | none | poor (many requests) | none | **reject** — hundreds of uncached requests hurt the floor device on slow links |

A bundler adds **zero** per-frame runtime cost (it is build-time only); the only perf risk is over-bundling the critical path, which code-splitting avoids. So the build choice is not FPS-sensitive as long as the game bundle is split from shell bundles.

## Recommendation

**Vite** for dev + prod, MPA mode (`build.rollupOptions.input` = one entry per HTML page), targeting the in-place mode (ticket 07).

### Migration ordering (concrete)

1. **Add Vite + `package.json` (real one) at repo root.** Move the four heavy `js/lib` blobs to npm where possible (`pixi.js@6` first to unblock ESM imports while keeping v6; `fflate` replacing zip.js; `localforage` via npm). Keep `inflate.js`/`z-worker.js`/`mp3parse`/`sound.js` as vendored until their replacement tickets land.
2. **Convert the shared shell scripts to ESM** (`export function addBeatmapList(...)` in `addBeatmaplist.js`, etc.). Create a small entry per shell page (`src/pages/index.ts` importing only what that page needs). Vite dev serves them with HMR.
3. **Convert the AMD game modules to ESM.** `define([...], function(...){})` -> `import ... from ...`. `require.config` paths/shims drop away (real imports + npm packages). The `underscore` shim disappears once underscore is dropped (ticket 06).
4. **Replace `jsloader.js`'s delayed bootstrap + `urlArgs` cache-bust** with Vite's module graph + content hashes. Delete `jsloader.js` and `require.js`. This is the single biggest dev/perf hygiene win — proper long-cache filenames instead of cache-busting every asset on every load.
5. **Code-split the game bundle.** Dynamic `import("./game")` on the game page so shell pages never fetch Pixi; the game page never fetches shell UI (matches ticket 03's isolation invariant). Configure manual chunks for Pixi vs game logic vs zip/fflate so they cache independently.
6. **Keep the PWA shell precache list in sync** — `sw.js`'s `SHELL` array and the build output must agree (Vite emits hashed filenames; switch the SW to a manifest or precache the unhashed entry HTML + a hashed asset list).

### Map of `require.config` / AMD -> ESM

- `paths: { underscore: "lib/underscore", sound: "lib/sound" }` -> `import _ from "underscore"` (then drop) / `import { sounds } from "./lib/sound.js"`.
- `shim: { underscore: { exports: "_" } }` -> removed (native ESM export).
- `urlArgs: "bust=..."` -> deleted; Vite content-hashed filenames + `Cache-Control: immutable`.
- `define(["osu","underscore","sound","playback"], fn)` -> `import Osu from "..."; import _ from ...; ...` then `export` the result.

Cite primary sources: Vite docs (MPA build, manual chunks, dynamic import), esbuild/Rollup docs.
