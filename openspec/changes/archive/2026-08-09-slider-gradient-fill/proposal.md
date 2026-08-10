## Why

User recalls a gradient/shader on sliders (not flat fill); current `SliderMesh` uses flat `SliderTrackOverride`/combo `color` via `stroke({color})`, while original shader had `uSampler2`/`FillGradient` linear gradient and `hitcircleoverlay` tint, making flat fill look see-through vs memory of gradient.

## What Changes

- Spike: compare flat fill vs `FillGradient` linear (`new PIXI.FillGradient({type:"linear", colorStops:[{offset:0,color:combo},{offset:1,color:lighten(combo,0.2)}]})`) vs `MeshRope` with `texture: sliderb.png` repeated (`textureScale:1`) vs `Graphics` `tint` + `alpha`.
- Decision: flat is sufficient (simplest) vs `FillGradient` for memory-of-gradient, vs textured rope for `sliderb` art.

## Capabilities

### New Capabilities
- `slider-gradient-spike`: Spike to compare flat vs gradient vs textured slider fill.

### Modified Capabilities
- `slider-shader`: Will adopt flat vs gradient in follow-up.
- `skinned-text-layout`: If `sliderb` art used, note `sliderb@2x`.

## Impact

- `src/game/SliderMesh.js` (`FillGradient`, `MeshRope` `textureScale`), `src/game/skin-loader.js` (`sliderb` is2x).
- No breaking API, spike only.
