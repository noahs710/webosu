# Map — lazer-perfect-parity

## Destination

Every **reducible** gap between webosu! and native osu!lazer is closed (Track A judging/scoring/HP done behind flags, Track B skin conformance green on all reference skins, Track C latency optimized on the critical path), the feature flags are flipped on, the legacy code paths are deleted, and the conformance harness gates every commit. **Plus**: the deltas currently classified "not reducible" in `docs/lazer-feel-deltas.md` are actively attacked — WebGPU renderer path, AudioWorklet tight-clock, OffscreenCanvas worker render, sub-frame input timing — with measured before/after numbers, re-opening the "honest best-effort" stance. "Perfect" = zero reducible deltas + every browser-constrained delta narrowed as far as the platform allows and published.

## Notes

- **Domain**: web port of osu!lazer's osu!standard ruleset. Single-process Node + Fastify backend, Fly.io-only (no external DB). Frontend Vue 3 + Tailwind SPA; game engine Pixi 8 ESM, dynamically imported on beatmap click (isolation invariant — shell never fetches Pixi).
- **Existing planning artifacts**: `docs/wayfinder/MODERNIZATION-PLAN.md` (Phases 1–6 modernization, all done except Phase 6 bench-lock on real hardware), `docs/wayfinder/STATUS.md` (current state), `docs/lazer-feel-deltas.md` (the deltas this map re-opens), and `openspec/changes/lazer-parity-mega/` (the in-flight mega-change, partially landed, **uncommitted** — its Track A is ~done behind flags, Track B ~40%, Track C ~5%, §7 rollout + §8 gates entirely unstarted).
- **Skills every session should consult**: `pixijs-*` for any renderer/scene-graph work (esp. `pixijs-core-concepts`, `pixijs-performance`, `pixijs-custom-rendering`, `pixijs-environments` for OffscreenCanvas); `domain-modeling` when refining lazer-ruleset terminology; `diagnosing-bugs` for any regression; `tdd` for the harness/property-test work.
- **Standing preferences**: honest wording — never claim "exactly like lazer" or "no deviation"; publish measured deltas. No from-scratch engine rewrite (port, don't rewrite). No external DB/infra (Fly.io-alone). No mania/taiko/catch, no multiplayer lazer-compat, no editor (all out of scope).
- **Tracker**: local-markdown at `docs/wayfinder/tickets/` (no GitHub Issues tracker configured). Map = this file; tickets = `docs/wayfinder/tickets/T<NN>-<slug>.md`. Blocking edges recorded in each ticket's `## Blocks` / `## Blocked by` sections. Frontier = open tickets with all `Blocked by` closed.

## M1 audit

Rules enforced by M1 (parser unification + curve contract + parity constants). Every subsequent PR must respect these. The implementation ticket is [T18](tickets/T18-m1-parse-curves-audit.md). Run `npm run test:m1` to verify all rules at once (41 assertions across `tests/lazer-parity.spec.mjs`, `tests/parser/golden-map.spec.mjs`, `tests/curves/allocation.spec.mjs`).

When a player-facing constant conflicts between the `ppy/osu` source and `osu.ppy.sh` wiki, **wiki wins** (per §19 of `docs/lazer-mechanics.md`).

| # | Rule | Pin | Verified by |
|---|------|-----|-------------|
| M1.1 | `.osu` parser is single-sourced at `src/game/parse/track.js`. Both main-thread (`osu.js`) and worker (`beatmap-worker.js`) paths call `parseOsz` / `parseTrackText`; neither path inlines a `Track` constructor. | `src/game/parse/track.js` (new) | `tests/parser/golden-map.spec.mjs` (worker output ≡ main output for one fixture beatmap) |
| M1.2 | `parseTrackText` is a pure functional export — no globals, no shared mutable state. Calling it twice on the same input yields identical `TrackData[]`. | `src/game/parse/track.js#parseTrackText` | `tests/parser/golden-map.spec.mjs` (idempotent-call assertion) |
| M1.3 | Stack offset is `4/4` osu-pixels (lazer parity). Source of truth in `stackHitObjects`. The stable-era `stackScale * 6.4` math is dead. | `src/game/parse/track.js#stackHitObjects` | `tests/lazer-parity.spec.mjs` (overlapping hits offset by exactly 4 px; no `stackScale * 6.4` in source) |
| M1.4 | Curve contract is `pointAtInto(t: number, out: Point): Point` only. Abstract base in `curves/curve.js`. No `pointAt(t)` callers in the per-frame hot path. | `src/game/curves/curve.js` (new abstract) | `tests/curves/allocation.spec.mjs` (zero allocations past warmup on a 60-frame slider trace) + grep audit (no `\.pointAt\(` outside the implementer files) |
| M1.5 | `SliderMesh` binds `pointAtInto` at slider-create time and reuses one `Point` (`_tmpPt1`) per slider across frames. | `src/game/playback.js#createSlider` | `tests/curves/allocation.spec.mjs` (slider path sampling allocates ≤ 1024 bytes over 60 frames) |
| M1.6 | `lazerHitWindowsLinear` is removed (no production callers). The wiki-anchored `lazerHitWindows(OD) = 80 - 6·OD` lives at `src/game/lazerHpTables.js#lazerHitWindows`. | `src/game/lazerHpTables.js` (export removed) | `tests/lazer-parity.spec.mjs` (`lazerHitWindowsLinear` not imported anywhere; `lazerHitWindows(OD)` matches wiki at OD∈{0,5,10}) |
| M1.7 | `beatmap-worker.js` is a pass-through to `parseOsz` (~50 LOC). The worker is a thin boundary; all parsing logic lives in `parse/track.js`. | `src/game/beatmap-worker.js` | `tests/parser/golden-map.spec.mjs` (worker output ≡ main output) + LOC count assertion in `scripts/headless-visual-bench.js` |
| M1.8 | No stable-era math in `playback.js`. Forbidden patterns: `stackScale * 6.4`, `200 - 10*OD` for hit windows, `(109 - 9*CS) / 2` for circle radius. Replacements: `4/4` offset, `lazerHitWindows(OD)`, `32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))`. | `src/game/playback.js` | grep audit (none of the forbidden patterns in source) |
| M1.9 | `SliderJudge` and `SliderScorer` are two separate classes with non-overlapping responsibilities. `SliderJudge` owns per-frame *decision* state (current position, edge detection — read every frame in `playback.js:3046,3057,3218-3222`). `SliderScorer` owns score *event emission* (typed-pipe, score overlay updates). Adding a new judgment path edits the *judge* side; adding a new score-event type edits the *scorer* side. Neither is dead. | `src/game/slider-judge.js` + `src/game/slider-scorer.js` | header comments in both files; `tests/lazer-parity.spec.mjs` (both classes instantiate via `playback.js#createSlider`) |
| M1.10 | Audit doc canon lives at this file (the `## M1 audit` section). No duplicate `lazer-parity-audit.md` exists. Foundational docs that the audit cites live at `docs/lazer-mechanics.md` (lazer ruleset reference, 20 sections, §19 is the wiki-as-source-of-truth index). | this file + `docs/lazer-mechanics.md` | repo grep (no `docs/lazer-parity-audit.md`); `git log` on `docs/lazer-mechanics.md` |

### Wiki-anchored constants (lazer parity; wiki wins over ppy/osu source)

These constants are the canonical values for every subsequent PR. Any value that conflicts with `osu.ppy.sh` wiki is wrong.

- **Hit windows**: `great = 80 - 6·OD`, `ok = 140 - 8·OD`, `meh = 200 - 10·OD`, `miss = 400` ms. Lives at `lazerHpTables.js#lazerHitWindows`.
- **Mod multipliers** (lazer not stable): EZ 0.50x, NF 0.50x, HT 0.30x, HR 1.06x, DT 1.10x, NC 1.10x, HD 1.06x, FL 1.12x, AT 1.00x, RX 0.10x, AP 0.10x, SO 0.90x, CL 0.96x, TP 0.10x.
- **Spinner min spins/sec**: `OD < 5 ? 1.5 + 0.2·OD : 1.25 + 0.25·OD`. Spins are counted in half-revolutions.
- **Circle radius**: `32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))` (T13 D4).
- **Stack offset**: `4/4` osu-pixels (M1.3).
- **Hard Rock direction**: CS +30%, HP/OD/AR +40%, all capped at 10. Playfield flipped vertically: `y → 384 - y`.
- **Score V2**: `score = round(500000 * acc * comboProgress + 500000 * acc^5 * accuracyProgress + bonusPortion) * scoreMultiplier` (T13 D1).
- **HP**: no single-hit loss cap (T13 D2); last-in-combo bonus +0.07/+0.05/+0.03 on the last hit of each combo (T13 D3).

### M1 boundaries

M1 does NOT include:

- PIXI HUD layer separation (deferred to M2).
- MeshRope opt-in toggle for sliders (deferred to M2; player-settings toggle with inline explanation is the M2 plan).
- v8 pooling, GCSystem, culler plugin (deferred to M3).
- A streaming `.osu` parser rewrite (M1 is a refactor; the existing parser logic is preserved).
- A from-scratch engine rewrite (per the standing preferences above).

M1 DOES include everything in [T18](tickets/T18-m1-parse-curves-audit.md)'s `### Scope` section.

## Decisions so far

- [T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work](tickets/T01-commit-mega.md) — `task`, AFK. Resolved: 4 commits landed (`d673293` core, `c70594e` openspec, `14f77fa` wayfinder, `b0996c0` gitignore). typecheck 121/121, backend 53/53, lazer parity 87/87, conformance 4/4 (goldens regenerated after fixing a harness crash — fresh page per skin), headless-play/mod-flashlight/settings/error-popup/crash all 0 pageerrors. tasks.md reconciled (3.1/3.3/3.4 → `[ ]` per audit; 2.0 added for D4 circle-radius bug). Stray runtime artifacts gitignored. Scope-creep flagged for T14: aspect-ratio overlay in `skin-loader.js`.
- [T02 — Lazer source-of-truth audit](tickets/T02-research-lazer-source-audit.md) — 15 points audited vs ppy/osu master; **6 confirmed, 9 divergences (D1–D9)**. Findings at `research/lazer-source-audit.md`. Divergences graduate T13 (fix D1–D4 the real parity bugs in score/radius/HP) + T14 (decide D5–D9 the webosu-extension-or-fix questions). Key: Score V2 production path is wrong (D1), HP loss cap + last-combo bonus unapplied (D2/D3), circle radius formula wrong for CS≠5 (D4), `sliderStyle` is a webosu invention not lazer (D5), `hitCircleOverlap` shift factor wrong (D6), `@2x` whitelist is a subset (D7), `[Colours] ApproachCircle` is NOT consumed by lazer — mega task 5.12 should be dropped (D8), `hit*-N.png` frames ARE used by lazer for animated judgements — webosu's skip is a memory trade-off not parity (D9).
- [T05 — Browser sub-frame timing floor](tickets/T05-research-browser-timing-floor.md) — practical floor ~9ms P50 / ~20ms P95 at 60Hz (vsync-dominated, not timestamp granularity). Findings at `research/browser-timing-floor.md`. 7 candidate attacks graduate consideration in T08/T09: COOP+COEP isolation (20× finer timestamps), `pointerrawupdate` (un-coalesced, Chromium-only), `PointerEvent.getPredictedEvents()` (native predictor), AudioWorklet reference clock bridge (2.67ms quantum), `AudioContext.getOutputTimestamp()` (audio↔perf.now bridge), OffscreenCanvas+worker render (lower P95 via main-thread insulation), `DedicatedWorkerGlobalScope.requestAnimationFrame`. WebGPU timestamp queries are NOT useful (queue-timeline, coarsened). Factual correction: AudioWorklet `process()` runs at 128-frame render quantum (~2.67ms), NOT sample rate (~0.02ms) — ticket T09 hypothesis was wrong.
- [T13 — Fix the 4 real lazer-parity bugs (D1–D4)](tickets/T13-fix-audit-parity-bugs.md) — `task`, HITL. Resolved: commit `0e05b2d`. D1 Score V2 production formula wired (`scoreTyped` method added to `ScoreOverlay`, `hit()` routes through it when `lazerScoreV2` on; critical catch — `SliderScorer`'s `scoreTyped()` calls were going to a non-existent method, silent TypeError swallowed by render-loop try/catch). D2 HP loss cap removed (miss at HP=10 now drains −0.20, not −0.10). D3 last-in-combo bonus applied (`scoreTyped` tracks per-combo tier, adds +0.07/+0.05/+0.03 on `lastInCombo`; `playback.js` computes `hit.lastInCombo` at `populateHit` time). D4 circle radius fixed (`32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))`, was wrong for CS≠5). Tests 87 → 110 (+23). All green: typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T14 — Decide the 5 webosu-extension-or-fix questions (D5–D9)](tickets/T14-decide-extension-questions.md) — `grilling`, HITL. Resolved: all 5 decisions recorded via grilling. **D5 `sliderStyle`: REMOVE** (always gradient, true lazer parity). **D6 `hitCircleOverlap`: FIX** (`* 0.3` → `* 0.5` per side; default 0 → -2). **D7 `@2x` whitelist: EXTEND** (~12 missing names + beatmap-skin @2x disable — T03 scope). **D8 `[Colours] ApproachCircle`: DROP mega task 5.12** (approach uses combo colour; lazer ignores beatmap ApproachCircle). **D9 `hit*-N.png` animated judgements: IMPLEMENT** (load frames, play as `PIXI.AnimatedSprite` — scope expansion). Graduated T15 (D5/D6/D8 code changes) + T16 (D9 animated judgements). User chose to remove sliderStyle (option 2) over the recommended keep-as-extension (option 1).
- [T15 — Implement D5/D6/D8 removals + fixes](tickets/T15-implement-d5-d6-d8-removals.md) — `task`, HITL. Resolved: commit `5a99866`. D5 sliderStyle removed (SliderMesh always gradient; ~30 lines MeshRope textured code deleted). D6 hitCircleOverlap fixed (`* 0.3` → `* 0.5` per side; default 0 → -2). D8 ApproachCircle fallback dropped (approach = skin else combo; mega task 5.12/5.13 dropped). typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T03 — Finish Track B skin conformance](tickets/T03-skin-conformance-wiring.md) — `task`, HITL. Resolved: commit `4f45ea1`. D7 @2x whitelist extended to full lazer-legal set in `skin-filter.js` (added ~12 missing base names: hit100k, hit*-N animation frames, cursor-ripple/star2/cursor-smoke, sliderstartcircle(+overlay), sliderpoint30/10, particle50/100/300, scorebar-ki(+kidanger/+kidanger2)). Beatmap-skin @2x disable implicitly enforced. Conformance goldens regenerated (texture counts up across all 4 reference skins). tasks.md 5.1 done, 5.2 superseded, 5.4 → T16. typecheck 120/120, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T04 — Conformance harness: scene-graph snapshots, CI wiring, green on all reference skins](tickets/T04-conformance-harness.md) — `task`, HITL. Resolved: commit `d305593`. 1.7b scene-graph capture at frames [10,30,60] wired (sceneSnaps field in gameplay golden; headless sceneSnaps empty — needs real browser). 1.3 SHA-256 manifest for conformance-skins. 1.8 CI wiring documented as manual (no .github/workflows). 5.8/5.11 default-skin golden stable. 5.13 dropped per D8. typecheck 120/120, lazer parity 110/110, conformance 4/4.
- [T07 — Track C: latency probe + critical-path optimization](tickets/T07-latency-probe-and-critical-path.md) — `task`, HITL. Partially done: commit `6049c2c`. Probe built (headless structure validation + real-browser `?perfprobe=1` hook in main.js + playback.js hitSuccess). Headless n=0 (audio clock doesn't advance without user gesture — known limitation). Remaining: user runs probe on reference hardware (1.10), commits baselines (1.11), critical-path optimization (6.1-6.2), re-run (6.3), finalize deltas doc (6.4-6.6 → T10). T08 + T09 unblocked.
- [T08 — Research + decision: WebGPU renderer + OffscreenCanvas worker render in Pixi 8](tickets/T08-research-webgpu-offscreen.md) — `research`, AFK. Resolved: **Prototype WebGPU only**. One-line change (`launchgame.js:62` `"webgl"` → `"webgpu"`, Pixi auto-falls back). 85% browser coverage (Chrome/Edge/Firefox; Safari 26 ships WebGPU). OffscreenCanvas worker render deferred (major refactor: 68+ `window.game.*` refs, video-bg breakage, input-path rewrite — speculative P95 win only pays off if T07's profiling confirms main-thread contention). Findings: `research/webgpu-offscreen-research.md`. Graduates T17 (WebGPU prototype).
- [T09 — AudioWorklet tight-clock: research + prototype decision](tickets/T09-research-audioworklet.md) — `research`, AFK. Resolved: **Skip**. `osu-audio.js:184-187` already uses `AudioContext.getOutputTimestamp()` — the spec's synchronous, audio-thread-aligned clock bridge. An AudioWorklet would be a higher-jitter (postMessage hop) path to the same quantum-quantized value, with zero-to-negative net win below the RAF vsync floor. Howler coexistence is moot (Howler is hitsounds only; the song clock uses a separate AudioContext). Findings: `research/audioworklet-clock-research.md`. `docs/lazer-feel-deltas.md` to get the skip entry (T10).
- [T17 — Prototype WebGPU renderer](tickets/T17-prototype-webgpu.md) — `task`, HITL. Partially done: commit `262f809`. One-line change landed (`launchgame.js:61` `"webgl"` → `"webgpu"`, Pixi auto-falls back). Headless green (0 pageerrors, 1301 hits). Remaining: user measures P50/P95 on WebGPU vs WebGL in a real browser with `?perfprobe=1` on reference hardware. Result → `docs/lazer-feel-deltas.md` (T10).
- [T16 — Implement D9 animated judgements](tickets/T16-implement-d9-animated-judgements.md) — `task`, HITL. Resolved: commit `57c0ee1`. `skin-loader.js` adds `animationFramerate` parse + removes hit*-N.png skip + groups frames into `window.Skin.__hitAnimFrames`. `playback.js invokeJudgement` creates `PIXI.AnimatedSprite` when frames exist, plays once at `animationFramerate/60`, falls back to static. Despawn cleans up. Conformance goldens regenerated (whitecat 88→328). typecheck 120/120, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T18 — M1 refactor: parse unification, curve contract, parity audit](tickets/T18-m1-parse-curves-audit.md) — `task`, HITL. Resolved: 7 commits on `codex/refactor-m1-parse-curves-audit`. Phase 1 single-source parser (`src/game/parse/track.js`, 425 LOC; `beatmap-worker.js` 356→22 LOC; `osu.js` 597→184 LOC). Phase 2 `pointAtInto`-only curve contract (`curves/Curve.js` abstract base; `playback.js` zero `.pointAt(` callers remaining). M1.6 `lazerHitWindowsLinear` export removed. M1.9 SliderJudge vs SliderScorer contract pinned in headers. Tests: 41 new assertions across 3 spec files (`tests/lazer-parity.spec.mjs` 19/19, `tests/parser/golden-map.spec.mjs` 16/16, `tests/curves/allocation.spec.mjs` 6/6). All green: typecheck 121/121, backend 53/53, lazer-parity 110/110 (no regression), new spec 41/41, headless-game 0 FATAL / 1301 hits / 576 sliders / 0 despawned, visual-bench p50=16.5ms (5/5 runs within tolerance). Audit doc canon appended above as `## M1 audit` (M1.1–M1.10 rules).

## Frontier (open, unblocked, unclaimed)

- **T06 — Rollout: flip the 4 feature flags on, remove legacy code, ship** (`grilling`, HITL) — flip order, validation gates, legacy deletion, score migration policy, release cadence, AGENTS.md decision. Needs user. `docs/wayfinder/tickets/T06-rollout-flags.md`

## Open, blocked (not on the frontier)

- **T10 — Finalize `docs/lazer-feel-deltas.md` with all measured deltas** (`task`, AFK) — blocked by T07 (measurement needs user). T08 (WebGPU) + T09 (AudioWorklet skip) closed; T10 incorporates their decisions. `docs/wayfinder/tickets/T10-finalize-deltas-doc.md`
- **T11 — Real-play validation panel: 3 reference beatmaps × all flags on** (`grilling`, HITL) — blocked by T06. `docs/wayfinder/tickets/T11-real-play-validation.md`
- **T12 — Final validation gates** (`task`, HITL) — blocked by T06, T10, T11, T07. Terminal ticket. `docs/wayfinder/tickets/T12-final-validation.md`
- **T16 — Implement D9 animated judgements** (`task`, HITL) — blocked by T03. `docs/wayfinder/tickets/T16-implement-d9-animated-judgements.md`

## Closed (resolved — see Decisions so far for the gist, ticket for the detail)

- [T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work](tickets/T01-commit-mega.md) — `task`, AFK. Resolved: 4 commits landed, working tree clean. All tests green. See Decisions so far.
- [T02 — Lazer source-of-truth audit](tickets/T02-research-lazer-source-audit.md) — `research`, AFK. Resolved: 15 points audited, 6 confirmed, 9 divergences (D1–D9). Graduated T13 (fix D1–D4) + T14 (decide D5–D9). Findings: `research/lazer-source-audit.md`.
- [T05 — Browser sub-frame timing floor](tickets/T05-research-browser-timing-floor.md) — `research`, AFK. Resolved: practical floor ~9ms P50 / ~20ms P95 at 60Hz (vsync-dominated). 7 candidate attacks feed T08/T09. Findings: `research/browser-timing-floor.md`.
- [T13 — Fix the 4 real lazer-parity bugs (D1–D4)](tickets/T13-fix-audit-parity-bugs.md) — `task`, HITL. Resolved: commit `0e05b2d`. Score V2 production formula wired, HP cap removed, last-combo bonus applied, circle radius fixed. Tests 87 → 110. See Decisions so far.
- [T14 — Decide the 5 webosu-extension-or-fix questions (D5–D9)](tickets/T14-decide-extension-questions.md) — `grilling`, HITL. Resolved: all 5 decisions recorded. Graduated T15 (D5/D6/D8) + T16 (D9). See Decisions so far.
- [T15 — Implement D5/D6/D8 removals + fixes](tickets/T15-implement-d5-d6-d8-removals.md) — `task`, HITL. Resolved: commit `5a99866`. sliderStyle removed, hitCircleOverlap fixed, ApproachCircle fallback dropped. See Decisions so far.
- [T03 — Finish Track B skin conformance](tickets/T03-skin-conformance-wiring.md) — `task`, HITL. Resolved: commit `4f45ea1`. @2x whitelist extended to full lazer-legal set. See Decisions so far.
- [T04 — Conformance harness: scene-graph snapshots, CI wiring, green on all reference skins](tickets/T04-conformance-harness.md) — `task`, HITL. Resolved: commit `d305593`. Scene-graph capture wired, SHA-256 manifest, CI documented as manual. See Decisions so far.
- [T07 — Track C: latency probe + critical-path optimization](tickets/T07-latency-probe-and-critical-path.md) — `task`, HITL. Partially done: commit `6049c2c`. Probe built (headless + `?perfprobe=1`). Remaining needs user (measurement + optimization). See Decisions so far.
- [T08 — Research + decision: WebGPU renderer + OffscreenCanvas worker render in Pixi 8](tickets/T08-research-webgpu-offscreen.md) — `research`, AFK. Resolved: Prototype WebGPU only. Graduates T17. Findings: `research/webgpu-offscreen-research.md`.
- [T09 — AudioWorklet tight-clock: research + prototype decision](tickets/T09-research-audioworklet.md) — `research`, AFK. Resolved: Skip. `osu-audio.js` already uses `getOutputTimestamp()`. Findings: `research/audioworklet-clock-research.md`.
- [T17 — Prototype WebGPU renderer](tickets/T17-prototype-webgpu.md) — `task`, HITL. Partially done: commit `262f809`. One-line change landed; measurement needs user. See Decisions so far.
- [T16 — Implement D9 animated judgements](tickets/T16-implement-d9-animated-judgements.md) — `task`, HITL. Resolved: commit `57c0ee1`. Animated judgement sprites play when skins ship hit*-N.png frames. See Decisions so far.
- [T18 — M1 refactor: parse unification, curve contract, parity audit](tickets/T18-m1-parse-curves-audit.md) — `task`, HITL. Resolved: 7 commits on `codex/refactor-m1-parse-curves-audit`. Single-source parser + `pointAtInto`-only curve contract + M1.6 + M1.9. See Decisions so far.

## Not yet specified

<!-- fog of war: suspected questions toward the destination that aren't sharp enough to ticket yet -->

- **PP recalculation for retroactive score migration**: when Score V2 + new HP go live (T13 fixes + T06 rollout), existing leaderboard rows are tagged `ruleset_version: "v2"` from the old campaign but scored under legacy formulas. Should old scores be re-scored server-side (need the beatmap + mods at recompute time), frozen as-is with a version partition, or purged? Graduates once T06 (rollout) picks a policy — T06 already lists this as question #4.
- **`pointerrawupdate` + `getPredictedEvents()` browser support**: T05 lists these as candidate attacks but their per-browser support is uncertain (Chromium-only for `pointerrawupdate`; `getPredictedEvents` support unconfirmed). Graduates into a T08 sub-decision once someone needs to commit to a specific attack.
- **WebGPU fallback matrix**: T05 says WebGPU is production-ready in Pixi 8.19 with Chrome/Edge/Firefox support; Safari stable was the open question as of the audit. Graduates from T08's research when it picks a prototype path.
- **"Perfect" acceptance criteria for the whole effort**: what's the final gate that says "we're done — perfect parity achieved within browser constraints"? A specific P50/P95 latency number (T05 gives ~9/~20ms at 60Hz as the floor)? A conformance green on N skins + M beatmaps? A user playtest panel (T11)? Graduates once T12 (final gates) has its inputs from T07/T10/T11.

## Out of scope

<!-- ruled beyond the destination -->

- osu!mania / taiko / catch rulesets (out of scope per mega-change non-goals)
- Multiplayer lazer-compat (out of scope per mega-change non-goals)
- Beatmap editor (out of scope per mega-change non-goals)
- Stable (legacy osu!) compatibility — lazer wins where they differ
- A from-scratch engine rewrite (the engine is ported intact per MODERNIZATION-PLAN)
- External DB / multi-process infra (Fly.io-alone constraint)
- 120+ FPS targets on the 2015 floor device (per MODERNIZATION-PLAN; sub-frame timing work targets *latency*, not FPS)
- Pixel-identical output to native lazer (browser render path diverges; we measure, not fake)