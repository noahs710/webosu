## Design

### Current flow (two-phase staging)
```
createHitCircle → sprite.depth = 4.9999 - 0.0001 * hitIndex
                              │
                              ▼ (deferred until updateUpcoming)
updateUpcoming → sprite.zIndex = sprite.depth || 0.0001
                gamefield.addChild(sprite)
                              │
                              ▼
Pixi sortableChildren sorts by zIndex
```

### After cleanup (direct assignment)
```
createHitCircle → sprite.zIndex = 4.9999 - 0.0001 * hitIndex
                gamefield.addChild(sprite)  (in updateUpcoming, no copy)
                              │
                              ▼
Pixi sortableChildren sorts by zIndex
```

### Changes

1. **Delete `_depthIndex`** (lines 585-596) — confirmed dead, zero call sites
2. **Rename `.depth =` → `.zIndex =`** at:
   - `playback.js:495` — `judge.zIndex = depth` (or inline `= 4`)
   - `playback.js:864` — `sprite.zIndex = depth`
   - `playback.js:1001` — `body.zIndex = 4.9999 - 0.0001 * hit.hitIndex`
   - `playback.js:1010` — `sprite.zIndex = 4.9999 - 0.0001 * hit.hitIndex`
   - `playback.js:1121` — `sprite.zIndex = 4.9999 - 0.0001 * (hit.hitIndex || 1)`
   - `playback.js:1155` — `container.zIndex = 3`
3. **Simplify `updateUpcoming`** (lines 1405-1411) — remove the copy step:
   ```js
   for (let i = hit.judgements.length - 1; i >= 0; i--) self.gamefield.addChild(hit.judgements[i]);
   for (let i = hit.objects.length - 1; i >= 0; i--) self.gamefield.addChild(hit.objects[i]);
   ```
4. **Inline `createJudgement` depth param** — all 3 call sites pass literal `4`. Change to `judge.zIndex = 4` and drop the parameter.

### Risk
None. `.depth` is only read at the 2 copy sites we're removing. No physics, culling, or game logic reads `.depth`. Hit bursts and combo flashes already use `zIndex` directly, proving the pattern works.