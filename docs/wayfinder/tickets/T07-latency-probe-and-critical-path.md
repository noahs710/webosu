# T07 — Track C: latency probe + critical-path optimization (one-frame improvement)

## Type
task (HITL)

## Question

Track C of the mega-change is ~5% done. The latency probe (`scripts/headless-latency-probe.js`) is a stub; `docs/lazer-feel-deltas.md` has the structure but the "Measured Baselines" section is empty (`P50 __ ms, P95 __ ms`). The critical-path optimization (task 6.2) is unstarted.

Finish Track C's *reducible* part: measure the latency, optimize the critical path by one frame (target P50 improvement ≥ 16.7ms at 60Hz), publish the before/after numbers. The *not-reducible* deltas (WebGPU/AudioWorklet/OffscreenCanvas) are T08/T10 — this ticket is the reducible Track C work.

### Items (from `tasks.md` §1 + §6)

1. **1.9** Implement `scripts/headless-latency-probe.js`: synthesize input events at known timestamps, measure time-to-judgement-sprite-spawn. The probe must run in a real browser (headless chromium via Playwright) and report P50/P95, not absolute — headless RAF throttling makes absolute numbers unreliable. Cite T05's research for the measurement methodology.
2. **1.10** Run probe on reference machine(s). The user owns the reference hardware (the MODERNIZATION-PLAN mentions a 2015 laptop as the floor + a high-end desktop). This is the HITL step — hand the user the probe script, they run it, paste the numbers.
3. **1.11** Commit baselines to `tmp/latency-baseline.json` + document methodology in `docs/lazer-feel-deltas.md`.
4. **6.1** Identify the judgement critical path in `playback.js`: input event → `playerActions` handler → judgement computation → `scoreOverlay.hit` → sprite spawn → texture upload → composite. Profile it.
5. **6.2** Optimize: candidate hotspots from the proposal are (a) synchronous event handlers, (b) texture pre-upload (judgement sprites — the mega-change's "pre-upload textures, pool sprites" is already done per STATUS.md; verify), (c) judgement sprite pooling (verify it's actually pooled, not `Texture.from` per judgement). Reduce one frame at 60Hz.
6. **6.3** Re-run probe, document before/after numbers.
7. **6.4** Draft `docs/lazer-feel-deltas.md` final form: list browser-constrained deltas (RAF quantum per Hz, audio resample jitter, compositor vsync, JS event-loop variance) with estimated magnitudes. The file exists with structure — fill in the "Measured Baselines" section with the probe numbers.
8. **6.5** Document measured webosu! latencies from probe baseline + post-optimization numbers.
9. **6.6** Audit doc wording: no "exactly like lazer" / "no deviation" claims. Use "best-effort parity within browser constraints; measured deltas published here."

### Acceptance

- `scripts/headless-latency-probe.js` runs in headless chromium and emits a P50/P95 JSON.
- User has run it on at least one reference machine and the numbers are in `docs/lazer-feel-deltas.md`.
- One-frame optimization landed (the diff is in `playback.js` / `score.js` / judgement sprite path).
- Before/after numbers published in `docs/lazer-feel-deltas.md` showing ≥16.7ms P50 improvement (or a cited reason it's not achievable on the floor device).
- `docs/lazer-feel-deltas.md` wording audited — no over-promises.
- One-line Decisions-so-far entry on the map.

## Blocks

T08 (the "not reducible" attack needs the reducible baseline first), T12 (final validation re-measures)

## Blocked by

T01 (clean base), T05 (research gives the measurement floor + methodology)