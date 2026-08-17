# T13 — Fix the 4 real lazer-parity bugs found by the audit (D1–D4)

## Type
task (HITL — code change to a live game path)

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