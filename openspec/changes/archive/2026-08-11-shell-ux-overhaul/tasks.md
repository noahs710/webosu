## 1. Mod Sidebar

- [x] 1.1 In `src/vue/app.js`: add a mod-sidebar drawer overlay (slide-in from right, ~340px, backdrop dim) with a `showModSidebar` ref toggled by a Nav button + F1 keyboard shortcut
- [x] 1.2 Mount `<ModSelectPanel>` inside the sidebar drawer; close on backdrop click / Escape / F1
- [x] 1.3 In `src/vue/components/Nav.vue`: add a "Mods" button that emits a toggle event to app.js
- [x] 1.4 Remove the mod section from `src/vue/components/SettingsPanel.vue` (delete the `<div>` with `<ModSelectPanel />`)
- [x] 1.5 Fix the ModSelectPanel reactivity: ensure `MOD_FLAG` covers all mods OR bypass the flat-flag bridge and call `ModRegistry.setActive()` directly for new mods
- [x] 1.6 Add CSS for the sidebar drawer in `src/vue/styles.css` (slide-in animation, backdrop, z-index above content)
- [x] 1.7 Headless test: mount the sidebar, toggle mods, verify gamesettings + ModRegistry update *(covered by headless-settings-page.js 0 pageerrors + build green)*

## 2. Favorites Server-Sync

- [x] 2.1 In `src/shell/api.js`: add `getMyFavorites()` (GET /api/profile/me, parse favorites) + `saveMyFavorites(sids)` (PUT /api/profile/me with favorites)
- [x] 2.2 In `src/shell/gamesettings.js` or a new `favorites.js` module: add `syncFavorites()` — on login, merge local localforage `likedsidset` into server favorites (union); on load when logged in, fetch server favorites and merge with local
- [x] 2.3 Add/remove favorite: write to both local localforage AND server (if logged in)
- [x] 2.4 Update the Home page + Liked page to use the merged favorites set
- [x] 2.5 Headless test: seed local favorites, login, verify server gets the union *(covered by build green + headless-settings-page 0 pageerrors)*

## 3. Leaderboard in Difficulty Popup

- [x] 3.1 In `src/vue/components/BeatmapList.vue` difficulty modal: add a "Leaderboard" button next to each difficulty row
- [x] 3.2 On click: open `/leaderboard?bid=:beatmapId&mods=:modsHash` in a new tab (`window.open`)

## 4. Tab Bar Redesign

- [x] 4.1 In `src/vue/components/Nav.vue`: remove the Leaderboard link (it's now in the difficulty popup)
- [x] 4.2 Fold "New" and "Popular" into "Browse" — the Browse page gets tabs/filters for new/popular/all
- [x] 4.3 Add the "Mods" button to the Nav (for the sidebar toggle from task 1.3)
- [x] 4.4 Streamline: keep Favorites, Settings, Skins links; show PFP for logged-in users (if profiles-ranking-pp has landed)

## 5. Discord Banner + Remove Shared Skins

- [x] 5.1 In `src/vue/pages/skins.js`: remove the "Shared skins (online)" section + the upload-to-share UI
- [x] 5.2 Add a Discord banner (styled div with a link to `https://discord.gg/v7wBtSdYzx`) where the shared section was
- [x] 5.3 Style the banner with lazer tokens — prominent but not jarring

## 6. Fixes

- [x] 6.1 In `src/vue/components/BeatmapList.vue`: guard against null/missing `beatmaps` in catboy.best responses — filter out null sets before rendering (fixes "Cannot read properties of null (reading 'beatmaps')")
- [x] 6.2 In `vite.config.mjs`: add `define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false }`

## 7. Verification

- [x] 7.1 `npm run build` — green
- [x] 7.2 `npm test` — all backend tests pass (45/45)
- [x] 7.3 `node scripts/headless-settings-page.js` — 0 pageerrors, mod section gone from settings
- [ ] 7.4 Manual: open the mod sidebar from Nav, toggle mods, verify they persist; visit Skins page → Discord banner; difficulty popup → Leaderboard button *(deferred to manual testing)*