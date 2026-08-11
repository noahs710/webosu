## Context

Skins and hitsounds load lazily during `initgame.js`. The `loadDefaultSkin()` function fetches from IndexedDB cache (or fetches the default .osk), and `sounds.load(sample)` loads hitsounds via howler. Both set readiness flags (`skinReady`, `soundReady`) but nothing gates beatmap launch on them — the user can click a difficulty while skin/hitsounds are still loading, causing a first-hit hitch or WHITE-fallback textures. There's no validation that a loaded skin is complete (corrupted imports silently produce missing textures). Multiple .osk imports block the main thread (fflate's `unzipSync` is synchronous).

## Goals / Non-Goals

**Goals:**
- Gate beatmap launch on `skinReady && soundReady`
- Validate skin textures after load (core textures exist + valid)
- Validate hitsounds after load (15 core ogg files loaded)
- Health-check popup for issues (corrupt skin, missing hitsounds) with repair guidance
- No auto-switch on import (user must explicitly Apply)
- Sequential upload queue with per-file progress (no main-thread freeze)

**Non-Goals:**
- Async unzip (fflate is sync; moving to a worker is a larger refactor — out of scope)
- PFP/skin sharing (that's shell-ux-overhaul)
- Missing sliderslide/spinnerspin sounds (those files don't exist yet — warn but don't block)

## Decisions

### Decision 1: Readiness gate in BeatmapList launch

The `launch()` function in `BeatmapList.vue` currently dispatches `beatmap-launch` immediately. Add a gate: if `!window.skinReady || !window.soundReady`, show a loading state and wait. The readiness flags already exist in `initgame.js`.

**Why over a global loading overlay:** the gate is local to the launch action — the user sees "Loading skin..." on the button, not a full-screen block.

### Decision 2: Validation in skin-loader.js

Add `validateSkin(data)` — checks that the core gameplay textures exist in the loaded skin data (`hitcircleoverlay.png`, `hitcircle.png`, `approachcircle.png`, `cursor.png`, `hit0.png`/`hit50.png`/`hit100.png`/`hit300.png`). Returns `{ ok: boolean, missing: string[], corrupt: string[] }`.

Add `validateHitsounds()` — checks that `game.sample[1..3]` have `hitnormal`, `hitwhistle`, `hitfinish`, `hitclap`, `slidertick`. The new `sliderslide`/`spinnerspin` are optional (warn if missing, don't block).

### Decision 3: Health-check popup component

A Vue component (`HealthCheckPopup.vue`) that displays:
- The issue name (e.g. "Corrupted skin texture")
- A plain-language explanation
- Action buttons: "Repair" (re-import), "Reset to default" (clear cache, reload), "Dismiss" (continue with fallbacks)

Dispatched via a custom event (`skin-health-issue`) from `initgame.js` after validation, caught by `app.js` which mounts the popup.

### Decision 4: No auto-switch on import

`loadOsk` currently caches the skin AND the skins page calls `applySkin` implicitly. Change: `loadOsk` caches only; the Skins page's "Apply" button is the only path to switching. The `importLocal` function stops calling `applySkin`.

### Decision 5: Upload queue with sequential processing

In `skins.js`, replace the single-file `importLocal` with a queue: `uploadQueue = ref([])`. When files are selected, add them all to the queue. Process one at a time: `loadOsk` → `saveLocalSkin` → next file. Show progress per file. Use `await` + `setTimeout(0)` between files to yield to the UI thread (prevent freeze on old Chromebooks).

## Risks / Trade-offs

- **[Gate delays first launch]** The user clicks a map but has to wait for skin load. → Mitigation: skin loads from IndexedDB cache (instant after first visit); the gate only triggers on the very first visit (fetching the default .osk).
- **[Validation false positives]** A minimal skin might omit some textures by design. → Mitigation: only validate the 8 core textures that have no skin-fallback (cursor, approachcircle, the 4 judgement images, hitcircleoverlay); missing optional textures use WHITE fallback (existing behavior).
- **[Synchronous unzip still blocks]** `fflate.unzipSync` is synchronous. → Mitigation: the queue processes one file at a time with `setTimeout(0)` yields between files, so the main thread isn't blocked for the entire batch — just one file at a time.