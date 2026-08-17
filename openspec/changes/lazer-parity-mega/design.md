# Design — lazer-parity-mega

## Context

webosu! is a from-scratch port of osu!lazer's osu!standard gameplay to the browser (PixiJS + Howler + IndexedDB). The original port kept the original webosu's single-file render loop (`playback.js`, 125 KB) and layered lazer-inspired features on top: a `lazerHpTables.js` constants module, a `slider-judge.js` per-part slider accumulator, a `skin-loader.js` .osk pipeline, and a `skin-filter.js` whitelist. Audits during exploration revealed systematic gaps:

- `lazerHitWindows()` exists at `lazerHpTables.js:67-74` but is never called; hit windows at `playback.js:412-414` use raw `80−6·OD` etc., skipping lazer's `Math.floor(window) − 0.5`.
- `SliderJudge` at `slider-judge.js` has `recordTick`/`recordEdge` called but `recordTailHit`, `finalScore`, `finalResultType` never called; the runtime falls back to the legacy `defaultScore = 50` completion-ratio hack.
- Edge misses are silently dropped at `playback.js:2767-2769` (no `LargeTickMiss` event, no accuracy/HP/combo impact).
- Score V2 at `overlay/score.js:286-294` computes only the accuracy portion; the 0.3-weight combo portion is missing.
- HP drain at `overlay/score.js:118-123` uses fixed scaling (not lazer's per-map binary search), doesn't pause during breaks, and caps single-hit loss at −0.10.
- Skin loader parses `sliderStyle` and `hitCircleOverlap` but no consumer reads them; followpoint frames are hardcoded `% 10`.
- Beatmap-worker parses `[Colours] ApproachCircle` but no consumer reads it.

The active `fix-burst-miss-on-first-tap` change (18/19 tasks) removes a burst-miss guard around the same slider judgement code paths. This campaign assumes that change archives first; the work here supersedes and extends it by completing the per-part judging model rather than patching it.

**Stakeholders**: players (want lazer-feel), skin creators (.osk compat), maintainers (want to stop shipping half-finished abstractions).

**Constraints**: browser runtime (RAF frame quantum, resampled audio clock, compositor scheduling), single-threaded renderer, IndexedDB for skin cache, no native code. The goal is *honest best-effort within browser constraints* — measurable, documented — not pretense of pixel-perfect equality with native lazer.

## Goals / Non-Goals

**Goals**

- Lazer judging parity: hit windows, per-part slider, per-part spinner, edge/tick miss recording, HP per-judgement table.
- Lazer scoring parity: score V2 with combo portion, spinner bonus, last-combo HP bonus.
- Lazer HP model: per-map passive drain (binary-search rate), break-period drain pause, no —0.10 cap.
- Skin conformance: any legal .osk drops in and renders correct per lazer decode semantics. Wire every parsed skin.ini key or remove the parse.
- Honest feel: input-to-judgement latency measured, published, and optimized on the critical path. Browser-constrained deltas documented, not hidden.
- A regression harness that catches future drift (skin-conformance snapshots + latency probe + hit-window property tests).

**Non-Goals**

- osu! mania / taiko / catch rulesets — out of scope.
- Multiplayer / relays — out of scope.
- Beatmap editor — out of scope.
- Stable (legacy osu!) compatibility — we target lazer, not stable; where stable and lazer differ, lazer wins.
- Pixel-perfect input latency — browsers quantize to RAF; we measure and publish, not fake.

## Decisions

### Decision 1: Finish `SliderJudge`, don't inline it

We keep `src/game/slider-judge.js` and complete it. Rationale: the per-part slider accumulator is a real abstraction that hides lazer slider rules (head / ticks / repeats / tail each judged independently, final result recomputed from accumulator). Inlining it into `playback.js` would re-create the 200-line pile the abstraction was meant to solve. The previous session abandoned it not because the abstraction is wrong but because wiring it was tedious.

Alternative considered: inline into playback.js. Rejected — scatters lazer-specific rules across the render loop, harder to test, harder to audit later.

### Decision 2: Hit windows route through `lazerHitWindows()` at the source

Replace the three raw formulas at `playback.js:412-414` with a single call: `const { great, ok, meh } = lazerHitWindows(OD)` and assign `self.GreatTime = great`, etc. Also gate player-input acceptance in `playerActions.js:164, 191` to the same values (single source of truth). The 0.5 ms floor is small but player-visible on high-OD maps.

Alternative considered: keep the linear formulas, patch with `Math.floor(window) − 0.5` inline. Rejected — duplicates the formula, drifts the next time lazer tweaks OD curves.

### Decision 3: Per-map passive HP drain via binary-search fit (lazer `DrainingHealthProcessor.ComputeDrainRate`)

Compute the drain rate per-map at beatmap load, targeting lazer's "perfect play ends near-zero HP" invariant. Store on `game.hpDrainRate`; apply `dt · rate` in `score.js`. Pause during breaks by tracking `[break]` windows and skipping drain when `time ∈ break`.

Alternative considered: keep fixed scaling. Rejected — measurably diverges from lazer on drain-heavy maps (long stream maps, HP 9-10).

### Decision 4: Skin conformance via golden-snapshot harness, not field-by-field unit tests

Field-by-field unit tests can verify `sliderStyle=1 → gradient fill` but they can't verify "this skin drops in and looks lazer-correct overall." The harness drops N known skins (default + 3 community skins of varying style), loads a fixed reference beatmap, runs 60 frames, and hashes the render tree (per-sprite texture ID + transform + tint). Snapshot changes require an explicit `npm run conformance:update` to accept, with a diff-image render on failure for review.

Alternative considered: pixel-diff against live lazer screenshots. Rejected — native-vs-browser pixel paths diverge even for correct behavior; we want internal-consistency snapshots, not external pixel equality.

### Decision 5: Honest feel baseline, not "perfect"

We measure end-to-end input-to-judgement latency under three device profiles (high-end 120 Hz, mid-tier 60 Hz, low-end mobile) via a synthetic-input headless probe. Publish the numbers in `docs/lazer-feel-deltas.md` along with the browser-constraint deltas (RAF quantum, audio resample, compositor). Optimize the judgement-display critical path (sprite spawn → texture upload → composite) as a one-frame improvement, not as a latency chase.

Alternative considered: chase sub-frame latency. Rejected — browsers quantize to RAF; chasing deeper than ~1 frame is noise.

### Decision 6: Feature flags during rollout

Each Track A / Track B subsystem gated by a runtime flag (`window.FEATURES.lazerSliderJudging`, `window.FEATURES.lazerScoreV2`, `window.FEATURES.lazerHpDrain`, `window.FEATURES.skinConformance`). All default off in the first PR, flipped on one-by-one after harness validation, removed once stable. Rationale: keeps the mega-change mergeable without an all-or-nothing rollout.

Alternative considered: big-bang one-flag rollout. Rejected — single failure forces revert of everything.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Wiring `SliderJudge.finalScore()` changes slider judgements on real plays** (previously defaultScore=50 hack let sloppy sliders pass; lazer model is stricter) | Golden-baseline test maps across OD/HP/CS combinations in the conformance harness; per-map replay diffs vs current behavior on a benchmark suite; feature-flagged during rollout. |
| **Per-map HP drain binary search is slow at beatmap load** (>100ms stalls first load) | Run binary search inside `beatmap-worker.js` (already a worker), not the main thread; cache the computed rate keyed by beatmap ID + mods. |
| **Skin whitelist extension blows up GPU memory on pathological skins** | The 300 MB unzipped + 1000 entry limits stay; the whitelist additions are gated to specific known-safe patterns (`@2x` variants of existing whitelisted names). |
| **`hitCircleOverlap` wiring breaks existing default-skin layout** | The default skin ships `hitCircleOverlap: 0` in its skin.ini; the hardcoded multi-digit layout only activates when overlap is non-zero. Property test: renders-of-default-skin unchanged. |
| **Score V2 combo portion changes leaderboards** | The change ships with a "ruleset version" tagged on saved scores; leaderboards partition by ruleset version. |
| **Latency probe flaky in CI (RAF throttling in headless)** | Accept variance; report P50/P95 not absolute; only gate on regressions > 5 ms. |
| **`sliderStyle` branch in `SliderMesh` doubles code paths** | `SliderMesh._draw()` already has two paths via the `?gradient=textured` spike; refactoring to a single `strategy` parameter keeps the branch count at two, not four. |
| **Campaign scope creep** | Non-Goals section, plus three named workstreams. Any new workstream requires a separate change proposal. |

## Migration Plan

1. **Phase 0 — Archive predecessor.** Archive `fix-burst-miss-on-first-tap` first (it's 18/19 and overlaps). Confirm no conflicts.
2. **Phase 1 — Harnesses.** Land `scripts/headless-skin-conformance.js` and `scripts/headless-latency-probe.js` with golden snapshots from the *current* (pre-change) behavior. These become the baseline diff targets.
3. **Phase 2 — Track A (judging) behind flags.** Wire `lazerHitWindows()`, finish `SliderJudge`, edge-miss recording, score V2 combo portion. Feature flags off by default; harness diff shows expected drift.
4. **Phase 3 — Track A (HP).** Per-map drain rate, break-pause, −0.10 cap removal, last-combo bonus. Feature-flag off.
5. **Phase 4 — Track B (skins).** Wire `sliderStyle`, `hitCircleOverlap`, `@2x` variants, beatmap `ApproachCircle`. No flag needed if harness diff is empty for default skin.
6. **Phase 5 — Track C (feel).** Latency probe runs, `docs/lazer-feel-deltas.md` written, judgement critical path optimized (single-frame improvement target).
7. **Phase 6 — Flip flags, remove old code.** One at a time, one release each, keep harness green at each flip. After all flags default-on for one stable release, delete the legacy code paths.

**Rollback**: per-flag rollback, not per-commit. If a flip breaks in production, revert that flag to off; the legacy code path is still present until Phase 6 completes.

## Open Questions

1. **SliderJudge `finalScore()` edge-case formula**: lazer's exact threshold table for combining `{head, ticks, repeats, tail}` into a single 300/100/50/miss isn't documented in source. Do we reverse-engineer from behavior tests on real lazer plays, or reference `SliderJudgement.cs` directly? (Likely: reference `SliderJudgement.cs`, cite commit in spec.)
2. **Skin conformance skin list**: which N skins? Proposal says "default + 3 community." Should this include a pathological case (WhiteCat 806-file) as one of the 3? Probably yes for whitelist validation.
3. **Latency probe hardware**: do we gate it on a specific reference machine in CI, or run locally on demand and check-in baselines? Probably reference-machine + committed baselines.
4. **Break-period drain pause**: lazer pauses drain during `[Break]` events and during the pre-first-object lead-in. Does it also pause during the post-last-object outro? (Check `DrainingHealthProcessor` source.)
5. **Spinner clear-RPM bonus**: lazer grants LargeBonus (1000) per extra revolution past required. Does it cap at some multiple, or uncapped within duration? (Check `SpinnerTick.JudgementMaxAmount`.)
