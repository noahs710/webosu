## Why

Pixi v8 migration left 7 high-signal leaks and non-best-practice paths that now surface as user-visible bugs: `OUT_OF_MEMORY Bad image data` per-note with large skins (WhiteCat 806 → 120 cap still leaks), `bgTexture invalid` fallback to `Texture.WHITE`, `Geometry-3k8KnbxX.js` second-arg deprecation, and `Texture.baseTexture` deprecation. Sliders were replaced with Graphics but still spam `SliderMesh geometry missing` per slider and lack dirty-flag batching, causing 275×3 strokes/frame and load-time regression. JWT fallback, zip-bomb, header injection, and WS unauthed remain.

## What Changes

- **Assets leak & OOM**: cap `isGameplayTexture` whitelist, `MAX_TEXTURES=120`, `followpoint 0-9` only, skip `hit*-*.png` numbered variants, map `combos-*`/`numbers-*` → `score-*`, use `Image` `decoding="async"` + `PIXI.Assets.cache.set` with `source` not `baseTexture`, `URL.revokeObjectURL` on destroy, `RenderTexture` destroy with `true`
- **Background**: `PIXI.Assets.load(blob:)` for `bgTexture` with `valid` check and `WHITE` fallback, `renderer.render({container, target})` (v8) not 2-arg, `BlurFilter({strength, quality})` not positional
- **SliderMesh**: replace 200 LOC shader (`gl.clearDepth/colorMask/drawElements` double-pass) with `Graphics` polyline, `startt/endt` dirty-flag, 3→2 strokes, fix `alpha` shadowing (`Object.defineProperty` removed), `geometry` shim removed
- **Auth**: `JWT_SECRET` throws in `production` if missing, `TOKEN_TTL 30d→7d`
- **Zip**: `importBlob`/`loadOsk` size/count guards (`50MB/300 files/200MB`, `20MB/300/50MB`)
- **Headers/XSS**: `x-skin-name` sanitized `[^a-z0-9._-]` + `encodeURIComponent` for `Content-Disposition`
- **Prototype pollution**: `loadFromLocal` whitelists `k in defaultsettings`
- **WS**: `join` sanitize `[^a-z0-9_-]`, `cursor` 60/s, `chat` 5/2s, `text` strip `<>&"`

## Capabilities

### New Capabilities
- `pixi-asset-lifecycle`: Blob URL lifecycle, RenderTexture destroy, `source` vs `baseTexture` handling

### Modified Capabilities
- `slider-rendering`: Slider track rendering from shader to Graphics with dirty-flag
- `game-cursor`: `CursorCentre` anchor handling (already spec'd, now verified)
- `osk-skin-loading`: Cap and whitelist for OOM prevention
- `skin-animation-frames`: Followpoint 0-9 limit

## Impact

- `src/game/skin-loader.js`, `src/game/SliderMesh.js`, `src/game/playback.js` (createBackground, createSlider, updateSlider, destroy), `src/game/initgame.js`, `src/game/launchgame.js`, `src/game/overlay/*`, `src/game/zipfs.js`, `server/auth.js`, `server/index.js`, `server/app.js`, `src/shell/gamesettings.js`, `src/game/logger.js`, `src/shell/beatmapCache.js`
- No breaking API changes; behavior is same but non-leaking and batched
- Dependencies: no new deps (rosu-pp-js already moved to server)
