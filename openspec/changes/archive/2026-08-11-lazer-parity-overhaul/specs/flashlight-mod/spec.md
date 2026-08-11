## ADDED Requirements

### Requirement: Flashlight viewport circle
The Flashlight (FL) mod SHALL render a dark overlay over the playfield with a transparent circular viewport centered on the cursor. The viewport radius SHALL shrink as combo increases, following the lazer `FlashlightSize` curve: ~400px at combo 0, shrinking to ~250px by combo 200+, with a minimum radius. The overlay SHALL be a `PIXI.Graphics` rectangle with a circle hole punched via `Graphics.cut()`, redrawn when the cursor moves >1px or the radius changes.

#### Scenario: Flashlight viewport shrinks with combo
- **WHEN** FL is active and the player's combo increases from 0 to 200
- **THEN** the transparent viewport circle shrinks from ~400px to ~250px radius

#### Scenario: Flashlight viewport follows cursor
- **WHEN** FL is active and the cursor moves
- **THEN** the transparent circle recenters on the cursor position within 1 frame

### Requirement: Flashlight slider dim
During slider gameplay, the Flashlight viewport SHALL dim further (the `FlashlightSliderDim` reduction) by overlaying a second darker Graphics whose alpha increases while the cursor is following a slider.

#### Scenario: Flashlight dims during slider
- **WHEN** FL is active and the cursor is following a slider
- **THEN** an additional dark overlay fades in over the viewport, reducing visibility beyond the lazer `FlashlightSliderDim` level

#### Scenario: Flashlight undims when slider ends
- **WHEN** the slider ends and the cursor is no longer following
- **THEN** the additional dark overlay fades out within 200ms

### Requirement: Flashlight performance budget
The Flashlight overlay SHALL meet p95 ≤16.6ms on the 2015 floor device. If the hole-punch Graphics approach misses the budget, the system SHALL fall back to a cheaper approximation (static vignette or a custom shader) gated by the Phase 6 benchmark result.

#### Scenario: Flashlight meets perf budget
- **WHEN** FL is active on a dense map on the 2015 floor device
- **THEN** the frame p95 stays ≤16.6ms with the hole-punch Graphics approach, or falls back to the cheaper approximation if it doesn't