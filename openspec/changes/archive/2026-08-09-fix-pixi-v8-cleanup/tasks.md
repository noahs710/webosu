## 1. Assets & Texture Lifecycle

- [x] 1.1 Replace `src/game/skin-loader.js` `Texture.from(img)` race with `await PIXI.Assets.load(blobUrl)` and `source`-based `revokeObjectURL` after `valid`, `destroy(false)` old `Skin` texture
- [x] 1.2 Add `isGameplayTexture` whitelist + `MAX 120` + `followpoint 0-9` cap, skip `hit*-*.png` numbered variants, map `combos-`/`numbers-` → `score-`
- [x] 1.3 Fix `src/game/playback.js` `createBackground` to use `Assets.load` for `blob:` and `renderer.render({container, target})` (v8) with `RenderTexture` destroy, handle `texture.source` not `baseTexture`
- [x] 1.4 Gate `src/vue/components/BeatmapList.vue` `HitCirclePrefix`/`ScorePrefix` lookups to `Skin[textname]?.valid` before `width` read

## 2. Slider Rendering

- [x] 2.1 Keep `src/game/SliderMesh.js` Graphics path but add dirty-flag: only `_draw()` when `startt/endt` changes, reduce 3→2 strokes (border + fill)
- [x] 2.2 Remove `Object.defineProperty SliderMesh alpha` shadowing, rely on `Container.worldAlpha`, fix `get geometry()` to not use `Graphics.geometry` before draw
- [x] 2.3 Ensure `src/game/playback.js` `createSlider` fallback `Graphics` draws shadow/border/inner and is always `visible` even when `SliderMesh` shader would have been used

## 3. Performance & Lifecycle

- [x] 3.1 Add `eventMode='none'` + `cullable` to `gamefield`, `cursorLayer`, `followpoint` sprites, `hit` sprites in `playback.js`/`launchgame.js`
- [x] 3.2 Fix `server/app.js` `setHeaders` for `@fastify/static` 10 compat (`res.setHeader` vs `res.header` vs `res.raw.setHeader`) and destroy `RenderTexture` with `true`
- [x] 3.3 Gate `src/vue/components/BeatmapList.vue` and `src/vue/pages/Home.js` `console.log` behind `import.meta.env.DEV`

## 4. Security Hardening

- [x] 4.1 `server/auth.js` throw if `JWT_SECRET` missing in prod, `TOKEN_TTL 7d`, `zipfs.js`/`skin-loader.js` zip-bomb guards (`size>20/50MB`, `count>300`, `total>50/200MB`)
- [x] 4.2 `server/app.js` sanitize `x-skin-name`/`filename` and `Content-Disposition` with `encodeURIComponent`, add `makeRateLimit` to `/api/skins` and `/api/webhook/score`, `server/index.js` WS `join` sanitize + `cursor 60/s` `chat 5/2s` rate limit
- [x] 4.3 `src/shell/gamesettings.js` whitelist `k in defaultsettings` to prevent prototype pollution, `src/game/skin-loader.js` `isGameplayTexture` already blocks menu/ranking

## 5. Cleanup Verification

- [x] 5.1 `npm run build` (Vite 8) + `npm test` (39 pass) + manual WhiteCat 3.0 test (no `OUT_OF_MEMORY`, sliders visible, background not `WHITE`)
