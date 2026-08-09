# slider-rendering

## ADDED Requirements

### Requirement: Slider track rendering via Graphics
The slider track SHALL be rendered as a `PIXI.Graphics` polyline (not a custom `GlProgram` shader) with `cap: "round"` and `join: "round"`, using `SliderTrackOverride` or combo color for fill and `SliderBorder` for border.

#### Scenario: Slider visible with default skin
- **WHEN** a beatmap with a slider is played with the default skin
- **THEN** the slider track is visible as a thick polyline matching the combo color

### Requirement: Slider dirty-flag batching
The slider `Graphics` SHALL only `clear()` and `stroke()` when `startt` or `endt` changes (snake), not every frame, to keep per-frame cost < 2 draw calls per visible slider.

#### Scenario: Slider does not redraw when not snaking
- **WHEN** a slider is fully visible (`startt=0, endt=1`) and `render` is called
- **THEN** `Graphics` is not cleared or restroked

### Requirement: Slider alpha inheritance
The slider `Container` SHALL use native `Container.alpha` inheritance (`worldAlpha`) and SHALL NOT shadow `alpha` via `Object.defineProperty`.

#### Scenario: Slider fades with hit object
- **WHEN** `hit.body.alpha` is set via `setbodyAlpha` during approach fade
- **THEN** the slider track fades accordingly without double-alpha
