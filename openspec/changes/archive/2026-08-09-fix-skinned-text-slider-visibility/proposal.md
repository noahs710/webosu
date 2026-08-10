## Why

Skinned text (score/combo/accuracy) shows correct values after `1012165` but remains too tight/overlapping on skins with `ScoreOverlap` and `@2x` textures; sliders are see-through with no border/gradient/shader (only dot/arrow/followpoint visible). Both break readability on default and custom skins (WhiteCat etc.) and were introduced while fixing OOM/`OUT_OF_MEMORY` and `Skin is not defined` crashes. We need to capture the text-layout and slider-shader contracts so default skin is bug-free and high-perf.

## What Changes

- **Text layout:** Clarify `ScoreOverlay` digit layout uses `tex.orig.width`/`tex.source.width` with `resolution` awareness for `@2x`, and `charspacing - ScoreOverlap` + per-digit `getBounds` padding; keep `charspacing 12` but allow skin `HitCircleOverlap`/`ScoreOverlap` semantics.
- **Slider shader:** Restore visible outline/gradient for `SliderMesh` — 3-stroke Graphics (shadow `w+4` black 0.35, border `w+6` white 0.95, fill `w` combo/override) with dirty-flag, `cullable=false`, `alpha` via `worldAlpha`; keep `MeshRope` as optional GPU path but not primary until `tint`/`gradient` proven.
- **Asset lifecycle:** Keep `blob:` `parser:"texture"` for `Assets.load`, `source` not `baseTexture`, `revokeObjectURL` after `valid`, `MAX 60/40` cap, `followpoint 0-9`, `isGameplayTexture` whitelist.
- **No breaking API** — same `window.Skin` contract.

## Capabilities

### New Capabilities
- `skinned-text-layout`: Digit sprite layout, spacing, padding, and `@2x` resolution handling for score/combo/accuracy and hit numbers.
- `slider-shader`: Visible slider track rendering (border/gradient/shadow) with dirty-flag batching.

### Modified Capabilities
- `osk-skin-loading`: Keep whitelist/May cap, note `@2x` resolution handling.
- `slider-rendering`: Clarify Graphics 3-stroke vs MeshRope.
- `pixi-asset-lifecycle`: Keep blob lifecycle, note `parser:"texture"` for all `blob:` (background + skins).

## Impact

- `src/game/overlay/score.js` (charspacing, `orig.width`/`source.width`, `ScoreOverlap`),
- `src/game/SliderMesh.js` (Graphics vs MeshRope, shadow/border/fill),
- `src/game/playback.js` (`createBackground` parser, `createSlider` fallback),
- `src/game/skin-loader.js` (is2x resolution),
- `src/game/launchgame.js` (cursorLayer cullable),
- No new deps, no breaking API.
