## ADDED Requirements

### Requirement: Target Practice scoring
The Target Practice (TP) mod SHALL replace standard scoring with accuracy-based scoring where hit objects appear at specific times and the score is based on hit accuracy (distance from center), per the lazer `TargetPracticeMaxScore` and `TargetPracticeAccuracyRange`. The target size SHALL be configurable via the mod customization dialog.

#### Scenario: Score based on accuracy
- **WHEN** TP is active and the player hits a circle
- **THEN** the score is based on the distance from the circle center (closer = more score), not the standard Great/Good/Meh judgement

#### Scenario: Target size customizable
- **WHEN** TP is active and the user opens the TP customization dialog
- **THEN** a target size slider is available, changing the hit-acceptance radius

### Requirement: Target Practice hit object timing
The mod SHALL override the beatmap's approach rate so hit objects appear at a fixed rate determined by the `TargetPracticeSpawnRate`, per the lazer behavior.

#### Scenario: Objects spawn at fixed rate
- **WHEN** TP is active
- **THEN** hit objects appear at the `TargetPracticeSpawnRate` interval regardless of the beatmap's AR