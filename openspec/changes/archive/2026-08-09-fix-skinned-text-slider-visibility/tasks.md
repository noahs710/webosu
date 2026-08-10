## 1. Skinned Text Layout

- [x] 1.1 Fix `src/game/overlay/score.js` `setSpriteArrayText` to use `tex.orig.width` (fallback `source.width/resolution`) + `tex.valid` not forcing `score-0`, `knownwidth = scale*(origWidth+effSpacing)` with `charspacing 12` and `ScoreOverlap`
- [x] 1.2 Verify `@2x` handling (`is2x` flag, `source.resolution 2/1`) not double-counting width

## 2. Slider Shader

- [x] 2.1 Make `src/game/SliderMesh.js` 3-stroke Graphics (shadow `w+4` black 0.35, border `w+6` white 0.95, fill `w` combo/override) with `cullable=false`, dirty-flag
- [x] 2.2 Keep `src/game/playback.js` `createSlider` fallback 3-stroke shadow/border/fill and `cullable=false`
- [x] 2.3 Ensure `src/game/playback.js` judgements/follow lines `cullable=false` for visibility

## 3. Asset Lifecycle

- [x] 3.1 Fix `src/game/skin-loader.js` `loadOsk` to log not throw on `1000` entries, cap `60/40`, and `applySkin` concurrent `Promise.all` 6 with `parser:"texture"` and `is2x` resolution, no `Assets.unload`/`destroy`
- [x] 3.2 Fix `src/game/playback.js` `createBackground` to use `parser:"texture"` for `blob:` and `Assets.unload` not `destroy`

## 4. Verification

- [x] 4.1 `npm run build` + `npm test` + manual default/WhiteCat (no overlap, slider opaque with border, no `Assets` warnings)
