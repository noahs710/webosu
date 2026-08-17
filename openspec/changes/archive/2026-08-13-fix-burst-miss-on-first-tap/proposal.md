## Why

The first note a player taps fails them instantly with ~11 misses and a single 300/100/50 judgement. This happens because the port added a scrub-frame / burst-miss guard that is **disabled whenever `_lastGameTime < 0`** — which is exactly the entire lead-in period. Any frame gap during the negative→positive time transition (browser throttling, GC, tab backgrounding, or a retry that doesn't reset the audio position) bypasses all miss protection, letting every note whose `finalTime` has passed fire one miss per frame until HP < 0. The original BlaNKtext/webosu has **no scrub/burst-miss logic at all** and never had this bug — its simpler, more faithful design is robust by construction because every subsystem handles arbitrary (including negative) `time` values gracefully.

## What Changes

- **Remove the broken scrub-frame guard** (`_scrubFrame`, `_lastGameTime`, `_missesThisFrame`, `MAX_MISSES_PER_FRAME`) from `playback.js`. The original had none of this, and the port's version is the source of the bug.
- **Restore faithful `retry()` behavior**: reset `osu.audio.position` to 0 when `wait === 0` so a retry doesn't resume audio at the old position (which deterministically causes burst misses on maps where the first note is at ≥ 1500ms).
- **Port the original's `hitSuccess` slider-end default rule**: when a slider head is hit, set `judgements[last].defaultScore = 50` so a missed slider tail scores 50 (not 0/miss). The original does this in both `hitSuccess` and the tick-hit path; the port dropped it.
- **Remove the unguarded slider final-judgement path** (PATH D, `playback.js:2914-2926`) that bypasses the miss cap by emitting `scoreOverlay.hit(finalScore, 300, hit.endTime)` directly. The original scores slider edges as 300/300 immediately and has no separate "final slider judgement" emission.
- **Remove the unguarded spinner-end path** (PATH E, `playback.js:3018-3026`) that calls `hitSuccess` (→ `scoreOverlay.hit`) directly. Restore the original's simpler spinner-end: `updateJudgement` handles the miss via the normal path.
- **Add a regression test** in `scripts/headless-*` that retries a map with first note ≥ 1500ms and asserts no burst misses fire.

## Capabilities

### New Capabilities

- `hit-judging`: The rules for when a hit object is judged as 300/100/50/miss, including the miss window, the lead-in safety (no misses fire before the first note is reachable), slider-end scoring, and retry/reset semantics. This consolidates behavior currently spread un-specified across `playback.js`, `playerActions.js`, and `osu-audio.js`.

### Modified Capabilities

- `judgement-animations`: The miss animation trigger changes — misses now fire only from the single `updateJudgement` path (no more burst emissions from slider-end/spinner-end), so the animation system sees one miss per object, not a burst.

## Impact

- **`src/game/playback.js`**: Remove `_scrubFrame`/`_lastGameTime`/`_missesThisFrame`/`MAX_MISSES_PER_FRAME` (~30 lines in constructor + render loop + updateJudgement). Simplify `updateJudgement` to the original's 5-line miss path. Remove slider final-judgement block (PATH D, ~15 lines). Simplify spinner-end (PATH E, ~10 lines). Restore slider-end `defaultScore = 50` rule in `hitSuccess` + tick path.
- **`src/game/osu-audio.js`**: Reset `self.position = 0` in `play()` when `wait === 0` (one-line fix to prevent retry from keeping stale position).
- **`src/game/playerActions.js`**: No change — the original's `checkClickdown` is already faithfully ported (the port's predicted-position + grace logic is a superset, which is fine).
- **`scripts/headless-burst-miss.js`**: New regression test.
- **Risk**: Removing the scrub guard means a genuine audio scrub (user seek) could fire misses for skipped notes. The original accepts this — lazer's own behavior is that seeking past notes counts them as missed. If we want to preserve "seek = no penalty", that's a separate future change; this proposal restores faithful original behavior.