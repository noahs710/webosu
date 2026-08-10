## Specs

### slider-rendering

- All gameplay objects SHALL set `zIndex` directly at creation time
- The `updateUpcoming` function SHALL add objects to the gamefield via `addChild` without a deferred `zIndex` copy
- The `_depthIndex` binary search function SHALL be removed (dead code)