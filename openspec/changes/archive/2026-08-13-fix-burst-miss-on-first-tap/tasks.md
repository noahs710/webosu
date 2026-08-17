## 1. Remove the broken scrub/burst-miss guard (playback.js)

- [x] 1.1 Delete `_lastGameTime`, `_scrubFrame`, `_lastClickTime`, `_lastClickX`, `_lastClickY`, `_missesThisFrame`, `MAX_MISSES_PER_FRAME` field initializations from the `Playback` constructor (~lines 96-107)
- [x] 1.2 Delete the scrub-detection block in `render()` that computes `_scrubFrame` from `time - _lastGameTime` (~lines 3081-3098), keeping only the `currentFrameInterval` telemetry
- [x] 1.3 Simplify `updateJudgement()` to the original's 5-line miss path: remove the `if (self._scrubFrame) return;` guard and the `if ((self._missesThisFrame || 0) >= (self.MAX_MISSES_PER_FRAME || 1)) return;` cap (~lines 805-823)
- [x] 1.4 Remove the `_lastClickTime`/`_lastClickX`/`_lastClickY` writes from `hitSuccess()` (~lines 2313-2318)

## 2. Fix audio position reset on retry (osu-audio.js)

- [x] 2.1 In `OsuAudio.play(wait)`, add `self.position = 0;` in the `else` branch (when `wait === 0`), before `self.source.start(0, self.position)` (~line 218)

## 3. Restore slider-end defaultScore = 50 rule (playback.js)

- [x] 3.1 In `hitSuccess()`, add the slider-end default rule: when `points > 0 && hit.type == "slider"`, set `hit.judgements[hit.judgements.length - 1].defaultScore = 50` (after the hitsound block, before `hit.score = points`)
- [x] 3.2 In the slider tick-hit path in `updateSlider()` (where `activated` is true and tick scored), add the same `hit.judgements[hit.judgements.length - 1].defaultScore = 50` line

## 4. Remove unguarded miss-emission paths (playback.js)

- [x] 4.1 Delete the slider final-judgement block in `updateSlider()` that calls `scoreOverlay.hit(finalScore, 300, hit.endTime)` (~lines 2914-2926). Keep the per-edge `scoreOverlay.hit(300, 300, time)` for hit edges (original behavior).
- [x] 4.2 Remove the `recordTickMiss`/`recordEdgeMiss` calls to `sliderJudge` (they feed the now-unused final-judgement path). Keep the tick-miss `scoreOverlay.hit(0, 10, time)` for tick scoring (original behavior, maxresult=10 so no judgecnt.miss increment).
- [x] 4.3 Simplify the spinner-end block in `updateSpinner()` (~lines 3018-3026): keep the progress-based points computation, call `hitSuccess(hit, points, hit.endTime)` only when `hit.score < 0` (first time), and let `updateJudgement` handle the miss if points === 0. Remove any redundant direct `scoreOverlay.hit` calls.

## 5. Clean up slider head finalTime extension

- [x] 5.1 Verify the slider-head `finalTime` extension (`hit.judgements[0].finalTime = hit.endTime + this.MehTime` at ~line 1867) is still correct — with the original's edge-based scoring, the head judgement's finalTime should be `hit.time + this.MehTime` (same as a circle), NOT extended to slider end. Restore the original behavior by removing this extension. The slider's tail/edge judgements (created in the loop at ~line 1872) already have correct finalTimes.

## 6. Regression test

- [x] 6.1 Create `scripts/headless-burst-miss.js` based on the pattern in `scripts/headless-fail-retry.js`: load a map with first note at ≥ 1500ms (e.g. the same Lightspeed map), start the game, wait for audio ready, trigger a retry via `window.playback.retry()`, wait 2 seconds, then assert `window.playback.scoreOverlay.judgecnt.miss === 0` and `window.playback.scoreOverlay.failed === false`.
- [x] 6.2 Add `npm run test:burst-miss` script to `package.json` pointing to the new test file
- [x] 6.3 Run the test and verify it passes (it should fail before the fix is applied, pass after)

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and fix any type errors from the removed fields
- [x] 7.2 Run `npm run test:game` to verify the existing gameplay test still passes
- [x] 7.3 Run `npm run test:crash` to verify fail/retry paths still work
- [x] 7.4 Run `npm run test:burst-miss` to verify the new regression test passes
- [x] 7.5 Manual verification: load a map with first note ≥ 1500ms, retry, confirm no instant fail — deemed covered by the headless burst-miss regression test (7.4); accepted as sufficient by user so this change can archive.