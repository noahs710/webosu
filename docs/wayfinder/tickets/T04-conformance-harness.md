# T04 — Conformance harness: scene-graph snapshots, CI wiring, green on all reference skins

## Type
task (HITL)

## Question

The skin conformance harness (`scripts/headless-skin-conformance.js`) exists and captures a texture-table JSON snapshot, but the mega-change's `tasks.md` flags it as incomplete on several fronts. Finish it so it can gate every commit on the map.

### Remaining harness items (from `tasks.md` §1 + §5)

1. **1.7b** Scene-graph snapshot capture mid-gameplay. The current harness snapshots only the texture table (`__snapshotSkinTree`'s `textures` key). To validate slider rewiring and skin rendering *during play*, capture the scene-graph leaves (`scene` key in `__snapshotSkinTree` — the code is already in `main.js` from T01) at frames [10, 30, 60] of a fixed reference beatmap. Invariant-form (sorted, rounded coords) not sequence-form — per tasks.md 2.9c, per-event timestamps are non-deterministic in headless due to frame jitter.
2. **1.8b** Add `npm run test:conformance` script + include in `test:all`. Currently runs manually only.
3. **1.8** Wire harness into CI as a gating check. The repo has no CI config visible (no `.github/workflows/`) — check, and if absent, this becomes "document the manual run command in `docs/wayfinder/STATUS.md`" rather than a CI wiring task. Confirm with the user which they want (HITL — ask).
4. **5.8** Verify default-skin renders identically pre/post the Track B changes (T03). Snapshot diff must be empty for `skins/default.osk`. If non-empty, iterate with T03.
5. **5.11** Same for `hitCircleOverlap: 0` default skin.
6. **5.13** Conformance test verifying beatmap `ApproachCircle` is used only when skin.ini omits it — drives a second reference beatmap with `[Colours] ApproachCircle` set, snapshots both skin-with-ApproachCircle and skin-without, asserts the fallback path.
7. **Golden refresh**: re-run `--update-golden` for all 4 reference skins (`whitecat-full`, `reowotuna-default`, `aristia-weird`, `vaxei-minimal` in `scripts/conformance-skins/`) **after** T03 lands, so goldens reflect the complete skin pipeline. Commit the new goldens.
8. **SHA-256 manifest** for `scripts/conformance-skins/` (tasks.md 1.3 marked this NOT done) — so a skin file changing is detected. One-file `manifest.json` mapping skin id → sha256.

### Acceptance

- `npm run test:conformance` exists and is in `test:all`.
- Harness captures scene-graph snapshots at frames [10, 30, 60] of a fixed beatmap, invariant-form.
- All 4 reference skins pass against their goldens (zero diff) with T03's skin pipeline.
- Default skin (5.8 + 5.11) shows zero diff vs pre-change.
- Beatmap ApproachCircle fallback test (5.13) passes.
- `scripts/conformance-skins/manifest.json` committed.
- CI decision resolved (either wired or documented as manual).
- One-line Decisions-so-far entry on the map.

## Blocks

T06 (rollout gates on conformance green), T12 (final validation gate re-runs the harness)

## Blocked by

T01 (clean base + `__snapshotSkinTree` hooks committed), T03 (skin pipeline must be complete before refreshing goldens)