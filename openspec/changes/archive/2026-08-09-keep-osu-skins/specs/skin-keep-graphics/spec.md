# skin-keep-graphics

## ADDED Requirements

### Requirement: Slider Graphics dirty-flag
Slider `Graphics` SHALL only redraw when `startt` or `endt` changes, not every `render` call.

#### Scenario: Slider not redon when fully visible
- **WHEN** `startt=0, endt=1` and `render` is called 60 times
- **THEN** `Graphics.clear`/`stroke` is called at most once

### Requirement: Slider alpha inheritance
Slider `Container` SHALL NOT shadow `alpha` via `Object.defineProperty`; `worldAlpha` SHALL propagate via Pixi.

#### Scenario: Slider fades with hit object
- **WHEN** `hit.body.alpha` is set via `setbodyAlpha` during approach
- **THEN** the slider track fades accordingly
