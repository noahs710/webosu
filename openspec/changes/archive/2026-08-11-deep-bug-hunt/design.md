# Design

Each fix is local: a defensive guard, a try/catch, or a small UX hook
(loading overlay removal, foreground error popup). No new abstractions, no
new module surface.

## Per-fix writeup

### Server: `/api/comments/:setId` validates the setId
`server/app.js` now requires the path param to be a finite positive integer
before calling `D.commentsFor` / `D.addComment`. `parseInt("abc")` previously
returned `NaN`, which was a 200 with `[]` (silently broken). Returns 400 now.

### `api.getUser()` parse-hardens the user blob
`src/shell/api.js` wraps the `localStorage.getItem("webosu_user")` +
`JSON.parse` in try/catch and returns `null` on any failure. A manually
edited, browser-extension-overwritten, or older non-JSON value no longer
crashes the Nav check.

### `osu.js` length fallback when `hitObjects` is empty
`src/game/osu.js` previously set `this.length = ...this.hitObjects[last].endTime...`
which throws on an empty beatmap. Falls back to `PreviewTime` or 0.

### `requestStar` JSON.parse try/catch
`src/game/launchgame.js` wraps `JSON.parse(xhr.response)` in try/catch and
guards the response shape (`info.status == 0 && Array.isArray(info.data)`)
so a 5xx HTML response can't blow up the onload.

### `showSummary` reads the logged-in user
`src/game/overlay/score.js` summary now uses the `webosu_user` JSON blob
(matches what gets posted to the leaderboard), with fallback to the legacy
`localStorage.username` and finally `metadata.Player`. Also coerces
BeatmapSetID/BeatmapID to numbers and guards the title/artist against
missing metadata.

### `addPlayHistory` falls back to localStorage
`src/game/overlay/score.js` saves to localforage first and falls back to
localStorage when localforage failed to load (private-mode Safari,
IndexedDB quota exhausted). `initgame.js` mirrors the same fallback when
restoring the history on next launch.

### `osu-audio.play()` null-safe on `self.decoded`
`src/game/osu-audio.js` returns `false` early if `decodeAudioData` never
produced a buffer, instead of dereferencing null. `playback.js` wires up
`osu.onerror` so the `Missing audio` popup surfaces from the launchgame
path (not just the worker error path).

### `quitGame` no longer throws on stuck-modals
`src/game/launchgame.js` wraps the `gamesettings.loadToGame` call in
try/catch so a settings misconfig can't take down the Pixi app + cursor we
just initialized.

### Render loop per-frame try/catch
`src/game/playback.js` wraps `updateHitObjects` and the per-overlay updates
so a single bad frame (corrupt hit data, broken overlay) can't kill the
whole render loop.

### `judgementText/Color` no longer throw
`src/game/playback.js` returns "meh" / a default color for unknown points
values (a future lazer judgement routed through the existing path won't
crash the game).

### `setSpriteArrayText/Pos` defensive
`src/game/overlay/score.js` clamps `arr[i].scale.x` to a number, and
`setSpriteArrayPos` early-returns on an empty sprite array instead of
throwing a string "wtf!" exception.

### `playHitsound` null-safety on `game.sample[set].xxx`
`src/game/playback.js` guards every `game.sample[set].hitnormal` /
`hitwhistle` / `hitfinish` / `hitclap` access with optional chaining
+ try/catch. A skin that overrides slots but is missing some hitsounds
no longer throws "Cannot read properties of undefined".

### `playerActions.inUpcoming[_grace]` type checks
`src/game/playerActions.js` returns `false` instead of comparing against
`undefined` when `hit.x` / `hit.y` / `playback.circleRadius` are
unexpectedly missing.

### Mods panel in-pause Vue app lifecycle
`src/game/playback.js` tracks the mounted ModSelectPanel Vue app on
`mp.__vueApp` and calls `unmount()` when the panel is hidden, so repeated
open/close doesn't leak detached listeners. The import error path now
surfaces a popup.

### `osu.onready` is try/catch
`src/game/playback.js` wraps `self.start()` in try/catch so a corrupt
track can't take down the whole game right after audio decode.

### `launchGame` arrayBuffer hardening
`src/game/launchgame.js` wraps `osublob.arrayBuffer()` in a Promise
chain with try/catch + emptiness check, so a malformed Blob surfaces
via the foreground ErrorPopup instead of an uncaught rejection.

### `no-track-found` surfaces an error
`src/game/launchgame.js` `launchOSU` shows the foreground ErrorPopup
and removes the loading overlay when the requested difficulty isn't
in the .osu set (e.g. a mania/taiko map opened in osu!standard mode).

### AudioContext resume is try/catch
`src/game/initgame.js` wraps `actx.resume()` in try/catch so a synthetic
gesture that doesn't satisfy the autoplay policy doesn't surface as an
uncaught error.

### `getCachedSkinMeta` + `loadCachedSkin` parse hardening
`src/game/skin-loader.js` wraps the IndexedDB `JSON.parse` calls so a
manually-tainted config blob in IndexedDB doesn't reject the skin load.

## Verification

- `node server/test/smoke.js` — 53/53.
- `node server/test/ws-sse.js` — 15/15.
- `node --check` on every changed .js — clean.
- `node scripts/headless-error-popup.js` — 0 pageerrors.
- `node scripts/headless-fail-retry.js` — 0 pageerrors, fail/retry/quit path.
- `node scripts/headless-mod-flashlight.js` — 0 pageerrors, FL overlay OK.
- `node scripts/headless-mod-adaptive-speed.js` — 0 pageerrors, AS rate
  adjustment OK.
- `node scripts/headless-mod-fun-all.js` — 0 pageerrors with all 11 fun
  mods active.
- `node scripts/headless-mod-transform.js` — 0 pageerrors, TF rotate OK.
- `node scripts/headless-mod-incompatible.js` — 0 pageerrors, HR/EZ
  conflict OK.
- `node scripts/headless-settings-page.js` — 0 pageerrors, settings
  page renders.
- `node scripts/headless-touch.js` — 5/5, on-screen pause button
  present.
- `node scripts/headless-gamestate.js` — 0 pageerrors, GameState seam
  round-trips.
- `node scripts/headless-quit.js` — 0 pageerrors, quit path.
- `node scripts/headless-slider-destroy.js` — 0 pageerrors, SliderMesh
  destroy.
- `node scripts/headless-build-play.js` — 0 fatal pageerrors, full
  build + launch path.
- `node scripts/headless-play.js` — 0 fatal pageerrors, dev + launch
  path.
- `node scripts/headless-perf-hud.js` — 0 pageerrors, perf HUD
  visible with FPS/p95.
