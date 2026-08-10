# slider-culling-spike Specification

## Purpose
TBD - created by syncing change fix-slider-culling. Update Purpose after archive.
## Requirements
### Requirement: Culling bounds spike
The system SHALL log `SliderMesh` `getBounds()` and `gamefield` `cullArea`/`boundsArea` before first `_draw`, after `_draw`, and on `window.resize`/`calcSize`, for `cullable true` vs `false`, gated `import.meta.env.DEV`.

#### Scenario: Bounds table produced
- **WHEN** a map with an edge slider is played with `cullable true` vs `false`
- **THEN** console shows bounds before/after draw and after resize, proving whether `cullArea` is needed to keep edge sliders visible.
