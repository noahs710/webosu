## ADDED Requirements

### Requirement: Mod-select sidebar drawer
The system SHALL provide a collapsible mod-select sidebar as a global drawer overlay in `app.js`, accessible from a "Mods" button in the Nav and a keyboard shortcut (F1). The sidebar SHALL slide in from the right, dimming the main content behind it. It SHALL use the existing `ModSelectPanel` component (badge-grid style) and persist the active mod set to `gamesettings` on change. The mod section SHALL be removed from `SettingsPanel`.

#### Scenario: Sidebar opens from Nav
- **WHEN** the user clicks the "Mods" button in the Nav
- **THEN** the mod-select sidebar slides in from the right with the mod badge grid

#### Scenario: Sidebar closes
- **WHEN** the user clicks the backdrop or presses Escape or clicks the "Mods" button again
- **THEN** the sidebar slides out and the main content is undimmed

#### Scenario: Mods persist after closing sidebar
- **WHEN** the user selects mods in the sidebar, closes it, and navigates to another page
- **THEN** the selected mods remain active (persisted via gamesettings)

### Requirement: Mod-select reactivity fix
The `ModSelectPanel` SHALL correctly reflect the active state of all mods (including the new lazer mods: FL, RX, AP, TP, AS, MG, WO, WU, TR, AD, BU, RP, DP, TF, NS). Clicking a badge SHALL toggle it active/inactive and update the visual state immediately. The panel SHALL write to `ModRegistry.setActive()` directly (bypassing the flat-flag bridge for new mods).

#### Scenario: New mod is clickable
- **WHEN** the user clicks the "Wobble" badge in the mod-select sidebar
- **THEN** the badge becomes active (highlighted) and the mod is applied to the game

#### Scenario: Active state persists across sidebar opens
- **WHEN** the user selects Hard Rock, closes the sidebar, and reopens it
- **THEN** the Hard Rock badge is shown as active

### Requirement: Favorites server-sync
The system SHALL sync favorites to the server when the user is logged in (`profiles.favorites` JSON), with a local fallback (`likedsidset` in localforage) when not logged in. On login, local favorites SHALL be merged into server favorites (union). On load when logged in, server favorites SHALL be fetched and merged with local. On add/remove, the change SHALL be written to both local and server (if logged in).

#### Scenario: Favorites synced to server
- **WHEN** a logged-in user adds a favorite
- **THEN** it's written to local localforage AND the server's profiles.favorites

#### Scenario: Local-only when not logged in
- **WHEN** a non-logged-in user adds a favorite
- **THEN** it's written to local localforage only

#### Scenario: Merge on login
- **WHEN** a user with local favorites logs in
- **THEN** local favorites are merged into the server favorites (union, no duplicates)

### Requirement: Leaderboard button in difficulty popup
The `BeatmapList` difficulty modal SHALL show a "Leaderboard" button for each difficulty that opens the leaderboard for that beatmap (with the current mod combination) in a new tab.

#### Scenario: Leaderboard button opens leaderboard
- **WHEN** the user clicks "Leaderboard" next to a difficulty in the popup
- **THEN** a new tab opens to `/leaderboard?bid=:beatmapId&mods=:modsHash`

### Requirement: Discord banner on Skins page
The Skins page SHALL display a Discord banner replacing the "Shared skins (online)" section. The banner SHALL link to the Discord server (`https://discord.gg/v7wBtSdYzx`) with a call-to-action to share scores, skins, and chat. The upload/share-skins UI SHALL be removed.

#### Scenario: Discord banner displayed
- **WHEN** the user visits the Skins page
- **THEN** a banner with "Join the webosu Discord" and a link to the server is shown where the shared-skins section used to be

### Requirement: Vue feature flags defined
The `vite.config.mjs` SHALL define `__VUE_OPTIONS_API__`, `__VUE_PROD_DEVTOOLS__`, and `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` to silence the Vue esm-bundler feature-flags warning.

#### Scenario: No Vue feature flags warning
- **WHEN** the dev server starts and the page loads
- **THEN** no "Feature flags __VUE_OPTIONS_API__... are not explicitly defined" warning appears in the console

### Requirement: Recently played null fix
The `BeatmapList` component SHALL guard against null/missing `beatmaps` arrays in catboy.best API responses (deleted beatmap sets return null), showing a graceful fallback instead of crashing.

#### Scenario: Deleted beatmap set in recently played
- **WHEN** a user's recently-played list contains a sid for a deleted beatmap set (catboy.best returns null)
- **THEN** the BeatmapList skips the null entry instead of crashing with "Cannot read properties of null (reading 'beatmaps')"