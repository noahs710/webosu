## Why

Sliders are see-through (only dot/arrow/follow visible) after switching from 200-LOC shader to Graphics/MeshRope; missing shadow/border/gradient makes tracks unreadable on dimmed background, but 825 strokes/frame and MeshRope tint limits are unknown, so we need an A/B to pick the visible yet high-perf path.

## What Changes

- Spike A/B/C screenshots on same map (default + WhiteCat):
  - A: Graphics 2-stroke (current: `w+6` border + `w` fill)
  - B: Graphics 3-stroke (shadow `w+4` black 0.35 + `w+6` border + `w` fill + inner `w-1` crisp)
  - C: MeshRope 2 ropes (border `w+6` + fill `w`, `textureScale:0`, `tint`)
- Measure draws/frame and p95 frame time; capture visual opacity/border decision for `slider-shader`.

## Capabilities

### New Capabilities
- `slider-shader-ab`: Spike A/B screenshot + perf comparison for slider track rendering.

### Modified Capabilities
- `slider-shader`: Will adopt winner (3-stroke vs MeshRope) in follow-up.
- `slider-rendering`: Will align spec to winner.

## Impact

- `src/game/SliderMesh.js`, `src/game/playback.js` (fallback), perf HUD (`perf 1`).
- No breaking API, spike only.
