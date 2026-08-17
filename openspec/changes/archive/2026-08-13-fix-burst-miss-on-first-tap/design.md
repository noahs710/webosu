## Context

This is a port of [BlaNKtext/webosu](https://github.com/BlaNKtext/webosu) from PixiJS 6 to PixiJS 8. During the port, several "safety" mechanisms were added to `playback.js` that do not exist in the original: a scrub-frame detector (`_scrubFrame`), a last-game-time tracker (`_lastGameTime`), and a per-frame miss cap (`MAX_MISSES_PER_FRAME`). These were well-intentioned but contain a fatal flaw: the scrub guard is disabled whenever `_lastGameTime < 0`, which is the entire lead-in period. This causes burst misses on the first tap.

A comparison of the original vs port reveals the original is **simpler and more robust by construction**: it passes `time` (which can be negative during lead-in) directly to all update functions with no gating, and each subsystem is written to handle arbitrary time values. The port's added complexity introduced the bug.

The port also diverged from the original in three other hit-judging areas that should be restored:
1. `retry()` doesn't reset audio position when `wait === 0` (deterministic burst-miss on retry)
2. Slider-end `defaultScore = 50` rule was dropped (missed slider tails now score 0/miss instead of 50)
3. Slider final-judgement and spinner-end paths emit misses directly, bypassing any miss cap (PATH D/E in the bug analysis)

## Goals / Non-Goals

**Goals:**
- Eliminate the burst-miss-on-first-tap bug
- Restore faithful porting of the original's hit-judging logic
- Make retry safe (no burst misses on any map)
- Restore the slider-end 50-score rule
- Add a regression test that catches this class of bug

**Non-Goals:**
- Adding lazer-accurate slider scoring (the port's SliderJudge accumulator is a separate concern; this change reverts to the original's simpler edge-scoring model)
- Implementing seek-without-penalty (the original accepts that seeking past notes = misses; matching that is in scope, a "no-penalty seek" feature would be a future change)
- Refactoring the render loop architecture
- Touch input changes
- Mod-specific hit logic changes

## Decisions

### Decision 1: Remove the scrub/burst-miss guard entirely (faithful to original)

**Choice:** Delete `_scrubFrame`, `_lastGameTime`, `_missesThisFrame`, `MAX_MISSES_PER_FRAME` and all references.

**Rationale:** The original webosu has none of this and never had the burst-miss bug. The guard's `>= 0` condition is the root cause. Fixing the condition (e.g. `!== -1`) would still leave a fragile state machine that can fail in other edge cases (e.g. the very first frame after audio ready, where `_lastGameTime` is -1 and `time` jumps from undefined to a negative value). The original's design — pass time through, let each handler be robust — is simpler and proven.

**Alternative considered:** Fix the guard condition from `>= 0` to `!== -1`. Rejected because it's a patch on a flawed abstraction; the original doesn't need it at all, and keeping it risks future regressions when someone changes the condition again.

**Alternative considered:** Keep the guard but also add it to PATH D/E. Rejected because that's adding complexity to fix a symptom. The original has no PATH D/E — those paths are port additions that should be removed.

### Decision 2: Fix `OsuAudio.play()` to reset position when `wait === 0`

**Choice:** In `osu-audio.js:play()`, add `self.position = 0;` in the `else` branch (when `wait === 0`).

**Rationale:** The original has the same code structure, but the original's `retry()` calls `self.constructor(...)` which re-runs the entire `OsuAudio` constructor (resetting `position = 0`). The port's `retry()` calls `self.constructor(...)` on the Playback, not on OsuAudio, so `osu.audio.position` retains its stale value. This is a porting oversight, not an original design choice. The one-line fix in `play()` is the minimal correct fix.

**Alternative considered:** Reset `position = 0` in `retry()` before calling `start()`. Rejected because it's less robust — a future caller of `play(0)` would still hit the bug. Fixing `play()` itself is the correct layer.

### Decision 3: Restore slider-end `defaultScore = 50` in `hitSuccess` and tick path

**Choice:** In `hitSuccess()`, when `points > 0 && hit.type == "slider"`, set `hit.judgements[hit.judgements.length - 1].defaultScore = 50`. In the slider tick-hit path, do the same. This matches the original exactly.

**Rationale:** The original's comment says "special rule: only missing slider end will not result in a miss." The port dropped this, causing missed slider tails to score 0/miss instead of 50. This is a gameplay regression, not a design improvement.

### Decision 4: Remove the slider final-judgement path (PATH D)

**Choice:** Delete the `if (hit.sliderJudge && hit.sliderJudge._finalScore < 0 && time > hit.endTime)` block in `updateSlider` that calls `scoreOverlay.hit(finalScore, 300, hit.endTime)`.

**Rationale:** The original has no separate "final slider judgement." It scores each edge as 300/300 immediately when hit. The port's SliderJudge accumulator is a lazer-accuracy attempt that introduced an unguarded miss-emission path. Reverting to the original's per-edge scoring eliminates PATH D and its burst-miss risk. The `SliderJudge` class itself can remain for future use but should not be called from the miss-emission path.

**Alternative considered:** Keep PATH D but add the scrub/cap guard to it. Rejected per Decision 1's rationale — adding guards to port-invented paths is compounding complexity.

### Decision 5: Simplify spinner-end to use updateJudgement (remove PATH E)

**Choice:** In `updateSpinner`, keep the `if (time >= hit.endTime && hit.score < 0)` block that computes points from progress, but remove the direct `hitSuccess` call. Instead, let `updateJudgement(hit.judgements[0], time)` handle the miss naturally when `finalTime` passes. For a successful spinner (progress ≥ 0.75), call `hitSuccess` once — this is fine because it's a hit, not a miss, and won't trigger burst-miss behavior.

**Rationale:** The original's spinner-end calls `hitSuccess` only when `hit.score < 0` (first time), which is a single call, not a burst. The port's version is structurally similar but the risk is that if `hit.score` is not set correctly, repeated frames could re-call it. The original's pattern is safe; we restore it faithfully.

### Decision 6: Regression test via headless Playwright

**Choice:** Add `scripts/headless-burst-miss.js` that loads a map with first note at ≥ 1500ms, starts the game, waits for audio ready, then triggers a retry and asserts `scoreOverlay.judgecnt.miss === 0` after 2 seconds.

**Rationale:** The existing `scripts/headless-fail-retry.js` test exercises the fail/retry UI path but doesn't check the miss counter. A dedicated test that asserts "no burst misses after retry" is the tightest regression loop for this bug.

## Risks / Trade-offs

- **[Risk] Seeking past notes now counts them as missed** → This matches the original and lazer behavior. If users want no-penalty seeking, that's a separate feature. The `skip` function uses `seekforward` which only seeks to `hits[0].time - 3000`, so normal skipping won't cross note finalTimes.

- **[Risk] Removing the miss cap means a genuine audio glitch (position jump of seconds) could fire many misses in one frame** → This is the same behavior as the original. In practice, audio position jumps only happen on seek/resume, and the original handles these by... letting them miss. The miss-per-frame rate is still bounded by the render loop's frame rate (60fps = max 60 misses/sec), which is the same as a human intentionally not hitting notes.

- **[Risk] Reverting slider scoring to edge-based loses lazer accuracy** → The `SliderJudge` class is preserved (not deleted) so a future change can re-introduce lazer-accurate slider scoring with proper miss-path guarding. This change prioritizes correctness (no burst misses) over lazer parity.

- **[Trade-off] The `_scrubFrame` removal means we lose the "click grace" logic** → The `_lastClickTime`/`_lastClickX`/`_lastClickY` fields were added alongside the scrub guard but are only read by the scrub guard. They can be removed too. No gameplay behavior depends on them.

## Open Questions

- Should we also remove the `SliderJudge` import and class usage entirely in this change, or leave it dormant? (Current design: leave it dormant — removing it is a larger refactor and it's not causing harm if not called from the miss path.)