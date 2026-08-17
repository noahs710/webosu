# WebGPU + OffscreenCanvas Research (T08)
(citations: spec section + browser docs + Pixi release notes)

Research ticket T08. Research only — no code changes, no follow-up tickets created.
All claims cite the spec section, browser doc, Pixi release note, or prior research
artifact. Where browser behaviour diverges from spec or is uncertain, it is noted
explicitly. Primary sources fetched 2026-08-17.

New sources fetched for this ticket:
- Pixi v8.19.0 release notes: https://github.com/pixijs/pixijs/releases/tag/v8.19.0
  (and `api.github.com/repos/pixijs/pixijs/releases/latest` → `tag_name: v8.19.0`,
  published 2026-06-04 — confirms 8.19.0 is latest stable as of 2026-08-17)
- caniuse WebGPU: https://caniuse.com/webgpu (global usage 83.99% + 1.57% partial)
- caniuse OffscreenCanvas: https://caniuse.com/offscreencanvas (95.21% global)
- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
  (notes `WorkerNavigator.gpu` for worker usage; secure-context-only)
- MDN OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
  (Baseline widely available since March 2023; transferable; worker RAF supported)
- `pixijs-environments` skill (DOMAdapter.set / WebWorkerAdapter / OffscreenCanvas
  init pattern)

Prior research reused (not re-fetched):
- `docs/wayfinder/research/lazer-source-audit.md` points 12, 14, 15
- `docs/wayfinder/research/browser-timing-floor.md` points 5, 8 + Practical floor

Webosu code read for the cost/benefit section (no modifications):
- `src/game/launchgame.js` (Application init, gameLoop, cursor layer)
- `src/game/playback.js` (render loop; `window.game.*` and `document.*` references)
- `src/game/playerActions.js` (input handlers attached to `window`)
- grep of `window.game.*` across `src/` (68 matches across 7 files)

---

## Prior findings (from T02 + T05)

- **lazer-source-audit.md #14 (WebGPU in Pixi 8):** Pixi 8.19.0 has a first-class
  `WebGPURenderer` (`preference: "webgpu"` in `Application.init()` / `autoDetectRenderer`),
  shipping since v8.0.0. Pixi auto-falls back to WebGL when WebGPU is unavailable.
  Production-ready for the renderer surface Pixi uses (sprites, graphics, text, meshes,
  filters). Known caveats: stricter texture formats, less-mature context loss/recovery,
  not in workers on all browsers, a few filter-pipeline bugs in point releases.
  Recommendation was `preference: "webgpu"` with WebGL fallback.
- **lazer-source-audit.md #15 (OffscreenCanvas + worker):** Pixi 8 supports non-DOM
  environments via `DOMAdapter.set(WebWorkerAdapter)`; an `Application` can be
  constructed with an `OffscreenCanvas` passed via `app.init({ canvas })`. What
  breaks: input events (worker has no DOM — must postMessage in), `FontFace` via
  Font Loading API (use bitmap fonts instead), `HTMLText` / `DOMContainer` / video
  textures (need DOM), `Image` in asset loader (falls back to `createImageBitmap`).
  WebGL context creation works in workers. Recommended: keep renderer on main thread
  for webosu's input-latency-critical loop; consider worker only if profiling shows
  render-thread jank causing input misses.
- **browser-timing-floor.md #5 (WebGPU + input):** WebGPU does NOT give sub-frame
  timing for input. `GPUQueue.onSubmittedWorkDone()` is a completion signal on the
  queue timeline, not a per-frame callback; `timestamp-query` is coarsened to 100μs
  (worse than `performance.now()` under COOP/COEP) and never improved by cross-origin
  isolation. WebGPU rendering happens whenever the app encodes and submits — no spec
  tie to RAF. No latency improvement over WebGL beyond throughput.
- **browser-timing-floor.md #8 (OffscreenCanvas + worker input):** Input still
  originates on the main thread; no spec'd way to receive PointerEvents in a worker.
  Input reaches the worker via postMessage (adds ~0.1–1ms P50, ~1–5ms P95). The
  benefit is that the worker's task queue is not contended with main-thread
  rendering/GC/event-handler work, so P95 jitter from main-thread contention is
  reduced. Net: P50 floor unchanged (vsync-quantized), P95 tail can improve.
- **browser-timing-floor.md Practical floor:** ~9ms P50 / ~20ms P95 at 60Hz,
  dominated by vsync quantization of input delivery, NOT by timestamp granularity
  or renderer choice. Narrowing the floor means narrowing the input delivery path,
  not the renderer.

---

## 1. Pixi 8 WebGPU status

Pixi v8.19.0 (latest stable as of 2026-08-17, published 2026-06-04 per
`api.github.com/repos/pixijs/pixijs/releases/latest`) ships a first-class
`WebGPURenderer`. `preference: "webgpu"` in `Application.init()` selects WebGPU
and silently falls back to WebGL when unavailable. Browser support per caniuse
(fetched 2026-08-17): Chrome ≥113, Edge ≥113, Chrome Android ≥121, Safari 26.0+
(full on iOS 26.0+, partial on desktop 26.0–26.5/TP), Opera ≥99, Samsung Internet
≥24; Firefox is still **disabled by default** through 153–156 (behind
`dom.webgpu.enabled`). Global usage 83.99% + 1.57% partial = 85.56%. **Correction
to lazer-source-audit #14:** Safari has now shipped WebGPU (in Safari 26, not
"behind a flag in TP only" as the prior research stated) — desktop is still marked
partial through 26.5/TP, but iOS 26.0+ is full. WebGPU is a **throughput** win
(cheaper draw calls, compute-based culling/particles, modern GPU features) per
MDN WebGPU API "Concepts and usage"; it does **not** improve render *latency*
relative to WebGL — both submit-then-present on vsync boundaries, and the
compositor cadence is unchanged (see §2). So `preference: "webgpu"` is
production-ready for ~85% of users (Chrome/Edge/Safari 26+/Chrome-Android) with
automatic fallback for the rest.

Citations: Pixi v8.19.0 release notes (github.com/pixijs/pixijs/releases/tag/v8.19.0);
caniuse WebGPU (fetched 2026-08-17); MDN WebGPU API (Concepts and usage,
Navigator.gpu / WorkerNavigator.gpu); lazer-source-audit.md #14 (Pixi production
readiness, fallback behaviour, known caveats).

## 2. WebGPU render timing

WebGPU does not change the input/render timing model. Per browser-timing-floor #5
(citing WebGPU §19.2 `GPUQueue.onSubmittedWorkDone` Promise semantics, §20.4
timestamp-query coarsened to 100μs with `crossOriginIsolatedCapability=false`,
§2.1.7.2 device/queue-timeline security note), WebGPU rendering happens whenever
the app encodes a command buffer and calls `queue.submit()` — there is **no spec
tie to RAF**. In practice a WebGPU render loop is driven by the app's own
scheduling (RAF on the main thread or `DedicatedWorkerGlobalScope.requestAnimationFrame`
in a worker), and the GPU work executes asynchronously on the queue timeline.
The compositor still presents on vsync boundaries; WebGPU does not submit "tighter"
than WebGL — both feed the same compositor/vsync pipeline. lazer-source-audit #12
confirms: "WebGPU does not change the input/render timing model — `device.queue.onSubmittedWorkDone()`
is async; WebGPU rendering still happens within the RAF callback on the main thread
(or in a worker via OffscreenCanvas). No latency improvement over WebGL beyond
throughput." So the answer to the ticket's question is: WebGPU renders during the
RAF callback (because that's when the app calls `submit()`), submits to the
compositor with the **same vsync cadence** as WebGL, and there is no tighter path.
The win is throughput (more draw calls per frame, cheaper state changes), not
input-to-judgement latency.

Citations: WebGPU §19.2, §20.4, §25.9, §2.1.7.2 (via browser-timing-floor.md #5);
lazer-source-audit.md #12 (WebGPU timing model confirmation); MDN WebGPU API
("Pipelines and shaders", queue.submit flow).

## 3. OffscreenCanvas + Pixi 8

Yes — Pixi 8's `Application` works with `OffscreenCanvas`. Per the
`pixijs-environments` skill, the pattern is: main thread creates an
`OffscreenCanvas` via `htmlCanvas.transferControlToOffscreen()`, transfers it to
a worker via `postMessage({ canvas }, [canvas])`, and the worker runs
`DOMAdapter.set(WebWorkerAdapter)` **before** `new Application()` (this is critical
— the adapter is read during `app.init()`), then `await app.init({ canvas, ... })`.
The renderer (WebGL or WebGPU) runs inside the worker on a separate thread. What
breaks (per skill + lazer-source-audit #15):

- **Input events:** the worker has no DOM access; Pixi's `EventSystem` does not
  auto-receive pointer/keyboard events. Main thread must transform `clientX/Y` to
  canvas-local and `postMessage` them in. Pixi's `pixi.js/webworker` subpath
  deliberately omits `accessibility`, `dom`, and `events` extensions for this
  reason.
- **Font loading:** `FontFace` via the Font Loading API (`document.fonts`) is
  unavailable — the `WebWorkerAdapter`'s `getFontFaceSet` returns null. Must use
  pre-converted bitmap fonts (`BitmapFont.install` or `.fnt` assets) instead.
  webosu uses skin font textures (per `score.js:496` `skinConfig.scorePrefix`) and
  `BitmapText`-style rendering, so this is mostly OK — but any `Text` (canvas
  font) usage would need auditing.
- **HTMLText / DOMContainer:** require a DOM; do NOT work in a worker. webosu uses
  `Text` and skin textures, not `HTMLText` — OK.
- **Video textures:** `HTMLVideoElement` is not available in workers; Pixi's video
  texture path breaks. **webosu uses video backgrounds** (`playback.js:964`
  `document.createElement("video")`) — this would break in a worker render path
  and need a main-thread-decode + transferToImageBitmap bridge, or be disabled.
- **Asset loading:** `Image`/`HTMLImageElement` unavailable; Pixi falls back to
  `createImageBitmap` (available in workers). Most texture formats work.
- **WebGL context creation:** works via `OffscreenCanvas.getContext("webgl")`;
  some older extension support is flaky in workers but Pixi 8 handles common cases.
- **Canvas display:** preferred path is `transferControlToOffscreen()` so the
  worker renders directly to the visible canvas (no copy back); the alternative is
  `transferToImageBitmap()` + post back to main thread (adds a copy).
- **`document`/`window` references in game code:** webosu's `playback.js` reads
  `document.getElementById` for the pause menu (`playback.js:486,516-519,527,555,610`),
  `document.createElement("video")` for video bg (`playback.js:964`), and 68+
  `window.game.*` reads across 7 files (per grep). All of these would need a
  message-passing shim or to remain on the main thread.

Citations: `pixijs-environments` skill (DOMAdapter.set, WebWorkerAdapter,
`pixi.js/webworker` subpath, what-doesn't-work list); MDN OffscreenCanvas
(transferable, `transferControlToOffscreen`, worker usage, Baseline March 2023);
lazer-source-audit.md #15 (Pixi 8 worker support matrix, what breaks); webosu
source `src/game/playback.js:486-610,964` and `src/game/launchgame.js:51-66`
(read-only, not modified).

## 4. Worker render + input latency

It does BOTH, depending on which percentile you measure. Per browser-timing-floor
#8 (citing MDN OffscreenCanvas, MDN `DedicatedWorkerGlobalScope.requestAnimationFrame`
Baseline March 2023, caniuse OffscreenCanvas 95.21%), input still originates on
the main thread — there is no spec'd way to receive PointerEvents directly in a
worker (OffscreenCanvas does not capture pointer events; they target DOM elements
on the main thread's document). Input reaches the worker via `postMessage` from
the main thread (HTML Web Messaging), which adds latency: a structured-clone
postMessage round-trip is typically **0.1–1ms P50** on an idle main thread and
**1–5ms P95** under load (no spec guarantee; measured/implementation-defined).
The **benefit** is that the worker's task queue is not contended with the main
thread's rendering/GC/event-handler work, so P95 jitter from main-thread
contention is reduced — the worker's RAF callback runs vsync-quantized but
without main-thread blocking. Net effect: the **floor (P50) does not change**
(still vsync-quantized at ~9ms P50 / ~20ms P95 at 60Hz per browser-timing-floor
Practical floor), but the **tail (P95/P99) can improve** because the render loop
is insulated from main-thread stalls. So the postMessage hop is slightly slower
on P50 (adds ~0.5ms), but the removal of main-thread contention is faster on P95
(can save ~2–4ms of contention jitter) — the win is on the tail, not the floor.
The map's destination attacks the "compositor vsync" delta classified "not
reducible"; this attack does NOT reduce that floor. It only helps if T07's
profiling shows main-thread contention actually causing P95 stalls.

Citations: browser-timing-floor.md #8 (postMessage hop latency, P50/P95 effect,
vsync floor unchanged); MDN DedicatedWorkerGlobalScope.requestAnimationFrame
(Baseline March 2023, owner-window vsync alignment); MDN OffscreenCanvas
(transferable, worker usage); caniuse OffscreenCanvas (95.21% global).

## 5. WebGPU + OffscreenCanvas combined

Yes — WebGPU can run on an `OffscreenCanvas` in a worker, on Chrome/Edge. Per
MDN WebGPU API ("Accessing a device"): "`Navigator.gpu` (or `WorkerNavigator.gpu`
if you are using WebGPU functionality from inside a worker) returns the GPU object
for the current context." lazer-source-audit #14 notes WebGPU-in-worker is
Chrome/Edge only (Firefox/Safari N/A since they didn't ship WebGPU at the time);
with Safari 26 now shipping WebGPU on iOS (per caniuse fetched 2026-08-17),
Safari's *worker* WebGPU support is plausible but **not confirmed** in the fetched
sources — flagged as uncertain. The combined path is: main thread creates canvas,
`transferControlToOffscreen()`, posts to worker; worker runs
`DOMAdapter.set(WebWorkerAdapter)`, `app.init({ canvas, preference: "webgpu" })`;
Pixi auto-falls back to WebGL-in-worker if WebGPU is unavailable in the worker
context. So the combined attack is technically feasible on Chrome/Edge today
(~70–80% of users), with WebGL-in-worker as the universal fallback. The
limitations of §3 (input, fonts, video textures, DOM refs) all still apply, plus
the WebGPU-in-worker support matrix is narrower than WebGL-in-worker. Net: the
combined path has the **same P50 floor** as either attack alone (vsync-quantized)
and the same P95 tail benefit as the worker-render attack (§4); WebGPU adds
throughput headroom but not latency.

Citations: MDN WebGPU API (`WorkerNavigator.gpu`, worker usage); lazer-source-audit.md
#14 (WebGPU-in-worker Chrome/Edge only); caniuse WebGPU (fetched 2026-08-17,
Safari 26 iOS full, desktop partial); `pixijs-environments` skill
(`preference: "webgpu"` with `WebWorkerAdapter`). Uncertainty: Safari worker WebGPU
support not confirmed from fetched sources.

## 6. Cost/benefit

**WebGPU-only cost (webosu-specific):** trivial. `launchgame.js:62` currently
hard-codes `preference: "webgl"`. Switching to `preference: "webgpu"` is a
one-line change; Pixi auto-falls back to WebGL when WebGPU is unavailable, so no
feature-detection code is needed. Risk: the v8.19.0 release notes list a
WebGPU-specific `transientAttachment` MSAA feature (#12050) and note filter
pipeline bugs in point releases — webosu uses `FillGradient` slider bodies
(`SliderMesh.js`) and `MeshRope` (slider style 2) which exercise the filter/mesh
paths, so a smoke test on Chrome/Edge is needed. Expected latency win: **none on
P50** (vsync floor unchanged per §2), **possible P95 improvement** if WebGPU's
throughput headroom prevents frame-budget misses on heavy beatmaps (e.g. many
slider meshes + cursor trail at 2× DPI). The win is indirect (fewer dropped
frames → fewer visible judgement delays), not a direct input-to-judgement
reduction.

**OffscreenCanvas worker-render cost (webosu-specific):** large. The render loop
is `gameLoop` at `launchgame.js:275-349`, tightly coupled to
`game.scene.render(timestamp)`, cursor-layer manipulation (`game.cursorLayer`,
`game.cursor`, `game.cursorTrail`), `game.mouseX/Y`, `app.renderer.render(game.stage)`,
and `window.requestAnimationFrame(gameLoop)`. `playback.js` (3398 lines) reads
`window.game.*` in 68+ places across 7 files (per grep) and uses
`document.getElementById` for the pause menu (`playback.js:486,516-519,527,555,610`)
and `document.createElement("video")` for video backgrounds (`playback.js:964`).
Input handlers are attached to `window` in `playerActions.js:573-580`
(mousemove/mousedown/mouseup/keydown). Porting to worker means: (a) split input
handlers to `postMessage` to worker with canvas-space coords; (b) port the 68+
`window.game.*` reads to a message-passing shim (or keep game state on main
thread and post snapshots); (c) handle video background — either disable in
worker mode or bridge via main-thread decode + `transferToImageBitmap`; (d) keep
pause menu DOM on main thread (it's overlay HTML, not Pixi-rendered); (e) audit
all `Text` usage for `FontFace` dependence (skin font textures are fine; any
canvas-font `Text` would need bitmap conversion); (f) move cursor-layer rendering
to worker but cursor position still comes from main-thread input (another
postMessage hop). Expected latency win: **none on P50** (vsync floor unchanged
per §4), **P95 tail improvement** IF main-thread contention is actually causing
P95 stalls — which T07's profiling must confirm before this cost is justified.
Without that profiling, the win is speculative.

**Combined cost:** the OffscreenCanvas worker-render cost **plus** changing the
`preference` to `"webgpu"` inside the worker's `app.init`. Compounding risk:
WebGPU-in-worker has a narrower support matrix (Chrome/Edge), so the fallback
chain is WebGPU-worker → WebGL-worker → (if worker init fails entirely)
WebGL-main-thread. The P50 floor is still unchanged; the P95 benefit is the same
as worker-render alone (§4); WebGPU adds throughput headroom but not latency.

**vs. expected latency win (cited from T05):** the practical floor is ~9ms P50 /
~20ms P95 at 60Hz, dominated by vsync quantization of input delivery
(browser-timing-floor Practical floor). Neither WebGPU nor OffscreenCanvas
reduces that floor. Both are **tail (P95) optimizations**, not floor
optimizations. The map's destination attacks the "compositor vsync" delta
classified "not reducible" — neither attack reduces it. WebGPU is nearly free to
try and might indirectly help P95 by preventing dropped frames. OffscreenCanvas
worker is expensive and only justified if T07's profiling shows main-thread
contention causing P95 stalls; without that evidence the win is speculative and
the cost is a major refactor of a 3398-line render loop with 68+ `window.game`
references.

Citations: webosu source `src/game/launchgame.js:51-66,275-349` (Application
init, gameLoop), `src/game/playback.js:486-610,964` (pause menu, video bg),
`src/game/playerActions.js:573-580` (input handlers), grep of `window.game.*`
(68 matches across 7 files); browser-timing-floor.md Practical floor (~9ms P50 /
~20ms P95, vsync-dominated); Pixi v8.19.0 release notes (#12050 WebGPU
transientAttachment, filter pipeline work).

---

## Decision

**Prototype WebGPU only.**

Reasoning:
- The map's destination attacks the "compositor vsync" delta classified "not
  reducible." Neither WebGPU nor OffscreenCanvas reduces the vsync-quantized
  input delivery floor (~9ms P50 / ~20ms P95 at 60Hz per browser-timing-floor).
  Both are tail (P95) optimizations.
- **WebGPU only** is nearly free (one-line change in `launchgame.js:62` from
  `"webgl"` to `"webgpu"`, with Pixi's auto-fallback handling unsupported
  browsers). It gives throughput headroom that may indirectly improve P95 by
  preventing frame-budget misses on heavy beatmaps (many slider meshes + cursor
  trail at 2× DPI). 85% browser coverage (Chrome/Edge/Safari 26+/Chrome-Android)
  with automatic WebGL fallback for the rest. Low risk, measurable with the
  existing `?perf=1` HUD.
- **OffscreenCanvas worker render** is a major refactor (68+ `window.game.*`
  refs, video-bg breakage, pause-menu DOM, input-path rewrite to postMessage)
  for a speculative P95 win that only materialises IF T07's profiling shows
  main-thread contention causing P95 stalls. Without T07's evidence the cost
  is unjustified. Deferred until T07 confirms the contention.
- **Both combined** compounds the worker-render cost with a narrower
  WebGPU-in-worker support matrix (Chrome/Edge) for no additional latency
  benefit over worker-render alone. Deferred with the worker-render attack.

### Scope of the follow-up prototype ticket (graduated from T08, not created here)

1. Change `src/game/launchgame.js:62` from `preference: "webgl"` to
   `preference: "webgpu"` (Pixi auto-falls back to WebGL when WebGPU is
   unavailable — no feature-detection code needed).
2. Add a `?renderer=webgl|webgpu|auto` URL param to force a specific renderer
   for A/B testing (default `auto` = `webgpu` with fallback).
3. Smoke-test all current rendering features under WebGPU on Chrome/Edge:
   `FillGradient` slider bodies (`SliderMesh.js`), `MeshRope` slider style 2,
   cursor trail, `Text`/`BitmapText`, approach circles, hit judgements, spinner.
   Document any WebGPU-only rendering bugs.
4. Using the existing perf HUD (`launchgame.js:193-211`, `?perf=1`, F3 toggle,
   F4 copy-summary), measure p50/p95/p99 frame times under `?renderer=webgpu`
   vs `?renderer=webgl` across a sample of beatmaps (light: few circles; heavy:
   many sliders + cursor trail at 2× DPI).
5. Graduate to "ship WebGPU default" if: (a) no rendering regressions on
   Chrome/Edge, AND (b) measurable P95 improvement OR fewer frame-budget misses
   (p95 > 16.6ms counts) on heavy beatmaps. Otherwise keep `preference: "webgl"`
   and document WebGPU as a known-but-not-default option.

### If skipping (not the chosen path — recorded for completeness)

N/A — the chosen path is Prototype WebGPU only. If the prototype later shows the
win is below measurement noise, the one-line entry for `docs/lazer-feel-deltas.md`
would be: "WebGPU renderer: considered, measured [P95 delta]ms improvement on
[heavy beatmaps] / no improvement — [shipped as default / kept as opt-in /
reverted to WebGL] because [reason]."

---

## Sources that could not be fetched

- **Chromium "Life of a pointer event" doc** (chromium.googlesource.com): returned
  400 on raw and rendered URLs (same failure as T05). The Chromium input-pipeline
  threading model is therefore cited indirectly via MDN Event Timing API + spec
  reasoning; the "WebGPU renders during RAF, presents on vsync" conclusion in §2
  rests on the WebGPU spec (no RAF tie) + general compositor behaviour, not on a
  Chromium implementation doc.
- **developer.chrome.com input blog posts** ("input-for-devs", "responsive-input",
  "trust-the-browser"): 404 (same as T05). Not needed for this ticket's questions.
- **Safari worker WebGPU support**: caniuse confirms Safari 26 ships WebGPU on
  iOS (full) and desktop (partial through 26.5/TP), but the fetched sources do
  not separately confirm whether `WorkerNavigator.gpu` is enabled in Safari's
  worker context. Flagged as uncertain in §5; the combined-attack support matrix
  is therefore conservative (Chrome/Edge only).
- **Pixi 8 docs site** (`pixijs.com/8.x/guide/...`): 404 (same as T02). Fell back
  to the GitHub release notes for v8.19.0 and the `pixijs-environments` skill for
  the worker init pattern.
- All other sources (caniuse, MDN WebGPU, MDN OffscreenCanvas, Pixi release notes,
  prior research artifacts, webosu source) fetched successfully.