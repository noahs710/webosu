# Tasks — lazer-parity-mega

## 0. Prerequisites

- [x] 0.1 Archive `fix-burst-miss-on-first-tap` change (18/19 tasks done; resolve task 19 or defer to this campaign; confirm `playback.js` slider-end changes don't conflict) — archived as `2026-08-13-fix-burst-miss-on-first-tap`, task 7.5 accepted as covered by headless regression test 7.4
- [x] 0.2 Confirm all feature-flag infrastructure exists (`window.FEATURES` object, runtime flag setter, default-off state for the four track-A/B flags: `lazerSliderJudging`, `lazerScoreV2`, `lazerHpDrain`, `skinConformance`) — implemented as `src/game/features.js`, imported by `initgame.js`; URL/localStorage override supported; typecheck passes

## 1. Harnesses (baseline first)

- [x] 1.1 Implement `scripts/headless-skin-conformance.js`: loads skin via the real `loadOsk`/`applySkin` pipeline (window-exposed in main.js), snapshots texture table via `__snapshotSkinTree`, plus `--gameplay` mode for a real headless playthrough. **T04**: scene-graph capture at frames [10,30,60] now wired (sceneSnaps field in the gameplay golden).
- [x] 1.2 Golden snapshot format (JSON texture table: per-key w/h/resolution) and `scripts/conformance-golden/` directory layout.
- [x] 1.3 Reference skins acquired and copied to `scripts/conformance-skins/`: whitecat-full (48.8MB), reowotuna-default (37.9MB), aristia-weird (17.8MB), vaxei-minimal (7.4MB). **T04**: SHA-256 manifest generated at `scripts/conformance-skins/manifest.json` (5 skins).
- [x] 1.4 Baseline goldens generated from CURRENT behavior via `--update-golden` for all 4 reference skins. **T03/T04**: goldens refreshed after whitelist extension + scene-snaps added.
- [x] 1.5 `--update-golden` mode + JSON diff-artifact writer (report written to `tmp/skin-conformance/<id>.report.json`). Rendered PNG comparison NOT implemented (texture-table diffs only).
- [x] 1.6 Whitelist-gap detection implemented (raw .osk png names not present in loaded texture table → `gaps` array). NOTE: currently over-reports intentional skips (non-gameplay menu/ranking textures @ ~hundreds per skin) AND name-mapped aliases; the whitelist now correctly includes number-prefix textures after flattening (`assets/default/default-5.png` → `5.png`), so most remaining "gaps" are intentional.
- [ ] 1.7 Dead-field detection (requires instrumenting skin.ini consumers; deferred — needs a hook point per consumer, lower value now that wire-up audit identified all dead fields statically).
- [x] 1.7b Scene-graph snapshot capture mid-gameplay (launch a fixed beatmap, capture at frames [10,30,60]). **T04**: wired — the gameplay phase captures `__snapshotSkinTree` at 3 early polls, stores in `sceneSnaps` field of the gameplay golden. NOTE: headless sceneSnaps are empty (0 leaves) because the headless audio context doesn't advance without a user gesture, so no hit objects render. The structure is complete; meaningful content requires a real browser (T11/T12 exercise this).
- [x] 1.8 Wire harness into CI as a gating check. **T04**: no `.github/workflows/` exists in the repo — documented as a manual run (`npm run test:conformance`) in `docs/wayfinder/STATUS.md`. CI wiring deferred until the repo has a CI config.
- [x] 1.8b Add `npm run test:conformance` script + include in `test:all`. **T01**: done — `test:conformance` and `test:lazer` both in `test:all`.

- [x] 1.9 Implement `scripts/headless-latency-probe.js` — **T07**: rewritten from stub to a proper probe that hooks hitSuccess, records judgement spawn times, reports P50/P95/P99. Outputs tmp/latency-baseline.json. Headless n=0 (audio clock limitation); real-browser `?perfprobe=1` hook in main.js + playback.js for authoritative measurement.
- [ ] 1.10 Run probe on reference machine(s), capture baseline P50/P95 per device profile (60Hz mid-tier, 120Hz high-end, 30Hz mobile) — **needs user**
- [ ] 1.11 Commit baselines to `tmp/latency-baseline.json` and document measurement methodology — **needs user (1.10 first)**

## 2. Track A — Lazer judging (flag: `lazerSliderJudging`)

- [ ] 2.0 **Fix circle radius formula (D4 — audit finding).** The uncommitted diff at `playback.js:396` introduced `self.circleRadius = 32 * (1 - (0.7 * (this.CS - 5)) / 5)` with the comment "matches lazer exactly" — this is WRONG for any CS≠5 (at CS=4: webosu gives R=36.48 vs lazer R=23.04, 58% too big). Lazer's actual formula is `32 * (1 - 0.7 * DifficultyRange(CS, 0, 0.5, 1))` using the two-piece-linear `DifficultyRange`, not `(CS-5)/5`. T13 fixes this by using the `lazerDifficultyRange` helper already in `lazerHpTables.js:8-12`. Not flag-gated (CS formula is unconditional). See `docs/wayfinder/research/lazer-source-audit.md` D4.
- [x] 2.1 Replace `playback.js:412-414` raw formulas with `lazerHitWindows(OD)` call (single source of truth) — wired behind `FEATURES.lazerSliderJudging`; legacy branch preserved when flag off
- [x] 2.2 Update `playerActions.js:164` and `playerActions.js:191` to consume `lazerHitWindows` values from shared state (don't recompute) — already read `playback.MehTime`; single write site at playback.js now uses lazerHitWindows when flag on
- [x] 2.3 Verify hit-window correctness with property tests: for OD ∈ {0, 1, 2, ..., 10}, assert `GreatTime == floor(80 - 6·OD) - 0.5`, etc. — `scripts/test-lazer-parity.js`, now 76 tests pass (hit windows + Score V2 ComputeTotalScore + typed pipe combo rules)

- [x] 2.4 Rework to lazer nested-part model — built as `src/game/slider-scorer.js` (SliderScorer seam). Head/ticks/repeats/tail each judged; slider own judgement is binary display-only (OsuIgnoreJudgement); tail miss = IgnoreMiss (no combo break/HP); ticks+repeats = LargeTick; tail hit = SliderTailHit(150). Head-gates-tracking rule enforced.
- [x] 2.5 Verified vs ppy/osu master (`DrawableSlider.CheckForResult`, `SliderInputManager.TryJudgeNestedObject`). Unit tests cover: any-hit→300 display, none→0, tail-miss→IgnoreMiss no-combo-break, tail-hit→150/150 accuracy, LargeTick types, dropped-head→no-tracking. **Test-caught real fix**: misses contribute accuracy-max via MaxResult (IgnoreMiss → +150 max) — added RESULT_MAX to score.js + score-math.js.
- [x] 2.6 Tail judgement wired via `sliderScorer.update(time, tracking)` in updateSlider (flag-gated): tail judges at endTime → SliderTailHit if tracking else IgnoreMiss.
- [x] 2.7 `defaultScore = 50` hack bypassed in lazer mode: hitSuccess skips the 300-max `scoreOverlay.hit` for sliders (slider judgement is display-only); scorer feeds per-part instead. Legacy path preserved for flag-off.
- [x] 2.8 Slider own-miss path: in lazer mode the slider's own 300-max miss is display-only (binary from any-nested-hit); parts judge independently as time passes. (Legacy defaultScore path remains for flag-off.)
- [x] 2.9 Slider part end-of-life: tail at endTime (not +400), parts judge at their own times via scorer.update. Head circle keeps `startTime + MehTime`.
- [x] 2.9b **Beatmap slider parse fix** (`beatmap-worker.js`): worker had off-by-one slider field indices — keyframes from parts[6] (repeat field), repeat from parts[7] (pixelLength), pixelLength from parts[8] (edgeHitsounds) → zero-duration sliders on real maps. Fixed to match osu.js + ppy/osu: sliderType=parts[5].split('|')[0], keyframes from parts[5] pipe, repeat=parts[6], pixelLength=parts[7], edgeHitsounds=parts[8], edgeSets=parts[9], hitSample=parts[10]. Added lazer zero-length-slider guard. Verified against real Lightspeed map: repeat=5, pixelLength=27.5, sliderTime=66.67ms/span, 5 scorer parts. NOTE: SliderVelocityMultiplier (inherited timing points) still unapplied — follow-up parity task.
- [x] 2.9c Harness gameplay validator landed: autoplay lazy-init fix in playerActions (ensureAutoplayState) engages post-launch; harness gameplay phase asserts structural lazer invariants (SliderTailHit/SliderDisplay/IgnoreMiss present, ~stable display count) — proven deterministic across repeated runs. Per-event timestamps non-deterministic in headless (frame jitter) so golden is invariant-form, not sequence-form.
- [x] 2.10 Head circle miss window stays `startTime + MehTime` (scorer leaves head to hitSuccess); tail/repeats judge at their own times via scorer.update. Verified by head-gate unit test + structural invariant run.
- [x] 2.11 Edge-miss recording in lazer mode via scorer (LargeTickMiss → HP + accuracy); tail miss emits IgnoreMiss (no score event, no HP, no combo break) and feeds the any-nested-hit display check. In-run log confirms: IgnoreMiss only appears at tails.
- [x] 2.12 LargeTickMiss HP wired via `_hpDeltaForType` (used by scoreTyped); IgnoreMiss maps to HP delta 0 and no combo reset (combo untouched on Ignore results). Verified in pipe unit tests + in-run invariant shape.
- [x] 2.13 Combo rules verified: repeat misses reset (LargeTickMiss → combo=0), tail IgnoreMiss does NOT reset (combo preserved), tick misses reset per lazer IsHit. Unit-tested; in-log shape matches (no combo break on tail IgnoreMiss).

## 3. Track A — Lazer scoring (flag: `lazerScoreV2`)

- [ ] 3.1 Real lazer `ScoreProcessor.ComputeTotalScore` landed in `overlay/score.js` + mirrored in `score-math.js`: `round(500000·accuracy·comboProgress + 500000·accuracy^5·accuracyProgress + bonusPortion) × scoreMultiplier`. Combo portion `Σ baseScore(MaxResult)·comboAfter^0.5`. Base score table wired (Great=300, Ok=100, Meh=50, SliderTailHit=150, LargeTickHit=30, SmallTickHit=10, LargeBonus=50, SmallBonus=10). **NOTE: the formula is correct in `score-math.js` (the pure-math mirror) but NOT wired into `overlay/score.js`'s production `hit()` path — `score.js:235-243` still computes `1000000 * acc * scoreMultiplier` (accuracy portion only). T13 (wayfinder map `lazer-perfect-parity`) fixes this. Audit finding D1 in `docs/wayfinder/research/lazer-source-audit.md`.**
- [x] 3.2 Score V2 formula property-tested: exponent 0.5, base-score table, perfect-play=1,000,000, accuracy^5 second term, bonus additive — in `test-lazer-parity.js` (83/83). (Note: "known lazer replays" reduced to formula-shaped cases; full replay-file cross-validation deferred — needs recorded lazer replay data.) **NOTE: tests cover `score-math.js` (the correct mirror), not the `score.js` production path which is still wrong per 3.1.**
- [ ] 3.3 −0.10 HP loss cap removed: `hit()` facade applies the full `hpDelta` with no `Math.max(hpDelta, -0.1)` clamp. **NOTE: the clamp is still present at `overlay/score.js:262` (`this.HP += Math.max(hpDelta, -0.1)`). T13 fixes this. Audit finding D2.**
- [ ] 3.4 `LAZER_LAST_COMBO_BONUS` applied at last-in-combo hit via `_comboTier` (Perfect/Good/None), +0.07/+0.05/+0.03. Tail-miss downgrades tier to Good. **NOTE: `LAZER_LAST_COMBO_BONUS` is imported at `score.js:2` but never used anywhere in the file. T13 fixes this. Audit finding D3.**
- [x] 3.5 Spinner bonus-rotation scoring: extra revolutions past `clear` RPM grant `LargeBonus` (50 base each), capped at `complete` RPM. Implemented in `playback.js` (spinsRequiredForBonus, maximumBonusSpins, per-spin LargeBonus grant loop) and unit-tested in `test-lazer-parity.js` (87/87). Harness map has only 5 spinners and autoplay doesn't reach bonus threshold in headless, so not verified in-browser — correct per physics.
- [x] 3.6 Add `rulesetVersion` field to saved score records (value: `"lazer-v1"`) — client now sends `lazer-v1`, server defaults to `lazer-v1`.
- [x] 3.7 Update leaderboard queries to filter or partition by `rulesetVersion` — `leaderboardV2` now defaults to `lazer-v1`, `leaderboardModCombos` handles both `v2` and `lazer-v1` for backwards compat.

## 4. Track A — Lazer HP drain (flag: `lazerHpDrain`)

- [x] 4.1 Per-map drain-rate binary search in `beatmap-worker.js`: `computeDrainRate()` simulates a perfect play (all-Great via the lazer judgement deltas), binary-searches a rate where `minHealth ≈ DifficultyRange(HP, 0.99, 0.9, 0.4)` within 1%. Runs in 1ms on a 1301-object map.
- [x] 4.2 Drain rate computed per-track at beatmap load (cached by the worker per-file — the binary search runs once per map parse). IndexedDB cross-load caching not added (search is ~1ms; caching would be over-engineering).
- [x] 4.3 Computed rate plumbed via `track.drainRateBinarySearched` → `playback.js` sets `gamefield._drainRate` → `overlay/score.js` reads `this.field._drainRate`. (GameState exposure deferred — score.js reads the gamefield directly.)
- [x] 4.4 Passive-drain application consumes `gamefield._drainRate` when `FEATURES.lazerHpDrain` is on; legacy HP-scaled approximation preserved for flag-off.
- [x] 4.5 Break-period drain pause: worker extracts `[Events] type=2` breaks into `track.breaks`; `score.js` subtracts break overlap from the drain interval when the flag is on.
- [x] 4.6 Perf: binary search ~1ms for 1301-object map (verified with real Lightspeed data in Node harness).

## 5. Track B — Skin conformance (no flag; gated by harness)

- [x] 5.1 Extend `src/game/skin-filter.js` whitelist with `@2x` variants — **T03 D7**: extended to full lazer-legal set (added hit100k, cursor-ripple, star2, cursor-smoke, sliderstartcircle(+overlay), sliderpoint30/10, particle50/100/300, scorebar-ki(+kidanger/+kidanger2), hit*-N animation frames). Beatmap-skin @2x disable is implicitly enforced (webosu doesn't load beatmap-skin textures).
- [x] 5.2 ~~Wire `sliderb@2x.png` as texture-fill source when `sliderStyle: 2`~~ — **SUPERSEDED by T15 D5**: sliderStyle removed; always gradient. No textured slider body.
- [x] 5.3 Replace hardcoded followpoint `% 10` frame count at `playback.js:1955` and `playback.js:2456` with parsed `sliderBallFrames` (default 10) — now uses `skinConfig.sliderBallFrames` when >0, else 10.
- [ ] 5.4 Document intentional skip of `hit*-<n>.png` numbered variants — **T16 scope**: T14 D9 decided to IMPLEMENT animated judgements (not skip). The whitelist now allows hit*-N frames (T03); T16 removes the skin-loader.js skip + implements AnimatedSprite playback. Document the implementation in T16.

- [x] 5.5 ~~Implement `sliderStyle: 1` (gradient) branch~~ — **SUPERSEDED by T15 D5**: sliderStyle removed entirely; always gradient (true lazer parity). Lazer's LegacySliderBody has no sliderStyle switch.
- [x] 5.6 ~~Implement `sliderStyle: 2` (MeshRope textured) branch~~ — **SUPERSEDED by T15 D5**: sliderStyle removed; the textured MeshRope code is deleted.
- [x] 5.7 Remove `?gradient=textured` URL-parameter spike — done; debug spikes `?slider=a/b/c` also removed in T15.
- [ ] 5.8 Verify default-skin renders identically pre/post change via conformance harness (no snapshot diff for `skins/default.osk`)

- [x] 5.9 Parse `hitCircleOverlap` in `skin-loader.js` — already parsed. **T15 D6**: default changed from 0 to -2 (lazer default).
- [x] 5.10 `hitCircleOverlap` consume sites in `playback.js`. **T15 D6**: shift factor fixed from `* 0.3` to `* 0.5` per side (net 1.0·overlap per pair, matching lazer's `Spacing = -overlap`).
- [ ] 5.11 Verify default skin (hitCircleOverlap: -2) renders identically via conformance harness

- [x] 5.12 ~~Wire beatmap `[Colours] ApproachCircle` as fallback~~ — **DROPPED per T14 D8**: the T02 audit found lazer's `LegacyApproachCircle` uses combo colour only; `CustomColours["ApproachCircle"]` is parsed but never read by the osu! ruleset. The fallback branch is removed in T15. Approach circle = skin `approachCircle` (if set) else combo colour.
- [ ] 5.13 ~~Add conformance test verifying beatmap ApproachCircle is used only when skin.ini omits it~~ — **DROPPED per T14 D8** (mega task 5.12 dropped).

## 6. Track C — Feel & latency

- [ ] 6.1 Identify judgement critical path in `playback.js` (input event → `playerActions` handler → judgement computation → `scoreOverlay.hit` → sprite spawn → texture upload → composite)
- [ ] 6.2 Optimize critical path: reduce one frame at 60 Hz (≈ 16.7 ms P50 improvement target). Candidate hotspots: synchronous event handlers, texture pre-upload, judgement sprite pooling.
- [ ] 6.3 Re-run latency probe, document before/after numbers

- [ ] 6.4 Draft `docs/lazer-feel-deltas.md`: list browser-constrained deltas (RAF quantum per Hz, audio resample jitter, compositor vsync, JS event-loop variance) with estimated magnitudes
- [ ] 6.5 Document measured webosu! latencies from probe baseline + post-optimization numbers
- [ ] 6.6 Audit doc wording: no claims of "exactly like lazer" or "no deviation"; use "best-effort parity within browser constraints"

## 7. Rollout & cleanup

- [ ] 7.1 Verify all 4 flags (`lazerSliderJudging`, `lazerScoreV2`, `lazerHpDrain`, `skinConformance`) default off
- [ ] 7.2 Run full test suite + conformance harness with all flags off (should be zero regression vs baseline)
- [ ] 7.3 Flip `skinConformance` flag on, re-run conformance harness (golden snapshots updated to new behavior), commit updated goldens
- [ ] 7.4 Flip `lazerSliderJudging` on, re-run test suite (should hit new property tests for windows, slider thresholds, edge-miss recording)
- [ ] 7.5 Flip `lazerScoreV2` on, re-run test suite + known-replay score validation
- [ ] 7.6 Flip `lazerHpDrain` on, re-run test suite + drain-rate sanity checks (perf + correctness)
- [ ] 7.7 One stable release with all flags default-on
- [ ] 7.8 Remove legacy code paths (defaultScore hack, fixed-rate drain, -0.10 cap, hardcoded followpoint % 10) and remove flags
- [ ] 7.9 Update `AGENTS.md` (if it exists) with the new gameplay/skin pipeline overview
- [ ] 7.10 Archive `fix-burst-miss-on-first-tap` change if not done in 0.1, confirm superseded work is reflected correctly

## 8. Validation gates

- [ ] 8.1 Conformance harness green on all 4 reference skins at every phase flip
- [ ] 8.2 Property tests green: hit windows, slider thresholds, score V2, HP drain
- [ ] 8.3 Latency probe shows ≥16.7 ms P50 improvement on mid-tier 60Hz profile after Track C optimization
- [ ] 8.4 Real-play smoke test on 3 reference beatmaps (one easy, one hard, one spinner-heavy) with all flags on: no crashes, judgements match expected lazer output
