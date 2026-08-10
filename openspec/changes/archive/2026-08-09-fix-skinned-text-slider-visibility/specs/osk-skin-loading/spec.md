# osk-skin-loading

## MODIFIED Requirements

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

### Requirement: Unified .osk file import
The system SHALL accept a .osk file (renamed .zip) via drag-and-drop or file picker and extract all contents using fflate's `unzipSync` with limits `50`/`80MB` file, `1000` entries (log not throw), `300MB` unzipped throw, `200MB` log, then cap to `60/40` gameplay-relevant textures (not reject `too many files`).

#### Scenario: WhiteCat 806 files not rejected
- **WHEN** WhiteCat 3.0 (`806` files, ~30MB zip) is selected
- **THEN** the system logs `"many files 806 capping to gameplay 60"` and proceeds, not `"too many files in osk"`.
