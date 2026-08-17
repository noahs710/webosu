# T15 — Implement D5/D6/D8 removals + fixes

## Type
task (HITL — code changes to live game paths)

## Question

Three of the T14 decisions are small, focused code changes that should land together (they're all "remove a webosu extension or fix a wrong value to match lazer"). T14 decided:

- **D5 — Remove `sliderStyle`**: delete the `sliderStyle` branch in `SliderMesh.js` + the textured `MeshRope` code (~30 lines). Always render the gradient body (true lazer parity — lazer's `LegacySliderBody` is always gradient). Skins shipping `sliderStyle: 2` in skin.ini get the gradient body.
- **D6 — Fix `hitCircleOverlap` shift factor**: change `overlap * 0.3` per side to `overlap * 0.5` per side (net 1.0·overlap per pair, matching lazer's `Spacing = -overlap`) in `playback.js:1663-1666`. Change the default from `0` to `-2` in `skin-loader.js:34` (lazer's default is -2).
- **D8 — Drop mega task 5.12**: remove the beatmap `[Colours] ApproachCircle` fallback from `playback.js:1594-1596`. Approach circle uses combo colour (skin `approachCircle` still wins if set, then combo colour). Drop task 5.12 from `openspec/changes/lazer-parity-mega/tasks.md`.

### Scope

1. `src/game/SliderMesh.js`: remove the `sliderStyle` read (lines 48-52), the `this._sliderStyle` field, the `this._sliderStyle === 2` textured MeshRope block in `_draw()`. Always use the gradient fill. Update the log line. Remove the `sliderStyle`-related comments.
2. `src/game/playback.js`: 
   - D6: change `hit.numbers[di].x += overlap * 0.3` → `overlap * 0.5`, and `hit.numbers[di + 1].x -= overlap * 0.3` → `overlap * 0.5`. Update the comment.
   - D8: remove the `else if (self.track && self.track.colors && self.track.colors.ApproachCircle)` branch (lines 1594-1596). The approach circle becomes 2-branch: skin wins, else combo colour.
3. `src/game/skin-loader.js`: change the `hitCircleOverlap: 0` default (line 34) to `hitCircleOverlap: -2`. Verify the parse at line 89 still handles `parseInt(val) || 0` — should become `parseInt(val)` (so 0 is preserved if explicitly set, and the default -2 applies only when the key is absent). Update the comment.
4. `openspec/changes/lazer-parity-mega/tasks.md`: drop task 5.12 (mark `[ ]` dropped per T14 D8, or remove the line and note in the §5 header). Add a note that 5.5/5.6/5.7 (sliderStyle branches) are superseded by T15 D5 (sliderStyle removed entirely).

### Acceptance

- All 3 changes implemented.
- `npm run typecheck` + `npm test` green.
- `npm run test:lazer` green (no regression — the lazer parity tests don't cover sliderStyle/hitCircleOverlap/ApproachCircle, so they should stay 110/110).
- `npm run test:conformance` — goldens may shift (sliderStyle 2 skins now render gradient; hitCircleOverlap spacing changes). If they shift, regenerate with `--update-golden` and commit the new goldens with a note.
- `headless-play.js` 0 pageerrors.
- One-line Decisions-so-far entry on the map.

## Status
done

## Resolution

Commit `5a99866`. All 3 changes implemented (D5 sliderStyle removed, D6 hitCircleOverlap fixed, D8 ApproachCircle fallback dropped). typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors. See commit message for full detail.

## Blocks

T06 (rollout — D5/D6 landed before flags flip), T03 (D8 moved out of T03 — unblocked now)

## Blocked by

T14 (the decisions — now closed)