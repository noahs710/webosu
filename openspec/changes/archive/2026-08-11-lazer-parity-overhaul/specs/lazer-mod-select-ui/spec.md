## ADDED Requirements

### Requirement: Mod-select panel layout
The system SHALL provide a lazer-style mod-select panel as a Vue 3 component (`<ModSelectPanel>`) displaying mod badges in a horizontal grid grouped by type: Difficulty Increase (HR, DT, NC, FL, etc.), Difficulty Reduction (EZ, NF, etc.), Automation (Relax, AutoPilot, Autoplay, Spun Out), Conversion (Target Practice, Classic, Difficulty Adjust), and Fun (Magnetised, Wobble, etc.). Each badge SHALL show the mod icon, acronym, and a tooltip with the mod name + description. Clicking a badge toggles the mod active.

#### Scenario: Mods grouped by type
- **WHEN** the mod-select panel is open
- **THEN** mods are displayed in groups by their `Mod.type` field, with each group labeled

#### Scenario: Toggle a mod
- **WHEN** the user clicks a mod badge
- **THEN** the mod is added to or removed from the active mod set, and the score multiplier display updates

### Requirement: Mod customization dialogs
Mods with settings (Difficulty Adjust, Flashlight, Nightcore, Target Practice) SHALL show a gear icon on their badge when active. Clicking the gear SHALL open a customization dialog with sliders/inputs for that mod's settings (DA: CS/AR/OD/HP sliders; FL: size + decay sliders; NC: pitch + speed sliders; TP: target size).

#### Scenario: Difficulty Adjust customization
- **WHEN** the user activates Difficulty Adjust and clicks its gear icon
- **THEN** a dialog opens with CS, AR, OD, HP sliders that override the beatmap's base values

#### Scenario: Nightcore customization
- **WHEN** the user activates Nightcore and clicks its gear icon
- **THEN** a dialog opens with pitch and speed sliders

### Requirement: Deselect and reset flows
The panel SHALL provide a "Deselect All" button that clears the active mod set and a "Reset to Default" button that restores the default mod configuration. The panel SHALL persist the active mod set to `gamesettings` on change.

#### Scenario: Deselect all mods
- **WHEN** the user clicks "Deselect All"
- **THEN** all active mods are removed and the score multiplier resets to 1.0

#### Scenario: Mods persist across sessions
- **WHEN** the user selects mods and reloads the page
- **THEN** the same mods are active on reload via `gamesettings` persistence

### Requirement: In-game pause menu mod panel
The mod-select panel SHALL be available in the in-game pause menu as an HTML overlay on top of the Pixi canvas (not inside the Pixi scene), consistent with the existing `#pause-menu` HTML overlay pattern.

#### Scenario: Open mod panel from pause
- **WHEN** the game is paused and the user clicks "Mods" in the pause menu
- **THEN** the `<ModSelectPanel>` opens as an HTML overlay above the canvas