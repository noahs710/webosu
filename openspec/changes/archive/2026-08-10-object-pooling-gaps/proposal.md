## Why

Only hit-circle sprites (base/circle/glow/approach/numbers) are pooled. Slider sub-sprites (ticks, end circle, reverse arrows, follow, ball), hit bursts, and judgements are `new` + `destroy` per hit. On a 1300-hit map with 576 sliders, that's ~5000+ sprite allocations + destructions causing GC pressure and frame hitches. The existing `_spritePool` pattern works well but is only used by `newHitSprite`, not the slider `newSprite` path.

## What Changes

- **Fix existing pool resilience** — add texture reassignment on acquire (handles skin switch + animation drift) and `rotation = 0` to the reset block
- **Pool slider sub-sprites** — route slider's `newSprite` through the existing `_spritePool` (same pattern as `newHitSprite`, adds `_pooledTex` marker so despawn returns them)
- **Pool hit bursts** — acquire from `hitburst.png` bucket, return to pool at 200ms expiry instead of `destroy()`
- **Pool judgements** — type-homogeneous pool (Sprite or Text, decided at `populateHit` time based on `window.Skin["hit300.png"]` presence)
- **Cap pool size** — 48 per texture bucket (2× peak concurrent); excess sprites are destroyed, not leaked
- **Skip combo flashes** — too rare (~50/map) to justify Graphics pool complexity
- **Skip spinner sprites** — too rare (few per map) to justify pooling

## Capabilities

### New Capabilities
- `object-pooling`: Generalized pooling for slider sub-sprites, hit bursts, and judgements

### Modified Capabilities
- `judgement-images`: Judgements are now pooled by type (Sprite or Text) instead of created/destroyed per hit

## Impact

- `src/game/playback.js` — fix `newHitSprite` reset (texture reassign + rotation), refactor slider `newSprite` to use pool, pool hit bursts, pool judgements, add pool cap (~150 LOC)
- Depends on `depth-to-zindex-cleanup` (pooled objects need `zIndex` at creation)
- GC pressure: ~5000 fewer allocations per 1300-hit map