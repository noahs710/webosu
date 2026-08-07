# Research 01 — Render stack vs FPS

Interprets against the provisional perf budget (ticket 09: N4000-class Chromebook, 60 FPS, p95 <= 16.6 ms). Primary sources: the webosu codebase, Pixi v7/v8 changelogs, Intel UHD 600 perf characteristics. **A real floor-device Chromebook was not available here, so this is a reasoned recommendation plus a reproducible benchmark harness to run on the target device — not a final measured verdict.**

## The workload (evidence)

webosu's per-frame work, in the `requestAnimationFrame` loop in `launchgame.js`:
- `playback.render(timestamp)` updates all in-flight hit objects (approach-circle scale, slider ball position, follow points, judgement text, combo) and the score/HP/progress overlays.
- Pixi interaction hit-testing runs every frame (unused for gameplay — input comes from window pointer events → `game.mouseX/mouseY`).
- `app.renderer.render(game.stage)` — WebGL batch of sprites + the custom `SliderMesh` (custom GLSL, custom geometry) + background BlurFilter.
- cursor + 8-sprite trail repositioned and re-z-ordered each frame.

The hot path is **many small sprites updated + re-z-ordered per frame**, plus custom slider GL. Sprite count on a dense map can reach hundreds during approach windows.

## Options vs the budget

| Approach | FPS risk on floor | Bundle | Migration cost | Verdict |
|---|---|---|---|---|
| **(a) Stay Pixi 6 + harvest wins** | low (status quo + wins) | large, but split | low | **Recommended default** |
| (b) Upgrade Pixi 6 -> 8 | medium (SliderMesh rewrite) | large, smaller via tree-shake | high (ticket 04) | only if measured win |
| (c) Raw Canvas2D | high at density (no batching) | tiny | very high (rewrite all rendering) | reject — Canvas2D re-draw of hundreds of sprites per frame is slow on UHD 600 |
| (d) Raw WebGL/WebGL2 | low if hand-optimized | tiny | very high (replace Pixi entirely) | possible, huge effort; not worth it while Pixi works |
| (e) WebGPU | unsupported on floor Chromebook | — | — | reject for the floor tier |

## Recommendation

**(a) Stay on Pixi 6.5.10 and harvest the wins that don't touch SliderMesh** is the default. The single highest-value, lowest-risk win is **disabling Pixi's `InteractionManager`** — the game reads input from window pointer events, not Pixi interaction, so the per-frame hit-testing is pure overhead. This is available on the current version, independent of any migration, and directly buys frame budget on the slowest machines. Pursue (b) Pixi 8 / (d) raw-WebGL slider path **only if a measured win on the floor device justifies the SliderMesh rewrite risk** (ticket 04) — never on assumption.

### Concrete wins to harvest on Pixi 6 (no SliderMesh changes)

1. **Disable interaction** — `new PIXI.Application({ ..., interaction: false })` (or `app.renderer.plugins.interaction` off). Verify no overlay uses Pixi `interactive`/`buttonMode` (grep: overlays use plain sprites/text, not interaction). Biggest CPU win.
2. **Object pooling** for hit objects / judgement text / approach circles — `playback.js` creates/destroys sprites around hit windows; a pool avoids GC pressure on the floor device (GC pauses = dropped frames).
3. **Cursor trail re-z-order** — calling `bringToFront()` on 8 sprites/frame re-parents them (sort/insert cost). Use a dedicated trail container drawn last, or set `zIndex` with `sortableChildren` off and rely on add-order.
4. **Background BlurFilter** — `BlurFilter` is expensive; on the floor device consider replacing blur with a cheaper CSS `backdrop-filter` on the canvas wrapper or a downsampled single-pass blur, gated on a quality setting.
5. **Lazy-load Pixi** — code-split so shell pages never fetch the 460 KB pixi blob (ticket 02).
6. **Batching hygiene** — keep approach circles, sliders, overlays in stable containers to maximize texture-batch reuse; avoid per-frame `addChild`/`removeChild` churn.

### Benchmark harness (run on the real floor device before locking the decision)

A self-contained `bench.html` (mirroring `gradetest.html`'s standalone style) that:
- Spawns N approach-circle sprites + M slider meshes at a 9* density profile (e.g. 400 sprites on-screen during peak), repositioned/re-z-ordered each frame to match `playback.render`.
- Measures `performance.now()` deltas across 1000 frames; reports FPS, p50/p95/p99 frame time, dropped-frame count.
- Compares four builds of the same workload: (1) Pixi 6 interaction-on (baseline), (2) Pixi 6 interaction-off, (3) Pixi 6 interaction-off + pooling + trail fix, (4) Pixi 8 slider-rewrite (only if step 3 doesn't meet budget).
- Decision rule: adopt the **first build that meets p95 <= 16.6 ms on the floor device**; escalate to (4) only if (3) misses.

This makes the render decision evidence-driven rather than fashion-driven — the whole point given the FPS constraint. Cite: Pixi v6 `InteractionManager` option, Pixi v7/v8 changelogs (interaction removal/EventSystem), Intel UHD 600 fill-rate limits.


## Status: harness built + extra finding

- **The benchmark harness exists** at `bench.html` (repo root). It loads the real vendored Pixi 6 build, mirrors `playback.calcSize`'s 512x384 field fit, animates approach-circle sprites with per-frame z-order churn, and exposes interaction/pool/zorder toggles with an FPS/p50/p95/p99/dropped HUD. JS syntax-verified via `node --check`. Run it on the floor device to lock the decision.
- **Extra perf finding (not in the original wins list):** `playback.render` records replay frames into `this.replayFrames` and, once it exceeds 200 000, calls `this.replayFrames.shift()` **every frame** (line ~1591). `Array.shift()` is O(n), so at cap this is ~200k element copies per frame — a real per-frame tax on slow machines. Fix: use a ring buffer (write index + capacity) instead of a shifting array. Add this to the Phase 3 wins.
