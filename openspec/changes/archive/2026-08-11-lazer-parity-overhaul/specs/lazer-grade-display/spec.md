## ADDED Requirements

### Requirement: Silver SS and S grades for HD/FL Full Combo
The grade calculation SHALL distinguish silver SS (SSH) and silver S (SH) from the gold SS/S: a Full Combo (no misses) with Hidden or Flashlight active SHALL yield SSH (if accuracy = 100%) or SH (if accuracy ≥ 95%), instead of the plain gold SS/S. The results screen grade display SHALL render the silver variant (silver border/color) for SSH/SH.

#### Scenario: Silver SS with Hidden full combo
- **WHEN** the player achieves 100% accuracy with no misses and the Hidden mod active
- **THEN** the grade is SSH (silver SS), displayed with a silver border

#### Scenario: Silver S with Flashlight high accuracy
- **WHEN** the player achieves ≥95% accuracy with no misses and the Flashlight mod active
- **THEN** the grade is SH (silver S), displayed with a silver border

#### Scenario: Plain SS without HD/FL
- **WHEN** the player achieves 100% accuracy with no misses and neither HD nor FL active
- **THEN** the grade is SS (gold), not SSH

### Requirement: ModRegistry-driven mod text and enum
The `modstext` and `modsEnum` functions (`score.js:438-470`) SHALL derive the mod display text and the leaderboard/PP mod identifier from the `ModRegistry` active set, not the hardcoded 12-mod list. New mods (FL, RX, AP, TP, AS, and the 11 fun mods) SHALL appear in the results screen mod list and be passed to the PP/leaderboard backend.

#### Scenario: New mods appear in results
- **WHEN** a score is submitted with Flashlight and Wobble active
- **THEN** the results screen shows "FL+WO" in the mods row, and the PP payload includes both mods

#### Scenario: Mod enum covers all mods
- **WHEN** `modsEnum` is called with any combination of active mods
- **THEN** the returned identifier includes all active mods (via the ModRegistry), not just the original 12

### Requirement: Auto-calibrate offset thresholds align with lazer
The auto-calibrate audio offset logic (`score.js:522-544`) SHALL use lazer's bounds for when to nudge the offset (the current ±5 to ±50ms window), aligning with lazer's auto-calibrate behavior.

#### Scenario: Auto-calibrate uses lazer thresholds
- **WHEN** the average hit error is within lazer's auto-calibrate bounds
- **THEN** the offset is nudged by the lazer proportion, not the current 30% heuristic