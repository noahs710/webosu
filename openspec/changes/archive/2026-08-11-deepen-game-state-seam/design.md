## Context

`window.game` is a large, mutable object created in `src/game/initgame.js` and referenced directly throughout the codebase. Shell settings (`src/shell/gamesettings.js`) and Vue components (`ModSelectPanel.vue`, `SettingsPanel.vue`) mutate it to change display/audio/input/mods, while the game engine reads it every frame. This creates a shallow seam: callers must know the exact key names and types, there is no single place to validate or observe changes, and the legacy flat mod flags (`game.hardrock`, etc.) duplicate the canonical `ModRegistry` state.

The recent lazer-parity overhaul made the duplicate-mod problem explicit: `gamesettings.loadToGame()` now builds the canonical active mod list via `ModRegistry`, but still writes flat booleans to `window.game` because many game files read them. This change introduces a `GameState` adapter so the shell/Vue layers write through a single interface, while the game engine keeps using `window.game` during a deprecation window.

## Goals / Non-Goals

**Goals:**
- Provide a single, observable seam for non-engine callers to read and write game settings/state.
- Keep the legacy `window.game` object working for existing game-engine code during a deprecation window.
- Ensure `ModRegistry` is the canonical source of mod truth; flat flags become derived aliases.
- Make settings changes observable so the UI can react without polling or manual DOM glue.
- Add a focused headless test proving the seam works.

**Non-Goals:**
- Rewriting the game engine (`playback.js`, `playerActions.js`, overlays) to use `GameState` in this change.
- Removing `window.game` entirely.
- Changing backend APIs, the database, or score submission.
- Adding TypeScript or runtime schema validation (the interface is documented and tested, not typed).

## Decisions

### 1. `GameState` lives in `src/shell/gamestate.js`
- **Rationale**: The shell layer already owns shared modules (`api.js`, `gamesettings.js`). Game state is shared shell/engine state, so it belongs next to them. It also makes `GameState` importable from Vue without pulling in game-engine modules.
- **Alternative considered**: Put it in `src/game/`. Rejected because Vue/shell would then import from the game layer, breaking the clean SPA/game split.

### 2. Interface: `get(path)`, `set(path, value)`, `setBatch(obj)`, `subscribe(path, cb)`, `syncLegacy()`
- **Rationale**: A path-based API (`"mods.hidden"`, `"display.cursorSize"`) is a small surface that can cover the whole flat object. Grouping keys into namespaces (display, audio, input, mods) improves leverage for callers without forcing a huge rewrite.
- **Alternative considered**: One flat `get(key)` mirroring `window.game`. Rejected because it does not improve the seam — it just renames it.

### 3. Keep legacy `window.game` as the underlying store
- **Rationale**: The engine reads `window.game` hundreds of times. Mirroring `GameState` back to `window.game` lets us migrate callers incrementally without touching engine internals.
- **Trade-off**: We still have one global object, but now there is one gate through which non-engine writes must pass.

### 4. Mod flags: `GameState` reads from `ModRegistry`, writes back through it
- **Rationale**: This makes `ModRegistry` canonical. When `ModSelectPanel` toggles a mod, it calls `GameState.set("mods.flashlight", true)`, which asks `ModRegistry.setActive()` and then derives the flat flags.
- **Trade-off**: `ModSelectPanel` currently both writes `gamesettings` flags and calls `ModRegistry`. After this change it writes only `GameState`, which writes `gamesettings` and `ModRegistry` together.

### 5. Sync is eager, not reactive
- **Rationale**: `window.game` must be up-to-date before the next frame. `set()` and `setBatch()` apply changes synchronously to both `GameState` and `window.game`. `subscribe()` is for UI updates, not engine reads.
- **Alternative considered**: Reactive proxy. Rejected because it adds complexity and the engine does not need reactivity — it needs synchronous reads.

### 6. Namespaces

```
display.backgroundDimRate
display.cursorSize
display.showhwmouse
audio.masterVolume
audio.effectVolume
audio.musicVolume
input.allowMouseButton
input.K1keycode
mods.hidden      // canonical via ModRegistry
mods.flashlight  // canonical via ModRegistry
mods.customAR    // DA setting
```

## Risks / Trade-offs

- **[Risk] Callers keep mutating `window.game` directly, undermining the seam** → Mitigation: migrate `gamesettings.js` and the Vue settings/mod panels in this change; add dev-only warnings when direct writes are detected.
- **[Risk] ModRegistry not available when GameState is initialized** → Mitigation: `GameState` defers `ModRegistry` access until first mod write; `loadToGame()` is called after mods are registered in `initgame.js`.
- **[Risk] Performance overhead from path parsing** → Mitigation: paths are simple strings split on `.`; benchmark the headless settings test after the change. If overhead is measurable, cache parsed paths.
- **[Risk] Existing tests break because they read `window.game` directly** → Mitigation: `window.game` stays in sync; legacy tests continue to work. The new headless test only validates `GameState`.
- **[Trade-off] We are adding an abstraction on top of a global instead of removing the global.** This is intentional: the global can only be removed after the engine migration, which is a later change.

## Migration Plan

1. Implement `src/shell/gamestate.js` and unit-test its get/set/subscribe/batch APIs.
2. Update `gamesettings.loadToGame()` to populate `GameState`, then sync legacy `window.game` flags via `GameState.syncLegacy()`.
3. Update `ModSelectPanel.vue` to toggle mods through `GameState.set("mods.<flag>", bool)` instead of writing `gamesettings` and `window.game` directly.
4. Update `SettingsPanel.vue` display/audio/input settings to use `GameState`.
5. Add `scripts/headless-gamestate.js` covering mod toggle round-trip and settings propagation.
6. Run full test suite; fix regressions.
7. Update `docs/wayfinder/STATUS.md` to mention the new seam.

Rollback: revert the commit. `window.game` remains the underlying store, so the engine is unaffected.

## Open Questions

- Should we emit a one-time console warning in dev mode when code writes `window.game` directly? This would help enforce the seam during the deprecation window.
- Should `GameState` expose a `reset()` method for “Reset to Defaults” in the settings panel, or should that live in `gamesettings.js`?
