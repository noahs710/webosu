## Why

Default skin sliders are invisible and any custom skin (e.g. WhiteCat 3.0 ~ DT with 806 files) makes *all* assets invisible with `WebGL: OUT_OF_MEMORY bad image data` per note. The previous fix capped to 120 and switched `SliderMesh` to `Graphics` but left a per-slider `gerror` spam (396×) and a `bgTexture.valid` crash, and kept `catboy.best` on `dev` for some paths. We need to keep osu! skin capability while fixing the two blackouts, and unify on `catboy.best` with a single random `search` call.

## What Changes

- Keep `isGameplayTexture` whitelist + `MAX 60` (fallback `40` on low-end `deviceMemory<=4`/`hardwareConcurrency<=4`/`dpr>2`) + `followpoint 0-9` + `hit*-*.png` skip, but fix `applySkin` to use `await PIXI.Assets.load({src: blobUrl, parser: "texture"})` (blob: needs `parser:"texture"` per Assets skill), `source` not `baseTexture`, `revokeObjectURL` after `valid` — only selected skin loaded at game start via `loadCachedSkin` single `skinFiles` store
- Switch `SliderMesh` to `MeshRope` (`pixijs-scene-mesh` skill: `new MeshRope({texture: WHITE, points: curve.map(p=>new Point(p.x,p.y)), width: radius*2, textureScale:0})` tinted by `SliderTrackOverride`/combo, batches if ≤100 verts `DIVIDES=16` ≈80 verts) but keep skin tint capability; keep `Graphics` only as fallback with dirty-flag (`startt/endt` only) and 3→2 strokes, remove `if (!body.geometry) throw` and `Object.defineProperty alpha` shadowing, fix `get geometry()` to return dummy
- Fix `createBackground` `bgTexture.valid` crash (handle `undefined` + `source.resource.load`) and use `renderer.render({container, target})` (v8) not 2-arg, `BlurFilter({strength, quality})` not positional, `eventMode='none'` + `cullable` on `gamefield`/`cursorLayer`/`hit` sprites for perf
- Keep `catboy.best` prod, never `dev.catboy.best` in prod build; random stays `GET https://catboy.best/api/v2/search?q=&limit=6&offset=random*400&status=1,3,4&mode=0` with retry if `[]` (not `GET /b/random` 6×)
- Keep `POST /api/webhook/score` and `POST /api/scores` both forwarding to Discord (both proxied `:8080`), no `api.catboy.best` for scores

## Capabilities

### New Capabilities
- `skin-keep-graphics`: Slider `Graphics` dirty-flag and lazy `Assets.load` for skins

### Modified Capabilities
- `osk-skin-loading`: Texture cap and whitelist kept, blob lifecycle fixed
- `skin-animation-frames`: `followpoint` 0-9 cap kept
- `game-cursor`: `CursorCentre` anchor handling kept
- `beatmap-cache`: Random `offset` retry kept

## Impact

- `src/game/skin-loader.js`, `src/game/SliderMesh.js`, `src/game/playback.js` (createBackground, createSlider), `src/shell/beatmapCache.js`, `src/shell/beatmapApi.js` (delete, logic moved to `beatmapCache`/`Home.js`), `src/vue/pages/home.js` (random), `server/app.js` (webhook), `src/game/logger.js` (gate)
- No breaking API; `dev.catboy.best` only via `VITE_API_BASE` in dev
