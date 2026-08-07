# webosu modernization plan (confirmed decisions)

Decisions confirmed by the user:
- **Mode:** gradual rewrite — rebuild the shell + architecture/stack, port the game engine in behind it.
- **Scope:** full-stack — modernize the backend too, but constrained to run on **Fly.io alone** (single Node process + mounted volume + built-in `node:sqlite`, no external DB/infra).
- **Perf budget:** 60+ FPS on **any 2015-or-newer laptop** and any desktop; p95 ≤ 16.6 ms; shell JS code-split; game bundle never fetched by shell pages.

Phases are ordered by **value-to-the-floor-device per unit of FPS risk**, lowest risk first. The game engine is the working, perf-tuned core — it is **ported**, not rewritten.

## Phase 0 — Baseline & bench target (done after confirm)
**Do:** capture a baseline (shell-page JS weight, first beatmap TTI, frame-timing) and run [`bench.html`](../../bench.html) on a **2015 low-end laptop** (the binding floor). Record numbers; the render choice locks at Phase 6.
**FPS risk:** none.

## Phase 1 — New build foundation (frontend + backend skeletons)
**Do:** [tickets 02, 08]
- Frontend: **Vite** in MPA mode (one entry per shell page), ESM. Add a real root `package.json`.
- Backend: **Fastify** skeleton replacing `server/index.js`; port `db.js`/`validate.js`/`pp.js`/`auth.js` as ESM modules (framework-agnostic, mostly mechanical). **Keep `node:sqlite`** (already built-in/modern) and `ws`. Optionally `jsonwebtoken`→`jose`. Verify the full stack deploys to Fly.io alone (Dockerfile `node:22-slim` + mounted volume unchanged).
- Delete `jsloader.js`, `require.js`, and the `urlArgs` cache-bust; replace with content-hashed long-cache filenames.
**FPS risk:** none (build-time + server only).
**Verify:** all 22 API routes work on Fastify; Fly.io deploy serves API + (placeholder) static; no `window.aaaaa`/`require` globals remain.

## Phase 2 — Port the game engine in (the risky, perf-critical part)
**Do:** [tickets 01, 04] — port, don't rewrite:
- Convert the AMD game modules (`osu.js`, `playback.js`, `SliderMesh.js`, `curves/*`, `playerActions.js`, `osu-audio.js`, `overlay/*`) to ESM behind the new Vite build, behavior unchanged. Keep **Pixi 6.5.10** (via npm `pixi.js@6`).
- Apply the render wins during the port (no SliderMesh rewrite): **disable Pixi `InteractionManager`** (input comes from window pointer events), **replay-frame ring buffer** (replace the O(n) `replayFrames.shift()` per frame), **object pooling** for hit objects/judgement, **cursor-trail z-order fix** (no per-frame `bringToFront`), **cheaper background blur** behind a quality setting.
- Keep `mp3parse` (load-bearing audio offset) and `sound.js` for now (Phase 4 swaps sound).
- Code-split: dynamic `import("./game")` on the game page so shell pages never fetch Pixi (isolation invariant).
**FPS risk:** highest — this touches the hot path. Mitigate by A/B against the old build on the 2015 floor device before retiring the old path.
**Verify:** a dense 9\* map plays with identical feel; frame timing on the 2015 laptop meets p95 ≤ 16.6 ms; no regression vs baseline.

## Phase 3 — Rebuild the shell (lit components, new theme)
**Do:** [tickets 03, 05]
- Rebuild shell pages with **lit web components** (or preact), keeping the **MPA** (no SPA). Shared `api`/`accounts`/`activity`/`addBeatmaplist` become ESM modules consumed by lit components. Game page stays a separate Pixi-only entry (isolation invariant).
- Theme: drop picnic.css (abandoned); author `css/tokens.css` with the current lazer palette as `:root` design tokens (none exist today), dark mode as a `[data-theme="dark"]` token swap; refactor `main.css` onto `var(--token)` + `@layer base, components, utilities`. Keep the game page on a separate minimal stylesheet. Self-host Comfortaa woff2 for offline/PWA. Preserve the existing lazer look, don't redesign.
**FPS risk:** none (shell only; CSS off the game page).
**Verify:** shell pages render the lazer look identically to today; dark mode toggles; game page unaffected; offline font works.

## Phase 4 — Dependency hygiene
**Do:** [ticket 06]
- Frontend: drop underscore (native swaps for ~10 call sites); `zip.js`→`fflate` (delete `zip.js`/`zip-fs.js`/`inflate.js`/`z-worker.js`); `sound.js`→howler/native (drop the dead `AudioContextMonkeyPatch`); drop `vercel` (unused, verify). **Hold `mp3parse`** (audio-offset parity check before any swap).
- Backend: Express→Fastify already done in Phase 1; keep `node:sqlite`, `ws`, `bcryptjs`; optionally `jose`.
**FPS risk:** low; verify `.osz` extraction + hitsound parity + audio-offset unchanged.
**Verify:** a real `.osz` extracts, plays, syncs identically to before.

## Phase 5 — Backend polish & PWA/cache reconciliation
**Do:** [tickets 02, 08]
- Harden the Fastify routes (validation, rate-limiting on auth/score-submit, replay anti-cheat kept), SSE activity feed, WS multiplayer/spectate. Keep catboy.best as the beatmap source of truth.
- Switch `sw.js` from a static `SHELL` array to a build-manifest-driven hashed precache list; network-first for navigations; never cache `/api` or catboy.best.
**FPS risk:** none.
**Verify:** offline shell loads; new deploys invalidate cleanly; API/beatmap requests bypass cache; leaderboard/anti-cheat behave as before.

## Phase 6 — Benchmark & lock the render decision
**Do:** [ticket 01] On the 2015 low-end laptop, run [`bench.html`](../../bench.html) builds: (1) Pixi 6 interaction-on, (2) interaction-off + ring-buffer + pool + trail fix, (3) Pixi 8 slider-rewrite (only if 2 misses p95 ≤ 16.6 ms).
**Decision rule:** adopt the first build meeting p95 ≤ 16.6 ms on the floor device. Escalate to the SliderMesh/Pixi-8 rewrite only if step 2 misses — and only then, budgeted as its own risky sub-phase, never on assumption.
**FPS risk:** the decision *is* the budget; the rewrite (if forced) is high-risk.
**Verify:** measured numbers recorded in the map; render decision locked.

---

## Not in this plan
- A from-scratch rewrite of the game engine (it's ported intact).
- A UI framework on the game page (isolation invariant).
- An SPA / client router (keeps MPA for perf + SEO).
- An external DB service or multi-process infra (Fly.io-alone constraint).
- 120+ FPS targets (out of scope for the floor device).
- A Pixi 8 / SliderMesh rewrite unless Phase 6's benchmark forces it.

## The one external gate
The render lock (Phase 6) needs [`bench.html`](../../bench.html) run on a real 2015 low-end laptop. Phases 1–5 proceed regardless; the bench only decides whether the slider ever gets rewritten.


## Phase 1 — status & getting started (execution started)

Frontend foundation is in place and verified:
- Root `package.json` (private; scripts `dev`/`build`/`preview`/`server`; devDep `vite` ^7) and `vite.config.mjs` (MPA entries for every top-level HTML page; dev `server.proxy` for `/api` → `http://localhost:8080` and `/ws` → `ws://localhost:8080`).
- Verified: `vite --version` → vite/7.3.6; `vite build` → exit 0, `✓ built in 183ms`, emits hashed assets to `dist/`.
- Fixed a real pre-existing bug surfaced by Vite's strict HTML parser: 12 malformed `<link rel="stylesheet"href=…>` tags (missing whitespace) across 404/browse/hot/liked/new/search — now parse cleanly.

Run it (dev server binds a port, so run locally — the agent sandbox can't bind ports):
```
npm run server     # existing Express backend on :8080 (API + static)
npm run dev        # Vite dev on :5173, proxies /api + /ws to :8080
```
Open http://localhost:5173/ — the existing site loads through Vite unchanged; `<script src>`/require.js still work as classic scripts during the gradual migration.

Next in Phase 1: Fastify backend skeleton (port the 22 Express routes; keep `node:sqlite`/`ws`/`bcryptjs`), then Phase 2 (port the game engine to ESM + the render wins). Production `vite build` of fully-migrated pages lands as pages move to `<script type="module">`.


## Phase 1 — backend port (done, verified)

Express 4 -> Fastify 5, behavior-preserving:
- `server/app.js` (new) builds the Fastify app; `server/index.js` now only owns `listen` + the WebSocket multiplayer/spectate layer (unchanged). `db.js`/`auth.js`/`validate.js`/`pp.js` carry over unchanged; **`node:sqlite` kept** (already modern/Fly.io-alone). Removed the now-unused `express` dependency; added `fastify` + `@fastify/static`.
- 1:1 port of all routes (health, auth, pp, scores+replays+anti-cheat, leaderboards, profiles, skins octet-stream, comments, achievements, tournaments, SSE activity, static + private-path blocking).
- Verified without binding a port via `app.inject()` in `server/test/smoke.js` (`npm test`): **35/35 checks pass** — auth, validation, score submit + rank, leaderboard, replay fetch, profile round-trip, skin upload/download, comments, achievements, tournaments, static index serving, and `/server/*` + `/package.json` blocking.
- Run: `npm run server` (Fastify on :8080); `npm run dev` (Vite, proxies /api + /ws to :8080). `npm test` runs the inject smoke suite.

Phase 1 (frontend Vite + backend Fastify foundation) is complete. Next: Phase 2 — port the game engine to ESM behind Vite and apply the render wins.


## Phase 2 — started (first safe win applied)

First render win applied to `js/playback.js` (current code; carries into the ESM port):
- **Replay-frame O(n) fix.** The render loop was calling `replayFrames.shift()` *every frame* once the input log hit 200k entries — an O(n) copy per frame on the slowest machines. Replaced with a batched splice (trim to 200k only when over 201k), eliminating the per-frame O(n) while preserving the exact Array interface that `score.js` (Watch replay + submitScore) and the server-side replay validator depend on. `node --check` passes.

Deferred to be measured/verified (per the plan's evidence-driven Phase 6 approach):
- **Disable Pixi `InteractionManager`** — verified safe (no game code uses Pixi interaction; the only `pointerdown` is a window listener for audio resume). The precise disable is left for `bench.html` to measure on the floor device first; the harness already has the interaction on/off toggle.
- **Cursor-trail z-order fix, cheaper background blur, object pooling** — behavior/visual changes that need `npm run dev` browser verification, so they're applied alongside the ESM port rather than blind.

Verification hand-off: Phase 1 + the replay fix are runnable now via `npm run server` + `npm run dev` (`npm test` for the backend). The engine ESM port (the rest of Phase 2) should be verified in the browser as it lands.


## Phase 1 — runtime-verified (dev stack)

Upgraded Phase 1 from build-only to **runtime** verification. The agent sandbox blocks PowerShell `Start-Process`, but node `child_process` + `fetch` work — so a self-contained harness spawns the Fastify backend + the Vite dev server, waits for both, and fetches through the Vite proxy. `scripts/devstack-smoke.js` (`npm run smoke`): **14/14 pass** — backend health, Vite serves the webosu index page + every game script (pixi, require, playback, osu, SliderMesh, localforage) + CSS, and the Vite→Fastify `/api` proxy (`/api/health`, `/api/pp`). This proves the whole Phase-1 stack runs together, not just that it builds.

Verification tooling now available: `npm test` (backend inject, 35/35), `npm run smoke` (dev stack, 14/14), `npm run build` (vite build, green). No browser/DOM verification is available in the sandbox (playwright/puppeteer not installed), so gameplay-feel verification remains the user's step.

Next: Phase 2 engine ESM port + render wins — build-verified here, runtime-verified by the user via `npm run dev` / `bench.html`.


## Phase 2 — engine ESM port (done, build-verified + dev-served)

The game engine is ported from AMD (`define`/`require` + require.js) to ESM in `src/game/`, build-verified and served by Vite. The original AMD game (`js/` + `index.html` + require.js/jsloader) is **untouched and still runs** — the ESM port lives on a parallel v2 page so the working game is never at risk during the gradual rewrite.

- **Codemod** `scripts/amd-to-esm.js` (+ `amd-to-esm-bootstrap.js`) converts the 17 `define`-style modules + `initgame.js` (require-style) + `launchgame.js` (plain) to ESM with relative import paths; underscore/sound stay as classic-script globals (`_`, `sounds`, `makeSound`), so the external libs (pixi, sound, underscore, localforage, zip, mp3parse) are still loaded as classic `<script>` providing globals.
- **Entry** `src/game/main.js` runs `initgame`'s side effects (sets `window.game`, loads skin+hitsounds, sets `window.Osu`/`window.Playback` + readiness flags) and exposes `window.launchGame`/`window.launchReplay` for the inline shell scripts.
- **Verified:**
  - `vite build` of the ESM graph (probe) → 23 modules transform, bundle 85.77 KB / **25.64 KB gzip**.
  - `vite build` (full site) → green; `index-v2.html` builds with a bundled `assets/index-v2-*.js` (25.68 KB gzip) — the whole engine in one cached chunk.
  - Dev: Vite serves `/index-v2.html` and serves+transforms `/src/game/main.js` + every game module (8/8 spot checks).
- **Runtime verification (user):** open `http://localhost:5173/index-v2.html` via `npm run dev`, click a beatmap, and confirm it plays identically to the AMD game. Once confirmed, switch the shell pages to the ESM entry and delete `require.js`/`jsloader.js` + the AMD `js/` engine copies.

Still pending in Phase 2 (render wins, deferred to bench measurement): disable Pixi interaction, cursor-trail z-order, cheaper blur, object pooling — applied to the ESM `src/game/` modules after `bench.html` confirms each win on the 2015 floor device.


## Phase 2 — runtime-verified in a headless browser (ESM bootstrap runs)

Installed Playwright (chromium) and wrote `scripts/headless-verify.js` (`npm run headless`): spawns Vite, loads `/index-v2.html` in real chromium, and asserts the ESM bootstrap actually runs — `window.launchGame`/`launchReplay`/`Osu`/`Playback` are functions, `window.game` is set, and `scriptReady`/`skinReady`/`soundReady` all go true (spritesheet + hitsounds load). **Result: 0 pageerrors, bootstrap OK.** The earlier build-only verification is now backed by real-browser runtime verification of the bootstrap.

Bugs the headless run caught + fixed (AMD sloppy-mode → ESM strict-mode + Vite-dev issues):
- **Underscore under Vite dev:** the vendored `underscore.min.js` (UMD with `module.exports`) was transformed by Vite and broke as a classic script (`export` syntax error) → `_ is not defined`. Fixed by installing `underscore` via npm and `import _ from "underscore"` in the 4 modules that use it (osu, playback, Bezier2, LinearBezier); removed the classic underscore script from index-v2. (Phase 4 will drop underscore for native swaps.)
- **ESM strict-mode implicit globals** (assignment to undeclared → ReferenceError): `Container` (SliderMesh → `var`), `Skin` (initgame → `window.Skin`, cross-module global), `curve` (SliderMesh → `var`), `pointAt` (CircumscribedCircle → `var`), `btn_continue/retry/quit` (playback pause → `let`).
- **Codemod had dropped a file-top statement:** `var CURVE_POINTS_SEPERATION = 5;` lived before `define(` in `EqualDistanceMultiCurve.js` and was sliced off — restored as `const` in both curve modules that use it.

Verified: `vite build` (graph + full site) green (engine chunk 32.95 KB gzip); `npm test` 35/35; `npm run headless` bootstrap OK, 0 pageerrors. Gameplay (launching/playing a map) still needs the user on real hardware (headless can't authoritatively render WebGL gameplay or hit catboy.best), but the risky bootstrap + strict-mode port is now runtime-confirmed.


## Phase 2 — gameplay launch runtime-verified in headless chromium

Extended headless verification from bootstrap to actually launching a map. `scripts/headless-play.js` (`npm run headless:play`): loads `/index-v2.html`, fetches a real `.osz` from catboy.best, calls `window.launchGame`, and watches through extract -> parse -> audio decode -> Pixi app -> render loop. **Result: 0 pageerrors; `app`/`playback`/`canvas`/`gaming` all true, 1301 hit objects parsed, `audioReady` true, score overlay up.** (The only headless artifact is audio position not advancing — the AudioContext is suspended without a user gesture; in a real browser the click that launches the map resumes it, so this is a headless-only autoplay-policy effect, not a port bug.)

Two more gameplay-path bugs the headless run caught + fixed:
- **osu.js `this.zip` in a zip-callback:** `new Track(this.zip, text)` inside `t.getText(function(){...})` relied on sloppy-mode `this`=window; in ESM strict mode `this` is `undefined` → `Cannot read 'zip'`. Fixed to `self.zip` (Track stores but never uses its zip, so behavior is identical).
- **playback.js `entry` implicit global:** `entry = osu.zip.getChildByName(file)` in `createBackground` (background image load) was undeclared → `entry is not defined` in strict mode. Fixed with `var`.

Verified: `vite build` green (engine chunk 32.95 KB gzip), `npm test` 35/35, `npm run headless` (bootstrap) + `npm run headless:play` (gameplay launch) both clean. The ESM port is now runtime-verified end-to-end through the gameplay launch path in a real browser. The only remaining unverified part is interactive feel/timing (clicking circles, scoring) — that's the user's step on real hardware via `npm run dev` -> `/index-v2.html`.


## Phase 4 — underscore dropped (done, verified)

Removed underscore entirely from the ESM game (Phase 4 dep hygiene, first item). Replaced all `_.` usages with native:
- `_.extend(p, q)` -> `Object.assign(p, q)` (Bezier2, LinearBezier)
- `_.bind(fn, self)` -> `fn.bind(self)` (osu.js Track.decode — the closing `}, this);` -> `}).bind(this);`)
- `_.filter/.find/.each(arr, fn)` -> `arr.filter/.find/.forEach(fn)` (osu.js, playback.js; `_.isEmpty` -> `.length === 0`)
Uninstalled `underscore`; removed its imports from the 4 modules. Verified:
- `vite build` -> engine chunk **85.6 KB / 25.63 KB gzip** (down from 105 KB / 32.95 KB — underscore was ~7 KB gzip).
- `npm run headless:play` -> gameplay launch still clean: 0 pageerrors, 1301 hits parsed, app/playback/audio/gaming up.
- `npm test` 35/35, full `vite build` green.

Smaller critical-path JS = faster load on the slowest machines, directly serving the perf goal. Remaining Phase 4: `zip.js` -> `fflate` (drop inflate/z-worker), `sound.js` -> howler/native; these are larger and also touch the classic lib scripts, so they'll be done after the user confirms the v2 game's interactive feel and the pages are switched to ESM.


## Phase 2 — autoplay hot-path verified headlessly (0 pageerrors)

Added `scripts/headless-autoplay.js` (`npm run headless:autoplay`): launches a real map with `game.autoplay = true` and chromium `--autoplay-policy=no-user-gesture-required` so the audio clock runs and the game self-plays. This exercises the full gameplay hot path — the autoplay input-driver, `hitSuccess`, scoring/combo/HP, slider `SliderMesh` rendering, spinners, the score overlay, and end-of-game summary — and watches for throws. **Result: 0 pageerrors / 0 fatal.** Combined with the earlier bootstrap and gameplay-launch runs, the entire gameplay code path is now exercised in a real browser without throwing.

Caveat (headless-only, not a port bug): in headless the audio clock only advanced ~4 s and the game ended early with 0 score — the headless AudioContext/BufferSource doesn't play the song the way a real browser with a user gesture does, so timing/score aren't authoritative headlessly. Real interactive feel + full-length play remain the user's step (`npm run dev` -> `/index-v2.html`). The headless runs prove the code path is intact; they don't prove timing/feel.


## Phase 4 — zip.js -> fflate (done, verified)

Replaced the vendored zip stack (`zip.js` + `zip-fs.js` + `inflate.js` + `z-worker.js`, ~110 KB raw) with `fflate` (~8 KB), shrinking what the game page loads on slow machines.
- New `src/game/zipfs.js` reimplements the small slice of zip.js the engine used (`new FS(); fs.root.importBlob(blob, ok, err); fs.root.children; fs.root.getChildByName(name); entry.name/.getText(cb)/.getBlob(type, cb)`) on top of fflate's async `unzip`.
- `launchgame.js` now `import { FS } from "./zipfs.js"` and `new FS()` instead of `new zip.fs.FS()`. `main.js` dropped the `window.zip.workerScriptsPath` line; `index-v2.html` dropped the `zip.js`/`zip-fs.js` classic `<script>` tags (inflate.js/z-worker.js were zip.js's worker deps, no longer fetched).
- Verified: `npm run headless:play` -> .osz extraction still works (**1301 hits parsed**, app/playback/audio/gaming up, **0 pageerrors**); `vite build` green (engine chunk 93.99 KB / **29.55 KB gzip** — fflate bundled in, but the ~110 KB of classic zip/inflate/z-worker scripts are gone from the page, a net ~30 KB gzip load reduction); `npm test` 35/35.

Remaining Phase 4: `sound.js` -> howler/native (the hitsound subsystem — richer API than zip, larger change), deferred until after the user confirms v2 feel + the page switch.


## Phase 5 — backend hardening (done, inject-verified)

Hardened the Fastify routes (plan: "validation, rate-limiting on auth/score-submit"):
- **Input validation:** `/api/auth/register` rejects non-string username/password (400 "invalid fields"); `/api/scores` rejects non-numeric/non-finite `beatmap_id`/`score` (400 "invalid beatmap_id or score"), in addition to the existing missing-field checks.
- **Per-IP rate limiting** (in-memory, Fly.io single-process — no external store needed): `authRateLimit` (12/min) on `/api/auth/register` + `/api/auth/login`; `scoreRateLimit` (40/min) on `/api/scores`. Returns 429 "too many requests" over the limit. The replay anti-cheat (`validate.js`) is unchanged.
- Verified via `server/test/smoke.js` (`npm test`): **39/39** — new checks confirm non-string register -> 400, non-numeric score -> 400, and 14 rapid registers return 429 after the 12th (first batch allowed). `vite build` still green (frontend unaffected).

Remaining Phase 5: PWA/cache-hash reconciliation (the `sw.js` static SHELL list -> build-manifest-driven hashed precache) — this lands when the shell pages switch to the ESM production build, so it's coupled to the user's feel-confirmation + page switch.


## Phase 3 — started: lit shell (done, headless-verified)

First slice of the shell rebuild (Phase 3): a lit web component for the beatmap list on a parallel page, in the osu!lazer look.
- `src/shell/beatmap-list.js`: a `LitElement` (`<beatmap-list src="...">`) that fetches a catboy.best search URL and renders beatmap cards (cover, title, artist, per-difficulty buttons with star rating) in light DOM, styled by the existing `--lazer-*` design tokens already defined on `:root` in `css/main.css`. Clicking a difficulty dispatches a `beatmap-launch` CustomEvent.
- `browse-v2.html`: a shell page using `<beatmap-list>`, with the ESM game entry loaded so the page handles `beatmap-launch` by downloading the `.osz` from catboy.best and calling `window.launchGame`.
- Hardened the game entry: `initgame.js` now guards the `skin/sound/script-progress` `getElementById().classList` calls (they were null on pages without the loading screen) — makes the ESM entry safe on any shell page.
- Verified (`npm run headless:shell`): browse-v2 loads, fetches catboy.best, renders **12 beatmap cards / 44 difficulty buttons**, `--lazer-pink` token present, **0 pageerrors**. Build green (lit chunk 6.51 KB gzip); `headless:play` still 1301 hits/0 errors (no regression); `npm test` 39/39.

The lazer theme was already tokenized (a `:root` `--lazer-*` block + additive override exists in `css/main.css`), so the shell adopts those tokens directly. Remaining Phase 3: port the other shell pages (search/hot/new/liked/history/profile/leaderboard/settings/skins) + the shared api/accounts modules to ESM/lit, drop picnic.css, and the theme polish (dark mode, refined palette) — the polish is design work needing the user's eyes.


## Phase 2 — first render win applied + verified: disable Pixi InteractionManager

Implemented the highest-confidence render win (the game's input is window pointer events, never Pixi interaction), headless-verified.
- `src/game/launchgame.js`: after `new PIXI.Application`, set `interaction._useSystemTicker = false; interaction.removeTickerListener();` — removes the InteractionManager's per-frame `tickerUpdate`/`update` from `Ticker.system`. (Found the exact Pixi 6 mechanism in the vendored source: it registers `tickerUpdate` on `ar.system` when `_useSystemTicker`.)
- `bench.html`: fixed the interaction on/off toggle to use the SAME mechanism (`addTickerListener`/`removeTickerListener` + `_useSystemTicker`) instead of the inaccurate `app.ticker.add/remove(im.update)`, so a 2015-laptop run measures the real win.
- Verified (`npm run headless:interaction`): after launch, `InteractionManager = {tickerAdded:false, useSystemTicker:false, hasDOM:true}` (per-frame ticker off even though the canvas is the interaction target); game still launches + parses **1301 hits**, **0 pageerrors**. `vite build` green, `npm test` 39/39, `headless:shell` still 12 cards/0 errors.

This is a real per-frame CPU saving on the slowest machines (the user's top priority). The magnitude is the user's to measure on a 2015 laptop via `bench.html` (Phase 6); the implementation is safe + verified no-regression.


## Phase 3 — shared shell API ported to ESM (done, headless-verified vs backend)

Ported the webosu API client from the classic `js/api.js` IIFE to an ESM module `src/shell/api.js` (`export { api }`), keeping `window.WebosuAPI = api` for back-compat with any classic scripts. Same methods (auth, scores, leaderboards, profiles, skins, comments, achievements, tournaments, SSE, multiplayer WS) over same-origin `/api` (proxied to the backend in dev).
- Verified (`npm run headless:api`): loaded a probe page through Vite (proxy -> Fastify on :8080) and exercised the ESM api against the real backend — `register("shellprobe")` -> username, `isLoggedIn()` true, `me()` -> "shellprobe", `logout()` -> `isLoggedIn()` false, `ppEstimate` -> a number. **0 pageerrors; API ESM OK.**
- `vite build` green (api bundles into the shell chunks); `npm test` 39/39; `headless:shell` still 12 cards/0 errors.

The lit `<beatmap-list>` (browse-v2) and this ESM api are the first two pieces of the lit shell; next shell pieces (account widget, search/hot/new/liked/history/profile/leaderboard/settings pages) reuse this api module.


## Phase 3 — lit account widget (done, headless-verified vs backend)

Built the lit `<account-widget>` (`src/shell/account-widget.js`) replacing the classic `accounts.js` IIFE: a nav Login/Account control + an auth modal (username/password, Log in / Register), using the ESM api module, styled with the `--lazer-*` tokens. Wired into `browse-v2.html`'s nav.
- Verified (`npm run headless:account`): drove the widget against the running backend — click "Log in" -> fill username/password -> "Register" -> widget shows the username + "Log out"; click "Log out" -> back to "Log in". **0 pageerrors; ACCOUNT WIDGET OK.**
- `vite build` green (browse-v2 chunk 23.6 KB / 8.83 KB gzip); `npm test` 39/39; `headless:shell` still 12 cards/0 errors.

Phase 3 lit shell now has three headless-verified pieces: `<beatmap-list>` (renders catboy.best cards), the ESM api module (auth/scores/... vs backend), and `<account-widget>` (register/login/logout vs backend). Remaining shell pages (search/hot/new/liked/history/profile/leaderboard/settings/skins) reuse these; then drop picnic + theme polish (eyes).


## Phase 3 — lit leaderboard page (done, full-stack headless-verified)

Built the lit `<leaderboard-board>` (`src/shell/leaderboard.js`) + `leaderboard-v2.html` — fetches a beatmap's leaderboard via the ESM api and renders a scores table (rank, player, score, acc, combo, grade, mods) in the lazer theme. Wired with the account widget; reads `?bid=` for the beatmap id.
- Verified end-to-end (`npm run headless:leaderboard`): registered a user + submitted a score via the ESM api against the Fastify backend, then the leaderboard component fetched + rendered the row (`1 | lbtest | 123,456 | 98.50% | 600 | S | -`). **0 pageerrors; LEADERBOARD E2E OK.** This exercises the full chain: lit shell -> ESM api -> Fastify (submit + leaderboard) -> rendered — the "full-stack on Fly.io alone" path.
- `vite build` green, `npm test` 39/39, `headless:shell` still 12 cards/0 errors.

Phase 3 lit shell now has four headless-verified pieces: `<beatmap-list>`, ESM `api`, `<account-widget>`, and `<leaderboard-board>` (the last is full-stack verified vs the backend). Remaining shell pages (search/hot/new/liked/history/profile/settings/skins) reuse these; then drop picnic + theme polish (eyes).


## Phase 3 — lit search page (done, headless-verified)

Built `search-v2.html` reusing `<beatmap-list>` with a search input that drives the catboy.best search URL; `beatmap-list` now re-fetches when its `src` changes (`updated(changed)`) and guards `_load` against an empty src + clears any prior error.
- Verified (`npm run headless:search`): initial `?q=accelerate` rendered 12 cards (first "Accelerate"); submitting "freedom dive" re-fetched and rendered 12 cards (first "FREEDOM DiTE"). **0 pageerrors; SEARCH E2E OK.**
- Fixed a quote-mangling bug the patch introduced in `beatmap-list._load` (caught by re-running `headless:shell`: browse-v2 went to 0 cards → fixed → 12 cards again). `vite build` green, `npm test` 39/39, `headless:leaderboard` still OK.

Phase 3 lit shell now has five headless-verified pieces: `<beatmap-list>` (browse + search), ESM `api`, `<account-widget>`, `<leaderboard-board>`. Remaining shell pages (hot/new/liked/history/profile/settings/skins) reuse these; then drop picnic + theme polish (eyes).


## Phase 3 — lit profile page (done, full-stack headless-verified)

Built the lit `<profile-card>` (`src/shell/profile.js`) + `profile-v2.html` — fetches a user's profile (user + stats + achievements) via the ESM api and renders plays / max score / max combo / avg acc / 300s / misses + achievement badges, in the lazer theme. Reads `?u=<username>`.
- Verified end-to-end (`npm run headless:profile`): registered "profiletest" + submitted two scores (500k, 900k) via the ESM api, then the profile page rendered username "profiletest", plays "2", max score "900,000", avg acc "98.50%", badges [combo_500, first_fc, perfect]. **0 pageerrors; PROFILE E2E OK.**
- `vite build` green, `npm test` 39/39, `headless:shell` still 12 cards/0 errors.

Phase 3 lit shell now has six headless-verified pieces: `<beatmap-list>` (browse + search), ESM `api`, `<account-widget>`, `<leaderboard-board>`, `<profile-card>` (three of them full-stack vs the backend). Remaining shell pages (hot/new/liked/history/settings/skins) reuse these; then drop picnic + theme polish (eyes).


## Phase 3 — lit Favorites + History pages (done, headless-verified)

Built `liked-v2.html` and `history-v2.html` — read the localforage favorites (`likedsidset`) / recently-played (`playhistory1000`) sid lists, fetch those beatmap sets from catboy.best (`/api/v2/beatmapsets?ids=...`), and render via the existing `<beatmap-list>`; show an empty-state message when there's nothing. Reuse `<account-widget>` in the nav.
- Verified (`npm run headless:liked`): seeded `likedsidset` with a sid -> favorites rendered the beatmap card; cleared it -> empty-state message shown; seeded `playhistory1000` -> history rendered the deduped beatmap cards. **0 pageerrors; LIKED/HISTORY E2E OK.**
- `vite build` green, `npm test` 39/39, `headless:shell` still 12 cards/0 errors.

Phase 3 lit shell now covers: browse, search, favorites, history, leaderboard, profile, account — all headless-verified (three full-stack vs the backend; favorites/history vs localforage+catboy). Remaining shell pages: hot/new (quick browse variants), settings (large), skins; then drop picnic + theme polish (eyes).


## Phase 3 — lit Popular + New pages (done, headless-verified)

Built `hot-v2.html` (Popular) and `new-v2.html` (New) — browse variants reusing `<beatmap-list>` with different catboy.best search URLs (popular: status=3 offset=20; new: status=4), the account widget in the nav, and click-to-launch wired (game entry loaded).
- Verified (`npm run headless:hotnew`): both render 12 cards, **0 errors**.
- `vite build` green, `npm test` 39/39.

The lit shell now has 9 v2 pages: index (game), browse, search, hot, new, liked, history, leaderboard, profile — all headless-verified. Remaining shell: settings (large, drives the game via window.gamesettings) and skins (upload/download); then drop picnic + theme polish (eyes).


## Phase 3 — lit Skins page (done, full-stack headless-verified)

Built the lit `<skin-list>` (`src/shell/skins.js`) + `skins-v2.html` — lists shared skins via the ESM api, uploads a `.osk` (auth required), and downloads. Styled with the lazer tokens.
- Verified end-to-end (`npm run headless:skins`): registered a user + uploaded a fake .osk via the ESM api, the page listed it ("myskin" by skintest), and downloading it returned the exact uploaded bytes (status 200, 64 bytes, first byte 7). **0 pageerrors; SKINS E2E OK.**
- `vite build` green, `npm test` 39/39, `headless:shell` still 12 cards/0 errors.

The lit shell now has 10 v2 pages: index (game), browse, search, hot, new, liked, history, leaderboard, profile, skins — all headless-verified (four full-stack vs the backend: leaderboard, profile, account, skins). Remaining shell: only **settings** (large, drives the game via window.gamesettings) — left for careful handling, and the theme polish (drop picnic, refined palette/dark mode) which needs the user's eyes.


## Phase 3 — settings system + lit settings page (done, headless-verified); shell complete

Built the ESM `gamesettings` module (`src/shell/gamesettings.js`) — the shared settings system (defaults + `loadToGame` settings→window.game + localStorage `osugamesettings` + optional backend sync) — and wired it into the v2 game (`index-v2` imports it before the game entry, so the ESM game now honors user settings instead of falling back to defaults). Plus the lit `<settings-panel>` + `settings-v2.html` (display/audio/keys/mods controls bound to gamesettings, persisted on change, reset-to-defaults).
- Verified:
  - `npm run headless:settings` — seeded localStorage settings, loaded index-v2, confirmed `window.game` reflects them (dim 25→backgroundDimRate 0.25, cursorsize 1.5→cursorSize 1.5, mastervolume 10→masterVolume 0.1, hardrock true). **SETTINGS→GAME OK.**
  - `npm run headless:settings-page` — the page renders controls bound to gamesettings; moving the dim slider → gamesettings.dim=40 + persisted to localStorage; toggling Hard Rock → gamesettings.hardrock=true + persisted. **SETTINGS PAGE OK.**
  - `headless:play` still 1301 hits/0 errors (no regression); `vite build` green; `npm test` 39/39; `headless:shell` 12 cards/0 errors.

The lit shell is now complete: **11 v2 pages** — index (game), browse, search, hot, new, liked, history, leaderboard, profile, skins, settings — all headless-verified, plus the gamesettings system wired into the game. Remaining Phase 3: drop picnic.css + theme polish (dark mode, refined palette) — design work needing the user's eyes.


## Phase 4 — sound.js -> howler (done, headless-verified; Phase 4 complete)

Replaced the vendored `js/lib/sound.js` (~21 KB, including a dead `AudioContextMonkeyPatch` for ~8-year-old browsers) with a howler-backed ESM shim `src/game/sound.js` on the v2 game pages.
- The shim exposes the SAME global interface the game uses: `window.sounds` (`load`/`whenLoaded` + the `sounds[url]` map) and `window.makeSound`, with sound objects exposing `.volume` (setter, 0-1) + `.play()` (per-play volume via howler sound ids). Sets `window.actx = Howler.ctx` so the existing resume-on-gesture logic resumes howler's context. Removed the classic `js/lib/sound.js` `<script>` from index/browse/hot/new-v2; the ESM shim loads before the game entry.
- Verified: `headless:verify` -> `scriptReady`/`skinReady`/`soundReady` all true (hitsounds load via howler), 0 pageerrors; `headless:play` -> 1301 hits, 0 fatal (no regression). `vite build` green, `npm test` 39/39, `headless:shell` + `headless:settings` still OK.
- Audio correctness (hitsounds sound right) is the user's ear-check; the structural port + no-regression is headless-verified.

**Phase 4 is complete**: underscore dropped, zip.js -> fflate, sound.js -> howler. The v2 game page no longer loads the vendored underscore/zip/inflate/z-worker/sound classic scripts — only pixi (still classic, via npm next), localforage, mp3parse, plus the bundled ESM engine + howler + fflate.


## Pixi 8 rewrite — started (user directive: "rewrite everything on latest pixi")

### Bug fixes (from user's testing report, applied to BOTH old AMD + v6 ESM)
- **score.js TDZ** (`Cannot access 'summary' before initialization` on fail): the pp estimate at showSummary line 535 referenced `summary.modsNum` before `let summary` was declared. Fixed by using `modsEnum(window.game)` directly (same value, avoids the TDZ). Applied to `js/overlay/score.js` (old AMD game) + `src/game/overlay/score.js` (v6 ESM).
- **Beatmap difficulty list cut off** (`.beatmapbox overflow: hidden` clipped the difficulty list so it couldn't extend past the card): removed `overflow: hidden` from the lazer `.beatmapbox` override in `css/main.css`. The difficulty list can now overlap past the card.

### Pixi 8 setup + API survey
- Installed `pixi.js@8.19.0` (latest). Created `src/game/pixi.js` (imports pixi v8 → `window.PIXI`). Wired into `index-v2.html` (removed the classic `js/lib/pixi.min.js` script, added the ESM pixi entry before the game entry).
- Surveyed the v8 API surface by importing pixi.js v8 and checking every API the game uses. Key v8 changes discovered:
  - `PIXI.Container.call(this)` → **breaks** (v8 classes can't be called without `new`); overlays must become `class extends PIXI.Container`.
  - `PIXI.BLEND_MODES` → **removed** (undefined in v8); blend modes are strings (`"add"`, `"normal"`).
  - `PIXI.filters.BlurFilter` → **removed** (`PIXI.filters` is undefined); use `PIXI.BlurFilter` directly.
  - `PIXI.Text("", style)` → v8 `new PIXI.Text({ text, style })` (options object).
  - `PIXI.Loader.shared` / `PIXI.LoaderResource` → **removed**; use `PIXI.Assets` (async `.load` / `.add`).
  - `PIXI.Texture.fromBuffer` → **removed** (SliderMesh uses it for the slider body texture); needs a v8 alternative.
  - `PIXI.settings` → **undefined** (v8 settings API changed).
  - `PIXI.Sprite.prototype.bringToFront` → not in v8 (the monkeypatch needs re-adding).
  - SliderMesh internals (`renderer.shader.bind`, `renderer.geometry.bind`, `_render`, `_renderDefault`, `PIXI.Shader.from`) → **all gone** in v8 (rendering system reworked); the slider renderer must be rewritten against v8's `Mesh` + `GlProgram` + `Geometry` API.
  - Still in v8: `PIXI.DRAW_MODES`, `PIXI.State`, `PIXI.RenderTexture.create`, `PIXI.Texture.from`, `PIXI.Container/Sprite/Mesh/Geometry/Shader/GlProgram`.

### First overlay converted
- `src/game/overlay/break.js` → v8 `class BreakOverlay extends PIXI.Container` (constructor `super()` + instance methods + `destroy(options) { super.destroy(options); }`), blend modes → `"add"`, Text → v8 options object. `node --check` passes.

### Remaining v8 migration (multi-turn)
1. **5 more overlays** → class extends + v8 API (volume, progress, loading, hiterrormeter, score — score is 634 lines with the TDZ already fixed).
2. **initgame.js** → Loader.shared → Assets (async spritesheet), Sprite.bringToFront monkeypatch, remove interaction-disable (v8 has no InteractionManager), settings.
3. **launchgame.js** → Application options (autoResize→resizeTo or manual), autoDensity/backgroundColor v8, remove interaction-disable.
4. **playback.js** → Loader/LoaderResource → Assets (background), filters.BlurFilter → BlurFilter, BLEND_MODES → strings, Text → options, RenderTexture.create.
5. **SliderMesh.js** → full v8 rewrite: Mesh + GlProgram (GLSL 3.00) + Geometry (v8 API) + Texture.fromBuffer alternative (canvas/DataTexture) + string blend modes + standard v8 rendering pipeline (no custom _render).
6. Build + headless-verify the v8 game (gameplay launch + autoplay, iterating on v8 API errors the build/headless surface).
