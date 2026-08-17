# Lazer Source-of-Truth Audit

(citations: file path + commit/permalink for lazer source; file:line for webosu)

All lazer citations are against `ppy/osu` `master` branch as of 2026-08-17. Permalink form:
`https://raw.githubusercontent.com/ppy/osu/master/<path>`. Webosu paths are relative to
`C:\Users\Gabrielle Monlea\Documents\Projects\webosu\`.

For the audit, "confirmed" = webosu's understanding matches lazer master byte-for-byte (modulo
obvious port-language differences); "divergence" = webosu does X, lazer does Y, fix = Z.

---

## Track A — Judging / Scoring / HP

### 1. Hit windows

- Lazer: `osu.Game.Rulesets.Osu/Scoring/OsuHitWindows.cs` (master) —
  `great = Math.Floor(IBeatmapDifficultyInfo.DifficultyRange(od, 80, 50, 20)) - 0.5`,
  `ok = Math.Floor(DifficultyRange(od, 140, 100, 60)) - 0.5`,
  `meh = Math.Floor(DifficultyRange(od, 200, 150, 100)) - 0.5`,
  `MISS_WINDOW = 400` (const, fixed regardless of OD).
  DifficultyRange is two-piece linear: `0→min, 5→mid, 10→max` (lazer `IBeatmapDifficultyInfo.DifficultyRange`).
- webosu: `src/game/lazerHpTables.js:67-74` —
  `great = Math.floor(lazerDifficultyRange(od, 80, 50, 20)) - 0.5`, etc.; `LAZER_MISS_WINDOW = 400`.
  `lazerDifficultyRange` at `lazerHpTables.js:8-12` matches the lazer two-piece linear form.
- Verdict: **confirmed — webosu matches.** Only consumed when
  `window.FEATURES.lazerSliderJudging` is on (`src/game/playback.js:404-408`); the legacy
  `200 - 10*OD` branch is for the non-lazer path and is not in scope for this audit.

### 2. Slider nested judging

- Lazer:
  - `osu.Game.Rulesets.Osu/Objects/SliderHeadCircle.cs` — `SliderHeadCircle : HitCircle`,
    judged as a normal `HitCircle` (`OsuJudgement`, MaxResult=Great) at `StartTime` unless
    `ClassicSliderBehaviour`.
  - `osu.Game.Rulesets.Osu/Objects/SliderTick.cs` — `SliderTickJudgement` (MaxResult=LargeTickHit).
  - `osu.Game.Rulesets.Osu/Objects/SliderEndCircle.cs` — `SliderEndJudgement` (MaxResult=LargeTickHit);
    `SliderRepeat : SliderEndCircle` so repeats → LargeTickHit/Miss.
  - `osu.Game.Rulesets.Osu/Objects/SliderTailCircle.cs` — `TailJudgement` (MaxResult=SliderTailHit,
    i.e. 150) when not classic; `LegacyTailJudgement` (SmallTickHit) for classic. Tail miss is
    `IgnoreMiss` (no combo break, no HP drain, but DOES affect accuracy as 0/150).
  - `osu.Game/Rulesets/Objects/SliderEventGenerator.cs` — `public const double TAIL_LENIENCY = -36;`
    Used as `finalSpanStartTime + spanDuration + TAIL_LENIENCY` for the LegacyLastTick time.
    Comment: "Historically, slider's final tick was offset by −36 ms … over the years it has
    become an expectation of players that you don't need to hold until the true end of the slider."
  - `osu.Game.Rulesets.Osu/Objects/Drawables/SliderInputManager.cs` — `TryJudgeNestedObject`:
    for `DrawableSliderTail`, returns early if `timeOffset < SliderEventGenerator.TAIL_LENIENCY`
    (i.e. won't judge tail if more than 36 ms before tail time). Also: head must be judged first
    (`if (!slider.HeadCircle.Judged) return;`), and `Tracking` requires the head to have been
    hit (`getInitialHitAction()` returns non-null only when head was hit). Head-gates-tracking
    is enforced.
- webosu: `src/game/slider-scorer.js:24` — `export const TAIL_LENIENCY = 36;` (positive 36,
  used as `time >= this.tail.time - TAIL_LENIENCY` at `slider-scorer.js:104`, which is
  equivalent to lazer's `timeOffset >= -36`). Head-gates-tracking is at `slider-scorer.js:82`
  (`effectiveTracking = tracking && this.headHit !== false`). Head = SliderHeadCircle, tick =
  LargeTickHit/Miss (30/0), repeat = LargeTickHit/Miss, tail = SliderTailHit (150) / IgnoreMiss
  — all match (`slider-scorer.js:95-112`). Slider's own binary display judgement
  (`OsuIgnoreJudgement`, any nested hit → Great display, none → Miss display, no score impact)
  is at `slider-scorer.js:60-71`.
- Verdict: **confirmed — webosu matches.** The sign convention differs (webosu uses +36 as a
  pre-tolerance; lazer uses −36 as the offset) but the observable behaviour is identical:
  tail can be hit up to 36 ms early.

### 3. Score V2

- Lazer: `osu.Game/Rulesets/Scoring/ScoreProcessor.cs` (master) —
  `protected virtual double ComputeTotalScore(double comboProgress, double accuracyProgress, double bonusPortion)`
  returns `500000 * Accuracy.Value * comboProgress + 500000 * Math.Pow(Accuracy.Value, 5) * accuracyProgress + bonusPortion`
  (lines around `ComputeTotalScore`). Final score = `Math.Round(TotalScoreWithoutMods * scoreMultiplier)`
  (where `scoreMultiplier` is the mod multiplier).
  `public const double COMBO_EXPONENT = 0.5;`
  `GetComboScoreChange(result) = GetBaseScoreForResult(result.Judgement.MaxResult) * Math.Pow(result.ComboAfterJudgement, COMBO_EXPONENT)`
  (combo scored against the MaxResult base, NOT the actual result — critical for tail misses).
  Base score table (`GetBaseScoreForResult`): SmallTickHit=10, LargeTickHit=30, SliderTailHit=150,
  Meh=50, Ok=100, Good=200, Great=300, Perfect=300, SmallBonus=10, LargeBonus=50.
  Accuracy is `currentBaseScore / currentMaximumBaseScore` where both use the MaxResult of each
  judgement (so a tail miss still adds 150 to the maximum, 0 to current → drops accuracy).
- webosu: `src/game/score-math.js:5-46` — `RESULT_BASE` table matches lazer exactly (Great=300,
  Ok=100, Meh=50, SliderTailHit=150, LargeTickHit=30, SmallTickHit=10, LargeBonus=50, SmallBonus=10).
  `COMBO_EXPONENT = 0.5`. `computeTotalScore(acc, comboProgress, accProgress, bonusPortion)`
  returns `500000 * acc * comboProgress + 500000 * Math.pow(acc, 5) * accProgress + bonusPortion`.
  `RESULT_MAX` correctly uses MaxResult bases (so `IgnoreMiss` maxes at 150), matching lazer's
  accuracy semantics.
- webosu's `score-math.js` is a pure-math mirror used for tests. The PRODUCTION scorer is
  `src/game/overlay/score.js` `ScoreOverlay.hit()` at `score.js:222-289`.
  `score.js:235-243`:
  ```
  this.score = this.classic ? this.v1Score
    : Math.round(1000000 * (this.maxJudgeTotal ? this.judgeTotal / this.maxJudgeTotal : 0) * this.scoreMultiplier);
  ```
  This is **`1000000 * accuracy * scoreMultiplier`** — i.e. ONLY the first half of the lazer
  V2 formula, missing the `500000 * acc^5 * accProgress` term AND the comboProgress / bonusPortion
  portions entirely. The bonus/combo portions are never accumulated in `score.js`.
- Verdict: **divergence — webosu's runtime scorer (`overlay/score.js`) does NOT implement
  Score V2.** webosu's `score-math.js` is correct but unused in production. Fix: replace the
  `score.js:235-243` score computation with the typed-pipe accumulation from `score-math.js`
  (`makeScorer().scoreTyped(...) → score`), tracking `currentComboPortion` /
  `maximumComboPortion` / `currentBonusPortion` / `currentAccuracyJudgementCount` /
  `maximumAccuracyJudgementCount` per judgement, then `score = round(computeTotalScore(acc, cp, ap, bp) * scoreMultiplier)`.
  The `LAZER_LAST_COMBO_BONUS` (Perfect +0.07 / Good +0.05 / None +0.03) is HP-only (see point 4),
  NOT a score multiplier — webosu correctly does not apply it to score, but the production score
  is still wrong because the V2 formula is missing.

### 4. HP drain

- Lazer:
  - `osu.Game/Rulesets/Scoring/DrainingHealthProcessor.cs` —
    `targetMinimumHealth = IBeatmapDifficultyInfo.DifficultyRange(HP, 0.99, 0.9, 0.4)` —
    matches the ticket's "99% / 90% / 40%" targets. `ComputeDrainRate()` is a binary search
    that simulates a perfect play through all `healthIncreases`, fitting `DrainRate` so
    `lowestHealth ≈ targetMinimumHealth` within `minimum_health_error = 0.01`. Drain is paused
    during break periods via `noDrainPeriodTracker` (the `if (noDrainPeriodTracker?.IsInAny(Time.Current) == true) return;`).
    There is **NO** single-hit HP loss cap in lazer — `Health.Value += GetHealthIncreaseFor(result)`
    applies the full negative miss value directly.
  - `osu.Game.Rulesets.Osu/Scoring/OsuHealthProcessor.cs` — per-judgement HP table
    (`getHealthIncreaseFor`):
    - SmallTickMiss / LargeTickMiss: `DifficultyRange(HP, -0.02, -0.075, -0.14)`
    - Miss: `DifficultyRange(HP, -0.03, -0.125, -0.2)`
    - SmallTickHit: +0.02 (flat)
    - SliderTailHit / LargeTickHit: SliderTick → +0.015, else (head/tail/repeat) → +0.02
    - Meh: +0.002, Ok: +0.011, Great: +0.03
    - SmallBonus: +0.0085, LargeBonus: +0.01
    - Last-in-combo bonus (when `combo.LastInCombo && result.Type.IsHit()`):
      Perfect +0.07, Good +0.05, None +0.03 (added on top of the base increase).
- webosu:
  - `src/game/lazerHpTables.js:16-52` — `lazerHpIncrease` matches the lazer table exactly:
    SmallTickMiss/LargeTickMiss = `DifficultyRange(dr, -0.02, -0.075, -0.14)`,
    Miss = `DifficultyRange(dr, -0.03, -0.125, -0.2)`, SmallTickHit = +0.02,
    SliderTailHit/LargeTickHit: SliderTick → +0.015 else +0.02, Meh=+0.002, Ok=+0.011,
    Great=+0.03, SmallBonus=+0.0085, LargeBonus=+0.01. ✓
  - `src/game/lazerHpTables.js:56-60` — `LAZER_LAST_COMBO_BONUS = { Perfect: 0.07, Good: 0.05, None: 0.03 }`. ✓
  - `src/game/overlay/score.js:106` — `passiveDrain = lazerDifficultyRange(HPdrain, 0.0000015, 0.000004, 0.0000075)` —
    this is an APPROXIMATION, NOT lazer's binary-search `ComputeDrainRate`. The comment at
    `score.js:100-105` acknowledges this. The real algorithm requires simulating the whole beatmap.
  - `src/game/overlay/score.js:259-263` — `this.HP += Math.max(hpDelta, -0.1)` — webosu clamps
    single-hit HP LOSS to −0.10 (10% per hit). **Lazer does NOT do this.** A miss at HP=10
    in lazer drains −0.2 (20%) in one hit.
  - `src/game/overlay/score.js:370-384` — passive drain is paused outside `[drainStart, drainEnd]`
    (`if (time >= drainStart && time <= drainEnd ...)`) — this matches lazer's break-period
    pause conceptually, though the exact `noDrainPeriodTracker` semantics (per-break-period
    tracking using `Beatmap.Breaks`) is approximated by a single drain window.
  - `LAZER_LAST_COMBO_BONUS` is **not** applied in `score.js` at all — the `HPincreasefor`
    function (`score.js:193-217`) does not check `LastInCombo` or compute a combo-tier bonus.
- Verdict: **divergence (two issues):**
  1. **HP loss cap:** webosu clamps single-hit HP loss to −0.10 (`score.js:262`); lazer has no
     such cap. Fix: remove the `Math.max(hpDelta, -0.1)` clamp, apply `hpDelta` directly.
  2. **Last-in-combo bonus:** webosu never adds the +0.07/+0.05/+0.03 bonus on the last hit of
     a combo. Fix: track `LastInCombo` per hit object and the combo tier (Perfect if no Meh/Miss
     in the combo, Good if any Ok/LargeTickMiss/slider-tail-miss, None if any Meh/Miss), then add
     the bonus to `hpDelta` when the last hit of the combo is hit.
  - The passive drain rate being an approximation (not the binary-search value) is a known
    limitation, documented in `score.js:100-105`. Listed here for completeness; graduating a
    fix would require running `ComputeDrainRate` over the beatmap at load time.

### 5. Spinner

- Lazer:
  - `osu.Game.Rulesets.Osu/Objects/Spinner.cs` —
    `CLEAR_RPM_RANGE = new DifficultyRange(90, 150, 225)` (OD 0/5/10).
    `COMPLETE_RPM_RANGE = new DifficultyRange(250, 380, 430)`.
    `SpinsRequired = (int)(minRps * secondsDuration + 0.0001)` where
    `minRps = DifficultyRange(OD, CLEAR_RPM_RANGE) / 60`.
    `MaximumBonusSpins = Math.Max(0, (int)(maxRps * secondsDuration + 0.0001) - SpinsRequired - bonus_spins_gap)`
    where `bonus_spins_gap = 2`. So `SpinsRequiredForBonus = SpinsRequired + 2`.
    Nested ticks: first `SpinsRequiredForBonus` are `SpinnerTick` (MaxResult=SmallBonus=10 each),
    the rest are `SpinnerBonusTick` (MaxResult=LargeBonus=50 each).
  - `osu.Game.Rulesets.Osu/Objects/SpinnerTick.cs` — `OsuSpinnerTickJudgement.MaxResult = HitResult.SmallBonus`.
  - `osu.Game.Rulesets.Osu/Objects/SpinnerBonusTick.cs` — `OsuSpinnerBonusTickJudgement.MaxResult = HitResult.LargeBonus`.
  - So: clear RPM gives `SpinsRequired` × SmallBonus (10 each). Each spin past `SpinsRequired + 2`
    up to a cap of `MaximumBonusSpins` gives LargeBonus (50 each). Bonus is **capped** at
    `MaximumBonusSpins` per spinner (NOT uncapped) — capped at the complete-RPM-derived count.
- webosu: `src/game/lazerHpTables.js:79-84` — `lazerSpinnerRpm(od) = { clear: DifficultyRange(od, 90, 150, 225), complete: DifficultyRange(od, 250, 380, 430) }`. ✓
  The clear/complete RPM values match. (webosu's spinner scoring in `playback.js` is not in
  scope for this audit's source-of-truth check — the table is what the ticket asked to confirm.)
- Verdict: **confirmed — RPM values match. Resolves mega-change Open Question #5:** bonus is
  NOT uncapped; lazer caps `MaximumBonusSpins = max(0, floor(complete_rps * duration) − SpinsRequired − 2)`.
  Each bonus spin awards LargeBonus (50 base score, +0.01 HP). Each required spin awards
  SmallBonus (10 base, +0.0085 HP).

### 6. Circle radius

- Lazer:
  - `osu.Game.Rulesets.Osu/Objects/OsuHitObject.cs` —
    `public const float OBJECT_RADIUS = 64;`
    `public double Radius => OBJECT_RADIUS * Scale;`
    `Scale = LegacyRulesetExtensions.CalculateScaleFromCircleSize(difficulty.CircleSize, true)`.
  - `osu.Game/Rulesets/Objects/Legacy/LegacyRulesetExtensions.cs` —
    `CalculateScaleFromCircleSize(CS, applyFudge=true) = (float)(1.0f - 0.7f * IBeatmapDifficultyInfo.DifficultyRange(CS)) / 2 * 1.00041f`
    where `DifficultyRange(CS)` is the standard `0→0, 5→0.5, 10→1` linear (so `1 - 0.7 * (CS-5)/5`
    only when CS≥5 — for CS<5 the formula is `1 - 0.7 * (1 - (5-CS)/5)` etc., but the
    general form simplifies to `1 - 0.7 * DifficultyRange(CS)` then divided by 2).
    The `broken_gamefield_rounding_allowance = 1.00041f` fudge is applied for replay parity
    (under 1 game pixel — visually imperceptible).
  - So full lazer formula: `R = 64 * (1 - 0.7 * DifficultyRange(CS)) / 2 * 1.00041`
    = `32 * (1 - 0.7 * DifficultyRange(CS)) * 1.00041`.
    At CS=5 (DifficultyRange=0.5): `R = 32 * (1 - 0.35) * 1.00041 = 32 * 0.65 * 1.00041 ≈ 20.8085`.
    At CS=4 (DifficultyRange=0.4): `R = 32 * (1 - 0.28) * 1.00041 = 32 * 0.72 * 1.00041 ≈ 23.0494`.
- webosu: `src/game/playback.js:396` —
  `self.circleRadius = 32 * (1 - (0.7 * (this.CS - 5)) / 5);`
  This is `32 * (1 - 0.7 * (CS-5)/5)`. At CS=5 → `32 * 1 = 32`. At CS=4 → `32 * (1 - 0.14) = 32 * 0.86 = 27.52`.
  **THIS IS NOT THE LAZER FORMULA.** webosu's `(CS-5)/5` only matches lazer's `DifficultyRange(CS)`
  for `CS ≥ 5`; for `CS < 5` the two diverge sharply:
  - lazer `DifficultyRange(4) = 0.4` (because `0→0, 5→0.5, 10→1` linearly, so 4 maps to 0.4)
  - webosu `(4-5)/5 = -0.2`
  - So lazer R at CS=4 = `32 * (1 - 0.7*0.4) = 32 * 0.72 = 23.04`
  - webosu R at CS=4 = `32 * (1 - 0.7*(-0.2)) = 32 * 1.14 = 36.48`
  - **Larger by ~58%** — explains the "circles feeling tiny" complaint in the opposite direction;
    actually webosu's CS=4 circle is way too BIG, not too small.
  - webosu also omits the `* 1.00041` fudge (~0.04% — negligible).
- Verdict: **divergence — webosu's circle-radius formula is wrong for CS<5 and CS>5.** The
  lazer formula uses `DifficultyRange(CS)` which is `0→0, 5→0.5, 10→1` (so `CS/5` clamped to
  [0,1] then linearly mapped to [0,1]); webosu uses `(CS-5)/5` which is `0→-1, 5→0, 10→1`.
  Fix: `circleRadius = 32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1)) * 1.00041` (or skip
  the 1.00041 fudge for simplicity, it's sub-pixel). The comment at `playback.js:394-395`
  ("R = 32 * (1 - 0.7 * (CS - 5) / 5)", "At CS=4 this gives 36.48 — matches lazer exactly")
  is incorrect — 36.48 does NOT match lazer (lazer = 23.04 at CS=4).

---

## Track B — Skinning

### 7. sliderStyle

- Lazer: `sliderStyle` is **NOT** a recognised skin setting in lazer. The complete enum of
  legacy skin settings is `SkinConfiguration.LegacySetting` (`osu.Game/Skinning/SkinConfiguration.cs`):
  `Version, ComboPrefix, ComboOverlap, ScorePrefix, ScoreOverlap, HitCirclePrefix,
  HitCircleOverlap, AnimationFramerate, LayeredHitSounds, AllowSliderBallTint, InputOverlayText`.
  The osu!-ruleset-specific settings are `OsuSkinConfiguration` (`osu.Game.Rulesets.Osu/Skinning/OsuSkinConfiguration.cs`):
  `SliderPathRadius, CursorCentre, CursorExpand, CursorRotate, CursorTrailRotate,
  HitCircleOverlayAboveNumber, HitCircleOverlayAboveNumer, SpinnerFrequencyModulate, SpinnerNoBlink`.
  No `SliderStyle` in either enum. `LegacySkinDecoder.ParseLine` (`osu.Game/Skinning/LegacySkinDecoder.cs`)
  dumps any unrecognised key into `skin.ConfigDictionary` as a raw string but nothing in the
  osu! ruleset reads `sliderStyle` from there.
  - Lazer slider body rendering: `LegacySliderBody` (`osu.Game.Rulesets.Osu/Skinning/Legacy/LegacySliderBody.cs`)
    uses a `LegacyDrawableSliderPath` that always renders the gradient (shadow + border +
    outer/inner colour interpolation). The `sliderb.png` texture is used for the **slider ball**
    (via `LegacySliderBall`), NOT the body. The body is always gradient-shaded in legacy skins.
- webosu: `src/game/SliderMesh.js:48-52` — reads `window.game.skinConfig.sliderStyle`, branches:
  style 1 → linear `FillGradient` body; style 2 → `MeshRope` with `sliderb.png` as the body
  texture. This is a non-lazer extension (webosu-specific feature).
- Verdict: **divergence — `sliderStyle` is a webosu invention, not a lazer skin setting.** This
  is not necessarily a "fix" — it's an intentional webosu extension that gives skins an option
  lazer doesn't. If strict lazer parity is wanted, remove the `sliderStyle` branch and always
  render the gradient body (lazer's `LegacyDrawableSliderPath` shader). If keeping it as a
  webosu extension, document it as such. No action required for the parity rollout, but the
  mega-change's claim of "lazer parity" for `sliderStyle` is misleading.

### 8. hitCircleOverlap

- Lazer:
  - `osu.Game/Skinning/LegacySpriteText.cs` — `Spacing = new Vector2(-skin.GetFontOverlap(font), 0);`
    so the inter-glyph spacing is the **full negative** of the overlap value (NOT overlap × 0.3).
  - `osu.Game/Skinning/LegacySkinExtensions.cs:GetFontOverlap(LegacyFont.HitCircle)` —
    `source.GetConfig<LegacySetting, float>(LegacySetting.HitCircleOverlap)?.Value ?? -2f`
    (default −2 when not specified).
  - The `LegacyFont.HitCircle` is used by `LegacyMainCirclePiece` (`osu.Game.Rulesets.Osu/Skinning/Legacy/LegacyMainCirclePiece.cs`)
    via a `SkinnableSpriteText` for the combo number on hit circles. So lazer positions
    multi-digit combo numbers using `Spacing = -overlap` (full value).
- webosu: `src/game/playback.js:1655-1664` —
  ```
  const overlap = window.game.skinConfig.hitCircleOverlap || 0;
  if (overlap && digitCount > 1) {
    for (let di = 0; di < digitCount - 1; di++) {
      hit.numbers[di].x += overlap * 0.3;     // right digit shifts right
      hit.numbers[di + 1].x -= overlap * 0.3; // left digit shifts left
    }
  }
  ```
  This applies `overlap * 0.3` as a per-pair shift, splitting the overlap between adjacent
  digits (right digit +0.3·overlap, left digit −0.3·overlap, net = 0.6·overlap reduction in
  spacing per pair). Lazer applies the full `−overlap` as the Spacing value (so each glyph is
  drawn `overlap` pixels closer to the previous one, net = `overlap` reduction per pair).
- Verdict: **divergence — webosu uses `overlap * 0.3` shift, lazer uses `overlap` (full).** The
  effective compression in webosu is 0.6·overlap per pair; in lazer it's 1.0·overlap per pair.
  Fix: replace the `* 0.3` with `* 0.5` on each side (so net = overlap per pair), or better,
  rewrite to use `Spacing = -overlap` semantics on the sprite container. Also: lazer's default
  is `−2` (i.e. spacing slightly widened by 2px) when `HitCircleOverlap` is unset; webosu
  defaults to `0`.

### 9. @2x variants — authoritative list

- Lazer: `osu.Game/Skinning/LegacySkin.cs:GetTexture` —
  ```
  if (AllowHighResolutionSprites) {
    string twoTimesFilename = $"{Path.ChangeExtension(componentName, null)}@2x{Path.GetExtension(componentName)}";
    texture = Textures?.Get(twoTimesFilename, ...);
    if (texture != null) ratio = 2;
  }
  texture ??= Textures?.Get(componentName, ...);
  ```
  `AllowHighResolutionSprites => true` (virtual, default true in `LegacySkin`).
  **There is NO whitelist of @2x-legal texture names.** Any texture that lazer looks up can have
  an @2x variant; if `<name>@2x.png` exists in the skin, it's used and `texture.ScaleAdjust = 2`.
- `osu.Game/Skinning/LegacyBeatmapSkin.cs` — `protected override bool AllowHighResolutionSprites => false;`
  So **beatmap skins do NOT use @2x variants** (matches stable: beatmap skin textures are 1x only).
- The set of @2x-legal textures is therefore "any texture the osu! ruleset looks up via
  `skin.GetTexture(name)`". The lookups come from:
  - `OsuLegacySkinTransformer.GetDrawableComponent` (master): `hitcircle`, `hitcircleoverlay`,
    `sliderstartcircle`, `sliderstartcircleoverlay`, `sliderendcircle`, `sliderendcircleoverlay`,
    `approachcircle`, `reversearrow`, `sliderb`, `sliderb0`, `sliderfollowcircle`,
    `sliderscorepoint`, `followpoint`, `cursor`, `cursortrail`, `cursor-ripple`, `star2`,
    `cursor-smoke`, `spinner-background`, `spinner-top`, `sliderpoint30`, `sliderpoint10`,
    `slidertickmiss`, `sliderendmiss`, `hit0`, `hit50`, `hit100`, `hit300`, `particle50`,
    `particle100`, `particle300`.
  - `LegacySkin.getJudgementAnimation`: `hit0`, `hit50`, `hit100`, `hit300`, `slidertickmiss`,
    `sliderendmiss`.
  - `LegacySpriteText` (via `GetFontPrefix`): per-digit font textures `<prefix>-0` … `<prefix>-9`,
    `<prefix>-comma`, `<prefix>-dot`, `<prefix>-percent`, `<prefix>-pp` where `<prefix>` is
    `default` (HitCircle default), `score` (Score/Combo default), or any custom
    `HitCirclePrefix` / `ScorePrefix` / `ComboPrefix` value. So `default-0@2x.png`,
    `score-3@2x.png`, etc. are all legal.
  - Animation frame textures: `hit0-0`, `hit0-1`, … `hit300-0`, etc. — these CAN have @2x variants
    (`hit0-0@2x.png`).
  - HUD/score: `score-0`…`score-9`, `score-comma`, `score-dot`, `score-percent`, `score-x`.
  - `LegacyHealthDisplay`, `LegacyScoreCounter`, `LegacyAccuracyCounter`, `LegacySongProgress`
    (under `osu.Game/Skinning/Legacy/`): `scorebar-bg`, `scorebar-colour`, `scorebar-ki`,
    `scorebar-kidanger`, `scorebar-kidanger2`, `default-hud` etc.
- Authoritative list (osu! ruleset textures that legally have @2x variants in user skins):
  - **Hit circles / slider heads+tails:** `hitcircle`, `hitcircleoverlay`,
    `sliderstartcircle`, `sliderstartcircleoverlay`, `sliderendcircle`, `sliderendcircleoverlay`
  - **Approach / reverse / follow:** `approachcircle`, `reversearrow`, `sliderfollowcircle`,
    `sliderscorepoint`, `followpoint` (and animation frames `followpoint-0` … `followpoint-9`)
  - **Slider ball:** `sliderb`, `sliderb0` (and animation frames `sliderb0`…`sliderbN`)
  - **Cursor:** `cursor`, `cursortrail`, `cursormiddle`, `cursor-ripple`, `star2`, `cursor-smoke`
  - **Spinner:** `spinner-background`, `spinner-top`, `spinner-spin`, `spinner-clear`,
    `spinner-rpm`, `spinner-osu`, `spinner-approachcircle`, `spinner-glare`
  - **Hit judgements:** `hit0`, `hit50`, `hit100`, `hit300`, `hit300g`, `hit300k`, `hit100k`
    (and animation frames `hit0-0`…, `hit50-0`…, `hit100-0`…, `hit300-0`…)
  - **Slider point textures (skin version <2.0):** `sliderpoint30`, `sliderpoint10`,
    `sliderscorepoint`, `slidertickmiss`, `sliderendmiss`
  - **Particles:** `particle50`, `particle100`, `particle300`
  - **Hit-circle font (per-digit):** `default-0`…`default-9`, `default-comma`, `default-dot`,
    `default-percent`, plus the same set for any custom `HitCirclePrefix` value (e.g.
    `myfont-0@2x.png` if `HitCirclePrefix: myfont`).
  - **Score font:** `score-0`…`score-9`, `score-comma`, `score-dot`, `score-percent`, `score-x`,
    plus the same set for any custom `ScorePrefix` value.
  - **Combo font:** uses `ScorePrefix` (default `score`) and `ComboOverlap`; same set as score
    font (combo prefix falls back to score prefix in `GetFontPrefix`).
  - **Health bar:** `scorebar-bg`, `scorebar-colour`, `scorebar-ki`, `scorebar-kidanger`,
    `scorebar-kidanger2`
  - **HUD misc:** `play-skip`, `play-warningarrow`, `multi-skipped`, `section-pass`,
    `section-fail`, `count1`, `count2`, `count3`, `go`, `ready`, `rank-<grade>`,
    `combo-perfect`, `combo-great`, `combo-good`, `combo-bad`, `combo-miss`
  - **Hit samples (NOT textures — @2x doesn't apply):** audio only.
- Beatmap skins (`LegacyBeatmapSkin`): **NO @2x** — `AllowHighResolutionSprites => false`.
- Verdict: webosu's `skin-filter.js` whitelist (`src/game/skin-filter.js:30`+) is a SUBSET of
  the lazer-legal list, missing at minimum: animation frames (`hit0-0`, `followpoint-0`, etc.),
  per-digit font @2x (`default-0@2x`, `score-0@2x`), `sliderpoint30`/`sliderpoint10`,
  `cursormiddle`, `particle50/100/300`, `sliderendcircle`/`sliderendcircleoverlay`,
  `sliderstartcircle`/`sliderstartcircleoverlay`. This feeds T11's whitelist extension.

### 10. Beatmap [Colours] ApproachCircle

- Lazer:
  - `osu.Game/Beatmaps/Formats/LegacyDecoder.cs:HandleColours` — any `[Colours]` line that's not
    `Combo<N>` is stored as `CustomColours[key]`. So `[Colours] ApproachCircle: R,G,B` becomes
    `CustomColours["ApproachCircle"]`.
  - `osu.Game.Rulesets.Osu/Skinning/Legacy/LegacyApproachCircle.cs` — the approach circle is
    loaded with `skin.GetTexture(@"approachcircle")` and coloured via
    `accentColour.BindValueChanged(colour => Colour = LegacyColourCompatibility.DisallowZeroAlpha(colour.NewValue))`.
    The colour comes from `DrawableHitObject.AccentColour`, which is the **combo colour** (set
    from `IHasComboInformation`/`ComboColours`), NOT from `CustomColours["ApproachCircle"]`.
  - In other words: **lazer does NOT apply `[Colours] ApproachCircle` to the approach circle
    at all.** The wiki documents `ApproachCircle` as a `[Colours]` key, but lazer's
    `LegacyApproachCircle` only uses the combo colour. `CustomColours["ApproachCircle"]` is
    parsed but never consumed by the osu! ruleset.
- webosu: mega task 5.12 (unstarted) — the ticket asks to confirm precedence "skin value wins,
  beatmap fallback, combo color last". Lazer's actual precedence is: **combo colour wins (only)**;
  `CustomColours["ApproachCircle"]` is dead data. There is no skin `ApproachCircle` colour
  lookup in lazer.
- Verdict: **divergence — the ticket's assumed precedence (skin → beatmap → combo) is not what
  lazer does.** Lazer uses the combo colour for the approach circle, full stop. If webosu wants
  strict lazer parity: do NOT implement `[Colours] ApproachCircle` consumption; use the combo
  colour. If webosu wants to honour the skinning wiki's documented `ApproachCircle` colour:
  precedence should be skin `CustomColours["ApproachCircle"]` → beatmap `CustomColours["ApproachCircle"]`
  → combo colour. Document whichever choice is made. (Recommendation: skip it for parity; the
  wiki documents a feature lazer never implemented.)

### 11. hit*-<n>.png numbered variants

- Lazer: `osu.Game/Skinning/LegacySkinExtensions.cs:GetTextures` — when `animatable: true`,
  the lookup iterates `getFrameName(i) = $"{componentName}{animationSeparator}{i}"` with
  `animationSeparator = "-"` (default). So for `hit0`, frames are `hit0-0`, `hit0-1`, …
  until a frame is missing. `LegacySkin.getJudgementAnimation` calls
  `this.GetAnimation("hit0", true, false)`, `this.GetAnimation("hit50", true, false)`,
  `this.GetAnimation("hit100", true, false)`, `this.GetAnimation("hit300", true, false)`.
  So `hit0-0.png`, `hit0-1.png`, … ARE used by lazer for judgement animations — they are
  NOT "parsed but intentionally ignored". Same for `followpoint-0`…`followpoint-9` and
  `sliderb0`…`sliderbN`.
- webosu: `src/game/skin-loader.js:188-193` —
  ```
  // skip numbered hit variants like hit0-0.png (60 variants per hit) — only need base hit0.png
  if (flattened.match(/^hit(0|50|100|300)[k]?-\d+\.png$/)) continue;
  if (flattened.match(/^followpoint-\d+\.png$/)) {
    const idx = parseInt(flattened.match(/followpoint-(\d+)\.png/)[1], 10);
    if (idx > 9) continue; // only 0-9 needed for animation, skin has 0-60
  }
  ```
  The comment says "only need base hit0.png" and "intentionally uncapped". The followpoint
  branch DOES load frames 0-9 (so followpoint animation IS supported). But `hit0-N.png`,
  `hit50-N.png`, etc. are all skipped entirely — webosu shows only the static base judgement
  texture, never the animated frames.
- Verdict: **divergence — webosu's documented "intentional skip" is NOT what lazer does.** Lazer
  DOES use `hit0-0.png`, `hit0-1.png`, etc. for animated judgements when present. webosu's skip
  is a performance / memory trade-off (60 frames × 6 judgements = up to 360 extra textures),
  not a parity match. Fix (if full parity wanted): load `hit{0,50,100,300}{,k}-N.png` frames
  and play them as the judgement animation (use `PIXI.AnimatedSprite` or a sprite-sheet), with
  `AnimationFramerate` from `skin.ini` (default 60 FPS, or `1000/textures.Length` if not set).
  If keeping the skip for memory reasons, document it as a known divergence, not a parity match.

---

## Track C — Feel / Latency (the deltas this map re-opens)

### 12. RAF + input timing

- `requestAnimationFrame` (HTML spec §9 — the event loop rendering step) is **vsync-quantized**:
  callbacks fire once per display refresh (typically 60 Hz / 16.67 ms, or 120/144/240 Hz on
  high-refresh displays). It is NOT a high-frequency timer. The theoretical floor for
  input-to-judgement latency in a browser game that polls input in the RAF callback is one
  vsync interval (~16.67 ms at 60 Hz), plus the OS compositor delay (typically 1 frame), plus
  the display's pixel response time (~1–5 ms). Total floor ≈ 2 vsync intervals ≈ 33 ms at 60 Hz,
  ≈ 17 ms at 120 Hz.
- Pointer Events spec (W3C Pointer Events): `pointerdown`/`pointermove` events fire on the
  main thread, dispatched by the OS at the device's poll rate (mouse: 125–8000 Hz; touch:
  typically 60–240 Hz). They are NOT aligned to vsync — they can fire between RAF callbacks.
  A game that reads input state inside its RAF callback therefore coalesces all pointer events
  that occurred since the last frame, adding up to one vsync interval of latency.
- Web Animations API spec (W3C): runs on the compositor thread, decoupled from main-thread
  RAF — animations advance by the vsync delta even if the main thread is busy. This is relevant
  for CSS/Web Animations-driven visuals (smooth playback during jank), but does NOT help
  input-to-judgement latency in a game loop that processes input synchronously with rendering.
- WebGPU spec (W3C): does not change the input/render timing model — `device.queue.onSubmittedWorkDone()`
  and `onSubmittedWorkDone()` are async; WebGPU rendering still happens within the RAF callback
  on the main thread (or in a worker via OffscreenCanvas, see point 15). No latency improvement
  over WebGL beyond throughput.
- `performance.now()` resolution (HR-Time spec §4, "coarsen time"): default resolution is
  **100 microseconds** (0.1 ms); in a cross-origin-isolated context (CORP+COEP headers, the
  "cross-origin isolated capability") the resolution is **5 microseconds** (0.005 ms). Browsers
  may add jitter or further coarsen for Spectre/timing-attack mitigation. So `performance.now()`
  is fine for ms-precision hit-error measurement but cannot meaningfully measure sub-100μs
  jitter outside of COEP-isolated contexts. The 5μs figure the ticket asks about is only
  available with COOP+COEP isolation.
- Verdict: **confirmed.** The theoretical input-to-judgement floor in a RAF-driven browser
  game is ~2 vsync intervals (33 ms at 60 Hz, 17 ms at 120 Hz). `performance.now()` resolution
  is ≥ 100 μs (or ≥ 5 μs with cross-origin isolation). No divergence — this is a platform
  reality, not a webosu/lazer gap.

### 13. AudioWorklet vs Howler currentTime

- Howler v2.2.4 (source: `dist/howler.core.min.js` on `github.com/goldfire/howler.js` master,
  header `/*! howler.js v2.2.4 | (c) 2013-2020, James Simpson of GoldFire Studios | MIT License */`):
  Howler uses a single global `AudioContext` (`n.ctx`), created lazily via `_()` (the `ctx`
  init function). All `currentTime` reads use `n.ctx.currentTime` on the **main thread**
  (control thread). `Howl.play` records `d._playStart = n.ctx.currentTime` and computes seek
  position as `n.ctx.currentTime - d._playStart`. `AudioContext.currentTime` (Web Audio API
  spec §1.1.1, "currentTime" attribute) is updated by the **rendering thread** in uniform
  increments of one render quantum (default 128 frames = ~2.9 ms at 44.1 kHz), and the spec
  says it "MUST be read atomically on the control thread before being returned." So the
  resolution of `currentTime` is the render quantum (~2.9 ms), and there's an additional
  cross-thread read latency (the control thread sees a value that's 0–1 quantum old).
- `AudioWorkletProcessor` (Web Audio API spec §1.32.5): runs on the **audio rendering thread**
  (the same thread that updates `currentTime`). Inside `process(inputs, outputs, parameters)`
  the processor has access to `currentTime` and `currentFrame` from `AudioWorkletGlobalScope`
  (§1.32.3), which are sample-accurate (the rendering thread knows exactly which sample frame
  it's processing). So an AudioWorklet-based clock has **sample-accurate** resolution (~22.7 μs
  at 44.1 kHz) and zero cross-thread read latency, because the read happens on the same thread
  that advances the clock.
- Practical jitter improvement: Howler's `currentTime` read on the main thread has ~2.9 ms
  quantum resolution + 0–2.9 ms cross-thread staleness = up to ~5.8 ms of jitter. An
  AudioWorkletProcessor clock has ~22.7 μs resolution and no staleness. The practical
  improvement is ~2.9–5.8 ms of jitter elimination, which is significant for osu!'s hit-window
  judgement (the Meh window at OD=10 is ~99.5 ms; ~3 ms of audio jitter is ~3% of the Meh
  window — noticeable but not catastrophic).
- BUT: an AudioWorkletProcessor can only communicate with the main thread via
  `AudioWorkletNode.port.postMessage` (async, queued as a task), so the sample-accurate clock
  value still has to cross a thread boundary to reach the game loop. The improvement is
  therefore in the *clock value's freshness* (the rendering thread knows the current sample,
  the main thread only knows the last quantum boundary), NOT in the *delivery latency*.
  Net practical win: the AudioWorklet can report the audio position at the moment the audio
  callback ran, which is at most one quantum (2.9 ms) fresher than what `currentTime` would
  return on the main thread at the same wall-clock instant. For osu!-style "where is the
  audio now?" polling, an AudioWorklet clock can shave ~1 quantum (~2.9 ms) off the audio-side
  latency estimate.
- Verdict: **confirmed — AudioWorklet gives a tighter clock than Howler's main-thread
  `currentTime`.** Practical improvement: ~2.9 ms (one render quantum) of freshness, plus
  elimination of the 0–2.9 ms cross-thread staleness. Not a dramatic win but measurable.
  webosu would need to write a tiny `AudioWorkletProcessor` that posts `currentTime`/`currentFrame`
  to the main thread on each `process()` call (or on demand), and use that for audio-position
  polling instead of `Howler.seek()`. This is a Track C enhancement, not a lazer parity item.

### 14. WebGPU in Pixi 8

- Pixi 8.19.0 is the latest stable release as of 2026-08-17 (source:
  `api.github.com/repos/pixijs/pixijs/releases/latest`, `tag_name: v8.19.0`, published
  2026-06-04). Pixi v8 has a first-class `WebGPURenderer` (`preference: "webgpu"` in
  `Application.init()` or `autoDetectRenderer`), shipping since v8.0.0.
- Browser support for WebGPU (MDN / caniuse): shipping in Chrome ≥113 (stable since May 2023),
  Edge ≥113, ChromeOS, Android Chrome ≥121. **NOT** shipping in Firefox (behind
  `dom.webgpu.enabled` pref, partial implementation) or Safari (behind feature flag in
  Safari Tech Preview, not in stable Safari as of 2026-08). So `preference: "webgpu"` will
  work for ~70–80% of users (Chrome/Edge/Chrome-android) and silently fall back to WebGL for
  the rest, IF the app uses `autoDetectRenderer` / `Application.init({ preference: "webgpu" })`
  (Pixi will fall back to WebGL when WebGPU is unavailable).
- Pixi 8 release notes (github.com/pixijs/pixijs releases v8.0.0–v8.19.0): WebGPU is the
  headline feature of v8; it's considered production-ready for the renderer surface that
  Pixi uses (sprites, graphics, text, meshes, filters). Known caveats as of 8.19:
  - WebGPU is more strict about texture format support (some `gl.LUMINANCE`-style formats are
    not available; Pixi handles internally).
  - WebGPU context loss / recovery is less mature than WebGL's; Pixi handles it but
    long-running sessions can occasionally lose the device.
  - WebGPU is not available in Web Workers via OffscreenCanvas in all browsers (Chrome yes,
    Edge yes; Firefox/Safari N/A since they don't ship WebGPU at all).
  - Filter pipeline has a few WebGPU-specific bugs being fixed in point releases.
- Verdict: **`preference: "webgpu"` is production-ready in Pixi 8.19 for Chrome/Edge users.**
  Recommended: use `preference: "webgpu"` (with auto-fallback to WebGL) for the throughput
  win on supported browsers; do NOT make WebGPU a hard requirement. webosu's Pixi 8 setup
  should default to `webgpu` preference with `webgl` fallback. Feeds T08.

### 15. OffscreenCanvas + Web Worker render

- `OffscreenCanvas` (HTML spec §the-offscreencanvas-interface; MDN): a canvas that can be
  rendered off the DOM, transferable to a Web Worker via `postMessage(..., [canvas])`. In a
  worker, `OffscreenCanvas.getContext("webgl" | "webgpu" | "2d")` works, and
  `requestAnimationFrame` is available in workers (DedicatedWorkerGlobalScope). Browser
  support: Baseline widely available since March 2023 (Chrome, Edge, Firefox, Safari all
  ship `OffscreenCanvas` + WebGL-in-worker; WebGPU-in-worker is Chrome/Edge only as of 2026).
- Pixi 8 + OffscreenCanvas + worker: Pixi 8 has explicit support for non-DOM environments via
  `DOMAdapter.set` (see `pixijs-environments` skill / `osu.Game/Skinning`-style usage).
  `WebWorkerAdapter` from `pixi.js` can be set as the DOM adapter inside a worker, and an
  `Application` can be constructed with an `OffscreenCanvas` passed via `app.init({ canvas })`.
  The renderer (WebGL or WebGPU) will run inside the worker, on a separate thread from the
  main thread.
- What breaks when running Pixi in a worker:
  - **Input events:** the worker has no DOM access. Pointer/keyboard events fire on the main
    thread. They must be forwarded to the worker via `postMessage` (the worker's Pixi
    `EventSystem` will not auto-receive them). Pixi's `EventSystem` needs the event coordinates
    in canvas-space; the main thread must transform `clientX/Y` to canvas-local and post them.
    This adds 0–1 vsync of input latency (the postMessage round-trip).
  - **Font loading:** `document.fonts` is not available in workers. Fonts must be loaded via
    `FontFace` (which IS available in workers as of recent browsers) or pre-loaded on the main
    thread and the loaded faces shared. Bitmap fonts (Pixi `BitmapFont.install`) work in
    workers because they're GPU textures, not DOM fonts.
  - **HTMLText / DOMContainer:** these require a DOM, so they do NOT work in a worker. webosu
    uses `Text` and `BitmapText` (canvas-rendered) which both work in workers.
  - **Asset loading:** `Assets.load` uses `fetch` + `Image`/`HTMLImageElement`/`HTMLVideoElement`
    on the main thread. In a worker, `Image` is not available — Pixi's asset loader falls back
    to `OffscreenCanvas` + `createImageBitmap` (which IS available in workers). Most texture
    formats work; video textures do NOT work in a worker (no `HTMLVideoElement`).
  - **WebGL context creation:** works in workers via `OffscreenCanvas.getContext("webgl")`,
    but some browser extensions (e.g. `OES_texture_float` in older versions) have flaky
    worker support. Pixi 8 handles the common cases.
  - **Canvas display:** the worker renders to the `OffscreenCanvas`, which must be
    `transferToImageBitmap()`'d and posted back to the main thread for display, OR the main
    thread creates the `OffscreenCanvas` via `htmlCanvas.transferControlToOffscreen()` and
    transfers it to the worker — in which case the worker renders directly to the visible
    canvas (preferred; no copy back).
- For webosu specifically: the game loop is heavily main-thread-coupled (input → judgement →
  score → render all in one RAF). Moving the renderer to a worker means splitting input
  handling (main) from rendering (worker), with a postMessage bridge for "draw these hit
  objects at these positions". The win is that long render frames no longer block input
  polling — but the cost is the postMessage round-trip latency (~0.5–1 ms typical) and a
  significant refactor of `playback.js`'s tight loop. For a 60 Hz osu! game where the render
  budget is already 16 ms and input-to-judgement matters more than raw FPS, the worker split
  is probably NOT worth it. Recommended for T08: keep the renderer on the main thread, use
  WebGPU preference (point 14) for throughput, and investigate OffscreenCanvas+worker only
  if profiling shows render-thread jank causing input misses.
- Verdict: **Pixi 8 can render in a worker via OffscreenCanvas (Chrome/Edge/Firefox/Safari for
  WebGL; Chrome/Edge for WebGPU), but input events, HTMLText, video textures, and some font
  loading paths break.** Feeds T08: NOT recommended for webosu's main gameplay loop due to the
  input-latency cost of the postMessage bridge; consider only for off-main-thread asset
  decoding or background rendering.

---

## Divergences found (graduates follow-up tickets)

- **D1 — Score V2 production formula missing:** `src/game/overlay/score.js:235-243` computes
  `score = round(1000000 * acc * scoreMultiplier)`, missing the `500000 * acc^5 * accProgress`
  term AND the comboProgress/bonusPortion accumulation. The pure-math mirror in
  `src/game/score-math.js` is correct but unused. Fix: wire `score.js`'s `hit()` to use the
  typed-pipe accumulation from `score-math.js` (track `currentComboPortion`,
  `maximumComboPortion`, `currentBonusPortion`, `currentAccuracyJudgementCount`,
  `maximumAccuracyJudgementCount`, then `score = round(computeTotalScore(acc, cp, ap, bp) * scoreMultiplier)`).

- **D2 — HP single-hit loss cap:** `src/game/overlay/score.js:262` clamps single-hit HP loss
  to −0.10; lazer has no such cap (a miss at HP=10 drains −0.20). Fix: remove the
  `Math.max(hpDelta, -0.1)` clamp, apply `hpDelta` directly.

- **D3 — HP last-in-combo bonus missing:** `src/game/overlay/score.js:HPincreasefor`
  (lines 193-217) never adds the +0.07/+0.05/+0.03 last-in-combo bonus. Lazer's
  `OsuHealthProcessor.GetHealthIncreaseFor` adds it when `combo.LastInCombo && result.IsHit`.
  Fix: track `LastInCombo` per hit object and a per-combo tier (Perfect/Good/None) and add the
  bonus on the last hit of each combo.

- **D4 — Circle radius formula wrong for CS≠5:** `src/game/playback.js:396` uses
  `32 * (1 - 0.7 * (CS-5)/5)`, which diverges from lazer's
  `32 * (1 - 0.7 * DifficultyRange(CS, 0, 0.5, 1))` for any CS≠5. At CS=4 webosu gives R=36.48
  vs lazer R=23.04 (58% too big). The inline comment ("matches lazer exactly") is wrong.
  Fix: `circleRadius = 32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))` (the `* 1.00041`
  fudge is sub-pixel and can be skipped).

- **D5 — `sliderStyle` is a webosu extension, not lazer:** `src/game/SliderMesh.js:48-52`
  branches on `skinConfig.sliderStyle` (1=gradient, 2=textured). `sliderStyle` is NOT in
  lazer's `SkinConfiguration.LegacySetting` or `OsuSkinConfiguration` enums; lazer's
  `LegacySliderBody` always renders a gradient body. No "fix" needed if webosu keeps it as an
  extension, but the mega-change's "lazer parity" claim for `sliderStyle` is inaccurate —
  document as a webosu-specific feature.

- **D6 — `hitCircleOverlap` shift factor wrong:** `src/game/playback.js:1662-1663` uses
  `overlap * 0.3` per side (net 0.6·overlap per pair). Lazer's `LegacySpriteText` uses
  `Spacing = -overlap` (net 1.0·overlap per pair). Fix: use `overlap * 0.5` per side, or
  rewrite to `Spacing = -overlap` semantics. Also: lazer's default `HitCircleOverlap` is −2
  (slightly widened) when unset; webosu defaults to 0.

- **D7 — `@2x` whitelist is a subset of lazer's legal set:** `src/game/skin-filter.js:30`+
  whitelists ~50 texture base names for @2x. Lazer's `AllowHighResolutionSprites => true` allows
  @2x for ANY texture it looks up. Missing from webosu's whitelist at minimum: animation frames
  (`hit0-0@2x`, `followpoint-0@2x`, `sliderb0@2x`), per-digit font @2x (`default-0@2x`,
  `score-0@2x`), `sliderpoint30@2x`/`sliderpoint10@2x`, `cursormiddle@2x`, `particle50/100/300@2x`,
  `sliderendcircle@2x`/`sliderendcircleoverlay@2x`, `sliderstartcircle@2x`/`sliderstartcircleoverlay@2x`.
  Also: beatmap skins must NOT use @2x (lazer `LegacyBeatmapSkin.AllowHighResolutionSprites => false`);
  verify webosu enforces this. Feeds T11.

- **D8 — `[Colours] ApproachCircle` is not consumed by lazer:** The ticket assumes a
  skin → beatmap → combo precedence. Lazer's `LegacyApproachCircle` uses the combo colour only;
  `CustomColours["ApproachCircle"]` is parsed by `LegacyDecoder.HandleColours` but never read by
  the osu! ruleset. Fix: do NOT implement mega task 5.12 as written; use the combo colour for
  approach circles (lazer parity). If honouring the wiki spec is desired, document it as a
  webosu extension.

- **D9 — `hit*-<n>.png` numbered variants ARE used by lazer:** `src/game/skin-loader.js:188-189`
  skips `hit{0,50,100,300}{,k}-N.png` with the comment "only need base hit0.png". Lazer's
  `LegacySkin.getJudgementAnimation` uses these frames for animated judgements via
  `GetAnimation("hit0", true, false)`. webosu's skip is a memory trade-off, not a parity match.
  Fix (if full parity wanted): load the frames and play them as `PIXI.AnimatedSprite` at
  `AnimationFramerate` (default 60 FPS, or `1000/length` if not set). If keeping the skip,
  document as a known divergence.

Confirmed points (webosu matches lazer): **1 (hit windows), 2 (slider nested judging +
TAIL_LENIENCY + head-gates-tracking), 5 (spinner RPM), 6-RADIUS-FORMULA-AS-WRITTEN-but-mismatch
— see D4, the values are wrong), 12 (RAF + input timing), 13 (AudioWorklet tighter than
Howler), 14 (WebGPU in Pixi 8.19), 15 (OffscreenCanvas + worker).** Point 6's formula is
wrong but listed under D4. Points 3, 4, 7, 8, 9, 10, 11 have divergences (D1–D3, D5–D9).

Summary: **15 points audited; 6 confirmed; 9 divergences (D1–D9).**

---

## Sources that could not be fetched

- **GitHub code search API** (`api.github.com/search/code`): requires authentication — used
  the `git/trees/master?recursive=1` API + `raw.githubusercontent.com` URLs instead. All
  needed source files were retrieved successfully via raw URLs.
- **`SliderEventGenerator.cs` location:** initially assumed under
  `osu.Game.Rulesets.Osu/Objects/`; actually at `osu.Game/Rulesets/Objects/SliderEventGenerator.cs`
  (shared, not ruleset-specific). Found via the tree API. Fetched successfully.
- **`OsuSkinConfiguration.cs` / `OsuSkinColour.cs` location:** initially guessed
  `osu.Game.Rulesets.Osu/Configuration/`; actually under
  `osu.Game.Rulesets.Osu/Skinning/`. Found via tree API. Fetched successfully.
- **Pixi 8 docs site** (`pixijs.com/8.x/guide/architecture/renderers`): 404. Fell back to the
  GitHub release notes for v8.19.0 and the MDN OffscreenCanvas article. The Pixi 8 renderer
  support matrix is documented in the v8 release notes on GitHub.
- All other sources fetched successfully.