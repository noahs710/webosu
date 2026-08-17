# score-v2-combo-portion Specification

## Purpose
Implement the real lazer `ScoreProcessor.ComputeTotalScore` formula (verified against `ppy/osu` master): total score = `500000 · accuracy · comboProgress + 500000 · accuracy^5 · accuracyProgress + bonusPortion`, with combo portion accumulated as `Σ base(MaxResult) · comboAfterJudgement^0.5` (exponent **0.5**, not 2.5). Also fix two related scoring bugs introduced by the port: the −0.10 single-hit HP loss cap (not in lazer) and apply `LAZER_LAST_COMBO_BONUS` correctly.

## ADDED Requirements

### Requirement: Score computed by lazer ComputeTotalScore
The final score SHALL be computed as:
- `accuracy = currentBaseScore / maxBaseScore` (0 when no judgements yet)
- `comboProgress = currentComboPortion / maximumComboPortion` (1 when maxComboPortion is 0)
- `accuracyProgress = currentAccuracyJudgementCount / maximumAccuracyJudgementCount` (1 when no judgements yet)
- `TotalScoreWithoutMods = round(500000·accuracy·comboProgress + 500000·accuracy^5·accuracyProgress + bonusPortion)`
- `TotalScore = round(TotalScoreWithoutMods · scoreMultiplier)`

Combo portion accumulates per judgement as `baseScoreOf(result.MaxResult) · comboAfterJudgement^0.5` (`COMBO_EXPONENT = 0.5`).

#### Scenario: Perfect play reaches 1,000,000 plus bonus
- **WHEN** a play has accuracy=1, comboProgress=1, accuracyProgress=1, bonusPortion=0
- **THEN** TotalScoreWithoutMods = round(500000·1·1 + 500000·1·1 + 0) = 1,000,000

#### Scenario: Combo exponent is 0.5
- **WHEN** a judgement is applied at comboAfterJudgement = 100 with a MaxResult base score of 300
- **THEN** the combo portion increments by 300 · 100^0.5 = 3000

#### Scenario: Accuracy exponent is 5 in the second term
- **WHEN** accuracy is 0.9 and all else is perfect
- **THEN** the second term is 500000 · 0.9^5 ≈ 295,245 (not 500000 · 0.9)

### Requirement: Accuracy portion uses base-score ratio
The accuracy portion (`500000 · accuracy · ...`) SHALL use `currentBaseScore / maxBaseScore` where base scores are: Great=300, Ok=100, Meh=50, Miss=0, SmallTickHit=10, LargeTickHit=30, SliderTailHit=150, all misses=0. `SliderTailHit` (150) SHALL be counted in max accuracy.

#### Scenario: SliderTailHit counts as 150/150 in accuracy
- **WHEN** a slider tail is hit
- **THEN** accuracy max increases by 150 and current increases by 150

### Requirement: Remove single-hit HP loss cap
The −0.10 cap on a single hit's HP loss (`score.js:313`, `Math.max(hpDelta, -0.1)`) SHALL be removed. Lazer applies the full HP delta for any miss result.

#### Scenario: Miss at HP 10 applies full −0.20
- **WHEN** a player misses an object on a map with HP Difficulty 10
- **THEN** HP drops by `lazerHpTables.Miss.HP10` (approximately −0.20), not capped at −0.10

### Requirement: Apply last-combo HP bonus
The `LAZER_LAST_COMBO_BONUS` table SHALL be applied to the last object of a combo only when that object is hit (`LastInCombo && IsHit()` per `OsuHealthProcessor.cs`). The bonus tier tracks the worst result within the combo: `Perfect` (+0.07) if all results were Great, `Good` (+0.05) if any LargeTickMiss/Ok or a missed tail, `None` (+0.03) otherwise. A missed slider tail downgrades the combo tier to `Good`.

#### Scenario: Last great in an all-Great combo grants +0.07
- **WHEN** the last object of a combo is hit and every result in the combo was Great
- **THEN** HP increases by the normal delta PLUS 0.07

#### Scenario: Missed tail downgrades tier to Good
- **WHEN** a slider tail is missed (IgnoreMiss) mid-combo but the combo was otherwise all Great
- **THEN** the next hit object's last-combo bonus is +0.05 (Good tier), not +0.07

### Requirement: Spinner bonus grants LargeBonus per bonus tick
Spinner bonus ticks (`SpinnerBonusTick`, MaxResult = `LargeBonus`, base 50) SHALL be granted for each full spin past `SpinsRequiredForBonus = SpinsRequired + 2`, capped at `MaximumBonusSpins`. Normal in-progress ticks emit `SmallBonus` (base 10). Each bonus tick adds 50 to score (before mod multiplier), not 1000.

#### Scenario: Bonus spin past required+2 grants 50
- **WHEN** a spinner completes its required spins and the player completes one more full spin (past the +2 gap)
- **THEN** a LargeBonus (base 50) is added to score, capped at MaximumBonusSpins

### Requirement: Score persistence tagged with ruleset version
Saved scores SHALL include a `rulesetVersion` field set with the current ruleset version (e.g., "lazer-v1") so that historical scores under the old rules are not ranked alongside new ones.

#### Scenario: Score saved with ruleset tag
- **WHEN** a play completes and the score is persisted
- **THEN** the saved record includes `rulesetVersion`

#### Scenario: Leaderboard filters by ruleset version
- **WHEN** the leaderboard is displayed
- **THEN** it shows only scores matching the current `rulesetVersion` or explicitly merges with annotation
