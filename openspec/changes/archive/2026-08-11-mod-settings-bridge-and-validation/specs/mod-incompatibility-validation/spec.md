## ADDED Requirements

### Requirement: Hard Rock and Easy are mutually exclusive
The system SHALL NOT allow both `ModHardRock` and `ModEasy` to be active at the same time.

#### Scenario: Selecting Hard Rock removes Easy
- **WHEN** the active set contains Easy and Hard Rock is added
- **THEN** the active set contains Hard Rock and does not contain Easy

#### Scenario: Selecting Easy removes Hard Rock
- **WHEN** the active set contains Hard Rock and Easy is added
- **THEN** the active set contains Easy and does not contain Hard Rock

### Requirement: Double Time and Half Time are mutually exclusive
The system SHALL NOT allow both `ModDoubleTime` and `ModHalfTime` to be active at the same time.

#### Scenario: Selecting Double Time removes Half Time
- **WHEN** the active set contains Half Time and Double Time is added
- **THEN** the active set contains Double Time and does not contain Half Time

### Requirement: No Fail conflicts with Sudden Death and Perfect
The system SHALL NOT allow `ModNoFail` to be active together with `ModSuddenDeath` or `ModPerfect`.

#### Scenario: Selecting Sudden Death removes No Fail
- **WHEN** the active set contains No Fail and Sudden Death is added
- **THEN** the active set contains Sudden Death and does not contain No Fail

#### Scenario: Selecting Perfect removes No Fail
- **WHEN** the active set contains No Fail and Perfect is added
- **THEN** the active set contains Perfect and does not contain No Fail

### Requirement: Sudden Death and Perfect are mutually exclusive
The system SHALL NOT allow both `ModSuddenDeath` and `ModPerfect` to be active at the same time.

#### Scenario: Selecting Perfect removes Sudden Death
- **WHEN** the active set contains Sudden Death and Perfect is added
- **THEN** the active set contains Perfect and does not contain Sudden Death

### Requirement: Automation mods are mutually exclusive
The system SHALL NOT allow more than one of `ModAutoplay`, `ModRelax`, or `ModAutoPilot` to be active at the same time.

#### Scenario: Selecting Autoplay removes Relax and AutoPilot
- **WHEN** the active set contains Relax and AutoPilot and Autoplay is added
- **THEN** the active set contains Autoplay and does not contain Relax or AutoPilot

#### Scenario: Selecting Relax removes Autoplay and AutoPilot
- **WHEN** the active set contains Autoplay and AutoPilot and Relax is added
- **THEN** the active set contains Relax and does not contain Autoplay or AutoPilot

### Requirement: Incompatibility is surfaced in the mod selection UI
The system SHALL reflect incompatibility rules in `ModSelectPanel.vue` by preventing the user from selecting a mod that conflicts with an already-selected mod.

#### Scenario: Easy is disabled when Hard Rock is selected
- **WHEN** Hard Rock is active in the mod panel
- **THEN** the Easy badge is visually disabled and clicking it does not add it to the active set

#### Scenario: Clicking a conflicting mod removes the previously selected one
- **WHEN** Double Time is active in the mod panel and the user clicks Half Time
- **THEN** Double Time is removed and Half Time becomes active
