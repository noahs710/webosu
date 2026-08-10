# Plan: PixiJS v8 Blob/Background + SliderMesh + SW Fixes

**Date:** 2026-08-09
**Scope:** `src/game/playback.js:658` `src/game/SliderMesh.js` `src/game/initgame.js` `src/game/launchgame.js` `src/game/skin-loader.js` `sw.js:25`
**Skills applied:** `pixijs-assets` (parser, blob URLs, caching), `pixijs-scene-mesh` (MeshGeometry/MeshRope vs Graphics), `pixijs-performance` (destroy/GC/prepare), `pixijs-application` (init/gc options)

---

## 1. Context — What the logs prove

| Log snippet | Frequency | Verdict |
|---|---|---|
| `Uncaught TypeError: Cannot read properties of undefined (reading 'valid') at ge.getBlob/main-*.js:39529 → yt.createBackground` | Every beatmap launch | **P0 — game breaking**. Blob background never becomes valid texture. |
| `PixiJS Warning: blob:https://... could not be loaded as we don't know how to parse it` `lib-Ei2RJx-0.js:946` / `Asset id blob:... was not found in the Cache` `Cache-CrdWK_GQ.js:1` | Every launch | Same root — `Assets.load` without `parser:"texture"` for blob URLs. |
| `WebGL: OUT_OF_MEMORY: texImage2D: bad image data` `index-DomhxaPz.js:3153` x100+ | After WhiteCat 3.0 skin (806 textures) | GPU OOM from eager texture upload. |
| `SliderMesh creation failed, using Graphics fallback Error: SliderMesh geometry missing` `main-On6aEGHl.js:53745` x350+ | Every map 5430180/5589466 | Legacy geometry check on non-Mesh. |
| `Sw.js:125 Failed to convert value to 'Response'` / `GET /api/activity net::ERR_HTTP2_PROTOCOL_ERROR` | On every `/api` fetch offline/DNS fail | `sw.js:32` returns rejected promise, not a Response. |
| `Texture managed by Assets was destroyed instead of unloaded! Use Assets.unload()` + `split` at `FilterSystem-BobUsbaM.js:19482 skin-loader-CbMqUDZ0.js:5715` | On skin switch | `Texture.destroy()` on Assets-managed texture. |
| `POST /api/pp/rosu 422` / `GET api.catboy.best net::ERR_NAME_NOT_RESOLVED` | Every score | External service dead; not blocking (webhook 200). |

Other logs (`[curve] L/B shorter`, `mp3 offset predictor`) are benign.

---

## 2. PixiJS v8 Principles to enforce

From `pixijs-assets/SKILL.md` + `pixijs-performance/SKILL.md`:

1. **Never `Texture.from(blobURL)` to load.** In v8 `Texture.from` only reads cache. Use `await Assets.load({src: blobURL, parser:"texture", data:{scaleMode:"linear", autoGenerateMipmaps:false}})`. `parser` must be top-level, not in `data`. Applies to `playback.js` background *and* `initgame.js` legacy base64 path.

2. **Blob/ObjectURLs have no extension → must force parser.** Resolver cannot infer loader. Same for `src/game/skin-loader.js:327` — already correct there (`parser:"texture"`). Reuse that pattern for playback.

3. **Cache: `Assets.get`/`Assets.cache.get` for hit, `Assets.unload` for release.** Never `texture.destroy(true)` on a texture that came from `Assets.load`. For backgrounds that are ephemeral blobs, `Assets.unload(src)` or `URL.revokeObjectURL` after `renderer.prepare.upload` or `source.once("loaded")`.

4. **Mesh vs Graphics:** `pixijs-scene-mesh/SKILL.md` — `Mesh` subclasses (`MeshRope`, `MeshPlane`, `MeshSimple`) require `MeshGeometry` with `positions/uvs/indices/topology`. `Mesh` is leaf (`allowChildren=false`). Current `SliderMesh.js:15` is **not a Mesh** — it's a `Container` wrapping a single `Graphics`. That's intentional (ponytail: "200 LOC shader → Graphics polyline"). Don't pretend it has `geometry`; remove the dummy `get geometry(){return {dummy:true}}` and the `geometry missing` check in `playback.js:922`.

5. **Performance:** `pixijs-performance` — `GCSystem` via `app.init({gcActive, gcMaxUnusedTime, gcFrequency})`, `PrepareSystem` (`import "pixi.js/prepare"; await app.renderer.prepare.upload(container)`), `cullable/cullArea`, `app.destroy({releaseGlobalResources:true})`, stagger bulk destroys.

---

## 3. Fix Design

### 3.1 Fix A — Background blob → texture (`src/game/playback.js:658-732`) — P0

**Current code** `playback.js:664-711`:
```js
bgTexture = await PIXI.Assets.load({src: uri, parser:"texture"});
if (!bgTexture || !bgTexture.valid) bgTexture = PIXI.Texture.from(uri); // WRONG per skill
// then checks source.load, fallback to WHITE
```

**Problems:**
- `Texture.from` path is invalid and triggers `valid` undefined.
- No `data:{scaleMode, resolution, autoGenerateMipmaps}`.
- `render({container:sprite, target:texture})` fallback tries old signature incorrectly.
- Revoke timing uses `source.once("update")` which never fires for already-valid textures; leak.
- Old background `oldTex.destroy(true)` should be `Assets.unload`.

**Proposed (per `pixijs-assets`):**
```js
async function loadBackground(uri){
  glog("playback","loadBackground", uri.slice(0,60));
  let bgTexture = null;
  const isBlob = uri.startsWith("blob:");
  try{
    // force parser for blob URLs
    bgTexture = await PIXI.Assets.load({
      src: uri,
      parser: "texture",
      data: { scaleMode:"linear", autoGenerateMipmaps:false, resolution:1 }
    });
    // ensure GPU-ready — PrepareSystem avoids first-frame hitch
    try{ await window.app.renderer.prepare.upload(bgTexture); }catch{}
  }catch(e){
    gdebug("playback","Assets.load bg failed", e.message);
    // fallback to direct load with correct parser again (retry strategy per LoadOptions)
    try{
      bgTexture = await PIXI.Assets.load(
        {src: uri, parser:"texture", data:{scaleMode:"linear"}},
        {strategy:"retry", retryCount:1}
      );
    }catch{ bgTexture = null; }
  }
  // strict valid check per v8: use texture.source.valid / texture.valid
  if(!bgTexture || (!bgTexture.valid && !bgTexture.source?.valid)){
    gwarn("playback","bgTexture invalid, using default");
    bgTexture = PIXI.Texture.WHITE;
    // clean blob if we failed
    if(isBlob) try{ URL.revokeObjectURL(uri);}catch{}
  }
  let sprite = new PIXI.Sprite(bgTexture);
  // blur path unchanged but use source dimensions
  const w = bgTexture.source?.width || bgTexture.width || 1920;
  const h = bgTexture.source?.height || bgTexture.height || 1080;
  // render to RenderTexture for blur
  let rt = PIXI.RenderTexture.create({width:w, height:h, resolution:1});
  try{
    // v8 render options object
    await window.app.renderer.render({container: sprite, target: rt});
  }catch(e){ // compat shim if renderer is old
    window.app.renderer.render(sprite, {renderTexture: rt});
  }
  if(isBlob){
    // revoke only after GPU upload — prepare ensures it
    try{ URL.revokeObjectURL(uri); }catch{}
    // also unload from Assets cache so blob key doesn't pin memory
    try{ await PIXI.Assets.unload(uri); }catch{}
  }
  // destroy previous rt correctly
  if(self.background){
    const oldTex = self.background.texture;
    try{ self.game.stage.removeChild(self.background); }catch{}
    try{ self.background.destroy({children:true, texture:false}); }catch{}
    if(oldTex && oldTex !== PIXI.Texture.WHITE && oldTex !== bgTexture){
      try{ oldTex.destroy(true); }catch{} // rt, not Assets-managed
    }
  }
  self.background = new PIXI.Sprite(rt);
  // ... anchor/scale/alpha as before
}
```

**Also fix caller `playback.js:750-755`:**
- `entry.getBlob` → create blob url → `loadBackground` already handles revoke. Keep but add `loadBackground` await.
- For non-blob fallback `"img/defaultbg.jpg"` — no `parser` needed (has extension), but keep `parser:"texture"` optional; auto-detection works.

**Verification:** Launch maps 5430180, 5590612 — no `valid` crash, no `could not be loaded as we don't know how to parse it`, background appears, single `background added` log.

---

### 3.2 Fix B — SliderMesh lifecycle (`src/game/SliderMesh.js` + `src/game/playback.js:914-957`)

**Current:** `SliderMesh` is a `Container` with `Graphics` (`_g`). `playback.js:922` checks `if(!hit.curve || !hit.curve.curve.length<2) throw` then `new SliderMesh(...)`; then `playback.js:926` comment says "geometry check is legacy GL; Graphics always has geometry after first draw, so skip" — but older bundled `main-*.js:53745` still throws `geometry missing` and falls back to manual Graphics (350 times per map). `SliderMesh.js:211 get geometry(){return {dummy:true}}` hides true check.

**Decision per `pixijs-scene-mesh`:** Do NOT convert to `MeshRope` unless visual regression needed. Current Graphics path is correct for webosu (opaque sliders, dim, no shader). Keep ponytail approach. Remove the legacy error path.

**Changes:**
1. `src/game/SliderMesh.js:15` — Keep as `extends PIXI.Container`. Remove dummy `get geometry()` (lines 211-212) — it's misleading. Add explicit comment `// Not a PIXI.Mesh; uses Graphics. Do not check .geometry`.
2. `src/game/SliderMesh.js:67-72` `render(renderer)` — In v8, `Container.render` is not the right hook; prefer `update` dirty in ticker. Keep but ensure `_draw` called before render via `this._dirty` flag set on `startt/endt` setters (already).
3. `src/game/playback.js:914-957` `createSlider` — Remove try/catch that logs `SliderMesh geometry missing` as error. Replace with:
```js
let body = new SliderMesh(hit.curve, this.circleRadius, hit.combo % combos.length);
body.visible = true; body.eventMode='none'; body.cullable=false;
// no geometry check — Graphics path always valid
```
Keep fallback `new PIXI.Graphics()` only for true exception (e.g., OOM), but downgrade log to `gdebug`.

**Per `pixijs-performance` culling:** Keep existing `cullable` logic in `SliderMesh.js:50-55` but document that `cullable` only works if `CullerPlugin` registered via `extensions.add(CullerPlugin)` before `app.init`. Currently `playback.js:92` toggles `gamefield.cullable` via URL param — verify plugin is added in `src/game/pixi.js:3` or `launchgame.js:38`.

**Verification:** Launch 5430180 — `SliderMesh initialized` once, zero `fallback Graphics slider drawn` spam (or only filtered to debug). Visual sliders opaque on dim.

---

### 3.3 Fix C — Skin loader + initgame cache handling (`src/game/skin-loader.js`, `src/game/initgame.js:94-122`, `src/vue/pages/skins.js`)

**Already good:** `skin-loader.js:327` uses `parser:"texture"` + cache check. Keep.

**Fixes:**
1. `src/game/initgame.js:214` `PIXI.Texture.from("data:image/png;base64,"+...)` — This is valid for data URLs (synchronous cache creation), but per skill should still go through `Assets`. For base64 legacy skins, either keep `Texture.from` (data URL has parsable extension via MIME) or migrate to `Assets.load({src:dataUrl, parser:"texture"})`. No action required unless `could not be loaded` recurs for data URLs. Add comment referencing skill exception.

2. `src/game/skin-loader.js:354` already does `delete` not `destroy` for managed textures — correct per skill. Ensure `src/vue/pages/skins.js` switch path does not call `Texture.destroy` directly. Audit `skins.js` — it delegates to `skin-loader.js` `applySkin`, so safe.

3. **OOM guard already in `skin-loader.js:217` `MAX_TEXTURES 60/40`** — keep. Verify `pixijs-performance` guidance on `GCSystem`: add to `launchgame.js:39`:
```js
await app.init({
  width:..., height:...,
  resolution: ...,
  background:0x111111, autoDensity:true,
  gcActive:true, gcMaxUnusedTime:60_000, gcFrequency:30_000,
  // also expose texture GC deprecated alias handling
});
```

4. **Destroy vs Unload audit:** `playback.js:717 oldTex.destroy(true)` is correct for `RenderTexture` (not Assets-managed). For skin textures, ensure `Assets.unload(uri)` is used (as in Fix A). Add lint rule.

**Verification:** Import WhiteCat 3.0 `.osk` (806 pngs) → `skin-loader filtered textures 60 from 806` (or 40 low-end), no `WebGL: OUT_OF_MEMORY`, no `split` error on skin switch.

---

### 3.4 Fix D — Service Worker (`sw.js:25-58`) — P2

**Current:**
```js
if (url.pathname.startsWith("/api") || url.hostname.indexOf("catboy.best")!==-1){
  e.respondWith(fetch(req)); // no catch → rejected promise != Response
}
```

**Per spec, `respondWith` must resolve to `Response`.**

**Proposed:**
```js
if (url.pathname.startsWith("/api") || url.hostname.includes("catboy.best")){
  e.respondWith(
    fetch(req).catch(()=> new Response(JSON.stringify({error:"offline"}),{
      status:504, headers:{"Content-Type":"application/json"}
    }))
  );
  return;
}
// navigations
if (req.mode==="navigate"){
  e.respondWith(
    fetch(req).catch(()=> caches.match("/index.html").then(r=> r || new Response("offline",{status:503})))
  );
  return;
}
// cache-first
if(url.origin===self.location.origin){
  e.respondWith(
    caches.match(req).then(hit=>{
      if(hit) return hit;
      return fetch(req).then(res=>{
        if(res && res.status===200 && res.type==="basic"){
          const copy=res.clone();
          caches.open(CACHE).then(c=>c.put(req,copy));
        }
        return res;
      }).catch(()=> hit || new Response("",{status:504}))
    })
  );
}
```

**Verification:** Offline /api/activity no longer throws `Failed to convert value to 'Response'`; `EventSource` still fails but SW returns 504 not crash.

---

### 3.5 Fix E — Application lifecycle (`src/game/launchgame.js:38-45`, `src/game/initgame.js:90-99`)

- `src/game/launchgame.js:39` `app.init` add `gcActive/gcMaxUnusedTime/gcFrequency` per `pixijs-performance/SKILL.md` (avoid deprecated `textureGC.*`).
- `src/game/launchgame.js:198` `window.app.destroy(true)` → `window.app.destroy({removeView:true, releaseGlobalResources:true})` per Critical mistake in `pixijs-performance`. Prevents pooled batches leaking between games.
- `src/game/pixi.js:3` — Add `import "pixi.js/prepare"` to enable `renderer.prepare.upload` used in Fix A.
- Verify `CullerPlugin` if `?cull=true` wanted: `import {extensions, CullerPlugin} from "pixi.js"; extensions.add(CullerPlugin);` before `app.init` (optional, behind flag).

---

## 4. Non-Goals

- `api.catboy.best` DNS resurrection — out of scope; just suppress score submission errors or gate behind feature flag.
- `POST /api/pp/rosu 422` — backend validation; not Pixi.
- `[curve] L/B shorter than given` — osu! curve rounding, benign.

---

## 5. Implementation Order & Risk

1. **Fix A (playback background)** — Highest impact, touches one file. Low risk; fallback to WHITE keeps game playable. Test on 3 maps + defaultbg.
2. **Fix D (sw.js)** — 5-line change, low risk, improves offline.
3. **Fix B (SliderMesh)** — Remove noisy throw, verify no regression in slider visuals (shadow/border/fill). Medium risk if removing dummy geometry breaks old bundles — keep dummy for back-compat but silence log.
4. **Fix C/E (GC + destroy)** — Add `prepare` import, `gc*` options, `releaseGlobalResources`. Low risk, improves memory.
5. **Fix C skin audit** — Verify no other `Texture.destroy` on Assets-managed textures (grep `\.destroy(`).

---

## 6. Verification Plan

- **Manual:** Launch beatmaps `5430180 Nogard`, `5590612 N-NORMAL`, `5590608 E-EXTRA`, `5589466 Petals` — assert no console `valid` crash, no `could not be loaded` for blob, background visible, sliders opaque, no OOM on WhiteCat skin.
- **DevTools:** Performance tab — check GPU memory, draw calls batched (sprites before graphics). `?cull=true` vs false.
- **SW:** Offline mode — `/api/activity` returns 504 not unhandled rejection; console no `Failed to convert value to 'Response'`.
- **Skin switch:** Import WhiteCat 806 pngs → filtered 60, switch 3 times — no `destroy` warning, no `split` error.

---

## 7. Open Questions for Owner

- Confirm keeping `SliderMesh` as `Container+Graphics` (ponytail) vs migrating to true `MeshRope` for textured sliders (`?gradient=textured`)? Current Graphics is faster and bug-free.
- Accept `gcMaxUnusedTime 60s / gcFrequency 30s` defaults or tune lower for low-mem devices (40 cap already)?
- Should we disable `api.catboy.best/score` submission entirely (DNS dead) and rely solely on `/api/webhook/score`?

---
*Generated with `pixijs-assets`, `pixijs-scene-mesh`, `pixijs-performance`, `pixijs-application` skills.*
