# slider-per-part-judging Specification

## Purpose
Implement osu!lazer's per-part slider judgement model, where each component of a slider (head, ticks, repeats, tail) is judged as an independent hit result that contributes to the final slider judgement, score, accuracy, HP, and combo. This replaces the legacy single-object completion-ratio model (≥1 touched part → ≥50 default judgement).

## ADDED Requirements

### Requirement: Head judgement as independent result
The slider head circle SHALL be judged as an independent hit result using the standard circle judgement logic (300/100/50/miss based on timing within `lazerHitWindows(OD)` of the slider start time).

#### Scenario: Head hit within Great window
- **WHEN** a slider head is hit within `GreatTime` of its start time
- **THEN** the head is recorded as HitResult.Great and contributes 300 to score and accuracy

#### Scenario: Head hit within Ok window
- **WHEN** a slider head is hit within `OkTime` (but not `GreatTime`)
- **THEN** the head is recorded as HitResult.Ok and contributes 100

#### Scenario: Head missed
- **WHEN** the slider head time passes `MehTime` without a click
- **THEN** the head is recorded as HitResult.Miss and combo resets

### Requirement: Tick judgement as independent results
Each slider tick SHALL be judged as an independent hit result with lazer's rule from `SliderInputManager.TryJudgeNestedObject`: a `DrawableSliderTick` is hit (`HitForcefully`) when the cursor is Tracking AND `timeOffset >= 0`, else missed (`MissForcefully`). Hit result is `LargeTickHit` (NOT `SmallTickHit`); miss result is `LargeTickMiss`.

#### Scenario: Tick hit when tracking at tick time
- **WHEN** the cursor is Tracking the slider and the tick time is reached (timeOffset >= 0)
- **THEN** the tick is recorded as HitResult.LargeTickHit and contributes its base score

#### Scenario: Tick miss when not tracking or before tick time
- **WHEN** the cursor is not Tracking OR timeOffset < 0 at tick time
- **THEN** the tick is recorded as HitResult.LargeTickMiss, counts against accuracy, and applies LargeTickMiss HP delta

### Requirement: Repeat judgement as independent results
Each slider reverse (repeat) point SHALL be judged as an independent hit result by Tracking state at repeat time. Hit result is `LargeTickHit`; miss result is `LargeTickMiss` (via `SliderEndJudgement.MaxResult = LargeTickHit`, `MinResult = LargeTickMiss`).

#### Scenario: Repeat hit when tracking
- **WHEN** the slider ball reaches a reverse arrow and the cursor is Tracking
- **THEN** the repeat is recorded as HitResult.LargeTickHit

#### Scenario: Repeat miss when not tracking
- **WHEN** the slider ball crosses a reverse arrow and the cursor is not Tracking
- **THEN** the repeat is recorded as HitResult.LargeTickMiss, counts against accuracy, applies LargeTickMiss HP, and breaks combo

### Requirement: Tail judgement as independent result
The slider tail SHALL be judged by lazer's `SliderTailCircle` rule: a `TailJudgement` with `MaxResult = HitResult.SliderTailHit` and `MinResult = HitResult.IgnoreMiss`. The tail is judged on Tracking state at `EndTime` — NOT by an OD-scaled timing window. There is a fixed `TAIL_LENIENCY` grace (not OD-based). A tail hit produces `SliderTailHit` (base score 150); a tail miss produces `IgnoreMiss` (does NOT break combo, does NOT apply miss HP — it is an ignorable miss).

#### Scenario: Tail hit when tracking at end
- **WHEN** `EndTime` is reached and the cursor is Tracking
- **THEN** the tail is recorded as HitResult.SliderTailHit, contributes base 150 to max accuracy, 150 if hit

#### Scenario: Tail miss when not tracking at end
- **WHEN** `EndTime` is reached and the cursor is not Tracking
- **THEN** the tail is recorded as HitResult.IgnoreMiss, which does NOT break combo and does NOT apply a miss HP delta (it is an ignorable miss in lazer)

#### Scenario: Tail miss does not break combo
- **WHEN** a slider tail is missed
- **THEN** the player's combo is NOT reset (IgnoreMiss is not combo-breaking in lazer)

### Requirement: Slider's own judgement is binary hit-indicator
In non-Classic mode the slider's OWN judgement SHALL be binary per lazer's `DrawableSlider.CheckForResult`: if ANY nested hit object was hit (`nestedHitObjects.Any(h => h.Result.IsHit)`), the slider displays its `MaxResult` (Great); otherwise it displays `MinResult` (Miss). The slider's own judgement is an `OsuIgnoreJudgement` and SHALL contribute NOTHING to score or accuracy — only head/ticks/repeats/tail contribute. Legacy `defaultScore = 50` fallback SHALL be removed.

#### Scenario: Any part hit → slider displays Great
- **WHEN** at least one nested object (head/tick/repeat/tail) was hit
- **THEN** the slider's displayed judgement is its MaxResult (Great), contributing 0 to score/accuracy

#### Scenario: Nothing hit → slider displays Miss
- **WHEN** no nested object was hit
- **THEN** the slider's displayed judgement is Miss (MinResult)

#### Scenario: Slider judgement not in accuracy
- **WHEN** a slider completes
- **THEN** the slider's own result does NOT change the accuracy numerator or denominator (only the nested parts do)

### Requirement: Slider parts judge as time passes, not at end + miss window
Nested parts SHALL judge as the slider plays — ticks/repeats judge at their times, the tail judges at `EndTime`. There SHALL be NO additional per-slider 400 ms "end-of-life miss window" for the parts themselves; the head circle SHALL use the standard MehTime miss window like any circle.

#### Scenario: Head circle uses circle miss window
- **WHEN** the slider head passes `startTime + MehTime` without a click
- **THEN** the head is judged Miss (same as a normal circle)

#### Scenario: Tail judges exactly at end time
- **WHEN** `time >= EndTime` (within tail leniency) and Tracking is known
- **THEN** the tail is judged immediately, not deferred to `endTime + 400`

### Requirement: Per-part HP deltas applied
Each part judgement SHALL apply the HP delta from `lazerHpTables.js` immediately upon judgement — not deferred to the final slider judgement. Ticks and repeats use `LargeTickHit`/`LargeTickMiss` deltas; the tail uses the appropriate SliderTailHPdelta on hit and no HP penalty on miss (IgnoreMiss).

#### Scenario: Tick miss applies HP on tick time
- **WHEN** a tick is missed (LargeTickMiss)
- **THEN** HP drops by the LargeTickMiss delta at tick time (not at slider end)

#### Scenario: Tail miss applies no HP penalty
- **WHEN** the tail is missed (IgnoreMiss)
- **THEN** no miss HP delta is applied

#### Scenario: Last-combo bonus granted on final hit of combo
- **WHEN** the last hit of a combo is judged (and is a hit)
- **THEN** `LAZER_LAST_COMBO_BONUS` (+0.07/+0.05/+0.03 by combo tier) is applied to HP

## Out of scope
- Legacy stable osu! slider judgement (single-completion-ratio model) is removed, not kept as a mode.
