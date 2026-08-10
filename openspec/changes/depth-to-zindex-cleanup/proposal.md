## Why

The game uses a two-phase depth staging system: objects set `.depth` at creation, then `updateUpcoming` copies `.depth` → `.zIndex` when adding them to the gamefield. This is a vestige of the old `addChildAt` binary search that was already replaced with `sortableChildren` + `zIndex`. The `_depthIndex` function (12 lines) is dead code with zero call sites. The `.depth` property is read nowhere except the two copy lines we're removing.

## What Changes

- Delete `_depthIndex` function (dead code, 12 lines)
- Rename all `.depth =` assignments to `.zIndex =` at 6 creation sites in `playback.js`
- Remove the `.depth → .zIndex` copy step in `updateUpcoming` (objects already have `zIndex` set at creation)
- Inline `createJudgement`'s `depth` parameter (always called with literal `4`)

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `slider-rendering`: Objects now use `zIndex` directly at creation instead of a deferred `depth` → `zIndex` copy

## Impact

- `src/game/playback.js` — ~20 lines changed (6 rename + 2 delete + 4 simplify)
- No behavioral change — render order is identical (same values, same sort)
- Prerequisite for object pooling (pooled objects need `zIndex` at creation, not via deferred copy)