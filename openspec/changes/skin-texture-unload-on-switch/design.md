## Design

### The deferred unload strategy

The core challenge: PIXI sprites hold direct references to their `Texture` objects. Destroying a texture that sprites still reference produces black squares. We cannot unload old textures while a game is running.

```
┌─ Skin switch during active gameplay ──────────────────────────┐
│                                                               │
│  applySkin(newSkin)                                           │
│    1. Load new textures → window.Skin[key] = newTex           │
│    2. Old textures → _pendingUnload[] (NOT destroyed)         │
│    3. Live sprites keep old textures (visually correct)       │
│    4. New hits read new window.Skin (use new textures)        │
│                                                               │
│  ... game continues with mixed old/new textures ...          │
│                                                               │
│  playback.destroy()  (game quit/retry)                        │
│    1. Destroy all gameplay sprites (releases texture refs)    │
│    2. Flush _pendingUnload:                                    │
│       for each old texture:                                    │
│         Assets.unload(oldUrl)  → frees GPU                     │
│         URL.revokeObjectURL(oldUrl)                           │
│    3. Next game reads fresh window.Skin (new textures)        │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Skin switch when no game is running

Safe to unload immediately — no live sprites:

```
applySkin(newSkin)
  1. unloadActiveSkin() — Assets.unload all old, revoke old blob URLs
  2. Load new textures → window.Skin[key] = newTex
  3. _activeSkinKeys = new keys
```

### Module-level state in skin-loader.js

```js
let _activeSkinKeys = new Set();      // blob URLs in Assets.cache
let _pendingUnload = null;            // array of {tex, url} to unload on destroy
const _pendingBlobUrls = new Set();   // all created blob URLs (for error-path cleanup)
```

### `unloadActiveSkin()` — called when no game is running

```js
export async function unloadActiveSkin() {
  // restore window.Skin to defaults first
  if (window._defaultSkin) {
    for (const k of _activeSkinKeys) {
      // find the skin key that maps to this URL and restore default
    }
  }
  for (const url of _activeSkinKeys) {
    try { await PIXI.Assets.unload(url); } catch {}
  }
  _activeSkinKeys.clear();
  revokeAllSkinBlobs();
}
```

### `applySkin` changes

- After each successful `Assets.load`, add the URL to `_activeSkinKeys`
- If `window.playback && !window.playback.ended` (game running): push old textures to `_pendingUnload` instead of unloading
- If no game running: call `unloadActiveSkin()` before loading new textures
- After Howl loads a sound: `snd.once('load', () => URL.revokeObjectURL(url))` + setTimeout fallback

### `getCachedSkinMeta()` — lightweight metadata read

```js
export async function getCachedSkinMeta() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const config = await new Promise((res, rej) => {
      const r = tx.objectStore(STORE_NAME).get("config");
      r.onsuccess = () => res(r.result ? JSON.parse(r.result) : null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return config ? { name: config.name, author: config.author } : null;
  } catch { return null; }
}
```

No blob URLs created. Used by `skins.js` for the vault list display.

### `playback.destroy()` flush

```js
// after existing sprite/pool cleanup:
if (window._pendingUnload) {
  for (const item of window._pendingUnload) {
    try { if (item.url && PIXI.Assets.cache.has(item.url)) await PIXI.Assets.unload(item.url); } catch {}
    try { if (item.url) URL.revokeObjectURL(item.url); } catch {}
    try { if (item.tex && item.tex !== PIXI.Texture.WHITE) item.tex.destroy(true); } catch {}
  }
  window._pendingUnload = null;
}
```

### `skins.js` mid-game guard

```js
async function applyLocal(id) {
  if (window.playback && !window.playback.ended) {
    localStatus.value = "Skin will apply on next game (can't swap mid-play).";
    // still cache it for next game
    const data = await loadLocalSkin(id);
    activeId.value = id;
    return;
  }
  // safe to apply immediately
  const data = await loadLocalSkin(id);
  if (data) {
    await unloadActiveSkin();
    await applySkin(data);
  }
}
```

### Edge cases handled

| Scenario | Behavior |
|----------|----------|
| First load (no cache) | `applySkin` fresh, no unload needed |
| First load (cached) | `applySkin` fresh, no unload needed |
| Switch, no game running | `unloadActiveSkin()` → `applySkin()` — immediate, clean |
| Switch mid-game | Old textures → `_pendingUnload`, applied on next `destroy()` |
| Reset to default | `clearCachedSkin()` + page reload (unchanged) |
| `loadCachedSkin` for metadata | Use `getCachedSkinMeta()` instead — no blob URLs |
| Sound blob URLs | Revoked after Howl `load` event + setTimeout fallback |
| Error during `applySkin` | `revokeAllSkinBlobs()` cleans up any leaked URLs |