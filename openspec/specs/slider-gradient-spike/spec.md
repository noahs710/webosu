# slider-gradient-spike Specification

## Purpose
TBD - created by syncing change slider-gradient-fill. Update Purpose after archive.

## Requirements

### Requirement: Gradient vs flat spike
The system SHALL support rendering slider fill as flat (`color: combo`), `FillGradient` linear, and textured `MeshRope` (`sliderb.png` `textureScale:1`) via `?gradient=flat|linear|textured`, and SHALL capture screenshots for visual comparison.

#### Scenario: Gradient variants comparable
- **WHEN** `?gradient=flat` vs `linear` vs `textured` are loaded
- **THEN** screenshots show flat vs subtle gradient vs patterned fill on same slider.
