# slider-rendering Delta — lazer-parity-mega

## ADDED Requirements

### Requirement: Slider body renders per skin.ini sliderStyle
`SliderMesh._draw()` SHALL branch on the parsed `sliderStyle` from skin.ini: `sliderStyle: 1` renders as a linear-gradient fill along the track axis with rounded end caps; `sliderStyle: 2` renders the track as a repeating `sliderb.png` texture-fill (tiled along the track). Default behavior (no `sliderStyle` in skin.ini) SHALL match `sliderStyle: 1` (gradient+rounded), preserving prior visual output for the default skin.

#### Scenario: Style 1 skin renders gradient track
- **WHEN** a skin sets `sliderStyle: 1`
- **THEN** the slider body is drawn as a linear gradient with round endpoints

#### Scenario: Style 2 skin renders textured track
- **WHEN** a skin sets `sliderStyle: 2` and ships `sliderb.png` (or `sliderb@2x.png`)
- **THEN** the slider body is drawn as a repeating texture using the sliderb tile

#### Scenario: Default (no sliderStyle in skin) renders like Style 1
- **WHEN** a skin omits `sliderStyle` from skin.ini
- **THEN** the slider body renders identically to `sliderStyle: 1` (gradient)

## MODIFIED Requirements

### Requirement: Slider track rendering via Graphics
The slider track SHALL be rendered as a `PIXI.Graphics` polyline OR a `PIXI.MeshRope` textured rope, selected by the `sliderStyle` runtime strategy parameter (not a hardcoded path). Default `sliderStyle: 1` uses the existing 3-stroke Graphics polyline (shadow `w+4` black 0.35, border `w+6` white/SliderBorder 0.95, fill `w` SliderTrackOverride/combo 0.9, `cap: "round"`/`join: "round"`); `sliderStyle: 2` uses `MeshRope` with `sliderb.png` (or `sliderb@2x.png`) as the rope texture. `cullable=false` SHALL be preserved for both strategies. The `?gradient=textured` URL-parameter spike SHALL be removed in favor of the explicit `sliderStyle` strategy parameter.

*Rationale for MODIFIED: replaces the "Graphics always, MeshRope optional spike" statement with an explicit strategy-parameter pattern driven by skin.ini. Existing visual output for `sliderStyle: 1` is unchanged.*

#### Scenario: Slider visible with default skin (Style 1 path)
- **WHEN** a beatmap with a slider is played with default skin (`sliderStyle: 1` or unset)
- **THEN** the slider track is visible as a thick polyline with shadow+border+fill, not a single see-through stroke (existing behavior preserved)

#### Scenario: Slider visible with Style 2 skin (MeshRope path)
- **WHEN** a beatmap with a slider is played with a skin that sets `sliderStyle: 2` and ships `sliderb.png`
- **THEN** the slider track is rendered as a textured MeshRope using `sliderb.png`

#### Scenario: `?gradient=textured` URL parameter is removed
- **WHEN** the game is loaded with `?gradient=textured` in the URL
- **THEN** the parameter has no effect (sliderStyle comes only from skin.ini)
