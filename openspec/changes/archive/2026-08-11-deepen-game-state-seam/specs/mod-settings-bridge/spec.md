## MODIFIED Requirements

### Requirement: Flashlight settings propagate to the active mod
The system SHALL pass the user-configured Flashlight size settings from `gamesettings` into the active `ModFlashlight` instance via `GameState` so the Flashlight overlay uses the configured radius curve.

#### Scenario: Default Flashlight sizes are used when no settings exist
- **WHEN** the user activates Flashlight without changing any settings
- **THEN** the active `ModFlashlight` instance has `sizeCombo0` = 400, `sizeCombo100` = 300, `sizeCombo200` = 250

#### Scenario: Custom Flashlight sizes are honored
- **WHEN** `gamesettings.flSize0` = 500 and `gamesettings.flSize200` = 200
- **THEN** the active `ModFlashlight` instance has `sizeCombo0` = 500, `sizeCombo100` = 350 (interpolated midpoint), `sizeCombo200` = 200

### Requirement: Adaptive Speed settings propagate to the active mod
The system SHALL pass the user-configured Adaptive Speed `maxRate` from `gamesettings` into the active `ModAdaptiveSpeed` instance via `GameState`.

#### Scenario: Default Adaptive Speed max rate is used when no setting exists
- **WHEN** the user activates Adaptive Speed without changing any settings
- **THEN** the active `ModAdaptiveSpeed` instance has `maxRate` = 1.05

#### Scenario: Custom Adaptive Speed max rate is honored
- **WHEN** `gamesettings.asMaxRate` = 1.15
- **THEN** the active `ModAdaptiveSpeed` instance has `maxRate` = 1.15

### Requirement: Transform settings propagate to the active mod
The system SHALL pass the user-configured Transform rotation from `gamesettings` into the active `ModTransform` instance via `GameState`.

#### Scenario: Default Transform rotation is used when no setting exists
- **WHEN** the user activates Transform without changing any settings
- **THEN** the active `ModTransform` instance has `rotate` = 0

#### Scenario: Custom Transform rotation is honored
- **WHEN** `gamesettings.tfRotate` = 90
- **THEN** the active `ModTransform` instance has `rotate` = 90

### Requirement: Target Practice settings propagate to the active mod
The system SHALL pass the user-configured Target Practice target size from `gamesettings` into the active `ModTargetPractice` instance via `GameState`.

#### Scenario: Default Target Practice size is used when no setting exists
- **WHEN** the user activates Target Practice without changing any settings
- **THEN** the active `ModTargetPractice` instance has `targetSize` = 1.0

#### Scenario: Custom Target Practice size is honored
- **WHEN** `gamesettings.tpSize` = 1.5
- **THEN** the active `ModTargetPractice` instance has `targetSize` = 1.5

### Requirement: Difficulty Adjust settings continue to propagate
The system SHALL preserve the existing Difficulty Adjust bridge so that `gamesettings.customAR`, `customCS`, `customOD`, and `customHP` still reach the active `ModDifficultyAdjust` instance via `GameState`.

#### Scenario: Difficulty Adjust overrides are preserved
- **WHEN** `gamesettings.difficultyAdjust` is true and `customAR` = 10, `customCS` = 2, `customOD` = 8, `customHP` = 5
- **THEN** the active `ModDifficultyAdjust` instance has `settings.ar` = 10, `settings.cs` = 2, `settings.od` = 8, `settings.hp` = 5

## ADDED Requirements

### Requirement: Mod toggles are routed through GameState
The system SHALL ensure that the mod-selection UI toggles mods by calling `GameState.set("mods.<acronym>", bool)` rather than directly mutating `gamesettings` or `window.game`.

#### Scenario: Enabling Hidden through GameState
- **WHEN** the user clicks the Hidden mod badge in `ModSelectPanel.vue`
- **THEN** `GameState.set("mods.hidden", true)` is invoked, `ModRegistry` activates Hidden, and `window.game.hidden` becomes `true`

#### Scenario: Disabling a mod through GameState
- **WHEN** the user clicks an already-active mod badge in `ModSelectPanel.vue`
- **THEN** `GameState.set("mods.<acronym>", false)` is invoked, `ModRegistry` updates, and the corresponding `window.game` flag becomes `false`
