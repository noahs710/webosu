# Lazer Feel Deltas — Browser-Constrained Parity Notes

This document lists the known deltas between webosu! (browser) and native osu!lazer, with estimated magnitudes and whether they are reducible.

## Browser-Constrained (Not Reducible)

| Delta | Magnitude | Notes |
|-------|-----------|-------|
| RAF quantum | 16.7ms @60Hz, 8.3ms @120Hz, 4.2ms @240Hz | `requestAnimationFrame` cadence; input-to-judgement is quantized to vsync. Native lazer runs at display refresh with tighter scheduling. |
| Audio clock resampling | 1–5ms jitter | Web Audio `currentTime` is resampled vs native audio thread; `osu-audio.js` compensates but cannot eliminate. |
| Compositor vsync | up to 1 frame (16.7ms) | Browser compositor schedules frames; even if we render in <16ms, display is next vsync. |
| JS event-loop variance | 1–3ms | GC, layout, and task queuing add jitter to input event delivery. |

## Reducible (Optimized in This Campaign)

| Area | Before | After | Method |
|------|--------|-------|--------|
| Judgement sprite spawn | ~2 frames | ~1 frame | Pre-upload textures, pool sprites, avoid per-judgement `Texture.from` |
| Hit error meter update | — | — | Batched, not per-frame |
| SliderMesh dirty-flag | — | — | Only redraw when `startt/endt` changes, not every frame |

## Measured Baselines

*To be filled after `headless-latency-probe.js` runs on reference hardware.*

- Mid-tier 60Hz: P50 __ ms, P95 __ ms
- High-end 120Hz: P50 __ ms, P95 __ ms
- Mobile 30Hz: P50 __ ms, P95 __ ms

Run `node scripts/headless-latency-probe.js` to regenerate.

## Wording Policy

Do not claim "exactly like lazer" or "no deviation". Use: **"Best-effort parity within browser constraints; measured deltas published here."**
