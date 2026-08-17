# T13 — Fix the 4 real lazer-parity bugs found by the audit (D1–D4)

## Type
task (HITL — code change to a live game path)

## Claimed by
webosu-agent (2026-08-17 session)

## Status
done

## Resolution

Commit `0e05b2d` on `main`. All 4 audit-parity bugs fixed:

- **D1 (Score V2 production formula)**: `score.js` now imports `computeTotalScore`/`baseScoreFor`/`maxScoreFor`/`RESULT_ACCURACY`/`COMBO_EXPONENT` from `score-math.js`. Added `ScoreOverlay.scoreTyped(type, value, time, opts)` — the lazer-faithful typed pipe mirroring `score-math.js`'s `makeScorer.scoreTyped` exactly. `hit()` routes through `scoreTyped` when `FEATURES.lazerScoreV2` is on (maps `(result, maxresult)` → lazer type); legacy path preserved for flag-off/classic. **Critical catch**: `SliderScorer`'s `scoreTyped()` calls (`playback.js:1885`) were going to a non-existent method before this commit — silent `TypeError` swallowed by the render-loop try/catch. Now wired.
- **D2 (HP loss cap)**: removed `Math.max(hpDelta, -0.1)` from `hit()`. A miss at HP=10 now drains −0.20 (lazer value), not −0.10.
- **D3 (last-in-combo bonus)**: `scoreTyped` tracks per-combo tier (`_comboHadMeh/Miss/Ok/tailMiss`). On the last hit of a combo (`opts.lastInCombo`), adds `LAZER_LAST_COMBO_BONUS[Perfect=+0.07, Good=+0.05, None=+0.03]` on top of the base HP increase. `playback.js` computes `hit.lastInCombo` at `populateHit` time (next hit has different combo number, or spinner, or last hit). Judgement objects carry `lastInCombo` through to the miss/hit call sites.
- **D4 (circle radius)**: `playback.js` circleRadius = `32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))` (was `32 * (1 - 0.7 * (CS-5)/5)` — wrong for any CS≠5, 58% too big at CS=4).

### Tests
- `test-lazer-parity.js`: 87 → 110 tests (+23: D1 scoreTyped wiring, D2 cap removed, D3 bonus tiers, D4 circle radius for CS 0–10 + old-formula divergence). All 110 pass.

### Verification (all green)
- typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors (1301 hits).

## Question

The T02 lazer source audit found **4 real bugs** where webosu's in-flight mega-change claims lazer parity but actually diverges from ppy/osu master. These are the reducible deltas that *must* be fixed before the rollout (T06) flips the `lazerSliderJudging` / `lazerScoreV2` / `lazerHpDrain` flags on — otherwise the flags ship wrong behaviour under the "lazer parity" label.

All four fixes are in already-modified (uncommitted, post-T01) files. They are well-specified by the audit — this ticket is *doing*, not deciding, but the changes touch the live gameplay hot path so the user should sanity-check each fix lands (HITL).

### The 4 bugs (from `research/lazer-source-audit.md` "Divergences found")

#### D1 — Score V2 production formula missing
- **Bug**: `src/game/overlay/score.js:235-243` computes `score = round(1000000 * acc * scoreMultiplier)`, missing the `500000 * acc^5 * accProgress` term AND the `comboProgress`/`bonusPortion` accumulation.
- **Lazer**: `osu.Game/Rulesets/Scoring/ScoreProcessor.cs` — `ComputeTotalScore = 500000 * Accuracy * comboProgress + 500000 * Accuracy^5 * accuracyProgress + bonusPortion`, then `× scoreMultiplier`, then `Math.Round`.
- **Fix**: wire `score.js`'s `hit()` to use the typed-pipe accumulation already in `src/game/score-math.js` (which is correct but unused). Track `currentComboPortion`, `maximumComboPortion`, `currentBonusPortion`, `currentAccuracyJudgementCount`, `maximumAccuracyJudgementCount`; then `score = round(computeTotalScore(acc, cp, ap, bp) * scoreMultiplier)`. The `score-math.js` mirror is the source of truth — make `score.js` call it.
- **Gated by**: `FEATURES.lazerScoreV2` (only when flag on; legacy path stays).

#### D2 — HP single-hit loss cap
- **Bug**: `src/game/overlay/score.js:262` clamps single-hit HP loss to `Math.max(hpDelta, -0.1)`. Lazer has no such cap (a miss at HP=10 drains −0.20).
- **Fix**: remove the `Math.max(hpDelta, -0.1)` clamp, apply `hpDelta` directly.
- **Gated by**: `FEATURES.lazerHpDrain`.
- **Note**: tasks.md 3.3 marks this `[x]` (done) but the audit says the clamp is still there at line 262. Reconcile — either the task was marked done without verifying, or the line moved. Verify by reading the current `score.js` after T01 commits.

#### D3 — HP last-in-combo bonus missing
- **Bug**: `src/game/overlay/score.js:HPincreasefor` (lines ~193-217) never adds the +0.07/+0.05/+0.03 last-in-combo bonus.
- **Lazer**: `OsuHealthProcessor.GetHealthIncreaseFor` adds it when `combo.LastInCombo && result.IsHit`.
- **Fix**: track `LastInCombo` per hit object + a per-combo tier (Perfect/Good/None) and add the bonus on the last hit of each combo. tasks.md 3.4 marks this `[x]` — verify, the audit says it's not applied.
- **Gated by**: `FEATURES.lazerHpDrain`.

#### D4 — Circle radius formula wrong for CS≠5
- **Bug**: `src/game/playback.js:396` (uncommitted) uses `32 * (1 - 0.7 * (CS-5)/5)`, diverging from lazer's `32 * (1 - 0.7 * DifficultyRange(CS, 0, 0.5, 1))` for any CS≠5. At CS=4: webosu gives R=36.48 vs lazer R=23.04 (58% too big). The inline comment ("matches lazer exactly") is wrong — this was introduced in the uncommitted mega-change diff.
- **Fix**: `circleRadius = 32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))` using the `lazerDifficultyRange` helper already in `lazerHpTables.js:8-12`. (The `* 1.00041` fudge is sub-pixel — skip.)
- **NOT gated**: this is the CS formula used regardless of flags. Fixing it changes circle sizes for every CS≠5 map — player-visible. This is a BREAKING visual change but it's the correct lazer value.
- **Critical**: the mega-change introduced this bug; the *previous* webosu formula `(109 - 9·CS)/2` was the old webosu value, not lazer either. The correct fix is the lazer `DifficultyRange` formula.

### Acceptance

- All 4 bugs fixed, each gated correctly (D1/D2/D3 by their flags; D4 unconditionally since it's the CS formula).
- `npm run test:lazer` (the property tests in `scripts/test-lazer-parity.js`) — extend with: (a) Score V2 full formula test against `score-math.js`, (b) HP loss cap removed test, (c) last-combo bonus test, (d) circle radius test for CS ∈ {0, 2, 4, 5, 7, 10} against lazer values.
- `npm run typecheck` + `npm test` green.
- `headless-play.js` 0 pageerrors with flags on.
- `docs/wayfinder/STATUS.md` updated with a "T13 fixes" entry.
- One-line Decisions-so-far entry on the map.

## Blocks

T06 (rollout must flip flags on the *fixed* code, not the buggy code), T11 (real-play validation needs the correct formula)

## Blocked by

T01 (clean base — the bugs are in the uncommitted diff)