# Map — lazer-perfect-parity

## Destination

Every **reducible** gap between webosu! and native osu!lazer is closed (Track A judging/scoring/HP done behind flags, Track B skin conformance green on all reference skins, Track C latency optimized on the critical path), the feature flags are flipped on, the legacy code paths are deleted, and the conformance harness gates every commit. **Plus**: the deltas currently classified "not reducible" in `docs/lazer-feel-deltas.md` are actively attacked — WebGPU renderer path, AudioWorklet tight-clock, OffscreenCanvas worker render, sub-frame input timing — with measured before/after numbers, re-opening the "honest best-effort" stance. "Perfect" = zero reducible deltas + every browser-constrained delta narrowed as far as the platform allows and published.

## Notes

- **Domain**: web port of osu!lazer's osu!standard ruleset. Single-process Node + Fastify backend, Fly.io-only (no external DB). Frontend Vue 3 + Tailwind SPA; game engine Pixi 8 ESM, dynamically imported on beatmap click (isolation invariant — shell never fetches Pixi).
- **Existing planning artifacts**: `docs/wayfinder/MODERNIZATION-PLAN.md` (Phases 1–6 modernization, all done except Phase 6 bench-lock on real hardware), `docs/wayfinder/STATUS.md` (current state), `docs/lazer-feel-deltas.md` (the deltas this map re-opens), and `openspec/changes/lazer-parity-mega/` (the in-flight mega-change, partially landed, **uncommitted** — its Track A is ~done behind flags, Track B ~40%, Track C ~5%, §7 rollout + §8 gates entirely unstarted).
- **Skills every session should consult**: `pixijs-*` for any renderer/scene-graph work (esp. `pixijs-core-concepts`, `pixijs-performance`, `pixijs-custom-rendering`, `pixijs-environments` for OffscreenCanvas); `domain-modeling` when refining lazer-ruleset terminology; `diagnosing-bugs` for any regression; `tdd` for the harness/property-test work.
- **Standing preferences**: honest wording — never claim "exactly like lazer" or "no deviation"; publish measured deltas. No from-scratch engine rewrite (port, don't rewrite). No external DB/infra (Fly.io-alone). No mania/taiko/catch, no multiplayer lazer-compat, no editor (all out of scope).
- **Tracker**: local-markdown at `docs/wayfinder/tickets/` (no GitHub Issues tracker configured). Map = this file; tickets = `docs/wayfinder/tickets/T<NN>-<slug>.md`. Blocking edges recorded in each ticket's `## Blocks` / `## Blocked by` sections. Frontier = open tickets with all `Blocked by` closed.

## Decisions so far

- [T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work](tickets/T01-commit-mega.md) — `task`, AFK. Resolved: 4 commits landed (`d673293` core, `c70594e` openspec, `14f77fa` wayfinder, `b0996c0` gitignore). typecheck 121/121, backend 53/53, lazer parity 87/87, conformance 4/4 (goldens regenerated after fixing a harness crash — fresh page per skin), headless-play/mod-flashlight/settings/error-popup/crash all 0 pageerrors. tasks.md reconciled (3.1/3.3/3.4 → `[ ]` per audit; 2.0 added for D4 circle-radius bug). Stray runtime artifacts gitignored. Scope-creep flagged for T14: aspect-ratio overlay in `skin-loader.js`.
- [T02 — Lazer source-of-truth audit](tickets/T02-research-lazer-source-audit.md) — 15 points audited vs ppy/osu master; **6 confirmed, 9 divergences (D1–D9)**. Findings at `research/lazer-source-audit.md`. Divergences graduate T13 (fix D1–D4 the real parity bugs in score/radius/HP) + T14 (decide D5–D9 the webosu-extension-or-fix questions). Key: Score V2 production path is wrong (D1), HP loss cap + last-combo bonus unapplied (D2/D3), circle radius formula wrong for CS≠5 (D4), `sliderStyle` is a webosu invention not lazer (D5), `hitCircleOverlap` shift factor wrong (D6), `@2x` whitelist is a subset (D7), `[Colours] ApproachCircle` is NOT consumed by lazer — mega task 5.12 should be dropped (D8), `hit*-N.png` frames ARE used by lazer for animated judgements — webosu's skip is a memory trade-off not parity (D9).
- [T05 — Browser sub-frame timing floor](tickets/T05-research-browser-timing-floor.md) — practical floor ~9ms P50 / ~20ms P95 at 60Hz (vsync-dominated, not timestamp granularity). Findings at `research/browser-timing-floor.md`. 7 candidate attacks graduate consideration in T08/T09: COOP+COEP isolation (20× finer timestamps), `pointerrawupdate` (un-coalesced, Chromium-only), `PointerEvent.getPredictedEvents()` (native predictor), AudioWorklet reference clock bridge (2.67ms quantum), `AudioContext.getOutputTimestamp()` (audio↔perf.now bridge), OffscreenCanvas+worker render (lower P95 via main-thread insulation), `DedicatedWorkerGlobalScope.requestAnimationFrame`. WebGPU timestamp queries are NOT useful (queue-timeline, coarsened). Factual correction: AudioWorklet `process()` runs at 128-frame render quantum (~2.67ms), NOT sample rate (~0.02ms) — ticket T09 hypothesis was wrong.
- [T13 — Fix the 4 real lazer-parity bugs (D1–D4)](tickets/T13-fix-audit-parity-bugs.md) — `task`, HITL. Resolved: commit `0e05b2d`. D1 Score V2 production formula wired (`scoreTyped` method added to `ScoreOverlay`, `hit()` routes through it when `lazerScoreV2` on; critical catch — `SliderScorer`'s `scoreTyped()` calls were going to a non-existent method, silent TypeError swallowed by render-loop try/catch). D2 HP loss cap removed (miss at HP=10 now drains −0.20, not −0.10). D3 last-in-combo bonus applied (`scoreTyped` tracks per-combo tier, adds +0.07/+0.05/+0.03 on `lastInCombo`; `playback.js` computes `hit.lastInCombo` at `populateHit` time). D4 circle radius fixed (`32 * (1 - 0.7 * lazerDifficultyRange(CS, 0, 0.5, 1))`, was wrong for CS≠5). Tests 87 → 110 (+23). All green: typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T14 — Decide the 5 webosu-extension-or-fix questions (D5–D9)](tickets/T14-decide-extension-questions.md) — `grilling`, HITL. Resolved: all 5 decisions recorded via grilling. **D5 `sliderStyle`: REMOVE** (always gradient, true lazer parity). **D6 `hitCircleOverlap`: FIX** (`* 0.3` → `* 0.5` per side; default 0 → -2). **D7 `@2x` whitelist: EXTEND** (~12 missing names + beatmap-skin @2x disable — T03 scope). **D8 `[Colours] ApproachCircle`: DROP mega task 5.12** (approach uses combo colour; lazer ignores beatmap ApproachCircle). **D9 `hit*-N.png` animated judgements: IMPLEMENT** (load frames, play as `PIXI.AnimatedSprite` — scope expansion). Graduated T15 (D5/D6/D8 code changes) + T16 (D9 animated judgements). User chose to remove sliderStyle (option 2) over the recommended keep-as-extension (option 1).
- [T15 — Implement D5/D6/D8 removals + fixes](tickets/T15-implement-d5-d6-d8-removals.md) — `task`, HITL. Resolved: commit `5a99866`. D5 sliderStyle removed (SliderMesh always gradient; ~30 lines MeshRope textured code deleted). D6 hitCircleOverlap fixed (`* 0.3` → `* 0.5` per side; default 0 → -2). D8 ApproachCircle fallback dropped (approach = skin else combo; mega task 5.12/5.13 dropped). typecheck 120/120, backend 53/53, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.
- [T03 — Finish Track B skin conformance](tickets/T03-skin-conformance-wiring.md) — `task`, HITL. Resolved: commit `4f45ea1`. D7 @2x whitelist extended to full lazer-legal set in `skin-filter.js` (added ~12 missing base names: hit100k, hit*-N animation frames, cursor-ripple/star2/cursor-smoke, sliderstartcircle(+overlay), sliderpoint30/10, particle50/100/300, scorebar-ki(+kidanger/+kidanger2)). Beatmap-skin @2x disable implicitly enforced. Conformance goldens regenerated (texture counts up across all 4 reference skins). tasks.md 5.1 done, 5.2 superseded, 5.4 → T16. typecheck 120/120, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.

## Frontier (open, unblocked, unclaimed)

- **T04 — Conformance harness: scene-graph snapshots, CI wiring, green on all reference skins** (`task`, HITL) — scene-graph capture at frames [10,30,60]; `npm run test:conformance` in `test:all`; SHA-256 manifest; CI decision. `docs/wayfinder/tickets/T04-conformance-harness.md`
- **T07 — Track C: latency probe + critical-path optimization** (`task`, HITL) — T05 (browser timing floor) is closed; the probe can be built from T05's methodology. The user owns the reference hardware for the P50/P95 measurement. `docs/wayfinder/tickets/T07-latency-probe-and-critical-path.md`
- **T16 — Implement D9 animated judgements** (`task`, HITL) — load `hit*-N.png` frames, play as `PIXI.AnimatedSprite` at `AnimationFramerate`. T03's whitelist now allows the frames; T16 removes the skin-loader skip + implements the playback. `docs/wayfinder/tickets/T16-implement-d9-animated-judgements.md`

## Open, blocked (not on the frontier)

- **T06 — Rollout: flip the 4 feature flags on, remove legacy code, ship** (`grilling`, HITL) — blocked by T04. `docs/wayfinder/tickets/T06-rollout-flags.md`
- **T08 — Research + decision: WebGPU renderer + OffscreenCanvas worker render in Pixi 8** (`research`, AFK) — blocked by T07. `docs/wayfinder/tickets/T08-research-webgpu-offscreen.md`
- **T09 — AudioWorklet tight-clock: research + prototype decision** (`research`, AFK) — blocked by T07. `docs/wayfinder/tickets/T09-research-audioworklet.md`
- **T10 — Finalize `docs/lazer-feel-deltas.md` with all measured deltas** (`task`, AFK) — blocked by T07, T08, T09, T05. `docs/wayfinder/tickets/T10-finalize-deltas-doc.md`
- **T11 — Real-play validation panel: 3 reference beatmaps × all flags on** (`grilling`, HITL) — blocked by T04, T06. `docs/wayfinder/tickets/T11-real-play-validation.md`
- **T12 — Final validation gates** (`task`, HITL) — blocked by T06, T10, T11, T08, T09, T04, T07. Terminal ticket. `docs/wayfinder/tickets/T12-final-validation.md`
- **T16 — Implement D9 animated judgements** (`task`, HITL) — blocked by T03. `docs/wayfinder/tickets/T16-implement-d9-animated-judgements.md`

## Closed (resolved — see Decisions so far for the gist, ticket for the detail)

- [T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work](tickets/T01-commit-mega.md) — `task`, AFK. Resolved: 4 commits landed, working tree clean. All tests green. See Decisions so far.
- [T02 — Lazer source-of-truth audit](tickets/T02-research-lazer-source-audit.md) — `research`, AFK. Resolved: 15 points audited, 6 confirmed, 9 divergences (D1–D9). Graduated T13 (fix D1–D4) + T14 (decide D5–D9). Findings: `research/lazer-source-audit.md`.
- [T05 — Browser sub-frame timing floor](tickets/T05-research-browser-timing-floor.md) — `research`, AFK. Resolved: practical floor ~9ms P50 / ~20ms P95 at 60Hz (vsync-dominated). 7 candidate attacks feed T08/T09. Findings: `research/browser-timing-floor.md`.
- [T13 — Fix the 4 real lazer-parity bugs (D1–D4)](tickets/T13-fix-audit-parity-bugs.md) — `task`, HITL. Resolved: commit `0e05b2d`. Score V2 production formula wired, HP cap removed, last-combo bonus applied, circle radius fixed. Tests 87 → 110. See Decisions so far.
- [T14 — Decide the 5 webosu-extension-or-fix questions (D5–D9)](tickets/T14-decide-extension-questions.md) — `grilling`, HITL. Resolved: all 5 decisions recorded. Graduated T15 (D5/D6/D8) + T16 (D9). See Decisions so far.
- [T15 — Implement D5/D6/D8 removals + fixes](tickets/T15-implement-d5-d6-d8-removals.md) — `task`, HITL. Resolved: commit `5a99866`. sliderStyle removed, hitCircleOverlap fixed, ApproachCircle fallback dropped. See Decisions so far.

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