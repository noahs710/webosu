## 1. Skin Loading Keep

- [x] 1.1 Fix `skin-loader.js` `applySkin` to use `await PIXI.Assets.load({src: blobUrl, parser: "texture", data: {scaleMode: "linear", autoGenerateMipmaps: false}})` (blob: has no extension, needs `parser:"texture"` per Asset skill), `source` not `baseTexture`, `source.once("update", () => URL.revokeObjectURL(blobUrl))` after valid
- [x] 1.2 Keep `isGameplayTexture` whitelist + `MAX 60` (fallback `40` on low-end `deviceMemory<=4`/`hardwareConcurrency<=4`/`dpr>2` via `navigator.deviceMemory`/`hardwareConcurrency`/`devicePixelRatio`) + `followpoint 0-9` cap, map `combos-`/`numbers-` → `score-` — only selected skin loaded at game start via `loadCachedSkin` single `skinFiles` store

## 2. Slider Graphics Keep

- [x] 2.1 Switch `SliderMesh.js` to `MeshRope` (keep Graphics fallback) with dirty-flag, remove `alpha` defineProperty, fix `geometry` getter, keep skin tint via `tint`
- [x] 2.2 Fix `playback.js` `createSlider` to not throw on `!geometry` and silence per-slider `gerror` to `gdebug`
- [x] 2.3 Fix `playback.js` `createBackground` to use `Assets.load` + `render({container, target})` + `valid` guard

## 3. Beatmap API Unify

- [x] 3.1 Keep `catboy.best` prod, remove `dev.catboy.best` imports, keep `search` with `limit=6` + `offset random*400` + retry
- [x] 3.2 Delete `src/shell/beatmapApi.js` (dead) and keep logic in `beatmapCache`/`Home.js`

## 4. Verification

- [x] 4.1 `npm run build` + WhiteCat 3.0 manual (no OOM, sliders visible, background not white)
- [x] 4.2 Default skin manual (sliders visible)
