## Tasks

- [x] **Depends on: `depth-to-zindex-cleanup` being complete first**
- [x] Fix `newHitSprite` pool acquire: add `if (sprite.texture !== tex) sprite.texture = tex` after pop
- [x] Add `sprite.rotation = 0` to `newHitSprite` reset block
- [x] Add `releaseToPool(sprite)` helper with 48-cap to `playback.js`
- [x] Refactor slider `newSprite` to use `_spritePool` (same pattern as `newHitSprite`, add `_pooledTex` marker)
- [x] Pool hit bursts: acquire from `hitburst.png` bucket, return to pool in `updateEffects` instead of `destroy()`
- [x] Add `_judgeUseSprites` flag decided at `populateHit` time
- [x] Pool Sprite judgements by texture; pool Text judgements in a single bucket
- [x] Add `_pooledType` marker to judgements for correct pool return on despawn
- [x] Update despawn path to use `releaseToPool()` helper
- [x] Verify: `npm run build` passes
- [x] Verify: `npm run test:game` passes (1301 hits, 576 sliders, no pageerrors)
- [x] Verify: `npm run test:crash` passes (quit/retry drains pools)