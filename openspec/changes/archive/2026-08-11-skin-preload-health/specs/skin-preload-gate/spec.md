## ADDED Requirements

### Requirement: Beatmap launch gated on skin + hitsound readiness
The system SHALL gate beatmap download/launch on `window.skinReady && window.soundReady`. If the user clicks a difficulty while skin or hitsounds are still loading, the system SHALL show a loading state ("Loading skin...") and wait for readiness before dispatching the `beatmap-launch` event.

#### Scenario: Launch waits for skin
- **WHEN** the user clicks a difficulty and `window.skinReady` is false
- **THEN** the button shows "Loading skin..." and the launch is deferred until skinReady becomes true

#### Scenario: Launch proceeds when ready
- **WHEN** the user clicks a difficulty and both `skinReady` and `soundReady` are true
- **THEN** the launch proceeds immediately

### Requirement: Skin texture validation
After loading a skin (from cache or import), the system SHALL validate that the 8 core gameplay textures exist and are valid: `hitcircleoverlay.png`, `hitcircle.png`, `approachcircle.png`, `cursor.png`, `hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`. If any are missing or corrupt, the system SHALL dispatch a health-check event.

#### Scenario: Corrupted skin detected
- **WHEN** a skin is loaded and `hitcircleoverlay.png` is missing or corrupt
- **THEN** a health-check event is dispatched with the missing/corrupt texture names

#### Scenario: Valid skin passes
- **WHEN** a skin is loaded and all 8 core textures are valid
- **THEN** no health-check event is dispatched and gameplay proceeds normally

### Requirement: Hitsound validation
After loading hitsounds, the system SHALL validate that the 15 core hitsound files loaded (normal/soft/drum × hitnormal/hitwhistle/hitfinish/hitclap + slidertick). The new `sliderslide`/`spinnerspin` sounds are optional (warn if missing, don't block). If a required hitsound is missing, the system SHALL dispatch a health-check event.

#### Scenario: Missing hitsound detected
- **WHEN** hitsounds load and `normal-hitnormal` is missing
- **THEN** a health-check event is dispatched for the missing hitsound

#### Scenario: Optional sounds don't block
- **WHEN** hitsounds load and `normal-sliderslide` is missing (the file doesn't exist yet)
- **THEN** no health-check event is dispatched (optional sound)

### Requirement: Health-check popup
The system SHALL display a health-check popup (modal) when a skin or hitsound validation issue is detected. The popup SHALL show: the issue name, a plain-language explanation, and action buttons ("Repair" / "Reset to default" / "Dismiss"). "Repair" re-imports the skin; "Reset to default" clears the cache and reloads; "Dismiss" continues with fallbacks.

#### Scenario: Corrupted skin popup
- **WHEN** a corrupted skin is detected
- **THEN** a popup shows "Corrupted skin" with the missing textures and buttons to Repair / Reset / Dismiss

#### Scenario: User dismisses the popup
- **WHEN** the user clicks "Dismiss" on the health-check popup
- **THEN** the popup closes and gameplay proceeds with WHITE-fallback textures

### Requirement: No auto-switch on skin import
When a user imports a .osk file, the system SHALL NOT automatically apply the skin. The imported skin SHALL be added to the local vault only. The user must click "Apply" to switch to the imported skin.

#### Scenario: Import without auto-switch
- **WHEN** the user imports a .osk file
- **THEN** the skin is added to the local vault but the active skin is unchanged

### Requirement: Sequential upload queue
When multiple .osk files are imported, the system SHALL process them sequentially (one at a time) via a queue. Each file SHALL show its import progress. The queue SHALL yield to the UI thread between files (via `setTimeout(0)`) to prevent freezing on low-end devices.

#### Scenario: Multiple files queued
- **WHEN** the user selects 3 .osk files to import
- **THEN** they are processed one at a time, with progress shown per file, and the UI remains responsive

#### Scenario: Queue yields between files
- **WHEN** file 1 finishes importing
- **THEN** a `setTimeout(0)` yield occurs before file 2 starts, keeping the UI responsive