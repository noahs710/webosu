# osk-skin-loading Specification

## Purpose
TBD - created by archiving change full-osk-skin-support. Update Purpose after archive.
## Requirements
### Requirement: Unified .osk file import
The system SHALL accept a .osk file (renamed .zip) via drag-and-drop or file picker and extract all contents using fflate's `unzipSync` with limits `50`/`80MB` file, `1000` entries (log not throw), `300MB` unzipped throw, `200MB` log, then cap to `60/40` gameplay-relevant textures (not reject `too many files`).

#### Scenario: Import osk via file picker
- **WHEN** user selects a `.osk` file
- **THEN** the system unzips it with `fflate` and proceeds to skin application

#### Scenario: WhiteCat 806 files not rejected
- **WHEN** WhiteCat 3.0 (`806` files, ~30MB zip) is selected
- **THEN** the system logs `"many files 806 capping to gameplay 60"` and proceeds, not `"too many files in osk"`.

### Requirement: Comprehensive name mapping
The system SHALL map osu! skin filenames to webosu spritesheet keys using a mapping table with at minimum these entries: `hitcircle.png` → `disc.png`, `sliderb0.png` → `sliderb.png`, `sliderb.png` → `sliderb.png`, `default-0.png` through `default-9.png` → `0.png` through `9.png`, `default-x.png` → `score-x.png`, `default-dot.png` → `dot.png`, `default-percent.png` → `percent.png`, `default-comma.png` → (added dynamically). All other filenames matching webosu keys SHALL be applied directly.

#### Scenario: Name map translates hitcircle.png
- **WHEN** the skin contains `hitcircle.png`
- **THEN** it overrides `Skin["disc.png"]` texture

### Requirement: skin.ini parsing
The system SHALL parse the `skin.ini` file from the .osk and extract: `[General]` CursorSize, CursorRotate, CursorExpand, CursorCentre, SliderStyle; `[Colours]` Combo1-8, SliderBorder, SliderTrackOverride, ApproachCircle; `[Fonts]` HitCirclePrefix, HitCircleOverlap, ScorePrefix, ScoreOverlap.

#### Scenario: Parse skin.ini sections
- **WHEN** a skin.ini with `[Colours] Combo1: 255,0,0` is parsed
- **THEN** the parsed result contains `comboColors[0]=255,0,0`

### Requirement: Texture loading via blob URLs
The system SHALL create blob URLs from extracted PNG file buffers and load them as PIXI textures via `PIXI.Assets.load({src: blobUrl, parser:"texture", data:{scaleMode:"linear", autoGenerateMipmaps:false}})` (not `PIXI.Texture.from` with `Image` race). Textures SHALL override `window.Skin` after `await` and `source.once("update", () => URL.revokeObjectURL(blobUrl))` after `valid` and `source.resolution` set to `2` for `@2x` else `1`. Only gameplay-relevant textures SHALL be loaded, capped at `60` (`40` on low-end `deviceMemory<=4`/`hardwareConcurrency<=4`/`dpr>2`), skipping `hit*-*.png` numbered variants and `followpoint>9`. `is2x` flag SHALL be stored per texture for `skinned-text-layout` width handling.

#### Scenario: Blob URL texture overrides Skin with is2x
- **WHEN** a mapped PNG `cursor@2x.png` is extracted on `devicePixelRatio=2`
- **THEN** `window.Skin["cursor.png"]` becomes the `@2x` texture with `source.resolution=2`.

### Requirement: @2x texture support
When `devicePixelRatio > 1` and a `texture@2x.png` variant exists in the .osk, the system SHALL prefer the `@2x` variant and set `is2x=true` for shared `combos-`/`numbers-` mappings, with `tex.source.resolution` handled per `skinned-text-layout`.

#### Scenario: High-DPI prefers @2x
- **WHEN** `devicePixelRatio` is 2 and both `cursor.png` and `cursor@2x.png` exist
- **THEN** the system uses `cursor@2x.png` texture with correct `orig.width`.

### Requirement: Hitsound loading from .osk
The system SHALL load all hitsound files (normal-*, soft-*, drum-*) from the .osk and map them to the game's `game.sample` structure, overriding the default hitsounds from `/hitsounds/`.

#### Scenario: Hitsound override from skin
- **WHEN** the skin contains `normal-hitnormal.wav`
- **THEN** `game.sample.normal.hitnormal` plays the skin sound

### Requirement: IndexedDB caching
The system SHALL cache extracted skin file buffers (as raw `Uint8Array`) in IndexedDB so subsequent page loads can recreate blob URLs without re-extracting the .osk.

#### Scenario: Skin survives reload via cache
- **WHEN** a skin is applied and page reloads
- **THEN** the system recreates textures from IndexedDB without requiring re-import

### Requirement: Fallback to default
For any skin element not present in the .osk, the system SHALL fall back to the default spritesheet texture. For any skin.ini setting not present, the system SHALL fall back to the default game setting.

#### Scenario: Missing element uses default
- **WHEN** the skin lacks `approachcircle.png`
- **THEN** the game keeps the default `approachcircle.png` texture

### Requirement: skin.ini color overrides
The system SHALL apply skin.ini `Combo1-8` colors to override beatmap combo colors, and `SliderBorder` / `SliderTrackOverride` to override beatmap slider colors, when a skin is loaded.

#### Scenario: Combo colors from skin.ini
- **WHEN** `skin.ini` defines `Combo1` and a beatmap loads
- **THEN** combo 0 uses the skin's Combo1 color instead of the beatmap's
