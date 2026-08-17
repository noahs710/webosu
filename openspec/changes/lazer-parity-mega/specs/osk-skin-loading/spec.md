# osk-skin-loading Delta — lazer-parity-mega

## ADDED Requirements

### Requirement: @2x variants of whitelisted textures are loaded
The texture whitelist SHALL include `@2x` variants of all whitelisted base names (`approachcircle@2x.png`, `hitcircle@2x.png`, `hitcircleoverlay@2x.png`, `sliderb@2x.png`, `sliderendcircle@2x.png`, `sliderfollowcircle@2x.png`, `reversearrow@2x.png`, `cursor@2x.png`, `cursortrail@2x.png`, `cursormiddle@2x.png`, `default-N@2x.png`, `score-N@2x.png`, `hit0/50/100/300@2x.png`). These SHALL be loaded when the base name is whitelisted.

#### Scenario: WhiteCat sliderb@2x.png loads
- **WHEN** a skin contains `sliderb@2x.png`
- **THEN** it is loaded into the active texture set with `is2x: true` and `source.resolution: 2`

#### Scenario: @2x-only texture does not duplicate-load as 1x
- **WHEN** a skin ships only `sliderb@2x.png` (no `sliderb.png`)
- **THEN** the @2x is loaded and the base slot is NOT also occupied by a fallback 1x load

### Requirement: sliderb@2x texture-fill variant loaded
When `sliderStyle: 2` is parsed from skin.ini AND `sliderb@2x.png` exists in the skin, the loader SHALL make `sliderb@2x.png` available as the texture-fill source for `SliderMesh` (not the 1x variant).

#### Scenario: Style 2 skin uses hi-res sliderb
- **WHEN** a skin has `sliderStyle: 2` in skin.ini and both `sliderb.png` and `sliderb@2x.png` exist
- **THEN** the texture-fill in `SliderMesh` uses the @2x variant for crisper rendering

### Requirement: Beatmap ApproachCircle color consumed
The `[Colours] ApproachCircle` value parsed from beatmap files SHALL be consumed by `playback.js` when a skin does not define its own `ApproachCircle` (skin.ini value wins; beatmap value is fallback).

#### Scenario: Skin overrides beatmap ApproachCircle
- **WHEN** both skin.ini `[Colours] ApproachCircle` and beatmap `[Colours] ApproachCircle` are set
- **THEN** the approach circle is tinted with the skin value

#### Scenario: Beatmap ApproachCircle used when skin does not define it
- **WHEN** skin.ini `[Colours] ApproachCircle` is unset AND the beatmap defines `[Colours] ApproachCircle`
- **THEN** the approach circle is tinted with the beatmap value, else falls back to combo color

## MODIFIED Requirements

### Requirement: Texture loading via blob URLs
The system SHALL create blob URLs from extracted PNG file buffers and load them as PIXI textures via `PIXI.Assets.load({src: blobUrl, parser:"texture", data:{scaleMode:"linear", autoGenerateMipmaps:false}})` (not `PIXI.Texture.from` with `Image` race). Textures SHALL override `window.Skin` after `await` and `source.once("update", () => URL.revokeObjectURL(blobUrl))` after `valid` and `source.resolution` set to `2` for `@2x` else `1`. Only gameplay-relevant textures SHALL be loaded, capped at `60` (`40` on low-end `deviceMemory<=4`/`hardwareConcurrency<=4`/`dpr>2`). `hit*-<n>.png` numbered variants (`hit0-0.png` through `hit0-59.png`, etc.) continue to be intentionally skipped (runtime uses base `hit0.png`); the cap on `followpoint-<n>.png` is lifted from `>9` to the parsed `sliderBallFrames` default of `10` (a new cap of `<=10` if `sliderBallFrames` is unspecified, or `<=sliderBallFrames` when specified). `is2x` flag SHALL be stored per texture for `skinned-text-layout` width handling.

*Rationale for MODIFIED: replaced the hardcoded `followpoint >9` skip rule with one keyed off the (now-consumed) `sliderBallFrames` config; documented the intentional skip of `hit*-<n>.png` variants explicitly.*

#### Scenario: Blob URL texture overrides Skin with is2x
- **WHEN** a mapped PNG `cursor@2x.png` is extracted on `devicePixelRatio=2`
- **THEN** `window.Skin["cursor.png"]` becomes the `@2x` texture with `source.resolution=2`

#### Scenario: followpoint-15.png loads when sliderBallFrames=20
- **WHEN** a skin.ini sets `sliderBallFrames: 20` and the skin contains `followpoint-15.png`
- **THEN** `followpoint-15.png` is loaded (not skipped by the old `>9` rule)

#### Scenario: followpoint-15.png is skipped when sliderBallFrames=10 (default)
- **WHEN** no `sliderBallFrames` is set (default 10) and the skin contains `followpoint-15.png`
- **THEN** `followpoint-15.png` is skipped

#### Scenario: hit0-12.png is not loaded (intentional skip)
- **WHEN** a skin contains `hit0-12.png`
- **THEN** it is skipped (numbered hit variants are reserved for future animation support, not loaded by default to save GPU)
