## 1. Skin + Hitsound Preload Gate

- [x] 1.1 In `src/vue/components/BeatmapList.vue` `launch()`: gate the `beatmap-launch` dispatch on `window.skinReady && window.soundReady` — if not ready, show "Loading skin..." on the button and poll readiness
- [x] 1.2 Add a `waitForReadiness()` helper that returns a promise resolving when both flags are true (poll every 100ms)

## 2. Skin Validation

- [x] 2.1 In `src/game/skin-loader.js`: add `validateSkin(data)` — checks that the 8 core textures exist and are valid: `hitcircleoverlay.png`, `hitcircle.png`, `approachcircle.png`, `cursor.png`, `hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`; returns `{ ok, missing[], corrupt[] }`
- [x] 2.2 In `src/game/skin-loader.js`: add `validateHitsounds()` — checks `game.sample[1..3]` have `hitnormal`, `hitwhistle`, `hitfinish`, `hitclap`, `slidertick`; `sliderslide`/`spinnerspin` are optional; returns `{ ok, missing[] }`
- [x] 2.3 In `src/game/initgame.js`: after `loadDefaultSkin()` resolves, call `validateSkin()`; if issues, dispatch a `window` event `skin-health-issue` with the details; after `sounds.whenLoaded`, call `validateHitsounds()`

## 3. Health-Check Popup

- [x] 3.1 Create `src/vue/components/HealthCheckPopup.vue` — a modal that displays: issue name, plain-language explanation, action buttons ("Repair" / "Reset to default" / "Dismiss")
- [x] 3.2 In `src/vue/app.js`: listen for the `skin-health-issue` event; when received, mount the `HealthCheckPopup` with the issue details
- [x] 3.3 "Repair" → re-trigger the skin import flow (file picker); "Reset to default" → clear cache + reload; "Dismiss" → close the popup

## 4. No Auto-Switch + Upload Queue

- [x] 4.1 In `src/game/skin-loader.js` `loadOsk()`: do NOT auto-apply — just return the parsed skin data (the caller decides whether to apply)
- [x] 4.2 In `src/vue/pages/skins.js` `importLocal()`: stop calling `applySkin` after import — just save to the local vault; the "Apply" button is the only path to switching
- [x] 4.3 In `src/vue/pages/skins.js`: add an upload queue (`uploadQueue = ref([])`) for multiple files; process one at a time with `setTimeout(0)` yields between files; show per-file progress
- [x] 4.4 Update the import input to accept `multiple` files and feed them all to the queue

## 5. Verification

- [x] 5.1 `npm run build` — green
- [x] 5.2 `npm test` — all backend tests pass (45/45, no regression)
- [x] 5.3 `node scripts/headless-play.js` — 0 pageerrors (no regression from validation)
- [ ] 5.4 Manual: import a .osk → it's added to the vault but not auto-applied; import 3 at once → sequential progress; load with a corrupt skin → popup appears *(deferred to manual testing)*