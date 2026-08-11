## Why

`window.game` is a flat, mutable bag of ~60 keys that is read and written directly across the game engine, shell modules, and Vue components. This shallow seam forces callers to know the exact shape of global state, duplicates mod configuration (flat booleans vs. `ModRegistry`), and makes unit testing, bug isolation, and future refactors unnecessarily hard. We need a small, deep seam around game state so callers get leverage (one consistent API) and maintainers get locality (state changes live in one place).

## What Changes

- Introduce a `GameState` module in `src/shell/gamestate.js` with a typed, observable interface over the legacy `window.game` object.
- Migrate direct reads/writes of `window.game` outside the game engine to `GameState.get()` / `GameState.set()`.
- Deprecate legacy flat mod flags (`game.hardrock`, `game.hidden`, etc.) as the source of truth; `gamesettings.loadToGame()` populates `GameState`, which then syncs the deprecated aliases only for code that has not yet migrated.
- Add a headless test proving `GameState` round-trips settings and that `ModRegistry` remains the canonical mod source.
- Update `docs/wayfinder/STATUS.md` to note the new seam.

**BREAKING**: Internal only. No backend or API changes. The legacy `window.game` object remains exposed for third-party scripts and unfinished callers during the deprecation window.

## Capabilities

### New Capabilities
- `game-state`: Centralized, observable game-state seam with `get`/`set`/`subscribe`/`batch` APIs and mod-source unification.

### Modified Capabilities
- `mod-settings-bridge`: Settings bridge will write through `GameState` rather than mutating `window.game` directly, and `GameState` will keep legacy flat flags in sync for backwards compatibility.

## Impact

- `src/shell/gamesettings.js` — `loadToGame()` becomes a consumer/producer of `GameState` instead of directly mutating `window.game`.
- `src/vue/components/ModSelectPanel.vue`, `src/vue/components/SettingsPanel.vue` — read/write mod and display settings through `GameState`.
- `src/game/initgame.js` — initializes `GameState` and seeds it with defaults.
- `src/game/playback.js`, `src/game/playerActions.js` — continue reading `window.game` in this phase; migration of game-engine internals is out of scope.
- New test: `scripts/headless-gamestate.js`.
