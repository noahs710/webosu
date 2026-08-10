## Why

Follow lines and sliders at screen edge still reported missing after `cullable=true` → `false` flip; `gamefield`/`cursorLayer`/`followpoint` sprites use `CullerPlugin` (`cullable`, `cullArea`) and `eventMode='none'` for perf, but culling may hide tracks when `SliderMesh` bounds are `0` before first `_draw`, or when `gamefield.scale` changes.

## What Changes

- Spike: toggle `cullable false` vs `cullable true + cullArea = gfx` on `gamefield`, `SliderMesh`, `followpoint` container; log `getBounds()` before/after first `_draw` and on `window.resize`; check `CullerPlugin` debug (`accessibilityOptions.debug` analog for culler if available).
- Decide: keep `cullable=false` for bug-free (simplest) vs `cullable=true` with correct `cullArea`/`boundsArea` for perf.

## Capabilities

### New Capabilities
- `slider-culling-spike`: Spike to verify `cullable`/`cullArea`/`boundsArea` for sliders and follow lines.

### Modified Capabilities
- `slider-rendering`: Will lock `cullable` decision.
- `pixi-asset-lifecycle`: If `boundsArea` needed, note lifecycle.

## Impact

- `src/game/playback.js` (`gamefield`, `followpoint`, `hit`), `src/game/SliderMesh.js`, `src/game/launchgame.js` (`cursorLayer`).
- No breaking API, spike only.
