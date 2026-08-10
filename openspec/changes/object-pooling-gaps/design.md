## Design

### Pool architecture — extend the existing `_spritePool` pattern

The existing `_spritePool` (Map<Texture, Sprite[]>) is the right pattern. Extend it to all sprite creation paths instead of creating a new abstraction.

```
┌─ _spritePool (Map<Texture, Sprite[]>) ─────────────────────────┐
│                                                                 │
│  disc.png ──▶ [Sprite, Sprite, Sprite, ...]  (hit circles)     │
│  hitcircleoverlay.png ──▶ [Sprite, Sprite, ...]                │
│  ring-glow.png ──▶ [Sprite, Sprite, ...]                        │
│  hitburst.png ──▶ [Sprite, Sprite, ...]  (hit bursts)           │
│  reversearrow.png ──▶ [Sprite, Sprite, ...]  (sliders)         │
│  sliderfollowcircle.png ──▶ [Sprite, Sprite, ...]               │
│  sliderscorepoint.png ──▶ [Sprite, Sprite, ...]                 │
│  sliderendcircle.png ──▶ [Sprite, Sprite, ...]                  │
│  ...                                                            │
│                                                                 │
│  Cap: 48 per bucket. Excess → destroy (not leak).              │
└─────────────────────────────────────────────────────────────────┘
```

### Fix 1: Existing pool resilience

In `newHitSprite` (line ~854), after popping from pool:
```js
let sprite = (arr && arr.length) ? arr.pop() : new PIXI.Sprite(tex);
if (sprite.texture !== tex || !sprite.texture?.valid) sprite.texture = tex;
```
And in the reset block, add:
```js
sprite.rotation = 0;
```

### Fix 2: Slider `newSprite` uses the pool

Current `newSprite` (line ~1004) always does `new PIXI.Sprite(...)`. Refactor to match `newHitSprite`:
```js
function newSprite(spritename, x, y, scalemul = 1) {
   const tex = window.Skin?.[spritename] || PIXI.Texture.WHITE;
   let arr = self._spritePool.get(tex);
   let sprite = (arr && arr.length) ? arr.pop() : new PIXI.Sprite(tex);
   if (sprite.texture !== tex) sprite.texture = tex;
   sprite.scale.set(self.hitSpriteScale * scalemul);
   sprite.anchor.set(0.5);
   sprite.x = x; sprite.y = y;
   sprite.rotation = 0;
   sprite.zIndex = 4.9999 - 0.0001 * hit.hitIndex;  // zIndex, not depth (depends on depth cleanup)
   sprite.alpha = 0; sprite.visible = true;
   sprite.tint = 0xffffff; sprite.blendMode = "normal";
   sprite.eventMode = 'none'; sprite.cullable = false;
   sprite._pooledTex = tex;
   hit.objects.push(sprite);
   return sprite;
}
```

The despawn path at line ~1436 already checks `o._pooledTex` and returns to the pool — no change needed there. The `_pooledTex` marker on slider sprites makes them pool-eligible automatically.

### Fix 3: Pool hit bursts

In `createHitBurst` (line ~599):
```js
const tex = window.Skin?.["hitburst.png"] || PIXI.Texture.WHITE;
let arr = self._spritePool.get(tex);
let s = (arr && arr.length) ? arr.pop() : new PIXI.Sprite(tex);
if (s.texture !== tex) s.texture = tex;
// ... reset as before ...
s._pooledTex = tex;  // mark as poolable
```

In `updateEffects` (line ~648), replace `s.destroy()` with:
```js
let arr = self._spritePool.get(s._pooledTex);
if (!arr) { arr = []; self._spritePool.set(s._pooledTex, arr); }
if (arr.length < 48) arr.push(s);
else s.destroy();
```

### Fix 4: Pool judgements

Decide pool type once at `populateHit` time:
```js
this._judgeUseSprites = !!(window.Skin?.["hit300.png"]);
```

In `createJudgement`, use pool:
```js
if (this._judgeUseSprites) {
   const tex = initTex || PIXI.Texture.WHITE;
   let arr = self._judgePool.get(tex);
   let judge = (arr && arr.length) ? arr.pop() : new PIXI.Sprite(tex);
   if (judge.texture !== tex) judge.texture = tex;
   // ... reset ...
   judge._pooledTex = tex;
   judge._pooledType = "sprite";
} else {
   let judge = self._judgeTextPool.length ? self._judgeTextPool.pop() : new PIXI.Text({text:"", style:{...}});
   // ... reset ...
   judge._pooledType = "text";
}
```

In despawn, return to the appropriate pool based on `_pooledType`.

### Fix 5: Pool cap

```js
const POOL_MAX = 48;
function releaseToPool(sprite) {
   let arr = self._spritePool.get(sprite._pooledTex);
   if (!arr) { arr = []; self._spritePool.set(sprite._pooledTex, arr); }
   if (arr.length < POOL_MAX) arr.push(sprite);
   else sprite.destroy();
}
```

### Migration order (by ROI)

1. Fix existing pool resilience (texture reassign + rotation) — zero new code, just 2 lines
2. Slider sub-sprites — route `newSprite` through pool — highest gap, ~5-10 sprites/slider
3. Hit bursts — ~3000/map, 200ms lifetime, single texture
4. Judgements — ~3000/map, but more complex (Sprite vs Text)

### What NOT to pool

- **SliderMesh body** — unique curve per slider, redraw is as expensive as new
- **Combo flashes** — too rare (~50/map), Graphics pool adds complexity for negligible gain
- **Spinner sprites** — too rare (few per map)
- **Score digits** — already a fixed reusable array (never destroyed during gameplay)