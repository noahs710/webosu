# slider-rendering

## MODIFIED Requirements

### Requirement: Slider track rendering via Graphics
The slider track SHALL be rendered as a `PIXI.Graphics` polyline with 3 strokes (shadow `w+4` black 0.35, border `w+6` white/SliderBorder 0.95, fill `w` SliderTrackOverride/combo 0.9) and `cap: "round"`/`join: "round"`, with `cullable=false`. `MeshRope` is optional fallback, not primary, until `tint`/`gradient` proven opaque.

#### Scenario: Slider visible with default skin
- **WHEN** a beatmap with a slider is played with default skin
- **THEN** the slider track is visible as a thick polyline with shadow+border+fill, not a single see-through stroke.

### Requirement: Slider dirty-flag batching
The slider `Graphics` SHALL only `clear()` and `stroke()` when `startt` or `endt` changes (snake), not every frame, and SHALL set `_g.visible=true`. `render()` SHALL gate `_draw()` on `_dirty`.

#### Scenario: Slider does not redraw when not snaking
- **WHEN** a slider is fully visible (`startt=0, endt=1`) and `render` is called
- **THEN** `Graphics` is not cleared or restroked.

### Requirement: Slider alpha inheritance
The slider `Container` SHALL use native `Container.alpha` (`worldAlpha`) and SHALL NOT shadow `alpha` via `Object.defineProperty`; `cullable` SHALL be `false`.

#### Scenario: Slider fades with hit object
- **WHEN** `hit.body.alpha` is set via `setbodyAlpha` during approach fade
- **THEN** the slider track fades accordingly without double-alpha and is not culled.
