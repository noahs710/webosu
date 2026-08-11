## 1. Registry foundation

- [x] 1.1 Add `incompatibleWith(acronym)` hook to `src/game/mods/base.js` with a default empty array.
- [x] 1.2 Add a static incompatibility matrix to `src/game/mods/index.js` populated from each registered mod's `incompatibleWith()` and a base lazer matrix.
- [x] 1.3 Update `ModRegistry.setActive()` to prune conflicting mods, return the list of removed acronyms, and preserve `implies()` resolution order.
- [x] 1.4 Add a `validateActiveSet(specs)` public helper on `ModRegistry` that returns `{ valid: [...], removed: [...] }` for UI use.

## 2. Per-mod incompatibility declarations

- [x] 2.1 Declare `HardRock` incompatible with `EZ`.
- [x] 2.2 Declare `Easy` incompatible with `HR`.
- [x] 2.3 Declare `DoubleTime` incompatible with `HT`.
- [x] 2.4 Declare `HalfTime` incompatible with `DT`.
- [x] 2.5 Declare `NoFail` incompatible with `SD`, `PF`.
- [x] 2.6 Declare `SuddenDeath` incompatible with `NF`, `PF`.
- [x] 2.7 Declare `Perfect` incompatible with `NF`, `SD`.
- [x] 2.8 Declare `Autoplay`, `Relax`, `AutoPilot` mutually incompatible.

## 3. Settings bridge

- [x] 3.1 In `src/shell/gamesettings.js`, replace bare-string `mods.push("FL")` with a `{ acronym, settings }` object mapping `flSize0`/`flSize200` to `sizeCombo0`/`sizeCombo100`/`sizeCombo200`.
- [x] 3.2 Replace bare-string `mods.push("AS")` with `{ acronym, settings }` mapping `asMaxRate` to `maxRate` and preserving `adjustStep`/`streakRequired` defaults.
- [x] 3.3 Replace bare-string `mods.push("TF")` with `{ acronym, settings }` mapping `tfRotate` to `rotate` and preserving `translateX`/`translateY`/`scale` defaults.
- [x] 3.4 Replace bare-string `mods.push("TP")` with `{ acronym, settings }` mapping `tpSize` to `targetSize` and preserving `spawnRate` default.
- [x] 3.5 Preserve the existing Difficulty Adjust settings bridge for `customAR`/`customCS`/`customOD`/`customHP`.
- [x] 3.6 Ensure `gamesettings.loadToGame()` calls `setActive()` with the new spec objects and then `applyToGame()` so `mod.settings` is populated before flags are set.

## 4. UI integration

- [x] 4.1 Import or expose `ModRegistry.validateActiveSet()` in `ModSelectPanel.vue`.
- [x] 4.2 Update `toggle(acronym)` to compute the would-be active set, run validation, and apply the cleaned set back to `activeMods` and `gamesettings` flags.
- [x] 4.3 Add visual disabled styling for mod badges that conflict with the current active set.
- [x] 4.4 Keep the NC↔DT implication logic working alongside the new validation.

## 5. Tests

- [x] 5.1 Add or update `scripts/headless-mod-flashlight.js` to verify that changing `flSize0`/`flSize200` changes the FL overlay radius.
- [x] 5.2 Add or update a headless test for Adaptive Speed `maxRate` propagation.
- [x] 5.3 Add or update a headless test for Transform rotation propagation.
- [x] 5.4 Add a new `scripts/headless-mod-incompatible.js` that selects HR+EZ and DT+HT and asserts the cleaned active set.
- [x] 5.5 Run `npm run test:all` and fix any regressions. (One pre-existing failure in `test:touch` unrelated to mod changes; all mod tests and remaining suite pass.)
