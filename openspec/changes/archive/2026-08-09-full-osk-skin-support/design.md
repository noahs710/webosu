## Context

webosu uses a PIXI spritesheet (`sprites.json` + `sprites.png`) with 45 frames as the default skin. A `skinNameMap` with only 2 entries maps osu! skin filenames to webosu spritesheet keys. Custom skins are stored as base64 strings in localforage. The game renders judgements as `PIXI.Text` (not images), uses a cloned cursor sprite for the trail, and ignores skin.ini entirely.

Real osu! skins (.osk files) contain 200-300 files: PNG textures, WAV/OGG hitsounds, a `skin.ini` config file, @2x high-DPI variants, and animation frame sequences. Both test skins (clearblack.osk: 285 files, dokidoki: ~200 files) are complete, valid osu! skins.

## Goals

1. **Full .osk import**: Drop a .osk file → all game textures, hitsounds, and skin.ini settings are extracted and applied on next game launch
2. **skin.ini support**: CursorSize, Combo1-8 colors, SliderBorder, SliderTrackOverride, HitCirclePrefix, ScorePrefix, CursorRotate, CursorExpand
3. **Judgement images**: hit0/50/100/300/300g.png rendered as PIXI sprites instead of text
4. **@2x support**: Prefer @2x textures when devicePixelRatio > 1
5. **Animation frames**: Cycle through followpoint-0..9 and slider ball frames
6. **Efficient storage**: Blob URLs + IndexedDB instead of base64 + localforage

## Non-Goals

- Ranking/results screen skin images (ranking-X.png etc.) — keep CSS-based results screen
- Pause menu skin images (pause-back.png etc.) — keep CSS-based pause menu
- Mania skin elements — osu! standard mode only
- Skin mixing/layering — one skin at a time
- Skin sharing/upload to server — that's a separate feature

## Decisions

### D1: Blob URLs instead of base64
**Decision**: Store extracted skin files as Blob URLs created from raw `Uint8Array` buffers. Cache the raw buffers in IndexedDB.
**Rationale**: Base64 encoding adds 33% overhead and requires encoding/decoding. Blob URLs are zero-copy — PIXI can load them directly via `Texture.from(blobURL)`. IndexedDB stores binary data natively (no encoding).
**Alternative**: Keep base64 in localforage (simpler, but wasteful and slower).

### D2: Comprehensive name mapping table
**Decision**: A single `OSK_NAME_MAP` object with ~30 entries mapping osu! filenames to webosu spritesheet keys.
**Rationale**: Most osu! skin names already match webosu spritesheet keys (approachcircle.png, cursor.png, etc.). Only a handful need translation (hitcircle.png → disc.png, sliderb0.png → sliderb.png, default-N.png → N.png).
**Alternative**: Rename spritesheet keys to match osu! names exactly (would break existing code).

### D3: Judgement sprites with text fallback
**Decision**: When a skin is loaded, judgements render as `PIXI.Sprite` using hit0/50/100/300.png. When no skin is loaded, fall back to the current `PIXI.Text` approach.
**Rationale**: Maintains backward compatibility (default webosu skin has no judgement images). Skins that include judgement images get the full osu! visual experience.
**Alternative**: Always use text (simpler, but doesn't use skin images). Always use sprites (would need default judgement images bundled).

### D4: skin.ini as a parsed config object
**Decision**: Parse skin.ini into a `skinConfig` object stored on `window.game`. The game reads from it during initialization and rendering.
**Rationale**: Centralized config that all game modules can read. Avoids scattering skin.ini parsing across multiple files.
**Alternative**: Store each setting as a separate global (messy, hard to track).

### D5: @2x selection at load time
**Decision**: When loading a texture from the .osk, check if `texture@2x.png` exists and `devicePixelRatio > 1`. If so, use the @2x version.
**Rationale**: Pixi 8 handles resolution scaling automatically when a texture is created at the correct resolution. Loading @2x textures gives sharper rendering on high-DPI displays.
**Alternative**: Always use 1x textures (simpler, but blurry on retina displays).

### D6: Animation frame cycling in the render loop
**Decision**: Store animation frame sequences as arrays of PIXI textures. In the render loop, cycle through them based on elapsed time.
**Rationale**: osu! skins use numbered frames (followpoint-0.png through followpoint-9.png). The game needs to advance through these frames at a consistent rate.
**Alternative**: Use PIXI.AnimatedSprite (built into Pixi 8). Could use this, but manual cycling gives more control over timing.

## Risks / Trade-offs

- [Large .osk files (5-10MB) may take time to extract and load] → Use async loading with progress indicator; cache in IndexedDB so subsequent loads are instant
- [Some skins may have missing elements] → Fall back to default spritesheet textures for any missing skin element
- [Blob URLs are revoked when the page unloads] → Recreate from IndexedDB cache on page load; blob URLs are only needed during gameplay
- [skin.ini format varies between skin versions] → Parse defensively; ignore unknown keys; default to sensible values
- [Animation frame timing may differ from osu!lazer] → Use a reasonable default FPS (e.g., 60fps for follow points); allow skin.ini to override

## Migration Plan

1. Add the name mapping table and skin.ini parser (no breaking changes)
2. Refactor `applyCustomSkin` to use blob URLs instead of base64
3. Add judgement sprite support (text fallback preserved)
4. Add @2x and animation frame support
5. Update the settings page UI to accept .osk files (unified skin + hitsound import)
6. Test with both provided .osk files (clearblack.osk and dokidoki)

## Open Questions

- Should we support `scorebar-bg.png` / `scorebar-colour.png` as an alternative HP bar style? (Some skins use this instead of hpbarleft/mid/right)
- Should cursor rotation (`CursorRotate: 1`) animate the cursor spinning? (osu!lazer does this)
- Should we support `comboburst.png` (the character that appears on combo milestones)?
