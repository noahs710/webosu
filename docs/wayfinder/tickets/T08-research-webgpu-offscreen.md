# T08 — Research + decision: WebGPU renderer + OffscreenCanvas worker render in Pixi 8

## Type
research (AFK, decision half) → graduates a prototype ticket

## Question

The map's destination attacks the "compositor vsync" delta currently classified "not reducible." Two candidate attacks: (a) WebGPU renderer (Pixi 8 `preference: "webgpu"` — may have a tighter render path than WebGL), (b) OffscreenCanvas + Web Worker render (the render loop runs in a worker, so it doesn't share the main-thread task queue with input handlers — may reduce input-to-judgement jitter even if render-vs-vsync is unchanged).

This ticket is research-first; the decision (prototype vs. skip) graduates a prototype ticket. Do NOT prototype in this ticket.

### Research questions (cited)

1. **Pixi 8 WebGPU status**: is `preference: "webgpu"` production-ready in Pixi 8.19? What's the browser support matrix as of 2026 (Chrome ✓, Edge ✓, Firefox ?, Safari ? — check caniuse + browser release notes)? Does it actually improve render latency or just throughput? Cite Pixi 8 release notes + `gpu-comparison` docs if any.
2. **WebGPU render timing**: does WebGPU render *during* the RAF callback (same as WebGL) or in a separate pass? Does it submit to the compositor with the same vsync cadence, or is there a tighter path? Cite WebGPU spec + Chromium WebGPU implementation docs.
3. **OffscreenCanvas + Pixi 8**: does Pixi 8's `Application` work with `OffscreenCanvas`? (The `pixijs-environments` skill covers this.) What breaks — input events (worker can't receive DOM events; main thread `postMessage`s them in), WebGL context creation (works in worker), font loading (worker `FontFace` is limited), `document`/`window` references in the game code. Cite the skill + browser docs.
4. **Worker render + input latency**: if the render loop runs in a worker and the main thread only handles input → `postMessage` to worker → worker renders, does this *add* a hop (slower) or *remove* main-thread contention (faster)? Cite T05 #8.
5. **WebGPU + OffscreenCanvas combined**: can WebGPU run on an `OffscreenCanvas` in a worker? Cite WebGPU spec + Chromium issue tracker.
6. **Cost/benefit**: what's the implementation cost (rewrite `launchgame.js` Application init, port input path to `postMessage`, handle font loading in worker, port any `window.game` references the shell reads) vs. the expected latency win (cited from T05)? Is the win even measurable, or does it disappear into RAF jitter?

### Decision (graduates a prototype ticket if "yes")

Based on the research, one of:
- **Prototype WebGPU only** — `preference: "webgpu"` with WebGL fallback, measure latency delta vs. WebGL-only. Graduates a prototype ticket.
- **Prototype OffscreenCanvas worker render** — bigger change, potentially bigger win. Graduates a prototype ticket.
- **Prototype both combined** — maximum attack, maximum risk. Graduates a prototype ticket.
- **Skip** — the research shows the win is below measurement noise. Document why in `docs/lazer-feel-deltas.md` and close.

### Acceptance

- `docs/wayfinder/research/webgpu-offscreen-research.md` exists, cited, covering all 6 research questions.
- A decision section naming which (if any) prototype to pursue, with reasoning.
- If skipping: `docs/lazer-feel-deltas.md` updated with the "WebGPU/OffscreenCanvas: considered, not pursued because X" entry.
- If prototyping: a new prototype ticket graduated from this one (added to the map's open tickets), with the specific scope from the research.

## Blocks

T09 (final gates need to know if WebGPU/OffscreenCanvas is in scope), T12 (final validation)

## Blocked by

T02 (#14 WebGPU status feeds in), T05 (#8 OffscreenCanvas input feeds in), T07 (the reducible baseline must be measured before attacking the "not reducible")