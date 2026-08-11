## 1. GameState foundation

- [x] 1.1 Create `src/shell/gamestate.js` with `get`, `set`, `setBatch`, `subscribe`, `syncLegacy`, and namespace map.
- [x] 1.2 Implement safe default initialization from `window.game` when available; no-op if `window.game` is undefined.
- [x] 1.3 Implement mod routing: `set("mods.*")` forwards to `window.ModRegistry` when present.
- [x] 1.4 Add dev-only direct-write guard that warns when code mutates `window.game` keys managed by GameState.

## 2. Settings bridge migration

- [x] 2.1 Update `src/shell/gamesettings.js` `loadToGame()` to populate `GameState` first, then call `GameState.syncLegacy()`.
- [x] 2.2 Update `src/shell/gamesettings.js` `saveToLocal()` and `refresh()` to read from `GameState` instead of `window.game` where applicable.
- [x] 2.3 Keep legacy flat mod flags as derived aliases from `ModRegistry` so existing game-engine reads still work.

## 3. Vue component migration

- [x] 3.1 Update `src/vue/components/ModSelectPanel.vue` to toggle mods via `GameState.set("mods.<acronym>", bool)`.
- [x] 3.2 Update `src/vue/components/ModSelectPanel.vue` mod-setting sliders to use `GameState.set("settings.<key>", value)` (or keep gamesettings keys but route through GameState).
- [x] 3.3 Update `src/vue/components/SettingsPanel.vue` display/audio/input settings to use `GameState`.
- [x] 3.4 Update `src/vue/components/Nav.vue` if it reads any game settings directly. (Audited; no references to game settings.)

## 4. Game engine integration

- [x] 4.1 Update `src/game/initgame.js` to import `GameState` and initialize it after `window.game` is created.
- [x] 4.2 Ensure `gamesettings.loadToGame()` runs after `GameState` is initialized.
- [x] 4.3 Leave game-engine internals (`playback.js`, `playerActions.js`, overlays) reading `window.game` in this change.

## 5. Tests and verification

- [x] 5.1 Create `scripts/headless-gamestate.js` covering: get/set, batched writes, mod toggle round-trip, settings propagation.
- [x] 5.2 Update `package.json` scripts to include `test:gamestate` if desired.
- [x] 5.3 Run `npm run build`, `npm test`, `npm run test:all` and fix regressions.
- [x] 5.4 Run `node scripts/headless-mod-flashlight.js` and `node scripts/headless-mod-incompatible.js` to confirm mod bridge still works.

## 6. Documentation

- [x] 6.1 Update `docs/wayfinder/STATUS.md` to mention the new `GameState` seam.
- [x] 6.2 Add a short code comment in `src/shell/gamestate.js` explaining the deprecation window for direct `window.game` writes.

## 7. OpenSpec wrap-up

- [ ] 7.1 Run `openspec status --change deepen-game-state-seam` and confirm all artifacts are done.
- [ ] 7.2 Sync delta specs to main specs and archive the change after implementation is complete.
