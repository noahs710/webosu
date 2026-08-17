# T17 — Prototype WebGPU renderer

## Type
task (HITL — one-line code change + measurement)

## Question

T08 researched WebGPU + OffscreenCanvas and decided: **Prototype WebGPU only**. The change is a one-liner — `launchgame.js:62` `"webgl"` → `"webgpu"`, with Pixi 8's auto-fallback to WebGL when WebGPU is unavailable (85% browser coverage: Chrome/Edge/Firefox; Safari 26+). OffscreenCanvas worker render is deferred (major refactor for a speculative P95 win).

### Scope

1. **The one-line change**: `src/game/launchgame.js` line 62 — change `preference: "webgl"` to `preference: "webgpu"`. Pixi 8's `autoDetectRenderer` (used by `Application.init`) will pick WebGPU when available and fall back to WebGL otherwise. No other code changes needed — Pixi 8's renderer abstraction handles the rest.
2. **Verify no regression**: run `npm run test:all` (typecheck, backend, lazer parity, conformance, headless-play, mods, crash, settings). All should stay green — Pixi 8's WebGPU renderer supports the same sprite/graphics/text/mesh API the game uses.
3. **Measure latency delta**: the user runs the game in a real browser (Chrome/Edge) with `?perfprobe=1` (T07's probe) on WebGPU vs WebGL. Record P50/P95 for both. The win is expected to be a P95-tail improvement (throughput headroom), not a P50 improvement (vsync floor unchanged per T05/T08).
4. **Document the result**: update `docs/lazer-feel-deltas.md` (T10's scope, but T17 can add a preliminary entry) with the WebGPU vs WebGL P50/P95 numbers.

### Acceptance

- The one-line change landed.
- `npm run test:all` green (no regression).
- User has measured P50/P95 on WebGPU vs WebGL on at least one reference machine.
- `docs/lazer-feel-deltas.md` has a preliminary "WebGPU renderer" entry with the measured numbers (or "no measurable win" if that's the result).
- One-line Decisions-so-far entry on the map.

## Blocks

T10 (final deltas doc incorporates the WebGPU numbers), T12 (final validation)

## Blocked by

T08 (the research + decision — now closed), T07 (the probe must be built for measurement — done)