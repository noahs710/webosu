# T03 — Finish Track B skin conformance: @2x whitelist, sliderb@2x, beatmap ApproachCircle

## Type
task (HITL)

## Question

Track B of the mega-change is ~40% done. The remaining skin-wiring work is well-specified in `tasks.md` §5 but not yet landed. Finish it so the conformance harness (T04) has a complete skin pipeline to validate.

### Remaining Track B items (from `openspec/changes/lazer-parity-mega/tasks.md`)

1. **5.1** Extend `src/game/skin-filter.js` whitelist with `@2x` variants of existing whitelisted names. The authoritative list comes from T02's research finding #9 — do NOT guess; wait for T02 (or cite lazer source directly if T02 is done).
2. **5.2** Wire `sliderb@2x.png` as texture-fill source when `sliderStyle: 2`. `SliderMesh.js` already has the `sliderStyle === 2` branch (committed in T01) using `sliderb.png` — extend to prefer `sliderb@2x.png` when present (resolution-doubled texture).
3. **5.4** Document intentional skip of `hit*-<n>.png` numbered variants in `skin-loader.js` and `skin-filter.js` (mark as reserved for future animation support) — code comment + a one-line note in `openspec/specs/osk-skin-loading/`.
4. **5.8** Verify default-skin renders identically pre/post change via conformance harness (no snapshot diff for `skins/default.osk`). This is really a T04 gate — list it here because fixing it may require iterating on 5.1/5.2.
5. **5.11** Verify default skin (`hitCircleOverlap: 0`) renders identically via conformance harness — same as 5.8, T04 gate.
6. **5.12** Wire beatmap `[Colours] ApproachCircle` from `beatmap-worker.js:67-69` into `playback.js:1576-1584` as fallback when skin doesn't define `ApproachCircle`. Precedence (from T02 #10): skin value wins, beatmap fallback, combo color last.
7. **5.13** Add conformance test verifying beatmap `ApproachCircle` is used only when skin.ini omits it — T04 gate.

### Out of scope for this ticket (deferred or already done)

- 5.3 (followpoint `% 10` → `sliderBallFrames`) — already `[x]` in tasks.md, verify in T01.
- 5.5/5.6/5.7 (sliderStyle 1/2 branches in SliderMesh) — already `[x]`, verify in T01.
- 5.9/5.10 (`hitCircleOverlap` parse + consume) — already `[x]`, verify in T01.
- 1.7 (dead-field detection) — deferred per tasks.md; lower value now that the static wire-up audit (T02) identifies dead fields.

### Acceptance

- All 7 items above implemented and committed.
- `npm run test:conformance` runs (may not pass yet — T04 lands the goldens; this ticket just wires the code paths).
- `npm run typecheck` + `npm test` green.
- `headless-play.js` 0 pageerrors with a real `.osk` that exercises `@2x` variants (e.g. WhiteCat from `scripts/conformance-skins/`).
- One-line Decisions-so-far entry on the map.

## Blocks

T04 (conformance harness needs the complete skin pipeline to snapshot), T06 (rollout flips `skinConformance` flag only after Track B is done)

## Blocked by

T01 (clean base), T14 (D7 @2x whitelist extend-or-not decision + D8 drop-5.12 decision + D9 animated-judgements decision must be made before the skin pipeline is "complete")