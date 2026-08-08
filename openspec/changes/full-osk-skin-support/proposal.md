## Why

webosu currently only supports custom hitsounds from .osk files — the skin textures, skin.ini configuration, judgement images, and cursor trail are all ignored. Users who drop a real osu! skin (.osk) get a half-applied skin that looks broken. osu!lazer desktop loads the entire .osk and applies every element; webosu should match that behavior.

## What Changes

- **Unified .osk import**: A single drag-and-drop / file picker that extracts the entire .osk (textures + hitsounds + skin.ini) and applies all elements to the game
- **Full name mapping**: Expand the 2-entry `skinNameMap` to ~30 entries covering all osu! skin element names → webosu spritesheet keys
- **skin.ini parser**: Parse `[General]`, `[Colours]`, and `[Fonts]` sections — apply CursorSize, Combo1-8 colors, SliderBorder, SliderTrackOverride, HitCirclePrefix, ScorePrefix
- **Judgement images**: Replace `PIXI.Text` judgements ("300", "100", "50", "miss") with `PIXI.Sprite` using `hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`, `hit300g.png` from the skin — fall back to text if no skin loaded
- **Cursor trail texture**: Use `cursortrail.png` from the skin instead of cloning the cursor sprite
- **@2x texture support**: When `devicePixelRatio > 1`, prefer `texture@2x.png` over `texture.png` for sharper rendering
- **Animation frame support**: Cycle through `followpoint-0.png` through `followpoint-9.png` and slider ball frames when present
- **Blob URL storage**: Store extracted skin files as blob URLs (not base64) for efficient memory usage; cache in IndexedDB
- **Combo color override**: skin.ini `Combo1-8` override beatmap combo colors when a skin is loaded
- **Slider color override**: skin.ini `SliderBorder` and `SliderTrackOverride` override beatmap slider colors

## Capabilities

### New Capabilities
- `osk-skin-loading`: Unified .osk file extraction, name mapping, skin.ini parsing, texture loading, hitsound loading, and caching
- `judgement-images`: Game renders hit0/50/100/300 as PIXI sprites from skin textures instead of plain text
- `skin-animation-frames`: Cycling animation frames for follow points, slider ball, and other animated skin elements

### Modified Capabilities
- `game-cursor`: Cursor trail uses cursortrail.png from skin instead of cloned cursor sprite; CursorSize/CursorRotate from skin.ini applied

## Impact

- `src/game/initgame.js`: Expand skinNameMap, rewrite applyCustomSkin to use blob URLs, add skin.ini parsing
- `src/game/playback.js`: Judgement rendering (Text → Sprite), combo color override from skin.ini, slider color override, animation frame cycling
- `src/game/launchgame.js`: Cursor trail uses cursortrail.png, CursorSize from skin.ini
- `src/game/overlay/score.js`: HP bar may use scorebar-bg/colour alt style
- `src/vue/components/SettingsPanel.vue` or new skin import UI: unified .osk drop zone
- `src/shell/gamesettings.js`: Store skin.ini settings (combo colors, cursor size, etc.)
- Dependencies: fflate (already installed), no new dependencies needed
