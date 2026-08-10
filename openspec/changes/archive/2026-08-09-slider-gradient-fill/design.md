## Context

Old 200 LOC shader used double-pass with `uSampler2` tinted `WHITE` per combo, remembered as gradient; current `SliderMesh` flat `stroke({color: combo})` looks see-through vs memory of shaded gradient. `FillGradient` (Pixi v8) and `MeshRope` textured `sliderb.png` are alternatives.

## Goals / Non-Goals

**Goals:** Compare flat vs gradient vs textured to decide if flat sufficient.

**Non-Goals:** Reintroduce full `GlProgram`; spike only.

## Decisions

**D1: Test flat (current, `color: combo`), `FillGradient` linear (darken→fill→lighten), MeshRope `texture: sliderb.png` with `textureScale:1` repeating** — flat simplest, gradient richer, textured most art-accurate.

**D2: Use `stroke({color: gradient})` where supported; else `Mesh` with `shader`.

**D3: Keep dirty-flag in all variants.

## Risks / Trade-offs

- [FillGradient not supported on Graphics stroke in some Pixi builds] → Mitigation: fallback to flat.
- [Textured rope needs many points (≥15) for smooth] → Mitigation: `DIVIDES=16` already.

## Migration Plan

1. Build 3 variants, screenshot, perf.
2. Adopt winner in `slider-shader` or keep flat if sufficient.

## Open Questions

- Does `SliderTrackOverride` expect solid or gradient?
