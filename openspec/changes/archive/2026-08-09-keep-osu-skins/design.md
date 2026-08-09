## Context

`catboy.best` prod vs `dev.catboy.best` (attached api-1.json) were mixed: `src/shell/beatmapApi.js` used `DEV` for `/b/{id}` etc., while `Home.js`/`BeatmapList.vue` used `catboy.best/api/v2`. Slider was 200 LOC shader, replaced with `Graphics` to fix WhiteCat OOM, but new `Graphics` still logs `geometry missing` per slider and does 825 strokes/frame with no dirty check, plus `Texture.from(img)` race. Background used `Texture.from(blob:)` + `render(sprite, texture)` 2-arg deprecated.

## Goals / Non-Goals

**Goals:**
- Keep osu! skin capability (all `hit`/`default-`/`score`/`cursor`/`slider`/`followpoint`/`approachcircle` etc.) while fixing OOM
- Default skin sliders visible (was broken after Graphics switch)
- Custom skin (WhiteCat 806) all assets visible (no `bad image data`)
- Random 6 via single `search` call, unified `catboy.best` prod

**Non-Goals:**
- Full alphabet `score-a.png` beyond digits (keep whitelist)

## Decisions

**D1: Keep `isGameplayTexture` + `MAX 60` (fallback 40 on low-end) + `followpoint 0-9`** — 806→60 on desktop, 806→40 on low-end (`navigator.deviceMemory <=4` or `hardwareConcurrency <=4` or `devicePixelRatio >2` on Android) to keep GPU <30MB. `MAX 60` already covers `hit`/`default-`/`score` digits, `cursor`/`followpoint 0-9`/`slider`/`approachcircle` etc., `combos-`→`score-` mapping kept. Fallback to 40 drops `lighting.png`/`star.png`/`playfield.png`/`comboburst` first (non-gameplay), then `followpoint 6-9` if still over. Alternative LRU eviction more code; cap is one-liner.

**D2: `applySkin` use `await Assets.load({src: blobUrl, parser: "texture"})` not `Texture.from(img)` after `src`** — `blob:` has no extension, so `parser:"texture"` is required per Assets skill (supported types table). Fixes `blob: not found in Cache` and `valid` race (`Texture.from` only reads cache, does not fetch). `img.decoding="async"` + `await img.decode()` also works, but `Assets.load` already handles `blob:` and caches. Revoke via `source.once("update", () => URL.revokeObjectURL(blobUrl))` after `valid`.

**D3: `SliderMesh` switch to `MeshRope` (per `pixijs-scene-mesh` skill)** — `MeshRope` is built for textured polyline with `width: circleRadius*2`, `texture: WHITE` tinted by `SliderTrackOverride`/`combo` (so skins still apply via `tint`), `points: hit.curve.curve.map(p=>new Point(p.x,p.y))`, `textureScale:0` (stretch). Batches if `≤100 verts` (`DIVIDES=16` + `curve.length~20` ≈80 verts). Rationale: `Graphics` `clear+stroke` per `render` is 825 CPU draw calls; `MeshRope` is GPU batched, 1 draw per slider, keeps skin tint capability. Keep `Graphics` fallback only if `MeshRope` fails.

**D4: Remove `if (!body.geometry) throw` and make `SliderMesh` not throw on `Graphics` geometry** — was `Graphics` `_g.geometry` empty before first `_draw`, so check always threw 275×. For `MeshRope`, `geometry` is internal `MeshGeometry` always valid after `new MeshRope`, so no throw needed. Keep `get geometry()` shim for `playback.js:856` compat, but return `this._rope?.geometry` or dummy.

**D5: `createBackground` use `Assets.load` + `render({container, target})`** — Fixes `valid` crash (handle `undefined`) and `Geometry-3k8KnbxX.js` deprecation (2-arg → options). Keep `RenderTexture` for blur, destroy with `true`.

**D6: Random keep `search` with `limit=6` + `offset random*400` + retry if `[]`** — 6 at once, no 6× `/b/random`. `dev` only via `VITE_API_BASE`.

## Risks / Trade-offs

- [Assets.load for 120 blobs serial → slow] → Mitigation: `Promise.all` with concurrency 6, keep `isGameplayTexture` cap
- [Graphics 2 strokes vs 3, visual diff] → Mitigation: keep border + inner, drop extra crisp pass
- [Blob revoke too early] → Mitigation: revoke after `texture.valid` and `source.resource.load`

## Migration Plan

1. Patch `skin-loader` whitelist + `applySkin` Assets.load
2. Patch `SliderMesh` dirty-flag + remove alpha defineProperty
3. Patch `playback` `loadBackground` Assets.load + valid guard + render options
4. `npm run build` + WhiteCat + default manual
5. Keep `beatmapApi.js` deleted, logic in `beatmapCache`/`Home.js`

## Open Questions

- Should `followpoint` animation be 12fps (80ms) vs 60fps?
- Keep `logger.js` as `console` passthrough or delete file?
