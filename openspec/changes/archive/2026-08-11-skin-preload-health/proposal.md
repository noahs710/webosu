## Why

Skins and hitsounds currently load lazily during `initgame`, which means the first beatmap launch can hitch while textures decode. There's no health check — a corrupted or partial skin import silently produces WHITE-fallback textures or missing sounds. Multiple skin uploads aren't queued (each import blocks the main thread), and the auto-switch behavior can surprise users who just wanted to import a skin, not apply it immediately. These issues make the skin experience feel janky, especially on low-end devices.

## What Changes

- **Preload skin + hitsounds before beatmap download**: ensure skin textures are fully loaded and validated in IndexedDB before allowing a beatmap launch; gate the "Play" button / beatmap download on `skinReady && soundReady` (the readiness flags already exist in `initgame.js`)
- **Skin health checks**: after loading a skin from cache or import, validate that core gameplay textures exist and are valid (not corrupt PNGs); if validation fails, show a popup explaining the issue + the best course of action (re-import, reset to default, or continue with fallback)
- **Hitsound health checks**: validate that the 15 core hitsound ogg files loaded (the new sliderslide/spinnerspin sounds are optional — if missing, warn but don't block); if a required hitsound is missing, show a popup
- **Health-check popup**: a reusable modal that shows: the problem name, a plain-language explanation, and action buttons ("Repair" / "Reset to default" / "Dismiss")
- **No auto-switch on upload**: when a user imports a .osk, do NOT automatically apply it — just add it to the local vault; the user must click "Apply" to switch
- **Upload queue**: when multiple .osk files are imported, queue them and unzip sequentially (one at a time) so an old Chromebook doesn't freeze; show progress per file
- **Remove shared skins section**: (captured in shell-ux-overhaul; this change focuses on the local skin management + health)

## Capabilities

### New Capabilities
- `skin-preload-gate`: The readiness gate that blocks beatmap launch until skin + hitsounds are loaded and validated
- `skin-health-checks`: The validation of skin textures + hitsounds after load, with a health-check popup for issues
- `skin-upload-queue`: The sequential upload/import queue with per-file progress and no auto-switch

### Modified Capabilities
- (none — the existing skin loading doesn't have a spec in openspec/specs/)

## Impact

**Affected code:**
- `src/game/initgame.js`: the `loadDefaultSkin()` + `sounds.whenLoaded` flow — add validation + health-check popup dispatch
- `src/game/skin-loader.js`: add `validateSkin(data)` (check core textures exist + valid) + `validateHitsounds()`; change `loadOsk` to not auto-apply
- `src/vue/pages/skins.js`: remove auto-apply on import; add upload queue with progress; (Discord banner is in shell-ux-overhaul)
- `src/vue/app.js` or a new component: the health-check popup component
- `src/vue/components/BeatmapList.vue`: gate the launch button on `skinReady && soundReady` (show a loading state if not ready)