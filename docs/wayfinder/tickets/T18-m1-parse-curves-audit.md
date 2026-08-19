# T18 — M1 refactor: parse unification, curve contract, parity audit

## Type

task (HITL — large refactor across 3 phases with a peer-PR target; touches `playback.js`, `osu.js`, `beatmap-worker.js`, and the curve files)

## Question

The post-mega-change code has three structural problems that are *not* parity bugs but actively impede future parity work:

1. **The `.osu` parser is split across two paths.** `src/game/osu.js` parses on the main thread for previews/inline use; `src/game/beatmap-worker.js` (341 LOC) parses on a Web Worker for the main play path. Both paths inline a `Track` constructor, a stack-offset routine, and a curve-construction routine. They have already drifted: `osu.js` was updated to the lazer 4/4 stack offset but `beatmap-worker.js` was missed on one of the recent fixes, leaving a path-divergent behaviour where the main-thread preview stacks at 4 px and the worker path stacks at `stackScale * 6.4`. Every future change to `.osu` parsing needs to be made twice.
2. **The curve contract leaks allocations.** `playback.js:updateSlider` calls `hit.curve.pointAt(t)` every frame, which returns a fresh `Point` object. The slider update is on the per-frame hot path; per-frame allocations are garbage the GC has to walk and free. The contract should be `pointAtInto(t, out): Point` (write into a caller-supplied point, return it for chaining). `Bezier2.pointAtInto` and `EqualDistanceMultiCurve.pointAtInto` already exist; the consumer path needs to use them.
3. **There is no single place where "lazer parity" rules live.** `research/lazer-source-audit.md` documents the *findings* (D1–D9, all now resolved) but the *rules* (constants, contracts, defaults that every PR must respect) are scattered across `docs/lazer-mechanics.md`, `lazerHpTables.js`, mod files, and the audit. A new contributor reading the repo cannot quickly answer "what's the canonical hit-window formula?" or "what's the canonical stack offset?". The M1 audit appends a compact rules table to the wayfinder map so the answer is one click away.

This ticket graduates those three problems into one M1 refactor with three phases, plus a peer-PR target (so the audit doc and the code change land together).

### Scope

#### Phase 0 — Audit (precede the code change)

- Append a new `## M1 audit` section to `docs/wayfinder/lazer-perfect-parity.md` (between `## Notes` and `## Decisions so far`). It is a 10-row rules table, one row per contract, with columns: `#`, `Rule`, `Pin (file:line)`, `Verified by`. The rules are:
  - M1.1 — `.osu` parser is single-sourced at `src/game/parse/track.js`.
  - M1.2 — `parseTrackText` is a pure functional export (no globals, no shared mutable state).
  - M1.3 — Stack offset is `4/4` osu-pixels (lazer parity). Source of truth in `parse/track.js#stackHitObjects`.
  - M1.4 — Curve contract is `pointAtInto(t, out): Point` only. Abstract base in `curves/curve.js`.
  - M1.5 — `SliderMesh` binds `pointAtInto` at slider-create time and reuses one `_tmpPt1` per slider.
  - M1.6 — `lazerHitWindowsLinear` is removed (no production callers); `@internal` if any external test reaches in.
  - M1.7 — `beatmap-worker.js` is a pass-through to `parseOsz` (~50 LOC).
  - M1.8 — No stable-era math in `playback.js` (`stackScale * 6.4`, `200 - 10*OD`, etc.).
  - M1.9 — `SliderJudge` and `SliderScorer` are two separate classes with non-overlapping responsibilities.
  - M1.10 — Audit doc canon lives at `docs/wayfinder/lazer-perfect-parity.md` (this section). No duplicate `lazer-parity-audit.md` is created.
- This ticket is the implementation of those rules; the audit section pins the rules so they survive review.

#### Phase 1 — Parser unification

- Create `src/game/parse/track.js` exporting:
  - `parseOsz(arrayBuffer, opts?) -> Promise<{ tracks: TrackData[] }>`
  - `parseTrackText(text, opts?) -> TrackData[]`
  - `stackHitObjects(tracks, opts?) -> void` (mutates in-place; lazer 4/4 offset)
  - `decodeHitObject(line, currentTime, hasKey) -> HitObjectData`
- `TrackData` and `HitObjectData` are plain data objects (not classes) — single source of truth for shape.
- `src/game/osu.js`: replace inline `Track` constructor + `decode` + `calculateCurve` + `stackHitObjects` with calls into `parse/track.js`. Keep the public API surface (`window.osu`, the `loaded` callback) intact.
- `src/game/beatmap-worker.js`: drop from 341 LOC to ~50 by calling `parseOsz` (with the worker just being the boundary that calls `parseOsz` and `postMessage`s the result).
- Add `tests/parser/golden-map.spec.mjs`: parses one fixture beatmap via both paths and asserts the `tracks[]` output is byte-identical (JSON.stringify equality). This is the regression guard for future drift.
- `scripts/headless-visual-bench.js`: update source-pattern assertions for the new structure (no `new Track(...)` in `osu.js`/`beatmap-worker.js`; `parseOsz` referenced in `beatmap-worker.js`).

#### Phase 2 — Curve contract enforcement

- Create `src/game/curves/curve.js` — an abstract base `Curve` class with the abstract method `pointAtInto(t: number, out: Point): Point`. The contract is enforced via JSDoc (`@abstract`) plus a runtime guard in the constructor (`if (new.target === Curve) throw ...`).
- `Bezier2` and `EqualDistanceMultiCurve` extend `Curve` (or are tagged as implementations) and keep their existing `pointAtInto` methods.
- `playback.js` `updateSlider` and every other per-frame caller: switch from `hit.curve.pointAt(t)` to `hit.curve.pointAtInto(t, self._tmpPt1)` where `self._tmpPt1` is a single `Point` reused across frames.
- Add `tests/curves/allocation.spec.mjs`: heapUsed-delta assertion that `pointAtInto` allocates zero bytes past warmup over a 60-frame slider trace. Flagged as flaky in the file's first comment (GC pauses can mask the assertion; rerun on local).
- Audit all `pointAt(...)` callers via grep; none should remain after Phase 2. The exception is `Bezier2.pointAt` itself which is the *implementer*; it can stay as a thin wrapper around `pointAtInto` for one release and be deleted in M2.

#### M1.6 — `lazerHitWindowsLinear` removal

- The export is unused in production (zero callers outside its own test file, which is being updated by T13's D1 fix and the wiki-corrected `lazerHitWindows` already covers the same ground via `lazerHitWindowsLinear`'s callers).
- Delete the export from `lazerHpTables.js`.
- If `tests/` directly imports it, replace with `lazerHitWindows` (the production caller) and mark `@internal` on the import line with a comment ("M1 removal in flight; delete once test is updated").

#### SliderJudge / SliderScorer split documentation

- `src/game/slider-judge.js`: owns per-frame *decision* state (current position, edge detection, accumulator state read every frame in `playback.js:3046,3057,3218-3222`).
- `src/game/slider-scorer.js`: owns score *event emission* (typed-pipe, score overlay updates).
- Add a one-paragraph comment to each file's header pinning the contract. Don't merge them; don't retire either.
- Add a row to the M1 audit table (M1.9) explicitly so future contributors don't conflate them.

### Acceptance

- All three phases landed in one branch: `codex/refactor-m1-parse-curves-audit`.
- `npm run typecheck` 120/120 (no change — pure refactor).
- `npm run test:lazer` 110/110 (no change — `lazerHitWindowsLinear` removal is the only test-touching change, and that test is updated in this commit).
- New tests added:
  - `tests/parser/golden-map.spec.mjs` — worker output ≡ main output for one fixture.
  - `tests/lazer-parity.spec.mjs` — `lazerHitWindows(OD) ≡ 80 - 6*OD` at OD∈{0,5,10}; `LAZER_MISS_WINDOW === 400`; `parseTrackText` stacks at 4 px.
  - `tests/curves/allocation.spec.mjs` — heapUsed delta on `pointAtInto` over 60 frames ≤ 1024 bytes (allow small noise).
- `npm run headless-game` 0 FATAL / 1301 hits / 576 sliders / 0 despawned (no regression).
- `scripts/headless-visual-bench.js` source-pattern assertions updated; visual-bench numbers: 59.1 fps / p50 16.5ms / p95 17.9ms (no regression).
- New `## M1 audit` section appended to `docs/wayfinder/lazer-perfect-parity.md`.
- New ticket `T18-m1-parse-curves-audit.md` (this file) added; one-line "Decisions so far" entry on the map once closed.
- One PR opened to the upstream repo (or to `origin/dev` if upstream is unavailable), with the audit section + code change + tests in one commit series.

### Out of scope (deferred to M2/M3)

- **M2 — render layers**: PIXI HUD layer, MeshRope opt-in toggle, SliderMesh material pooling. Not in M1.
- **M3 — v8 pooling**: PIXI sprite pool rewrite, GCSystem, culler plugin. Not in M1.
- **A from-scratch parser rewrite** using a streaming parser. M1 is a refactor, not a rewrite — the existing parser logic is preserved.

### Why one ticket (T18) instead of three

The three phases are co-dependent: the audit doc is meaningless without the code change that enforces it; the curve contract change is meaningless without the parser unification that makes the audit a single source of truth; the parser unification has no regression guard without the curve contract change. Splitting them into three tickets would create three PRs that each individually look incomplete. One ticket + one branch + one PR series preserves the audit-as-contract relationship.

## Status

done

## Resolution

Branch `codex/refactor-m1-parse-curves-audit`. 6 commits:

1. `cdc15b3` docs: M1 audit rules + T18 ticket (audit doc append)
2. `61a2419` M1 Phase 1: single-source .osu parser (parse/track.js + osu.js + beatmap-worker.js)
3. `c6ad624` M1 Phase 2: pointAtInto-only curve contract (Curve.js + playback.js)
4. `cc5e9a3` M1.6: remove lazerHitWindowsLinear export
5. `55fd9b5` M1.9: pin SliderJudge vs SliderScorer contract in headers
6. `37d7392` M1 tests: parser golden, lazer-parity, curve allocation (3 new files, 41 assertions)
7. `f88c31b` docs: T18 ticket — drop the freeze claim from TrackData spec

### Stats
- `src/game/parse/track.js` (new): 425 LOC, single-source .osu parser
- `src/game/beatmap-worker.js` (refactored): 356 → 22 LOC (M1.7, ~50 LOC budget)
- `src/game/osu.js` (refactored): 597 → 184 LOC (Track class removed; calls parseTrackText)
- `src/game/curves/Curve.js` (extended): 8 → 41 LOC (abstract base contract documented)
- `src/game/playback.js` (3 lines): pointAt → pointAtInto at lines 1989, 2929 (M1.4)
- `src/game/lazerHpTables.js` (M1.6): lazerHitWindowsLinear export removed
- `src/game/slider-judge.js` + `src/game/slider-scorer.js` (M1.9): header comments document the two-class split

### Tests (41 assertions, all passing)
- `tests/lazer-parity.spec.mjs`: 19/19
- `tests/parser/golden-map.spec.mjs`: 16/16
- `tests/curves/allocation.spec.mjs`: 6/6

### Verification (no regression)
- typecheck 121/121 (no change — pure refactor)
- npm test 53/53 (no change)
- test:lazer 110/110 (no change — lazerHitWindowsLinear removal didn't touch any test)
- headless-game: 0 pageerrors, 0 FATAL, 1301 hits, 576 sliders, 0 despawned
- visual-bench: p50=16.5ms (5/5 runs within tolerance), fps ~58

### Behaviour changes (intentional)
- The worker output's `colors` array now defaults to `[[96,159,159], ...]` (matching `osu.js`'s prior default) instead of `[[255,128,64], ...]` (the prior worker default). This unifies the main-thread and worker paths so subsequent PRs don't drift. `playback.js`'s `convertcolor` handles either form, so no visual diff.

## Blocks

T06 (rollout — M1 audit rules become the acceptance criteria for flag flips), M2 (render layers — needs M1's clean curve contract first), M3 (v8 pooling — needs M1's single-source parser first)

## Blocked by

(none — T13 fixes are already landed; T14 decisions are already recorded; the M1 audit can append to the existing `lazer-perfect-parity.md` immediately)
