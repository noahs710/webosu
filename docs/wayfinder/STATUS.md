# webosu modernization — status & handoff

Snapshot of where the gradual rewrite stands, what is verified, and what
needs the user's hands/eyes/hardware. Built on top of the prior session's
work (commit a6662e2 + the 13 increments below).

## Done & headless-verified (code-only; no user input needed)

**Phase 1 — Vite + Fastify foundation + production build**
- `vite.config.mjs` MPA; Fastify backend (`server/app.js` inject-testable +
  `server/index.js` listen+WS). `server/test/smoke.js` 39/39.
- **Build pipeline** (c943085): `vite build` + `scripts/copy-static.mjs`
  (copies classic assets js/css/img/sw.js/sprites.json into dist/, normalises
  shell CSS to /css/, generates dist/sw.js with a precache manifest of the
  built files). Fastify serves dist/ when present (immutable 1y cache for
  hashed /assets/*, fallback to source for dev). Multi-stage Dockerfile
  builds the frontend + ships only dist/+server+prod deps.
- copy-static also copies hitsounds/ (fix 73a9dfb: it was missing -> the game had no hitsounds + replay-watch was broken in production; dev masked it because Vite serves hitsounds/ from the repo root). Audited all runtime asset paths (sprites.json, hitsounds/, img/, css/) — all now copied.
- Verified: `npm run build` green; Fastify serves dist/ (all 200);
  `headless:build` (browse-v2 12 cards + self-hosted font + 0 errors,
  index-v2 boots ESM/PIXI, legacy index loads require, all 0 pageerrors);
  `headless:build:play` 1301 hits / 0 pageerrors (game plays from bundled
  dist/); `devstack-smoke` 14/14.

**Phase 2 — ESM engine + Pixi 8 + render wins**
- All 19 game modules AMD→ESM→Pixi 8 (`src/game/`); `src/game/pixi.js`
  imports pixi.js@8 → window.PIXI. SliderMesh v8 two-pass-depth rewrite.
- Render win #1: Pixi InteractionManager disabled (inherent in v8).
- Render win #2 (f6dc3ae): cursor-trail z-order fix — cursor+trail in a
  dedicated cursorLayer, one re-parent/frame instead of N+1 per-sprite.
- Verified: `headless:play` 1301 hits / 0 pageerrors; `headless:autoplay`
  0 pageerrors; `headless:build:play` 1301 hits from dist/.
- Assessed the rest: replay-frame ring buffer N/A (driveReplay already uses
  an index cursor, no per-frame shift); cheaper background blur already
  load-time-only + gated behind backgroundBlurRate (default 0); object
  pooling — see "needs user" below.

**Phase 3 — lit shell + ESM**
- 11 v2 pages, all lit components (beatmap-list, account-widget, leaderboard,
  profile, skins, settings-panel) + ESM api/gamesettings. **The v2 shell is
  uniformly lit + ESM** — the home page (index-v2) was migrated last:
  lists→`<beatmap-list>` (a18f77c), dead classic scripts dropped (abd99dc),
  nav→`<account-widget>` + classic accounts/api removed (7d667b7), replay
  -watch inlined as ESM — no classic *shell* scripts remain on the home page
  (345cf64).
- Self-hosted Comfortaa variable woff2 (6 unicode subsets), Google Fonts CDN
  dependency removed (4332b91). Lazer palette extracted into css/tokens.css
  (single source) + [data-theme=dark] swap hook (31e3404).
- Verified: `headless:shell`/`headless:home` 0 pageerrors; `headless:replay`
  launchReplay available / 0 pageerrors; `headless:settings` settings→game
  wiring OK; computed font-family is Comfortaa with 0 gstatic requests.

**Phase 4 — dep hygiene**
- underscore→native, zip.js→fflate, sound.js→howler (prior session); vercel
  dropped (eac0d23, unused); deps now fflate/howler/lit/pixi.js. mp3parse +
  localforage held (load-bearing).

**Phase 5 — backend polish + PWA**
- Input validation + per-IP rate limiting on Fastify routes; SSE activity
  feed; WS multiplayer/spectate. PWA sw.js precaches the built shell.
- Verified: `npm test` 39/39; `test:realtime` (WS room join/chat/ready/cursor
  /host-only-start/leave + SSE stream-open + score broadcast) 15/15;
  `headless:offline` (PWA offline shell — SW precaches, offline reload serves
  the shell from cache, 0 fatal) ; `npm run build` SW precaches 119 files.
- Fix (296155c): ESM gamesettings server-sync wired to the ESM api (was
  window.WebosuAPI, timing-fragile on v2 pages).

**Phase 6 — commenced (user has the 2015 hardware); measurement tools ready**
- bench.html ported to Pixi 8 (d0eb687) + a copy-results button (one-liner:
  v8/sprites/mode/FPS/p50/p95/p99/drop) (32150a6).
- Game frame-timing perf HUD (32150a6, ae36a1c): the BINDING measurement per
  Phase 2's "frame timing on the 2015 laptop p95 <= 16.6ms". Toggle F3 or start
  via `?perf=1`; F4 copies/logs `window.__perfSummary` (map title + FPS/p50/
  p95/p99/drop + [BUDGET PASS]/[BUDGET FAIL] vs 16.6ms). Verified on dev AND the
  built dist/ (vite preview) — so it works whether you run `npm run dev` or
  `npm run build && npm run preview` (or the deployed site).
- SliderMesh v8 two-pass depth render audited as the prime optimization suspect
  if p95 misses (~2x draw calls + state changes per slider per frame); no
  speculative change (plan: optimize only if measured p95 > 16.6ms).

**Phase 6 run guide (on the 2015 laptop):**
1. Get the app running on the 2015 laptop — either:
   - `npm install && npm run dev` (Vite dev server on :5173), or
   - `npm install && npm run build && npm run preview` (serves the built dist/
     on :4173), or the deployed Fly.io site.
2. **bench.html** — open `/bench.html`, let it settle ~10s, click "copy results",
   paste the one-liner back.
3. **real game (binding)** — open `/index-v2.html?perf=1`, play a dense 9★ map
   through its busy sections, press **F4** mid-dense, paste the
   `webosu v8 perf · …` line back (it has the map + p95 + BUDGET PASS/FAIL).
- **p95 <= 16.6ms** → lock v8, Phase 6 done (goal complete).
- **p95 > 16.6ms** → optimize the SliderMesh two-pass depth render, re-measure.

## Needs the user (eyes / hardware / design) — not done by me

1. **Play the v2 game on real hardware** (`npm run dev` → /index-v2.html →
   click a beatmap → play). Confirm feel, especially SliderMesh v8 two-pass
   depth rendering (highest-risk visual piece). This is ALSO the Phase 6
   real-game measurement (perf HUD above). If good → switch production pages to
   v2 + delete the old AMD path (page-switch + delete AMD).
2. **Phase 6 benchmark** — see the run guide above (bench.html + real-game perf
   HUD on the 2015 laptop; paste the p95 back to lock v8 or trigger optimization).
3. **Theme direction** — drop picnic.css, a light-mode palette, and the
   main.css @layer refactor are visual; I can't verify parity (no image
   support here), so they need your eyes. The dark lazer look is preserved
   exactly so far; a light variant is your call.
4. **Object pooling** (render win #4) — modest per-object GC benefit, but a
   hot-path refactor with stale-state risk I can't visually verify. Best
   done after you've verified the baseline v8 visuals so any flicker stays
   attributable. (Audited: the circle-sprite property set is bounded —
   alpha/scale/visible/tint/blendMode/position/anchor/depth — and all are
   reset by newHitSprite+createHitCircle, so it's safe-by-construction if
   `visible` is reset on reuse; the remaining risk is a missed property the
   hits-count test won't catch.)
5. **Game→API score-submit + replay-watch integration** — VERIFIED end-to-end
   by `headless:integration`: logged-in autoplay → submit → validate → insert
   approved=1 → replay stored (read from the sqlite DB), then ?watch=<id> →
   game launches in replay mode. This caught + fixed TWO real bugs the dev-only
   tests missed: (a) submitScore sent beatmap_id/beatmap_set_id as strings but
   the backend requires numbers — score submission would have 400'd for every
   player (2fbb808); (b) copy-static didn't copy hitsounds/ → the production
   build had no hitsounds + replay-watch's soundReady guard never resolved
(73a9dfb); (c) the v2 leaderboard page was always empty — the component fetched
   /api/leaderboards/:bid with no mods, the backend parsed modsNum=null, and its
   query matched no rows (scores have mods_num=0); fixed by defaulting mods to 0
   (ac3d390); (d) the v2 settings page never pulled server settings — gamesettings.js
   defines+exports syncFromServer but nothing in the v2 path called it (classic
   settings.js did), so cross-device settings pull was broken; fixed by wiring
   settings-panel connectedCallback to call it (b40be9b).

## Verification commands
- `npm test` — backend inject suite (39/39)
- `npm run test:realtime` — WS + SSE integration (15/15)
- `npm run build` — full Vite build + copy-static (green)
- `npm run headless` / `headless:play` / `headless:autoplay` — v8 bootstrap
  / gameplay (1301 hits) / autoplay hot path
- `npm run headless:shell` / `headless:home` — lit shell (browse / home)
- `npm run headless:build` / `headless:build:play` — built dist/ shell+boot /
  gameplay from dist (1301 hits)
- `npm run headless:bench` — Pixi 8 benchmark harness
- `npm run headless:integration` — core loop (play→submit→leaderboard→replay-watch) end-to-end
- `npm run headless:settings-sync` — ESM gamesettings server-sync round-trip
- `npm run headless:build-all` — all 11 v2 shell pages on the built dist (lit upgrades, 0 fatal)
- `npm run headless:shell-backend` — leaderboard/profile/skins render real backend data on dist
- `npm run headless:settings-pull` — v2 settings page pulls cross-device settings from the server
- `npm run headless:account-dist` — account-widget register/login UI flow on dist (shadow-DOM modal)

The dist-with-backend coverage is now complete: every user-facing backend interaction (account-widget login, score-submit, replay-watch, settings push+pull, leaderboard, profile, skins) is verified on the built dist/. Four real bugs were found+fixed this way (beatmap_id type, missing hitsounds/, empty leaderboard, settings-pull); the rest verify clean.
- `npm run headless:offline` — PWA offline shell
- `npm run smoke` — dev stack (14/14)
- `npm run dev` — Vite dev (:5173, proxies /api+/ws to :8080)
- `npm run server` — Fastify (:8080, serves dist/ when built)
