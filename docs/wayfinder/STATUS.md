# webosu modernization — status

## Architecture

- **Frontend**: Vue 3 + Tailwind CSS + Vue Router SPA (single `index.html` entry)
- **Game engine**: Pixi 8 (ESM, dynamically imported on beatmap click)
- **Backend**: Fastify (node:sqlite, WS multiplayer, SSE activity, SPA fallback)
- **Build**: Vite (SPA) + `scripts/copy-static.mjs` (copies js/lib, css/font.css, img, hitsounds, sprites.json, sw.js to dist/)
- **Deploy**: Fly.io (Dockerfile: builder stage builds, runtime ships dist/+server)

## Project structure

```
index.html          — SPA entry (Vue mount point)
bench.html          — standalone Pixi 8 benchmark
vite.config.mjs     — Vite config (Vue plugin, vue/dist/esm-bundler alias, SPA entry)
tailwind.config.js  — Tailwind config (lazer color palette)
postcss.config.js   — PostCSS (tailwindcss + autoprefixer)
package.json        — 15 scripts (dev, build, test:*, test:all)
src/
  game/             — Pixi 8 game engine (ESM): playback, SliderMesh, osu, overlays, curves, audio
  shell/            — shared modules: api.js (WebosuAPI), gamesettings.js
  vue/              — Vue SPA: app.js, router.js, styles.css, game-loader.js
    components/      — Nav, BeatmapList, AccountWidget, SettingsPanel, LeaderboardBoard, ProfileCard, ActivityFeed
    pages/           — Home, Browse, Hot, New, Search, Leaderboard, Profile, Settings, Skins, Liked, History
server/
  app.js            — Fastify app builder (routes, static, SPA fallback)
  index.js          — listen + WS
  test/smoke.js     — 39/39 backend tests
  test/ws-sse.js    — WS + SSE tests
scripts/
  copy-static.mjs   — postbuild: copies assets to dist/, generates sw.js precache
  headless-*.js     — 11 Playwright test scripts (game, shell, touch, perf, crash, settings, integration, build)
```

## Phases

- **Phase 1** (Vite + Fastify): done, 39/39 backend tests
- **Phase 2** (Pixi 8 port + render wins): done — InteractionManager disabled, cursor-trail z-order, object pooling, cheaper blur
- **Phase 3** (Vue 3 + Tailwind SPA): done — replaced lit with Vue, Tailwind, Vue Router
- **Phase 4** (dep hygiene): done — underscore→native, zip.js→fflate, sound.js→howler, vercel dropped
- **Phase 5** (backend + PWA): done — validation, rate-limiting, SSE, WS, PWA sw.js
- **Phase 6** (benchmark-lock): tools ready (bench.html + perf HUD with F3/F4), needs user to run on 2015 laptop

## Remaining

1. **Phase 6 benchmark** — deploy to Fly.io, open `/?perf=1` on 2015 laptop, play a dense map, press F4, paste p95. ≤16.6ms → lock v8, goal complete. >16.6ms → optimize SliderMesh.
2. **Integration test** — 10/11 (1 failure: replay anti-cheat rejects fast-forwarded replay — test limitation, not a game bug)
3. **Light-mode palette** — user's design call
