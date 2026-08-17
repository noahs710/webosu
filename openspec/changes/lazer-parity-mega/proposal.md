# lazer-parity-mega

## Why

webosu! today is a *port* of osu! behavior: it approximates lazer judging, skinning, and scoring rather than reproducing them exactly. Two audits (skin wire-up, mechanics parity) found that significant pieces of lazer behavior are either (a) implemented but never wired up, (b) implemented with a wrong-value fallback, or (c) unimplemented with a placeholder that happens to "feel close" on test maps but diverges systematically on real play. Concurrently, the .osk skin import pipeline parses several skin.ini keys that are never consumed, and hardcodes frame counts and digit spacing that vary by skin. The in-flight `fix-burst-miss-on-first-tap` change fixes one symptom of these structural gaps; this campaign supersedes and completes that work by finishing the per-part slider judger, wiring dead code paths, and making the skin import a conformance-tested pipeline.

## What Changes

This campaign has three intertwined workstreams, all landing as one change because they share the playback.js surface and cannot be safely sequenced independently.

- **Track A — Lazer judging, HP, and scoring parity.**
  - Wire up the existing-but-dead `lazerHitWindows()` from `lazerHpTables.js` (currently `playback.js:412-414` uses raw linear formulas, ~0.5 ms too generous because it skips `Math.floor(window) - 0.5`).
  - Finish the half-built `SliderJudge` accumulator in `slider-judge.js`: wire `recordTailHit` (lazer judges slider tail as its own result with a lenient cursor-presence rule, see `SliderTailCircle`), call `finalScore()` and `finalResultType()` instead of the legacy `defaultScore = 50` completion-ratio hack at `playback.js:817, 2361, 2735`.
  - Make slider edge misses recorded (`LargeTickMiss`) so they count against accuracy, HP, and combo reset (today at `playback.js:2767-2769` they're silently dropped).
  - Fix score-V2: include the combo portion (0.3 weight, `combo^2.5`) and remove the −0.10 single-hit HP loss cap at `score.js:313`; apply `LAZER_LAST_COMBO_BONUS` instead (imported but never used).
  - Pause HP drain during break periods and remove the approximation in `lazerHpTables.js:112-123` (currently fixed scaling, not per-map binary-search).
  - Add spinner clear-RPM bonus scoring (`complete` RPM exists at `lazerHpTables.js:79-84` but is unused).

- **Track B — .osk skin conformance.**
  - Wire dead skin.ini keys to consumers: `sliderStyle` (parsed but never read — SliderMesh has no branch on it), `hitCircleOverlap` (parsed but never used — playback.js:1611 uses hardcoded anchor layout for multi-digit numbers), `allowSliderBallTint` (already live, keep).
  - Replace hardcoded followpoint `% 10` frame count at `playback.js:1955` / `2456` with the parsed `sliderBallFrames` sibling count.
  - Apply the beatmap `[Colours] ApproachCircle` parsed by `beatmap-worker.js:67-69` (currently stored but never read — only the skin.ini version is consumed).
  - Extend the skin name map / whitelist to cover currently-filtered-out texture keys that real skins ship (`hitcircleoverlay@2x.png` under `@2x` variants, `sliderb@2x.png` texture-fill variant, `sliderendcircle` variants, `hit*-<n>.png` numbered hit variants currently capped at base).
  - Add a **skin conformance harness** (`scripts/headless-skin-conformance.js`) that loads N known skins (e.g. default, WhiteCat, reowoTuna, minimalist-test) and asserts render-tree snapshots against golden PNGs.

- **Track C — Feel / latency, honest best-effort.**
  - Document browser-constrained timing realities in a `docs/lazer-feel-deltas.md`: frame quantization (RAF at 60/120/240 Hz), audio clock (resampled) vs lazer native clock, compositor scheduling. This replaces the over-promised "exactly like lazer" with the honest "best-effort within browser constraints, with measured and published deltas."
  - Measure end-to-end input-to-judgement latency on reference hardware (one high-end desktop, one mid-tier) via a new `scripts/headless-latency-probe.js` and publish the baseline.
  - Optimize the critical path: judgement sprite spawn → display → hitfeedback sound → combo update (currently crosses three modules and two event frames).

**BREAKING**: The `defaultScore = 50` slider-end hack is removed; slider final judgements now come from `SliderJudge.finalScore()`. This changes the final judgement value for partial slider completions (previously always ≥50 once head hit, now computed from head+ticks+tail). Player-visible. Also **BREAKING** for scripts that depend on the old `playback.js` judging order.

## Capabilities

### New Capabilities

- `slider-per-part-judging`: Lazer per-part slider judgement model (head/ticks/repeats/tail as individual hit results), replacing the single-object completion-ratio model. Includes `SliderJudge.finalScore()` wiring, `recordTailHit` call sites, and edge-miss recording as `LargeTickMiss`.
- `score-v2-combo-portion`: Lazer Score V2 with the 0.3-weight combo portion, removing the old accuracy-only approximation. Removes the −0.10 HP loss cap; adds `LAZER_LAST_COMBO_BONUS`.
- `skin-conformance-harness`: A headless harness that loads a known skin and compares the rendered scene tree against golden snapshots. Catches whitelist gaps and dead-field regressions.
- `lazer-feel-baseline`: Published input-to-judgement latency measurement and a documented list of accepted deltas vs native lazer.

### Modified Capabilities

- `osk-skin-loading`: Extend the name map to cover `@2x` variants of key textures; add `sliderb@2x.png` and `sliderendcircle@2x.png` variants; wire the dead `sliderStyle` and `hitCircleOverlap` consume sites; document that `hit*-<n>.png` numbered variants ship but are intentionally ignored by the runtime (kept for future animation support).
- `slider-rendering`: SliderMesh gains a `sliderStyle` branch — `sliderb.png` textured fill for `sliderStyle: 2` semantics, gradient+rounded fill for `sliderStyle: 1`.
- `judgement-animations`: The miss animation trigger now originates only from `SliderJudge.finalResultType()` on sliders (not from the legacy `defaultScore` fallback). Animation timing unchanged.
- `game-state`: The game's HP model changes (no more −0.10 cap, last-combo bonus, break-period drain pause). State shape changes for the HP drain accumulator.

## Impact

- `src/game/playback.js` — largest surface. Rewire slider end-of-life, remove `defaultScore = 50` hack, call `SliderJudge.finalScore()`, use `lazerHitWindows()`, apply edge-miss recording, use beatmap `[Colours] ApproachCircle`.
- `src/game/slider-judge.js` — finish or remove. If kept: wire `recordTailHit`, `finalScore()`, `finalResultType()`. If removed: inline accumulator into playback.js.
- `src/game/overlay/score.js` — score-V2 combo portion, HP drain pause in breaks, last-combo bonus, remove −0.10 miss-loss cap.
- `src/game/lazerHpTables.js` — expose passive drain as per-map computed (binary-search fit), not fixed scaling.
- `src/game/playerActions.js` — hit-window values now from `lazerHitWindows()`.
- `src/game/skin-loader.js` + `src/game/skin-filter.js` — extend whitelist for `@2x` variants, document ignored `hit*-<n>.png` variants, wire `sliderStyle` and `hitCircleOverlap` to consumers.
- `src/game/SliderMesh.js` — `sliderStyle` branch in `_draw()`.
- `src/game/beatmap-worker.js` — beatmap `[Colours] ApproachCircle` now consumed.
- `scripts/headless-skin-conformance.js`, `scripts/headless-latency-probe.js` — new harnesses.
- `docs/lazer-feel-deltas.md` — new documentation.

**Risk**: Track A is the largest and riskiest — a wrong change to slider judging or HP will misjudge real plays. Mitigation: ship with per-feature flags initially (env vars), golden-baseline test maps across all OD/HP/CS combinations, and the skin-conformance harness running on every commit during the campaign. The prior `fix-burst-miss-on-first-tap` change is assumed to be archived first (it overlaps in slider-end code but is a smaller, safe subset).

**Non-goals**: osu! mania / taiko / catch rulesets (out of scope). Multiplayer lazer-compat (out of scope). Beatmap editor (out of scope).