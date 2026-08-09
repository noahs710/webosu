## Context

Pixi 8 migration is functionally complete (45→8.19) but left 7 audit threads that now cause OOM per-note and `bgTexture invalid` fallback. `src/game/SliderMesh.js` was already replaced from shader to Graphics, but without dirty-flag it still does 825 strokes/frame. `src/game/skin-loader.js` caps at 120 but `applySkin` used `new Image()` with `src` after `Texture.from(img)` race and `baseTexture` deprecation. `src/game/playback.js` `createBackground` used `Texture.from(blob:)` which hits `Assets` cache miss warning and `valid` check on undefined `source.resource`. `server/auth.js` uses `dev-secret-change-me` in prod, `zipfs.js`/`skin-loader` have no zip-bomb guards, `server/app.js` `setHeaders` uses `res.setHeader` which fails on Fastify 5 + `@fastify/static` 10.

## Goals / Non-Goals

**Goals:**
- No per-note `OUT_OF_MEMORY` with WhiteCat 806-file skin (cap + lazy `Image` + `revokeObjectURL`)
- Default skin sliders visible (Graphics path correct, `alpha` not shadowed, `startt/endt` dirty)
- Background valid via `Assets.load` (no `baseTexture` warning, no `valid` crash, `render({container, target})`)
- Silence per-slider `gerror` flood (was 400+ logs/map) → `gdebug` or gated
- Harden `JWT`, zip, header/XSS, WS with one-liners

**Non-Goals:**
- Re-introduce shader for sliders (Graphics is ~10% CPU, acceptable; shader can return if `Graphics` > p95 16.6ms)
- Full `Cache-API` for beatmaps or `argon2` migration

## Decisions

**D1: Keep Graphics, add dirty-flag** — Slider `curve` never changes mid-slider, only `startt/endt` for snake. 3 `stroke()` calls per slider per frame is 825 calls; with dirty flag it's 2 calls only when `startt/endt` changes (snake). Rationale: Simpler than shader, no GL leaks, easy to verify via `bench.html`.

**D2: `Assets.load` for blob URLs, not `Texture.from`** — `Texture.from(blob:)` triggers `Assets` cache miss warning and `valid` race. `await Assets.load({src: blobUrl})` properly caches and decodes. Fallback to `Texture.from` only on catch.

**D3: `revokeObjectURL` after `source.resource.load()`** — Leak is 60+ blob URLs per skin switch. Revoke after `tex.valid` ensures GPU upload done.

**D4: `isGameplayTexture` whitelist + `MAX 120` + `followpoint>9` skip** — OOM was 806 textures × 256²×4 ≈ 200MB. Whitelist keeps only `hit`/`default-`/`score` digits, `followpoint 0-9`, `sliderb`, `combos-`→`score-` mapping. Alternative was LRU eviction — more code, same cap.

**D5: `JWT_SECRET` throw in prod, `TOKEN_TTL 7d`** — Stdlib `crypto` not needed, just guard fallback. `zip` guards use `ab.byteLength`/`Object.keys` counts — stdlib `fflate` already gives `Uint8Array`.

**D6: `setHeaders` compat wrapper** — `res.setHeader` vs `res.header` vs `res.raw.setHeader` — one function handles `@fastify/static` 8 and 10 without pinning version.

## Risks / Trade-offs

- [Graphics 3 strokes per slider → 2 strokes still 550 calls/frame for 275 sliders] → Mitigation: dirty flag reduces to ~2 calls only on snake, p95 should stay <16.6ms; if not, revert to shader with correct `uSampler2.destroy`
- [Blob URL revoke too early → texture not yet uploaded] → Mitigation: revoke after `await source.resource.load()` or `texture.on('update')`, not immediately after `Texture.from`
- [`Assets.load` for blob may still warn if not cached] → Mitigation: `Assets.cache.set` after load

## Migration Plan

1. Apply `skin-loader` whitelist + `applySkin` `Assets.load` + `revoke`
2. Apply `SliderMesh` dirty-flag + remove `alpha` defineProperty + fix `geometry` getter
3. Apply `playback` `loadBackground` `Assets.load` + `render({container, target})` + `valid` guard
4. Apply `server` hardening (JWT, zip, headers, WS)
5. `npm run build` + `npm test` (39 pass) + `headless:play` 0 pageerrors, manual WhiteCat test

## Open Questions

- Should `followpoint` animation be throttled to 12fps vs 60fps for GPU?
- Keep `logger.js` as `console` passthrough or delete file entirely (YAGNI)?
