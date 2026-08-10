## Why

On skin switch, old textures are overwritten in `window.Skin` but never unloaded from `PIXI.Assets.cache`. Each switch pins ~60 textures in GPU memory permanently (Assets cache pins textures, exempting them from GC). After N switches: ~60×N stale GPU textures. Additionally, sound blob URLs are never revoked, and `loadCachedSkin` called for metadata on the skins page leaks all blob URLs without calling `applySkin`.

## What Changes

- **Track active skin assets** — a module-level `_activeSkinKeys` Set in `skin-loader.js` records every blob URL loaded into `Assets.cache` by `applySkin`
- **New `unloadActiveSkin()` function** — restores `window.Skin` to `_defaultSkin`, then calls `Assets.unload(url)` for each old key (frees GPU memory). Safe because it runs after gameplay sprites are destroyed (deferred unload).
- **Deferred unload on `playback.destroy()`** — when `applySkin` is called during active gameplay, old textures are pushed to `_pendingUnload` instead of being destroyed immediately. `playback.destroy()` flushes `_pendingUnload` after the scene is torn down.
- **Skin switch guard in `skins.js`** — if a game is in progress (`window.playback && !window.playback.ended`), warn the user that the skin applies on next game, not mid-play.
- **Revoke sound blob URLs** — after Howl loads, revoke the sound blob URL (currently only texture URLs are revoked).
- **Add `getCachedSkinMeta()`** — lightweight metadata-only read from IndexedDB that doesn't create blob URLs. Used by the skins page instead of `loadCachedSkin`.
- **Blob URL registry** — track all `URL.createObjectURL` calls in a `_pendingBlobUrls` Set; `revokeAllSkinBlobs()` revokes them on `applySkin` completion and error paths.

## Capabilities

### New Capabilities
- `skin-texture-lifecycle`: Proper unload-on-switch flow for skin textures, sounds, and blob URLs

### Modified Capabilities
- `osk-skin-loading`: `applySkin` now tracks loaded assets and supports deferred unload; skins page uses `getCachedSkinMeta` instead of `loadCachedSkin` for metadata
- `pixi-asset-lifecycle`: Old skin textures are unloaded via `Assets.unload` on game teardown, not just overwritten

## Impact

- `src/game/skin-loader.js` — `_activeSkinKeys` Set, `unloadActiveSkin()`, `getCachedSkinMeta()`, blob URL registry, sound URL revocation (~80 LOC)
- `src/game/playback.js` — `destroy()` flushes `_pendingUnload` (~10 LOC)
- `src/vue/pages/skins.js` — use `getCachedSkinMeta` for list, add mid-game guard (~15 LOC)
- GPU memory: steady-state 1 skin instead of unbounded growth