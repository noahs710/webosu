# osk-skin-loading

## Requirements

### REQ-001: Unified .osk file import
The system SHALL accept a .osk file (renamed .zip) via drag-and-drop or file picker and extract all contents using fflate's `unzipSync`.

### REQ-002: Comprehensive name mapping
The system SHALL map osu! skin filenames to webosu spritesheet keys using a mapping table with at minimum these entries:
- `hitcircle.png` → `disc.png`
- `sliderb0.png` → `sliderb.png`
- `sliderb.png` → `sliderb.png`
- `default-0.png` through `default-9.png` → `0.png` through `9.png`
- `default-x.png` → `score-x.png`
- `default-dot.png` → `dot.png`
- `default-percent.png` → `percent.png`
- `default-comma.png` → (added to spritesheet dynamically)
All other osu! skin filenames that already match webosu spritesheet keys SHALL be applied directly without mapping.

### REQ-003: skin.ini parsing
The system SHALL parse the `skin.ini` file from the .osk and extract:
- `[General]`: CursorSize, CursorRotate, CursorExpand, CursorCentre, SliderStyle
- `[Colours]`: Combo1 through Combo8, SliderBorder, SliderTrackOverride, ApproachCircle
- `[Fonts]`: HitCirclePrefix, HitCircleOverlap, ScorePrefix, ScoreOverlap

### REQ-004: Texture loading via blob URLs
The system SHALL create blob URLs from extracted PNG file buffers and load them as PIXI textures via `PIXI.Texture.from(blobURL)`. Textures SHALL override the corresponding entries in `window.Skin`.

### REQ-005: @2x texture support
When `devicePixelRatio > 1` and a `texture@2x.png` variant exists in the .osk, the system SHALL prefer the @2x variant for sharper rendering.

### REQ-006: Hitsound loading from .osk
The system SHALL load all hitsound files (normal-*, soft-*, drum-*) from the .osk and map them to the game's `game.sample` structure, overriding the default hitsounds from `/hitsounds/`.

### REQ-007: IndexedDB caching
The system SHALL cache extracted skin file buffers (as raw `Uint8Array`) in IndexedDB so subsequent page loads can recreate blob URLs without re-extracting the .osk.

### REQ-008: Fallback to default
For any skin element not present in the .osk, the system SHALL fall back to the default spritesheet texture. For any skin.ini setting not present, the system SHALL fall back to the default game setting.

### REQ-009: skin.ini color overrides
The system SHALL apply skin.ini `Combo1-8` colors to override beatmap combo colors, and `SliderBorder` / `SliderTrackOverride` to override beatmap slider colors, when a skin is loaded.
