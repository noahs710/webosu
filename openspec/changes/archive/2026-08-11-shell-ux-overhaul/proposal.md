## Why

The webosu shell UX needs polish: the tab bar is cluttered (Leaderboard should be in the difficulty popup, not a top-level tab), mods are buried in Settings (should be a collapsible sidebar accessible from anywhere), favorites only work locally (no server sync), the shared-skins section is unused (replace with a Discord banner), and the mod-select panel has a reactivity bug (mods not clickable / no selected status).

## What Changes

- **Tab bar redesign**: remove Leaderboard from the tab bar (move to difficulty popup); fold New/Popular into Browse with tabs; keep Favorites, Settings, Skins; add the logged-in user's avatar/PFP (if the profiles change lands) or username; add a Mods button to toggle the sidebar
- **Mod-select sidebar**: move `ModSelectPanel` out of SettingsPanel into a global collapsible sidebar (drawer overlay) in `app.js`, toggled from a Nav button or keyboard shortcut; fix the reactivity bug (mods not clickable); remove the mod section from SettingsPanel
- **Favorites server-sync**: when logged in, dual-write favorites to server (`profiles.favorites` JSON) + local (`likedsidset` in localforage); on login, merge local favorites into server (union); on load, prefer server favorites (merge with local for offline)
- **Leaderboard in difficulty popup**: add a "Leaderboard" button to the `BeatmapList` difficulty modal that opens the leaderboard for that beatmap (with the current mod combo)
- **Discord banner**: replace the "Shared skins (online)" section on the Skins page with a Discord banner advertising the community (share scores, skins, chat); remove the upload/share-skins UI; keep the local skin management section
- **Recently played fix**: fix the "Cannot read properties of null (reading 'beatmaps')" error — the `BeatmapList` with `sids` prop hits the catboy.best `/api/v2/beatmapsets?ids=...` endpoint which can return null beatmaps for deleted sets; guard against null
- **Vue feature flags**: define `__VUE_OPTIONS_API__`, `__VUE_PROD_DEVTOOLS__`, `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` in vite.config to silence the warning

## Capabilities

### New Capabilities
- `mod-sidebar`: The collapsible mod-select sidebar (global drawer overlay) accessible from any page, replacing the Settings-embedded mod section
- `favorites-server-sync`: Server-side favorites storage with local fallback, dual-write, and login-merge behavior
- `discord-banner`: The Discord community banner on the Skins page replacing the shared-skins section

### Modified Capabilities
- (none — the existing shell doesn't have specs in openspec/specs/)

## Impact

**Affected code:**
- `src/vue/components/Nav.vue`: remove Leaderboard link, add Mods button, show PFP/rank (if profiles change lands), streamline tab items
- `src/vue/components/SettingsPanel.vue`: remove the Mod section (it's now a sidebar)
- `src/vue/components/ModSelectPanel.vue`: fix reactivity bug, add sidebar drawer styling
- `src/vue/app.js`: add the mod sidebar drawer overlay + toggle logic
- `src/vue/components/BeatmapList.vue`: add Leaderboard button to difficulty modal; fix null beatmaps guard
- `src/vue/pages/skins.js`: remove shared-skins section, add Discord banner
- `src/shell/api.js`: add favorites sync methods (getMyFavorites, saveMyFavorites)
- `src/shell/gamesettings.js`: favorites sync on login (merge local → server)
- `vite.config.mjs`: define Vue feature flags