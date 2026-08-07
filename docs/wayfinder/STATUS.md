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

**Phase 6 prep — benchmark harness**
- bench.html ported to Pixi 8 (the actual render choice; was Pixi 6 + dead
  InteractionManager toggle) (d0eb687). Verified `headless:bench`:
  PIXI.VERSION 8.19.0, FPS HUD populates, z-order/pool toggles work, 0 errors.

## Needs the user (eyes / hardware / design) — not done by me

1. **Play the v2 game on real hardware** (`npm run dev` → /index-v2.html →
   click a beatmap → play). Confirm feel, especially SliderMesh v8 two-pass
   depth rendering (highest-risk visual piece). If good → switch production
   pages to v2 + delete the old AMD path (page-switch + delete AMD).
2. **Run bench.html on a 2015 laptop** — the binding p95 numbers to lock the
   render choice (Phase 6). The harness is ready on v8; it needs the floor
   device.
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
5. **Game→API score-submit integration** — VERIFIED end-to-end by
   `headless:integration` (logged-in autoplay → submit → validate → insert
   approved=1 → replay stored, read from the sqlite DB). This caught + fixed a
   real bug: submitScore sent beatmap_id/beatmap_set_id as strings (from the
   .osu metadata) but the backend requires numbers — score submission would
   have 400'd for every real player. (2fbb808)

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
- `npm run headless:integration` — core loop (play→submit→leaderboard) end-to-end
- `npm run headless:offline` — PWA offline shell
- `npm run smoke` — dev stack (14/14)
- `npm run dev` — Vite dev (:5173, proxies /api+/ws to :8080)
- `npm run server` — Fastify (:8080, serves dist/ when built)
