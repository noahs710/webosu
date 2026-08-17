# T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work

## Type
task (AFK)

## Claimed by
webosu-agent (2026-08-17 session)

## Status
done

## Resolution

4 commits landed on `main`:
- `d673293` — `feat: lazer-parity-mega core (Track A judging/scoring/HP + Track B skin + harness)` — 24 files, +5515/−214 lines. Core code (slider-scorer.js, score-math.js, features.js, playback.js, score.js, SliderMesh.js, skin-loader.js, skin-filter.js, main.js, osu-audio.js, styles.css, db.js, package.json) + harness (headless-skin-conformance.js, test-lazer-parity.js, headless-burst-miss.js, headless-latency-probe.js) + goldens + docs/lazer-feel-deltas.md + .gitignore.
- `c70594e` — `chore: openspec lazer-parity-mega change + archived fix-burst-miss + hit-judging spec` — 19 files. The OpenSpec change artifacts + archived predecessor + synced hit-judging spec.
- `14f77fa` — `docs: wayfinder map lazer-perfect-parity + 14 tickets + 2 research findings` — 17 files. The planning map + tickets + research docs + STATUS.md update.
- `b0996c0` — `chore: gitignore scripts/conformance-skins/ (129MB of .osk reference skins)` — follow-up to keep the 129MB of binary skins out of git.

### Verification (all green)
- typecheck 121/121
- backend smoke 53/53
- lazer parity property tests 87/87
- conformance harness 4/4 (goldens regenerated after fixing a harness crash — fresh page per skin; `--update-golden` separated from `--gameplay`)
- headless-play 0 pageerrors, 1301 hits parsed
- headless-mod-flashlight 0 pageerrors, FL overlay + slider dim working
- headless-settings + headless-settings-page 0 pageerrors
- headless-error-popup 0 pageerrors, popup z-index 2147483647 > grading 9000
- headless-quit + headless-fail-retry + headless-slider-destroy 0 fatal

### Audit findings (flagged for T13/T14, NOT fixed in T01)
- **D4**: `playback.js:396` circle radius formula `32 * (1 - 0.7 * (CS-5)/5)` is wrong for CS≠5 (the comment "matches lazer exactly" is incorrect). T13 fixes.
- **D1**: `score.js:235-243` Score V2 production formula is `1000000 * acc * scoreMultiplier` (accuracy portion only); the correct `score-math.js` mirror is unused. T13 wires it.
- **D2**: `score.js:262` HP loss cap `Math.max(hpDelta, -0.1)` still present. T13 removes.
- **D3**: `LAZER_LAST_COMBO_BONUS` imported at `score.js:2` but never used. T13 applies.
- **D5–D9**: webosu-extension-or-fix decisions. T14 grills the user.
- **Scope-creep flagged for T14**: the aspect-ratio overlay in `skin-loader.js` (`applyAspectRatioOverlay`, ~100 lines for Default Reforged skin) is beyond the mega-change's stated Track B and not in tasks.md.
- **Degenerate-slider hack**: `playback.js` has a hardcoded `(hit.x === 0 && hit.y === 318)` band-aid for a specific reported slider — flagged for T13 to replace with a general fix.

### tasks.md reconciled
- 3.1 → `[ ]` (production Score V2 formula not wired — D1)
- 3.3 → `[ ]` (HP cap still present — D2)
- 3.4 → `[ ]` (last-combo bonus not applied — D3)
- 2.0 added (circle radius formula fix — D4)

### Cleanup
- Stray runtime artifacts (`tmp-smoke.err`, `tmp-smoke.out`, `t_target`, `tmp-api.log`, `tmp-dev.log`) gitignored.
- `public/skins/` (~92MB aspect-ratio assets) gitignored.
- `scripts/conformance-skins/` (~129MB reference skins) gitignored.
- `scripts/_patch-hit-note.js` (1-line placeholder scratch file) deleted.
- Conformance harness crash fixed (fresh page per skin; `--update-golden` no longer forces `--gameplay`).

## Question

The `lazer-parity-mega` change is substantially landed but **uncommitted**: 10 modified files (`playback.js`, `SliderMesh.js`, `skin-loader.js`, `skin-filter.js`, `score.js`, `main.js`, `osu-audio.js`, `db.js`, `package.json`, `styles.css`) and ~15 untracked new files (`slider-scorer.js`, `score-math.js`, `features.js`, `scripts/test-lazer-parity.js`, `scripts/headless-skin-conformance.js`, `scripts/headless-latency-probe.js`, `scripts/conformance-golden/`, `scripts/conformance-skins/`, `docs/lazer-feel-deltas.md`, `openspec/changes/lazer-parity-mega/`, `openspec/specs/hit-judging/`, `public/skins/`, `src/game/features.js`). Typecheck is 121/121 green, backend tests 53/53 green — but nothing is committed, so every other ticket on this map builds on quicksand.

Before any new parity work, the in-flight change must be reviewed for correctness, committed cleanly (or split into a small number of focused commits), and verified to not regress. This is the one ticket that *does* rather than decides — it unblocks the rest of the map by giving every later ticket a stable base to diff against.

### Scope of this ticket

1. **Audit the uncommitted diff** for obvious bugs, dead code, half-wired paths. Known suspects from a quick read:
   - `playback.js` removed the burst-miss guard (`_scrubFrame`, `_missesThisFrame`, `MAX_MISSES_PER_FRAME`) — confirm this is intentional and doesn't regress the `fix-burst-miss-on-first-tap` archive's regression test (`scripts/headless-burst-miss.js`).
   - `playback.js:circleRadius` changed from `(109 - 9·CS)/2` to `32·(1 − 0.7·(CS−5)/5)` — the comment claims lazer parity. Verify against ppy/osu `OsuHitObject.cs` radius formula.
   - `playback.js` has a stray indentation change (`} else {` → `       } else {`) — whitespace-only, safe.
   - `SliderMesh.js` removed the `?gradient=`/`?slider=`/`?cull=` URL-param spikes and replaced with `skinConfig.sliderStyle` — confirm no dev tooling depends on the removed URL params.
   - `main.js` added `__loadOsk`/`__applySkin`/`__snapshotSkinTree` conformance hooks — confirm they're harness-only and don't leak into production bundle.
2. **Run the full headless suite** (`npm run test:all` or at least `test:game`, `test:mods`, `test:lazer`, `test:conformance`, `test:gamestate`, `test:error-popup`) and confirm 0 pageerrors across the board.
3. **Decide commit shape**: one mega-commit (matches the `lazer-parity-mega` change shape) or split into Track A / Track B / Track C / harness commits. The repo convention (per `git log --oneline -20`) is feature-scoped commits with a `Fix …` / `feat: …` prefix.
4. **Commit** with a message matching repo style. Do NOT push unless asked.
5. **Update `docs/wayfinder/STATUS.md`** with a one-line "lazer-parity-mega committed @ `<sha>`" entry under a new "Lazer perfect parity" section.

### Acceptance

- `git status` clean (or only intentionally-untracked files like `tmp-*`, `t_target`, `public/skins/` if those are runtime artifacts).
- `npm run typecheck` + `npm test` + the headless suite all green.
- `openspec/changes/lazer-parity-mega/` either committed as-is, or its tasks.md updated to reflect what actually landed vs. what's still open (the tasks.md currently mixes done and open checkboxes — reconcile with reality).
- The map's Decisions-so-far gets a one-line entry pointing at this ticket.

## Blocks

T03, T04, T05, T09, T10, T12 (everything that touches the same files needs a clean base)

## Blocked by

(none — this is the frontier entry point)