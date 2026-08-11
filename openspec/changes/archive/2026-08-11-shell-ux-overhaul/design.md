## Context

The webosu shell (Nav, Settings, BeatmapList, Skins page) works but needs UX polish. The tab bar is cluttered (Leaderboard shouldn't be top-level), mods are buried in Settings (should be a sidebar), favorites are local-only (no server sync), the shared-skins section is unused (Discord banner instead), and the ModSelectPanel has a reactivity bug. The BeatmapList difficulty popup exists but has no leaderboard button and throws a null-beatmaps error.

## Goals / Non-Goals

**Goals:**
- Streamline the tab bar (remove Leaderboard, fold New/Popular into Browse, add Mods button)
- Mod-select as a global collapsible sidebar drawer (not in Settings)
- Fix the ModSelectPanel reactivity bug
- Favorites server-sync (dual-write, login merge) with local fallback
- Leaderboard button in the difficulty popup
- Discord banner replacing shared-skins
- Fix the recently-played null beatmaps error
- Silence the Vue feature flags warning

**Non-Goals:**
- Profile redesign (that's profiles-ranking-pp)
- Skin preload/health (that's skin-preload-health)
- Backend leaderboard query changes (already done in lazer-parity-overhaul)

## Decisions

### Decision 1: Mod sidebar as a global drawer in app.js

The `ModSelectPanel` becomes a slide-in drawer overlaying the main content, toggled by a "Mods" button in the Nav and a keyboard shortcut (e.g. F1). It lives in `app.js` (the root Vue component) so it's available on every page. Removed from `SettingsPanel`.

**Why over a per-page component:** the user should be able to toggle mods from anywhere (browsing, on the home page, before launching a map) without navigating to Settings. A global drawer is the lazer pattern.

**Direction:** slide in from the right (lazer's mod select is right-aligned). Width ~340px. Backdrop dim behind it.

### Decision 2: Fix ModSelectPanel reactivity

The current bug: mods are "not clickable / no selected status." Root cause is likely that `activeMods.value` is a `ref(new Set())` and `toggle()` creates a new Set and reassigns — this should be reactive in Vue 3. The actual bug is probably that `MOD_FLAG` maps new mods (MG, WO, etc.) to flags that aren't in `defaultsettings`, so `gamesettings[flag]` is `undefined` → the toggle writes `undefined` → the flag never reads as `true`. Fix: ensure all mod flags are in `defaultsettings` (they were added in lazer-parity-overhaul but may have been missed) OR read/write via `ModRegistry.setActive` directly instead of the flat-flag bridge.

**Chosen fix:** bypass the flat-flag bridge for new mods — the ModSelectPanel calls `ModRegistry.setActive(acronyms)` directly and `gamesettings.loadToGame()` applies. The flat flags remain for back-compat but aren't the source of truth for new mods.

### Decision 3: Favorites dual-write with login merge

```
  On login:    local favorites → merge into server (union)
  On load:     if logged in, fetch server favorites, merge with local (union)
  On add/rm:   write to local + server (if logged in)
  Offline:     local only (server sync on next login)
```

The backend already has `profiles.favorites` (JSON array of sids). `api.saveMyProfile({ favorites: [...] })` exists. The merge is a union (like lazer).

### Decision 4: Leaderboard button in difficulty popup

In `BeatmapList`'s difficulty modal, add a "Leaderboard" button next to each difficulty row. Clicking it opens `/leaderboard?bid=:beatmapId&mods=:modsHash` in a new tab (or navigates to it). The leaderboard route already exists and accepts `bid` + `mods` params.

### Decision 5: Discord banner on Skins page

Replace the "Shared skins (online)" section with a styled banner linking to `https://discord.gg/v7wBtSdYzx`. Remove the upload-to-share UI. Keep the local skin management section.

### Decision 6: Vue feature flags in vite.config

Add to `vite.config.mjs`:
```js
define: {
  __VUE_OPTIONS_API__: true,
  __VUE_PROD_DEVTOOLS__: false,
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
}
```

## Risks / Trade-offs

- **[Sidebar state persistence]** If the user toggles mods in the sidebar then navigates, the drawer should stay closed (state lost). → Mitigation: the mod set persists in gamesettings; the drawer open/close state is ephemeral.
- **[Favorites merge conflict]** If a user has conflicting local + server favorites, union is safe (never loses a favorite). → No risk.
- **[Leaderboard popup navigation]** Opening in a new tab vs same tab. → Mitigation: `target="_blank"` so the user keeps their place in the difficulty popup.