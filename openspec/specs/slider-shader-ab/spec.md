# slider-shader-ab Specification

## Purpose
TBD - created by archiving change slider-shader-ab. Update Purpose after archive.
## Requirements
### Requirement: Slider A/B screenshot spike
The system SHALL support toggling `SliderMesh` impl between A (2-stroke border+fill), B (3-stroke shadow+border+fill+inner), C (MeshRope 2 ropes) via `?slider=a|b|c`, and SHALL log draws/frame and p95 via `perf HUD` for comparison on same beatmap with default and WhiteCat skins.

#### Scenario: A/B/C screenshots comparable
- **WHEN** `?slider=a` vs `?slider=b` vs `?slider=c` are loaded on same map with `?perf=1`
- **THEN** screenshots show opacity/border differences and HUD shows draws/frame for each.
