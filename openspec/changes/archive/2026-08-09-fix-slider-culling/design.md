## Context

`gamefield`/`cursorLayer`/`followpoint` use `CullerPlugin` (`cullable`, `cullArea`, `boundsArea`); `SliderMesh` `Graphics` has `0` bounds before first `_draw`. Flipped `cullable true→false` in `a01eeeb` fixed visibility but loses culling perf. Need to know if `cullArea` or `boundsArea` can keep perf without hiding edge sliders.

## Goals / Non-Goals

**Goals:** Verify bounds before/after `_draw` and on resize, decide `false` vs `true+cullArea`.

**Non-Goals:** Prod fix now; spike.

## Decisions

**D1: Test `cullable=false` (bug-free, simplest) vs `cullable=true` with `cullArea = gfx` (512×384 scaled) and `boundsArea` on `SliderMesh`** — `cullable=true` requires correct `getBounds()`.

**D2: Log `getBounds()` before first `_draw`, after, and on `window.resize`/`calcSize`.

**D3: Keep `eventMode='none'` for hit-test perf regardless.

## Risks / Trade-offs

- [cullable=true hides edge] → Mitigation: `cullArea` or `false`.
- [boundsArea stale on resize] → Mitigation: update on `calcSize`.

## Migration Plan

1. Toggle, log, screenshot edge sliders.
2. Lock decision in `slider-rendering`.

## Open Questions

- Does `CullerPlugin` respect `Container` `cullArea` or need `boundsArea` on Graphics?
