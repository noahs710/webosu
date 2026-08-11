## MODIFIED Requirements

### Requirement: Slider track rendering via Graphics
The slider track SHALL be rendered as a `PIXI.Graphics` polyline with 3 strokes (shadow `w+4` black 0.35, border `w+6` white/SliderBorder 0.95, fill `w` SliderTrackOverride/combo 0.9) and `cap: "round"`/`join: "round"`, with `cullable=false`. `MeshRope` is optional fallback, not primary, until `tint`/`gradient` proven opaque. The slider track SHALL support the Flashlight (FL) mod's dim mask by being rendered on a layer that the FL overlay can darken, and the snaking-in/snaking-out timing SHALL match lazer's `SliderSnakeIn`/`SliderSnakeOut` durations.

#### Scenario: Slider visible with default skin
- **WHEN** a beatmap with a slider is played with default skin
- **THEN** the slider track is visible as a thick polyline with shadow+border+fill, not a single see-through stroke.

#### Scenario: Slider dims under Flashlight
- **WHEN** the Flashlight mod is active and a slider is in the dimmed area outside the viewport
- **THEN** the slider track is darkened by the FL overlay (the FL Graphics renders on top of the slider)

#### Scenario: Slider snaking matches lazer timing
- **WHEN** a slider snakes in
- **THEN** the snake-in duration matches the lazer `SliderSnakeIn` time (a fraction of the approach time), not the current `approachTime/3` approximation

### Requirement: Slider dirty-flag batching
The slider `Graphics` SHALL only `clear()` and `stroke()` when `startt` or `endt` changes (snake), not every frame, and SHALL set `_g.visible=true`. `render()` SHALL gate `_draw()` on `_dirty`.

#### Scenario: Slider does not redraw when not snaking
- **WHEN** a slider is fully visible (`startt=0, endt=1`) and `render` is called
- **THEN** `Graphics` is not cleared or restroked.

### Requirement: Slider alpha inheritance
The slider `Container` SHALL use native `Container.alpha` inheritance (`worldAlpha`) and SHALL NOT shadow `alpha` via `Object.defineProperty`; `cullable` SHALL be `false`.

#### Scenario: Slider fades with hit object
- **WHEN** `hit.body.alpha` is set via `setbodyAlpha` during approach fade
- **THEN** the slider track fades accordingly without double-alpha and is not culled.