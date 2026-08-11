## ADDED Requirements

### Requirement: GameState provides path-based read access to game state
The system SHALL expose a `GameState.get(path)` method that returns the current value at a dot-separated namespace path.

#### Scenario: Read a display setting
- **WHEN** `GameState.get("display.cursorSize")` is called
- **THEN** it returns the current cursor size value

#### Scenario: Read a top-level legacy key
- **WHEN** `GameState.get("masterVolume")` is called with no namespace
- **THEN** it returns the value stored in `window.game.masterVolume`

### Requirement: GameState provides path-based write access to game state
The system SHALL expose a `GameState.set(path, value)` method that synchronously updates both the internal GameState store and the legacy `window.game` object.

#### Scenario: Update a display setting
- **WHEN** `GameState.set("display.backgroundDimRate", 0.5)` is called
- **THEN** both `window.game.backgroundDimRate` and the internal state become `0.5`

#### Scenario: Update an audio setting
- **WHEN** `GameState.set("audio.masterVolume", 0.8)` is called
- **THEN** `window.game.masterVolume` becomes `0.8`

### Requirement: GameState supports batched writes
The system SHALL expose a `GameState.setBatch(updates)` method that applies multiple path/value pairs atomically and notifies subscribers once.

#### Scenario: Apply multiple settings at once
- **WHEN** `GameState.setBatch({ "display.cursorSize": 1.2, "audio.effectVolume": 0.9 })` is called
- **THEN** both `window.game.cursorSize` and `window.game.effectVolume` update synchronously

### Requirement: GameState notifies subscribers of changes
The system SHALL expose a `GameState.subscribe(path, callback)` method that invokes `callback(newValue, oldValue)` when the value at `path` changes.

#### Scenario: UI reacts to a setting change
- **WHEN** a subscriber is registered for `"display.backgroundDimRate"` and `GameState.set("display.backgroundDimRate", 0.3)` is called
- **THEN** the callback receives `0.3` and the previous value

#### Scenario: Subscribers are not called for unchanged values
- **WHEN** `GameState.set("display.cursorSize", 1.0)` is called with the same value already stored
- **THEN** existing subscribers for `"display.cursorSize"` are not invoked

### Requirement: GameState keeps legacy window.game in sync
The system SHALL provide a `GameState.syncLegacy()` method that writes all current GameState values back to `window.game` so legacy callers see consistent data.

#### Scenario: Engine reads legacy flags after settings load
- **WHEN** `gamesettings.loadToGame()` populates GameState and then calls `GameState.syncLegacy()`
- **THEN** `window.game.hidden`, `window.game.masterVolume`, and other legacy keys match the GameState values

### Requirement: Mod state is canonical through ModRegistry
The system SHALL route mod writes through `window.ModRegistry` so that `GameState.set("mods.flashlight", true)` activates the Flashlight mod in the registry and derives flat flags.

#### Scenario: Activate a mod via GameState
- **WHEN** `GameState.set("mods.flashlight", true)` is called and `ModRegistry` is available
- **THEN** `ModRegistry.getActive()` includes Flashlight and `window.game.flashlight` is `true`

#### Scenario: Deactivate a mod via GameState
- **WHEN** `GameState.set("mods.hidden", false)` is called while Hidden is active
- **THEN** `ModRegistry.getActive()` does not include Hidden and `window.game.hidden` is `false`

### Requirement: GameState initializes from existing window.game defaults
The system SHALL create GameState from the default `window.game` object built by `src/game/initgame.js` so that legacy defaults remain intact.

#### Scenario: Default state after initgame
- **WHEN** `initgame.js` creates `window.game` and then initializes GameState
- **THEN** `GameState.get("display.backgroundDimRate")` returns `0.7`

### Requirement: GameState is safe to use before the game engine loads
The system SHALL allow `src/shell/gamesettings.js` and Vue components to import GameState without requiring `window.game` or `window.ModRegistry` to exist.

#### Scenario: Import GameState in settings page
- **WHEN** `src/shell/gamesettings.js` imports GameState at module load time
- **THEN** no runtime error occurs if `window.game` has not been created yet
