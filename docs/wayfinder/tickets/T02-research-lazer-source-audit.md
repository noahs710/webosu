# T02 — Research: lazer source-of-truth for every reducible parity gap

## Type
research (AFK)

## Question

The mega-change's `tasks.md` marks many Track A/B items `[x]` (done) but the "done" claims are against *webosu's* understanding of lazer, not against lazer source. Before the rollout ticket (T06) flips flags on, we need a single authoritative audit: for each reducible gap the mega-change claims to close, what does **current ppy/osu master** actually say?

Specifically, produce a cited findings doc (`docs/wayfinder/research/lazer-source-audit.md`) covering:

### Track A — judging / scoring / HP

1. **Hit windows** (`OsuHitWindows.cs`): confirm `Math.floor(window) − 0.5` is still the formula. Cite the file + commit. webosu's `lazerHitWindows()` in `lazerHpTables.js:67-74` must match byte-for-byte.
2. **Slider nested judging** (`DrawableSlider.cs`, `SliderInputManager.cs`, `SliderEventGenerator.cs`): the `SliderScorer` in `src/game/slider-scorer.js` was written against ppy/osu master at some point — confirm the model still holds: head = `SliderHeadCircle` (standard circle judgement at startTime), tick = `SliderTick` (LargeTickHit/Miss), repeat = `SliderRepeat` (LargeTickHit/Miss), tail = `SliderTailCircle` (SliderTailHit 150 / IgnoreMiss — no combo break). Confirm `TAIL_LENIENCY = 36` (ms) is still the value. Confirm the "head gates tracking" rule (Tracking only counts once head hit).
3. **Score V2** (`ScoreProcessor.cs`, `OsuScoreProcessor.cs`): confirm `ComputeTotalScore = round(500000·accuracy·comboProgress + 500000·accuracy^5·accuracyProgress + bonusPortion) × scoreMultiplier`. Confirm base score table (Great=300, Ok=100, Meh=50, SliderTailHit=150, LargeTickHit=30, SmallTickHit=10, LargeBonus=50, SmallBonus=10). Confirm combo exponent `0.5`. Confirm `LAZER_LAST_COMBO_BONUS` tiers (Perfect +0.07 / Good +0.05 / None +0.03). Cite the file + commit.
4. **HP drain** (`DrainingHealthProcessor.cs`, `OsuHealthProcessor.cs`): confirm the binary-search `ComputeDrainRate` algorithm (simulate perfect play, fit rate so minHealth ≈ `DifficultyRange(HP, 0.99, 0.9, 0.4)`). Confirm break-period drain pause. Confirm the per-judgement HP increase table in `lazerHpTables.js`. Confirm there is **no** −0.10 single-hit loss cap in lazer. Cite.
5. **Spinner** (`Spinner.cs`, `SpinnerTick.cs`): confirm clear RPM = `DifficultyRange(OD, 90, 150, 225) / 60`. Confirm bonus = `LargeBonus` (50 base each) per extra revolution past clear, capped at `complete` RPM. Confirm `SpinnerTick.JudgementMaxAmount` and whether bonus is uncapped within duration. The mega-change's Open Question #5 is exactly this — resolve it.
6. **Circle radius** (`OsuHitObject.cs`): confirm `R = 32 · (1 − 0.7·(CS−5)/5)`. The uncommitted `playback.js` changed to this formula — verify it's correct, not a half-remembered approximation.

### Track B — skinning

7. **`sliderStyle`** (`Skin.cs`, `LegacySkinDecoder.cs`, `SkinInfo.cs`): confirm `sliderStyle: 1` = gradient, `sliderStyle: 2` = textured with `sliderb.png`/`sliderb@2x.png`. webosu's `SliderMesh.js` now branches on this — confirm semantics.
8. **`hitCircleOverlap`** (`OsuHitObject.cs` or skinning source): confirm the multi-digit number layout uses `overlap · 0.3` shift. webosu's `playback.js:1651-1659` does this — verify the 0.3 factor.
9. **`@2x` variants** (`LegacySkinTransformer.cs`): confirm the resolution-doubling rule and which textures legally have `@2x` variants. webosu's whitelist extension (T11) needs the authoritative list.
10. **Beatmap `[Colours] ApproachCircle`** (`Beatmap.cs`, `ColourDecoder.cs`): confirm skin value wins, beatmap fallback, combo color last. webosu's wiring (mega task 5.12) is unstarted — confirm the precedence order.
11. **`hit*-<n>.png` numbered variants** (`LegacySkinTextureLookup.cs` or similar): confirm these are parsed but intentionally ignored by the runtime (reserved for future animation). webosu documents this as intentional — confirm against lazer.

### Track C — feel / latency (the deltas this map re-opens)

12. **RAF + input timing in browsers**: what's the theoretical floor for input-to-judgement latency in a browser? Cite Web Animations / WebGPU / Pointer Events specs. Confirm `requestAnimationFrame` is vsync-quantized and `performance.now()` resolution is ≥ 5μs in modern browsers (or coarser — check the PrivacyReduction spec).
13. **AudioWorklet vs Howler's `currentTime`**: Howler uses the main-thread `AudioContext.currentTime` (resampled). Does an `AudioWorkletProcessor` give a tighter clock? Cite Web Audio API spec + any known Howler issues. What's the practical jitter improvement?
14. **WebGPU renderer in Pixi 8**: is `preference: "webgpu"` production-ready as of Pixi 8.19? What's the browser support matrix (Chrome/Edge/Firefox/Safari)? Cite Pixi 8 release notes + browser support. This feeds T08.
15. **OffscreenCanvas + Web Worker render**: can the Pixi 8 render loop run in a Web Worker via `OffscreenCanvas`? What breaks (input events, WebGL context creation, font loading)? Cite Pixi 8 + browser docs. This feeds T08.

### Acceptance

- `docs/wayfinder/research/lazer-source-audit.md` exists, cited (file + commit / spec section), covering all 15 points above.
- For each point: either "confirmed — webosu matches" or "divergence found — webosu does X, lazer does Y, here's the fix".
- Any divergence spawns a follow-up ticket (graduated from this research) — do NOT fix in this ticket.

## Blocks

T06 (rollout needs the audit before flipping flags), T08 (WebGPU/OffscreenCanvas decision needs the research), T11 (skin whitelist needs the @2x authoritative list)

## Blocked by

(none — pure research, can run in parallel with T01)