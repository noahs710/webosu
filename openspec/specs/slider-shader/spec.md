# slider-shader Specification

## Purpose
TBD - created by archiving change fix-skinned-text-slider-visibility. Update Purpose after archive.
## Requirements
### Requirement: Slider track visible with border and shadow
`SliderMesh` SHALL render the slider track as a `PIXI.Graphics` polyline with `cullable=false`, `eventMode='none'`, 3 strokes: shadow `w+4` black `0x000000` alpha `0.35`, border `w+6` `SliderBorder` (or white) alpha `0.95`, fill `w` `SliderTrackOverride` or combo color alpha `0.9` (plus optional inner `w-1` for crisp). The track SHALL be opaque on dimmed background (not see-through).

#### Scenario: Slider border visible on default skin
- **WHEN** a beatmap with a slider is played with default skin (no `SliderTrackOverride`)
- **THEN** the slider shows a white border (`w+6`) around a combo-colored fill (`w`), not a flat see-through line.

### Requirement: Slider dirty-flag batching
`SliderMesh` SHALL only `clear()` and `stroke()` when `startt` or `endt` changes (snake) and SHALL set `visible=true` after draw. `render()` SHALL call `_draw()` only when `_dirty === true`.

#### Scenario: Slider not redrawn when fully visible
- **WHEN** `startt=0, endt=1` and `render` is called 60 times
- **THEN** `Graphics.clear`/`stroke` is called at most once.

### Requirement: Slider not culled
`SliderMesh` `Graphics` and `MeshRope` fallbacks, `gamefield`, `cursorLayer`, and followpoint sprites SHALL have `cullable=false` and `eventMode='none'` so sliders are not culled by `CullerPlugin`.

#### Scenario: Slider visible at screen edge
- **WHEN** a slider extends to `x=512, y=384` at screen edge
- **THEN** the full track is rendered, not clipped by culling.
