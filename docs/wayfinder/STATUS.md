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
  test/smoke.js     — 53/53 backend tests (39 original + 14 v2/server hardening)
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
- **Phase 5b** (server hardening + accounts UX): done — `/api/version` + CORS, SSE cleanup on disconnect, rate-limiter with idle-IP sweep, `isFinite`/range guards on leaderboards/scores/replays, capped replay/mods_list sizes, `/api/me` (auth) returns user+stats+ranking in one round-trip, paginated `/api/profiles/:username/recent` and `/api/me/scores`, `/api/users/:id` (lookup by id), structured access log via onResponse hook (one line per non-2xx request with request-id), foreground error popup (z-index 2147483647) that survives fail screens via `window.__showErrorPopup()`, PFP URL validated (http/https/relative only), `webosu-auth` event for cross-component login sync, login -> mod-settings re-sync
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
- `node scripts/headless-touch.js` — 5/5 (laptop scale 1.5, large screen capped at 2.25, small screen scales down, on-screen pause button present on touch devices, 0 fatal pageerrors)
- `node scripts/headless-error-popup.js` — ErrorPopup z-index 2147483647 > grading 9000, popup is on top via elementFromPoint, 0 pageerrors

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
2. **Integration test** — 10/11 (1 failure: replay anti-cheat rejects fast-forwarded replay — test limitation, not a game bug). headless-touch now 5/5 after the on-screen pause button was added.
3. **Light-mode palette** — user's design call

## GameState seam (deepen-game-state-seam change)

All non-engine callers now read/write settings through a single, observable `GameState` API. The game engine keeps using `window.game` during the deprecation window.

- **`src/shell/gamestate.js`** — central seam. Path-based API: `get(path)`, `set(path, value)`, `setBatch(updates)`, `subscribe(path, cb)`, `syncLegacy()`, `bind(game)`. Mod flags are routed through `ModRegistry`; flat flags are derived aliases. Dev-only direct-write guard warns when code mutates managed `window.game` keys, but suppresses warnings during GameState's own writes.
- **Paths** — `display.<key>`, `audio.<key>`, `input.<key>` cross the gamesettings → window.game bridge with normalization (e.g. `dim/100`, `!sysdpi`). `mods.<flag>` activates via `ModRegistry.setActive` and writes the resolved flag (`game.hardrock`, `game.flashlight`, …). `settings.<key>` is gamesettings-only (e.g. `flSize0`, `customAR`).
- **Shell+engine wiring** — `src/game/initgame.js` calls `GameState.bind(window.game)` and then `gamesettings.loadToGame()`. `gamesettings.loadToGame()` is now a single `GameState.setBatch(...)` + `GameState.syncLegacy()` call.
- **Vue components** — `ModSelectPanel.vue` toggles mods via `GameState.set("mods.<flag>", bool)` and writes per-mod settings via `GameState.set("settings.<key>", value)`. `SettingsPanel.vue` routes display/audio/input/mods sliders through `GameState.set(...)` with a `PATH_NAMESPACE` map. `Nav.vue` does not read settings directly.
- **Headless test** — `scripts/headless-gamestate.js` exercises: settings normalization, mod round-trip (FL settings + activation), batched writes + subscribe, idempotent set, deactivation, and the direct-write guard. Add to CI via `npm run test:gamestate`.


## Hardening pass (post-Phase 5)

- **Touch pause button**: `src/game/launchgame.js` adds a small on-screen `aria-label="Pause"` button (top-right, 42px circle) when the runtime reports touch capability, so users without a keyboard can still open the pause menu. The button is removed by `quitGame` on game teardown. `scripts/headless-touch.js` now passes 5/5 (was 4/5 — the `touch pause button present` assertion was previously failing).
- **Live FL size refresh**: `src/vue/components/ModSelectPanel.vue` `setModSetting` now also pushes the new `flSize0`/`flSize200` into the running `window.playback` via the existing `refreshFlashlight()` hook. Previously the in-game overlay kept the size from initial launch until replay.
- **Paginated recent scores** are now `{items,total,limit,offset}` instead of a bare array. `ProfileCard.vue` reads `(r && r.items) || r || []` so it works with both shapes. `api.js` exposes `myScores(limit,offset)` for the new `/api/me/scores` route.
- **Server access log**: every non-2xx request is logged as `[webosu] <request-id> <METHOD> <path> -> <status> (<ms>ms)` so production errors are easy to triage. Disabled in the test harness via `NODE_ENV=test`.
- **/api/users/:id** lookup: returns `{user, stats, globalRank, countryRank}` like `/api/profiles/:username` but by numeric id. Validates id is a finite positive integer (400 otherwise) and 404s if missing. Useful for hydrating a profile when only the id is known (e.g. from a /api/me or score row).
- **/profile** redirect now reads from the `webosu_user` JSON blob (the only place login writes the username) with a fallback to the legacy `localStorage.username` for back-compat.
- **/api/me/scores** (auth) returns the same paginated shape as the public recent endpoint.

## Hardening pass (post-Phase 5b)

A follow-up read-through of the gameplay + shell hot paths surfaced five more issues that match the profile of the prior hardening pass: small, easy-to-miss, but reachable through normal user actions (relaunching, loading a beatmap without its audio file, opening a deep link to a missing skin). The established pattern — log + guard + foreground error popup — still applies, and each fix is a defensive guard with no public API or DB schema change. See `openspec/changes/archive/2026-08-11-bug-hunting-hardening/` for the full change set.

- **Empty-beatmap guard in `Playback` constructor**: `src/game/playback.js` now `return`s from the empty-hits branch instead of falling through and dereferencing `self.hits[0].time` (which threw `TypeError: Cannot read properties of undefined`). The empty-hits log (`gerror("playback", "empty beatmap — no hit objects")`) is preserved. Crash-free on beatmaps that have no hit objects (e.g. storyboard-only maps or worker-parse oddities).
- **`quitGame` clears stale references**: `src/game/launchgame.js` `quitGame` now also clears `window.playback` and the `window.game.scene / cursorLayer / cursor / cursorTrail / cursorTrailHead` references after the Pixi `app.destroy(...)` block. Without this, a follow-up `launchGame` would `scene.render` against destroyed Pixi objects and throw on the first frame. The reset is wrapped in `try/catch` so a half-initialized `window.game` (e.g. after a failed launch) cannot re-throw during teardown.
- **`GET /api/skins/:id` validates the id**: `server/app.js` returns 400 on non-finite or non-positive ids before calling `D.getSkin(sid)`. Previously `parseInt(req.params.id, 10)` silently accepted `0`, `-1`, `1e6`, `Infinity`, and the DB layer was asked for an invalid id. The 404 path for valid-but-missing ids is unchanged.
- **`pause()` is null-safe on `self.source`**: `src/game/osu-audio.js` wraps `self.source.stop()` in a null-guard and explicitly sets `self.source = null` after the call. A second `pause()` (e.g. when the user clicks Pause twice, or after a `play()` that failed to obtain a buffer) no longer throws `TypeError: Cannot read properties of null`.
- **Missing-audio popup**: `src/game/launchgame.js` `load_mp3` shim now logs the error via `lerror` and surfaces a foreground `__showErrorPopup` with title `"Missing audio"` when the audio file is not in the beatmap. Previously the silent `this.onerror` was unreachable, and the game sat on a white loading screen until the user pressed Escape. The popup is z-index 2147483647 so it renders above the loading overlay, and the user can immediately pick a different beatmap.


## Deep bug hunt (post-Phase 5b hardening #2)

A third pass through the gameplay + shell + server hot paths surfaced another batch of small, easy-to-miss issues that match the profile of the prior hardening passes: defensive guards, parseInt / JSON.parse hardening, null-safety, and foreground error surfaces. None of them crash on a normal session, but each one would surface as a silent console.error, a broken `?` button, or a stuck loading screen under specific user actions (corrupt mp3, wrong-mode beatmap, manually-edited localStorage, missing hitsound, broken skin cache, etc.).

The change set lives at `openspec/changes/archive/2026-08-11-deep-bug-hunt/`. 10 files changed, 274 / -104 lines. 53/53 smoke and 15/15 ws-sse still pass; all 15 headless tests still pass with 0 pageerrors.

- **Server: `/api/comments/:setId` validates the setId** — previously `parseInt("abc")` returned NaN and the route silently returned `[]`. Now returns 400.
- **`api.getUser()` parse-hardens the user blob** — `localStorage` corrupted by a browser extension or a manual edit no longer throws. Treated as "no user".
- **`osu.js` length fallback when hitObjects is empty** — a storyboard-only beatmap no longer throws on `this.length = ...this.hitObjects[last].endTime`. Falls back to `PreviewTime` or 0.
- **`requestStar` JSON.parse try/catch** — a sayobot 5xx HTML response can no longer blow up the entire `onload`. Also guards `info.status == 0 && Array.isArray(info.data)`.
- **`launchOSU` defensive track-id search + popup** — a wrong-mode beatmap (e.g. opening a mania map in osu!standard) used to leave the user on a blank loading overlay. Now logs + popup + removes overlay.
- **`launchGame` arrayBuffer hardening** — a malformed `Blob.arrayBuffer()` no longer surfaces as an uncaught rejection; popup instead.
- **`osu-audio.play()` null-safe on `self.decoded`** — corrupt mp3 + retry exhausted no longer dereferences null. Returns false early.
- **`osu.onerror` surface popup** — the launchgame path now wires up `osu.onerror` so the Missing-audio popup fires from the Osu facade, not just the worker error path.
- **`osu.onready` start() try/catch** — a corrupt track can't take down the game right after audio decode.
- **Render-loop per-frame try/catch** — `updateHitObjects`, overlay updates, Adaptive Speed, etc. are all wrapped so a single bad frame can't kill the whole render loop.
- **`judgementText/Color` no-throw** — unknown points values fall back to "meh" / 0xffcc22. A future lazer judgement routed through the existing path is safe.
- **`setSpriteArrayText/Pos` defensive** — empty / corrupt sprite arrays no longer throw string "wtf!" exceptions. `arr[i].scale.x` is clamped to a number.
- **`playHitsound` per-sample null-safety** — `game.sample[set].hitnormal` etc. are guarded with optional chaining + try/catch. A skin that overrides slots but is missing some hitsounds no longer throws.
- **`playerActions.inUpcoming[_grace]` type checks** — return `false` on undefined `hit.x` / `hit.y` / `playback.circleRadius` instead of throwing.
- **Mods panel in-pause Vue app lifecycle** — `mp.__vueApp` tracks the mounted Vue app, `unmount()` on close. Repeated open/close doesn't leak listeners. Import error surfaces via popup.
- **`showSummary` user resolution** — `webosu_user` JSON blob (matches leaderboard) with fallback to legacy `localStorage.username` and finally `metadata.Player`. Coerces ids to numbers; guards title/artist against missing metadata.
- **`addPlayHistory` localStorage fallback** — persists to localforage if available, falls back to localStorage (private-mode Safari, IndexedDB quota exhausted). `initgame.js` mirrors the same fallback when restoring history.
- **AudioContext resume try/catch** — synthetic gestures that don't satisfy the autoplay policy no longer surface as uncaught errors. Also registers the first-gesture listener on `touchend` for touch devices without a keyboard.
- **`getCachedSkinMeta` + `loadCachedSkin` parse hardening** — manually-tainted IndexedDB config blobs no longer reject the skin load. Treats as "no config" / "no skin".
