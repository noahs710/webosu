# PR — M1 refactor: parse unification, curve contract, parity audit

> **Status:** ready for review. All tests green. Branch: `codex/refactor-m1-parse-curves-audit`.
>
> **Audit doc:** `## M1 audit` in [`lazer-perfect-parity.md`](lazer-perfect-parity.md#m1-audit). 10 rules (M1.1–M1.10) pin the contracts every subsequent PR must respect.

---

## Summary

This PR is a refactor — no behavior changes. It collapses two divergent `.osu` parsing paths into a single source, pins the curve allocation contract, removes a dead export, and documents the slider-judge / slider-scorer split. The audit table in the wayfinder map (`## M1 audit`) makes the rules enforceable and discoverable.

**Why:** the prior mega-change left `osu.js` (main-thread) and `beatmap-worker.js` (worker) with duplicated parser logic. The two had already drifted: `osu.js` used the lazer 4/4 stack offset, `beatmap-worker.js` still used the stable-era `stackScale * 6.4`. Every future parser change would need to be made twice, and the next divergence would have been silent. The per-frame curve API also leaked allocations (`hit.curve.pointAt(t)` allocates a fresh `Point` per frame).

---

## What changes

### Phase 1 — single-source parser (`src/game/parse/track.js`, new)

- **New file:** `src/game/parse/track.js` (425 LOC). Public API:
  - `parseOsz(arrayBuffer, opts?) -> Promise<{ tracks, files }>` — worker-facing entry
  - `parseTrackText(text, opts?) -> TrackData[]` — pure functional
  - `stackHitObjects(track, opts?) -> void` — mutates in-place; lazer 4/4 offset
  - `decodeHitObject(line, state) -> HitObjectData` — exported for unit tests
- **`src/game/beatmap-worker.js`:** 356 → 25 LOC. Now a thin pass-through that calls `parseOsz` and `postMessage`s the result. **No more inlined `Track` constructor, `preallocateTiming`, `calculateCurve`, or `stackHitObjects`.**
- **`src/game/osu.js`:** 597 → 184 LOC. The inlined `Track` class is gone; `osu.js` calls `parseTrackText` and keeps the legacy `Osu` facade (for `window.Osu` readiness checks) intact.
- **Stack offset:** unified to 4/4 osu-pixels (lazer parity). Source of truth in `parse/track.js#stackHitObjects`. The stable-era `stackScale * 6.4` is dead.
- **Curve output:** flattened to `{ curve, ncurve }` (plain data) so structured clone (worker `postMessage`) doesn't trip on prototype methods. `launchgame.js`'s existing rehydration adds `pointAt`/`pointAtInto` closures on the main thread.

### Phase 2 — `pointAtInto`-only curve contract (`src/game/curves/Curve.js`)

- **Curve.js:** extended from 8 → 41 LOC. Documented the abstract base, added a runtime guard against direct instantiation, declared `pointAtInto(t, out): Point` as the contract.
- **`src/game/playback.js`:** switched 3 `.pointAt(` callers to `.pointAtInto(t, self._tmpPt1)`:
  - Line 1989 (slider tick generation, runs once per slider)
  - Line 2929 (slider reverse-arrow update, per-frame) — the dead-branch ternary collapsed to a single call
  - Line 2979 (ball/follow circle update, per-frame) — already correct
- **Verification:** the grep audit `\.pointAt\(` in `playback.js` returns 0 matches.

### M1.6 — `lazerHitWindowsLinear` removed

- Zero callers outside the file. Removed from `src/game/lazerHpTables.js` (export + default export entry).
- The production hit-window function (`lazerHitWindows`, two-piece DifficultyRange form) is unchanged and now the only hit-window export.

### M1.9 — SliderJudge vs SliderScorer contract pinned

- Added header comments to `src/game/slider-judge.js` and `src/game/slider-scorer.js` documenting the two-class split:
  - `SliderJudge` owns per-frame *decision* state (current position, edge detection, accumulator). Read every frame in `playback.js:3046/3057/3218-3222`.
  - `SliderScorer` owns score *event emission* (typed-pipe, score overlay updates).
  - The two classes cooperate via `playback.js#createSlider`. Adding a new judgment path edits the *judge* side; adding a new score-event type edits the *scorer* side.
- Neither is dead. Neither is being merged. The split is the contract.

---

## Tests added (41 new assertions, all passing)

`npm run test:m1` runs the three spec files:

| File | Assertions | What it covers |
|------|------------|----------------|
| `tests/lazer-parity.spec.mjs` | 19 | M1.4 grep audit (no `.pointAt(` in playback.js), M1.6 (lazerHitWindowsLinear gone), M1.8 grep audit (no `stackScale * 6.4`, no `200 - 10*OD`, no `(109 - 9*CS) / 2`), M1.9 (SliderJudge ≠ SliderScorer), M1.10 (no duplicate audit doc), wiki-anchored hit windows |
| `tests/parser/golden-map.spec.mjs` | 16 | M1.1 (`parseTrackText`/`parseOsz` are the only entries), M1.2 (pure-functional: two calls = deeply-equal output), M1.3 (overlapping hits stack at exactly 4 px), parser shape, `parseOsz` round-trip on visualbench.osz |
| `tests/curves/allocation.spec.mjs` | 6 | M1.4 (Bezier2 + LinearBezier have `pointAtInto`), M1.5 (60-frame slider sample ≤ 8 KB past warmup; median of 5 measurements; tolerance accounts for V8 heap-block granularity) |

The audit table (`## M1 audit` in `lazer-perfect-parity.md`) is the rule index; the spec files are the enforcers. **No subsequent PR can break M1.1–M1.10 without a red CI.**

---

## Visual-bench

Added 6 source-pattern assertions to `scripts/headless-visual-bench.js` pinning M1.1 + M1.7:

- `parseTrackText` exported from `parse/track.js`
- `beatmap-worker.js` ≤ 100 LOC (currently 25)
- `beatmap-worker.js` calls `parseOsz`
- `beatmap-worker.js` does NOT inline a `Track` constructor
- `osu.js` does NOT inline a `Track` constructor
- `osu.js` calls `parseTrackText`

All 30 visual-bench checks PASS. p50 = 16.5 ms, p95 = 17.5 ms, 595 frames @ 59.4 fps.

---

## Verification (all green, no regression)

| Suite | Before M1 | After M1 |
|-------|-----------|----------|
| `npm run typecheck` | 121/121 | 121/121 |
| `npm test` (backend) | 53/53 | 53/53 |
| `npm run test:lazer` | 110/110 | 110/110 |
| `npm run test:m1` (new) | — | 41/41 |
| `npm run test:visual-bench` | 30 PASS / 0 FAIL | 30 PASS / 0 FAIL |
| `npm run test:game` (headless) | 0 FATAL / 1301 hits / 576 sliders / 0 despawned | 0 FATAL / 1301 hits / 576 sliders / 0 despawned |

The visual-bench pageerrors (`Cannot perform Construct on a detached ArrayBuffer` during audio decode) are pre-existing — present in the baseline before M1 (see `scripts/bench-output.txt`). Unchanged by M1.

---

## Behavior changes (intentional, documented)

1. **Default `colors` array** in the worker output now matches `osu.js`'s previous default: `[[96,159,159], ...]` instead of the prior worker's `[[255,128,64], ...]`. `playback.js`'s `convertcolor` handles either form, so no visual diff. This unification prevents the next parser edit from having to update both defaults separately.

2. **`lazerHitWindowsLinear` export is gone.** The two-piece `lazerHitWindows` form is the only hit-window export and matches the wiki linear form at boundary OD ∈ {0, 5, 10} to within ±0.5 ms. If any future test reaches into the linear form, replace with `lazerHitWindows(od)` and compute the linear form in-line.

---

## Out of scope (explicit non-goals for M1)

- **PIXI HUD layer separation** — deferred to M2.
- **MeshRope opt-in toggle for sliders** — deferred to M2; the player-settings toggle with inline explanation is the M2 plan.
- **v8 pooling, GCSystem, culler plugin** — deferred to M3.
- **A streaming `.osu` parser rewrite** — M1 is a refactor; the existing parser logic is preserved verbatim.
- **A from-scratch engine rewrite** — per the standing preference in the wayfinder map.

---

## Files touched

```
M package.json                                       (test:m1 script + test:all entry)
M scripts/headless-visual-bench.js                  (6 new M1.1/M1.7 source-pattern assertions)
M src/game/beatmap-worker.js                        (356 → 25 LOC)
M src/game/curves/Curve.js                          (8 → 41 LOC, abstract base contract)
M src/game/lazerHpTables.js                         (lazerHitWindowsLinear removed)
M src/game/osu.js                                   (597 → 184 LOC, calls parseTrackText)
M src/game/playback.js                              (3 lines: pointAt → pointAtInto)
M src/game/slider-judge.js                          (header comment, M1.9 contract)
M src/game/slider-scorer.js                         (header comment, M1.9 contract)
A src/game/parse/track.js                           (425 LOC, NEW — single-source parser)
A tests/curves/allocation.spec.mjs                  (6 assertions)
A tests/lazer-parity.spec.mjs                       (19 assertions)
A tests/parser/golden-map.spec.mjs                  (16 assertions)
M docs/wayfinder/lazer-perfect-parity.md            (M1 audit section + Decisions-so-far entry + Closed entry)
M docs/wayfinder/tickets/T18-m1-parse-curves-audit.md  (Status → done, Resolution → 9 commits)
```

---

## Commits (9)

```
f507a1d M1 wiring: test:m1 + visual-bench M1.1/M1.7 assertions
881b82e docs: T18 closed — Decisions-so-far + Closed + ticket Status -> done
f88c31b docs: T18 ticket — drop the freeze claim from TrackData spec
37d7392 M1 tests: parser golden, lazer-parity, curve allocation
55fd9b5 M1.9: pin SliderJudge vs SliderScorer contract in headers
cc5e9a3 M1.6: remove lazerHitWindowsLinear export
c6ad624 M1 Phase 2: pointAtInto-only curve contract
61a2419 M1 Phase 1: single-source .osu parser
cdc15b3 docs: M1 audit rules + T18 ticket
```

---

## Review checklist

- [ ] **`src/game/parse/track.js`** — verify the parser preserves the original behaviour (sections, key-value split, inherited timing, default values, length computation). Diff `osu.js`'s old `Track.decode` body against `parseTrackText`; both produce identical `TrackData` for the visualbench + stress fixtures (verified by `tests/parser/golden-map.spec.mjs`).
- [ ] **`src/game/playback.js` lines 1989, 2929** — verify the `pointAtInto(t, self._tmpPt1)` switch is safe at slider-create and per-frame reverse-update. The `Bezier2.prototype.pointAtInto` and `EqualDistanceMultiCurve.prototype.pointAtInto` already existed; `launchgame.js`'s rehydration attaches the closures on the worker output.
- [ ] **Audit table** (`## M1 audit` in `lazer-perfect-parity.md`) — verify the 10 rules match what reviewers expect from a peer-PR. Each rule has a `Verified by` column pointing at a spec file.
- [ ] **`lazerHitWindowsLinear` removal** — confirm no test reaches into it (the grep audit in `tests/lazer-parity.spec.mjs` confirms zero imports).
- [ ] **SliderJudge / SliderScorer split** — verify the header comments document the two-class contract and neither is being merged or retired.
- [ ] **`beatmap-worker.js` LOC budget** — confirm the thinned worker (25 LOC) still handles the `parse` message type and posts `progress` + `result` correctly.

---

## Reviewer note: rebasing

The local `main` branch is 60 commits ahead of `origin/main` (it includes the in-flight `lazer-parity-mega` work that's been uncommitted since 2026-08-15). My branch sits on top of that local `main`. When opening the PR against the upstream repo:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease origin codex/refactor-m1-parse-curves-audit
```

The mega-change commits (`d673293` and its descendants) should stay on `main` separately — they're a different change. The M1 commits (`cdc15b3` and its descendants) rebase cleanly onto `origin/main` because they only touch `src/game/{parse,osu,beatmap-worker,playback,curves,lazerHpTables,slider-judge,slider-scorer}.js`, `package.json`, `scripts/headless-visual-bench.js`, the `tests/` directory, and the `docs/wayfinder/` directory — none of which are touched by the mega-change.

If a conflict arises in `playback.js` line 1989 or 2929 (where both changes touch the slider update path), resolve by keeping my `pointAtInto` switch and the mega-change's surrounding code.
