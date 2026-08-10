## Tasks

- [x] Add `_activeSkinKeys` Set and `_pendingUnload` array to `skin-loader.js`
- [x] Add `_pendingBlobUrls` Set + `trackBlobUrl()` + `revokeAllSkinBlobs()` helpers
- [x] Implement `unloadActiveSkin()` — restores defaults, calls `Assets.unload` for each old key
- [x] Update `applySkin` to register loaded URLs in `_activeSkinKeys`, push old textures to `_pendingUnload` when game is running, call `unloadActiveSkin` when no game
- [x] Add sound blob URL revocation after Howl `load` event in `applySkin`
- [x] Implement `getCachedSkinMeta()` — reads config from IndexedDB without creating blob URLs
- [x] Update `skins.js` to use `getCachedSkinMeta()` for vault list display
- [x] Add mid-game guard in `skins.js` `applyLocal` — warn if `window.playback && !window.playback.ended`
- [x] Add `_pendingUnload` flush to `playback.js` `destroy()` — `Assets.unload` + `URL.revokeObjectURL` + `tex.destroy(true)`
- [x] Verify: `npm run build` passes
- [x] Verify: `npm test` passes
- [x] Verify: `npm run test:game` passes
- [x] Verify: `npm run test:crash` passes (quit/retry flushes pending unload)