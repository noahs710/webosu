## Specs

### skin-texture-lifecycle

- The skin loader SHALL track all blob URLs loaded into `Assets.cache` via an `_activeSkinKeys` Set
- When no game is in progress, `applySkin` SHALL call `unloadActiveSkin()` before loading new textures, which calls `Assets.unload()` for each old key to free GPU memory
- When a game IS in progress, `applySkin` SHALL defer unloading by pushing old textures to `_pendingUnload`, which is flushed by `playback.destroy()` after the scene is torn down
- Sound blob URLs SHALL be revoked after the Howl `load` event fires (with a setTimeout fallback)
- A `getCachedSkinMeta()` function SHALL provide lightweight metadata reads from IndexedDB without creating blob URLs
- The skins page SHALL warn the user when applying a skin mid-game instead of producing a half-applied skin

### osk-skin-loading

- `applySkin` SHALL register every successfully loaded texture URL in `_activeSkinKeys`
- `unloadActiveSkin` SHALL restore `window.Skin` entries to `_defaultSkin` values before unloading old textures
- The skins page vault list SHALL use `getCachedSkinMeta()` instead of `loadCachedSkin()` to avoid creating blob URLs for metadata-only reads

### pixi-asset-lifecycle

- Old skin textures SHALL be unloaded via `Assets.unload()` (not just overwritten in `window.Skin`) to free GPU memory
- `Assets.unload` SHALL only be called when no live sprite references the texture (after `playback.destroy()` or when no game is running)