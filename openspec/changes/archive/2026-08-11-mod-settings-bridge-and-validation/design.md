## Context

webosu! has a new lazer-style mod system under `src/game/mods/` with a central `ModRegistry`. The registry defines four lifecycle hooks (`applyToDifficulty`, `applyToTrack`, `applyToGame`, `applyToAudio`) and already tracks score multipliers, unranked status, and mod serialization. However, only `applyToGame` is currently used; core difficulty and audio rate logic still lives in `playback.js` driven by legacy flat flags on `window.game`.

The `ModSelectPanel.vue` UI writes mod state through `gamesettings` flat flags, and `gamesettings.loadToGame()` rebuilds the active mod set on every change. Per-mod settings (Flashlight size, Adaptive Speed max rate, Transform rotation, Target Practice size) are stored in `gamesettings` under UI-specific keys (`flSize0`, `asMaxRate`, etc.) but are not passed to the `Mod` instances, so gameplay falls back to hard-coded defaults.

There is also no validation of mutually exclusive mod combinations, so users can select nonsensical sets such as Hard Rock + Easy or Double Time + Half Time.

## Goals / Non-Goals

**Goals:**
- Pass user-configured mod settings from `gamesettings` into active `Mod` instances so the gameplay systems read the correct values.
- Enforce lazer-compatible mutual exclusion rules when building the active mod set.
- Reflect incompatibility rules in the mod-selection UI by disabling or auto-removing conflicting mods.
- Add focused headless tests that prove settings propagate and incompatible combos are pruned.

**Non-Goals:**
- Rewiring `applyToDifficulty`/`applyToTrack`/`applyToAudio` to replace the legacy difficulty/audio math in `playback.js`.
- Implementing the currently stubbed gameplay effects for `WindUp`, `ApproachDifferent`, or `TargetPractice`.
- Changing the backend score/PP pipeline.
- Changing the mod base class API beyond adding one optional hook.

## Decisions

### 1. Add an `incompatibleWith(acronym)` hook to the `Mod` base class
- **Rationale**: Keeps incompatibility knowledge close to each mod definition instead of centralizing a giant matrix in the registry. The registry can still pre-compute a static matrix at registration time for speed.
- **Alternative considered**: Central `INCOMPATIBLE_PAIRS` constant in `index.js`. Rejected because adding a new mod would require touching two files and the rules would be far from the mod class.

### 2. Resolve incompatibility in `ModRegistry.setActive()`
- **Rationale**: The registry is the canonical owner of the active mod set. Resolving conflicts there guarantees all callers (UI, tests, headless scripts, future code) get the same behavior.
- **Rule order**: process mods in input order; when a mod is added, remove any already-active mods that conflict with it. This means the *last selected* mod wins, which matches typical UI expectations.

### 3. Mirror the same rules in `ModSelectPanel.vue`
- **Rationale**: Users should see the consequence immediately. A disabled/unchecked state is better than a silent prune.
- **Implementation**: import the validation helper from `ModRegistry` or expose it as `window.ModRegistry.validateSet(set)` and use it inside `toggle()`.

### 4. Keep the legacy flat flags as the persistence layer for now
- **Rationale**: `gamesettings` is persisted to localStorage and synced to the backend. Replacing it would be a much larger migration. This change only fixes the bridge *from* those flags *into* the registry.
- **Consequence**: New mod settings still round-trip through `gamesettings` keys with UI names. The bridge in `loadToGame()` translates them into mod-native setting names.

### 5. Flashlight UI exposes two size points, mod expects three
- **Rationale**: The UI is intentionally simpler. `sizeCombo0` maps to `flSize0`, `sizeCombo200` maps to `flSize200`, and `sizeCombo100` is interpolated linearly between them.

## Risks / Trade-offs

- **[Risk] Incompatibility removal is silent and may surprise users** → Mitigation: log to console in dev and return the list of removed mods from `setActive()` so the UI can show a transient notice if desired.
- **[Risk] Existing headless scripts that call `setActive()` with conflicting combos may now get a different active set** → Mitigation: this is the intended behavior; update tests to assert the cleaned set. No production code relies on invalid combos.
- **[Risk] Settings bridge adds coupling between `gamesettings` keys and mod class setting names** → Mitigation: document the mapping in `gamesettings.js` next to the bridge code; future UI changes must update the same block.
- **[Risk] `applyToGame` currently re-applies flags; changing mod instances' settings does not affect those flags** → Mitigation: gameplay code for FL/AS/TF already reads `mod.settings`, so no flag changes are needed. The bridge only needs to populate `mod.settings` before `applyToGame` runs.

## Migration Plan

This is a pure client-side change with no database or API migration. Deployment steps:
1. Implement the settings bridge and validation.
2. Add/update headless tests.
3. Run `npm run test:all` locally.
4. Merge and deploy as normal.

Rollback: revert the commit. Settings persisted in `localStorage` remain valid because flat flags are unchanged.

## Open Questions

- Should the UI show a toast/notice when a mod is auto-removed due to incompatibility? (Nice-to-have; out of scope for the first iteration.)
- Should Classic and Target Practice be mutually exclusive as conversion mods? For now they are not, matching lazer's permissive conversion-mod stacking until evidence suggests otherwise.
