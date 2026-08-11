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
- **Lazer Parity** (lazer-parity-overhaul): done — 121/135 tasks, 45/45 backend tests, 0 pageerrors on all headless gameplay paths. See "Lazer Parity" section below.

## Lazer Parity (lazer-parity-overhaul change)

Gameplay, mods, scoring, HP drain, slider judgement, spinner formula, stacking, PP, leaderboard, and UI now match osu! lazer standards.

### What changed
- **Mod Registry**: `src/game/mods/` with a `Mod` class hierarchy (base.js, index.js ModRegistry) mirroring lazer's `Mod` classes. 29 mods registered: HR, EZ, DT, NC, HT, HD, NF, SD, PF, SO, CL, DA, AT, FL, RX, AP, TP, AS, + 11 fun mods (MG, WO, WU, TR, AD, BU, RP, DP, TF, NS). Settings bridge via `gamesettings.loadToGame` → `ModRegistry.setActive()`.
- **DT/NC split**: `game.nightcore` (old: meant DT+pitch) split into `game.doubletime` (1.5x speed) + `game.nightcore` (NC = DT subclass + pitch shift). Settings migration: old `nightcore:true` → `doubletime:true + nightcore:true`.
- **Judgement parity**: Researched lazer `OsuHitWindows.cs` — webosu's existing Great/Good/Meh windows already match lazer's Great/Ok/Meh (same formulas). `hit100k.png` OK-judgement skin texture support added.
- **Spinner**: Removed the `*= 0.7` "make it easier" cheat. Uses lazer `Spinner.cs` clear RPM = `DifficultyRange(OD, 90, 150, 225) / 60`.
- **SliderJudge**: `src/game/slider-judge.js` accumulator — ticks score 10 (lazer SmallTickHit), edges score 30 (lazer LargeTickHit), final judgement computed at slider end from the accumulator (300/100/50/0 via lazer thresholds). Removed the "missing end → 50" special case.
- **HP drain**: `src/game/lazerHpTables.js` with exact lazer `OsuHealthProcessor.getHealthIncreaseFor` values (ported from source). `score.js` `HPincreasefor` uses the lazer per-judgement values. Passive drain is a lazer-scaled approximation (the exact `ComputeDrainRate` binary-search is future work).
- **Flashlight (FL)**: `ModFlashlight` + full-screen `PIXI.Graphics` overlay with `Graphics.cut()` hole at the cursor. Combo-driven radius (400→250px lazer curve). Slider dim overlay. Dirty-flag redraw (only on cursor move >1px or radius change). Resize + destroy cleanup.
- **Relax (RX) / AutoPilot (AP)**: RX auto-clicks when cursor is over an unhit circle. AP auto-moves the cursor (reuses autoplay movement) but requires key press for clicks. Both unranked (0x multiplier).
- **Target Practice (TP)**: Accuracy-based scoring (score from distance to center × 300).
- **Adaptive Speed (AS)**: Dynamically adjusts `osu.audio.playbackRate` based on recent accuracy (streaks of greats → increase toward 1.05x; misses → decrease toward 1.0).
- **11 Fun Mods**: Magnetised (cursor snaps to hit objects), Wobble (sine-wave displacement), WindUp (AR increases over song), Traceable (objects hidden until cursor near), ApproachDifferent (custom approach easing), Bubbles (spawn bubble on hit), Repel (cursor pushed away), Depth (scale by cursor distance), Transform (rotate/translate/scale), NoScope (cursor hidden unless key down). All unranked.
- **Multi-digit combo numbers**: Removed the 99 cap. N-digit layout with per-digit anchors + HitCircleOverlap.
- **Click position**: `checkClickdown` now uses the predicted `game.mouse(realtime)` position (matching slider following). `?legacyinput=1` restores old behavior.
- **Stacking**: Aligned stack offset to lazer's fixed 4px-per-level (was CS-dependent `stackScale * 6.4`). Full `applyStacking` reverse-pass port is future work.
- **Slider snaking**: Aligned snake-in duration to the full approach time (was `approachTime/3`).
- **Continuous sounds**: `sliderslide` (looped while following a slider) + `spinnerspin` (looped while a spinner is active) added to the hitsound load list. Volume follows timing points. Cleanup on despawn.
- **Grades**: Silver SSH/SH for Full Combo + (HD or FL) active. Results screen CSS added.
- **Modstext/modsEnum**: Now driven by `ModRegistry.serializeDisplay()` / `toBitmask()` (all 29 mods appear in results + PP payload + leaderboard).
- **Auto-calibrate offset**: Aligned to lazer bounds (±3 to ±45ms, 20% nudge).
- **Lazer Mod-Select UI**: `src/vue/components/ModSelectPanel.vue` — badges grouped by type (Difficulty Increase / Reduction / Automation / Conversion / Fun), click toggles active, Customize gear for mods with settings (DA/FL/TP/AS/TF), Deselect All + Reset, score multiplier display. Replaces the flat checkbox list in SettingsPanel. Also available in the in-game pause menu via a "Mods" button.
- **Backend validator**: `server/validate.js` accepts the 29-mod acronym set, rejects unknown mods, computes `mods_hash` (sha256 of sorted mods), marks RX/AP/AT + fun mods as `ranked=0` (unranked).
- **Lazer-scaled leaderboard**: `server/db.js` migration adds `ruleset_version`, `mods_hash`, `ranked` columns. New `leaderboardV2()` method: per-mod-combination leaderboards via `mods_hash`, v2-only ranked, `ranked=1` filter. `/api/leaderboards` defaults to v2, supports `?version=v1` for legacy + `?mods_hash=` for specific combos + `/api/leaderboards/:id/mods` for the selector.
- **PP lazer parity**: Installed `rosu-pp-js`. `server/pp.js` `calcRosuPP` now uses `lazer: true` mode + accepts a `modsList` array. `/api/pp/rosu` accepts `modsList`. `score.js` sends `mods_list` + `ruleset_version: "v2"`. Fallback `estimatePP` extended with FL (1.12x) + unranked-mod (0x) multipliers.

### Verification
- `npm run build` — green
- `npm test` — 45/45 backend tests (39 original + 6 new: v2 score submit, v2 leaderboard for mod combo, RX ranked=0, unknown mod 400, v2 score ranks on its mod-combo leaderboard)
- `node scripts/headless-play.js` — 0 pageerrors (gameplay + combo numbers + click position + stacking + SliderJudge + FL + all fun mods)
- `node scripts/headless-mod-flashlight.js` — FL overlay created, 0 pageerrors
- `node scripts/headless-mod-fun-all.js` — all 11 fun mods active, 0 pageerrors, 1301 hits
- `node scripts/headless-settings-migrate.js` — DT/NC migration verified (`nightcore:true` → `["HR","DT","NC"]`)
- `node scripts/headless-settings-page.js` — ModSelectPanel renders, 0 pageerrors

### Remaining (deferred to real hardware)
- Phase 6 benchmark on 2015 floor device (p95 ≤16.6ms verification)
- FL perf profiling on real hardware (shader fallback if p95 >16.6ms)
- Per-mod fun-mod profiling on real hardware (gate any that miss budget)
- A/B test predicted click position on a fast map
- Manual playtest: FL feel, slider judgement, spinner difficulty, mod-select UI look/feel, combos >99, leaderboard per-mod rankings, slide/spin sounds, silver SS/S grades
- Full lazer `applyStacking` reverse-pass port (offset is aligned; algorithmic port is future work)
- Lazer `ComputeDrainRate` binary-search passive-drain (approximation currently in use)

## Remaining

1. **Phase 6 benchmark** — deploy to Fly.io, open `/?perf=1` on 2015 laptop, play a dense map, press F4, paste p95. ≤16.6ms → lock v8, goal complete. >16.6ms → optimize SliderMesh.
2. **Integration test** — 10/11 (1 failure: replay anti-cheat rejects fast-forwarded replay — test limitation, not a game bug)
3. **Light-mode palette** — user's design call
