## Why

The new lazer-style mod system (`src/game/mods/`) is designed and registered, but it is only partially wired into gameplay. Mod settings changed in the `ModSelectPanel` UI are silently ignored for Flashlight, Adaptive Speed, Transform, and Target Practice, and mutually exclusive mod combinations (e.g. Hard Rock + Easy, Double Time + Half Time) can be selected together, producing undefined behavior. This change finishes the bridge between the UI, `gamesettings`, and `ModRegistry` and adds lazer-compatible incompatibility rules so users get predictable, correct mod behavior.

## What Changes

- Map mod-specific settings from `gamesettings` keys (`flSize0`, `flSize200`, `asMaxRate`, `tfRotate`, `tpSize`) into the `ModRegistry` mod instances when `gamesettings.loadToGame()` builds the active mod set.
- Add an incompatibility matrix and validation step to `ModRegistry.setActive()` that removes conflicting mods (e.g. HR↔EZ, DT↔HT, NF↔SD/PF, AT↔RX↔AP) and reports what was removed.
- Surface the same validation in `ModSelectPanel.vue` so the UI disables or auto-unchecks incompatible mods.
- Add headless Playwright tests that verify:
  - Flashlight size settings change the overlay radius.
  - Adaptive Speed `maxRate` setting is honored.
  - Selecting HR disables EZ and vice versa.
  - Incompatible combos are pruned from the active mod set.
- **BREAKING**: `gamesettings.loadToGame()` will stop pushing bare-string mod specs for FL, AS, TF, and TP; it will push `{ acronym, settings }` objects instead. Any code that assumes all active mods are strings may need adjustment.

## Capabilities

### New Capabilities
- `mod-settings-bridge`: Pass per-mod customization settings from the UI/settings storage into the active `Mod` instances so gameplay systems read the user-configured values.
- `mod-incompatibility-validation`: Enforce lazer-style mutual exclusion rules for mods in `ModRegistry` and reflect them in the mod-selection UI.

### Modified Capabilities
None. The core mod class API and registry API do not change their existing behavior; only new capabilities are added on top.

## Impact

- `src/shell/gamesettings.js` — `loadToGame()` mod-building block.
- `src/game/mods/index.js` — `ModRegistry` validation helpers and `setActive()` behavior.
- `src/game/mods/base.js` — optional `incompatibleWith()` hook on the base `Mod` class.
- `src/vue/components/ModSelectPanel.vue` — UI disable/uncheck logic for incompatible mods.
- `scripts/headless-*.js` — new or updated headless tests.
- No backend/API changes; score submission already sends `mods_list` and the backend already validates known mods.
